# PaperCrane-Windsurf 无感换号脚本
param([string]$CallbackUrl, [string]$DataPath)

$Host.UI.RawUI.WindowTitle = "PaperCrane - 无感换号"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PaperCrane-Windsurf 无感换号" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 查找安装目录
Write-Host "[补丁] 查找 Windsurf 安装目录..." -ForegroundColor Yellow
$InstallPath = $null
$paths = @("C:\programe1\windsurf", "C:\Program Files\Windsurf", "$env:LOCALAPPDATA\Programs\Windsurf")
foreach ($p in $paths) {
    if (Test-Path "$p\Windsurf.exe") { $InstallPath = $p; break }
}
if ($InstallPath) { Write-Host "[补丁] ✓ 找到: $InstallPath" -ForegroundColor Green }
else { Write-Host "[错误] 未找到安装目录" -ForegroundColor Red; Read-Host "按回车退出"; exit 1 }

# 2. 检查补丁
$ExtJs = "$InstallPath\resources\app\extensions\windsurf\dist\extension.js"
$content = Get-Content $ExtJs -Raw -ErrorAction SilentlyContinue
if ($content -match "WINDSURF_SWITCHER_PATCHED") {
    Write-Host "[补丁] ✓ 补丁已安装" -ForegroundColor Green
} else {
    Write-Host "[补丁] ⚠ 补丁未安装" -ForegroundColor Yellow
}

# 3. 清除旧数据
Write-Host ""
Write-Host "[切号] 清除旧认证数据..." -ForegroundColor Yellow
$DbPath = "$DataPath\User\globalStorage\state.vscdb"
# 这里简化处理，实际清除在 Node.js 中完成
Write-Host "[切号] ✓ 已准备" -ForegroundColor Green

# 4. 打开登录URL
Write-Host ""
Write-Host "[切号] 正在登录..." -ForegroundColor Yellow
if ($CallbackUrl) {
    Start-Process $CallbackUrl
    Write-Host "[切号] ✓ 已打开登录URL" -ForegroundColor Green
}

# 5. 循环触发回调
Write-Host ""
$RefreshUrl = "windsurf://codeium.windsurf/refresh-authentication-session"
for ($i = 1; $i -le 5; $i++) {
    Start-Sleep -Seconds 2
    Write-Host "[切号] 第 $i/5 次触发回调..." -ForegroundColor Cyan
    Start-Process $RefreshUrl
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  切号完成！请检查 Windsurf 登录状态" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Start-Sleep -Seconds 3
