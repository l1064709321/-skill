class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;
  async acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release(): void {
    if (this.queue.length > 0) { this.queue.shift()!(); }
    else { this.locked = false; }
  }
}
const _mutex = new Mutex();

// SQLite 持久化层 — better-sqlite3 (同步, 高性能)
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { getSettings } from "./config.js";
import type { Project, Chapter, Element, Chunk, Message, Run, CharacterProfile } from "./types.js";

let _db: Database.Database | null = null;

function uuid(): string {
  return randomBytes(6).toString("hex");
}

function now(): number {
  return Date.now() / 1000;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const s = getSettings();
  mkdirSync(dirname(s.dbPath), { recursive: true });
  _db = new Database(s.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

export function initDb(): void {
  const db = getDb();
  // 迁移: 确保 projects 表有 current_phase 列
  try {
    db.prepare("SELECT current_phase FROM projects LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE projects ADD COLUMN current_phase INTEGER DEFAULT 1");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, genre TEXT, premise TEXT,
      style TEXT, audience TEXT DEFAULT '', meta TEXT DEFAULT '{}', current_phase INTEGER DEFAULT 1, created_at REAL
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, idx INTEGER NOT NULL,
      outline TEXT, content TEXT DEFAULT '', status TEXT DEFAULT 'draft', created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
      name TEXT NOT NULL, detail TEXT NOT NULL, created_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source TEXT NOT NULL, idx INTEGER NOT NULL,
      text TEXT NOT NULL, embedding TEXT, created_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      tool_name TEXT, tool_call_id TEXT, created_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS foreshadowings (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL,
      planted_chapter INTEGER, expected_recovery INTEGER, actual_recovery INTEGER,
      status TEXT DEFAULT 'planted', created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, event TEXT NOT NULL,
      chapter_idx INTEGER, time_in_story TEXT, cause TEXT, effect TEXT, created_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS character_states (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, character_name TEXT NOT NULL,
      current_state TEXT NOT NULL, latest_chapter INTEGER, created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_input TEXT NOT NULL,
      entry_agent TEXT NOT NULL, status TEXT DEFAULT 'running', total_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0, total_steps INTEGER DEFAULT 0, total_cache_hit_tokens INTEGER DEFAULT 0,
      total_cache_miss_tokens INTEGER DEFAULT 0, error TEXT,
      started_at REAL NOT NULL, ended_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, type TEXT NOT NULL, agent TEXT,
      tool TEXT, input TEXT, output TEXT, duration_ms INTEGER, error TEXT,
      seq INTEGER, ts REAL, tokens INTEGER DEFAULT 0, cost REAL DEFAULT 0,
      cache_hit_tokens INTEGER DEFAULT 0, cache_miss_tokens INTEGER DEFAULT 0,
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS character_profiles (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      role TEXT, personality TEXT, speech_style TEXT, behavior_logic TEXT,
      motivation TEXT, arc TEXT, growth_state TEXT, created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS world_entries (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, attributes TEXT DEFAULT '{}', related_chars TEXT DEFAULT '[]',
      created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'pending',
      reached_chapter INTEGER, created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS style_cache (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL,
      features TEXT DEFAULT '{}', keywords TEXT DEFAULT '{}', created_at REAL,
      UNIQUE(project_id, chapter_idx),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    -- 短期记忆 (session-scoped, TTL 过期)
    CREATE TABLE IF NOT EXISTS session_memories (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, session_id TEXT NOT NULL,
      category TEXT NOT NULL, topic TEXT NOT NULL, content TEXT NOT NULL,
      source TEXT DEFAULT 'auto', relevance REAL DEFAULT 1.0,
      created_at REAL, expires_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sm_project ON session_memories(project_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_sm_topic ON session_memories(project_id, topic);
    -- 长期记忆 (persistent, 可被 supersede)
    CREATE TABLE IF NOT EXISTS long_term_memories (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, category TEXT NOT NULL,
      topic TEXT NOT NULL, content TEXT NOT NULL, source TEXT DEFAULT 'agent',
      priority INTEGER DEFAULT 5, superseded_by TEXT, created_at REAL, updated_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ltm_project ON long_term_memories(project_id, category);
    CREATE INDEX IF NOT EXISTS idx_ltm_topic ON long_term_memories(project_id, topic);
    -- 记忆冲突日志
    CREATE TABLE IF NOT EXISTS memory_conflicts (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, old_memory_id TEXT NOT NULL,
      new_memory_id TEXT NOT NULL, resolution TEXT NOT NULL, reason TEXT, created_at REAL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
  // 中断恢复: 孤儿 run 标记为 interrupted
  db.prepare("UPDATE runs SET status='interrupted' WHERE status='running'").run();
  db.prepare("UPDATE chapters SET status='failed' WHERE status='generating'").run();
}

// ----- Projects -----
function withLock<T>(fn: () => T): T {
  // better-sqlite3 is synchronous and Node.js is single-threaded,
  // so the spinlock is unnecessary. Use a try/catch for safety.
  return fn();
}

export function createProject(name: string, genre = "", premise = "", style = "", audience = ""): string {
  return withLock(() => {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO projects (id, name, genre, premise, style, audience, meta, current_phase, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, name, genre, premise, style, audience, "{}", 1, now());
  return id;
  });
}

export function getProject(pid: string): Project | undefined {
  return getDb().prepare("SELECT * FROM projects WHERE id=?").get(pid) as Project | undefined;
}

export function getProjectState(pid: string): {
  currentPhase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  hasCharacters: boolean;
  hasWorld: boolean;
  hasOutline: boolean;
  hasContent: boolean;
  hasChapters: boolean;
} {
  const proj = getProject(pid);
  const currentPhase = (proj?.currentPhase ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const characters = listCharacterProfiles(pid);
  const worldEntries = listWorldEntries(pid);
  const chapters = listChapters(pid);
  const hasOutline = chapters.some(c => c.outline?.length > 0);
  const hasContent = chapters.some(c => c.content?.length > 0);
  return {
    currentPhase,
    hasCharacters: characters.length > 0,
    hasWorld: worldEntries.length > 0,
    hasOutline,
    hasContent,
    hasChapters: chapters.length > 0,
  };
}

export function updateProjectPhase(pid: string, phase: number): void {
  getDb().prepare("UPDATE projects SET current_phase=? WHERE id=?").run(phase, pid);
}

export function listProjects(): Project[] {
  return getDb().prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
}

export function deleteProject(pid: string): void {
  const db = getDb();
  // 显式清理全部关联表 (不依赖外键级联, 双保险; 有 project_id 直接删, run_events 经 runs 间接删)
  const del = db.transaction(() => {
    db.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE project_id=?)").run(pid);
    db.prepare("DELETE FROM runs WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM style_cache WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM milestones WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM world_entries WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM character_profiles WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM timeline_events WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM foreshadowings WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM character_states WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM session_memories WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM long_term_memories WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM memory_conflicts WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM messages WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM chunks WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM elements WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM chapters WHERE project_id=?").run(pid);
    db.prepare("DELETE FROM projects WHERE id=?").run(pid);
  });
  del();
  // 物理收缩: WAL checkpoint 后 VACUUM 释放磁盘空间, 否则删除的行仍占文件
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.exec("VACUUM");
  } catch { /* VACUUM 失败不阻塞删除 */ }
}

// ----- Chapters -----
export function addChapter(pid: string, title: string, idx: number, outline = "", content = ""): string {
  const id = uuid();
  const t = now();
  getDb().prepare(
    "INSERT INTO chapters (id,project_id,title,idx,outline,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, title, idx, outline, content, "draft", t, t);
  return id;
}

export function getChapter(cid: string): Chapter | undefined {
  return getDb().prepare("SELECT * FROM chapters WHERE id=?").get(cid) as Chapter | undefined;
}

export function listChapters(pid: string): Chapter[] {
  return getDb().prepare("SELECT * FROM chapters WHERE project_id=? ORDER BY idx").all(pid) as Chapter[];
}

export function updateChapter(cid: string, fields: Partial<Pick<Chapter, "title" | "outline" | "content" | "status">>): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && ["title", "outline", "content", "status"].includes(k)) {
      sets.push(`${k}=?`);
      vals.push(v);
    }
  }
  if (!sets.length) return;
  sets.push("updated_at=?");
  vals.push(now(), cid);
  getDb().prepare(`UPDATE chapters SET ${sets.join(",")} WHERE id=?`).run(...vals);
}

export function deleteChapter(cid: string): void {
  getDb().prepare("DELETE FROM chapters WHERE id=?").run(cid);
}

// ----- Elements -----
export function addElement(pid: string, kind: string, name: string, detail: string): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO elements (id,project_id,kind,name,detail,created_at) VALUES (?,?,?,?,?,?)"
  ).run(id, pid, kind, name, detail, now());
  return id;
}

export function listElements(pid: string): Element[] {
  return getDb().prepare("SELECT * FROM elements WHERE project_id=? ORDER BY created_at").all(pid) as Element[];
}

// ----- Messages -----
export function addMessage(pid: string, role: string, content: string, opts?: { toolName?: string; toolCallId?: string }): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO messages (id,project_id,role,content,tool_name,tool_call_id,created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(id, pid, role, content, opts?.toolName ?? null, opts?.toolCallId ?? null, now());
  return id;
}

export function listMessages(pid: string, limit = 50): Message[] {
  return getDb().prepare(
    "SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT ?"
  ).all(pid, limit).reverse() as Message[];
}

// ----- Runs -----
export function createRun(pid: string, userInput: string, agentName: string): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO runs (id,project_id,user_input,entry_agent,status,started_at) VALUES (?,?,?,?,?,?)"
  ).run(id, pid, userInput, agentName, "running", now());
  return id;
}

export function finishRun(runId: string, status = "done"): void {
  getDb().prepare("UPDATE runs SET status=?, ended_at=? WHERE id=?").run(status, now(), runId);
}

export function addRunEvent(runId: string, eventType: string, opts?: Record<string, unknown>): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO run_events (id,run_id,seq,ts,type,agent,tool,input,output,duration_ms,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    id, runId, (opts?.seq as number) ?? 0, (opts?.ts as number) ?? Date.now() / 1000, eventType,
    opts?.agent ?? null, opts?.tool ?? null,
    opts?.input_ ? JSON.stringify(opts.input_) : null,
    opts?.output ? String(opts.output).slice(0, 2000) : null,
    opts?.duration_ms ?? null,
    opts?.error ?? null,
  );
  return id;
}

// ----- Stats -----
export function stats(pid: string): Record<string, number> {
  const chapters = listChapters(pid);
  const elements = listElements(pid);
  return {
    chapters: chapters.length,
    totalChapters: chapters.length,
    completedChapters: chapters.filter((c) => c.status === "done" || c.status === "reviewed" || c.status === "revision_needed").length,
    totalElements: elements.length,
    totalMessages: (getDb().prepare("SELECT COUNT(*) as c FROM messages WHERE project_id=?").get(pid) as { c: number }).c,
  };
}

// ----- Character Profiles -----
export function upsertCharacterProfile(
  pid: string, name: string,
  fields: Partial<Pick<CharacterProfile, "role" | "personality" | "speechStyle" | "behaviorLogic" | "motivation" | "arc" | "growthState">>,
): string {
  const t = now();
  const existing = getDb().prepare(
    "SELECT id FROM character_profiles WHERE project_id=? AND name=?"
  ).get(pid, name) as { id: string } | undefined;
  if (existing) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const colMap: Record<string, string> = {
      role: "role", personality: "personality", speechStyle: "speech_style",
      behaviorLogic: "behavior_logic", motivation: "motivation", arc: "arc", growthState: "growth_state",
    };
    for (const [k, col] of Object.entries(colMap)) {
      if (fields[k as keyof typeof fields] !== undefined) {
        sets.push(`${col}=?`);
        vals.push(fields[k as keyof typeof fields]);
      }
    }
    if (sets.length) {
      sets.push("updated_at=?");
      vals.push(t, existing.id);
      getDb().prepare(`UPDATE character_profiles SET ${sets.join(",")} WHERE id=?`).run(...vals);
    }
    return existing.id;
  }
  const id = uuid();
  getDb().prepare(
    "INSERT INTO character_profiles (id,project_id,name,role,personality,speech_style,behavior_logic,motivation,arc,growth_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, name, fields.role ?? null, fields.personality ?? null,
    fields.speechStyle ?? null, fields.behaviorLogic ?? null, fields.motivation ?? null,
    fields.arc ?? null, fields.growthState ?? null, t, t);
  return id;
}

export function listCharacterProfiles(pid: string): CharacterProfile[] {
  return getDb().prepare("SELECT * FROM character_profiles WHERE project_id=? ORDER BY created_at").all(pid) as CharacterProfile[];
}

export function getCharacterProfile(pid: string, name: string): CharacterProfile | undefined {
  return getDb().prepare("SELECT * FROM character_profiles WHERE project_id=? AND name=?").get(pid, name) as CharacterProfile | undefined;
}

// ----- Chunks (检索用) -----
export function listChunks(pid: string): Chunk[] {
  return getDb().prepare("SELECT * FROM chunks WHERE project_id=? ORDER BY idx").all(pid) as Chunk[];
}

export function addChunk(pid: string, source: string, idx: number, text: string): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO chunks (id,project_id,source,idx,text,created_at) VALUES (?,?,?,?,?,?)"
  ).run(id, pid, source, idx, text, now());
  return id;
}

// ----- Foreshadowings -----
export function listForeshadowings(pid: string): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM foreshadowings WHERE project_id=?").all(pid) as Array<Record<string, unknown>>;
}

