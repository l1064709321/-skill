// 天衍 (Tianyan) — TypeScript 重写版入口
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { corsMiddleware, authMiddleware } from "./security/auth.js";
import { loadSettings, getSettings, updateModelConfig, removeModelConfig, PROVIDER_PRESETS } from "./config.js";
import * as store from "./store.js";
import { initDb, createProject, getProject, listProjects, deleteProject, stats } from "./store.js";
import * as memory from "./memory/index.js";
import { executeCode } from "./security/sandbox.js";
import { chat, testConnection, friendlyError } from "./llm.js";
import { runAgentLoop } from "./agents/runner.js";
import { BUILTIN_SKILLS, isBuiltinEnabled, setBuiltinEnabled, listCustomSkills, addCustomSkill, removeCustomSkill, setCustomSkillEnabled, getAgentSkillPrompts } from "./skills.js";
import { getMeta, isValid, isReadonly, AGENT_TOOLS, getMaxDelegateDepth, DEFAULT_AGENT, AGENT_META, getAgentPrompt, WORKFLOW_PHASES } from "./agents/index.js";
import type { SSEEvent, AgentName } from "./types.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

loadSettings();
initDb();

const app = new Hono();
const s = getSettings();
app.use("*", corsMiddleware());
app.use("*", authMiddleware());

// ===== 健康检查 =====
app.get("/api/health", (c) => c.json({ status: "ok", version: "0.1.0-ts" }));

// ===== 配置 =====
app.get("/api/config", (c) => {
  const safeModels = s.models.map((m) => ({ ...m, apiKey: undefined, api_key: undefined, api_key_set: !!m.apiKey }));
  const safeDefault = { ...s.defaultModel, apiKey: undefined, api_key: undefined, api_key_set: !!s.defaultModel.apiKey };
  const hasKey = !!s.defaultModel.apiKey;
  return c.json({ defaultModel: safeDefault, models: safeModels, providers: PROVIDER_PRESETS, ready: hasKey, default: s.defaultModel.model });
});
app.get("/api/config/models", (c) => {
  const safeModels = s.models.map((m) => ({ ...m, apiKey: undefined, api_key: undefined, api_key_set: !!m.apiKey }));
  return c.json({ models: safeModels, providers: PROVIDER_PRESETS });
});
app.put("/api/config/model", async (c) => {
  const body = await c.req.json<{ model: string }>();
  if (body.model) {
    s.defaultModel.model = body.model;
    const found = s.models.find((m) => m.model === body.model);
    if (found) s.defaultModel = found;
  }
  return c.json({ ok: true, defaultModel: s.defaultModel });
});
app.post("/api/config/test-connection", async (c) => {
  let body: { model?: string; api_key?: string; api_base?: string } = {};
  try { body = await c.req.json(); } catch { /* 空body用默认配置 */ }
  const s = getSettings();
  const modelName = body.model || s.defaultModel.model;
  return c.json(await testConnection({
    model: modelName,
    apiKey: body.api_key || s.defaultModel.apiKey,
    apiBase: body.api_base || s.defaultModel.apiBase,
    temperature: 0.8,
    maxTokens: 100,
  }));
});

