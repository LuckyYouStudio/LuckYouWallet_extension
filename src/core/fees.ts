import { Contract, formatUnits, parseEther, parseUnits } from 'ethers';
import { getAllNetworks, getProvider, NetworkKey, TokenInfo } from './wallet';

// EVM 网络费档位：参考 MetaMask，按最近区块的小费分位数给出 低 / 市场 / 激进 三档

export type FeeLevel = 'low' | 'market' | 'aggressive';
export const FEE_LEVELS: FeeLevel[] = ['low', 'market', 'aggressive'];

/** 交易的 gas 参数：EIP-1559 链使用 maxFee/priorityFee，其余链使用 gasPrice */
export interface EvmGasSettings {
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

export interface EvmFeeSuggestion {
  /** 下一个区块的 base fee；为 null 表示该链不支持 EIP-1559 */
  baseFee: bigint | null;
  gasLimit: bigint;
  levels: Record<FeeLevel, EvmGasSettings>;
}

const HISTORY_BLOCKS = 10;
const PERCENTILES = [10, 50, 90];
/** base fee 每个区块最多上涨 12.5%，按档位预留不同的上涨空间 */
const BASE_FEE_MULTIPLIER: Record<FeeLevel, bigint> = { low: 120n, market: 150n, aggressive: 200n };
const LEGACY_MULTIPLIER: Record<FeeLevel, bigint> = { low: 100n, market: 110n, aggressive: 130n };

const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

function median(values: bigint[]): bigint {
  if (!values.length) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)];
}

async function providerFor(network: NetworkKey) {
  const config = (await getAllNetworks())[network];
  if (!config) throw new Error(`Network ${network} not found`);
  return getProvider(config);
}

/** 转账所需的 gas limit；代币转账留 20% 余量，避免状态变化导致 gas 不足 */
export async function estimateTransferGasLimit(
  from: string,
  to: string,
  amount: string,
  network: NetworkKey,
  token?: TokenInfo,
): Promise<bigint> {
  const provider = await providerFor(network);
  if (token) {
    const contract = new Contract(token.address, ERC20_TRANSFER_ABI, provider);
    const estimate = await contract.transfer.estimateGas(to, parseUnits(amount, token.decimals), { from });
    return (estimate * 120n) / 100n;
  }
  const estimate = await provider.estimateGas({ from, to, value: parseEther(amount) });
  return estimate === 21000n ? estimate : (estimate * 120n) / 100n;
}

/** 根据 eth_feeHistory 给出三档 gas 参数；不支持 EIP-1559 的链按 gasPrice 倍数分档 */
export async function suggestEvmFees(network: NetworkKey, gasLimit: bigint): Promise<EvmFeeSuggestion> {
  const provider = await providerFor(network);
  const [history, gasPriceHex] = await Promise.all([
    provider
      .send('eth_feeHistory', ['0x' + HISTORY_BLOCKS.toString(16), 'latest', PERCENTILES])
      .catch(() => null) as Promise<{ baseFeePerGas?: string[]; reward?: string[][] } | null>,
    provider.send('eth_gasPrice', []) as Promise<string>,
  ]);
  const gasPrice = BigInt(gasPriceHex);
  const baseFees = history?.baseFeePerGas;

  if (!baseFees?.length) {
    const levels = {} as Record<FeeLevel, EvmGasSettings>;
    FEE_LEVELS.forEach((level) => {
      levels[level] = { gasLimit, gasPrice: (gasPrice * LEGACY_MULTIPLIER[level]) / 100n };
    });
    return { baseFee: null, gasLimit, levels };
  }

  // 最后一项是下一个区块的 base fee
  const baseFee = BigInt(baseFees[baseFees.length - 1]);
  const rewards = (history?.reward || []).map((row) => row.map((x) => BigInt(x)));
  // base fee 为 0 的链 (如 BSC) 实际按 gasPrice 收费，用它兜底，避免小费为 0 被节点拒绝
  const floor = baseFee === 0n ? gasPrice : 0n;

  const levels = {} as Record<FeeLevel, EvmGasSettings>;
  let previous = floor;
  FEE_LEVELS.forEach((level, i) => {
    // 档位单调递增：高档小费不低于低档
    let priority = median(rewards.map((row) => row[i] ?? 0n));
    if (priority < previous) priority = previous;
    previous = priority;
    levels[level] = {
      gasLimit,
      maxPriorityFeePerGas: priority,
      maxFeePerGas: (baseFee * BASE_FEE_MULTIPLIER[level]) / 100n + priority,
    };
  });
  return { baseFee, gasLimit, levels };
}

/** 预计手续费 (按当前 base fee) 与最高手续费，单位 wei */
export function evmFeeCost(settings: EvmGasSettings, baseFee: bigint | null): { expected: bigint; max: bigint } {
  if (settings.gasPrice != null || baseFee == null) {
    const price = settings.gasPrice ?? settings.maxFeePerGas ?? 0n;
    const cost = settings.gasLimit * price;
    return { expected: cost, max: cost };
  }
  const maxFee = settings.maxFeePerGas ?? 0n;
  const priority = settings.maxPriorityFeePerGas ?? 0n;
  const effective = baseFee + priority < maxFee ? baseFee + priority : maxFee;
  return { expected: settings.gasLimit * effective, max: settings.gasLimit * maxFee };
}

/** 交易覆盖参数，传给 ethers 的 sendTransaction / 合约调用 */
export function gasOverrides(settings?: EvmGasSettings): Record<string, bigint> {
  if (!settings) return {};
  if (settings.gasPrice != null) return { gasLimit: settings.gasLimit, gasPrice: settings.gasPrice };
  return {
    gasLimit: settings.gasLimit,
    maxFeePerGas: settings.maxFeePerGas!,
    maxPriorityFeePerGas: settings.maxPriorityFeePerGas!,
  };
}

export const toGwei = (wei: bigint) => formatUnits(wei, 'gwei');
export const fromGwei = (gwei: string) => parseUnits(gwei, 'gwei');
