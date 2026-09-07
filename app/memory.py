"""统一记忆系统: 短期记忆 + 长期记忆 + 冲突解决。

架构:
- 短期记忆 (session_memories): 会话级, TTL 过期, 项目切换时清空
  用于: 当前上下文、临时决策、用户即时反馈
- 长期记忆 (long_term_memories): 项目级, 永久存储, 可被新记忆 supersede
  用于: 角色设定、剧情走向、用户偏好、创作风格、经验教训
- 冲突解决: 新记忆写入时自动检测 topic 冲突, 按优先级决定谁取代谁

优先级规则 (source > priority > recency):
1. user (用户显式设定) > agent (agent 决策) > auto (自动提取)
2. 同 source 时, priority 数值大的优先
3. 同 priority 时, 更新的优先

记忆流转:
  短期记忆 → (对话结束/定时) → 提取关键信息 → 写入长期记忆
  长期记忆 → (项目切换时) → 加载到 agent 上下文
"""
from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime
from typing import Optional

from .config import get_settings


# ===== Claude Code风格: 4种记忆类型 =====
MEMORY_TYPES = {
    "user": "用户偏好 - 用户明确表达的偏好、习惯、工作方式",
    "feedback": "纠正反馈 - 用户纠正Agent错误的记录，含原因和应用方式",
    "project": "项目上下文 - 项目进行中的工作、截止日期、当前约束",
    "reference": "外部链接 - 指向外部系统的信息指针",
}

# 排除列表 - 这些信息不应保存为记忆（可从代码库推导）
MEMORY_EXCLUSIONS = [
    "代码模式",      # 可从代码库读取
    "git历史",       # 可从git log获取
    "调试方案",      # 临时性信息
    "CLAUDE.md内容", # 已在CLAUDE.md中
    "临时任务细节",  # 会过期的信息
]

# 每条记忆的描述最大长度
MEMORY_DESC_MAX_LEN = 150


# ===== 短期记忆 (Session Memory) =====

# 短期记忆默认 TTL: 24 小时
DEFAULT_SESSION_TTL = 24 * 3600


def _session_memories_table() -> str:
    return "session_memories"


def _ltm_table() -> str:
    return "long_term_memories"


def _conflict_table() -> str:
    return "memory_conflicts"


def _now() -> float:
    return time.time()


def _uuid() -> str:
    return uuid.uuid4().hex[:12]


# ---------- 短期记忆 CRUD ----------

def should_exclude_memory(content: str, topic: str = "") -> bool:
    """检查内容是否应被排除（Claude Code排除规则）。"""
    text = (content + " " + topic).lower()
    for exclusion in MEMORY_EXCLUSIONS:
        if exclusion.lower() in text:
            return True
    return False

def save_session_memory(
    pid: str,
    session_id: str,
    category: str,
    topic: str,
    content: str,
    source: str = "auto",
    relevance: float = 1.0,
    ttl: int = DEFAULT_SESSION_TTL,
) -> str:
    """保存一条短期记忆。自动检查 topic 冲突并解决。"""
    from . import store
    mid = _uuid()
    now = _now()
    expires_at = now + ttl

    # 冲突检测: 同 project + session + topic 的已有记忆
    existing = _find_session_by_topic(pid, session_id, topic)
    if existing:
        # 冲突解决: 比较 source 优先级和时间
        old_priority = _source_priority(existing["source"])
        new_priority = _source_priority(source)
        if new_priority > old_priority or (
            new_priority == old_priority and now > existing["created_at"]
        ):
            # 新记忆胜出: 旧的过期 (设 expires_at 为当前时间)
            _expire_session_memory(existing["id"])
        else:
            # 旧记忆保留: 合并内容
            merged = existing["content"] + "\n" + content
            _update_session_content(existing["id"], merged)
            return existing["id"]

    with store.get_conn() as c:
        c.execute(
            "INSERT INTO session_memories "
            "(id, project_id, session_id, category, topic, content, source, "
            "relevance, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (mid, pid, session_id, category, topic, content, source, relevance, now, expires_at),
        )
    return mid


