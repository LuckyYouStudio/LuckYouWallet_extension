import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createWallet,
  importWallet,
  importWalletByPrivateKey,
  getAllNetworks,
  getCurrentNetwork,
  setCurrentNetwork,
  getTokenBalances,
  TokenInfo,
} from '@core/wallet';
import { getUsdPrices, UsdPrices } from '@core/prices';
import { accountFor, AppNetwork, buildNetworks, ChainAccount, ChainAdapter, deriveChainAccounts, FeeQuote, FeeSettings, getAdapter, TX_PENDING } from '@/chains';
import { appendHistory, clearAll, kv, loadHistory, loadTokens, saveTokens, updateHistoryStatus } from '@/lib/storage';
import * as vault from '@/lib/vault';
import { detectLang, Lang, StringKey, strings } from '@/lib/i18n';

type Status = 'loading' | 'error' | 'onboarding' | 'locked' | 'unlocked';

/** 后台超过该时长自动锁定 */
const AUTO_LOCK_MS = 5 * 60 * 1000;

interface WalletContextValue {
  status: Status;
  /** 启动失败 (如读取钥匙串出错) 时重试 */
  retryBoot: () => void;
  lang: Lang;
  t: (key: StringKey, vars?: Record<string, string>) => string;
  setLang: (lang: Lang) => void;

  // 创建/导入流程中尚未保存的钱包
  draft: vault.WalletSecret | null;
  startCreate: () => vault.WalletSecret;
  startImport: (method: 'mnemonic' | 'privateKey', input: string) => void;
  finishSetup: (password: string, biometrics: boolean) => Promise<void>;

  unlock: (password: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  setBiometrics: (enabled: boolean) => Promise<void>;
  lock: () => void;
  reset: () => Promise<void>;
  getSecret: () => vault.WalletSecret | null;

  /** 当前网络上的地址；私钥导入的钱包在非 EVM 网络上为空 */
  address: string;
  /** 当前网络是否需要助记词钱包才能使用 */
  unsupported: boolean;
  networkKey: string;
  network: AppNetwork | undefined;
  networks: Record<string, AppNetwork>;
  switchNetwork: (key: string) => Promise<void>;
  adapter: ChainAdapter | null;

  balance: string | null;
  tokens: TokenInfo[];
  tokenBalances: Record<string, string>;
  /** 美元价格 (仅主网)；查不到时为 null / 缺省 */
  prices: UsdPrices;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addToken: (token: TokenInfo) => Promise<void>;

  /** 自动刷新时发现的到账 (首页显示提示) */
  incoming: Incoming | null;
  clearIncoming: () => void;

  estimateFee: (to: string, amount: string, token?: TokenInfo, settings?: FeeSettings) => Promise<FeeQuote>;
  send: (to: string, amount: string, token?: TokenInfo, settings?: FeeSettings) => Promise<{ hash: string; status: number }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const NO_PRICES: UsdPrices = { native: null, tokens: {} };

/** 自动刷新间隔：App 在前台且已解锁时每 15 秒查询一次余额 */
const POLL_MS = 15_000;

export interface Incoming {
  id: number;
  amount: string;
  symbol: string;
}

/** 余额差值 (b - a)；只用于判断是否到账和提示显示，精度要求不高 */
function decimalDiff(a: string, b: string): number {
  return Number(b) - Number(a);
}

/** 助记词钱包补齐比特币 / Solana / Tron 账户 */
function withChains(secret: vault.WalletSecret): vault.WalletSecret {
  if (!secret.mnemonic || secret.chains) return secret;
  return { ...secret, chains: deriveChainAccounts(secret.mnemonic) };
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [lang, setLangState] = useState<Lang>(detectLang());
  const [draft, setDraft] = useState<vault.WalletSecret | null>(null);
  const [secret, setSecret] = useState<vault.WalletSecret | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [networkKey, setNetworkKey] = useState('mainnet');
  const [networks, setNetworks] = useState<Record<string, AppNetwork>>({});
  const [balance, setBalance] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<UsdPrices>(NO_PRICES);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  /** 上一次的余额快照，用于发现到账；切换地址/网络后重新开始 */
  const lastBalances = useRef<{ scope: string; native: string | null; tokens: Record<string, string> } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const network = networks[networkKey];
  const adapter = useMemo(() => (network ? getAdapter(network) : null), [network]);
  const account = useMemo<ChainAccount | null>(
    () => (secret && network ? accountFor(network, { address: secret.address, privateKey: secret.privateKey }, secret.chains) : null),
    [secret, network],
  );
  const address = account?.address || '';
  const unsupported = status === 'unlocked' && !!network && !!secret && !account;

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string>) => {
      let s = strings[lang][key];
      if (vars) Object.entries(vars).forEach(([k, v]) => (s = s.replace(`{${k}}`, v)));
      return s;
    },
    [lang],
  );

