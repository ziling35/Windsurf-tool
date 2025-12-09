# 快速构建 macOS 包

## 最简单的方法: 使用 GitHub Actions

### 步骤 1: 推送代码到 GitHub

```bash
git add .
git commit -m "准备构建 macOS 包"
git push
```

### 步骤 2: 手动触发构建

1. 访问你的 GitHub 仓库
2. 点击顶部的 "Actions" 标签
3. 在左侧选择 "Build" 工作流
4. 点击右侧的 "Run workflow" 按钮
5. 选择分支 (通常是 main 或 master)
6. 点击绿色的 "Run workflow" 按钮

### 步骤 3: 等待构建完成

- 构建通常需要 5-10 分钟
- 可以实时查看构建日志
- 构建完成后会生成 artifacts

### 步骤 4: 下载构建产物

1. 在 Actions 页面找到刚才的构建任务
2. 点击进入详情页
3. 滚动到底部的 "Artifacts" 部分
4. 下载 `macos-latest-build` (包含 .dmg 和 .zip 文件)
5. 下载 `windows-latest-build` (包含 .exe 文件)

## 或者: 创建 Release 自动构建

```bash
# 创建一个新版本标签
git tag v1.0.2
git push origin v1.0.2
```

这样会自动:
1. 触发构建所有平台
2. 创建 GitHub Release
3. 自动上传所有安装包到 Release

然后直接在 Releases 页面下载即可!

## 为什么推荐这个方法?

✅ 无需配置 Docker  
✅ 无需解决网络问题  
✅ 无需本地构建环境  
✅ 自动化且可靠  
✅ 完全免费  
✅ 同时构建所有平台  

## Docker 方式的问题

❌ 需要下载 2GB+ 镜像  
❌ 需要配置镜像加速  
❌ 可能遇到网络问题  
❌ 构建速度较慢  
❌ 占用本地资源  