// ----- Timeline -----
export function listTimelineEvents(pid: string): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM timeline_events WHERE project_id=?").all(pid) as Array<Record<string, unknown>>;
}

// ----- Character States -----
export function listCharacterStates(pid: string): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM character_states WHERE project_id=?").all(pid) as Array<Record<string, unknown>>;
}

// ----- Style Cache -----
export function upsertStyleCache(pid: string, chapterIdx: number, features: string, keywords: string): string {
  const existing = getDb().prepare(
    "SELECT id FROM style_cache WHERE project_id=? AND chapter_idx=?"
  ).get(pid, chapterIdx) as { id: string } | undefined;
  if (existing) {
    getDb().prepare("UPDATE style_cache SET features=?, keywords=?, created_at=? WHERE id=?")
      .run(features, keywords, now(), existing.id);
    return existing.id;
  }
  const id = uuid();
  getDb().prepare(
    "INSERT INTO style_cache (id,project_id,chapter_idx,features,keywords,created_at) VALUES (?,?,?,?,?,?)"
  ).run(id, pid, chapterIdx, features, keywords, now());
  return id;
}

// ----- World Entries -----
export function addWorldEntry(pid: string, category: string, name: string, description: string, attributes = "{}", relatedChars = "[]"): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO world_entries (id,project_id,category,name,description,attributes,related_chars,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, category, name, description, attributes, relatedChars, now(), now());
  return id;
}