  const [bootAttempt, setBootAttempt] = useState(0);
  const retryBoot = useCallback(() => {
    setStatus('loading');
    setBootAttempt((n) => n + 1);
  }, []);

  // 启动：检查 Keychain 中是否已有钱包。
  // 失败时绝不能当作"没有钱包"进入创建流程，否则可能覆盖已有钱包，因此进入错误页让用户重试
  useEffect(() => {
    (async () => {
      try {
        await vault.ensureFreshInstall();
        const savedLang = await kv.get<Lang>('lang');
        if (savedLang) setLangState(savedLang);
        const [exists, bioEnabled, bioAvailable, evmNets, current] = await Promise.all([
          vault.hasWallet(),
          vault.isBiometricsEnabled(),
          vault.biometricsAvailable(),
          getAllNetworks(),
          getCurrentNetwork(),
        ]);
        const nets = buildNetworks(evmNets);
        setBiometricsEnabled(bioEnabled);
        setBiometricsAvailable(bioAvailable);
        setNetworks(nets);
        setNetworkKey(nets[current] ? current : 'mainnet');
        setStatus(exists ? 'locked' : 'onboarding');
      } catch (e) {
        console.warn('[LuckYou] boot failed', e);
        setStatus('error');
      }
    })();
  }, [bootAttempt]);