// ===== 设置 =====
app.get("/api/settings", (c) => {
  // 脱敏: 不暴露 apiKey 明文, 只标记是否已设置
  const safeModels = s.models.map((m) => ({
    ...m,
    // 统一 snake_case 字段给前端 (ModelConfig 内部用 camelCase, 前端面板读 snake_case)
    max_tokens: m.maxTokens || 4096,
    temperature: m.temperature ?? 0.8,
    apiKey: undefined,
    api_key: undefined,
    api_key_set: !!m.apiKey,
    ready: !!m.apiKey,
    api_base: (m as any).apiBase || (m as any).api_base || "",
  }));
  const safeDefault = { ...s.defaultModel, apiKey: undefined, api_key: undefined, ready: !!s.defaultModel.apiKey, api_key_set: !!s.defaultModel.apiKey };
  return c.json({
    defaultModel: safeDefault, models: safeModels, providers: PROVIDER_PRESETS,
    maxSteps: s.maxSteps, runMaxTokens: s.runMaxTokens, runMaxCost: s.runMaxCost,
    loopDetectCount: s.loopDetectCount, runMaxDuration: s.runMaxDuration,
    sseHeartbeatInterval: s.sseHeartbeatInterval, chunkSize: s.chunkSize,
    chunkOverlap: s.chunkOverlap, retrieveK: s.retrieveK, proxy: s.proxy, serverPort: s.serverPort,
  });
});
app.get("/api/settings/model/key", (c) => {
  const model = c.req.query("model");
  if (!model) return c.json({ error: "missing model" }, 400);
  const s = getSettings();
  const m = s.models.find((x) => x.model === model);
  return c.json({ api_key: m?.apiKey || "" });
});
app.put("/api/settings/model", async (c) => {
  const body = await c.req.json<{ model: string; api_key?: string; api_base?: string; temperature?: number; max_tokens?: number }>();
  updateModelConfig(body.model, { apiKey: body.api_key, apiBase: body.api_base, temperature: body.temperature, maxTokens: body.max_tokens });
  return c.json({ ok: true });
});
app.delete("/api/settings/model", async (c) => {
  const body = await c.req.json<{ model: string }>();
  removeModelConfig(body.model);
  return c.json({ ok: true });
});
app.put("/api/settings/agent", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  return c.json({ ok: true, settings: body });
});

// ===== 项目管理 =====
app.post("/api/projects", async (c) => {
  const body = await c.req.json<{ name: string; genre?: string; premise?: string; style?: string; audience?: string; chapters?: string[] }>();
  const id = createProject(body.name, body.genre, body.premise, body.style, body.audience);
  // 批量创建章节 (如果提供了章节列表)
  const chapters = body.chapters || [];
  const createdChapters = chapters.map((title, idx) => {
    const cid = store.addChapter(id, title, idx);
    return { id: cid, title, idx, status: "draft" };
  });
  return c.json({ id, ...body, chapters: createdChapters });
});
app.get("/api/projects", (c) => c.json(listProjects()));
app.get("/api/projects/:pid", (c) => {
  const p = getProject(c.req.param("pid"));
  if (!p) return c.json({ error: "not found" }, 404);
  return c.json({
    ...p,
    chapters: store.listChapters(p.id),
    elements: store.listElements(p.id),
    stats: stats(p.id),
  });
});
app.delete("/api/projects/:pid", (c) => {
  deleteProject(c.req.param("pid"));
  return c.json({ ok: true });
});

// ===== 章节管理 =====
app.get("/api/chapters/:cid", (c) => {
  const ch = store.getChapter(c.req.param("cid"));
  if (!ch) return c.json({ error: "not found" }, 404);
  return c.json(ch);
});
app.get("/api/projects/:pid/chapters", (c) => c.json(store.listChapters(c.req.param("pid"))));
app.post("/api/projects/:pid/chapters", async (c) => {
  const body = await c.req.json<{ title: string; idx?: number; outline?: string; content?: string }>();
  const id = store.addChapter(c.req.param("pid"), body.title, body.idx ?? 0, body.outline, body.content);
  return c.json({ id, ...body });
});
app.put("/api/chapters/:cid", async (c) => {
  const body = await c.req.json<{ title?: string; outline?: string; content?: string; status?: string }>();
  store.updateChapter(c.req.param("cid"), body);
  return c.json({ ok: true });
});
app.delete("/api/chapters/:cid", (c) => {
  store.deleteChapter(c.req.param("cid"));
  return c.json({ ok: true });
});

// ===== 元素管理 =====
app.get("/api/projects/:pid/elements", (c) => c.json(store.listElements(c.req.param("pid"))));
app.post("/api/projects/:pid/elements", async (c) => {
  const body = await c.req.json<{ kind: string; name: string; detail: string }>();
  const id = store.addElement(c.req.param("pid"), body.kind, body.name, body.detail);
  return c.json({ id, kind: body.kind, name: body.name, detail: body.detail });
});
app.delete("/api/elements/:eid", (c) => {
  store.deleteElement(c.req.param("eid"));
  return c.json({ ok: true });
});

