# 请求前自动版本检查功能

## 功能概述

为客户端添加了**请求前自动版本检查**机制，确保即使软件长时间运行，也能及时发现版本更新要求，保护用户数据安全。

---

## 问题场景

### ❌ 之前的问题

用户打开软件后，如果管理员在后台更新了版本要求：
```
8:00  用户打开软件（版本 1.0.0）
9:00  管理员设置最低版本为 1.1.0
10:00 用户继续使用，没有收到更新提示 ❌
```

**问题**：
- 只在启动时检查一次版本
- 软件运行期间版本更新无法感知
- 用户可能使用过时的客户端进行操作

### ✅ 现在的解决方案

```
8:00  用户打开软件（版本 1.0.0）
9:00  管理员设置最低版本为 1.1.0
10:00 用户点击"一键换号" → 自动检测版本 ✅
      → 发现版本过低 → 显示强制更新弹窗 ✅
```

**优势**：
- ✅ 关键操作前自动检查版本
- ✅ 智能间隔检查（5分钟）
- ✅ 避免重复检查
- ✅ 检查失败不影响使用

---

## 技术实现

### 1. 全局状态管理

```javascript
// 版本检查相关
let lastVersionCheck = 0;              // 上次检查时间戳
let isVersionCheckInProgress = false;  // 是否正在检查
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟间隔
let versionUpdateRequired = false;     // 是否需要更新
```

### 2. 智能版本检查函数

```javascript
async function checkClientVersion(force = false) {
  // 1. 如果已标记需要更新，直接返回 false
  if (versionUpdateRequired) {
    return false;
  }

  // 2. 避免并发检查
  if (isVersionCheckInProgress) {
    return true;
  }

  // 3. 间隔检查（5分钟内不重复）
  const now = Date.now();
  if (!force && (now - lastVersionCheck) < VERSION_CHECK_INTERVAL) {
    return true; // 最近检查过，跳过
  }

  // 4. 执行版本检查
  isVersionCheckInProgress = true;
  try {
    const result = await window.electronAPI.checkVersion(CLIENT_VERSION);
    lastVersionCheck = now;
    
    if (result.success && result.data.update_required) {
      versionUpdateRequired = true;
      showForceUpdateModal(...);
      return false; // 需要更新
    }
    
    return true; // 版本正常
  } finally {
    isVersionCheckInProgress = false;
  }
}
```

### 3. 关键操作前检查

所有重要操作都会先检查版本：

```javascript
// 示例：一键换号
async function oneClickSwitch() {
  // 版本检查
  const canProceed = await checkClientVersion();
  if (!canProceed) {
    showToast('客户端版本过低，请更新后再试', 'error');
    return; // 阻止操作
  }
  
  // 继续执行换号逻辑...
}
```

---

## 检查时机

### ✅ 会触发版本检查的操作

1. **应用启动时** - 强制检查（500ms 后）
2. **查询秘钥状态** - `checkKeyStatus()`
3. **一键换号** - `oneClickSwitch()`
4. **切换历史账号** - `switchToHistoryAccount()`
5. **手动输入切换** - `manualSwitchAccount()`
6. **重置设备码** - `resetDeviceIds()`

### ⏱️ 间隔检查机制

```javascript
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

// 时间线示例
10:00 启动应用 → 立即检查 ✅
10:03 点击换号 → 跳过（距上次不足5分钟）
10:06 点击换号 → 执行检查 ✅
10:08 查询状态 → 跳过（距上次不足5分钟）
10:12 点击换号 → 执行检查 ✅
```

---

## 工作流程

### 场景 1: 版本正常

```
用户操作 → 检查版本 → 版本OK → 继续执行
   ↓           ↓            ↓           ↓
点击换号    调用API      1.0.0 OK   获取账号成功
```

### 场景 2: 版本过低

```
用户操作 → 检查版本 → 版本过低 → 显示强制更新弹窗
   ↓           ↓            ↓              ↓
点击换号    调用API    1.0.0 < 1.1.0   阻止所有操作
                                        ⚠️ 请更新客户端
```

### 场景 3: 间隔跳过

```
用户操作 → 检查时间 → 距上次 < 5分钟 → 跳过检查，继续执行
   ↓           ↓              ↓                  ↓
点击换号   lastCheck      3分钟前            获取账号成功
         (10:03)        (现在10:06)
```

### 场景 4: 网络失败

```
用户操作 → 检查版本 → 网络失败 → 不阻止操作
   ↓           ↓            ↓            ↓
点击换号    调用API      超时/404    获取账号成功
                                    (降级容错)
```

---

## 优化特性

### 1️⃣ **性能优化**

**问题**: 每次操作都检查会影响性能

**解决方案**: 
- ✅ 5分钟间隔检查
- ✅ 已标记需要更新后不再检查
- ✅ 并发保护（同时只有一个检查）

```javascript
// 5分钟内多次操作只检查一次
10:00 检查 ✅
10:02 跳过
10:04 跳过
10:05 跳过
10:06 检查 ✅
```

### 2️⃣ **用户体验优化**

**友好提示**:
```javascript
if (!canProceed) {
  showToast('客户端版本过低，请更新后再试', 'error');
  return;
}
```

**不影响正常使用**:
```javascript
// 检查失败不阻止操作
catch (error) {
  console.error('版本检查异常:', error);
  return true; // 允许继续
}
```

### 3️⃣ **状态持久化**

