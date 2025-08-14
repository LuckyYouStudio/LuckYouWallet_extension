// Content Script - 注入到网页中
console.log('[LuckYou Wallet] Content script loaded');

// 创建并注入provider脚本
const script = document.createElement('script');
script.src = chrome.runtime.getURL('provider.js');
script.onload = () => {
  console.log('[LuckYou Wallet] Provider script injected');
  script.remove();
};
(document.head || document.documentElement).appendChild(script);

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

    // 发送响应回provider
    window.postMessage({
      type: 'LUCKYOU_WALLET_RESPONSE',
      id: event.data.id,
      result: response
    }, '*');

  } catch (error) {
    console.error('[LuckYou Wallet] Error handling provider request:', error);
    
    // 发送错误响应
    window.postMessage({
      type: 'LUCKYOU_WALLET_RESPONSE',
      id: event.data.id,
      error: {
        code: -32603,
        message: error.message || 'Internal error'
      }
    }, '*');
  }
});

// 通知provider扩展已准备就绪
window.postMessage({
  type: 'LUCKYOU_WALLET_READY'
}, '*');
