@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

set "DIR=%~dp0"
cd /d "%DIR%"

echo.
echo   天衍 (Tianyan) - 一键启动
echo   ============================================
echo.

:: ── 1. 检查 Node.js ──
where node >nul 2>&1
if !errorlevel! neq 1 (
    echo   [错误] 未检测到 Node.js
    echo   请安装 Node.js ^>= 18: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   + Node.js %NODE_VER%

:: ── 2. 检查 npm ──
where npm >nul 2>&1
if !errorlevel! neq 1 (
    echo   [错误] 未检测到 npm
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VER=%%i
echo   + npm %NPM_VER%

:: ── 3. 检测 TypeScript 是否可用 ──
set TS_OK=0
npx tsc --version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=*" %%i in ('npx tsc --version 2^>nul') do set TS_VER=%%i
    echo   + TypeScript !TS_VER!
    set TS_OK=1
)

:: ── 4. TypeScript 不可用 → 多镜像源自动安装 ──
if !TS_OK! equ 0 (
    echo   [!] TypeScript 未安装, 自动安装中...

    :: 镜像源列表: npmmirror → 华为云 → 腾讯云 → 清华 → 官方
    for %%M in (
        "npmmirror|https://registry.npmmirror.com"
        "华为云|https://repo.huaweicloud.com/repository/npm/"
        "腾讯云|https://mirrors.cloud.tencent.com/npm/"
        "清华|https://registry.npmmirror.com"
        "官方|https://registry.npmjs.org"
    ) do (
        if !TS_OK! equ 0 (
            set "MIRROR_NAME=%%~M"
            set "MIRROR_NAME=!MIRROR_NAME:*|=!"
            for /f "tokens=1,2 delims=|" %%A in ("%%~M") do (
                echo     ^> 从 %%A 安装 TypeScript...
                call npm install typescript --save-dev --registry "%%B" --fetch-timeout 15000 --no-audit --no-fund >nul 2>&1
                npx tsc --version >nul 2>&1
                if !errorlevel! equ 0 (
                    for /f "tokens=*" %%V in ('npx tsc --version 2^>nul') do set TS_VER=%%V
                    echo   + TypeScript !TS_VER! ^(%%A 安装成功^)
                    set TS_OK=1
                ) else (
                    echo     x %%A 失败, 切换下一个...
                )
            )
        )
    )

    if !TS_OK! equ 0 (
        echo   [错误] 所有镜像源均安装失败
        echo   请手动执行: npm install typescript
        pause
        exit /b 1
    )
)

:: ── 5. 安装依赖 ──
if not exist node_modules (
    echo   安装依赖...
    for %%R in (
        "npmmirror|https://registry.npmmirror.com"
        "华为云|https://repo.huaweicloud.com/repository/npm/"
        "腾讯云|https://mirrors.cloud.tencent.com/npm/"
        "清华|https://registry.npmmirror.com"
        "官方|https://registry.npmjs.org"
    ) do (
        for /f "tokens=1,2 delims=|" %%A in ("%%~R") do (
            echo     ^> 从 %%A 安装...
            call npm install --registry "%%B" --no-audit --no-fund >nul 2>&1
            if exist node_modules (
                echo   + 依赖安装完成
                goto :deps_done
            )
            echo     x %%A 失败, 换下一个...
        )
    )
    :deps_done
)

:: ── 6. 编译 TypeScript ──
echo   编译 TypeScript...
call npx tsc 2>nul

:: ── 7. Playwright Chromium (可选) ──
if not exist "%USERPROFILE%\.cache\ms-playwright" (
    echo   安装 Playwright Chromium...
    call npx playwright install chromium 2>nul || echo   [!] Playwright 安装失败, 抓取功能降级
)

:: ── 8. 启动 CLI ──
echo.
call node bin/tianyan.js
pause
