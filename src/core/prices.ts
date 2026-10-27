// 美元价格：DefiLlama coins API (免费、无需密钥，一次请求可查多个币)

/** 网络 key → DefiLlama 链名 (测试网与自定义网络没有价格) */
const LLAMA_CHAINS: Record<string, string> = {
  mainnet: 'ethereum',
  linea: 'linea',
  base: 'base',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  polygon: 'polygon',
  bsc: 'bsc',
  avalanche: 'avax',
  zksync: 'era',
  sei: 'sei',
  monad: 'monad',
  hyperevm: 'hyperliquid',
  megaeth: 'megaeth',
  bitcoin: 'bitcoin',
  solana: 'solana',
  tron: 'tron',
};

/** 网络 key → 原生币的 CoinGecko id */
const NATIVE_COINS: Record<string, string> = {
  mainnet: 'ethereum',
  linea: 'ethereum',
  base: 'ethereum',
  arbitrum: 'ethereum',
  optimism: 'ethereum',
  zksync: 'ethereum',
  megaeth: 'ethereum',
  polygon: 'polygon-ecosystem-token',
  bsc: 'binancecoin',
  avalanche: 'avalanche-2',
  sei: 'sei-network',
  monad: 'monad',
  hyperevm: 'hyperliquid',
  bitcoin: 'bitcoin',
  solana: 'solana',
  tron: 'tron',
};

export interface UsdPrices {
  native: number | null;
  /** 代币地址 → 美元价格 (无报价的代币不出现) */
  tokens: Record<string, number>;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { price: number | null; at: number }>();

export function hasPrices(networkKey: string): boolean {
  return networkKey in NATIVE_COINS;
}

async function fetchCoins(ids: string[]): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${ids.join(',')}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { coins: Record<string, { price: number }> };
    const result: Record<string, number> = {};
    Object.entries(json.coins || {}).forEach(([id, c]) => {
      if (typeof c.price === 'number' && c.price > 0) result[id.toLowerCase()] = c.price;
    });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** 查询原生币与代币的美元价格，结果缓存 60 秒；网络失败时返回已有缓存或空 */
export async function getUsdPrices(networkKey: string, tokenAddresses: string[] = []): Promise<UsdPrices> {
  const chain = LLAMA_CHAINS[networkKey];
  const nativeId = NATIVE_COINS[networkKey];
  if (!chain || !nativeId) return { native: null, tokens: {} };

  const ids = [`coingecko:${nativeId}`, ...tokenAddresses.map((a) => `${chain}:${a}`)];
  const now = Date.now();
  const stale = ids.filter((id) => {
    const hit = cache.get(id.toLowerCase());
    return !hit || now - hit.at > CACHE_MS;
  });
  if (stale.length) {
    try {
      const fresh = await fetchCoins(stale);
      stale.forEach((id) => cache.set(id.toLowerCase(), { price: fresh[id.toLowerCase()] ?? null, at: now }));
    } catch {
      // 价格只是参考信息，失败时保留旧缓存
    }
  }

  const lookup = (id: string) => cache.get(id.toLowerCase())?.price ?? null;
  const tokens: Record<string, number> = {};
  tokenAddresses.forEach((a) => {
    const price = lookup(`${chain}:${a}`);
    if (price != null) tokens[a] = price;
  });
  return { native: lookup(`coingecko:${nativeId}`), tokens };
}

/** 美元金额：$1,234.56；不足 1 美分显示 <$0.01 */
export const formatUsd = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '';
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** 数量 × 单价 → 美元金额；任一缺失返回 null */
export const usdValue = (amount: string | null | undefined, price: number | null | undefined) => {
  const n = Number(amount);
  if (!amount || price == null || Number.isNaN(n)) return null;
  return n * price;
};
