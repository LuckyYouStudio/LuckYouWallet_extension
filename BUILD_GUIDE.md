# LuckYou Wallet Extension - 构建指南

## 概述

这个项目现在使用标准的 Vite 构建系统来构建 Chrome 扩展，提供了更好的代码分割、模块化和开发体验。

## 构建系统特性

### 1. 标准 Vite 配置
- 使用 `@vitejs/plugin-react` 处理 React 组件
- 支持 TypeScript 和 JSX
- 自动代码分割和优化
- 生成 source map 便于调试

### 2. 多入口点构建
- `popup.entry.tsx` - 弹出窗口入口点
- `content.entry.ts` - 内容脚本入口点
- `background.entry.ts` - 后台脚本入口点
- `provider.entry.ts` - Web3 Provider 入口点

### 3. 代码分割和模块化
- 使用动态导入避免循环依赖
- 每个模块独立构建和优化
- 支持 ES 模块和现代 JavaScript 特性

## 构建命令

### 开发模式
```bash
npm run dev
```
启动 Vite 开发服务器，支持热重载。

### 生产构建
```bash
npm run build
```
构建所有 JavaScript 文件到 `dist` 目录。

### 完整扩展构建
```bash
npm run build:extension
```
构建 JavaScript 文件并生成完整的 Chrome 扩展包，包括：
- 复制图标文件
- 复制 HTML 文件
- 生成 `manifest.json`
- 准备加载到 Chrome

## 文件结构

```
src/
├── popup/
│   ├── popup.entry.tsx    # 弹出窗口入口点
│   ├── Popup.tsx          # 主弹出窗口组件
│   └── ...
├── content.entry.ts       # 内容脚本入口点
├── content.ts             # 内容脚本逻辑
├── background.entry.ts    # 后台脚本入口点
├── background.ts          # 后台脚本逻辑
├── provider.entry.ts      # Provider 入口点
├── provider.ts            # Web3 Provider 逻辑
├── core/
│   └── wallet.ts          # 钱包核心功能
└── types.d.ts             # 类型声明

dist/                      # 构建输出目录
├── manifest.json          # 扩展清单文件
├── popup.html            # 弹出窗口 HTML
├── popup.js              # 弹出窗口 JavaScript
├── content.js            # 内容脚本
├── background.js         # 后台脚本
├── provider.js           # Web3 Provider
├── icons/                # 图标文件
└── *.map                 # Source map 文件
```

## 加载扩展到 Chrome

1. 运行构建命令：
   ```bash
   npm run build:extension
   ```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 启用"开发者模式"

4. 点击"加载已解压的扩展程序"

5. 选择项目根目录下的 `dist` 文件夹

## 开发工作流

### 1. 修改代码
- 编辑 `src/` 目录下的源文件
- 支持 TypeScript、JSX 和现代 JavaScript 语法

### 2. 开发调试
```bash
npm run dev
```
- 启动开发服务器
- 支持热重载和快速开发

### 3. 测试构建
```bash
npm run build
```
- 构建生产版本
- 检查构建输出和错误

### 4. 生成扩展包
```bash
npm run build:extension
```
- 生成完整的 Chrome 扩展包
- 准备加载到浏览器进行测试

## 技术特性

### 代码分割
- 每个入口点独立构建
- 共享代码自动提取到公共 chunk
- 按需加载和懒加载支持

### 模块化
- 使用 ES 模块语法
- 动态导入避免循环依赖
- 清晰的模块边界和接口

### 类型安全
- 完整的 TypeScript 支持
- Chrome 扩展 API 类型声明
- 编译时错误检查

### 性能优化
- 自动代码压缩和优化
- Tree shaking 移除未使用代码
- 生成优化的生产版本

## 故障排除

### 构建失败
1. 检查 TypeScript 类型错误
2. 确保所有依赖已安装
3. 检查文件路径和引用

### 扩展加载失败
1. 检查 `manifest.json` 语法
2. 确保所有引用的文件存在
3. 查看 Chrome 开发者工具的错误信息

### 运行时错误
1. 检查 source map 文件
2. 使用 Chrome 开发者工具调试
3. 查看控制台错误信息

## 最佳实践

1. **模块化设计**：将功能分解为独立的模块
2. **类型安全**：使用 TypeScript 类型声明
3. **错误处理**：添加适当的错误处理和日志
4. **性能优化**：使用动态导入和代码分割
5. **测试**：在多个浏览器中测试扩展功能

## 更新日志

- **v0.1.0**: 初始版本，使用标准 Vite 构建系统
- 支持多入口点构建
- 完整的代码分割和模块化
- TypeScript 和现代 JavaScript 支持