```javascript
let versionUpdateRequired = false;

// 一旦发现需要更新，后续不再检查
if (versionUpdateRequired) {
  return false; // 直接返回
}
```

---

## 配置说明

### 调整检查间隔

```javascript
// renderer/renderer.js
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

// 修改示例
const VERSION_CHECK_INTERVAL = 10 * 60 * 1000;  // 10分钟
const VERSION_CHECK_INTERVAL = 2 * 60 * 1000;   // 2分钟
const VERSION_CHECK_INTERVAL = 60 * 1000;       // 1分钟
```

**推荐值**:
- **生产环境**: 5-10 分钟
- **测试环境**: 1-2 分钟
- **开发环境**: 30 秒 - 1 分钟

---

## 测试场景

### 测试 1: 启动时检查

```
1. 启动应用
2. 查看日志: "✅ 版本检查通过"
3. 正常使用功能
```

### 测试 2: 间隔检查

```
1. 启动应用（检查 ✅）
2. 3分钟后点击"一键换号"（跳过）
3. 6分钟后点击"一键换号"（检查 ✅）
4. 8分钟后点击"查询状态"（跳过）
```

### 测试 3: 版本过低

```
1. 后端设置 min_client_version = 1.1.0
2. 客户端版本 1.0.0
3. 点击"一键换号"
4. 预期: 显示强制更新弹窗 ⚠️
5. 所有操作被阻止
```

### 测试 4: 网络异常

```
1. 断开网络
2. 点击"一键换号"
3. 预期: 版本检查失败，但不阻止操作
4. 继续获取账号（可能失败）
```

### 测试 5: 并发保护

```
1. 快速连续点击多个操作按钮
2. 预期: 只触发一次版本检查
3. 其他操作等待或跳过
```

---

## 监控和日志

### 控制台日志

```javascript
// 版本检查通过
✅ 版本检查通过，当前版本: 1.0.0 服务器版本: 1.0.0

// 版本过低
❌ 版本过旧，需要更新！

// 检查失败
⚠️ 版本检查失败: 无法连接到服务器

// 跳过检查
(无日志，静默跳过)
```

### 用户提示

```javascript
// Toast 提示
showToast('客户端版本过低，请更新后再试', 'error');

// 强制更新弹窗
⚠️ 需要更新
发现新版本，请立即更新
当前版本: 1.0.0
服务器版本: 1.1.0
请关闭应用并下载最新版本
```

---

## 与其他功能的对比

### 启动时检查 vs 请求前检查

| 对比项 | 启动时检查 | 请求前检查 |
|--------|-----------|-----------|
| **检查时机** | 应用启动时 | 关键操作前 |
| **检查频率** | 仅一次 | 智能间隔（5分钟）|
| **运行时更新** | ❌ 无法感知 | ✅ 及时发现 |
| **性能影响** | 最小 | 可控（间隔） |
| **用户体验** | 启动延迟 | 无感知 |

### 最佳实践

**组合使用**:
```javascript
// 启动时: 立即检查
setTimeout(() => {
  checkClientVersion(true); // force = true
}, 500);

// 运行时: 间隔检查
async function oneClickSwitch() {
  await checkClientVersion(); // force = false (默认)
  // ...
}
```

---

## 安全考虑

### 1. 降级容错

```javascript
// 检查失败不阻止操作
catch (error) {
  return true; // 允许继续
}
```

**原因**: 避免网络问题导致软件不可用

### 2. 状态管理

```javascript
let versionUpdateRequired = false;

// 一旦标记为需要更新，持续阻止
if (versionUpdateRequired) {
  return false;
}
```

**原因**: 防止用户绕过更新弹窗

### 3. 并发保护

```javascript
if (isVersionCheckInProgress) {
  return true; // 等待当前检查完成
}
```

**原因**: 避免重复请求，减轻服务器压力

---

## 常见问题

### Q1: 为什么不是每次操作都检查？

**A**: 性能考虑。5分钟间隔已经足够及时，同时不会影响用户体验。

### Q2: 网络断开会怎样？

**A**: 检查失败会返回 `true`，不阻止用户操作。这是降级容错策略。

### Q3: 可以调整检查间隔吗？

**A**: 可以。修改 `VERSION_CHECK_INTERVAL` 常量即可。

### Q4: 强制检查版本怎么做？

**A**: 调用 `checkClientVersion(true)`，传入 `force = true`。

### Q5: 如何完全禁用间隔检查？

**A**: 设置 `VERSION_CHECK_INTERVAL = 0`（不推荐）。

---

## 总结

### ✅ 已实现功能

1. **智能间隔检查** - 5分钟检查一次
2. **关键操作保护** - 6个关键操作前检查
3. **性能优化** - 并发保护 + 时间间隔
4. **降级容错** - 检查失败不影响使用
5. **用户体验** - 友好提示 + 强制更新弹窗

### 🎯 使用效果

- ✅ 即使软件长时间运行，也能及时发现版本更新
- ✅ 不影响性能（5分钟间隔）
- ✅ 网络异常时不阻止用户
- ✅ 一旦发现需要更新，持续阻止操作

### 📝 代码位置

**文件**: `renderer/renderer.js`

**关键代码**:
- 全局变量: 第 8-12 行
- 检查函数: `checkClientVersion()` 
- 应用函数: `oneClickSwitch()`, `checkKeyStatus()` 等

---

**现在，即使管理员在软件运行时更新了版本要求，用户也会在下次操作时及时收到提示！** 🎉
