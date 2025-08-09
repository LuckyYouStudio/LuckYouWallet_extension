import { Wallet, JsonRpcProvider, formatEther } from 'ethers';

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

export async function encryptWallet(mnemonic: string, password: string): Promise<string> {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return wallet.encrypt(password);
}

export async function decryptWallet(encryptedJson: string, password: string): Promise<WalletInfo> {
  const wallet = await Wallet.fromEncryptedJson(encryptedJson, password);
  return { mnemonic: wallet.mnemonic?.phrase || '', address: wallet.address };
}

export async function getEthBalance(address: string): Promise<string> {
  const provider = new JsonRpcProvider('https://eth.llamarpc.com');
  const balance = await provider.getBalance(address);
  return formatEther(balance);
}
