/**
 * 高级 API Key 获取脚本
 * 尝试所有可能的方式获取 Windsurf API Key
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

async function getAllPossibleApiKeys() {
  try {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    const windsurfPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf');
    const dbPath = path.join(windsurfPath, 'User', 'globalStorage', 'state.vscdb');
    
    console.log('📂 数据库路径:', dbPath);
    
    if (!fs.existsSync(dbPath)) {
      throw new Error('未找到数据库文件');
    }
    
    const filebuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(filebuffer);
    
    console.log('\n🔍 开始全面扫描数据库...\n');
    
    // 1. 查询所有可能包含 API Key 的字段
    const allData = db.exec(`SELECT key, value FROM ItemTable`);
    
    const apiKeyPatterns = [
      { pattern: /sk-ws-\d+-[A-Za-z0-9_-]+/g, name: 'Windsurf API Key (sk-ws-)', priority: 1 },
      { pattern: /"apiKey"\s*:\s*"(sk-ws-[^"]+)"/g, name: 'JSON apiKey (sk-ws-)', priority: 1 },
      { pattern: /"accessToken"\s*:\s*"(sk-ws-[^"]+)"/g, name: 'JSON accessToken (sk-ws-)', priority: 1 },
      { pattern: /sk-[A-Za-z0-9_-]{48,}/g, name: '通用 API Key', priority: 2 },
      { pattern: /"apiKey"\s*:\s*"([^"]+)"/g, name: 'JSON apiKey', priority: 3 },
      { pattern: /"accessToken"\s*:\s*"([^"]+)"/g, name: 'JSON accessToken', priority: 3 },
      { pattern: /"token"\s*:\s*"([^"]+)"/g, name: 'JSON token', priority: 3 }
    ];
    
    const foundKeys = new Map();
    
    if (allData && allData.length > 0) {
      allData[0].values.forEach((row) => {
        const key = row[0];
        const value = row[1];
        
        if (!value || typeof value !== 'string') return;
        
        // 尝试所有模式
        apiKeyPatterns.forEach((patternObj, index) => {
          const matches = value.matchAll(patternObj.pattern);
          for (const match of matches) {
            const apiKey = match[1] || match[0];
            if (apiKey && apiKey.length > 20) {
              if (!foundKeys.has(apiKey)) {
                foundKeys.set(apiKey, {
                  key: key,
                  patternName: patternObj.name,
                  priority: patternObj.priority,
                  value: apiKey,
                  fullValue: value.substring(0, 500)
                });
              }
            }
          }
        });
      });
    }
    
    db.close();
    
    console.log('✅ 扫描完成！\n');
    
    if (foundKeys.size === 0) {
      console.log('❌ 未找到任何 API Key');
      console.log('\n💡 建议：');
      console.log('1. 确认 Windsurf 已登录');
      console.log('2. 在 Windsurf 中使用一次 AI 功能（触发 API 请求）');
      console.log('3. 使用开发者工具查看网络请求中的 Authorization 头');
      return;
    }
    
    // 按优先级排序
    const sortedKeys = Array.from(foundKeys.entries()).sort((a, b) => {
      return a[1].priority - b[1].priority;
    });
    
    console.log(`🎉 找到 ${foundKeys.size} 个可能的 API Key:\n`);
    
    sortedKeys.forEach(([apiKey, info], index) => {
      const isWindsurf = apiKey.startsWith('sk-ws-');
      const prefix = isWindsurf ? '🎯' : '⚪';
      
      console.log(`${prefix} ${index + 1}. API Key: ${apiKey}`);
      console.log(`   来源 Key: ${info.key}`);
      console.log(`   匹配模式: ${info.patternName}`);
      console.log(`   优先级: ${info.priority === 1 ? '⭐ 高 (Windsurf 格式)' : info.priority === 2 ? '🟡 中' : '🔵 低'}`);
      if (isWindsurf) {
        console.log(`   ✅ 这是 Windsurf 的 API Key！`);
      }
      console.log('');
    });
    
    // 查找 Windsurf 格式的 API Key
    const windsurfKeys = sortedKeys.filter(([key]) => key.startsWith('sk-ws-'));
    if (windsurfKeys.length > 0) {
      console.log('🎯 找到 Windsurf API Key：');
      windsurfKeys.forEach(([apiKey]) => {
        console.log(`\n🔑 ${apiKey}\n`);
      });
    } else if (foundKeys.size === 1) {
      const apiKey = Array.from(foundKeys.keys())[0];
      console.log('⚠️ 未找到 sk-ws- 开头的 API Key，但找到了：');
      console.log(`\n🔑 ${apiKey}\n`);
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

// 额外：检查配置文件
function checkConfigFiles() {
  console.log('\n📄 检查配置文件...\n');
  
  const configPaths = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf', 'User', 'settings.json'),
    path.join(os.homedir(), '.codeium', 'config.json'),
    path.join(os.homedir(), '.codeium', 'windsurf', 'config.json')
  ];
  
  configPaths.forEach(configPath => {
    if (fs.existsSync(configPath)) {
      console.log(`✅ 找到配置文件: ${configPath}`);
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const apiKeyMatch = content.match(/sk-ws-\d+-[A-Za-z0-9_-]+/);
        if (apiKeyMatch) {
          console.log(`   🔑 发现 API Key: ${apiKeyMatch[0]}`);
        }
      } catch (e) {
        console.log(`   ⚠️ 读取失败: ${e.message}`);
      }
    }
  });
}

async function main() {
  console.log('🚀 高级 API Key 获取工具\n');
  console.log('=' .repeat(60));
  
  await getAllPossibleApiKeys();
  checkConfigFiles();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✨ 扫描完成！');
}

main();
