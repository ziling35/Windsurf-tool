# Docker 镜像加速配置

## Windows Docker Desktop 配置步骤

1. 打开 Docker Desktop
2. 点击右上角的设置图标 (齿轮)
3. 选择 "Docker Engine"
4. 在 JSON 配置中添加以下内容:

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

5. 点击 "Apply & Restart"
6. 等待 Docker 重启完成

## 验证配置

重启后运行:
```bash
docker info
```

查看 "Registry Mirrors" 部分是否包含配置的镜像源。

## 重新尝试构建

配置完成后,重新运行:
```bash
npm run build:mac:docker
```
