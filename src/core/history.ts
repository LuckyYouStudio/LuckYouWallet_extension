import { formatUnits } from 'ethers';
import { KNOWN_TOKENS } from './tokens';
import { DEFAULT_NETWORKS, TokenInfo, TransactionRecord } from './wallet';

// 链上交易记录 (含收款)：使用免费、无需 API Key 的 Etherscan 兼容接口
// 其余网络暂时只显示本机发出的交易

/** 活动列表中的一条记录，App 与插件、EVM 与非 EVM 链通用 */
export interface ActivityItem {
  hash: string;
  direction: 'in' | 'out' | 'self';
  /** 对方地址：收款时为付款方，发送时为收款方 */
  counterparty: string;
  /** 十进制数量 (已按精度换算) */
  value: string;
  symbol: string;
  /** 代币合约 / mint；原生币为空 */
  token?: string;
  /** 毫秒时间戳；0 表示未知 */
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
}

// Routescan 免费接口无需 Key 且限流宽松；Blockscout 免 Key 每 IP 每小时仅 10 次，不采用
const routescan = (path: string) => `https://api.routescan.io/v2/network/${path}/etherscan/api`;
const HISTORY_APIS: Record<string, string> = {
  mainnet: routescan('mainnet/evm/1'),
  avalanche: routescan('mainnet/evm/43114'),
  sepolia: routescan('testnet/evm/11155111'),
};

const PAGE_SIZE = 50;
/** 低于 0.000001 的原生币收款多为地址投毒的粉尘，不显示 */
const DUST_WEI = 10n ** 12n;
/** 同一地址 30 秒内重复打开活动页时复用结果，减少免费接口的请求次数 */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; promise: Promise<ActivityItem[]> }>();

export function hasEvmHistory(network: string): boolean {
  return network in HISTORY_APIS;
}

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError?: string;
  txreceipt_status?: string;
  contractAddress?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function etherscanList(base: string, action: 'txlist' | 'tokentx', address: string): Promise<EtherscanTx[]> {
  const url = `${base}?module=account&action=${action}&address=${address}&page=1&offset=${PAGE_SIZE}&sort=desc`;
  type Response = { status: string; message: string; result: EtherscanTx[] | string };
  let json: Response | undefined;
  // 免费接口按 IP 限流 (HTTP 429 或 "rate limit" 提示)，退避后重试
  for (let attempt = 0; ; attempt++) {
    try {
      json = await fetchJson<Response>(url);
      if (!/rate limit/i.test(String(json.result))) break;
      if (attempt >= 2) break;
    } catch (e) {
      if (attempt >= 2 || !/HTTP 429/.test(String(e))) throw e;
    }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  if (!json) throw new Error('No response');
  if (Array.isArray(json.result)) return json.result;
  // 没有记录时接口返回 status 0 + "No transactions found"
  if (/no (token )?transfers? found|no transactions found/i.test(json.message)) return [];
  throw new Error(typeof json.result === 'string' ? json.result : json.message);
}

const directionOf = (from: string, to: string, me: string): ActivityItem['direction'] =>
  from === me && to === me ? 'self' : from === me ? 'out' : 'in';

/**
 * 原生币与 ERC-20 转账记录，按时间倒序。
 * 垃圾代币合约可以伪造 from 为任意地址的 Transfer 事件，因此代币记录只显示：
 * 白名单代币 (内置 + 用户添加) 的非零转账，以及本地址亲自签名发出的交易中的代币转账。
 */
export function getEvmActivity(address: string, network: string, extraTokens: TokenInfo[] = []): Promise<ActivityItem[]> {
  const key = `${network}:${address.toLowerCase()}:${extraTokens.map((t) => t.address).join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = loadEvmActivity(address, network, extraTokens);
  promise.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

async function loadEvmActivity(address: string, network: string, extraTokens: TokenInfo[]): Promise<ActivityItem[]> {
  const base = HISTORY_APIS[network];
  if (!base) throw new Error(`No history API for ${network}`);
  const me = address.toLowerCase();
  const config = DEFAULT_NETWORKS[network];
  const symbol = config?.currencySymbol || 'ETH';
  const allowed = new Set(
    [...(config ? KNOWN_TOKENS[config.chainId] || [] : []), ...extraTokens].map((t) => t.address.toLowerCase()),
  );

  const [native, tokenTxs] = await Promise.all([etherscanList(base, 'txlist', address), etherscanList(base, 'tokentx', address)]);

  const items: ActivityItem[] = [];
  const tokenHashes = new Set<string>();
  const signedByMe = new Set(native.filter((tx) => tx.from.toLowerCase() === me).map((tx) => tx.hash));
  tokenTxs.forEach((tx) => {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();
    const token = (tx.contractAddress || '').toLowerCase();
    const trusted = signedByMe.has(tx.hash) || (allowed.has(token) && tx.value !== '0');
    if (!trusted) return;
    tokenHashes.add(tx.hash);
    items.push({
      hash: tx.hash,
      direction: directionOf(from, to, me),
      counterparty: from === me ? tx.to : tx.from,
      value: formatUnits(tx.value, Number(tx.tokenDecimal || 18)),
      symbol: tx.tokenSymbol || '?',
      token: tx.contractAddress,
      timestamp: Number(tx.timeStamp) * 1000,
      status: 'success',
    });
  });

  native.forEach((tx) => {
    const from = tx.from.toLowerCase();
    const to = (tx.to || '').toLowerCase();
    const zero = tx.value === '0';
    // 收到的粉尘多为垃圾；代币转账的 0 值合约调用已由代币记录体现
    if ((from !== me && BigInt(tx.value) < DUST_WEI) || (zero && tokenHashes.has(tx.hash))) return;
    items.push({
      hash: tx.hash,
      direction: directionOf(from, to, me),
      counterparty: from === me ? tx.to || tx.contractAddress || '' : tx.from,
      value: formatUnits(tx.value, 18),
      symbol,
      timestamp: Number(tx.timeStamp) * 1000,
      status: tx.isError === '1' || tx.txreceipt_status === '0' ? 'failed' : 'success',
    });
  });

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

/** 本机发出的记录 → 活动记录；value 形如 "1.5" 或 "10 USDT" */
export function localToActivity(record: TransactionRecord, nativeSymbol: string): ActivityItem {
  const [value, tokenSymbol] = record.value.split(' ');
  return {
    hash: record.hash,
    direction: 'out',
    counterparty: record.to,
    value,
    symbol: tokenSymbol || nativeSymbol,
    timestamp: 0,
    // 1 成功，0 失败，-1 已广播待确认
    status: record.status === 1 ? 'success' : record.status === 0 ? 'failed' : 'pending',
  };
}

/**
 * 合并链上记录与本机发出的记录：链上已收录的以链上为准；
 * 尚未被索引的本机交易 (刚发出) 排在最前面。
 */
export function mergeActivity(remote: ActivityItem[], local: ActivityItem[]): ActivityItem[] {
  const known = new Set(remote.map((x) => x.hash.toLowerCase()));
  const pending = local.filter((x) => !known.has(x.hash.toLowerCase()));
  return [...pending, ...remote];
}
