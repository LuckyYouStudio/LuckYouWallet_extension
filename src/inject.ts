// 注入脚本 - 在主页面环境中执行
(function() {
  // 检查是否已经注入过
  if (window.luckyouWallet && window.luckyouWallet.isLuckYouWallet) {
    console.log('[LuckYou Wallet] Provider already exists in main world');
    return;
  }
  
  // 创建 provider 对象
  let requestId = 0;
  const pendingRequests = new Map();
  
  function generateId() {
    return ++requestId;
  }
  
  const ethereum = {
    isMetaMask: false,
    isLuckYouWallet: true,
    networkVersion: null,
    chainId: null,
    selectedAddress: null,
    isConnected: () => false,
    
    _eventListeners: {},
    
    on(eventName: string, listener: any) {
      if (!this._eventListeners[eventName]) {
        this._eventListeners[eventName] = [];
      }
      this._eventListeners[eventName].push(listener);
    },
    
    removeListener(eventName: string, listener: any) {
      if (this._eventListeners[eventName]) {
        const index = this._eventListeners[eventName].indexOf(listener);
        if (index > -1) {
          this._eventListeners[eventName].splice(index, 1);
        }
      }
    },
    
    _emit(eventName: string, ...args: any[]) {
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
    
    async requestAccounts() {
      return this.request({ method: 'eth_requestAccounts' });
    },
    
    async getAccounts() {
      return this.request({ method: 'eth_accounts' });
    },
    
    async getChainId() {
      return this.request({ method: 'eth_chainId' });
    },
    
    async getNetworkVersion() {
      return this.request({ method: 'net_version' });
    },
    
    async sendTransaction(transactionParameters: any) {
      return this.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters]
      });
    },
    
    async signMessage(message: any, address: any) {
      return this.request({
        method: 'personal_sign',
        params: [message, address]
      });
    },
    
    async signTypedData(typedData: any, address: any) {
      return this.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)]
      });
    },
    
    async request(requestArguments: any) {
      const id = generateId();
      
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        
        window.postMessage({
          type: 'LUCKYOU_WALLET_REQUEST',
          id,
          ...requestArguments
        }, '*');
        
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      });
    },
    
    async requestBatch(requests: any) {
      const promises = requests.map((request: any) => this.request(request));
      return Promise.all(promises);
    },
    
    async enable() {
      return this.requestAccounts();
    },
    
    autoRefreshOnNetworkChange: true
  };
  
  // 监听来自 content script 的响应
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
        // 根据 JSON-RPC 规范，返回 result 字段
        resolve(result.result || result);
      }
    }
  });
  
  // 注入到主页面
  try {
    Object.defineProperty(window, 'luckyouWallet', {
      value: ethereum,
      writable: false,
      configurable: false
    });
    console.log('[LuckYou Wallet] LuckYou Wallet injected as window.luckyouWallet in main world');
  } catch (error) {
    (window as any).luckyouWallet = ethereum;
    console.log('[LuckYou Wallet] LuckYou Wallet set as window.luckyouWallet in main world (direct assignment)');
  }
  
  // 只有在没有其他 ethereum provider 时才注入到 ethereum
  if (!(window as any).ethereum) {
    try {
      Object.defineProperty(window, 'ethereum', {
        value: ethereum,
        writable: false,
        configurable: false
      });
      console.log('[LuckYou Wallet] LuckYou Wallet also injected as window.ethereum in main world');
    } catch (error) {
      (window as any).ethereum = ethereum;
      console.log('[LuckYou Wallet] LuckYou Wallet set as window.ethereum in main world (direct assignment)');
    }
  } else {
    console.log('[LuckYou Wallet] Keeping existing ethereum provider in main world, LuckYou Wallet available as window.luckyouWallet');
  }
  
  // 触发事件
  window.dispatchEvent(new Event('ethereum#initialized'));
  
  setTimeout(() => {
    window.dispatchEvent(new Event('ethereum#initialized'));
    console.log('[LuckYou Wallet] Provider detection events triggered in main world');
  }, 100);
  
  console.log('[LuckYou Wallet] Provider injected successfully in main world');
})();
