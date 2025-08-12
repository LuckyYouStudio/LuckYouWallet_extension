import {
  Wallet,
  JsonRpcProvider,
  formatEther,
  parseEther,
  Contract,
  formatUnits,
  id,
  zeroPadValue,
} from 'ethers';

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

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
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
  // Ethers may return the status as a bigint or null, so normalize to a
  // simple number (1 for success, 0 for failure) for easier checks in the UI.
  const status = Number(receipt.status ?? 0);
  return { hash: receipt.hash, status };
}

export async function getTransactionHistory(
  address: string,
  network: NetworkKey,
): Promise<TransactionRecord[]> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const records: TransactionRecord[] = [];
  let latest: number;
  try {
    latest = await provider.getBlockNumber();
  } catch {
    return records;
  }
  const start = Math.max(latest - 100, 0);
  const target = address.toLowerCase();
  for (let i = latest; i >= start; i--) {
    let block;
    try {
      block = await provider.getBlockWithTransactions(i);
    } catch {
      continue;
    }
    if (!block) continue;
    for (const tx of block.transactions) {
      const from = tx.from.toLowerCase();
      const toAddr = (tx.to || '').toLowerCase();
      if (from === target || toAddr === target) {
        let status = 0;
        try {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          status = Number(receipt?.status ?? 0);
        } catch {
          status = 0;
        }
        records.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to || '',
          value: parseFloat(formatEther(tx.value)).toFixed(5),
          status,
        });
      }
    }
  }
  return records;
}

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
];

export async function getTokenInfo(
  address: string,
  network: NetworkKey,
): Promise<TokenInfo> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const contract = new Contract(address, ERC20_ABI, provider);
  const [name, symbol, decimals] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.decimals(),
  ]);
  return { address, name, symbol, decimals };
}

export async function getTokenBalance(
  token: TokenInfo,
  owner: string,
  network: NetworkKey,
): Promise<string> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const contract = new Contract(token.address, ERC20_ABI, provider);
  const balance = await contract.balanceOf(owner);
  return formatUnits(balance, token.decimals);
}

export async function detectTokens(
  owner: string,
  network: NetworkKey,
): Promise<TokenInfo[]> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  let latest: number;
  try {
    latest = await provider.getBlockNumber();
  } catch {
    return [];
  }
  const start = Math.max(latest - 10000, 0);
  const transferTopic = id('Transfer(address,address,uint256)');
  const addressTopic = zeroPadValue(owner, 32);
  let logs = [] as any[];
  try {
    const logsTo = await provider.getLogs({
      fromBlock: start,
      toBlock: latest,
      topics: [transferTopic, null, addressTopic],
    });
    const logsFrom = await provider.getLogs({
      fromBlock: start,
      toBlock: latest,
      topics: [transferTopic, addressTopic],
    });
    logs = [...logsTo, ...logsFrom];
  } catch {
    return [];
  }
  const tokenAddresses = new Set<string>();
  logs.forEach((log) => tokenAddresses.add(log.address.toLowerCase()));
  const tokens: TokenInfo[] = [];
  for (const addr of tokenAddresses) {
    try {
      tokens.push(await getTokenInfo(addr, network));
    } catch {
      // ignore
    }
  }
  return tokens;
}
