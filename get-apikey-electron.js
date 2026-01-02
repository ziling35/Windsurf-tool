/**
 * 使用 Electron safeStorage 解密获取 Windsurf API Key
 * 需要在 Electron 环境中运行
 */

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 设置 userData 路径为 Windsurf 的路径
const windsurfUserDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf');
app.setPath('userData', windsurfUserDataPath);

async function getApiKey() {
  try {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    const dbPath = path.join(windsurfUserDataPath, 'User', 'globalStorage', 'state.vscdb');
    
    console.log('📂 数据库路径:', dbPath);
    
    if (!fs.existsSync(dbPath)) {
      throw new Error('未找到数据库文件');
    }
    
    const filebuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(filebuffer);
    
    // 尝试查找加密的 session key
    const encryptedSessionKey = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}';
    const results = db.exec(`SELECT value FROM ItemTable WHERE key = ?`, [encryptedSessionKey]);
    
    if (results && results.length > 0 && results[0].values.length > 0) {
      const encryptedValue = results[0].values[0][0];
      
      console.log('\n🔐 找到加密的 session 数据');
      console.log('加密数据类型:', typeof encryptedValue);
      
      // 解密数据
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(JSON.parse(encryptedValue).data);
          const decrypted = safeStorage.decryptString(buffer);
          const sessions = JSON.parse(decrypted);
          
          console.log('\n✅ 成功解密！');
          
          if (sessions && sessions.length > 0) {
            const session = sessions[0];
            console.log('\n📧 账号:', session.account?.id || 'Unknown');
            console.log('🏷️  标签:', session.account?.label || 'Unknown');
            console.log('🔑 API Key:', session.accessToken);
            console.log('🆔 Session ID:', session.id);
          }
        } catch (e) {
          console.error('❌ 解密失败:', e.message);
        }
      } else {
        console.error('❌ safeStorage 不可用');
      }
    } else {
      console.log('⚠️ 未找到加密的 session 数据');
      
      // 尝试查找其他可能的 key
      console.log('\n🔍 尝试查找其他认证信息...');
      
      // 查找所有包含 secret:// 的 key
      const allSecrets = db.exec(`SELECT key FROM ItemTable WHERE key LIKE 'secret://%'`);
      if (allSecrets && allSecrets.length > 0) {
        console.log('\n找到的加密 key:');
        allSecrets[0].values.forEach((row, index) => {
          console.log(`  ${index + 1}. ${row[0]}`);
        });
      }
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
  
  app.quit();
}

app.whenReady().then(getApiKey);