// ===== 消息管理 =====
app.get("/api/projects/:pid/messages", (c) => c.json(store.listMessages(c.req.param("pid"), 200)));
app.delete("/api/projects/:pid/messages", (c) => {
  const count = store.deleteMessages(c.req.param("pid"));
  return c.json({ ok: true, deleted: count });
});

// ===== Runs =====
app.get("/api/projects/:pid/runs", (c) => c.json(store.listRuns(c.req.param("pid"))));
app.get("/api/runs/:runId", (c) => {
  const run = store.getRun(c.req.param("runId"));
  if (!run) return c.json({ error: "not found" }, 404);
  return c.json(run);
});
app.delete("/api/runs/:runId", (c) => {
  store.deleteRun(c.req.param("runId"));
  return c.json({ ok: true });
});

// ===== Metrics =====
app.get("/api/projects/:pid/metrics", (c) => {
  const db = store.getDb();
  const pid = c.req.param("pid");
  const totalChapters = (db.prepare("SELECT COUNT(*) as cnt FROM chapters WHERE project_id=?").get(pid) as any).cnt;
  const completedChapters = (db.prepare("SELECT COUNT(*) as cnt FROM chapters WHERE project_id=? AND status='done'").get(pid) as any).cnt;
  const writingChapters = (db.prepare("SELECT COUNT(*) as cnt FROM chapters WHERE project_id=? AND status='writing'").get(pid) as any).cnt;
  const totalChars = (db.prepare("SELECT COALESCE(SUM(LENGTH(content)),0) as cnt FROM chapters WHERE project_id=?").get(pid) as any).cnt;
  return c.json({ totalChapters, completedChapters, totalChars, writingChapters });
});

// ===== Sources / 搜索 =====
app.get("/api/projects/:pid/sources", (c) => c.json(store.listChunks(c.req.param("pid"))));
app.get("/api/projects/:pid/search", (c) => {
  const q = c.req.query("q") || "";
  if (!q) return c.json([]);
  return c.json(store.searchMessages(c.req.param("pid"), q));
});

