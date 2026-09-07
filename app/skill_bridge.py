"""技能桥接脚本: 供 Node.js 通过子进程调用 Python 技能引擎。

用法:
    echo '{"action":"deconstruct","input":"拆解武侠风格"}' | python3 skill_bridge.py
    echo '{"action":"audit","text":"正文内容"}' | python3 skill_bridge.py
    echo '{"action":"detect_ai","text":"正文内容"}' | python3 skill_bridge.py
    echo '{"action":"diagnose_opening","text":"开篇内容"}' | python3 skill_bridge.py
    echo '{"action":"analyze_style","text":"正文内容"}' | python3 skill_bridge.py
    echo '{"action":"imitate_style","reference_text":"参考原文","topic":"主题","word_count":800}' | python3 skill_bridge.py
    echo '{"action":"ghostwrite","outline":"大纲","word_count":2000,"author_name":"史诗派"}' | python3 skill_bridge.py
    echo '{"action":"match_author","genre":"玄幻","style":"热血"}' | python3 skill_bridge.py
    echo '{"action":"list_authors"}' | python3 skill_bridge.py
    echo '{"action":"get_author_reference","author":"史诗派","scene":"battle"}' | python3 skill_bridge.py
    echo '{"action":"status"}' | python3 skill_bridge.py
"""
import sys
import os
import json
import asyncio

# 设置路径
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_APP_DIR, "data")
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)
if _DATA_DIR not in sys.path:
    sys.path.insert(0, _DATA_DIR)

# 允许的操作白名单
ALLOWED_ACTIONS = {
    "status", "deconstruct", "audit", "detect_ai", "diagnose_opening",
    "analyze_style", "imitate_style", "ghostwrite", "match_author",
    "list_authors", "get_author_reference", "full_audit", "editor_review",
}

# 输入长度限制 (防止超大文本导致内存溢出)
MAX_TEXT_LENGTH = 50000
MAX_INPUT_LENGTH = 10000

def _validate_input(cmd: dict) -> str | None:
    """验证输入, 返回错误信息或 None"""
    action = cmd.get("action", "")
    if not action:
        return "缺少 action 字段"
    if action not in ALLOWED_ACTIONS:
        return f"未知操作: {action}"
    # 检查文本长度
    for key in ("text", "input", "reference_text", "outline"):
        val = cmd.get(key, "")
        if isinstance(val, str) and len(val) > MAX_TEXT_LENGTH:
            return f"字段 {key} 超过长度限制 ({MAX_TEXT_LENGTH} 字符)"
    return None

def main():
    try:
        raw = sys.stdin.read()
        if len(raw) > MAX_INPUT_LENGTH * 2:
            print(json.dumps({"error": f"输入超过长度限制"}))
            return
        cmd = json.loads(raw)
    except Exception as e:
        print(json.dumps({"error": f"JSON解析失败: {e}"}))
        return

    # 输入验证
    validation_err = _validate_input(cmd)
    if validation_err:
        print(json.dumps({"error": validation_err}))
        return

    action = cmd.get("action", "")

    try:
        if action == "status":
            from skill_adapter import skill_status
            result = skill_status()

        elif action == "deconstruct":
            from skill_adapter import deconstruct
            result = deconstruct(cmd.get("input", ""), return_prompt_only=True)

        elif action == "audit":
            from skill_adapter import audit_novel
            result = audit_novel(cmd.get("text", ""), cmd.get("outline"))

        elif action == "detect_ai":
            from skill_adapter import detect_ai
            result = detect_ai(cmd.get("text", ""))

        elif action == "diagnose_opening":
            from skill_adapter import diagnose_opening
            result = diagnose_opening(cmd.get("text", ""))

        elif action == "analyze_style":
            from skill_adapter import analyze_style
            result = analyze_style(cmd.get("text", ""))

        elif action == "imitate_style":
            from skill_adapter import imitate_style
            result = imitate_style(
                cmd.get("reference_text", ""),
                cmd.get("topic", ""),
                cmd.get("word_count", 800),
            )

        elif action == "ghostwrite":
            from skill_adapter import ghostwrite
            result = asyncio.run(ghostwrite(
                cmd.get("outline", ""),
                cmd.get("word_count", 2000),
                cmd.get("author_name", ""),
            ))

        elif action == "match_author":
            from skill_library import match_author
            result = match_author(cmd.get("genre", ""), cmd.get("style", ""))

        elif action == "list_authors":
            from skill_library import list_authors_with_methodology
            authors = list_authors_with_methodology()
            result = {"authors": authors, "count": len(authors)}

        elif action == "get_author_reference":
            from skill_library import get_methodology
            from corpus.loader import get_corpus_loader
            author = cmd.get("author", "")
            scene = cmd.get("scene", "")
            methodology = get_methodology(author)
            try:
                loader = get_corpus_loader()
                passages = loader.get_passages(author, scene) if scene else loader.get_passages(author)
            except Exception:
                passages = []
            result = {
                "author": author,
                "scene": scene,
                "methodology": methodology,
                "passages": passages[:5] if passages else [],
                "passage_count": len(passages) if passages else 0,
            }

        elif action == "full_audit":
            from skill_adapter import audit_novel, detect_ai
            text = cmd.get("text", "")
            outline = cmd.get("outline", "")
            audit_result = audit_novel(text, outline)
            ai_result = detect_ai(text)
            result = {
                "audit_report": audit_result.get("audit_report", ""),
                "ai_issues": ai_result.get("ai_issues", []),
                "text_length": len(text),
            }

        elif action == "editor_review":
            from skill_adapter import audit_novel, detect_ai, diagnose_opening
            text = cmd.get("text", "")
            audit_r = audit_novel(text)
            ai_r = detect_ai(text)
            opening_r = diagnose_opening(text)
            result = {
                "audit": audit_r.get("audit_report", ""),
                "ai_detection": ai_r.get("ai_issues", []),
                "opening": opening_r.get("opening_report", ""),
                "text_length": len(text),
            }

        else:
            result = {"error": f"未知操作: {action}"}

        # 输出结果
        if isinstance(result, str):
            print(json.dumps({"result": result}, ensure_ascii=False))
        else:
            print(json.dumps(result, ensure_ascii=False, default=str))

    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()[-500:],
        }, ensure_ascii=False))

if __name__ == "__main__":
    main()
