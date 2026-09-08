#!/usr/bin/env bash
# 快捷入口: 等同于 tianyan.sh (CLI 一键启动, 无需 Docker)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/tianyan.sh" "$@"
