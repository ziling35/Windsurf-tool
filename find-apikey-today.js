/**
 * 查找今天所有的 API Key（不限时间）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 查找今天所有的 Windsurf API Key...\n');

const logBasePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf', 'logs');
const apiKeyPattern = /sk-ws-\d+-[A-Za-z0-9_-]+/g;

let foundKeys = [];

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    
    const matches = content.match(apiKeyPattern);
    if (matches) {
      matches.forEach(key => {
        if (key.length > 50) {
          foundKeys.push({
            key: key.trim(),
            file: filePath,
            fileName: path.basename(filePath),
            dirName: path.basename(path.dirname(filePath)),
            time: stat.mtime,
            timeStr: stat.mtime.toLocaleString('zh-CN')
          });
        }
      });
    }
  } catch (error) {
    // 忽略
  }
}

function scanDir(dirPath, depth = 0) {
  if (depth > 5 || !fs.existsSync(dirPath)) return;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (stat.isFile() && file.endsWith('.log')) {
          // 检查今天的文件
          const today = new Date();
          const fileDate = new Date(stat.mtime);
          if (fileDate.toDateString() === today.toDateString()) {
            searchInFile(fullPath);
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

console.log('📂 搜索今天的所有日志文件...\n');
scanDir(logBasePath);

console.log('='.repeat(60));

if (foundKeys.length === 0) {
  console.log('\n❌ 今天的日志中未找到 API Key\n');
  console.log('💡 这可能意味着：');
  console.log('1. API Key 没有被记录到日志文件中');
  console.log('2. 或者存储在其他位置（如内存、加密存储等）\n');
  console.log('🔧 建议尝试：');
  console.log('1. 使用菜单打开开发者工具：Help -> Toggle Developer Tools');
  console.log('2. 在 Network 标签中查看 API 请求的 Authorization 头\n');
} else {
  // 去重并按时间排序
  const uniqueKeys = new Map();
  foundKeys.forEach(item => {
    if (!uniqueKeys.has(item.key) || uniqueKeys.get(item.key).time < item.time) {
      uniqueKeys.set(item.key, item);
    }
  });
  
  const sortedKeys = Array.from(uniqueKeys.values()).sort((a, b) => b.time - a.time);
  
  console.log(`\n✅ 今天找到 ${sortedKeys.length} 个不同的 API Key:\n`);
  
  sortedKeys.forEach((item, index) => {
    const isLatest = index === 0;
    const prefix = isLatest ? '🌟' : '  ';
    const label = isLatest ? ' [最新]' : '';
    
    console.log(`${prefix} ${index + 1}. ${item.timeStr}${label}`);
    console.log(`   📁 目录: ${item.dirName}`);
    console.log(`   📝 文件: ${item.fileName}`);
    console.log(`   🔑 API Key: ${item.key}`);
    console.log('');
  });
  
  if (sortedKeys.length > 0) {
    console.log('🎯 最新的 API Key：\n');
    console.log(`🔑 ${sortedKeys[0].key}\n`);
  }
}

console.log('='.repeat(60) + '\n');
