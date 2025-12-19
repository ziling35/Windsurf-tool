/**
 * 文件保护器
 * 保护 Windsurf token 文件免受其他程序读取
 * 
 * 保护机制：
 * 1. NTFS ACL 权限限制（仅当前用户可访问）
 * 2. 文件属性隐藏
 * 3. 访问监控（可选）
 */

const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class FileProtector {
  constructor(windsurfPath) {
    this.windsurfPath = windsurfPath || this.getWindsurfPath();
    this.dbPath = path.join(this.windsurfPath, 'User', 'globalStorage', 'state.vscdb');
    this.storagePath = path.join(this.windsurfPath, 'User', 'globalStorage', 'storage.json');
    this.currentUser = os.userInfo().username;
    
    // 需要保护的文件列表
    this.protectedFiles = [
      this.dbPath,
      this.storagePath,
      path.join(this.windsurfPath, 'User', 'globalStorage')
    ];
  }

  /**
   * 获取 Windsurf 用户数据路径
   */
  getWindsurfPath() {
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming', 'Windsurf');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Windsurf');
    } else {
      return path.join(os.homedir(), '.config', 'Windsurf');
    }
  }

  /**
   * 检查当前保护状态
   * @returns {Object} 保护状态信息
   */
  async checkProtectionStatus() {
    const status = {
      isProtected: false,
      details: [],
      errors: []
    };

    if (process.platform !== 'win32') {
      status.errors.push('文件保护功能目前仅支持 Windows 系统');
      return status;
    }

    try {
      // 检查 ACL 权限
      for (const filePath of this.protectedFiles) {
        if (fs.existsSync(filePath)) {
          const aclInfo = await this.getFileACL(filePath);
          const isRestricted = this.isAccessRestricted(aclInfo);
          
          status.details.push({
            path: path.basename(filePath),
            fullPath: filePath,
            isRestricted,
            acl: aclInfo
          });
          
          if (isRestricted) {
            status.isProtected = true;
          }
        }
      }
    } catch (error) {
      status.errors.push(error.message);
    }

    return status;
  }

  /**
   * 获取文件的 ACL 权限
   */
  getFileACL(filePath) {
    return new Promise((resolve, reject) => {
      // 使用 PowerShell 获取 ACL
      const cmd = `powershell -Command "(Get-Acl '${filePath}').Access | Select-Object IdentityReference, FileSystemRights, AccessControlType | ConvertTo-Json"`;
      
      exec(cmd, { encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`获取 ACL 失败: ${stderr || error.message}`));
          return;
        }
        
        try {
          const acl = JSON.parse(stdout || '[]');
          resolve(Array.isArray(acl) ? acl : [acl]);
        } catch (e) {
          resolve([]);
        }
      });
    });
  }

  /**
   * 检查是否已限制访问
   */
  isAccessRestricted(aclList) {
    if (!aclList || aclList.length === 0) return false;
    
    // 检查是否只有当前用户和 SYSTEM 有访问权限
    const allowedIdentities = [
      this.currentUser.toLowerCase(),
      'nt authority\\system',
      'builtin\\administrators'
    ];
    
    for (const entry of aclList) {
      const identity = (entry.IdentityReference || '').toLowerCase();
      const isAllowed = allowedIdentities.some(allowed => identity.includes(allowed));
      
      // 如果有 Everyone 或其他用户的访问权限，则未受保护
      if (identity.includes('everyone') || identity.includes('users')) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 启用文件保护
   * 设置严格的 NTFS ACL 权限
   */
  async enableProtection() {
    if (process.platform !== 'win32') {
      throw new Error('文件保护功能目前仅支持 Windows 系统');
    }

    const results = {
      success: true,
      protected: [],
      errors: []
    };

    for (const filePath of this.protectedFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        // 使用 icacls 命令设置权限
        // 1. 禁用继承并删除所有继承的权限
        // 2. 仅授予当前用户和 SYSTEM 完全控制权限
        
        const commands = [
          // 禁用继承，复制继承的权限
          `icacls "${filePath}" /inheritance:d`,
          // 移除 Users 组的权限
          `icacls "${filePath}" /remove:g "Users"`,
          // 移除 Everyone 的权限
          `icacls "${filePath}" /remove:g "Everyone"`,
          // 确保当前用户有完全控制权限
          `icacls "${filePath}" /grant:r "${this.currentUser}:(OI)(CI)F"`,
          // 确保 SYSTEM 有权限（Windows 服务需要）
          `icacls "${filePath}" /grant:r "SYSTEM:(OI)(CI)F"`
        ];

        for (const cmd of commands) {
          try {
            execSync(cmd, { windowsHide: true, encoding: 'utf8' });
          } catch (e) {
            // 忽略某些可能失败的命令（如移除不存在的权限）
            console.log(`命令执行警告: ${e.message}`);
          }
        }

        results.protected.push(filePath);
        console.log(`✅ 已保护: ${path.basename(filePath)}`);
      } catch (error) {
        results.errors.push({
          path: filePath,
          error: error.message
        });
        results.success = false;
      }
    }

    return results;
  }

  /**
   * 禁用文件保护
   * 恢复默认权限
   */
  async disableProtection() {
    if (process.platform !== 'win32') {
      throw new Error('文件保护功能目前仅支持 Windows 系统');
    }

    const results = {
      success: true,
      unprotected: [],
      errors: []
    };

    for (const filePath of this.protectedFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        // 重新启用继承
        execSync(`icacls "${filePath}" /inheritance:e`, { 
          windowsHide: true, 
          encoding: 'utf8' 
        });
        
        // 重置为默认权限
        execSync(`icacls "${filePath}" /reset`, { 
          windowsHide: true, 
          encoding: 'utf8' 
        });

        results.unprotected.push(filePath);
        console.log(`🔓 已取消保护: ${path.basename(filePath)}`);
      } catch (error) {
        results.errors.push({
          path: filePath,
          error: error.message
        });
        results.success = false;
      }
    }

    return results;
  }

  /**
   * 隐藏敏感文件
   */
  hideFiles() {
    if (process.platform !== 'win32') {
      return { success: false, message: '仅支持 Windows' };
    }

    const results = { success: true, hidden: [], errors: [] };

    for (const filePath of this.protectedFiles) {
      if (!fs.existsSync(filePath)) continue;
      
      try {
        // 设置隐藏和系统属性
        execSync(`attrib +H +S "${filePath}"`, { windowsHide: true });
        results.hidden.push(filePath);
      } catch (error) {
        results.errors.push({ path: filePath, error: error.message });
      }
    }

    return results;
  }

  /**
   * 显示隐藏的文件
   */
  unhideFiles() {
    if (process.platform !== 'win32') {
      return { success: false, message: '仅支持 Windows' };
    }

    const results = { success: true, unhidden: [], errors: [] };

    for (const filePath of this.protectedFiles) {
      if (!fs.existsSync(filePath)) continue;
      
      try {
        // 移除隐藏和系统属性
        execSync(`attrib -H -S "${filePath}"`, { windowsHide: true });
        results.unhidden.push(filePath);
      } catch (error) {
        results.errors.push({ path: filePath, error: error.message });
      }
    }

    return results;
  }

  /**
   * 检查是否有其他进程正在访问受保护的文件
   * 需要管理员权限
   */
  async checkFileAccess() {
    if (process.platform !== 'win32') {
      return { success: false, message: '仅支持 Windows' };
    }

    const results = {
      success: true,
      accessingProcesses: [],
      errors: []
    };

    try {
      // 使用 handle.exe 或 PowerShell 检查文件句柄
      // 这需要 Sysinternals Handle 工具或管理员权限
      const cmd = `powershell -Command "Get-Process | Where-Object { $_.Modules.FileName -like '*state.vscdb*' } | Select-Object Id, ProcessName | ConvertTo-Json"`;
      
      const output = execSync(cmd, { encoding: 'utf8', windowsHide: true });
      const processes = JSON.parse(output || '[]');
      
      if (Array.isArray(processes)) {
        results.accessingProcesses = processes;
      } else if (processes) {
        results.accessingProcesses = [processes];
      }
    } catch (error) {
      // 这个检查可能需要更高权限，失败是正常的
      results.errors.push('检查文件访问需要管理员权限');
    }

    return results;
  }
}

module.exports = FileProtector;
