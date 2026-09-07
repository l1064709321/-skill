// LLM 统一接入层 — Node 原生 fetch, 支持所有 OpenAI 兼容 API
// 不再依赖 Python 子进程, 零延迟启动, 内置连接池
import { getSettings } from "./config.js";
import type { ModelConfig, ToolCall, ToolDefinition } from "./types.js";
import type { LLMResponse } from "./types.js";

const LLM_TIMEOUT_MS = 300_000;

// 已知 provider 前缀
const KNOWN_PROVIDERS = new Set([
  "openai", "azure", "anthropic", "gemini", "vertex_ai", "mistral",
  "deepseek", "dashscope", "zai", "zhipu", "glm", "moonshot", "ollama",
  "siliconflow", "openrouter", "together_ai", "fireworks_ai", "xai",
  "volcengine", "ark", "baidu", "ernie", "qianfan", "huawei", "xiaomi",
  "huggingface", "bedrock", "ai21", "cohere", "perplexity", "vllm",
  "agnes",
]);

const MODEL_HEURISTICS: [string, string][] = [
  ["gpt", "openai"], ["o1-", "openai"], ["o3-", "openai"], ["o4-", "openai"],
  ["claude", "anthropic"], ["gemini", "gemini"], ["deepseek", "deepseek"],
  ["glm-", "zai"], ["qwen", "dashscope"], ["qwq", "dashscope"],
  ["kimi", "moonshot"], ["doubao", "volcengine"], ["ernie", "baidu"],
  ["mimo", "xiaomi"], ["pangu", "huawei"], ["grok", "xai"],
  ["mistral", "mistral"], ["codestral", "mistral"],
  ["agnes-", "agnes"],
];

// Provider 默认 API base URL
const PROVIDER_BASES: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  zai: "https://open.bigmodel.cn/api/paas/v4",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  moonshot: "https://api.moonshot.cn/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  baidu: "https://qianfan.baidubce.com/v2",
  ernie: "https://qianfan.baidubce.com/v2",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  ollama: "http://localhost:11434/v1",
};

function normalizeModel(model: string, apiBase?: string): { provider: string; model: string } {
  const parts = model.split("/");
  if (parts.length >= 2 && KNOWN_PROVIDERS.has(parts[0]!.toLowerCase())) {
    return { provider: parts[0]!, model: parts.slice(1).join("/") };
  }
  if (apiBase) {
    // 有自定义 apiBase, 当作 openai 兼容
    return { provider: "openai", model };
  }
  const lower = model.toLowerCase();
  for (const [prefix, provider] of MODEL_HEURISTICS) {
    if (lower.startsWith(prefix)) {
      return { provider, model };
    }
  }
  return { provider: "openai", model };
}

function resolveBaseUrl(cfg: ModelConfig): string {
  if (cfg.apiBase) return cfg.apiBase.replace(/\/$/, "");
  const { provider } = normalizeModel(cfg.model);
  const base = PROVIDER_BASES[provider];
  if (base) return base;
  // 降级: 用 openai base
  return PROVIDER_BASES.openai!;
}

// 全局 fetch agent (连接池) — Node 22 原生 fetch 已自带连接池,无需额外 Agent
// 保留接口兼容但简化实现

// 构建 OpenAI 兼容请求体
function buildRequest(
  cfg: ModelConfig,
  messages: Array<{ role: string; content: string }>,
  opts: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    stop?: string[];
    tools?: ToolDefinition[];
  } = {},
): Record<string, unknown> {
  const { model } = normalizeModel(cfg.model);
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens: opts.maxTokens ?? cfg.maxTokens,
    stream: opts.stream ?? false,
  };
  if (opts.stop) body.stop = opts.stop;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  return body;
}

