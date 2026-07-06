#!/bin/bash
# AI 聊天功能端到端测试脚本 (Linux/Mac 版本)
# 测试流程：打开 Demo 编辑页 → AI 聊天框输入消息 → 验证收到 AI 回复
# 使用方法: ./ai-chat-test.sh [demoId] [baseUrl] [message]

set -e

DEMO_ID="${1:-proj_1776526720347}"
BASE_URL="${2:-http://localhost:3200}"
TEST_MESSAGE="${3:-你好，请帮我生成一个简单的按钮组件}"
USERNAME="${4:-qihao}"
PASSWORD="${5:-130015}"
TIMEOUT_SECONDS="${6:-60}"
VERBOSE="${7:-false}"

# 日志颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# 日志函数
log() {
    local level=$1
    shift
    local text="$*"
    local timestamp=$(date +"%H:%M:%S")

    case $level in
        DEBUG)
            [[ "$VERBOSE" != "true" ]] && return
            echo -e "${timestamp} [${GRAY}DEBUG${NC}] $text"
            ;;
        INFO)
            echo -e "${timestamp} [${CYAN}INFO${NC}] $text"
            ;;
        WARN)
            echo -e "${timestamp} [${YELLOW}WARN${NC}] $text"
            ;;
        ERROR)
            echo -e "${timestamp} [${RED}ERROR${NC}] $text"
            ;;
        SUCCESS)
            echo -e "${timestamp} [${GREEN}SUCCESS${NC}] $text"
            ;;
        *)
            echo -e "${timestamp} [$level] $text"
            ;;
    esac
}

log_snapshot() {
    [[ "$VERBOSE" != "true" ]] && return
    local context=$1
    log "DEBUG" "--- Snapshot: $context ---"
    local snapshot=$(playwright-cli --raw snapshot 2>/dev/null || echo "")
    if [[ -n "$snapshot" ]]; then
        echo "$snapshot" | head -20 | while read -r line; do
            log "DEBUG" "  $line"
        done
        local line_count=$(echo "$snapshot" | wc -l)
        if [[ $line_count -gt 20 ]]; then
            log "DEBUG" "  ... (省略 $((line_count - 20)) 行)"
        fi
    fi
}

log_eval() {
    [[ "$VERBOSE" != "true" ]] && return
    local js=$1
    local context=$2
    log "DEBUG" "--- Eval: $context ---"
    local result=$(playwright-cli --raw eval "$js" 2>/dev/null || echo "")
    if [[ -n "$result" ]]; then
        log "DEBUG" "  $result"
    fi
}

log "=== AI 聊天功能端到端测试 ===" "INFO"
log "目标 Demo: $DEMO_ID" "INFO"
log "测试消息: $TEST_MESSAGE" "INFO"
log "超时时间: ${TIMEOUT_SECONDS}秒" "INFO"
log "详细模式: $VERBOSE" "INFO"
log ""

# 检查 playwright-cli 是否可用
if ! command -v playwright-cli &> /dev/null; then
    log "错误: playwright-cli 未找到" "ERROR"
    log "安装命令: npm install -g @playwright/cli" "WARN"
    exit 1
fi

