import { Wallet } from 'ethers';

export interface WalletInfo {
  mnemonic: string;
  address: string;
}

export function createWallet(): WalletInfo {
  const wallet = Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase || '';
  return { mnemonic, address: wallet.address };
}

export function importWallet(mnemonic: string): WalletInfo {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return { mnemonic: wallet.mnemonic?.phrase || '', address: wallet.address };
}
