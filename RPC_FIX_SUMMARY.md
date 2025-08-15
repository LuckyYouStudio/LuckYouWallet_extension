# RPC 连接问题修复总结

## 问题描述

用户遇到以下 RPC 连接错误：
```
POST http://127.0.0.1:8545/ net::ERR_CONNECTION_REFUSED
POST https://polygon.llamarpc.com/ net::ERR_NAME_NOT_RESOLVED
```

## 问题原因

1. **本地节点连接失败**: 扩展尝试连接本地 Hardhat 节点 (`http://127.0.0.1:8545`)，但该节点未运行
2. **不可靠的 RPC 端点**: 某些 RPC URL 不可用或响应缓慢
3. **缺少错误处理**: 没有重试机制和备用 RPC 端点

## 修复方案

### 1. 更新 RPC 端点配置

**修复前:**
```typescript
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com', // 可能不可用
    // ...
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'https://polygon.llamarpc.com', // 域名解析失败
    // ...
  },
  hardhat: {
    name: 'Local Hardhat',
    rpcUrl: 'http://127.0.0.1:8545', // 本地节点未运行
    // ...
  },
}
```

**修复后:**
```typescript
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://cloudflare-eth.com', // 更可靠的端点
    // ...
  },
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org', // 官方测试网端点
    // ...
  },
  polygon: {
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com', // 官方 Polygon RPC
    // ...
  },
  bsc: {
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed1.binance.org', // 更稳定的 BSC 端点
    // ...
  },
  // 移除了 hardhat 本地节点配置
}
```

### 2. 添加重试机制

在 `getEthBalance` 函数中添加了重试逻辑：

```typescript
export async function getEthBalance(address: string, network: NetworkKey): Promise<string> {
  // 添加重试机制
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[BALANCE DEBUG] Attempt ${attempt}/${maxRetries} - Getting balance from provider...`);
      
      const provider = new JsonRpcProvider(networkConfig.rpcUrl);
      const balance = await provider.getBalance(address);
      
      // 处理余额数据...
      return formatted;
    } catch (error) {
      lastError = error;
      console.error(`[BALANCE DEBUG] Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        console.log(`[BALANCE DEBUG] Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw new Error(`Failed to get balance after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}
```

### 3. 修复类型声明问题

解决了 Chrome API 类型冲突：

```typescript
// 使用 any 类型避免 Chrome API 类型冲突
declare const chrome: any;
```

### 4. 创建 RPC 测试工具

创建了 `test-rpc.html` 文件来测试 RPC 端点连接性：

- 自动测试所有配置的 RPC 端点
- 显示连接状态和最新区块号
- 帮助诊断网络连接问题

## 修复效果

1. **更可靠的 RPC 连接**: 使用官方和稳定的 RPC 端点
2. **自动重试机制**: 网络波动时自动重试，提高成功率
3. **更好的错误处理**: 详细的错误日志和用户友好的错误信息
4. **移除本地依赖**: 不再依赖本地节点，避免连接失败

## 测试建议

1. **重新加载扩展**: 在 Chrome 中重新加载扩展
2. **测试 RPC 连接**: 打开 `test-rpc.html` 验证 RPC 端点可用性
3. **检查控制台**: 查看浏览器控制台的详细日志信息
4. **网络切换**: 尝试在不同网络间切换，验证连接稳定性

## 后续优化建议

1. **备用 RPC 端点**: 为每个网络配置多个备用 RPC URL
2. **智能路由**: 根据响应时间自动选择最快的 RPC 端点
3. **离线模式**: 当所有 RPC 端点不可用时，提供离线功能
4. **用户配置**: 允许用户自定义 RPC 端点

## 相关文件

- `src/core/wallet.ts` - 网络配置和 RPC 连接逻辑
- `test-rpc.html` - RPC 连接测试工具
- `build-extension.js` - 构建脚本
- `dist/` - 构建后的扩展文件