# 全局错误处理
cleanup() {
    log "INFO" "清理：关闭浏览器..."
    playwright-cli close 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================
# 步骤 1: 打开浏览器并访问 Demo 编辑页
# ============================================================
log "INFO" "步骤 1/5: 打开浏览器并访问 Demo 编辑页..."
URL="$BASE_URL/demo/$DEMO_ID/edit"
log "DEBUG" "导航到: $URL"
playwright-cli open "$URL"
sleep 3

# 检查页面是否加载成功
CURRENT_URL=$(playwright-cli --raw eval "window.location.href" 2>/dev/null || echo "")
log "DEBUG" "当前 URL: $CURRENT_URL"

if [[ "$CURRENT_URL" != *"/demo/$DEMO_ID/edit"* ]]; then
    log "WARN" "当前 URL 非预期，可能需要登录或 Demo 不存在"
fi

# ============================================================
# 步骤 2: 处理登录（如需要）
# ============================================================
log "INFO" "步骤 2/5: 检查登录状态..."

if [[ "$CURRENT_URL" == *"/login"* ]]; then
    log "WARN" "检测到登录页，执行登录..."
    log_snapshot "登录页"

    # 获取快照查找输入框
    SNAPSHOT=$(playwright-cli --raw snapshot 2>/dev/null || echo "")

    # 填写用户名
    USERNAME_REF=$(echo "$SNAPSHOT" | grep -oE 'ref=e[0-9]+.*username|ref=e[0-9]+.*用户名' | head -1 | grep -oE 'e[0-9]+' || echo "")
    if [[ -n "$USERNAME_REF" ]]; then
        log "DEBUG" "找到用户名输入框: $USERNAME_REF"
        playwright-cli fill "$USERNAME_REF" "$USERNAME" 2>/dev/null || true
    else
        log "WARN" "未找到用户名 ref，使用选择器"
        playwright-cli fill "input[type='text']" "$USERNAME" 2>/dev/null || true
    fi

    # 填写密码
    PASSWORD_REF=$(echo "$SNAPSHOT" | grep -oE 'ref=e[0-9]+.*password|ref=e[0-9]+.*密码' | head -1 | grep -oE 'e[0-9]+' || echo "")
    if [[ -n "$PASSWORD_REF" ]]; then
        log "DEBUG" "找到密码输入框: $PASSWORD_REF"
        playwright-cli fill "$PASSWORD_REF" "$PASSWORD" 2>/dev/null || true
    else
        log "WARN" "未找到密码 ref，使用选择器"
        playwright-cli fill "input[type='password']" "$PASSWORD" 2>/dev/null || true
    fi

    # 点击登录按钮
    LOGIN_REF=$(echo "$SNAPSHOT" | grep -oE 'ref=e[0-9]+.*登录|ref=e[0-9]+.*login' | head -1 | grep -oE 'e[0-9]+' || echo "")
    if [[ -n "$LOGIN_REF" ]]; then
        log "DEBUG" "找到登录按钮: $LOGIN_REF"
        playwright-cli click "$LOGIN_REF" 2>/dev/null || true
    else
        log "WARN" "未找到登录按钮 ref，使用选择器"
        playwright-cli click "button[type='submit']" 2>/dev/null || true
    fi

    log "INFO" "等待登录响应..."
    sleep 3

    # 验证登录成功
    CURRENT_URL=$(playwright-cli --raw eval "window.location.href" 2>/dev/null || echo "")
    log "DEBUG" "登录后 URL: $CURRENT_URL"

    if [[ "$CURRENT_URL" == *"/login"* ]]; then
        log "ERROR" "错误: 登录失败，请检查用户名和密码"
        exit 1
    fi
    log "SUCCESS" "登录成功"
else
    log "SUCCESS" "已登录或无需登录"
fi

# ============================================================
# 步骤 3: 等待页面加载完成并定位 AI 聊天框
# ============================================================
log "INFO" "步骤 3/5: 等待页面加载并定位 AI 聊天框..."

MAX_WAIT=30
WAITED=0
PAGE_LOADED=false

while [[ $WAITED -lt $MAX_WAIT ]]; do
    SNAPSHOT=$(playwright-cli --raw snapshot 2>/dev/null || echo "")

    # 检查是否有 AI 对话标签或输入框
    if echo "$SNAPSHOT" | grep -qE "AI 对话|输入指令|textarea|PromptInput"; then
        log "SUCCESS" "页面加载完成 (等待 ${WAITED}秒)"
        PAGE_LOADED=true
        log_snapshot "页面加载完成"
        break
    fi

    sleep 1
    WAITED=$((WAITED + 1))
    if [[ $((WAITED % 5)) -eq 0 ]]; then
        log "DEBUG" "等待页面加载... ($WAITED/$MAX_WAIT)"
    fi
done

if [[ "$PAGE_LOADED" != "true" ]]; then
    log "ERROR" "错误: 页面加载超时 (等待超过 ${MAX_WAIT}秒)"
    log_snapshot "页面加载超时"
    exit 1
fi

# 获取最新的快照以定位输入框
SNAPSHOT=$(playwright-cli --raw snapshot 2>/dev/null || echo "")

# 查找输入框
log "INFO" "定位 AI 聊天输入框..."
INPUT_REF=$(echo "$SNAPSHOT" | grep -oE 'ref=e[0-9]+.*输入指令|ref=e[0-9]+.*textarea' | head -1 | grep -oE 'e[0-9]+' || echo "")

if [[ -z "$INPUT_REF" ]]; then
    log "WARN" "通过 snapshot 未找到输入框，尝试选择器..."

    HAS_TEXTAREA=$(playwright-cli --raw eval "document.querySelector('textarea') !== null" 2>/dev/null || echo "false")
    log "DEBUG" "textarea 存在: $HAS_TEXTAREA"

    if [[ "$HAS_TEXTAREA" == "true" ]]; then
        INPUT_SELECTOR="textarea"
        log "DEBUG" "使用 textarea 选择器"
    else
        log "ERROR" "错误: 未找到 AI 聊天输入框"
        log_snapshot "输入框查找失败"

        # 输出更多诊断信息
        DOM_INFO=$(playwright-cli --raw eval "JSON.stringify({
            textareaCount: document.querySelectorAll('textarea').length,
            inputCount: document.querySelectorAll('input').length,
            aiChatExists: !!document.querySelector('[class*=ai-chat], [class*=AIChat], #ai-chat'),
            bodyText: document.body.innerText.substring(0, 300)
        })" 2>/dev/null || echo "{}")
        log "DEBUG" "DOM 诊断: $DOM_INFO"

        exit 1
    fi