// 全局 HTTP 调用 (带重试)
async function callApi(
  cfg: ModelConfig,
  body: Record<string, unknown>,
  opts: { stream?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const baseUrl = resolveBaseUrl(cfg);
  const url = `${baseUrl}/chat/completions`;
  const timeout = opts.timeoutMs || LLM_TIMEOUT_MS;
  const { provider } = normalizeModel(cfg.model);

  // agnes: Node.js TLS 被 Cloudflare 阻断, 用 child_process 调 curl (安全参数传递)
  if (provider === "agnes") {
    const { spawnSync } = await import("child_process");
    const curlArgs = [
      "-s", "--max-time", String(Math.floor(timeout / 1000)),
      url,
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${cfg.apiKey || ""}`,
      "-H", "User-Agent: Tianyan/0.1.0",
      "-d", JSON.stringify(body),
    ];
    const result = spawnSync("curl", curlArgs, { timeout, maxBuffer: 10 * 1024 * 1024 });
    const data = (result.stdout || "").toString();
    const json = JSON.parse(data);
    return new Response(data, { status: json.error ? 400 : 200, headers: { "Content-Type": "application/json" } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        "User-Agent": "Tianyan/0.1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    } as RequestInit);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// 解析 OpenAI 标准响应 (支持原生 tool_calls)
function parseResponse(data: Record<string, unknown>): LLMResponse {
  const choices = data.choices as Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }> | undefined;
  const msg = choices?.[0]?.message;
  const content = msg?.content || "";
  const toolCalls: ToolCall[] | undefined = msg?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
  }));
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  return {
    content,
    model: data.model as string,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    usage: usage ? {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    } : undefined,
  };
}

// 重试逻辑 (指数退避, 429 尊重 Retry-After)
async function callWithRetry(
  cfg: ModelConfig,
  body: Record<string, unknown>,
  maxRetries = 2,
): Promise<LLMResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await callApi(cfg, body);
      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        return parseResponse(data);
      }
      // 429 限流: 尊重 Retry-After
      if (resp.status === 429) {
        const retryAfter = resp.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 2000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      // 5xx 服务器错误: 重试
      if (resp.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
      const errText = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 300)}`);
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      }
    }
  }
  throw lastError || new Error("LLM 调用失败");
}

// ===== 公开 API =====

export async function chat(
  messages: Array<{ role: string; content: string }>,
  cfg?: ModelConfig,
  opts: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] } = {},
): Promise<LLMResponse> {
  const model = cfg || getSettings().defaultModel;
  const body = buildRequest(model, messages, opts);
  return callWithRetry(model, body);
}

// 流式: 返回 AsyncGenerator<string>
// THINK_PREFIX: 用于分离 LLM 思考内容和回答内容
export const THINK_PREFIX = "::THINK::";
// TOOLCALL_PREFIX: 标记流式结束时的原生 tool_calls (JSON)
export const TOOLCALL_PREFIX = "::TOOLCALLS::";

