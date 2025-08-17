const fs = require('fs');
const path = require('path');

// 构建脚本 - 生成 Chrome 扩展
async function buildExtension() {
  console.log('Building Chrome Extension...');
  
  // 确保 dist 目录存在
  if (!fs.existsSync('dist')) {
    console.error('dist directory not found. Please run "npm run build" first.');
    process.exit(1);
  }
  
  // 复制图标
  if (fs.existsSync('icons')) {
    const iconFiles = fs.readdirSync('icons');
    iconFiles.forEach(file => {
      if (file.endsWith('.png')) {
        fs.copyFileSync(`icons/${file}`, `dist/${file}`);
        console.log(`Copied icon: ${file}`);
      }
    });
  }
  
  // 处理 HTML 文件 - 修复脚本引用路径
  if (fs.existsSync('popup.html')) {
    let htmlContent = fs.readFileSync('popup.html', 'utf8');
    
    // 将开发路径替换为构建后的路径
    htmlContent = htmlContent.replace(
      'src="/src/popup/popup.entry.tsx"',
      'src="popup.js"'
    );
    
    fs.writeFileSync('dist/popup.html', htmlContent);
    console.log('Processed popup.html with correct script path');
  }
  
  // 生成 manifest.json
  const manifest = {
    manifest_version: 3,
    name: 'LuckYou Wallet',
    version: '0.1.0',
    description: 'A secure and user-friendly Web3 wallet extension',
    icons: {
      16: 'icon16.png',
      32: 'icon32.png',
      48: 'icon48.png',
      64: 'icon64.png',
      128: 'icon128.png' 
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'LuckYou Wallet'
    },
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'notifications'
    ],
    host_permissions: [
      "<all_urls>"
    ],
    background: {
      service_worker: "background.js",
      type: "module"
    },
    content_scripts: [
      {
        js: ["content.js"],
        matches: ["<all_urls>"],
        run_at: "document_start",
        all_frames: true
      }
    ],
    web_accessible_resources: [
      {
        resources: ["provider.js", "inject.js"],
        matches: ["<all_urls>"]
      }
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    }
  };
  
  // 写入 manifest.json
  fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Generated manifest.json');
  
  console.log('Chrome Extension built successfully!');
  console.log('Files in dist directory:');
  
  const distFiles = fs.readdirSync('dist');
  distFiles.forEach(file => {
    const stats = fs.statSync(`dist/${file}`);
    if (stats.isFile()) {
      const size = (stats.size / 1024).toFixed(2);
      console.log(`  ${file} (${size} KB)`);
    }
  });
  
  console.log('\nTo load the extension in Chrome:');
  console.log('1. Open Chrome and go to chrome://extensions/');
  console.log('2. Enable "Developer mode"');
  console.log('3. Click "Load unpacked" and select the "dist" folder');
}

// 运行构建
buildExtension().catch(console.error);