else
    INPUT_SELECTOR="$INPUT_REF"
    log "DEBUG" "通过 snapshot 找到输入框: $INPUT_SELECTOR"
fi

log "SUCCESS" "找到输入框: $INPUT_SELECTOR"

# ============================================================
# 步骤 4: 输入测试消息并发送
# ============================================================
log "INFO" "步骤 4/5: 输入测试消息并发送..."

if ! playwright-cli fill "$INPUT_SELECTOR" "$TEST_MESSAGE" 2>/dev/null; then
    log "ERROR" "错误: 无法填写输入框"
    exit 1
fi
log "DEBUG" "填写输入框: $TEST_MESSAGE"

# 验证输入是否成功
INPUT_VALUE=$(playwright-cli --raw eval "document.querySelector('textarea')?.value || document.querySelector('[placeholder*=输入]')?.value || ''" 2>/dev/null || echo "")
log "DEBUG" "输入框当前值: ${INPUT_VALUE:0:50}..."

# 发送消息（按 Enter）
log "INFO" "发送消息 (按 Enter)..."
if ! playwright-cli press Enter 2>/dev/null; then
    log "WARN" "Enter 键失败，尝试点击发送按钮..."

    SNAPSHOT=$(playwright-cli --raw snapshot 2>/dev/null || echo "")
    SEND_REF=$(echo "$SNAPSHOT" | grep -oE 'ref=e[0-9]+.*发送|ref=e[0-9]+.*Send|ref=e[0-9]+.*submit' | head -1 | grep -oE 'e[0-9]+' || echo "")

    if [[ -n "$SEND_REF" ]]; then
        log "DEBUG" "找到发送按钮: $SEND_REF"
        playwright-cli click "$SEND_REF" 2>/dev/null || true
    else
        log "DEBUG" "使用备用方式点击最后一个按钮"
        playwright-cli --raw eval "document.querySelectorAll('button').length > 0 && document.querySelectorAll('button')[document.querySelectorAll('button').length - 1].click()" 2>/dev/null || true
    fi
fi

log "SUCCESS" "消息已发送"

# ============================================================
# 步骤 5: 等待并验证 AI 回复
# ============================================================
log "INFO" "步骤 5/5: 等待 AI 回复（最多 ${TIMEOUT_SECONDS} 秒）..."

