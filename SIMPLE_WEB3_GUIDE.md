# LuckYou Wallet 简化Web3集成指南

## 概述

这是一个简化的Web3集成方案，不需要复杂的content script和background script配置。通过引入独立的JavaScript文件，可以快速实现与LuckYou Wallet的连接。

## 快速开始

### 1. 引入Provider脚本

在您的HTML页面中引入provider脚本：

```html
<script src="web3-provider.js"></script>
```

### 2. 连接钱包

```javascript
// 连接钱包
async function connectWallet() {
  try {
    const result = await window.connectToLuckYouWallet();
    console.log('连接成功:', result);
    return result;
  } catch (error) {
    console.error('连接失败:', error);
  }
}
```

### 3. 使用Web3功能

```javascript
// 获取账户
const accounts = await window.ethereum.request({ method: 'eth_accounts' });

// 获取链ID
const chainId = await window.ethereum.request({ method: 'eth_chainId' });

// 获取网络版本
const networkVersion = await window.ethereum.request({ method: 'net_version' });
```

## 完整示例

```html
<!DOCTYPE html>
<html>
<head>
    <title>LuckYou Wallet 示例</title>
</head>
<body>
    <button onclick="connectWallet()">连接钱包</button>
    <button onclick="getAccountInfo()">获取账户信息</button>
    
    <div id="result"></div>

    <script src="web3-provider.js"></script>
    <script>
        async function connectWallet() {
            try {
                const result = await window.connectToLuckYouWallet();
                document.getElementById('result').textContent = 
                    `连接成功: ${result.address}`;
            } catch (error) {
                document.getElementById('result').textContent = 
                    `连接失败: ${error.message}`;
            }
        }

        async function getAccountInfo() {
            try {
                const accounts = await window.ethereum.request({ 
                    method: 'eth_accounts' 
                });
                const chainId = await window.ethereum.request({ 
                    method: 'eth_chainId' 
                });
                
                document.getElementById('result').textContent = 
                    `账户: ${accounts[0]}, 链ID: ${chainId}`;
            } catch (error) {
                document.getElementById('result').textContent = 
                    `获取失败: ${error.message}`;
            }
        }
    </script>
</body>
</html>
```

## 支持的方法

### 基本方法
- `eth_requestAccounts` - 请求账户连接
- `eth_accounts` - 获取当前账户
- `eth_chainId` - 获取链ID
- `net_version` - 获取网络版本

### 高级方法（需要进一步实现）
- `eth_getBalance` - 获取余额
- `personal_sign` - 签名消息
- `eth_sendTransaction` - 发送交易
- `eth_signTypedData_v4` - 签名类型化数据

## 事件监听

```javascript
// 监听账户变化
window.ethereum.on('accountsChanged', (accounts) => {
    console.log('账户变化:', accounts);
});

// 监听链变化
window.ethereum.on('chainChanged', (chainId) => {
    console.log('链变化:', chainId);
});

// 监听连接状态
window.ethereum.on('connect', (connectInfo) => {
    console.log('连接成功:', connectInfo);
});
```

## 错误处理

```javascript
try {
    const result = await window.connectToLuckYouWallet();
} catch (error) {
    if (error.message.includes('extension not found')) {
        console.error('请安装 LuckYou Wallet 扩展');
    } else if (error.message.includes('No wallet found')) {
        console.error('请在扩展中创建或导入钱包');
    } else {
        console.error('连接失败:', error.message);
    }
}
```

## 测试

1. 打开 `simple-test.html` 文件
2. 确保已安装 LuckYou Wallet 扩展
3. 在扩展中创建或导入钱包
4. 点击"连接钱包"按钮
5. 测试各种功能

## 注意事项

1. **扩展依赖**: 此方案需要LuckYou Wallet扩展已安装
2. **钱包准备**: 扩展中必须有已创建或导入的钱包
3. **权限**: 扩展需要storage权限
4. **浏览器支持**: 支持Chrome、Edge等基于Chromium的浏览器

## 故障排除

### 常见问题

1. **"LuckYou Wallet extension not found"**
   - 确保已安装扩展
   - 刷新页面

2. **"No wallet found"**
   - 在扩展中创建或导入钱包
   - 确保钱包已解锁

3. **"Wallet not connected"**
   - 先调用 `connectToLuckYouWallet()`
   - 检查连接状态

### 调试技巧

1. 打开浏览器控制台查看详细日志
2. 检查扩展是否正确安装
3. 确认钱包状态

## 下一步

这个简化方案提供了基本的Web3连接功能。要支持更高级的功能（如交易签名），需要：

1. 实现完整的消息传递机制
2. 添加用户确认界面
3. 集成实际的RPC调用
4. 实现安全的事件处理

## 文件说明

- `web3-provider.js` - 独立的Web3 Provider脚本
- `simple-test.html` - 简化的测试页面
- `SIMPLE_WEB3_GUIDE.md` - 本使用指南

## 许可证

本项目采用MIT许可证。
