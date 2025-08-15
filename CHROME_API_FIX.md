# Chrome API 访问问题修复总结

## 问题描述

用户遇到以下错误：
```
[LuckYou Wallet] Error injecting provider script: TypeError: chrome.runtime.getURL is not a function
```

这个错误表明 content script 无法访问 Chrome API，导致无法正确注入 provider 脚本。

## 问题原因

1. **Content Script 运行环境问题**: 在 manifest.json 中设置了 `"world": "MAIN"`，这会让 content script 运行在页面的主世界中，无法访问 Chrome API
2. **隔离环境限制**: Content script 需要运行在扩展的隔离环境中才能访问 `chrome.runtime.getURL` 等 API

## 修复方案

### 1. 移除 MAIN World 设置

**修复前:**
```json
{
  "content_scripts": [
    {
      "js": ["content.js"],
      "matches": ["<all_urls>"],
      "run_at": "document_start",
      "world": "MAIN"  // 这导致无法访问 Chrome API
    }
  ]
}
```

**修复后:**
```json
{
  "content_scripts": [
    {
      "js": ["content.js"],
      "matches": ["<all_urls>"],
      "run_at": "document_start"
      // 移除了 "world": "MAIN"
    }
  ]
}
```

### 2. 更新构建脚本

修改了 `build-extension.js` 脚本，确保生成的 manifest.json 不包含 `"world": "MAIN"` 设置：

```javascript
content_scripts: [
  {
    js: ["content.js"],
    matches: ["<all_urls>"],
    run_at: "document_start"
    // 移除了 world: "MAIN"
  }
]
```

### 3. 保持 Provider 注入逻辑

Content script 现在可以正常访问 Chrome API：

```typescript
// 使用扩展的 URL 来获取 provider.js
const extensionUrl = chrome.runtime.getURL('provider.js');
providerScript.src = extensionUrl;
```

## 修复效果

1. **Chrome API 访问**: Content script 现在可以正常访问 `chrome.runtime.getURL` 等 API
2. **Provider 注入**: Provider 脚本可以正确注入到网页中
3. **钱包检测**: Web3 应用现在可以检测到 LuckYou Wallet

## 技术说明

### Content Script 运行环境

- **默认环境**: Content script 运行在扩展的隔离环境中，可以访问 Chrome API
- **MAIN World**: 设置 `"world": "MAIN"` 会让 content script 运行在页面的主世界中，无法访问 Chrome API
- **使用场景**: MAIN World 通常用于需要直接访问页面 JavaScript 变量的场景

### 我们的解决方案

由于我们需要：
1. 访问 Chrome API (`chrome.runtime.getURL`)
2. 与 background script 通信 (`chrome.runtime.sendMessage`)
3. 注入 provider 脚本

所以我们选择使用默认的隔离环境，而不是 MAIN World。

## 测试步骤

1. **重新加载扩展**:
   - 在 Chrome 中访问 `chrome://extensions/`
   - 删除旧的扩展
   - 重新加载 `dist` 文件夹

2. **检查控制台日志**:
   - 打开任意网页
   - 查看浏览器控制台
   - 应该看到以下日志：
     ```
     [LuckYou Wallet] Content script loaded
     [LuckYou Wallet] Provider script loaded successfully
     [LuckYou Wallet] Extension ready
     [LuckYou Wallet] Provider injected successfully
     ```

3. **测试钱包检测**:
   - 打开 `test-wallet-detection.html`
   - 验证钱包是否能被正确检测到

## 相关文件

- `src/manifest.ts` - Manifest 配置
- `build-extension.js` - 构建脚本
- `src/content.ts` - Content script 实现
- `dist/manifest.json` - 生成的扩展配置

## 注意事项

1. **重新加载扩展**: 修复后需要重新加载扩展才能生效
2. **清除缓存**: 如果问题仍然存在，可能需要清除浏览器缓存
3. **检查权限**: 确保扩展有正确的权限设置

## 下一步

1. 重新加载扩展
2. 测试钱包检测功能
3. 验证 Web3 应用连接
4. 检查所有功能是否正常工作
