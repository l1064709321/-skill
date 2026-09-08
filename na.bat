@echo off
:: ============================================================
:: 天衍 一键管理命令 (Windows)
:: 用法: na [start|stop|restart|status|log|url|help]
:: TypeScript 环境自动检测 + 多镜像源切换安装
:: ============================================================
setlocal EnableDelayedExpansion

set "CMD=%~1"
if "%CMD%"=="" set "CMD=start"

set "DIR=%~dp0"
cd /d "%DIR%"
set "PID_FILE=%TEMP%\tianyan.pid"
set "LOG_FILE=%TEMP%\tianyan.log"
set "PORT=8000"

:: ── 镜像源列表 ──
set "MIRRORS=npmmirror|https://registry.npmmirror.com 华为云|https://repo.huaweicloud.com/repository/npm/ 腾讯云|https://mirrors.cloud.tencent.com/npm/ 清华|https://registry.npmmirror.com 官方|https://registry.npmjs.org"

if "%CMD%"=="help" goto :help
if "%CMD%"=="-h" goto :help
if "%CMD%"=="--help" goto :help
if "%CMD%"=="start" goto :start
if "%CMD%"=="stop" goto :stop
if "%CMD%"=="restart" goto :stop_then_start
if "%CMD%"=="status" goto :status
if "%CMD%"=="log" goto :log
if "%CMD%"=="url" goto :url
echo 用法: na [start^|stop^|restart^|status^|log^|url]
exit /b 1

:: ── START ──
:start
:: 检查是否已运行
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /fi "PID eq !PID!" 2>nul | find /i "node" >nul 2>&1
    if !errorlevel! equ 0 (
        echo  + 服务已在运行 (PID !PID!) → http://localhost:%PORT%/
        goto :eof
    )
)

:: 检查 Node.js
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo  [错误] 未检测到 Node.js
    echo  请安装: https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo  + Node.js %%i

:: 检查 TypeScript
set TS_OK=0
npx tsc --version >nul 2>&1
if !errorlevel! equ 0 set TS_OK=1

if !TS_OK! equ 0 (
    echo  [!] TypeScript 未安装, 自动安装中...
    for %%R in (
        "npmmirror|https://registry.npmmirror.com"
        "华为云|https://repo.huaweicloud.com/repository/npm/"
        "腾讯云|https://mirrors.cloud.tencent.com/npm/"
        "清华|https://registry.npmmirror.com"
        "官方|https://registry.npmjs.org"
    ) do (
        if !TS_OK! equ 0 (
            for /f "tokens=1,2 delims=|" %%A in ("%%~R") do (
                echo     ^> 从 %%A 安装 TypeScript...
                call npm install typescript --save-dev --registry "%%B" --fetch-timeout 15000 --no-audit --no-fund >nul 2>&1
                npx tsc --version >nul 2>&1
                if !errorlevel! equ 0 (
                    echo  + TypeScript 安装成功 (%%A^)
                    set TS_OK=1
                ) else (
                    echo     x %%A 失败, 切换下一个...
                )
            )
        )
    )
    if !TS_OK! equ 0 (
        echo  [错误] TypeScript 安装失败
        exit /b 1
    )
)

:: 安装依赖
if not exist node_modules (
    echo  安装依赖...
    for %%R in (
        "npmmirror|https://registry.npmmirror.com"
        "华为云|https://repo.huaweicloud.com/repository/npm/"
        "腾讯云|https://mirrors.cloud.tencent.com/npm/"
        "清华|https://registry.npmmirror.com"
        "官方|https://registry.npmjs.org"
    ) do (
        if not exist node_modules (
            for /f "tokens=1,2 delims=|" %%A in ("%%~R") do (
                call npm install --registry "%%B" --no-audit --no-fund >nul 2>&1
                if exist node_modules echo  + 依赖安装完成 & goto :compile
            )
        )
    )
)

:compile
:: 编译 TypeScript
echo  编译 TypeScript...
call npx tsc 2>nul

:: 启动服务
echo.
echo  启动服务...
start /b node bin\tianyan.js --port %PORT% --no-browser > "%LOG_FILE%" 2>&1

:: 等待就绪
echo  等待就绪...
for /l %%i in (1,1,20) do (
    curl -s -o nul -w "%%{http_code}" http://localhost:%PORT%/api/health 2>nul | find /i "200" >nul 2>&1
    if !errorlevel! equ 0 goto :started
    timeout /t 1 /nobreak >nul
)
echo  启动超时, 日志:
type "%LOG_FILE%" | findstr /n "." | findstr /b "^[1-9]:\|^[1][0-9]:\|^[2]0:"
exit /b 1

:started
:: 获取 PID
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo list 2^>nul ^| find "PID"') do set "PID=%%p"
echo !PID! > "%PID_FILE%"
echo.
echo  + 服务已启动 (PID !PID!)
echo  访问: http://localhost:%PORT%/
exit /b 0

:: ── STOP ──
:stop
if not exist "%PID_FILE%" (
    echo  服务未运行
    exit /b 0
)
set /p PID=<"%PID_FILE%"
tasklist /fi "PID eq %PID%" 2>nul | find /i "node" >nul 2>&1
if !errorlevel! equ 0 (
    taskkill /PID %PID% /F >nul 2>&1
    echo  + 已停止 (PID %PID%)
)
del "%PID_FILE%" >nul 2>&1
exit /b 0

:stop_then_start
call :stop
goto :start

:: ── STATUS ──
:status
if not exist "%PID_FILE%" goto :not_running
set /p PID=<"%PID_FILE%"
tasklist /fi "PID eq %PID%" 2>nul | find /i "node" >nul 2>&1
if !errorlevel! equ 0 (
    echo  ● 运行中  PID %PID%
    echo  访问: http://localhost:%PORT%/
) else (
    echo  ○ 未运行 (PID 文件过期)
    del "%PID_FILE%" >nul 2>&1
)
exit /b 0

:not_running
echo  ○ 未运行
exit /b 0

:: ── LOG ──
:log
if exist "%LOG_FILE%" (
    type "%LOG_FILE%"
) else (
    echo  日志不存在, 请先运行: na start
)
exit /b 0

:: ── URL ──
:url
echo  访问地址: http://localhost:%PORT%/
exit /b 0

:: ── HELP ──
:help
echo  天衍 (Tianyan) 管理命令
echo  用法: na [start^|stop^|restart^|status^|log^|url]
exit /b 0
