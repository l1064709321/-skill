#!/usr/bin/env python3
"""天衍 — 启动入口 (npm wrapper)

用法:
  python run.py          # 自动检测 Node.js 并启动
  python run.py --help   # 显示帮助

等价于:
  npm start
"""
import subprocess, sys, os, shutil

def main():
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        return

    # 检查 node
    node = shutil.which("node")
    if not node:
        print("[错误] 未检测到 Node.js")
        print("安装: https://nodejs.org/")
        sys.exit(1)

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # 安装依赖
    if not os.path.isdir("node_modules"):
        print("  正在安装依赖...")
        subprocess.run(["npm", "install"], check=True)

    # 编译
    print("  正在编译...")
    subprocess.run(["npx", "tsc"], check=False)

    # 启动
    print("  正在启动服务...")
    os.execvp("node", ["node", "dist/index.js"])

if __name__ == "__main__":
    main()
