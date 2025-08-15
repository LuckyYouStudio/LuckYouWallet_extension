// Background Script - 处理消息传递
console.log('[LuckYou Wallet] Background script loaded');

// 存储待处理的请求
const pendingRequests = new Map();

// 动态导入钱包核心模块
let walletModule: any = null;

async function getWalletModule() {
  if (!walletModule) {
    try {
      walletModule = await import('./core/wallet');
    } catch (error) {
      console.error('[LuckYou Wallet] Failed to load wallet module:', error);
      return null;
    }
  }
  return walletModule;
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LuckYou Wallet] Background received message:', message);

  if (message.type === 'PROVIDER_REQUEST') {
    handleProviderRequest(message.data, sender.tab?.id);
    return true; // 保持消息通道开放
  }

  if (message.type === 'POPUP_RESPONSE') {
    handlePopupResponse(message);
    return true;
  }
});

// 处理来自provider的请求
async function handleProviderRequest(request: any, tabId?: number) {
  const requestId = request.id;
  
  console.log('[LuckYou Wallet] Handling provider request:', request);

  // 存储请求信息
  pendingRequests.set(requestId, {
    request,
    tabId,
    timestamp: Date.now()
  });

  // 清理过期的请求（5分钟后）
  setTimeout(() => {
    pendingRequests.delete(requestId);
  }, 5 * 60 * 1000);

  // 根据请求类型处理
  switch (request.method) {
    case 'eth_requestAccounts':
    case 'eth_accounts':
      // 需要用户确认连接
      await requestAccountAccess(requestId, tabId);
      break;
      
    case 'eth_sendTransaction':
    case 'personal_sign':
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4':
      // 需要用户签名
      await requestTransactionSignature(requestId, request);
      break;
      
    case 'eth_chainId':
    case 'net_version':
      // 直接返回当前网络信息
      const response = await getNetworkInfo();
      sendResponseToProvider(requestId, response);
      break;
      
    case 'eth_getBalance':
    case 'eth_blockNumber':
    case 'eth_gasPrice':
      // 直接调用RPC
      const rpcResponse = await callRPC(request);
      sendResponseToProvider(requestId, rpcResponse);
      break;
      
    default:
      // 其他方法直接调用RPC
      const defaultResponse = await callRPC(request);
      sendResponseToProvider(requestId, defaultResponse);
      break;
  }
}

// 请求账户访问权限
async function requestAccountAccess(requestId: string, tabId?: number) {
  // 检查是否已有钱包
  const walletData = await getWalletData();
  
  if (!walletData) {
    sendErrorToProvider(requestId, {
      code: -32001,
      message: 'No wallet found. Please create or import a wallet first.'
    });
    return;
  }

  // 检查是否已授权
  const authorized = await checkAuthorization(tabId);
  
  if (authorized) {
    // 已授权，直接返回账户
    const response = {
      jsonrpc: '2.0',
      id: requestId,
      result: [walletData.address]
    };
    sendResponseToProvider(requestId, response);
  } else {
    // 需要用户确认，打开popup
    await openPopupForAuthorization(requestId, tabId);
  }
}

// 请求交易签名
async function requestTransactionSignature(requestId: string, request: any) {
  // 检查是否已有钱包
  const walletData = await getWalletData();
  
  if (!walletData) {
    sendErrorToProvider(requestId, {
      code: -32001,
      message: 'No wallet found. Please create or import a wallet first.'
    });
    return;
  }

  // 打开popup进行签名确认
  await openPopupForSignature(requestId, request);
}

// 获取网络信息
async function getNetworkInfo() {
  try {
    const wallet = await getWalletModule();
    if (!wallet) {
      return {
        jsonrpc: '2.0',
        result: '0x1' // 默认返回mainnet
      };
    }
    
    const currentNetwork = await wallet.getCurrentNetwork();
    const allNetworks = await wallet.getAllNetworks();
    const networkConfig = allNetworks[currentNetwork];
    
    return {
      jsonrpc: '2.0',
      result: networkConfig.chainId
    };
  } catch (error) {
    console.error('[LuckYou Wallet] Error getting network info:', error);
    return {
      jsonrpc: '2.0',
      result: '0x1' // 默认返回mainnet
    };
  }
}

// 调用RPC
async function callRPC(request: any) {
  try {
    const wallet = await getWalletModule();
    if (!wallet) {
      throw new Error('Wallet module not available');
    }
    
    const currentNetwork = await wallet.getCurrentNetwork();
    const allNetworks = await wallet.getAllNetworks();
    const networkConfig = allNetworks[currentNetwork];
    
    const response = await fetch(networkConfig.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    return await response.json();
  } catch (error) {
    console.error('[LuckYou Wallet] RPC call failed:', error);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: 'RPC call failed'
      }
    };
  }
}

// 处理popup的响应
function handlePopupResponse(message: any) {
  const { requestId, result, error } = message;
  
  if (error) {
    sendErrorToProvider(requestId, error);
  } else {
    sendResponseToProvider(requestId, result);
  }
  
  // 清理请求
  pendingRequests.delete(requestId);
}

// 发送响应给provider
function sendResponseToProvider(requestId: string, response: any) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'LUCKYOU_WALLET_RESPONSE',
          id: requestId,
          result: response
        }).catch(() => {
          // 忽略错误，可能tab不存在
        });
      }
    });
  });
}

// 发送错误给provider
function sendErrorToProvider(requestId: string, error: any) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'LUCKYOU_WALLET_RESPONSE',
          id: requestId,
          error
        }).catch(() => {
          // 忽略错误，可能tab不存在
        });
      }
    });
  });
}

// 打开popup进行授权
async function openPopupForAuthorization(requestId: string, tabId?: number) {
  // 存储授权请求
  await chrome.storage.local.set({
    pendingAuth: {
      requestId,
      tabId,
      type: 'authorization',
      timestamp: Date.now()
    }
  });
  
  // 打开popup
  chrome.action.openPopup();
}

// 打开popup进行签名
async function openPopupForSignature(requestId: string, request: any) {
  // 存储签名请求
  await chrome.storage.local.set({
    pendingSignature: {
      requestId,
      request,
      type: 'signature',
      timestamp: Date.now()
    }
  });
  
  // 打开popup
  chrome.action.openPopup();
}

// 获取钱包数据
async function getWalletData() {
  try {
    // 首先尝试从 chrome.storage.local 获取
    const result = await chrome.storage.local.get('wallet_session');
    if (result.wallet_session) {
      const walletSession = JSON.parse(result.wallet_session);
      return walletSession.info;
    }
    
    // 如果 chrome.storage.local 中没有，尝试从 localStorage 获取
    // 注意：background script 无法直接访问 localStorage，需要通过 content script
    console.log('[LuckYou Wallet] No wallet found in chrome.storage.local, checking localStorage...');
    
    // 返回 null，让 content script 处理
    return null;
  } catch (error) {
    console.error('[LuckYou Wallet] Error getting wallet data:', error);
    return null;
  }
}

// 检查是否已授权
async function checkAuthorization(tabId?: number) {
  try {
    const result = await chrome.storage.local.get('authorizedSites');
    const authorizedSites = result.authorizedSites || {};
    
    if (tabId) {
      const tab = await chrome.tabs.get(tabId);
      const hostname = new URL(tab.url || '').hostname;
      return authorizedSites[hostname] || false;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}
