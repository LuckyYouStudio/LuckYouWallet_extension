import React, { useState, useEffect, useRef } from 'react';
import {
  createWallet,
  importWallet,
  encryptWallet,
  decryptWallet,
  WalletInfo,
  getEthBalance,
  sendEth,
  getTransactionHistory,
  TransactionRecord,
  NETWORKS,
  NetworkKey,
} from '../core/wallet';
import Activity from './Activity';
import { translations, Lang, TranslationKey } from '../core/i18n';

type View = 'home' | 'import' | 'setPassword' | 'unlock' | 'wallet' | 'send' | 'activity';

const STORAGE_KEY = 'encryptedWallet';
const SESSION_KEY = 'walletSession';
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
const NETWORK_STORAGE_KEY = 'selectedNetwork';
const LANGUAGE_STORAGE_KEY = 'language';
const HISTORY_STORAGE_KEY = 'txHistory';

const getHistoryKey = (address: string, network: NetworkKey) =>
  `${HISTORY_STORAGE_KEY}:${address.toLowerCase()}:${network}`;

interface StoredWallet {
  source: 'created' | 'imported';
  encrypted: string;
}

interface WalletSession {
  source: 'created' | 'imported';
  info: WalletInfo;
  timestamp: number;
}

const Popup: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [source, setSource] = useState<'created' | 'imported' | null>(null);
  const [inputMnemonic, setInputMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [encryptedWallet, setEncryptedWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState('');
  const [network, setNetwork] = useState<NetworkKey>('mainnet');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [history, setHistory] = useState<TransactionRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [lang, setLang] = useState<Lang>((): Lang => (localStorage.getItem(LANGUAGE_STORAGE_KEY) as Lang) || 'en');
  const t = (key: TranslationKey) => translations[lang][key];
  const logoutTimer = useRef<NodeJS.Timeout | null>(null);

  const clearLogoutTimer = () => {
    if (logoutTimer.current) {
      clearTimeout(logoutTimer.current);
      logoutTimer.current = null;
    }
  };

  const logout = () => {
    clearLogoutTimer();
    localStorage.removeItem(SESSION_KEY);
    setWalletInfo(null);
    setView('unlock');
  };

  const switchLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, l);
  };

  const startSessionTimer = (ms: number) => {
    clearLogoutTimer();
    logoutTimer.current = setTimeout(logout, ms);
  };

  useEffect(() => {
    let sessionValid = false;
    const sessionRaw = localStorage.getItem(SESSION_KEY);
    if (sessionRaw) {
      try {
        const s: WalletSession = JSON.parse(sessionRaw);
        const elapsed = Date.now() - s.timestamp;
        if (elapsed < SESSION_TTL) {
          setWalletInfo(s.info);
          setSource(s.source);
          setView('wallet');
          sessionValid = true;
          startSessionTimer(SESSION_TTL - elapsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        console.error('Failed to parse session', e);
        localStorage.removeItem(SESSION_KEY);
      }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !sessionValid) {
      try {
        const w: StoredWallet = JSON.parse(stored);
        setEncryptedWallet(w.encrypted);
        setSource(w.source);
        setView('unlock');
      } catch (e) {
        console.error('Failed to parse stored wallet', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const storedNetwork = localStorage.getItem(NETWORK_STORAGE_KEY) as NetworkKey | null;
    if (storedNetwork && NETWORKS[storedNetwork]) {
      setNetwork(storedNetwork);
    }
  }, []);

  useEffect(() => {
    document.title = translations[lang].title;
    document.documentElement.lang = lang;
  }, [lang]);

  const saveSession = (info: WalletInfo, src: 'created' | 'imported') => {
    const session: WalletSession = {
      info,
      source: src,
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    startSessionTimer(SESSION_TTL);
  };

  const handleCreate = () => {
    const w = createWallet();
    setWalletInfo(w);
    setSource('created');
    setView('setPassword');
  };

  const handleImport = () => {
    try {
      const w = importWallet(inputMnemonic);
      setWalletInfo(w);
      setSource('imported');
      setView('setPassword');
    } catch (err) {
      alert('Invalid mnemonic');
    }
  };

  const handleSetPassword = async () => {
    if (!walletInfo || !source) return;
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      const encrypted = await encryptWallet(walletInfo.mnemonic, password);
      const stored: StoredWallet = { source, encrypted };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setEncryptedWallet(encrypted);
      saveSession(walletInfo, source);
      setPassword('');
      setConfirmPassword('');
      setView('wallet');
    } catch (e) {
      console.error('Failed to encrypt wallet', e);
    }
  };

  const handleUnlock = async () => {
    if (!encryptedWallet) return;
    try {
      const w = await decryptWallet(encryptedWallet, unlockPassword);
      setWalletInfo(w);
      if (source) saveSession(w, source);
      setUnlockPassword('');
      setView('wallet');
    } catch (e) {
      alert('Invalid password');
    }
  };

  const handleNetworkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as NetworkKey;
    setNetwork(value);
    localStorage.setItem(NETWORK_STORAGE_KEY, value);
  };

  const handleSend = async () => {
    if (!walletInfo) return;
    try {
      setSending(true);
      const { hash, status } = await sendEth(walletInfo.mnemonic, toAddress, amount, network);
      const success = Number(status) === 1;
      alert(success ? `Transaction successful: ${hash}` : `Transaction failed: ${hash}`);
      const record: TransactionRecord = {
        hash,
        from: walletInfo.address,
        to: toAddress,
        value: amount,
        status: Number(status),
      };
      const key = getHistoryKey(walletInfo.address, network);
      setHistory((prev) => {
        const updated = [record, ...prev];
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      const newBalance = await getEthBalance(walletInfo.address, network);
      setBalance(parseFloat(newBalance).toFixed(4));
      const txHistory = await getTransactionHistory(walletInfo.address, network);
      setHistory(txHistory);
      localStorage.setItem(key, JSON.stringify(txHistory));
      setToAddress('');
      setAmount('');
      setView('wallet');
    } catch (e) {
      alert('Failed to send transaction');
    } finally {
      setSending(false);
    }
  };

  const backHome = () => {
    setView('home');
    setWalletInfo(null);
    setSource(null);
    setInputMnemonic('');
    setPassword('');
    setConfirmPassword('');
    setUnlockPassword('');
    setEncryptedWallet(null);
    setBalance('');
    clearLogoutTimer();
    localStorage.removeItem(SESSION_KEY);
  };

  const clearWallet = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    backHome();
  };

  useEffect(() => {
    if (walletInfo?.address) {
      const key = getHistoryKey(walletInfo.address, network);
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          setHistory(JSON.parse(cached));
        } catch {
          setHistory([]);
        }
      } else {
        setHistory([]);
      }
      getEthBalance(walletInfo.address, network)
        .then((b) => setBalance(parseFloat(b).toFixed(4)))
        .catch((e) => {
          console.error('Failed to fetch balance', e);
          setBalance('');
        });
      getTransactionHistory(walletInfo.address, network)
        .then((h) => {
          setHistory(h);
          localStorage.setItem(key, JSON.stringify(h));
        })
        .catch((e) => {
          console.error('Failed to fetch history', e);
        });
    } else {
      setBalance('');
      setHistory([]);
    }
  }, [walletInfo, network]);

  return (
    <div style={{ padding: '1rem', width: 300 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button onClick={() => switchLang('en')}>EN</button>
        <button onClick={() => switchLang('zh')}>中文</button>
      </div>
      <h1>{t('title')}</h1>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          {t('network')}
          <select value={network} onChange={handleNetworkChange} style={{ marginLeft: '0.5rem' }}>
            {Object.entries(NETWORKS).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      {view === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={handleCreate}>{t('createWallet')}</button>
          <button onClick={() => setView('import')}>{t('importWallet')}</button>
        </div>
      )}
      {view === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea
            placeholder="Enter mnemonic"
            value={inputMnemonic}
            onChange={(e) => setInputMnemonic(e.target.value)}
            style={{ width: '100%' }}
          />
          <button onClick={handleImport}>{t('import')}</button>
          <button onClick={backHome}>{t('cancel')}</button>
        </div>
      )}
      {view === 'setPassword' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {source === 'created' && (
            <p><strong>Mnemonic:</strong> {walletInfo?.mnemonic}</p>
          )}
          <p><strong>Address:</strong> {walletInfo?.address}</p>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button onClick={handleSetPassword}>{t('save')}</button>
          <button onClick={backHome}>{t('cancel')}</button>
        </div>
      )}
      {view === 'unlock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="password"
            placeholder="Password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
          />
          <button onClick={handleUnlock}>{t('unlock')}</button>
          <button onClick={clearWallet}>{t('clearWallet')}</button>
        </div>
      )}
      {view === 'wallet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {source === 'created' && (
            <p><strong>Mnemonic:</strong> {walletInfo?.mnemonic}</p>
          )}
          <p><strong>Address:</strong> {walletInfo?.address}</p>
          <p><strong>Balance:</strong> {balance} ETH</p>
          <button onClick={() => setView('send')}>{t('sendETH')}</button>
          <button onClick={() => setView('activity')}>{t('activity')}</button>
          <button onClick={logout}>{t('logout')}</button>
        </div>
      )}
      {view === 'send' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            placeholder="Recipient Address"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
          />
          <input
            placeholder="Amount (ETH)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button onClick={handleSend} disabled={sending}>{t('send')}</button>
          {sending && <p>{t('sending')}</p>}
          <button onClick={() => setView('wallet')}>{t('cancel')}</button>
        </div>
      )}
      {view === 'activity' && walletInfo && (
        <Activity
          records={history}
          wallet={walletInfo}
          onBack={() => setView('wallet')}
          t={t}
        />
      )}
    </div>
  );
};

export default Popup;
