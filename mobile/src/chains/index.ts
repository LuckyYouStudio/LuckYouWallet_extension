import { createBitcoinAdapter } from './bitcoin';
import { createEvmAdapter } from './evm';
import { createSolanaAdapter } from './solana';
import { createTronAdapter } from './tron';
import type { AppNetwork, ChainAccount, ChainAccounts, ChainAdapter } from './types';

export * from './types';
export { buildNetworks, NON_EVM_NETWORKS } from './networks';
export { deriveChainAccounts } from './keys';

const factories = {
  evm: createEvmAdapter,
  bitcoin: createBitcoinAdapter,
  solana: createSolanaAdapter,
  tron: createTronAdapter,
};

const cache = new Map<string, ChainAdapter>();

export function getAdapter(network: AppNetwork): ChainAdapter {
  let adapter = cache.get(network.key);
  if (!adapter) {
    adapter = factories[network.family](network);
    cache.set(network.key, adapter);
  }
  return adapter;
}

/** 取当前网络对应的账户；非 EVM 链需要助记词钱包才有账户 */
export function accountFor(
  network: AppNetwork,
  evm: ChainAccount,
  chains: ChainAccounts | undefined,
): ChainAccount | null {
  if (network.family === 'evm') return evm;
  if (!chains) return null;
  if (network.family === 'bitcoin') return network.isTestnet ? chains.bitcoinTestnet : chains.bitcoin;
  // Solana / Tron 测试网与主网使用相同地址
  return chains[network.family];
}
