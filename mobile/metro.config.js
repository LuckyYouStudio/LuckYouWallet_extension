// Metro 配置：让 App 直接复用插件仓库中的共享钱包核心 (../src/core)
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../src/core');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders || []), coreRoot];

// 共享核心中的第三方依赖 (如 ethers) 一律从本项目 node_modules 解析，避免出现两份依赖
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve || context.resolveRequest;
  const isBareImport = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (isBareImport && context.originModulePath.startsWith(coreRoot)) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
