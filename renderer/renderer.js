/**
 * PaperCrane-Windsurf - 渲染进程 UI 逻辑（重构版）
 */

// 当前客户端版本号（会在初始化时从主进程获取）
let CLIENT_VERSION = '1.0.0';

// 版本检查相关
let lastVersionCheck = 0; // 上次版本检查时间戳
let isVersionCheckInProgress = false; // 是否正在检查版本
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
let versionUpdateRequired = false; // 是否需要更新

// 插件安装状态标志（安装过程中暂停插件卸载监控弹窗）
let isInstallingPlugin = false;

// 一键换号冷却倒计时相关
let switchCooldownEndTime = 0; // 冷却结束时间戳
let switchCooldownTimer = null; // 倒计时定时器

// ===== 卡密到期自动下号相关 =====
let keyExpirationCheckTimer = null; // 定期检查卡密状态的定时器
const KEY_EXPIRATION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
let hasTriggeredExpiredLogout = false; // 是否已触发过到期下号，防止重复触发

// 启动一键换号冷却倒计时
function startSwitchCooldown(seconds) {
  const btn = document.getElementById('one-click-switch-btn');
  if (!btn) return;
  
  // 清除已有的定时器
  if (switchCooldownTimer) {
    clearInterval(switchCooldownTimer);
  }
  
  // 设置冷却结束时间
  switchCooldownEndTime = Date.now() + seconds * 1000;
  btn.disabled = true;
  
  // 更新按钮显示
  const updateCooldownDisplay = () => {
    const remaining = Math.ceil((switchCooldownEndTime - Date.now()) / 1000);
    if (remaining <= 0) {
      // 倒计时结束
      clearInterval(switchCooldownTimer);
      switchCooldownTimer = null;
      switchCooldownEndTime = 0;
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="zap"></i><span>一键换号</span>';
      try { lucide.createIcons(); } catch (e) {}
    } else {
      // 显示剩余秒数
      btn.innerHTML = `<i data-lucide="clock"></i><span>请等待 ${remaining}s</span>`;
      try { lucide.createIcons(); } catch (e) {}
    }
  };
  
  // 立即更新一次
  updateCooldownDisplay();
  
  // 每秒更新
  switchCooldownTimer = setInterval(updateCooldownDisplay, 1000);
}

// 检查是否在冷却中
function isInSwitchCooldown() {
  return switchCooldownEndTime > Date.now();
}

// ===== 工具函数 =====

// 初始化更多操作下拉菜单事件（使用事件委托）
function initMoreActionsMenu() {
  // 使用事件委托，在 document 级别监听点击事件
  document.addEventListener('click', (e) => {
    // 检查是否点击了"更多操作"按钮
    const moreActionsBtn = e.target.closest('#more-actions-btn');
    if (moreActionsBtn) {
      e.stopPropagation();
      const menu = document.getElementById('more-actions-menu');
      if (menu) {
        menu.classList.toggle('show');
        try { lucide.createIcons(); } catch (err) {}
      }
      return;
    }
    
    // 检查是否点击了下拉菜单项
    const dropdownItem = e.target.closest('.dropdown-item');
    if (dropdownItem) {
      const menu = document.getElementById('more-actions-menu');
      if (menu) {
        menu.classList.remove('show');
      }
      // 不阻止事件，让按钮的原有事件处理器执行
      return;
    }
    
    // 点击其他地方关闭菜单
    const menu = document.getElementById('more-actions-menu');
    const btn = document.getElementById('more-actions-btn');
    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('show');
    }
  });
}

// 兼容旧代码的函数
function bindMoreActionsMenu() {
  // 事件委托已在 initMoreActionsMenu 中处理，这里不需要做任何事
}

// 自动保存防抖定时器
const autoSaveTimers = {};

// 初始化自动保存功能
function initAutoSave() {
  // 获取所有带有 auto-save 类的输入框
  const autoSaveInputs = document.querySelectorAll('.auto-save');
  
  autoSaveInputs.forEach(input => {
    const configKey = input.getAttribute('data-config-key');
    if (!configKey) return;
    
    // 监听输入事件（使用防抖）
    input.addEventListener('input', () => {
      // 清除之前的定时器
      if (autoSaveTimers[configKey]) {
        clearTimeout(autoSaveTimers[configKey]);
      }
      
      // 设置新的定时器（500ms 后保存）
      autoSaveTimers[configKey] = setTimeout(async () => {
        await saveConfigValue(configKey, input.value);
      }, 500);
    });
    
    // 监听 change 事件（用于选择器触发）
    input.addEventListener('change', async () => {
      // 清除防抖定时器
      if (autoSaveTimers[configKey]) {
        clearTimeout(autoSaveTimers[configKey]);
      }
      await saveConfigValue(configKey, input.value);
    });
    
    // 监听失焦事件（立即保存）
    input.addEventListener('blur', async () => {
      // 清除防抖定时器
      if (autoSaveTimers[configKey]) {
        clearTimeout(autoSaveTimers[configKey]);
      }
      await saveConfigValue(configKey, input.value);
    });
  });
  
  log('自动保存功能已初始化', 'info');
}

// 保存配置值
async function saveConfigValue(key, value) {
  try {
    const result = await window.electronAPI.saveConfig(key, value);
    if (result.success) {
      showToast('已保存', 'success', 1500);
      log(`配置已保存: ${key}`, 'info');
    }
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

// 加载已保存的配置到输入框
async function loadSavedConfigs() {
  try {
    const result = await window.electronAPI.getAllConfig();
    if (!result.success || !result.data) return;
    
    const config = result.data;
    
    // 获取所有带有 auto-save 类的输入框
    const autoSaveInputs = document.querySelectorAll('.auto-save');
    
    autoSaveInputs.forEach(input => {
      const configKey = input.getAttribute('data-config-key');
      if (configKey && config[configKey] !== undefined && config[configKey] !== null) {
        input.value = config[configKey];
      }
    });
    
    log('已加载保存的配置', 'info');
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// Toast 通知
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: 'check-circle',
    error: 'x-circle',
    info: 'info',
    warning: 'alert-triangle'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${icons[type] || 'info'}"></i>
    </div>
    <div class="toast-content">${message}</div>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  const closeBtn = toast.querySelector('.toast-close');
  const removeToast = () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        container.removeChild(toast);
      }
    }, 300);
  };
  
  closeBtn.addEventListener('click', removeToast);
  
  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
  
  return toast;
}

