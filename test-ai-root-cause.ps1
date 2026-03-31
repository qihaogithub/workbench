$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:4096"
$nextUrl = "http://localhost:3000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI 对话根因定位测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Health check
Write-Host "`n[1] Health check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/global/health" -TimeoutSec 3
    Write-Host "  OK: Opencode Server running, version: $($health.version)" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: Cannot reach opencode server" -ForegroundColor Red
    exit 1
}

# Step 2: Create opencode session
Write-Host "`n[2] Create opencode session" -ForegroundColor Yellow
$ocSession = Invoke-RestMethod -Uri "$baseUrl/session" -Method POST -ContentType "application/json" -Body '{"title":"test"}' -TimeoutSec 10
$ocSessionId = $ocSession.id
Write-Host "  OK: opencode session ID = $ocSessionId" -ForegroundColor Green

# Step 3: Send message to opencode session
Write-Host "`n[3] Send message to opencode session" -ForegroundColor Yellow
$msgBody = '{"parts":[{"type":"text","text":"hi"}]}'
$msgRes = Invoke-WebRequest -Uri "$baseUrl/session/$ocSessionId/message" -Method POST -ContentType "application/json" -Body $msgBody -TimeoutSec 120
$rawText = $msgRes.Content
Write-Host "  OK: Status $($msgRes.StatusCode), Response length: $($rawText.Length)" -ForegroundColor Green
if ($rawText.Length -gt 0) {
    Write-Host "  Raw (first 300): $($rawText.Substring(0, [Math]::Min(300, $rawText.Length)))" -ForegroundColor Gray
    try {
        $msgData = $rawText | ConvertFrom-Json
        Write-Host "  JSON fields: $($msgData.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
        if ($msgData.parts) {
            foreach ($p in $msgData.parts) {
                if ($p.type -eq 'text' -and $p.text) {
                    Write-Host "  AI reply: $($p.text)" -ForegroundColor Cyan
                }
            }
        }
    } catch {
        Write-Host "  WARN: JSON parse failed" -ForegroundColor Yellow
    }
} else {
    Write-Host "  WARN: Empty response body" -ForegroundColor Yellow
}

# Step 4: Create local session via Next.js API
Write-Host "`n[4] Create local session (POST /api/sessions)" -ForegroundColor Yellow
$sessionBody = '{"demoId":"demo-example"}'
$sessionRes = Invoke-WebRequest -Uri "$nextUrl/api/sessions" -Method POST -ContentType "application/json" -Body $sessionBody -TimeoutSec 10
$sessionData = $sessionRes.Content | ConvertFrom-Json
$localSessionId = $sessionData.data.sessionId
Write-Host "  OK: local session ID = $localSessionId" -ForegroundColor Green

# Step 5: Reproduce bug - use local ID with opencode
Write-Host "`n[5] Reproduce bug: use local session ID with opencode" -ForegroundColor Yellow
$bugRes = Invoke-WebRequest -Uri "$baseUrl/session/$localSessionId/message" -Method POST -ContentType "application/json" -Body $msgBody -TimeoutSec 10
$bugText = $bugRes.Content
Write-Host "  Response: $bugText" -ForegroundColor Red
Write-Host "  CONFIRMED: local session ID != opencode session ID" -ForegroundColor Yellow

# Step 6: Test /api/ai/chat without sessionId
Write-Host "`n[6] Test /api/ai/chat (no sessionId, let it create one)" -ForegroundColor Yellow
$chatBody = '{"message":"hi","demoId":"demo-example"}'
$chatRes = Invoke-WebRequest -Uri "$nextUrl/api/ai/chat" -Method POST -ContentType "application/json" -Body $chatBody -TimeoutSec 120
$chatData = $chatRes.Content | ConvertFrom-Json
if ($chatData.success) {
    Write-Host "  OK: API success" -ForegroundColor Green
    Write-Host "  opencode sessionId: $($chatData.data.sessionId)" -ForegroundColor Cyan
    Write-Host "  aiReply: $($chatData.data.aiReply)" -ForegroundColor Cyan
} else {
    Write-Host "  FAIL: $($chatData.error.message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Done" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
