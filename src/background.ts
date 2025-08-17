// Background Script - 处理消息传递
console.log('[LuckYou Wallet] Background script loaded');

// 存储待处理的请求
const pendingRequests = new Map();

// 静态导入钱包核心模块
import * as walletModule from './core/wallet';

async function getWalletModule() {
  console.log('[LuckYou Wallet] Wallet module available');
  return walletModule;
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LuckYou Wallet] Background received message:', message);

  if (message.type === 'PROVIDER_REQUEST') {
    handleProviderRequest(message.data, sender.tab?.id)
      .then(() => {
        console.log('[LuckYou Wallet] Provider request handled successfully');
        // 不调用sendResponse，因为我们通过sendResponseToProvider发送响应
      })
      .catch((error) => {
        console.error('[LuckYou Wallet] Error handling provider request:', error);
        // 发送错误响应给provider
        sendErrorToProvider(message.data.id, {
          code: -32603,
          message: error.message || 'Internal error'
        });
      });
    return true; // 保持消息通道开放
  }

  if (message.type === 'POPUP_RESPONSE') {
    handlePopupResponse(message);
    sendResponse({ success: true }); // 确认收到popup响应
    return false; // 同步响应
  }

  if (message.type === 'CLOSE_POPUP_REQUEST') {
    // 处理 popup 关闭请求
    console.log('[LuckYou Wallet] Received CLOSE_POPUP_REQUEST, attempting to close popup');
    try {
      // 尝试关闭 popup - 注意：Chrome API 中没有 closePopup 方法
      console.log('[LuckYou Wallet] Popup close requested, but Chrome API does not support closePopup');
      sendResponse({ success: true });
    } catch (error) {
      console.log('[LuckYou Wallet] Failed to close popup:', error);
      sendResponse({ success: false, error: error.message });
    }
    return false; // 同步响应
  }
  
  // 未知消息类型
  sendResponse({ error: 'Unknown message type' });
  return false;
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
      try {
        await requestTransactionSignature(requestId, request);
      } catch (error) {
        console.error('[LuckYou Wallet] Error in transaction signature request:', error);
        sendErrorToProvider(requestId, {
          code: -32603,
          message: 'Internal error during signature request'
        });
      }
      break;
      
    case 'eth_chainId':
    case 'net_version':
      // 直接返回当前网络信息
      const networkResponse = await getNetworkInfo();
      sendResponseToProvider(requestId, networkResponse.result);
      break;
      
    case 'eth_getBalance':
    case 'eth_blockNumber':
    case 'eth_gasPrice':
    case 'eth_call':
    case 'eth_estimateGas':
    case 'eth_getTransactionCount':
    case 'eth_getCode':
      // 直接调用RPC
      const rpcResponse = await callRPC(request);
      if (rpcResponse.error) {
        sendErrorToProvider(requestId, rpcResponse.error);
      } else {
        sendResponseToProvider(requestId, rpcResponse.result);
      }
      break;
      
    case 'wallet_switchEthereumChain':
      // EIP-6963: 切换以太坊网络
      await handleSwitchEthereumChain(requestId, request, tabId);
      break;
      
    case 'wallet_addEthereumChain':
      // EIP-6963: 添加以太坊网络
      await handleAddEthereumChain(requestId, request, tabId);
      break;
      
    default:
      // 其他方法直接调用RPC
      const defaultResponse = await callRPC(request);
      if (defaultResponse.error) {
        sendErrorToProvider(requestId, defaultResponse.error);
      } else {
        sendResponseToProvider(requestId, defaultResponse.result);
      }
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
    // 已授权，直接返回账户 - 返回标准格式
    sendResponseToProvider(requestId, [walletData.address]);
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
      console.warn('[LuckYou Wallet] Wallet module not available, returning mainnet');
      return {
        jsonrpc: '2.0',
        result: '0x1' // 默认返回mainnet
      };
    }
    
    const currentNetwork = await wallet.getCurrentNetwork();
    console.log('[LuckYou Wallet] Current network from storage:', currentNetwork);
    
    const allNetworks = await wallet.getAllNetworks();
    const networkConfig = allNetworks[currentNetwork];
    
    if (!networkConfig) {
      console.warn('[LuckYou Wallet] Network config not found for:', currentNetwork);
      return {
        jsonrpc: '2.0',
        result: '0x1' // 默认返回mainnet
      };
    }
    
    const chainIdHex = networkConfig.chainId.toString(16);
    const result = chainIdHex.startsWith('0x') ? chainIdHex : '0x' + chainIdHex;
    
    console.log('[LuckYou Wallet] Returning chain ID:', result, 'for network:', networkConfig.name);
    
    return {
      jsonrpc: '2.0',
      result: result
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
    console.log('[LuckYou Wallet] RPC call - current network:', currentNetwork);
    
    const allNetworks = await wallet.getAllNetworks();
    const networkConfig = allNetworks[currentNetwork];
    
    if (!networkConfig) {
      throw new Error(`Network config not found for: ${currentNetwork}`);
    }
    
    console.log('[LuckYou Wallet] RPC call to:', networkConfig.rpcUrl);
    console.log('[LuckYou Wallet] RPC request:', request);
    
    // 构造标准的 JSON-RPC 请求
    const rpcRequest = {
      jsonrpc: '2.0',
      id: request.id || 1,
      method: request.method,
      params: request.params || []
    };
    
    const response = await fetch(networkConfig.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('[LuckYou Wallet] RPC response:', result);
    
    return result;
  } catch (error) {
    console.error('[LuckYou Wallet] RPC call failed:', error);
    return {
      jsonrpc: '2.0',
      id: request.id || 1,
      error: {
        code: -32603,
        message: `RPC call failed: ${error.message}`
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
  console.log('[LuckYou Wallet] Sending response to provider:', requestId, response);
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'LUCKYOU_WALLET_RESPONSE',
          id: requestId,
          result: response
        }).catch((error) => {
          console.warn('[LuckYou Wallet] Failed to send message to tab:', tab.id, error);
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
  try {
    // 存储授权请求
    await chrome.storage.local.set({
      pendingAuth: {
        requestId,
        tabId,
        type: 'authorization',
        timestamp: Date.now()
      }
    });
    
    console.log('[LuckYou Wallet] Opening popup for authorization, requestId:', requestId);
    
    // 尝试打开popup
    try {
      await chrome.action.openPopup();
      console.log('[LuckYou Wallet] Popup opened successfully');
    } catch (popupError) {
      console.warn('[LuckYou Wallet] Failed to open popup automatically:', popupError);
      
      // 如果自动打开失败，尝试通过通知提醒用户
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon48.png'),
          title: 'LuckYou Wallet',
          message: '网站请求连接钱包，请点击扩展图标进行授权'
        });
        console.log('[LuckYou Wallet] Notification created to remind user');
      } catch (notificationError) {
        console.error('[LuckYou Wallet] Failed to create notification:', notificationError);
      }
    }
  } catch (error) {
    console.error('[LuckYou Wallet] Error in openPopupForAuthorization:', error);
  }
}

