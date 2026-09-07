// 配置管理: YAML + 环境变量 + 默认值
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import type { ModelConfig, Settings } from "./types.js";

const DEFAULT_MODEL: ModelConfig = {
  model: "deepseek/deepseek-v4-flash",
  temperature: 0.8,
  maxTokens: 4096,
};


// 7 Agent 标准配置
const DEFAULT_AGENTS: Record<string, import("./types.js").AgentConfig> = {
  orchestrator:           { maxDepth: 3, maxTurns: 16, maxSteps: 24, modelTier: "high", readonly: false },
  "story-architect":     { maxDepth: 2, maxTurns: 10, maxSteps: 16, modelTier: "high", readonly: false },
  "narrative-writer":    { maxDepth: 1, maxTurns: 6, maxSteps: 10, modelTier: "mid",  readonly: false },
  "character-designer":  { maxDepth: 1, maxTurns: 6, maxSteps: 10, modelTier: "mid",  readonly: false },
  "consistency-checker": { maxDepth: 1, maxTurns: 6, maxSteps: 10, modelTier: "mid",  readonly: true },
  "story-explorer":      { maxDepth: 1, maxTurns: 5, maxSteps: 6, modelTier: "low",  readonly: true },
  presenter:              { maxDepth: 1, maxTurns: 5, maxSteps: 6, modelTier: "low",  readonly: true },
};
const DEFAULT_SETTINGS: Settings = {
  dataDir: join(homedir(), ".tianyan"),
  dbPath: "",
  uploadDir: "",
  defaultModel: { ...DEFAULT_MODEL },
  models: [],
  maxSteps: 16,
  runMaxTokens: 200_000,
  runMaxCost: 1.0,
  loopDetectCount: 5,
  runMaxDuration: 1200,
  sseHeartbeatInterval: 5.0,
  chunkSize: 2000,
  chunkOverlap: 200,
  retrieveK: 6,
  serverHost: "0.0.0.0",
  serverPort: 8090,
  workflowMode: "state_machine" as const,
  agents: {},
};

let _settings: Settings | null = null;
let _configPath = "";

