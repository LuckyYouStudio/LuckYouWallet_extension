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
import { KNOWN_TOKENS } from './tokens';
import { EvmGasSettings, gasOverrides } from './fees';

// 使用 any 类型避免 Chrome API 类型冲突
declare const chrome: any;

/**
 * 键值存储适配器：浏览器插件使用 chrome.storage.local，iOS App 使用 AsyncStorage。
 * 只用于非敏感数据（网络配置等），密钥绝不经过这里。
 */
export interface KeyValueStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const chromeStorage: KeyValueStorage | null =
  typeof chrome !== 'undefined' && chrome?.storage?.local
    ? {
        async get(key) {
          const result = await chrome.storage.local.get(key);
          return result[key];
        },
        async set(key, value) {
          await chrome.storage.local.set({ [key]: value });
        },
      }
    : null;

let storage: KeyValueStorage | null = chromeStorage;

export function configureStorage(adapter: KeyValueStorage): void {
  storage = adapter;
}

function requireStorage(): KeyValueStorage {
  if (!storage) {
    throw new Error('Storage not configured');
  }
  return storage;
}

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  currencySymbol: string;
  blockExplorer?: string;
  isCustom?: boolean;
  isTestnet?: boolean;
  isLocal?: boolean;
}

// 与 MetaMask 默认支持的网络保持一致 (RPC 与链 ID 均已实测)
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    chainId: 1,
    currencySymbol: 'ETH',
    blockExplorer: 'https://etherscan.io',
  },
  linea: {
    name: 'Linea',
    rpcUrl: 'https://rpc.linea.build',
    chainId: 59144,
    currencySymbol: 'ETH',
    blockExplorer: 'https://lineascan.build',
  },
  base: {
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    chainId: 8453,
    currencySymbol: 'ETH',
    blockExplorer: 'https://basescan.org',
  },
  arbitrum: {
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    currencySymbol: 'ETH',
    blockExplorer: 'https://arbiscan.io',
  },
  optimism: {
    name: 'OP Mainnet',
    rpcUrl: 'https://mainnet.optimism.io',
    chainId: 10,
    currencySymbol: 'ETH',
    blockExplorer: 'https://optimistic.etherscan.io',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    chainId: 137,
    currencySymbol: 'POL',
    blockExplorer: 'https://polygonscan.com',
  },
  bsc: {
    name: 'BNB Chain',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    chainId: 56,
    currencySymbol: 'BNB',
    blockExplorer: 'https://bscscan.com',
  },
  avalanche: {
    name: 'Avalanche C-Chain',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114,
    currencySymbol: 'AVAX',
    blockExplorer: 'https://snowtrace.io',
  },
  zksync: {
    name: 'zkSync Era',
    rpcUrl: 'https://mainnet.era.zksync.io',
    chainId: 324,
    currencySymbol: 'ETH',
    blockExplorer: 'https://explorer.zksync.io',
  },
  sei: {
    name: 'Sei',
    rpcUrl: 'https://evm-rpc.sei-apis.com',
    chainId: 1329,
    currencySymbol: 'SEI',
    blockExplorer: 'https://seiscan.io',
  },
  monad: {
    name: 'Monad',
    rpcUrl: 'https://rpc.monad.xyz',
    chainId: 143,
    currencySymbol: 'MON',
    blockExplorer: 'https://monadscan.com',
  },
  hyperevm: {
    name: 'HyperEVM',
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    chainId: 999,
    currencySymbol: 'HYPE',
    blockExplorer: 'https://hyperevmscan.io',
  },
  megaeth: {
    name: 'MegaETH',
    rpcUrl: 'https://mainnet.megaeth.com/rpc',
    chainId: 4326,
    currencySymbol: 'ETH',
    blockExplorer: 'https://mega.etherscan.io',
  },
  sepolia: {
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    chainId: 11155111,
    currencySymbol: 'SepoliaETH',
    blockExplorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
  lineaSepolia: {
    name: 'Linea Sepolia',
    rpcUrl: 'https://rpc.sepolia.linea.build',
    chainId: 59141,
    currencySymbol: 'LineaETH',
    blockExplorer: 'https://sepolia.lineascan.build',
    isTestnet: true,
  },
  hardhat: {
    name: 'Hardhat Local Network',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    currencySymbol: 'ETH',
    blockExplorer: '',
    isLocal: true,
  },
  localhost: {
    name: 'Localhost',
    rpcUrl: 'http://localhost:8545',
    chainId: 1337,
    currencySymbol: 'ETH',
    blockExplorer: '',
    isLocal: true,
  },
};

