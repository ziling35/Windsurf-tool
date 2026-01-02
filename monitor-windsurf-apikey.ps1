# Windsurf API Key 监控脚本
# 通过监控网络流量获取 API Key

Write-Host "🚀 Windsurf API Key 监控工具" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host ""

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  警告：未以管理员权限运行" -ForegroundColor Yellow
    Write-Host "   某些功能可能受限，建议以管理员身份运行此脚本" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "📋 使用说明：" -ForegroundColor Green
Write-Host "1. 保持此窗口打开" -ForegroundColor White
Write-Host "2. 在 Windsurf 中使用 Cascade 发送任意问题" -ForegroundColor White
Write-Host "3. 脚本会自动捕获并显示 API Key" -ForegroundColor White
Write-Host "4. 按 Ctrl+C 停止监控" -ForegroundColor White
Write-Host ""
Write-Host "🔍 开始监控..." -ForegroundColor Cyan
Write-Host ""

# 方法 1：检查 Windsurf 进程的命令行参数和环境变量
function Get-WindsurfProcessInfo {
    Write-Host "📊 检查 Windsurf 进程信息..." -ForegroundColor Yellow
    
    $processes = Get-Process -Name "Windsurf" -ErrorAction SilentlyContinue
    
    if ($processes) {
        foreach ($proc in $processes) {
            Write-Host "  进程 ID: $($proc.Id)" -ForegroundColor Gray
            
            # 尝试获取进程的环境变量
            try {
                $wmi = Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)"
                if ($wmi) {
                    $cmdLine = $wmi.CommandLine
                    if ($cmdLine -match "sk-ws-\d+-[A-Za-z0-9_-]+") {
                        Write-Host "  ✅ 在命令行中找到 API Key!" -ForegroundColor Green
                        Write-Host "  🔑 $($matches[0])" -ForegroundColor Cyan
                        return $matches[0]
                    }
                }
            } catch {
                Write-Host "  ⚠️  无法读取进程信息（需要管理员权限）" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  ⚠️  Windsurf 未运行" -ForegroundColor Yellow
    }
    
    return $null
}

# 方法 2：监控网络连接
function Monitor-NetworkConnections {
    Write-Host "🌐 监控网络连接..." -ForegroundColor Yellow
    Write-Host "   提示：在 Windsurf 中发送一个 AI 请求..." -ForegroundColor Gray
    Write-Host ""
    
    $foundKey = $null
    $startTime = Get-Date
    $timeout = 300 # 5分钟超时
    
    while (-not $foundKey -and ((Get-Date) - $startTime).TotalSeconds -lt $timeout) {
        # 获取 Windsurf 进程的网络连接
        $connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | 
            Where-Object { 
                $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
                $proc -and $proc.ProcessName -eq "Windsurf"
            }
        
        if ($connections) {
            foreach ($conn in $connections) {
                $remoteAddress = $conn.RemoteAddress
                $remotePort = $conn.RemotePort
                
                # 检查是否连接到 Codeium API
                if ($remoteAddress -match "codeium|windsurf" -or $remotePort -eq 443) {
                    Write-Host "  📡 检测到连接: $remoteAddress`:$remotePort" -ForegroundColor Gray
                }
            }
        }
        
        Start-Sleep -Milliseconds 500
    }
}

# 方法 3：读取 Windsurf 的日志文件
function Search-WindsurfLogs {
    Write-Host "📄 搜索 Windsurf 日志文件..." -ForegroundColor Yellow
    
    $logPaths = @(
        "$env:APPDATA\Windsurf\logs",
        "$env:USERPROFILE\.codeium\logs",
        "$env:LOCALAPPDATA\Windsurf\logs"
    )
    
    foreach ($logPath in $logPaths) {
        if (Test-Path $logPath) {
            Write-Host "  检查: $logPath" -ForegroundColor Gray
            
            # 获取最近的日志文件
            $logFiles = Get-ChildItem -Path $logPath -Filter "*.log" -Recurse -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 10
            
            foreach ($file in $logFiles) {
                try {
                    $content = Get-Content -Path $file.FullName -Tail 1000 -ErrorAction SilentlyContinue
                    
                    foreach ($line in $content) {
                        if ($line -match "sk-ws-\d+-[A-Za-z0-9_-]+") {
                            Write-Host "  ✅ 在日志中找到 API Key!" -ForegroundColor Green
                            Write-Host "  📁 文件: $($file.Name)" -ForegroundColor Gray
                            Write-Host "  🔑 $($matches[0])" -ForegroundColor Cyan
                            return $matches[0]
                        }
                        
                        # 也查找 Authorization 头
                        if ($line -match 'Authorization.*Bearer\s+(sk-ws-[^\s"'']+)') {
                            Write-Host "  ✅ 在日志中找到 API Key!" -ForegroundColor Green
                            Write-Host "  📁 文件: $($file.Name)" -ForegroundColor Gray
                            Write-Host "  🔑 $($matches[1])" -ForegroundColor Cyan
                            return $matches[1]
                        }
                    }
                } catch {
                    # 忽略无法读取的文件
                }
            }
        }
    }
    
    Write-Host "  ⚠️  未在日志中找到 API Key" -ForegroundColor Yellow
    return $null
}

# 方法 4：检查临时文件和缓存
function Search-TempFiles {
    Write-Host "🗂️  搜索临时文件和缓存..." -ForegroundColor Yellow
    
    $tempPaths = @(
        "$env:TEMP",
        "$env:APPDATA\Windsurf\Cache",
        "$env:APPDATA\Windsurf\GPUCache",
        "$env:LOCALAPPDATA\Windsurf\Cache"
    )
    
    foreach ($tempPath in $tempPaths) {
        if (Test-Path $tempPath) {
            # 搜索最近修改的文件
            $files = Get-ChildItem -Path $tempPath -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-1) } |
                Where-Object { $_.Length -lt 10MB } |
                Select-Object -First 20
            
            foreach ($file in $files) {
                try {
                    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                    
                    if ($content -match "sk-ws-\d+-[A-Za-z0-9_-]+") {
                        Write-Host "  ✅ 在缓存文件中找到 API Key!" -ForegroundColor Green
                        Write-Host "  📁 文件: $($file.Name)" -ForegroundColor Gray
                        Write-Host "  🔑 $($matches[0])" -ForegroundColor Cyan
                        return $matches[0]
                    }
                } catch {
                    # 忽略二进制文件或无法读取的文件
                }
            }
        }
    }
    
    Write-Host "  ⚠️  未在临时文件中找到 API Key" -ForegroundColor Yellow
    return $null
}

