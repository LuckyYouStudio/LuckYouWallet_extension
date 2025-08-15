const fs = require('fs');
const path = require('path');

// 测试脚本 - 验证构建的扩展
function testExtension() {
  console.log('Testing Chrome Extension build...');
  
  const distPath = 'dist';
  
  // 检查 dist 目录是否存在
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist directory not found');
    return false;
  }
  
  // 检查必需文件
  const requiredFiles = [
    'manifest.json',
    'popup.html',
    'popup.js',
    'content.js',
    'background.js',
    'provider.js'
  ];
  
  let allFilesExist = true;
  requiredFiles.forEach(file => {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - missing`);
      allFilesExist = false;
    }
  });
  
  // 检查图标目录
  const iconsPath = path.join(distPath, 'icons');
  if (fs.existsSync(iconsPath)) {
    const iconFiles = fs.readdirSync(iconsPath);
    const iconCount = iconFiles.filter(file => file.endsWith('.png')).length;
    if (iconCount >= 5) {
      console.log(`✅ icons/ (${iconCount} icon files)`);
    } else {
      console.log(`❌ icons/ - insufficient icon files (${iconCount}/5)`);
      allFilesExist = false;
    }
  } else {
    console.log('❌ icons/ - directory missing');
    allFilesExist = false;
  }
  
  // 检查 manifest.json 内容
  try {
    const manifestPath = path.join(distPath, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    // 验证 manifest 结构
    const requiredManifestFields = [
      'manifest_version',
      'name',
      'version',
      'action',
      'background',
      'content_scripts',
      'web_accessible_resources'
    ];
    
    let manifestValid = true;
    requiredManifestFields.forEach(field => {
      if (manifest[field]) {
        console.log(`✅ manifest.${field}`);
      } else {
        console.log(`❌ manifest.${field} - missing`);
        manifestValid = false;
      }
    });
    
    if (manifestValid) {
      console.log('✅ manifest.json structure valid');
    } else {
      console.log('❌ manifest.json structure invalid');
      allFilesExist = false;
    }
    
  } catch (error) {
    console.error('❌ manifest.json - parse error:', error.message);
    allFilesExist = false;
  }
  
  // 检查文件大小
  console.log('\n📊 File sizes:');
  const files = fs.readdirSync(distPath);
  files.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  ${file}: ${sizeKB} KB`);
    }
  });
  
  // 总结
  console.log('\n' + '='.repeat(50));
  if (allFilesExist) {
    console.log('🎉 Extension build test PASSED!');
    console.log('\nTo load the extension:');
    console.log('1. Open Chrome and go to chrome://extensions/');
    console.log('2. Enable "Developer mode"');
    console.log('3. Click "Load unpacked" and select the "dist" folder');
    return true;
  } else {
    console.log('❌ Extension build test FAILED!');
    console.log('Please check the missing files and rebuild.');
    return false;
  }
}

// 运行测试
if (require.main === module) {
  testExtension();
}

module.exports = { testExtension };
