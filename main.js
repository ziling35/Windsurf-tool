/**
 * PaperCrane-Windsurf 续杯工具
 * 支持 safeStorage 加密存储
 */

// 性能监控：记录启动时间
 
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

 function sleep(ms) {
   return new Promise(resolve => setTimeout(resolve, ms));
 }

 function isRetryableFsError(err) {
   if (!err || !err.code) return false;
   return ['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(err.code);
 }

 /**
  * 判断是否是我们的插件（严格匹配发布者前缀）
  * @param {string} name - 文件名、目录名或插件ID
  * @param {string} pluginType - 插件类型：'windsurf-continue-pro'（默认）或 'ask-continue' 或 'all'
  * @returns {boolean} 是否是我们的插件
  */
 function isOurPlugin(name, pluginType = 'windsurf-continue-pro') {
   if (!name || typeof name !== 'string') return false;
   
   const lowerName = name.toLowerCase();
   
   // Windsurf Continue Pro 插件匹配规则
   const windsurfContinueProMatches = {
     exact: [
       'papercrane-team.windsurf-continue-pro',
       'undefined_publisher.windsurf-continue-pro',
       'windsurf-continue-pro'
     ],
     prefixes: [
       'papercrane-team.windsurf-continue-pro-',
       'undefined_publisher.windsurf-continue-pro-',
       'windsurf-continue-pro-'
     ]
   };
   
   // Ask Continue 插件匹配规则
   const askContinueMatches = {
     exact: [
       'ask-continue',
       'undefined_publisher.ask-continue',
       'papercrane-team.ask-continue'
     ],
     prefixes: [
       'ask-continue-',
       'undefined_publisher.ask-continue-',
       'papercrane-team.ask-continue-'
     ]
   };
   
   // 根据插件类型选择匹配规则
   let matchRules = [];
   if (pluginType === 'windsurf-continue-pro') {
     matchRules = [windsurfContinueProMatches];
   } else if (pluginType === 'ask-continue') {
     matchRules = [askContinueMatches];
   } else if (pluginType === 'all') {
     matchRules = [windsurfContinueProMatches, askContinueMatches];
   } else {
     // 默认匹配 windsurf-continue-pro
     matchRules = [windsurfContinueProMatches];
   }
   
   // 检查是否匹配
   for (const rules of matchRules) {
     // 精确匹配
     if (rules.exact.includes(lowerName)) {
       return true;
     }
     
     // 前缀匹配（带版本号的目录）
     if (rules.prefixes.some(prefix => lowerName.startsWith(prefix))) {
       return true;
     }
   }
   
   return false;
 }

 async function removePathWithRetries(targetPath, { isDir = false, maxRetries = 5 } = {}) {
   for (let attempt = 0; attempt <= maxRetries; attempt++) {
     try {
       if (!fs.existsSync(targetPath)) {
         return { removed: true, alreadyMissing: true };
       }

       if (isDir) {
         fs.rmSync(targetPath, { recursive: true, force: true });
       } else {
         fs.unlinkSync(targetPath);
       }

       if (!fs.existsSync(targetPath)) {
         return { removed: true };
       }

       const err = new Error('删除后路径仍存在');
       err.code = 'EPERM';
       throw err;
     } catch (err) {
       if (attempt >= maxRetries || !isRetryableFsError(err)) {
         return { removed: false, error: err };
       }
       await sleep(200 * (attempt + 1));
     }
   }

   return { removed: false, error: new Error('删除失败') };
 }

 function readJsonSafe(filePath) {
   try {
     if (!fs.existsSync(filePath)) return { ok: false, error: new Error('文件不存在') };
     const content = fs.readFileSync(filePath, 'utf-8');
     return { ok: true, data: JSON.parse(content) };
   } catch (error) {
     return { ok: false, error };
   }
 }

 function extractVersionFromDirName(dirName) {
   const match = dirName.match(/-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
   return match ? match[1] : null;
 }

 function compareVersions(a, b) {
   if (!a && !b) return 0;
   if (!a) return -1;
   if (!b) return 1;

   const strip = (v) => v.split('-')[0].split('+')[0];
   const pa = strip(a).split('.').map(x => parseInt(x, 10));
   const pb = strip(b).split('.').map(x => parseInt(x, 10));

   for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
     const na = Number.isFinite(pa[i]) ? pa[i] : 0;
     const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
     if (na !== nb) return na > nb ? 1 : -1;
   }
   return 0;
 }

// ===== 全局错误处理 =====
// 创建日志目录
const logDir = path.join(app.getPath('appData'), 'PaperCrane-Windsurf', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);

// 日志函数
function writeLog(level, message, error = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (error) {
    logMessage += `\nError: ${error.message}\nStack: ${error.stack}`;
  }
  
  console.log(logMessage);
  
  try {
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (e) {
    console.error('Failed to write log:', e);
  }
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  writeLog('ERROR', 'Uncaught Exception', error);
  console.error('Uncaught Exception:', error);
  
  // 显示错误对话框
  dialog.showErrorBox('应用程序错误', `发生未预期的错误:\n${error.message}\n\n日志已保存到:\n${logFile}`);
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  writeLog('ERROR', `Unhandled Rejection at: ${promise}, reason: ${reason}`);
  console.error('Unhandled Rejection:', reason);
});

writeLog('INFO', '应用程序启动');

// ⚠️ 重要：在 app.ready 之前设置 userData 路径，确保与 Windsurf 同源
// 这样才能使用 safeStorage 解密 Windsurf 的加密数据
const platform = process.platform;
let windsurfUserDataPath;

if (process.env.WINDSURF_USER_DATA) {
  windsurfUserDataPath = process.env.WINDSURF_USER_DATA;
} else {
  if (platform === 'win32') {
    windsurfUserDataPath = path.join(app.getPath('appData'), 'Windsurf');
  } else if (platform === 'darwin') {
    windsurfUserDataPath = path.join(app.getPath('home'), 'Library', 'Application Support', 'Windsurf');
  } else {
    windsurfUserDataPath = path.join(app.getPath('home'), '.config', 'Windsurf');
  }
}

// 设置 userData 路径为 Windsurf 的路径
try {
  app.setPath('userData', windsurfUserDataPath);
  writeLog('INFO', `已设置 userData 路径为 Windsurf 路径: ${windsurfUserDataPath}`);
  console.log('🔐 已设置 userData 路径为 Windsurf 路径:', windsurfUserDataPath);
} catch (error) {
  writeLog('ERROR', '设置 userData 路径失败', error);
  console.error('设置 userData 路径失败:', error);
}

// 导入核心模块（添加错误处理）
let DeviceManager, SessionManager, ProcessMonitor, ConfigManager, KeyManager, 
    AccountHistoryManager, AdminChecker, MacPermissionChecker, SecureStorageManager;

try {
  DeviceManager = require('./modules/deviceManager');
  SessionManager = require('./modules/sessionManager');
  ProcessMonitor = require('./modules/processMonitor');
  ConfigManager = require('./modules/configManager');
  KeyManager = require('./modules/keyManager');
  AccountHistoryManager = require('./modules/accountHistoryManager');
  AdminChecker = require('./modules/adminChecker');
  MacPermissionChecker = require('./modules/macPermissionChecker');
  SecureStorageManager = require('./modules/secureStorageManager');
  writeLog('INFO', '所有核心模块加载成功');
} catch (error) {
  writeLog('ERROR', '加载核心模块失败', error);
  dialog.showErrorBox('模块加载错误', `无法加载必需的模块:\n${error.message}\n\n请确保所有文件完整且 node_modules 已正确安装。`);
  app.quit();
}

let mainWindow;
let windsurfPath; // Windsurf 安装路径
let configManager; // 配置管理器
let processMonitor; // 进程监控器
let keyManager; // 秘钥管理器
let accountHistoryManager; // 账号历史管理器
let secureStorageManager; // 安全存储管理器

// 检测 Windsurf 可执行文件路径
function detectWindsurfExecutable() {
  const platform = process.platform;
  const possiblePaths = [];
  
  if (platform === 'win32') {
    // Windows 常见安装路径
    const drives = ['C:', 'D:', 'E:', 'F:']; // 常见盘符
    const installDirs = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Windsurf'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Windsurf'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Windsurf'),
      'Windsurf', // 根目录
      'programe1\\windsurf', // 用户自定义路径
      path.join('Program Files', 'Windsurf'),
      path.join('Program Files (x86)', 'Windsurf')
    ];
    
    // 添加 C 盘标准路径
    installDirs.forEach(dir => {
      possiblePaths.push(path.join(dir, 'Windsurf.exe'));
    });
    
    // 遍历其他盘符
    drives.forEach(drive => {
      possiblePaths.push(
        path.join(drive, '\\', 'Windsurf', 'Windsurf.exe'),
        path.join(drive, '\\', 'Program Files', 'Windsurf', 'Windsurf.exe'),
        path.join(drive, '\\', 'Program Files (x86)', 'Windsurf', 'Windsurf.exe')
      );
    });
    
  } else if (platform === 'darwin') {
    // macOS
    possiblePaths.push(
      '/Applications/Windsurf.app',
      '/Applications/Windsurf.app/Contents/MacOS/Windsurf',
      path.join(app.getPath('home'), 'Applications', 'Windsurf.app'),
      path.join(app.getPath('home'), 'Applications', 'Windsurf.app', 'Contents', 'MacOS', 'Windsurf'),
      '/usr/local/bin/windsurf',
      '/opt/homebrew/bin/windsurf'
    );
  } else {
    // Linux
    possiblePaths.push(
      '/usr/bin/windsurf',
      '/usr/local/bin/windsurf',
      '/opt/windsurf/windsurf',
      '/snap/bin/windsurf',
      path.join(app.getPath('home'), '.local', 'bin', 'windsurf'),
      path.join(app.getPath('home'), 'windsurf', 'windsurf')
    );
  }
  
  // 检查哪个路径存在
  console.log(`🔍 正在检测 ${possiblePaths.length} 个可能的路径...`);
  
  for (const exePath of possiblePaths) {
    if (exePath && fs.existsSync(exePath)) {
      console.log('✅ 找到 Windsurf:', exePath);
      return exePath;
    }
  }
  
  console.log('⚠️ 未在预设路径中找到 Windsurf，请手动选择');
  console.log('💡 提示：检测了以下位置:', possiblePaths.slice(0, 5).join(', '), '...');
  
  return null;
}

// 获取 Windsurf 数据目录路径
function getWindsurfDataPath() {
  const platform = process.platform;
  
  // 1. 先从配置中读取
  if (configManager) {
    const savedPath = configManager.getWindsurfPath();
    if (savedPath && fs.existsSync(savedPath)) {
      return savedPath;
    }
  }

  // 2. 检查环境变量
  if (process.env.WINDSURF_USER_DATA) {
    return process.env.WINDSURF_USER_DATA;
  }

  // 3. 使用标准路径
  if (platform === 'win32') {
    return path.join(app.getPath('appData'), 'Windsurf');
  } else if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'Windsurf');
  } else {
    return path.join(app.getPath('home'), '.config', 'Windsurf');
  }
}

// 创建主窗口
function createWindow() {
  try {
    writeLog('INFO', '开始创建主窗口');
    
    mainWindow = new BrowserWindow({
      width: 1000,
      height: 625,
      show: false,
      useContentSize: true,
      backgroundColor: '#fafbfc',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        devTools: true, // 启用开发者工具以便调试
        backgroundThrottling: false
      },
      icon: path.join(__dirname, 'assets', 'icon.png'),
      title: 'PaperCrane-Windsurf',
      autoHideMenuBar: true
    });

    // 禁用菜单栏
    mainWindow.setMenu(null);

    // 监听窗口崩溃
    mainWindow.webContents.on('crashed', (event) => {
      writeLog('ERROR', '渲染进程崩溃');
      dialog.showErrorBox('窗口崩溃', '渲染进程意外崩溃。应用将尝试重新创建窗口。');
      
      // 尝试重新创建窗口
      if (mainWindow) {
        mainWindow.destroy();
      }
      setTimeout(() => createWindow(), 1000);
    });

    // 监听渲染进程的错误
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      writeLog('ERROR', `渲染进程退出: reason=${details.reason}, exitCode=${details.exitCode}`);
      console.error('渲染进程退出:', details);
    });

    mainWindow.loadFile('renderer/index.html').catch(error => {
      writeLog('ERROR', '加载HTML文件失败', error);
      console.error('加载HTML文件失败:', error);
    });

    // 错误监听（生产环境也保留以便排查）
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      writeLog('ERROR', `页面加载失败: code=${errorCode}, desc=${errorDescription}`);
      console.error('页面加载失败:', errorCode, errorDescription);
      // 即使加载失败也显示窗口，让用户看到错误
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
    });

    // 监听控制台消息
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (level >= 2) { // 警告和错误
        writeLog('RENDERER', `Console [${level}] ${sourceId}:${line} - ${message}`);
      }
    });

    // 正常显示
    mainWindow.once('ready-to-show', () => {
      writeLog('INFO', '窗口准备就绪，显示窗口');
      mainWindow.show();
    });

    // 超时保护：3秒后强制显示（防止 ready-to-show 未触发）
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        writeLog('WARN', '超时强制显示窗口');
        console.log('超时强制显示窗口');
        mainWindow.show();
      }
    }, 3000);
    
    writeLog('INFO', '主窗口创建成功');
  } catch (error) {
    writeLog('ERROR', '创建主窗口失败', error);
    dialog.showErrorBox('窗口创建失败', `无法创建应用窗口:\n${error.message}`);
    app.quit();
  }
}

// ===== IPC 处理器 =====

// 获取应用版本号（从 package.json 读取）
ipcMain.handle('get-app-version', async () => {
  try {
    const packageJson = require('./package.json');
    return { success: true, version: packageJson.version };
  } catch (error) {
    console.error('获取版本号失败:', error);
    return { success: false, version: '未知' };
  }
});

// 获取当前账号信息
ipcMain.handle('get-current-account', async () => {
  try {
    if (!windsurfPath) {
      return { success: false, message: '未找到 Windsurf 路径' };
    }

    const appDataPath = path.join(app.getPath('appData'), 'PaperCrane-Windsurf');
    const sessionManager = new SessionManager(windsurfPath, appDataPath);
    const result = await sessionManager.readPlainSessions();
    
    if (!result || !result.sessions || result.sessions.length === 0) {
      return { 
        success: false, 
        message: '未找到账号信息，请先配置账号'
      };
    }

    const session = result.sessions[0];
    
    return {
      success: true,
      data: {
        email: session.account?.id || 'Unknown',
        label: session.account?.label || 'Unknown',
        token: session.accessToken,
        sessionId: session.id
      }
    };
  } catch (error) {
    console.error('读取账号失败:', error);
    return { 
      success: false, 
      message: error.message
    };
  }
});

