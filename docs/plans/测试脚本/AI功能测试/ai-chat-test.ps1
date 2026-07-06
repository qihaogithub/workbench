# AI Chat E2E Test Script (Windows PowerShell)
# Tests: Open Demo Edit Page -> AI Chat Input -> Verify AI Response
# Usage: .\ai-chat-test.ps1 [-demoId <id>] [-baseUrl <url>] [-message <msg>]

param(
    [string]$demoId = "proj_1776526720347",
    [string]$baseUrl = "http://localhost:3200",
    [string]$message = "Hello, please generate a simple button component",
    [string]$username = "qihao",
    [string]$password = "130015",
    [int]$timeoutSeconds = 60,
    [switch]$verbose
)

$ErrorActionPreference = "Stop"

# Unicode escapes for Chinese strings used in JS eval
$U_SORRY = "\u62b1\u6b49\uff0c\u6211\u6ca1\u6709\u6536\u5230\u6709\u6548\u7684\u56de\u590d"

function Log {
    param([string]$text, [string]$level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($level) {
        "DEBUG" { "DarkGray" }
        "INFO" { "Cyan" }
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$level] $text" -ForegroundColor $color
}

function LogSnapshot {
    param([string]$context)
    if ($verbose) {
        Log "--- Snapshot: $context ---" "DEBUG"
        $snapshot = playwright-cli --raw snapshot 2>$null
        if ($snapshot) {
            $lines = $snapshot -split "`n" | Select-Object -First 20
            foreach ($line in $lines) {
                Log "  $line" "DEBUG"
            }
            if (($snapshot -split "`n").Count -gt 20) {
                Log "  ... (omitted $((($snapshot -split "`n").Count - 20)) lines)" "DEBUG"
            }
        }
    }
}

function LogEval {
    param([string]$js, [string]$context)
    if ($verbose) {
        Log "--- Eval: $context ---" "DEBUG"
        $result = playwright-cli --raw eval $js 2>$null
        if ($result) {
            Log "  $result" "DEBUG"
        }
    }
}

$verboseText = if ($verbose) { "ON" } else { "OFF" }
Log "=== AI Chat E2E Test ===" "INFO"
Log "Target Demo: $demoId" "INFO"
Log "Test Message: $message" "INFO"
Log "Timeout: ${timeoutSeconds}s" "INFO"
Log "Verbose: $verboseText" "INFO"
Log ""

# Check playwright-cli
$playwrightCli = Get-Command playwright-cli -ErrorAction SilentlyContinue
if (-not $playwrightCli) {
    Log "Error: playwright-cli not found" "ERROR"
    Log "Install: npm install -g @playwright/cli" "WARN"
    exit 1
}

# Cleanup
function Cleanup {
    Log "Cleanup: closing browser..." "INFO"
    playwright-cli close 2>$null
}

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup } | Out-Null

try {
    # ============================================================
    # Step 1: Open browser and navigate to Demo edit page
    # ============================================================
    Log "Step 1/5: Open browser and navigate to Demo edit page..." "INFO"
    $url = "$baseUrl/demo/$demoId/edit"
    Log "Navigate to: $url" "DEBUG"
    playwright-cli open $url
    Start-Sleep -Seconds 3

    $currentUrl = playwright-cli --raw eval "window.location.href" 2>$null
    Log "Current URL: $currentUrl" "DEBUG"

    if ($currentUrl -notlike "*/demo/$demoId/edit*") {
        Log "Current URL unexpected, may need login or Demo not found" "WARN"
    }

    # ============================================================
    # Step 2: Handle login if needed
    # ============================================================
    Log "Step 2/5: Check login status..." "INFO"

    if ($currentUrl -like "*/login*") {
        Log "Login page detected, performing login..." "WARN"
        LogSnapshot "Login page"

        $snapshot = playwright-cli --raw snapshot 2>$null

        # Username
        $usernameMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*username|ref=e(\d+).*user" | Select-Object -First 1
        if ($usernameMatch -and $usernameMatch.Matches.Count -gt 0) {
            $usernameRef = "e$($usernameMatch.Matches[0].Groups[1].Value)"
            Log "Found username input: $usernameRef" "DEBUG"
            playwright-cli fill $usernameRef $username 2>$null
        } else {
            Log "Username ref not found, using selector" "WARN"
            playwright-cli fill "input[type='text']" $username 2>$null
        }

        # Password
        $passwordMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*password|ref=e(\d+).*pass" | Select-Object -First 1
        if ($passwordMatch -and $passwordMatch.Matches.Count -gt 0) {
            $passwordRef = "e$($passwordMatch.Matches[0].Groups[1].Value)"
            Log "Found password input: $passwordRef" "DEBUG"
            playwright-cli fill $passwordRef $password 2>$null
        } else {
            Log "Password ref not found, using selector" "WARN"
            playwright-cli fill "input[type='password']" $password 2>$null
        }

        # Login button
        $loginMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*login|ref=e(\d+).*submit" | Select-Object -First 1
        if ($loginMatch -and $loginMatch.Matches.Count -gt 0) {
            $loginRef = "e$($loginMatch.Matches[0].Groups[1].Value)"
            Log "Found login button: $loginRef" "DEBUG"
            playwright-cli click $loginRef 2>$null
        } else {
            Log "Login button ref not found, using selector" "WARN"
            playwright-cli click "button[type='submit']" 2>$null
        }

        Log "Waiting for login response..." "INFO"
        Start-Sleep -Seconds 3

        $currentUrl = playwright-cli --raw eval "window.location.href" 2>$null
        Log "URL after login: $currentUrl" "DEBUG"

        if ($currentUrl -like "*/login*") {
            Log "Error: Login failed, check username and password" "ERROR"
            exit 1
        }
        Log "Login successful" "SUCCESS"
    } else {
        Log "Already logged in or no login required" "SUCCESS"
    }

    # ============================================================
    # Step 3: Wait for page load and locate AI chat input
    # ============================================================
    Log "Step 3/5: Wait for page load and locate AI chat input..." "INFO"

    $maxWait = 30
    $waited = 0
    $pageLoaded = $false

    while ($waited -lt $maxWait) {
        $snapshot = playwright-cli --raw snapshot 2>$null

        if ($snapshot -match "AI|chat|textarea|PromptInput|输入指令") {
            Log "Page loaded (waited ${waited}s)" "SUCCESS"
            $pageLoaded = $true
            LogSnapshot "Page loaded"
            break
        }

        Start-Sleep -Seconds 1
        $waited++
        if ($waited % 5 -eq 0) {
            Log "Waiting for page load... ($waited/$maxWait)" "DEBUG"
        }
    }

    if (-not $pageLoaded) {
        Log "Error: Page load timeout (exceeded ${maxWait}s)" "ERROR"
        LogSnapshot "Page load timeout"
        exit 1
    }

    $snapshot = playwright-cli --raw snapshot 2>$null

    Log "Locate AI chat input..." "INFO"
    # 优先通过快照查找输入指令或 textarea 的 ref
    $inputMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*\u8f93\u5165\u6307\u4ee4|ref=e(\d+).*textarea" | Select-Object -First 1
    $inputSelector = $null

    if ($inputMatch -and $inputMatch.Matches.Count -gt 0) {
        $inputSelector = "e$($inputMatch.Matches[0].Groups[1].Value)"
        Log "Found input via snapshot: $inputSelector" "DEBUG"
    } else {
        Log "Input not found via snapshot, trying selector..." "WARN"

        $hasTextarea = playwright-cli --raw eval "document.querySelector('textarea') !== null" 2>$null
        Log "textarea exists: $hasTextarea" "DEBUG"

        if ($hasTextarea -eq "true") {
            # Use nth=0 to target the first textarea (chat input)
            $inputSelector = "textarea >> nth=0"
            Log "Using textarea >> nth=0 selector" "DEBUG"
        } else {
            Log "Error: AI chat input not found" "ERROR"
            LogSnapshot "Input not found"

            $domInfo = playwright-cli --raw eval "JSON.stringify({textareaCount: document.querySelectorAll('textarea').length, inputCount: document.querySelectorAll('input').length, bodyText: document.body.innerText.substring(0, 300)})" 2>$null
            Log "DOM diagnostics: $domInfo" "DEBUG"

            exit 1
        }
    }

    Log "Found input: $inputSelector" "SUCCESS"

    # ============================================================
    # Step 4: Input test message and send
    # ============================================================
    Log "Step 4/5: Input test message and send..." "INFO"

    try {
        Log "Fill input: $message" "DEBUG"
        playwright-cli fill $inputSelector $message 2>$null
    } catch {
        Log "Error: Cannot fill input - $_" "ERROR"
        exit 1
    }

    $inputValue = playwright-cli --raw eval "(function() { var t = document.querySelectorAll('textarea')[0]; if (t) return t.value; return ''; })()" 2>$null
    $previewLen = [Math]::Min(50, $inputValue.Length)
    Log "Input current value: $($inputValue.Substring(0, $previewLen))..." "DEBUG"

    Log "Send message (press Enter)..." "INFO"
    try {
        playwright-cli press Enter 2>$null
    } catch {
        Log "Enter key failed, trying send button..." "WARN"

        $snapshot = playwright-cli --raw snapshot 2>$null
        $sendMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*send|ref=e(\d+).*submit" | Select-Object -First 1

        if ($sendMatch -and $sendMatch.Matches.Count -gt 0) {
            $sendRef = "e$($sendMatch.Matches[0].Groups[1].Value)"
            Log "Found send button: $sendRef" "DEBUG"
            playwright-cli click $sendRef 2>$null
        } else {
            Log "Using fallback: click last button" "DEBUG"
            playwright-cli --raw eval "document.querySelectorAll('button').length > 0 && document.querySelectorAll('button')[document.querySelectorAll('button').length - 1].click()" 2>$null
        }
    }

    Log "Message sent" "SUCCESS"

    # ============================================================
    # Step 5: Wait and verify AI response
    # ============================================================
    Log "Step 5/5: Wait for AI response (max ${timeoutSeconds}s)..." "INFO"

    $initialConsoleErrors = playwright-cli --raw console 2>$null | Select-String "ERROR|Error|error" | Select-Object -First 3
    if ($initialConsoleErrors) {
        Log "Initial console errors:" "WARN"
        $initialConsoleErrors | ForEach-Object { Log "  $_" "WARN" }
    }

    $startTime = Get-Date
    $aiReply = ""
    $replyFound = $false
    $streamEventsCount = 0
    $lastStreamCheck = 0

    while ($true) {
        $elapsed = ([DateTime]::Now - $startTime).TotalSeconds

        if ($elapsed -ge $timeoutSeconds) {
            Log "Timeout: No valid response within ${timeoutSeconds}s" "ERROR"
            break
        }

        if ($elapsed - $lastStreamCheck -ge 10) {
            $lastStreamCheck = $elapsed
            $pageState = playwright-cli --raw eval "JSON.stringify({streaming: document.querySelectorAll('[class*=streaming], [class*=loading]').length, proseCount: document.querySelectorAll('.prose').length, userMsgs: document.querySelectorAll('[data-role=user], .user').length, bodyTextLength: document.body.innerText.length})" 2>$null
            Log "[$([int]$elapsed)s] Page state: $pageState" "DEBUG"
        }

        $pageText = playwright-cli --raw eval "document.body.innerText" 2>$null
        if ($pageText -match $U_SORRY) {
            Log "Error response detected" "ERROR"

            $wsStatus = playwright-cli --raw eval "(function() { var ws = Array.from(document.querySelectorAll('iframe')).find(function(f) { return f.src.includes('ws') || f.src.includes('stream'); }); return ws ? 'ws iframe found' : 'no ws iframe'; })()" 2>$null
            Log "WebSocket status: $wsStatus" "DEBUG"

            $consoleErrors = playwright-cli --raw console 2>$null | Select-String "ERROR|Error|error" | Select-Object -First 5
            if ($consoleErrors) {
                Log "Console errors:" "ERROR"
                $consoleErrors | ForEach-Object { Log "  $_" "ERROR" }
            }

            $aiReply = "Error: No valid response"
            $replyFound = $true
            break
        }

        $isStreaming = playwright-cli --raw eval "document.querySelectorAll('[class*=streaming], [class*=loading], [class*=animate-spin]').length > 0" 2>$null
        LogEval "document.body.innerText.substring(0, 100)" "Current message content"

        if ($isStreaming -eq "true") {
            $streamEventsCount++
            if ($streamEventsCount % 5 -eq 0) {
                Log "AI is typing... (${streamEventsCount} streaming events detected)" "INFO"
            }
        }

        # Check for AI reply using multiple strategies
        if ($isStreaming -eq "false" -and $elapsed -gt 5) {
            $aiReply = ""

            # Strategy 1: Try .prose class (rendered markdown)
            $proseText = playwright-cli --raw eval "(function() { var proseList = document.querySelectorAll('.prose'); if (proseList.length > 0) { var lastProse = proseList[proseList.length - 1]; var txt = lastProse.innerText.trim(); if (txt.length > 0) return txt.substring(0, 500); } return ''; })()" 2>$null
            if ($proseText -and $proseText.Length -gt 0) {
                $aiReply = $proseText
            }

            # Strategy 2: Try AssistantMessage container
            if (-not $aiReply) {
                $assistantText = playwright-cli --raw eval "(function() { var assistantMsgs = document.querySelectorAll('[class*=\\\"group\\\"][class*=\\\"relative\\\"]'); if (assistantMsgs.length > 0) { var lastMsg = assistantMsgs[assistantMsgs.length - 1]; var msgText = lastMsg.innerText.trim(); if (msgText.length > 0) return msgText.substring(0, 500); } return ''; })()" 2>$null
                if ($assistantText -and $assistantText.Length -gt 0) {
                    $aiReply = $assistantText
                }
            }

            # Strategy 3: Try whitespace-pre-wrap text blocks
            if (-not $aiReply) {
                $wrapText = playwright-cli --raw eval "(function() { var textBlocks = document.querySelectorAll('.whitespace-pre-wrap'); if (textBlocks.length > 0) { var lastBlock = textBlocks[textBlocks.length - 1]; var blockText = lastBlock.innerText.trim(); if (blockText.length > 0) return blockText.substring(0, 500); } return ''; })()" 2>$null
                if ($wrapText -and $wrapText.Length -gt 0) {
                    $aiReply = $wrapText
                }
            }

            # Strategy 4: Fallback - get all text after the last user message
            if (-not $aiReply) {
                $userMsgEscaped = $message -replace '"', '\"'
                $fallbackText = playwright-cli --raw eval "(function() { var bodyText = document.body.innerText; var userMsgIndex = bodyText.lastIndexOf(\"$userMsgEscaped\"); if (userMsgIndex >= 0) { var afterUser = bodyText.substring(userMsgIndex + \"$userMsgEscaped\".length).trim(); var lines = afterUser.split('\n').filter(function(l) { var trimmed = l.trim(); return trimmed.length > 0 && trimmed !== 'AI \u5bf9\u8bdd' && trimmed !== '\u4ee3\u7801\u7f16\u8f91' && trimmed !== '\u914d\u7f6e\u9762\u677f' && trimmed !== '\u4fee\u6539\u914d\u7f6e\u9879\uff0c\u9884\u89c8\u533a\u5c06\u5b9e\u65f6\u66f4\u65b0' && trimmed !== '\u57fa\u7840\u914d\u7f6e' && trimmed !== '\u5c3a\u5bf8\u8bbe\u7f6e' && trimmed !== '\u663e\u793a\u9009\u9879' && !trimmed.includes('\u5b57\u6bb5') && !trimmed.endsWith('*'); }); if (lines.length > 0) return lines.join('\n').substring(0, 500); } return ''; })()" 2>$null
                if ($fallbackText -and $fallbackText.Length -gt 0) {
                    $aiReply = $fallbackText
                }
            }

            if ($aiReply -and $aiReply -ne "Error: No valid response" -and $aiReply.Length -gt 0) {
                Log "AI response received (elapsed: $([int]$elapsed)s)" "SUCCESS"
                $previewLen = [Math]::Min(100, $aiReply.Length)
                Log "Response preview: $($aiReply.Substring(0, $previewLen))..." "DEBUG"
                $replyFound = $true
                break
            }
        }

        if ([int]$elapsed % 10 -eq 0) {
            $streamStatus = if ($isStreaming -eq "true") { "Yes" } else { "No" }
            Log "Waiting... ($([int]$elapsed)/${timeoutSeconds}s, streaming: $streamStatus)" "DEBUG"
        }

        Start-Sleep -Seconds 1
    }

    Log "" "INFO"
    Log "=== Diagnostics Summary ===" "INFO"
    $finalState = playwright-cli --raw eval "JSON.stringify({url: window.location.href, title: document.title, bodyTextLength: document.body.innerText.length, bodyTextPreview: document.body.innerText.substring(0, 500), streamingElements: document.querySelectorAll('[class*=streaming], [class*=loading]').length, proseCount: document.querySelectorAll('.prose').length, userMessages: document.querySelectorAll('[data-role=user], .user').length})" 2>$null
    Log "Final page state: $finalState" "DEBUG"

    $finalConsoleErrors = playwright-cli --raw console 2>$null | Select-String "ERROR|Error|error|warn|Warning" | Select-Object -First 10
    if ($finalConsoleErrors) {
        Log "Console messages:" "WARN"
        $finalConsoleErrors | ForEach-Object { Log "  $_" "WARN" }
    }

    # ============================================================
    # Test Result Report
    # ============================================================
    Log "" "INFO"
    Log "=== Test Result ===" "INFO"

    if ($replyFound -and $aiReply) {
        if ($aiReply -match "Error: No valid response") {
            Log "TEST FAILED: AI returned empty response" "ERROR"
            Log "" "WARN"
            Log "Possible causes:" "WARN"
            Log "  1. Agent service not started or connection failed" "WARN"
            Log "  2. ACP CLI process error" "WARN"
            Log "  3. AI model returned no content" "WARN"
            Log "  4. WebSocket connection interrupted" "WARN"
            Log "" "WARN"
            Log "Troubleshooting:" "WARN"
            Log "  - Check agent-service: curl http://localhost:3201/health" "WARN"
            Log "  - Check ACP CLI: workbench acp" "WARN"
            Log "  - View agent-service logs" "WARN"
            exit 1
        } else {
            Log "TEST PASSED: AI response received" "SUCCESS"
            Log "" "INFO"
            Log "Response content (first 300 chars):" "INFO"
            Log "---" "DEBUG"
            $replyLines = $aiReply -split "`n" | Select-Object -First 10
            foreach ($line in $replyLines) {
                Log $line "INFO"
            }
            if ($aiReply.Length -gt 500) {
                Log "... (omitted 300 chars)" "DEBUG"
            }
            Log "---" "DEBUG"
            exit 0
        }
    } else {
        Log "TEST FAILED: No AI response detected" "ERROR"
        Log "" "WARN"
        Log "Possible causes:" "WARN"
        Log "  1. Message send failed" "WARN"
        Log "  2. Agent service not responding" "WARN"
        Log "  3. Response timeout" "WARN"
        Log "  4. Frontend rendering issue" "WARN"
        Log "" "WARN"
        Log "Troubleshooting:" "WARN"
        Log "  - Check browser console for errors" "WARN"
        Log "  - Check agent-service logs" "WARN"
        Log "  - Manually test AI chat function" "WARN"
        exit 1
    }
} finally {
    Cleanup
}
