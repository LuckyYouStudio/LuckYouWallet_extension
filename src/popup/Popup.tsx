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
  getTokenInfo,
  TokenInfo,
  getTokenBalance,
  detectTokens,
  isTokenContract,
  GasEstimate,
} from '../core/wallet';
import Activity from './Activity';
import { translations, Lang, TranslationKey } from '../core/i18n';

type View =
  | 'home'
  | 'import'
  | 'setPassword'
  | 'unlock'
  | 'wallet'
  | 'send'
  | 'activity'
  | 'addToken'
  | 'tokenDetail'
  | 'sendToken'
  | 'confirmEthTransaction'
  | 'confirmTokenTransaction';

const STORAGE_KEY = 'encryptedWallet';
const SESSION_KEY = 'walletSession';
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
const NETWORK_STORAGE_KEY = 'selectedNetwork';
const LANGUAGE_STORAGE_KEY = 'language';
const HISTORY_STORAGE_KEY = 'txHistory';
const TOKEN_STORAGE_KEY = 'tokens';

const getHistoryKey = (address: string, network: NetworkKey) =>
  `${HISTORY_STORAGE_KEY}:${address.toLowerCase()}:${network}`;

const getTokensKey = (address: string, network: NetworkKey) =>
  `${TOKEN_STORAGE_KEY}:${address.toLowerCase()}:${network}`;

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
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenMetaLoading, setTokenMetaLoading] = useState(false);
  const [tokenMetaError, setTokenMetaError] = useState<string | null>(null);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualDecimals, setManualDecimals] = useState('');
  const [preview, setPreview] = useState<TokenInfo | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [selectedTokenHistory, setSelectedTokenHistory] = useState<TransactionRecord[]>([]);
  const [sendTokenTo, setSendTokenTo] = useState('');
  const [sendTokenAmount, setSendTokenAmount] = useState('');
  const [sendingToken, setSendingToken] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [gasEstimating, setGasEstimating] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<{
    type: 'eth' | 'token';
    to: string;
    amount: string;
    token?: TokenInfo;
  } | null>(null);

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

  useEffect(() => {
    const loadTokens = async () => {
      if (walletInfo?.address) {
        const key = getTokensKey(walletInfo.address, network);
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            setTokens(JSON.parse(stored));
            return;
          } catch {
            // fall through to detection
          }
        }
        try {
          const detected = await detectTokens(walletInfo.address, network);
          setTokens(detected);
          localStorage.setItem(key, JSON.stringify(detected));
        } catch {
          setTokens([]);
        }
      } else {
        setTokens([]);
      }
    };
    loadTokens();
  }, [walletInfo, network]);

  useEffect(() => {
    if (!walletInfo) return;
    tokens.forEach((token) => {
      getTokenBalance(token, walletInfo.address, network)
        .then((b) =>
          setTokenBalances((prev) => ({
            ...prev,
            [token.address]: parseFloat(b).toFixed(5),
          })),
        )
        .catch(() =>
          setTokenBalances((prev) => ({ ...prev, [token.address]: '0' })),
        );
    });
  }, [tokens, walletInfo, network]);

  useEffect(() => {
    const loadTokenHistory = async () => {
      if (!walletInfo || !selectedToken) return;
      try {
        const { getTokenTransferHistory } = await import('../core/wallet');
        const h = await getTokenTransferHistory(selectedToken, walletInfo.address, network);
        // 按时间先后排序（最近在前）
        setSelectedTokenHistory(h);
      } catch {
        setSelectedTokenHistory([]);
      }
    };
    loadTokenHistory();
  }, [selectedToken, walletInfo, network]);

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
    
    // 先设置待确认的交易信息
    setPendingTransaction({
      type: 'eth',
      to: toAddress,
      amount: amount,
    });
    
    // 预估 Gas 费用
    setGasEstimating(true);
    try {
      const { estimateGasForEth } = await import('../core/wallet');
      const estimate = await estimateGasForEth(walletInfo.address, toAddress, amount, network);
      setGasEstimate(estimate);
      setView('confirmEthTransaction');
    } catch (e) {
      alert('Failed to estimate gas');
      setPendingTransaction(null);
    } finally {
      setGasEstimating(false);
    }
  };

  const handleConfirmEthTransaction = async () => {
    if (!walletInfo || !pendingTransaction || !gasEstimate) return;
    
    try {
      setSending(true);
      const { hash, status } = await sendEth(walletInfo.mnemonic, pendingTransaction.to, pendingTransaction.amount, network);
      const success = Number(status) === 1;
      alert(success ? `Transaction successful: ${hash}` : `Transaction failed: ${hash}`);
      
      const record: TransactionRecord = {
        hash,
        from: walletInfo.address,
        to: pendingTransaction.to,
        value: parseFloat(pendingTransaction.amount).toFixed(5),
        status: Number(status),
      };
      
      const key = getHistoryKey(walletInfo.address, network);
      setHistory((prev) => {
        const updated = [record, ...prev];
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      
      const newBalance = await getEthBalance(walletInfo.address, network);
      setBalance(parseFloat(newBalance).toFixed(5));
      const txHistory = await getTransactionHistory(walletInfo.address, network);
      if (txHistory.length > 0) {
        setHistory(txHistory);
        localStorage.setItem(key, JSON.stringify(txHistory));
      }
      
      setToAddress('');
      setAmount('');
      setPendingTransaction(null);
      setGasEstimate(null);
      setView('wallet');
    } catch (e) {
      alert('Failed to send transaction');
    } finally {
      setSending(false);
    }
  };

  const handleConfirmTokenTransaction = async () => {
    if (!walletInfo || !pendingTransaction || !gasEstimate || !pendingTransaction.token) return;
    
    try {
      setSendingToken(true);
      const { sendToken } = await import('../core/wallet');
      const { hash, status } = await sendToken(
        walletInfo.mnemonic,
        pendingTransaction.token,
        pendingTransaction.to,
        pendingTransaction.amount,
        network,
      );
      const success = Number(status) === 1;
      alert(success ? `Transaction successful: ${hash}` : `Transaction failed: ${hash}`);
      
      // 刷新代币余额
      const b = await getTokenBalance(pendingTransaction.token, walletInfo.address, network);
      setTokenBalances((prev) => ({ ...prev, [pendingTransaction.token!.address]: parseFloat(b).toFixed(5) }));
      
      setPendingTransaction(null);
      setGasEstimate(null);
      setView('tokenDetail');
    } catch (e) {
      alert('Failed to send token');
    } finally {
      setSendingToken(false);
    }
  };

  const handleAddToken = async () => {
    if (!walletInfo) return;
    try {
      let info: TokenInfo;
      if (preview) {
        info = preview;
      } else if (manualSymbol && manualDecimals) {
        // 手动模式
        const decimalsNum = Number(manualDecimals);
        if (!Number.isInteger(decimalsNum) || decimalsNum < 0 || decimalsNum > 36) {
          alert(t('tokenDecimals'));
          return;
        }
        info = {
          address: tokenAddress.trim(),
          name: manualSymbol,
          symbol: manualSymbol,
          decimals: decimalsNum,
        };
      } else {
        const fetched = await getTokenInfo(tokenAddress.trim(), network);
        info = fetched;
      }
      const exists = tokens.some(
        (t) => t.address.toLowerCase() === info.address.toLowerCase(),
      );
      if (exists) {
        alert(t('alreadyAdded'));
        setTokenAddress('');
        setPreview(null);
        setManualSymbol('');
        setManualDecimals('');
        setView('wallet');
        return;
      }
      setTokens((prev) => {
        const updated = [...prev, info];
        const key = getTokensKey(walletInfo.address, network);
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      // 立即查询该代币余额并更新显示
      try {
        const b = await getTokenBalance(info, walletInfo.address, network);
        setTokenBalances((prev) => ({
          ...prev,
          [info.address]: parseFloat(b).toFixed(5),
        }));
      } catch {
        // 忽略余额查询失败，后续 effect 会重试
      }
      setTokenAddress('');
      setPreview(null);
      setManualSymbol('');
      setManualDecimals('');
      setView('wallet');
    } catch (e) {
      alert('Invalid token contract');
    }
  };

  // 自动预览：在输入合约地址后尝试抓取元数据；失败则进入手动模式
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    setTokenMetaError(null);
    setPreview(null);
    if (!tokenAddress) {
      setTokenMetaLoading(false);
      setManualSymbol('');
      setManualDecimals('');
      return () => {};
    }
    timer = setTimeout(async () => {
      setTokenMetaLoading(true);
      setManualSymbol('');
      setManualDecimals('');
      try {
        // 先快速验证是否为合约地址（静态导入，避免动态分包）
        const ok = await isTokenContract(tokenAddress.trim(), network);
        if (!ok) {
          setTokenMetaError(t('notContract'));
          setPreview(null);
        } else {
          const meta = await getTokenInfo(tokenAddress.trim(), network);
          setPreview(meta);
        }
      } catch (e) {
        setPreview(null);
        setTokenMetaError(t('tokenSymbol'));
      } finally {
        setTokenMetaLoading(false);
      }
    }, 400);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [tokenAddress, network]);

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
    setTokens([]);
    setTokenBalances({});
    setTokenAddress('');
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
        .then((b) => setBalance(parseFloat(b).toFixed(5)))
        .catch((e) => {
          console.error('Failed to fetch balance', e);
          setBalance('');
        });
      getTransactionHistory(walletInfo.address, network)
        .then((h) => {
          if (h.length > 0) {
            setHistory(h);
            localStorage.setItem(key, JSON.stringify(h));
          }
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
      {tokens.length > 0 && (
        <div>
          <p><strong>{t('tokens')}</strong></p>
          {tokens.map((token) => (
            <button
              key={token.address}
              onClick={() => {
                setSelectedToken(token);
                setView('tokenDetail');
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #eee',
                background: '#fff',
                cursor: 'pointer',
                borderRadius: 6,
                marginBottom: 6,
              }}
            >
              <span>{token.symbol}</span>
              <span>{tokenBalances[token.address] || '0'}</span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setView('addToken')}>{t('addToken')}</button>
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
      {view === 'addToken' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            placeholder={t('tokenAddress')}
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value.trim())}
          />
          {tokenMetaLoading && <p>{t('loading')}</p>}
          {tokenMetaError && <p style={{ color: 'red' }}>{tokenMetaError}</p>}
          {preview ? (
            <div style={{ background: '#f6f6f6', padding: '0.5rem', borderRadius: 6 }}>
              <div><strong>{preview.symbol}</strong> · {preview.name} · decimals: {preview.decimals}</div>
            </div>
          ) : (
            <>
              <input
                placeholder={t('tokenSymbol')}
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value)}
              />
              <input
                placeholder={t('tokenDecimals')}
                value={manualDecimals}
                onChange={(e) => setManualDecimals(e.target.value)}
                inputMode="numeric"
              />
            </>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAddToken} disabled={!tokenAddress}>{t('add')}</button>
            <button onClick={() => setView('wallet')}>{t('cancel')}</button>
          </div>
        </div>
      )}
      {view === 'sendToken' && selectedToken && walletInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <strong>{selectedToken.symbol}</strong> · {tokenBalances[selectedToken.address] || '0'}
          </div>
          <input
            placeholder="Recipient Address"
            value={sendTokenTo}
            onChange={(e) => setSendTokenTo(e.target.value)}
          />
          <input
            placeholder={`Amount (${selectedToken.symbol})`}
            value={sendTokenAmount}
            onChange={(e) => setSendTokenAmount(e.target.value)}
          />
          <button
            onClick={async () => {
              if (!walletInfo || !selectedToken) return;
              
              // 设置待确认的代币交易
              setPendingTransaction({
                type: 'token',
                to: sendTokenTo,
                amount: sendTokenAmount,
                token: selectedToken,
              });
              
              // 预估 Gas 费用
              setGasEstimating(true);
              try {
                const { estimateGasForToken } = await import('../core/wallet');
                const estimate = await estimateGasForToken(walletInfo.address, selectedToken, sendTokenTo, sendTokenAmount, network);
                setGasEstimate(estimate);
                setView('confirmTokenTransaction');
              } catch (e) {
                alert('Failed to estimate gas');
                setPendingTransaction(null);
              } finally {
                setGasEstimating(false);
              }
            }}
            disabled={sendingToken}
          >
            {t('send')}
          </button>
          {sendingToken && <p>{t('sending')}</p>}
          <button onClick={() => setView('tokenDetail')}>{t('cancel')}</button>
        </div>
      )}
      {view === 'tokenDetail' && selectedToken && walletInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={() => setView('wallet')}>{t('back')}</button>
          <h3>{selectedToken.symbol}</h3>
          <div><strong>Address:</strong> {selectedToken.address}</div>
          <div><strong>Balance:</strong> {tokenBalances[selectedToken.address] || '0'}</div>
          <div><strong>Decimals:</strong> {selectedToken.decimals}</div>
          <div><strong>Name:</strong> {selectedToken.name}</div>
          <button onClick={() => setView('sendToken')}>{t('send')}</button>
          <div>
            <p><strong>{t('activity')}</strong></p>
            {selectedTokenHistory.length === 0 ? (
              <p>{t('noTransactions')}</p>
            ) : (
              <ul style={{ maxHeight: '150px', overflowY: 'auto', paddingLeft: '1rem' }}>
                {selectedTokenHistory.map((r) => (
                  <li key={r.hash}>
                    <button
                      onClick={() => {
                        const base = network === 'mainnet'
                          ? 'https://etherscan.io/tx/'
                          : network === 'sepolia'
                          ? 'https://sepolia.etherscan.io/tx/'
                          : 'https://polygonscan.com/tx/';
                        window.open(base + r.hash, '_blank');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                      title={r.hash}
                    >
                      {r.from.toLowerCase() === walletInfo.address.toLowerCase()
                        ? `Sent ${r.value} ${selectedToken.symbol} to ${r.to}`
                        : `Received ${r.value} ${selectedToken.symbol} from ${r.from}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
  {view === 'confirmEthTransaction' && pendingTransaction && gasEstimate && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h3>{t('confirmTransaction')}</h3>
      <div style={{ background: '#f6f6f6', padding: '0.5rem', borderRadius: 6 }}>
        <div><strong>{t('transactionDetails')}</strong></div>
        <div>{t('to')}: {pendingTransaction.to}</div>
        <div>{t('value')}: {pendingTransaction.amount} ETH</div>
      </div>
      <div style={{ background: '#f6f6f6', padding: '0.5rem', borderRadius: 6 }}>
        <div><strong>{t('gasEstimate')}</strong></div>
        <div>{t('gasLimit')}: {gasEstimate.gasLimit}</div>
        <div>{t('gasPrice')}: {gasEstimate.gasPrice} ETH</div>
        <div>{t('maxFeePerGas')}: {gasEstimate.maxFeePerGas} ETH</div>
        <div>{t('maxPriorityFeePerGas')}: {gasEstimate.maxPriorityFeePerGas} ETH</div>
        <div><strong>{t('totalCost')}: {gasEstimate.totalCost} ETH</strong></div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleConfirmEthTransaction} disabled={sending}>
          {sending ? t('sending') : t('confirm')}
        </button>
        <button onClick={() => {
          setView('send');
          setPendingTransaction(null);
          setGasEstimate(null);
        }}>
          {t('reject')}
        </button>
      </div>
    </div>
  )}
  {view === 'confirmTokenTransaction' && pendingTransaction && gasEstimate && pendingTransaction.token && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h3>{t('confirmTransaction')}</h3>
      <div style={{ background: '#f6f6f6', padding: '0.5rem', borderRadius: 6 }}>
        <div><strong>{t('transactionDetails')}</strong></div>
        <div>{t('to')}: {pendingTransaction.to}</div>
        <div>{t('value')}: {pendingTransaction.amount} {pendingTransaction.token.symbol}</div>
        <div>Token: {pendingTransaction.token.name} ({pendingTransaction.token.symbol})</div>
      </div>
      <div style={{ background: '#f6f6f6', padding: '0.5rem', borderRadius: 6 }}>
        <div><strong>{t('gasEstimate')}</strong></div>
        <div>{t('gasLimit')}: {gasEstimate.gasLimit}</div>
        <div>{t('gasPrice')}: {gasEstimate.gasPrice} ETH</div>
        <div>{t('maxFeePerGas')}: {gasEstimate.maxFeePerGas} ETH</div>
        <div>{t('maxPriorityFeePerGas')}: {gasEstimate.maxPriorityFeePerGas} ETH</div>
        <div><strong>{t('totalCost')}: {gasEstimate.totalCost} ETH</strong></div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleConfirmTokenTransaction} disabled={sendingToken}>
          {sendingToken ? t('sending') : t('confirm')}
        </button>
        <button onClick={() => {
          setView('sendToken');
          setPendingTransaction(null);
          setGasEstimate(null);
        }}>
          {t('reject')}
        </button>
      </div>
    </div>
  )}
  </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }>{
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error: String(error?.message || error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('Popup runtime error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, width: 320 }}>
          <h3>Runtime Error</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

const WrappedPopup: React.FC = () => (
  <ErrorBoundary>
    <Popup />
  </ErrorBoundary>
);

export default WrappedPopup;
