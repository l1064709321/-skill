// 统一记忆系统: 短期 + 长期 + 冲突解决
import { getDb } from "../store.js";
import { randomBytes } from "node:crypto";
import type { SessionMemory, LongTermMemory, MemoryConflict, MemorySource } from "../types.js";

function uuid(): string { return randomBytes(6).toString("hex"); }
function now(): number { return Date.now() / 1000; }

const SOURCE_PRIORITY: Record<string, number> = { user: 10, agent: 5, auto: 1 };
function sourcePriority(s: string): number { return SOURCE_PRIORITY[s] || 1; }

const SESSION_TTL = 24 * 3600; // 24 小时

// ===== 短期记忆 =====

export function saveSessionMemory(
  pid: string, sessionId: string, category: string, topic: string,
  content: string, source: MemorySource = "auto", relevance = 1.0,
): string {
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM session_memories WHERE project_id=? AND session_id=? AND topic=? AND expires_at>?"
  ).get(pid, sessionId, topic, now()) as SessionMemory | undefined;

  if (existing) {
    const oldPri = sourcePriority(existing.source);
    const newPri = sourcePriority(source);
    if (newPri > oldPri || (newPri === oldPri && now() > existing.createdAt)) {
      // 新记忆胜出: 旧的过期
      db.prepare("UPDATE session_memories SET expires_at=? WHERE id=?").run(now(), existing.id);
    } else {
      // 合并
      db.prepare("UPDATE session_memories SET content=? WHERE id=?").run(
        existing.content + "\n" + content, existing.id,
      );
      return existing.id;
    }
  }

  const id = uuid();
  const t = now();
  db.prepare(
    "INSERT INTO session_memories (id,project_id,session_id,category,topic,content,source,relevance,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, sessionId, category, topic, content, source, relevance, t, t + SESSION_TTL);
  return id;
}

export function getSessionMemories(pid: string, sessionId: string, category?: string, limit = 20): SessionMemory[] {
  const db = getDb();
  const t = now();
  if (category) {
    return db.prepare(
      "SELECT * FROM session_memories WHERE project_id=? AND session_id=? AND category=? AND expires_at>? ORDER BY created_at DESC LIMIT ?"
    ).all(pid, sessionId, category, t, limit) as SessionMemory[];
  }
  return db.prepare(
    "SELECT * FROM session_memories WHERE project_id=? AND session_id=? AND expires_at>? ORDER BY created_at DESC LIMIT ?"
  ).all(pid, sessionId, t, limit) as SessionMemory[];
}

export function clearSessionMemories(pid: string, sessionId: string): number {
  return getDb().prepare("DELETE FROM session_memories WHERE project_id=? AND session_id=?").run(pid, sessionId).changes;
}

export function cleanupExpiredSessions(): number {
  return getDb().prepare("DELETE FROM session_memories WHERE expires_at < ?").run(now()).changes;
}

// ===== 长期记忆 =====

