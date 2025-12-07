# 跨平台构建指南

## 问题说明

在 Windows 上直接运行 `npm run build:mac` 会报错:
```
⨯ Build for macOS is supported only on macOS
```

这是因为 electron-builder 默认不支持在 Windows 上构建 macOS 包。

## 解决方案

### 方案 1: 使用 GitHub Actions (推荐) ⭐

这是最简单、最可靠的方案,无需本地配置。

**步骤:**

1. 确保代码已推送到 GitHub
2. 创建一个新的 tag 触发构建:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. 或者手动触发工作流:
   - 访问 GitHub 仓库的 Actions 页面
   - 选择 "Build" 工作流
   - 点击 "Run workflow"

4. 等待构建完成后,在 Releases 页面下载所有平台的安装包

**优点:**
- ✅ 无需本地环境配置
- ✅ 自动构建所有平台
- ✅ 自动发布到 Releases
- ✅ 免费(GitHub Actions 提供免费额度)

### 方案 2: 使用 Docker

需要先安装 Docker Desktop for Windows。

**步骤:**

1. 安装 Docker Desktop: https://www.docker.com/products/docker-desktop

2. 配置 Docker 镜像加速(如果下载镜像失败):
   - 打开 Docker Desktop 设置
   - 选择 "Docker Engine"
   - 添加镜像源:
   ```json
   {
     "registry-mirrors": [
       "https://docker.mirrors.ustc.edu.cn",
       "https://hub-mirror.c.163.com"
     ]
   }
   ```

3. 运行构建命令:
   ```bash
   npm run build:mac:docker
   ```

4. 构建完成后,在 `dist` 目录找到:
   - `PaperCrane-Windsurf-x.x.x-mac.zip` - macOS 安装包

**注意:**
- Docker 方式生成 ZIP 格式(不生成 DMG,避免依赖问题)
- 需要下载较大的镜像文件(约 2GB)
- 首次构建需要下载 Electron,会比较慢

### 方案 3: 使用云服务器

租用一台 macOS 云服务器进行构建。

**选项:**
- MacStadium
- AWS EC2 Mac instances
- MacinCloud

**步骤:**
1. 连接到 macOS 服务器
2. 克隆代码仓库
3. 运行 `npm install && npm run build:mac`

**缺点:**
- 💰 需要付费
- ⏱️ 配置复杂

### 方案 4: 借用 macOS 设备

如果有朋友或同事有 Mac 电脑,可以借用构建。

**步骤:**
1. 将代码复制到 Mac 上
2. 安装 Node.js 和依赖
3. 运行 `npm run build:mac`
4. 将生成的文件复制回来

## 当前配置说明

项目已经配置了:

1. **禁用代码签名**
   ```json
   "mac": {
     "identity": null,
     "signIgnore": ".*"
   }
   ```
   这样生成的包可以正常使用,但用户首次打开时需要在"系统偏好设置 > 安全性与隐私"中允许运行。

2. **GitHub Actions 工作流**
   - 位置: `.github/workflows/build.yml`
   - 支持 macOS 和 Windows 自动构建
   - 自动发布到 Releases

## 推荐流程

对于个人开发者,推荐使用 **GitHub Actions**:

1. 在本地开发和测试 Windows 版本
2. 提交代码到 GitHub
3. 创建 tag 触发自动构建
4. 从 Releases 下载所有平台的包

这样可以:
- 节省本地构建时间
- 确保构建环境一致
- 自动化发布流程
- 无需额外成本

## 常见问题

**Q: 为什么不能在 Windows 上直接构建 macOS 包?**  
A: macOS 应用需要特定的文件系统格式(HFS+)和代码签名,这些在 Windows 上无法完成。

**Q: 禁用代码签名安全吗?**  
A: 对于开源项目和内部使用是安全的。用户需要手动允许运行,但不影响功能。如果要发布到 App Store,则必须进行代码签名。

**Q: GitHub Actions 有使用限制吗?**  
A: 公开仓库免费,私有仓库每月有 2000 分钟免费额度,通常足够使用。

**Q: 可以同时构建所有平台吗?**  
A: 可以,GitHub Actions 会并行构建 Windows 和 macOS,大约 5-10 分钟完成。