// 打开popup进行签名
async function openPopupForSignature(requestId: string, request: any) {
  try {
    // 存储签名请求
    await chrome.storage.local.set({
      pendingSignature: {
        requestId,
        request,
        type: 'signature',
        timestamp: Date.now()
      }
    });
    
    console.log('[LuckYou Wallet] Opening popup for signature, requestId:', requestId, 'method:', request.method);
    
    // 尝试打开popup
    try {
      await chrome.action.openPopup();
      console.log('[LuckYou Wallet] Popup opened successfully for signature');
    } catch (popupError) {
      console.warn('[LuckYou Wallet] Failed to open popup automatically for signature:', popupError);
      
      // 如果自动打开失败，尝试通过通知提醒用户
      try {
        const methodName = request.method === 'eth_sendTransaction' ? '交易' : 
                          request.method === 'personal_sign' ? '消息签名' : 
                          request.method === 'eth_signTypedData_v4' ? '类型化数据签名' : '操作';
        
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon48.png'),
          title: 'LuckYou Wallet',
          message: `网站请求${methodName}，请点击扩展图标进行确认`
        });
        console.log('[LuckYou Wallet] Notification created to remind user for signature');
      } catch (notificationError) {
        console.error('[LuckYou Wallet] Failed to create notification for signature:', notificationError);
      }
    }
  } catch (error) {
    console.error('[LuckYou Wallet] Error in openPopupForSignature:', error);
  }
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

