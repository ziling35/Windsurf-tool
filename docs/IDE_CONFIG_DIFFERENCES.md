# Windsurf 和 Kiro 配置差异说明

## 概述

本文档说明 Windsurf 和 Kiro 两个 IDE 在插件配置上的差异，以及后端需要支持的配置项。

## 配置差异对比

| 配置项 | Windsurf | Kiro |
|--------|----------|------|
| **MCP 配置路径** | `~/.codeium/windsurf/mcp_config.json` | `~/.kiro/settings/mcp.json` |
| **扩展目录** | `~/.windsurf/extensions` | `~/.kiro/extensions` |
| **用户数据目录** | `~/.windsurf-server/data/User` | `~/.kiro/settings` |
| **缓存目录** | `~/.windsurf-server/data/CachedExtensionVSIXs` | `~/.kiro/CachedExtensionVSIXs` (待确认) |

## MCP 配置格式差异

### Windsurf MCP 配置
```json
{
  "mcpServers": {
    "ask_continue": {
      "command": "node",
      "args": ["/path/to/mcpServerStandalone.js"],
      "disabled": false
    }
  }
}
```

### Kiro MCP 配置
```json
{
  "mcpServers": {
    "ask_continue": {
      "command": "node",
      "args": ["/path/to/mcpServerStandalone.js"],
      "disabled": false,
      "autoApprove": ["ask_continue"]
    }
  }
}
```

**关键差异：** Kiro 需要 `autoApprove` 配置来自动批准 MCP 工具调用，否则每次调用都需要用户手动确认。

## 后端接口建议

### 0. 获取插件列表接口（已添加客户端支持）

**接口路径：** `GET /api/client/plugin/list`

**响应示例（完整版）：**
```json
{
  "success": true,
  "plugins": [
    {
      "name": "windsurf-continue-pro",
      "display_name": "Windsurf Continue Pro",
      "description": "专属定制版 - 与卡密系统完全打通",
      "ide_type": "windsurf",
      "latest_version": "1.0.0",
      "download_url": "https://example.com/plugins/windsurf-continue-pro-1.0.0.vsix",
      "icon": "shield-check",
      "icon_gradient": ["#667eea", "#764ba2"],
      "features": [
        {
          "title": "与卡密完全打通",
          "description": "自动使用当前激活的卡密"
        },
        {
          "title": "安全验证",
          "description": "定期检查卡密有效性，到期自动停止"
        },
        {
          "title": "AI 持续对话",
          "description": "在同一对话中继续，不消耗新 credits"
        },
        {
          "title": "专业界面",
          "description": "Windows 原生 GUI 对话框"
        }
      ],
      "usage_steps": [
        {
          "step": 1,
          "title": "一键安装",
          "description": "点击"一键安装"按钮，自动完成安装、激活、配置 MCP、安装规则并重启 Windsurf"
        },
        {
          "step": 2,
          "title": "开始使用",
          "description": "在 Windsurf 中正常使用 Cascade，AI 结束时会自动弹出对话框"
        }
      ],
      "tips": [
        {
          "type": "success",
          "title": "激活码自动同步",
          "content": "客户端和插件共享激活码，一次激活全部搞定！插件启动时会自动读取客户端的激活状态，无需重复输入卡密。"
        },
        {
          "type": "warning",
          "title": "工作原理",
          "content": "插件通过 MCP 机制拦截 AI 的结束行为，让 AI 在同一对话中继续，不会消耗额外的 credits。这才是真正的"永不停止"！"
        }
      ],
      "mcp_config": {
        "config_path": "~/.codeium/windsurf/mcp_config.json",
        "extensions_path": "~/.windsurf/extensions",
        "extra_config": {}
      },
      "is_primary": true
    },
    {
      "name": "kiro-continue-pro",
      "display_name": "Kiro Continue Pro",
      "description": "Kiro IDE 专属版本 - 支持自动批准",
      "ide_type": "kiro",
      "latest_version": "1.0.0",
      "download_url": "https://example.com/plugins/kiro-continue-pro-1.0.0.vsix",
      "icon": "sparkles",
      "icon_gradient": ["#8b5cf6", "#6366f1"],
      "features": [
        {
          "title": "与卡密完全打通",
          "description": "自动使用当前激活的卡密"
        },
        {
          "title": "自动批准 MCP 调用",
          "description": "无需手动确认，自动批准工具调用"
        },
        {
          "title": "AI 持续对话",
          "description": "在同一对话中继续，不消耗新 credits"
        }
      ],
      "usage_steps": [
        {
          "step": 1,
          "title": "安装到 Kiro",
          "description": "点击"安装到 Kiro"按钮安装插件"
        },
        {
          "step": 2,
          "title": "配置 MCP",
          "description": "点击"配置 Kiro MCP"按钮完成配置"
        },
        {
          "step": 3,
          "title": "重启 Kiro",
          "description": "重启 Kiro IDE 使配置生效"
        }
      ],
      "tips": [],
      "mcp_config": {
        "config_path": "~/.kiro/settings/mcp.json",
        "extensions_path": "~/.kiro/extensions",
        "extra_config": {
          "autoApprove": ["ask_continue"]
        }
      },
      "is_primary": false
    }
  ]
}
```

