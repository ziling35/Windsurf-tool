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
  
  // 获取本地账号历史
  getAccountHistory: () => ipcRenderer.invoke('get-account-history'),
  
  // 从服务器获取该密钥关联的账号历史
  getServerAccountHistory: () => ipcRenderer.invoke('get-server-account-history'),
  
  // 保存配置项
  saveConfig: (key, value) => ipcRenderer.invoke('save-config', { key, value }),
  
  // 获取配置项
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  
  // 获取所有配置
  getAllConfig: () => ipcRenderer.invoke('get-all-config'),
  
  // 获取版本说明
  getVersionNotes: () => ipcRenderer.invoke('get-version-notes'),
  
  // 标记账号
  markAccount: (id, marked) => ipcRenderer.invoke('mark-account', { id, marked }),
  
  // 删除账号
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
  
  // 切换到历史账号
  switchToHistoryAccount: (id) => ipcRenderer.invoke('switch-to-history-account', id),
  
  // 打开外部链接
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  
  // 获取公告
  getAnnouncement: () => ipcRenderer.invoke('get-announcement'),
  
  // ===== 插件管理 API =====
  
  // 检测插件状态
  checkPluginStatus: () => ipcRenderer.invoke('check-plugin-status'),
  
  // 获取插件列表（从服务器）
  getPluginList: () => ipcRenderer.invoke('get-plugin-list'),
  
  // 获取插件信息（从服务器）
  getPluginInfo: (pluginName) => ipcRenderer.invoke('get-plugin-info', pluginName),
  
  // 检查插件更新
  checkPluginUpdate: (options) => ipcRenderer.invoke('check-plugin-update', options),
  
  // 安装插件
  installPlugin: () => ipcRenderer.invoke('install-plugin'),
  
  // 更新插件（从服务器下载最新版本）
  updatePlugin: (options) => ipcRenderer.invoke('update-plugin', options),
  
  // 激活插件
  activatePlugin: () => ipcRenderer.invoke('activate-plugin'),
  
  // 配置 MCP
  configureMCP: () => ipcRenderer.invoke('configure-mcp'),
  
  // 清除 Windsurf 缓存
  clearWindsurfCache: () => ipcRenderer.invoke('clear-windsurf-cache'),
  
  // 清除插件激活缓存（专门解决激活问题）
  clearPluginActivationCache: () => ipcRenderer.invoke('clear-plugin-activation-cache'),
  
  // 重置 MCP 配置（修复路径乱码）
  resetMCPConfig: () => ipcRenderer.invoke('reset-mcp-config'),
  
  // 安装 AI 规则（强制 AI 使用工具）
  installAIRules: () => ipcRenderer.invoke('install-ai-rules'),
  
  // 配置 Kiro MCP
  configureKiroMCP: (options) => ipcRenderer.invoke('configure-kiro-mcp', options),
  
  // 安装插件到 Kiro
  installPluginToKiro: () => ipcRenderer.invoke('install-plugin-to-kiro'),
  
  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // 选择文件
  selectFile: (options) => ipcRenderer.invoke('select-file', options)
});