# 输出初始状态
INITIAL_ERRORS=$(playwright-cli console 2>&1 | grep -iE "ERROR|Error|error" | head -3 || echo "")
if [[ -n "$INITIAL_ERRORS" ]]; then
    log "WARN" "初始控制台错误:"
    echo "$INITIAL_ERRORS" | while read -r line; do
        log "WARN" "  $line"
    done
fi

START_TIME=$(date +%s)
AI_REPLY=""
REPLY_FOUND=false
STREAM_EVENTS_COUNT=0
LAST_STREAM_CHECK=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [[ $ELAPSED -ge $TIMEOUT_SECONDS ]]; then
        log "ERROR" "超时: ${TIMEOUT_SECONDS} 秒内未收到有效回复"
        break
    fi

    # 每 10 秒输出一次页面状态
    if [[ $((ELAPSED - LAST_STREAM_CHECK)) -ge 10 ]]; then
        LAST_STREAM_CHECK=$ELAPSED
        PAGE_STATE=$(playwright-cli --raw eval "JSON.stringify({
            streaming: document.querySelectorAll('[class*=streaming], [class*=loading]').length,
            assistantMsgs: document.querySelectorAll('[data-role=assistant], .assistant').length,
            userMsgs: document.querySelectorAll('[data-role=user], .user').length,
            bodyTextLength: document.body.innerText.length
        })" 2>/dev/null || echo "{}")
        log "DEBUG" "[${ELAPSED}s] 页面状态: $PAGE_STATE"
    fi

    # 检查是否有错误回复
    PAGE_TEXT=$(playwright-cli --raw eval "document.body.innerText" 2>/dev/null || echo "")
    if echo "$PAGE_TEXT" | grep -qE "抱歉，我没有收到有效的回复"; then
        log "ERROR" "检测到错误回复: '抱歉，我没有收到有效的回复'"

        # 输出诊断信息
        WS_STATUS=$(playwright-cli --raw eval "(function() {
            const ws = Array.from(document.querySelectorAll('iframe')).find(f => f.src.includes('ws') || f.src.includes('stream'));
            return ws ? 'ws iframe found' : 'no ws iframe';
        })()" 2>/dev/null || echo "unknown")
        log "DEBUG" "WebSocket 状态: $WS_STATUS"

        CONSOLE_ERRORS=$(playwright-cli console 2>&1 | grep -iE "ERROR|Error|error" | head -5 || echo "")
        if [[ -n "$CONSOLE_ERRORS" ]]; then
            log "ERROR" "控制台错误:"
            echo "$CONSOLE_ERRORS" | while read -r line; do
                log "ERROR" "  $line"
            done
        fi

        AI_REPLY="抱歉，我没有收到有效的回复"
        REPLY_FOUND=true
        break
    fi

    # 检查流式状态
    IS_STREAMING=$(playwright-cli --raw eval "document.querySelectorAll('[class*=streaming], [class*=loading], [class*=animate-spin]').length > 0" 2>/dev/null || echo "false")
    log_eval "document.body.innerText.substring(0, 100)" "当前消息内容"

    # 如果在流式状态，计数
    if [[ "$IS_STREAMING" == "true" ]]; then
        STREAM_EVENTS_COUNT=$((STREAM_EVENTS_COUNT + 1))
        if [[ $((STREAM_EVENTS_COUNT % 5)) -eq 0 ]]; then
            log "INFO" "AI 正在输入... (${STREAM_EVENTS_COUNT} 次检测到流式状态)"
        fi
    fi

    # 如果不在流式状态且已等待超过5秒，尝试提取回复
    if [[ "$IS_STREAMING" == "false" ]] && [[ $ELAPSED -gt 5 ]]; then
        AI_REPLY=$(playwright-cli --raw eval "(function() {
            const msgs = document.querySelectorAll('[data-role=assistant], .assistant, [class*=assistant]');
            if (msgs.length > 0) {
                const lastMsg = msgs[msgs.length - 1];
                return lastMsg.innerText.substring(0, 300);
            }
            return '';
        })()" 2>/dev/null || echo "")

        if [[ -n "$AI_REPLY" ]] && [[ "$AI_REPLY" != "抱歉，我没有收到有效的回复" ]] && [[ ${#AI_REPLY} -gt 0 ]]; then
            log "SUCCESS" "收到 AI 回复 (耗时: ${ELAPSED}秒)"
            log "DEBUG" "回复内容预览: ${AI_REPLY:0:100}..."
            REPLY_FOUND=true
            break
        fi
    fi

    # 显示进度
    if [[ $((ELAPSED % 10)) -eq 0 ]]; then
        STREAM_STATUS=$([[ "$IS_STREAMING" == "true" ]] && echo "是" || echo "否")
        log "DEBUG" "等待中... (${ELAPSED}/${TIMEOUT_SECONDS}秒, 流式检测: $STREAM_STATUS)"
    fi

    sleep 1
done

# 输出最终状态
log "" "INFO"
log "INFO" "=== 诊断信息汇总 ==="

FINAL_STATE=$(playwright-cli --raw eval "JSON.stringify({
    url: window.location.href,
    title: document.title,
    bodyTextLength: document.body.innerText.length,
    bodyTextPreview: document.body.innerText.substring(0, 500),
    streamingElements: document.querySelectorAll('[class*=streaming], [class*=loading]').length,
    assistantMessages: document.querySelectorAll('[data-role=assistant], .assistant, [class*=assistant]').length,
    userMessages: document.querySelectorAll('[data-role=user], .user, [class*=user]').length
})" 2>/dev/null || echo "{}")
log "DEBUG" "最终页面状态: $FINAL_STATE"

# 控制台错误
FINAL_ERRORS=$(playwright-cli console 2>&1 | grep -iE "ERROR|Error|error|warn|Warning" | head -10 || echo "")
if [[ -n "$FINAL_ERRORS" ]]; then
    log "WARN" "控制台消息:"
    echo "$FINAL_ERRORS" | while read -r line; do
        log "WARN" "  $line"
    done
fi

# ============================================================
# 测试结果报告
# ============================================================
log "" "INFO"
log "INFO" "=== 测试结果 ==="

if [[ "$REPLY_FOUND" == "true" ]] && [[ -n "$AI_REPLY" ]]; then
    if echo "$AI_REPLY" | grep -q "抱歉，我没有收到有效的回复"; then
        log "ERROR" "❌ 测试失败: AI 返回了空回复"
        log "" "WARN"
        log "WARN" "可能原因:"
        log "WARN" "  1. Agent 服务未启动或连接失败"
        log "WARN" "  2. ACP CLI 进程异常"
        log "WARN" "  3. AI 模型未返回有效内容"
        log "WARN" "  4. WebSocket 连接中断"
        log "" "WARN"
        log "WARN" "排查建议:"
        log "WARN" "  - 检查 agent-service 是否启动: curl http://localhost:3201/health"
        log "WARN" "  - 检查 ACP CLI 是否可用: workbench acp"
        log "WARN" "  - 查看 agent-service 控制台日志"
        log "WARN" "  - 使用浏览器开发者工具查看 WebSocket 消息"
        exit 1
    else
        log "SUCCESS" "✅ 测试通过: 成功收到 AI 回复"
        log "" "INFO"
        log "INFO" "回复内容 (前300字符):"
        log "DEBUG" "---"
        # 分行输出回复内容
        echo "$AI_REPLY" | head -10 | while read -r line; do
            log "INFO" "$line"
        done
        if [[ ${#AI_REPLY} -gt 500 ]]; then
            log "DEBUG" "... (省略 300 字符)"
        fi
        log "DEBUG" "---"
        exit 0
    fi
else
    log "ERROR" "❌ 测试失败: 未检测到 AI 回复"
    log "" "WARN"
    log "WARN" "可能原因:"
    log "WARN" "  1. 消息发送失败"
    log "WARN" "  2. Agent 服务未响应"
    log "WARN" "  3. 回复超时"
    log "WARN" "  4. 前端渲染问题"
    log "" "WARN"
    log "WARN" "排查建议:"
    log "WARN" "  - 检查浏览器控制台是否有错误"
    log "WARN" "  - 检查 agent-service 日志"
    log "WARN" "  - 手动测试 AI 对话功能"
    exit 1
fi
