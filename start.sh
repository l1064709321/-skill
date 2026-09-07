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

# 8. 启动 (通过环境变量传递端口)
echo ""
echo -e "  ${GREEN}🚀 启动天衍 → http://localhost:${PORT}${NC}"
echo ""
TIANLAN_PORT="${PORT}" node dist/index.js
