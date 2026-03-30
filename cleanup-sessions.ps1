#!/usr/bin/env pwsh

# 清理所有过期的 session 目录
# 用于解决 Session ID 冲突问题

$sessionDir = "sessions"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "清理过期 Session 目录" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $sessionDir)) {
    Write-Host "Session 目录不存在：$sessionDir" -ForegroundColor Yellow
    exit 0
}

# 获取所有 session 子目录
$sessions = Get-ChildItem -Path $sessionDir -Directory

if ($sessions.Count -eq 0) {
    Write-Host "没有找到任何 Session 目录" -ForegroundColor Green
    exit 0
}

Write-Host "找到 $($sessions.Count) 个 Session:" -ForegroundColor Cyan
foreach ($session in $sessions) {
    Write-Host "  - $($session.Name)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "警告：这将删除所有 Session 目录！" -ForegroundColor Red
Write-Host "确定要继续吗？(Y/N)" -ForegroundColor Yellow
$response = Read-Host

if ($response -eq 'Y' -or $response -eq 'y') {
    foreach ($session in $sessions) {
        try {
            Remove-Item -Path $session.FullName -Recurse -Force
            Write-Host "✓ 已删除：$($session.Name)" -ForegroundColor Green
        } catch {
            Write-Host "✗ 删除失败：$($session.Name)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "清理完成！" -ForegroundColor Green
    Write-Host "请刷新浏览器页面重新创建 Session" -ForegroundColor Yellow
} else {
    Write-Host "已取消操作" -ForegroundColor Gray
}

Write-Host ""
Write-Host "按任意键关闭此窗口" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
