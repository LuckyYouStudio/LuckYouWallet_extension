// LuckYou Wallet Web3 Provider
// 使用方法：在网页中引入此脚本，然后调用 connectToLuckYouWallet()

(function() {
  'use strict';

  console.log('[LuckYou Wallet] Web3 Provider loaded');

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
      // 检查是否已连接
      if (!this.isConnected()) {
        throw new Error('Wallet not connected. Please call connectToLuckYouWallet() first.');
      }

      // 模拟请求处理
      switch (requestArguments.method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [this.selectedAddress];
        
        case 'eth_chainId':
          return this.chainId || '0x1';
        
        case 'net_version':
          return this.networkVersion || '1';
        
        case 'eth_getBalance':
          // 这里可以调用实际的RPC
          return '0x0';
        
        case 'personal_sign':
        case 'eth_signTypedData_v4':
        case 'eth_sendTransaction':
          // 这些需要用户确认，暂时返回错误
          throw new Error('This method requires user confirmation. Please implement proper UI.');
        
        default:
          throw new Error(`Method ${requestArguments.method} not supported`);
      }
    },

    // 启用（兼容MetaMask）
    async enable() {
      return this.requestAccounts();
    },

    // 自动刷新
    autoRefreshOnNetworkChange: true
  };

  // 注入到window对象
  Object.defineProperty(window, 'ethereum', {
    value: ethereum,
    writable: false,
    configurable: false
  });

  // 连接函数
  window.connectToLuckYouWallet = async function() {
    try {
      // 检查是否有LuckYou Wallet扩展
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('LuckYou Wallet extension not found. Please install the extension first.');
      }

      // 尝试与扩展通信
      const response = await chrome.runtime.sendMessage({
        type: 'GET_WALLET_INFO'
      });

      if (response && response.address) {
        ethereum.selectedAddress = response.address;
        ethereum.chainId = response.chainId || '0x1';
        ethereum.networkVersion = response.networkVersion || '1';
        
        // 触发连接事件
        ethereum._emit('connect', { chainId: ethereum.chainId });
        ethereum._emit('accountsChanged', [ethereum.selectedAddress]);
        
        console.log('[LuckYou Wallet] Connected successfully');
        return {
          success: true,
          address: ethereum.selectedAddress,
          chainId: ethereum.chainId
        };
      } else {
        throw new Error('No wallet found. Please create or import a wallet in the extension.');
      }
    } catch (error) {
      console.error('[LuckYou Wallet] Connection failed:', error);
      throw error;
    }
  };

  // 触发provider检测事件
  window.dispatchEvent(new Event('ethereum#initialized'));

  console.log('[LuckYou Wallet] Provider injected successfully');
})();