function loadYaml(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    return (parseYaml(raw) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

function modelFromDict(d: Record<string, unknown>): ModelConfig {
  return {
    model: String(d.model || DEFAULT_MODEL.model),
    apiKey: (d.api_key as string) || undefined,
    apiBase: (d.api_base as string) || undefined,
    temperature: Number(d.temperature) || DEFAULT_MODEL.temperature,
    maxTokens: Number(d.max_tokens) || DEFAULT_MODEL.maxTokens,
  };
}

export function loadSettings(configPath?: string): Settings {
  const path =
    configPath ||
    process.env.TIANYAN_CONFIG ||
    join(homedir(), ".tianyan", "config.yaml");

  const actualPath = existsSync(path) ? path : "config.yaml";
  _configPath = actualPath;
  const raw = loadYaml(actualPath);

  const dataDir = String(raw.data_dir || '') || process.env.TIANYAN_DATA_DIR || join(homedir(), ".tianyan");
  mkdirSync(dataDir, { recursive: true });
  const uploadDir = join(dataDir, "uploads");
  mkdirSync(uploadDir, { recursive: true });

  const defaultModel = modelFromDict((raw.default_model as Record<string, unknown>) || {});
  const models = ((raw.models as Record<string, unknown>[]) || []).map(modelFromDict);
  if (models.length === 0) models.push(defaultModel);

  const proxy = String(raw.proxy || '') || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || undefined;


  // Agent 配置: 从 YAML 读取, 合并默认值
  const rawAgents = (raw.agents as Record<string, Record<string, unknown>>) || {};
  const agents: Record<string, import("./types.js").AgentConfig> = {};
  for (const [name, defaults] of Object.entries(DEFAULT_AGENTS)) {
    const override = rawAgents[name] || {};
    agents[name] = {
      maxDepth: Number(override.max_depth) || defaults.maxDepth,
      maxTurns: Number(override.max_turns) || defaults.maxTurns,
      maxSteps: Number(override.max_steps) || defaults.maxSteps,
      modelTier: (override.model_tier as string) as import("./types.js").ModelTier || defaults.modelTier,
      readonly: override.readonly !== undefined ? Boolean(override.readonly) : defaults.readonly,
    };
  }

  const s: Settings = {
    dataDir,
    dbPath: join(dataDir, "novel.db"),
    uploadDir,
    defaultModel,
    models,
    maxSteps: Number(raw.max_steps) || DEFAULT_SETTINGS.maxSteps,
    runMaxTokens: Number(raw.run_max_tokens) || DEFAULT_SETTINGS.runMaxTokens,
    runMaxCost: Number(raw.run_max_cost) || DEFAULT_SETTINGS.runMaxCost,
    loopDetectCount: Number(raw.loop_detect_count) || DEFAULT_SETTINGS.loopDetectCount,
    runMaxDuration: Number(raw.run_max_duration) || DEFAULT_SETTINGS.runMaxDuration,
    sseHeartbeatInterval: Number(raw.sse_heartbeat_interval) || DEFAULT_SETTINGS.sseHeartbeatInterval,
    chunkSize: Number(raw.chunk_size) || DEFAULT_SETTINGS.chunkSize,
    chunkOverlap: Number(raw.chunk_overlap) || DEFAULT_SETTINGS.chunkOverlap,
    retrieveK: Number(raw.retrieve_k) || DEFAULT_SETTINGS.retrieveK,
    serverHost: (raw.server_host as string) || DEFAULT_SETTINGS.serverHost,
    serverPort: Number(process.env.TIANLAN_PORT) || Number(raw.server_port) || DEFAULT_SETTINGS.serverPort,
    proxy,
    agents,
    workflowMode: (raw.workflow_mode as "state_machine" | "crewai") || DEFAULT_SETTINGS.workflowMode,
  };

  _settings = s;
  return s;
}

export function getSettings(): Settings {
  if (!_settings) return loadSettings();
  return _settings;
}

export function reloadSettings(): Settings {
  return loadSettings(_configPath || undefined);
}

export function saveSettings(): void {
  const s = getSettings();
  const lines: string[] = [];
  lines.push(`data_dir: "${s.dataDir}"`);
  lines.push("");
  lines.push("default_model:");
  lines.push(`  model: "${s.defaultModel.model}"`);
  if (s.defaultModel.apiKey) lines.push(`  api_key: "${s.defaultModel.apiKey}"`);
  if (s.defaultModel.apiBase) lines.push(`  api_base: "${s.defaultModel.apiBase}"`);
  lines.push(`  temperature: ${s.defaultModel.temperature}`);
  lines.push(`  max_tokens: ${s.defaultModel.maxTokens}`);
  if (s.models.length > 1) {
    lines.push("");
    lines.push("models:");
    for (const m of s.models.slice(1)) {
      lines.push(`  - model: "${m.model}"`);
      if (m.apiKey) lines.push(`    api_key: "${m.apiKey}"`);
      if (m.apiBase) lines.push(`    api_base: "${m.apiBase}"`);
      lines.push(`    temperature: ${m.temperature}`);
      lines.push(`    max_tokens: ${m.maxTokens}`);
    }
  }
  lines.push("");
  lines.push(`max_steps: ${s.maxSteps}`);
  lines.push(`server_port: ${s.serverPort}`);
  lines.push(`server_host: "${s.serverHost}"`);
  lines.push(`run_max_duration: ${s.runMaxDuration}`);
  lines.push(`loop_detect_count: ${s.loopDetectCount}`);
  if (s.proxy) lines.push(`proxy: "${s.proxy}"`);
  lines.push("");
  lines.push("# Agent 参数配置 (max_depth: 委派深度, max_turns: 最大轮次)");
  lines.push("agents:");
  for (const [name, cfg] of Object.entries(s.agents)) {
    lines.push(`  ${name}:`);
    lines.push(`    max_depth: ${cfg.maxDepth}`);
    lines.push(`    max_turns: ${cfg.maxTurns}`);
    lines.push(`    max_steps: ${cfg.maxSteps}`);
    lines.push(`    model_tier: "${cfg.modelTier}"`);
    lines.push(`    readonly: ${cfg.readonly}`);
  }
  writeFileSync(_configPath, lines.join("\n") + "\n", "utf-8");
}
// 19 家厂商预设 (国内9 + 海外5 + 聚合4 + 本地1)
export const PROVIDER_PRESETS: {
  provider: string;
  label: string;
  models: string[];
  env: string;
  apiBase: string;
}[] = [
  // ===== 国内直连 (无需代理) =====
  // ---------- DeepSeek (https://api-docs.deepseek.com/quick_start/pricing) ----------
  // 2026-08-02 核实: 当前在售仅 V4 系列(Pro/Flash), deepseek-chat/reasoner 已退役
  { provider: "deepseek", label: "DeepSeek 深度求索", models: [
    "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash",
  ], env: "DEEPSEEK_API_KEY", apiBase: "https://api.deepseek.com/v1" },
  // ---------- 阿里云通义千问 DashScope (https://help.aliyun.com/zh/model-studio/models) ----------
  // 2026-08-02 核实: Qwen3.8-Max-Preview (2026-07-19) 当前最新旗舰, 2.4万亿参数 MoE, 100万上下文
  { provider: "dashscope", label: "阿里云通义千问 (DashScope)", models: [
    "dashscope/qwen3.8-max-preview", "dashscope/qwen3.7-max", "dashscope/qwen3.7-plus",
    "dashscope/qwen3.6-max-preview", "dashscope/qwen3.6-plus", "dashscope/qwen3.6-flash",
    "dashscope/qwq-32b",
  ], env: "DASHSCOPE_API_KEY", apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  // ---------- 智谱 GLM (https://docs.bigmodel.cn/api-reference/模型-api/对话补全异步) ----------
  { provider: "zai", label: "智谱 GLM (Z.AI)", models: [
    "zai/glm-5.2", "zai/glm-5.1", "zai/glm-5-turbo", "zai/glm-5",
    "zai/glm-4.7", "zai/glm-4.6", "zai/glm-4.5-air", "zai/glm-4.5-airx", "zai/glm-4.5-flash",
  ], env: "ZAI_API_KEY", apiBase: "https://open.bigmodel.cn/api/paas/v4" },
  // ---------- 月之暗面 Kimi (https://platform.kimi.com/docs/models) ----------
  { provider: "moonshot", label: "月之暗面 Kimi", models: [
    "moonshot/kimi-k3", "moonshot/kimi-k2.7-code", "moonshot/kimi-k2.6", "moonshot/kimi-k2.5",
  ], env: "MOONSHOT_API_KEY", apiBase: "https://api.moonshot.cn/v1" },
  // ---------- 火山引擎 豆包 Doubao ----------
  { provider: "volcengine", label: "火山引擎 豆包 Doubao", models: [
    "volcengine/doubao-seed-2-1-pro-260628", "volcengine/doubao-seed-2-1-turbo-260628",
    "volcengine/doubao-seed-evolving", "volcengine/doubao-seed-2-0-pro-260215",
    "volcengine/doubao-seed-2-0-lite-260428", "volcengine/doubao-seed-2-0-mini-260428",
    "volcengine/doubao-seed-2-0-code-preview-260215", "volcengine/doubao-seed-character-260628",
  ], env: "VOLCENGINE_API_KEY", apiBase: "https://ark.cn-beijing.volces.com/api/v3" },
  // ---------- 百度 文心 ERNIE (https://cloud.baidu.com/doc/WENXINWORKSHOP/) ----------
  // 通过千帆 v2 OpenAI 兼容接口调用, 需用 openai/ 前缀 + 自定义 base
  { provider: "baidu", label: "百度 文心 ERNIE (千帆)", models: [
    "openai/ernie-4.5-turbo-128k", "openai/ernie-4.5-turbo-8k", "openai/ernie-4.5-21b-a3b",
    "openai/ernie-4.0-turbo-128k", "openai/ernie-4.0-8k",
    "openai/ernie-speed-pro-128k", "openai/ernie-x1-turbo-128k",
  ], env: "ERNIE_API_KEY", apiBase: "https://qianfan.baidubce.com/v2" },
  // ---------- 小米 MiMo ----------
  { provider: "xiaomi", label: "小米 MiMo", models: [
    "openai/mimo-v2.5-pro", "openai/mimo-v2.5",
  ], env: "XIAOMI_API_KEY", apiBase: "https://api.xiaomimimo.com/v1" },
  // ---------- 华为盘古 MaaS (ModelArts) ----------
  { provider: "huawei", label: "华为盘古 MaaS (ModelArts)", models: [
    "openai/openpangu-2.0-flash", "openai/glm-5.2", "openai/kimi-k2.6",
    "openai/deepseek-v3.2",
    "openai/deepseek-v4-pro", "openai/deepseek-v4-flash",
  ], env: "MAAS_API_KEY", apiBase: "https://api.modelarts-maas.com/v2" },
  // ---------- 硅基流动 SiliconFlow (https://siliconflow.cn/models) ----------
  // 国内聚合开源模型: DeepSeek / Qwen / GLM / Kimi / LongCat 等
  { provider: "siliconflow", label: "硅基流动 SiliconFlow (聚合)", models: [
    "siliconflow/deepseek-ai/DeepSeek-V4-Pro",
    "siliconflow/deepseek-ai/DeepSeek-V4-Flash",
    "siliconflow/deepseek-ai/DeepSeek-V3.2",
    "siliconflow/zai-org/GLM-5.2", "siliconflow/zai-org/GLM-5.1",
    "siliconflow/moonshotai/Kimi-K3", "siliconflow/moonshotai/Kimi-K2.7-Code", "siliconflow/moonshotai/Kimi-K2.6",
    "siliconflow/Qwen/Qwen3.6-35B-A3B", "siliconflow/Qwen/Qwen3.6-27B", "siliconflow/Qwen/Qwen3.5-397B-A17B",
    "siliconflow/meituan-longcat/LongCat-2.0",
    "siliconflow/MiniMaxAI/MiniMax-M3",
  ], env: "SILICONFLOW_API_KEY", apiBase: "https://api.siliconflow.cn/v1" },
  // ===== 海外直连 (需代理或国内无法访问) =====
  // ---------- OpenAI (https://platform.openai.com/docs/models) ----------
  // 2026-08-02 核实: GPT-5.6 系列 2026-07-09 发布(限量预览), 07-30 降价
  //   三档: Sol 旗舰($5/$30) / Terra 均衡($2.50/$15) / Luna 极速($0.20/$1.20)
  { provider: "openai", label: "OpenAI", models: [
    "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna",
    "openai/gpt-5.5", "openai/gpt-5.5-pro",
    "openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5.4-pro",
  ], env: "OPENAI_API_KEY", apiBase: "https://api.openai.com/v1" },
  // ---------- Anthropic Claude ----------
  { provider: "anthropic", label: "Anthropic Claude", models: [
    "anthropic/claude-sonnet-4-20250514", "anthropic/claude-3-5-haiku-20241022",
  ], env: "ANTHROPIC_API_KEY", apiBase: "https://api.anthropic.com/v1" },
  // ---------- Google Gemini (https://ai.google.dev/gemini-api/docs/models) ----------
  // 2026-08-02 核实: Gemini 3.6 Flash (2026-07-21, Stable, 1M输入/64K输出) 当前最新主力
  { provider: "gemini", label: "Google Gemini", models: [
    "gemini/gemini-3.6-flash", "gemini/gemini-3.5-flash", "gemini/gemini-3.5-flash-lite",
    "gemini/gemini-3.1-pro", "gemini/gemini-3.1-flash", "gemini/gemini-3.1-flash-lite",
  ], env: "GEMINI_API_KEY", apiBase: "https://generativelanguage.googleapis.com/v1beta" },
  // ---------- xAI Grok (https://docs.x.ai/docs/models) ----------
  // 2026-08-02 核实: Grok 4.5 (2026-07-08) 当前旗舰, 1.5万亿参数 MoE, 50万上下文
  { provider: "xai", label: "xAI Grok", models: [
    "xai/grok-4.5", "xai/grok-4.3", "xai/grok-4.1", "xai/grok-4.1-mini",
  ], env: "XAI_API_KEY", apiBase: "https://api.x.ai/v1" },
  // ---------- Mistral AI (https://docs.mistral.ai/getting-started/models/models_overview/) ----------
  { provider: "mistral", label: "Mistral AI", models: [
    "mistral/mistral-large-latest",
    "mistral/mistral-medium-3-5", "mistral/mistral-medium-latest", "mistral/mistral-small-latest",
    "mistral/magistral-medium-latest", "mistral/magistral-small-latest",
    "mistral/codestral-latest", "mistral/devstral-latest",
    "mistral/ministral-14b-latest", "mistral/ministral-8b-latest", "mistral/ministral-3b-latest",
    "mistral/mistral-nemo",
  ], env: "MISTRAL_API_KEY", apiBase: "https://api.mistral.ai/v1" },
  // ===== 聚合平台 (一个 Key 用多家模型) =====
  // ---------- OpenRouter (https://openrouter.ai/models) ----------
  // 全球聚合: OpenAI / Google / Meta / Mistral 等几乎全部模型
  { provider: "openrouter", label: "OpenRouter (全球聚合)", models: [
    "openrouter/openai/gpt-5.6-sol", "openrouter/openai/gpt-5.6-terra", "openrouter/openai/gpt-5.6-luna",
    "openrouter/openai/gpt-5.5",
    "openrouter/google/gemini-3.6-flash", "openrouter/google/gemini-3.1-pro", "openrouter/google/gemini-3.1-flash",
    "openrouter/xai/grok-4.5",
    "openrouter/meta-llama/llama-3.3-70b-instruct",
    "openrouter/deepseek/deepseek-v4-flash",
    "openrouter/qwen/qwen-3.6",
    "openrouter/mistralai/mistral-large",
  ], env: "OPENROUTER_API_KEY", apiBase: "https://openrouter.ai/api/v1" },
  // ---------- Together AI (https://docs.together.ai/docs/inference-models) ----------
  { provider: "together_ai", label: "Together AI (聚合)", models: [
    "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    "together_ai/Qwen/Qwen3-235B-A22B-Instruct-Turbo",
    "together_ai/deepseek-ai/DeepSeek-V4-Flash",
    "together_ai/mistralai/Mistral-7B-Instruct-v0.3",
  ], env: "TOGETHERAI_API_KEY", apiBase: "https://api.together.xyz/v1" },
  // ---------- Fireworks AI ----------
  { provider: "fireworks_ai", label: "Fireworks AI (聚合)", models: [
    "fireworks_ai/accounts/fireworks/models/llama-v3p3-70b-instruct",
    "fireworks_ai/accounts/fireworks/models/qwen3-235b-a22b-instruct",
    "fireworks_ai/accounts/fireworks/models/deepseek-v3",
  ], env: "FIREWORKS_API_KEY", apiBase: "https://api.fireworks.ai/inference/v1" },
  // ---------- Agnes AI ----------
  { provider: "agnes", label: "Agnes AI", models: [
    "agnes/agnes-2.5-flash",
  ], env: "AGNES_API_KEY", apiBase: "https://apihub.agnes-ai.com/v1" },
  // ===== 本地部署 =====
  // ---------- Ollama 本地 (https://ollama.com/library) ----------
  { provider: "ollama", label: "Ollama 本地", models: [
    "ollama/qwen3-coder:30b", "ollama/qwen3:32b", "ollama/qwen3:14b", "ollama/qwen3:8b", "ollama/qwen3:4b",
    "ollama/qwen2.5:72b", "ollama/qwen2.5:32b", "ollama/qwen2.5:14b", "ollama/qwen2.5:7b", "ollama/qwen2.5:3b",
    "ollama/qwen2.5-coder:32b", "ollama/qwen2.5-coder:14b", "ollama/qwen2.5-coder:7b",
    "ollama/deepseek-r1:70b", "ollama/deepseek-r1:32b", "ollama/deepseek-r1:14b",
    "ollama/deepseek-r1:8b", "ollama/deepseek-r1:7b", "ollama/deepseek-r1:1.5b",
    "ollama/deepseek-v3:671b",
    "ollama/llama3.3:70b", "ollama/llama3.3:8b",
    "ollama/llama3.2:8b", "ollama/llama3.2:3b", "ollama/llama3.2:1b",
    "ollama/mistral:7b", "ollama/mistral-nemo",
    "ollama/gemma3:27b", "ollama/gemma3:12b", "ollama/gemma3:4b",
    "ollama/phi4:14b",
    "ollama/codestral:22b",
  ], env: "", apiBase: "http://localhost:11434/v1" },
];

function stripProviderPrefix(model: string): string {
  // agnes/agnes-2.5-flash -> agnes-2.5-flash; openai/gpt-4o -> gpt-4o
  const idx = model.indexOf("/");
  if (idx <= 0) return model;
  const provider = model.slice(0, idx);
  const rest = model.slice(idx + 1);
  // 已知聚合 provider 前缀才剥离, 避免误伤 openrouter/openai/gpt-5.6-sol 这类路径式模型名
  const stripable = new Set(["openai", "anthropic", "gemini", "deepseek", "mistral", "xai", "olan", "agnes", "zai", "zhipu", "glm", "moonshot", "dashscope", "volcengine", "baidu", "ernie", "qianfan", "siliconflow", "openrouter", "together_ai", "fireworks_ai"]);
  return stripable.has(provider) ? rest : model;
}

export function updateModelConfig(
  model: string,
  opts: { apiKey?: string; apiBase?: string; temperature?: number; maxTokens?: number },
): void {
  const s = getSettings();
  let target: ModelConfig | undefined = s.models.find((m) => m.model === model);
  const isNew = !target;
  if (isNew) {
    target = { ...DEFAULT_MODEL, model };
    s.models.push(target);
  }
  if (target) {
    // apiKey: 只有明确传入非空值才更新,空字符串/null/undefined不删除已有密钥
    if (opts.apiKey !== undefined && opts.apiKey !== null && opts.apiKey !== "") {
      target.apiKey = opts.apiKey;
    }
    if (opts.apiBase !== undefined) target.apiBase = opts.apiBase || undefined;
    if (opts.temperature !== undefined) target.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) target.maxTokens = opts.maxTokens;
  }
  if (isNew && target && (!s.models.length || !s.models.some((m) => m.model === s.defaultModel.model))) {
    s.defaultModel = target;
  }
  if (target && s.defaultModel.model === model) s.defaultModel = target;

  // 别名同步: agnes/agnes-2.5-flash 与 agnes-2.5-flash 是同一后端模型
  // 用户配置任一别名, 密钥/base/温度同步到另一别名, 避免"配置了却未生效"
  const stripped = stripProviderPrefix(model);
  const defaultStripped = stripProviderPrefix(s.defaultModel.model);
  if (stripped && stripped === defaultStripped && target && s.defaultModel.model !== model) {
    if (opts.apiKey !== undefined && opts.apiKey !== null && opts.apiKey !== "") s.defaultModel.apiKey = opts.apiKey;
    if (opts.apiBase !== undefined) s.defaultModel.apiBase = opts.apiBase || undefined;
    if (opts.temperature !== undefined) s.defaultModel.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) s.defaultModel.maxTokens = opts.maxTokens;
  }
  saveSettings();
}

export function removeModelConfig(model: string): void {
  const s = getSettings();
  s.models = s.models.filter((m) => m.model !== model);
  if (s.defaultModel.model === model) {
    s.defaultModel = s.models[0] || { ...DEFAULT_MODEL };
  }
  saveSettings();
}