export async function* stream(
  messages: Array<{ role: string; content: string }>,
  cfg?: ModelConfig,
  opts: { temperature?: number; maxTokens?: number; stop?: string[]; tools?: ToolDefinition[] } = {},
): AsyncGenerator<string> {
  const model = cfg || getSettings().defaultModel;
  const body = buildRequest(model, messages, { ...opts, stream: true });
  const { provider } = normalizeModel(model.model);

  // agnes: Node.js TLS 被 Cloudflare 阻断, 用 child_process 调 curl 做流式传输
  if (provider === "agnes") {
    const { spawn } = await import("child_process");
    const baseUrl = resolveBaseUrl(model);
    const url = `${baseUrl}/chat/completions`;
    const args = [
      "-s", "-N", "--max-time", "300",
      url,
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${model.apiKey || ""}`,
      "-H", "User-Agent: Tianyan/0.1.0",
      "-d", JSON.stringify(body),
    ];
    const curl = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    const rl = (await import("readline")).createInterface({ input: curl.stdout, crlfDelay: Infinity });
    curl.on("error", (e: any) => { throw new Error(`curl 启动失败: ${e.message}`); });
    curl.stderr?.on("data", () => {}); // 忽略 stderr
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; curl.kill(); }, 300000);
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    const tcIndex: Record<number, { id: string; name: string; arguments: string }> = {};
    for await (const line of rl) {
      if (timedOut) break;
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        const thinking = delta?.reasoning_content;
        const content = delta?.content;
        // 流式 tool_calls: 分片累加
        if (delta?.tool_calls) {
          for (const tcd of delta.tool_calls as Array<{ index: number; id?: string; type?: string; function: { name?: string; arguments?: string } }>) {
            const idx = tcd.index ?? 0;
            const entry = tcIndex[idx] || { id: "", name: "", arguments: "" };
            if (tcd.id) entry.id = tcd.id;
            if (tcd.function?.name) entry.name += tcd.function.name;
            if (tcd.function?.arguments) entry.arguments += tcd.function.arguments;
            tcIndex[idx] = entry;
          }
        }
        if (thinking) yield THINK_PREFIX + thinking;
        if (content) yield content;
      } catch { /* skip */ }
    }
    clearTimeout(timer);
    curl.kill();
    // 末尾输出 tool_calls (如果有)
    const finalTcs = Object.values(tcIndex).filter((t) => t.name);
    if (finalTcs.length > 0) {
      yield TOOLCALL_PREFIX + JSON.stringify(finalTcs.map((t) => ({ id: t.id || `call_${Date.now()}`, name: t.name, arguments: t.arguments })));
    }
    return;
  }
  const resp = await callApi(model, body, { stream: true });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`LLM 流式调用失败: HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }
  if (!resp.body) {
    throw new Error("LLM 流式响应无 body");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data) as Record<string, unknown>;
          const choices = chunk.choices as Array<{ delta?: { content?: string; reasoning_content?: string } }> | undefined;
          const thinking = choices?.[0]?.delta?.reasoning_content;
          const content = choices?.[0]?.delta?.content;
          if (thinking) yield THINK_PREFIX + thinking;
          if (content) yield content;
        } catch { /* skip malformed chunks */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// 测试连接
export async function testConnection(cfg: ModelConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await chat([{ role: "user", content: "hi" }], cfg, { maxTokens: 1 });
    return { ok: true, message: `连接成功! 模型: ${resp.model || cfg.model}` };
  } catch (e) {
    return { ok: false, message: `连接失败: ${(e as Error).message}` };
  }
}

// 友好错误提示
export function friendlyError(e: Error, cfg: ModelConfig): string {
  const msg = e.message.toLowerCase();
  const { provider } = normalizeModel(cfg.model);
  if (/(401|403|invalid api key|unauthorized|forbidden)/.test(msg)) {
    return `API Key 无效或权限不足。请检查 ${provider} 的 API Key。`;
  }
  if (/(429|rate limit|quota|too many requests)/.test(msg)) {
    return `请求频率超限或配额用完。请稍后重试。`;
  }
  if (/(404|model_not_found|not found|does not exist)/.test(msg)) {
    return `模型不存在: ${cfg.model}。请检查模型名拼写。`;
  }
  if (/(connection|timeout|timed out|refused|unreachable|proxy|ssl|certificate)/.test(msg)) {
    const s = getSettings();
    const hint = s.proxy ? `当前代理: ${s.proxy}` : "推荐用 DeepSeek/通义等国内模型, 无需代理";
    return `网络连接失败, 无法访问 ${provider} API。${hint}`;
  }
  return e.message;
}

// 获取 provider 列表 (供前端)
import { PROVIDER_PRESETS } from "./config.js";
export function getProviders(): Array<{ provider: string; label: string; models: string[]; env: string; apiBase: string }> {
  return PROVIDER_PRESETS;
}

// chatStream: stream的别名，兼容agent loop调用
export const chatStream = stream;

