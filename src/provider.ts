// Ethereum Provider - 注入到网页中
(function() {
  'use strict';

  console.log('[LuckYou Wallet] Provider script loaded');

  // 生成唯一ID
  let requestId = 0;
  function generateId() {
    return ++requestId;
  }

  // 存储待处理的请求
  const pendingRequests = new Map();

  // 检查是否已存在ethereum对象
  if (window.ethereum) {
    console.log('[LuckYou Wallet] Ethereum provider already exists');
    return;
  }

  // 创建以太坊provider
  const ethereum = {
    // 基本属性
    isMetaMask: false,
    isLuckYouWallet: true,
    networkVersion: null,
    chainId: null,
    selectedAddress: null,
    isConnected: () => false,

    // 事件监听器
    _events: {},
    _eventListeners: {},

    // 添加事件监听器
    on(eventName, listener) {
      if (!this._eventListeners[eventName]) {
        this._eventListeners[eventName] = [];
      }
      this._eventListeners[eventName].push(listener);
    },

    // 移除事件监听器
    removeListener(eventName, listener) {
      if (this._eventListeners[eventName]) {
        const index = this._eventListeners[eventName].indexOf(listener);
        if (index > -1) {
          this._eventListeners[eventName].splice(index, 1);
        }
      }
    },

    // 触发事件
    _emit(eventName, ...args) {
      if (this._eventListeners[eventName]) {
        this._eventListeners[eventName].forEach(listener => {
          try {
            listener(...args);
          } catch (error) {
            console.error('[LuckYou Wallet] Event listener error:', error);
          }
        });
      }
    },

    // 请求账户
    async requestAccounts() {
      return this.request({ method: 'eth_requestAccounts' });
    },

    // 获取账户
    async getAccounts() {
      return this.request({ method: 'eth_accounts' });
    },

    // 获取链ID
    async getChainId() {
      return this.request({ method: 'eth_chainId' });
    },

    // 获取网络版本
    async getNetworkVersion() {
      return this.request({ method: 'net_version' });
    },

    // 发送交易
    async sendTransaction(transactionParameters) {
      return this.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters]
      });
    },

    // 签名消息
    async signMessage(message, address) {
      return this.request({
        method: 'personal_sign',
        params: [message, address]
      });
    },

    // 签名类型化数据
    async signTypedData(typedData, address) {
      return this.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)]
      });
    },

    // 通用请求方法
    async request(requestArguments) {
      const id = generateId();
      
      return new Promise((resolve, reject) => {
        // 存储请求信息
        pendingRequests.set(id, { resolve, reject });

        // 发送请求到content script
        window.postMessage({
          type: 'LUCKYOU_WALLET_REQUEST',
          id,
          ...requestArguments
        }, '*');

        // 设置超时
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 30000); // 30秒超时
      });
    },

    // 批量请求
    async requestBatch(requests) {
      const promises = requests.map(request => this.request(request));
      return Promise.all(promises);
    },

    // 启用（兼容MetaMask）
    async enable() {
      return this.requestAccounts();
    },

    // 自动刷新
    autoRefreshOnNetworkChange: true
  };

  // 监听来自content script的响应
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'LUCKYOU_WALLET_RESPONSE') {
      return;
    }

    const { id, result, error } = event.data;
    
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);

      if (error) {
        reject(new Error(error.message || 'Request failed'));
      } else {
        resolve(result);
      }
    }
  });

  // 监听扩展就绪消息
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'LUCKYOU_WALLET_READY') {
      return;
    }

    console.log('[LuckYou Wallet] Extension ready');
    
    // 初始化网络信息
    ethereum.getChainId().then(chainId => {
      ethereum.chainId = chainId;
      ethereum._emit('chainChanged', chainId);
    }).catch(console.error);

    ethereum.getNetworkVersion().then(networkVersion => {
      ethereum.networkVersion = networkVersion;
      ethereum._emit('networkChanged', networkVersion);
    }).catch(console.error);

    // 检查是否已有连接的账户
    ethereum.getAccounts().then(accounts => {
      if (accounts && accounts.length > 0) {
        ethereum.selectedAddress = accounts[0];
        ethereum._emit('accountsChanged', accounts);
        ethereum._emit('connect', { chainId: ethereum.chainId });
      }
    }).catch(console.error);
  });

  // 注入到window对象
  Object.defineProperty(window, 'ethereum', {
    value: ethereum,
    writable: false,
    configurable: false
  });

  // 触发provider检测事件
  window.dispatchEvent(new Event('ethereum#initialized'));

  console.log('[LuckYou Wallet] Provider injected successfully');
})();
