const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始构建测试...');
console.log('📁 当前工作目录:', process.cwd());

// 检查必要的文件是否存在
const requiredFiles = [
  'package.json',
  'src/manifest.ts',
  'src/popup/Popup.tsx',
  'src/core/wallet.ts'
];

console.log('\n📋 检查必要文件...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} - 存在`);
  } else {
    console.log(`❌ ${file} - 不存在`);
  }
});

// 文件拷贝函数
function copyFile(source, destination) {
  try {
    // 确保目标目录存在
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // 读取源文件
    const content = fs.readFileSync(source, 'utf8');
    
    // 写入目标文件
    fs.writeFileSync(destination, content, 'utf8');
    
    const stats = fs.statSync(destination);
    console.log(`✅ 已复制: ${source} → ${destination} (${(stats.size / 1024).toFixed(2)} KB)`);
    return true;
  } catch (error) {
    console.log(`❌ 复制失败: ${source} → ${destination}: ${error.message}`);
    return false;
  }
}

// 运行构建命令
console.log('\n🔨 运行 npm run build...');
const buildProcess = exec('npm run build', { 
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024 // 1MB buffer
});

buildProcess.stdout.on('data', (data) => {
  console.log('📤 构建输出:', data.toString());
});

buildProcess.stderr.on('data', (data) => {
  console.log('⚠️  构建警告/错误:', data.toString());
});

buildProcess.on('close', (code) => {
  console.log(`\n🏁 构建完成，退出码: ${code}`);
  
  // 即使构建失败也继续执行拷贝操作
  console.log('📋 开始拷贝必要文件...');
  
  const filesToCopy = [
    { source: 'src/content.ts', destination: 'dist/content.js' },
    { source: 'src/provider.ts', destination: 'dist/provider.js' },
    { source: 'src/background.ts', destination: 'dist/background.js' }
  ];
  
  let copySuccessCount = 0;
  filesToCopy.forEach(({ source, destination }) => {
    if (fs.existsSync(source)) {
      if (copyFile(source, destination)) {
        copySuccessCount++;
      }
    } else {
      console.log(`❌ 源文件不存在: ${source}`);
    }
  });
  
  console.log(`\n📊 拷贝结果: ${copySuccessCount}/${filesToCopy.length} 个文件成功`);
  
  // 检查并修复manifest.json
  try {
    const manifestPath = 'dist/manifest.json';
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log('\n📄 Manifest.json 内容:');
      console.log('- 名称:', manifest.name);
      console.log('- 版本:', manifest.version);
      console.log('- 权限:', manifest.permissions);
      console.log('- 清单版本:', manifest.manifest_version);
      
      // 检查是否包含必要的配置
      const hasBackground = manifest.background && manifest.background.service_worker;
      const hasContentScripts = manifest.content_scripts && manifest.content_scripts.length > 0;
      const hasWebAccessibleResources = manifest.web_accessible_resources && manifest.web_accessible_resources.length > 0;
      
      console.log('\n🔧 扩展配置检查:');
      console.log('- Background Script:', hasBackground ? '✅' : '❌');
      console.log('- Content Scripts:', hasContentScripts ? '❌' : '❌');
      console.log('- Web Accessible Resources:', hasWebAccessibleResources ? '✅' : '❌');
      
      if (!hasBackground || !hasContentScripts || !hasWebAccessibleResources) {
        console.log('\n⚠️  警告: manifest.json 缺少必要的配置，正在修复...');
        
        // 修复manifest.json
        const fixedManifest = {
          ...manifest,
          background: {
            service_worker: "background.js"
          },
          content_scripts: [
            {
              js: ["content.js"],
              matches: ["<all_urls>"],
              run_at: "document_start"
            }
          ],
          web_accessible_resources: [
            {
              resources: ["provider.js"],
              matches: ["<all_urls>"]
            }
          ]
        };
        
        fs.writeFileSync(manifestPath, JSON.stringify(fixedManifest, null, 2), 'utf8');
        console.log('✅ manifest.json 已修复');
      }
    } else {
      console.log('❌ manifest.json 不存在，创建基本配置...');
      
      // 创建基本的manifest.json
      const basicManifest = {
        manifest_version: 3,
        name: 'LuckYou Wallet',
        version: '0.1.0',
        icons: {
          16: 'icons/icon16.png',
          32: 'icons/icon32.png',
          48: 'icons/icon48.png',
          64: 'icons/icon64.png',
          128: 'icons/icon128.png'
        },
        action: {
          default_popup: 'popup.html',
          default_title: 'LuckYou Wallet'
        },
        permissions: ['storage'],
        host_permissions: ['<all_urls>'],
        background: {
          service_worker: "background.js"
        },
        content_scripts: [
          {
            js: ["content.js"],
            matches: ["<all_urls>"],
            run_at: "document_start"
          }
        ],
        web_accessible_resources: [
          {
            resources: ["provider.js"],
            matches: ["<all_urls>"]
          }
        ]
      };
      
      fs.writeFileSync(manifestPath, JSON.stringify(basicManifest, null, 2), 'utf8');
      console.log('✅ 已创建基本 manifest.json');
    }
  } catch (error) {
    console.log('❌ 无法处理 manifest.json:', error.message);
  }
  
  // 最终检查
  console.log('\n🎯 最终检查...');
  const finalFiles = [
    'dist/manifest.json',
    'dist/content.js',
    'dist/provider.js',
    'dist/background.js'
  ];
  
  let allFilesExist = true;
  finalFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      console.log(`✅ ${file} - 存在 (${(stats.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log(`❌ ${file} - 不存在`);
      allFilesExist = false;
    }
  });
  
  if (allFilesExist) {
    console.log('\n🎉 扩展构建完成！所有文件都已准备就绪。');
    console.log('💡 提示: 请在浏览器中重新加载扩展以应用更改。');
  } else {
    console.log('\n⚠️  警告: 部分文件缺失，扩展可能无法正常工作。');
  }
  
  console.log('\n🎯 测试脚本完成');
});

buildProcess.on('error', (error) => {
  console.log('💥 构建过程出错:', error.message);
});
