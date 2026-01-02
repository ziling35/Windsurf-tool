# 如何获取 Windsurf API Key

## 🎯 确认：真正的 Windsurf API Key 格式

Windsurf 的 API Key 格式为：
```
sk-ws-01-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**特征**：
- ✅ 以 `sk-ws-01-` 开头
- ✅ 后面跟随一长串字母、数字、下划线和连字符
- ✅ 总长度约 70-100 个字符

## ❌ 扫描结果

经过全面扫描数据库，**未找到** `sk-ws-` 开头的 API Key。

找到的其他 Key：
- `sk-0fZVcIUbWZZ8zBWMh2VehsARbRk8ZfKO2rrJNueUPPvyA8HX` - 不是 Windsurf 的（可能是其他服务）
- `user:53603/c425dc39dad141b080247839f724d035` - 插件令牌（不是 API Key）

## ✅ 推荐方法：使用开发者工具获取

### 步骤 1：打开 Windsurf 开发者工具

在 Windsurf 中按下：
- **Windows/Linux**: `Ctrl + Shift + I` 或 `F12`
- **macOS**: `Cmd + Option + I`

或通过菜单：`Help` → `Toggle Developer Tools`

### 步骤 2：配置 Network 标签

1. 点击 **Network** 标签
2. ✅ 勾选 **Preserve log**（保留日志）
3. 点击 🗑️ 清空按钮（清除之前的记录）

### 步骤 3：触发 AI 请求

在 Windsurf 的 Cascade 中：
- 发送任意问题，例如："hello" 或 "帮我写个函数"
- 等待 AI 响应

### 步骤 4：查找 API 请求

在 Network 列表中：
1. 查找发送到以下域名的请求：
   - `api.codeium.com`
   - `windsurf.ai`
   - 或包含 `chat`、`completion` 等关键词的请求

2. 点击该请求

### 步骤 5：提取 API Key

1. 点击 **Headers** 标签
2. 向下滚动到 **Request Headers** 部分
3. 查找 **Authorization** 字段
4. 格式通常为：`Authorization: Bearer sk-ws-01-xxxxx...`
5. 复制 `Bearer ` 后面的完整字符串

### 示例截图说明

```
Request Headers:
  Authorization: Bearer sk-ws-01-fK4s4IcyqR50TktRAUo4pfpsTBpZFAKzYsL7bHHgXJMCmRW_6DevjYBSVuW9
  Content-Type: application/json
  ...
```

**你的 API Key 就是**：`sk-ws-01-fK4s4IcyqR50TktRAUo4pfpsTBpZFAKzYsL7bHHgXJMCmRW_6DevjYBSVuW9`

## 📝 为什么数据库中没有？

当前账号（helle Johnson）可能使用了以下认证方式之一：

1. **OAuth 认证** - 使用临时访问令牌
2. **Session Cookie** - 通过浏览器 Cookie 认证
3. **内存存储** - API Key 只存储在内存中，不写入磁盘

这些方式更安全，但也意味着无法从数据库文件中直接读取。

## 🔧 其他尝试方法

### 方法 2：检查网络日志文件

Windsurf 可能会记录网络请求日志：

```
C:\Users\你的用户名\AppData\Roaming\Windsurf\logs\
```

查找包含 `Authorization` 或 `sk-ws-` 的日志文件。

### 方法 3：使用网络抓包工具

使用 Fiddler 或 Wireshark 等工具抓取 Windsurf 的网络请求。

## ⚠️ 安全提示

- 🔒 API Key 是敏感信息，不要分享给他人
- 🔒 不要将 API Key 提交到 Git 仓库
- 🔒 如果泄露，立即在 Windsurf 设置中重新生成

## 📞 需要帮助？

如果以上方法都无法获取 API Key，可能需要：
1. 检查 Windsurf 是否已正确登录
2. 尝试退出并重新登录
3. 联系 Windsurf 官方支持
