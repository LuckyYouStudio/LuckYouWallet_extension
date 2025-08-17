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

// 使用 any 类型避免 Chrome API 类型冲突
declare const chrome: any;

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  currencySymbol: string;
  blockExplorer?: string;
  isCustom?: boolean;
}

export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    chainId: 1,
    currencySymbol: 'ETH',
    blockExplorer: 'https://etherscan.io',
  },
  hardhat: {
    name: 'Hardhat Local Network',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    currencySymbol: 'ETH',
    blockExplorer: '',
  },
  localhost: {
    name: 'Localhost',
    rpcUrl: 'http://localhost:8545',
    chainId: 1337,
    currencySymbol: 'ETH',
    blockExplorer: '',
  },
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    chainId: 11155111,
    currencySymbol: 'ETH',
    blockExplorer: 'https://sepolia.etherscan.io',
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    chainId: 137,
    currencySymbol: 'MATIC',
    blockExplorer: 'https://polygonscan.com',
  },
  bsc: {
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    chainId: 56,
    currencySymbol: 'BNB',
    blockExplorer: 'https://bscscan.com',
  },
  arbitrum: {
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    currencySymbol: 'ETH',
    blockExplorer: 'https://arbiscan.io',
  },
  optimism: {
    name: 'Optimism',
    rpcUrl: 'https://mainnet.optimism.io',
    chainId: 10,
    currencySymbol: 'ETH',
    blockExplorer: 'https://optimistic.etherscan.io',
  },
} as const;

export type NetworkKey = keyof typeof DEFAULT_NETWORKS | string;

// 网络管理相关函数
export async function addCustomNetwork(network: Omit<NetworkConfig, 'isCustom'>): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error('Chrome storage API not available');
  }
  
  const customNetworks = await getCustomNetworks();
  const networkKey = `custom_${network.chainId}`;
  
  customNetworks[networkKey] = {
    ...network,
    isCustom: true,
  };
  
  await chrome.storage.local.set({ customNetworks });
}

export async function removeCustomNetwork(chainId: number): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error('Chrome storage API not available');
  }
  
  const customNetworks = await getCustomNetworks();
  const networkKey = `custom_${chainId}`;
  
  delete customNetworks[networkKey];
  await chrome.storage.local.set({ customNetworks });
}

export async function updateCustomNetwork(networkKey: string, network: Omit<NetworkConfig, 'isCustom'>): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error('Chrome storage API not available');
  }
  
  const customNetworks = await getCustomNetworks();
  
  // 检查网络是否存在
  if (!customNetworks[networkKey]) {
    throw new Error('Network not found');
  }
  
  // 更新网络配置
  customNetworks[networkKey] = {
    ...network,
    isCustom: true,
  };
  
  await chrome.storage.local.set({ customNetworks });
}

export async function getCustomNetworks(): Promise<Record<string, NetworkConfig>> {
  if (!chrome?.storage?.local) {
    console.warn('Chrome storage API not available, returning empty custom networks');
    return {};
  }
  
  try {
    const result = await chrome.storage.local.get('customNetworks');
    return result.customNetworks || {};
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
  
  for (const [key, network] of Object.entries(allNetworks)) {
    if (network.chainId === chainId) {
      return network;
    }
  }
  
  return null;
}

export async function validateNetwork(rpcUrl: string, chainId: number): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    return network.chainId === BigInt(chainId);
  } catch (error) {
    console.error('Network validation failed:', error);
    return false;
  }
}

export async function getCurrentNetwork(): Promise<NetworkKey> {
  if (!chrome?.storage?.local) {
    console.warn('Chrome storage API not available, returning default network');
    return 'hardhat'; // 开发环境默认使用Hardhat
  }
  
  try {
    const result = await chrome.storage.local.get('selectedNetwork');
    console.log('Retrieved network from storage:', result);
    const network = result.selectedNetwork || 'hardhat'; // 默认使用Hardhat本地网络
    console.log('Using network:', network);
    return network;
  } catch (error) {
    console.error('Failed to get current network:', error);
    return 'hardhat'; // 开发环境默认使用Hardhat
  }
}

