import React, { useState, useEffect, useRef } from 'react';
import {
  createWallet,
  importWallet,
  importWalletByPrivateKey,
  encryptWalletData,
  decryptWallet,
  WalletInfo,
  getEthBalance,
  sendEth,
  sendEthWithPrivateKey,
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
  getCurrentNetwork,
  setCurrentNetwork,
  getAllNetworks,
  testStorage,
} from '../core/wallet';
import Activity from './Activity';
import NetworkManager from './NetworkManager';
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
  | 'confirmTokenTransaction'
  | 'networks';

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
  const [inputPrivateKey, setInputPrivateKey] = useState('');
  const [importMethod, setImportMethod] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [encryptedWallet, setEncryptedWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState('');
  
  // 调试：跟踪余额变化
  const setBalanceWithLog = (newBalance: string, source: string) => {
    console.log(`[BALANCE DEBUG] Setting balance to "${newBalance}" from ${source} (previous: "${balance}")`);
    console.log(`[BALANCE DEBUG] Stack trace:`, new Error().stack);
    
    // 如果余额已经被保护且尝试重置为空，则阻止
    if (newBalance === '' && balanceProtectedRef.current && balance !== '') {
      console.warn(`[BALANCE DEBUG] Preventing protected balance reset from ${source} - current balance: "${balance}"`);
      return;
    }
    
    // 如果是重置为空字符串，检查是否真的需要重置
    if (newBalance === '' && balance !== '' && !balanceResetRef.current) {
      console.warn(`[BALANCE DEBUG] Preventing balance reset from ${source} - current balance: "${balance}"`);
      return;
    }
    
    setBalance(newBalance);
    
    // 如果设置了有效余额，标记为不需要重置并保护
    if (newBalance !== '' && parseFloat(newBalance) >= 0) {
      balanceResetRef.current = false;
      balanceProtectedRef.current = true;
      balanceAutoRefreshRef.current = false; // 重置自动刷新标记
      console.log(`[BALANCE DEBUG] Balance protected: "${newBalance}"`);
    }
  };
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [network, setNetwork] = useState<NetworkKey>('mainnet');
  const [allNetworks, setAllNetworks] = useState<Record<string, any>>({});
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [toAddress, setToAddress] = useState('');
  const balanceResetRef = useRef(false);
  const balanceProtectedRef = useRef(false);
  const balanceAutoRefreshRef = useRef(false);
  
  // 从链上加载余额（不持久化）
  const loadBalanceFromChain = async () => {
    if (!walletInfo?.address) return;
    
    try {
      console.log(`[BALANCE DEBUG] Loading balance from chain for address: ${walletInfo.address}, current network: ${network}`);
      const balance = await getEthBalance(walletInfo.address, network);
      const formattedBalance = parseFloat(balance).toFixed(5);
      console.log(`[BALANCE DEBUG] Balance loaded from chain: ${formattedBalance} ETH`);
      setBalanceWithLog(formattedBalance, 'loadBalanceFromChain');
      setBalanceLoaded(true);
    } catch (error) {
      console.error('[BALANCE DEBUG] Failed to load balance from chain:', error);
      setBalanceLoaded(false);
    }
  };
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
          
          // 不在这里加载余额，等待网络加载完成后再加载
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
    const loadCurrentNetwork = async () => {
      console.log('Loading current network...');
      try {
        // 先加载网络列表
        const networks = await getAllNetworks();
        setAllNetworks(networks);
        
        // 然后加载保存的网络
        const currentNetwork = await getCurrentNetwork();
        console.log('Successfully loaded saved network:', currentNetwork);
        console.log('Available networks:', Object.keys(networks));
        
        setNetwork(currentNetwork);
        
        // 不在这里加载余额，让网络状态变化的 useEffect 来处理
      } catch (error) {
        console.error('Failed to load current network:', error);
        console.log('Falling back to default network: mainnet');
        setNetwork('mainnet');
        setAllNetworks(NETWORKS);
        
        // 不在这里加载余额，让网络状态变化的 useEffect 来处理
      }
    };
    loadCurrentNetwork();
  }, []); // 只在组件挂载时执行一次

  // 当网络状态变化时，如果有钱包信息则加载余额
  useEffect(() => {
    if (walletInfo?.address && network) {
      console.log(`[NETWORK DEBUG] Network changed to: ${network}, loading balance...`);
      
      // 检查网络状态是否已经稳定（不是初始的 mainnet）
      if (network === 'mainnet' && !balanceAutoRefreshRef.current) {
        console.log('[NETWORK DEBUG] Skipping initial mainnet balance load, waiting for saved network...');
        return;
      }
      
      // 增加延迟，确保网络状态完全更新
      setTimeout(() => {
        loadBalance(walletInfo.address, network, true);
        // 标记已经加载过余额，防止视图变化时重复加载
        balanceAutoRefreshRef.current = true;
      }, 200);
    }
  }, [network, walletInfo?.address]);

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
      let w: WalletInfo;
      
      if (importMethod === 'mnemonic') {
        w = importWallet(inputMnemonic);
      } else {
        w = importWalletByPrivateKey(inputPrivateKey);
      }
      
      setWalletInfo(w);
      setSource('imported');
      setView('setPassword');
    } catch (err) {
      alert(importMethod === 'mnemonic' ? 'Invalid mnemonic' : 'Invalid private key');
    }
  };

  const handleSetPassword = async () => {
    if (!walletInfo || !source) return;
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      const encrypted = await encryptWalletData(walletInfo, password);
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

  const handleNetworkChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as NetworkKey;
    console.log('User switching to network:', value);
    
    // 立即更新界面
    setNetwork(value);
    
    // 如果有钱包地址，立即重新加载余额
    if (walletInfo?.address) {
      loadBalance(walletInfo.address, value, true);
    }
    
    // 尝试保存到存储
    try {
      console.log('Attempting to save network:', value);
      await setCurrentNetwork(value);
      console.log('Network successfully switched and saved:', value);
      
      // 验证保存是否成功
      const savedNetwork = await getCurrentNetwork();
      console.log('Verification - saved network is:', savedNetwork);
      
      if (savedNetwork !== value) {
        console.warn('Network save verification failed. Expected:', value, 'Got:', savedNetwork);
      }
    } catch (error) {
      console.error('Failed to save network selection:', error);
      // 不显示错误提示，因为网络切换已经成功，只是保存可能失败
      // 用户下次打开时会重新加载默认网络
    }
  };

  const handleNetworkManagerChange = async (newNetwork: NetworkKey) => {
    console.log('Switching to network from manager:', newNetwork);
    
    // 立即更新界面
    setNetwork(newNetwork);
    
    // 如果有钱包地址，立即重新加载余额
    if (walletInfo?.address) {
      loadBalance(walletInfo.address, newNetwork, true);
    }
    
    // 尝试保存到存储
    try {
      console.log('Attempting to save network from manager:', newNetwork);
      await setCurrentNetwork(newNetwork);
      console.log('Network switched and saved from manager:', newNetwork);
      
      // 验证保存是否成功
      const savedNetwork = await getCurrentNetwork();
      console.log('Verification - saved network from manager is:', savedNetwork);
      
      if (savedNetwork !== newNetwork) {
        console.warn('Network save verification failed from manager. Expected:', newNetwork, 'Got:', savedNetwork);
      }
    } catch (error) {
      console.error('Failed to save network selection from manager:', error);
      // 不显示错误提示，网络切换已经成功
    }
    setView('wallet');
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
      let result;
      
      if (walletInfo.privateKey) {
        // 私钥导入的钱包
        result = await sendEthWithPrivateKey(walletInfo.privateKey, pendingTransaction.to, pendingTransaction.amount, network);
      } else if (walletInfo.mnemonic) {
        // 助记词导入的钱包
        result = await sendEth(walletInfo.mnemonic, pendingTransaction.to, pendingTransaction.amount, network);
      } else {
        throw new Error('No wallet credentials available');
      }
      
      const { hash, status } = result;
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
      setBalanceWithLog(parseFloat(newBalance).toFixed(5), 'transaction-success');
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
    balanceResetRef.current = true;
    balanceProtectedRef.current = false;
    setBalanceWithLog('', 'backHome-reset');
    setBalanceLoaded(false);

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

  // 加载余额的函数
  const loadBalance = async (address: string, currentNetwork: NetworkKey, forceRefresh: boolean = false) => {
    if (!address) return;
    
    console.log(`[BALANCE DEBUG] loadBalance called with network: ${currentNetwork}, current state network: ${network}`);
    
    // 如果不是强制刷新，检查是否需要自动刷新（扩展刚打开时）
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    
    if (!forceRefresh && timeSinceLastRefresh < 5000) {
      console.log('Balance was recently loaded, skipping auto-refresh');
      return;
    }
    
    setBalanceLoading(true);
    try {
      console.log(`Loading balance for address: ${address} on network: ${currentNetwork} (forceRefresh: ${forceRefresh})`);
      const balance = await getEthBalance(address, currentNetwork);
      const formattedBalance = parseFloat(balance).toFixed(5);
      console.log(`Balance loaded: ${formattedBalance} ETH`);
      
      // 只有在成功获取到余额时才更新状态
      if (formattedBalance !== 'NaN' && parseFloat(formattedBalance) >= 0) {
              setBalanceWithLog(formattedBalance, 'loadBalance-success');
      setLastRefreshTime(now);
      setBalanceLoaded(true);
        console.log(`Balance successfully updated to: ${formattedBalance} ETH`);
      } else {
        console.warn('Invalid balance received, keeping current balance');
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
      // 不重置余额，保持当前显示的值
      console.log('Keeping current balance due to error');
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (walletInfo?.address) {
      // 加载交易历史
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
      // 只有在没有钱包信息时才重置余额
      if (!walletInfo?.address) {
        balanceResetRef.current = true;
        balanceProtectedRef.current = false;
        setBalanceWithLog('', 'useEffect-no-wallet');
        setBalanceLoaded(false);

      }
      setHistory([]);
    }
  }, [walletInfo, network]);

  // 监听视图变化，但不在这里加载余额
  useEffect(() => {
    console.log(`[VIEW DEBUG] View changed to: ${view}, walletInfo?.address: ${walletInfo?.address}, network: ${network}`);
    // 移除余额加载逻辑，只由网络状态变化来处理
  }, [view, walletInfo?.address, network]);

  return (
    <div style={{ padding: '1rem', width: 300 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button onClick={() => switchLang('en')}>EN</button>
        <button onClick={() => switchLang('zh')}>中文</button>
      </div>
      <h1>{t('title')}</h1>
      {view === 'wallet' && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            {t('network')}
            <select value={network} onChange={handleNetworkChange} style={{ marginLeft: '0.5rem' }}>
              {Object.entries(allNetworks).map(([key, { name }]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </label>
          <button 
            onClick={() => setView('networks')} 
            style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}
          >
            {t('settings')}
          </button>
        </div>
      )}
      {view === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={handleCreate}>{t('createWallet')}</button>
          <button onClick={() => setView('import')}>{t('importWallet')}</button>
        </div>
      )}
      {view === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button 
              onClick={() => setImportMethod('mnemonic')}
              style={{ 
                flex: 1, 
                backgroundColor: importMethod === 'mnemonic' ? '#007bff' : '#f8f9fa',
                color: importMethod === 'mnemonic' ? 'white' : 'black',
                border: '1px solid #dee2e6',
                padding: '0.5rem',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('mnemonic')}
            </button>
            <button 
              onClick={() => setImportMethod('privateKey')}
              style={{ 
                flex: 1, 
                backgroundColor: importMethod === 'privateKey' ? '#007bff' : '#f8f9fa',
                color: importMethod === 'privateKey' ? 'white' : 'black',
                border: '1px solid #dee2e6',
                padding: '0.5rem',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('privateKey')}
            </button>
          </div>
          
          {importMethod === 'mnemonic' ? (
            <textarea
              placeholder="Enter mnemonic phrase (12, 15, 18, 21, or 24 words)"
              value={inputMnemonic}
              onChange={(e) => setInputMnemonic(e.target.value)}
              style={{ width: '100%', minHeight: '80px', padding: '0.5rem' }}
            />
          ) : (
            <input
              type="password"
              placeholder="Enter private key (64 hex characters)"
              value={inputPrivateKey}
              onChange={(e) => setInputPrivateKey(e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            />
          )}
          
          <button onClick={handleImport}>{t('import')}</button>
          <button onClick={backHome}>{t('cancel')}</button>
        </div>
      )}
      {view === 'setPassword' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {source === 'created' && walletInfo?.mnemonic && (
            <p><strong>Mnemonic:</strong> {walletInfo.mnemonic}</p>
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
      {source === 'created' && walletInfo?.mnemonic && (
        <p><strong>Mnemonic:</strong> {walletInfo.mnemonic}</p>
      )}
      <p><strong>Address:</strong> {walletInfo?.address}</p>
      <p>
        <strong>Balance:</strong> 
        {balanceLoading ? (
          <span style={{ color: '#007bff' }}>加载中...</span>
        ) : balanceLoaded ? (
          <span>{balance} ETH</span>
        ) : (
          <span style={{ color: '#6c757d' }}>未加载</span>
        )}
        {walletInfo?.address && (
          <button 
            onClick={() => loadBalance(walletInfo.address, network, true)}
            disabled={balanceLoading}
            style={{ 
              marginLeft: '0.5rem', 
              fontSize: '0.7rem', 
              padding: '0.2rem 0.5rem',
              backgroundColor: balanceLoading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: balanceLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {balanceLoading ? '刷新中...' : '刷新'}
          </button>
        )}
      </p>
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
       <button 
         onClick={() => {
           console.log('Testing storage functionality...');
           testStorage().then(() => {
             console.log('Storage test completed');
           }).catch((error) => {
             console.error('Storage test error:', error);
           });
         }}
         style={{ fontSize: '0.8rem', backgroundColor: '#ffc107', color: 'black' }}
       >
         测试存储功能
       </button>
       <button 
         onClick={async () => {
           console.log('Simple storage test...');
           if (chrome?.storage?.local) {
             console.log('Chrome storage API available');
             try {
               await chrome.storage.local.set({ simpleTest: 'test_value' });
               console.log('Simple test write completed');
               const result = await chrome.storage.local.get('simpleTest');
               console.log('Simple test read result:', result);
               if (result.simpleTest === 'test_value') {
                 console.log('Simple storage test PASSED');
               } else {
                 console.log('Simple storage test FAILED');
               }
             } catch (error) {
               console.error('Simple storage test error:', error);
             }
           } else {
             console.log('Chrome storage API not available');
           }
         }}
         style={{ fontSize: '0.8rem', backgroundColor: '#28a745', color: 'white' }}
       >
         简单存储测试
       </button>
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
  {view === 'networks' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{t('networks')}</h3>
        <button onClick={() => setView('wallet')}>{t('back')}</button>
      </div>
      <NetworkManager
        onNetworkChange={handleNetworkManagerChange}
        currentNetwork={network}
        lang={lang}
      />
    </div>
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
