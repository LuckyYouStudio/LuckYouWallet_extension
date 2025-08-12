import {
  Wallet,
  JsonRpcProvider,
  formatEther,
  parseEther,
  Contract,
  formatUnits,
  parseUnits,
  id,
  zeroPadValue,
  isAddress,
  getAddress,
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
  const mnemonic = (wallet as any).mnemonic?.phrase || '';
  return { mnemonic, address: wallet.address };
}

export function importWallet(mnemonic: string): WalletInfo {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return { mnemonic: (wallet as any).mnemonic?.phrase || '', address: wallet.address };
}

export async function encryptWallet(mnemonic: string, password: string): Promise<string> {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return wallet.encrypt(password);
}

export async function decryptWallet(encryptedJson: string, password: string): Promise<WalletInfo> {
  const wallet = await Wallet.fromEncryptedJson(encryptedJson, password);
  return { mnemonic: (wallet as any).mnemonic?.phrase || '', address: wallet.address };
}

export async function getEthBalance(address: string, network: NetworkKey): Promise<string> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const balance = await provider.getBalance(address);
  const normalized = typeof balance === 'bigint' ? balance : BigInt(balance as any);
  return formatEther(normalized);
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
  const status = receipt ? Number((receipt as any).status ?? 0) : 0;
  const hash = receipt ? String((receipt as any).hash || tx.hash) : String(tx.hash);
  return { hash, status };
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  totalCost: string;
}

export async function estimateGasForEth(
  from: string,
  to: string,
  amountEth: string,
  network: NetworkKey,
): Promise<GasEstimate> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const gasLimit = await provider.estimateGas({
    from,
    to,
    value: parseEther(amountEth),
  });
  
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const maxFeePerGas = feeData.maxFeePerGas || gasPrice;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 0n;
  
  const totalCost = gasLimit * maxFeePerGas;
  
  return {
    gasLimit: gasLimit.toString(),
    gasPrice: formatEther(gasPrice),
    maxFeePerGas: formatEther(maxFeePerGas),
    maxPriorityFeePerGas: formatEther(maxPriorityFeePerGas),
    totalCost: formatEther(totalCost),
  };
}

export async function estimateGasForToken(
  from: string,
  token: TokenInfo,
  to: string,
  amount: string,
  network: NetworkKey,
): Promise<GasEstimate> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const contract = new Contract(token.address, ERC20_ABI, provider);
  const value = parseUnits(amount, token.decimals);
  
  const gasLimit = await contract.transfer.estimateGas(to, value, { from });
  
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const maxFeePerGas = feeData.maxFeePerGas || gasPrice;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 0n;
  
  const totalCost = gasLimit * maxFeePerGas;
  
  return {
    gasLimit: gasLimit.toString(),
    gasPrice: formatEther(gasPrice),
    maxFeePerGas: formatEther(maxFeePerGas),
    maxPriorityFeePerGas: formatEther(maxPriorityFeePerGas),
    totalCost: formatEther(totalCost),
  };
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
      block = await (provider as any).getBlockWithTransactions(i);
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
  'function transfer(address to, uint256 amount) returns (bool)',
];

const ERC20_BYTES32_ABI = [
  'function name() view returns (bytes32)',
  'function symbol() view returns (bytes32)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
];

function bytes32ToString(value: string): string {
  try {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    let out = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, i + 2), 16);
      if (!Number.isFinite(code) || code === 0) break;
      out += String.fromCharCode(code);
    }
    return out.trim();
  } catch {
    return '';
  }
}

export async function getTokenInfo(
  address: string,
  network: NetworkKey,
): Promise<TokenInfo> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const checksummed = getAddress(address);
  // First try standard string metadata
  try {
    const contract = new Contract(checksummed, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    const decimalsNumber = Number(decimals);
    return { address: checksummed, name: String(name), symbol: String(symbol), decimals: decimalsNumber };
  } catch {
    // Fallback for bytes32 metadata tokens
    const contract = new Contract(checksummed, ERC20_BYTES32_ABI, provider);
    const [rawName, rawSymbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    const name = bytes32ToString(rawName);
    const symbol = bytes32ToString(rawSymbol);
    if (!symbol) {
      throw new Error('Invalid token metadata');
    }
    const decimalsNumber = Number(decimals);
    return { address: checksummed, name: String(name || symbol), symbol: String(symbol), decimals: decimalsNumber };
  }
}

export async function getTokenBalance(
  token: TokenInfo,
  owner: string,
  network: NetworkKey,
): Promise<string> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const contract = new Contract(token.address, ERC20_ABI, provider);
  const balance = await contract.balanceOf(owner);
  const normalized = typeof balance === 'bigint' ? balance : BigInt(balance as any);
  return formatUnits(normalized, token.decimals);
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

export async function isTokenContract(
  address: string,
  network: NetworkKey,
): Promise<boolean> {
  if (!isAddress(address)) return false;
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  try {
    const code = await provider.getCode(getAddress(address));
    return !!code && code !== '0x';
  } catch {
    return false;
  }
}

export async function sendToken(
  mnemonic: string,
  token: TokenInfo,
  to: string,
  amount: string,
  network: NetworkKey,
): Promise<{ hash: string; status: number }> {
  const provider = new JsonRpcProvider(NETWORKS[network].rpcUrl);
  const wallet = Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  const contract = new Contract(token.address, ERC20_ABI, wallet);
  const value = parseUnits(amount, token.decimals);
  const tx = await contract.transfer(to, value);
  const receipt = await tx.wait();
  const status = receipt ? Number((receipt as any).status ?? 0) : 0;
  const hash = receipt ? String((receipt as any).hash || tx.hash) : String(tx.hash);
  return { hash, status };
}

export async function getTokenTransferHistory(
  token: TokenInfo,
  owner: string,
  network: NetworkKey,
): Promise<TransactionRecord[]> {
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
  let logs: any[] = [];
  try {
    const logsTo = await provider.getLogs({
      address: getAddress(token.address),
      fromBlock: start,
      toBlock: latest,
      topics: [transferTopic, null, addressTopic],
    });
    const logsFrom = await provider.getLogs({
      address: getAddress(token.address),
      fromBlock: start,
      toBlock: latest,
      topics: [transferTopic, addressTopic],
    });
    logs = [...logsTo, ...logsFrom];
  } catch {
    return [];
  }
  // 按区块高度与日志索引倒序，最近的在前
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
    return (b.logIndex || 0) - (a.logIndex || 0);
  });
  const records: TransactionRecord[] = [];
  for (const log of logs) {
    try {
      const fromTopic = log.topics[1];
      const toTopic = log.topics[2];
      const from = getAddress('0x' + fromTopic.slice(26));
      const to = getAddress('0x' + toTopic.slice(26));
      const raw = BigInt(log.data);
      const value = parseFloat(formatUnits(raw, token.decimals)).toFixed(5);
      records.push({ hash: log.transactionHash, from, to, value, status: 1 });
    } catch {
      // ignore bad log
    }
  }
  return records;
}
