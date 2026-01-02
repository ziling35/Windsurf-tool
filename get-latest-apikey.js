/**
 * 获取最新的 Windsurf API Key
 * 从最近的日志文件中查找
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 获取最新的 Windsurf API Key...\n');

// 日志文件路径
const logBasePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf', 'logs');

// 查找 API Key 的正则表达式
const apiKeyPattern = /sk-ws-\d+-[A-Za-z0-9_-]+/g;
const authHeaderPattern = /Authorization.*?Bearer\s+(sk-ws-[^\s"']+)/gi;

let foundKeys = [];

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    
    // 查找直接的 API Key
    let matches = content.match(apiKeyPattern);
    if (matches) {
      matches.forEach(key => {
        // 确保 API Key 长度合理（至少 50 个字符）
        if (key.length > 50) {
          foundKeys.push({
            key: key.trim(),
            file: path.basename(filePath),
            time: stat.mtime,
            timeStr: stat.mtime.toLocaleString('zh-CN')
          });
        }
      });
    }
    
    // 查找 Authorization 头中的 API Key
    const authMatches = [...content.matchAll(authHeaderPattern)];
    authMatches.forEach(match => {
      if (match[1] && match[1].length > 50) {
        foundKeys.push({
          key: match[1].trim(),
          file: path.basename(filePath),
          time: stat.mtime,
          timeStr: stat.mtime.toLocaleString('zh-CN')
        });
      }
    });
    
  } catch (error) {
    // 忽略无法读取的文件
  }
}

function searchDirectory(dirPath, depth = 0) {
  if (!fs.existsSync(dirPath) || depth > 5) {
    return;
  }
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          searchDirectory(fullPath, depth + 1);
        } else if (stat.isFile() && file.endsWith('.log')) {
          // 只搜索最近 24 小时内修改的日志文件
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
    // 忽略无法访问的目录
  }
}

console.log('📂 搜索日志目录...\n');
searchDirectory(logBasePath);

console.log('='.repeat(60));

if (foundKeys.length === 0) {
  console.log('\n❌ 未找到 API Key\n');
  console.log('💡 建议：');
  console.log('1. 在 Windsurf 中使用 Cascade 发送一个 AI 请求');
  console.log('2. 等待几秒后重新运行此脚本\n');
} else {
  // 去重
  const uniqueKeys = new Map();
  foundKeys.forEach(item => {
    if (!uniqueKeys.has(item.key) || uniqueKeys.get(item.key).time < item.time) {
      uniqueKeys.set(item.key, item);
    }
  });
  
  // 按时间排序（最新的在前）
  const sortedKeys = Array.from(uniqueKeys.values()).sort((a, b) => b.time - a.time);
  
  console.log(`\n✅ 找到 ${sortedKeys.length} 个不同的 API Key（按时间排序）:\n`);
  
  sortedKeys.forEach((item, index) => {
    const isLatest = index === 0;
    const prefix = isLatest ? '🌟' : '  ';
    const label = isLatest ? ' [最新]' : '';
    
    console.log(`${prefix} ${index + 1}. ${item.timeStr}${label}`);
    console.log(`   📝 文件: ${item.file}`);
    console.log(`   🔑 API Key: ${item.key}`);
    console.log(`   📊 长度: ${item.key.length} 字符`);
    console.log('');
  });
  
  if (sortedKeys.length > 0) {
    console.log('🎯 推荐使用最新的 API Key：\n');
    console.log(`🔑 ${sortedKeys[0].key}\n`);
  }
}

console.log('='.repeat(60) + '\n');
