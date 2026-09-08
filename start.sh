#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "  ${CYAN}✦ 天衍 (Tianyan) — 一键启动${NC}"
echo "  ============================================"
echo ""

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "  ${RED}[错误] 未检测到 Node.js${NC}"
    echo "  安装: https://nodejs.org/"
    exit 1
fi
echo -e "  ${GREEN}✓ Node.js $(node -v)${NC}"

# 2. 检查 Python (可选)
if command -v python3 &> /dev/null; then
    echo -e "  ${GREEN}✓ Python 3 可用 (技能桥接)${NC}"
else
    echo -e "  ${YELLOW}⚠ Python 3 未安装，技能桥接降级模式${NC}"
fi

# 3. 安装依赖
if [ ! -d "node_modules" ]; then
    echo "  📦 安装依赖..."
    npm install --no-audit --no-fund
fi

# 4. 编译 TypeScript
echo "  🔨 编译 TypeScript..."
npx tsc 2>/dev/null

# 5. 初始化配置 (不存在时从模板复制)
CONF_DIR="${HOME}/.tianyan"
CONF_FILE="${CONF_DIR}/config.yaml"
mkdir -p "$CONF_DIR" 2>/dev/null || true
if [ ! -f "$CONF_FILE" ]; then
    echo "  ⚙️  初始化配置 → ${CONF_FILE}"
    cp config.example.yaml "$CONF_FILE"
    sed -i "s|data_dir: ~/.tianyan|data_dir: ${CONF_DIR}|" "$CONF_FILE" 2>/dev/null || true
    echo -e "  ${YELLOW}⚠ 首次运行请编辑 ${CONF_FILE} 填入 API Key${NC}"
fi

# 6. Playwright 浏览器 (首次需要安装)
if command -v npx &> /dev/null && ! npx playwright install --dry-run chromium 2>/dev/null | grep -q "already installed"; then
    echo "  🌐 安装 Playwright Chromium 浏览器..."
    npx playwright install chromium 2>/dev/null || echo -e "  ${YELLOW}⚠ Playwright 浏览器安装失败，浏览器抓取功能降级${NC}"
fi

# 7. 随机端口 8000~9000
PORT=$((RANDOM % 1001 + 8000))

# 杀掉占用端口的旧进程
if command -v fuser &> /dev/null; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof &> /dev/null; then
    lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
fi
sleep 1

# 8. 后台启动服务
echo ""
echo -e "  ${GREEN}🚀 启动天衍 → http://localhost:${PORT}${NC}"
echo ""
TIANLAN_PORT="${PORT}" node dist/index.js &
SERVER_PID=$!

# 9. 等待服务就绪 (最多 30 秒)
READY=0
for i in $(seq 1 30); do
    if curl -s -o /dev/null --connect-timeout 1 "http://localhost:${PORT}/" 2>/dev/null; then
        READY=1
        break
    fi
    sleep 1
done

# 10. 自动打开浏览器 (跨平台)
if [ "${READY}" = "1" ]; then
    echo -e "  ${GREEN}🌐 正在自动打开浏览器...${NC}"
    sleep 1
    URL="http://localhost:${PORT}"
    if command -v xdg-open &> /dev/null; then
        (xdg-open "$URL" >/dev/null 2>&1 &)
    elif command -v open &> /dev/null; then
        (open "$URL" >/dev/null 2>&1 &)
    elif command -v start &> /dev/null; then
        (start "$URL" >/dev/null 2>&1 &)
    else
        echo -e "  ${YELLOW}⚠ 无法自动打开浏览器，请手动访问: ${URL}${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ 服务启动较慢，请稍后手动访问: http://localhost:${PORT}${NC}"
fi

# 11. 保持前台运行 (Ctrl+C 可中断)
wait "$SERVER_PID"