# 执行所有方法
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host ""

$apiKey = $null

# 1. 检查进程信息
$apiKey = Get-WindsurfProcessInfo
if ($apiKey) {
    Write-Host ""
    Write-Host "🎉 成功找到 API Key!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔑 API Key: $apiKey" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host ""

# 2. 搜索日志文件
$apiKey = Search-WindsurfLogs
if ($apiKey) {
    Write-Host ""
    Write-Host "🎉 成功找到 API Key!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔑 API Key: $apiKey" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host ""

# 3. 搜索临时文件
$apiKey = Search-TempFiles
if ($apiKey) {
    Write-Host ""
    Write-Host "🎉 成功找到 API Key!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔑 API Key: $apiKey" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host ""
Write-Host "❌ 未能自动找到 API Key" -ForegroundColor Red
Write-Host ""
Write-Host "💡 建议：" -ForegroundColor Yellow
Write-Host "1. 确保 Windsurf 正在运行并已登录" -ForegroundColor White
Write-Host "2. 在 Windsurf 中使用 Cascade 发送一个 AI 请求" -ForegroundColor White
Write-Host "3. 重新运行此脚本" -ForegroundColor White
Write-Host "4. 或者尝试以管理员身份运行此脚本" -ForegroundColor White
Write-Host ""
Write-Host "🔧 手动方法：" -ForegroundColor Yellow
Write-Host "   使用菜单打开开发者工具：Help -> Toggle Developer Tools" -ForegroundColor White
Write-Host "   然后在 Network 标签中查看 API 请求" -ForegroundColor White
Write-Host ""
