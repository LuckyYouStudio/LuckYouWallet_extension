import { Wallet, JsonRpcProvider, formatEther } from 'ethers';

export const NETWORKS = {
  mainnet: {
    name: 'Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
  },
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'https://polygon.llamarpc.com',
  },
} as const;

export type NetworkKey = keyof typeof NETWORKS;

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

export async function getEthBalance(address: string, network: NetworkKey): Promise<string> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const balance = await provider.getBalance(address);
  return formatEther(balance);
}