// EIP-6963: 处理切换以太坊网络请求
async function handleSwitchEthereumChain(requestId: string, request: any, tabId?: number) {
  try {
    const { chainId } = request.params[0];
    console.log('[LuckYou Wallet] Switching to chain:', chainId);
    
    // 获取钱包模块
    const walletModule = await getWalletModule();
    if (!walletModule) {
      sendErrorToProvider(requestId, {
        code: -32603,
        message: 'Failed to load wallet module'
      });
      return;
    }
    
    // 检查是否支持该网络
    const allNetworks = await walletModule.getAllNetworks();
    console.log('[LuckYou Wallet] Available networks:', Object.keys(allNetworks));
    console.log('[LuckYou Wallet] Looking for chain ID:', chainId);
    
    // 转换链ID为数字进行比较
    const targetChainId = typeof chainId === 'string' ? 
      (chainId.startsWith('0x') ? parseInt(chainId, 16) : parseInt(chainId)) : 
      chainId;
    
    console.log('[LuckYou Wallet] Target chain ID (parsed):', targetChainId);
    
    const targetNetwork = Object.values(allNetworks).find((network: any) => {
      console.log('[LuckYou Wallet] Checking network:', network.name, 'chain ID:', network.chainId);
      return network.chainId === targetChainId;
    });
    
    if (!targetNetwork) {
      // 网络不存在，返回错误
      sendErrorToProvider(requestId, {
        code: 4902, // 标准错误码：网络不存在
        message: 'Unrecognized chain ID. Try adding the chain first.'
      });
      return;
    }
    
    // 找到网络的键名
    const networkKey = Object.keys(allNetworks).find(key => 
      allNetworks[key].chainId === targetChainId
    );
    
    if (!networkKey) {
      throw new Error('Network key not found');
    }
    
    console.log('[LuckYou Wallet] Switching to network key:', networkKey);
    
    // 切换到目标网络
    await walletModule.setCurrentNetwork(networkKey);
    
    // 返回成功响应
    sendResponseToProvider(requestId, null);
      
    console.log('[LuckYou Wallet] Successfully switched to chain:', chainId);
    
  } catch (error) {
    console.error('[LuckYou Wallet] Error switching chain:', error);
    sendErrorToProvider(requestId, {
      code: -32603,
      message: 'Internal error while switching chain'
    });
  }
}

// EIP-6963: 处理添加以太坊网络请求
async function handleAddEthereumChain(requestId: string, request: any, tabId?: number) {
  try {
    const chainInfo = request.params[0];
    console.log('[LuckYou Wallet] Adding new chain:', chainInfo);
    
    // 验证链信息
    if (!chainInfo.chainId || !chainInfo.chainName || !chainInfo.rpcUrls || !chainInfo.nativeCurrency) {
      sendErrorToProvider(requestId, {
        code: -32602,
        message: 'Invalid parameters: missing required chain information'
      });
      return;
    }
    
    // 解析链ID
    let chainId: number;
    if (typeof chainInfo.chainId === 'string') {
      if (chainInfo.chainId.startsWith('0x')) {
        chainId = parseInt(chainInfo.chainId.slice(2), 16);
      } else {
        chainId = parseInt(chainInfo.chainId);
      }
    } else {
      chainId = chainInfo.chainId;
    }
    
    // 获取钱包模块
    const walletModule = await getWalletModule();
    if (!walletModule) {
      sendErrorToProvider(requestId, {
        code: -32603,
        message: 'Failed to load wallet module'
      });
      return;
    }
    
    // 检查链ID是否已存在
    const allNetworks = await walletModule.getAllNetworks();
    const existingNetwork = Object.values(allNetworks).find((network: any) => 
      network.chainId === chainId
    );
    
    if (existingNetwork) {
      // 链已存在，返回成功
      sendResponseToProvider(requestId, null);
      return;
    }
    
    // 验证RPC URL
    try {
      const isValid = await walletModule.validateNetwork(chainInfo.rpcUrls[0], chainId);
      if (!isValid) {
        sendErrorToProvider(requestId, {
          code: -32602,
          message: 'Invalid RPC URL or chain ID mismatch'
        });
        return;
      }
    } catch (validationError) {
      sendErrorToProvider(requestId, {
        code: -32602,
        message: 'Failed to validate network'
      });
      return;
    }
    
    // 添加新网络
    await walletModule.addCustomNetwork({
      name: chainInfo.chainName,
      rpcUrl: chainInfo.rpcUrls[0],
      chainId: chainId,
      currencySymbol: chainInfo.nativeCurrency.symbol,
      blockExplorer: chainInfo.blockExplorerUrls ? chainInfo.blockExplorerUrls[0] : undefined
    });
    
    // 返回成功响应
    sendResponseToProvider(requestId, null);
    
    console.log('[LuckYou Wallet] Successfully added new chain:', chainInfo.chainName);
    
  } catch (error) {
    console.error('[LuckYou Wallet] Error adding chain:', error);
    sendErrorToProvider(requestId, {
      code: -32603,
      message: 'Internal error while adding chain'
    });
  }
}
