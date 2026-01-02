/**
 * 获取 Windsurf 当前登录账号的 API Key
 * 独立脚本，可直接运行
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 获取 Windsurf 用户数据路径
 */
function getWindsurfPath() {
  const platform = process.platform;
  let windsurfPath;

  if (process.env.WINDSURF_USER_DATA) {
    windsurfPath = process.env.WINDSURF_USER_DATA;
  } else {
    if (platform === 'win32') {
      windsurfPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf');
    } else if (platform === 'darwin') {
      windsurfPath = path.join(os.homedir(), 'Library', 'Application Support', 'Windsurf');
    } else {
      windsurfPath = path.join(os.homedir(), '.config', 'Windsurf');
    }
  }
  
  return windsurfPath;
}

/**
 * 读取 Windsurf 当前登录账号的 API Key
 * @param {boolean} debug - 是否启用调试模式
 */
async function getWindsurfApiKey(debug = false) {
  try {
    // 动态加载 sql.js
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    const windsurfPath = getWindsurfPath();
    const dbPath = path.join(windsurfPath, 'User', 'globalStorage', 'state.vscdb');
    
    console.log('📂 Windsurf 路径:', windsurfPath);
    console.log('📂 数据库路径:', dbPath);
    
    // 检查数据库文件是否存在
    if (!fs.existsSync(dbPath)) {
      throw new Error('未找到 state.vscdb 文件，请确认 Windsurf 已安装并登录');
    }
    
    // 读取数据库
    const filebuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(filebuffer);
    
    // 调试模式：显示所有 key
    if (debug) {
      console.log('\n🔍 调试模式：显示数据库中所有的 key:');
      const allKeys = db.exec(`SELECT key FROM ItemTable`);
      if (allKeys && allKeys.length > 0) {
        allKeys[0].values.forEach((row, index) => {
          console.log(`  ${index + 1}. ${row[0]}`);
        });
      }
      console.log('');
    }
    
    // 尝试多个可能的 key
    const possibleKeys = [
      'codeium.windsurf',
      'windsurfAuthStatus',
      'windsurfConfigurations',
      'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}',
      'windsurf.settings.cachedPlanInfo'
    ];
    
    // 同时查找所有包含 auth、windsurf、session 等关键词的 key
    const allKeysResult = db.exec(`SELECT key, value FROM ItemTable WHERE key LIKE '%auth%' OR key LIKE '%windsurf_auth%'`);
    if (allKeysResult && allKeysResult.length > 0 && debug) {
      console.log('\n🔍 找到包含 auth 的 key 及其内容:');
      allKeysResult[0].values.forEach((row, index) => {
        const key = row[0];
        const value = row[1];
        console.log(`\n  ${index + 1}. Key: ${key}`);
        try {
          if (value && typeof value === 'string') {
            // 尝试解析 JSON
            const parsed = JSON.parse(value);
            console.log('     Value:', JSON.stringify(parsed, null, 2).substring(0, 800));
          } else {
            console.log('     Value:', String(value).substring(0, 200));
          }
        } catch (e) {
          console.log('     Value (非 JSON):', String(value).substring(0, 200));
        }
      });
      console.log('');
    }
    
    let accountData = null;
    let usedKey = null;
    
    for (const key of possibleKeys) {
      const results = db.exec(`SELECT value FROM ItemTable WHERE key = ?`, [key]);
      
      if (results && results.length > 0 && results[0].values.length > 0) {
        const value = results[0].values[0][0];
        
        if (value) {
          try {
            const data = JSON.parse(value);
            
            if (debug) {
              console.log(`\n📝 找到 key: ${key}`);
              console.log('数据内容:', JSON.stringify(data, null, 2).substring(0, 500));
            }
            
            // 尝试从不同的数据结构中提取 API Key
            if (key === 'codeium.windsurf' && data['windsurf_auth.sessions']) {
              const sessions = JSON.parse(data['windsurf_auth.sessions']);
              if (sessions && sessions.length > 0) {
                accountData = {
                  email: sessions[0].account?.id || 'Unknown',
                  label: sessions[0].account?.label || 'Unknown',
                  apiKey: sessions[0].accessToken,
                  sessionId: sessions[0].id
                };
                usedKey = key;
                break;
              }
            } else if (key === 'windsurfAuthStatus') {
              // 尝试从 windsurfAuthStatus 提取
              if (data.apiKey || data.accessToken || data.token) {
                accountData = {
                  email: data.email || data.user?.email || data.account?.id || 'Unknown',
                  label: data.label || data.user?.name || data.account?.label || 'Unknown',
                  apiKey: data.apiKey || data.accessToken || data.token,
                  sessionId: data.sessionId || data.id || 'Unknown'
                };
                usedKey = key;
                break;
              }
            } else if (key === 'windsurfConfigurations') {
              // 尝试从 windsurfConfigurations 提取
              if (data.auth || data.session) {
                const authData = data.auth || data.session;
                if (authData.apiKey || authData.accessToken || authData.token) {
                  accountData = {
                    email: authData.email || authData.user?.email || 'Unknown',
                    label: authData.label || authData.user?.name || 'Unknown',
                    apiKey: authData.apiKey || authData.accessToken || authData.token,
                    sessionId: authData.sessionId || authData.id || 'Unknown'
                  };
                  usedKey = key;
                  break;
                }
              }
            } else if (key.startsWith('secret://')) {
              // 处理加密的 session 数据
              // 注意：这里的数据可能是加密的，需要特殊处理
              if (debug) {
                console.log('\n⚠️ 发现加密数据，需要使用 Electron safeStorage 解密');
              }
            } else if (key === 'windsurf.settings.cachedPlanInfo') {
              // 尝试从缓存的计划信息中提取
              if (data.apiKey || data.accessToken) {
                accountData = {
                  email: data.email || 'Unknown',
                  label: data.label || 'Unknown',
                  apiKey: data.apiKey || data.accessToken,
                  sessionId: data.sessionId || 'Unknown'
                };
                usedKey = key;
                break;
              }
            }
          } catch (e) {
            if (debug) {
              console.log(`解析 ${key} 失败:`, e.message);
            }
          }
        }
      }
    }
    
    db.close();
    
    if (!accountData) {
      throw new Error('未找到账号信息，请确认 Windsurf 已登录\n提示：可以使用 --debug 参数查看数据库中所有的 key');
    }
    
    if (debug) {
      console.log(`\n✅ 成功从 ${usedKey} 提取账号信息`);
    }
    
    return {
      success: true,
      data: accountData
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 主函数
 */
async function main() {
  // 检查是否启用调试模式
  const debug = process.argv.includes('--debug') || process.argv.includes('-d');
  
  console.log('🔍 正在读取 Windsurf 账号信息...\n');
  
  const result = await getWindsurfApiKey(debug);
  
  if (result.success) {
    console.log('✅ 成功获取账号信息：\n');
    console.log('📧 账号:', result.data.email);
    console.log('🏷️  标签:', result.data.label);
    console.log('🔑 API Key:', result.data.apiKey);
    console.log('🆔 Session ID:', result.data.sessionId);
    console.log('\n💡 提示：API Key 已显示在上方，可直接复制使用');
  } else {
    console.error('❌ 获取失败:', result.error);
    console.error('\n💡 提示：可以使用 node get-windsurf-apikey.js --debug 查看详细信息');
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 发生错误:', err);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
module.exports = { getWindsurfApiKey, getWindsurfPath };
