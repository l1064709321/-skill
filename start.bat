@echo off
chcp 65001 >nul 2>&1
setlocal
set "DIR=%~dp0"
cd /d "%DIR%"

echo.
echo   天衍 (Tianyan) — 一键启动
echo   ============================================
echo.

:: 1. 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js
    echo   安装: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   + Node.js %NODE_VER%

:: 2. 安装依赖
if not exist node_modules (
    echo   * 安装依赖...
    call npm install --no-audit --no-fund
)

:: 3. 编译
echo   * 编译 TypeScript...
call npx tsc 2>nul

:: 4. 初始化配置
set "CONF_DIR=%USERPROFILE%\.tianyan"
set "CONF_FILE=%CONF_DIR%\config.yaml"
if not exist "%CONF_DIR%" mkdir "%CONF_DIR%" 2>nul
if not exist "%CONF_FILE%" (
    echo   * 初始化配置 → %CONF_FILE%
    copy config.example.yaml "%CONF_FILE%" >nul 2>&1
    echo   [提示] 首次运行请编辑 %CONF_FILE% 填入 API Key
    echo.
)

:: 5. 启动
echo.
echo   🚀 启动天衍 → http://localhost:8093
echo.
call node dist/index.js
pause
