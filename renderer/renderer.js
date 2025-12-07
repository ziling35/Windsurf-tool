/**
 * PaperCrane-Windsurf - 渲染进程 UI 逻辑（重构版）
 */

// 当前客户端版本号
const CLIENT_VERSION = '1.0.1';

// 版本检查相关
let lastVersionCheck = 0; // 上次版本检查时间戳
let isVersionCheckInProgress = false; // 是否正在检查版本
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
let versionUpdateRequired = false; // 是否需要更新

// ===== 工具函数 =====

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
function showModal(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    modalTitle.textContent = title;
    // 支持多行：将 "\n" 渲染为 HTML 换行
    modalMessage.innerHTML = (message || '').replace(/\n/g, '<br>');
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
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

// 显示账号密码弹窗（带复制功能）
function showAccountModal(title, email, password) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = modal.querySelector('.modal-footer');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    modalTitle.textContent = title;
    
    // 构建账号密码显示内容，带复制按钮
    const passwordText = password || '无（无限额度账号）';
    const modalContent = `
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
    
    modalMessage.innerHTML = modalContent;
    
    // 重新创建图标
    try { lucide.createIcons(); } catch (e) {}
    
    // 添加复制全部按钮
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'btn btn-secondary';
    copyAllBtn.innerHTML = '<i data-lucide="copy"></i><span>复制全部</span>';
    copyAllBtn.style.marginRight = 'auto';
    
    // 插入到确认按钮之前
    modalFooter.insertBefore(copyAllBtn, modalFooter.firstChild);
    
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
    
    // 复制全部（邮箱----密码格式）
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
      copyAllBtn.removeEventListener('click', handleCopyAll);
      copyAllBtn.remove(); // 移除复制全部按钮
    };
    
    copyAllBtn.addEventListener('click', handleCopyAll);
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
        const status = data.status || data.Status;
        
        let statusLabel = '已激活';
        let isActive = true;
        if (status === 'inactive') { 
          statusLabel = '未激活'; 
          isActive = false;
        } else if (status === 'expired') { 
          statusLabel = '已过期'; 
          isActive = false;
        }
        
        keyStatusEl.textContent = statusLabel;
        keyStatusEl.className = isActive ? 'key-info-value active' : 'key-info-value inactive';
        
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
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span>保存中...</span>';
  
  log('正在保存秘钥...', 'info');
  
  const result = await window.electronAPI.saveKey(key);
  
  btn.disabled = false;
  btn.innerHTML = originalHTML;
  lucide.createIcons();
  
  if (result.success) {
    showToast('秘钥已保存', 'success');
    log('✅ 秘钥已保存', 'success');
    // 立即查询秘钥状态
    await checkKeyStatus();
  } else {
    showToast(`保存失败: ${result.message}`, 'error');
    log(`❌ 保存失败: ${result.message}`, 'error');
  }
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
    const status = data.status || data.Status;
    let statusLabel = '未知';
    let isActive = false;
    if (status === 'active') { statusLabel = '已激活'; isActive = true; }
    else if (status === 'inactive') { statusLabel = '未激活'; }
    else if (status === 'expired') { statusLabel = '已过期'; }
    else { statusLabel = '已激活'; isActive = true; } // 旧接口默认为有效
    
    keyStatusEl.textContent = statusLabel;
    keyStatusEl.className = isActive ? 'key-info-value active' : 'key-info-value inactive';
    log(`✅ 秘钥状态: ${statusLabel}`, 'success');
    
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
    
    emailSpan.textContent = email;
    tokenSpan.textContent = maskedToken;
    
    log(`当前账号: ${email}`, 'success');
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

// 加载账号历史
async function loadAccountHistory() {
  const historyList = document.getElementById('history-list');
  const historyTotal = document.getElementById('history-total');
  const historyMarked = document.getElementById('history-marked');
  
  const result = await window.electronAPI.getAccountHistory();
  
  if (result.success) {
    const { accounts, stats } = result.data;
    
    // 更新统计
    historyTotal.textContent = stats.total;
    historyMarked.textContent = stats.marked;
    
    // 清空列表
    historyList.innerHTML = '';
    
    if (accounts.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <p>暂无历史账号</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    // 渲染账号列表
    accounts.forEach(account => {
      const item = document.createElement('div');
      item.className = `history-item ${account.marked ? 'marked' : ''}`;
      item.innerHTML = `
        <div class="history-info">
          <div class="history-email">${account.email}</div>
          <div class="history-label">${account.label || 'PaperCrane'}</div>
          <div class="history-meta">
            <span>使用 ${account.usedCount || 1} 次</span>
            <span>最后使用: ${formatTime(account.lastUsed)}</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="history-btn switch-btn" title="切换到此账号" data-id="${account.id}">
            <i data-lucide="log-in"></i>
          </button>
          <button class="history-btn mark-btn ${account.marked ? 'marked' : ''}" title="${account.marked ? '取消标记' : '标记为已使用'}" data-id="${account.id}" data-marked="${account.marked}">
            <i data-lucide="${account.marked ? 'check-square' : 'square'}"></i>
          </button>
          <button class="history-btn delete-btn" title="删除" data-id="${account.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;
      
      historyList.appendChild(item);
    });
    
    // 重新渲染图标
    lucide.createIcons();
    
    // 绑定事件
    bindHistoryItemEvents();
  } else {
    log(`加载历史账号失败: ${result.message}`, 'error');
  }
}