// ===== Upload =====
app.post("/api/projects/:pid/upload", async (c) => {
  const pid = c.req.param("pid");
  try {
    const formData = await c.req.formData();
    const files = formData.getAll("files") as File[];
    const results: Array<{ name: string; chunks: number; size: number }> = [];
    for (const file of files) {
      const text = await file.text();
      const chunkSize = s.chunkSize;
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      for (let i = 0; i < chunks.length; i++) {
        store.addChunk(pid, file.name, i, chunks[i]!);
      }
      results.push({ name: file.name, chunks: chunks.length, size: file.size });
    }
    return c.json({ ok: true, files: results });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// ===== Export =====
app.get("/api/projects/:pid/export", (c) => {
  const fmt = c.req.query("fmt") || "txt";
  const data = store.getExportData(c.req.param("pid"), fmt);
  if (fmt === "json") return c.json(data);
  return new Response((data as { text: string }).text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});

// ===== 记忆 API =====
app.get("/api/projects/:pid/memories/short", (c) => {
  const sid = c.req.query("session_id") || "default";
  return c.json(memory.getSessionMemories(c.req.param("pid"), sid));
});
app.get("/api/projects/:pid/memories/long", (c) => {
  return c.json(memory.getLongTermMemories(c.req.param("pid")));
});
app.post("/api/projects/:pid/memories/short", async (c) => {
  const body = await c.req.json<{ session_id?: string; category: string; topic: string; content: string }>();
  const sid = body.session_id || "default";
  const id = memory.saveSessionMemory(c.req.param("pid"), sid, body.category, body.topic, body.content, "user");
  return c.json({ ok: true, id });
});
app.post("/api/projects/:pid/memories/long", async (c) => {
  const body = await c.req.json<{ category: string; topic: string; content: string; priority?: number }>();
  const id = memory.saveLongTermMemory(c.req.param("pid"), body.category, body.topic, body.content, "user", body.priority || 5);
  return c.json({ ok: true, id });
});
app.get("/api/projects/:pid/memory", (c) => {
  const longMems = memory.getLongTermMemories(c.req.param("pid"));
  const context = memory.getMemoryContext(c.req.param("pid"));
  return c.json({ longTerm: longMems, context });
});
app.get("/api/projects/:pid/memory/search", (c) => {
  const q = c.req.query("q") || "";
  return c.json(memory.searchLongTermMemories(c.req.param("pid"), q));
});

// ===== 计划/审批/检查点 (占位) =====
app.get("/api/projects/:pid/plan", (c) => c.json({ plan: [] }));
app.post("/api/projects/:pid/plan", async (c) => c.json({ ok: true }));
app.get("/api/projects/:pid/approvals", (c) => c.json([]));
app.post("/api/approvals/:requestId/approve", async (c) => c.json({ ok: true }));
app.post("/api/approvals/:requestId/reject", (async (c) => c.json({ ok: true })));
app.get("/api/projects/:pid/checkpoints", (c) => c.json([]));
app.get("/api/projects/:pid/checkpoints/latest", (c) => c.json(null));
app.get("/api/launcher/restart", (c) => c.json({ ok: true, message: "TS版不支持热重启" }));
app.get("/launcher", (c) => c.json({ ok: true }));

// ===== Agent 运行 (SSE) =====
// 共享 SSE 执行函数 (chat 和 run 共用)
function buildSseStream(pid: string, userInput: string, agentName: AgentName, sessionId?: string) {
  const sid = sessionId || randomBytes(6).toString("hex");
  const proj = getProject(pid);
  const memoryCtx = memory.getMemoryContext(pid);
  const sessionMems = memory.getSessionMemories(pid, sid);
  const messages: Array<{ role: string; content: string }> = [];

  if (proj) {
    messages.push({ role: "system", content: `当前项目: ${proj.name}\n频道: ${proj.audience || "未指定"}\n类型: ${proj.genre}\n文风: ${proj.style}\n核心设定: ${proj.premise}` });
  }
  if (memoryCtx) messages.push({ role: "system", content: `【长期记忆】\n${memoryCtx}` });
  if (sessionMems.length) {
    messages.push({ role: "system", content: `【短期记忆】\n${sessionMems.map((m) => `- [${m.category}] ${m.topic}: ${m.content}`).join("\n")}` });
  }

  const skillPrompts = getAgentSkillPrompts(agentName);
  const skillBlock = skillPrompts.length ? "\n\n" + skillPrompts.join("\n\n") : "";
  messages.push({ role: "system", content: getAgentPrompt(agentName) + skillBlock + "\n可用工具: " + AGENT_TOOLS[agentName].join(", ") + "\n需要调用工具时输出 JSON: {\"tool\": \"工具名\", \"args\": {...}}\n否则直接回复。" });

  // 加载最近的对话历史，实现多轮对话上下文
  const histMsgs = store.listMessages(pid, 40);
  for (const m of histMsgs) {
    // 过滤思考/工具消息 (tool_name 非空), 避免污染 LLM 多轮上下文
    const _toolName = (m as unknown as { tool_name?: string }).tool_name;
    if ((m.role === "user" || m.role === "assistant") && !_toolName) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({ role: "user", content: userInput });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (evt: SSEEvent) => { if (!closed) { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)); } catch { closed = true; } } };
      send({ type: "start", agent: agentName, input: userInput.slice(0, 200) });
      store.addMessage(pid, "user", userInput);
      const runId = store.createRun(pid, userInput, agentName);
      const sharedSteps = { value: 0 };
      try {
        await runAgentLoop({ pid, agentName, messages, depth: 0, runId, delegationLog: [], emit: send, sharedSteps });
      } catch (e) {
        send({ type: "error", message: friendlyError(e as Error, s.defaultModel) });
      }
      send({ type: "done", agent: agentName, steps: sharedSteps.value, stats: stats(pid), runId });
      closed = true;
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return stream;
}

const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", Connection: "keep-alive" } as const;

app.post("/api/projects/:pid/chat", async (c) => {
  const pid = c.req.param("pid");
  // 项目必须存在
  if (!getProject(pid)) return c.json({ error: "项目不存在" }, 404);
  let body: { input: string; agent?: string; sessionId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "请求体不是有效 JSON" }, 400);
  }
  const { input: userInput, sessionId } = body;
  const agentName = (body.agent || DEFAULT_AGENT) as AgentName;
  if (!userInput) return c.json({ error: "缺少 input" }, 400);
  if (!isValid(agentName)) return c.json({ error: `无效 agent: ${agentName}` }, 400);
  const stream = buildSseStream(pid, userInput, agentName, sessionId);
  return new Response(stream, { headers: SSE_HEADERS });
});

