# LuckYouWallet_extension

一个功能完整的Web3钱包浏览器插件，支持多网络管理和自定义网络添加。

## 功能特性

### 核心功能
- 🔐 钱包创建和导入（助记词）
- 🔒 密码加密保护
- 💰 ETH/代币余额查询
- 📤 发送ETH和ERC20代币
- 📊 交易历史记录
- 🌐 多网络支持

### 网络管理功能
- 🏗️ **预设网络支持**：
  - Ethereum Mainnet
  - Sepolia Testnet
  - Polygon
  - BSC (Binance Smart Chain)
  - Arbitrum One
  - Optimism

- ⚙️ **自定义网络添加**：
  - 支持添加任意EVM兼容网络
  - 网络验证功能
  - 自定义网络管理（添加/删除）

- 🔄 **网络切换**：
  - 一键切换网络
  - 实时余额更新
  - 网络状态显示

## 网络管理使用指南

### 添加自定义网络
1. 在钱包界面点击"设置"按钮
2. 点击"添加网络"按钮
3. 填写网络信息：
   - **网络名称**：自定义网络名称
   - **RPC URL**：网络的RPC端点地址
   - **链ID**：网络的链ID
   - **货币符号**：网络原生代币符号
   - **区块浏览器**：可选的区块浏览器URL
4. 点击"添加网络"进行验证和保存

### 网络切换
- 在钱包界面顶部选择网络下拉菜单
- 或进入网络管理界面进行切换

### 删除自定义网络
- 在网络管理界面找到要删除的自定义网络
- 点击"删除"按钮
- 注意：预设网络无法删除

## 技术架构

- **前端**：React + TypeScript
- **区块链交互**：ethers.js v6
- **存储**：Chrome Extension Storage API
- **构建工具**：Vite + CRXJS

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

## 安全特性

- 助记词本地加密存储
- 密码保护钱包访问
- 自动会话超时
- 网络连接验证

## 支持的网络

### 预设网络
| 网络名称 | 链ID | RPC URL | 货币符号 |
|---------|------|---------|----------|
| Ethereum Mainnet | 1 | https://eth.llamarpc.com | ETH |
| Sepolia Testnet | 11155111 | https://ethereum-sepolia.publicnode.com | ETH |
| Polygon | 137 | https://polygon.llamarpc.com | MATIC |
| BSC | 56 | https://bsc-dataseed.binance.org | BNB |
| Arbitrum One | 42161 | https://arb1.arbitrum.io/rpc | ETH |
| Optimism | 10 | https://mainnet.optimism.io | ETH |

### 自定义网络
支持添加任意EVM兼容网络，包括：
- 私有网络
- 测试网络
- 其他公链网络
