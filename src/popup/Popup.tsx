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
  TransactionRecord,
  NETWORKS,
  NetworkKey,
  getTokenInfo,
  TokenInfo,
  getTokenBalance,
  getTokenBalances,
  broadcastNative,
  broadcastToken,
  waitForTransaction,
  detectTokens,
  isTokenContract,
  getCurrentNetwork,
  setCurrentNetwork,
  getAllNetworks,

} from '../core/wallet';
import { estimateTransferGasLimit, evmFeeCost, EvmFeeSuggestion, EvmGasSettings, suggestEvmFees } from '../core/fees';
import { formatUsd, getUsdPrices, UsdPrices, usdValue } from '../core/prices';
import { FeeChoice, FeeEditor, feeLabel } from './FeeEditor';
import { formatEther } from 'ethers';
import Activity from './Activity';
import { Icon, PageHeader, shortAddress, formatAmount, CoinLogo } from './ui';
import { nativeLogo, networkLogo, tokenLogo } from '../core/logos';
import './theme.css';
import NetworkManager from './NetworkManager';
import { translations, Lang, TranslationKey } from '../core/i18n';

type View =
  | 'home'
  | 'import'
  | 'setPassword'
  | 'unlock'
  | 'wallet'
  | 'send'
  | 'receive'
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
// 移除 SESSION_TTL - 改为浏览器会话锁定
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
  const [toast, setToast] = useState<string | null>(null);
  const [mnemonicRevealed, setMnemonicRevealed] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  
  // 授权和签名相关状态
  const [pendingAuth, setPendingAuth] = useState<any>(null);
  const [pendingSignature, setPendingSignature] = useState<any>(null);
  const [currentSite, setCurrentSite] = useState<string>('');
  const [isSigningPending, setIsSigningPending] = useState(false);
  
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
  // 移除 logoutTimer - 不再需要定时器
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
  /** 默认费用档位与当前选中的 gas 参数 */
  const [feeSuggestion, setFeeSuggestion] = useState<EvmFeeSuggestion | null>(null);
  const [feeChoice, setFeeChoice] = useState<{ level: FeeChoice; gas: EvmGasSettings } | null>(null);
  const [feeEditorOpen, setFeeEditorOpen] = useState(false);
  /** 美元价格，记录所属网络，切换网络后旧价格不再使用 */
  const [prices, setPrices] = useState<UsdPrices & { network: string }>({ network: '', native: null, tokens: {} });
  const [gasEstimating, setGasEstimating] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<{
    type: 'eth' | 'token';
    to: string;
    amount: string;
    token?: TokenInfo;
  } | null>(null);

  // 使用浏览器进程会话锁定
  const logout = () => {
    // 清理浏览器进程会话存储
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove('wallet_session').catch(console.error);
    }
    // 清理 localStorage 降级存储
    localStorage.removeItem('walletSession');
    // 同时清理 chrome.storage.local
    chrome.storage.local.remove('wallet_session').catch(console.error);
    setWalletInfo(null);
    setView('unlock');
  };

  const switchLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, l);
  };

  // 移除 startSessionTimer - 不再需要定时器

  useEffect(() => {
    const initializeWallet = async () => {
      console.log('[LuckYou Wallet] 开始初始化钱包...');
      
      try {
        // 从 chrome.storage.session 读取，实现浏览器进程会话锁定
        console.log('[LuckYou Wallet] 检查浏览器进程会话...');
        
        // 清理旧版本遗留在磁盘上的明文会话
        localStorage.removeItem('walletSession');
        chrome.storage.local.remove('wallet_session').catch(console.error);

        let sessionResult: { wallet_session?: string } = {};
        try {
          sessionResult = await chrome.storage.session.get('wallet_session');
        } catch (sessionError) {
          console.warn('[LuckYou Wallet] chrome.storage.session unavailable:', sessionError);
        }
        
        if (sessionResult.wallet_session) {
          try {
            const s: WalletSession = JSON.parse(sessionResult.wallet_session);
            // 移除时间检查，直接使用会话数据
            setWalletInfo(s.info);
            setSource(s.source);
            setView('wallet');
            
            console.log('[LuckYou Wallet] 从浏览器进程会话恢复钱包状态');
            return; // 成功恢复会话，退出
          } catch (e) {
            console.error('Failed to parse session', e);
            chrome.storage.session.remove('wallet_session').catch(console.error);
          }
        }
        
        // 如果没有进程会话，检查是否有本地存储的钱包需要解锁
        console.log('[LuckYou Wallet] 检查本地存储钱包...');
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (stored) {
          try {
            const w: StoredWallet = JSON.parse(stored);
            setEncryptedWallet(w.encrypted);
            setSource(w.source); // 设置source以便解锁后保存会话
            setView('unlock');
            console.log('[LuckYou Wallet] 检测到本地钱包，需要解锁');
          } catch (e) {
            console.error('Failed to parse stored wallet', e);
            localStorage.removeItem(STORAGE_KEY);
            setView('home'); // 改为 home 而不是 welcome
          }
        } else {
          // 没有钱包，显示首页
          setView('home');
          console.log('[LuckYou Wallet] 未检测到钱包，显示首页');
        }
      } catch (error) {
        console.error('[LuckYou Wallet] Error initializing wallet:', error);
        // 出错时显示首页，允许用户创建或导入钱包
        setView('home');
      }
    };
    
    initializeWallet();
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

  // 美元价格：网络或代币列表变化时刷新 (核心里有 60 秒缓存)
  useEffect(() => {
    if (!walletInfo?.address) return;
    let cancelled = false;
    getUsdPrices(network, tokens.map((x) => x.address)).then((p) => {
      if (!cancelled) setPrices({ ...p, network });
    });
    return () => {
      cancelled = true;
    };
  }, [walletInfo?.address, network, tokens]);

  useEffect(() => {
    if (!walletInfo) return;
    // 一次 Multicall 查询所有代币余额
    getTokenBalances(tokens, walletInfo.address, network)
      .then((list) => {
        const next: Record<string, string> = {};
        tokens.forEach((token, i) => (next[token.address] = parseFloat(list[i]).toFixed(5)));
        setTokenBalances((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {});
  }, [tokens, walletInfo, network]);

  // 弹窗打开期间每 15 秒自动刷新余额；余额增加时提示到账
  const pollSnapshot = useRef<{ scope: string; native: string; tokens: string[] } | null>(null);
  useEffect(() => {
    if (!walletInfo?.address || !networkInitialized) return;
    const address = walletInfo.address;
    const scope = `${address}:${network}`;
    const poll = async () => {
      try {
        const [native, tokenList] = await Promise.all([
          getEthBalance(address, network),
          getTokenBalances(tokens, address, network),
        ]);
        const prev = pollSnapshot.current;
        if (prev && prev.scope === scope) {
          const symbol = allNetworks[network]?.currencySymbol || 'ETH';
          const gained = Number(native) - Number(prev.native);
          const tokenIndex = tokenList.findIndex((b, i) => prev.tokens[i] != null && Number(b) > Number(prev.tokens[i]));
          if (gained > 0) {
            showToast(tr(`Received ${formatAmount(String(gained))} ${symbol}`, `收到 ${formatAmount(String(gained))} ${symbol}`), 4000);
          } else if (tokenIndex >= 0) {
            const diff = String(Number(tokenList[tokenIndex]) - Number(prev.tokens[tokenIndex]));
            const sym = tokens[tokenIndex].symbol;
            showToast(tr(`Received ${formatAmount(diff)} ${sym}`, `收到 ${formatAmount(diff)} ${sym}`), 4000);
          }
        }
        pollSnapshot.current = { scope, native, tokens: tokenList };
        setBalanceWithLog(parseFloat(native).toFixed(5), 'poll');
        setBalanceLoaded(true);
        const next: Record<string, string> = {};
        tokens.forEach((token, i) => (next[token.address] = parseFloat(tokenList[i]).toFixed(5)));
        setTokenBalances((p) => ({ ...p, ...next }));
      } catch {
        // 自动刷新失败不打扰用户，下一轮再试
      }
    };
    pollSnapshot.current = null;
    poll();
    const timer = window.setInterval(poll, 15_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletInfo?.address, network, networkInitialized, tokens]);

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
    // 解密后的密钥只保存在内存型的 chrome.storage.session 中，绝不落盘
    try {
      await chrome.storage.session.set({ wallet_session: JSON.stringify(session) });
    } catch (error) {
      console.error('[LuckYou Wallet] Failed to save wallet session:', error);
    }
  };

  const handleCreate = () => {
    const w = createWallet();
    setWalletInfo(w);
    setSource('created');
    setMnemonicRevealed(false);
    setBackupConfirmed(false);
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
        setIsSigningPending(true); // 开始签名，显示加载状态
        
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
      setIsSigningPending(false); // 清除加载状态
      
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
      setIsSigningPending(false); // 清除加载状态
      
      // 根据钱包状态决定跳转页面
      if (walletInfo) {
        setView('wallet');
      } else {
        setView('home');
      }
    }
  };

  // 加载动画组件
  const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Processing...' }) => (
    <div className="overlay">
      <div className="spinner" />
      <p style={{ margin: 0 }}>{message}</p>
    </div>
  );

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
      const { getCurrentNetwork, getAllNetworks, getProvider } = await import('../core/wallet');
      
      const currentNetwork = await getCurrentNetwork();
      const allNetworks = await getAllNetworks();
      const networkConfig = allNetworks[currentNetwork];
      
      console.log('[SIGNATURE DEBUG] Using network:', currentNetwork, 'RPC:', networkConfig.rpcUrl);
      
      const provider = getProvider(networkConfig);
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

  /** 估算 gas 上限并按最近区块给出 低 / 市场 / 激进 三档，默认选市场档 */
  const loadFeeSuggestion = async (to: string, value: string, token?: TokenInfo) => {
    const gasLimit = await estimateTransferGasLimit(walletInfo!.address, to, value, network, token);
    const suggestion = await suggestEvmFees(network, gasLimit);
    setFeeSuggestion(suggestion);
    setFeeChoice({ level: 'market', gas: suggestion.levels.market });
  };

  /** 更新本机发出交易的状态 (后台确认完成后调用) */
  const updateRecordStatus = (hash: string, status: number, key: string) => {
    setHistory((prev) => {
      const updated = prev.map((r) => (r.hash === hash ? { ...r, status } : r));
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  };

  /** 后台等待确认，确认后更新记录与余额 (公共节点可能慢一个区块，稍后再刷新一次) */
  const trackTransaction = (hash: string, key: string, onDone?: () => void) => {
    waitForTransaction(hash, network)
      .then((status) => {
        updateRecordStatus(hash, status, key);
        showToast(status === 1 ? tr('Transaction confirmed', '交易已确认') : tr('Transaction failed', '交易失败'), 2500);
      })
      .catch(() => {})
      .finally(() => {
        if (!walletInfo) return;
        const refreshNow = () => {
          loadBalance(walletInfo.address, network, true);
          onDone?.();
        };
        refreshNow();
        window.setTimeout(refreshNow, 2500);
      });
  };

  const resetFee = () => {
    setFeeSuggestion(null);
    setFeeChoice(null);
    setFeeEditorOpen(false);
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
      await loadFeeSuggestion(toAddress, amount);
      setView('confirmEthTransaction');
    } catch (e) {
      alert('Failed to estimate gas');
      setPendingTransaction(null);
    } finally {
      setGasEstimating(false);
    }
  };

  const handleConfirmEthTransaction = async () => {
    if (!walletInfo || !pendingTransaction || !feeChoice) return;

    try {
      setSending(true);
      // 广播后立即返回，确认在后台进行 (与 MetaMask 一致)
      const hash = await broadcastNative(
        { privateKey: walletInfo.privateKey, mnemonic: walletInfo.mnemonic },
        pendingTransaction.to,
        pendingTransaction.amount,
        network,
        feeChoice.gas,
      );
      const record: TransactionRecord = {
        hash,
        from: walletInfo.address,
        to: pendingTransaction.to,
        value: parseFloat(pendingTransaction.amount).toFixed(5),
        status: -1,
      };
      const key = getHistoryKey(walletInfo.address, network);
      setHistory((prev) => {
        const updated = [record, ...prev];
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      showToast(tr('Transaction submitted', '交易已提交'), 2500);
      trackTransaction(hash, key);

      setToAddress('');
      setAmount('');
      setPendingTransaction(null);
      resetFee();
      setView('wallet');
    } catch (e) {
      alert(`${tr('Failed to send transaction', '发送失败')}: ${(e as { shortMessage?: string; message?: string })?.shortMessage || (e as Error)?.message || e}`);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmTokenTransaction = async () => {
    if (!walletInfo || !pendingTransaction || !feeChoice || !pendingTransaction.token) return;

    try {
      setSendingToken(true);
      const { token, to, amount: value } = pendingTransaction;
      const hash = await broadcastToken(
        { privateKey: walletInfo.privateKey, mnemonic: walletInfo.mnemonic },
        token,
        to,
        value,
        network,
        feeChoice.gas,
      );

      // 记录本机发出的代币交易，链上索引收录前也能在活动中看到
      const record: TransactionRecord = { hash, from: walletInfo.address, to, value: `${value} ${token.symbol}`, status: -1 };
      const historyKey = getHistoryKey(walletInfo.address, network);
      setHistory((prev) => {
        const updated = [record, ...prev];
        localStorage.setItem(historyKey, JSON.stringify(updated));
        return updated;
      });
      showToast(tr('Transaction submitted', '交易已提交'), 2500);
      // 确认后刷新代币余额
      trackTransaction(hash, historyKey, () => {
        getTokenBalance(token, walletInfo.address, network)
          .then((b) => setTokenBalances((prev) => ({ ...prev, [token.address]: parseFloat(b).toFixed(5) })))
          .catch(() => {});
      });

      setPendingTransaction(null);
      resetFee();
      setView('tokenDetail');
    } catch (e) {
      alert(`${tr('Failed to send token', '发送失败')}: ${(e as { shortMessage?: string; message?: string })?.shortMessage || (e as Error)?.message || e}`);
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
    // 清理浏览器进程会话
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove('wallet_session').catch(console.error);
    }
    localStorage.removeItem('walletSession');
  };

  const clearWallet = () => {
    localStorage.removeItem(STORAGE_KEY);
    // 清理浏览器进程会话
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove('wallet_session').catch(console.error);
    }
    localStorage.removeItem('walletSession');
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
      // 链上记录 (含收款) 由活动页按需查询
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

  const tr = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const currentNetwork = allNetworks[network];
  const nativeSymbol: string = currentNetwork?.currencySymbol || 'ETH';
  const explorerBase: string = (currentNetwork?.blockExplorer || '').replace(/\/$/, '');

  const showToast = (message: string, duration = 1600) => {
    setToast(message);
    window.setTimeout(() => setToast(null), duration);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(tr('Copied', '已复制'));
    } catch {
      showToast(tr('Copy failed', '复制失败'));
    }
  };

  const openTx = (hash: string) => {
    if (explorerBase) window.open(`${explorerBase}/tx/${hash}`, '_blank');
  };

  const handleSendTokenNext = async () => {
    if (!walletInfo || !selectedToken) return;
    setPendingTransaction({
      type: 'token',
      to: sendTokenTo,
      amount: sendTokenAmount,
      token: selectedToken,
    });
    setGasEstimating(true);
    try {
      await loadFeeSuggestion(sendTokenTo, sendTokenAmount, selectedToken);
      setView('confirmTokenTransaction');
    } catch (e) {
      alert('Failed to estimate gas');
      setPendingTransaction(null);
    } finally {
      setGasEstimating(false);
    }
  };

  const formatWeiValue = (value?: string) => {
    if (!value) return '0';
    try {
      return formatEther(BigInt(value));
    } catch {
      return value;
    }
  };

  const showHeader = !['home', 'import', 'setPassword', 'unlock'].includes(view);
  const mnemonicWords = walletInfo?.mnemonic ? walletInfo.mnemonic.trim().split(/\s+/) : [];

  const nativePrice = prices.network === network ? prices.native : null;
  const tokenPrice = (address: string) => (prices.network === network ? prices.tokens[address] : undefined);

  /** 网络费：点击打开编辑面板；原生币转账同时显示合计 */
  const renderFeeCard = (nativeAmount?: string) => {
    if (!feeSuggestion || !feeChoice) return null;
    const fee = formatEther(evmFeeCost(feeChoice.gas, feeSuggestion.baseFee).expected);
    const feeUsd = formatUsd(usdValue(fee, nativePrice));
    const total = nativeAmount ? String(Number(nativeAmount) + Number(fee)) : '';
    const totalUsd = total ? formatUsd(usdValue(total, nativePrice)) : '';
    return (
      <div className="card">
        <button className="fee-row" onClick={() => setFeeEditorOpen(true)}>
          <span>
            <span className="k">{tr('Est. network fee', '预估网络费')}</span>
            <span className="fee-level">
              {feeLabel(feeChoice.level, lang)} <Icon name="chevron" size={13} />
            </span>
          </span>
          <span className="fee-values">
            <span className="fee-main">{feeUsd || `${formatAmount(fee, 8)} ${nativeSymbol}`}</span>
            {feeUsd && <span className="fee-sub">{formatAmount(fee, 8)} {nativeSymbol}</span>}
          </span>
        </button>
        {total && (
          <div className="kv total">
            <span className="k">{tr('Total', '合计')}</span>
            <span className="v">{formatAmount(total, 8)} {nativeSymbol}{totalUsd ? `  ≈ ${totalUsd}` : ''}</span>
          </div>
        )}
        {feeEditorOpen && (
          <FeeEditor
            suggestion={feeSuggestion}
            selected={feeChoice.level}
            current={feeChoice.gas}
            symbol={nativeSymbol}
            price={nativePrice}
            lang={lang}
            onSelect={(level, gas) => {
              setFeeChoice({ level, gas });
              setFeeEditorOpen(false);
            }}
            onClose={() => setFeeEditorOpen(false)}
          />
        )}
      </div>
    );
  };

  const usdHint = (value: string, price: number | null | undefined) => {
    const usd = Number(value) > 0 ? formatUsd(usdValue(value, price)) : '';
    return usd ? <div className="usd-hint">≈ {usd}</div> : null;
  };

  const nativeUsd = balanceLoaded ? usdValue(balance, nativePrice) : null;
  const tokenUsd = (address: string) => usdValue(tokenBalances[address] || '0', tokenPrice(address));
  // 总价值 = 原生币 + 有报价的代币；没有任何报价时不显示
  const pricedValues = [nativeUsd, ...tokens.map((x) => tokenUsd(x.address))].filter((v): v is number => v != null);
  const totalUsd = pricedValues.length ? pricedValues.reduce((a, b) => a + b, 0) : null;

  return (
    <div className="app">
      {showHeader && (
        <header className="header">
          <div className="brand">
            <div className="brand-mark">L</div>
          </div>
          <div className="network-pill" title={currentNetwork?.name}>
            {networkLogo(network) ? <img className="net-logo" src={`/logos/${networkLogo(network)}.png`} alt="" /> : <span className="dot" />}
            <span className="label">{currentNetwork?.name || '—'}</span>
            <Icon name="chevron" size={14} className="chevron" />
            <select value={network} onChange={handleNetworkChange} aria-label={t('networks')}>
              {Object.entries(allNetworks).map(([key, { name }]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')} title="Language">
              {lang === 'zh' ? 'EN' : '中'}
            </button>
            <button className="icon-btn" onClick={() => setView('networks')} title={t('settings')}>
              <Icon name="settings" size={16} />
            </button>
            {walletInfo && (
              <button className="icon-btn" onClick={logout} title={t('logout')}>
                <Icon name="lock" size={16} />
              </button>
            )}
          </div>
        </header>
      )}

      {view === 'home' && (
        <div className="page">
          <div className="row" style={{ justifyContent: 'flex-end', flex: 'none' }}>
            <button className="icon-btn" style={{ flex: 'none' }} onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </div>
          <div className="hero">
            <div className="hero-logo">L</div>
            <h1>LuckYou Wallet</h1>
            <p>{tr('Your secure gateway to Web3', '安全、简单的 Web3 钱包')}</p>
          </div>
          <div className="spacer" />
          <div className="stack">
            <button className="btn btn-primary" onClick={handleCreate}>
              <Icon name="plus" /> {t('createWallet')}
            </button>
            <button className="btn btn-secondary" onClick={() => setView('import')}>
              <Icon name="arrowDown" /> {t('importWallet')}
            </button>
          </div>
          <p className="center text-muted" style={{ fontSize: 12, margin: 0 }}>
            {tr('Keys are encrypted and never leave your device', '私钥加密存储，永不离开你的设备')}
          </p>
        </div>
      )}

      {view === 'import' && (
        <div className="page">
          <PageHeader title={t('importWallet')} onBack={backHome} />
          <div className="segmented">
            <button className={importMethod === 'mnemonic' ? 'active' : ''} onClick={() => setImportMethod('mnemonic')}>
              {t('mnemonic')}
            </button>
            <button className={importMethod === 'privateKey' ? 'active' : ''} onClick={() => setImportMethod('privateKey')}>
              {t('privateKey')}
            </button>
          </div>
          {importMethod === 'mnemonic' ? (
            <div className="field">
              <label className="field-label">{tr('Secret recovery phrase', '助记词')}</label>
              <textarea
                className="textarea"
                placeholder={tr('Enter 12, 15, 18, 21 or 24 words separated by spaces', '输入 12/15/18/21/24 个单词，用空格分隔')}
                value={inputMnemonic}
                onChange={(e) => setInputMnemonic(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="field">
              <label className="field-label">{t('privateKey')}</label>
              <input
                className="input mono"
                type="password"
                placeholder={tr('64 hex characters', '64 位十六进制字符')}
                value={inputPrivateKey}
                onChange={(e) => setInputPrivateKey(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="alert alert-info">
            <Icon name="shield" size={16} />
            <span>{tr('Never share your recovery phrase or private key with anyone.', '切勿向任何人透露你的助记词或私钥。')}</span>
          </div>
          <div className="spacer" />
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importMethod === 'mnemonic' ? !inputMnemonic.trim() : !inputPrivateKey.trim()}
          >
            {t('import')}
          </button>
        </div>
      )}

      {view === 'setPassword' && (
        <div className="page">
          <PageHeader title={source === 'created' ? tr('Back up & secure', '备份并设置密码') : tr('Set password', '设置密码')} onBack={backHome} />
          {source === 'created' && mnemonicWords.length > 0 && (
            <>
              <div className="alert alert-warning">
                <Icon name="warning" size={16} />
                <span>{tr('Write these words down in order and store them offline. Anyone with them can take your funds.', '请按顺序抄写这些单词并离线保存。任何获得它们的人都可以转走你的资产。')}</span>
              </div>
              <div className={`mnemonic-grid ${mnemonicRevealed ? '' : 'blurred'}`}>
                {mnemonicWords.map((word, i) => (
                  <div className="mnemonic-word" key={i}>
                    <span className="n">{i + 1}</span>
                    <span>{word}</span>
                  </div>
                ))}
                {!mnemonicRevealed && (
                  <button className="reveal-overlay" onClick={() => setMnemonicRevealed(true)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="eye" size={16} /> {tr('Click to reveal', '点击显示')}
                    </span>
                  </button>
                )}
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={backupConfirmed} onChange={(e) => setBackupConfirmed(e.target.checked)} />
                <span>{tr('I have safely backed up my recovery phrase', '我已安全备份助记词')}</span>
              </label>
            </>
          )}
          {source !== 'created' && walletInfo?.address && (
            <div className="card">
              <p className="card-title">{t('address')}</p>
              <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{walletInfo.address}</div>
            </div>
          )}
          <div className="field">
            <label className="field-label">{tr('Password', '密码')}</label>
            <input
              className="input"
              type="password"
              placeholder={tr('At least 8 characters', '至少 8 位')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">{tr('Confirm password', '确认密码')}</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            />
          </div>
          {confirmPassword && password !== confirmPassword && (
            <span className="text-danger">{tr('Passwords do not match', '两次密码不一致')}</span>
          )}
          <div className="spacer" />
          <button
            className="btn btn-primary"
            onClick={handleSetPassword}
            disabled={password.length < 8 || password !== confirmPassword || (source === 'created' && !backupConfirmed)}
          >
            {tr('Create wallet', '完成')}
          </button>
        </div>
      )}

      {view === 'unlock' && (
        <div className="page">
          <div className="row" style={{ justifyContent: 'flex-end', flex: 'none' }}>
            <button className="icon-btn" style={{ flex: 'none' }} onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </div>
          <div className="hero">
            <div className="hero-logo">L</div>
            <h1>{tr('Welcome back', '欢迎回来')}</h1>
            <p>{tr('Enter your password to unlock', '输入密码解锁钱包')}</p>
          </div>
          <div className="spacer" />
          <input
            className="input"
            type="password"
            placeholder={tr('Password', '密码')}
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleUnlock} disabled={!unlockPassword}>
            <Icon name="lock" size={16} /> {t('unlock')}
          </button>
          <button
            className="btn btn-link"
            onClick={() => {
              if (window.confirm(tr(
                'This removes the wallet from this browser. You can only restore it with your recovery phrase. Continue?',
                '这将从浏览器中删除钱包，只能通过助记词恢复。确定继续？'
              ))) clearWallet();
            }}
          >
            {tr('Forgot password? Reset wallet', '忘记密码？重置钱包')}
          </button>
        </div>
      )}

      {view === 'wallet' && (
        <div className="page">
          <div className="balance-card">
            <div className="balance-top">
              <button className="address-chip" onClick={() => walletInfo && copyText(walletInfo.address)}>
                {shortAddress(walletInfo?.address)} <Icon name="copy" size={12} />
              </button>
              {walletInfo?.address && (
                <button
                  className="icon-btn"
                  onClick={() => loadBalance(walletInfo.address, network, true)}
                  disabled={balanceLoading}
                  title={tr('Refresh', '刷新')}
                >
                  <Icon name="refresh" size={15} className={balanceLoading ? 'spin' : ''} />
                </button>
              )}
            </div>
            <div className="balance-label">{t('balance')}</div>
            <div className="balance-amount">
              {balanceLoaded ? formatAmount(balance) : balanceLoading ? '···' : '—'}
              <span className="sym">{nativeSymbol}</span>
            </div>
            {totalUsd != null && <div className="balance-usd">{tr('Total value', '总价值')} {formatUsd(totalUsd)}</div>}
          </div>

          <div className="actions">
            <button className="action" onClick={() => setView('send')}>
              <span className="action-icon"><Icon name="send" /></span>
              {t('send')}
            </button>
            <button className="action" onClick={() => setView('receive')}>
              <span className="action-icon"><Icon name="receive" /></span>
              {tr('Receive', '收款')}
            </button>
            <button className="action" onClick={() => setView('activity')}>
              <span className="action-icon"><Icon name="activity" /></span>
              {t('activity')}
            </button>
            <button className="action" onClick={() => setView('addToken')}>
              <span className="action-icon"><Icon name="plus" /></span>
              {tr('Token', '代币')}
            </button>
          </div>

          <div className="section-head">
            <h3>{tr('Assets', '资产')}</h3>
          </div>
          <div className="list">
            <div className="list-item" style={{ cursor: 'default' }}>
              {nativeLogo(network) ? (
                <CoinLogo logo={nativeLogo(network)} label={nativeSymbol} />
              ) : (
                <div className="avatar native">{nativeSymbol.slice(0, 1)}</div>
              )}
              <div className="main">
                <div className="title">{nativeSymbol}</div>
                <div className="sub">{currentNetwork?.name}</div>
              </div>
              <div className="end">
                {balanceLoaded ? formatAmount(balance) : '—'}
                {nativeUsd != null && <div className="sub">{formatUsd(nativeUsd)}</div>}
              </div>
            </div>
            {tokens.map((token) => (
              <button
                key={token.address}
                className="list-item"
                onClick={() => {
                  setSelectedToken(token);
                  setView('tokenDetail');
                }}
              >
                <CoinLogo logo={tokenLogo(token.address, token.symbol)} label={token.symbol} seed={token.address} />
                <div className="main">
                  <div className="title">{token.symbol}</div>
                  <div className="sub">{token.name}</div>
                </div>
                <div className="end">
                  {formatAmount(tokenBalances[token.address] || '0')}
                  {tokenUsd(token.address) != null && <div className="sub">{formatUsd(tokenUsd(token.address))}</div>}
                </div>
              </button>
            ))}
          </div>
          <button className="btn btn-link" onClick={() => setView('addToken')}>
            + {t('addToken')}
          </button>
        </div>
      )}

      {view === 'receive' && walletInfo && (
        <div className="page">
          <PageHeader title={tr('Receive', '收款')} onBack={() => setView('wallet')} />
          <div className="avatar native receive-avatar">L</div>
          <p className="center text-secondary" style={{ margin: 0 }}>
            {tr(`Send only ${currentNetwork?.name || ''} assets to this address`, `仅向此地址发送 ${currentNetwork?.name || ''} 网络资产`)}
          </p>
          <div className="address-box">{walletInfo.address}</div>
          <button className="btn btn-primary" onClick={() => copyText(walletInfo.address)}>
            <Icon name="copy" size={16} /> {tr('Copy address', '复制地址')}
          </button>
        </div>
      )}

      {view === 'send' && (
        <div className="page">
          <PageHeader title={`${t('send')} ${nativeSymbol}`} onBack={() => setView('wallet')} />
          <div className="field">
            <label className="field-label">{t('to')}</label>
            <input className="input mono" placeholder="0x…" value={toAddress} onChange={(e) => setToAddress(e.target.value.trim())} autoFocus />
          </div>
          <div className="field">
            <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tr('Amount', '金额')}</span>
              <span className="text-muted">{tr('Balance', '余额')}: {formatAmount(balance)} {nativeSymbol}</span>
            </label>
            <input className="input" placeholder="0.0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {usdHint(amount, nativePrice)}
          <div className="spacer" />
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || gasEstimating || !toAddress || !amount}>
            {gasEstimating && <span className="spinner" />}
            {gasEstimating ? t('estimating') : tr('Next', '下一步')}
          </button>
        </div>
      )}

      {view === 'addToken' && (
        <div className="page">
          <PageHeader title={t('addToken')} onBack={() => setView('wallet')} />
          <div className="field">
            <label className="field-label">{t('tokenAddress')}</label>
            <input className="input mono" placeholder="0x…" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value.trim())} autoFocus />
          </div>
          {tokenMetaLoading && <p className="text-muted" style={{ margin: 0 }}>{t('loading')}</p>}
          {tokenMetaError && <span className="text-danger">{tokenMetaError}</span>}
          {preview ? (
            <div className="list-item" style={{ cursor: 'default' }}>
              <CoinLogo logo={tokenLogo(preview.address, preview.symbol)} label={preview.symbol} seed={preview.address} />
              <div className="main">
                <div className="title">{preview.symbol}</div>
                <div className="sub">{preview.name}</div>
              </div>
              <div className="end"><div className="sub">decimals {preview.decimals}</div></div>
            </div>
          ) : (
            <div className="row">
              <div className="field">
                <label className="field-label">{t('tokenSymbol')}</label>
                <input className="input" value={manualSymbol} onChange={(e) => setManualSymbol(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">{t('tokenDecimals')}</label>
                <input className="input" value={manualDecimals} onChange={(e) => setManualDecimals(e.target.value)} inputMode="numeric" />
              </div>
            </div>
          )}
          <div className="spacer" />
          <button className="btn btn-primary" onClick={handleAddToken} disabled={!tokenAddress}>{t('add')}</button>
        </div>
      )}

      {view === 'tokenDetail' && selectedToken && walletInfo && (
        <div className="page">
          <PageHeader title={selectedToken.symbol} onBack={() => setView('wallet')} />
          <div className="card center">
            <CoinLogo
              logo={tokenLogo(selectedToken.address, selectedToken.symbol)}
              label={selectedToken.symbol}
              seed={selectedToken.address}
              size={56}
              className="receive-avatar"
              style={{ margin: '0 auto 10px' }}
            />
            <div className="balance-amount" style={{ fontSize: 26 }}>
              {formatAmount(tokenBalances[selectedToken.address] || '0')}
              <span className="sym" style={{ fontSize: 14 }}>{selectedToken.symbol}</span>
            </div>
            {usdHint(tokenBalances[selectedToken.address] || '0', tokenPrice(selectedToken.address))}
            <div className="text-muted" style={{ fontSize: 12 }}>{selectedToken.name}</div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => setView('sendToken')}>
              <Icon name="send" size={16} /> {t('send')}
            </button>
            <button className="btn btn-secondary" onClick={() => setView('receive')}>
              <Icon name="receive" size={16} /> {tr('Receive', '收款')}
            </button>
          </div>
          <div className="card">
            <div className="kv">
              <span className="k">{tr('Contract', '合约')}</span>
              <button className="v mono btn-link" style={{ padding: 0, color: 'var(--text)' }} onClick={() => copyText(selectedToken.address)}>
                {shortAddress(selectedToken.address)} <Icon name="copy" size={11} />
              </button>
            </div>
            <div className="kv"><span className="k">{t('tokenDecimals')}</span><span className="v">{selectedToken.decimals}</span></div>
          </div>
          <div className="section-head"><h3>{t('activity')}</h3></div>
          {selectedTokenHistory.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><Icon name="activity" /></div>
              {t('noTransactions')}
            </div>
          ) : (
            <div className="list">
              {selectedTokenHistory.map((r) => {
                const isSent = r.from.toLowerCase() === walletInfo.address.toLowerCase();
                return (
                  <button key={r.hash} className="list-item" onClick={() => openTx(r.hash)} title={r.hash}>
                    <div className={`avatar ${isSent ? 'sent' : 'received'}`}>
                      <Icon name={isSent ? 'arrowUp' : 'arrowDown'} size={16} />
                    </div>
                    <div className="main">
                      <div className="title">{isSent ? tr('Sent', '转出') : tr('Received', '转入')}</div>
                      <div className="sub mono">{shortAddress(isSent ? r.to : r.from)}</div>
                    </div>
                    <div className="end">{isSent ? '-' : '+'}{formatAmount(r.value)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'sendToken' && selectedToken && walletInfo && (
        <div className="page">
          <PageHeader title={`${t('send')} ${selectedToken.symbol}`} onBack={() => setView('tokenDetail')} />
          <div className="field">
            <label className="field-label">{t('to')}</label>
            <input className="input mono" placeholder="0x…" value={sendTokenTo} onChange={(e) => setSendTokenTo(e.target.value.trim())} autoFocus />
          </div>
          <div className="field">
            <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tr('Amount', '金额')}</span>
              <span className="text-muted">{tr('Balance', '余额')}: {formatAmount(tokenBalances[selectedToken.address] || '0')}</span>
            </label>
            <input className="input" placeholder="0.0" inputMode="decimal" value={sendTokenAmount} onChange={(e) => setSendTokenAmount(e.target.value)} />
          </div>
          {usdHint(sendTokenAmount, tokenPrice(selectedToken.address))}
          <div className="spacer" />
          <button className="btn btn-primary" onClick={handleSendTokenNext} disabled={sendingToken || gasEstimating || !sendTokenTo || !sendTokenAmount}>
            {gasEstimating && <span className="spinner" />}
            {gasEstimating ? t('estimating') : tr('Next', '下一步')}
          </button>
        </div>
      )}

      {view === 'activity' && walletInfo && (
        <Activity
          records={history}
          wallet={walletInfo}
          network={network}
          tokens={tokens}
          lang={lang}
          onBack={() => setView('wallet')}
          t={t}
          symbol={nativeSymbol}
          explorerBase={explorerBase}
        />
      )}

      {view === 'networks' && (
        <div className="page">
          <PageHeader title={t('networks')} onBack={() => setView(walletInfo ? 'wallet' : 'home')} />
          <NetworkManager onNetworkChange={handleNetworkManagerChange} currentNetwork={network} lang={lang} />
        </div>
      )}

      {view === 'confirmEthTransaction' && pendingTransaction && feeChoice && (
        <div className="page">
          <PageHeader title={t('confirmTransaction')} />
          <div className="card center">
            <div className="text-muted" style={{ fontSize: 12 }}>{t('send')}</div>
            <div className="balance-amount" style={{ fontSize: 28 }}>
              {pendingTransaction.amount}<span className="sym" style={{ fontSize: 14 }}>{nativeSymbol}</span>
            </div>
            {usdHint(pendingTransaction.amount, nativePrice)}
          </div>
          <div className="card">
            <div className="kv"><span className="k">{t('from')}</span><span className="v mono">{shortAddress(walletInfo?.address)}</span></div>
            <div className="kv"><span className="k">{t('to')}</span><span className="v mono">{pendingTransaction.to}</span></div>
            <div className="kv"><span className="k">{t('network')}</span><span className="v">{currentNetwork?.name}</span></div>
          </div>
          {renderFeeCard(pendingTransaction.amount)}
          <div className="footer-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setView('send');
                setPendingTransaction(null);
                resetFee();
              }}
            >
              {t('reject')}
            </button>
            <button className="btn btn-primary" onClick={handleConfirmEthTransaction} disabled={sending}>
              {sending && <span className="spinner" />}
              {sending ? t('sending') : t('confirm')}
            </button>
          </div>
        </div>
      )}

      {view === 'confirmTokenTransaction' && pendingTransaction && feeChoice && pendingTransaction.token && (
        <div className="page">
          <PageHeader title={t('confirmTransaction')} />
          <div className="card center">
            <div className="text-muted" style={{ fontSize: 12 }}>{t('send')}</div>
            <div className="balance-amount" style={{ fontSize: 28 }}>
              {pendingTransaction.amount}<span className="sym" style={{ fontSize: 14 }}>{pendingTransaction.token.symbol}</span>
            </div>
            {usdHint(pendingTransaction.amount, tokenPrice(pendingTransaction.token.address))}
            <div className="text-muted" style={{ fontSize: 12 }}>{pendingTransaction.token.name}</div>
          </div>
          <div className="card">
            <div className="kv"><span className="k">{t('from')}</span><span className="v mono">{shortAddress(walletInfo?.address)}</span></div>
            <div className="kv"><span className="k">{t('to')}</span><span className="v mono">{pendingTransaction.to}</span></div>
            <div className="kv"><span className="k">{t('network')}</span><span className="v">{currentNetwork?.name}</span></div>
          </div>
          {renderFeeCard()}
          <div className="footer-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setView('sendToken');
                setPendingTransaction(null);
                resetFee();
              }}
            >
              {t('reject')}
            </button>
            <button className="btn btn-primary" onClick={handleConfirmTokenTransaction} disabled={sendingToken}>
              {sendingToken && <span className="spinner" />}
              {sendingToken ? t('sending') : t('confirm')}
            </button>
          </div>
        </div>
      )}

      {view === 'authorize' && pendingAuth && (
        <div className="page">
          <PageHeader title={tr('Connection request', '连接请求')} />
          <div className="card site-badge">
            <div className="site-icon">{(currentSite || '?').slice(0, 1).toUpperCase()}</div>
            <div className="site-host">{currentSite}</div>
            <span className="text-muted" style={{ fontSize: 12 }}>{tr('wants to connect to your wallet', '请求连接你的钱包')}</span>
          </div>
          <div className="card">
            <p className="card-title">{tr('This site will be able to', '该网站将可以')}</p>
            <div className="kv"><span className="k">✓ {tr('See your address', '查看你的地址')}</span><span className="v mono">{shortAddress(walletInfo?.address)}</span></div>
            <div className="kv"><span className="k">✓ {tr('Request transactions', '请求发起交易')}</span><span className="v" /></div>
          </div>
          <div className="alert alert-warning">
            <Icon name="warning" size={16} />
            <span>{tr('Only connect to sites you trust.', '仅连接你信任的网站。')}</span>
          </div>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={() => handleAuthorize(false)}>{t('reject')}</button>
            <button className="btn btn-primary" onClick={() => handleAuthorize(true)}>{tr('Connect', '连接')}</button>
          </div>
        </div>
      )}

      {view === 'signTransaction' && pendingSignature && (
        <div className="page">
          <PageHeader title={tr('Signature request', '签名请求')} />
          <div className="card site-badge" style={{ padding: '14px 12px' }}>
            <div className="site-icon">{(currentSite || '?').slice(0, 1).toUpperCase()}</div>
            {currentSite && <div className="site-host">{currentSite}</div>}
            <span className="chip">{pendingSignature.request.method}</span>
          </div>

          {pendingSignature.request.method === 'eth_sendTransaction' && (
            <div className="card">
              <p className="card-title">{t('transactionDetails')}</p>
              <div className="kv"><span className="k">{t('to')}</span><span className="v mono">{pendingSignature.request.params[0].to}</span></div>
              <div className="kv total">
                <span className="k">{t('value')}</span>
                <span className="v">{formatWeiValue(pendingSignature.request.params[0].value)} {nativeSymbol}</span>
              </div>
              <div className="kv"><span className="k">{t('gasLimit')}</span><span className="v mono">{pendingSignature.request.params[0].gasLimit || pendingSignature.request.params[0].gas || 'Auto'}</span></div>
              {pendingSignature.request.params[0].data && pendingSignature.request.params[0].data !== '0x' && (
                <div style={{ marginTop: 8 }}>
                  <div className="field-label" style={{ marginBottom: 6 }}>Data</div>
                  <div className="code-box">{pendingSignature.request.params[0].data}</div>
                </div>
              )}
            </div>
          )}

          {pendingSignature.request.method !== 'eth_sendTransaction' && (
            <div className="card">
              <p className="card-title">{tr('Message', '消息内容')}</p>
              <div className="code-box">
                {typeof pendingSignature.request.params[0] === 'string'
                  ? pendingSignature.request.params[0]
                  : JSON.stringify(pendingSignature.request.params, null, 2)}
              </div>
            </div>
          )}

          <div className="alert alert-warning">
            <Icon name="warning" size={16} />
            <span>{tr('Review the details carefully before signing.', '请仔细检查详情，确认无误后再签名。')}</span>
          </div>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={() => handleSignTransaction(false)} disabled={isSigningPending}>
              {t('reject')}
            </button>
            <button className="btn btn-primary" onClick={() => handleSignTransaction(true)} disabled={isSigningPending}>
              {isSigningPending && <span className="spinner" />}
              {isSigningPending ? tr('Signing…', '签名中…') : tr('Sign', '签名')}
            </button>
          </div>
        </div>
      )}

      {isSigningPending && <LoadingSpinner message={tr('Signing, please wait…', '正在签名，请稍候…')} />}
      {toast && <div className="toast">{toast}</div>}
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
        <div className="app" style={{ padding: 16 }}>
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