// ===== Agent 运行 (通用) =====
app.post("/api/run", async (c) => {
  let body: { pid: string; input: string; agent?: string; sessionId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "请求体不是有效 JSON" }, 400);
  }
  const { pid, input: userInput, sessionId } = body;
  const agentName = (body.agent || DEFAULT_AGENT) as AgentName;
  if (!pid) return c.json({ error: "缺少 pid" }, 400);
  if (!getProject(pid)) return c.json({ error: "项目不存在" }, 404);
  if (!userInput) return c.json({ error: "缺少 input" }, 400);
  if (!isValid(agentName)) return c.json({ error: `无效 agent: ${agentName}` }, 400);
  const stream = buildSseStream(pid, userInput, agentName, sessionId);
  return new Response(stream, { headers: SSE_HEADERS });
});

// ===== 模型配置 =====
app.get("/api/models", (c) => c.json({ defaultModel: s.defaultModel, models: s.models, providers: PROVIDER_PRESETS }));
app.post("/api/models", async (c) => {
  const body = await c.req.json<{ model: string; api_key?: string; api_base?: string; temperature?: number; max_tokens?: number }>();
  updateModelConfig(body.model, { apiKey: body.api_key, apiBase: body.api_base, temperature: body.temperature, maxTokens: body.max_tokens });
  return c.json({ ok: true });
});
app.delete("/api/models/:model", (c) => { removeModelConfig(decodeURIComponent(c.req.param("model"))); return c.json({ ok: true }); });
app.post("/api/models/test", async (c) => {
  const body = await c.req.json<{ model: string; api_key?: string; api_base?: string }>();
  return c.json(await testConnection({ model: body.model, apiKey: body.api_key, apiBase: body.api_base, temperature: 0.8, maxTokens: 100 }));
});

// ===== 沙箱 =====
app.post("/api/sandbox/run", async (c) => {
  const body = await c.req.json<{ code: string; timeout?: number }>();
  return c.json(await executeCode(body.code, body.timeout));
});

// ===== Agent 列表 =====
app.get("/api/agents", (c) => c.json({
  agents: AGENT_META,
  default: DEFAULT_AGENT,
  max_delegate_depth: getMaxDelegateDepth,
  workflow_phases: WORKFLOW_PHASES,
  readonly_agents: ["consistency-checker", "story-explorer", "presenter"],
}));

// ===== 技能列表 (真实持久化) =====
app.get("/api/skills", (c) => {
  const s = getSettings();
  return c.json({
    skills: BUILTIN_SKILLS.map((b) => ({
      name: b.name, label: b.label, category: b.category,
      description: b.description, enabled: isBuiltinEnabled(b.name),
      custom: false,
    })),
    custom: listCustomSkills(),
    model: s.defaultModel.model,
  });
});
app.post("/api/skills/:name/toggle", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({ enabled: undefined }));
  // 内置 vs 自定义
  const isBuiltin = BUILTIN_SKILLS.some((b) => b.name === name);
  const enabled = body.enabled !== undefined ? body.enabled : !(isBuiltin ? isBuiltinEnabled(name) : listCustomSkills().find((s) => s.name === name)?.enabled);
  if (isBuiltin) {
    setBuiltinEnabled(name, enabled);
  } else {
    const r = setCustomSkillEnabled(name, enabled);
    if (!r.ok) return c.json(r, 400);
  }
  return c.json({ ok: true, skill: name, enabled });
});
app.post("/api/skills/custom", async (c) => {
  const body = await c.req.json<{ name: string; label: string; icon?: string; description?: string; prompt: string; agents: string[] }>();
  const r = addCustomSkill(body.name, body.label, body.icon || "", body.description || "", body.prompt, body.agents || []);
  if (!r.ok) return c.json(r, 400);
  return c.json({ ok: true, name: body.name });
});
app.delete("/api/skills/custom/:name", (c) => c.json(removeCustomSkill(c.req.param("name"))));

