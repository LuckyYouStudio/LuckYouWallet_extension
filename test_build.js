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
  
  if (code === 0) {
    console.log('✅ 构建成功！');
    
    // 检查构建输出文件
    const buildFiles = [
      'dist/manifest.json',
      'dist/popup.html',
      'dist/popup.js'
    ];
    
    console.log('\n📦 检查构建输出文件...');
    buildFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log(`✅ ${file} - 存在 (${(stats.size / 1024).toFixed(2)} KB)`);
      } else {
        console.log(`❌ ${file} - 不存在`);
      }
    });
    
    // 检查manifest.json内容
    try {
      const manifestPath = 'dist/manifest.json';
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log('\n📄 Manifest.json 内容:');
        console.log('- 名称:', manifest.name);
        console.log('- 版本:', manifest.version);
        console.log('- 权限:', manifest.permissions);
        console.log('- 清单版本:', manifest.manifest_version);
      }
    } catch (error) {
      console.log('❌ 无法读取 manifest.json:', error.message);
    }
    
  } else {
    console.log('❌ 构建失败！');
  }
  
  console.log('\n🎯 测试脚本完成');
});

buildProcess.on('error', (error) => {
  console.log('💥 构建过程出错:', error.message);
});
