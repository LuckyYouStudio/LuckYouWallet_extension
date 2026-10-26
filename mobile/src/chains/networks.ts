import type { NetworkConfig } from '@core/wallet';
import type { AppNetwork } from './types';

// 与 MetaMask 一致支持的非 EVM 网络 (API 均为无需密钥的公共端点)
export const NON_EVM_NETWORKS: AppNetwork[] = [
  {
    key: 'bitcoin',
    family: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    endpoint: 'https://mempool.space/api',
    txUrl: (h) => `https://mempool.space/tx/${h}`,
  },
  {
    key: 'solana',
    family: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    endpoint: 'https://api.mainnet-beta.solana.com',
    txUrl: (h) => `https://solscan.io/tx/${h}`,
  },
  {
    key: 'tron',
    family: 'tron',
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
    endpoint: 'https://api.trongrid.io',
    txUrl: (h) => `https://tronscan.org/#/transaction/${h}`,
  },
  {
    key: 'bitcoinTestnet',
    family: 'bitcoin',
    name: 'Bitcoin Testnet4',
    symbol: 'tBTC',
    decimals: 8,
    isTestnet: true,
    endpoint: 'https://mempool.space/testnet4/api',
    txUrl: (h) => `https://mempool.space/testnet4/tx/${h}`,
  },
  {
    key: 'solanaDevnet',
    family: 'solana',
    name: 'Solana Devnet',
    symbol: 'SOL',
    decimals: 9,
    isTestnet: true,
    endpoint: 'https://api.devnet.solana.com',
    txUrl: (h) => `https://solscan.io/tx/${h}?cluster=devnet`,
  },
  {
    key: 'tronNile',
    family: 'tron',
    name: 'Tron Nile Testnet',
    symbol: 'TRX',
    decimals: 6,
    isTestnet: true,
    endpoint: 'https://nile.trongrid.io',
    txUrl: (h) => `https://nile.tronscan.org/#/transaction/${h}`,
  },
];

export function fromEvmNetwork(key: string, net: NetworkConfig): AppNetwork {
  const explorer = (net.blockExplorer || '').replace(/\/$/, '');
  return {
    key,
    family: 'evm',
    name: net.name,
    symbol: net.currencySymbol,
    decimals: 18,
    isTestnet: net.isTestnet,
    txUrl: explorer ? (h) => `${explorer}/tx/${h}` : undefined,
  };
}

/** 合并共享核心的 EVM 网络与非 EVM 网络；移动端隐藏本地开发网络 */
export function buildNetworks(evm: Record<string, NetworkConfig>): Record<string, AppNetwork> {
  const result: Record<string, AppNetwork> = {};
  Object.entries(evm)
    .filter(([, net]) => !net.isLocal)
    .forEach(([key, net]) => (result[key] = fromEvmNetwork(key, net)));
  NON_EVM_NETWORKS.forEach((net) => (result[net.key] = net));
  return result;
}