// 绑定历史账号列表事件
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
  
  // 删除按钮
  document.querySelectorAll('.history-btn.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await deleteAccount(id);
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

    const { email, api_key, password } = accountResult.data;
    const label = password || 'PaperCrane';

    log(`✅ 获取到账号: ${email}${password ? ' (有限额度)' : ' (无限额度)'}`, 'success');

    // 刷新秘钥状态和历史列表（历史写入在主进程完成，这里只刷新显示）
    await checkKeyStatus();
    await loadAccountHistory();

    // 使用新的账号密码弹窗（带复制功能）
    await showAccountModal('获取账号成功', email, password);
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
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span>切换中...</span>';
  
  log('开始切换账号...', 'info');
  log(`邮箱: ${email}`, 'info');
  log(`标签: ${label}`, 'info');
  
  const result = await window.electronAPI.switchAccount({ token, email, label });
  
  btn.disabled = false;
  btn.innerHTML = originalHTML;
  lucide.createIcons();
  
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
  if (btn) {
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>重置中...</span>';
    
    log('重置设备码...', 'info');
    
    const result = await window.electronAPI.resetDeviceIds();
    
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
    
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
  }
  return false;
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

  const result = await window.electronAPI.killWindsurf();

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
  }

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

  // 不再使用工作区路径，直接启动
  const result = await window.electronAPI.launchWindsurf();

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
  }

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
}

// 一键换号（自动化流程）
async function oneClickSwitch() {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return; // 版本过低，阻止操作
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
    // 获取账号
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
          // 提取等待秒数
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
        // 显示具体的服务器错误信息，而不是泛泛而谈
        throw new Error(msg || '服务器错误，请稍后再试或联系管理员');
      } else if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT') {
        // 网络连接问题
        throw new Error(msg);
      } else {
        throw new Error(msg || '获取账号失败');
      }
    }
    
    const { email, api_key, password } = accountResult.data;
    
    // 根据是否返回密码决定 label
    // 有密码 = 有限额度，使用密码作为 label
    // 无密码 = 无限额度，使用 'PaperCrane'
    const label = password || 'PaperCrane';
    
    log(`✅ 获取到账号: ${email}${password ? ' (有限额度)' : ' (无限额度)'}`, 'success');
    
    // 获取账号后自动刷新秘钥状态（额度等）
    await checkKeyStatus();
    
    // 切换账号（主进程内包含备份/关闭/重置设备ID/重置指纹/重启）
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
      
      // 重新渲染图标
      lucide.createIcons();
    });
  });
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

document.addEventListener('DOMContentLoaded', () => {
  log('🎐 PaperCrane-Windsurf 已启动', 'success');
  
  // 首先检查版本
  setTimeout(() => {
    checkClientVersion();
  }, 500);
  
  // 监听切换账号进度消息
  window.electronAPI.onSwitchProgress((data) => {
    const { step, message } = data;
    
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
    
    log(message, logType);
    showToast(message, toastType, 2500);
    
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
  
  // ===== 主页事件绑定 =====
  
  // 秘钥相关
  document.getElementById('save-key-btn')?.addEventListener('click', saveKey);
  document.getElementById('refresh-key-btn')?.addEventListener('click', checkKeyStatus);
  document.getElementById('key-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveKey();
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
  document.getElementById('purchase-key-btn')?.addEventListener('click', showPurchaseModal);
  document.getElementById('top-purchase-key-btn')?.addEventListener('click', showPurchaseModal);
  
  // ===== 账号管理页面事件绑定 =====
  
  // 快捷操作按钮
  document.getElementById('manual-input-btn')?.addEventListener('click', showManualInputModal);
  document.getElementById('one-click-switch-btn')?.addEventListener('click', oneClickSwitch);
  document.getElementById('reset-device-switch-btn')?.addEventListener('click', () => resetDeviceIds(false, 'switch'));
  
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
});
