#!/usr/bin/env pwsh

# AI 对话功能快速测试脚本
# 使用方法：.\test-ai-chat.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI 对话功能快速测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 .env.local 文件
$envFile = "packages\web\.env.local"
if (Test-Path $envFile) {
    Write-Host "✓ 找到环境配置文件：$envFile" -ForegroundColor Green
    $openCodeUrl = Get-Content $envFile | Select-String "OPENCODE_SERVER_URL" | ForEach-Object { $_.ToString().Split('=')[1] }
    if ($openCodeUrl) {
        Write-Host "  OPENCODE_SERVER_URL = $openCodeUrl" -ForegroundColor Gray
    }
} else {
    Write-Host "✗ 未找到环境配置文件：$envFile" -ForegroundColor Red
    Write-Host "  请创建 $envFile 并配置 OPENCODE_SERVER_URL" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "示例内容：" -ForegroundColor Yellow
    Write-Host "  OPENCODE_SERVER_URL=http://localhost:4096" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 1: 检查 Opencode Server" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "$openCodeUrl/global/health" -TimeoutSec 3 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $data = $response.Content | ConvertFrom-Json
        Write-Host "✓ Opencode Server 运行正常" -ForegroundColor Green
        Write-Host "  状态：$($data.status)" -ForegroundColor Gray
        Write-Host "  版本：$($data.version)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ 无法连接到 Opencode Server" -ForegroundColor Red
    Write-Host "  请确保已运行：opencode serve" -ForegroundColor Yellow
    Write-Host "  地址：$openCodeUrl" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 2: 检查 Next.js 开发服务器" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

$nextUrl = "http://localhost:3000"
try {
    $response = Invoke-WebRequest -Uri "$nextUrl/api/ai/chat" -TimeoutSec 3 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $data = $response.Content | ConvertFrom-Json
        Write-Host "✓ Next.js API 响应正常" -ForegroundColor Green
        
        if ($data.status -eq 'healthy') {
            Write-Host "  状态：Healthy ✓" -ForegroundColor Green
        } else {
            Write-Host "  状态：Unavailable ✗" -ForegroundColor Red
            Write-Host "  请检查 Opencode Server 连接配置" -ForegroundColor Yellow
        }
        
        Write-Host "  Server URL: $data.serverUrl" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ 无法连接到 Next.js 服务器" -ForegroundColor Red
    Write-Host "  请确保已运行：pnpm dev" -ForegroundColor Yellow
    Write-Host "  地址：$nextUrl" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 3: 测试 AI 对话 API" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

Write-Host "正在发送测试消息..." -ForegroundColor Gray

try {
    $body = @{
        messages = @(
            @{
                role = "user"
                content = "你好，请用一句话介绍你自己"
            }
        )
        demoId = "test-demo"
    } | ConvertTo-Json -Depth 3
    
    $response = Invoke-WebRequest -Uri "$nextUrl/api/ai/chat" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    Write-Host "✓ API 请求成功" -ForegroundColor Green
    Write-Host "  状态码：$($response.StatusCode)" -ForegroundColor Gray
    
    # 读取响应流
    $reader = New-Object System.IO.StreamReader($response.BaseResponse.GetResponseStream())
    $content = $reader.ReadToEnd()
    
    if ($content) {
        Write-Host "  收到响应数据" -ForegroundColor Green
        
        # 尝试解析 JSON
        $lines = $content -split "`n"
        foreach ($line in $lines) {
            if ($line.Trim()) {
                try {
                    $data = $line | ConvertFrom-Json
                    if ($data.sessionId) {
                        Write-Host "  Session ID: $($data.sessionId)" -ForegroundColor Cyan
                    }
                    if ($data.delta) {
                        Write-Host "  内容：$($data.delta)" -ForegroundColor Green
                    }
                    if ($data.done) {
                        Write-Host "  ✓ 完成" -ForegroundColor Green
                    }
                    if ($data.error) {
                        Write-Host "  ✗ 错误：$($data.error.message)" -ForegroundColor Red
                    }
                } catch {
                    # 忽略解析错误
                }
            }
        }
    }
} catch {
    Write-Host "✗ API 测试失败" -ForegroundColor Red
    Write-Host "  错误：$($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.ErrorDetails.Message) {
        $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errorData.error) {
            Write-Host "  详情：$($errorData.error.message)" -ForegroundColor Yellow
        }
    }
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "测试完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host "1. 访问 http://localhost:3000 查看 Demo 列表" -ForegroundColor White
Write-Host "2. 进入任意 Demo 的编辑页面" -ForegroundColor White
Write-Host "3. 切换到 'AI 对话' Tab 进行测试" -ForegroundColor White
Write-Host ""
Write-Host "提示：按任意键关闭此窗口" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
