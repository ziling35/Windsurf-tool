/**
 * 从 Windsurf 日志文件中查找 API Key
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 从 Windsurf 日志中查找 API Key...\n');

// 日志文件路径
const logPaths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf', 'logs'),
  path.join(os.homedir(), '.codeium', 'logs'),
  path.join(os.homedir(), 'AppData', 'Local', 'Windsurf', 'logs')
];

// 查找 API Key 的正则表达式
const apiKeyPattern = /sk-ws-\d+-[A-Za-z0-9_-]+/g;
const authHeaderPattern = /Authorization.*?Bearer\s+(sk-ws-[^\s"']+)/gi;

let foundKeys = new Set();

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 查找直接的 API Key
    let matches = content.match(apiKeyPattern);
    if (matches) {
      matches.forEach(key => foundKeys.add(key));
    }
    
    // 查找 Authorization 头中的 API Key
    const authMatches = [...content.matchAll(authHeaderPattern)];
    authMatches.forEach(match => {
      if (match[1]) {
        foundKeys.add(match[1]);
      }
    });
    
  } catch (error) {
    // 忽略无法读取的文件
  }
}

function searchDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  
  console.log(`📂 搜索: ${dirPath}`);
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 递归搜索子目录
          searchDirectory(fullPath);
        } else if (stat.isFile() && file.endsWith('.log')) {
          // 只搜索最近修改的日志文件（24小时内）
          const hoursSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
          if (hoursSinceModified < 24) {
            searchInFile(fullPath);
          }
        }
      } catch (e) {
        // 忽略无法访问的文件
      }
    }
  } catch (error) {
    console.log(`  ⚠️  无法访问目录: ${error.message}`);
  }
}

// 搜索所有日志目录
logPaths.forEach(logPath => {
  searchDirectory(logPath);
});

console.log('\n' + '='.repeat(60));

if (foundKeys.size === 0) {
  console.log('\n❌ 未在日志中找到 API Key\n');
  console.log('💡 建议：');
  console.log('1. 确保 Windsurf 正在运行');
  console.log('2. 在 Windsurf 中使用 Cascade 发送一个 AI 请求');
  console.log('3. 等待几秒后重新运行此脚本');
  console.log('4. 或使用菜单打开开发者工具：Help -> Toggle Developer Tools\n');
} else {
  console.log(`\n✅ 找到 ${foundKeys.size} 个 API Key:\n`);
  
  Array.from(foundKeys).forEach((key, index) => {
    console.log(`${index + 1}. 🔑 ${key}`);
  });
  
  console.log('\n💡 如果找到多个，请使用最新的一个。\n');
}

console.log('='.repeat(60) + '\n');