// ===== 静态前端 =====
const webDir = join(import.meta.dirname || ".", "..", "web");
const APP_VERSION = "0.2.0";
const NO_CACHE = { "Cache-Control": "no-cache, no-store, must-revalidate" };
const serveHtml = (c: any, file: string) => {
  try {
    const html = readFileSync(join(webDir, file), "utf-8").replace(/__VERSION__/g, APP_VERSION);
    return c.html(html, 200, NO_CACHE);
  } catch { return c.text("天衍 - web/ 目录未找到", 404); }
};
const serveFile = (c: any, file: string, contentType: string) => {
  try { return c.text(readFileSync(join(webDir, file), "utf-8"), 200, { "Content-Type": contentType, ...NO_CACHE }); }
  catch { return c.text("", 404); }
};
const serveFileHtml = (c: any, file: string) => {
  try { return c.html(readFileSync(join(webDir, file), "utf-8"), 200, NO_CACHE); }
  catch { return c.text("", 404); }
};
if (existsSync(webDir)) {
  app.get("/", (c) => serveHtml(c, "index.html"));
  app.get("/index.html", (c) => serveHtml(c, "index.html"));
  // /static/ 前缀路由
  app.use("/static/style.css", async (c) => serveFile(c, "style.css", "text/css"));
  app.use("/static/app.js", async (c) => serveFile(c, "app.js", "application/javascript"));
  app.use("/static/novel-card.html", async (c) => serveFileHtml(c, "novel-card.html"));
  // 兼容无前缀路由
  app.use("/style.css", async (c) => serveFile(c, "style.css", "text/css"));
  app.use("/app.js", async (c) => serveFile(c, "app.js", "application/javascript"));
  app.use("/novel-card.html", async (c) => serveFileHtml(c, "novel-card.html"));
  // 预览页面
  app.use("/preview", async (c) => serveFileHtml(c, "preview.html"));
  app.use("/preview.html", async (c) => serveFileHtml(c, "preview.html"));
  app.use("/static/preview.html", async (c) => serveFileHtml(c, "preview.html"));
  // 浏览器截图产物
  app.get("/screenshots/:file", async (c) => {
    const file = c.req.param("file");
    if (!/^[A-Za-z0-9._-]+$/.test(file)) return c.text("bad request", 400);
    const fp = join(s.dataDir, "screenshots", file);
    if (!existsSync(fp)) return c.text("not found", 404);
    return c.body(readFileSync(fp), 200, { "Content-Type": "image/png", ...NO_CACHE });
  });
  app.get("/exports/:file", async (c) => {
    const file = c.req.param("file");
    if (!/^[A-Za-z0-9._一-龥-]+$/.test(file)) return c.text("bad request", 400);
    const fp = join(s.dataDir, "exports", file);
    if (!existsSync(fp)) return c.text("not found", 404);
    const isJson = file.endsWith(".json");
    return new Response(readFileSync(fp, "utf-8"), {
      headers: {
        "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file)}"`,
        ...NO_CACHE,
      },
    });
  });
}

// ===== 启动 =====
const port = s.serverPort;
console.log(`\n✦ 天衍 (Tianyan) TypeScript v0.1.0`);
console.log(`  地址: http://localhost:${port}`);
console.log(`  模型: ${s.defaultModel.model}`);
console.log(`  数据: ${s.dataDir}\n`);
serve({ fetch: app.fetch, port }, () => console.log(`  ✓ 服务已启动`));
