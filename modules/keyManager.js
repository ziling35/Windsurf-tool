/**
 * 秘钥管理器
 * 管理激活秘钥和查询剩余时间
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置 API 端点 - 可在此处统一修改
const API_CONFIG = {
  // Base URL - 后端服务地址
  BASE_URL: 'http://103.97.178.131:8000/api/client',
  
  // 超时时间（毫秒）
  TIMEOUT: 10000
};

class KeyManager {
  constructor(appDataPath) {
    this.appDataPath = appDataPath;
    this.keyFilePath = path.join(appDataPath, 'activation-key.json');
    this.keyData = this.loadKey();
  }

  /**
   * 加载保存的秘钥
   */
  loadKey() {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const data = fs.readFileSync(this.keyFilePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('加载秘钥失败:', error);
    }

    return {
      key: null,
      savedAt: null,
      lastChecked: null,
      expiresAt: null
    };
  }

  /**
   * 保存秘钥到本地
   */
  saveKey(key) {
    try {
      if (!fs.existsSync(this.appDataPath)) {
        fs.mkdirSync(this.appDataPath, { recursive: true });
      }

      this.keyData = {
        key: key,
        savedAt: new Date().toISOString(),
        lastChecked: null,
        expiresAt: null
      };

      fs.writeFileSync(this.keyFilePath, JSON.stringify(this.keyData, null, 2));
      console.log('✅ 秘钥已保存');
      return true;
    } catch (error) {
      console.error('保存秘钥失败:', error);
      return false;
    }
  }

  /**
   * 获取当前秘钥
   */
  getKey() {
    return this.keyData.key;
  }

  /**
   * 检查秘钥是否已保存
   */
  hasKey() {
    return !!this.keyData.key;
  }

  /**
   * 查询秘钥状态
   * @returns {Promise<Object>} 包含剩余时间等信息
   */
  async checkKeyStatus() {
    if (!this.keyData.key) {
      return {
        success: false,
        message: '未设置秘钥'
      };
    }

    try {
      const response = await axios.get(
        API_CONFIG.BASE_URL + '/key/status',
        {
          timeout: API_CONFIG.TIMEOUT,
          headers: {
            'X-API-Key': this.keyData.key
          }
        }
      );

      // 更新最后检查时间
      this.keyData.lastChecked = new Date().toISOString();
      
      if (response.data && response.data.expires_at) {
        this.keyData.expiresAt = response.data.expires_at;
      }
      
      this.saveKeyData();

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('查询秘钥状态失败:', error);
      
      let message = '查询失败';
      if (error.response) {
        message = error.response.data?.detail || error.response.data?.message || `服务器错误 (${error.response.status})`;
      } else if (error.code === 'ECONNABORTED') {
        message = '请求超时';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        message = '无法连接到服务器';
      }

      return {
        success: false,
        message: message,
        statusCode: error.response?.status
      };
    }
  }

  /**
   * 获取账号
   * @returns {Promise<Object>} 包含账号信息
   */
  async getAccount() {
    if (!this.keyData.key) {
      return {
        success: false,
        message: '未设置秘钥'
      };
    }

    try {
      console.log('🔄 正在请求获取账号...');
      console.log('📡 API地址:', API_CONFIG.BASE_URL + '/account/get');
      
      const response = await axios.post(
        API_CONFIG.BASE_URL + '/account/get',
        {},
        {
          timeout: API_CONFIG.TIMEOUT,
          headers: {
            'X-API-Key': this.keyData.key
          }
        }
      );

      console.log('✅ 获取账号成功:', response.data);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ 获取账号失败 - 详细信息:');
      console.error('错误类型:', error.name);
      console.error('错误消息:', error.message);
      console.error('错误代码:', error.code);
      
      let message = '获取账号失败';
      let statusCode = null;
      
      if (error.response) {
        // 服务器返回了响应
        statusCode = error.response.status;
        console.error('HTTP状态码:', statusCode);
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        console.error('响应头:', error.response.headers);
        
        // 提取详细错误信息
        const errorData = error.response.data;
        message = errorData?.detail || errorData?.message || errorData?.error || `服务器错误 (${statusCode})`;
        
        // 如果是对象格式的错误，尝试提取更多信息
        if (typeof errorData === 'object' && errorData !== null) {
          console.error('错误详情:', errorData);
        }
      } else if (error.request) {
        // 请求已发出但未收到响应
        console.error('未收到服务器响应');
        console.error('请求配置:', error.config);
        
        if (error.code === 'ECONNABORTED') {
          message = '请求超时，请检查网络连接';
        } else if (error.code === 'ENOTFOUND') {
          message = '无法连接到服务器 (DNS解析失败)';
        } else if (error.code === 'ECONNREFUSED') {
          message = '服务器拒绝连接';
        } else if (error.code === 'ETIMEDOUT') {
          message = '连接超时';
        } else {
          message = `网络错误: ${error.message}`;
        }
      } else {
        // 请求配置错误
        console.error('请求配置错误:', error.message);
        message = `请求失败: ${error.message}`;
      }

      return {
        success: false,
        message: message,
        statusCode: statusCode,
        errorCode: error.code,
        errorDetails: error.response?.data
      };
    }
  }

  /**
   * 使用秘钥发起请求
   * @param {Object} params 额外参数
   * @returns {Promise<Object>}
   */
  async useKey(params = {}) {
    if (!this.keyData.key) {
      return {
        success: false,
        message: '未设置秘钥'
      };
    }

    try {
      const response = await axios.post(
        API_CONFIG.BASE_URL + '/key/use',
        {
          key: this.keyData.key,
          ...params
        },
        {
          timeout: API_CONFIG.TIMEOUT,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('使用秘钥请求失败:', error);
      
      let message = '请求失败';
      if (error.response) {
        message = error.response.data?.message || `服务器错误 (${error.response.status})`;
      } else if (error.code === 'ECONNABORTED') {
        message = '请求超时';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        message = '无法连接到服务器';
      }

      return {
        success: false,
        message: message
      };
    }
  }

  /**
   * 保存秘钥数据（不修改秘钥本身）
   */
  saveKeyData() {
    try {
      fs.writeFileSync(this.keyFilePath, JSON.stringify(this.keyData, null, 2));
      return true;
    } catch (error) {
      console.error('保存秘钥数据失败:', error);
      return false;
    }
  }

  /**
   * 清除秘钥
   */
  clearKey() {
    this.keyData = {
      key: null,
      savedAt: null,
      lastChecked: null,
      expiresAt: null
    };
    
    try {
      if (fs.existsSync(this.keyFilePath)) {
        fs.unlinkSync(this.keyFilePath);
      }
      return true;
    } catch (error) {
      console.error('清除秘钥失败:', error);
      return false;
    }
  }

  /**
   * 获取秘钥信息
   */
  getKeyInfo() {
    return {
      hasKey: this.hasKey(),
      key: this.keyData.key,
      savedAt: this.keyData.savedAt,
      lastChecked: this.keyData.lastChecked,
      expiresAt: this.keyData.expiresAt
    };
  }

  /**
   * 更新 API 配置（静态方法）
   * @param {Object} config 
   */
  static updateAPIConfig(config) {
    if (config.BASE_URL) {
      API_CONFIG.BASE_URL = config.BASE_URL;
    }
    if (config.TIMEOUT) {
      API_CONFIG.TIMEOUT = config.TIMEOUT;
    }
  }

  /**
   * 获取当前 API 配置（静态方法）
   */
  static getAPIConfig() {
    return { ...API_CONFIG };
  }

  /**
   * 检查版本更新
   * @param {string} clientVersion 客户端版本号
   * @returns {Promise<Object>} 版本信息
   */
  static async checkVersion(clientVersion) {
    try {
      const response = await axios.get(
        API_CONFIG.BASE_URL + '/version',
        {
          timeout: API_CONFIG.TIMEOUT,
          params: {
            client_version: clientVersion
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('检查版本失败:', error);
      
      let message = '检查版本失败';
      if (error.response) {
        message = error.response.data?.detail || error.response.data?.message || `服务器错误 (${error.response.status})`;
      } else if (error.code === 'ECONNABORTED') {
        message = '请求超时';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        message = '无法连接到服务器';
      }

      return {
        success: false,
        message: message
      };
    }
  }
}

module.exports = KeyManager;
