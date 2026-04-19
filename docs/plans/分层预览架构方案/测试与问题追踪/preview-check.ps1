# 预览区检查脚本
# 用于快速诊断分层预览架构中的问题
# 使用方法: .\preview-check.ps1 [demoId]

param(
    [string]$demoId = "proj_1776526720347",
    [string]$baseUrl = "http://localhost:3200",
    [string]$username = "qihao",
    [string]$password = "130015"
)

$ErrorActionPreference = "Stop"

Write-Host "=== 分层预览架构问题诊断脚本 ===" -ForegroundColor Cyan
Write-Host "目标Demo: $demoId" -ForegroundColor Gray
Write-Host ""

# 检查 playwright-cli 是否可用
$playwrightCli = Get-Command playwright-cli -ErrorAction SilentlyContinue
if (-not $playwrightCli) {
    Write-Host "错误: playwright-cli 未找到，请先安装" -ForegroundColor Red
    Write-Host "安装命令: npm install -g @playwright/cli" -ForegroundColor Yellow
    exit 1
}

Write-Host "步骤 1/6: 启动浏览器并访问编辑页..." -ForegroundColor Green
$url = "$baseUrl/demo/$demoId/edit"
playwright-cli open $url
Start-Sleep -Seconds 2

Write-Host "步骤 2/6: 检查是否需要登录..." -ForegroundColor Green
$currentUrl = playwright-cli --raw eval "window.location.href"
if ($currentUrl -like "*/login*") {
    Write-Host "  检测到登录页，执行登录..." -ForegroundColor Yellow
    playwright-cli snapshot
    # 获取用户名输入框并填写
    $snapshot = playwright-cli --raw snapshot
    if ($snapshot -match 'ref=e(\d+).*username|用户名') {
        $usernameRef = "e$($matches[1])"
        playwright-cli fill $usernameRef $username
    }
    # 获取密码输入框并填写
    if ($snapshot -match 'ref=e(\d+).*password|密码') {
        $passwordRef = "e$($matches[1])"
        playwright-cli fill $passwordRef $password
    }
    # 点击登录按钮
    if ($snapshot -match 'ref=e(\d+).*登录|login') {
        $loginRef = "e$($matches[1])"
        playwright-cli click $loginRef
        Start-Sleep -Seconds 3
    }
}

Write-Host "步骤 3/6: 检查 Session 状态..." -ForegroundColor Green
$sessionInfo = playwright-cli --raw eval @"
fetch('/api/sessions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({demoId: '$demoId'})
}).then(r => r.json()).then(d => JSON.stringify({
    success: d.success,
    sessionId: d.data?.sessionId,
    hasCode: !!d.data?.code,
    codeLength: d.data?.code?.length,
    hasSchema: !!d.data?.schema,
    tempWorkspace: d.data?.tempWorkspace
}))
"@
Write-Host "  Session API 响应: $sessionInfo" -ForegroundColor Gray

$sessionData = $sessionInfo | ConvertFrom-Json
if (-not $sessionData.success) {
    Write-Host "错误: Session 创建失败" -ForegroundColor Red
    playwright-cli close
    exit 1
}

$sessionId = $sessionData.sessionId
Write-Host "  Session ID: $sessionId" -ForegroundColor Cyan

Write-Host "步骤 4/6: 检查编译 API..." -ForegroundColor Green
$compileInfo = playwright-cli --raw eval @"
fetch('/api/compile', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sessionId: '$sessionId'})
}).then(r => r.json()).then(d => JSON.stringify({
    success: d.success,
    hasCompiledCode: !!d.data?.compiledCode,
    compiledCodeLength: d.data?.compiledCode?.length,
    dependencies: d.data?.dependencies?.length,
    cssImports: d.data?.cssImports?.length,
    errorCode: d.error?.code,
    errorMessage: d.error?.message
}))
"@
Write-Host "  Compile API 响应: $compileInfo" -ForegroundColor Gray

$compileData = $compileInfo | ConvertFrom-Json
if (-not $compileData.success) {
    Write-Host "错误: 编译失败 - $($compileData.errorCode): $($compileData.errorMessage)" -ForegroundColor Red
    playwright-cli close
    exit 1
}

Write-Host "  编译成功，代码长度: $($compileData.compiledCodeLength)" -ForegroundColor Green

Write-Host "步骤 5/6: 检查 iframe 状态..." -ForegroundColor Green
$iframeInfo = playwright-cli --raw eval @"
const iframe = document.querySelector('iframe');
const root = iframe?.contentDocument?.querySelector('#root');
JSON.stringify({
    iframeExists: !!iframe,
    iframeSrc: iframe?.src?.substring(0, 100),
    iframeSrcdocLength: iframe?.srcdoc?.length,
    rootExists: !!root,
    rootChildrenCount: root?.children?.length || 0,
    rootInnerHTML: root?.innerHTML?.substring(0, 200) || '(empty)',
    iframeReadyState: iframe?.contentDocument?.readyState
})
"@
Write-Host "  Iframe 状态: $iframeInfo" -ForegroundColor Gray

$iframeData = $iframeInfo | ConvertFrom-Json
if (-not $iframeData.iframeExists) {
    Write-Host "错误: iframe 元素不存在" -ForegroundColor Red
    playwright-cli close
    exit 1
}

if ($iframeData.rootChildrenCount -eq 0) {
    Write-Host "警告: #root 元素为空，组件未渲染" -ForegroundColor Yellow
} else {
    Write-Host "成功: #root 有 $($iframeData.rootChildrenCount) 个子元素" -ForegroundColor Green
}

Write-Host "步骤 6/6: 检查控制台错误..." -ForegroundColor Green
$consoleErrors = playwright-cli --raw console 2>&1 | Select-String "ERROR|Error|error" | Select-Object -First 5
if ($consoleErrors) {
    Write-Host "  发现控制台错误:" -ForegroundColor Yellow
    $consoleErrors | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
} else {
    Write-Host "  控制台无错误" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 诊断结果 ===" -ForegroundColor Cyan

if ($compileData.success -and $iframeData.rootChildrenCount -eq 0) {
    Write-Host "问题定位: 编译成功但 iframe 未渲染" -ForegroundColor Yellow
    Write-Host "可能原因:" -ForegroundColor Gray
    Write-Host "  1. postMessage 未正确发送或接收" -ForegroundColor Gray
    Write-Host "  2. iframe 消息处理逻辑异常" -ForegroundColor Gray
    Write-Host "  3. 组件渲染时发生运行时错误" -ForegroundColor Gray
    Write-Host ""
    Write-Host "建议检查:" -ForegroundColor Gray
    Write-Host "  - PreviewPanel 组件中的 sendUpdateCode 调用" -ForegroundColor Gray
    Write-Host "  - iframe-template.ts 中的 UPDATE_CODE 消息处理" -ForegroundColor Gray
    Write-Host "  - iframe 中的 currentComponent 和 renderComponent 状态" -ForegroundColor Gray
} elseif ($compileData.success -and $iframeData.rootChildrenCount -gt 0) {
    Write-Host "状态: 正常，预览区已正确渲染" -ForegroundColor Green
} else {
    Write-Host "状态: 异常，请检查上述错误信息" -ForegroundColor Red
}

Write-Host ""
Write-Host "关闭浏览器..." -ForegroundColor Gray
playwright-cli close

Write-Host "诊断完成" -ForegroundColor Cyan
