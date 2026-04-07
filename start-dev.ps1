# 启动 Agent 服务和 Web 前端

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  启动 OpenCode Workbench 开发环境" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 启动 Agent 服务 (端口 3101)
Write-Host "[1/2] 启动 Agent 服务..." -ForegroundColor Yellow
$agentProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\packages\agent-service'; pnpm dev" -PassThru
Write-Host "  ✓ Agent 服务已启动 (PID: $($agentProcess.Id))" -ForegroundColor Green
Write-Host "  → http://localhost:3101" -ForegroundColor Gray
Write-Host ""

# 等待 Agent 服务启动
Write-Host "[等待] Agent 服务初始化中..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 启动 Web 前端 (端口 3100)
Write-Host "[2/2] 启动 Web 前端..." -ForegroundColor Yellow
$webProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\packages\web'; pnpm dev" -PassThru
Write-Host "  ✓ Web 前端已启动 (PID: $($webProcess.Id))" -ForegroundColor Green
Write-Host "  → http://localhost:3100" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  所有服务已就绪" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Agent 服务: http://localhost:3101" -ForegroundColor Gray
Write-Host "Web 前端:   http://localhost:3100" -ForegroundColor Gray
Write-Host ""
Write-Host "按 Ctrl+C 可停止所有服务（关闭终端窗口即可）" -ForegroundColor Yellow
Write-Host ""
