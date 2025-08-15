const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始测试标准构建流程...');
console.log('📁 当前工作目录:', process.cwd());

// 检查必要的文件是否存在
const requiredFiles = [
  'package.json',
  'vite.config.ts',
  'src/manifest.ts',
  'src/popup/index.tsx',
  'src/content.ts',
  'src/provider.ts',
  'src/background.ts'
];

console.log('\n📋 检查必要文件...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} - 存在`);
  } else {
    console.log(`❌ ${file} - 不存在`);
  }
});

// 运行标准构建命令
console.log('\n🔨 运行标准构建: npm run build...');
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
  console.log(`\n🏁 标准构建完成，退出码: ${code}`);

  if (code === 0) {
    console.log('✅ 标准构建成功！');
    
    // 检查生成的文件
    console.log('\n📋 检查生成的文件...');
    const expectedFiles = [
      'dist/manifest.json',
      'dist/content.js',
      'dist/provider.js',
      'dist/background.js',
      'dist/popup.html',
      'dist/popup/index.js'
    ];

    let allFilesExist = true;
    expectedFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log(`✅ ${file} - 存在 (${(stats.size / 1024).toFixed(2)} KB)`);
      } else {
        console.log(`❌ ${file} - 不存在`);
        allFilesExist = false;
      }
    });

    if (allFilesExist) {
      console.log('\n🎉 标准构建流程完全成功！');
      console.log('💡 现在可以使用标准的 npm run build 命令了');
      console.log('🔧 不再需要手动拷贝文件');
    } else {
      console.log('\n⚠️  部分文件缺失，需要进一步调试');
    }
  } else {
    console.log('❌ 标准构建失败，需要进一步修复配置');
  }
});

buildProcess.on('error', (error) => {
  console.log('💥 构建过程出错:', error.message);
});

