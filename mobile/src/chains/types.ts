import type { TokenInfo } from '@core/wallet';

export type ChainFamily = 'evm' | 'bitcoin' | 'solana' | 'tron';

/** App 内统一的网络描述，EVM 网络来自共享核心，其余由 networks.ts 定义 */
export interface AppNetwork {
  key: string;
  family: ChainFamily;
  name: string;
  symbol: string;
  decimals: number;
  isTestnet?: boolean;
  /** 区块浏览器中交易详情页链接 */
  txUrl?: (hash: string) => string;
  /** 非 EVM 链的 API 端点 */
  endpoint?: string;
}

/** 单条链上的账户：地址 + 私钥 (hex)。Solana 私钥为 32 字节种子 */
export interface ChainAccount {
  address: string;
  privateKey: string;
}

/** 由助记词派生的非 EVM 账户 */
export interface ChainAccounts {
  bitcoin: ChainAccount;
  bitcoinTestnet: ChainAccount;
  solana: ChainAccount;
  tron: ChainAccount;
}

export interface Asset {
  token: TokenInfo;
  balance: string;
}

export interface FeeQuote {
  /** 预估手续费，单位为原生币 */
  fee: string;
}

export interface SendResult {
  hash: string;
  status: number;
}

export interface ChainAdapter {
  isValidAddress(address: string): boolean;
  getBalance(address: string): Promise<string>;
  /** 内置主流代币中有余额的部分 */
  getTokens(address: string): Promise<Asset[]>;
  estimateFee(from: string, to: string, amount: string, token?: TokenInfo): Promise<FeeQuote>;
  send(account: ChainAccount, to: string, amount: string, token?: TokenInfo): Promise<SendResult>;
}
