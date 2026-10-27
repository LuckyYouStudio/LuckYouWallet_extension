// 自定义入口：先安装 polyfill，再加载 Expo Router
import './src/polyfills';

// 发布版本关闭调试日志 (保留 warn/error)，避免地址等信息进入系统日志
if (!__DEV__) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

import 'expo-router/entry';
