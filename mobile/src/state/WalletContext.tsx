import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createWallet,
  importWallet,
  importWalletByPrivateKey,
  getAllNetworks,
  getCurrentNetwork,
  setCurrentNetwork,
  getTokenBalance,
  TokenInfo,
} from '@core/wallet';
import { accountFor, AppNetwork, buildNetworks, ChainAccount, ChainAdapter, deriveChainAccounts, FeeQuote, getAdapter } from '@/chains';
import { appendHistory, clearAll, kv, loadTokens, saveTokens } from '@/lib/storage';
import * as vault from '@/lib/vault';
import { detectLang, Lang, StringKey, strings } from '@/lib/i18n';

type Status = 'loading' | 'onboarding' | 'locked' | 'unlocked';

/** 后台超过该时长自动锁定 */
const AUTO_LOCK_MS = 5 * 60 * 1000;

interface WalletContextValue {
  status: Status;
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
  refreshing: boolean;
  refresh: () => Promise<void>;
  addToken: (token: TokenInfo) => Promise<void>;

  estimateFee: (to: string, amount: string, token?: TokenInfo) => Promise<FeeQuote>;
  send: (to: string, amount: string, token?: TokenInfo) => Promise<{ hash: string; status: number }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

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

  // 启动：检查 Keychain 中是否已有钱包
  useEffect(() => {
    (async () => {
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
    })();
  }, []);

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
    kv.set('lang', l);
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
    setBiometricsEnabled(false);
    setStatus('onboarding');
  }, []);

  const getSecret = useCallback(() => secret, [secret]);

  /** 原生币余额 + 自动检测的主流代币 + (EVM) 用户手动添加的代币 */
  const fetchBalances = useCallback(async () => {
    const isEvm = network?.family === 'evm';
    const [native, detected, manual] = await Promise.all([
      adapter!.getBalance(address).catch(() => null),
      adapter!.getTokens(address).catch(() => []),
      isEvm ? loadTokens(address, networkKey) : Promise.resolve([] as TokenInfo[]),
    ]);
    const manualBalances = await Promise.allSettled(manual.map((token) => getTokenBalance(token, address, networkKey)));
    const list: TokenInfo[] = [];
    const balances: Record<string, string> = {};
    detected.forEach(({ token, balance: b }) => {
      list.push(token);
      balances[token.address] = b;
    });
    manual.forEach((token, i) => {
      if (list.some((x) => x.address.toLowerCase() === token.address.toLowerCase())) return;
      const r = manualBalances[i];
      list.push(token);
      balances[token.address] = r.status === 'fulfilled' ? r.value : '0';
    });
    return { list, native, balances };
  }, [adapter, address, network, networkKey]);

  const applyBalances = useCallback((r: Awaited<ReturnType<typeof fetchBalances>>) => {
    setTokens(r.list);
    setBalance(r.native);
    setTokenBalances(r.balances);
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

  // 解锁或切换网络后自动加载余额
  useEffect(() => {
    if (status !== 'unlocked' || !address || !adapter) return;
    let cancelled = false;
    fetchBalances().then((r) => !cancelled && applyBalances(r));
    return () => {
      cancelled = true;
    };
  }, [status, address, adapter, fetchBalances, applyBalances]);

  const switchNetwork = useCallback(async (key: string) => {
    await setCurrentNetwork(key);
    setBalance(null);
    setTokens([]);
    setTokenBalances({});
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
    (to: string, amount: string, token?: TokenInfo) => {
      if (!adapter) throw new Error('Network not ready');
      return adapter.estimateFee(address, to, amount, token);
    },
    [adapter, address],
  );

  const send = useCallback(
    async (to: string, amount: string, token?: TokenInfo) => {
      if (!account || !adapter) throw new Error('Wallet locked');
      const result = await adapter.send(account, to, amount, token);
      await appendHistory(address, networkKey, {
        hash: result.hash,
        from: address,
        to,
        value: token ? `${amount} ${token.symbol}` : amount,
        status: result.status,
      });
      refresh();
      return result;
    },
    [account, adapter, address, networkKey, refresh],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      status, lang, t, setLang,
      draft, startCreate, startImport, finishSetup,
      unlock, unlockWithBiometrics, biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret,
      address, unsupported, networkKey, network, networks, switchNetwork, adapter,
      balance, tokens, tokenBalances, refreshing, refresh, addToken,
      estimateFee, send,
    }),
    [
      status, lang, t, setLang, draft, startCreate, startImport, finishSetup, unlock, unlockWithBiometrics,
      biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret, address, unsupported, networkKey,
      network, networks, switchNetwork, adapter, balance, tokens, tokenBalances, refreshing, refresh, addToken,
      estimateFee, send,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
