# Ask Continue 插件使用指南

## 简介

`ask-continue` 是一个 VSCode/Windsurf 扩展插件，可以让 AI 的单次对话持续进行，**真正实现"问答永不停止"**。

## 工作原理

1. 插件通过 MCP（Model Context Protocol）注册了一个 `ask_continue` 工具
2. 工具描述告诉 AI："当你想结束对话时，必须调用此工具"
3. AI 完成任务后会主动调用这个工具
4. 工具弹出对话框询问用户是否继续
5. 如果用户选择继续，AI 会在**同一对话上下文中继续生成**，不开启新对话

## 安装步骤

### 1. 安装插件

```bash
# 方法一：直接安装 VSIX 文件
# 打开 Windsurf，按 Ctrl+Shift+P，输入 "Install from VSIX"
# 选择 ask-continue-1.5.0.vsix 文件

# 方法二：命令行安装
cd "C:\Users\你的用户名\AppData\Local\Programs\Windsurf\bin"
.\windsurf.cmd --install-extension "d:\zmoney\cj\ask-continue-1.5.0.vsix"
```

### 2. 配置 MCP

插件会自动配置 MCP，但你也可以手动检查：

**配置文件位置**：`~/.codeium/windsurf/mcp_config.json`

**配置内容**：
```json
{
  "mcpServers": {
    "ask_continue": {
      "command": "node",
      "args": [
        "C:\\Users\\你的用户名\\.vscode\\extensions\\ask-continue-1.5.0\\mcp-server.js"
      ]
    }
  }
}
```

### 3. 重启 Windsurf

安装完成后重启 Windsurf，插件会自动启动。

## 使用方法

### 基本使用

1. 正常使用 Windsurf 的 Cascade 功能提问
2. 当 AI 完成任务准备结束时，会自动弹出对话框
3. 对话框会显示 AI 想要结束的原因
4. 你可以选择：
   - **继续执行**：输入新的指令（可选），AI 会继续工作
   - **结束对话**：结束本次对话

### 高级功能

- **上传图片**：在对话框中可以上传图片，AI 会分析图片内容
- **工作区隔离**：不同工作区可以使用不同的端口（通过 `.ask_continue_port` 文件）

## 优势

✅ **真正的单次对话持续**：不是发送新消息，而是在同一对话中继续
✅ **不额外消耗 credits**：不会开启新的对话轮次
✅ **自动拦截结束**：AI 主动调用工具，无需手动操作
✅ **支持多平台**：Windows、Linux、macOS 都支持

## 与"无限续杯"的区别

| 功能 | Ask Continue 插件 | 无限续杯（已实现） |
|------|------------------|------------------|
| **原理** | 在 AI 准备结束时拦截，同一对话继续 | credits 用完后自动换号 |
| **是否消耗新 credits** | ❌ 不消耗（同一对话） | ✅ 消耗（换号后新对话） |
| **是否需要重启 Windsurf** | ❌ 不需要 | ✅ 需要（换号时） |
| **适用场景** | 单次对话需要长时间生成 | credits 彻底用完 |

## 最佳实践

**推荐组合使用**：
1. 使用 `ask-continue` 插件让单次对话持续进行
2. 当 credits 真的用完时，使用"无限续杯"自动换号
3. 两者结合，实现真正的"永不停止"

## 故障排除

### Windows: 对话框不显示

确保已安装 Node.js：
```bash
node --version
```

如果未安装，下载并安装：https://nodejs.org/

### Linux: 对话框不显示

安装 zenity：
```bash
# Ubuntu/Debian
sudo apt-get install zenity

# CentOS/RHEL
sudo yum install zenity
```

## 注意事项

1. **首次使用**：第一次弹出对话框可能需要几秒钟，请耐心等待
2. **端口冲突**：默认使用 3456 端口，如果冲突可以在设置中修改
3. **工作区隔离**：多个 Windsurf 窗口时，确保配置了正确的端口

## 总结

`ask-continue` 插件真正实现了你最初的需求："**让 Windsurf 的单次回答永不停止**"。

它通过 MCP 机制在 AI 准备结束时拦截，让 AI 在同一对话中继续生成，而不是开启新对话。这样就不会额外消耗 credits，真正做到"榨干每一点积分"！
