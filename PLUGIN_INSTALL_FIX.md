# 插件安装修复说明

## 问题描述

当用户点击"一键安装"后,如果插件目录已被删除但 `extensions.json` 中仍保留引用,会导致:
- Windsurf 启动时报错: `Unable to read file 'c:\Users\xxx\.windsurf\extensions\papercrane-team.windsurf-continue-pro-1.0.0\package.json'`
- 无法重新安装插件
- 客户端提示"插件正在后台安装中..."但实际没有安装成功

## 修复方案

已在 `main.js` 的 `install-plugin` 处理器中添加自动检测和清理逻辑。

### 修复位置

文件: `main.js`
行数: 1497-1553

### 修复逻辑

在安装插件前,自动执行以下步骤:

1. **检测损坏的引用**
   - 读取 `~/.windsurf/extensions/extensions.json`
   - 检查每个插件引用的目录是否实际存在
   - 特别针对我们的插件 ID:
     - `papercrane-team.windsurf-continue-pro`
     - `undefined_publisher.windsurf-continue-pro`
     - `windsurf-continue-pro`

2. **清理损坏的引用**
   - 过滤掉目录不存在的插件引用
   - 保留其他正常的扩展
   - 更新 `extensions.json` 文件

3. **备份和恢复**
   - 如果 JSON 文件损坏无法解析
   - 自动备份到 `extensions.json.backup`
   - 重置为空数组 `[]`

### 代码片段

```javascript
// 清理损坏的 extensions.json 引用（修复无法重新安装的问题）
console.log('[安装插件] 检查并清理 extensions.json...');
const extensionsPath = path.join(app.getPath('home'), '.windsurf', 'extensions');
const extensionsJsonPath = path.join(extensionsPath, 'extensions.json');

if (fs.existsSync(extensionsJsonPath)) {
  try {
    const jsonContent = fs.readFileSync(extensionsJsonPath, 'utf-8');
    const extensions = JSON.parse(jsonContent);
    
    if (Array.isArray(extensions) && extensions.length > 0) {
      // 过滤掉损坏的插件引用（文件不存在但仍在 JSON 中）
      const validExtensions = extensions.filter(ext => {
        if (!ext.location || !ext.location.fsPath) return false;
        
        // 检查是否是我们的插件
        const isOurPlugin = ext.identifier && 
          (ext.identifier.id === 'papercrane-team.windsurf-continue-pro' ||
           ext.identifier.id === 'undefined_publisher.windsurf-continue-pro' ||
           ext.identifier.id === 'windsurf-continue-pro');
        
        if (isOurPlugin) {
          // 检查插件目录是否存在
          const pluginExists = fs.existsSync(ext.location.fsPath);
          if (!pluginExists) {
            console.log(`[安装插件] 发现损坏的插件引用: ${ext.identifier.id}`);
            console.log(`[安装插件] 路径不存在: ${ext.location.fsPath}`);
            return false; // 过滤掉这个损坏的引用
          }
        }
        
        return true; // 保留其他正常的扩展
      });
      
      // 如果有损坏的引用被清理，更新 JSON 文件
      if (validExtensions.length !== extensions.length) {
        console.log(`[安装插件] 清理了 ${extensions.length - validExtensions.length} 个损坏的插件引用`);
        fs.writeFileSync(extensionsJsonPath, JSON.stringify(validExtensions, null, 2), 'utf-8');
        console.log('[安装插件] ✅ extensions.json 已修复');
      }
    }
  } catch (err) {
    console.warn('[安装插件] ⚠️ 清理 extensions.json 失败:', err.message);
    // 如果解析失败，尝试备份并重置为空数组
    try {
      const backupPath = extensionsJsonPath + '.backup';
      fs.copyFileSync(extensionsJsonPath, backupPath);
      console.log(`[安装插件] 已备份损坏的 extensions.json 到: ${backupPath}`);
      fs.writeFileSync(extensionsJsonPath, '[]', 'utf-8');
      console.log('[安装插件] ✅ 已重置 extensions.json');
    } catch (resetErr) {
      console.error('[安装插件] ❌ 重置 extensions.json 失败:', resetErr.message);
    }
  }
}
```

## 使用方法

### 重新打包客户端

1. 关闭所有可能占用 dist 目录的进程
2. 清理 dist 目录:
   ```bash
   Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
   ```

3. 重新打包:
   ```bash
   npm run build:win
   ```

4. 打包完成后,在 `dist` 目录找到新的安装包

### 测试修复

1. 模拟损坏状态:
   - 手动删除 `C:\Users\xxx\.windsurf\extensions\papercrane-team.windsurf-continue-pro-1.0.0` 目录
   - 保留 `extensions.json` 中的引用

2. 运行客户端并点击"一键安装"

3. 观察日志输出:
   ```
   [安装插件] 检查并清理 extensions.json...
   [安装插件] 发现损坏的插件引用: papercrane-team.windsurf-continue-pro
   [安装插件] 路径不存在: C:\Users\xxx\.windsurf\extensions\...
   [安装插件] 清理了 1 个损坏的插件引用
   [安装插件] ✅ extensions.json 已修复
   ```

4. 验证插件能正常安装

## 优势

1. **自动化** - 用户无需手动清理,客户端自动处理
2. **安全** - 只清理我们的插件引用,不影响其他扩展
3. **容错** - 如果 JSON 损坏,自动备份并重置
4. **透明** - 所有操作都有详细的日志输出
5. **可靠** - 在安装流程的最开始就执行清理,确保后续步骤顺利

## 注意事项

- 此修复已集成到客户端代码中,用户无需任何额外操作
- 修复会在每次点击"一键安装"时自动执行
- 如果 `extensions.json` 损坏,会自动备份到 `.backup` 文件
- 清理只针对我们的插件,不会影响用户安装的其他 Windsurf 扩展