export function listWorldEntries(pid: string, category?: string): Array<Record<string, unknown>> {
  if (category) {
    return getDb().prepare("SELECT * FROM world_entries WHERE project_id=? AND category=? ORDER BY created_at").all(pid, category) as Array<Record<string, unknown>>;
  }
  return getDb().prepare("SELECT * FROM world_entries WHERE project_id=? ORDER BY category, created_at").all(pid) as Array<Record<string, unknown>>;
}

export function updateWorldEntry(id: string, fields: { description?: string; attributes?: string; related_chars?: string }): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.description !== undefined) { sets.push("description=?"); vals.push(fields.description); }
  if (fields.attributes !== undefined) { sets.push("attributes=?"); vals.push(fields.attributes); }
  if (fields.related_chars !== undefined) { sets.push("related_chars=?"); vals.push(fields.related_chars); }
  if (!sets.length) return;
  sets.push("updated_at=?"); vals.push(now());
  vals.push(id);
  getDb().prepare(`UPDATE world_entries SET ${sets.join(",")} WHERE id=?`).run(...vals);
}

export function deleteWorldEntry(id: string): void {
  getDb().prepare("DELETE FROM world_entries WHERE id=?").run(id);
}

// ----- Milestones -----
export function addMilestone(pid: string, chapterIdx: number, title: string, description = ""): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO milestones (id,project_id,chapter_idx,title,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(id, pid, chapterIdx, title, description, "pending", now(), now());
  return id;
}

