/**
 * 实时监控 Windsurf 日志，自动捕获最新的 API Key
 * 保持运行，当检测到新的 API Key 时自动显示
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 实时监控 Windsurf API Key...\n');
console.log('=' .repeat(60));
console.log('\n📋 使用说明：');
console.log('1. 保持此窗口打开');
console.log('2. 在 Windsurf 中使用 Cascade 发送任意问题');
console.log('3. 脚本会自动捕获并显示 API Key');
console.log('4. 按 Ctrl+C 停止监控\n');
console.log('=' .repeat(60));
console.log('\n⏳ 等待 API Key...\n');

const logBasePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf', 'logs');
const apiKeyPattern = /sk-ws-\d+-[A-Za-z0-9_-]+/g;

let foundKeys = new Set();
let lastCheckTime = Date.now();

function checkLogFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    
    // 只检查最近修改的文件
    if (stat.mtimeMs < lastCheckTime - 60000) {
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(apiKeyPattern);
    
    if (matches) {
      matches.forEach(key => {
        if (key.length > 50 && !foundKeys.has(key)) {
          foundKeys.add(key);
          
          const now = new Date();
          const timeStr = now.toLocaleString('zh-CN');
          
          console.log('🎉 检测到新的 API Key!\n');
          console.log('=' .repeat(60));
          console.log(`⏰ 时间: ${timeStr}`);
          console.log(`📝 文件: ${path.basename(filePath)}`);
          console.log(`🔑 API Key:\n\n${key}\n`);
          console.log('=' .repeat(60));
          console.log('\n✅ 已复制到下方，可直接使用：');
          console.log(`\n${key}\n`);
          console.log('=' .repeat(60));
          console.log('\n💡 继续监控中... (按 Ctrl+C 停止)\n');
        }
      });
    }
  } catch (error) {
    // 忽略错误
  }
}

function scanLogs() {
  if (!fs.existsSync(logBasePath)) {
    return;
  }
  
  function scanDir(dirPath, depth = 0) {
    if (depth > 5) return;
    
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (stat.isFile() && file.endsWith('.log')) {
            // 只检查最近 5 分钟内修改的文件
            const minutesSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60);
            if (minutesSinceModified < 5) {
              checkLogFile(fullPath);
            }
          }
        } catch (e) {
          // 忽略
        }
      }
    } catch (error) {
      // 忽略
    }
  }
  
  scanDir(logBasePath);
  lastCheckTime = Date.now();
}

// 每 2 秒扫描一次
const interval = setInterval(() => {
  scanLogs();
}, 2000);

// 初始扫描
scanLogs();

// 处理 Ctrl+C
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n\n👋 监控已停止\n');
  
  if (foundKeys.size > 0) {
    console.log('📊 本次监控共找到 ' + foundKeys.size + ' 个 API Key\n');
  } else {
    console.log('💡 提示：未检测到 API Key');
    console.log('   请确保在 Windsurf 中使用了 AI 功能\n');
  }
  
  process.exit(0);
});

// 保持进程运行
process.stdin.resume();
