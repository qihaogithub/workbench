@echo off
REM CLI 测试工具 - 快速测试脚本

echo.
echo ========================================
echo   CLI 测试工具 - 快速测试
echo ========================================
echo.

REM 检查 Agent Service
echo [步骤 1/3] 检查 Agent Service 状态...
echo.
call npx tsx src/index.ts health
if %errorlevel% neq 0 (
    echo.
    echo ⚠ Agent Service 未运行
    echo.
    echo 请先启动 Agent Service:
    echo   cd E:\重要文件\Programming\1_Work\workbench工作台
    echo   pnpm dev:agent
    echo.
    pause
    exit /b 1
)

echo.
echo [步骤 2/3] 发送测试消息 (HTTP 模式)...
echo.
call npx tsx src/index.ts send "quick-test-%RANDOM%" "你好,请用一句话回复"

echo.
echo [步骤 3/3] 列出所有会话...
echo.
call npx tsx src/index.ts sessions -l 5

echo.
echo ========================================
echo   测试完成!
echo ========================================
echo.
echo 更多命令请参考文档:
echo   npx tsx src/index.ts --help
echo.
echo 交互式测试模式:
echo   npx tsx src/index.ts interactive
echo.
pause
