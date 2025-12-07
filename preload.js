/**
 * Preload Script - 简化版
 * 桥接主进程和渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取当前账号
  getCurrentAccount: () => ipcRenderer.invoke('get-current-account'),
  
  // 切换账号
  switchAccount: (data) => ipcRenderer.invoke('switch-account', data),
  
  // 重置设备码
  resetDeviceIds: () => ipcRenderer.invoke('reset-device-ids'),
  
  // 检测 Windsurf 是否运行
  checkWindsurfRunning: () => ipcRenderer.invoke('check-windsurf-running'),
  
  // 检查 Mac 完全磁盘访问权限
  checkMacPermission: () => ipcRenderer.invoke('check-mac-permission'),
  
  // 检测 Windsurf 路径
  detectWindsurfPath: () => ipcRenderer.invoke('detect-windsurf-path'),
  // 扫描 Windsurf 可执行文件（可能较慢）
  scanWindsurfExe: () => ipcRenderer.invoke('scan-windsurf-exe'),
  
  // 手动选择 Windsurf 路径
  selectWindsurfPath: () => ipcRenderer.invoke('select-windsurf-path'),
  
  // 关闭 Windsurf
  killWindsurf: () => ipcRenderer.invoke('kill-windsurf'),
  
  // 启动 Windsurf
  launchWindsurf: (options) => ipcRenderer.invoke('launch-windsurf', options),
  
  // 监听切换账号进度消息
  onSwitchProgress: (callback) => {
    ipcRenderer.on('switch-progress', (event, data) => callback(data));
  },

  // 版本控制
  checkVersion: (clientVersion) => ipcRenderer.invoke('check-version', clientVersion),
  
  // 工作区管理
  saveWorkspacePath: (workspacePath) => ipcRenderer.invoke('save-workspace-path', workspacePath),
  getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
  selectWorkspacePath: () => ipcRenderer.invoke('select-workspace-path'),

  // ===== 秘钥管理 API =====
  
  // 保存秘钥
  saveKey: (key) => ipcRenderer.invoke('save-key', key),
  
  // 获取秘钥信息
  getKeyInfo: () => ipcRenderer.invoke('get-key-info'),
  
  // 查询秘钥状态
  checkKeyStatus: () => ipcRenderer.invoke('check-key-status'),
  
  // 获取账号
  getAccount: () => ipcRenderer.invoke('get-account'),

  // ===== 账号历史管理 API =====
  
  // 获取账号历史
  getAccountHistory: () => ipcRenderer.invoke('get-account-history'),
  
  // 标记账号
  markAccount: (id, marked) => ipcRenderer.invoke('mark-account', { id, marked }),
  
  // 删除账号
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
  
  // 切换到历史账号
  switchToHistoryAccount: (id) => ipcRenderer.invoke('switch-to-history-account', id),
  
  // 打开外部链接
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
