@echo off
REM CLI 测试工具启动脚本

cd /d "%~dp0"

if "%1"=="" (
    echo.
    echo === CLI 测试工具 ===
    echo.
    echo 用法:
    echo   ops-cli ^<command^> [options]
    echo.
    echo 可用命令:
    echo   health                    检查 Agent Service 健康状态
    echo   send ^<sessionId^> ^<msg^>    通过 HTTP 发送消息
    echo   stream ^<sessionId^> [msg]  通过 WebSocket 流式测试
    echo   session ^<sessionId^>       查看会话信息
    echo   sessions                  列出所有会话
    echo   destroy ^<sessionId^>       销毁会话
    echo   diagnose [sessionId]      错误诊断
    echo   interactive [sessionId]   交互式测试模式
    echo.
    echo 示例:
    echo   ops-cli health
    echo   ops-cli send "test-1" "你好"
    echo   ops-cli stream "test-1" "你好"
    echo   ops-cli interactive
    echo.
    echo 选项:
    echo   -u, --url ^<url^>          Agent Service 地址 (默认: http://localhost:3101)
    echo   -h, --help                显示帮助
    echo.
    npx tsx src/index.ts --help
) else (
    npx tsx src/index.ts %*
)
