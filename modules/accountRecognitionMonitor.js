/**
 * 账号识别监控器
 * 监控 Windsurf 是否已识别账号，识别后自动删除本地账号信息
 */

const fs = require('fs');
const path = require('path');

class AccountRecognitionMonitor {
  constructor(windsurfPath, sessionManager) {
    this.windsurfPath = windsurfPath;
    this.sessionManager = sessionManager;
    this.dbPath = path.join(this.windsurfPath, 'User', 'globalStorage', 'state.vscdb');
    this.monitorInterval = null;
    this.checkIntervalMs = 2000; // 每2秒检查一次
    this.maxCheckCount = 60; // 最多检查60次（2分钟）
    this.currentCheckCount = 0;
    this.isMonitoring = false;
    
    // 输出初始化信息
    console.log('\n📋 === AccountRecognitionMonitor 初始化 ===');
    console.log('   Windsurf 路径:', this.windsurfPath);
    console.log('   数据库路径:', this.dbPath);
    console.log('   数据库文件存在:', fs.existsSync(this.dbPath));
  }

  /**
   * 检查 Windsurf 是否已识别账号
   * 通过检查数据库中是否存在 session 数据来判断
   */
  async checkAccountRecognized() {
    try {
      console.log('\n🔍 === 开始检查账号识别状态 ===');
      console.log('   数据库路径:', this.dbPath);
      
      if (!fs.existsSync(this.dbPath)) {
        console.log('⚠️ 数据库文件不存在，等待创建...');
        console.log('   请确认 Windsurf 是否已完全启动');
        return false;
      }
      
      // 检查数据库文件大小
      const stats = fs.statSync(this.dbPath);
      console.log('   数据库文件大小:', stats.size, 'bytes');
      console.log('   数据库文件修改时间:', stats.mtime);

      // 尝试读取 sessions
      console.log('\n📖 正在读取 session 数据...');
      const plainSessions = await this.sessionManager.readPlainSessions();
      const encryptedSessions = await this.sessionManager.readEncryptedSessions();
      
      console.log('   明文 sessions 读取结果:', plainSessions ? '成功' : '失败');
      console.log('   加密 sessions 读取结果:', encryptedSessions ? '成功' : '失败');

      // 如果读取到了 sessions 数据，说明 Windsurf 已经识别了账号
      const hasPlainSessions = plainSessions && plainSessions.sessions && plainSessions.sessions.length > 0;
      const hasEncryptedSessions = encryptedSessions && encryptedSessions.sessions && encryptedSessions.sessions.length > 0;
      
      console.log('   明文 sessions 数量:', hasPlainSessions ? plainSessions.sessions.length : 0);
      console.log('   加密 sessions 数量:', hasEncryptedSessions ? encryptedSessions.sessions.length : 0);

      if (hasPlainSessions || hasEncryptedSessions) {
        console.log('\n✅ === Windsurf 已识别账号 ===');
        if (hasPlainSessions) {
          console.log('   明文 sessions 详情:');
          plainSessions.sessions.forEach((session, index) => {
            console.log(`     [${index + 1}] ID: ${session.id || 'N/A'}`);
          });
        }
        if (hasEncryptedSessions) {
          console.log('   加密 sessions 详情:');
          encryptedSessions.sessions.forEach((session, index) => {
            console.log(`     [${index + 1}] ID: ${session.id || 'N/A'}`);
          });
        }
        return true;
      }
      
      console.log('❌ 未检测到 session 数据，Windsurf 尚未识别账号');
      return false;
    } catch (error) {
      console.error('\n❌ === 检查账号识别状态失败 ===');
      console.error('   错误信息:', error.message);
      console.error('   错误堆栈:', error.stack);
      return false;
    }
  }

  /**
   * 删除本地账号信息
   */
  async deleteLocalAccountInfo() {
    try {
      console.log('\n🗑️ === 开始删除本地账号信息 ===');
      
      // 使用 sessionManager 的 clearSessions 方法清除所有登录信息
      const result = await this.sessionManager.clearSessions();
      
      if (result.success) {
        console.log('✅ 本地账号信息已删除');
        console.log('   用户下次登录必须通过 PaperCrane 工具');
        return { success: true, message: '本地账号信息已删除' };
      } else {
        console.error('❌ 删除本地账号信息失败');
        return { success: false, message: '删除失败' };
      }
    } catch (error) {
      console.error('❌ 删除本地账号信息失败:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 启动监控
   * @param {Function} onRecognized - 账号识别后的回调函数
   * @param {Function} onTimeout - 超时后的回调函数
   */
  startMonitoring(onRecognized, onTimeout) {
    if (this.isMonitoring) {
      console.log('⚠️ 监控已在运行中');
      return;
    }

    console.log('\n👁️ === 启动账号识别监控 ===');
    console.log(`   检查间隔: ${this.checkIntervalMs}ms (${this.checkIntervalMs / 1000}秒)`);
    console.log(`   最大检查次数: ${this.maxCheckCount}`);
    console.log(`   预计最长监控时间: ${(this.maxCheckCount * this.checkIntervalMs) / 1000}秒`);
    console.log(`   数据库路径: ${this.dbPath}`);
    console.log(`   当前时间: ${new Date().toLocaleString()}`);
    
    this.isMonitoring = true;
    this.currentCheckCount = 0;

    this.monitorInterval = setInterval(async () => {
      this.currentCheckCount++;
      const progress = ((this.currentCheckCount / this.maxCheckCount) * 100).toFixed(1);
      console.log(`\n🔍 === 检查账号识别状态 (${this.currentCheckCount}/${this.maxCheckCount}) [${progress}%] ===`);
      console.log(`   当前时间: ${new Date().toLocaleString()}`);

      // 检查是否已识别账号
      const recognized = await this.checkAccountRecognized();

      if (recognized) {
        console.log('\n🎉 === 账号识别成功！===');
        console.log('   检查次数:', this.currentCheckCount);
        console.log('   用时:', (this.currentCheckCount * this.checkIntervalMs) / 1000, '秒');
        
        // 账号已识别，停止监控
        this.stopMonitoring();
        
        // 等待一小段时间确保 Windsurf 完全加载
        console.log('\n⏳ 等待 3 秒确保 Windsurf 完全加载账号...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 删除本地账号信息
        console.log('\n🗑️ 准备删除本地账号信息...');
        const deleteResult = await this.deleteLocalAccountInfo();
        
        // 调用回调函数
        if (onRecognized) {
          console.log('\n📞 调用 onRecognized 回调函数...');
          onRecognized(deleteResult);
        }
        
        return;
      }

      // 检查是否超时
      if (this.currentCheckCount >= this.maxCheckCount) {
        console.log('\n⏰ === 监控超时 ===');
        console.log('   已检查次数:', this.currentCheckCount);
        console.log('   总用时:', (this.currentCheckCount * this.checkIntervalMs) / 1000, '秒');
        console.log('   可能原因:');
        console.log('     1. Windsurf 启动时间过长');
        console.log('     2. 账号信息写入失败');
        console.log('     3. 数据库路径不正确');
        console.log('     4. Windsurf 版本不兼容');
        this.stopMonitoring();
        
        if (onTimeout) {
          console.log('\n📞 调用 onTimeout 回调函数...');
          onTimeout();
        }
      }
    }, this.checkIntervalMs);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      this.isMonitoring = false;
      this.currentCheckCount = 0;
      console.log('🛑 账号识别监控已停止');
    }
  }

  /**
   * 获取监控状态
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      currentCheckCount: this.currentCheckCount,
      maxCheckCount: this.maxCheckCount
    };
  }
}

module.exports = AccountRecognitionMonitor;