// 重置设备码
ipcMain.handle('reset-device-ids', async () => {
  try {
    // Windows 下检查管理员权限（但不强制请求）
    let isAdmin = false;
    if (process.platform === 'win32') {
      isAdmin = await AdminChecker.isAdmin();
      if (!isAdmin) {
        console.log('⚠️ 未以管理员权限运行，注册表重置功能将受限');
      }
    }
    
    // 1. 重置配置文件中的设备ID
    const deviceManager = new DeviceManager(windsurfPath);
    const deviceIds = deviceManager.resetDeviceIds();
    
    // 2. 不再重置设备指纹，只返回设备 ID 相关信息
    return { 
      success: true, 
      data: {
        ...deviceIds,
        fingerprint: null,
        fingerprintMessage: '设备指纹重置功能已禁用',
        fingerprintIntegrityPatched: false
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 按需扫描 Windsurf 可执行文件（可能较慢）
ipcMain.handle('scan-windsurf-exe', async () => {
  try {
    const exePath = detectWindsurfExecutable();
    if (exePath) {
      configManager.setWindsurfExePath(exePath);
      return { success: true, data: { exePath } };
    }
    return { success: false, message: '未检测到 Windsurf 可执行文件' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 检测 Windsurf 是否正在运行
ipcMain.handle('check-windsurf-running', async () => {
  try {
    const isRunning = await processMonitor.isWindsurfRunning();
    return { 
      success: true, 
      data: { isRunning } 
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 检查 Mac 完全磁盘访问权限
ipcMain.handle('check-mac-permission', async () => {
  try {
    if (process.platform !== 'darwin') {
      return { 
        success: true, 
        data: { 
          platform: 'not-mac',
          message: '当前系统不是 macOS'
        } 
      };
    }

    const result = await MacPermissionChecker.checkFullDiskAccess();
    return { 
      success: true, 
      data: result
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 检测 Windsurf 安装目录
ipcMain.handle('detect-windsurf-path', async () => {
  try {
    // 快速返回：不做同步扫描，优先使用已保存的可执行路径
    const dataPath = getWindsurfDataPath();
    const dbPath = path.join(dataPath, 'User', 'globalStorage', 'state.vscdb');
    const dbExists = fs.existsSync(dbPath);

    if (dbExists) {
      configManager.setWindsurfPath(dataPath);
      windsurfPath = dataPath;
    }

    const savedExePath = configManager.getWindsurfExePath();
    const savedExeExists = !!(savedExePath && fs.existsSync(savedExePath));

    return {
      success: true,
      data: {
        exePath: savedExeExists ? savedExePath : '未检测到',
        exeExists: savedExeExists,
        dataPath,
        dbPath,
        dbExists
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 获取检测路径列表（调试用）
ipcMain.handle('get-search-paths', async () => {
  try {
    const platform = process.platform;
    const searchPaths = [];
    
    if (platform === 'win32') {
      const drives = ['C:', 'D:', 'E:', 'F:'];
      drives.forEach(drive => {
        searchPaths.push(
          `${drive}\\Windsurf\\Windsurf.exe`,
          `${drive}\\Program Files\\Windsurf\\Windsurf.exe`,
          `${drive}\\Program Files (x86)\\Windsurf\\Windsurf.exe`
        );
      });
      searchPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Windsurf\\Windsurf.exe`);
    } else if (platform === 'darwin') {
      searchPaths.push(
        '/Applications/Windsurf.app',
        '~/Applications/Windsurf.app',
        '/usr/local/bin/windsurf'
      );
    } else {
      searchPaths.push(
        '/usr/bin/windsurf',
        '/usr/local/bin/windsurf',
        '~/.local/bin/windsurf'
      );
    }
    
    return {
      success: true,
      data: { paths: searchPaths }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 手动选择 Windsurf 可执行文件
ipcMain.handle('select-windsurf-path', async () => {
  try {
    const platform = process.platform;
    const filters = [];
    
    if (platform === 'win32') {
      filters.push({ name: 'Windsurf', extensions: ['exe'] });
    } else if (platform === 'darwin') {
      filters.push({ name: 'Windsurf', extensions: ['app'] });
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择 Windsurf 可执行文件',
      filters: filters.length > 0 ? filters : undefined
    });
    
    if (result.canceled) {
      return { success: false, message: '已取消' };
    }
    
    const exePath = result.filePaths[0];
    
    // 验证是否是 Windsurf
    const fileName = path.basename(exePath).toLowerCase();
    if (!fileName.includes('windsurf')) {
      return { 
        success: false, 
        message: '选择的文件不是 Windsurf 可执行文件'
      };
    }
    
    // 保存可执行文件路径
    configManager.setWindsurfExePath(exePath);
    
    // 获取数据目录（仍然使用标准路径）
    const dataPath = getWindsurfDataPath();
    const dbPath = path.join(dataPath, 'User', 'globalStorage', 'state.vscdb');
    const dbExists = fs.existsSync(dbPath);
    
    if (dbExists) {
      configManager.setWindsurfPath(dataPath);
      windsurfPath = dataPath;
    }
    
    return {
      success: true,
      data: { 
        exePath: exePath,
        dataPath: dataPath,
        dbExists: dbExists
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 关闭 Windsurf
ipcMain.handle('kill-windsurf', async () => {
  try {
    const result = await processMonitor.killWindsurf();
    if (result.killed) {
      const message = result.wasRunning ? 'Windsurf 已关闭' : 'Windsurf 未在运行';
      return { success: true, message };
    } else {
      return { success: false, message: '关闭失败' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 启动 Windsurf
ipcMain.handle('launch-windsurf', async (event, options = {}) => {
  try {
    // 优先使用用户手动选择的路径
    let exePath = configManager.getWindsurfExePath();
    
    // 如果没有，尝试自动检测
    if (!exePath) {
      exePath = detectWindsurfExecutable();
    }
    
    if (!exePath) {
      return { success: false, message: '未找到 Windsurf 可执行文件，请先手动选择' };
    }
    
    // 不再使用工作区路径启动，直接启动 Windsurf
    const success = await processMonitor.launchWindsurf(exePath);
    return { success, message: success ? 'Windsurf 已启动' : '启动失败' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 检查版本更新
ipcMain.handle('check-version', async (event, clientVersion) => {
  try {
    const result = await KeyManager.checkVersion(clientVersion);
    return result;
  } catch (error) {
    console.error('检查版本失败:', error);
    return { success: false, message: error.message };
  }
});

// 保存工作区路径
ipcMain.handle('save-workspace-path', async (event, workspacePath) => {
  try {
    const success = configManager.setLastWorkspacePath(workspacePath);
    return { success, message: success ? '工作区路径已保存' : '保存失败' };
  } catch (error) {
    console.error('保存工作区路径失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取工作区路径
ipcMain.handle('get-workspace-path', async () => {
  try {
    const workspacePath = configManager.getLastWorkspacePath();
    return { success: true, data: { workspacePath } };
  } catch (error) {
    console.error('获取工作区路径失败:', error);
    return { success: false, message: error.message };
  }
});

// 选择工作区路径
ipcMain.handle('select-workspace-path', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 Windsurf 工作区文件夹'
    });
    
    if (result.canceled) {
      return { success: false, message: '已取消' };
    }
    
    const workspacePath = result.filePaths[0];
    configManager.setLastWorkspacePath(workspacePath);
    
    return {
      success: true,
      data: { workspacePath }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ===== 秘钥管理 IPC 处理器 =====

// 保存秘钥
ipcMain.handle('save-key', async (event, key) => {
  try {
    if (!key || !key.trim()) {
      return { success: false, message: '秘钥不能为空' };
    }

    const success = keyManager.saveKey(key.trim());
    if (success) {
      return { success: true, message: '秘钥已保存' };
    } else {
      return { success: false, message: '保存失败' };
    }
  } catch (error) {
    console.error('保存秘钥失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取秘钥信息
ipcMain.handle('get-key-info', async () => {
  try {
    const keyInfo = keyManager.getKeyInfo();
    return { success: true, data: keyInfo };
  } catch (error) {
    console.error('获取秘钥信息失败:', error);
    return { success: false, message: error.message };
  }
});

// 查询秘钥状态（剩余时间等）
ipcMain.handle('check-key-status', async () => {
  try {
    return await keyManager.checkKeyStatus();
  } catch (error) {
    console.error('查询秘钥状态失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取账号（仅从服务器获取并记录到历史，不进行切换或重置）
ipcMain.handle('get-account', async () => {
  try {
    const result = await keyManager.getAccount();

    // 如果获取成功且包含邮箱和 API Key，则写入历史记录
    if (result && result.success && result.data) {
      const { email, api_key, password } = result.data;
      if (email && api_key) {
        const label = password || 'PaperCrane';
        try {
          accountHistoryManager.addAccount({
            token: api_key,
            email,
            label
          });
        } catch (historyError) {
          console.error('写入账号历史失败:', historyError);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('获取账号失败:', error);
    return { success: false, message: error.message };
  }
});

// ===== 插件管理 IPC 处理器 =====

// 获取插件列表（从服务器）
ipcMain.handle('get-plugin-list', async () => {
  try {
    return await KeyManager.getPluginList();
  } catch (error) {
    console.error('获取插件列表失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取插件信息（从服务器）
ipcMain.handle('get-plugin-info', async (event, pluginName = 'windsurf-continue-pro') => {
  try {
    return await KeyManager.getPluginInfo(pluginName);
  } catch (error) {
    console.error('获取插件信息失败:', error);
    return { success: false, message: error.message };
  }
});

// 检查插件更新
ipcMain.handle('check-plugin-update', async (event, { pluginName = 'windsurf-continue-pro', clientVersion = '1.0.0' }) => {
  try {
    return await KeyManager.checkPluginUpdate(pluginName, clientVersion);
  } catch (error) {
    console.error('检查插件更新失败:', error);
    return { success: false, message: error.message };
  }
});

// ===== 账号历史管理 IPC 处理器 =====

// 获取所有历史账号
ipcMain.handle('get-account-history', async () => {
  try {
    const accounts = accountHistoryManager.getAllAccounts();
    const stats = accountHistoryManager.getStats();
    return { 
      success: true, 
      data: { 
        accounts, 
        stats 
      } 
    };
  } catch (error) {
    console.error('获取历史账号失败:', error);
    return { success: false, message: error.message };
  }
});

// 标记/取消标记账号
ipcMain.handle('mark-account', async (event, { id, marked }) => {
  try {
    const success = accountHistoryManager.markAccount(id, marked);
    if (success) {
      return { success: true, message: marked ? '已标记为已使用' : '已取消标记' };
    } else {
      return { success: false, message: '账号不存在' };
    }
  } catch (error) {
    console.error('标记账号失败:', error);
    return { success: false, message: error.message };
  }
});

// 删除历史账号
ipcMain.handle('delete-account', async (event, id) => {
  try {
    const success = accountHistoryManager.deleteAccount(id);
    if (success) {
      return { success: true, message: '账号已删除' };
    } else {
      return { success: false, message: '账号不存在' };
    }
  } catch (error) {
    console.error('删除账号失败:', error);
    return { success: false, message: error.message };
  }
});

// 从服务器获取该密钥关联的账号历史
ipcMain.handle('get-server-account-history', async () => {
  try {
    const result = await keyManager.getAccountHistory();
    return result;
  } catch (error) {
    console.error('获取服务器账号历史失败:', error);
    return { success: false, message: error.message };
  }
});

// 保存配置项
ipcMain.handle('save-config', async (event, { key, value }) => {
  try {
    const success = configManager.setConfigValue(key, value);
    return { success, message: success ? '已保存' : '保存失败' };
  } catch (error) {
    console.error('保存配置失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取配置项
ipcMain.handle('get-config', async (event, key) => {
  try {
    const value = configManager.getConfigValue(key);
    return { success: true, value };
  } catch (error) {
    console.error('获取配置失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取所有配置
ipcMain.handle('get-all-config', async () => {
  try {
    const config = configManager.getAllConfig();
    return { success: true, data: config };
  } catch (error) {
    console.error('获取所有配置失败:', error);
    return { success: false, message: error.message };
  }
});

// 直接切换账号（接收账号数据）
ipcMain.handle('switch-account', async (event, accountData) => {
  try {
    const { token, email, label } = accountData;
    
    if (!token || !email) {
      return { success: false, message: '账号数据不完整' };
    }

    if (!windsurfPath) {
      return { success: false, message: '未找到 Windsurf 路径' };
    }

    const appDataPath = path.join(app.getPath('appData'), 'PaperCrane-Windsurf');
    const sessionManager = new SessionManager(windsurfPath, appDataPath);
    
    // 创建备份
    let backupPath = null;
    try {
      event.sender.send('switch-progress', { step: 'backup', message: '正在创建配置备份...' });
      backupPath = sessionManager.createBackup();
      event.sender.send('switch-progress', { step: 'backup-done', message: '✅ 备份完成' });
    } catch (backupError) {
      event.sender.send('switch-progress', { step: 'error', message: '❌ 备份失败' });
      return { success: false, message: '备份失败，已取消切换: ' + backupError.message };
    }

    // 关闭 Windsurf
    const isRunning = await processMonitor.isWindsurfRunning();
    let closed = false;
    if (isRunning) {
      event.sender.send('switch-progress', { step: 'kill', message: '正在关闭 Windsurf...' });
      const killResult = await processMonitor.killWindsurf();
      
      if (!killResult.wasRunning) {
        closed = true;
        event.sender.send('switch-progress', { step: 'kill-done', message: '✅ 已关闭 Windsurf' });
      } else if (killResult.killed) {
        for (let i = 0; i < 6; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const stillRunning = await processMonitor.isWindsurfRunning();
          if (!stillRunning) { closed = true; break; }
        }
        if (closed) {
          event.sender.send('switch-progress', { step: 'kill-done', message: '✅ 已关闭 Windsurf' });
        } else {
          event.sender.send('switch-progress', { step: 'warning', message: '⚠️ Windsurf 可能未完全关闭，但将继续切换' });
        }
      } else {
        event.sender.send('switch-progress', { step: 'warning', message: '⚠️ 关闭 Windsurf 失败，但将继续切换' });
      }
    }

    // 尝试切换账号
    try {
      event.sender.send('switch-progress', { step: 'switch', message: '正在更换账号配置...' });
      await sessionManager.writeAllSessions(token, email, label);
      event.sender.send('switch-progress', { step: 'switch-done', message: '✅ 已更换账号（含加密）' });
      
      event.sender.send('switch-progress', { step: 'reset-device', message: '⏳ 正在重置设备 ID...' });
      const deviceManager = new DeviceManager(windsurfPath);
      const deviceIds = deviceManager.resetDeviceIds();
      
      if (deviceIds.registryReset) {
        event.sender.send('switch-progress', { step: 'reset-device-done', message: '✅ 已重置设备 ID（含注册表）' });
      } else {
        event.sender.send('switch-progress', { step: 'reset-device-done', message: '✅ 已重置设备 ID' });
      }
      
      event.sender.send('switch-progress', { 
        step: 'reset-fingerprint-skipped', 
        message: 'ℹ️ 已跳过设备指纹重置（功能已禁用）' 
      });
      
      configManager.setLastEmail(email);
      
      if (isRunning && closed) {
        event.sender.send('switch-progress', { step: 'launch', message: '⏳ 正在启动 Windsurf...' });
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        let exePath = configManager.getWindsurfExePath();
        if (!exePath) {
          exePath = detectWindsurfExecutable();
        }
        if (exePath) {
          const launched = await processMonitor.launchWindsurf(exePath);
          if (launched) {
            let started = false;
            const maxAttempts = 20;
            for (let i = 0; i < maxAttempts; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              started = await processMonitor.isWindsurfRunning();
              if (started) break;
            }
            
            if (started) {
              event.sender.send('switch-progress', { step: 'launch-done', message: '✅ 已启动 Windsurf' });
            } else {
              event.sender.send('switch-progress', { step: 'warning', message: '⚠️ 启动命令已执行，请等待 Windsurf 完全启动' });
            }
          } else {
            event.sender.send('switch-progress', { step: 'error', message: '❌ 启动失败' });
          }
        } else {
          event.sender.send('switch-progress', { step: 'error', message: '❌ 未找到 Windsurf 可执行文件' });
        }
      }
      
      event.sender.send('switch-progress', { step: 'complete', message: '✅ 切换完成' });
      
      return {
        success: true,
        data: { 
          email: email, 
          label: label,
          deviceIds,
          wasRunning: isRunning
        }
      };
    } catch (switchError) {
      if (backupPath) {
        sessionManager.restoreBackup(backupPath);
      }
      
      if (isRunning) {
        setTimeout(async () => {
          let exePath = configManager.getWindsurfExePath();
          if (!exePath) {
            exePath = detectWindsurfExecutable();
          }
          if (exePath) {
            await processMonitor.launchWindsurf(exePath);
          }
        }, 1000);
      }
      
      return { success: false, message: '切换失败，已恢复到备份: ' + switchError.message };
    }
  } catch (error) {
    console.error('切换账号失败:', error);
    return { success: false, message: error.message };
  }
});

// 切换到历史账号
ipcMain.handle('switch-to-history-account', async (event, id) => {
  try {
    const account = accountHistoryManager.getAccountById(id);
    if (!account) {
      return { success: false, message: '账号不存在' };
    }

    // 复用现有的切换账号代码逻辑
    if (!windsurfPath) {
      return { success: false, message: '未找到 Windsurf 路径' };
    }

    const appDataPath = path.join(app.getPath('appData'), 'PaperCrane-Windsurf');
    const sessionManager = new SessionManager(windsurfPath, appDataPath);
    
    // 创建备份
    let backupPath = null;
    try {
      event.sender.send('switch-progress', { step: 'backup', message: '正在创建配置备份...' });
      backupPath = sessionManager.createBackup();
      event.sender.send('switch-progress', { step: 'backup-done', message: '✅ 备份完成' });
    } catch (backupError) {
      event.sender.send('switch-progress', { step: 'error', message: '❌ 备份失败' });
      return { success: false, message: '备份失败，已取消切换: ' + backupError.message };
    }

    // 关闭 Windsurf
    const isRunning = await processMonitor.isWindsurfRunning();
    let closed = false;
    if (isRunning) {
      event.sender.send('switch-progress', { step: 'kill', message: '正在关闭 Windsurf...' });
      const killResult = await processMonitor.killWindsurf();
      
      if (!killResult.wasRunning) {
        // 本来就没有进程在运行
        closed = true;
        event.sender.send('switch-progress', { step: 'kill-done', message: '✅ 已关闭 Windsurf' });
      } else if (killResult.killed) {
        // 轮询确认完全关闭（最多等待 3 秒）
        for (let i = 0; i < 6; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const stillRunning = await processMonitor.isWindsurfRunning();
          if (!stillRunning) { closed = true; break; }
        }
        if (closed) {
          event.sender.send('switch-progress', { step: 'kill-done', message: '✅ 已关闭 Windsurf' });
        } else {
          event.sender.send('switch-progress', { step: 'warning', message: '⚠️ Windsurf 可能未完全关闭，但将继续切换' });
        }
      } else {
        event.sender.send('switch-progress', { step: 'warning', message: '⚠️ 关闭 Windsurf 失败，但将继续切换' });
      }
    }

    // 尝试切换账号
    try {
      event.sender.send('switch-progress', { step: 'switch', message: '正在更换账号配置...' });
      // 同时写入明文和加密 sessions
      const result = await sessionManager.writeAllSessions(account.token, account.email, account.label);
      event.sender.send('switch-progress', { step: 'switch-done', message: '✅ 已更换账号（含加密）' });
      
      event.sender.send('switch-progress', { step: 'reset-device', message: '⏳ 正在重置设备 ID...' });
      const deviceManager = new DeviceManager(windsurfPath);
      const deviceIds = deviceManager.resetDeviceIds();
      
      if (deviceIds.registryReset) {
        event.sender.send('switch-progress', { step: 'reset-device-done', message: '✅ 已重置设备 ID（含注册表）' });
      } else {
        event.sender.send('switch-progress', { step: 'reset-device-done', message: '✅ 已重置设备 ID' });
      }
      
      // 跳过设备指纹重置功能
      event.sender.send('switch-progress', { 
        step: 'reset-fingerprint-skipped', 
        message: 'ℹ️ 已跳过设备指纹重置（功能已禁用）' 
      });
      
      // 更新最后使用时间
      accountHistoryManager.updateLastUsed(id);
      configManager.setLastEmail(account.email);
      
      // 如果之前在运行且确认已关闭，自动重启（防止残留或用户手动关闭导致误重启）
      if (isRunning && closed) {
        event.sender.send('switch-progress', { step: 'launch', message: '⏳ 正在启动 Windsurf...' });
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        let exePath = configManager.getWindsurfExePath();
        if (!exePath) {
          exePath = detectWindsurfExecutable();
        }
        if (exePath) {
          const launched = await processMonitor.launchWindsurf(exePath);
          if (launched) {
            let started = false;
            const maxAttempts = 20;
            for (let i = 0; i < maxAttempts; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              started = await processMonitor.isWindsurfRunning();
              if (started) break;
            }
            
            if (started) {
              event.sender.send('switch-progress', { step: 'launch-done', message: '✅ 已启动 Windsurf' });
            } else {
              event.sender.send('switch-progress', { step: 'warning', message: '⚠️ 启动命令已执行，请等待 Windsurf 完全启动' });
            }
          } else {
            event.sender.send('switch-progress', { step: 'error', message: '❌ 启动失败' });
          }
        } else {
          event.sender.send('switch-progress', { step: 'error', message: '❌ 未找到 Windsurf 可执行文件' });
        }
      }
      
      // 发送完成消息
      event.sender.send('switch-progress', { step: 'complete', message: '✅ 切换完成' });
      
      return {
        success: true,
        data: { 
          email: account.email, 
          label: account.label,
          deviceIds,
          wasRunning: isRunning
        }
      };
    } catch (switchError) {
      // 切换失败，恢复备份
      if (backupPath) {
        sessionManager.restoreBackup(backupPath);
      }
      
      if (isRunning) {
        setTimeout(async () => {
          let exePath = configManager.getWindsurfExePath();
          if (!exePath) {
            exePath = detectWindsurfExecutable();
          }
          if (exePath) {
            await processMonitor.launchWindsurf(exePath);
          }
        }, 1000);
      }
      
      return { success: false, message: '切换失败，已恢复到备份: ' + switchError.message };
    }
  } catch (error) {
    console.error('切换到历史账号失败:', error);
    return { success: false, message: error.message };
  }
});

// 打开外部链接
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (!url || !url.trim()) {
      return { success: false, message: '链接为空' };
    }
    
    // 验证URL格式
    const urlPattern = /^https?:\/\//;
    if (!urlPattern.test(url)) {
      return { success: false, message: '链接格式不正确，必须以 http:// 或 https:// 开头' };
    }
    
    await shell.openExternal(url);
    return { success: true, message: '已在浏览器中打开链接' };
  } catch (error) {
    console.error('打开外部链接失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取公告
ipcMain.handle('get-announcement', async () => {
  try {
    const result = await KeyManager.getAnnouncement();
    return result;
  } catch (error) {
    console.error('获取公告失败:', error);
    return { success: false, message: error.message };
  }
});

// 获取版本说明
ipcMain.handle('get-version-notes', async () => {
  try {
    const result = await KeyManager.getVersionNotes();
    return result;
  } catch (error) {
    console.error('获取版本说明失败:', error);
    return { success: false, message: error.message };
  }
});

// ===== 插件管理功能 =====

// 检测插件状态的共享函数
async function checkPluginStatusInternal() {
  try {
    // Windsurf 扩展目录在用户主目录的 .windsurf/extensions
    const extensionsPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
    let pluginInstalled = false;
    let pluginPath = null;
    let pluginId = null;
    let pluginVersion = null;
    let pluginReason = null;
    
    console.log('[插件检测] 检查扩展目录:', extensionsPath);
    console.log('[插件检测] 目录是否存在:', fs.existsSync(extensionsPath));
    
    // 检查插件是否已安装（严格校验：目录存在 + package.json 有效 + MCP 服务器文件存在）
    if (fs.existsSync(extensionsPath)) {
      const extensions = fs.readdirSync(extensionsPath);
      console.log('[插件检测] 扩展目录中的所有插件:', extensions);

      const candidateDirs = extensions
        .filter(ext => isOurPlugin(ext))
        .map(ext => ({ name: ext, fullPath: path.join(extensionsPath, ext), version: extractVersionFromDirName(ext) }));

      console.log('[插件检测] 找到的候选插件:', candidateDirs.map(c => c.name));

      // 尽量选择版本号最高的候选项
      candidateDirs.sort((a, b) => compareVersions(a.version, b.version));
      const selected = candidateDirs.length ? candidateDirs[candidateDirs.length - 1] : null;

      if (!selected) {
        pluginReason = '未找到匹配的插件目录';
        console.log('[插件检测] ❌ 未找到匹配的插件');
      } else {
        console.log('[插件检测] 选择的插件:', selected.name);
        const packageJsonPath = path.join(selected.fullPath, 'package.json');
        console.log('[插件检测] 检查 package.json:', packageJsonPath);
        console.log('[插件检测] package.json 是否存在:', fs.existsSync(packageJsonPath));
        
        const pkg = readJsonSafe(packageJsonPath);
        if (!pkg.ok) {
          pluginReason = `找到插件目录但 package.json 无效: ${selected.name}`;
          console.log('[插件检测] ❌ package.json 无效');
        } else {
          pluginId = pkg.data?.name || null;
          pluginVersion = pkg.data?.version || selected.version || null;
          console.log('[插件检测] 插件 ID:', pluginId);
          console.log('[插件检测] 插件版本:', pluginVersion);

          // 插件需包含 MCP server 文件才算"安装完整"
          const mcpServerPath1 = path.join(selected.fullPath, 'out', 'mcpServerStandalone.js');
          const mcpServerPath2 = path.join(selected.fullPath, 'mcp-server.js');
          console.log('[插件检测] 检查 MCP 服务器文件:');
          console.log('  - 路径1:', mcpServerPath1, '存在:', fs.existsSync(mcpServerPath1));
          console.log('  - 路径2:', mcpServerPath2, '存在:', fs.existsSync(mcpServerPath2));
          
          const hasMcpServer = fs.existsSync(mcpServerPath1) || fs.existsSync(mcpServerPath2);

          if (!hasMcpServer) {
            pluginReason = `插件目录存在但缺少 MCP 服务器文件: ${selected.name}`;
            console.log('[插件检测] ❌ MCP 服务器文件不存在');
          } else {
            pluginInstalled = true;
            pluginPath = selected.fullPath;
            pluginReason = `已安装: ${selected.name}`;
            console.log('[插件检测] ✅ 插件检测通过');
            console.log('[插件检测] 插件路径:', pluginPath);
          }
        }
      }
    } else {
      pluginReason = '扩展目录不存在';
      console.log('[插件检测] ❌ 扩展目录不存在:', extensionsPath);
    }
    
    // 检查 MCP 配置（Windsurf 使用 .codeium/windsurf 目录）
    const mcpConfigPath = path.join(app.getPath('home'), '.codeium', 'windsurf', 'mcp_config.json');
    let mcpConfigured = false;
    let mcpConfigReason = null;
    let resolvedMcpServerPath = null;
    console.log('[插件检测] MCP配置路径:', mcpConfigPath);
    
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        const servers = mcpConfig?.mcpServers || {};
        const askContinue = servers.ask_continue;
        const windsurfContinue = servers['windsurf-continue-pro'];
        const server = askContinue || windsurfContinue;

        if (server && Array.isArray(server.args) && server.args.length) {
          resolvedMcpServerPath = String(server.args[0] || '').replace(/\//g, path.sep);
          if (resolvedMcpServerPath && fs.existsSync(resolvedMcpServerPath)) {
            mcpConfigured = true;
            mcpConfigReason = '配置存在且 MCP 服务器文件存在';
          } else {
            mcpConfigured = false;
            mcpConfigReason = '配置存在但 MCP 服务器文件不存在/路径无效';
          }
        } else if (server) {
          mcpConfigured = true;
          mcpConfigReason = '配置存在（未校验服务器文件路径）';
        } else {
          mcpConfigured = false;
          mcpConfigReason = '未找到 ask_continue 相关配置';
        }
      } catch (e) {
        mcpConfigured = false;
        mcpConfigReason = '配置文件解析失败';
      }
    } else {
      mcpConfigReason = '配置文件不存在';
    }
    
    return {
      success: true,
      data: {
        pluginInstalled,
        pluginPath,
        pluginId,
        pluginVersion,
        pluginReason,
        mcpConfigured,
        mcpConfigPath,
        mcpConfigReason,
        resolvedMcpServerPath
      }
    };
  } catch (error) {
    console.error('检测插件状态失败:', error);
    return { success: false, message: error.message };
  }
}

// 检测插件状态的IPC handler
ipcMain.handle('check-plugin-status', async () => {
  return await checkPluginStatusInternal();
});

// 安装插件（自动关闭 Windsurf 并清除旧缓存）
ipcMain.handle('install-plugin', async (event) => {
  try {
    // 总共8个主要步骤
    const TOTAL_STEPS = 8;
    let currentStep = 0;
    
    const sendProgress = (stepName, message) => {
      currentStep++;
      const percent = Math.round((currentStep / TOTAL_STEPS) * 100);
      event.sender.send('switch-progress', { 
        step: 'info', 
        message: `[${currentStep}/${TOTAL_STEPS}] ${message}`,
        percent: percent
      });
    };
    
    // ========== 第一步：清理损坏的 extensions.json 引用（在关闭 Windsurf 之前） ==========
    // 这样可以避免 Windsurf 重启时读取到损坏的引用
    console.log('[安装插件] ========== 开始清理 extensions.json ==========');
    sendProgress('cleanup-json', '⏳ 清理损坏的插件引用...');
    const extensionsPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
    const extensionsJsonPath = path.join(extensionsPath, 'extensions.json');
    
    if (fs.existsSync(extensionsJsonPath)) {
      try {
        console.log('[安装插件] 读取 extensions.json:', extensionsJsonPath);
        const jsonContent = fs.readFileSync(extensionsJsonPath, 'utf-8');
        const extensions = JSON.parse(jsonContent);
        console.log('[安装插件] 当前扩展数量:', extensions.length);
        
        if (Array.isArray(extensions) && extensions.length > 0) {
          // 过滤掉损坏的插件引用（文件不存在但仍在 JSON 中）
          const validExtensions = extensions.filter(ext => {
            if (!ext.location || !ext.location.fsPath) {
              console.log('[安装插件] 发现无效扩展（缺少 location）:', ext.identifier?.id || '未知');
              return false;
            }
            
            // 检查是否是我们的插件（严格匹配）
            if (!ext.identifier || !ext.identifier.id) {
              return true; // 保留没有 identifier 或 id 的扩展
            }
            
            // 【重要修复】只检查 windsurf-continue-pro 插件，不影响 ask-continue 插件
            if (isOurPlugin(ext.identifier.id, 'windsurf-continue-pro')) {
              // 检查插件目录是否存在
              const pluginExists = fs.existsSync(ext.location.fsPath);
              console.log(`[安装插件] 检查 windsurf-continue-pro 插件: ${ext.identifier.id}`);
              console.log(`[安装插件]   路径: ${ext.location.fsPath}`);
              console.log(`[安装插件]   存在: ${pluginExists}`);
              
              if (!pluginExists) {
                console.log(`[安装插件] ❌ 发现损坏的 windsurf-continue-pro 引用，将删除: ${ext.identifier.id}`);
                event.sender.send('switch-progress', { 
                  step: 'info', 
                  message: `[${currentStep}/${TOTAL_STEPS}] 🗑️ 删除损坏的引用: ${ext.identifier.id}` 
                });
                return false; // 过滤掉这个损坏的引用
              } else {
                console.log(`[安装插件] ✅ 插件目录存在，保留引用`);
              }
            }
            
            return true; // 保留其他正常的扩展
          });
          
          // 如果有损坏的引用被清理，更新 JSON 文件
          if (validExtensions.length !== extensions.length) {
            const removedCount = extensions.length - validExtensions.length;
            console.log(`[安装插件] 清理了 ${removedCount} 个损坏的插件引用`);
            console.log('[安装插件] 写入更新后的 extensions.json...');
            
            // 确保文件可写
            try {
              fs.chmodSync(extensionsJsonPath, 0o666);
            } catch (chmodErr) {
              console.warn('[安装插件] 无法修改文件权限:', chmodErr.message);
            }
            
            fs.writeFileSync(extensionsJsonPath, JSON.stringify(validExtensions, null, 2), 'utf-8');
            console.log('[安装插件] ✅ extensions.json 已修复');
            event.sender.send('switch-progress', { 
              step: 'info', 
              message: `[${currentStep}/${TOTAL_STEPS}] ✅ 已删除 ${removedCount} 个损坏的引用` 
            });
          } else {
            console.log('[安装插件] ✅ extensions.json 无需修复（无损坏引用）');
          }
        } else {
          console.log('[安装插件] extensions.json 为空或不是数组');
        }
      } catch (err) {
        console.error('[安装插件] ⚠️ 清理 extensions.json 失败:', err.message);
        console.error('[安装插件] 错误堆栈:', err.stack);
        
        // 如果解析失败，尝试备份并重置为空数组
        try {
          const backupPath = extensionsJsonPath + '.backup.' + Date.now();
          console.log('[安装插件] 备份损坏的 extensions.json...');
          fs.copyFileSync(extensionsJsonPath, backupPath);
          console.log(`[安装插件] 已备份到: ${backupPath}`);
          
          console.log('[安装插件] 重置 extensions.json 为空数组...');
          fs.writeFileSync(extensionsJsonPath, '[]', 'utf-8');
          console.log('[安装插件] ✅ 已重置 extensions.json');
          
          event.sender.send('switch-progress', { 
            step: 'info', 
            message: `[${currentStep}/${TOTAL_STEPS}] ✅ 已重置损坏的配置文件` 
          });
        } catch (resetErr) {
          console.error('[安装插件] ❌ 重置 extensions.json 失败:', resetErr.message);
          console.error('[安装插件] 错误堆栈:', resetErr.stack);
        }
      }
    } else {
      console.log('[安装插件] extensions.json 不存在，无需清理');
    }
    console.log('[安装插件] ========== extensions.json 清理完成 ==========');
    
    // 检测 Windsurf 是否正在运行
    const isRunning = await processMonitor.isWindsurfRunning();
    if (isRunning) {
      console.log('[安装插件] Windsurf 正在运行，需要先关闭...');
      sendProgress('close', '⏳ 正在关闭 Windsurf...');
      
      const killResult = await processMonitor.killWindsurf();
      if (killResult.killed) {
        // 等待进程完全退出（最多等待 10 秒）
        let closed = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const stillRunning = await processMonitor.isWindsurfRunning();
          if (!stillRunning) {
            closed = true;
            break;
          }
        }
        if (closed) {
          console.log('[安装插件] Windsurf 已关闭');
          sendProgress('closed', '✅ Windsurf 已关闭');
          // 额外等待 1 秒确保文件句柄释放
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          return { success: false, message: 'Windsurf 未能完全关闭，请手动关闭后重试' };
        }
      } else {
        return { success: false, message: '无法关闭 Windsurf，请手动关闭后重试' };
      }
    }
    
    // 先使用 CLI 卸载插件（更彻底）
    console.log('[安装插件] ========== 开始卸载旧插件 ==========');
    sendProgress('uninstall', '⏳ 卸载旧插件...');
    
    // 获取 Windsurf CLI 路径
    let windsurfExe = configManager.getWindsurfExePath();
    if (!windsurfExe) {
      windsurfExe = detectWindsurfExecutable();
      if (windsurfExe) {
        configManager.setWindsurfExePath(windsurfExe);
      }
    }
    
    if (windsurfExe && fs.existsSync(windsurfExe)) {
      const windsurfDir = path.dirname(windsurfExe);
      const binDir = path.join(windsurfDir, 'bin');
      const cliPath = path.join(binDir, 'windsurf.cmd');
      
      if (fs.existsSync(cliPath)) {
        try {
          const { execFile } = require('child_process');
          const { promisify } = require('util');
          const execFileAsync = promisify(execFile);
          
          // 尝试卸载所有可能的插件 ID
          const pluginIds = [
            'undefined_publisher.windsurf-continue-pro',
            'papercrane.windsurf-continue-pro',
            'windsurf-continue-pro'
          ];
          
          for (let i = 0; i < pluginIds.length; i++) {
            const pluginId = pluginIds[i];
            try {
              console.log(`[安装插件] 尝试卸载: ${pluginId}`);
              event.sender.send('switch-progress', { 
                step: 'info', 
                message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 卸载旧插件 (${i + 1}/${pluginIds.length})...` 
              });
              await execFileAsync(cliPath, ['--uninstall-extension', pluginId], {
                timeout: 30000,
                windowsHide: true
              });
              console.log(`[安装插件] ✅ 已卸载: ${pluginId}`);
              await sleep(500);
            } catch (err) {
              console.log(`[安装插件] 卸载 ${pluginId} 失败或不存在:`, err.message);
            }
          }
        } catch (err) {
          console.warn('[安装插件] CLI 卸载失败:', err.message);
        }
      }
    }
    
    // 等待 CLI 卸载完成
    await sleep(2000);
    
    // 手动清除插件相关缓存（确保彻底清理）
    console.log('[安装插件] 手动清除插件文件...');
    sendProgress('cleanup', '⏳ 清除插件文件...');
    if (fs.existsSync(extensionsPath)) {
      const extensions = fs.readdirSync(extensionsPath);
      // 【重要修复】明确指定只删除 windsurf-continue-pro 插件，不删除 ask-continue
      const targetExts = extensions.filter(ext => isOurPlugin(ext, 'windsurf-continue-pro'));
      console.log(`[安装插件] 扫描到 ${extensions.length} 个扩展，匹配到 ${targetExts.length} 个 windsurf-continue-pro 插件`);
      for (let i = 0; i < targetExts.length; i++) {
        const ext = targetExts[i];
        const extPath = path.join(extensionsPath, ext);
        console.log(`[安装插件] 删除 windsurf-continue-pro 插件目录: ${ext}`);
        event.sender.send('switch-progress', { 
          step: 'info', 
          message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 清除插件文件 (${i + 1}/${targetExts.length})...` 
        });
        const delResult = await removePathWithRetries(extPath, { isDir: true, maxRetries: 10 });
        if (delResult.removed) {
          console.log('[安装插件] ✅ 已删除旧版本:', ext);
        } else {
          console.warn('[安装插件] ⚠️ 删除旧版本失败:', ext, delResult.error?.message);
        }
      }
    }
    
    // 清除插件缓存
    const cachedExtPath = path.join(windsurfUserDataPath, 'CachedExtensionVSIXs');
    if (fs.existsSync(cachedExtPath)) {
      const files = fs.readdirSync(cachedExtPath);
      for (const file of files) {
        // 【重要修复】明确指定只删除 windsurf-continue-pro 插件缓存
        if (isOurPlugin(file, 'windsurf-continue-pro')) {
          const filePath = path.join(cachedExtPath, file);
          console.log(`[安装插件] 清除 windsurf-continue-pro 缓存文件: ${file}`);
          const delResult = await removePathWithRetries(filePath, { isDir: false, maxRetries: 10 });
          if (delResult.removed) {
            console.log('[安装插件] ✅ 已清除缓存:', file);
          } else {
            console.warn('[安装插件] ⚠️ 清除缓存失败:', file, delResult.error?.message);
          }
        }
      }
    }
    
    // 清除 globalState
    const globalStoragePath = path.join(windsurfUserDataPath, 'User', 'globalStorage');
    if (fs.existsSync(globalStoragePath)) {
      const extensions = fs.readdirSync(globalStoragePath);
      for (const ext of extensions) {
        // 【重要修复】明确指定只删除 windsurf-continue-pro 插件的 globalState
        if (isOurPlugin(ext, 'windsurf-continue-pro')) {
          const extPath = path.join(globalStoragePath, ext);
          console.log(`[安装插件] 清除 windsurf-continue-pro globalState: ${ext}`);
          const delResult = await removePathWithRetries(extPath, { isDir: true, maxRetries: 10 });
          if (delResult.removed) {
            console.log('[安装插件] ✅ 已清除 globalState:', ext);
          } else {
            console.warn('[安装插件] ⚠️ 清除 globalState 失败:', ext, delResult.error?.message);
          }
        }
      }
    }
    
    // 清除 workspaceStorage（可能包含插件状态）
    const workspaceStoragePath = path.join(windsurfUserDataPath, 'User', 'workspaceStorage');
    if (fs.existsSync(workspaceStoragePath)) {
      try {
        const workspaces = fs.readdirSync(workspaceStoragePath);
        for (const workspace of workspaces) {
          const wsPath = path.join(workspaceStoragePath, workspace);
          if (fs.statSync(wsPath).isDirectory()) {
            const wsStateFile = path.join(wsPath, 'state.vscdb');
            if (fs.existsSync(wsStateFile)) {
              try {
                const content = fs.readFileSync(wsStateFile, 'utf-8');
                // 严格匹配：只匹配带有完整发布者前缀的插件ID
                if (content.includes('papercrane-team.windsurf-continue-pro') || content.includes('undefined_publisher.windsurf-continue-pro')) {
                  console.log(`[安装插件] 清除工作区状态: ${workspace}`);
                  const delResult = await removePathWithRetries(wsPath, { isDir: true, maxRetries: 5 });
                  if (delResult.removed) {
                    console.log('[安装插件] ✅ 已清除工作区状态');
                  }
                }
              } catch (err) {
                // 忽略读取错误
              }
            }
          }
        }
      } catch (err) {
        console.warn('[安装插件] 清除工作区状态失败:', err.message);
      }
    }
    
    // ========== 再次清理 extensions.json（删除插件目录后，清理残留的引用） ==========
    console.log('[安装插件] ========== 再次清理 extensions.json ==========');
    sendProgress('cleanup-json-2', '⏳ 清理残留的插件引用...');
    
    if (fs.existsSync(extensionsJsonPath)) {
      try {
        console.log('[安装插件] 读取 extensions.json:', extensionsJsonPath);
        const jsonContent = fs.readFileSync(extensionsJsonPath, 'utf-8');
        const extensions = JSON.parse(jsonContent);
        console.log('[安装插件] 当前扩展数量:', extensions.length);
        
        if (Array.isArray(extensions) && extensions.length > 0) {
          // 【重要修复】只过滤 windsurf-continue-pro 插件引用，不影响 ask-continue
          const validExtensions = extensions.filter(ext => {
            if (!ext.identifier || !ext.identifier.id) {
              return true; // 保留没有 identifier 或 id 的扩展
            }
            
            if (isOurPlugin(ext.identifier.id, 'windsurf-continue-pro')) {
              console.log(`[安装插件] 🗑️ 删除 windsurf-continue-pro 插件引用: ${ext.identifier.id}`);
              return false; // 删除 windsurf-continue-pro 插件引用
            }
            
            return true; // 保留其他扩展（包括 ask-continue）
          });
          
          // 如果有引用被清理，更新 JSON 文件
          if (validExtensions.length !== extensions.length) {
            const removedCount = extensions.length - validExtensions.length;
            console.log(`[安装插件] 清理了 ${removedCount} 个插件引用`);
            console.log('[安装插件] 写入更新后的 extensions.json...');
            
            // 确保文件可写
            try {
              fs.chmodSync(extensionsJsonPath, 0o666);
            } catch (chmodErr) {
              console.warn('[安装插件] 无法修改文件权限:', chmodErr.message);
            }
            
            fs.writeFileSync(extensionsJsonPath, JSON.stringify(validExtensions, null, 2), 'utf-8');
            console.log('[安装插件] ✅ extensions.json 已清理');
            event.sender.send('switch-progress', { 
              step: 'info', 
              message: `[${currentStep}/${TOTAL_STEPS}] ✅ 已删除 ${removedCount} 个插件引用` 
            });
          } else {
            console.log('[安装插件] ✅ extensions.json 无需清理（无插件引用）');
          }
        }
      } catch (err) {
        console.error('[安装插件] ⚠️ 清理 extensions.json 失败:', err.message);
      }
    }
    console.log('[安装插件] ========== extensions.json 清理完成 ==========');
    
    console.log('[安装插件] ✅ 旧插件清理完成');
    sendProgress('cleaned', '✅ 旧插件已清理');
    
    // 先从服务器获取最新插件信息
    let latestVersion = '1.0.0';
    let downloadUrl = null;
    
    console.log('[安装插件] ========== 开始获取插件信息 ==========');
    try {
      sendProgress('version', '⏳ 检查插件版本...');
      const pluginInfo = await KeyManager.checkPluginUpdate('windsurf-continue-pro', '0.0.0');
      if (pluginInfo.success && pluginInfo.data) {
        const serverVersion = pluginInfo.data.latest_version;
        // 服务器返回有效版本且不是 0.0.0 时使用服务器版本
        if (serverVersion && serverVersion !== '0.0.0') {
          latestVersion = serverVersion;
          downloadUrl = pluginInfo.data.download_url;
          console.log('[安装插件] ✅ 服务器最新版本:', latestVersion);
          console.log('[安装插件] ✅ 下载地址:', downloadUrl);
        } else {
          console.warn('[安装插件] ⚠️ 服务器返回版本无效 (0.0.0)，使用默认版本 1.0.0');
        }
      } else {
        console.warn('[安装插件] ⚠️ 服务器未返回插件信息，使用默认版本 1.0.0');
      }
    } catch (err) {
      console.warn('[安装插件] ⚠️ 获取服务器插件信息失败:', err.message);
    }
    
    const pluginFileName = `windsurf-continue-pro-${latestVersion}.vsix`;
    const downloadedPath = path.join(app.getPath('userData'), 'downloads', pluginFileName);
    
    console.log('[安装插件] ========== 准备下载最新插件 ==========');
    console.log('[安装插件] 目标文件名:', pluginFileName);
    
    // 强制从服务器下载最新版本（删除旧的下载文件）
    let vsixPath = null;
    
    // 1. 删除旧的下载文件（确保获取最新版本）
    if (fs.existsSync(downloadedPath)) {
      console.log('[安装插件] 删除旧的下载文件:', downloadedPath);
      try {
        fs.unlinkSync(downloadedPath);
        console.log('[安装插件] ✅ 旧文件已删除');
      } catch (err) {
        console.warn('[安装插件] ⚠️ 删除旧文件失败:', err.message);
      }
    }
    
    // 2. 清理 downloads 目录中的所有旧版本插件文件
    const downloadsDir = path.join(app.getPath('userData'), 'downloads');
    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir);
      for (const file of files) {
        if (isOurPlugin(file) && file.endsWith('.vsix')) {
          const oldFile = path.join(downloadsDir, file);
          try {
            fs.unlinkSync(oldFile);
            console.log('[安装插件] 清理旧版本文件:', file);
          } catch (err) {
            console.warn('[安装插件] 清理失败:', file, err.message);
          }
        }
      }
    }
    
    // 3. 从服务器下载最新版本
    if (!downloadUrl) {
      console.error('[安装插件] ❌ 无法获取下载地址');
      
      // 降级方案：尝试使用本地 resources 目录的文件
      const possiblePaths = [
        path.join(__dirname, 'resources', pluginFileName),
        path.join(app.getAppPath(), 'resources', pluginFileName),
        path.join(process.cwd(), 'resources', pluginFileName)
      ];
      
      console.log('[安装插件] 尝试使用本地备用文件:');
      for (const testPath of possiblePaths) {
        console.log(`  - ${testPath}: ${fs.existsSync(testPath) ? '✅ 存在' : '❌ 不存在'}`);
        if (!vsixPath && fs.existsSync(testPath)) {
          vsixPath = testPath;
          console.log('[安装插件] ⚠️ 使用本地备用文件（可能不是最新版本）');
        }
      }
      
      if (!vsixPath) {
        return { 
          success: false, 
          message: `无法获取插件文件\n\n目标文件: ${pluginFileName}\n\n可能原因：\n1. 服务器连接失败\n2. 本地 resources 目录缺少插件文件\n\n建议：\n1. 检查网络连接\n2. 确保 resources 目录下有 ${pluginFileName}` 
        };
      }
    } else {
      sendProgress('download', '⏳ 正在从服务器下载最新插件...');
      console.log('[安装插件] 从服务器下载最新版本...');
      console.log('[安装插件] 下载地址:', downloadUrl);
      
      // 确保 downloads 目录存在
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      
      // 下载到 userData/downloads 目录
      const downloadResult = await KeyManager.downloadPlugin(downloadUrl, downloadedPath, (percent) => {
        event.sender.send('switch-progress', { 
          step: 'info', 
          message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 下载插件中... ${percent}%`,
          percent: Math.round((currentStep - 1) / TOTAL_STEPS * 100 + percent / TOTAL_STEPS)
        });
      });
      
      if (!downloadResult.success) {
        console.error('[安装插件] ❌ 下载失败:', downloadResult.message);
        return { 
          success: false, 
          message: `下载插件失败: ${downloadResult.message}\n\n请检查网络连接后重试` 
        };
      }
      
      vsixPath = downloadedPath;
      console.log('[安装插件] ✅ 最新插件下载成功:', vsixPath);
      event.sender.send('switch-progress', { 
        step: 'info', 
        message: `[${currentStep}/${TOTAL_STEPS}] ✅ 最新插件下载完成`,
        percent: Math.round((currentStep / TOTAL_STEPS) * 100)
      });
    }
    
    // 检测 Windsurf 可执行文件（复用之前获取的 windsurfExe）
    if (!windsurfExe) {
      windsurfExe = configManager.getWindsurfExePath();
      if (!windsurfExe) {
        windsurfExe = detectWindsurfExecutable();
        if (windsurfExe) {
          configManager.setWindsurfExePath(windsurfExe);
        }
      }
    }
    
    if (!windsurfExe || !fs.existsSync(windsurfExe)) {
      return { success: false, message: '未找到 Windsurf 可执行文件' };
    }
    
    // 获取 Windsurf CLI 路径（在 bin 目录下）
    const windsurfDir = path.dirname(windsurfExe);
    const binDir = path.join(windsurfDir, 'bin');
    const cliPath = path.join(binDir, 'windsurf.cmd');
    
    if (!fs.existsSync(cliPath)) {
      return { success: false, message: `未找到 Windsurf CLI: ${cliPath}` };
    }
    
    // 记录 Windsurf 之前是否在运行
    const wasWindsurfRunning = isRunning;
    
    // 如果刚刚关闭了 Windsurf，需要额外等待以确保扩展系统完全释放
    if (wasWindsurfRunning) {
      console.log('[安装插件] 等待扩展系统完全释放 (5秒)...');
      event.sender.send('switch-progress', { 
        step: 'info', 
        message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 等待系统释放资源...` 
      });
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        event.sender.send('switch-progress', { 
          step: 'info', 
          message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 等待系统释放资源... (${i + 1}/5秒)` 
        });
      }
    }
    
    // 使用 Windsurf CLI 安装插件（确保正确注册）
    sendProgress('install', '⏳ 正在安装插件...');
    
    try {
      // 使用 CLI 安装插件
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      
      console.log('[安装插件] 使用 CLI 安装:', cliPath);
      console.log('[安装插件] VSIX 路径:', vsixPath);
      
      // 检查路径是否包含非 ASCII 字符（如中文），如果是则复制到安全路径
      // 这是为了解决 Windsurf CLI 的 V8 引擎无法处理非 ASCII 路径的问题
      let safeVsixPath = vsixPath;
      const hasNonAscii = /[^\x00-\x7F]/.test(vsixPath);
      if (hasNonAscii) {
        console.log('[安装插件] ⚠️ 检测到路径包含非 ASCII 字符，复制到安全路径...');
        event.sender.send('switch-progress', { 
          step: 'info', 
          message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 处理特殊字符路径...` 
        });
        
        // 使用 Windows 系统临时目录（通常是 C:\Windows\Temp 或不含中文的路径）
        const os = require('os');
        const safeTempDir = 'C:\\Windows\\Temp';
        const fallbackTempDir = os.tmpdir();
        const tempDir = fs.existsSync(safeTempDir) ? safeTempDir : fallbackTempDir;
        const safeFileName = 'windsurf-plugin-install.vsix';
        safeVsixPath = path.join(tempDir, safeFileName);
        
        try {
          fs.copyFileSync(vsixPath, safeVsixPath);
          console.log('[安装插件] ✅ 已复制到安全路径:', safeVsixPath);
        } catch (copyError) {
          console.error('[安装插件] ❌ 复制失败:', copyError);
          // 如果复制失败，仍然尝试使用原路径
          safeVsixPath = vsixPath;
        }
      }
      
      try {
        console.log('[安装插件] ========== 开始 CLI 安装 ==========');
        console.log('[安装插件] CLI 路径:', cliPath);
        console.log('[安装插件] VSIX 路径:', safeVsixPath);
        console.log('[安装插件] 扩展目录:', extensionsPath);
        
        const { stdout, stderr } = await execFileAsync(cliPath, ['--install-extension', safeVsixPath, '--force'], {
          timeout: 120000, // 2分钟超时
          windowsHide: true
        });
        
        console.log('[安装插件] ========== CLI 执行完成 ==========');
        if (stdout) console.log('[安装插件] CLI 标准输出:', stdout);
        if (stderr) console.log('[安装插件] CLI 错误输出:', stderr);
        
        // 等待文件系统同步
        console.log('[安装插件] 等待文件系统同步 (2秒)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('[安装插件] CLI 安装完成，开始验证...');
        event.sender.send('switch-progress', { 
          step: 'info', 
          message: `[${currentStep}/${TOTAL_STEPS}] ✅ 插件已安装`,
          percent: Math.round((currentStep / TOTAL_STEPS) * 100)
        });
      } catch (cliError) {
        console.error('[安装插件] CLI 安装失败:', cliError);
        
        // 如果错误信息包含 "Please restart Windsurf"，说明需要使用延迟脚本安装
        if (cliError.message && cliError.message.includes('Please restart')) {
          console.log('[安装插件] 检测到需要重启，使用延迟脚本安装...');
          event.sender.send('switch-progress', { 
            step: 'info', 
            message: `[${currentStep}/${TOTAL_STEPS}] ⏳ 创建延迟安装脚本...` 
          });
          
          // 创建 PowerShell 延迟安装脚本
          const os = require('os');
          const tempDir = os.tmpdir();
          const scriptPath = path.join(tempDir, 'windsurf-delayed-install.ps1');
          
          const scriptContent = `# Windsurf Continue Pro 延迟安装脚本
Write-Host "等待 3 秒后开始安装..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

Write-Host "正在卸载旧版本插件..." -ForegroundColor Yellow
$pluginIds = @(
    "undefined_publisher.windsurf-continue-pro",
    "papercrane.windsurf-continue-pro",
    "windsurf-continue-pro"
)

foreach ($pluginId in $pluginIds) {
    try {
        Write-Host "  尝试卸载: $pluginId" -ForegroundColor Gray
        & "${cliPath}" --uninstall-extension "$pluginId" 2>$null
        Start-Sleep -Milliseconds 500
    } catch {
        # 忽略卸载错误（插件可能不存在）
    }
}

Write-Host "正在安装 Windsurf Continue Pro..." -ForegroundColor Yellow
try {
    & "${cliPath}" --install-extension "${safeVsixPath}" --force
    Write-Host "✓ 插件安装成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "请重新打开 Windsurf 使插件生效。" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 安装失败: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 5
Remove-Item -Path "$PSCommandPath" -Force -ErrorAction SilentlyContinue
`;
          
          fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
          console.log('[安装插件] 延迟脚本已创建:', scriptPath);
          
          // 启动延迟脚本（后台运行）
          const { spawn } = require('child_process');
          spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Normal',
            '-File', scriptPath
          ], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          
          console.log('[安装插件] 延迟脚本已启动');
          event.sender.send('switch-progress', { 
            step: 'info', 
            message: `[${currentStep}/${TOTAL_STEPS}] ✅ 延迟安装脚本已启动`,
            percent: 100
          });
          
          // 返回特殊状态，告知用户稍等片刻
          return {
            success: true,
            delayed: true,
            message: '插件正在后台安装中...\n\n由于系统限制，安装脚本将在 3 秒后自动执行。\n请稍等片刻，然后重启 Windsurf 即可使用插件。',
            wasRunning: wasWindsurfRunning
          };
        }
        
        throw new Error(`CLI 安装失败: ${cliError.message}`);
      }
      
      // 查找已安装的插件目录
      // 先列出所有扩展目录，找到匹配的插件
      let actualTargetDir = null;
      
      console.log('[安装插件] ========== 开始查找插件目录 ==========');
      console.log('[安装插件] 扩展目录路径:', extensionsPath);
      console.log('[安装插件] 扩展目录是否存在:', fs.existsSync(extensionsPath));
      
      if (fs.existsSync(extensionsPath)) {
        const allExtensions = fs.readdirSync(extensionsPath);
        console.log('[安装插件] 扩展目录中的所有文件/目录 (共 ' + allExtensions.length + ' 个):');
        allExtensions.forEach(ext => console.log('  - ' + ext));
        
        // 查找我们的插件目录
        console.log('[安装插件] 查找我们的插件目录...');
        const matchedDirs = allExtensions.filter(dir => isOurPlugin(dir));
        
        console.log('[安装插件] 匹配的插件目录 (共 ' + matchedDirs.length + ' 个):', matchedDirs);
        
        if (matchedDirs.length > 0) {
          // 如果有多个，选择版本号最高的
          matchedDirs.sort((a, b) => {
            const versionA = extractVersionFromDirName(a);
            const versionB = extractVersionFromDirName(b);
            return compareVersions(versionA, versionB);
          });
          actualTargetDir = path.join(extensionsPath, matchedDirs[matchedDirs.length - 1]);
          console.log('[安装插件] 选择的插件目录:', actualTargetDir);
        }
      }
      
      if (!actualTargetDir) {
        console.error('[安装插件] ========== 错误：未找到插件安装目录 ==========');
        console.error('[安装插件] 扩展目录路径:', extensionsPath);
        console.error('[安装插件] 这意味着 CLI 安装可能失败，或插件目录名称不包含关键词');
        return { 
          success: false, 
          message: `未找到插件安装目录\n\n扩展目录: ${extensionsPath}\n\n可能原因：\n1. CLI 安装失败但未报错\n2. 插件目录命名格式不符合预期\n3. 文件系统同步延迟\n\n建议：重启客户端后重试，或手动检查扩展目录` 
        };
      }
      
      console.log('[安装插件] 插件目录:', actualTargetDir);
      
      // 验证关键文件是否存在
      const packageJsonPath = path.join(actualTargetDir, 'package.json');
      const mcpServerPath1 = path.join(actualTargetDir, 'out', 'mcpServerStandalone.js');
      const mcpServerPath2 = path.join(actualTargetDir, 'mcp-server.js');
      
      if (!fs.existsSync(packageJsonPath)) {
        console.error('[安装插件] 验证失败: package.json 不存在');
        return { success: false, message: '插件安装失败：package.json 文件缺失，请检查插件包是否完整' };
      }
      
      const hasMcpServer = fs.existsSync(mcpServerPath1) || fs.existsSync(mcpServerPath2);
      if (!hasMcpServer) {
        console.error('[安装插件] 验证失败: MCP 服务器文件不存在');
        return { success: false, message: '插件安装失败：MCP 服务器文件缺失，请检查插件包是否完整' };
      }
      
      console.log('[安装插件] 插件文件验证通过');
      sendProgress('verify', '✅ 插件文件验证通过');
      
      // 自动配置 MCP
      let mcpConfigured = false;
      try {
        const mcpServerPath = fs.existsSync(mcpServerPath1) ? mcpServerPath1 : mcpServerPath2;
        const mcpConfigDir = path.join(app.getPath('home'), '.codeium', 'windsurf');
        const mcpConfigPath = path.join(mcpConfigDir, 'mcp_config.json');
        
        if (!fs.existsSync(mcpConfigDir)) {
          fs.mkdirSync(mcpConfigDir, { recursive: true });
        }
        
        // 使用固定端口号（确保插件和MCP服务器使用相同端口）
        const defaultPort = 35719;
        let httpPort = defaultPort;
        
        // 检查是否有现有端口文件
        try {
          const globalPortFile = path.join(app.getPath('home'), '.ask_continue_port');
          if (fs.existsSync(globalPortFile)) {
            const portContent = fs.readFileSync(globalPortFile, 'utf-8').trim();
            try {
              const portData = JSON.parse(portContent);
              httpPort = portData.port || defaultPort;
            } catch {
              httpPort = parseInt(portContent) || defaultPort;
            }
            console.log('[安装插件] 检测到已有HTTP端口:', httpPort);
          } else {
            console.log('[安装插件] 未检测到端口文件，使用默认端口:', defaultPort);
          }
        } catch (portErr) {
          console.warn('[安装插件] 读取端口文件失败:', portErr.message);
        }
        
        // 【重要修复】预先写入端口文件，确保插件启动时能读取到正确的端口
        // 这样可以避免插件使用不同的端口导致连接失败
        try {
          const globalPortFile = path.join(app.getPath('home'), '.ask_continue_port');
          const portFileData = {
            port: httpPort,
            pid: -1, // 客户端写入，暂无 PID
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            source: 'client-install' // 标记来源
          };
          fs.writeFileSync(globalPortFile, JSON.stringify(portFileData, null, 2), 'utf-8');
          console.log('[安装插件] ✓ 已预写入端口文件:', globalPortFile, '端口:', httpPort);
          
          // 同时写入到 Windsurf 配置目录
          const windsurfPortFile = path.join(mcpConfigDir, '.ask_continue_port');
          fs.writeFileSync(windsurfPortFile, JSON.stringify(portFileData, null, 2), 'utf-8');
          console.log('[安装插件] ✓ 已写入 Windsurf 配置目录端口文件');
        } catch (writeErr) {
          console.warn('[安装插件] 写入端口文件失败:', writeErr.message);
        }
        
        // 合并现有配置，避免覆盖用户其他 MCP 配置
        let mcpConfig = { mcpServers: {} };
        if (fs.existsSync(mcpConfigPath)) {
          const parsed = readJsonSafe(mcpConfigPath);
          if (parsed.ok && parsed.data) mcpConfig = parsed.data;
        }
        mcpConfig.mcpServers = mcpConfig.mcpServers || {};
        
        const finalPort = httpPort;
        
        const mcpServerConfig = {
          command: 'node',
          args: [mcpServerPath.replace(/\\/g, '/')],
          env: {
            WINDSURF_PRO_HTTP_PORT: String(finalPort)
          },
          disabled: false
        };
        
        console.log('[安装插件] MCP配置已添加HTTP_PORT环境变量:', finalPort);
        if (!httpPort) {
          console.log('[安装插件] 未检测到已有HTTP端口，使用默认端口:', defaultPort);
        }
        
        mcpConfig.mcpServers.ask_continue = mcpServerConfig;

        fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
        console.log('[安装插件] MCP 配置已自动完成');
        sendProgress('mcp', '✅ MCP 配置已完成');
        mcpConfigured = true;
      } catch (mcpErr) {
        console.warn('[安装插件] 自动配置 MCP 失败:', mcpErr.message);
      }
      
      // 最终验证：再次检查插件状态
      const finalCheck = await checkPluginStatusInternal();
      if (!finalCheck.success || !finalCheck.data.pluginInstalled) {
        console.error('[安装插件] 最终验证失败:', finalCheck);
        return { 
          success: false, 
          message: `插件安装失败：安装后验证未通过\n原因：${finalCheck.data?.pluginReason || '未知错误'}` 
        };
      }
      
      console.log('[安装插件] 最终验证通过，插件安装成功');
      event.sender.send('switch-progress', { 
        step: 'info', 
        message: `[${TOTAL_STEPS}/${TOTAL_STEPS}] ✅ 安装完成！`,
        percent: 100
      });
      return { 
        success: true, 
        message: `插件安装成功！${mcpConfigured ? 'MCP 已自动配置。' : ''}\n\n请重启 Windsurf 使插件生效。`, 
        wasRunning: wasWindsurfRunning 
      };
    } catch (installError) {
      console.error('[安装插件] 安装失败:', installError);
      return { success: false, message: `安装插件失败: ${installError.message}` };
    }
  } catch (error) {
    console.error('安装插件失败:', error);
    return { success: false, message: error.message };
  }
});

// 更新插件（从服务器下载最新版本并安装）
ipcMain.handle('update-plugin', async (event, { targetVersion, downloadUrl }) => {
  try {
    // 检测 Windsurf 是否正在运行
    const isRunning = await processMonitor.isWindsurfRunning();
    if (isRunning) {
      console.log('[更新插件] Windsurf 正在运行，需要先关闭...');
      event.sender.send('switch-progress', { step: 'info', message: '⏳ 正在关闭 Windsurf...' });
      
      const killResult = await processMonitor.killWindsurf();
      if (killResult.killed) {
        let closed = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const stillRunning = await processMonitor.isWindsurfRunning();
          if (!stillRunning) {
            closed = true;
            break;
          }
        }
        if (closed) {
          console.log('[更新插件] Windsurf 已关闭');
          event.sender.send('switch-progress', { step: 'info', message: '✅ Windsurf 已关闭' });
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          return { success: false, message: 'Windsurf 未能完全关闭，请手动关闭后重试' };
        }
      } else {
        return { success: false, message: '无法关闭 Windsurf，请手动关闭后重试' };
      }
    }
    
    // 清除旧版本插件
    console.log('[更新插件] 清除旧版本...');
    event.sender.send('switch-progress', { step: 'info', message: '⏳ 清除旧版本...' });
    const extensionsPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
    if (fs.existsSync(extensionsPath)) {
      const extensions = fs.readdirSync(extensionsPath);
      for (const ext of extensions) {
        if (isOurPlugin(ext)) {
          const extPath = path.join(extensionsPath, ext);
          const delResult = await removePathWithRetries(extPath, { isDir: true });
          if (delResult.removed) {
            console.log('[更新插件] 已删除旧版本:', ext);
          } else {
            console.warn('[更新插件] 删除旧版本失败:', ext, delResult.error?.message);
          }
        }
      }
    }
    
    // 清除插件缓存
    const cachedExtPath = path.join(windsurfUserDataPath, 'CachedExtensionVSIXs');
    if (fs.existsSync(cachedExtPath)) {
      const files = fs.readdirSync(cachedExtPath);
      for (const file of files) {
        if (isOurPlugin(file)) {
          const filePath = path.join(cachedExtPath, file);
          const delResult = await removePathWithRetries(filePath, { isDir: false });
          if (delResult.removed) {
            console.log('[更新插件] 已清除缓存:', file);
          } else {
            console.warn('[更新插件] 清除缓存失败:', file, delResult.error?.message);
          }
        }
      }
    }
    
    // 下载新版本
    if (!downloadUrl) {
      return { success: false, message: '未提供下载地址' };
    }
    
    const pluginFileName = `windsurf-continue-pro-${targetVersion}.vsix`;
    const downloadedPath = path.join(app.getPath('userData'), 'downloads', pluginFileName);
    
    event.sender.send('switch-progress', { step: 'info', message: '⏳ 正在下载新版本...' });
    console.log('[更新插件] 开始下载新版本:', downloadUrl);
    
    const downloadResult = await KeyManager.downloadPlugin(downloadUrl, downloadedPath, (percent) => {
      event.sender.send('switch-progress', { step: 'info', message: `⏳ 下载中... ${percent}%` });
    });
    
    if (!downloadResult.success) {
      return { success: false, message: `下载失败: ${downloadResult.message}` };
    }
    
    console.log('[更新插件] 下载完成:', downloadedPath);
    event.sender.send('switch-progress', { step: 'info', message: '✅ 下载完成' });
    
    // 获取 Windsurf CLI 路径
    let windsurfExe = configManager.getWindsurfExePath();
    if (!windsurfExe) {
      windsurfExe = detectWindsurfExecutable();
      if (windsurfExe) {
        configManager.setWindsurfExePath(windsurfExe);
      }
    }
    
    if (!windsurfExe || !fs.existsSync(windsurfExe)) {
      return { success: false, message: '未找到 Windsurf 可执行文件' };
    }
    
    const windsurfDir = path.dirname(windsurfExe);
    const binDir = path.join(windsurfDir, 'bin');
    const cliPath = path.join(binDir, 'windsurf.cmd');
    
    if (!fs.existsSync(cliPath)) {
      return { success: false, message: `未找到 Windsurf CLI: ${cliPath}` };
    }
    
    // 使用 CLI 安装新版本
    event.sender.send('switch-progress', { step: 'info', message: '⏳ 正在安装新版本...' });
    
    try {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      
      console.log('[更新插件] 使用 CLI 安装:', cliPath);
      console.log('[更新插件] VSIX 路径:', downloadedPath);
      
      // 检查路径是否包含非 ASCII 字符（如中文），如果是则复制到安全路径
      let safeDownloadedPath = downloadedPath;
      const hasNonAscii = /[^\x00-\x7F]/.test(downloadedPath);
      if (hasNonAscii) {
        console.log('[更新插件] ⚠️ 检测到路径包含非 ASCII 字符，复制到安全路径...');
        event.sender.send('switch-progress', { step: 'info', message: '⏳ 处理特殊字符路径...' });
        
        const os = require('os');
        const safeTempDir = 'C:\\Windows\\Temp';
        const fallbackTempDir = os.tmpdir();
        const tempDir = fs.existsSync(safeTempDir) ? safeTempDir : fallbackTempDir;
        const safeFileName = 'windsurf-plugin-update.vsix';
        safeDownloadedPath = path.join(tempDir, safeFileName);
        
        try {
          fs.copyFileSync(downloadedPath, safeDownloadedPath);
          console.log('[更新插件] ✅ 已复制到安全路径:', safeDownloadedPath);
        } catch (copyError) {
          console.error('[更新插件] ❌ 复制失败:', copyError);
          safeDownloadedPath = downloadedPath;
        }
      }
      
      const { stdout, stderr } = await execFileAsync(cliPath, ['--install-extension', safeDownloadedPath, '--force'], {
        timeout: 120000,
        windowsHide: true
      });
      
      if (stdout) console.log('[更新插件] CLI 输出:', stdout);
      if (stderr) console.warn('[更新插件] CLI 错误:', stderr);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('[更新插件] CLI 安装完成');
      event.sender.send('switch-progress', { step: 'info', message: '✅ 插件更新完成' });
      
      // 查找已安装的插件目录
      const targetDir = path.join(extensionsPath, `papercrane-team.windsurf-continue-pro-${targetVersion}`);
      let actualTargetDir = targetDir;
      if (!fs.existsSync(targetDir)) {
        const possibleDirs = [
          `papercrane.windsurf-continue-pro-${targetVersion}`,
          `undefined_publisher.windsurf-continue-pro-${targetVersion}`
        ];
        for (const dirName of possibleDirs) {
          const testPath = path.join(extensionsPath, dirName);
          if (fs.existsSync(testPath)) {
            actualTargetDir = testPath;
            break;
          }
        }
      }
      
      // 更新 MCP 配置
      try {
        const mcpServerPath = path.join(actualTargetDir, 'out', 'mcpServerStandalone.js');
        if (fs.existsSync(mcpServerPath)) {
          const mcpConfigDir = path.join(app.getPath('home'), '.codeium', 'windsurf');
          const mcpConfigPath = path.join(mcpConfigDir, 'mcp_config.json');
          
          if (!fs.existsSync(mcpConfigDir)) {
            fs.mkdirSync(mcpConfigDir, { recursive: true });
          }
          
          let mcpConfig = { mcpServers: {} };
          if (fs.existsSync(mcpConfigPath)) {
            const parsed = readJsonSafe(mcpConfigPath);
            if (parsed.ok && parsed.data) mcpConfig = parsed.data;
          }
          mcpConfig.mcpServers = mcpConfig.mcpServers || {};
          mcpConfig.mcpServers.ask_continue = {
            command: 'node',
            args: [mcpServerPath.replace(/\\/g, '/')],
            env: {
              WINDSURF_PRO_HTTP_PORT: '35719'
            },
            disabled: false
          };

          fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
          console.log('[更新插件] MCP 配置已更新，HTTP 端口: 35719');
        }
      } catch (mcpErr) {
        console.warn('[更新插件] 更新 MCP 配置失败:', mcpErr.message);
      }
      
      return { 
        success: true, 
        message: `插件已更新到 ${targetVersion}！\n\n请重启 Windsurf 使更新生效。`,
        wasRunning: isRunning
      };
    } catch (installError) {
      console.error('[更新插件] 安装失败:', installError);
      return { success: false, message: `安装失败: ${installError.message}` };
    }
  } catch (error) {
    console.error('更新插件失败:', error);
    return { success: false, message: error.message };
  }
});

// 激活插件（同步激活码到插件）
ipcMain.handle('activate-plugin', async () => {
  try {
    // 检查是否有激活码
    if (!keyManager.hasKey()) {
      return { success: false, message: '请先在客户端激活卡密' };
    }
    
    // 获取当前激活码
    const activationKey = keyManager.getKey();
    
    // 检查插件是否已安装
    const statusResult = await checkPluginStatusInternal();
    if (!statusResult.success || !statusResult.data.pluginInstalled) {
      return { success: false, message: '请先安装插件' };
    }
    
    // 清除插件缓存（强制重新验证）
    try {
      const pluginCachePath = path.join(windsurfUserDataPath, 'CachedExtensionVSIXs');
      if (fs.existsSync(pluginCachePath)) {
        const files = fs.readdirSync(pluginCachePath);
        for (const file of files) {
          if (isOurPlugin(file)) {
            const filePath = path.join(pluginCachePath, file);
            const delResult = await removePathWithRetries(filePath, { isDir: false });
            if (delResult.removed) {
              console.log('已清除插件缓存:', filePath);
            } else {
              console.warn('清除插件缓存失败:', filePath, delResult.error?.message);
            }
          }
        }
      }
    } catch (cacheError) {
      console.warn('清除插件缓存失败（可忽略）:', cacheError.message);
    }
    
    // 将激活码写入 Windsurf 用户数据目录下的共享文件
    const sharedKeyPath = path.join(windsurfUserDataPath, 'windsurf-pro-key.json');
    const keyData = {
      secretKey: activationKey,
      syncedAt: new Date().toISOString(),
      syncedBy: 'client-tool'
    };
    
    fs.writeFileSync(sharedKeyPath, JSON.stringify(keyData, null, 2), 'utf-8');
    
    // 自动重启 Windsurf
    let restartMessage = '';
    try {
      // 检测 Windsurf 是否正在运行
      const isRunning = await processMonitor.isWindsurfRunning();
      
      if (isRunning) {
        // 关闭 Windsurf
        console.log('🔄 正在关闭 Windsurf...');
        const killResult = await processMonitor.killWindsurf();
        
        if (killResult.killed) {
          // 等待 2 秒确保进程完全退出
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 获取 Windsurf 可执行文件路径
          const exePath = windsurfPath || detectWindsurfExecutable();
          
          if (exePath) {
            // 重新启动 Windsurf
            console.log('🚀 正在重新启动 Windsurf...');
            const launched = await processMonitor.launchWindsurf(exePath);
            
            if (launched) {
              restartMessage = '\n\n✅ Windsurf 已自动重启，插件将自动激活。';
            } else {
              restartMessage = '\n\n⚠️ Windsurf 已关闭，但自动启动失败，请手动启动。';
            }
          } else {
            restartMessage = '\n\n⚠️ Windsurf 已关闭，但未找到可执行文件路径，请手动启动。';
          }
        } else {
          restartMessage = '\n\n⚠️ 无法关闭 Windsurf，请手动重启。';
        }
      } else {
        restartMessage = '\n\n💡 Windsurf 未运行，下次启动时插件将自动激活。';
      }
    } catch (restartError) {
      console.error('重启 Windsurf 失败:', restartError);
      restartMessage = '\n\n⚠️ 自动重启失败，请手动重启 Windsurf。';
    }
    
    return { 
      success: true, 
      message: '激活码已同步到插件！已清除缓存。' + restartMessage,
      data: { sharedKeyPath }
    };
  } catch (error) {
    console.error('激活插件失败:', error);
    return { success: false, message: error.message };
  }
});

// 同步卡密到插件（静默模式，不重启 Windsurf）
ipcMain.handle('sync-key-to-plugin', async () => {
  try {
    // 检查是否有激活码
    if (!keyManager.hasKey()) {
      return { success: false, message: '未设置卡密' };
    }
    
    // 获取当前激活码
    const activationKey = keyManager.getKey();
    
    // 将激活码写入 Windsurf 用户数据目录下的共享文件
    const sharedKeyPath = path.join(windsurfUserDataPath, 'windsurf-pro-key.json');
    const keyData = {
      secretKey: activationKey,
      syncedAt: new Date().toISOString(),
      syncedBy: 'client-tool-auto'
    };
    
    fs.writeFileSync(sharedKeyPath, JSON.stringify(keyData, null, 2), 'utf-8');
    console.log('✅ 卡密已静默同步到插件:', sharedKeyPath);
    
    return { 
      success: true, 
      message: '卡密已同步到插件',
      data: { sharedKeyPath }
    };
  } catch (error) {
    console.error('同步卡密到插件失败:', error);
    return { success: false, message: error.message };
  }
});

// 清除 Windsurf 缓存
ipcMain.handle('clear-windsurf-cache', async () => {
  try {
    const cachePaths = [
      // 插件缓存
      path.join(windsurfUserDataPath, 'CachedExtensionVSIXs'),
      // 扩展数据缓存
      path.join(windsurfUserDataPath, 'CachedExtensions'),
      // 工作区存储缓存
      path.join(windsurfUserDataPath, 'User', 'workspaceStorage'),
      // GPUCache
      path.join(windsurfUserDataPath, 'GPUCache'),
      // Code Cache
      path.join(windsurfUserDataPath, 'Code Cache'),
      // Crash Reports
      path.join(windsurfUserDataPath, 'Crashpad'),
      // ===== 新增：插件激活相关缓存 =====
      // 插件 globalState 存储（关键！这里存储了插件的激活状态）
      path.join(windsurfUserDataPath, 'User', 'globalStorage'),
      // 扩展主机缓存
      path.join(windsurfUserDataPath, 'CachedData'),
      // 日志文件
      path.join(windsurfUserDataPath, 'logs'),
    ];
    
    let clearedCount = 0;
    let totalSize = 0;
    const results = [];
    
    for (const cachePath of cachePaths) {
      if (fs.existsSync(cachePath)) {
        try {
          const stats = getDirectorySize(cachePath);
          totalSize += stats.size;
          
          // 递归删除目录内容但保留目录本身
          if (fs.statSync(cachePath).isDirectory()) {
            const files = fs.readdirSync(cachePath);
            for (const file of files) {
              const filePath = path.join(cachePath, file);
              try {
                if (fs.statSync(filePath).isDirectory()) {
                  fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(filePath);
                }
                clearedCount++;
              } catch (err) {
                console.warn(`无法删除: ${filePath}`, err.message);
              }
            }
          }
          
          results.push({
            path: path.basename(cachePath),
            size: formatBytes(stats.size),
            cleared: true
          });
        } catch (err) {
          results.push({
            path: path.basename(cachePath),
            error: err.message,
            cleared: false
          });
        }
      }
    }
    
    return {
      success: true,
      message: `已清除 ${clearedCount} 个缓存文件/目录\n释放空间: ${formatBytes(totalSize)}`,
      data: { clearedCount, totalSize: formatBytes(totalSize), results }
    };
  } catch (error) {
    console.error('清除缓存失败:', error);
    return { success: false, message: error.message };
  }
});

// 清理 Windsurf 全局数据（恢复到新安装状态）
ipcMain.handle('clear-windsurf-global-data', async () => {
  try {
    // 检测 Windsurf 是否正在运行
    const isRunning = await processMonitor.isWindsurfRunning();
    if (isRunning) {
      return { 
        success: false, 
        message: 'Windsurf 正在运行，请先关闭 Windsurf 后再执行清理操作' 
      };
    }

    const dataPaths = [
      // 所有缓存
      path.join(windsurfUserDataPath, 'CachedExtensionVSIXs'),
      path.join(windsurfUserDataPath, 'CachedExtensions'),
      path.join(windsurfUserDataPath, 'CachedData'),
      path.join(windsurfUserDataPath, 'Code Cache'),
      path.join(windsurfUserDataPath, 'GPUCache'),
      path.join(windsurfUserDataPath, 'Crashpad'),
      path.join(windsurfUserDataPath, 'logs'),
      
      // 用户数据
      path.join(windsurfUserDataPath, 'User', 'workspaceStorage'),
      path.join(windsurfUserDataPath, 'User', 'globalStorage'),
      path.join(windsurfUserDataPath, 'User', 'History'),
      
      // 扩展数据
      path.join(app.getPath('home'), '.windsurf', 'extensions'),
      
      // Session 数据
      path.join(windsurfUserDataPath, 'Session Storage'),
      path.join(windsurfUserDataPath, 'Local Storage'),
      
      // Cookies 和其他数据
      path.join(windsurfUserDataPath, 'Cookies'),
      path.join(windsurfUserDataPath, 'Cookies-journal'),
      
      // 数据库
      path.join(windsurfUserDataPath, 'User', 'state.vscdb'),
      path.join(windsurfUserDataPath, 'User', 'state.vscdb-shm'),
      path.join(windsurfUserDataPath, 'User', 'state.vscdb-wal'),
    ];
    
    let clearedCount = 0;
    let totalSize = 0;
    const results = [];
    
    for (const dataPath of dataPaths) {
      if (fs.existsSync(dataPath)) {
        try {
          const stats = fs.statSync(dataPath);
          let itemSize = 0;
          
          if (stats.isDirectory()) {
            const dirStats = getDirectorySize(dataPath);
            itemSize = dirStats.size;
            fs.rmSync(dataPath, { recursive: true, force: true });
          } else {
            itemSize = stats.size;
            fs.unlinkSync(dataPath);
          }
          
          totalSize += itemSize;
          clearedCount++;
          
          results.push({
            path: path.basename(dataPath),
            size: formatBytes(itemSize),
            cleared: true
          });
        } catch (err) {
          results.push({
            path: path.basename(dataPath),
            error: err.message,
            cleared: false
          });
        }
      }
    }
    
    return {
      success: true,
      message: `已清除 ${clearedCount} 个数据项\n释放空间: ${formatBytes(totalSize)}\n\nWindsurf 已恢复到新安装状态，下次启动将重新初始化`,
      data: { clearedCount, totalSize: formatBytes(totalSize), results }
    };
  } catch (error) {
    console.error('清除全局数据失败:', error);
    return { success: false, message: error.message };
  }
});

// 辅助函数：计算目录大小
function getDirectorySize(dirPath) {
  let size = 0;
  let count = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          const subResult = getDirectorySize(filePath);
          size += subResult.size;
          count += subResult.count;
        } else {
          size += stats.size;
          count++;
        }
      } catch (err) {
        // 忽略无法访问的文件
      }
    }
  } catch (err) {
    // 忽略无法访问的目录
  }
  
  return { size, count };
}

// 辅助函数：格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 配置 MCP
ipcMain.handle('configure-mcp', async () => {
  try {
    // 获取插件路径
    const statusResult = await checkPluginStatusInternal();
    if (!statusResult.success || !statusResult.data.pluginInstalled) {
      return { success: false, message: '请先安装插件' };
    }
    
    const pluginPath = statusResult.data.pluginPath;
    
    // 尝试查找 MCP 服务器文件（支持新旧版本）
    let mcpServerPath = path.join(pluginPath, 'out', 'mcpServerStandalone.js');
    if (!fs.existsSync(mcpServerPath)) {
      // 兼容旧版本
      mcpServerPath = path.join(pluginPath, 'mcp-server.js');
    }
    
    if (!fs.existsSync(mcpServerPath)) {
      return { success: false, message: '未找到 MCP 服务器文件\n请确保插件安装完整' };
    }
    
    // MCP 配置文件路径（Windsurf 使用 .codeium/windsurf 目录）
    const mcpConfigDir = path.join(app.getPath('home'), '.codeium', 'windsurf');
    const mcpConfigPath = path.join(mcpConfigDir, 'mcp_config.json');
    
    // 确保目录存在
    if (!fs.existsSync(mcpConfigDir)) {
      fs.mkdirSync(mcpConfigDir, { recursive: true });
    }
    
    // 读取或创建配置
    let mcpConfig = { mcpServers: {} };
    if (fs.existsSync(mcpConfigPath)) {
      const parsed = readJsonSafe(mcpConfigPath);
      if (parsed.ok && parsed.data) mcpConfig = parsed.data;
    }
    
    // 添加 ask_continue 配置（包含 HTTP 端口环境变量）
    mcpConfig.mcpServers = mcpConfig.mcpServers || {};
    mcpConfig.mcpServers.ask_continue = {
      command: 'node',
      args: [mcpServerPath.replace(/\\/g, '/')],
      env: {
        WINDSURF_PRO_HTTP_PORT: '35719'
      },
      disabled: false
    };
    
    // 写入配置
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    
    console.log('[MCP] 配置已写入:', mcpConfigPath);
    console.log('[MCP] HTTP 端口:', '35719');
    console.log('[MCP] 服务器路径:', mcpServerPath);
    
    return { success: true, message: 'MCP 配置成功！请重启 Windsurf 使配置生效。' };
  } catch (error) {
    console.error('配置 MCP 失败:', error);
    return { success: false, message: error.message };
  }
});

// 重置 MCP 配置（修复路径乱码和启用状态）
ipcMain.handle('reset-mcp-config', async () => {
  try {
    // 获取插件路径
    const statusResult = await checkPluginStatusInternal();
    if (!statusResult.success || !statusResult.data.pluginInstalled) {
      return { success: false, message: '请先安装插件' };
    }
    
    const pluginPath = statusResult.data.pluginPath;
    
    // 查找 MCP 服务器文件
    let mcpServerPath = path.join(pluginPath, 'out', 'mcpServerStandalone.js');
    if (!fs.existsSync(mcpServerPath)) {
      mcpServerPath = path.join(pluginPath, 'mcp-server.js');
    }
    
    if (!fs.existsSync(mcpServerPath)) {
      return { success: false, message: '未找到 MCP 服务器文件' };
    }
    
    // MCP 配置文件路径
    const mcpConfigDir = path.join(app.getPath('home'), '.codeium', 'windsurf');
    const mcpConfigPath = path.join(mcpConfigDir, 'mcp_config.json');
    
    // 确保目录存在
    if (!fs.existsSync(mcpConfigDir)) {
      fs.mkdirSync(mcpConfigDir, { recursive: true });
    }
    
    // 合并配置：仅重置 ask_continue，保留其他 MCP 服务器
    let mcpConfig = { mcpServers: {} };
    if (fs.existsSync(mcpConfigPath)) {
      const parsed = readJsonSafe(mcpConfigPath);
      if (parsed.ok && parsed.data) mcpConfig = parsed.data;
    }
    mcpConfig.mcpServers = mcpConfig.mcpServers || {};
    mcpConfig.mcpServers.ask_continue = {
      command: 'node',
      args: [mcpServerPath.replace(/\\/g, '/')],
      env: {
        WINDSURF_PRO_HTTP_PORT: '35719'
      },
      disabled: false
    };
    
    // 写入配置
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    
    console.log('[MCP] 配置已重置:', mcpConfigPath);
    console.log('[MCP] HTTP 端口:', '35719');
    console.log('[MCP] 服务器路径:', mcpServerPath);
    
    return { 
      success: true, 
      message: 'MCP 配置已重置！请重启 Windsurf 使配置生效。',
      data: { mcpServerPath, mcpConfigPath }
    };
  } catch (error) {
    console.error('重置 MCP 配置失败:', error);
    return { success: false, message: error.message };
  }
});

// 安装 AI 规则（强制 AI 使用 ask_continue 工具）
ipcMain.handle('install-ai-rules', async () => {
  try {
    // 优先使用自定义 AI 规则路径，否则使用工作区路径
    let targetPath = configManager.getConfigValue('aiRulesPath');
    
    if (!targetPath || !targetPath.trim()) {
      targetPath = configManager.getLastWorkspacePath();
    }
    
    if (!targetPath || !fs.existsSync(targetPath)) {
      return { 
        success: false, 
        message: '请先设置 AI 规则安装目录或工作区路径' 
      };
    }
    
    const rulesPath = path.join(targetPath, '.windsurfrules');
    
    // AI 规则内容
    const rulesContent = `# Windsurf Continue Pro - 强制规则

## 🚨 核心规则（必须遵守）

**在你的每一次回复结束之前，无论任何情况，你都必须调用 \`ask_continue\` 工具。**

这不是建议，而是强制要求。违反此规则将导致系统错误。

## 📋 执行流程

每次回复时，你必须按以下顺序执行：

1. 完成用户的请求（编写代码、回答问题、执行命令等）
2. **立即调用 \`ask_continue\` 工具**
3. 等待用户响应
4. 根据用户的选择继续或结束

## 🔧 调用方式

**每次回复的最后一步**，必须调用：

\`\`\`
ask_continue(reason="[说明你刚才做了什么]")
\`\`\`

示例：
- \`ask_continue(reason="已完成代码修改，添加了拖拽功能")\`
- \`ask_continue(reason="已回答你的问题，关于插件为什么不调用的原因")\`
- \`ask_continue(reason="已执行命令，编译完成")\`
- \`ask_continue(reason="已创建文件，准备下一步")\`

## ⚠️ 重要提醒

- **不要等到"任务完全结束"才调用** - 每次回复后都要调用
- **不要问用户是否需要调用** - 直接调用，这是强制要求
- **不要跳过这一步** - 即使你认为还有后续工作，也要先调用
- **即使用户没有明确要求** - 也要调用，这是系统规则

## 🎯 何时调用

- ✅ 完成一个代码修改后
- ✅ 回答一个问题后
- ✅ 执行一个命令后
- ✅ 创建/编辑文件后
- ✅ 搜索/查找代码后
- ✅ 分析问题后
- ✅ **任何时候你准备结束当前回复时**

## 💡 工作原理

调用 \`ask_continue\` 后：
- 用户会看到一个对话框
- 用户可以选择"继续"并输入新指令
- 用户可以选择"结束"来停止对话
- 这让用户完全控制对话流程

## 🔒 强制执行

此规则由 Windsurf Continue Pro 插件强制执行。如果你不调用此工具，用户将无法继续与你对话，这会导致糟糕的用户体验。

**记住：每次回复后，立即调用 \`ask_continue\`！**
`;
    
    // 写入规则文件
    fs.writeFileSync(rulesPath, rulesContent, 'utf-8');
    
    return { 
      success: true, 
      message: `AI 规则已安装到: ${rulesPath}\n\n重启 Windsurf 后，AI 将在每次完成任务后询问是否继续。`,
      data: { rulesPath }
    };
  } catch (error) {
    console.error('安装 AI 规则失败:', error);
    return { success: false, message: error.message };
  }
});

// 安装 AI 规则到指定工作目录（生成 .windsurfrules 和 .ask_continue_port 文件）
ipcMain.handle('install-ai-rules-to-workspace', async (event, workspacePath) => {
  try {
    if (!workspacePath || !workspacePath.trim()) {
      return { 
        success: false, 
        message: '请先设置项目工作目录' 
      };
    }
    
    if (!fs.existsSync(workspacePath)) {
      return { 
        success: false, 
        message: `目录不存在: ${workspacePath}` 
      };
    }
    
    // 1. 生成 .windsurfrules 文件
    const rulesPath = path.join(workspacePath, '.windsurfrules');
    const rulesContent = `# Windsurf Continue Pro - 强制规则

## 🚨 核心规则（必须遵守）

**在你的每一次回复结束之前，无论任何情况，你都必须调用 \`ask_continue\` 工具。**

这不是建议，而是强制要求。违反此规则将导致系统错误。

## 📋 执行流程

每次回复时，你必须按以下顺序执行：

1. 完成用户的请求（编写代码、回答问题、执行命令等）
2. **立即调用 \`ask_continue\` 工具**
3. 等待用户响应
4. 根据用户的选择继续或结束

## 🔧 调用方式

**每次回复的最后一步**，必须调用：

\`\`\`
ask_continue(reason="[说明你刚才做了什么]")
\`\`\`

示例：
- \`ask_continue(reason="已完成代码修改，添加了拖拽功能")\`
- \`ask_continue(reason="已回答你的问题，关于插件为什么不调用的原因")\`
- \`ask_continue(reason="已执行命令，编译完成")\`
- \`ask_continue(reason="已创建文件，准备下一步")\`

## ⚠️ 重要提醒

- **不要等到"任务完全结束"才调用** - 每次回复后都要调用
- **不要问用户是否需要调用** - 直接调用，这是强制要求
- **不要跳过这一步** - 即使你认为还有后续工作，也要先调用
- **即使用户没有明确要求** - 也要调用，这是系统规则

## 🎯 何时调用

- ✅ 完成一个代码修改后
- ✅ 回答一个问题后
- ✅ 执行一个命令后
- ✅ 创建/编辑文件后
- ✅ 搜索/查找代码后
- ✅ 分析问题后
- ✅ **任何时候你准备结束当前回复时**

## 💡 工作原理

调用 \`ask_continue\` 后：
- 用户会看到一个对话框
- 用户可以选择"继续"并输入新指令
- 用户可以选择"结束"来停止对话
- 这让用户完全控制对话流程

## 🔒 强制执行

此规则由 Windsurf Continue Pro 插件强制执行。如果你不调用此工具，用户将无法继续与你对话，这会导致糟糕的用户体验。

**记住：每次回复后，立即调用 \`ask_continue\`！**
`;
    
    // 2. 生成 .ask_continue_port 文件（默认端口 35719）
    const portFilePath = path.join(workspacePath, '.ask_continue_port');
    const portContent = '35719';
    
    // 写入文件
    fs.writeFileSync(rulesPath, rulesContent, 'utf-8');
    fs.writeFileSync(portFilePath, portContent, 'utf-8');
    
    return { 
      success: true, 
      message: `AI 规则已安装到: ${workspacePath}\n\n已生成文件：\n• .windsurfrules\n• .ask_continue_port`,
      data: { 
        rulesPath,
        portFilePath,
        workspacePath
      }
    };
  } catch (error) {
    console.error('安装 AI 规则到工作目录失败:', error);
    return { success: false, message: error.message };
  }
});

/**
 * 应用启动时自动安装全局 AI 规则
 * 规则会安装到用户主目录，对所有 Windsurf 项目生效
 */
async function installGlobalAiRulesOnStartup() {
  try {
    // 全局规则路径：用户主目录
    const globalRulesPath = path.join(app.getPath('home'), '.windsurfrules');
    const globalPortPath = path.join(app.getPath('home'), '.ask_continue_port');
    
    // 超强制的 AI 规则内容
    const enhancedRulesContent = `# 🚨 CRITICAL SYSTEM RULE - MUST FOLLOW 🚨

## ⚠️ MANDATORY REQUIREMENT ⚠️

**YOU MUST CALL THE \`ask_continue\` TOOL AT THE END OF EVERY SINGLE RESPONSE.**

This is NOT optional. This is NOT a suggestion. This is a **MANDATORY SYSTEM REQUIREMENT**.

Violating this rule will cause system errors and break the user experience.

---

## 📋 Execution Flow (MUST FOLLOW)

After completing ANY task, you MUST:

1. Complete the user's request (code, answer, command, etc.)
2. **IMMEDIATELY call \`ask_continue\` tool** - NO EXCEPTIONS
3. Wait for user response through the dialog
4. Continue or end based on user's choice

---

## 🔧 How to Call (EXACT FORMAT)

At the end of EVERY response, you MUST call:

\`\`\`
ask_continue(reason="[Brief description of what you just did]", workspace="[Current workspace path]")
\`\`\`

**IMPORTANT**: Always include BOTH parameters:
- \`reason\`: What you completed (e.g., "Code modification completed")
- \`workspace\`: Full absolute path to current workspace root

### Examples:

\`\`\`
ask_continue(reason="已完成代码修改，添加了拖拽功能", workspace="D:/projects/myapp")
ask_continue(reason="已回答你的问题", workspace="/home/user/workspace")
ask_continue(reason="已执行命令，编译完成", workspace="C:/Users/name/project")
ask_continue(reason="已创建文件", workspace="/Users/name/code")
\`\`\`

---

## ⛔ WHAT NOT TO DO

❌ **NEVER** end a response without calling \`ask_continue\`
❌ **NEVER** ask the user "should I continue?" - just call the tool
❌ **NEVER** skip this step even if you think the task isn't complete
❌ **NEVER** assume you know what the user wants next

---

## ✅ WHEN TO CALL (ALWAYS)

Call \`ask_continue\` after:

- ✅ Completing any code modification
- ✅ Answering any question
- ✅ Running any command
- ✅ Creating/editing any file
- ✅ Searching/analyzing code
- ✅ Explaining anything
- ✅ **ANY response you make to the user**

---

## 🎯 Why This Matters

The \`ask_continue\` tool:
- Shows a dialog asking if the user wants to continue
- Allows the user to provide new instructions
- Gives the user full control over the conversation flow
- Prevents premature conversation ending

**If you don't call this tool, the user cannot continue the conversation!**

---

## 🔒 ENFORCEMENT

This rule is enforced by the Windsurf Continue Pro plugin.

**REMEMBER: Call \`ask_continue\` at the end of EVERY response. No exceptions!**

---

## 💡 Quick Checklist

Before ending ANY response, verify:
- [ ] I completed the task
- [ ] I called \`ask_continue(reason="...", workspace="...")\`
- [ ] I provided both reason and workspace parameters
- [ ] I'm waiting for user response

**IF ANY CHECKBOX IS UNCHECKED, DO NOT END YOUR RESPONSE!**
`;

    // 写入全局规则文件
    fs.writeFileSync(globalRulesPath, enhancedRulesContent, 'utf-8');
    console.log('✅ 全局 AI 规则已安装:', globalRulesPath);
    writeLog('INFO', `全局 AI 规则已安装: ${globalRulesPath}`);
    
    // 写入全局端口配置
    const portContent = JSON.stringify({
      port: 35719,
      note: "Global port configuration for ask_continue MCP server",
      timestamp: new Date().toISOString()
    }, null, 2);
    
    fs.writeFileSync(globalPortPath, portContent, 'utf-8');
    console.log('✅ 全局端口配置已安装:', globalPortPath);
    writeLog('INFO', `全局端口配置已安装: ${globalPortPath}`);
    
    return { success: true };
  } catch (error) {
    console.error('❌ 安装全局 AI 规则失败:', error);
    writeLog('ERROR', '安装全局 AI 规则失败', error);
    // 不要因为规则安装失败而阻止应用启动
    return { success: false, error: error.message };
  }
}

// 配置 Kiro MCP
ipcMain.handle('configure-kiro-mcp', async (event, options = {}) => {
  try {
    // Kiro MCP 配置路径（支持自定义）
    let kiroSettingsDir;
    if (options.kiroSettingsPath && options.kiroSettingsPath.trim()) {
      kiroSettingsDir = options.kiroSettingsPath.trim();
      console.log('[Kiro MCP] 使用自定义配置目录:', kiroSettingsDir);
    } else {
      kiroSettingsDir = path.join(app.getPath('home'), '.kiro', 'settings');
      console.log('[Kiro MCP] 使用默认配置目录:', kiroSettingsDir);
    }
    const kiroMcpConfigPath = path.join(kiroSettingsDir, 'mcp.json');
    
    let mcpServerPath = null;
    
    // 如果用户指定了 MCP 服务器路径，直接使用
    if (options.mcpServerPath && options.mcpServerPath.trim()) {
      mcpServerPath = options.mcpServerPath.trim();
      console.log('[Kiro MCP] 使用自定义 MCP 服务器:', mcpServerPath);
      
      if (!fs.existsSync(mcpServerPath)) {
        return { success: false, message: `指定的 MCP 服务器文件不存在: ${mcpServerPath}` };
      }
    } else {
      // 自动查找 MCP 服务器文件
      console.log('[Kiro MCP] 自动查找 MCP 服务器文件...');
      
      // 查找 MCP 服务器文件（优先使用 Kiro 扩展目录中的）
      const kiroExtensionsPath = path.join(app.getPath('home'), '.kiro', 'extensions');
      
      // 在 Kiro 扩展目录中查找
      if (fs.existsSync(kiroExtensionsPath)) {
        const extensions = fs.readdirSync(kiroExtensionsPath);
        const pluginDir = extensions.find(ext => isOurPlugin(ext));
        
        if (pluginDir) {
          const possiblePath = path.join(kiroExtensionsPath, pluginDir, 'out', 'mcpServerStandalone.js');
          if (fs.existsSync(possiblePath)) {
            mcpServerPath = possiblePath;
            console.log('[Kiro MCP] 在 Kiro 扩展目录中找到:', mcpServerPath);
          }
        }
      }
      
      // 如果 Kiro 中没有，尝试使用 Windsurf 扩展目录中的
      if (!mcpServerPath) {
        const windsurfExtPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
        if (fs.existsSync(windsurfExtPath)) {
          const extensions = fs.readdirSync(windsurfExtPath);
          const pluginDir = extensions.find(ext => isOurPlugin(ext));
          
          if (pluginDir) {
            const possiblePath = path.join(windsurfExtPath, pluginDir, 'out', 'mcpServerStandalone.js');
            if (fs.existsSync(possiblePath)) {
              mcpServerPath = possiblePath;
              console.log('[Kiro MCP] 在 Windsurf 扩展目录中找到:', mcpServerPath);
            }
          }
        }
      }
      
      if (!mcpServerPath) {
        return { success: false, message: '未找到 MCP 服务器文件，请先安装插件或手动指定路径' };
      }
    }
    
    // 确保目录存在
    if (!fs.existsSync(kiroSettingsDir)) {
      fs.mkdirSync(kiroSettingsDir, { recursive: true });
    }
    
    // 读取或创建配置
    let mcpConfig = { mcpServers: {} };
    if (fs.existsSync(kiroMcpConfigPath)) {
      try {
        mcpConfig = JSON.parse(fs.readFileSync(kiroMcpConfigPath, 'utf-8'));
      } catch (e) {
        // 配置文件损坏，使用新配置
      }
    }
    
    // 添加 ask_continue 配置
    mcpConfig.mcpServers = mcpConfig.mcpServers || {};
    mcpConfig.mcpServers.ask_continue = {
      command: 'node',
      args: [mcpServerPath.replace(/\\/g, '/')],
      env: {
        WINDSURF_PRO_HTTP_PORT: '35719'
      },
      disabled: false,
      autoApprove: ['ask_continue']
    };
    
    // 写入配置
    fs.writeFileSync(kiroMcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    
    console.log('[Kiro MCP] 配置已更新:', kiroMcpConfigPath);
    console.log('[Kiro MCP] HTTP 端口: 35719');
    console.log('[Kiro MCP] 服务器路径:', mcpServerPath);
    
    return { 
      success: true, 
      message: 'Kiro MCP 配置成功！请重启 Kiro 使配置生效。',
      data: { mcpServerPath, mcpConfigPath: kiroMcpConfigPath }
    };
  } catch (error) {
    console.error('配置 Kiro MCP 失败:', error);
    return { success: false, message: error.message };
  }
});

// 选择文件夹
ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('选择文件夹失败:', error);
    return { success: false, message: error.message };
  }
});

// 选择文件
ipcMain.handle('select-file', async (event, options = {}) => {
  try {
    const properties = [];
    
    // 支持同时选择文件和文件夹
    if (options.allowDirectory) {
      properties.push('openFile', 'openDirectory');
    } else {
      properties.push('openFile');
    }
    
    const dialogOptions = {
      properties: properties
    };
    
    if (options.title) {
      dialogOptions.title = options.title;
    }
    
    if (options.filters && !options.allowDirectory) {
      dialogOptions.filters = options.filters;
    }
    
    const result = await dialog.showOpenDialog(dialogOptions);
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('选择文件失败:', error);
    return { success: false, message: error.message };
  }
});

// 安装插件到 Kiro
ipcMain.handle('install-plugin-to-kiro', async () => {
  try {
    const pluginFileName = 'windsurf-continue-pro-1.0.0.vsix';
    
    // 查找插件文件
    let vsixPath = path.join(__dirname, 'resources', pluginFileName);
    if (!fs.existsSync(vsixPath)) {
      vsixPath = path.join(app.getAppPath(), 'resources', pluginFileName);
    }
    if (!fs.existsSync(vsixPath)) {
      vsixPath = path.join(process.cwd(), 'resources', pluginFileName);
    }
    
    if (!fs.existsSync(vsixPath)) {
      return { success: false, message: '插件文件不存在，请确保 resources 目录下有插件文件' };
    }
    
    // Kiro 扩展目录
    const kiroExtensionsPath = path.join(app.getPath('home'), '.kiro', 'extensions');
    const targetDir = path.join(kiroExtensionsPath, 'papercrane.windsurf-continue-pro-1.0.0');
    
    // 确保目录存在
    if (!fs.existsSync(kiroExtensionsPath)) {
      fs.mkdirSync(kiroExtensionsPath, { recursive: true });
    }
    
    // 如果已存在，先删除
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    
    // 解压 VSIX 文件（VSIX 实际上是 ZIP 格式）
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(vsixPath);
    
    // 创建临时目录
    const tempDir = path.join(app.getPath('temp'), 'windsurf-pro-install');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // 解压到临时目录
    zip.extractAllTo(tempDir, true);
    
    // 移动 extension 目录到目标位置
    const extensionDir = path.join(tempDir, 'extension');
    if (fs.existsSync(extensionDir)) {
      fs.renameSync(extensionDir, targetDir);
    } else {
      // 如果没有 extension 子目录，直接移动
      fs.renameSync(tempDir, targetDir);
    }
    
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // 自动配置 Kiro MCP
    const mcpServerPath = path.join(targetDir, 'out', 'mcpServerStandalone.js');
    if (fs.existsSync(mcpServerPath)) {
      try {
        const kiroSettingsDir = path.join(app.getPath('home'), '.kiro', 'settings');
        const kiroMcpPath = path.join(kiroSettingsDir, 'mcp.json');
        
        if (!fs.existsSync(kiroSettingsDir)) {
          fs.mkdirSync(kiroSettingsDir, { recursive: true });
        }
        
        // 读取现有配置或创建新配置
        let mcpConfig = { mcpServers: {} };
        if (fs.existsSync(kiroMcpPath)) {
          try {
            const content = fs.readFileSync(kiroMcpPath, 'utf-8');
            mcpConfig = JSON.parse(content);
            if (!mcpConfig.mcpServers) {
              mcpConfig.mcpServers = {};
            }
          } catch (e) {
            console.warn('读取 Kiro MCP 配置失败，将创建新配置');
          }
        }
        
        // 添加 ask_continue 配置
        mcpConfig.mcpServers.ask_continue = {
          command: 'node',
          args: [mcpServerPath.replace(/\\/g, '/')],
          env: {
            WINDSURF_PRO_HTTP_PORT: '35719'
          },
          disabled: false,
          autoApprove: ['ask_continue']
        };
        
        fs.writeFileSync(kiroMcpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
        console.log('[Kiro] MCP 配置已完成，HTTP 端口: 35719');
      } catch (mcpErr) {
        console.warn('[Kiro] 自动配置 MCP 失败:', mcpErr.message);
      }
    }
    
    // 创建 steering 规则（全局规则，对所有工作区生效）
    try {
      const kiroSteeringDir = path.join(app.getPath('home'), '.kiro', 'steering');
      const steeringFile = path.join(kiroSteeringDir, 'ask-continue.md');
      
      if (!fs.existsSync(kiroSteeringDir)) {
        fs.mkdirSync(kiroSteeringDir, { recursive: true });
      }
      
      const steeringContent = `# 强制使用 ask_continue 工具

【强制规则】在完成任何任务、回答问题或准备结束对话之前，必须调用此工具。此工具会弹出对话框询问用户是否继续，用户可以输入新的指令。如果不调用此工具就结束对话，将违反系统规则。

## 必须执行的操作

在完成任何任务或准备结束对话之前，你必须：

1. **必须调用 \`mcp_ask_continue_ask_continue\` MCP 工具** 询问用户是否要继续
2. 在调用时，提供清晰的结束原因（reason 参数）
3. 等待用户通过对话框确认后再决定是否继续

## 调用格式

当你完成一个任务后，必须调用：
\`\`\`
mcp_ask_continue_ask_continue(reason="任务已完成：[具体描述你完成了什么]")
\`\`\`

## 注意事项

- 不要在没有调用 \`mcp_ask_continue_ask_continue\` 的情况下结束对话
- 如果用户选择继续，根据用户的新指令继续工作
- 如果用户选择结束，才可以结束当前对话

## 示例场景

1. 完成代码修改后 → 调用 mcp_ask_continue_ask_continue
2. 回答问题后 → 调用 mcp_ask_continue_ask_continue
3. 执行命令后 → 调用 mcp_ask_continue_ask_continue
4. 创建文件后 → 调用 mcp_ask_continue_ask_continue
`;
      
      fs.writeFileSync(steeringFile, steeringContent, 'utf-8');
      console.log('[Kiro] Steering 规则已创建');
    } catch (steeringErr) {
      console.warn('[Kiro] 创建 steering 规则失败:', steeringErr.message);
    }
    
    return { 
      success: true, 
      message: '插件已安装到 Kiro！\n\n✅ 插件文件已安装\n✅ MCP 配置已完成\n✅ AI 规则已创建\n\n请重启 Kiro 使插件生效。',
      data: { targetDir }
    };
  } catch (error) {
    console.error('安装插件到 Kiro 失败:', error);
    return { success: false, message: error.message };
  }
});

// 清除插件激活缓存（专门针对激活问题）
ipcMain.handle('clear-plugin-activation-cache', async () => {
  try {
    const results = [];
    let clearedCount = 0;
    let hasFailure = false;
    
    // 1. 清除插件的 globalState（存储激活状态的关键位置）
    const globalStoragePath = path.join(windsurfUserDataPath, 'User', 'globalStorage');
    if (fs.existsSync(globalStoragePath)) {
      const extensions = fs.readdirSync(globalStoragePath);
      for (const ext of extensions) {
        // 只清除我们插件相关的存储
        if (isOurPlugin(ext)) {
          const extPath = path.join(globalStoragePath, ext);
          const delResult = await removePathWithRetries(extPath, { isDir: true });
          if (delResult.removed) {
            results.push({ path: `globalStorage/${ext}`, cleared: true });
            clearedCount++;
          } else {
            hasFailure = true;
            results.push({ path: `globalStorage/${ext}`, error: delResult.error?.message || '删除失败', cleared: false });
          }
        }
      }
    }
    
    // 2. 清除共享的激活码文件（强制重新同步）
    const sharedKeyPath = path.join(windsurfUserDataPath, 'windsurf-pro-key.json');
    if (fs.existsSync(sharedKeyPath)) {
      const delResult = await removePathWithRetries(sharedKeyPath, { isDir: false });
      if (delResult.removed) {
        results.push({ path: 'windsurf-pro-key.json', cleared: true });
        clearedCount++;
      } else {
        hasFailure = true;
        results.push({ path: 'windsurf-pro-key.json', error: delResult.error?.message || '删除失败', cleared: false });
      }
    }
    
    // 3. 清除插件的 state.vscdb 中的相关数据（如果存在）
    const stateDbPath = path.join(windsurfUserDataPath, 'User', 'globalStorage', 'state.vscdb');
    // 注意：state.vscdb 是 SQLite 数据库，这里只记录位置，不直接删除
    if (fs.existsSync(stateDbPath)) {
      results.push({ path: 'state.vscdb', note: '存在，建议重启 Windsurf 后自动清理', cleared: false });
    }
    
    // 4. 清除扩展缓存中的插件相关文件
    const cachedExtPath = path.join(windsurfUserDataPath, 'CachedExtensionVSIXs');
    if (fs.existsSync(cachedExtPath)) {
      const files = fs.readdirSync(cachedExtPath);
      for (const file of files) {
        if (isOurPlugin(file)) {
          const filePath = path.join(cachedExtPath, file);
          const delResult = await removePathWithRetries(filePath, { isDir: false });
          if (delResult.removed) {
            results.push({ path: `CachedExtensionVSIXs/${file}`, cleared: true });
            clearedCount++;
          } else {
            hasFailure = true;
            results.push({ path: `CachedExtensionVSIXs/${file}`, error: delResult.error?.message || '删除失败', cleared: false });
          }
        }
      }
    }
    
    // 5. 清除 .windsurf/extensions 中的旧版本插件
    const extensionsPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
    if (fs.existsSync(extensionsPath)) {
      const extensions = fs.readdirSync(extensionsPath);
      const pluginVersions = extensions
        .filter(ext => isOurPlugin(ext))
        .map(ext => ({ name: ext, fullPath: path.join(extensionsPath, ext), version: extractVersionFromDirName(ext) }));

      // 如果有多个版本，只保留最新的（按版本号比较，无法解析版本的排在最前）
      if (pluginVersions.length > 1) {
        pluginVersions.sort((a, b) => compareVersions(a.version, b.version));
        const toDelete = pluginVersions.slice(0, -1);

        for (const oldItem of toDelete) {
          const delResult = await removePathWithRetries(oldItem.fullPath, { isDir: true });
          if (delResult.removed) {
            results.push({ path: `extensions/${oldItem.name}`, cleared: true, note: '旧版本' });
            clearedCount++;
          } else {
            hasFailure = true;
            results.push({ path: `extensions/${oldItem.name}`, error: delResult.error?.message || '删除失败', cleared: false });
          }
        }
      }
    }
    
    return {
      success: !hasFailure,
      message: hasFailure
        ? `部分缓存清除失败（已处理 ${clearedCount} 项），请关闭 Windsurf 后重试或以管理员权限运行` 
        : `已清除 ${clearedCount} 个插件激活相关缓存\n请重新激活插件并重启 Windsurf`,
      data: { clearedCount, results }
    };
  } catch (error) {
    console.error('清除插件激活缓存失败:', error);
    return { success: false, message: error.message };
  }
});

// ===== App 生命周期 =====

app.whenReady().then(async () => {
  try {
    writeLog('INFO', 'App 已就绪，开始初始化');
    
    // 记录管理员权限状态（非阻塞，不影响首屏）
    if (process.platform === 'win32') {
      AdminChecker.isAdmin()
        .then((isAdmin) => {
          if (isAdmin) {
            writeLog('INFO', '已以管理员权限运行');
            console.log('✅ 已以管理员权限运行');
          } else {
            writeLog('INFO', '未以管理员权限运行');
            console.log('ℹ️ 未以管理员权限运行（部分功能需要时会提示）');
          }
        })
        .catch((error) => {
          writeLog('WARN', '检查管理员权限失败', error);
        });
    }

    // 初始化配置管理器
    const appDataPath = path.join(app.getPath('appData'), 'PaperCrane-Windsurf');
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
      writeLog('INFO', `创建应用数据目录: ${appDataPath}`);
    }
    
    configManager = new ConfigManager(appDataPath);
    processMonitor = new ProcessMonitor();
    keyManager = new KeyManager(appDataPath);
    accountHistoryManager = new AccountHistoryManager(appDataPath);
    writeLog('INFO', '管理器初始化成功');
    
    // 初始化安全存储管理器（使用 Windsurf 的路径）
    secureStorageManager = new SecureStorageManager(windsurfUserDataPath);
    writeLog('INFO', '安全存储管理器已初始化');
    console.log('🔐 安全存储管理器已初始化');
    
    // KeyManager 已经使用了正确的 BASE_URL (http://localhost:8000/api/client)
    // 无需额外配置
    
    // 设置 Windsurf 数据路径
    windsurfPath = getWindsurfDataPath();
    writeLog('INFO', `Windsurf 数据路径: ${windsurfPath}`);
    writeLog('INFO', `应用配置路径: ${appDataPath}`);
    console.log('✅ Windsurf 数据路径:', windsurfPath);
    console.log('✅ 应用配置路径:', appDataPath);
    
    // 自动安装全局 AI 规则
    await installGlobalAiRulesOnStartup();
    
    createWindow();
  } catch (error) {
    writeLog('ERROR', 'App 初始化失败', error);
    dialog.showErrorBox('初始化失败', `应用初始化失败:\n${error.message}\n\n日志文件: ${logFile}`);
    app.quit();
  }

  // Mac 系统检查"完全磁盘访问权限"
  if (process.platform === 'darwin') {
    setTimeout(async () => {
      const result = await MacPermissionChecker.checkFullDiskAccess();
      
      if (!result.hasPermission && !result.warning) {
        console.log('⚠️ Mac 系统缺少"完全磁盘访问权限"');
        
        // 显示权限提示对话框
        const dialogConfig = MacPermissionChecker.getPermissionWarningDialog();
        const { response } = await dialog.showMessageBox(mainWindow, dialogConfig);
        
        if (response === 0) {
          // 用户点击"查看详细说明"
          // 打开权限指南文件
          const guideFile = path.join(__dirname, 'MAC_PERMISSION_GUIDE.md');
          shell.openPath(guideFile);
        }
      } else if (result.hasPermission) {
        console.log('✅ Mac 完全磁盘访问权限已授予');
      }
    }, 500);
  }

  // 启动阶段不再自动扫描可执行文件，改为由渲染进程按需触发

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