export async function setCurrentNetwork(networkKey: NetworkKey): Promise<void> {
  if (!chrome?.storage?.local) {
    console.error('Chrome storage API not available');
    throw new Error('Chrome storage API not available');
  }
  
  try {
    console.log('Saving network to storage:', networkKey);
    await chrome.storage.local.set({ selectedNetwork: networkKey });
    console.log('Network successfully saved:', networkKey);
    
    // 立即验证保存是否成功
    const result = await chrome.storage.local.get('selectedNetwork');
    console.log('Verification - retrieved network:', result);
    
    if (result.selectedNetwork !== networkKey) {
      console.warn('Network save verification failed. Expected:', networkKey, 'Got:', result.selectedNetwork);
      // 重试一次
      await chrome.storage.local.set({ selectedNetwork: networkKey });
      const retryResult = await chrome.storage.local.get('selectedNetwork');
      if (retryResult.selectedNetwork !== networkKey) {
        console.error('Network save retry also failed');
      } else {
        console.log('Network save retry successful');
      }
    } else {
      console.log('Network save verification successful');
    }
  } catch (error) {
    console.error('Failed to save current network:', error);
    throw error;
  }
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
  return { mnemonic, address: wallet.address };
}

export function importWallet(mnemonic: string): WalletInfo {
  const wallet = Wallet.fromPhrase(mnemonic.trim());
  return { mnemonic: (wallet as any).mnemonic?.phrase || '', address: wallet.address };
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
  return { mnemonic: (wallet as any).mnemonic?.phrase || '', address: wallet.address };
}

export async function getEthBalance(address: string, network: NetworkKey): Promise<string> {
  console.log(`[BALANCE DEBUG] getEthBalance called with address: ${address}, network: ${network}`);
  
  const allNetworks = await getAllNetworks();
  console.log(`[BALANCE DEBUG] All networks:`, Object.keys(allNetworks));
  console.log(`[BALANCE DEBUG] Looking for network: ${network}`);
  
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    console.error(`[BALANCE DEBUG] Network ${network} not found in:`, Object.keys(allNetworks));
    throw new Error(`Network ${network} not found`);
  }
  
  console.log(`[BALANCE DEBUG] Network config:`, networkConfig);
  console.log(`[BALANCE DEBUG] RPC URL: ${networkConfig.rpcUrl}`);
  
  // 添加重试机制
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[BALANCE DEBUG] Attempt ${attempt}/${maxRetries} - Getting balance from provider...`);
      
      const provider = new JsonRpcProvider(networkConfig.rpcUrl);
      
      const balance = await provider.getBalance(address);
      console.log(`[BALANCE DEBUG] Raw balance from provider:`, balance);
      console.log(`[BALANCE DEBUG] Balance type:`, typeof balance);
      
      const normalized = typeof balance === 'bigint' ? balance : BigInt(balance as any);
      console.log(`[BALANCE DEBUG] Normalized balance:`, normalized);
      
      const formatted = formatEther(normalized);
      console.log(`[BALANCE DEBUG] Formatted balance: ${formatted} ETH`);
      
      return formatted;
    } catch (error) {
      lastError = error;
      console.error(`[BALANCE DEBUG] Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        console.log(`[BALANCE DEBUG] Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.error(`[BALANCE DEBUG] All ${maxRetries} attempts failed. Last error:`, lastError);
  throw new Error(`Failed to get balance after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

export async function sendEth(
  mnemonic: string,
  to: string,
  amountEth: string,
  network: NetworkKey,
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
  
  let wallet: any;
  if (mnemonic.trim()) {
    wallet = Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  } else {
    throw new Error('No wallet credentials provided');
  }
  
  const tx = await wallet.sendTransaction({ to, value: parseEther(amountEth) });
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
): Promise<{ hash: string; status: number }> {
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
  const wallet = new Wallet(privateKey).connect(provider);
  
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    return false;
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
  const allNetworks = await getAllNetworks();
  const networkConfig = allNetworks[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found`);
  }
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
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