export type NetworkKey = keyof typeof DEFAULT_NETWORKS | string;

// 按 RPC + 链 ID 复用 provider。指定 staticNetwork 可省去 chainId 探测，
// 也避免节点不可用时 ethers 在后台无限重试探测网络
const providers = new Map<string, JsonRpcProvider>();

export function getProvider(network: NetworkConfig): JsonRpcProvider {
  const key = `${network.chainId}:${network.rpcUrl}`;
  let provider = providers.get(key);
  if (!provider) {
    provider = new JsonRpcProvider(network.rpcUrl, network.chainId, { staticNetwork: true });
    providers.set(key, provider);
  }
  return provider;
}

// 网络管理相关函数
export async function addCustomNetwork(network: Omit<NetworkConfig, 'isCustom'>): Promise<void> {
  const customNetworks = await getCustomNetworks();
  customNetworks[`custom_${network.chainId}`] = { ...network, isCustom: true };
  await requireStorage().set('customNetworks', customNetworks);
}

export async function removeCustomNetwork(chainId: number): Promise<void> {
  const customNetworks = await getCustomNetworks();
  delete customNetworks[`custom_${chainId}`];
  await requireStorage().set('customNetworks', customNetworks);
}

export async function updateCustomNetwork(networkKey: string, network: Omit<NetworkConfig, 'isCustom'>): Promise<void> {
  const customNetworks = await getCustomNetworks();
  if (!customNetworks[networkKey]) {
    throw new Error('Network not found');
  }
  customNetworks[networkKey] = { ...network, isCustom: true };
  await requireStorage().set('customNetworks', customNetworks);
}

export async function getCustomNetworks(): Promise<Record<string, NetworkConfig>> {
  if (!storage) {
    return {};
  }
  try {
    return (await storage.get<Record<string, NetworkConfig>>('customNetworks')) || {};
  } catch (error) {
    console.error('Failed to get custom networks:', error);
    return {};
  }
}

export async function getAllNetworks(): Promise<Record<string, NetworkConfig>> {
  const customNetworks = await getCustomNetworks();
  return { ...DEFAULT_NETWORKS, ...customNetworks };
}

export async function getNetworkByChainId(chainId: number): Promise<NetworkConfig | null> {
  const allNetworks = await getAllNetworks();
  return Object.values(allNetworks).find((network) => network.chainId === chainId) || null;
}

export async function validateNetwork(rpcUrl: string, chainId: number): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    try {
      const network = await provider._detectNetwork();
      return network.chainId === BigInt(chainId);
    } finally {
      provider.destroy();
    }
  } catch (error) {
    console.error('Network validation failed:', error);
    return false;
  }
}

export async function getCurrentNetwork(): Promise<NetworkKey> {
  if (!storage) {
    return 'mainnet';
  }
  try {
    return (await storage.get<NetworkKey>('selectedNetwork')) || 'mainnet';
  } catch (error) {
    console.error('Failed to get current network:', error);
    return 'mainnet';
  }
}

export async function setCurrentNetwork(networkKey: NetworkKey): Promise<void> {
  await requireStorage().set('selectedNetwork', networkKey);
}

// 更新现有的NETWORKS常量以使用新的NetworkConfig接口
export const NETWORKS = DEFAULT_NETWORKS;



