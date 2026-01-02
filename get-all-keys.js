/**
 * 查看数据库中所有 key 的详细内容
 * 用于调试和查找 API Key 存储位置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

async function getAllKeys() {
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
    
    // 查询所有包含 secret:// 的 key
    const secretKeys = db.exec(`SELECT key, value FROM ItemTable WHERE key LIKE 'secret://%'`);
    
    console.log('\n🔐 找到的加密 key:');
    if (secretKeys && secretKeys.length > 0) {
      secretKeys[0].values.forEach((row, index) => {
        const key = row[0];
        const value = row[1];
        console.log(`\n${index + 1}. Key: ${key}`);
        
        // 尝试解析 key 中的 JSON
        try {
          const keyMatch = key.match(/secret:\/\/(.+)/);
          if (keyMatch) {
            const keyInfo = JSON.parse(keyMatch[1]);
            console.log('   Extension ID:', keyInfo.extensionId);
            console.log('   Key Name:', keyInfo.key);
          }
        } catch (e) {
          console.log('   无法解析 key');
        }
        
        // 显示值的类型和长度
        if (value) {
          console.log('   Value Type:', typeof value);
          console.log('   Value Length:', value.length);
          
          // 如果是 Buffer，显示前几个字节
          if (Buffer.isBuffer(value)) {
            console.log('   Value (hex):', value.slice(0, 50).toString('hex'));
          } else if (typeof value === 'string') {
            console.log('   Value (preview):', value.substring(0, 100));
          }
        }
      });
    } else {
      console.log('  未找到加密的 key');
    }
    
    // 查询所有包含 codeium 的 key
    console.log('\n\n🔍 找到的 codeium 相关 key:');
    const codeiumKeys = db.exec(`SELECT key, value FROM ItemTable WHERE key LIKE '%codeium%'`);
    
    if (codeiumKeys && codeiumKeys.length > 0) {
      codeiumKeys[0].values.forEach((row, index) => {
        const key = row[0];
        const value = row[1];
        console.log(`\n${index + 1}. Key: ${key}`);
        
        if (value) {
          try {
            const parsed = JSON.parse(value);
            console.log('   Value:', JSON.stringify(parsed, null, 2).substring(0, 500));
          } catch (e) {
            console.log('   Value (非 JSON):', String(value).substring(0, 200));
          }
        }
      });
    } else {
      console.log('  未找到 codeium 相关的 key');
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

getAllKeys();