def get_session_memories(
    pid: str, session_id: str, category: Optional[str] = None, limit: int = 20
) -> list[dict]:
    """获取当前会话的短期记忆 (自动过滤过期的)。"""
    from . import store
    now = _now()
    with store.get_conn() as c:
        if category:
            rows = c.execute(
                "SELECT * FROM session_memories "
                "WHERE project_id=? AND session_id=? AND category=? AND expires_at>? "
                "ORDER BY created_at DESC LIMIT ?",
                (pid, session_id, category, now, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM session_memories "
                "WHERE project_id=? AND session_id=? AND expires_at>? "
                "ORDER BY created_at DESC LIMIT ?",
                (pid, session_id, now, limit),
            ).fetchall()
    return [dict(r) for r in rows]


def clear_session_memories(pid: str, session_id: str) -> int:
    """清空某会话的所有短期记忆 (项目切换时调用)。"""
    from . import store
    with store._lock, store.get_conn() as c:
        cur = c.execute(
            "DELETE FROM session_memories WHERE project_id=? AND session_id=?",
            (pid, session_id),
        )
        return cur.rowcount


def cleanup_expired_sessions() -> int:
    """清理所有过期的短期记忆 (定时任务)。"""
    from . import store
    now = _now()
    with store._lock, store.get_conn() as c:
        cur = c.execute(
            "DELETE FROM session_memories WHERE expires_at < ?",
            (now,),
        )
        return cur.rowcount


# ---------- 长期记忆 CRUD ----------

def save_long_term_memory(
    pid: str,
    category: str,
    topic: str,
    content: str,
    source: str = "agent",
    priority: int = 5,
) -> str:
    """保存一条长期记忆。自动检测冲突并解决。

    冲突解决策略:
    1. 找到同 project + topic 的已有记忆
    2. 比较 source 优先级 (user > agent > auto)
    3. 同 source 比 priority 数值
    4. 胜出者保留, 失败者标记 superseded_by
    5. 如果内容互补, 尝试合并
    """
    from . import store
    mid = _uuid()
    now = _now()

    # 冲突检测
    existing = _find_ltm_by_topic(pid, topic)
    if existing:
        resolution = _resolve_conflict(existing, {
            "id": mid,
            "source": source,
            "priority": priority,
            "content": content,
            "created_at": now,
        })
        if resolution == "superseded":
            # 旧记忆被取代
            _supersede_ltm(existing["id"], mid)
            _log_conflict(pid, existing["id"], mid, "superseded",
                          f"新记忆 priority={priority} source={source} 优于旧记忆")
        elif resolution == "merged":
            # 内容合并
            content = existing["content"] + "\n" + content
            priority = max(existing["priority"], priority)
            _supersede_ltm(existing["id"], mid)
            _log_conflict(pid, existing["id"], mid, "merged",
                          f"内容互补, 合并后保存")
        elif resolution == "kept_both":
            # 主题相似但内容不同, 两条都保留
            _log_conflict(pid, existing["id"], mid, "kept_both",
                          f"主题相似但内容不同, 两条都保留")
        # resolution == "kept_old" → 旧记忆保留, 不写入新记忆
        elif resolution == "kept_old":
            _log_conflict(pid, existing["id"], mid, "kept_old",
                          f"旧记忆优先级更高 (source={existing.get('source')}, priority={existing.get('priority')})")
            return existing["id"]

    with store.get_conn() as c:
        c.execute(
            "INSERT INTO long_term_memories "
            "(id, project_id, category, topic, content, source, priority, "
            "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (mid, pid, category, topic, content, source, priority, now, now),
        )
    return mid


def get_long_term_memories(
    pid: str, category: Optional[str] = None, limit: int = 50
) -> list[dict]:
    """获取项目的长期记忆 (只返回未被取代的)。"""
    from . import store
    with store.get_conn() as c:
        if category:
            rows = c.execute(
                "SELECT * FROM long_term_memories "
                "WHERE project_id=? AND category=? AND superseded_by IS NULL "
                "ORDER BY priority DESC, created_at DESC LIMIT ?",
                (pid, category, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM long_term_memories "
                "WHERE project_id=? AND superseded_by IS NULL "
                "ORDER BY priority DESC, created_at DESC LIMIT ?",
                (pid, limit),
            ).fetchall()
    return [dict(r) for r in rows]


def search_long_term_memories(pid: str, query: str, limit: int = 10) -> list[dict]:
    """按关键词检索长期记忆。"""
    from . import store
    all_memories = get_long_term_memories(pid, limit=200)
    query_lower = query.lower()
    tokens = [t for t in query_lower.split() if len(t) > 1]
    if not tokens:
        return all_memories[:limit]

    scored = []
    for m in all_memories:
        score = 0
        text = (m.get("topic", "") + " " + m.get("content", "")).lower()
        for t in tokens:
            score += text.count(t)
        if score > 0:
            scored.append((score, m))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored[:limit]]


def supersede_ltm(memory_id: str, new_id: str) -> None:
    """手动标记某长期记忆被取代。"""
    _supersede_ltm(memory_id, new_id)


def get_memory_context(pid: str, query: str = "", max_tokens: int = 2000) -> str:
    """获取记忆上下文 (注入到 agent 的 system prompt)。

    同时加载短期记忆和长期记忆, 按相关性排序, 控制总长度。
    """
    parts = []

    # 1. 长期记忆 (按 category 分组)
    ltm = get_long_term_memories(pid, limit=30)
    if ltm:
        by_cat: dict[str, list[dict]] = {}
        for m in ltm:
            by_cat.setdefault(m.get("category", "other"), []).append(m)

        cat_labels = {
            "character": "角色设定",
            "plot": "剧情走向",
            "style": "创作风格",
            "preference": "用户偏好",
            "world": "世界观",
            "lesson": "经验教训",
        }
        for cat, memories in by_cat.items():
            label = cat_labels.get(cat, cat)
            lines = [f"【{label}】"]
            for m in memories[:5]:  # 每类最多 5 条
                lines.append(f"- {m['topic']}: {m['content'][:150]}")
            parts.append("\n".join(lines))

    # 2. 短期记忆 (如果有 session_id 的话)
    # 注意: 这里需要 session_id, 但 memory_context 可能被不同地方调用
    # 所以短期记忆通过 agent.py 在构建 prompt 时单独注入

    result = "\n\n".join(parts)
    if len(result) > max_tokens:
        result = result[:max_tokens] + "\n... (记忆已截断)"
    return result


# ---------- 冲突解决核心逻辑 ----------

# source 优先级: 数值越大越优先
_SOURCE_PRIORITY = {
    "user": 10,     # 用户显式设定最高
    "agent": 5,     # agent 决策中等
    "auto": 1,      # 自动提取最低
}


def _source_priority(source: str) -> int:
    return _SOURCE_PRIORITY.get(source, 1)


def _find_session_by_topic(pid: str, session_id: str, topic: str) -> Optional[dict]:
    """查找同 topic 的短期记忆。"""
    from . import store
    now = _now()
    with store.get_conn() as c:
        row = c.execute(
            "SELECT * FROM session_memories "
            "WHERE project_id=? AND session_id=? AND topic=? AND expires_at>? "
            "ORDER BY created_at DESC LIMIT 1",
            (pid, session_id, topic, now),
        ).fetchone()
    return dict(row) if row else None


def _expire_session_memory(mid: str) -> None:
    """将短期记忆设为过期。"""
    from . import store
    with store._lock, store.get_conn() as c:
        c.execute(
            "UPDATE session_memories SET expires_at=? WHERE id=?",
            (_now(), mid),
        )


def _update_session_content(mid: str, content: str) -> None:
    """更新短期记忆内容 (合并)。"""
    from . import store
    with store._lock, store.get_conn() as c:
        c.execute(
            "UPDATE session_memories SET content=? WHERE id=?",
            (content, mid),
        )


def _find_ltm_by_topic(pid: str, topic: str) -> Optional[dict]:
    """查找同 topic 的有效长期记忆。"""
    from . import store
    with store.get_conn() as c:
        row = c.execute(
            "SELECT * FROM long_term_memories "
            "WHERE project_id=? AND topic=? AND superseded_by IS NULL "
            "ORDER BY priority DESC, created_at DESC LIMIT 1",
            (pid, topic),
        ).fetchone()
    return dict(row) if row else None


def _resolve_conflict(old: dict, new: dict) -> str:
    """解决两条记忆的冲突。

    返回:
    - "superseded": 新记忆取代旧记忆
    - "merged": 内容合并
    - "kept_both": 两条都保留 (主题相似但内容不同)
    - "kept_old": 旧记忆保留 (旧的优先级更高)
    """
    old_priority = _source_priority(old.get("source", "auto"))
    new_priority = _source_priority(new.get("source", "auto"))

    # 1. 新的 source 更高 → 取代
    if new_priority > old_priority:
        return "superseded"

    # 2. 旧的 source 更高 → 保留旧的
    if old_priority > new_priority:
        return "kept_old"

    # 3. 同 source, 比 priority 数值
    if new.get("priority", 5) > old.get("priority", 5):
        return "superseded"
    if old.get("priority", 5) > new.get("priority", 5):
        return "kept_old"

    # 4. 同 priority, 比时间 (新的优先) 但检查内容是否互补
    old_content = old.get("content", "")
    new_content = new.get("content", "")

    # 如果内容重叠度高 (>50%), 取代
    overlap = _content_overlap(old_content, new_content)
    if overlap > 0.5:
        return "superseded"

    # 如果内容互补 (overlap < 20%), 合并
    if overlap < 0.2:
        return "merged"

    # 中间地带: 都保留
    return "kept_both"


def _content_overlap(a: str, b: str) -> float:
    """计算两段内容的重叠度 (基于字符级 Jaccard)。"""
    if not a or not b:
        return 0.0
    set_a = set(a)
    set_b = set(b)
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def _supersede_ltm(old_id: str, new_id: str) -> None:
    """标记旧记忆被新记忆取代。"""
    from . import store
    with store._lock, store.get_conn() as c:
        c.execute(
            "UPDATE long_term_memories SET superseded_by=?, updated_at=? WHERE id=?",
            (new_id, _now(), old_id),
        )


def _log_conflict(
    pid: str, old_id: str, new_id: str, resolution: str, reason: str
) -> None:
    """记录冲突解决日志。"""
    from . import store
    cid = _uuid()
    with store._lock, store.get_conn() as c:
        c.execute(
            "INSERT INTO memory_conflicts "
            "(id, project_id, old_memory_id, new_memory_id, resolution, reason, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (cid, pid, old_id, new_id, resolution, reason, _now()),
        )


# ---------- 从对话自动提取记忆 ----------

async def extract_and_save_memory(
    pid: str, user_input: str, assistant_response: str, *, session_id: str = ""
) -> None:
    """从对话中提取关键信息, 分类保存到短期/长期记忆。

    提取策略:
    - 角色/世界观变化 → 长期记忆 (category=character/world)
    - 剧情走向/伏笔 → 长期记忆 (category=plot)
    - 用户偏好/风格要求 → 长期记忆 (category=preference/style, priority=8)
    - 临时上下文/工具结果摘要 → 短期记忆 (category=context)
    """
    from .llm import chat

    system = (
        "你是记忆提取助手。从对话中提取值得记住的关键信息。"
        "返回 JSON 数组, 每个元素包含:\n"
        "- category: character|plot|style|preference|world|lesson|context\n"
        "- topic: 简短主题 (5-15字)\n"
        "- content: 具体内容\n"
        "- source: user|agent|auto\n"
        "- priority: 1-10 (用户显式要求=8, agent决策=5, 自动提取=3)\n"
        "- tier: long|short (长期/短期)\n\n"
        "规则:\n"
        "- 用户明确说的偏好/要求 → source=user, tier=long, priority=8\n"
        "- 角色/世界观/剧情变化 → tier=long\n"
        "- 临时上下文/工具结果 → tier=short\n"
        "- 如果没有值得记住的信息, 返回空数组 []\n"
        "- 只输出 JSON, 不要其他文字"
    )

    user = (
        f"用户输入:\n{user_input[:800]}\n\n"
        f"助手回复:\n{assistant_response[:800]}\n\n"
        "请提取关键信息 (JSON 数组):"
    )

    try:
        from .llm import chat as llm_chat
        resp = await llm_chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            get_settings().default_model,
            temperature=0.3,
            max_tokens=800,
        )
        text = resp["content"].strip()
        # 提取 JSON
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        memories = json.loads(text)
        if not isinstance(memories, list):
            return

        for m in memories:
            if not isinstance(m, dict):
                continue
            cat = m.get("category", "context")
            topic = m.get("topic", "")
            content = m.get("content", "")
            source = m.get("source", "auto")
            priority = int(m.get("priority", 5))
            tier = m.get("tier", "short")

            if not topic or not content:
                continue

            if tier == "long":
                save_long_term_memory(
                    pid, cat, topic, content, source=source, priority=priority,
                )
            else:
                save_session_memory(
                    pid, session_id, cat, topic, content, source=source,
                )
    except Exception:
        pass  # 记忆提取失败不影响主流程


# ===== 兼容层: 保持与旧版 memory.py 接口兼容 =====

def get_memory(pid: str) -> str:
    """读取项目长期记忆 (兼容旧接口)。"""
    memories = get_long_term_memories(pid, limit=50)
    if not memories:
        # 尝试读取旧版 MEMORY.md 文件
        path = os.path.join(
            get_settings().data_dir, "projects", pid, "memory", "MEMORY.md"
        )
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return ""
    parts = []
    for m in memories:
        parts.append(f"## [{m['category']}] {m['topic']}\n{m['content']}")
    return "\n\n".join(parts)


def append_memory(pid: str, content: str, category: str = "general") -> None:
    """追加内容到项目长期记忆 (兼容旧接口)。"""
    # 从 content 中提取 topic (取第一行或前 20 字)
    topic = content.split("\n")[0][:20] if content else "未命名"
    save_long_term_memory(pid, category, topic, content, source="agent", priority=5)


def search_memory(pid: str, query: str, max_results: int = 5) -> list[dict]:
    """检索记忆 (兼容旧接口)。"""
    results = search_long_term_memories(pid, query, limit=max_results)
    return [{"score": 1, "snippets": [m["content"][:200]]} for m in results]
