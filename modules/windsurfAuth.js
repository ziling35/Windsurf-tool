/**
 * Windsurf 认证模块
 * 参考 windsurf-switcher 的实现方式，直接操作 state.vscdb 数据库
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class WindsurfAuth {
  constructor() {
    this.dbPath = this.getDbPath();
  }

  /**
   * 获取 state.vscdb 数据库路径
   */
  getDbPath() {
    const appData = process.env.APPDATA || '';
    return path.join(appData, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
  }

  /**
   * 检查数据库是否存在
   */
  checkDbExists() {
    return fs.existsSync(this.dbPath);
  }

  /**
   * 从 callback_url 解析 access_token
   * 格式: windsurf://codeium.windsurf#access_token=xxx&state=xxx&token_type=Bearer
   */
  parseCallbackUrl(callbackUrl) {
    try {
      const hashPart = callbackUrl.split('#')[1];
      if (!hashPart) return null;

      const params = new URLSearchParams(hashPart);
      return {
        accessToken: params.get('access_token'),
        state: params.get('state'),
        tokenType: params.get('token_type')
      };
    } catch (e) {
      console.error('解析callback_url失败:', e);
      return null;
    }
  }

  /**
   * 写入登录信息到数据库
   * @param {string} callbackUrl - windsurf:// 格式的登录URL
   * @param {string} email - 账号邮箱
   */
  async login(callbackUrl, email) {
    if (!this.checkDbExists()) {
      return { success: false, message: 'state.vscdb 数据库不存在，请先启动一次 Windsurf' };
    }

    const parsed = this.parseCallbackUrl(callbackUrl);
    if (!parsed || !parsed.accessToken) {
      return { success: false, message: '无效的登录URL' };
    }

    try {
      const db = new Database(this.dbPath);

      // 构造认证状态数据
      const authStatus = JSON.stringify({
        status: 'logged_in',
        email: email,
        token: parsed.accessToken,
        tokenType: parsed.tokenType || 'Bearer'
      });

      // 写入 windsurfAuthStatus
      const stmt = db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)');
      stmt.run('windsurfAuthStatus', authStatus);

      // 写入 secret 存储
      const secretKey = `secret://codeium.windsurf/auth`;
      stmt.run(secretKey, parsed.accessToken);

      db.close();

      return { success: true, message: '登录信息已写入' };
    } catch (e) {
      console.error('写入数据库失败:', e);
      return { success: false, message: `数据库写入失败: ${e.message}` };
    }
  }

  /**
   * 清除登录信息
   */
  async logout() {
    if (!this.checkDbExists()) {
      return { success: false, message: 'state.vscdb 数据库不存在' };
    }

    try {
      const db = new Database(this.dbPath);

      // 删除认证相关的键
      const stmt = db.prepare("DELETE FROM ItemTable WHERE key LIKE '%secret%' OR key = 'windsurfAuthStatus' OR key = 'codeium.windsurf'");
      const result = stmt.run();

      db.close();

      return { success: true, message: `已清除 ${result.changes} 条认证记录` };
    } catch (e) {
      console.error('清除认证失败:', e);
      return { success: false, message: `清除失败: ${e.message}` };
    }
  }

  /**
   * 检查当前登录状态
   */
  async checkLoginStatus() {
    if (!this.checkDbExists()) {
      return { loggedIn: false, message: 'state.vscdb 不存在' };
    }

    try {
      const db = new Database(this.dbPath);

      const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus'");
      const row = stmt.get();

      db.close();

      if (row && row.value) {
        try {
          const data = JSON.parse(row.value);
          return { loggedIn: true, email: data.email || '未知' };
        } catch {
          return { loggedIn: false };
        }
      }

      return { loggedIn: false };
    } catch (e) {
      return { loggedIn: false, message: e.message };
    }
  }
}

module.exports = WindsurfAuth;
