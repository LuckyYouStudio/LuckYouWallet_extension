# 余额加载问题修复说明

## 🐛 问题描述

在扩展启动时，余额查询会触发多次不必要的RPC请求：

1. **主网请求**：扩展启动时默认加载mainnet，触发一次主网RPC请求
2. **重复的本地网络请求**：当切换到保存的网络（如hardhat）时，会触发两次相同的RPC请求

### 问题日志示例
```
[BALANCE DEBUG] RPC URL: https://eth.llamarpc.com  # 主网请求
[BALANCE DEBUG] RPC URL: http://127.0.0.1:8545     # 第一次本地网络请求
[BALANCE DEBUG] RPC URL: http://127.0.0.1:8545     # 第二次本地网络请求（重复）
```

## 🔍 问题原因

问题出现在两个 `useEffect` 钩子的冲突：

1. **网络状态变化监听**（第280-302行）：
   ```typescript
   useEffect(() => {
     if (walletInfo?.address && network) {
       // 加载余额
       loadBalance(walletInfo.address, network, true);
     }
   }, [network, walletInfo?.address]);
   ```

2. **视图变化监听**（第965-976行）：
   ```typescript
   useEffect(() => {
     if (view === 'wallet' && walletInfo?.address && network) {
       // 加载余额
       loadBalance(walletInfo.address, network, true);
     }
   }, [view, walletInfo?.address, network]);
   ```

当扩展启动时：
1. 网络状态从 `undefined` 变为 `mainnet`，触发第一个useEffect
2. 视图从 `home` 变为 `wallet`，触发第二个useEffect
3. 网络状态从 `mainnet` 变为 `hardhat`，再次触发第一个useEffect

这导致了多次重复的余额查询。

## ✅ 修复方案

### 1. 网络状态变化监听优化

修改网络状态变化的 `useEffect`，只在钱包视图时加载余额：

```typescript
useEffect(() => {
  if (walletInfo?.address && network) {
    console.log(`[NETWORK DEBUG] Network changed to: ${network}, loading balance...`);
    
    // 检查是否是扩展启动时的初始 mainnet（需要跳过）
    if (network === 'mainnet' && !balanceAutoRefreshRef.current && !balanceLoaded) {
      console.log('[NETWORK DEBUG] Skipping initial mainnet balance load, waiting for saved network...');
      return;
    }
    
    // 只有在视图是钱包视图时才加载余额，避免重复加载
    if (view === 'wallet') {
      setTimeout(() => {
        loadBalance(walletInfo.address, network, true);
        balanceAutoRefreshRef.current = true;
      }, 200);
    }
  }
}, [network, walletInfo?.address, view]); // 添加 view 依赖
```

### 2. 视图变化监听优化

增加延迟时间，确保网络状态完全更新：

```typescript
useEffect(() => {
  console.log(`[VIEW DEBUG] View changed to: ${view}, walletInfo?.address: ${walletInfo?.address}, network: ${network}`);
  
  if (view === 'wallet' && walletInfo?.address && network) {
    console.log('[VIEW DEBUG] Entering wallet view, loading balance...');
    balanceAutoRefreshRef.current = false;
    // 增加延迟，确保网络状态完全更新
    setTimeout(() => {
      loadBalance(walletInfo.address, network, true);
    }, 300); // 从100ms增加到300ms
  }
}, [view, walletInfo?.address, network]);
```

## 🎯 修复效果

修复后的行为：

1. **扩展启动时**：
   - 跳过初始的mainnet余额加载
   - 等待保存的网络加载完成
   - 只在进入钱包视图时加载一次余额

2. **网络切换时**：
   - 只在钱包视图时加载余额
   - 避免重复的RPC请求

3. **视图切换时**：
   - 只在进入钱包视图时加载余额
   - 增加延迟确保网络状态稳定

## 📊 预期日志

修复后的日志应该是：
```
[NETWORK DEBUG] Network changed to: mainnet, loading balance...
[NETWORK DEBUG] Skipping initial mainnet balance load, waiting for saved network...
[VIEW DEBUG] View changed to: wallet, walletInfo?.address: 0x..., network: hardhat
[VIEW DEBUG] Entering wallet view, loading balance...
[BALANCE DEBUG] RPC URL: http://127.0.0.1:8545  # 只有一次本地网络请求
```

## 🔧 测试方法

1. 重新加载扩展
2. 观察控制台日志
3. 确认只有一次RPC请求到正确的网络
4. 测试网络切换功能
5. 测试隐藏/显示扩展功能

## 📝 注意事项

1. **延迟时间**：根据网络响应时间调整延迟
2. **状态同步**：确保网络状态和视图状态的同步
3. **错误处理**：保持原有的错误处理机制
4. **性能优化**：避免不必要的重复请求

## 🚀 后续优化

1. **智能缓存**：实现余额缓存机制
2. **请求去重**：添加请求去重逻辑
3. **网络检测**：优化网络连接检测
4. **用户体验**：添加加载状态指示器