// 自定义弹窗
function showModal(title, message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    // 处理选项
    const showCancel = options.showCancel !== false;  // 默认显示取消按钮
    const confirmText = options.confirmText || '确定';
    const cancelText = options.cancelText || '取消';
    
    modalTitle.textContent = title;
    // 使用 <p> 标签包裹，支持长文本换行和滚动
    const formattedMessage = (message || '').replace(/\n/g, '<br>');
    modalMessage.innerHTML = `<p>${formattedMessage}</p>`;
    
    // 设置按钮文本
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    
    // 控制取消按钮显示
    if (showCancel) {
      cancelBtn.style.display = '';
    } else {
      cancelBtn.style.display = 'none';
    }
    
    modal.classList.add('show');
    
    const handleConfirm = () => {
      modal.classList.remove('show');
      cleanup();
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.classList.remove('show');
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      // 恢复默认设置
      cancelBtn.style.display = '';
      confirmBtn.textContent = '确定';
      cancelBtn.textContent = '取消';
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

// 验证项目工作目录是否已设置（必填）
// 返回工作目录路径（如果有效）或 null（如果无效）
function validateWorkspacePath(showAlert = true) {
  // 使用主页隐藏的 "工作区路径" 输入框（其值来自后端配置）
  const mainWorkspaceInput = document.getElementById('workspace-path-input');
  const workspacePath = mainWorkspaceInput ? mainWorkspaceInput.value.trim() : '';

  if (!workspacePath) {
    if (showAlert) {
      log('❌ 未设置工作区路径', 'error');
      showToast('请先设置工作区路径！这是必填项。', 'error', 5000);

      // 显示弹窗提醒（不再引用具体输入框）
      showModal(
        '请设置工作区路径',
        '工作区路径是必填项！\n\n请在客户端中完成工作区路径配置，或通过其他自动化方式设置。\n\nAI 规则文件将安装到该工作区目录中。'
      );
    }
    return null;
  }

  return workspacePath;
}

// 安装 AI 规则到工作目录（生成 .ask_continue_port 和 .windsurfrules 文件）
async function installAIRulesToWorkspace() {
  const workspacePath = validateWorkspacePath();
  if (!workspacePath) return;
  
  log('开始安装 AI 规则到工作目录...', 'info');
  log(`📁 目标目录: ${workspacePath}`, 'info');
  showToast('正在安装 AI 规则...', 'info');
  
  try {
    const result = await window.electronAPI.installAIRulesToWorkspace(workspacePath);
    
    if (result.success) {
      showToast('AI 规则安装成功！', 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 显示成功提示
      await showModal(
        'AI 规则已安装',
        `已在项目目录中生成以下文件：\n\n` +
        `• .windsurfrules - AI 行为规则文件\n` +
        `• .ask_continue_port - MCP 服务端口配置\n\n` +
        `目录: ${workspacePath}\n\n` +
        `安装后，AI 在完成每个任务后都会弹出对话框询问是否继续。`
      );
    } else {
      showToast(`安装失败: ${result.message}`, 'error');
      log(`❌ 安装失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`安装失败: ${error.message}`, 'error');
    log(`❌ 安装失败: ${error.message}`, 'error');
  }
}

// 显示账号密码弹窗（带复制功能）
// isPro: 是否为Pro账号（只显示名称，不显示密码）
function showAccountModal(title, email, password, isPro = false) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = modal.querySelector('.modal-footer');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    modalTitle.textContent = title;
    
    // Pro账号只显示名称，不显示密码
    let modalContent;
    if (isPro) {
      modalContent = `
        <div style="font-family: 'Microsoft YaHei', '微软雅黑', sans-serif; line-height: 2;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <span style="flex: 1;">账号名称：${email}</span>
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; color: #6b7280; font-size: 14px; font-family: 'Microsoft YaHei', '微软雅黑', sans-serif;">
            Pro账号已加入历史列表（不自动切换）。
          </div>
        </div>
      `;
    } else {
      // 构建账号密码显示内容，带复制按钮
      const passwordText = password || '无（无限额度账号）';
      modalContent = `
        <div style="font-family: 'Microsoft YaHei', '微软雅黑', sans-serif; line-height: 2;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <span style="flex: 1;">邮箱：${email}</span>
            <button class="icon-btn copy-btn" data-copy="${email}" title="复制邮箱">
              <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <span style="flex: 1;">密码：${passwordText}</span>
            ${password ? `<button class="icon-btn copy-btn" data-copy="${password}" title="复制密码"><i data-lucide="copy" style="width: 16px; height: 16px;"></i></button>` : ''}
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; color: #6b7280; font-size: 14px; font-family: 'Microsoft YaHei', '微软雅黑', sans-serif;">
            该账号已加入历史列表（不自动切换）。
          </div>
        </div>
      `;
    }
    
    modalMessage.innerHTML = modalContent;
    
    // 重新创建图标
    try { lucide.createIcons(); } catch (e) {}
    
    // Pro账号不显示复制全部按钮
    let copyAllBtn = null;
    if (!isPro) {
      // 添加复制全部按钮
      copyAllBtn = document.createElement('button');
      copyAllBtn.className = 'btn btn-secondary';
      copyAllBtn.innerHTML = '<i data-lucide="copy"></i><span>复制全部</span>';
      copyAllBtn.style.marginRight = 'auto';
      
      // 插入到确认按钮之前
      modalFooter.insertBefore(copyAllBtn, modalFooter.firstChild);
      
      // 复制全部（邮箱----密码格式）
      copyAllBtn.addEventListener('click', () => {
        const fullText = password ? `${email}----${password}` : email;
        navigator.clipboard.writeText(fullText).then(() => {
          showToast('✅ 已复制完整账号信息', 'success');
        }).catch(() => {
          showToast('❌ 复制失败', 'error');
        });
      });
    }
    
    // 重新创建图标
    try { lucide.createIcons(); } catch (e) {}
    
    modal.classList.add('show');
    
    // 复制单个字段
    const copyButtons = modal.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const textToCopy = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('✅ 已复制到剪贴板', 'success');
        }).catch(() => {
          showToast('❌ 复制失败', 'error');
        });
      });
    });
    
    // handleCopyAll 保留用于兼容，但Pro账号不会用到
    const handleCopyAll = () => {
      const fullText = password ? `${email}----${password}` : email;
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('✅ 已复制完整账号信息', 'success');
      }).catch(() => {
        showToast('❌ 复制失败', 'error');
      });
    };
    
    const handleConfirm = () => {
      modal.classList.remove('show');
      cleanup();
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.classList.remove('show');
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      if (copyAllBtn) {
        copyAllBtn.removeEventListener('click', handleCopyAll);
        copyAllBtn.remove(); // 移除复制全部按钮
      }
    };
    
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', handleCopyAll);
    }
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

// 日志函数
function log(message, type = 'info') {
  const logOutput = document.getElementById('log-output');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logOutput.appendChild(entry);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function copyLogsToClipboard() {
  const logOutput = document.getElementById('log-output');
  if (!logOutput) return;
  const text = (logOutput.textContent || '').trim();
  if (!text) {
    showToast('日志为空', 'info');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('日志已复制到剪贴板', 'success');
  }).catch(() => {
    showToast('复制失败', 'error');
  });
}

// Token 打码函数（仅显示前5、后5）
function maskToken(token) {
  if (!token) return '-';
  const keep = 5;
  const len = token.length;
  if (len <= keep * 2) return token;
  const start = token.slice(0, keep);
  const end = token.slice(len - keep);
  const middle = '*'.repeat(20);
  return `${start}${middle}${end}`;
}

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN');
}

// 计算剩余时间
function calculateRemainingTime(expiresAt) {
  if (!expiresAt) return '未知';
  
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires - now;
  
  if (diff <= 0) return '已过期';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}天${hours}小时`;
  } else if (hours > 0) {
    return `${hours}小时`;
  } else {
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${minutes}分钟`;
  }
}

// ===== 秘钥管理功能 =====

// 加载秘钥信息
async function loadKeyInfo(skipStatusCheck = false) {
  const keyStatusEl = document.getElementById('key-status');
  const keyRemainingTimeEl = document.getElementById('key-remaining-time');
  const keyRemainingSummaryEl = document.getElementById('key-remaining-summary');
  const keyInput = document.getElementById('key-input');
  
  const result = await window.electronAPI.getKeyInfo();
  
  if (result.success && result.data.hasKey) {
    keyInput.value = result.data.key || '';
    
    // 如果有秘钥且不跳过状态检查，向服务器查询真实状态
    if (!skipStatusCheck) {
      const statusResult = await window.electronAPI.checkKeyStatus();
      
      if (statusResult.success) {
        // 查询成功，显示激活状态
        const data = statusResult.data || {};
        let status = data.status || data.Status;
        
        // 优先根据 expires_at 时间判断是否过期（客户端本地检测）
        const expiresAt = data.expires_at || data.expiresAt;
        if (expiresAt) {
          const expiresTime = new Date(expiresAt).getTime();
          const now = Date.now();
          if (now >= expiresTime) {
            status = 'expired';
            log('⚠️ 根据 expires_at 时间判断：密钥已过期', 'warning');
          }
        }
        
        let statusLabel = '已激活';
        let isActive = true;
        if (status === 'inactive') { 
          statusLabel = '未激活'; 
          isActive = false;
        } else if (status === 'expired') { 
          statusLabel = '已过期'; 
          isActive = false;
        }
        
        // 检查是否为 Pro 卡密
        const keyType = data.key_type || data.keyType || '';
        const isPro = keyType.toLowerCase() === 'pro';
        
        // 显示状态和 PRO badge
        if (isPro) {
          keyStatusEl.innerHTML = `${statusLabel} <span class="pro-badge">PRO</span>`;
        } else {
          keyStatusEl.textContent = statusLabel;
        }
        keyStatusEl.className = isActive ? 'key-info-value active' : 'key-info-value inactive';
        
        // 秘钥未激活或已过期时，清除登录信息并退出 Windsurf
        if (!isActive && (status === 'inactive' || status === 'expired')) {
          const statusMsg = status === 'expired' ? '已过期' : '未激活';
          log(`⚠️ 秘钥${statusMsg}，正在清除登录信息并退出 Windsurf...`, 'warning');
          
          await showModal(
            `秘钥${statusMsg}`,
            `检测到您的秘钥${statusMsg}。\n\n为保证正常使用，将清除登录信息并退出当前 Windsurf 账号。请续费或更换有效秘钥后重新使用。`,
            { showCancel: false, confirmText: '我知道了' }
          );
          
          try {
            const result = await window.electronAPI.clearWindsurfAuth();
            if (result.success) {
              log('✅ 已清除登录信息并退出 Windsurf', 'info');
              showToast('已退出登录，请更换有效秘钥', 'warning');
            } else {
              log(`⚠️ 清除登录信息失败: ${result.message}`, 'warning');
            }
          } catch (e) {
            console.error('清除登录信息失败:', e);
          }
          return; // 退出后不再继续执行
        }
        
        // Pro卡密下隐藏当前账号和Token行
        const accountRow = document.getElementById('current-account-row');
        const tokenRow = document.getElementById('current-token-row');
        if (accountRow) accountRow.style.display = isPro ? 'none' : '';
        if (tokenRow) tokenRow.style.display = isPro ? 'none' : '';
        
        // 显示剩余时间
        if (data.remaining_time) {
          keyRemainingTimeEl.textContent = data.remaining_time;
        } else if (data.expires_at) {
          keyRemainingTimeEl.textContent = calculateRemainingTime(data.expires_at);
        } else if (data.expiresAt) {
          keyRemainingTimeEl.textContent = calculateRemainingTime(data.expiresAt);
        } else if (data.remainingTime) {
          keyRemainingTimeEl.textContent = data.remainingTime;
        } else {
          keyRemainingTimeEl.textContent = '-';
        }

        // 显示账号配额与剩余（合并为一个字段）
        const limit = typeof data.account_limit === 'number' ? data.account_limit : (typeof data.accountLimit === 'number' ? data.accountLimit : 0);
        const remaining = typeof data.remaining_accounts === 'number' ? data.remaining_accounts : (typeof data.remainingAccounts === 'number' ? data.remainingAccounts : null);
        if (keyRemainingSummaryEl) {
          const remDisp = (remaining === -1 || remaining === null || remaining === undefined) ? '不限' : String(remaining);
          const limDisp = (limit && limit > 0) ? String(limit) : '不限';
          keyRemainingSummaryEl.textContent = (remDisp === '不限' && limDisp === '不限') ? '不限' : `${remDisp}/${limDisp}`;
        }
      } else {
        // 查询失败，显示未激活
        keyStatusEl.textContent = '未激活';
        keyStatusEl.className = 'key-info-value inactive';
        keyRemainingTimeEl.textContent = '-';
        if (keyRemainingSummaryEl) keyRemainingSummaryEl.textContent = '-';
      }
    } else {
      // 跳过服务器查询，显示本地缓存的状态
      if (result.data.expiresAt) {
        keyRemainingTimeEl.textContent = calculateRemainingTime(result.data.expiresAt);
      } else {
        keyRemainingTimeEl.textContent = '-';
      }
      // 保持账号配额与剩余显示不变，避免覆盖刚查询到的值
    }
  } else {
    // 没有秘钥
    keyInput.value = '';
    keyStatusEl.textContent = '未激活';
    keyStatusEl.className = 'key-info-value inactive';
    keyRemainingTimeEl.textContent = '-';
    if (keyRemainingSummaryEl) keyRemainingSummaryEl.textContent = '-';
  }
}

// 保存秘钥
async function saveKey() {
  const keyInput = document.getElementById('key-input');
  const key = keyInput.value.trim();
  
  if (!key) {
    showToast('请输入秘钥', 'error');
    return;
  }
  
  const btn = document.getElementById('save-key-btn');
  if (!btn) return;
  
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span>保存中...</span>';
  
  log('正在保存秘钥...', 'info');
  
  try {
    const result = await window.electronAPI.saveKey(key);
    
    if (result.success) {
      showToast('秘钥已保存', 'success');
      log('✅ 秘钥已保存', 'success');
      
      // 重置到期下号标志（新秘钥允许重新检查）
      resetExpiredLogoutFlag();
      
      // 重新启动定期检查
      startKeyExpirationCheck();
      
      // 立即查询秘钥状态
      await checkKeyStatus();
      
      // 自动同步卡密到插件
      await syncKeyToPlugin();
    } else {
      showToast(`保存失败: ${result.message}`, 'error');
      log(`❌ 保存失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`保存失败: ${error.message}`, 'error');
    log(`❌ 保存失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 同步卡密到插件（静默模式，不重启 Windsurf）
async function syncKeyToPlugin() {
  try {
    log('🔄 正在同步卡密到插件...', 'info');
    
    // 调用后端同步卡密到插件（静默模式）
    const result = await window.electronAPI.syncKeyToPlugin();
    
    if (result.success) {
      log('✅ 卡密已同步到插件', 'success');
      showToast('卡密已同步到插件', 'success', 2000);
    } else {
      // 同步失败不影响主流程，只记录日志
      log(`⚠️ 插件同步: ${result.message}`, 'warning');
    }
  } catch (error) {
    // 同步失败不影响主流程
    log(`⚠️ 插件同步失败: ${error.message}`, 'warning');
  }
}

// ===== 卡密到期自动下号功能 =====

/**
 * 启动定期检查卡密到期状态
 * 每5分钟检查一次，如果卡密已过期，自动清除登录信息并退出 Windsurf
 */
function startKeyExpirationCheck() {
  // 清除已有的定时器
  stopKeyExpirationCheck();
  
  // 静默启动，不显示日志
  
  // 立即执行一次检查
  setTimeout(() => {
    checkKeyExpiration();
  }, 10000); // 延迟10秒，等待界面加载完成
  
  // 设置定期检查
  keyExpirationCheckTimer = setInterval(() => {
    checkKeyExpiration();
  }, KEY_EXPIRATION_CHECK_INTERVAL);
}

/**
 * 停止定期检查
 */
function stopKeyExpirationCheck() {
  if (keyExpirationCheckTimer) {
    clearInterval(keyExpirationCheckTimer);
    keyExpirationCheckTimer = null;
    console.log('[到期检查] 已停止定期检查');
  }
}

/**
 * 检查卡密是否过期（静默检查，过期时自动下号）
 * 这是定期检查的核心逻辑，与 checkKeyStatus 不同的是：
 * 1. 不显示查询中的提示
 * 2. 只在过期时弹窗提醒
 * 3. 防止重复触发下号逻辑
 */
async function checkKeyExpiration() {
  // 如果已经触发过到期下号，不再重复检查
  if (hasTriggeredExpiredLogout) {
    console.log('[到期检查] 已触发过到期下号，跳过本次检查');
    return;
  }
  
  // 静默检查，不显示日志
  
  try {
    // 检查是否有秘钥
    const keyInfoResult = await window.electronAPI.getKeyInfo();
    const keyInfo = keyInfoResult.data || keyInfoResult; // 兼容两种格式
    if (!keyInfo.hasKey || !keyInfo.key) {
      return;
    }
    
    // 静默查询秘钥状态（添加超时）
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('API请求超时(10秒)')), 10000)
    );
    
    const result = await Promise.race([
      window.electronAPI.checkKeyStatus(),
      timeoutPromise
    ]);
    
    if (!result.success) {
      return;
    }
    
    const data = result.data || {};
    let status = data.status || data.Status;
    
    // 静默处理后端返回的数据
    
    // 根据 expires_at 时间判断是否过期
    const expiresAt = data.expires_at || data.expiresAt;
    
    if (expiresAt) {
      const expiresTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const diffMs = expiresTime - now;
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      
      if (now >= expiresTime) {
        status = 'expired';
      }
    }
    
    // 检查是否过期或未激活
    if (status === 'expired' || status === 'inactive') {
      const statusMsg = status === 'expired' ? '已过期' : '未激活';
      console.log(`[到期检查] 🚨 检测到卡密${statusMsg}，触发自动下号逻辑`);
      log(`⚠️ 定期检查发现秘钥${statusMsg}，正在执行下号...`, 'warning');
      
      // 设置标志，防止重复触发
      hasTriggeredExpiredLogout = true;
      
      // 停止定期检查
      stopKeyExpirationCheck();
      
      // 先执行下号
      log(`🚨 秘钥${statusMsg}，正在自动下号...`, 'warning');
      
      // 清除登录信息并退出 Windsurf
      let clearSuccess = false;
      try {
        const clearResult = await window.electronAPI.clearWindsurfAuth();
        if (clearResult.success) {
          clearSuccess = true;
          log('✅ 已清除登录信息并退出 Windsurf', 'info');
        } else {
          log(`⚠️ 清除登录信息失败: ${clearResult.message}`, 'warning');
        }
      } catch (e) {
        console.error('[到期检查] 清除登录信息失败:', e);
      }
      
      // 刷新界面显示
      const keyStatusEl = document.getElementById('key-status');
      if (keyStatusEl) {
        keyStatusEl.textContent = statusMsg;
        keyStatusEl.className = 'key-info-value inactive';
      }
      
      // 下号完成后再弹窗通知用户
      await showModal(
        `秘钥${statusMsg}`,
        `您的秘钥${statusMsg}，已自动清除登录信息并退出 Windsurf 账号。\n\n请续费或更换有效秘钥后重新使用。`,
        { showCancel: false, confirmText: '我知道了' }
      );
      
      return;
    }
    
    // 卡密有效，静默通过
    
  } catch (error) {
    // 静默处理错误
  }
}

/**
 * 重置到期下号标志（用于用户更换新秘钥后）
 */
function resetExpiredLogoutFlag() {
  hasTriggeredExpiredLogout = false;
  console.log('[到期检查] 已重置到期下号标志');
}

// 查询秘钥状态
async function checkKeyStatus() {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    return; // 版本过低，阻止操作
  }
  
  const keyStatusEl = document.getElementById('key-status');
  const keyRemainingTimeEl = document.getElementById('key-remaining-time');
  const keyRemainingSummaryEl = document.getElementById('key-remaining-summary');
  
  log('正在查询秘钥状态...', 'info');
  
  const result = await window.electronAPI.checkKeyStatus();
  
  if (result.success) {
    showToast('秘钥状态查询成功', 'success');
    const data = result.data || {};
    
    // 状态映射（兼容老字段）
    let status = data.status || data.Status;
    let statusLabel = '未知';
    let isActive = false;
    
    // 优先根据 expires_at 时间判断是否过期（客户端本地检测）
    const expiresAt = data.expires_at || data.expiresAt;
    if (expiresAt) {
      const expiresTime = new Date(expiresAt).getTime();
      const now = Date.now();
      if (now >= expiresTime) {
        // 时间已过期，强制设置状态为 expired
        status = 'expired';
        log('⚠️ 根据 expires_at 时间判断：密钥已过期', 'warning');
      }
    }
    
    if (status === 'active') { statusLabel = '已激活'; isActive = true; }
    else if (status === 'inactive') { statusLabel = '未激活'; }
    else if (status === 'expired') { statusLabel = '已过期'; }
    else { statusLabel = '已激活'; isActive = true; } // 旧接口默认为有效
    
    // 检查是否为 Pro 卡密
    const keyType = data.key_type || data.keyType || '';
    const isPro = keyType.toLowerCase() === 'pro';
    
    // 显示状态和 PRO badge
    if (isPro) {
      keyStatusEl.innerHTML = `${statusLabel} <span class="pro-badge">PRO</span>`;
    } else {
      keyStatusEl.textContent = statusLabel;
    }
    keyStatusEl.className = isActive ? 'key-info-value active' : 'key-info-value inactive';
    
    // Pro卡密下隐藏当前账号和Token行
    const accountRow = document.getElementById('current-account-row');
    const tokenRow = document.getElementById('current-token-row');
    if (accountRow) accountRow.style.display = isPro ? 'none' : '';
    if (tokenRow) tokenRow.style.display = isPro ? 'none' : '';
    
    log(`✅ 秘钥状态: ${statusLabel}${isPro ? ' (Pro卡密)' : ''}`, 'success');
    
    // 秘钥未激活或已过期时，清除登录信息并退出 Windsurf
    if (!isActive && (status === 'inactive' || status === 'expired')) {
      const statusMsg = status === 'expired' ? '已过期' : '未激活';
      log(`🚨 秘钥${statusMsg}，正在自动下号...`, 'warning');
      
      // 先执行下号
      try {
        const result = await window.electronAPI.clearWindsurfAuth();
        if (result.success) {
          log('✅ 已清除登录信息并退出 Windsurf', 'info');
        } else {
          log(`⚠️ 清除登录信息失败: ${result.message}`, 'warning');
        }
      } catch (e) {
        console.error('清除登录信息失败:', e);
      }
      
      // 下号完成后再弹窗通知用户
      await showModal(
        `秘钥${statusMsg}`,
        `您的秘钥${statusMsg}，已自动清除登录信息并退出 Windsurf 账号。\n\n请续费或更换有效秘钥后重新使用。`,
        { showCancel: false, confirmText: '我知道了' }
      );
      
      return; // 退出后不再继续执行
    }
    
    // 剩余时间（兼容老字段）
    if (data.remaining_time) {
      keyRemainingTimeEl.textContent = data.remaining_time;
      log(`剩余时间: ${data.remaining_time}`, 'info');
    } else if (data.expires_at) {
      const remain = typeof calculateRemainingTime === 'function' ? calculateRemainingTime(data.expires_at) : '';
      keyRemainingTimeEl.textContent = remain || '-';
      if (remain) log(`剩余时间: ${remain}`, 'info');
    } else if (data.expiresAt) {
      const remain = typeof calculateRemainingTime === 'function' ? calculateRemainingTime(data.expiresAt) : '';
      keyRemainingTimeEl.textContent = remain || '-';
      if (remain) log(`剩余时间: ${remain}`, 'info');
    } else if (data.remainingTime) {
      keyRemainingTimeEl.textContent = data.remainingTime;
      log(`剩余时间: ${data.remainingTime}`, 'info');
    } else {
      keyRemainingTimeEl.textContent = '-';
    }

    // 账号配额与剩余（合并为一个字段）
    const limit = typeof data.account_limit === 'number' ? data.account_limit : (typeof data.accountLimit === 'number' ? data.accountLimit : 0);
    const remaining = typeof data.remaining_accounts === 'number' ? data.remaining_accounts : (typeof data.remainingAccounts === 'number' ? data.remainingAccounts : null);
    if (keyRemainingSummaryEl) {
      const remDisp = (remaining === -1 || remaining === null || remaining === undefined) ? '不限' : String(remaining);
      const limDisp = (limit && limit > 0) ? String(limit) : '不限';
      keyRemainingSummaryEl.textContent = (remDisp === '不限' && limDisp === '不限') ? '不限' : `${remDisp}/${limDisp}`;
    }
    
    // 重新加载秘钥信息（跳过状态检查，避免重复查询）
    await loadKeyInfo(true);
  } else {
    showToast(`查询失败: ${result.message}`, 'error');
    log(`❌ 查询失败: ${result.message}`, 'error');
    
    // 查询失败时也显示未激活
    keyStatusEl.textContent = '未激活';
    keyStatusEl.className = 'key-info-value inactive';
    keyRemainingTimeEl.textContent = '-';
    if (keyRemainingSummaryEl) keyRemainingSummaryEl.textContent = '-';
  }
}

// ===== 账号信息功能 =====

// 显示当前账号
async function displayCurrentAccount(showToastOnSuccess = false) {
  const emailSpan = document.getElementById('current-email');
  const tokenSpan = document.getElementById('current-token');
  
  emailSpan.textContent = '加载中...';
  tokenSpan.textContent = '加载中...';

  const result = await window.electronAPI.getCurrentAccount();

  if (result.success) {
    const { email, label, token, sessionId } = result.data;
    const maskedToken = maskToken(token);
    
    // 判断是否为Pro账号：非邮箱格式的id视为Pro账号
    const isPro = !email.includes('@');
    // Pro账号显示 name + id，普通账号显示 email
    const displayName = isPro && label && label !== 'Unknown' ? `${label} (${email})` : email;
    emailSpan.textContent = displayName;
    tokenSpan.textContent = maskedToken;
    
    log(`当前账号: ${displayName}`, 'success');
    if (showToastOnSuccess) {
      showToast('账号信息已刷新', 'success');
    }
  } else {
    emailSpan.textContent = '未登录';
    tokenSpan.textContent = '无';
    log(result.message, 'error');
    if (showToastOnSuccess) {
      showToast('获取账号信息失败', 'error');
    }
  }
}

// 更新 Windsurf 状态
async function updateWindsurfStatus() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  const result = await window.electronAPI.checkWindsurfRunning();
  
  if (result.success) {
    if (result.data.isRunning) {
      statusDot.className = 'status-dot running';
      statusText.textContent = '正在运行';
    } else {
      statusDot.className = 'status-dot stopped';
      statusText.textContent = '未运行';
    }
  } else {
    statusDot.className = 'status-dot unknown';
    statusText.textContent = '无法检测';
  }

  const ocBtn = document.getElementById('one-click-switch-btn');
  if (ocBtn && /换号中/.test(ocBtn.innerText)) {
    ocBtn.disabled = false;
    ocBtn.innerHTML = '<i data-lucide="zap"></i><span>一键换号</span>';
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 检测 Windsurf 路径（快速：仅读取已保存配置，不做全盘扫描）
async function detectWindsurfPath() {
  const pathSpan = document.getElementById('windsurf-path');
  pathSpan.textContent = '读取中...';
  
  log('正在读取已保存路径...', 'info');
  
  const result = await window.electronAPI.detectWindsurfPath();
  
  if (result.success) {
    const { exePath, exeExists, dbExists } = result.data;
    
    if (exeExists) {
      pathSpan.textContent = exePath;
      log(`✅ 使用已保存路径: ${exePath}`, 'success');
      
      if (!dbExists) {
        log(`⚠️ 数据库不存在，请先运行一次 Windsurf`, 'warning');
        showToast('数据库不存在，请先运行一次 Windsurf', 'warning');
      }
    } else {
      // 未找到已保存路径：延后触发一次扫描，不阻塞首屏
      pathSpan.textContent = '扫描中...';
      log('⏳ 未找到已保存路径，正在扫描可执行文件（可能较慢）...', 'info');
      setTimeout(() => scanWindsurfExecutable(), 200);
    }
  } else {
    pathSpan.textContent = '检测失败';
    log(`❌ 检测失败: ${result.message}`, 'error');
    showToast(`检测失败: ${result.message}`, 'error');
  }
}

// 扫描 Windsurf 可执行文件（可能较慢）
async function scanWindsurfExecutable() {
  const pathSpan = document.getElementById('windsurf-path');
  pathSpan.textContent = '扫描中...';
  log('⏳ 正在扫描 Windsurf 可执行文件...', 'info');
  
  const result = await window.electronAPI.scanWindsurfExe();
  if (result && result.success) {
    const exePath = result.data.exePath;
    pathSpan.textContent = exePath;
    log(`✅ 检测到 Windsurf: ${exePath}`, 'success');
    showToast('检测成功', 'success');
  } else {
    pathSpan.textContent = '未找到（请手动选择）';
    const message = result ? result.message : '未知错误';
    log(`❌ 未检测到 Windsurf 可执行文件: ${message}`, 'error');
    showToast('未检测到 Windsurf，请手动选择', 'warning');
  }
}

// 手动选择路径
async function selectWindsurfPath() {
  log('请选择 Windsurf 可执行文件...', 'info');
  
  const result = await window.electronAPI.selectWindsurfPath();
  
  if (result.success) {
    const pathSpan = document.getElementById('windsurf-path');
    const { exePath, dbExists } = result.data;
    
    pathSpan.textContent = exePath;
    log(`✅ 已选择 Windsurf: ${exePath}`, 'success');
    log('路径已保存到本地配置', 'info');
    showToast('路径设置成功', 'success');
    
    if (!dbExists) {
      log(`⚠️ 数据库不存在，请先运行一次 Windsurf`, 'warning');
      showToast('数据库不存在，请先运行一次 Windsurf', 'warning');
    }
  } else if (result.message !== '已取消') {
    log(result.message, 'error');
    showToast(result.message, 'error');
  }
}

// ===== 工作区路径管理 =====

// 加载工作区路径
async function loadWorkspacePath() {
  const input = document.getElementById('workspace-path-input');
  if (!input) return;
  
  const result = await window.electronAPI.getWorkspacePath();
  if (result.success && result.data.workspacePath) {
    input.value = result.data.workspacePath;
  }
}

// 选择工作区路径
async function selectWorkspacePath() {
  log('请选择工作区文件夹...', 'info');
  
  const result = await window.electronAPI.selectWorkspacePath();
  
  if (result.success) {
    const input = document.getElementById('workspace-path-input');
    const { workspacePath } = result.data;
    
    input.value = workspacePath;
    log(`✅ 已设置工作区: ${workspacePath}`, 'success');
    showToast('工作区路径设置成功', 'success');
  } else if (result.message !== '已取消') {
    log(result.message, 'error');
    showToast(result.message, 'error');
  }
}

// 清除工作区路径
async function clearWorkspacePath() {
  const input = document.getElementById('workspace-path-input');
  input.value = '';
  
  const result = await window.electronAPI.saveWorkspacePath('');
  if (result.success) {
    log('✅ 已清除工作区路径', 'success');
    showToast('工作区路径已清除', 'success');
  }
}

// ===== 账号历史管理 =====

// 加载账号历史（从服务器获取该密钥关联的账号）
async function loadAccountHistory() {
  const historyList = document.getElementById('history-list');
  const historyTotal = document.getElementById('history-total');
  const historyMarked = document.getElementById('history-marked');
  
  // 显示加载状态
  historyList.innerHTML = `
    <div class="empty-state">
      <i data-lucide="loader" class="spin"></i>
      <p>正在加载账号历史...</p>
    </div>
  `;
  lucide.createIcons();
  
  // 从服务器获取该密钥关联的账号历史
  const result = await window.electronAPI.getServerAccountHistory();
  
  if (result.success && result.data) {
    const { accounts, total } = result.data;
    
    // 更新统计
    historyTotal.textContent = total || 0;
    historyMarked.textContent = '0'; // 服务器端没有标记功能
    
    // 清空列表
    historyList.innerHTML = '';
    
    if (!accounts || accounts.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <p>暂无历史账号</p>
          <small style="color: #9ca3af;">该密钥尚未获取过账号</small>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    // 渲染账号列表（从服务器获取的账号）
    for (const account of accounts) {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      // 检查标记状态
      const markResult = await window.electronAPI.isMarkedByEmail(account.email);
      const isMarked = markResult.success ? markResult.marked : false;
      
      if (isMarked) {
        item.classList.add('marked');
      }
      
      // 根据账号类型显示不同内容
      const isPro = account.is_pro === true;
      const labelText = isPro ? (account.name || 'Pro') : (account.password || 'PaperCrane');
      
      // Pro账号：只显示名称，不显示邮箱
      // 普通账号：显示邮箱
      const displayName = isPro ? (account.name || 'Pro账号') : account.email;
      
      // Pro账号：显示 ID；普通账号：显示密码
      const secondLine = isPro 
        ? (account.account_id ? `<span style="color: #8b5cf6;">ID: ${account.account_id}</span>` : '')
        : `密码: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; user-select: all;">${account.password || 'N/A'}</code>`;
      
      item.innerHTML = `
        <div class="history-info">
          <div class="history-email">
            ${displayName}
            ${isPro ? '<span style="background: linear-gradient(135deg, #8b5cf6, #a855f7); color: white; font-size: 0.7em; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">PRO</span>' : ''}
          </div>
          ${secondLine ? `<div class="history-password" style="font-size: 0.85em; color: #6b7280; margin-top: 2px;">${secondLine}</div>` : ''}
          <div class="history-meta">
            ${account.assigned_at ? `<span>获取时间: ${formatTime(account.assigned_at)}</span>` : ''}
            ${isMarked ? '<span style="color: #2f855a;">✓ 已标记</span>' : ''}
          </div>
        </div>
        <div class="history-actions">
          <button class="history-btn mark-btn ${isMarked ? 'marked' : ''}" title="${isMarked ? '取消标记' : '标记为已使用'}" data-email="${account.email}" data-marked="${isMarked}">
            <i data-lucide="${isMarked ? 'check-circle' : 'circle'}"></i>
          </button>
          <button class="history-btn copy-btn" title="${isPro ? '复制邮箱' : '复制账号密码'}" data-email="${account.email}" data-password="${account.password || ''}" data-is-pro="${isPro}">
            <i data-lucide="copy"></i>
          </button>
          <button class="history-btn switch-server-btn" title="切换到此账号" data-email="${account.email}" data-apikey="${account.api_key || ''}" data-label="${labelText}">
            <i data-lucide="log-in"></i>
          </button>
        </div>
      `;
      
      historyList.appendChild(item);
    }
    
    // 重新渲染图标
    lucide.createIcons();
    
    // 绑定事件
    bindServerHistoryItemEvents();
  } else {
    // 服务器获取失败，显示错误
    historyList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-circle"></i>
        <p>加载失败</p>
        <small style="color: #ef4444;">${result.message || '请检查网络连接和密钥状态'}</small>
      </div>
    `;
    lucide.createIcons();
    log(`加载历史账号失败: ${result.message}`, 'error');
  }
}

// 绑定服务器账号历史列表事件
function bindServerHistoryItemEvents() {
  // 标记按钮
  document.querySelectorAll('.history-btn.mark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      const isMarked = btn.getAttribute('data-marked') === 'true';
      
      // 切换标记状态
      const result = await window.electronAPI.markAccountByEmail(email, !isMarked);
      
      if (result.success) {
        showToast(result.message, 'success');
        // 刷新列表以显示更新后的状态
        await loadAccountHistory();
      } else {
        showToast(`操作失败: ${result.message}`, 'error');
      }
    });
  });
  
  // 复制按钮
  document.querySelectorAll('.history-btn.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      const password = btn.getAttribute('data-password');
      const isPro = btn.getAttribute('data-is-pro') === 'true';
      
      let text;
      if (isPro) {
        text = email;  // Pro账号只复制邮箱
      } else {
        text = `邮箱: ${email}\n密码: ${password}`;
      }
      
      try {
        await navigator.clipboard.writeText(text);
        showToast(isPro ? '邮箱已复制' : '账号信息已复制', 'success');
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  });
  
  // 切换按钮（使用服务器账号数据）
  document.querySelectorAll('.history-btn.switch-server-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      const password = btn.getAttribute('data-password');
      const apiKey = btn.getAttribute('data-apikey');
      const label = btn.getAttribute('data-label') || 'PaperCrane';
      
      if (!apiKey) {
        showToast('该账号没有 API Key，无法切换', 'error');
        return;
      }
      
      await switchToServerAccount(email, apiKey, label);
    });
  });
}

// 检查插件是否安装（切换账号前调用）
// 所有账号类型都必须检测插件是否安装
async function checkPluginInstalledForSwitch() {
  try {
    const pluginResult = await window.electronAPI.checkPluginStatus();
    if (pluginResult.success && pluginResult.data && pluginResult.data.pluginInstalled) {
      return true; // 插件已安装，允许切换
    }
    
    // 插件未安装，弹窗提醒
    await showModal(
      '需要安装插件',
      '切换账号功能需要先安装插件。\n\n请前往【插件管理】页面安装插件后再使用切换账号功能。',
      { showCancel: false, confirmText: '我知道了' }
    );
    log('⚠️ 插件未安装，禁止切换账号', 'warning');
    return false; // 禁止切换
  } catch (e) {
    console.error('检查插件状态失败:', e);
    showToast('检查插件状态失败，请稍后再试', 'error');
    return false;
  }
}

// 检查当前卡密是否为Pro类型
async function isProKeyType() {
  try {
    const result = await window.electronAPI.checkKeyStatus();
    if (result.success && result.data) {
      const keyType = result.data.key_type || result.data.keyType || 'limited';
      return keyType === 'pro';
    }
    return false;
  } catch (e) {
    console.error('检查卡密类型失败:', e);
    return false;
  }
}

// 切换到服务器账号
async function switchToServerAccount(email, apiKey, label = 'PaperCrane') {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return;
  }
  
  // 插件安装检查（所有账号类型都需要检测）
  const pluginOk = await checkPluginInstalledForSwitch();
  if (!pluginOk) {
    return;
  }
  
  const accountType = label === 'Pro' ? 'Pro账号' : '此账号';
  const confirmed = await showModal('确认切换', `确定要切换到${accountType}吗？\n\n切换后 Windsurf 将自动重启。`);
  if (!confirmed) return;
  
  log(`正在切换到账号: ${email} (${label})...`, 'info');
  showToast('正在切换账号...', 'info');
  
  // 使用 switch-account 接口，传入 token (apiKey) 和 email
  const result = await window.electronAPI.switchAccount({
    token: apiKey,
    email: email,
    label: label
  });
  
  if (result.success) {
    showToast('账号切换成功！', 'success');
    log('✅ 账号切换成功', 'success');
  } else {
    showToast(`切换失败: ${result.message}`, 'error');
    log(`❌ 切换失败: ${result.message}`, 'error');
  }
}

// 绑定历史账号列表事件（保留用于本地历史，但不再使用）
function bindHistoryItemEvents() {
  // 切换按钮
  document.querySelectorAll('.history-btn.switch-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await switchToHistoryAccount(id);
    });
  });
  
  // 标记按钮
  document.querySelectorAll('.history-btn.mark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const marked = btn.getAttribute('data-marked') === 'true';
      await markAccount(id, !marked);
    });
  });
}

// 切换到历史账号
async function switchToHistoryAccount(id) {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return;
  }
  
  // 插件安装检查（所有账号类型都需要检测）
  const pluginOk = await checkPluginInstalledForSwitch();
  if (!pluginOk) {
    return;
  }
  
  const confirmed = await showModal('确认切换', '确定要切换到此账号吗？这将关闭并重启 Windsurf。');
  if (!confirmed) return;
  
  log('正在切换账号...', 'info');
  showToast('正在切换账号...', 'info');
  
  const result = await window.electronAPI.switchToHistoryAccount(id);
  
  if (result && result.success) {
    showToast('切换成功', 'success');
    log('✅ 切换成功', 'success');
    
    // 刷新列表
    await loadAccountHistory();
    
    // 刷新当前账号信息
    setTimeout(() => {
      displayCurrentAccount();
      updateWindsurfStatus();
    }, 2000);
  } else {
    const message = result ? result.message : '切换失败';
    showToast(`切换失败: ${message}`, 'error');
    log(`❌ 切换失败: ${message}`, 'error');
  }
}

// ===== 版本说明管理 =====

// 加载版本说明
async function loadVersionNotes() {
  const container = document.getElementById('version-notes-list');
  if (!container) return;
  
  // 显示加载状态
  container.innerHTML = `
    <div class="empty-state">
      <i data-lucide="loader" class="spin"></i>
      <p>正在加载版本说明...</p>
    </div>
  `;
  lucide.createIcons();
  
  try {
    const result = await window.electronAPI.getVersionNotes();
    
    if (result.success && result.data && result.data.notes) {
      const notes = result.data.notes;
      
      if (notes.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <p>暂无版本说明</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }
      
      // 渲染版本说明列表
      container.innerHTML = notes.map((note, index) => `
        <div class="version-note-item ${index === 0 ? 'expanded' : ''}">
          <div class="version-note-header" onclick="toggleVersionNote(this)">
            <div class="version-note-title">
              <span class="version-note-version">v${note.version}</span>
              <span class="version-note-name">${note.title}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="version-note-date">${formatVersionDate(note.release_date)}</span>
              <i data-lucide="chevron-down" class="version-note-toggle"></i>
            </div>
          </div>
          <div class="version-note-content">${formatVersionContent(note.content)}</div>
        </div>
      `).join('');
      
      lucide.createIcons();
      log(`加载了 ${notes.length} 条版本说明`, 'info');
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="alert-circle"></i>
          <p>加载失败</p>
          <small style="color: #ef4444;">${result.message || '请检查网络连接'}</small>
        </div>
      `;
      lucide.createIcons();
    }
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-circle"></i>
        <p>加载失败</p>
        <small style="color: #ef4444;">${error.message}</small>
      </div>
    `;
    lucide.createIcons();
    log(`加载版本说明失败: ${error.message}`, 'error');
  }
}

// 切换版本说明展开/收起
function toggleVersionNote(header) {
  const item = header.closest('.version-note-item');
  item.classList.toggle('expanded');
}

// 格式化版本日期
function formatVersionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// 格式化版本内容（简单的 Markdown 支持）
function formatVersionContent(content) {
  if (!content) return '';
  // 转义 HTML
  let html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 简单的 Markdown 支持
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')  // 粗体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')  // 斜体
    .replace(/`(.+?)`/g, '<code>$1</code>')  // 行内代码
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')  // 三级标题
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')  // 二级标题
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')  // 一级标题
    .replace(/^- (.+)$/gm, '• $1')  // 列表项
    .replace(/\n/g, '<br>');  // 换行
  return html;
}

// 标记账号
async function markAccount(id, marked) {
  const result = await window.electronAPI.markAccount(id, marked);
  
  if (result.success) {
    showToast(result.message, 'success');
    log(result.message, 'success');
    // 刷新列表
    await loadAccountHistory();
  } else {
    showToast(`操作失败: ${result.message}`, 'error');
    log(`操作失败: ${result.message}`, 'error');
  }
}

// 删除账号
async function deleteAccount(id) {
  const confirmed = await showModal('确认删除', '确定要删除此账号吗？此操作不可恢复。');
  if (!confirmed) return;
  
  const result = await window.electronAPI.deleteAccount(id);
  
  if (result.success) {
    showToast('账号已删除', 'success');
    log('账号已删除', 'success');
    // 刷新列表
    await loadAccountHistory();
  } else {
    showToast(`删除失败: ${result.message}`, 'error');
    log(`删除失败: ${result.message}`, 'error');
  }
}

// ===== 手动输入账号功能 =====

// 手动获取账号（不切换、不重置，只从服务器拿号并加入历史）
async function showManualInputModal() {
  const btn = document.getElementById('manual-input-btn');
  let originalHTML = '';
  if (btn) {
    btn.disabled = true;
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>获取中...</span>';
  }

  log('开始从服务器获取账号...', 'info');
  showToast('正在获取账号...', 'info');

  try {
    const accountResult = await window.electronAPI.getAccount();

    if (!accountResult.success) {
      const code = accountResult.statusCode;
      const msg = accountResult.message || '';
      const errorCode = accountResult.errorCode;

      // 记录详细错误信息到控制台
      console.error('获取账号失败详情:');
      console.error('- 状态码:', code);
      console.error('- 错误消息:', msg);
      console.error('- 错误代码:', errorCode);
      if (accountResult.errorDetails) {
        console.error('- 错误详情:', accountResult.errorDetails);
      }

      if (code === 429) {
        if (msg.includes('零点刷新')) {
          throw new Error('今日获取次数已达上限（20次），零点刷新');
        } else if (msg.includes('秒后再试')) {
          const match = msg.match(/(\d+)秒后再试/);
          if (match) {
            const seconds = parseInt(match[1]);
            throw new Error(`请求过于频繁，请等待 ${seconds} 秒后再试`);
          }
          throw new Error(msg);
        }
        throw new Error(msg || '请求过于频繁，请稍后再试');
      } else if (code === 403) {
        if (msg.includes('禁用')) {
          throw new Error('密钥已被管理员禁用，请联系管理员');
        } else if (msg.includes('过期')) {
          throw new Error('密钥已过期，请更换新的密钥');
        } else if (msg.includes('用尽')) {
          throw new Error('密钥额度已用尽');
        }
        throw new Error(msg || '权限不足');
      } else if (code === 404) {
        throw new Error('暂无可用账号，请联系管理员补充');
      } else if (code === 401) {
        throw new Error('密钥无效，请检查密钥是否正确');
      } else if (code >= 500) {
        // 显示具体的服务器错误信息
        throw new Error(msg || '服务器错误，请稍后再试或联系管理员');
      } else if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
        // 网络连接问题
        throw new Error(msg);
      } else {
        throw new Error(msg || '获取账号失败');
      }
    }

    const { email, api_key, password, name, is_pro } = accountResult.data;
    const label = password || 'PaperCrane';

    // Pro账号只显示名称
    if (is_pro) {
      log(`✅ 获取到Pro账号: ${name || email}`, 'success');
    } else {
      log(`✅ 获取到账号: ${email}${password ? ' (有限额度)' : ' (无限额度)'}`, 'success');
    }

    // 刷新秘钥状态和历史列表（历史写入在主进程完成，这里只刷新显示）
    await checkKeyStatus();
    await loadAccountHistory();

    // Pro账号只显示名称，不显示密码
    if (is_pro) {
      await showAccountModal('获取Pro账号成功', name || email, null, true);
    } else {
      await showAccountModal('获取账号成功', email, password);
    }
  } catch (error) {
    log(`❌ 获取账号失败: ${error.message}`, 'error');
    showToast(`获取账号失败: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      try { lucide.createIcons(); } catch (e) {}
    }
  }
}

// 隐藏手动输入弹窗
function hideManualInputModal() {
  const modal = document.getElementById('manual-input-modal');
  modal.classList.remove('show');
  
  // 清空输入
  document.getElementById('modal-token-input').value = '';
  document.getElementById('modal-email-input').value = '';
  document.getElementById('modal-label-input').value = 'PaperCrane';
}

// 手动输入切换账号
async function manualSwitchAccount() {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return;
  }
  
  const token = document.getElementById('modal-token-input').value.trim();
  const email = document.getElementById('modal-email-input').value.trim();
  const label = document.getElementById('modal-label-input').value.trim() || 'PaperCrane';
  
  if (!token) {
    showToast('请输入 Token', 'error');
    return;
  }
  
  if (!email) {
    showToast('请输入邮箱', 'error');
    return;
  }
  
  const btn = document.getElementById('manual-input-confirm');
  if (!btn) return;
  
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span>切换中...</span>';
  
  log('开始切换账号...', 'info');
  log(`邮箱: ${email}`, 'info');
  log(`标签: ${label}`, 'info');
  
  try {
    const result = await window.electronAPI.switchAccount({ token, email, label });
    
    if (result.success) {
      log(`✅ 切换成功！`, 'success');
      log(`邮箱: ${result.data.email}`, 'success');
      log(`标签: ${result.data.label}`, 'success');
      
      showToast('切换成功', 'success');
      hideManualInputModal();
      
      // 刷新历史列表
      await loadAccountHistory();
      
      if (!result.data.wasRunning) {
        log('💡 下次启动 Windsurf 时生效', 'info');
        setTimeout(updateWindsurfStatus, 500);
      } else {
        setTimeout(() => {
          updateWindsurfStatus();
        }, 3000);
      }
      
      // 刷新显示
      setTimeout(displayCurrentAccount, 500);
    } else {
      log(`❌ 切换失败: ${result.message}`, 'error');
      showToast(`切换失败: ${result.message}`, 'error');
    }
  } catch (error) {
    log(`❌ 切换失败: ${error.message}`, 'error');
    showToast(`切换失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// ===== 快捷操作功能 =====

// 重置设备码
async function resetDeviceIds(skipConfirm = false, source = 'home') {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return;
  }
  
  if (!skipConfirm) {
    const confirmed = await showModal('确认重置', '确定要重置设备码吗？重置后需要重启 Windsurf。');
    if (!confirmed) return;
  }
  // 根据来源选择正确的按钮，避免总是只更新主页按钮
  const btn = source === 'switch'
    ? document.getElementById('reset-device-switch-btn')
    : document.getElementById('reset-device-btn');
  if (!btn) return false;
  
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span>重置中...</span>';
  
  log('重置设备码...', 'info');
  
  try {
    const result = await window.electronAPI.resetDeviceIds();
    
    if (result.success) {
      log('✅ 设备码已重置', 'success');
      if (!skipConfirm) {
        showToast('设备码已重置', 'success');
      }
      return true;
    } else {
      log(`❌ 重置失败: ${result.message}`, 'error');
      showToast(`重置失败: ${result.message}`, 'error');
      return false;
    }
  } catch (error) {
    log(`❌ 重置失败: ${error.message}`, 'error');
    showToast(`重置失败: ${error.message}`, 'error');
    return false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 关闭 Windsurf
async function killWindsurf(skipToast = false) {
  const btn = document.getElementById('kill-windsurf-btn');
  let originalHTML = '';
  if (btn) {
    btn.disabled = true;
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>关闭中...</span>';
  }

  log('正在关闭 Windsurf...', 'info');

  try {
    const result = await window.electronAPI.killWindsurf();

    if (result.success) {
      log('✅ Windsurf 已关闭', 'success');
      if (!skipToast) {
        showToast('Windsurf 已关闭', 'success');
      }
      setTimeout(updateWindsurfStatus, 1500);
      return true;
    } else {
      log(`❌ 关闭失败: ${result.message}`, 'error');
      if (!skipToast) {
        showToast(`关闭失败: ${result.message}`, 'error');
      }
      setTimeout(updateWindsurfStatus, 500);
      return false;
    }
  } catch (error) {
    log(`❌ 关闭失败: ${error.message}`, 'error');
    if (!skipToast) {
      showToast(`关闭失败: ${error.message}`, 'error');
    }
    setTimeout(updateWindsurfStatus, 500);
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      try { lucide.createIcons(); } catch (e) {}
    }
  }
}

// 启动 Windsurf
async function launchWindsurf(skipToast = false) {
  const btn = document.getElementById('launch-windsurf-btn');
  let originalHTML = '';
  if (btn) {
    btn.disabled = true;
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>启动中...</span>';
  }

  log('正在启动 Windsurf...', 'info');

  try {
    // 不再使用工作区路径，直接启动
    const result = await window.electronAPI.launchWindsurf();

    if (result.success) {
      log('✅ Windsurf 启动命令已执行', 'success');
      if (!skipToast) {
        showToast('Windsurf 启动命令已执行', 'success');
      }
      setTimeout(updateWindsurfStatus, 2000);
      return true;
    } else {
      log(`❌ 启动失败: ${result.message}`, 'error');
      if (!skipToast) {
        showToast(`启动失败: ${result.message}`, 'error');
      }
      return false;
    }
  } catch (error) {
    log(`❌ 启动失败: ${error.message}`, 'error');
    if (!skipToast) {
      showToast(`启动失败: ${error.message}`, 'error');
    }
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      try { lucide.createIcons(); } catch (e) {}
    }
  }
}

// 一键换号（自动化流程）
async function oneClickSwitch() {
  // 检查是否在冷却中
  if (isInSwitchCooldown()) {
    const remaining = Math.ceil((switchCooldownEndTime - Date.now()) / 1000);
    showToast(`请等待 ${remaining} 秒后再试`, 'warning');
    return;
  }
  
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return; // 版本过低，阻止操作
  }
  
  // 插件安装检查（所有账号类型都需要检测）
  const pluginOk = await checkPluginInstalledForSwitch();
  if (!pluginOk) {
    return;
  }
  
  const btn = document.getElementById('one-click-switch-btn');
  let originalHTML = '';
  if (btn) {
    btn.disabled = true;
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>换号中...</span>';
  }
  
  log('🔄 开始一键换号流程...', 'info');
  showToast('开始一键换号...', 'info');
  
  try {
    // 先检查卡密类型
    const statusResult = await window.electronAPI.checkKeyStatus();
    const keyType = statusResult.success ? (statusResult.data.key_type || statusResult.data.keyType || 'limited') : 'limited';
    
    // Team类型卡密：使用teamSwitch一键切号
    if (keyType === 'team') {
      log('🔄 检测到Team卡密，使用一键切号...', 'info');
      const teamResult = await window.electronAPI.teamSwitch();
      
      console.log('📦 Team切号返回数据:', teamResult);
      
      if (teamResult.success) {
        log(`✅ Team切号成功: ${teamResult.data.email}`, 'success');
        
        // 检查是否需要重启（已直接写入数据库）
        if (teamResult.needRestart) {
          log('✅ 登录信息已写入数据库', 'success');
          log('⚠️ 请重启 Windsurf 使登录生效', 'warning');
          showToast('切号成功！请重启 Windsurf 使登录生效', 'success');
        } else if (teamResult.data.callback_url) {
          // 降级方案：如果数据库写入失败，会打开URL
          log('🔗 已通过URL方式登录', 'info');
          showToast('切号成功！Windsurf将自动登录', 'success');
        } else {
          log('⚠️ 未返回callback_url', 'warning');
          showToast('切号成功', 'success');
        }
        
        // 刷新状态
        await checkKeyStatus();
      } else {
        // 检查是否是频率限制错误
        const teamMsg = teamResult.message || '';
        if (teamMsg.includes('秒后再试')) {
          const match = teamMsg.match(/(\d+)秒后再试/);
          if (match) {
            const seconds = parseInt(match[1]);
            startSwitchCooldown(seconds);
            throw new Error(`请求过于频繁，请等待 ${seconds} 秒`);
          }
        }
        throw new Error(teamMsg || 'Team切号失败');
      }
      
      // Team切号完成后直接返回
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        try { lucide.createIcons(); } catch (e) {}
      }
      return;
    }
    
    // 非Team类型：获取账号
    log('1️⃣ 正在获取账号...', 'info');
    const accountResult = await window.electronAPI.getAccount();
    
    if (!accountResult.success) {
      const code = accountResult.statusCode;
      const msg = accountResult.message || '';
      const errorCode = accountResult.errorCode;
      
      // 记录详细错误信息到控制台
      console.error('获取账号失败详情:');
      console.error('- 状态码:', code);
      console.error('- 错误消息:', msg);
      console.error('- 错误代码:', errorCode);
      if (accountResult.errorDetails) {
        console.error('- 错误详情:', accountResult.errorDetails);
      }
      
      // 优化错误提示
      if (code === 429) {
        // 频率限制或每日限制
        if (msg.includes('零点刷新')) {
          throw new Error('今日获取次数已达上限（20次），零点刷新');
        } else if (msg.includes('秒后再试')) {
          // 提取等待秒数并启动倒计时
          const match = msg.match(/(\d+)秒后再试/);
          if (match) {
            const seconds = parseInt(match[1]);
            startSwitchCooldown(seconds); // 启动倒计时
            throw new Error(`请求过于频繁，请等待 ${seconds} 秒`);
          }
          throw new Error(msg);
        }
        // 默认冷却时间为30秒
        startSwitchCooldown(30);
        throw new Error(msg || '请求过于频繁，请等待 30 秒');
      } else if (code === 403) {
        if (msg.includes('禁用')) {
          throw new Error('密钥已被管理员禁用，请联系管理员');
        } else if (msg.includes('过期')) {
          throw new Error('密钥已过期，请更换新的密钥');
        } else if (msg.includes('用尽')) {
          throw new Error('密钥额度已用尽');
        }
        throw new Error(msg || '权限不足');
      } else if (code === 404) {
        throw new Error('暂无可用账号，请联系管理员补充');
      } else if (code === 401) {
        throw new Error('密钥无效，请检查密钥是否正确');
      } else if (code >= 500) {
        // 显示具体的服务器错误信息，而不是泛泛而谈
        throw new Error(msg || '服务器错误，请稍后再试或联系管理员');
      } else if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
        // 网络连接问题
        throw new Error(msg);
      } else {
        throw new Error(msg || '获取账号失败');
      }
    }
    
    const { email, api_key, password, name, is_pro } = accountResult.data;
    
    // 根据是否返回密码决定 label
    // Pro账号：使用 'Pro'
    // 有密码 = 有限额度，使用密码作为 label
    // 无密码 = 无限额度，使用 'PaperCrane'
    const label = is_pro ? 'Pro' : (password || 'PaperCrane');
    
    // Pro账号只显示名称
    if (is_pro) {
      log(`✅ 获取到Pro账号: ${name || email}`, 'success');
    } else {
      log(`✅ 获取到账号: ${email}${password ? ' (有限额度)' : ' (无限额度)'}`, 'success');
    }
    
    // 获取账号后自动刷新秘钥状态（额度等）
    await checkKeyStatus();
    
    // Pro账号使用无感换号（调用后端 /pro/switch 获取 OTT Token）
    if (is_pro) {
      log('4️⃣ 正在无感切换Pro账号（OTT模式）...', 'info');
      console.log('[Pro切号] is_pro=true, 使用后端OTT无感换号');
      
      // 调用后端 /pro/switch 接口获取 OTT Token 并触发无感换号
      const switchResult = await window.electronAPI.proSwitch();
      
      console.log('[Pro切号] proSwitch 返回:', switchResult);
      
      if (!switchResult.success) {
        // 检查是否是频率限制错误
        const proMsg = switchResult.message || '';
        if (proMsg.includes('秒后再试')) {
          const match = proMsg.match(/(\d+)秒后再试/);
          if (match) {
            const seconds = parseInt(match[1]);
            startSwitchCooldown(seconds);
            throw new Error(`请求过于频繁，请等待 ${seconds} 秒`);
          }
        }
        throw new Error(proMsg || 'Pro无感切换失败');
      }
      
      log(`🎉 Pro无感换号成功！(${switchResult.token_type || 'OTT'})`, 'success');
      showToast(`Pro账号已切换: ${switchResult.email || email}`, 'success');
    } else {
      // 普通账号：使用原有流程（重启 Windsurf）
      log('4️⃣ 正在切换账号...', 'info');
      const switchResult = await window.electronAPI.switchAccount({ 
        token: api_key, 
        email: email, 
        label: label
      });
      
      if (!switchResult.success) {
        throw new Error(switchResult.message || '切换账号失败');
      }
      
      log('🎉 一键换号完成！', 'success');
      showToast('一键换号成功！', 'success');
    }
    
    // 刷新账号信息和历史
    setTimeout(() => {
      displayCurrentAccount();
      loadAccountHistory();
      updateWindsurfStatus();
    }, 1000);
    
  } catch (error) {
    log(`❌ 一键换号失败: ${error.message}`, 'error');
    showToast(`换号失败: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      lucide.createIcons();
    }
  }
}

// ===== 热切换功能（不重启 Windsurf）=====

// 热切换账号（通过插件，仅重载窗口而非重启整个 Windsurf）
async function hotSwitch() {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return;
  }
  
  // 检查插件是否安装（热切换必须依赖插件）
  const pluginOk = await checkPluginInstalledForSwitch(false);
  if (!pluginOk) {
    showToast('热切换需要安装插件', 'error');
    return;
  }
  
  const btn = document.getElementById('hot-switch-btn');
  let originalHTML = '';
  if (btn) {
    btn.disabled = true;
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>切换中...</span>';
  }
  
  log('🔥 开始热切换流程（不重启）...', 'info');
  showToast('开始热切换...', 'info');
  
  try {
    // 获取账号
    log('1️⃣ 正在获取账号...', 'info');
    const accountResult = await window.electronAPI.getAccount();
    
    if (!accountResult.success) {
      throw new Error(accountResult.message || '获取账号失败');
    }
    
    const { email, api_key, password, name, is_pro } = accountResult.data;
    const label = is_pro ? 'Pro' : (password || 'PaperCrane');
    
    log(`✅ 获取到账号: ${email}`, 'success');
    
    // 获取工作区路径
    const workspaceResult = await window.electronAPI.getWorkspacePath();
    const workspacePath = workspaceResult.success ? workspaceResult.data.workspacePath : null;
    
    // 通过插件热切换
    log('2️⃣ 正在通过插件热切换...', 'info');
    const switchResult = await window.electronAPI.hotSwitchAccount({
      token: api_key,
      email: email,
      label: label,
      workspacePath: workspacePath
    });
    
    if (!switchResult.success) {
      throw new Error(switchResult.message || '热切换失败');
    }
    
    log('🎉 热切换成功！', 'success');
    
    if (switchResult.data?.reloadTriggered) {
      showToast('账号已切换，Windsurf 正在重载...', 'success');
    } else {
      showToast('账号已切换，请在 Windsurf 中手动重载窗口 (Ctrl+Shift+P → Reload Window)', 'success', 5000);
    }
    
    // 刷新状态
    await checkKeyStatus();
    setTimeout(() => {
      displayCurrentAccount();
      loadAccountHistory();
    }, 1000);
    
  } catch (error) {
    log(`❌ 热切换失败: ${error.message}`, 'error');
    showToast(`热切换失败: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      lucide.createIcons();
    }
  }
}

// ===== 购买卡密功能 =====

// 显示购买卡密弹窗
function showPurchaseModal() {
  const modal = document.getElementById('purchase-modal');
  modal.classList.add('show');
  
  // 重新渲染图标
  try { lucide.createIcons(); } catch (e) {}
  
  log('打开购买卡密弹窗', 'info');
}

// 隐藏购买卡密弹窗
function hidePurchaseModal() {
  const modal = document.getElementById('purchase-modal');
  modal.classList.remove('show');
}

// 打开购买链接
async function openPurchaseLink() {
  const linkInput = document.getElementById('purchase-link-input');
  const url = linkInput.value.trim();
  
  if (!url) {
    showToast('购买链接为空', 'error');
    return;
  }
  
  log(`正在打开购买链接: ${url}`, 'info');
  
  // 调用主进程的 API 打开外部链接
  const result = await window.electronAPI.openExternalUrl(url);
  
  if (result && result.success) {
    showToast('已在浏览器中打开购买链接', 'success');
    log('✅ 已在浏览器中打开购买链接', 'success');
  } else {
    const message = result ? result.message : '打开链接失败';
    showToast(`打开链接失败: ${message}`, 'error');
    log(`❌ 打开链接失败: ${message}`, 'error');
  }
}

// ===== 插件管理功能 =====

// 缓存的插件列表数据
let cachedPluginList = null;

// 从后端获取插件列表并动态渲染
async function loadPluginList() {
  const container = document.getElementById('plugins-container');
  const loadingEl = document.getElementById('plugins-loading');
  const fallbackCard = document.getElementById('fallback-plugin-card');
  
  if (!container) return;
  
  // 显示加载状态
  if (loadingEl) loadingEl.style.display = 'block';
  if (fallbackCard) fallbackCard.style.display = 'none';
  
  try {
    log('📦 正在从服务器获取插件列表...', 'info');
    const result = await window.electronAPI.getPluginList();
    
    if (result.success && result.data && result.data.plugins && result.data.plugins.length > 0) {
      cachedPluginList = result.data.plugins;
      log(`✅ 获取到 ${cachedPluginList.length} 个插件`, 'success');
      
      // 隐藏加载状态
      if (loadingEl) loadingEl.style.display = 'none';
      
      // 清空容器（保留加载元素和备用卡片）
      const existingCards = container.querySelectorAll('.info-card:not(#plugins-loading):not(#fallback-plugin-card)');
      existingCards.forEach(card => card.remove());
      
      // 动态渲染所有插件卡片
      cachedPluginList.forEach(plugin => {
        const card = createPluginCard(plugin);
        container.appendChild(card);
      });
      
      // 重新渲染图标
      try { lucide.createIcons(); } catch (e) {}
      
      // 为工作目录输入框添加拖拽支持
      const aiRulesPathInput = document.getElementById('ai-rules-path');
      if (aiRulesPathInput) {
        aiRulesPathInput.addEventListener('drop', (e) => {
          e.preventDefault();
          const files = e.dataTransfer.files;
          if (files.length > 0) {
            const filePath = files[0].path;
            const fs = require('fs');
            const path = require('path');
            let targetPath = filePath;
            try {
              const stats = fs.statSync(filePath);
              if (stats.isFile()) {
                targetPath = path.dirname(filePath);
              }
            } catch (err) {
              console.warn('检查路径类型失败:', err);
            }
            aiRulesPathInput.value = targetPath;
            aiRulesPathInput.dispatchEvent(new Event('change'));
            showToast('路径已设置', 'success');
          }
        });
        aiRulesPathInput.addEventListener('dragover', (e) => e.preventDefault());
      }
      
      // 绑定选择按钮的点击事件（动态生成的按钮需要在渲染后绑定）
      const selectAiRulesPathBtn = document.getElementById('select-ai-rules-path-btn');
      if (selectAiRulesPathBtn) {
        selectAiRulesPathBtn.addEventListener('click', async () => {
          try {
            const result = await window.electronAPI.selectFolder();
            if (result.success && result.path) {
              const input = document.getElementById('ai-rules-path');
              input.value = result.path;
              // 触发自动保存
              input.dispatchEvent(new Event('change'));
              log(`选择了项目工作目录: ${result.path}`, 'info');
            }
          } catch (error) {
            showToast(`选择目录失败: ${error.message}`, 'error');
          }
        });
      }
      
      // 检测所有 Windsurf 插件的状态
      cachedPluginList.forEach(plugin => {
        if (plugin.ide_type === 'windsurf') {
          const pluginId = plugin.name.replace(/-/g, '_');
          checkPluginStatus(pluginId);
        }
      });
    } else {
      log('⚠️ 未获取到插件列表，使用本地备用配置', 'warning');
      showFallbackPluginCard();
    }
  } catch (error) {
    console.error('获取插件列表失败:', error);
    log(`❌ 获取插件列表失败: ${error.message}`, 'error');
    showFallbackPluginCard();
  }
}

// 显示备用插件卡片（当后端不可用时）
function showFallbackPluginCard() {
  const container = document.getElementById('plugins-container');
  const loadingEl = document.getElementById('plugins-loading');
  const fallbackCard = document.getElementById('fallback-plugin-card');
  
  if (loadingEl) loadingEl.style.display = 'none';
  if (fallbackCard) {
    fallbackCard.style.display = 'block';
    // 将备用卡片移到容器中
    if (container && !container.contains(fallbackCard)) {
      container.appendChild(fallbackCard);
    }
  }
  
  try { lucide.createIcons(); } catch (e) {}
  
  // 为工作目录输入框添加拖拽支持
  const aiRulesPathInput = document.getElementById('ai-rules-path');
  if (aiRulesPathInput) {
    aiRulesPathInput.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const filePath = files[0].path;
        const fs = require('fs');
        const path = require('path');
        let targetPath = filePath;
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            targetPath = path.dirname(filePath);
          }
        } catch (err) {
          console.warn('检查路径类型失败:', err);
        }
        aiRulesPathInput.value = targetPath;
        aiRulesPathInput.dispatchEvent(new Event('change'));
        showToast('路径已设置', 'success');
      }
    });
    aiRulesPathInput.addEventListener('dragover', (e) => e.preventDefault());
  }
  
  // 检测插件状态
  checkPluginStatus();
}

// 根据插件数据创建插件卡片 DOM
function createPluginCard(plugin) {
  const card = document.createElement('div');
  card.className = 'info-card';
  card.setAttribute('data-plugin-name', plugin.name);
  
  // 图标渐变色（默认使用蓝色系，与整体UI协调）
  const gradientColors = plugin.icon_gradient || ['#3b82f6', '#2563eb'];
  const iconName = plugin.icon || 'puzzle';
  
  // 构建功能列表 HTML
  let featuresHtml = '';
  if (plugin.features && plugin.features.length > 0) {
    featuresHtml = plugin.features.map(f => 
      `<li><strong>${f.title}</strong>：${f.description}</li>`
    ).join('');
  }
  
  // 构建使用步骤 HTML
  let stepsHtml = '';
  if (plugin.usage_steps && plugin.usage_steps.length > 0) {
    stepsHtml = plugin.usage_steps.map(s => 
      `<li><strong>${s.title}</strong>：${s.description}</li>`
    ).join('');
  }
  
  // 构建提示 HTML
  let tipsHtml = '';
  if (plugin.tips && plugin.tips.length > 0) {
    tipsHtml = plugin.tips.map(tip => {
      const bgColor = tip.type === 'success' ? '#d1fae5' : tip.type === 'warning' ? '#fef3c7' : '#e5e7eb';
      const borderColor = tip.type === 'success' ? '#10b981' : tip.type === 'warning' ? '#f59e0b' : '#6b7280';
      const textColor = tip.type === 'success' ? '#065f46' : tip.type === 'warning' ? '#92400e' : '#374151';
      return `
        <div style="margin-top: 12px; padding: 12px; background: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 6px;">
          <strong style="color: ${textColor};">${tip.title}</strong>
          <p style="margin: 8px 0 0 0; color: ${textColor};">${tip.content}</p>
        </div>
      `;
    }).join('');
  }
  
  // 判断是否是 Kiro 插件
  const isKiro = plugin.ide_type === 'kiro';
  const pluginId = plugin.name.replace(/-/g, '_');
  
  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
        <i data-lucide="${iconName}" style="color: white; width: 28px; height: 28px;"></i>
      </div>
      <div style="flex: 1;">
        <h3 style="margin: 0 0 5px 0; font-size: 1.2em;">${plugin.display_name || plugin.name}</h3>
        <p style="margin: 0; color: #6b7280; font-size: 0.9em;">${plugin.description || ''}</p>
      </div>
      <div id="plugin-status-badge-${pluginId}" class="status-badge" style="padding: 6px 12px; border-radius: 6px; font-size: 0.85em; font-weight: 500;">
        <i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i>
        <span>检测中...</span>
      </div>
    </div>

    ${featuresHtml ? `
    <div class="info-section collapsible-section collapsed">
      <div class="collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <h4 style="margin: 0; font-size: 0.95em; color: #374151; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="chevron-down" class="collapse-icon" style="width: 16px; height: 16px; transition: transform 0.2s;"></i>
          功能介绍
        </h4>
      </div>
      <div class="collapsible-content">
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #6b7280; line-height: 1.8;">
          ${featuresHtml}
        </ul>
      </div>
    </div>
    ` : ''}

    ${stepsHtml || tipsHtml ? `
    <!-- 使用说明（可折叠） -->
    <div class="info-section collapsible-section collapsed" style="margin-top: 10px;">
      <div class="collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <h4 style="margin: 0; font-size: 0.95em; color: #374151; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="chevron-down" class="collapse-icon" style="width: 16px; height: 16px; transition: transform 0.2s;"></i>
          使用说明
        </h4>
      </div>
      <div class="collapsible-content">
        <div style="color: #6b7280; line-height: 1.8; margin-top: 10px;">
          ${stepsHtml ? `
          <ol style="padding-left: 20px; margin: 0;">
            ${stepsHtml}
          </ol>
          <p style="margin-top: 10px; font-size: 0.9em; color: #9ca3af;">💡 如需单独操作，可点击"更多操作"按钮</p>
          ` : ''}
          ${tipsHtml}
        </div>
      </div>
    </div>
    ` : ''}

    <div class="info-section" style="margin-top: 20px;">
      <h4 style="margin: 0 0 10px 0; font-size: 0.95em; color: #374151;">安装状态与版本</h4>
      <div style="color: #6b7280; line-height: 1.8;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;">
            <i data-lucide="loader" id="plugin-installed-icon-${pluginId}" style="width: 16px; height: 16px;"></i>
            <span id="plugin-installed-text-${pluginId}">检测中...</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;">
            <i data-lucide="package" style="width: 16px; height: 16px; color: #6b7280;"></i>
            <span>本地版本：<strong id="plugin-local-version-${pluginId}">检测中...</strong></span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;">
            <i data-lucide="loader" id="mcp-configured-icon-${pluginId}" style="width: 16px; height: 16px;"></i>
            <span id="mcp-configured-text-${pluginId}">检测中...</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;">
            <i data-lucide="cloud" style="width: 16px; height: 16px; color: #6b7280;"></i>
            <span>最新版本：<strong id="plugin-latest-version-${pluginId}">${plugin.latest_version || '未知'}</strong></span>
          </div>
        </div>
        <div id="plugin-update-info-${pluginId}" style="display: none; margin-top: 10px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 6px;">
          <strong style="color: #92400e;" id="plugin-update-title-${pluginId}">检测中...</strong>
          <p style="margin: 5px 0 0 0; color: #92400e; font-size: 0.9em;" id="plugin-update-desc-${pluginId}"></p>
        </div>
      </div>
    </div>
    <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
      ${isKiro ? `
      <button id="install-kiro-plugin-btn" class="btn btn-secondary" style="flex: 1; min-width: 140px;" title="安装插件到 Kiro IDE" onclick="installPluginToKiro()">
        <i data-lucide="download"></i>
        <span>安装到 Kiro</span>
      </button>
      <button id="configure-kiro-mcp-btn" class="btn btn-primary" style="flex: 1; min-width: 140px;" title="配置 Kiro 的 MCP" onclick="configureKiroMCP()">
        <i data-lucide="settings"></i>
        <span>配置 Kiro MCP</span>
      </button>
      ` : `
      <button id="install-plugin-btn-${pluginId}" class="btn btn-primary" style="flex: 1; min-width: 160px;" title="安装或重新安装插件（自动完成全部配置并重启 Windsurf）" onclick="installPlugin()">
        <i data-lucide="download"></i>
        <span>一键安装</span>
      </button>
      <!-- 更多操作下拉菜单 -->
      <div class="dropdown" style="position: relative;">
        <button id="more-actions-btn" class="btn btn-secondary" title="更多操作" onclick="toggleMoreActionsMenu(event)">
          <i data-lucide="more-horizontal"></i>
          <span>更多操作</span>
          <i data-lucide="chevron-down" style="width: 14px; height: 14px; margin-left: 4px;"></i>
        </button>
        <div id="more-actions-menu" class="dropdown-menu">
          <button class="dropdown-item" id="activate-plugin-btn" title="同步激活码到插件" onclick="activatePlugin(); closeMoreActionsMenu();">
            <i data-lucide="key"></i>
            <span>激活插件</span>
          </button>
          <button class="dropdown-item" id="configure-mcp-btn" title="配置或重新配置 MCP" onclick="configureMCP(); closeMoreActionsMenu();">
            <i data-lucide="settings"></i>
            <span>配置 MCP</span>
          </button>
          <button class="dropdown-item" id="install-rules-btn" title="安装AI规则到工作目录" onclick="installAIRulesToWorkspace(); closeMoreActionsMenu();">
            <i data-lucide="file-plus"></i>
            <span>安装 AI 规则</span>
          </button>
          <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
          <button class="dropdown-item" id="clear-cache-btn" title="清除插件相关缓存" onclick="clearPluginCache(); closeMoreActionsMenu();">
            <i data-lucide="trash-2"></i>
            <span>清除缓存</span>
          </button>
          <button class="dropdown-item" id="clear-global-data-btn" title="清理 Windsurf 全局数据，恢复到新安装状态" onclick="clearWindsurfGlobalData(); closeMoreActionsMenu();">
            <i data-lucide="trash"></i>
            <span>清理全局数据</span>
          </button>
          <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>
          <button class="dropdown-item" id="file-protection-btn" title="保护 Token 文件，防止其他程序读取" onclick="toggleFileProtection(); closeMoreActionsMenu();">
            <i data-lucide="shield"></i>
            <span>Token 保护</span>
          </button>
        </div>
      </div>
      <button id="refresh-plugin-status-btn-${pluginId}" class="icon-btn" title="刷新状态" onclick="checkPluginStatus('${pluginId}')">
        <i data-lucide="refresh-cw"></i>
      </button>
      `}
    </div>
  `;
  
  return card;
}

// 刷新插件列表
async function refreshPluginList() {
  log('🔄 刷新插件列表...', 'info');
  showToast('正在刷新插件列表...', 'info');
  await loadPluginList();
  showToast('插件列表已刷新', 'success');
}

// 检测插件状态
async function checkPluginStatus(pluginId = null) {
  // 支持动态插件卡片和固定备用卡片
  const idSuffix = pluginId ? `-${pluginId}` : '';
  
  const statusBadge = document.getElementById(`plugin-status-badge${idSuffix}`);
  const installedIcon = document.getElementById(`plugin-installed-icon${idSuffix}`);
  const installedText = document.getElementById(`plugin-installed-text${idSuffix}`);
  const mcpIcon = document.getElementById(`mcp-configured-icon${idSuffix}`);
  const mcpText = document.getElementById(`mcp-configured-text${idSuffix}`);
  const installBtn = document.getElementById(`install-plugin-btn${idSuffix}`);
  const activateBtn = document.getElementById(`activate-plugin-btn${idSuffix}`);
  const configureBtn = document.getElementById(`configure-mcp-btn${idSuffix}`);
  
  // 如果找不到元素，说明该插件卡片不存在，直接返回
  if (!statusBadge) {
    console.warn(`插件卡片元素未找到: plugin-status-badge${idSuffix}`);
    return;
  }
  
  // 显示检测中状态
  statusBadge.innerHTML = '<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i><span>检测中...</span>';
  statusBadge.style.background = '#e5e7eb';
  statusBadge.style.color = '#6b7280';
  
  try {
    const result = await window.electronAPI.checkPluginStatus();
    
    if (!result.success) {
      showToast(`检测失败: ${result.message}`, 'error');
      return;
    }
    
    const { pluginInstalled, mcpConfigured, pluginReason } = result.data;
    
    // 记录检测结果到日志
    if (pluginInstalled) {
      log(`✅ 插件状态: ${pluginReason || '已安装'}`, 'success');
    } else {
      log(`❌ 插件状态: ${pluginReason || '未安装'}`, 'warning');
    }
    
    // 更新安装状态 - 按钮始终可用，支持重新安装
    if (pluginInstalled) {
      if (installedIcon) {
        installedIcon.setAttribute('data-lucide', 'check-circle');
        installedIcon.style.color = '#10b981';
      }
      if (installedText) {
        installedText.textContent = '插件已安装';
        installedText.style.color = '#10b981';
      }
      
      // 已安装时显示"重新安装"，但按钮仍可用
      if (installBtn) {
        installBtn.disabled = false;
        installBtn.innerHTML = '<i data-lucide="refresh-cw"></i><span>重新安装</span>';
      }
      
      // 插件已安装，启用激活按钮
      if (activateBtn) {
        activateBtn.disabled = false;
      }
    } else {
      if (installedIcon) {
        installedIcon.setAttribute('data-lucide', 'x-circle');
        installedIcon.style.color = '#ef4444';
      }
      if (installedText) {
        installedText.textContent = '插件未安装';
        installedText.style.color = '#ef4444';
        installedText.title = pluginReason || '插件未安装';
      }
      
      if (installBtn) {
        installBtn.disabled = false;
        installBtn.innerHTML = '<i data-lucide="download"></i><span>一键安装</span>';
      }
      
      // 插件未安装，但激活按钮也可用（会提示先安装）
      if (activateBtn) {
        activateBtn.disabled = false;
      }
      
      // 显示插件未安装提醒
      showToast('⚠️ 检测到插件未安装，已自动清除 Windsurf 账号', 'warning');
      console.log('[插件检测] 插件未安装，已触发账号清除');
    }
    
    // 更新 MCP 配置状态 - 按钮始终可用，支持重新配置
    if (mcpConfigured) {
      if (mcpIcon) {
        mcpIcon.setAttribute('data-lucide', 'check-circle');
        mcpIcon.style.color = '#10b981';
      }
      if (mcpText) {
        mcpText.textContent = 'MCP 已配置';
        mcpText.style.color = '#10b981';
      }
      
      // 已配置时显示"重新配置"，但按钮仍可用
      if (configureBtn) {
        configureBtn.disabled = false;
        configureBtn.innerHTML = '<i data-lucide="refresh-cw"></i><span>重新配置</span>';
      }
    } else {
      if (mcpIcon) {
        mcpIcon.setAttribute('data-lucide', 'x-circle');
        mcpIcon.style.color = '#ef4444';
      }
      if (mcpText) {
        mcpText.textContent = 'MCP 未配置';
        mcpText.style.color = '#ef4444';
      }
      
      if (configureBtn) {
        configureBtn.disabled = false;
        configureBtn.innerHTML = '<i data-lucide="settings"></i><span>配置 MCP</span>';
      }
    }
    
    // 更新整体状态徽章
    if (pluginInstalled && mcpConfigured) {
      statusBadge.innerHTML = '<i data-lucide="check-circle" style="width: 14px; height: 14px; margin-right: 4px;"></i><span>已就绪</span>';
      statusBadge.style.background = '#d1fae5';
      statusBadge.style.color = '#065f46';
    } else if (pluginInstalled) {
      statusBadge.innerHTML = '<i data-lucide="alert-circle" style="width: 14px; height: 14px; margin-right: 4px;"></i><span>需配置</span>';
      statusBadge.style.background = '#fef3c7';
      statusBadge.style.color = '#92400e';
    } else {
      statusBadge.innerHTML = '<i data-lucide="x-circle" style="width: 14px; height: 14px; margin-right: 4px;"></i><span>未安装</span>';
      statusBadge.style.background = '#fee2e2';
      statusBadge.style.color = '#991b1b';
    }
    
    // 重新渲染图标
    try { lucide.createIcons(); } catch (e) {}
    
    // 同时获取服务器端插件信息
    await fetchPluginServerInfo(pluginId);
    
  } catch (error) {
    showToast(`检测失败: ${error.message}`, 'error');
    log(`❌ 检测插件状态失败: ${error.message}`, 'error');
  }
}

// 保存插件更新信息（用于更新按钮）
let pluginUpdateInfo = null;
let lastPluginUpdateCheck = 0; // 上次检查插件更新的时间戳

/**
 * 静默检查插件更新（启动时和定时检查使用）
 * 如果发现更新，会弹出提醒对话框
 * @param {boolean} silent 是否静默模式（不显示无更新提示）
 */
async function checkPluginUpdateSilently(silent = true) {
  try {
    // 获取本地插件版本
    let localVersion = '0.0.0';
    const statusResult = await window.electronAPI.checkPluginStatus();
    if (statusResult.success && statusResult.data && statusResult.data.pluginVersion) {
      localVersion = statusResult.data.pluginVersion;
    } else if (!statusResult.success || !statusResult.data?.pluginInstalled) {
      // 插件未安装，不检查更新
      console.log('[插件更新检查] 插件未安装，跳过检查');
      return;
    }
    
    console.log('[插件更新检查] 本地版本:', localVersion);
    
    // 调用后台 API 检查更新
    const updateResult = await window.electronAPI.checkPluginUpdate({
      pluginName: 'windsurf-continue-pro',
      clientVersion: localVersion
    });
    
    if (updateResult.success && updateResult.data) {
      const { has_update, latest_version, update_title, update_description, download_url, is_force_update } = updateResult.data;
      
      console.log('[插件更新检查] 服务器最新版本:', latest_version, '有更新:', has_update);
      
      // 保存更新信息供其他地方使用
      pluginUpdateInfo = {
        latestVersion: latest_version,
        downloadUrl: download_url,
        hasUpdate: has_update,
        isForceUpdate: is_force_update
      };
      
      if (has_update) {
        // 发现更新，弹出提醒
        showPluginUpdateNotification({
          currentVersion: localVersion,
          latestVersion: latest_version,
          updateTitle: update_title,
          updateDescription: update_description,
          downloadUrl: download_url,
          isForceUpdate: is_force_update
        });
      } else if (!silent) {
        showToast('插件已是最新版本', 'success');
      }
    }
    
    lastPluginUpdateCheck = Date.now();
  } catch (error) {
    console.error('[插件更新检查] 失败:', error);
  }
}

/**
 * 显示插件更新提醒弹窗
 */
function showPluginUpdateNotification(info) {
  const { currentVersion, latestVersion, updateTitle, updateDescription, isForceUpdate } = info;
  
  // 创建弹窗元素
  const overlay = document.createElement('div');
  overlay.id = 'plugin-update-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const forceStyle = isForceUpdate ? 'border: 2px solid #ef4444;' : '';
  const titleColor = isForceUpdate ? '#dc2626' : '#1e40af';
  const badgeHtml = isForceUpdate ? '<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">强制更新</span>' : '';
  
  overlay.innerHTML = `
    <div style="background: white; border-radius: 12px; padding: 24px; max-width: 420px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); ${forceStyle}">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <i data-lucide="package" style="width: 28px; height: 28px; color: ${titleColor}; margin-right: 12px;"></i>
        <h3 style="margin: 0; color: ${titleColor}; font-size: 18px;">发现插件新版本${badgeHtml}</h3>
      </div>
      
      <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #64748b;">当前版本</span>
          <span style="color: #334155; font-weight: 500;">${currentVersion}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">最新版本</span>
          <span style="color: #059669; font-weight: 600;">${latestVersion}</span>
        </div>
      </div>
      
      ${updateTitle ? `<h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 15px;">${updateTitle}</h4>` : ''}
      ${updateDescription ? `<p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px; line-height: 1.5;">${updateDescription}</p>` : ''}
      
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        ${!isForceUpdate ? `<button id="plugin-update-later-btn" style="padding: 10px 20px; border: 1px solid #e2e8f0; background: white; border-radius: 8px; cursor: pointer; color: #64748b; font-size: 14px;">稍后更新</button>` : ''}
        <button id="plugin-update-now-btn" style="padding: 10px 20px; border: none; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">立即更新</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  try { lucide.createIcons(); } catch (e) {}
  
  // 绑定事件
  const laterBtn = document.getElementById('plugin-update-later-btn');
  const nowBtn = document.getElementById('plugin-update-now-btn');
  
  if (laterBtn) {
    laterBtn.addEventListener('click', () => {
      overlay.remove();
    });
  }
  
  if (nowBtn) {
    nowBtn.addEventListener('click', async () => {
      overlay.remove();
      // 切换到插件安装 Tab 并触发更新
      const pluginTab = document.querySelector('[data-tab="plugin-install"]');
      if (pluginTab) {
        pluginTab.click();
      }
      // 延迟一点执行更新，确保 Tab 已切换
      setTimeout(() => {
        updatePlugin();
      }, 300);
    });
  }
  
  // 强制更新时禁止点击外部关闭
  if (!isForceUpdate) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }
  
  // 日志记录
  log(`📦 发现插件新版本: ${currentVersion} → ${latestVersion}`, 'info');
}

// 从服务器获取插件信息并检查更新
async function fetchPluginServerInfo(pluginId = null) {
  const idSuffix = pluginId ? `-${pluginId}` : '';
  const localVersionEl = document.getElementById(`plugin-local-version${idSuffix}`);
  const latestVersionEl = document.getElementById(`plugin-latest-version${idSuffix}`);
  const updateInfoEl = document.getElementById(`plugin-update-info${idSuffix}`);
  const updateTitleEl = document.getElementById(`plugin-update-title${idSuffix}`);
  const updateDescEl = document.getElementById(`plugin-update-desc${idSuffix}`);
  const updateBtn = document.getElementById(`update-plugin-btn${idSuffix}`);
  
  // 获取本地插件版本（从已安装插件读取）
  let localVersion = '1.0.0'; // 默认版本
  try {
    const statusResult = await window.electronAPI.checkPluginStatus();
    if (statusResult.success && statusResult.data && statusResult.data.pluginVersion) {
      localVersion = statusResult.data.pluginVersion;
    }
  } catch (err) {
    console.warn('获取本地插件版本失败:', err);
  }
  
  if (localVersionEl) {
    localVersionEl.textContent = localVersion;
  }
  
  try {
    // 检查插件更新
    const updateResult = await window.electronAPI.checkPluginUpdate({
      pluginName: 'windsurf-continue-pro',
      clientVersion: localVersion
    });
    
    if (updateResult.success && updateResult.data) {
      const { has_update, latest_version, update_title, update_description, download_url, is_force_update } = updateResult.data;
      
      // 保存更新信息
      pluginUpdateInfo = {
        latestVersion: latest_version,
        downloadUrl: download_url,
        hasUpdate: has_update,
        isForceUpdate: is_force_update
      };
      
      if (latestVersionEl) {
        latestVersionEl.textContent = latest_version || localVersion;
        if (has_update) {
          latestVersionEl.style.color = '#f59e0b';
        } else {
          latestVersionEl.style.color = '#10b981';
        }
      }
      
      if (has_update && updateInfoEl) {
        updateInfoEl.style.display = 'block';
        if (updateTitleEl) {
          updateTitleEl.textContent = update_title || `发现新版本 ${latest_version}`;
        }
        if (updateDescEl) {
          updateDescEl.textContent = update_description || `检测到新版本 ${latest_version}`;
        }
        if (is_force_update) {
          updateInfoEl.style.background = '#fee2e2';
          updateInfoEl.style.borderColor = '#ef4444';
          if (updateTitleEl) updateTitleEl.style.color = '#991b1b';
          if (updateDescEl) updateDescEl.style.color = '#991b1b';
        }
        log(`📦 发现插件新版本: ${latest_version}`, 'info');
      } else if (updateInfoEl) {
        updateInfoEl.style.display = 'none';
      }
    } else {
      pluginUpdateInfo = null;
      if (latestVersionEl) {
        latestVersionEl.textContent = '获取失败';
        latestVersionEl.style.color = '#6b7280';
      }
    }
  } catch (error) {
    console.error('获取插件信息失败:', error);
    pluginUpdateInfo = null;
    if (latestVersionEl) {
      latestVersionEl.textContent = '获取失败';
      latestVersionEl.style.color = '#6b7280';
    }
  }
  
  try { lucide.createIcons(); } catch (e) {}
}

// 更新插件（从服务器下载最新版本）
async function updatePlugin() {
  if (!pluginUpdateInfo || !pluginUpdateInfo.hasUpdate) {
    showToast('当前已是最新版本', 'info');
    return;
  }
  
  if (!pluginUpdateInfo.downloadUrl) {
    showToast('无法获取下载地址，请稍后重试', 'error');
    return;
  }
  
  const btn = document.getElementById('update-plugin-btn');
  const originalHtml = btn ? btn.innerHTML : '';
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader"></i><span>更新中...</span>`;
    try { lucide.createIcons(); } catch (e) {}
  }
  
  log(`🔄 开始更新插件到 ${pluginUpdateInfo.latestVersion}...`, 'info');
  showToast('正在更新插件，请稍候...', 'info');
  
  try {
    const result = await window.electronAPI.updatePlugin({
      targetVersion: pluginUpdateInfo.latestVersion,
      downloadUrl: pluginUpdateInfo.downloadUrl
    });
    
    if (result.success) {
      log(`✅ 插件更新成功: ${pluginUpdateInfo.latestVersion}`, 'success');
      showToast('插件更新成功！', 'success');
      
      // 刷新状态
      if (cachedPluginList) {
        cachedPluginList.forEach(plugin => {
          if (plugin.ide_type === 'windsurf') {
            const pluginId = plugin.name.replace(/-/g, '_');
            checkPluginStatus(pluginId);
          }
        });
      } else {
        await checkPluginStatus();
      }
      await fetchPluginServerInfo();
      
      // 自动启动 Windsurf
      if (result.wasRunning) {
        log('🚀 正在启动 Windsurf...', 'info');
        const launchResult = await window.electronAPI.launchWindsurf();
        if (launchResult.success) {
          log('✅ Windsurf 已启动', 'success');
          showToast('Windsurf 已启动，更新将自动生效！', 'success');
        }
      }
    } else {
      log(`❌ 插件更新失败: ${result.message}`, 'error');
      showToast(`更新失败: ${result.message}`, 'error');
    }
  } catch (error) {
    log(`❌ 插件更新失败: ${error.message}`, 'error');
    showToast(`更新失败: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      try { lucide.createIcons(); } catch (e) {}
    }
  }
}

// 安装插件（一键完成：安装、激活、配置MCP、安装规则、重启Windsurf）
async function installPlugin(forceInstall = false) {
  // 查找一键安装按钮（可能是动态生成的带 pluginId 后缀，也可能是备用卡片的固定 ID）
  let btn = document.getElementById('install-plugin-btn');
  if (!btn) {
    // 尝试查找动态生成的按钮
    const allButtons = document.querySelectorAll('[id^="install-plugin-btn-"]');
    if (allButtons.length > 0) {
      btn = allButtons[0]; // 使用第一个找到的按钮
    }
  }
  if (!btn) {
    console.error('[一键安装] 未找到安装按钮');
    showToast('未找到安装按钮，请刷新页面后重试', 'error');
    return;
  }
  
  // 可选：记录当前已配置的工作区路径（如果有）
  const mainWorkspaceInput = document.getElementById('workspace-path-input');
  const workspacePath = mainWorkspaceInput ? mainWorkspaceInput.value.trim() : '';
  if (workspacePath) {
    log(`📁 工作目录: ${workspacePath}`, 'info');
  }
  
  const originalHtml = btn.innerHTML;
  
  // 检测是否是重新安装（按钮文本包含"重新安装" 或 forceInstall 参数为 true）
  const isReinstall = originalHtml.includes('重新安装') && !forceInstall;
  
  const updateBtnStatus = (text) => {
    btn.innerHTML = `<i data-lucide="loader"></i><span>${text}</span>`;
    try { lucide.createIcons(); } catch (e) {}
  };
  
  btn.disabled = true;
  updateBtnStatus(isReinstall ? '重新安装中...' : '安装中...');
  
  // 设置安装中标志，暂停插件卸载监控弹窗
  isInstallingPlugin = true;
  
  log(`🚀 开始${isReinstall ? '重新安装' : '一键安装'}流程...`, 'info');
  showToast(`正在执行${isReinstall ? '重新安装' : '一键安装'}，请稍候...`, 'info');
  
  try {
    // 步骤1: 安装插件
    log('📦 步骤 1/4: 安装插件...', 'info');
    updateBtnStatus('安装插件...');
    const installTimeoutMs = 5 * 60 * 1000;
    const installResult = await Promise.race([
      window.electronAPI.installPlugin(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('安装超时，请检查网络或稍后重试')), installTimeoutMs))
    ]);
    
    if (!installResult.success) {
      const errorMsg = `安装插件失败: ${installResult.message}`;
      log(`❌ ${errorMsg}`, 'error');
      showToast(errorMsg, 'error', 5000);
      throw new Error(errorMsg);
    }
    
    // 检查是否是延迟安装模式
    if (installResult.delayed) {
      log('⏳ 插件正在后台安装中...', 'info');
      showToast('插件正在后台安装，等待 8 秒后继续...', 'info', 8000);
      
      // 延迟安装模式下，等待后台脚本完成（3秒延迟 + 5秒安装时间）
      updateBtnStatus('等待后台安装完成...');
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      log('✅ 后台安装完成，继续执行后续步骤', 'success');
    }
    
    log('✅ 插件安装成功', 'success');
    
    // 步骤2: 激活插件（同步激活码）
    log('🔑 步骤 2/4: 激活插件...', 'info');
    updateBtnStatus('激活插件...');
    const activateResult = await window.electronAPI.activatePlugin();
    
    if (!activateResult.success) {
      // 激活失败不中断流程，可能是没有激活码
      log(`⚠️ 激活插件跳过: ${activateResult.message}`, 'warning');
    } else {
      log('✅ 插件激活成功', 'success');
    }
    
    // 步骤3: 配置 MCP
    log('⚙️ 步骤 3/4: 配置 MCP...', 'info');
    updateBtnStatus('配置 MCP...');
    const mcpResult = await window.electronAPI.configureMCP();
    
    if (!mcpResult.success) {
      log(`⚠️ MCP 配置跳过: ${mcpResult.message}`, 'warning');
    } else {
      log('✅ MCP 配置成功', 'success');
    }
    
    // 步骤4: 安装 AI 规则（如果有工作区）
    log('📝 步骤 4/4: 安装 AI 规则...', 'info');
    updateBtnStatus('安装规则...');
    const rulesResult = await window.electronAPI.installAIRules();
    
    if (!rulesResult.success) {
      log(`⚠️ AI 规则安装跳过: ${rulesResult.message}`, 'warning');
    } else {
      log('✅ AI 规则安装成功', 'success');
    }
    
    // 刷新状态
    log('🔄 刷新插件状态...', 'info');
    if (cachedPluginList) {
      const statusPromises = [];
      cachedPluginList.forEach(plugin => {
        if (plugin.ide_type === 'windsurf') {
          const pluginId = plugin.name.replace(/-/g, '_');
          statusPromises.push(checkPluginStatus(pluginId));
        }
      });
      await Promise.all(statusPromises);
    } else {
      await checkPluginStatus();
    }
    log('✅ 状态刷新完成', 'success');
    
    // 完成提示 - 重新安装和一键安装都执行相同的流程
    log(`🎉 ${isReinstall ? '重新安装' : '一键安装'}完成！`, 'success');
    showToast(`${isReinstall ? '重新安装' : '一键安装'}完成！正在启动 Windsurf...`, 'success');
    
    // 自动启动 Windsurf（安装过程中已经关闭了 Windsurf）
    updateBtnStatus('启动 Windsurf...');
    
    // 等待 2 秒确保文件系统同步完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const launchResult = await window.electronAPI.launchWindsurf();
    if (launchResult.success) {
      log('✅ Windsurf 已启动', 'success');
      showToast('Windsurf 已启动，插件将自动生效！', 'success');
    } else {
      log(`⚠️ Windsurf 启动失败: ${launchResult.message}`, 'warning');
      showToast('请手动启动 Windsurf', 'info');
    }
    
  } catch (error) {
    showToast(`安装失败: ${error.message}`, 'error');
    log(`❌ 一键安装失败: ${error.message}`, 'error');
  } finally {
    // 重置安装中标志，恢复插件卸载监控
    isInstallingPlugin = false;
    // 确保按钮始终被重新启用
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 激活插件
async function activatePlugin() {
  // 可选：记录当前已配置的工作区路径（如果有）
  const mainWorkspaceInput = document.getElementById('workspace-path-input');
  const workspacePath = mainWorkspaceInput ? mainWorkspaceInput.value.trim() : '';
  if (workspacePath) {
    log(`📁 工作目录: ${workspacePath}`, 'info');
  }
  
  const btn = document.getElementById('activate-plugin-btn');
  if (!btn) return;
  
  const originalHtml = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>激活中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始激活插件...', 'info');
  showToast('正在同步激活码到插件...', 'info');
  
  try {
    const result = await window.electronAPI.activatePlugin();
    
    if (result.success) {
      showToast('激活成功！正在重启 Windsurf...', 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 自动重启 Windsurf
      const killResult = await window.electronAPI.killWindsurf();
      if (killResult.success) {
        log('✅ Windsurf 已关闭', 'info');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const launchResult = await window.electronAPI.launchWindsurf();
      if (launchResult.success) {
        log('✅ Windsurf 已启动', 'success');
        showToast('Windsurf 已重启，插件将自动生效！', 'success');
      } else {
        showToast('请手动启动 Windsurf', 'info');
      }
    } else {
      showToast(`激活失败: ${result.message}`, 'error');
      log(`❌ 激活失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`激活失败: ${error.message}`, 'error');
    log(`❌ 激活失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 清除插件缓存（合并后的单一清除功能）
async function clearPluginCache() {
  const confirmed = await showModal(
    '清除插件缓存',
    '此操作将清除插件相关的缓存，包括：\n\n' +
    '• 插件激活状态\n' +
    '• 共享激活码文件\n' +
    '• 插件缓存文件\n' +
    '• 旧版本插件\n\n' +
    '清除后需要重新激活插件。\n\n' +
    '建议在清除前先关闭 Windsurf。\n\n' +
    '是否继续？'
  );
  
  if (!confirmed) return;
  
  const btn = document.getElementById('clear-cache-btn');
  const originalHtml = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>清除中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始清除插件缓存...', 'info');
  showToast('正在清除缓存，请稍候...', 'info');
  
  try {
    const result = await window.electronAPI.clearPluginActivationCache();
    
    if (result.success) {
      showToast(result.message, 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 显示详细结果
      if (result.data && result.data.results) {
        result.data.results.forEach(item => {
          if (item.cleared) {
            log(`  ✓ ${item.path}${item.note ? ` (${item.note})` : ''}`, 'success');
          } else if (item.error) {
            log(`  ✗ ${item.path}: ${item.error}`, 'warning');
          } else if (item.note) {
            log(`  ℹ ${item.path}: ${item.note}`, 'info');
          }
        });
      }
      
      // 刷新插件状态
      setTimeout(() => {
        if (cachedPluginList) {
          cachedPluginList.forEach(plugin => {
            if (plugin.ide_type === 'windsurf') {
              const pluginId = plugin.name.replace(/-/g, '_');
              checkPluginStatus(pluginId);
            }
          });
        } else {
          checkPluginStatus();
        }
      }, 500);
      
      // 提示下一步
      setTimeout(async () => {
        const action = await showModal(
          '缓存已清除',
          '插件缓存清除成功！\n\n建议重启 Windsurf 后重新激活插件。\n\n是否现在关闭 Windsurf？'
        );
        
        if (action) {
          const killResult = await window.electronAPI.killWindsurf();
          if (killResult.success) {
            showToast('Windsurf 已关闭，请手动重启后激活插件', 'success');
          }
        }
      }, 500);
    } else {
      showToast(`清除失败: ${result.message}`, 'error');
      log(`❌ 清除失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`清除失败: ${error.message}`, 'error');
    log(`❌ 清除失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 清理 Windsurf 全局数据（恢复到新安装状态）
async function clearWindsurfGlobalData() {
  const confirmed = await showModal(
    '⚠️ 清理全局数据',
    '此操作将清理 Windsurf 的所有数据，包括：\n\n' +
    '• 所有缓存和临时文件\n' +
    '• 所有已安装的扩展\n' +
    '• 工作区历史记录\n' +
    '• 用户设置和状态\n' +
    '• Session 和 Cookie 数据\n' +
    '• 数据库文件\n\n' +
    '⚠️ 警告：此操作不可逆！\n' +
    'Windsurf 将恢复到像新安装一样的状态。\n\n' +
    '是否继续？'
  );
  
  if (!confirmed) return;
  
  const btn = document.getElementById('clear-global-data-btn');
  const originalHtml = btn ? btn.innerHTML : '';
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i><span>清理中...</span>';
    try { lucide.createIcons(); } catch (e) {}
  }
  
  log('🗑️ 开始清理 Windsurf 全局数据...', 'info');
  showToast('正在清理全局数据，请稍候...', 'info');
  
  try {
    const result = await window.electronAPI.clearWindsurfGlobalData();
    
    if (result.success) {
      showToast(result.message, 'success');
      log('✅ 全局数据清理成功', 'success');
      
      if (result.data && result.data.results) {
        log('清理详情:', 'info');
        result.data.results.forEach(item => {
          if (item.cleared) {
            log(`  ✓ ${item.path} (${item.size})`, 'success');
          } else if (item.error) {
            log(`  ✗ ${item.path}: ${item.error}`, 'warning');
          }
        });
      }
      
      setTimeout(async () => {
        await showModal(
          '✅ 清理完成',
          '全局数据已清理完成！\n\n' +
          'Windsurf 已恢复到新安装状态。\n\n' +
          '下次启动 Windsurf 时，它将重新初始化所有设置。\n\n' +
          '如需重新使用插件，请重新安装并配置。'
        );
      }, 500);
    } else {
      showToast(`清理失败: ${result.message}`, 'error');
      log(`❌ 清理失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`清理失败: ${error.message}`, 'error');
    log(`❌ 清理失败: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      try { lucide.createIcons(); } catch (e) {}
    }
  }
}

// ==================== Token 文件保护 ====================

// 切换文件保护状态
async function toggleFileProtection() {
  log('🛡️ 检查 Token 保护状态...', 'info');
  showToast('正在检查保护状态...', 'info');
  
  try {
    // 先检查当前保护状态
    const statusResult = await window.electronAPI.checkFileProtectionStatus();
    
    if (!statusResult.success) {
      showToast(`检查状态失败: ${statusResult.message}`, 'error');
      return;
    }
    
    const isProtected = statusResult.data?.isProtected || false;
    
    if (isProtected) {
      // 当前已保护，询问是否取消保护
      const confirmed = await showModal(
        '🛡️ Token 保护已启用',
        '当前 Token 文件已受到保护。\n\n' +
        '保护机制：\n' +
        '• 已限制文件访问权限（仅当前用户可读取）\n' +
        '• 其他程序无法读取您的 Token\n\n' +
        '是否要禁用保护？',
        '禁用保护',
        '保持启用'
      );
      
      if (confirmed) {
        showToast('正在禁用保护...', 'info');
        const result = await window.electronAPI.disableFileProtection();
        
        if (result.success) {
          showToast('✅ Token 保护已禁用', 'success');
          log('🔓 Token 保护已禁用', 'success');
        } else {
          showToast(`禁用失败: ${result.message}`, 'error');
        }
      }
    } else {
      // 当前未保护，询问是否启用保护
      const confirmed = await showModal(
        '🛡️ 启用 Token 保护',
        '此功能将保护您的 Windsurf Token 文件：\n\n' +
        '保护机制：\n' +
        '• 设置严格的文件访问权限（NTFS ACL）\n' +
        '• 仅允许当前 Windows 用户访问\n' +
        '• 阻止其他程序读取您的 Token\n\n' +
        '⚠️ 注意：\n' +
        '• 仅支持 Windows 系统\n' +
        '• 不会影响 Windsurf 正常运行\n' +
        '• 可随时禁用恢复默认权限\n\n' +
        '是否启用保护？',
        '启用保护',
        '取消'
      );
      
      if (confirmed) {
        showToast('正在启用保护...', 'info');
        const result = await window.electronAPI.enableFileProtection();
        
        if (result.success) {
          showToast('✅ Token 保护已启用', 'success');
          log('🛡️ Token 保护已启用', 'success');
          
          if (result.data?.protected?.length > 0) {
            log('已保护的文件:', 'info');
            result.data.protected.forEach(f => log(`  ✓ ${f}`, 'success'));
          }
          
          await showModal(
            '✅ 保护已启用',
            'Token 文件已受到保护！\n\n' +
            '• 其他程序将无法读取您的 Token\n' +
            '• Windsurf 仍可正常运行\n\n' +
            '如需禁用保护，请再次点击"Token 保护"按钮。'
          );
        } else {
          showToast(`启用失败: ${result.message}`, 'error');
          log(`❌ 启用保护失败: ${result.message}`, 'error');
        }
      }
    }
  } catch (error) {
    showToast(`操作失败: ${error.message}`, 'error');
    log(`❌ Token 保护操作失败: ${error.message}`, 'error');
  }
}

// ==================== Token 文件保护结束 ====================

// 安装 AI 规则（强制 AI 使用 ask_continue 工具）
async function installAIRules() {
  const btn = document.getElementById('install-rules-btn');
  const originalHtml = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>安装中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始安装 AI 规则...', 'info');
  showToast('正在安装 AI 规则...', 'info');
  
  try {
    const result = await window.electronAPI.installAIRules();
    
    if (result.success) {
      showToast('AI 规则安装成功！', 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 显示成功提示
      await showModal(
        'AI 规则已安装',
        result.message + '\n\n安装后，AI 在完成每个任务后都会弹出对话框询问是否继续。'
      );
    } else {
      showToast(`安装失败: ${result.message}`, 'error');
      log(`❌ 安装失败: ${result.message}`, 'error');
      
      if (result.message.includes('工作区')) {
        await showModal(
          '需要设置工作区',
          '请先在客户端中设置工作区路径，AI 规则将安装到工作区根目录的 .windsurfrules 文件中。'
        );
      }
    }
  } catch (error) {
    showToast(`安装失败: ${error.message}`, 'error');
    log(`❌ 安装失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 安装插件到 Kiro
async function installPluginToKiro() {
  const btn = document.getElementById('install-kiro-plugin-btn');
  const originalHtml = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>安装中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始安装插件到 Kiro...', 'info');
  showToast('正在安装插件到 Kiro...', 'info');
  
  try {
    const result = await window.electronAPI.installPluginToKiro();
    
    if (result.success) {
      showToast('插件已安装到 Kiro！', 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 提示配置 MCP
      setTimeout(async () => {
        const configMcp = await showModal(
          '安装成功',
          '插件已安装到 Kiro！\n\n是否现在配置 Kiro MCP？'
        );
        
        if (configMcp) {
          await configureKiroMCP();
        }
      }, 500);
    } else {
      showToast(`安装失败: ${result.message}`, 'error');
      log(`❌ 安装失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`安装失败: ${error.message}`, 'error');
    log(`❌ 安装失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 配置 Kiro MCP
async function configureKiroMCP() {
  const btn = document.getElementById('configure-kiro-mcp-btn');
  const originalHtml = btn.innerHTML;
  
  // 获取用户输入的路径
  const kiroSettingsPath = document.getElementById('kiro-settings-path')?.value?.trim() || '';
  const mcpServerPath = document.getElementById('kiro-mcp-server-path')?.value?.trim() || '';
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>配置中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始配置 Kiro MCP...', 'info');
  if (kiroSettingsPath) {
    log(`  使用自定义配置目录: ${kiroSettingsPath}`, 'info');
  }
  if (mcpServerPath) {
    log(`  使用自定义 MCP 服务器: ${mcpServerPath}`, 'info');
  }
  showToast('正在配置 Kiro MCP...', 'info');
  
  try {
    const result = await window.electronAPI.configureKiroMCP({
      kiroSettingsPath,
      mcpServerPath
    });
    
    if (result.success) {
      showToast('Kiro MCP 配置成功！', 'success');
      log(`✅ ${result.message}`, 'success');
      if (result.data) {
        log(`  MCP 服务器: ${result.data.mcpServerPath}`, 'info');
        log(`  配置文件: ${result.data.mcpConfigPath}`, 'info');
      }
      
      await showModal(
        'Kiro MCP 配置成功',
        'MCP 配置已完成！\n\n请重启 Kiro 使配置生效。\n\n在 Kiro 中使用时，AI 完成任务后会弹出对话框询问是否继续。'
      );
    } else {
      showToast(`配置失败: ${result.message}`, 'error');
      log(`❌ 配置失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`配置失败: ${error.message}`, 'error');
    log(`❌ 配置失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// 清除插件激活缓存（专门解决激活失败问题）
async function clearPluginActivationCache() {
  const confirmed = await showModal(
    '清除激活缓存',
    '此操作将清除插件激活相关的所有缓存，包括：\n\n' +
    '• 插件的 globalState 存储\n' +
    '• 共享激活码文件\n' +
    '• 插件缓存文件\n' +
    '• 旧版本插件\n\n' +
    '清除后需要重新激活插件。\n\n' +
    '建议在清除前先关闭 Windsurf。\n\n' +
    '是否继续？'
  );
  
  if (!confirmed) return;
  
  const btn = document.getElementById('clear-activation-cache-btn');
  const originalHtml = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i><span>清除中...</span>';
  try { lucide.createIcons(); } catch (e) {}
  
  log('开始清除插件激活缓存...', 'info');
  showToast('正在清除激活缓存，请稍候...', 'info');
  
  try {
    const result = await window.electronAPI.clearPluginActivationCache();
    
    if (result.success) {
      showToast(result.message, 'success');
      log(`✅ ${result.message}`, 'success');
      
      // 显示详细结果
      if (result.data && result.data.results) {
        result.data.results.forEach(item => {
          if (item.cleared) {
            log(`  ✓ ${item.path}${item.note ? ` (${item.note})` : ''}`, 'success');
          } else if (item.error) {
            log(`  ✗ ${item.path}: ${item.error}`, 'warning');
          } else if (item.note) {
            log(`  ℹ ${item.path}: ${item.note}`, 'info');
          }
        });
      }
      
      // 刷新插件状态
      setTimeout(() => {
        if (cachedPluginList) {
          cachedPluginList.forEach(plugin => {
            if (plugin.ide_type === 'windsurf') {
              const pluginId = plugin.name.replace(/-/g, '_');
              checkPluginStatus(pluginId);
            }
          });
        } else {
          checkPluginStatus();
        }
      }, 500);
      
      // 提示下一步操作
      setTimeout(async () => {
        const action = await showModal(
          '激活缓存已清除',
          '激活缓存清除成功！\n\n' +
          '接下来请按以下步骤操作：\n' +
          '1. 点击"激活插件"重新同步激活码\n' +
          '2. 重启 Windsurf\n\n' +
          '是否现在激活插件？'
        );
        
        if (action) {
          await activatePlugin();
        }
      }, 1000);
    } else {
      showToast(`清除失败: ${result.message}`, 'error');
      log(`❌ 清除失败: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`清除失败: ${error.message}`, 'error');
    log(`❌ 清除失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    try { lucide.createIcons(); } catch (e) {}
  }
}

// ===== 公告功能 =====

let latestAnnouncementData = null;

// 获取并显示公告
async function loadAnnouncement() {
  try {
    const result = await window.electronAPI.getAnnouncement();
    
    if (result && result.success && result.data) {
      const announcementData = result.data;
      latestAnnouncementData = announcementData;
      
      // 检查是否有公告内容
      if (announcementData.content && announcementData.content.trim()) {
        displayAnnouncement(announcementData);
        updateAnnouncementNavBadge(announcementData);
      } else {
        // 没有公告内容，隐藏公告区域
        const container = document.getElementById('announcement-container');
        if (container) {
          container.style.display = 'none';
        }
      }
    } else {
      // 获取失败，隐藏公告区域
      const container = document.getElementById('announcement-container');
      if (container) {
        container.style.display = 'none';
      }
      log('获取公告失败，可能服务器未配置公告', 'info');
    }
  } catch (error) {
    console.error('获取公告异常:', error);
    const container = document.getElementById('announcement-container');
    if (container) {
      container.style.display = 'none';
    }
  }
}

// 更新菜单栏公告时间徽章
function updateAnnouncementNavBadge(data) {
  const navTimeBadge = document.getElementById('nav-announcement-time');
  if (!navTimeBadge) return;
  
  if (data.updated_at || data.created_at) {
    const timestamp = data.updated_at || data.created_at;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    let timeText = '';
    if (diffMins < 1) {
      timeText = '刚刚';
    } else if (diffMins < 60) {
      timeText = `${diffMins}分钟前`;
    } else if (diffHours < 24) {
      timeText = `${diffHours}小时前`;
    } else if (diffDays < 7) {
      timeText = `${diffDays}天前`;
    } else {
      timeText = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    }
    
    navTimeBadge.textContent = timeText;
    navTimeBadge.style.display = 'inline-block';
  }
}

// 显示公告页面内容
function displayAnnouncementPage() {
  const contentDisplay = document.getElementById('announcement-content-display');
  const updateTimeDisplay = document.getElementById('announcement-update-time');
  
  if (!contentDisplay) return;
  
  if (latestAnnouncementData && latestAnnouncementData.content) {
    contentDisplay.textContent = latestAnnouncementData.content;
    
    // 显示更新时间
    if (updateTimeDisplay && (latestAnnouncementData.updated_at || latestAnnouncementData.created_at)) {
      const timestamp = latestAnnouncementData.updated_at || latestAnnouncementData.created_at;
      const date = new Date(timestamp);
      updateTimeDisplay.textContent = `更新时间: ${date.toLocaleString('zh-CN')}`;
    }
  } else {
    contentDisplay.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #9ca3af;">
        <i data-lucide="inbox" style="width: 48px; height: 48px; margin-bottom: 10px;"></i>
        <p>暂无公告</p>
      </div>
    `;
    if (updateTimeDisplay) {
      updateTimeDisplay.textContent = '';
    }
  }
  
  try { lucide.createIcons(); } catch (e) {}
}

// 刷新公告
async function refreshAnnouncement() {
  const btn = document.getElementById('refresh-announcement-btn');
  if (btn) {
    btn.disabled = true;
    const icon = btn.querySelector('i');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
  }
  
  showToast('正在刷新公告...', 'info');
  
  await loadAnnouncement();
  displayAnnouncementPage();
  
  showToast('公告已刷新', 'success');
  
  if (btn) {
    btn.disabled = false;
    const icon = btn.querySelector('i');
    if (icon) icon.style.animation = '';
  }
}

// 公告轮播状态
let announcementPages = [];
let currentAnnouncementIndex = 0;
let announcementInterval = null;

// 显示公告内容（显示在底部左侧公告窗口，支持轮播）
function displayAnnouncement(data) {
  // 底部左侧公告窗口元素
  const sidebarWindow = document.getElementById('sidebar-announcement-window');
  const sidebarContent = document.getElementById('sidebar-announcement-content');
  const sidebarTime = document.getElementById('sidebar-announcement-time');
  
  if (sidebarWindow && sidebarContent) {
    // 将公告按段落分割（支持多种分隔符）
    const content = data.content || '';
    // 按双换行、分隔线、数字序号等分割
    announcementPages = content
      .split(/(?:\n\s*\n|\r\n\s*\r\n|---|\u2014\u2014\u2014|\d+\.\s)/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    // 如果只有一段，直接显示
    if (announcementPages.length <= 1) {
      announcementPages = [content];
      sidebarContent.textContent = content;
    } else {
      // 多段公告，启动轮播
      currentAnnouncementIndex = 0;
      sidebarContent.textContent = announcementPages[0];
      startAnnouncementCarousel();
    }
    
    // 显示公告时间（使用相对时间格式，如"8天前"）
    if (sidebarTime && data.updated_at) {
      sidebarTime.textContent = formatRelativeTime(data.updated_at);
    } else if (sidebarTime) {
      sidebarTime.textContent = '未知';
    }
    
    // 显示底部左侧公告窗口
    sidebarWindow.style.display = 'block';
    
    // 点击公告窗口时显示完整内容
    sidebarWindow.onclick = () => {
      showModal('系统公告', data.content);
    };
    
    // 重新渲染图标
    try { lucide.createIcons(); } catch (e) {}
    
    log('📢 已加载系统公告' + (announcementPages.length > 1 ? ` (共${announcementPages.length}条)` : ''), 'info');
  }
}

// 启动公告轮播
function startAnnouncementCarousel() {
  // 清除旧的轮播定时器
  if (announcementInterval) {
    clearInterval(announcementInterval);
  }
  
  // 每 4 秒切换一次
  announcementInterval = setInterval(() => {
    const sidebarContent = document.getElementById('sidebar-announcement-content');
    if (!sidebarContent || announcementPages.length <= 1) {
      clearInterval(announcementInterval);
      return;
    }
    
    // 淡出效果
    sidebarContent.style.opacity = '0';
    sidebarContent.style.transition = 'opacity 0.3s';
    
    setTimeout(() => {
      // 切换到下一条
      currentAnnouncementIndex = (currentAnnouncementIndex + 1) % announcementPages.length;
      sidebarContent.textContent = announcementPages[currentAnnouncementIndex];
      
      // 淡入效果
      sidebarContent.style.opacity = '1';
    }, 300);
  }, 4000); // 4秒切换
}

// 关闭公告
function closeAnnouncement() {
  const container = document.getElementById('announcement-container');
  if (container) {
    container.style.display = 'none';
  }
  log('已关闭公告', 'info');
}

// ===== 导航功能 =====

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = item.getAttribute('data-page');
      
      // 更新导航按钮状态
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // 切换页面
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(`page-${targetPage}`).classList.add('active');
      
      // 如果切换到账号管理页面，加载历史
      if (targetPage === 'switch') {
        loadAccountHistory();
      }
      
      // 如果切换到插件管理页面，加载插件列表
      if (targetPage === 'plugins') {
        loadPluginList();
      }
      
      // 如果切换到版本说明页面，加载版本说明
      if (targetPage === 'version') {
        loadVersionNotes();
      }
      
      // 如果切换到公告页面，显示公告内容
      if (targetPage === 'announcement') {
        displayAnnouncementPage();
      }
      
      // 重新渲染图标
      lucide.createIcons();
    });
  });
}

// ===== 时间显示和版本检查 =====

// 格式化相对时间（如"1天前"、"2小时前"）
function formatRelativeTime(isoString) {
  if (!isoString) return '未知';
  
  const now = new Date();
  const past = new Date(isoString);
  const diffMs = now - past;
  
  if (diffMs < 0) return '刚刚';
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}月前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

// 检查并显示最新版本更新时间（在版本说明菜单旁边显示标签）
async function checkAndDisplayLatestVersion() {
  const updateTimeBadge = document.getElementById('nav-version-update-time');
  
  if (!updateTimeBadge) return;
  
  try {
    const result = await window.electronAPI.checkVersion(CLIENT_VERSION);
    
    if (result.success && result.data) {
      const { updated_at } = result.data;
      
      // 显示更新时间标签（橙黄色样式）
      if (updated_at) {
        updateTimeBadge.textContent = formatRelativeTime(updated_at);
        updateTimeBadge.style.background = '#fbbf24';
        updateTimeBadge.style.color = '#78350f';
        updateTimeBadge.style.display = 'inline-block';
      } else {
        // 没有更新时间时隐藏标签
        updateTimeBadge.style.display = 'none';
      }
    } else {
      // 检查失败时也隐藏标签，避免显示错误信息
      updateTimeBadge.style.display = 'none';
    }
  } catch (error) {
    console.error('检查版本失败:', error);
    // 出错时隐藏标签
    updateTimeBadge.style.display = 'none';
  }
}

// ===== 版本控制 =====

// 检查是否需要进行版本检测
async function checkClientVersion(force = false) {
  // 如果已经被标记为需要更新，直接返回
  if (versionUpdateRequired) {
    return false;
  }

  // 如果正在检查中，避免重复检查
  if (isVersionCheckInProgress) {
    return true;
  }

  // 检查是否需要进行版本检测（间隔检查）
  const now = Date.now();
  if (!force && (now - lastVersionCheck) < VERSION_CHECK_INTERVAL) {
    return true; // 最近检查过，跳过
  }

  isVersionCheckInProgress = true;
  
  try {
    const result = await window.electronAPI.checkVersion(CLIENT_VERSION);
    lastVersionCheck = now;
    
    if (!result.success) {
      console.warn('版本检查失败:', result.message);
      return true; // 检查失败不阻止操作
    }

    const { update_required, update_message, version } = result.data;
    
    if (update_required) {
      versionUpdateRequired = true;
      // 显示强制更新弹窗，阻止所有操作
      showForceUpdateModal(update_message || '发现新版本，请立即更新', version);
      return false; // 需要更新，阻止操作
    } else {
      console.log('✅ 版本检查通过，当前版本:', CLIENT_VERSION, '服务器版本:', version);
      return true; // 版本正常，允许操作
    }
  } catch (error) {
    console.error('版本检查异常:', error);
    return true; // 检查异常不阻止操作
  } finally {
    isVersionCheckInProgress = false;
  }
}

// 请求前版本检查包装器
async function withVersionCheck(apiFunction, ...args) {
  // 检查版本
  const canProceed = await checkClientVersion();
  
  if (!canProceed) {
    throw new Error('客户端版本过低，请更新后再试');
  }
  
  // 执行实际的API调用
  return await apiFunction(...args);
}

function showForceUpdateModal(message, serverVersion) {
  // 创建一个全屏遮罩层，阻止所有操作
  const overlay = document.createElement('div');
  overlay.id = 'force-update-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Microsoft YaHei', '微软雅黑', sans-serif;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 12px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `;
  
  modal.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
    <h2 style="color: #dc2626; margin: 0 0 15px 0; font-size: 24px;">需要更新</h2>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
      ${message}<br><br>
      <strong>当前版本:</strong> ${CLIENT_VERSION}<br>
      <strong>服务器版本:</strong> ${serverVersion}
    </p>
    <p style="color: #dc2626; font-size: 14px; font-weight: bold;">
      请关闭应用并下载最新版本
    </p>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // 禁用所有交互
  document.body.style.pointerEvents = 'none';
  overlay.style.pointerEvents = 'auto';
  
  log('❌ 版本过旧，需要更新！', 'error');
}

// ===== 初始化 =====

document.addEventListener('DOMContentLoaded', async () => {
  log('🎐 PaperCrane-Windsurf 已启动', 'success');
  
  // 初始化更多操作下拉菜单事件委托
  initMoreActionsMenu();
  
  // 从主进程获取版本号并更新显示
  try {
    const versionResult = await window.electronAPI.getAppVersion();
    if (versionResult && versionResult.success && versionResult.version) {
      CLIENT_VERSION = versionResult.version;
    }
  } catch (err) {
    console.error('获取版本号失败:', err);
  }
  
  // 动态设置版本号显示
  const versionElement = document.querySelector('.sidebar-version');
  if (versionElement) {
    versionElement.textContent = `v${CLIENT_VERSION}`;
  }
  
  // 检测并显示管理员权限状态
  try {
    const adminResult = await window.electronAPI.getAdminStatus();
    const adminStatusEl = document.getElementById('admin-status');
    const adminStatusText = document.getElementById('admin-status-text');
    if (adminStatusEl && adminStatusText) {
      adminStatusEl.style.display = 'block';
      if (adminResult.isAdmin) {
        adminStatusEl.style.background = 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)';
        adminStatusEl.style.color = '#166534';
        adminStatusEl.style.border = '1px solid #86efac';
        adminStatusText.textContent = '以管理员身份运行';
        log('✅ 当前以管理员权限运行', 'success');
      } else {
        adminStatusEl.style.background = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
        adminStatusEl.style.color = '#92400e';
        adminStatusEl.style.border = '1px solid #fcd34d';
        adminStatusText.textContent = '非管理员运行';
        log('⚠️ 当前未以管理员权限运行，部分功能可能受限', 'warning');
      }
      // 刷新图标
      try { lucide.createIcons(); } catch (e) {}
    }
  } catch (err) {
    console.error('检测管理员权限失败:', err);
  }
  
  // 首先检查版本
  setTimeout(() => {
    checkClientVersion();
  }, 500);
  
  // 监听切换账号进度消息
  window.electronAPI.onSwitchProgress((data) => {
    const { step, message, percent } = data;
    
    let logType = 'info';
    let toastType = 'info';
    
    if (step === 'error') {
      logType = 'error';
      toastType = 'error';
    } else if (step === 'warning') {
      logType = 'warning';
      toastType = 'warning';
    } else if (step === 'complete') {
      logType = 'success';
      toastType = 'success';
    } else if (step === 'reset-fingerprint-done') {
      logType = 'success';
      toastType = 'success';
    } else if (step.endsWith('-done')) {
      logType = 'success';
      toastType = 'success';
    }
    
    // 如果有百分比信息，添加到消息中
    const displayMessage = percent !== undefined ? `${message} (${percent}%)` : message;
    
    log(displayMessage, logType);
    showToast(displayMessage, toastType, 2500);
    
    if (step === 'launch-done' || step === 'complete' || step === 'error') {
      const ocBtn = document.getElementById('one-click-switch-btn');
      if (ocBtn) {
        ocBtn.disabled = false;
        ocBtn.innerHTML = '<i data-lucide="zap"></i><span>一键换号</span>';
      }
      const launchBtn = document.getElementById('launch-windsurf-btn');
      if (launchBtn) {
        launchBtn.disabled = false;
        launchBtn.innerHTML = '<i data-lucide="play-circle"></i><span>启动 Windsurf</span>';
      }
      try { lucide.createIcons(); } catch (e) {}
      try { updateWindsurfStatus(); } catch (e) {}
    }
  });
  
  initNavigation();
  
  // 分阶段初始化，减少首屏阻塞
  const idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 0); };
  
  idle(() => {
    detectWindsurfPath();
  });
  setTimeout(() => {
    loadKeyInfo(true);
  }, 60);
  setTimeout(() => {
    loadWorkspacePath();
  }, 90);
  setTimeout(() => {
    updateWindsurfStatus();
  }, 120);
  // 启动时自动获取一次秘钥状态
  setTimeout(() => {
    checkKeyStatus();
  }, 200);
  setTimeout(() => {
    displayCurrentAccount();
  }, 180);
  // 获取公告
  setTimeout(() => {
    loadAnnouncement();
  }, 300);
  
  // 检查并显示最新版本更新时间
  setTimeout(() => {
    checkAndDisplayLatestVersion();
  }, 500);
  
  // 定期检查最新版本更新时间（每30分钟）
  setInterval(() => {
    checkAndDisplayLatestVersion();
  }, 30 * 60 * 1000);
  
  // 页面卸载时清理定时器
  window.addEventListener('beforeunload', () => {
    if (announcementInterval) {
      clearInterval(announcementInterval);
    }
    // 清理卡密到期检查定时器
    stopKeyExpirationCheck();
  });
  // Mac 权限检查（仅在 macOS 上执行）
  if (navigator.platform.toLowerCase().includes('mac')) {
    setTimeout(() => {
      window.electronAPI.checkMacPermission?.();
    }, 240);
  }
  
  // 定时更新 Windsurf 状态（每 3 秒），延后启动轮询
  setTimeout(() => {
    setInterval(updateWindsurfStatus, 3000);
  }, 1000);
  
  // 定期版本检查（每 30 分钟），确保长时间运行时也能检测到版本更新
  setTimeout(() => {
    setInterval(() => {
      checkClientVersion(true); // 强制检查，忽略间隔限制
    }, 30 * 60 * 1000); // 30分钟
  }, 5 * 60 * 1000); // 首次检查延后5分钟，避免与启动时检查冲突
  
  // ===== 插件更新检查 =====
  // 启动时检查插件更新（延迟 3 秒，等待界面加载完成）
  setTimeout(() => {
    console.log('[启动] 检查插件更新...');
    checkPluginUpdateSilently(true);
  }, 3000);
  
  // 定期检查插件更新（每 30 分钟）
  setInterval(() => {
    console.log('[定时] 检查插件更新...');
    checkPluginUpdateSilently(true);
  }, 30 * 60 * 1000);
  
  // ===== 卡密到期自动下号检查（每 5 分钟）=====
  startKeyExpirationCheck();
  
  // ===== 插件卸载监控（每 10 秒检测一次）=====
  // 记录上次插件安装状态
  let lastPluginInstalledState = null;
  setInterval(async () => {
    try {
      const result = await window.electronAPI.checkPluginStatus();
      const currentInstalled = result.success && result.data && result.data.pluginInstalled;
      
      // 首次检测，记录状态
      if (lastPluginInstalledState === null) {
        lastPluginInstalledState = currentInstalled;
        return;
      }
      
      // 检测到插件从已安装变为未安装（被卸载）
      // 如果正在安装插件，跳过监控弹窗
      if (lastPluginInstalledState === true && currentInstalled === false && !isInstallingPlugin) {
        console.log('[插件监控] ⚠️ 检测到插件被卸载！');
        log('⚠️ 检测到插件被卸载，正在退出当前账号...', 'warning');
        
        // 显示提示弹窗
        await showModal(
          '插件已被卸载',
          '检测到 ask-continue 插件已被卸载。\n\n为保证正常使用，当前账号已退出。请重新安装插件后再进行换号操作。',
          { showCancel: false, confirmText: '我知道了' }
        );
        
        // 清除登录信息并退出账号
        try {
          const result = await window.electronAPI.clearWindsurfAuth();
          if (result.success) {
            log('✅ 已清除登录信息并退出 Windsurf', 'info');
            showToast('已退出登录，请重新安装插件后再换号', 'warning');
          } else {
            log('⚠️ 退出账号失败: ' + result.message, 'warning');
          }
        } catch (e) {
          console.error('退出账号失败:', e);
        }
        
        // 刷新插件状态显示
        updatePluginStatus();
      }
      
      // 更新状态记录
      lastPluginInstalledState = currentInstalled;
    } catch (e) {
      console.error('[插件监控] 检测失败:', e);
    }
  }, 10 * 1000); // 每 10 秒检测一次
  
  // ===== 主页事件绑定 =====
  
  // 秘钥相关
  document.getElementById('save-key-btn')?.addEventListener('click', saveKey);
  document.getElementById('refresh-key-btn')?.addEventListener('click', checkKeyStatus);
  document.getElementById('key-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveKey();
  });
  
  // 密钥显示/隐藏切换
  document.getElementById('toggle-key-visibility')?.addEventListener('click', () => {
    const keyInput = document.getElementById('key-input');
    const toggleBtn = document.getElementById('toggle-key-visibility');
    const icon = toggleBtn.querySelector('i');
    
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      icon.setAttribute('data-lucide', 'eye');
    } else {
      keyInput.type = 'password';
      icon.setAttribute('data-lucide', 'eye-off');
    }
    
    // 重新渲染图标
    try { lucide.createIcons(); } catch (e) {}
  });
  
  // 账号信息
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    displayCurrentAccount(true);
    updateWindsurfStatus();
  });
  
  // 路径检测
  document.getElementById('detect-path-btn')?.addEventListener('click', scanWindsurfExecutable);
  document.getElementById('select-path-btn')?.addEventListener('click', selectWindsurfPath);
  
  // 工作区路径
  document.getElementById('select-workspace-btn')?.addEventListener('click', selectWorkspacePath);
  document.getElementById('clear-workspace-btn')?.addEventListener('click', clearWorkspacePath);
  
  // 快捷操作（主页）
  document.getElementById('reset-device-btn')?.addEventListener('click', () => resetDeviceIds(false, 'home'));
  document.getElementById('kill-windsurf-btn')?.addEventListener('click', killWindsurf);
  document.getElementById('launch-windsurf-btn')?.addEventListener('click', launchWindsurf);
  // 为所有购买按钮添加事件监听
  document.getElementById('purchase-key-btn')?.addEventListener('click', showPurchaseModal);
  document.getElementById('top-purchase-key-btn')?.addEventListener('click', showPurchaseModal);
  // 为其他页面的购买按钮添加事件监听（使用 data-purchase-trigger 属性）
  document.querySelectorAll('[data-purchase-trigger]').forEach(btn => {
    btn.addEventListener('click', showPurchaseModal);
  });
  
  // ===== 账号管理页面事件绑定 =====
  
  // 快捷操作按钮
  document.getElementById('manual-input-btn')?.addEventListener('click', showManualInputModal);
  document.getElementById('one-click-switch-btn')?.addEventListener('click', oneClickSwitch);
  document.getElementById('hot-switch-btn')?.addEventListener('click', hotSwitch);
  document.getElementById('reset-device-switch-btn')?.addEventListener('click', () => resetDeviceIds(false, 'switch'));
  
  // 刷新历史账号按钮
  document.getElementById('refresh-history-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-history-btn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
    }
    try {
      await loadAccountHistory();
      showToast('历史账号已刷新', 'success');
    } catch (error) {
      showToast('刷新失败: ' + error.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  });
  
  // 手动输入弹窗
  document.getElementById('manual-input-cancel')?.addEventListener('click', hideManualInputModal);
  document.getElementById('manual-input-confirm')?.addEventListener('click', manualSwitchAccount);
  
  // Enter 键提交
  document.getElementById('modal-token-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') manualSwitchAccount();
  });
  document.getElementById('modal-email-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') manualSwitchAccount();
  });
  document.getElementById('modal-label-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') manualSwitchAccount();
  });
  
  // ===== 购买卡密弹窗事件绑定 =====
  document.getElementById('purchase-modal-close')?.addEventListener('click', hidePurchaseModal);
  document.getElementById('open-purchase-link-btn')?.addEventListener('click', openPurchaseLink);
  
  // ===== 公告关闭按钮（保留用于兼容） =====
  document.getElementById('close-announcement-btn')?.addEventListener('click', closeAnnouncement);

  // ===== 日志页面操作 =====
  document.getElementById('copy-logs-btn')?.addEventListener('click', copyLogsToClipboard);
  
  // ===== 插件管理页面事件绑定 =====
  document.getElementById('install-plugin-btn')?.addEventListener('click', installPlugin);
  document.getElementById('update-plugin-btn')?.addEventListener('click', updatePlugin);
  document.getElementById('activate-plugin-btn')?.addEventListener('click', activatePlugin);
  document.getElementById('configure-mcp-btn')?.addEventListener('click', configureMCP);
  document.getElementById('clear-cache-btn')?.addEventListener('click', clearPluginCache);
  document.getElementById('install-rules-btn')?.addEventListener('click', installAIRules);
  document.getElementById('install-kiro-plugin-btn')?.addEventListener('click', installPluginToKiro);
  document.getElementById('configure-kiro-mcp-btn')?.addEventListener('click', configureKiroMCP);
  document.getElementById('refresh-plugin-status-btn')?.addEventListener('click', () => checkPluginStatus());
  document.getElementById('refresh-plugins-btn')?.addEventListener('click', refreshPluginList);
  
  // ===== 版本说明页面事件绑定 =====
  document.getElementById('refresh-version-btn')?.addEventListener('click', loadVersionNotes);
  
  // ===== 公告页面事件绑定 =====
  document.getElementById('refresh-announcement-btn')?.addEventListener('click', refreshAnnouncement);
  
  // ===== 更多操作下拉菜单 =====
  bindMoreActionsMenu();
  
  // AI 规则路径选择按钮
  document.getElementById('select-ai-rules-path-btn')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result.success && result.path) {
        const input = document.getElementById('ai-rules-path');
        input.value = result.path;
        // 触发自动保存
        input.dispatchEvent(new Event('change'));
        log(`选择了 AI 规则安装目录: ${result.path}`, 'info');
      }
    } catch (error) {
      showToast(`选择目录失败: ${error.message}`, 'error');
    }
  });
  
  // Kiro 路径选择按钮
  document.getElementById('select-kiro-path-btn')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result.success && result.path) {
        const input = document.getElementById('kiro-settings-path');
        input.value = result.path;
        // 触发自动保存
        input.dispatchEvent(new Event('change'));
        log(`选择了 Kiro 配置目录: ${result.path}`, 'info');
      }
    } catch (error) {
      showToast(`选择目录失败: ${error.message}`, 'error');
    }
  });
  
  document.getElementById('select-mcp-server-btn')?.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.selectFile({
        title: '选择 MCP 服务器文件或目录',
        allowDirectory: true
      });
      if (result.success && result.path) {
        const input = document.getElementById('kiro-mcp-server-path');
        input.value = result.path;
        // 触发自动保存
        input.dispatchEvent(new Event('change'));
        log(`选择了 MCP 服务器路径: ${result.path}`, 'info');
      }
    } catch (error) {
      showToast(`选择路径失败: ${error.message}`, 'error');
    }
  });
  
  // ===== 自动保存功能 =====
  initAutoSave();
  
  // 加载已保存的配置到输入框
  loadSavedConfigs();
});