export function saveLongTermMemory(
  pid: string, category: string, topic: string, content: string,
  source: MemorySource = "agent", priority = 5,
): string {
  const db = getDb();
  const id = uuid();
  const t = now();
  // 事务: 冲突检测 + 写入 原子执行

  const existing = db.prepare(
    "SELECT * FROM long_term_memories WHERE project_id=? AND topic=? AND superseded_by IS NULL ORDER BY priority DESC, created_at DESC LIMIT 1"
  ).get(pid, topic) as LongTermMemory | undefined;

  if (existing) {
    const resolution = resolveConflict(existing, source, priority, content, t);
    if (resolution === "superseded") {
      db.prepare("UPDATE long_term_memories SET superseded_by=?, updated_at=? WHERE id=?").run(id, t, existing.id);
      logConflict(pid, existing.id, id, "superseded", `新记忆 priority=${priority} source=${source} 优于旧记忆`);
    } else if (resolution === "merged") {
      content = existing.content + "\n" + content;
      priority = Math.max(existing.priority, priority);
      db.prepare("UPDATE long_term_memories SET superseded_by=?, updated_at=? WHERE id=?").run(id, t, existing.id);
      logConflict(pid, existing.id, id, "merged", "内容互补, 合并后保存");
    } else if (resolution === "kept_both") {
      logConflict(pid, existing.id, id, "kept_both", "主题相似但内容不同, 两条都保留");
    } else {
      // kept_old
      logConflict(pid, existing.id, id, "kept_old",
        `旧记忆优先级更高 (source=${existing.source}, priority=${existing.priority})`);
      return existing.id;
    }
  }

  db.prepare(
    "INSERT INTO long_term_memories (id,project_id,category,topic,content,source,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, pid, category, topic, content, source, priority, t, t);
  return id;
}

export function getLongTermMemories(pid: string, category?: string, limit = 50): LongTermMemory[] {
  const db = getDb();
  if (category) {
    return db.prepare(
      "SELECT * FROM long_term_memories WHERE project_id=? AND category=? AND superseded_by IS NULL ORDER BY priority DESC, created_at DESC LIMIT ?"
    ).all(pid, category, limit) as LongTermMemory[];
  }
  return db.prepare(
    "SELECT * FROM long_term_memories WHERE project_id=? AND superseded_by IS NULL ORDER BY priority DESC, created_at DESC LIMIT ?"
  ).all(pid, limit) as LongTermMemory[];
}

export function searchLongTermMemories(pid: string, query: string, limit = 10): LongTermMemory[] {
  const all = getLongTermMemories(pid, undefined, 200);
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return all.slice(0, limit);

  // 计算 IDF (逆文档频率): 在多少条记忆中出现
  const docCount = all.length || 1;
  const df: Record<string, number> = {};
  for (const t of tokens) {
    df[t] = all.filter((m) => {
      const text = `${m.topic} ${m.content}`.toLowerCase();
      return text.includes(t);
    }).length;
  }

  const now = Date.now() / 1000;
  const scored = all.map((m) => {
    const topicLower = m.topic.toLowerCase();
    const contentLower = m.content.toLowerCase();
    const fullText = `${topicLower} ${contentLower}`;
    let score = 0;

    for (const t of tokens) {
      const idf = Math.log((docCount + 1) / ((df[t] || 0) + 1)) + 1;

      // Topic 精确匹配 (最高权重)
      if (topicLower === t) { score += 10 * idf; continue; }
      // Topic 包含匹配
      if (topicLower.includes(t)) { score += 5 * idf; }
      // Content 匹配 (TF: 出现次数)
      const tf = (contentLower.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      if (tf > 0) {
        score += (1 + Math.log(tf)) * idf;
        // 首次出现位置越靠前, 分数越高
        const firstIdx = contentLower.indexOf(t);
        score += (1 / (1 + firstIdx * 0.01)) * idf;
      }
    }

    // 优先级加成: source=user 最高
    const sourceBonus = m.source === "user" ? 1.5 : m.source === "agent" ? 1.2 : 1.0;
    score *= sourceBonus;

    // 时效性加成: 越新越好 (衰减半衰期 7 天)
    const ageDays = (now - m.updatedAt) / 86400;
    score *= Math.pow(0.5, ageDays / 7);

    return { score, m };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.m);
}

// ===== 冲突解决 =====

function resolveConflict(
  old: LongTermMemory,
  newSource: string,
  newPriority: number,
  newContent: string,
  _newCreatedAt: number,
): string {
  const oldPri = sourcePriority(old.source);
  const newPri = sourcePriority(newSource);
  if (newPri > oldPri) return "superseded";
  if (oldPri > newPri) return "kept_old";
  if (newPriority > old.priority) return "superseded";
  if (old.priority > newPriority) return "kept_old";
  const overlap = contentOverlap(old.content, newContent);
  if (overlap > 0.5) return "superseded";
  if (overlap < 0.2) return "merged";
  return "kept_both";
}

function contentOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const c of setA) if (setB.has(c)) inter++;
  return inter / (setA.size + setB.size - inter) || 0;
}

function logConflict(pid: string, oldId: string, newId: string, resolution: string, reason: string): void {
  getDb().prepare(
    "INSERT INTO memory_conflicts (id,project_id,old_memory_id,new_memory_id,resolution,reason,created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(uuid(), pid, oldId, newId, resolution, reason, now());
}

// ===== 记忆上下文 (注入 agent prompt) =====

export function getMemoryContext(pid: string, maxTokens = 2000): string {
  const parts: string[] = [];
  const ltm = getLongTermMemories(pid, undefined, 30);
  if (ltm.length) {
    const byCat: Record<string, LongTermMemory[]> = {};
    for (const m of ltm) {
      (byCat[m.category] ??= []).push(m);
    }
    const labels: Record<string, string> = {
      character: "角色设定", plot: "剧情走向", style: "创作风格",
      preference: "用户偏好", world: "世界观", lesson: "经验教训",
    };
    for (const [cat, memories] of Object.entries(byCat)) {
      const lines = [`【${labels[cat] || cat}】`];
      for (const m of memories.slice(0, 5)) {
        lines.push(`- ${m.topic}: ${m.content.slice(0, 150)}`);
      }
      parts.push(lines.join("\n"));
    }
  }
  const result = parts.join("\n\n");
  return result.length > maxTokens ? result.slice(0, maxTokens) + "\n... (记忆已截断)" : result;
}