  // 自动锁定：App 在后台超过 AUTO_LOCK_MS 后回到前台需重新解锁
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current) {
        if (Date.now() - backgroundedAt.current > AUTO_LOCK_MS) {
          setSecret(null);
          setStatus((s) => (s === 'unlocked' ? 'locked' : s));
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    kv.set('lang', l).catch(() => {});
  }, []);

  const startCreate = useCallback(() => {
    const w = createWallet();
    const s = { address: w.address, privateKey: w.privateKey!, mnemonic: w.mnemonic };
    setDraft(s);
    return s;
  }, []);

  const startImport = useCallback((method: 'mnemonic' | 'privateKey', input: string) => {
    const w = method === 'mnemonic' ? importWallet(input.trim().toLowerCase().replace(/\s+/g, ' ')) : importWalletByPrivateKey(input.trim());
    setDraft({ address: w.address, privateKey: w.privateKey!, mnemonic: w.mnemonic || undefined });
  }, []);

  const finishSetup = useCallback(
    async (password: string, biometrics: boolean) => {
      if (!draft) throw new Error('No wallet to save');
      const full = withChains(draft);
      await vault.saveWallet(full, password);
      await vault.setBiometricsEnabled(biometrics);
      setBiometricsEnabled(biometrics);
      setSecret(full);
      setDraft(null);
      setStatus('unlocked');
    },
    [draft],
  );

  /** 读取密钥；旧版本创建的钱包首次解锁时补充多链账户并写回 Keychain */
  const loadUnlockedSecret = useCallback(async () => {
    const loaded = await vault.loadSecret();
    if (!loaded) return null;
    const full = withChains(loaded);
    if (full !== loaded) await vault.updateSecret(full);
    return full;
  }, []);

  const unlock = useCallback(async (password: string) => {
    if (!(await vault.verifyPassword(password))) return false;
    setSecret(await loadUnlockedSecret());
    setStatus('unlocked');
    return true;
  }, [loadUnlockedSecret]);

  const unlockWithBiometrics = useCallback(async () => {
    if (!(await vault.authenticateBiometric(t('unlockFaceId')))) return false;
    setSecret(await loadUnlockedSecret());
    setStatus('unlocked');
    return true;
  }, [t, loadUnlockedSecret]);

  const setBiometrics = useCallback(async (enabled: boolean) => {
    if (enabled && !(await vault.authenticateBiometric(t('enableFaceId')))) return;
    await vault.setBiometricsEnabled(enabled);
    setBiometricsEnabled(enabled);
  }, [t]);

  const lock = useCallback(() => {
    setSecret(null);
    setBalance(null);
    setStatus('locked');
  }, []);

  const reset = useCallback(async () => {
    await vault.wipeSecrets();
    await clearAll();
    await kv.set('luckyou.installed', true);
    setSecret(null);
    setDraft(null);
    setBalance(null);
    setTokens([]);
    setTokenBalances({});
    setPrices(NO_PRICES);
    setBiometricsEnabled(false);
    setStatus('onboarding');
  }, []);

  const getSecret = useCallback(() => secret, [secret]);
  const clearIncoming = useCallback(() => setIncoming(null), []);

  /** 原生币余额 + 自动检测的主流代币 + (EVM) 用户手动添加的代币 */
  const fetchBalances = useCallback(async () => {
    const isEvm = network?.family === 'evm';
    const [native, detected, manual] = await Promise.all([
      adapter!.getBalance(address).catch(() => null),
      adapter!.getTokens(address).catch(() => []),
      isEvm ? loadTokens(address, networkKey).catch(() => [] as TokenInfo[]) : Promise.resolve([] as TokenInfo[]),
    ]);
    const manualBalances = await getTokenBalances(manual, address, networkKey).catch(() => manual.map(() => '0'));
    const list: TokenInfo[] = [];
    const balances: Record<string, string> = {};
    detected.forEach(({ token, balance: b }) => {
      list.push(token);
      balances[token.address] = b;
    });
    manual.forEach((token, i) => {
      if (list.some((x) => x.address.toLowerCase() === token.address.toLowerCase())) return;
      list.push(token);
      balances[token.address] = manualBalances[i];
    });
    const usd = await getUsdPrices(networkKey, list.map((x) => x.address));
    return { list, native, balances, usd, scope: `${address}:${networkKey}`, symbol: network?.symbol || '' };
  }, [adapter, address, network, networkKey]);

  const applyBalances = useCallback((r: Awaited<ReturnType<typeof fetchBalances>>) => {
    // 与上次快照比较：余额增加即视为到账
    const prev = lastBalances.current;
    if (prev && prev.scope === r.scope) {
      if (prev.native != null && r.native != null && decimalDiff(prev.native, r.native) > 0) {
        setIncoming({ id: Date.now(), amount: String(decimalDiff(prev.native, r.native)), symbol: r.symbol });
      } else {
        const token = r.list.find((t) => prev.tokens[t.address] != null && decimalDiff(prev.tokens[t.address], r.balances[t.address]) > 0);
        if (token) {
          setIncoming({
            id: Date.now(),
            amount: String(decimalDiff(prev.tokens[token.address], r.balances[token.address])),
            symbol: token.symbol,
          });
        }
      }
    }
    lastBalances.current = { scope: r.scope, native: r.native ?? prev?.native ?? null, tokens: r.balances };
    setTokens(r.list);
    setBalance(r.native);
    setTokenBalances(r.balances);
    setPrices(r.usd);
  }, []);

  const refresh = useCallback(async () => {
    if (!address || !adapter) return;
    setRefreshing(true);
    try {
      applyBalances(await fetchBalances());
    } finally {
      setRefreshing(false);
    }
  }, [address, adapter, fetchBalances, applyBalances]);

  /** 后台静默刷新 (不显示下拉刷新的转圈) */
  const silentRefresh = useCallback(async () => {
    if (!address || !adapter) return;
    try {
      applyBalances(await fetchBalances());
    } catch {
      // 自动刷新失败不打扰用户，下一轮再试
    }
  }, [address, adapter, fetchBalances, applyBalances]);

  // 解锁或切换网络后立即加载余额，之后在前台每 15 秒自动刷新；回到前台时立即刷新
  useEffect(() => {
    if (status !== 'unlocked' || !address || !adapter) return;
    let cancelled = false;
    fetchBalances().then((r) => !cancelled && applyBalances(r)).catch(() => {});
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') silentRefresh();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') silentRefresh();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [status, address, adapter, fetchBalances, applyBalances, silentRefresh]);

  /** 后台等待交易确认，确认后更新记录并刷新余额 (公共节点可能慢一个区块，稍后再刷新一次) */
  const track = useCallback(
    (hash: string, token?: TokenInfo) => {
      if (!adapter?.waitForConfirmation) return;
      adapter
        .waitForConfirmation(hash, token)
        .then((txStatus) => updateHistoryStatus(address, networkKey, hash, txStatus))
        .catch(() => {})
        .finally(() => {
          silentRefresh();
          setTimeout(silentRefresh, 2500);
        });
    },
    [adapter, address, networkKey, silentRefresh],
  );

  // 上次退出时仍在等待确认的交易：重新跟踪
  useEffect(() => {
    if (status !== 'unlocked' || !address || !adapter?.waitForConfirmation) return;
    loadHistory(address, networkKey)
      .then((records) => records.filter((r) => r.status === TX_PENDING).forEach((r) => track(r.hash)))
      .catch(() => {});
  }, [status, address, networkKey, adapter, track]);

  const switchNetwork = useCallback(async (key: string) => {
    await setCurrentNetwork(key);
    setBalance(null);
    setTokens([]);
    setTokenBalances({});
    setPrices(NO_PRICES);
    setNetworkKey(key);
  }, []);

  const addToken = useCallback(
    async (token: TokenInfo) => {
      const list = await loadTokens(address, networkKey);
      if (list.some((x) => x.address.toLowerCase() === token.address.toLowerCase())) return;
      await saveTokens(address, networkKey, [...list, token]);
      await refresh();
    },
    [address, networkKey, refresh],
  );

  const estimateFee = useCallback(
    async (to: string, amount: string, token?: TokenInfo, settings?: FeeSettings) => {
      if (!adapter) throw new Error('Network not ready');
      return adapter.estimateFee(address, to, amount, token, settings);
    },
    [adapter, address],
  );

  const send = useCallback(
    async (to: string, amount: string, token?: TokenInfo, settings?: FeeSettings) => {
      if (!account || !adapter) throw new Error('Wallet locked');
      const result = await adapter.send(account, to, amount, token, settings);
      await appendHistory(address, networkKey, {
        hash: result.hash,
        from: address,
        to,
        value: token ? `${amount} ${token.symbol}` : amount,
        status: result.status,
      });
      if (result.status === TX_PENDING) track(result.hash, token);
      silentRefresh();
      return result;
    },
    [account, adapter, address, networkKey, silentRefresh, track],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      status, retryBoot, lang, t, setLang,
      draft, startCreate, startImport, finishSetup,
      unlock, unlockWithBiometrics, biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret,
      address, unsupported, networkKey, network, networks, switchNetwork, adapter,
      balance, tokens, tokenBalances, prices, refreshing, refresh, addToken,
      incoming, clearIncoming,
      estimateFee, send,
    }),
    [
      status, retryBoot, lang, t, setLang, draft, startCreate, startImport, finishSetup, unlock, unlockWithBiometrics,
      biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret, address, unsupported, networkKey,
      network, networks, switchNetwork, adapter, balance, tokens, tokenBalances, prices, refreshing, refresh, addToken,
      incoming, clearIncoming, estimateFee, send,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
