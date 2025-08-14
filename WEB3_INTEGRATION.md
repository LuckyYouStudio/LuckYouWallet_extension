# LuckYou Wallet Web3 集成功能

## 概述

LuckYou Wallet 浏览器扩展现在支持与Web前端的连接，提供类似MetaMask的以太坊兼容接口。用户可以通过Web3 API连接钱包、签名交易、发送交易等。

## 功能特性

### 🔗 钱包连接
- **账户连接**: 支持 `eth_requestAccounts` 和 `eth_accounts` 方法
- **授权管理**: 网站需要用户确认才能连接钱包
- **会话管理**: 记住已授权的网站，避免重复确认

### ✍️ 签名功能
- **消息签名**: 支持 `personal_sign` 方法
- **类型化数据签名**: 支持 `eth_signTypedData_v4` 方法
- **交易签名**: 支持 `eth_sendTransaction` 方法

### 🌐 网络信息
- **链ID获取**: 支持 `eth_chainId` 和 `net_version` 方法
- **网络切换**: 自动检测当前选择的网络
- **多网络支持**: 支持主网、测试网、自定义网络

### 📡 RPC调用
- **余额查询**: 支持 `eth_getBalance` 方法
- **区块信息**: 支持 `eth_blockNumber` 方法
- **Gas价格**: 支持 `eth_gasPrice` 方法

## 技术架构

### 组件结构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web前端       │    │  Content Script │    │ Background Script│
│                 │◄──►│                 │◄──►│                 │
│ window.ethereum │    │ 消息转发        │    │ 请求处理        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Provider脚本   │    │  Popup界面      │
                       │                 │    │                 │
                       │ 以太坊接口      │    │ 用户确认        │
                       └─────────────────┘    └─────────────────┘
```

### 消息流程
1. **Web前端** → **Provider脚本**: 调用以太坊方法
2. **Provider脚本** → **Content Script**: 发送请求消息
3. **Content Script** → **Background Script**: 转发请求
4. **Background Script** → **Popup**: 显示确认界面
5. **Popup** → **Background Script**: 返回用户决定
6. **Background Script** → **Content Script**: 发送响应
7. **Content Script** → **Provider脚本**: 转发响应
8. **Provider脚本** → **Web前端**: 返回结果

## 使用方法

### 1. 检测钱包
```javascript
// 等待钱包注入
function waitForWallet() {
  return new Promise((resolve) => {
    if (window.ethereum) {
      resolve(window.ethereum);
      return;
    }
    
    window.addEventListener('ethereum#initialized', () => {
      resolve(window.ethereum);
    });
  });
}

// 检查是否为LuckYou Wallet
if (window.ethereum && window.ethereum.isLuckYouWallet) {
  console.log('检测到 LuckYou Wallet');
}
```

### 2. 连接钱包
```javascript
async function connectWallet() {
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });
    console.log('连接的账户:', accounts[0]);
  } catch (error) {
    console.error('连接失败:', error);
  }
}
```

### 3. 获取账户信息
```javascript
async function getAccountInfo() {
  // 获取当前账户
  const accounts = await window.ethereum.request({
    method: 'eth_accounts'
  });
  
  // 获取余额
  const balance = await window.ethereum.request({
    method: 'eth_getBalance',
    params: [accounts[0], 'latest']
  });
  
  // 获取链ID
  const chainId = await window.ethereum.request({
    method: 'eth_chainId'
  });
  
  return { accounts, balance, chainId };
}
```

### 4. 签名消息
```javascript
async function signMessage(message, address) {
  try {
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address]
    });
    console.log('签名结果:', signature);
    return signature;
  } catch (error) {
    console.error('签名失败:', error);
  }
}
```

### 5. 发送交易
```javascript
async function sendTransaction(to, value) {
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts'
    });
    
    const transactionParameters = {
      to: to,
      from: accounts[0],
      value: value // 十六进制格式，单位wei
    };
    
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [transactionParameters]
    });
    
    console.log('交易哈希:', txHash);
    return txHash;
  } catch (error) {
    console.error('交易失败:', error);
  }
}
```

### 6. 监听事件
```javascript
// 监听账户变化
window.ethereum.on('accountsChanged', (accounts) => {
  console.log('账户已切换:', accounts[0]);
});

// 监听链变化
window.ethereum.on('chainChanged', (chainId) => {
  console.log('网络已切换:', chainId);
});

