import { isAddress } from 'ethers';
import {
  detectKnownTokens,
  estimateGasForEth,
  estimateGasForToken,
  getEthBalance,
  sendEthWithPrivateKey,
  sendTokenWithPrivateKey,
} from '@core/wallet';
import type { AppNetwork, ChainAdapter } from './types';

/** EVM 链直接复用插件的共享钱包核心 */
export function createEvmAdapter(network: AppNetwork): ChainAdapter {
  const key = network.key;
  return {
    isValidAddress: (address) => isAddress(address),
    getBalance: (address) => getEthBalance(address, key),
    getTokens: (address) => detectKnownTokens(address, key),
    async estimateFee(from, to, amount, token) {
      const estimate = token
        ? await estimateGasForToken(from, token, to, amount, key)
        : await estimateGasForEth(from, to, amount, key);
      return { fee: estimate.totalCost };
    },
    send: (account, to, amount, token) =>
      token
        ? sendTokenWithPrivateKey(account.privateKey, token, to, amount, key)
        : sendEthWithPrivateKey(account.privateKey, to, amount, key),
  };
}