export function listMilestones(pid: string): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM milestones WHERE project_id=? ORDER BY chapter_idx").all(pid) as Array<Record<string, unknown>>;
}

export function updateMilestone(id: string, fields: { status?: string; reached_chapter?: number; description?: string }): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.status !== undefined) { sets.push("status=?"); vals.push(fields.status); }
  if (fields.reached_chapter !== undefined) { sets.push("reached_chapter=?"); vals.push(fields.reached_chapter); }
  if (fields.description !== undefined) { sets.push("description=?"); vals.push(fields.description); }
  if (!sets.length) return;
  sets.push("updated_at=?"); vals.push(now());
  vals.push(id);
  getDb().prepare(`UPDATE milestones SET ${sets.join(",")} WHERE id=?`).run(...vals);
}

export function deleteMilestone(id: string): void {
  getDb().prepare("DELETE FROM milestones WHERE id=?").run(id);
}

// ----- Foreshadowings -----
export function addForeshadowing(pid: string, name: string, content: string, plantedChapter: number, expectedRecovery?: number): string {
  const id = uuid();
  getDb().prepare(
    "INSERT INTO foreshadowings (id,project_id,name,content,planted_chapter,expected_recovery,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, name, content, plantedChapter, expectedRecovery ?? null, "planted", now(), now());
  return id;
}

export function listForeshadowings2(pid: string): Array<Record<string, unknown>> {
  return getDb().prepare("SELECT * FROM foreshadowings WHERE project_id=? ORDER BY planted_chapter").all(pid) as Array<Record<string, unknown>>;
}

export function updateForeshadowing(id: string, fields: { status?: string; actual_recovery?: number }): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.status !== undefined) { sets.push("status=?"); vals.push(fields.status); }
  if (fields.actual_recovery !== undefined) { sets.push("actual_recovery=?"); vals.push(fields.actual_recovery); }
  if (!sets.length) return;
  sets.push("updated_at=?"); vals.push(now());
  vals.push(id);
  getDb().prepare(`UPDATE foreshadowings SET ${sets.join(",")} WHERE id=?`).run(...vals);
}

