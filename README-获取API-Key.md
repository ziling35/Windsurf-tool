# 获取 Windsurf API Key 的方法

## 问题说明

当前登录的账号（helle Johnson）的 API Key 没有以明文形式存储在数据库 `state.vscdb` 中。

从调试信息可以看到：
- ❌ 没有 `codeium.windsurf` key
- ❌ `windsurfAuthStatus` 中没有 `apiKey` 字段
- ❌ 只有使用记录 `windsurf_auth-helle Johnson-usages`，不包含 API Key

## 解决方案

### 方案 1：使用开发者工具抓取（推荐）

1. **打开 Windsurf 的开发者工具**
   - 按 `Ctrl + Shift + I` 或 `F12`
   - 或者点击菜单：`Help` → `Toggle Developer Tools`

2. **切换到 Network 标签**
   - 点击 `Network` 标签
   - 勾选 `Preserve log`（保留日志）

3. **触发一个 AI 请求**
   - 在 Windsurf 中使用 Cascade 或其他 AI 功能
   - 发送一个简单的问题

4. **查找 API 请求**
   - 在 Network 标签中查找发送到 `api.codeium.com` 或类似域名的请求
   - 点击该请求

5. **查看请求头**
   - 点击 `Headers` 标签
   - 查找 `Authorization` 字段
   - API Key 通常格式为：`Bearer sk-ws-01-xxxxx...`

6. **复制 API Key**
   - 复制 `Authorization` 后面的完整字符串
   - 如果是 `Bearer sk-ws-01-xxxxx`，那么 API Key 就是 `sk-ws-01-xxxxx`

### 方案 2：检查 Windsurf 配置文件

查看 Windsurf 的配置文件：

```
C:\Users\霍一帆\AppData\Roaming\Windsurf\User\settings.json
```

有时 API Key 会存储在配置文件中。

### 方案 3：使用现有工具（仅适用于部分账号）

运行脚本：
```bash
node d:\zmoney\Windsurf-tool\get-windsurf-apikey.js --debug
```

**注意**：此脚本仅适用于将 API Key 以明文形式存储在数据库中的账号。对于使用 OAuth 或其他认证方式的账号（如当前的 helle Johnson 账号），此脚本无法获取 API Key。

## 为什么脚本无法获取当前账号的 API Key？

1. **不同的认证机制**：某些账号使用 OAuth 或其他认证方式，不直接存储 API Key
2. **加密存储**：API Key 可能存储在加密的 `secret://` key 中，需要 Electron 的 `safeStorage` 解密
3. **临时令牌**：某些账号使用临时访问令牌，而不是永久的 API Key

## 推荐做法

**使用方案 1（开发者工具抓取）** 是最可靠的方法，适用于所有类型的账号。

## 脚本说明

- `get-windsurf-apikey.js` - 从数据库读取明文 API Key（仅适用于部分账号）
- `get-all-keys.js` - 查看数据库中所有 key 的详细内容（调试用）
- `get-apikey-electron.js` - 使用 Electron safeStorage 解密（需要在 Electron 环境中运行）
