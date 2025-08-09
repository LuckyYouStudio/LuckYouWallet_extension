import { Wallet, JsonRpcProvider, formatEther, parseEther } from 'ethers';

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

export interface TransactionRecord {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: number;
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

export async function sendEth(
  mnemonic: string,
  to: string,
  amountEth: string,
  network: NetworkKey,
): Promise<{ hash: string; status: number }> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const wallet = Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  const tx = await wallet.sendTransaction({ to, value: parseEther(amountEth) });
  const receipt = await tx.wait();
  return { hash: receipt.hash, status: receipt.status ?? 0 };
}

export async function getTransactionHistory(
  address: string,
  network: NetworkKey,
): Promise<TransactionRecord[]> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const latest = await provider.getBlockNumber();
  const start = Math.max(latest - 100, 0);
  const records: TransactionRecord[] = [];
  for (let i = latest; i >= start; i--) {
    const block = await provider.getBlock(i, true);
    if (!block) continue;
    for (const tx of block.transactions) {
      const from = tx.from.toLowerCase();
      const toAddr = (tx.to || '').toLowerCase();
      const target = address.toLowerCase();
      if (from === target || toAddr === target) {
        const receipt = await provider.getTransactionReceipt(tx.hash);
        records.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to || '',
          value: formatEther(tx.value),
          status: receipt?.status ?? 0,
        });
      }
    }
  }
  return records;
}
