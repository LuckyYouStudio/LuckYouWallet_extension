import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createWallet,
  importWallet,
  importWalletByPrivateKey,
  getAllNetworks,
  getCurrentNetwork,
  setCurrentNetwork,
  getEthBalance,
  getTokenBalance,
  sendEthWithPrivateKey,
  sendTokenWithPrivateKey,
  NetworkConfig,
  NetworkKey,
  TokenInfo,
} from '@core/wallet';
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

  address: string;
  networkKey: NetworkKey;
  network: NetworkConfig | undefined;
  networks: Record<string, NetworkConfig>;
  switchNetwork: (key: NetworkKey) => Promise<void>;

  balance: string | null;
  tokens: TokenInfo[];
  tokenBalances: Record<string, string>;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addToken: (token: TokenInfo) => Promise<void>;

  sendNative: (to: string, amount: string) => Promise<{ hash: string; status: number }>;
  sendToken: (token: TokenInfo, to: string, amount: string) => Promise<{ hash: string; status: number }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [lang, setLangState] = useState<Lang>(detectLang());
  const [draft, setDraft] = useState<vault.WalletSecret | null>(null);
  const [secret, setSecret] = useState<vault.WalletSecret | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [networkKey, setNetworkKey] = useState<NetworkKey>('mainnet');
  const [networks, setNetworks] = useState<Record<string, NetworkConfig>>({});
  const [balance, setBalance] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const address = secret?.address || '';

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
      const [exists, bioEnabled, bioAvailable, nets, current] = await Promise.all([
        vault.hasWallet(),
        vault.isBiometricsEnabled(),
        vault.biometricsAvailable(),
        getAllNetworks(),
        getCurrentNetwork(),
      ]);
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
      await vault.saveWallet(draft, password);
      await vault.setBiometricsEnabled(biometrics);
      setBiometricsEnabled(biometrics);
      setSecret(draft);
      setDraft(null);
      setStatus('unlocked');
    },
    [draft],
  );

  const unlock = useCallback(async (password: string) => {
    if (!(await vault.verifyPassword(password))) return false;
    setSecret(await vault.loadSecret());
    setStatus('unlocked');
    return true;
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    if (!(await vault.authenticateBiometric(t('unlockFaceId')))) return false;
    setSecret(await vault.loadSecret());
    setStatus('unlocked');
    return true;
  }, [t]);

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

  const fetchBalances = useCallback(async () => {
    const list = await loadTokens(address, networkKey);
    const [native, ...tokenResults] = await Promise.allSettled([
      getEthBalance(address, networkKey),
      ...list.map((token) => getTokenBalance(token, address, networkKey)),
    ]);
    const balances: Record<string, string> = {};
    list.forEach((token, i) => {
      const r = tokenResults[i];
      balances[token.address] = r.status === 'fulfilled' ? r.value : '0';
    });
    return { list, native: native.status === 'fulfilled' ? native.value : null, balances };
  }, [address, networkKey]);

  const applyBalances = useCallback((r: Awaited<ReturnType<typeof fetchBalances>>) => {
    setTokens(r.list);
    setBalance(r.native);
    setTokenBalances(r.balances);
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    setRefreshing(true);
    try {
      applyBalances(await fetchBalances());
    } finally {
      setRefreshing(false);
    }
  }, [address, fetchBalances, applyBalances]);

  // 解锁或切换网络后自动加载余额
  useEffect(() => {
    if (status !== 'unlocked' || !address) return;
    let cancelled = false;
    fetchBalances().then((r) => !cancelled && applyBalances(r));
    return () => {
      cancelled = true;
    };
  }, [status, address, fetchBalances, applyBalances]);

  const switchNetwork = useCallback(async (key: NetworkKey) => {
    await setCurrentNetwork(key);
    setBalance(null);
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

  const sendNative = useCallback(
    async (to: string, amount: string) => {
      if (!secret) throw new Error('Wallet locked');
      const result = await sendEthWithPrivateKey(secret.privateKey, to, amount, networkKey);
      await appendHistory(address, networkKey, { hash: result.hash, from: address, to, value: amount, status: result.status });
      refresh();
      return result;
    },
    [secret, address, networkKey, refresh],
  );

  const sendToken = useCallback(
    async (token: TokenInfo, to: string, amount: string) => {
      if (!secret) throw new Error('Wallet locked');
      const result = await sendTokenWithPrivateKey(secret.privateKey, token, to, amount, networkKey);
      await appendHistory(address, networkKey, {
        hash: result.hash,
        from: address,
        to,
        value: `${amount} ${token.symbol}`,
        status: result.status,
      });
      refresh();
      return result;
    },
    [secret, address, networkKey, refresh],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      status, lang, t, setLang,
      draft, startCreate, startImport, finishSetup,
      unlock, unlockWithBiometrics, biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret,
      address, networkKey, network: networks[networkKey], networks, switchNetwork,
      balance, tokens, tokenBalances, refreshing, refresh, addToken,
      sendNative, sendToken,
    }),
    [
      status, lang, t, setLang, draft, startCreate, startImport, finishSetup, unlock, unlockWithBiometrics,
      biometricsEnabled, biometricsAvailable, setBiometrics, lock, reset, getSecret, address, networkKey, networks,
      switchNetwork, balance, tokens, tokenBalances, refreshing, refresh, addToken, sendNative, sendToken,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
