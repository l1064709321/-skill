#!/usr/bin/env node
// ============================================================
// 天衍 (Tianyan) — 交互式 CLI 启动器
// 启动后弹出中文引导界面，可跳过配置直接启动，也可逐步配置
// ============================================================
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import * as readline from "node:readline";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const entry = join(root, "dist", "index.js");

// ---- 颜色 ----
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};
const c = (color, text) => `${C[color]}${text}${C.reset}`;

// ---- 预设 ----
const DEFAULT_KEY = "";
const DEFAULT_BASE = "https://apihub.agnes-ai.com/v1";
const DEFAULT_MODEL = "agnes/agnes-2.5-flash";

const PRESET_MODELS = [
  { label: "Agnes AI (默认, 国内直连)", model: DEFAULT_MODEL, base: DEFAULT_BASE },
  { label: "DeepSeek V4 Flash (国内直连)", model: "deepseek/deepseek-v4-flash", base: "https://api.deepseek.com/v1" },
  { label: "阿里云通义千问 Qwen3.6-Plus (国内直连)", model: "dashscope/qwen3.6-plus", base: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { label: "智谱 GLM-5.2 (国内直连)", model: "zai/glm-5.2", base: "https://open.bigmodel.cn/api/paas/v4" },
  { label: "月之暗面 Kimi-K2.7 (国内直连)", model: "moonshot/kimi-k2.7-code", base: "https://api.moonshot.cn/v1" },
  { label: "OpenAI GPT-5.6 (需代理)", model: "openai/gpt-5.6-terra", base: "https://api.openai.com/v1" },
  { label: "Google Gemini 3.6 (需代理)", model: "gemini/gemini-3.6-flash", base: "https://generativelanguage.googleapis.com/v1beta" },
  { label: "Ollama 本地 (无需密钥)", model: "ollama/qwen3:14b", base: "http://localhost:11434/v1" },
  { label: "其他模型 (自行输入)", model: "__custom__", base: "" },
];

// ---- CLI flags (高级用户可跳过交互) ----
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h")      { flags.help = true; }
  else if (a === "--no-browser")         { flags.noBrowser = true; }
  else if (a === "--port" || a === "-p") { flags.port = Number(args[++i]); }
  else if (a === "--api-key")            { flags.apiKey = args[++i]; }
  else if (a === "--model" || a === "-m"){ flags.model = args[++i]; }
  else if (a === "--config" || a === "-c"){ flags.config = args[++i]; }
  else if (a === "--no-interactive" || a === "-y") { flags.skip = true; }
}

// ---- 帮助 ----
if (flags.help) {
  console.log(`
  ${c("cyan", "✦")} ${c("cyan", "天衍")} 多 Agent 协同创作系统

  ${c("cyan", "用法:")}
    tianyan                              交互式引导启动 (推荐)
    tianyan --api-key sk-xxx             跳过引导，指定密钥
    tianyan --model deepseek-v4-flash    跳过引导，指定模型
    tianyan -y                           跳过引导，使用默认配置
    tianyan --port 8080                  指定端口
    tianyan --config ./config.yaml       指定配置文件
    tianyan --no-browser                 不自动打开浏览器
    tianyan --help                       显示此帮助

  ${c("cyan", "环境变量 (优先级低于 CLI 参数):")}
    TIANYAN_PORT            端口
    TIANYAN_API_KEY         API 密钥
    TIANYAN_MODEL           模型名称
    TIANYAN_CONFIG          配置文件路径
    TIANYAN_DATA_DIR        数据目录 (默认 ~/.tianyan)
`);
  process.exit(0);
}

// ---- 初始化配置 ----
const confDir = join(homedir(), ".tianyan");
const confFile = flags.config || process.env.TIANYAN_CONFIG || join(confDir, "config.yaml");

function initConfig() {
  mkdirSync(confDir, { recursive: true });
  if (!existsSync(confFile)) {
    const examplePath = join(root, "config.example.yaml");
    if (existsSync(examplePath)) {
      let cfg = readFileSync(examplePath, "utf-8");
      cfg = cfg.replace(/data_dir:\s*~\/\.tianyan/, `data_dir: "${confDir}"`);
      writeFileSync(confFile, cfg, "utf-8");
    } else {
      writeFileSync(confFile, `data_dir: "${confDir}"
server_port: 8000

default_model:
  model: "${DEFAULT_MODEL}"
  api_key: "${DEFAULT_KEY}"
  api_base: "${DEFAULT_BASE}"
  temperature: 0.8
  max_tokens: 4096
`, "utf-8");
    }
    return true; // 首次初始化
  }
  return false;
}

