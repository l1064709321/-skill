// 技能持久化模块 — 自定义技能存到 ~/.tianyan/skills.json
// 内置技能列表 + 用户自定义技能 + 启用状态
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getSettings } from "./config.js";

export interface CustomSkill {
  name: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
  agents: string[];
  enabled: boolean;
  createdAt: number;
}

interface SkillStore {
  custom: CustomSkill[];
  builtinEnabled: Record<string, boolean>;
}

function skillsPath(): string {
  return join(getSettings().dataDir, "skills.json");
}

function emptyStore(): SkillStore {
  return { custom: [], builtinEnabled: {} };
}

function loadStore(): SkillStore {
  const path = skillsPath();
  if (!existsSync(path)) return emptyStore();
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as SkillStore;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: SkillStore): void {
  const path = skillsPath();
  mkdirSync(getSettings().dataDir, { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

// 内置技能 (只读清单)
export const BUILTIN_SKILLS: Array<{ name: string; label: string; category: string; description: string }> = [
  { name: "deconstruct", label: "拆书解构", category: "创作", description: "拆解对标畅销书的结构与钩子" },
  { name: "audit_novel", label: "35维审计", category: "审核", description: "按35个维度逐项审计小说章节" },
  { name: "detect_ai", label: "AI味检测", category: "审核", description: "检测正文中的AI味句式并给出修改建议" },
  { name: "ghostwrite", label: "代笔写作", category: "创作", description: "根据大纲代笔写作正文" },
  { name: "imitate_style", label: "文风仿写", category: "创作", description: "模仿指定作者的文风进行写作" },
  { name: "diagnose_opening", label: "开篇诊断", category: "审核", description: "诊断小说开篇钩子与吸引力的不足" },
  { name: "full_audit", label: "全面审计", category: "审核", description: "综合审计+AI味检测+开篇诊断" },
  { name: "match_author", label: "作家匹配", category: "辅助", description: "根据类型和文风匹配语料库作家" },
  { name: "get_author_reference", label: "作家风格参考", category: "辅助", description: "获取作家的创作方法论与范例片段" },
  { name: "analyze_style", label: "文风分析", category: "辅助", description: "分析正文的句式、节奏、用词特征" },
  { name: "skill_scout", label: "技能侦察", category: "辅助", description: "扫描可用技能并给出推荐" },
  { name: "web_search", label: "联网搜索", category: "网络", description: "通过Bing搜索获取实时网页结果" },
  { name: "web_fetch", label: "网页抓取", category: "网络", description: "抓取指定URL的正文内容" },
];

// 内置技能启用状态 (默认全部启用)
export function isBuiltinEnabled(name: string): boolean {
  const store = loadStore();
  if (store.builtinEnabled[name] !== undefined) return store.builtinEnabled[name]!;
  return true;
}

export function setBuiltinEnabled(name: string, enabled: boolean): void {
  const store = loadStore();
  store.builtinEnabled[name] = enabled;
  saveStore(store);
}

// 自定义技能 CRUD
export function listCustomSkills(): CustomSkill[] {
  return loadStore().custom;
}

export function addCustomSkill(
  name: string,
  label: string,
  icon: string,
  description: string,
  prompt: string,
  agents: string[],
): { ok: boolean; error?: string } {
  const store = loadStore();
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return { ok: false, error: "技能名只能含英文/数字/下划线" };
  if (store.custom.some((s) => s.name === name)) return { ok: false, error: `技能 ${name} 已存在` };
  if (BUILTIN_SKILLS.some((s) => s.name === name)) return { ok: false, error: `技能 ${name} 是内置技能, 不能覆盖` };
  store.custom.push({
    name, label, icon: icon || "⭐", description, prompt, agents,
    enabled: true, createdAt: Date.now(),
  });
  saveStore(store);
  return { ok: true };
}

export function removeCustomSkill(name: string): { ok: boolean } {
  const store = loadStore();
  store.custom = store.custom.filter((s) => s.name !== name);
  saveStore(store);
  return { ok: true };
}

export function setCustomSkillEnabled(name: string, enabled: boolean): { ok: boolean; error?: string } {
  const store = loadStore();
  const skill = store.custom.find((s) => s.name === name);
  if (!skill) return { ok: false, error: `技能 ${name} 不存在` };
  skill.enabled = enabled;
  saveStore(store);
  return { ok: true };
}

// 获取某 agent 应注入的自定义技能 prompt (只返回启用的)
export function getAgentSkillPrompts(agentName: string): string[] {
  const store = loadStore();
  return store.custom
    .filter((s) => s.enabled && s.agents.includes(agentName))
    .map((s) => `【技能:${s.label}】\n${s.prompt}`);
}