// 监听连接状态
window.ethereum.on('connect', (connectInfo) => {
  console.log('钱包已连接:', connectInfo);
});

// 监听断开连接
window.ethereum.on('disconnect', (error) => {
  console.log('钱包已断开:', error);
});
```

## 安全特性

### 用户确认
- **连接确认**: 网站首次连接时需要用户确认
- **交易确认**: 每次发送交易都需要用户确认
- **签名确认**: 每次签名都需要用户确认

### 权限管理
- **网站授权**: 记住已授权的网站，避免重复确认
- **权限撤销**: 用户可以随时撤销网站授权
- **安全提示**: 显示详细的交易信息供用户确认

### 错误处理
- **超时处理**: 请求超时自动取消
- **错误提示**: 详细的错误信息帮助用户理解
- **异常恢复**: 网络异常时自动重试

## 测试页面

项目包含一个测试页面 `test_web3.html`，可以用来测试所有Web3功能：

1. 打开 `test_web3.html` 文件
2. 确保已安装 LuckYou Wallet 扩展
3. 在扩展中创建或导入钱包
4. 点击"连接钱包"按钮
5. 在扩展弹窗中确认连接
6. 测试各种Web3功能

## 兼容性

### 支持的方法
- `eth_requestAccounts` - 请求账户连接
- `eth_accounts` - 获取当前账户
- `eth_chainId` - 获取链ID
- `net_version` - 获取网络版本
- `eth_getBalance` - 获取余额
- `eth_blockNumber` - 获取区块号
- `eth_gasPrice` - 获取Gas价格
- `personal_sign` - 签名消息
- `eth_signTypedData_v4` - 签名类型化数据
- `eth_sendTransaction` - 发送交易

### 支持的事件
- `accountsChanged` - 账户变化
- `chainChanged` - 链变化
- `connect` - 连接成功
- `disconnect` - 连接断开

### 浏览器支持
- Chrome 88+
- Edge 88+
- 其他基于Chromium的浏览器

## 开发注意事项

### 1. 错误处理
始终使用 try-catch 包装Web3调用：
```javascript
try {
  const result = await window.ethereum.request({ method: 'eth_accounts' });
} catch (error) {
  console.error('请求失败:', error);
}
```

### 2. 异步处理
所有Web3方法都是异步的，需要使用 async/await 或 Promise：
```javascript
// 正确
const accounts = await window.ethereum.request({ method: 'eth_accounts' });

// 错误
const accounts = window.ethereum.request({ method: 'eth_accounts' });
```

### 3. 状态检查
在调用方法前检查钱包状态：
```javascript
if (!window.ethereum) {
  console.error('未检测到钱包');
  return;
}

if (!window.ethereum.isConnected()) {
  console.error('钱包未连接');
  return;
}
```

### 4. 事件监听
及时清理事件监听器：
```javascript
const handleAccountsChanged = (accounts) => {
  console.log('账户变化:', accounts);
};

window.ethereum.on('accountsChanged', handleAccountsChanged);

// 清理时移除监听器
window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
```

## 故障排除

### 常见问题

1. **未检测到钱包**
   - 确保已安装 LuckYou Wallet 扩展
   - 刷新页面
   - 检查浏览器控制台是否有错误

2. **连接被拒绝**
   - 检查扩展中是否已创建钱包
   - 确认扩展弹窗中的连接请求
   - 检查网站是否在授权列表中

3. **交易失败**
   - 检查账户余额是否足够
   - 确认Gas费用设置
   - 检查网络连接状态

4. **签名失败**
   - 确认签名消息内容
   - 检查账户地址是否正确
   - 确认用户已授权网站

### 调试技巧

1. **启用详细日志**
   - 在浏览器控制台中查看详细日志
   - 检查网络请求和响应

2. **使用测试网络**
   - 在测试网络上进行测试
   - 避免在主网上进行测试交易

3. **检查扩展状态**
   - 查看扩展弹窗中的钱包状态
   - 确认网络选择是否正确

## 更新日志

### v0.1.0
- 初始Web3集成功能
- 支持基本的钱包连接和交易功能
- 添加用户确认界面
- 实现消息传递机制

## 贡献

欢迎提交Issue和Pull Request来改进Web3集成功能。

## 许可证

本项目采用MIT许可证。