**客户端已添加支持：**
- `KeyManager.getPluginList()` - 获取插件列表
- `ipcMain.handle('get-plugin-list')` - IPC 处理器
- `window.electronAPI.getPluginList()` - 渲染进程 API

### 客户端当前硬编码的展示信息（需要从后端获取）

以下信息目前在客户端 HTML 中硬编码，建议后端接口返回：

| 字段 | 当前硬编码值 | 说明 |
|------|-------------|------|
| `display_name` | Windsurf Continue Pro | 插件显示名称 |
| `description` | 专属定制版 - 与卡密系统完全打通 | 插件描述 |
| `icon` | shield-check | Lucide 图标名称 |
| `icon_gradient` | #667eea → #764ba2 | 图标背景渐变色 |
| `features` | 4条功能介绍 | 功能列表 |
| `usage_steps` | 使用说明 | 使用步骤 |
| `tips` | 激活码自动同步、工作原理 | 提示信息 |

**Kiro 插件信息（也需要后端返回）：**

| 字段 | 建议值 | 说明 |
|------|--------|------|
| `display_name` | Kiro Continue Pro | 插件显示名称 |
| `description` | Kiro IDE 专属版本 | 插件描述 |
| `icon` | sparkles | Lucide 图标名称 |
| `icon_gradient` | #8b5cf6 → #6366f1 | 图标背景渐变色 |
| `ide_type` | kiro | IDE 类型 |
| `mcp_config.config_path` | ~/.kiro/settings/mcp.json | MCP 配置路径 |
| `mcp_config.extra_config` | { autoApprove: [...] } | 额外配置 |

### 1. 获取 IDE 配置信息接口

**接口路径：** `GET /api/client/ide/config`

**请求参数：**
```json
{
  "ide_type": "windsurf" | "kiro",
  "client_version": "1.0.0"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "ide_type": "kiro",
    "mcp_config_path": "~/.kiro/settings/mcp.json",
    "extensions_path": "~/.kiro/extensions",
    "mcp_config_template": {
      "command": "node",
      "args": ["${mcp_server_path}"],
      "disabled": false,
      "autoApprove": ["ask_continue"]
    },
    "plugin_info": {
      "name": "windsurf-continue-pro",
      "latest_version": "1.0.0",
      "download_url": "https://..."
    }
  }
}
```

### 2. 获取插件信息接口（扩展）

现有的 `/api/client/plugin/check-update` 接口可以扩展支持 IDE 类型：

**请求参数：**
```json
{
  "plugin_name": "windsurf-continue-pro",
  "client_version": "1.0.0",
  "ide_type": "kiro"  // 新增参数
}
```

**响应扩展：**
```json
{
  "has_update": true,
  "latest_version": "1.0.1",
  "download_url": "https://...",
  "update_title": "新版本发布",
  "update_description": "...",
  "is_force_update": false,
  "ide_config": {  // 新增字段
    "mcp_config_path": "~/.kiro/settings/mcp.json",
    "mcp_extra_config": {
      "autoApprove": ["ask_continue"]
    }
  }
}
```

## 客户端当前实现

客户端目前硬编码了 Kiro 的配置路径和额外配置项：

```javascript
// Kiro MCP 配置
mcpConfig.mcpServers.ask_continue = {
  command: 'node',
  args: [mcpServerPath],
  disabled: false,
  autoApprove: ['ask_continue']  // Kiro 特有
};
```

## 建议的后端数据库表结构

### 插件表 (plugins)

