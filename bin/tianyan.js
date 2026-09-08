#!/usr/bin/env node
// 天衍 CLI 启动器
// 功能: 随机端口(8000~9000) + 启动服务 + 自动打开浏览器
// 用法: tianyan  |  node bin/tianyan.js  |  npm start
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const entry = join(root, "dist", "index.js");

if (!existsSync(entry)) {
  console.error("\n  [天衍] 未找到 dist/index.js，请先构建:");
  console.error("  npm run build\n");
  process.exit(1);
}

// 1. 端口: 已设置 TIANLAN_PORT 则沿用, 否则随机 8000~9000
const PORT = Number(process.env.TIANLAN_PORT) || 8000 + Math.floor(Math.random() * 1001);

// 2. 启动服务
const url = `http://localhost:${PORT}`;
console.log(`  🚀 启动天衍 → ${url}`);
const child = spawn(process.execPath, [entry], {
  env: { ...process.env, TIANLAN_PORT: String(PORT) },
  stdio: "inherit",
});

// 3. 轮询等待端口就绪, 然后自动打开浏览器
let opened = false;
let probes = 0;
const probe = () => {
  if (opened || probes++ > 60) { clearInterval(timer); return; }
  const sock = createConnection(PORT, "127.0.0.1");
  sock.once("connect", () => {
    sock.destroy();
    opened = true;
    clearInterval(timer);
    console.log(`  🌐 正在自动打开浏览器: ${url}`);
    setTimeout(() => openBrowser(url), 600);
  });
  sock.once("error", () => sock.destroy());
};
const timer = setInterval(probe, 500);
probe();

function openBrowser(target) {
  const open = (cmd, args) => {
    try {
      const p = spawn(cmd, args, { stdio: "ignore", detached: true });
      p.on("error", () => console.log(`  ⚠ 自动打开浏览器失败，请手动访问: ${target}`));
      p.unref();
    } catch {
      console.log(`  ⚠ 自动打开浏览器失败，请手动访问: ${target}`);
    }
  };
  if (process.platform === "win32") {
    open("cmd", ["/c", "start", "", target]);
  } else if (process.platform === "darwin") {
    open("open", [target]);
  } else {
    open("xdg-open", [target]);
  }
}

// 4. 跟随服务退出
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(`  [天衍] 服务进程启动失败: ${err.message}`);
  process.exit(1);
});