// ---- 交互式引导 ----
function ask(rl, question, defaultVal) {
  return new Promise((resolve) => {
    const hint = defaultVal !== undefined ? ` ${c("dim", `(${defaultVal})`)}` : "";
    rl.question(`  ${question}${hint}\n  ${c("cyan", "❯")} `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || (defaultVal !== undefined ? String(defaultVal) : ""));
    });
  });
}

async function interactiveWizard() {
  console.log("");
  console.log("");
  console.log(c("cyan", "  ╔══════════════════════════════╗"));
  console.log(c("cyan", "  ║") + "                            " + c("cyan", "║"));
  console.log(c("cyan", "  ║") + "      " + c("cyan", "【  天  衍  】") + "        " + c("cyan", "║"));
  console.log(c("cyan", "  ║") + "                            " + c("cyan", "║"));
  console.log(c("cyan", "  ╚══════════════════════════════╝"));
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // 第一屏: 是否跳过
    const skipAns = await ask(rl, "是否跳过配置，直接使用默认设置启动？", "Y");
    const isSkip = skipAns.toLowerCase() !== "n" && skipAns.toLowerCase() !== "no" && skipAns !== "否";

    if (isSkip) {
      console.log("");
      console.log(`  ${c("cyan", "✓")} ${c("cyan", "跳过配置，使用默认设置")}`);
      console.log(`    模型: ${c("cyan", DEFAULT_MODEL)}`);
      console.log(`    密钥: ${c("red", "未配置")}`);
      console.log(`    ${c("cyan", "⚠")} 首次使用请在前端「模型配置」界面填入 API Key，否则无法调用模型`);
      console.log(`    端口: ${c("cyan", "随机 8000~9000")}`);
      console.log("");
      rl.close();
      return { apiKey: DEFAULT_KEY, model: DEFAULT_MODEL, base: DEFAULT_BASE };
    }

    // 逐步配置
    console.log("");
    console.log(`  ${c("cyan", "━━━ 开始配置 ━━━")}`);
    console.log("");

    // 1. 选择模型
    console.log(`  ${c("cyan", "[1/3] 选择模型")}`);
    console.log("");
    PRESET_MODELS.forEach((p, i) => {
      const num = c("cyan", String(i + 1).padStart(2, " "));
      const label = i === 0 ? `${p.label} ${c("cyan", "★推荐")}` : p.label;
      console.log(`    ${num}. ${label}`);
    });
    console.log("");

    const modelChoice = await ask(rl, "输入编号选择模型", "1");
    const modelIdx = Math.max(0, Math.min(parseInt(modelChoice) - 1, PRESET_MODELS.length - 1));
    let selectedModel = PRESET_MODELS[modelIdx];
    let apiKey = DEFAULT_KEY;
    let apiBase = selectedModel.base;

    // 自定义模型
    if (selectedModel.model === "__custom__") {
      const customModel = await ask(rl, "输入模型名称 (如 openai/gpt-5.6-terra)");
      selectedModel = { ...selectedModel, model: customModel };
    }

    console.log(`  ${c("cyan", "✓")} 模型: ${c("cyan", selectedModel.model)}`);
    console.log("");

    // 2. API Key
    console.log(`  ${c("cyan", "[2/3] 配置 API Key")}`);
    if (selectedModel.base.includes("localhost")) {
      console.log(`  ${c("dim", "  本地 Ollama 无需密钥，直接跳过")}`);
      apiKey = "";
    } else {
      const defaultKeyHint = "无默认密钥，请输入";
      const keyInput = await ask(rl, `输入 API Key (${defaultKeyHint})`, "");
      if (keyInput) {
        apiKey = keyInput;
        console.log(`  ${c("cyan", "✓")} 密钥: ${c("dim", keyInput.slice(0,8) + "..." + keyInput.slice(-4))}`);
      } else {
        console.log(`  ${c("cyan", "⚠")} 未输入密钥，如需调用模型请在前端「模型配置」中补充`);
      }
    }
    console.log("");

    // 3. API Base
    if (apiBase && !apiBase.includes("localhost")) {
      const baseInput = await ask(rl, `API 地址`, apiBase);
      apiBase = baseInput;
      console.log(`  ${c("cyan", "✓")} API地址: ${c("dim", apiBase)}`);
    }
    console.log("");

    // 4. 端口
    console.log(`  ${c("cyan", "[3/3] 设置端口")}`);
    const portInput = await ask(rl, "输入端口号", "随机");
    const port = portInput && !isNaN(Number(portInput)) ? Number(portInput) : undefined;
    if (port) {
      console.log(`  ${c("cyan", "✓")} 端口: ${c("cyan", String(port))}`);
    } else {
      console.log(`  ${c("cyan", "✓")} 端口: ${c("cyan", "随机 8000~9000")}`);
    }

    console.log("");
    console.log(`  ${c("cyan", "✓")} ${c("cyan", "配置完成，即将启动...")}`);
    console.log("");

    rl.close();
    return { apiKey, model: selectedModel.model, base: apiBase, port };

  } catch (err) {
    rl.close();
    throw err;
  }
}