```sql
CREATE TABLE plugins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,  -- 'windsurf-continue-pro', 'kiro-continue-pro'
  display_name VARCHAR(100) NOT NULL,  -- '显示名称'
  description TEXT,  -- 插件描述
  ide_type VARCHAR(50) NOT NULL,  -- 'windsurf', 'kiro', 'cursor' 等
  latest_version VARCHAR(20) NOT NULL,  -- '1.0.0'
  download_url VARCHAR(500),  -- 下载地址
  icon VARCHAR(50),  -- Lucide 图标名称 'shield-check', 'sparkles'
  icon_gradient JSON,  -- 图标渐变色 ["#667eea", "#764ba2"]
  features JSON,  -- 功能列表
  usage_steps JSON,  -- 使用步骤
  tips JSON,  -- 提示信息
  mcp_config_path VARCHAR(255),  -- MCP 配置路径
  extensions_path VARCHAR(255),  -- 扩展目录路径
  mcp_extra_config JSON,  -- IDE 特有的 MCP 配置项
  is_primary BOOLEAN DEFAULT FALSE,  -- 是否为主插件
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,  -- 排序
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 示例数据
INSERT INTO plugins (
  name, display_name, description, ide_type, latest_version, download_url,
  icon, icon_gradient, features, usage_steps, tips,
  mcp_config_path, extensions_path, mcp_extra_config, is_primary, sort_order
) VALUES
(
  'windsurf-continue-pro',
  'Windsurf Continue Pro',
  '专属定制版 - 与卡密系统完全打通',
  'windsurf',
  '1.0.0',
  'https://example.com/plugins/windsurf-continue-pro-1.0.0.vsix',
  'shield-check',
  '["#667eea", "#764ba2"]',
  '[{"title": "与卡密完全打通", "description": "自动使用当前激活的卡密"}, {"title": "安全验证", "description": "定期检查卡密有效性，到期自动停止"}, {"title": "AI 持续对话", "description": "在同一对话中继续，不消耗新 credits"}, {"title": "专业界面", "description": "Windows 原生 GUI 对话框"}]',
  '[{"step": 1, "title": "一键安装", "description": "点击一键安装按钮，自动完成安装、激活、配置 MCP、安装规则并重启 Windsurf"}, {"step": 2, "title": "开始使用", "description": "在 Windsurf 中正常使用 Cascade，AI 结束时会自动弹出对话框"}]',
  '[{"type": "success", "title": "激活码自动同步", "content": "客户端和插件共享激活码，一次激活全部搞定！"}, {"type": "warning", "title": "工作原理", "content": "插件通过 MCP 机制拦截 AI 的结束行为，让 AI 在同一对话中继续。"}]',
  '~/.codeium/windsurf/mcp_config.json',
  '~/.windsurf/extensions',
  '{}',
  TRUE,
  1
),
(
  'kiro-continue-pro',
  'Kiro Continue Pro',
  'Kiro IDE 专属版本 - 支持自动批准',
  'kiro',
  '1.0.0',
  'https://example.com/plugins/kiro-continue-pro-1.0.0.vsix',
  'sparkles',
  '["#8b5cf6", "#6366f1"]',
  '[{"title": "与卡密完全打通", "description": "自动使用当前激活的卡密"}, {"title": "自动批准 MCP 调用", "description": "无需手动确认，自动批准工具调用"}, {"title": "AI 持续对话", "description": "在同一对话中继续，不消耗新 credits"}]',
  '[{"step": 1, "title": "安装到 Kiro", "description": "点击安装到 Kiro按钮安装插件"}, {"step": 2, "title": "配置 MCP", "description": "点击配置 Kiro MCP按钮完成配置"}, {"step": 3, "title": "重启 Kiro", "description": "重启 Kiro IDE 使配置生效"}]',
  '[]',
  '~/.kiro/settings/mcp.json',
  '~/.kiro/extensions',
  '{"autoApprove": ["ask_continue"]}',
  FALSE,
  2
);
```

### 插件版本表 (plugin_versions)

```sql
CREATE TABLE plugin_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plugin_id INT NOT NULL,
  version VARCHAR(20) NOT NULL,
  download_url VARCHAR(500) NOT NULL,
  release_notes TEXT,
  is_force_update BOOLEAN DEFAULT FALSE,
  min_client_version VARCHAR(20),  -- 最低客户端版本要求
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id)
);
```

## 总结

1. **Kiro 在后端没有配置** 是因为目前客户端硬编码了 Kiro 的配置
2. **主要差异** 是 MCP 配置路径和 `autoApprove` 配置项
3. **建议** 后端添加 `/plugin/list` 接口，返回所有插件的完整信息
4. **客户端展示信息** 包括插件名称、描述、图标、功能介绍、使用步骤、提示等，都应从后端获取