export function deleteForeshadowing(id: string): void {
  getDb().prepare("DELETE FROM foreshadowings WHERE id=?").run(id);
}

// ----- Outline (chapter outline management) -----
export function updateChapterOutline(cid: string, outline: string): void {
  getDb().prepare("UPDATE chapters SET outline=?, updated_at=? WHERE id=?").run(outline, now(), cid);
}

// ===== 补充的 store 函数 (供前端 API 使用) =====

export function listRuns(pid: string, limit = 50): Run[] {
  return getDb().prepare(
    "SELECT * FROM runs WHERE project_id=? ORDER BY started_at DESC LIMIT ?"
  ).all(pid, limit) as Run[];
}

export function getRun(runId: string): Run | undefined {
  return getDb().prepare("SELECT * FROM runs WHERE id=?").get(runId) as Run | undefined;
}

export function deleteRun(runId: string): void {
  getDb().prepare("DELETE FROM runs WHERE id=?").run(runId);
}

export function deleteMessages(pid: string): number {
  return getDb().prepare("DELETE FROM messages WHERE project_id=?").run(pid).changes;
}

export function deleteElement(eid: string): void {
  getDb().prepare("DELETE FROM elements WHERE id=?").run(eid);
}

export function searchMessages(pid: string, query: string, limit = 50): Message[] {
  const q = `%${query}%`;
  return getDb().prepare(
    "SELECT * FROM messages WHERE project_id=? AND (content LIKE ? OR tool_name LIKE ?) ORDER BY created_at DESC LIMIT ?"
  ).all(pid, q, q, limit) as Message[];
}

export function getMetrics(pid: string) {
  const db = getDb();
  const proj = db.prepare("SELECT * FROM projects WHERE id=?").get(pid) as Project | undefined;
  const chapters = db.prepare("SELECT COUNT(*) as cnt, SUM(LENGTH(content)) as total_chars FROM chapters WHERE project_id=?").get(pid) as { cnt: number; total_chars: number };
  const runs = db.prepare("SELECT COUNT(*) as cnt, SUM(total_tokens) as tokens, SUM(total_cost) as cost FROM runs WHERE project_id=?").get(pid) as { cnt: number; tokens: number; cost: number };
  const elements = db.prepare("SELECT COUNT(*) as cnt FROM elements WHERE project_id=?").get(pid) as { cnt: number };
  const profiles = db.prepare("SELECT COUNT(*) as cnt FROM character_profiles WHERE project_id=?").get(pid) as { cnt: number };
  const foreshadows = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='recovered' THEN 1 ELSE 0 END) as recovered FROM foreshadowings WHERE project_id=?").get(pid) as { total: number; recovered: number };
  return {
    project: proj,
    chapters: { count: chapters.cnt, totalChars: chapters.total_chars || 0 },
    runs: { count: runs.cnt, totalTokens: runs.tokens || 0, totalCost: runs.cost || 0 },
    elements: elements.cnt,
    characterProfiles: profiles.cnt,
    foreshadowings: { total: foreshadows.total, recovered: foreshadows.recovered || 0 },
  };
}

export function getExportData(pid: string, fmt = "txt") {
  const proj = getProject(pid);
  const chapters = listChapters(pid).sort((a, b) => a.idx - b.idx);
  if (fmt === "json") {
    return { project: proj, chapters: chapters.map((c) => ({ title: c.title, idx: c.idx, outline: c.outline, content: c.content, status: c.status })) };
  }
  // txt format
  let text = `《${proj?.name || "未命名"}》\n${"=".repeat(40)}\n\n`;
  for (const ch of chapters) {
    text += `# 第${ch.idx + 1}章 ${ch.title}\n\n`;
    text += (ch.content || ch.outline || "（无内容）") + "\n\n";
  }
  return { text, project: proj };
}
