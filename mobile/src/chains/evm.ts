import { formatEther, isAddress } from 'ethers';
import {
  detectKnownTokens,
  getEthBalance,
  sendEthWithPrivateKey,
  sendTokenWithPrivateKey,
} from '@core/wallet';
import { estimateTransferGasLimit, evmFeeCost, EvmGasSettings, FEE_LEVELS, suggestEvmFees } from '@core/fees';
import { getEvmActivity, hasEvmHistory } from '@core/history';
import type { AppNetwork, ChainAdapter, FeeOption } from './types';

/** EVM 链直接复用插件的共享钱包核心 */
export function createEvmAdapter(network: AppNetwork): ChainAdapter {
  const key = network.key;

  const option = (level: FeeOption['level'], gas: EvmGasSettings, baseFee: bigint | null): FeeOption => {
    const cost = evmFeeCost(gas, baseFee);
    return { level, fee: formatEther(cost.expected), maxFee: formatEther(cost.max), settings: { kind: 'evm', gas } };
  };

  return {
    getHistory: hasEvmHistory(key) ? (address, tokens) => getEvmActivity(address, key, tokens) : undefined,
    isValidAddress: (address) => isAddress(address),
    getBalance: (address) => getEthBalance(address, key),
    getTokens: (address) => detectKnownTokens(address, key),
    async estimateFee(from, to, amount, token, settings) {
      if (settings?.kind === 'evm') {
        // 自定义参数：只需最新 base fee 来估算实际扣费
        const { baseFee } = await suggestEvmFees(key, settings.gas.gasLimit);
        const picked = option('custom', settings.gas, baseFee);
        return { fee: picked.fee, maxFee: picked.maxFee, settings: picked.settings, baseFee };
      }
      const gasLimit = await estimateTransferGasLimit(from, to, amount, key, token);
      const suggestion = await suggestEvmFees(key, gasLimit);
      const options = FEE_LEVELS.map((level) => option(level, suggestion.levels[level], suggestion.baseFee));
      const market = options[1];
      return { fee: market.fee, maxFee: market.maxFee, settings: market.settings, options, baseFee: suggestion.baseFee };
    },
    send(account, to, amount, token, settings) {
      const gas = settings?.kind === 'evm' ? settings.gas : undefined;
      return token
        ? sendTokenWithPrivateKey(account.privateKey, token, to, amount, key, gas)
        : sendEthWithPrivateKey(account.privateKey, to, amount, key, gas);
    },
  };
}
