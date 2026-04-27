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
$U_INPUT = "\u8f93\u5165\u6307\u4ee4"
$U_SEND = "\u6309 Enter \u53d1\u9001"
$U_SORRY = "\u62b1\u6b49\uff0c\u6211\u6ca1\u6709\u6536\u5230\u6709\u6548\u7684\u56de\u590d"
$U_THINKING = "\u601d\u8003\u8fc7\u7a0b"
$U_AI_CHAT = "AI \u5bf9\u8bdd"

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

        if ($snapshot -match "AI|chat|textarea|PromptInput") {
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
    $inputMatch = $snapshot | Select-String -Pattern "ref=e(\d+).*textarea|ref=e(\d+).*input" | Select-Object -First 1
    $inputSelector = $null

    if ($inputMatch -and $inputMatch.Matches.Count -gt 0) {
        $inputSelector = "e$($inputMatch.Matches[0].Groups[1].Value)"
        Log "Found input via snapshot: $inputSelector" "DEBUG"
    } else {
        Log "Input not found via snapshot, trying selector..." "WARN"

        $hasTextarea = playwright-cli --raw eval "document.querySelector('textarea') !== null" 2>$null
        Log "textarea exists: $hasTextarea" "DEBUG"

        if ($hasTextarea -eq "true") {
            # Use placeholder to target