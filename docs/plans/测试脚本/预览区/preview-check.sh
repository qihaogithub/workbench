#!/bin/bash
# 预览区检查脚本 (Linux/Mac 版本)
# 用于快速诊断分层预览架构中的问题
# 使用方法: ./preview-check.sh [demoId]

set -e

DEMO_ID="${1:-proj_1776526720347}"
BASE_URL="${2:-http://localhost:3200}"
USERNAME="${3:-qihao}"
PASSWORD="${4:-130015}"

echo -e "\033[36m=== 分层预览架构问题诊断脚本 ===\033[0m"
echo -e "\033[90m目标Demo: $DEMO_ID\033[0m"
echo ""

# 检查 playwright-cli 是否可用
if ! command -v playwright-cli &> /dev/null; then
    echo -e "\033[31m错误: playwright-cli 未找到，请先安装\033[0m"
    echo -e "\033[33m安装命令: npm install -g @playwright/cli\033[0m"
    exit 1
fi

echo -e "\033[32m步骤 1/6: 启动浏览器并访问编辑页...\033[0m"
URL="$BASE_URL/demo/$DEMO_ID/edit"
playwright-cli open "$URL"
sleep 2

echo -e "\033[32m步骤 2/6: 检查是否需要登录...\033[0m"
CURRENT_URL=$(playwright-cli --raw eval "window.location.href")
if [[ "$CURRENT_URL" == *"/login"* ]]; then
    echo -e "\033[33m  检测到登录页，执行登录...\033[0m"
    playwright-cli snapshot
    
    # 尝试填写用户名和密码
    playwright-cli fill "input[type='text']" "$USERNAME" 2>/dev/null || true
    playwright-cli fill "input[type='password']" "$PASSWORD" 2>/dev/null || true
    playwright-cli click "button[type='submit']" 2>/dev/null || true
    sleep 3
fi

echo -e "\033[32m步骤 3/6: 检查 Session 状态...\033[0m"
SESSION_INFO=$(playwright-cli --raw eval "
fetch('/api/sessions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({demoId: '$DEMO_ID'})
}).then(r => r.json()).then(d => JSON.stringify({
    success: d.success,
    sessionId: d.data?.sessionId,
    hasCode: !!d.data?.code,
    codeLength: d.data?.code?.length,
    hasSchema: !!d.data?.schema
}))"
)
echo -e "\033[90m  Session API 响应: $SESSION_INFO\033[0m"

SESSION_ID=$(echo "$SESSION_INFO" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SESSION_ID" ]; then
    echo -e "\033[31m错误: Session 创建失败\033[0m"
    playwright-cli close
    exit 1
fi

echo -e "\033[36m  Session ID: $SESSION_ID\033[0m"

echo -e "\033[32m步骤 4/6: 检查编译 API...\033[0m"
COMPILE_INFO=$(playwright-cli --raw eval "
fetch('/api/compile', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sessionId: '$SESSION_ID'})
}).then(r => r.json()).then(d => JSON.stringify({
    success: d.success,
    hasCompiledCode: !!d.data?.compiledCode,
    compiledCodeLength: d.data?.compiledCode?.length,
    errorCode: d.error?.code,
    errorMessage: d.error?.message
}))"
)
echo -e "\033[90m  Compile API 响应: $COMPILE_INFO\033[0m"

if [[ "$COMPILE_INFO" == *'"success":false'* ]]; then
    echo -e "\033[31m错误: 编译失败\033[0m"
    playwright-cli close
    exit 1
fi

COMPILE_LENGTH=$(echo "$COMPILE_INFO" | grep -o '"compiledCodeLength":[0-9]*' | cut -d':' -f2)
echo -e "\033[32m  编译成功，代码长度: $COMPILE_LENGTH\033[0m"

echo -e "\033[32m步骤 5/6: 检查 iframe 状态...\033[0m"
IFRAME_INFO=$(playwright-cli --raw eval "
const iframe = document.querySelector('iframe');
const root = iframe?.contentDocument?.querySelector('#root');
JSON.stringify({
    iframeExists: !!iframe,
    rootExists: !!root,
    rootChildrenCount: root?.children?.length || 0,
    rootInnerHTML: root?.innerHTML?.substring(0, 200) || '(empty)'
})"
)
echo -e "\033[90m  Iframe 状态: $IFRAME_INFO\033[0m"

ROOT_CHILDREN=$(echo "$IFRAME_INFO" | grep -o '"rootChildrenCount":[0-9]*' | cut -d':' -f2)
if [ "$ROOT_CHILDREN" -eq 0 ]; then
    echo -e "\033[33m警告: #root 元素为空，组件未渲染\033[0m"
else
    echo -e "\033[32m成功: #root 有 $ROOT_CHILDREN 个子元素\033[0m"
fi

echo -e "\033[32m步骤 6/6: 检查控制台错误...\033[0m"
playwright-cli console 2>&1 | grep -i "error" | head -5 || echo -e "\033[32m  控制台无错误\033[0m"

echo ""
echo -e "\033[36m=== 诊断结果 ===\033[0m"

if [ "$ROOT_CHILDREN" -eq 0 ]; then
    echo -e "\033[33m问题定位: 编译成功但 iframe 未渲染\033[0m"
    echo -e "\033[90m可能原因:\033[0m"
    echo -e "\033[90m  1. postMessage 未正确发送或接收\033[0m"
    echo -e "\033[90m  2. iframe 消息处理逻辑异常\033[0m"
    echo -e "\033[90m  3. 组件渲染时发生运行时错误\033[0m"
else
    echo -e "\033[32m状态: 正常，预览区已正确渲染\033[0m"
fi

echo ""
echo -e "\033[90m关闭浏览器...\033[0m"
playwright-cli close

echo -e "\033[36m诊断完成\033[0m"