export interface WalletInfo {
  mnemonic: string;
  address: string;
  privateKey?: string;
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
  return { 
    mnemonic, 
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

export function importWallet(mnemonic: string): WalletInfo {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return { 
    mnemonic: (wallet as any).mnemonic?.phrase || '', 
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

export function importWalletByPrivateKey(privateKey: string): WalletInfo {
  // 移除可能的 0x 前缀
  const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  
  // 验证私钥长度 (64个十六进制字符)
  if (cleanPrivateKey.length !== 64) {
    throw new Error('Invalid private key length');
  }
  
  // 验证私钥格式
  if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
    throw new Error('Invalid private key format');
  }
  
  try {
    const wallet = new Wallet('0x' + cleanPrivateKey);
    return { 
      mnemonic: '', // 私钥导入没有助记词
      address: wallet.address,
      privateKey: '0x' + cleanPrivateKey
    };
  } catch (error) {
    throw new Error('Invalid private key');
  }
}

export async function encryptWallet(mnemonic: string, password: string): Promise<string> {
  if (mnemonic.trim()) {
    // 助记词导入
    const wallet = Wallet.fromPhrase(mnemonic.trim());
    return wallet.encrypt(password);
  } else {
    // 私钥导入 - 需要特殊处理
    throw new Error('Private key import requires special encryption handling');
  }
}

export async function encryptWalletData(walletData: { mnemonic: string; privateKey?: string }, password: string): Promise<string> {
  if (walletData.mnemonic.trim()) {
    // 助记词导入
    const wallet = Wallet.fromPhrase(walletData.mnemonic.trim());
    return wallet.encrypt(password);
  } else if (walletData.privateKey) {
    // 私钥导入 - 创建临时钱包进行加密
    const wallet = new Wallet(walletData.privateKey);
    return wallet.encrypt(password);
  } else {
    throw new Error('No valid wallet data provided');
  }
}

export async function decryptWallet(encryptedJson: string, password: string): Promise<WalletInfo> {
  const wallet = await Wallet.fromEncryptedJson(encryptedJson, password);
  return { 
    mnemonic: (wallet as any).mnemonic?.phrase || '', 
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

export async function getEthBalance(address: string, network: NetworkKey): Promise<string> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }

  // 公共 RPC 偶有抖动，失败后重试
  const maxRetries = 3;
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const provider = getProvider(networkConfig);
      const balance = await provider.getBalance(address);
      return formatEther(typeof balance === 'bigint' ? balance : BigInt(balance as any));
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  console.warn(`[LuckYou Wallet] Failed to get balance on ${network}:`, lastError?.shortMessage || lastError?.message);
  throw new Error(`Failed to get balance after ${maxRetries} attempts: ${lastError?.shortMessage || lastError?.message || 'Unknown error'}`);
}

export async function sendEth(
  mnemonic: string,
  to: string,
  amountEth: string,
  network: NetworkKey,
  gas?: EvmGasSettings,
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
  
  let wallet: any;
  if (mnemonic.trim()) {
    wallet = Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  } else {
    throw new Error('No wallet credentials provided');
  }
  
  const tx = await wallet.sendTransaction({ to, value: parseEther(amountEth), ...gasOverrides(gas) });
  const receipt = await tx.wait();
  const status = receipt ? Number((receipt as any).status ?? 0) : 0;
  const hash = receipt ? String((receipt as any).hash || tx.hash) : String(tx.hash);
  return { hash, status };
}

export async function sendEthWithPrivateKey(
  privateKey: string,
  to: string,
  amountEth: string,
  network: NetworkKey,
  gas?: EvmGasSettings,
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
  const wallet = new Wallet(privateKey).connect(provider);
  
  const tx = await wallet.sendTransaction({ to, value: parseEther(amountEth), ...gasOverrides(gas) });
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
  const contract = new Contract(token.address, ERC20_ABI, provider);
  const balance = await contract.balanceOf(owner);
  const normalized = typeof balance === 'bigint' ? balance : BigInt(balance as any);
  return formatUnits(normalized, token.decimals);
}

export async function detectTokens(
  owner: string,
  network: NetworkKey,
): Promise<TokenInfo[]> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
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

/** 检测当前链内置主流代币中有余额的那些，返回代币及余额 */
export async function detectKnownTokens(
  owner: string,
  network: NetworkKey,
): Promise<{ token: TokenInfo; balance: string }[]> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  const candidates = networkConfig ? KNOWN_TOKENS[networkConfig.chainId] || [] : [];
  const results = await Promise.allSettled(candidates.map((token) => getTokenBalance(token, owner, network)));
  return candidates
    .map((token, i) => {
      const r = results[i];
      return { token, balance: r.status === 'fulfilled' ? r.value : '0' };
    })
    .filter(({ balance }) => Number(balance) > 0);
}

export async function isTokenContract(
  address: string,
  network: NetworkKey,
): Promise<boolean> {
  if (!isAddress(address)) return false;
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    return false;
  }
  const provider = getProvider(networkConfig);
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
  gas?: EvmGasSettings,
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
  const wallet = Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  const contract = new Contract(token.address, ERC20_ABI, wallet);
  const value = parseUnits(amount, token.decimals);
  const tx = await contract.transfer(to, value, gasOverrides(gas));
  const receipt = await tx.wait();
  const status = receipt ? Number((receipt as any).status ?? 0) : 0;
  const hash = receipt ? String((receipt as any).hash || tx.hash) : String(tx.hash);
  return { hash, status };
}

export async function sendTokenWithPrivateKey(
  privateKey: string,
  token: TokenInfo,
  to: string,
  amount: string,
  network: NetworkKey,
  gas?: EvmGasSettings,
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
  const wallet = new Wallet(privateKey).connect(provider);
  const contract = new Contract(token.address, ERC20_ABI, wallet);
  const tx = await contract.transfer(to, parseUnits(amount, token.decimals), gasOverrides(gas));
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = getProvider(networkConfig);
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
