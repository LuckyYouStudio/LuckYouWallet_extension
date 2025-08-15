// Popup Entry Point
// 这个文件作为 popup 的独立入口点，确保能被 Vite 正确处理

import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';

// 创建 React 根元素
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// 渲染 Popup 组件
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);

// 确保这个模块被正确识别为入口点
export {};
