# 钱包检测问题修复总结

## 问题描述

用户反映 Web 端找不到钱包，这通常是因为 Web3 Provider 没有正确注入到网页中，导致 Web3 应用无法检测到钱包扩展。

## 问题原因

1. **Provider 注入时机问题**: Content script 可能在 DOM 准备好之前就尝试注入 provider
2. **注入方式不当**: Provider 脚本可能没有正确添加到 DOM 中
3. **检测事件缺失**: 缺少必要的检测事件来通知 Web3 应用钱包已就绪
4. **重复注入**: 可能多次注入导致冲突

## 修复方案

### 1. 改进 Content Script 注入逻辑

**修复前:**
```typescript
// 直接注入，不考虑 DOM 状态
injectProviderScript();

// 简单的注入方式
(document.head || document.documentElement).appendChild(providerScript);
```

**修复后:**
```typescript
// 检查是否已经注入过
if (document.querySelector('script[src*="provider.js"]')) {
  console.log('[LuckYou Wallet] Provider script already injected');
  return;
}

// 确保在 DOM 准备好时注入
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectProviderScript);
} else {
  injectProviderScript();
}

// 更安全的注入方式
if (document.head) {
  document.head.appendChild(providerScript);
} else {
  // 等待 DOM 准备好
  const observer = new MutationObserver((mutations, obs) => {
    if (document.head) {
      document.head.appendChild(providerScript!);
      obs.disconnect();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
```

### 2. 改进 Provider 脚本

**修复前:**
```typescript
// 简单的注入
Object.defineProperty(window, 'ethereum', {
  value: ethereum,
  writable: false,
  configurable: false
});

// 触发一次检测事件
window.dispatchEvent(new Event('ethereum#initialized'));
```

**修复后:**
```typescript
// 更详细的注入逻辑
if (window.ethereum) {
  console.log('[LuckYou Wallet] Ethereum provider already exists, adding LuckYou Wallet as alternative');
  
  // 将 LuckYou Wallet 作为替代 provider
  Object.defineProperty(window, 'luckyouWallet', {
    value: ethereum,
    writable: false,
    configurable: false
  });
} else {
  // 注入到 window 对象
  Object.defineProperty(window, 'ethereum', {
    value: ethereum,
    writable: false,
    configurable: false
  });
  
  console.log('[LuckYou Wallet] Ethereum provider injected as window.ethereum');
}

// 多次触发检测事件确保被检测到
window.dispatchEvent(new Event('ethereum#initialized'));

setTimeout(() => {
  window.dispatchEvent(new Event('ethereum#initialized'));
  console.log('[LuckYou Wallet] Provider detection events triggered');
}, 100);
```

### 3. 添加 Provider 标识

确保 provider 有正确的标识：

```typescript
const ethereum = {
  // 基本属性
  isMetaMask: false,
  isLuckYouWallet: true,  // 关键标识
  networkVersion: null,
  chainId: null,
  selectedAddress: null,
  isConnected: () => false,
  // ... 其他方法
};
```

### 4. 改进事件处理

```typescript
// 监听扩展就绪消息
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'LUCKYOU_WALLET_READY') {
    return;
  }

  console.log('[LuckYou Wallet] Extension ready');
  
  // 初始化网络信息
  ethereum.getChainId().then((chainId: any) => {
    ethereum.chainId = chainId;
    ethereum._emit('chainChanged', chainId);
  }).catch(console.error);

  // 检查是否已有连接的账户
  ethereum.getAccounts().then((accounts: any) => {
    if (accounts && accounts.length > 0) {
      ethereum.selectedAddress = accounts[0];
      ethereum._emit('accountsChanged', accounts);
      ethereum._emit('connect', { chainId: ethereum.chainId });
    }
  }).catch(console.error);
});
```

## 修复效果

1. **更可靠的注入**: 确保在 DOM 准备好时注入 provider
2. **避免重复注入**: 检查是否已经注入过，避免冲突
3. **更好的检测**: 多次触发检测事件，确保被 Web3 应用发现
4. **兼容性提升**: 正确处理与其他钱包的共存

## 测试方法

### 1. 使用测试页面

创建了 `test-wallet-detection.html` 来测试钱包检测：

- 自动检测 `window.ethereum` 是否存在
- 验证是否是 LuckYou Wallet
- 测试连接功能
- 监听钱包事件

### 2. 检查控制台日志

在浏览器开发者工具中查看以下日志：

```
[LuckYou Wallet] Content script loaded
[LuckYou Wallet] Provider script loaded successfully
[LuckYou Wallet] Extension ready
[LuckYou Wallet] Provider detection events triggered
[LuckYou Wallet] Provider injected successfully
```

### 3. 验证 Web3 应用

在支持 Web3 的网站上：

1. 打开浏览器开发者工具
2. 在控制台中输入 `window.ethereum`
3. 应该能看到 LuckYou Wallet 对象
4. 检查 `window.ethereum.isLuckYouWallet` 是否为 `true`

## 常见问题排查

### 1. 钱包未被检测到

**可能原因:**
- 扩展未正确加载
- Content script 未运行
- Provider 注入失败

**解决方法:**
- 重新加载扩展
- 检查控制台错误
- 使用测试页面验证

### 2. 与其他钱包冲突

**可能原因:**
- MetaMask 等钱包已存在
- Provider 被覆盖

**解决方法:**
- 检查 `window.luckyouWallet` 是否存在
- 在控制台中手动测试连接

### 3. 连接失败

**可能原因:**
- Background script 未响应
- 权限问题
- 网络配置错误

**解决方法:**
- 检查扩展权限
- 验证网络配置
- 查看 background script 日志

## 相关文件

- `src/content.ts` - Content script 注入逻辑
- `src/provider.ts` - Web3 Provider 实现
- `test-wallet-detection.html` - 钱包检测测试页面
- `dist/manifest.json` - 扩展配置

## 下一步

1. **重新加载扩展**: 在 Chrome 中重新加载扩展
2. **测试检测**: 打开 `test-wallet-detection.html` 验证检测
3. **验证 Web3 应用**: 在支持 Web3 的网站上测试连接
4. **检查日志**: 查看浏览器控制台的详细日志
