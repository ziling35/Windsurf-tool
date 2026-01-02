# 获取 Windsurf API Key - 详细步骤

## 🎯 问题分析

经过全面检查发现：
- ❌ 数据库中没有明文存储 API Key
- ❌ 加密的 session 数据为空
- ❌ 最近的日志文件中没有记录 API Key
- ✅ **结论：当前账号的 API Key 只存在于内存中，需要通过开发者工具获取**

## 📋 获取步骤（通过菜单）

### 方法 1：使用菜单打开开发者工具

1. **打开 Windsurf**

2. **点击顶部菜单栏**
   - 点击 `Help`（帮助）菜单
   - 或者 `View`（查看）菜单

3. **选择开发者工具**
   - 找到 `Toggle Developer Tools`（切换开发者工具）
   - 或者 `Developer Tools`
   - 点击打开

4. **切换到 Network 标签**
   - 在开发者工具中点击 `Network` 标签
   - ✅ 勾选 `Preserve log`（保留日志）
   - 点击 🗑️ 清空按钮

5. **触发 AI 请求**
   - 在 Cascade 中发送任意问题
   - 例如："hello"

6. **查找 API 请求**
   - 在 Network 列表中找到发送到 `api.codeium.com` 的请求
   - 或者搜索包含 `chat`、`completion` 的请求

7. **提取 API Key**
   - 点击该请求
   - 点击 `Headers` 标签
   - 找到 `Request Headers` 部分
   - 查找 `Authorization: Bearer sk-ws-01-xxxxx...`
   - 复制 `Bearer ` 后面的完整字符串

### 方法 2：使用快捷键（如果可用）

尝试以下快捷键组合：

**Windows/Linux:**
- `Ctrl + Shift + I`
- `F12`
- `Ctrl + Shift + C`

**macOS:**
- `Cmd + Option + I`
- `Cmd + Shift + C`

如果快捷键不工作，请使用方法 1（菜单）。

## 🔍 示例截图说明

当你打开 Network 标签并发送 AI 请求后，你会看到类似这样的请求：

```
Request URL: https://api.codeium.com/...
Request Method: POST

Request Headers:
  Authorization: Bearer sk-ws-01-fK4s4IcyqR50TktRAUo4pfpsTBpZFAKzYsL7bHHgXJMCmRW_6DevjYBSVuW9
  Content-Type: application/json
  ...
```

**你的 API Key 就是** `Authorization: Bearer ` 后面的完整字符串。

## ⚠️ 注意事项

1. **确保 Windsurf 已登录**
   - 检查右上角是否显示已登录状态

2. **必须触发 AI 请求**
   - 只有在使用 Cascade 或其他 AI 功能时才会发送包含 API Key 的请求

3. **API Key 格式**
   - 正确格式：`sk-ws-01-` 开头
   - 长度约 70-100 个字符

## 🆘 如果还是无法打开开发者工具

如果所有方法都无法打开开发者工具，可能是：

1. **Windsurf 版本限制**
   - 某些版本可能禁用了开发者工具
   - 尝试更新到最新版本

2. **使用网络抓包工具**
   - 安装 Fiddler 或 Wireshark
   - 抓取 Windsurf 的 HTTPS 流量
   - 查找发送到 `api.codeium.com` 的请求

3. **联系支持**
   - 如果是企业版或特殊版本
   - 可能需要联系管理员或官方支持

## 📞 需要帮助？

如果按照以上步骤仍然无法获取 API Key，请提供以下信息：

1. Windsurf 版本号
2. 是否能看到菜单栏
3. 菜单中是否有 `Help` 或 `View` 选项
4. 尝试了哪些快捷键

我可以提供更具体的帮助。
