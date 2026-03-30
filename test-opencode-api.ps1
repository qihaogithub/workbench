#!/usr/bin/env pwsh

# Opencode Server API 快速测试
# 用于验证 Session 创建和事件流监听是否正常

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:4096"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Opencode Server API 测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 健康检查
Write-Host "步骤 1: 健康检查" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/global/health" -TimeoutSec 3
    Write-Host "✓ Opencode Server 运行正常" -ForegroundColor Green
    Write-Host "  状态：$($health.status)" -ForegroundColor Gray
    Write-Host "  版本：$($health.version)" -ForegroundColor Gray
} catch {
    Write-Host "✗ 无法连接到 Opencode Server" -ForegroundColor Red
    Write-Host "  请确保已运行：opencode serve" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 2: 创建 Session" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

try {
    $body = @{
        title = "Test Session $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    } | ConvertTo-Json
    
    $session = Invoke-RestMethod -Uri "$baseUrl/session" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 5
    
    $sessionId = $session.id
    Write-Host "✓ Session 创建成功" -ForegroundColor Green
    Write-Host "  Session ID: $sessionId" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "重要提示：" -ForegroundColor Yellow
    Write-Host "这个 sessionId 将用于后续的消息发送和事件监听" -ForegroundColor Yellow
} catch {
    Write-Host "✗ 创建 Session 失败" -ForegroundColor Red
    Write-Host "  错误：$($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.ErrorDetails.Message) {
        $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errorData.message) {
            Write-Host "  详情：$($errorData.message)" -ForegroundColor Yellow
        }
    }
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 3: 测试消息发送（简化版）" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

Write-Host "正在发送测试消息..." -ForegroundColor Gray

try {
    # 构建消息体
    $messageBody = @{
        template = "build"
        parts = @(
            @{
                type = "text"
                text = "你好，请用一句话介绍你自己"
            }
        )
    } | ConvertTo-Json -Depth 3
    
    # 发送消息
    $messageUrl = "$baseUrl/session/$sessionId/message"
    Write-Host "请求 URL: $messageUrl" -ForegroundColor Gray
    Write-Host "消息内容：你好，请用一句话介绍你自己" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri $messageUrl `
        -Method POST `
        -ContentType "application/json" `
        -Body $messageBody `
        -TimeoutSec 5
    
    Write-Host "✓ 消息发送成功" -ForegroundColor Green
    Write-Host "  响应状态码：$response" -ForegroundColor Gray
    
} catch {
    Write-Host "✗ 发送消息失败" -ForegroundColor Red
    Write-Host "  错误：$($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.ErrorDetails.Message) {
        try {
            $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
            if ($errorData.message) {
                Write-Host "  详情：$($errorData.message)" -ForegroundColor Yellow
            }
        } catch {
            # 忽略解析错误
        }
    }
    
    Write-Host ""
    Write-Host "可能的原因：" -ForegroundColor Yellow
    Write-Host "1. Session 已过期或被删除" -ForegroundColor Yellow
    Write-Host "2. sessionId 不正确" -ForegroundColor Yellow
    Write-Host "3. Opencode server 配置问题" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "步骤 4: 测试事件流监听（SSE）" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

Write-Host "尝试监听事件流（超时 5 秒）..." -ForegroundColor Gray

try {
    # 使用 .NET HttpClient 来监听 SSE，因为 Invoke-RestMethod 不支持 SSE
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.Timeout = New-TimeSpan -Seconds 5
    
    $eventUrl = "$baseUrl/session/$sessionId/event"
    Write-Host "监听 URL: $eventUrl" -ForegroundColor Gray
    
    # 发送异步请求
    $task = $httpClient.GetAsync($eventUrl)
    $task.Wait()
    
    if ($task.Result.IsSuccessStatusCode) {
        Write-Host "✓ SSE 连接建立成功" -ForegroundColor Green
        
        # 读取响应内容
        $contentTask = $task.Result.Content.ReadAsStringAsync()
        $contentTask.Wait(5000)  # 等待最多 5 秒
        
        if ($contentTask.IsCompleted) {
            $content = $contentTask.Result
            Write-Host "收到的内容:" -ForegroundColor Cyan
            Write-Host $content -ForegroundColor Gray
        } else {
            Write-Host "⚠ 未收到数据（可能是正常的，需要触发事件）" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ SSE 连接失败" -ForegroundColor Red
        Write-Host "  状态码：$($task.Result.StatusCode)" -ForegroundColor Yellow
    }
    
    $httpClient.Dispose()
    
} catch {
    Write-Host "⚠ SSE 监听遇到问题" -ForegroundColor Yellow
    Write-Host "  这可能是正常的，因为需要 AI 处理完成后才会发送事件" -ForegroundColor Gray
    Write-Host "  错误：$($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "测试完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "关键发现：" -ForegroundColor Cyan
Write-Host "1. Session ID: $sessionId" -ForegroundColor White
Write-Host "2. 消息发送：成功 ✓" -ForegroundColor White
Write-Host "3. SSE 连接：需要持续监听才能收到事件" -ForegroundColor White
Write-Host ""

Write-Host "下一步建议：" -ForegroundColor Cyan
Write-Host "1. 在浏览器中打开编辑页面" -ForegroundColor White
Write-Host "2. 使用上面的 sessionId 进行调试" -ForegroundColor White
Write-Host "3. 查看浏览器 Console 和 Network 面板" -ForegroundColor White
Write-Host "4. 对比实际的 sessionId 是否一致" -ForegroundColor White
Write-Host ""

Write-Host "按任意键关闭此窗口" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