// ---- 启动服务 ----
async function main() {
  const firstRun = initConfig();

  // CLI 参数优先级最高: 有参数时跳过交互
  const hasFlags = flags.apiKey || flags.model || flags.port || flags.skip || flags.noBrowser;
  if (hasFlags) {
    const port = flags.port || Number(process.env.TIANLAN_PORT) || Number(process.env.TIANYAN_PORT) || 8000 + Math.floor(Math.random() * 1001);
    const env = { ...process.env, TIANLAN_PORT: String(port) };
    if (flags.apiKey) env.TIANYAN_API_KEY = flags.apiKey;
    if (flags.model)  env.TIANYAN_MODEL = flags.model;
    await startService(env, port, flags.noBrowser);
    return;
  }

  // 无参数 + 非 TTY (管道/脚本模式) → 用默认配置启动，不弹引导
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const port = Number(process.env.TIANLAN_PORT) || 8000 + Math.floor(Math.random() * 1001);
    const env = { ...process.env, TIANLAN_PORT: String(port) };
    await startService(env, port, true);
    return;
  }

  const config = await interactiveWizard();
  const env = { ...process.env, TIANLAN_PORT: String(config.port || 8000 + Math.floor(Math.random() * 1001)) };
  if (config.apiKey) env.TIANYAN_API_KEY = config.apiKey;
  if (config.model)  env.TIANYAN_MODEL = config.model;
  await startService(env, Number(env.TIANLAN_PORT), false);
}

function startService(env, port, noBrowser) {
  if (!existsSync(entry)) {
    console.error(`\n  ${c("red", "[错误]")} 未找到 dist/index.js，请先构建:`);
    console.error(`  ${c("yellow", "npm run build")}\n`);
    process.exit(1);
  }

  const url = `http://localhost:${port}`;
  console.log("");
  console.log(c("cyan", "  ╔══════════════════════════════╗"));
  console.log(c("cyan", "  ║") + "                            " + c("cyan", "║"));
  console.log(c("cyan", "  ║") + "      " + c("cyan", "【  天  衍  】") + "        " + c("cyan", "║"));
  console.log(c("cyan", "  ║") + "                            " + c("cyan", "║"));
  console.log(c("cyan", "  ╚══════════════════════════════╝"));
  console.log(`${c("cyan", "  地址:")} ${c("cyan", url)}`);
  console.log("");

  const child = spawn(process.execPath, [entry], { env, stdio: "inherit" });

  if (!noBrowser) {
    let opened = false;
    let probes = 0;
    const probe = () => {
      if (opened || probes++ > 60) { clearInterval(timer); return; }
      const sock = createConnection(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        opened = true;
        clearInterval(timer);
        setTimeout(() => openBrowser(url), 600);
      });
      sock.once("error", () => sock.destroy());
    };
    const timer = setInterval(probe, 500);
    probe();
  }

  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error(`  ${c("red", "[错误]")} 启动失败: ${err.message}`);
    process.exit(1);
  });
}

function openBrowser(target) {
  const open = (cmd, args) => {
    try {
      const p = spawn(cmd, args, { stdio: "ignore", detached: true });
      p.on("error", () => console.log(`  ${c("cyan", "⚠")} 无法自动打开浏览器，请手动访问: ${target}`));
      p.unref();
    } catch { console.log(`  ${c("cyan", "⚠")} 无法自动打开浏览器，请手动访问: ${target}`); }
  };
  if (process.platform === "win32")      open("cmd", ["/c", "start", "", target]);
  else if (process.platform === "darwin") open("open", [target]);
  else                                   open("xdg-open", [target]);
}

main().catch((err) => {
  console.error(`\n  ${c("red", "[错误]")} ${err.message}`);
  process.exit(1);
});
