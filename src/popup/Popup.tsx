import React, { useState, useEffect, useRef } from 'react';

// 声明chrome API类型
declare global {
  interface Window {
    chrome: {
      storage: {
        local: {
          get(keys?: string | object | string[] | null): Promise<{ [key: string]: any }>;
          set(items: object): Promise<void>;
          remove(keys: string | string[]): Promise<void>;
          clear(): Promise<void>;
        };
      };
      tabs: {
        query(queryInfo: any): Promise<any[]>;
      };
      runtime: {
        sendMessage(message: any): Promise<any>;
      };
    };
  }
}
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
  | 'networks'
  | 'authorize'
  | 'signTransaction';

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
  
  // 授权和签名相关状态
  const [pendingAuth, setPendingAuth] = useState<any>(null);
  const [pendingSignature, setPendingSignature] = useState<any>(null);
  const [currentSite, setCurrentSite] = useState<string>('');
  
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
  const [networkInitialized, setNetworkInitialized] = useState(false);
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
        
        // 直接设置缓存的网络，避免先设置 mainnet 再切换
        setNetwork(currentNetwork);
        
        // 标记网络初始化完成
        setNetworkInitialized(true);
        
        // 不在这里加载余额，让网络状态变化的 useEffect 来处理
      } catch (error) {
        console.error('Failed to load current network:', error);
        console.log('Falling back to default network: mainnet');
        setNetwork('mainnet');
        setAllNetworks(NETWORKS);
        
        // 标记网络初始化完成
        setNetworkInitialized(true);
        
        // 不在这里加载余额，让网络状态变化的 useEffect 来处理
      }
    };
    loadCurrentNetwork();
  }, []); // 只在组件挂载时执行一次

  // 当网络状态变化时，如果有钱包信息则加载余额
  useEffect(() => {
    // 只有在网络初始化完成后才处理余额加载
    if (!networkInitialized) {
      console.log('[NETWORK DEBUG] Network not yet initialized, skipping balance load...');
      return;
    }
    
    if (walletInfo?.address && network) {
      console.log(`[NETWORK DEBUG] Network changed to: ${network}, loading balance...`);
      
      // 只有在视图是钱包视图时才加载余额，避免重复加载
      if (view === 'wallet') {
        // 增加延迟，确保网络状态完全更新
        setTimeout(() => {
          loadBalance(walletInfo.address, network, true);
          // 标记已经加载过余额，防止视图变化时重复加载
          balanceAutoRefreshRef.current = true;
        }, 200);
      }
    }
  }, [network, walletInfo?.address, view, networkInitialized]);

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

  const saveSession = async (info: WalletInfo, src: 'created' | 'imported') => {
    const session: WalletSession = {
      info,
      source: src,
      timestamp: Date.now(),
    };
    
    // 存储到 localStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    // 同时存储到 chrome.storage.local 供 background script 使用
    try {
      await chrome.storage.local.set({ wallet_session: JSON.stringify(session) });
      console.log('[LuckYou Wallet] Wallet session saved to chrome.storage.local');
    } catch (error) {
      console.error('[LuckYou Wallet] Failed to save wallet session to chrome.storage.local:', error);
    }
    
    startSessionTimer(SESSION_TTL);
  };

  const handleCreate = () => {
    const w = createWallet();
    setWalletInfo(w);
    setSource('created');
    setView('setPassword');
  };

  // 处理授权请求
  const handleAuthorize = async (approved: boolean) => {
    try {
      const { requestId } = pendingAuth;
      
      if (approved) {
        // 保存授权信息
        try {
          console.log('[AUTH DEBUG] 准备保存授权信息, site:', currentSite);
          const result = await chrome.storage.local.get('authorizedSites');
          const authorizedSites = result.authorizedSites || {};
          authorizedSites[currentSite] = true;
          await chrome.storage.local.set({ authorizedSites });
          console.log('[AUTH DEBUG] 授权信息保存成功');
        } catch (error) {
          console.error('[AUTH DEBUG] 保存授权信息失败:', error);
        }

        // 发送授权成功结果给background script
        console.log('[AUTH DEBUG] 用户同意授权，发送成功结果给background script');
        await chrome.runtime.sendMessage({
          type: 'POPUP_RESPONSE',
          requestId: requestId,
          result: [walletInfo?.address]
        });
        
      } else {
        // 发送拒绝结果给background script
        console.log('[AUTH DEBUG] 用户拒绝授权，发送拒绝结果');
        await chrome.runtime.sendMessage({
          type: 'POPUP_RESPONSE',
          requestId: requestId,
          error: {
            code: 4001,
            message: 'User rejected the request'
          }
        });
      }

      // 清理待处理请求
      try {
        console.log('[AUTH DEBUG] 开始清理待处理请求');
        await chrome.storage.local.remove('pendingAuth');
        console.log('[AUTH DEBUG] pendingAuth 已从存储中移除');
        setPendingAuth(null);
        console.log('[AUTH DEBUG] pendingAuth 状态已重置为 null');
      } catch (error) {
        console.error('[AUTH DEBUG] 清理待处理请求失败:', error);
      }
      
      // 重置视图状态，根据钱包状态决定跳转页面
      try {
        if (walletInfo) {
          console.log('[AUTH DEBUG] 有钱包信息，返回钱包主界面');
          setView('wallet');
        } else {
          console.log('[AUTH DEBUG] 无钱包信息，返回主界面');
          setView('home');
        }
      } catch (error) {
        console.error('[AUTH DEBUG] 重置视图状态失败:', error);
        setView('home'); // 出错时默认返回主界面
      }
    } catch (error) {
      console.error('[AUTH DEBUG] Error handling authorization:', error);
      
      const { requestId } = pendingAuth;
      
      // 发送错误结果给background script
      await chrome.runtime.sendMessage({
        type: 'POPUP_RESPONSE',
        requestId: requestId,
        error: {
          code: -32603,
          message: error.message || 'Internal error'
        }
      });
      
      // 清理并重置视图状态
      await chrome.storage.local.remove('pendingAuth');
      setPendingAuth(null);
      
      // 根据钱包状态决定跳转页面
      if (walletInfo) {
        setView('wallet');
      } else {
        setView('home');
      }
    }
  };

  // 处理签名请求
  const handleSignTransaction = async (approved: boolean) => {
    try {
      if (approved && walletInfo) {
        console.log('[SIGNATURE DEBUG] Processing approved signature request');
        const { requestId, request } = pendingSignature;
        
        // 再次验证钱包信息
        if (!walletInfo.privateKey) {
          console.error('[SIGNATURE DEBUG] Wallet private key not available for signing');
          throw new Error('Wallet private key not available');
        }
        
        let signature: string;
        
        switch (request.method) {
          case 'personal_sign':
            console.log('[SIGNATURE DEBUG] Processing personal_sign');
            signature = await signMessage(request.params[0], request.params[1]);
            break;
          case 'eth_signTypedData_v4':
            console.log('[SIGNATURE DEBUG] Processing eth_signTypedData_v4');
            signature = await signTypedData(request.params[1], request.params[0]);
            break;
          case 'eth_sendTransaction':
            console.log('[SIGNATURE DEBUG] Processing eth_sendTransaction');
            signature = await sendTransaction(request.params[0]);
            break;
          default:
            throw new Error(`Unsupported method: ${request.method}`);
        }

        // 发送成功结果给background script
        console.log('[SIGNATURE DEBUG] 签名成功，发送结果给background script');
        await chrome.runtime.sendMessage({
          type: 'POPUP_RESPONSE',
          requestId: requestId,
          result: signature
        });
        
      } else {
        const { requestId } = pendingSignature;
        
        // 发送拒绝结果给background script
        console.log('[SIGNATURE DEBUG] 用户拒绝签名，发送拒绝结果');
        await chrome.runtime.sendMessage({
          type: 'POPUP_RESPONSE',
          requestId: requestId,
          error: {
            code: 4001,
            message: 'User rejected the request'
          }
        });
      }

      // 清理待处理请求
      await chrome.storage.local.remove('pendingSignature');
      setPendingSignature(null);
      
      // 重置视图状态，根据钱包状态决定跳转页面
      if (walletInfo) {
        setView('wallet');
      } else {
        setView('home');
      }
    } catch (error) {
      console.error('[SIGNATURE DEBUG] Error handling signature:', error);
      
      const { requestId } = pendingSignature;
      
      // 发送错误结果给background script
      console.log('[SIGNATURE DEBUG] 签名出错，发送错误结果');
      await chrome.runtime.sendMessage({
        type: 'POPUP_RESPONSE',
        requestId: requestId,
        error: {
          code: -32603,
          message: error.message || 'Internal error'
        }
      });
      
      // 清理并重置视图状态
      await chrome.storage.local.remove('pendingSignature');
      setPendingSignature(null);
      
      // 根据钱包状态决定跳转页面
      if (walletInfo) {
        setView('wallet');
      } else {
        setView('home');
      }
    }
  };

  // 签名消息
  const signMessage = async (message: string, address: string): Promise<string> => {
    if (!walletInfo?.privateKey) throw new Error('No wallet available');
    
    const { ethers } = await import('ethers');
    const wallet = new ethers.Wallet(walletInfo.privateKey);
    
    // 验证地址
    if (wallet.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Address mismatch');
    }
    
    return await wallet.signMessage(message);
  };

  // 签名类型化数据
  const signTypedData = async (typedData: string, address: string): Promise<string> => {
    if (!walletInfo?.privateKey) throw new Error('No wallet available');
    
    const { ethers } = await import('ethers');
    const wallet = new ethers.Wallet(walletInfo.privateKey);
    
    // 验证地址
    if (wallet.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Address mismatch');
    }
    
    const data = JSON.parse(typedData);
    return await wallet.signTypedData(data.domain, data.types, data.message);
  };

  // 发送交易
  const sendTransaction = async (transaction: any): Promise<string> => {
    console.log('[SIGNATURE DEBUG] sendTransaction called, walletInfo available:', !!walletInfo?.privateKey);
    
    if (!walletInfo?.privateKey) {
      console.error('[SIGNATURE DEBUG] No wallet private key available');
      throw new Error('No wallet available');
    }
    
    try {
      const { ethers } = await import('ethers');
      const { getCurrentNetwork, getAllNetworks } = await import('../core/wallet');
      
      const currentNetwork = await getCurrentNetwork();
      const allNetworks = await getAllNetworks();
      const networkConfig = allNetworks[currentNetwork];
      
      console.log('[SIGNATURE DEBUG] Using network:', currentNetwork, 'RPC:', networkConfig.rpcUrl);
      
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
      
      console.log('[SIGNATURE DEBUG] Sending transaction:', transaction);
      const tx = await wallet.sendTransaction(transaction);
      console.log('[SIGNATURE DEBUG] Transaction successful:', tx.hash);
      
      return tx.hash;
    } catch (error) {
      console.error('[SIGNATURE DEBUG] Transaction failed:', error);
      throw error;
    }
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
      await saveSession(walletInfo, source);
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
      if (source) await saveSession(w, source);
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
    
    // 不在这里手动加载余额，让 useEffect 来处理，避免重复调用
    
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
      // 用户下次打开时会重新加载余额
    }
  };

  const handleNetworkManagerChange = async (newNetwork: NetworkKey) => {
    console.log('Switching to network from manager:', newNetwork);
    
    // 立即更新界面
    setNetwork(newNetwork);
    
    // 不在这里手动加载余额，让 useEffect 来处理，避免重复调用
    
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

  // 监听视图变化，当进入钱包视图时加载余额
  useEffect(() => {
    console.log(`[VIEW DEBUG] View changed to: ${view}, walletInfo?.address: ${walletInfo?.address}, network: ${network}`);
    
    // 当进入钱包视图且有钱包信息时，重置自动刷新标志
    if (view === 'wallet' && walletInfo?.address && network) {
      console.log('[VIEW DEBUG] Entering wallet view, resetting balance auto-refresh flag...');
      // 重置自动刷新标志，允许网络变化时重新加载余额
      balanceAutoRefreshRef.current = false;
    }
  }, [view, walletInfo?.address, network]);

  // 检查待处理的授权和签名请求
  useEffect(() => {
    const checkPendingRequests = async () => {
      try {
        // 检查待处理的授权请求
        const authResult = await chrome.storage.local.get('pendingAuth');
        if (authResult.pendingAuth && 
            authResult.pendingAuth.requestId && 
            authResult.pendingAuth.timestamp) {
          
          // 再次验证请求是否仍然有效
          try {
            // 验证请求时间戳是否在合理范围内（5分钟内）
            const requestAge = Date.now() - authResult.pendingAuth.timestamp;
            if (requestAge > 5 * 60 * 1000) { // 5分钟
              console.log('[AUTH DEBUG] Pending auth request too old, clearing');
              await chrome.storage.local.remove('pendingAuth');
              return;
            }
            
            console.log('[AUTH DEBUG] Found valid pending auth request:', authResult.pendingAuth);
            setPendingAuth(authResult.pendingAuth);
            setView('authorize');
            
            // 获取当前网站信息
            try {
              const tabs = await (window as any).chrome.tabs.query({ active: true, currentWindow: true });
              if (tabs[0]?.url) {
                const url = new URL(tabs[0].url);
                setCurrentSite(url.hostname);
              }
            } catch (error) {
              console.error('[AUTH DEBUG] Error getting current site:', error);
              setCurrentSite('Unknown Site');
            }
            return;
          } catch (error) {
            // 如果验证失败，清除无效的请求
            console.error('[AUTH DEBUG] Error validating pending auth request:', error);
            await chrome.storage.local.remove('pendingAuth');
            console.log('[AUTH DEBUG] Invalid pending auth request, cleared');
          }
        }

        // 检查待处理的签名请求
        const signatureResult = await chrome.storage.local.get('pendingSignature');
        if (signatureResult.pendingSignature && 
            signatureResult.pendingSignature.requestId && 
            signatureResult.pendingSignature.timestamp) {
          
          // 再次验证请求是否仍然有效
          try {
            // 验证请求时间戳是否在合理范围内（5分钟内）
            const requestAge = Date.now() - signatureResult.pendingSignature.timestamp;
            if (requestAge > 5 * 60 * 1000) { // 5分钟
              console.log('[SIGNATURE DEBUG] Pending signature request too old, clearing');
              await chrome.storage.local.remove('pendingSignature');
              return;
            }
            
            console.log('[SIGNATURE DEBUG] Found valid pending signature request:', signatureResult.pendingSignature);
            setPendingSignature(signatureResult.pendingSignature);
            
            // 只有在已有钱包信息时才直接跳转到签名页面
            // 否则先让用户解锁钱包
            if (walletInfo?.privateKey) {
              console.log('[SIGNATURE DEBUG] Wallet info available, navigating to sign transaction');
              setView('signTransaction');
            } else {
              console.log('[SIGNATURE DEBUG] No wallet info available, waiting for wallet unlock...');
              // 不设置视图，让正常的钱包流程处理（解锁等）
            }
            return;
          } catch (error) {
            // 如果验证失败，清除无效的请求
            console.error('[SIGNATURE DEBUG] Error validating pending signature request:', error);
            await chrome.storage.local.remove('pendingSignature');
            console.log('[SIGNATURE DEBUG] Invalid pending signature request, cleared');
          }
        }

        // 如果没有待处理的请求，不要强制设置视图状态
        // 让用户保持在他们当前的界面
        console.log('[REQUEST DEBUG] No pending requests, keeping current view');
      } catch (error) {
        console.error('[REQUEST DEBUG] Error checking pending requests:', error);
        // 出错时也不要强制设置视图状态
      }
    };

    checkPendingRequests();
  }, []);

  // 当钱包信息可用时，检查是否有待处理的签名请求
  useEffect(() => {
    const checkPendingSignatureAfterUnlock = async () => {
      // 只有在钱包信息刚刚变为可用，且有私钥时才处理
      if (walletInfo?.privateKey && pendingSignature && view !== 'signTransaction') {
        console.log('[SIGNATURE DEBUG] Wallet unlocked, checking for pending signature...');
        
        try {
          // 重新验证签名请求
          const signatureResult = await chrome.storage.local.get('pendingSignature');
          if (signatureResult.pendingSignature && 
              signatureResult.pendingSignature.requestId && 
              signatureResult.pendingSignature.timestamp) {
            
            const requestAge = Date.now() - signatureResult.pendingSignature.timestamp;
            if (requestAge <= 5 * 60 * 1000) { // 5分钟内有效
              console.log('[SIGNATURE DEBUG] Valid pending signature found after unlock, navigating to sign transaction');
              setView('signTransaction');
            } else {
              console.log('[SIGNATURE DEBUG] Pending signature expired after unlock, clearing');
              await chrome.storage.local.remove('pendingSignature');
              setPendingSignature(null);
            }
          }
        } catch (error) {
          console.error('[SIGNATURE DEBUG] Error checking pending signature after unlock:', error);
        }
      }
    };

    checkPendingSignatureAfterUnlock();
  }, [walletInfo?.privateKey, pendingSignature, view]);

  return (
    <div style={{ 
      padding: '1.5rem', 
      width: 360, 
      minHeight: 500,
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '14px',
      lineHeight: 1.5,
      color: '#333'
    }}>
      {/* 语言切换按钮 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '0.5rem', 
        marginBottom: '1rem' 
      }}>
        <button 
          onClick={() => switchLang('en')}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '12px',
            backgroundColor: lang === 'en' ? '#007bff' : '#e9ecef',
            color: lang === 'en' ? 'white' : '#495057',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          EN
        </button>
        <button 
          onClick={() => switchLang('zh')}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '12px',
            backgroundColor: lang === 'zh' ? '#007bff' : '#e9ecef',
            color: lang === 'zh' ? 'white' : '#495057',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          中文
        </button>
      </div>
      
      {/* 标题 */}
      <h1 style={{ 
        margin: '0 0 1.5rem 0', 
        fontSize: '1.5rem', 
        fontWeight: '600',
        color: '#212529',
        textAlign: 'center'
      }}>
        {t('title')}
      </h1>
      {view === 'wallet' && (
        <div style={{ 
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '0.5rem'
          }}>
            <label style={{ 
              fontSize: '0.875rem', 
              fontWeight: '500',
              color: '#495057'
            }}>
              {t('network')}
            </label>
            <button 
              onClick={() => setView('networks')} 
              style={{ 
                fontSize: '0.75rem',
                padding: '0.25rem 0.5rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
              onMouseOut={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
            >
              {t('settings')}
            </button>
          </div>
          <select 
            value={network} 
            onChange={handleNetworkChange} 
            style={{ 
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '0.875rem',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            {Object.entries(allNetworks).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
      )}
      {view === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            onClick={handleCreate}
            style={{
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '500',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.backgroundColor = '#0056b3'}
            onMouseOut={(e) => (e.target as HTMLElement).style.backgroundColor = '#007bff'}
          >
            {t('createWallet')}
          </button>
          <button 
            onClick={() => setView('import')}
            style={{
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '500',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
            onMouseOut={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
          >
            {t('importWallet')}
          </button>
        </div>
      )}
      {view === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 导入方式选择 */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginBottom: '0.5rem' 
          }}>
            <button 
              onClick={() => setImportMethod('mnemonic')}
              style={{ 
                flex: 1, 
                backgroundColor: importMethod === 'mnemonic' ? '#007bff' : '#f8f9fa',
                color: importMethod === 'mnemonic' ? 'white' : '#495057',
                border: '1px solid #dee2e6',
                padding: '0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (importMethod !== 'mnemonic') {
                  (e.target as HTMLElement).style.backgroundColor = '#e9ecef';
                }
              }}
              onMouseOut={(e) => {
                if (importMethod !== 'mnemonic') {
                  (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
                }
              }}
            >
              {t('mnemonic')}
            </button>
            <button 
              onClick={() => setImportMethod('privateKey')}
              style={{ 
                flex: 1, 
                backgroundColor: importMethod === 'privateKey' ? '#007bff' : '#f8f9fa',
                color: importMethod === 'privateKey' ? 'white' : '#495057',
                border: '1px solid #dee2e6',
                padding: '0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (importMethod !== 'privateKey') {
                  (e.target as HTMLElement).style.backgroundColor = '#e9ecef';
                }
              }}
              onMouseOut={(e) => {
                if (importMethod !== 'privateKey') {
                  (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
                }
              }}
            >
              {t('privateKey')}
            </button>
          </div>
          
          {/* 输入框 */}
          {importMethod === 'mnemonic' ? (
            <textarea
              placeholder={lang === 'zh' ? "输入助记词 (12, 15, 18, 21, 或 24 个单词)" : "Enter mnemonic phrase (12, 15, 18, 21, or 24 words)"}
              value={inputMnemonic}
              onChange={(e) => setInputMnemonic(e.target.value)}
              style={{ 
                width: '100%', 
                minHeight: '100px', 
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          ) : (
            <input
              type="password"
              placeholder={lang === 'zh' ? "输入私钥 (64 位十六进制字符)" : "Enter private key (64 hex characters)"}
              value={inputPrivateKey}
              onChange={(e) => setInputPrivateKey(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'monospace'
              }}
            />
          )}
          
          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={handleImport}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.backgroundColor = '#218838'}
              onMouseOut={(e) => (e.target as HTMLElement).style.backgroundColor = '#28a745'}
            >
              {t('import')}
            </button>
            <button 
              onClick={backHome}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.backgroundColor = '#5a6268'}
              onMouseOut={(e) => (e.target as HTMLElement).style.backgroundColor = '#6c757d'}
            >
              {t('cancel')}
            </button>
          </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 钱包信息卡片 */}
          <div style={{ 
            padding: '1rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            border: '1px solid #e9ecef'
          }}>
            {source === 'created' && walletInfo?.mnemonic && (
              <div style={{ 
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px'
              }}>
                <div style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: '500',
                  color: '#856404',
                  marginBottom: '0.5rem'
                }}>
                  {t('mnemonic')}:
                </div>
                <div style={{ 
                  fontSize: '0.75rem',
                  color: '#856404',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace'
                }}>
                  {walletInfo.mnemonic}
                </div>
              </div>
            )}
            
            {/* 地址信息 */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500',
                color: '#495057',
                marginBottom: '0.5rem'
              }}>
                {t('address')}:
              </div>
              <div style={{ 
                fontSize: '0.75rem',
                color: '#6c757d',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                padding: '0.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                border: '1px solid #e9ecef'
              }}>
                {walletInfo?.address}
              </div>
            </div>
            
            {/* 余额信息 */}
            <div>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500',
                color: '#495057',
                marginBottom: '0.5rem'
              }}>
                {t('balance')}:
              </div>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ 
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: balanceLoaded ? '#28a745' : '#6c757d'
                }}>
                  {balanceLoading ? (
                    <span style={{ color: '#007bff' }}>
                      {lang === 'zh' ? '加载中...' : 'Loading...'}
                    </span>
                  ) : balanceLoaded ? (
                    <span>{balance} ETH</span>
                  ) : (
                    <span style={{ color: '#6c757d' }}>
                      {lang === 'zh' ? '未加载' : 'Not loaded'}
                    </span>
                  )}
                </div>
                {walletInfo?.address && (
                  <button 
                    onClick={() => loadBalance(walletInfo.address, network, true)}
                    disabled={balanceLoading}
                    style={{ 
                      fontSize: '0.75rem',
                      padding: '0.375rem 0.75rem',
                      backgroundColor: balanceLoading ? '#6c757d' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: balanceLoading ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      if (!balanceLoading) {
                        (e.target as HTMLElement).style.backgroundColor = '#218838';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!balanceLoading) {
                        (e.target as HTMLElement).style.backgroundColor = '#28a745';
                      }
                    }}
                  >
                    {balanceLoading ? 
                      (lang === 'zh' ? '刷新中...' : 'Refreshing...') : 
                      (lang === 'zh' ? '刷新' : 'Refresh')
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
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
  
  {/* 授权界面 */}
  {view === 'authorize' && pendingAuth && (
    <div style={{ 
      padding: '1.5rem', 
      width: 360, 
      minHeight: 500,
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '14px',
      lineHeight: 1.5,
      color: '#333'
    }}>
      <h2 style={{ 
        margin: '0 0 1.5rem 0', 
        fontSize: '1.25rem', 
        fontWeight: '600',
        color: '#212529',
        textAlign: 'center'
      }}>
        {lang === 'zh' ? '连接请求' : 'Connection Request'}
      </h2>
      
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: '500',
          color: '#495057',
          marginBottom: '0.5rem'
        }}>
          {lang === 'zh' ? '网站' : 'Site'}:
        </div>
        <div style={{ 
          fontSize: '0.875rem',
          color: '#007bff',
          fontWeight: '500'
        }}>
          {currentSite}
        </div>
      </div>
      
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: '500',
          color: '#495057',
          marginBottom: '0.5rem'
        }}>
          {lang === 'zh' ? '钱包地址' : 'Wallet Address'}:
        </div>
        <div style={{ 
          fontSize: '0.75rem',
          color: '#6c757d',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          padding: '0.5rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #e9ecef'
        }}>
          {walletInfo?.address}
        </div>
      </div>
      
      <div style={{ 
        fontSize: '0.875rem',
        color: '#6c757d',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        {lang === 'zh' ? 
          '此网站想要连接到您的钱包。请确认您信任此网站。' : 
          'This site wants to connect to your wallet. Please confirm you trust this site.'
        }
      </div>
      
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <button 
          onClick={() => handleAuthorize(false)}
          style={{ 
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#5a6268';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#6c757d';
          }}
        >
          {lang === 'zh' ? '拒绝' : 'Reject'}
        </button>
        <button 
          onClick={() => handleAuthorize(true)}
          style={{ 
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#218838';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#28a745';
          }}
        >
          {lang === 'zh' ? '连接' : 'Connect'}
        </button>
      </div>
      
      {/* 返回按钮 */}
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={() => {
            // 清理待处理请求
            chrome.storage.local.remove('pendingAuth').catch(console.error);
            setPendingAuth(null);
            
            // 根据钱包状态决定跳转页面
            if (walletInfo) {
              setView('wallet');
            } else {
              setView('home');
            }
          }}
          style={{ 
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: '#6c757d',
            border: '1px solid #6c757d',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#6c757d';
            (e.target as HTMLElement).style.color = 'white';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = 'transparent';
            (e.target as HTMLElement).style.color = '#6c757d';
          }}
        >
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
      </div>
    </div>
  )}
  
  {/* 签名界面 */}
  {view === 'signTransaction' && pendingSignature && (
    <div style={{ 
      padding: '1.5rem', 
      width: 360, 
      minHeight: 500,
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '14px',
      lineHeight: 1.5,
      color: '#333'
    }}>
      <h2 style={{ 
        margin: '0 0 1.5rem 0', 
        fontSize: '1.25rem', 
        fontWeight: '600',
        color: '#212529',
        textAlign: 'center'
      }}>
        {lang === 'zh' ? '签名请求' : 'Signature Request'}
      </h2>
      
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: '500',
          color: '#495057',
          marginBottom: '0.5rem'
        }}>
          {lang === 'zh' ? '请求类型' : 'Request Type'}:
        </div>
        <div style={{ 
          fontSize: '0.875rem',
          color: '#007bff',
          fontWeight: '500'
        }}>
          {pendingSignature.request.method}
        </div>
      </div>
      
      {pendingSignature.request.method === 'eth_sendTransaction' && (
        <div style={{ 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ 
            fontSize: '0.875rem', 
            fontWeight: '500',
            color: '#495057',
            marginBottom: '0.5rem'
          }}>
            {lang === 'zh' ? '交易详情' : 'Transaction Details'}:
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
            <div><strong>{lang === 'zh' ? '接收地址' : 'To'}:</strong> {pendingSignature.request.params[0].to}</div>
            <div><strong>{lang === 'zh' ? '金额' : 'Value'}:</strong> {pendingSignature.request.params[0].value || '0'} wei</div>
            <div><strong>{lang === 'zh' ? 'Gas限制' : 'Gas Limit'}:</strong> {pendingSignature.request.params[0].gasLimit || 'Auto'}</div>
          </div>
        </div>
      )}
      
      {pendingSignature.request.method === 'personal_sign' && (
        <div style={{ 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ 
            fontSize: '0.875rem', 
            fontWeight: '500',
            color: '#495057',
            marginBottom: '0.5rem'
          }}>
            {lang === 'zh' ? '消息内容' : 'Message'}:
          </div>
          <div style={{ 
            fontSize: '0.75rem',
            color: '#6c757d',
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            padding: '0.5rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            border: '1px solid #e9ecef',
            maxHeight: '100px',
            overflow: 'auto'
          }}>
            {pendingSignature.request.params[0]}
          </div>
        </div>
      )}
      
      <div style={{ 
        fontSize: '0.875rem',
        color: '#6c757d',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        {lang === 'zh' ? 
          '请仔细检查交易详情，确认无误后点击签名。' : 
          'Please carefully review the transaction details before signing.'
        }
      </div>
      
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <button 
          onClick={() => handleSignTransaction(false)}
          style={{ 
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#5a6268';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#6c757d';
          }}
        >
          {lang === 'zh' ? '拒绝' : 'Reject'}
        </button>
        <button 
          onClick={() => handleSignTransaction(true)}
          style={{ 
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#218838';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#28a745';
          }}
        >
          {lang === 'zh' ? '签名' : 'Sign'}
        </button>
      </div>
      
      {/* 返回按钮 */}
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={() => setView('wallet')}
          style={{ 
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            color: '#6c757d',
            border: '1px solid #6c757d',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#6c757d';
            (e.target as HTMLElement).style.color = 'white';
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.backgroundColor = 'transparent';
            (e.target as HTMLElement).style.color = '#6c757d';
          }}
        >
          {lang === 'zh' ? '返回' : 'Back'}
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
