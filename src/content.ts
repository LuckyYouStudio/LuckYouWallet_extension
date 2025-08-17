// Content Script - 注入到网页中
console.log('[LuckYou Wallet] Content script loaded');

// 直接注入 provider 代码，避免 Chrome API 访问问题
function injectProviderInline() {
  try {
    // 检查是否已经注入过
    if (window.ethereum && window.ethereum.isLuckYouWallet) {
      console.log('[LuckYou Wallet] Provider already exists');
      return;
    }
    
    // 检查是否已经注入过 luckyouWallet
    if (window.luckyouWallet && window.luckyouWallet.isLuckYouWallet) {
      console.log('[LuckYou Wallet] LuckYou Wallet provider already exists');
      return;
    }

    // 直接创建 provider 对象，避免内联脚本
    let requestId = 0;
    const pendingRequests = new Map();
    
    function generateId() {
      return ++requestId;
    }

    // 创建以太坊provider
    const ethereum = {
      // 基本属性
      isMetaMask: false,
      isLuckYouWallet: true,
      isEIP6963: true, // EIP-6963 支持标识
      networkVersion: null,
      chainId: null,
      selectedAddress: null,
      isConnected: () => false,

      // 事件监听器
      _eventListeners: {} as Record<string, any[]>,

      // 添加事件监听器
      on(eventName: string, listener: any) {
        if (!this._eventListeners[eventName]) {
          this._eventListeners[eventName] = [];
        }
        this._eventListeners[eventName].push(listener);
      },

      // 移除事件监听器
      removeListener(eventName: string, listener: any) {
        if (this._eventListeners[eventName]) {
          const index = this._eventListeners[eventName].indexOf(listener);
          if (index > -1) {
            this._eventListeners[eventName].splice(index, 1);
          }
        }
      },

      // 触发事件
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
      async sendTransaction(transactionParameters: any) {
        return this.request({
          method: 'eth_sendTransaction',
          params: [transactionParameters]
        });
      },

      // 签名消息
      async signMessage(message: any, address: any) {
        return this.request({
          method: 'personal_sign',
          params: [message, address]
        });
      },

      // 签名类型化数据
      async signTypedData(typedData: any, address: any) {
        return this.request({
          method: 'eth_signTypedData_v4',
          params: [address, JSON.stringify(typedData)]
        });
      },

      // EIP-6963: 切换以太坊网络
      async wallet_switchEthereumChain(params: any) {
        const { chainId } = params[0];
        return this.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId }]
        });
      },

      // EIP-6963: 添加以太坊网络
      async wallet_addEthereumChain(params: any) {
        const chainInfo = params[0];
        return this.request({
          method: 'wallet_addEthereumChain',
          params: [chainInfo]
        });
      },

      // 通用请求方法
      async request(requestArguments: any) {
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
      async requestBatch(requests: any) {
        const promises = requests.map((request: any) => this.request(request));
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

    // 使用 script 标签加载注入脚本
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      script.onload = () => {
        console.log('[LuckYou Wallet] Injection script loaded successfully');
        script.remove();
      };
      script.onerror = (error) => {
        console.error('[LuckYou Wallet] Failed to load injection script:', error);
      };
      
      (document.head || document.documentElement).appendChild(script);
      console.log('[LuckYou Wallet] Injection script element added to page');
      
    } catch (error) {
      console.error('[LuckYou Wallet] Error loading injection script:', error);
    }

    // 触发provider检测事件
    window.dispatchEvent(new Event('ethereum#initialized'));

    // 确保 Web3 应用能检测到钱包
    setTimeout(() => {
      window.dispatchEvent(new Event('ethereum#initialized'));
      console.log('[LuckYou Wallet] Provider detection events triggered');
    }, 100);

    // EIP-6963: 监听 provider 发现请求
    window.addEventListener('eip6963:requestProvider', (event: any) => {
      console.log('[LuckYou Wallet] EIP-6963 provider discovery request received');
      
      // 回复 provider 信息
      if (event.detail && typeof event.detail.reply === 'function') {
        event.detail.reply({
          name: 'LuckYou Wallet',
          uuid: 'luckyou-wallet-extension',
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzAwN0JGRiIvPgo8cGF0aCBkPSJNMTYgOEwxOCAxMkwxNiAxNkwxNCAxMkwxNiA4WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTE2IDI0TDE4IDIwTDE2IDE2TDE0IDIwTDE2IDI0WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+',
          rdns: 'com.luckyou.wallet'
        });
      }
    });

    console.log('[LuckYou Wallet] Provider injected successfully');
    
    // 通知 provider 扩展已准备就绪
    setTimeout(() => {
      window.postMessage({
        type: 'LUCKYOU_WALLET_READY'
      }, '*');
    }, 100);
    
  } catch (error) {
    console.error('[LuckYou Wallet] Error injecting provider script:', error);
  }
}

// 立即注入，不等待 DOM 加载
injectProviderInline();

// 也监听 DOM 加载事件作为备用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[LuckYou Wallet] DOM loaded, checking if provider needs re-injection...');
    // 如果 luckyouWallet 不存在，重新注入
    if (!(window as any).luckyouWallet) {
      console.log('[LuckYou Wallet] Re-injecting provider after DOM load...');
      injectProviderInline();
    }
  });
}

// 监听来自provider的消息
window.addEventListener('message', async (event) => {
  // 只处理来自我们注入的provider的消息
  if (event.source !== window || !event.data || event.data.type !== 'LUCKYOU_WALLET_REQUEST') {
    return;
  }

  console.log('[LuckYou Wallet] Received request from provider:', event.data);

  try {
    // 转发请求到background script
    const response = await chrome.runtime.sendMessage({
      type: 'PROVIDER_REQUEST',
      data: event.data
    });

    // 只有在收到错误或立即可用的结果时才直接响应
    // 对于需要用户交互的请求（如eth_requestAccounts），等待background通过onMessage发送真正的响应
    if (response && (response.error || response.result !== undefined)) {
      console.log('[LuckYou Wallet] Sending immediate response:', response);
      window.postMessage({
        type: 'LUCKYOU_WALLET_RESPONSE',
        id: event.data.id,
        result: response.result || response,
        error: response.error
      }, '*');
    } else {
      console.log('[LuckYou Wallet] Waiting for background response via onMessage...');
      // 对于异步请求，不在这里响应，等待background的消息
    }

  } catch (error) {
    console.error('[LuckYou Wallet] Error handling provider request:', error);
    
    // 发送错误响应
    const errorMessage = error instanceof Error ? error.message : 'Internal error';
    window.postMessage({
      type: 'LUCKYOU_WALLET_RESPONSE',
      id: event.data.id,
      error: {
        code: -32603,
        message: errorMessage
      }
    }, '*');
  }
});

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LuckYou Wallet] Content script received message from background:', message);
  
  if (message.type === 'LUCKYOU_WALLET_RESPONSE') {
    // 转发响应给注入脚本
    window.postMessage({
      type: 'LUCKYOU_WALLET_RESPONSE',
      id: message.id,
      result: message.result,
      error: message.error
    }, '*');
  }
});

// 确保扩展被检测到
console.log('[LuckYou Wallet] Content script ready, provider injection initiated');
