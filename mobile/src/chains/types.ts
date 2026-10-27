import type { TokenInfo } from '@core/wallet';
import type { EvmGasSettings } from '@core/fees';
import type { ActivityItem } from '@core/history';

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

export type FeeLevel = 'low' | 'market' | 'aggressive' | 'custom';

/** 用户选择的手续费参数；SOL / TRX 手续费固定，不可编辑 */
export type FeeSettings =
  | { kind: 'evm'; gas: EvmGasSettings }
  | { kind: 'btc'; satPerVbyte: number };

export interface FeeOption {
  level: FeeLevel;
  /** 预计手续费，单位为原生币 */
  fee: string;
  /** 最高可能扣除的手续费 (EIP-1559) */
  maxFee?: string;
  /** 预计确认时间，如 "~10 min" */
  wait?: string;
  settings: FeeSettings;
}

export interface FeeQuote {
  /** 预估手续费，单位为原生币 */
  fee: string;
  maxFee?: string;
  settings?: FeeSettings;
  /** 可选档位；为空表示手续费不可编辑 */
  options?: FeeOption[];
  /** EVM: 下一个区块的 base fee (wei)；null 表示不支持 EIP-1559 */
  baseFee?: bigint | null;
}

/** 交易状态：1 成功，0 失败，-1 已广播、等待确认 */
export const TX_PENDING = -1;

export interface SendResult {
  hash: string;
  status: number;
}

export interface ChainAdapter {
  isValidAddress(address: string): boolean;
  getBalance(address: string): Promise<string>;
  /** 内置主流代币中有余额的部分 */
  getTokens(address: string): Promise<Asset[]>;
  /** 不传 settings 时返回各档位 (默认市场档)；传入时按该参数估算 */
  estimateFee(from: string, to: string, amount: string, token?: TokenInfo, settings?: FeeSettings): Promise<FeeQuote>;
  send(account: ChainAccount, to: string, amount: string, token?: TokenInfo, settings?: FeeSettings): Promise<SendResult>;
  /** 链上交易记录 (含收款)；未实现的网络只显示本机发出的交易 */
  getHistory?(address: string, tokens: TokenInfo[]): Promise<ActivityItem[]>;
  /** send 返回 TX_PENDING 时，用它等待链上确认，返回 1 成功 / 0 失败 */
  waitForConfirmation?(hash: string, token?: TokenInfo): Promise<number>;
}
