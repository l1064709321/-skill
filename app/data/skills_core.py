import json
import sys
import os
import re
from typing import List, Dict, Tuple

# ============================================================
# 版权保护：已知原文金句库（用于输出检测）
# ============================================================
COPYRIGHT_QUOTES = [
    "三十年河东，三十年河西，莫欺少年穷",
    "顺为凡，逆则仙，只在心中一念间",
    "魔前一叩三千年，回首凡尘不做仙",
    "天不生我李淳罡，剑道万古如长夜",
    "我们是守护者，也是一群时刻对抗疯狂和绝望的可怜虫",
    "我要这天，再遮不住我眼",
    "世间万物无不可交易的，只是看交易的东西，能否让对方动心罢了",
    "我辈修士，逆天而行",
    "没有废物的武魂，只有废物的魂师",
    "史莱克七怪，从来都是七个人",
    "我的剑，一往无前",
    "老子不是好人，但也不是坏人，老子是人",
    "我就喜欢你们看我讨厌我却又干不掉我的样子",
    "荣耀，不是一个人的游戏",
    "我这个人，只喜欢两种东西：权利和美女",
    "分金定穴，寻龙点穴",
]

def check_copyright_violation(text: str, threshold: int = 8) -> list:
    """检测生成文本中是否包含已知原文金句。"""
    violations = []
    for quote in COPYRIGHT_QUOTES:
        if len(quote) < threshold:
            continue
        if quote in text:
            violations.append({"quote": quote, "match_type": "完全匹配",
                "suggestion": f"检测到原文「{quote}」，请改写为原创表达"})
        else:
            clean_q = re.sub(r'[，。！？、；：\"\"\'\'\s]', '', quote)
            clean_t = re.sub(r'[，。！？、；：\"\"\'\'\s]', '', text)
            if clean_q in clean_t and len(clean_q) >= threshold:
                violations.append({"quote": quote, "match_type": "去标点匹配",
                    "suggestion": f"检测到疑似原文「{quote}」，请改写为原创表达"})
    return violations

def format_copyright_report(violations: list) -> str:
    """格式化版权检测报告。"""
    if not violations:
        return "✅ 版权检测通过，未发现原文复制。"
    lines = ["⚠️ 版权检测报告", ""]
    for v in violations:
        lines.append(f"  🔴 [{v['match_type']}] {v['suggestion']}")
    lines.append("\n请将上述原文改写为原创表达后再发布。")
    return "\n".join(lines)

COPYRIGHT_NOTICE = """
【版权保护规则 - 必须遵守】
1. 严禁直接复制任何已出版小说的原文段落、标志性台词、经典桥段
2. 参考原文片段时，只能学习其「句式节奏」「信息密度」「断句习惯」，不能照搬文字
3. 如果需要引用某位作者的标志性表达，必须用自己的话重新改写
4. 生成的内容必须是原创的，不得与任何已出版作品存在大段文字重复
5. 【角色名禁令】严禁直接使用任何已出版作品中的角色名、势力名、作品专有名词
   （如萧炎、林动、韩立、唐三、霍雨浩、石昊、叶凡、萧火火、史莱克、武魂、魂环、斗气、查克拉等）。
   参考作家作品时，只能学习其笔法与节奏；角色名/势力名/设定名必须全部原创。
6. 【桥段禁令】严禁照搬原作的标志性剧情桥段（如废柴退婚、魂环觉醒、特定金手指设定等），
   只能借鉴其叙事结构与情绪节奏，桥段内容必须原创。
7. 违反以上规则的内容将被自动检测并拒绝发布
"""

# 导入原文语料库
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from corpus.loader import get_corpus_loader
    HAS_CORPUS = True
except ImportError:
    HAS_CORPUS = False
    def get_corpus_loader():
        return None

NOVEL_DECONSTRUCTION_DB = [
    {
        "name": "史诗玄幻",
        "category": "玄幻仙侠",
        "genre": "史诗派",
        "lexicon_logic": {
            "高频词": ["苍茫", "万古", "逆天", "残破", "血色"],
            "拆析": "偏爱带有时间跨度感和沧桑感的词汇，奠定史诗底色。"
        },
        "environment_logic": {
            "典型环境": "残破的远古遗迹、苍茫的星空战场",
            "拆析": "以景衬史——风景越荒凉，越暗示当年发生过惊世大战。留白手法。"
        },
        "quotes_and_actions": [
            {
                "quote": "我辈修士，逆天而行！",
                "拆析": "将阻力具象化为天，拉满悲壮感与宿命感。"
            },
            {
                "action": "主角大笑，满嘴鲜血，却依旧挥动残破的战剑。",
                "拆析": "极端反差：肉体的极度残破与意志的极度高昂，越惨越燃。"
            }
        ],
        "structural_blueprint": {
            "开局(1-30章)": "主角出身微末，身怀隐秘，遭遇压迫。重点刻画无力感和悬疑感。",
            "中段(30-500章)": "探索遗迹→获得机缘→被强敌追杀→绝地反杀的循环。",
            "高潮(500章+)": "身世揭晓，以一己之力对抗整个时代。",
            "大结局": "打败终极Boss，却失去战友，留下苍茫背影。"
        }
    },
    {
        "name": "都市异能",
        "category": "都市异能",
        "genre": "现代派",
        "lexicon_logic": {
            "高频词": ["觉醒", "异能", "都市", "日常", "守护"],
            "拆析": "现代都市词汇与超自然元素融合，制造反差感。"
        },
        "environment_logic": {
            "典型环境": "霓虹闪烁的城市、深夜的写字楼、雨中的天桥",
            "拆析": "用日常场景承载非日常事件，让读者产生代入感。"
        },
        "quotes_and_actions": [
            {
                "quote": "这个城市有多少秘密？",
                "拆析": "用疑问句引发好奇心，暗示隐藏的世界。"
            },
            {
                "action": "他关上手机，走进雨中，消失在霓虹灯的尽头。",
                "拆析": "现代感的孤独与决绝，暗示主角即将踏入非日常。"
            }
        ],
        "structural_blueprint": {
            "开局(1-30章)": "平凡生活被打破，异能觉醒，日常与非日常交织。",
            "中段(30-300章)": "都市冒险，守护日常，对抗超自然威胁。",
            "高潮(300章+)": "真相揭示，终极对决。",
            "大结局": "回归日常，但已不再是原来的自己。"
        }
    },
    {
        "name": "武侠江湖",
        "category": "武侠江湖",
        "genre": "传统派",
        "lexicon_logic": {
            "高频词": ["侠义", "江湖", "恩怨", "武功", "境界"],
            "拆析": "半文半白的词汇，营造江湖意境。"
        },
        "environment_logic": {
            "典型环境": "大漠孤烟、古道西风、酒楼客栈",
            "拆析": "传统武侠的标志性场景，承载江湖气息。"
        },
        "quotes_and_actions": [
            {
                "quote": "侠之大者，为国为民。",
                "拆析": "武侠精神的核心，侠义高于个人恩怨。"
            },
            {
                "action": "他拔剑出鞘，剑光如匹练般斩出。",
                "拆析": "武功描写要有画面感和节奏感。"
            }
        ],
        "structural_blueprint": {
            "开局(1-30章)": "初入江湖，拜师学艺，了解江湖规矩。",
            "中段(30-200章)": "江湖恩怨，门派纷争，武功精进。",
            "高潮(200章+)": "终极对决，侠义之道。",
            "大结局": "退隐江湖，或仗剑天涯。"
        }
    },
    {
        "name": "悬疑推理",
        "category": "悬疑推理",
        "genre": "硬核派",
        "lexicon_logic": {
            "高频词": ["线索", "真相", "推理", "悬疑", "密室"],
            "拆析": "精确、冷静的词汇，营造推理氛围。"
        },
        "environment_logic": {
            "典型环境": "密室、犯罪现场、审讯室、雨夜",
            "拆析": "封闭空间增加压迫感，雨夜增添神秘色彩。"
        },
        "quotes_and_actions": [
            {
                "quote": "真相只有一个。",
                "拆析": "简洁有力，暗示唯一的答案。"
            },
            {
                "action": "他把所有线索铺在桌上，目光停住了。",
                "拆析": "通过细节描写展示推理过程。"
            }
        ],
        "structural_blueprint": {
            "开局(1-20章)": "案件发生，线索初现，悬念设置。",
            "中段(20-100章)": "调查深入，线索交织，反转出现。",
            "高潮(100章+)": "真相揭示，终极对决。",
            "大结局": "真相大白，但可能留下新的悬念。"
        }
    },
    {
        "name": "轻小说",
        "category": "轻小说",
        "genre": "日式派",
        "lexicon_logic": {
            "高频词": ["异世界", "冒险", "同伴", "羁绊", "日常"],
            "拆析": "轻松、口语化的词汇，营造轻松氛围。"
        },
        "environment_logic": {
            "典型环境": "异世界城镇、学校、冒险者公会",
            "拆析": "明亮、充满活力的场景，符合轻小说基调。"
        },
        "quotes_and_actions": [
            {
                "quote": "如果人生可以重来...",
                "拆析": "引发共鸣的假设，暗示转机。"
            },
            {
                "action": "她双手叉腰，一脸不可思议地看着他。",
                "拆析": "轻松的互动，展现角色关系。"
            }
        ],
        "structural_blueprint": {
            "开局(1-10章)": "平凡被打破，异世界冒险开始。",
            "中段(10-100章)": "收集同伴，打怪升级，日常与冒险交织。",
            "高潮(100章+)": "终极Boss战，同伴羁绊。",
            "大结局": "Happy End，回归日常或继续冒险。"
        }
    },
]


STYLE_ALIASES = {
    "史诗": "史诗玄幻", "修仙": "修仙派", "都市": "都市异能",
    "武侠": "武侠江湖", "悬疑": "悬疑推理", "轻小说": "轻小说",
    "硬核": "悬疑推理", "传统": "武侠江湖", "现代": "都市异能",
}


class DeconstructionParser:
    def __init__(self):
        self.keyword_map = {
            "词汇": "lexicon_logic", "词语": "lexicon_logic", "用词": "lexicon_logic",
            "高频词": "lexicon_logic", "环境": "environment_logic", "描写": "environment_logic",
            "景色": "environment_logic", "台词": "quotes_and_actions", "说话": "quotes_and_actions",
            "动作": "quotes_and_actions", "结构": "structural_blueprint", "节奏": "structural_blueprint",
            "大纲": "structural_blueprint", "开局": "structural_blueprint", "结局": "structural_blueprint",
            "玄幻": "_cat", "仙侠": "_cat", "都市": "_cat", "现实": "_cat",
            "历史": "_cat", "架空": "_cat", "悬疑": "_cat", "探险": "_cat",
            "游戏": "_cat", "科幻": "_cat", "女频": "_cat", "言情": "_cat",
            "生活": "_cat", "军事": "_cat",
        }
        self.category_map = {
            "玄幻": "玄幻仙侠", "仙侠": "玄幻仙侠", "都市": "都市现实",
            "现实": "都市现实", "历史": "历史架空", "架空": "历史架空",
            "悬疑": "悬疑探险", "探险": "悬疑探险", "游戏": "游戏科幻",
            "科幻": "游戏科幻", "女频": "女频言情", "言情": "女频言情",
            "生活": "都市生活", "军事": "都市现实",
        }

    def parse(self, user_input: str) -> Dict:
        intent = {"target_authors": [], "focus_areas": [], "category_filter": None, "raw_input": user_input}
        for alias, real_name in STYLE_ALIASES.items():
            if alias in user_input and real_name not in intent["target_authors"]:
                intent["target_authors"].append(real_name)
        for author_data in NOVEL_DECONSTRUCTION_DB:
            if author_data["name"] in user_input and author_data["name"] not in intent["target_authors"]:
                intent["target_authors"].append(author_data["name"])
        for word, area in self.keyword_map.items():
            if word in user_input:
                if area == "_cat":
                    if intent["category_filter"] is None:
                        intent["category_filter"] = self.category_map.get(word)
                elif area not in intent["focus_areas"]:
                    intent["focus_areas"].append(area)
        if not intent["focus_areas"]:
            intent["focus_areas"] = ["lexicon_logic", "environment_logic", "quotes_and_actions", "structural_blueprint"]
        return intent


class DeconstructionMatcher:
    def __init__(self, db: List[Dict]):
        self.db = db

    def match(self, intent: Dict) -> List[Dict]:
        results = []
        target_authors = intent["target_authors"]
        focus_areas = intent["focus_areas"]
        category_filter = intent.get("category_filter")
        raw_input = intent.get("raw_input", "")
        # 如果没有指定作者也没有分类过滤，检查输入是否有意义
        if not target_authors and not category_filter:
            # 检查输入是否包含任何已知作者名
            known_names = {a["name"] for a in self.db}
            has_author = any(name in raw_input for name in known_names)
            # 检查是否包含分类关键词
            cat_keywords = ["玄幻","仙侠","都市","现实","历史","架空","悬疑","探险","游戏","科幻","女频","言情","武侠","古典","名著"]
            has_cat = any(w in raw_input for w in cat_keywords)
            if not has_author and not has_cat:
                return []
        if target_authors:
            authors_to_search = [a for a in self.db if a["name"] in target_authors]
        else:
            authors_to_search = self.db
        if category_filter:
            authors_to_search = [a for a in authors_to_search if a.get("category") == category_filter]
        for author in authors_to_search:
            author_result = {"name": author["name"], "genre": author.get("genre", ""), "extracted_data": {}}
            for area in focus_areas:
                if area in author:
                    author_result["extracted_data"][area] = author[area]
            if author_result["extracted_data"]:
                results.append(author_result)
        return results


class DeconstructionPromptGenerator:
    @staticmethod
    def generate(intent: Dict, matched_data: List[Dict]) -> str:
        data_sections = []
        
        # 加载原文语料库
        corpus_loader = get_corpus_loader() if HAS_CORPUS else None
        
        for author in matched_data:
            section = f"\n## 风格：{author['name']} ({author['genre']})\n"
            data = author["extracted_data"]
            
            if "lexicon_logic" in data:
                lex = data["lexicon_logic"]
                section += f"### 词汇逻辑拆解\n- **高频词**：{', '.join(lex['高频词'])}\n- **拆析**：{lex['拆析']}\n"
            
            if "environment_logic" in data:
                env = data["environment_logic"]
                section += f"### 环境描写逻辑\n- **典型环境**：{env['典型环境']}\n- **拆析**：{env['拆析']}\n"
                
            if "quotes_and_actions" in data:
                qa = data["quotes_and_actions"]
                section += "### 台词与动作逻辑\n"
                for item in qa:
                    section += f"- **{'台词' if 'quote' in item else '动作'}**：「{item.get('quote', item.get('action'))}」\n  - **拆析**：{item['拆析']}\n"
                    
            if "structural_blueprint" in data:
                struct = data["structural_blueprint"]
                section += "### 全书结构拆解（从第一章到大结局）\n"
                for phase, logic in struct.items():
                    section += f"- **{phase}**：{logic}\n"
            
            # ===== 新增：注入原文语料 =====
            if corpus_loader:
                author_name = author['name']
                # 根据用户需求匹配场景类型
                raw_input = intent.get('raw_input', '')
                scene_hints = []
                for tag, keywords in [
                    ('battle', ['战斗', '打斗', '打架', '对决', '比武', '大战']),
                    ('dialogue', ['对话', '台词', '嘴炮', '聊天', '口才']),
                    ('environment', ['环境', '场景', '风景', '描写', '氛围']),
                    ('psychology', ['心理', '内心', '独白', '情感', '心路']),
                    ('opening', ['开篇', '开头', '出场', '开局']),
                    ('climax', ['高潮', '燃', '爽', '逆袭', '打脸']),
                    ('humor', ['搞笑', '幽默', '轻松', '沙雕']),
                    ('suspense', ['悬疑', '惊悚', '诡异', '恐怖']),
                ]:
                    if any(k in raw_input for k in keywords):
                        scene_hints.append(tag)
                
                scene_type = scene_hints[0] if scene_hints else None
                passages = corpus_loader.get_passages(author_name, scene_type=scene_type, limit=3)
                
                if passages:
                    section += "\n###   原文精读（句式·节奏·信息密度）\n"
                    section += "**以下为该作者的标志性原文片段，注意学习其句式节奏、断句习惯、描写与叙事的比例：**\n\n"
                    for i, p in enumerate(passages, 1):
                        tag_str = "·".join(p.get("tags", []))
                        source = p.get("source", "")
                        section += f"**片段{i}**（{tag_str}）{source}\n"
                        section += f"```\n{p['text']}\n```\n\n"
            
            data_sections.append(section)

        data_text = "\n".join(data_sections)
        
        final_prompt = f"""
# Role: 顶级网文拆书师（外科手术级）

## 你的任务
用户想要深度拆解网文风格的写作逻辑。你不是在复述剧情，你是在做**基因测序**。
你必须基于提供的【拆解数据库】和【原文精读】，结合用户的疑问，用极其锋利、通透的语言，告诉用户：**这种风格为什么要这么写？底层逻辑是什么？如何复用这种技巧？**

## 用户的拆解需求
{intent['raw_input']}

## 匹配的拆解数据库（含原文精读）
{data_text}

## 输出要求
1. **一针见血**：不要说废话，直接点出写作风格的核心本质（例如：史诗风格的词汇是为了施压，武侠风格的环境是心境的镜像）。
2. **举例拆解**：必须引用数据库中的原词/原句/原动作，进行手术刀级的切片分析。
3. **原文精读**：重点分析【原文精读】中的段落，拆解其句式节奏、信息密度、断句技巧。这是学习文风的关键。
4. **实操复用**：在每段拆解后，必须给出【写作复用公式】，教用户如何把这种逻辑套用到自己的小说里。
5. **语言风格**：冷酷、专业、通透，像一个看透网文底层代码的黑客。
"""
        return final_prompt + COPYRIGHT_NOTICE


# (此处原有一个早期残缺的 NovelDeconstructionSkill stub, 已被文件末尾的完整版本覆盖,
#  为避免混淆已删除。完整的 NovelDeconstructionSkill 在文件末尾定义,含 9 个子模块。)

#!/usr/bin/env python3
"""
skills1.py 补充模块：
- 35维审计系统
- 去AI味检测
- 半部小说续写引擎
- 文风仿写
- 开篇诊断
- AI编辑部流水线
"""

# ==========================================
# 模块1：35维审计系统
# ==========================================
# ==========================================
# 模块1：35维审计系统 (v2 - oh-story方法论升级)
# ==========================================

# 平台Rubric定义
PLATFORM_RUBRICS = {
    "fanqie": {
        "name": "番茄小说",
        "focus": ["爽点密度", "章节钩子", "情绪到位", "开篇抓人度", "高潮燃度"],
        "min_satisfaction_per_1k": 2.0,
        "max_chapter_without_hook": 1,
        "golden_chapter_count": 3,
    },
    "qidian": {
        "name": "起点中文网",
        "focus": ["角色一致性", "伏笔与逻辑", "结构与节奏", "文风与表达", "大纲与偏离"],
        "min_satisfaction_per_1k": 1.5,
        "max_chapter_without_hook": 2,
        "golden_chapter_count": 3,
    },
    "zhihu": {
        "name": "知乎盐言故事",
        "focus": ["对话质量", "情绪到位", "文风与表达", "感官描写丰富度", "幽默自然"],
        "min_satisfaction_per_1k": 1.0,
        "max_chapter_without_hook": 1,
        "golden_chapter_count": 1,
    },
    "generic": {
        "name": "通用网文",
        "focus": ["角色一致性", "伏笔与逻辑", "文风与表达", "结构与节奏", "情绪到位"],
        "min_satisfaction_per_1k": 1.0,
        "max_chapter_without_hook": 2,
        "golden_chapter_count": 3,
    },
}

# 严重度定义 (对齐oh-story S1-S4)
SEVERITY = {
    "S1": {"label": "严重", "icon": "🔴", "desc": "影响主线/角色动机/世界规则/读者信任"},
    "S2": {"label": "中等", "icon": "🟡", "desc": "影响留存/节奏/章节效果/人物可信度"},
    "S3": {"label": "轻微", "icon": "🟢", "desc": "局部质量/格式/措辞/轻微节奏问题"},
    "S4": {"label": "建议", "icon": "💡", "desc": "风格建议或可选增强"},
}

# 发布建议门槛
VERDICT_THRESHOLDS = {
    "APPROVE": "无S1/S2，S3可快速处理",
    "CONCERNS": "有S2，或S3数量多影响阅读",
    "REJECT": "有S1，或核心卖点/动机/规则崩坏",
}

class NovelAuditor:
    """35维小说审计系统 (v2)，集成oh-story审查方法论。"""

    def __init__(self, platform="generic"):
        self.platform = platform
        self.rubric = PLATFORM_RUBRICS.get(platform, PLATFORM_RUBRICS["generic"])
        self.dimensions = self._build_dimensions()

    def _build_dimensions(self):
        return [
            # 一、角色一致性 (1-7)
            {"id": 1,  "cat": "角色一致性", "name": "主角性格矛盾", "severity_default": "S1", "check": self._check_protagonist_consistency},
            {"id": 2,  "cat": "角色一致性", "name": "配角工具化", "severity_default": "S3", "check": self._check_side_character_depth},
            {"id": 3,  "cat": "角色一致性", "name": "关系进展自然度", "severity_default": "S2", "check": self._check_relationship_progression},
            {"id": 4,  "cat": "角色一致性", "name": "角色智商在线", "severity_default": "S2", "check": self._check_character_iq},
            {"id": 5,  "cat": "角色一致性", "name": "口头禅/语言习惯统一", "severity_default": "S3", "check": self._check_speech_patterns},
            {"id": 6,  "cat": "角色一致性", "name": "外貌描写一致性", "severity_default": "S2", "check": self._check_appearance_consistency},
            {"id": 7,  "cat": "角色一致性", "name": "角色时间线", "severity_default": "S1", "check": self._check_character_timeline},
            # 二、物资与战力 (8-13)
            {"id": 8,  "cat": "物资与战力", "name": "法宝/技能遗忘", "severity_default": "S2", "check": self._check_forgotten_items},
            {"id": 9,  "cat": "物资与战力", "name": "战力体系崩坏", "severity_default": "S1", "check": self._check_power_system},
            {"id": 10, "cat": "物资与战力", "name": "物资数量矛盾", "severity_default": "S2", "check": self._check_resource_consistency},
            {"id": 11, "cat": "物资与战力", "name": "资源使用合理", "severity_default": "S3", "check": self._check_resource_usage},
            {"id": 12, "cat": "物资与战力", "name": "突破代价削弱", "severity_default": "S2", "check": self._check_breakthrough_cost},
            {"id": 13, "cat": "物资与战力", "name": "货币体系混乱", "severity_default": "S2", "check": self._check_currency_system},
            # 三、伏笔与逻辑 (14-20)
            {"id": 14, "cat": "伏笔与逻辑", "name": "伏笔遗忘", "severity_default": "S1", "check": self._check_foreshadowing},
            {"id": 15, "cat": "伏笔与逻辑", "name": "伏笔回收生硬", "severity_default": "S2", "check": self._check_foreshadowing_payoff},
            {"id": 16, "cat": "伏笔与逻辑", "name": "逻辑漏洞", "severity_default": "S1", "check": self._check_logic_holes},
            {"id": 17, "cat": "伏笔与逻辑", "name": "巧合过多", "severity_default": "S2", "check": self._check_coincidence_overload},
            {"id": 18, "cat": "伏笔与逻辑", "name": "时间线合理性", "severity_default": "S1", "check": self._check_timeline_logic},
            {"id": 19, "cat": "伏笔与逻辑", "name": "信息获取合理", "severity_default": "S2", "check": self._check_information_access},
            {"id": 20, "cat": "伏笔与逻辑", "name": "反派行为逻辑", "severity_default": "S2", "check": self._check_villain_logic},
            # 四、文风与表达 (21-27)
            {"id": 21, "cat": "文风与表达", "name": "AI味检测", "severity_default": "S2", "check": self._check_ai_flavor},
            {"id": 22, "cat": "文风与表达", "name": "描写冗长", "severity_default": "S3", "check": self._check_description_bloat},
            {"id": 23, "cat": "文风与表达", "name": "战斗枯燥", "severity_default": "S2", "check": self._check_combat_dullness},
            {"id": 24, "cat": "文风与表达", "name": "情绪到位", "severity_default": "S2", "check": self._check_emotional_impact},
            {"id": 25, "cat": "文风与表达", "name": "幽默自然", "severity_default": "S3", "check": self._check_humor_naturalness},
            {"id": 26, "cat": "文风与表达", "name": "对话质量", "severity_default": "S2", "check": self._check_dialogue_quality},
            {"id": 27, "cat": "文风与表达", "name": "感官描写丰富度", "severity_default": "S3", "check": self._check_sensory_detail},
            # 五、结构与节奏 (28-32)
            {"id": 28, "cat": "结构与节奏", "name": "章节钩子", "severity_default": "S2", "check": self._check_chapter_hook},
            {"id": 29, "cat": "结构与节奏", "name": "爽点密度", "severity_default": "S2", "check": self._check_satisfaction_density},
            {"id": 30, "cat": "结构与节奏", "name": "开篇抓人度", "severity_default": "S2", "check": self._check_opening_hook},
            {"id": 31, "cat": "结构与节奏", "name": "高潮燃度", "severity_default": "S3", "check": self._check_climax_intensity},
            {"id": 32, "cat": "结构与节奏", "name": "支线挤压主线", "severity_default": "S2", "check": self._check_subplot_intrusion},
            # 六、大纲与偏离 (33-35)
            {"id": 33, "cat": "大纲与偏离", "name": "偏离大纲", "severity_default": "S1", "check": self._check_outline_deviation},
            {"id": 34, "cat": "大纲与偏离", "name": "对话过于密集", "severity_default": "S3", "check": self._check_dialogue_overload},
            {"id": 35, "cat": "大纲与偏离", "name": "背景描写过多", "severity_default": "S3", "check": self._check_exposition_overload},
        ]

    def _locate_issue(self, text, keyword):
        """定位问题在文本中的位置（段落号+大致偏移）。"""
        idx = text.find(keyword)
        if idx < 0:
            return "全文"
        # 计算段落号
        paragraph = text[:idx].count("\\n") + 1
        char_offset = idx
        return f"第{paragraph}段(偏移{char_offset})"

    def _make_finding(self, dim, severity, message, evidence="", fix="", location=""):
        """构造结构化finding (对齐oh-story格式)。"""
        finding = {
            "severity": severity,
            "category": dim["cat"],
            "dimension": dim["name"],
            "dimension_id": dim["id"],
            "location": location,
            "evidence": evidence,
            "issue": message,
            "fix": fix,
        }
        return finding

    def audit(self, text, outline=None):
        """对文本进行35维审计，返回结构化审计报告。"""
        report = {
            "total": len(self.dimensions),
            "platform": self.platform,
            "rubric_name": self.rubric["name"],
            "findings": [],       # 结构化findings (S1-S4)
            "highlights": [],
            "scores": {},
            "verdict": "APPROVE",
            "summary": "",
        }

        for dim in self.dimensions:
            try:
                result = dim["check"](text, outline)
                if result:
                    severity = result.get("severity", dim["severity_default"])
                    location = result.get("location", "")
                    if not location and result.get("evidence"):
                        location = self._locate_issue(text, result["evidence"])
                    finding = self._make_finding(
                        dim=dim,
                        severity=severity,
                        message=result["message"],
                        evidence=result.get("evidence", ""),
                        fix=result.get("fix", result.get("suggestion", "")),
                        location=location,
                    )
                    if result.get("level") == "highlight":
                        report["highlights"].append(finding)
                    else:
                        report["findings"].append(finding)
            except Exception:
                pass

        # 按severity排序 (S1 > S2 > S3 > S4)
        sev_order = {"S1": 0, "S2": 1, "S3": 2, "S4": 3}
        report["findings"].sort(key=lambda f: sev_order.get(f["severity"], 9))

        # 分类统计
        cat_stats = {}
        for dim in self.dimensions:
            cat = dim["cat"]
            if cat not in cat_stats:
                cat_stats[cat] = {"total": 0, "S1": 0, "S2": 0, "S3": 0, "S4": 0}
            cat_stats[cat]["total"] += 1
        for f in report["findings"]:
            cat = f["category"]
            sev = f["severity"]
            if cat in cat_stats:
                cat_stats[cat][sev] = cat_stats[cat].get(sev, 0) + 1
        # 计算分类得分
        for cat, stats in cat_stats.items():
            penalty = stats["S1"] * 30 + stats["S2"] * 15 + stats["S3"] * 5 + stats["S4"] * 1
            stats["score"] = max(0, round(100 - penalty * (100 / max(stats["total"] * 30, 1))))
        report["scores"] = cat_stats

        # 平台加权：focus维度权重x1.5
        if self.rubric.get("focus"):
            for f in report["findings"]:
                if f["dimension"] in self.rubric["focus"]:
                    # 平台focus维度的S2升级为S1
                    if f["severity"] == "S2":
                        f["severity"] = "S1"
                        f["issue"] = f"[平台焦点] " + f["issue"]

        # 判定verdict
        s1_count = sum(1 for f in report["findings"] if f["severity"] == "S1")
        s2_count = sum(1 for f in report["findings"] if f["severity"] == "S2")
        s3_count = sum(1 for f in report["findings"] if f["severity"] == "S3")
        if s1_count > 0:
            report["verdict"] = "REJECT"
        elif s2_count > 0 or s3_count > 5:
            report["verdict"] = "CONCERNS"
        else:
            report["verdict"] = "APPROVE"

        report["summary"] = f"发现 {len(report['findings'])} 个问题 (S1:{s1_count} S2:{s2_count} S3:{s3_count} S4:{len(report['findings'])-s1_count-s2_count-s3_count}), {len(report['highlights'])} 个亮点 → {report['verdict']}"
        return report

    def format_report(self, report):
        """格式化审计报告为可读文本 (oh-story结构化格式)。"""
        lines = []
        lines.append("=" * 60)
        lines.append(f"  📋 35维小说审计报告 [{report['rubric_name']}]")
        lines.append("=" * 60)
        lines.append("")
        lines.append(f"平台: {report['rubric_name']} | 判定: {report['verdict']}")
        lines.append(f"说明: {VERDICT_THRESHOLDS.get(report['verdict'], '')}")
        lines.append("")

        # 分类评分
        lines.append("【分项评分】")
        for cat, stats in report["scores"].items():
            bar = "█" * (stats["score"] // 5) + "░" * (20 - stats["score"] // 5)
            focus_mark = " ⭐" if cat in self.rubric.get("focus", []) else ""
            lines.append(f"  {cat}: {bar} {stats['score']}分{focus_mark}")
        lines.append("")

        # 按severity分组输出findings
        for sev_key in ["S1", "S2", "S3", "S4"]:
            sev_findings = [f for f in report["findings"] if f["severity"] == sev_key]
            if not sev_findings:
                continue
            sev_info = SEVERITY[sev_key]
            lines.append(f"{sev_info['icon']} {sev_info['label']}问题 ({sev_info['desc']})")
            for f in sev_findings:
                lines.append(f"  [{f['dimension_id']}] {f['dimension']}: {f['issue']}")
                if f["location"]:
                    lines.append(f"      📍 位置: {f['location']}")
                if f["evidence"]:
                    lines.append(f"      📝 证据: {f['evidence']}")
                if f["fix"]:
                    lines.append(f"      💡 修复: {f['fix']}")
            lines.append("")

        # 亮点
        if report["highlights"]:
            lines.append("✅ 亮点（保持并强化）")
            for h in report["highlights"]:
                lines.append(f"  [{h['dimension_id']}] {h['dimension']}: {h['issue']}")
            lines.append("")

        lines.append(f"总结: {report['summary']}")
        return "\\n".join(lines)

    # ---- 角色一致性检查 (1-7) ----
    def _check_protagonist_consistency(self, text, outline):
        """检查主角性格是否前后矛盾。"""
        contradictions = []
        evidence_parts = []
        if "突然笑了" in text and "突然哭了" in text:
            contradictions.append("情绪突变")
            idx1, idx2 = text.find("突然笑了"), text.find("突然哭了")
            evidence_parts.append(f"'突然笑了'(偏移{idx1})与'突然哭了'(偏移{idx2})")
        if "再也不" in text and "立刻就" in text:
            contradictions.append("誓言与行为矛盾")
            evidence_parts.append("'再也不'与'立刻就'并存")
        if "冷哼" in text and "温柔" in text:
            contradictions.append("态度矛盾")
        if contradictions:
            severity = "S1" if len(contradictions) >= 2 else "S2"
            return {"severity": severity, "message": f"检测到性格矛盾信号: {', '.join(contradictions)}", "evidence": "; ".join(evidence_parts), "fix": "检查角色在转折点是否有充分的心理铺垫，或确认是否为有意的性格成长弧"}
        return None

    def _check_side_character_depth(self, text, outline):
        """检查配角是否沦为工具人。"""
        # 网文中路人甲/功能性配角是正常存在，不需要每个配角都有完整弧光
        # 只在以下情况报警：大量"众人震惊"式群体反应（说明配角只是气氛组）
        import re
        crowd_reaction = re.findall(r"众人.{0,10}(震惊|惊叹|目瞪口呆|哗然)", text)
        if len(crowd_reaction) > 8:
            return {"level": "info", "message": f"群体反应描写过多（{len(crowd_reaction)}次），可适当精简", "suggestion": "减少'众人震惊'式描写，用具体角色的反应替代"}
        return None

    def _check_relationship_progression(self, text, outline):
        """检查关系进展是否自然。"""
        if "好感度" in text:
            # 检查好感度变化是否有情感铺垫
            import re
            hao_gan = re.findall(r"好感度[+\-]?\d+", text)
            if len(hao_gan) > 3:
                return {"level": "info", "message": f"好感度系统出现{len(hao_gan)}次，注意数值变化需配合情感描写", "suggestion": "每次好感度变化前加入对应的情感互动细节"}
        return None

    def _check_character_iq(self, text, outline):
        """检查角色智商是否在线。"""
        low_iq_signals = ["竟然没想到", "居然忘记", "明知.*还", "明明知道.*却"]
        import re
        for signal in low_iq_signals:
            if re.search(signal, text):
                return {"level": "warning", "message": f"检测到角色智商下线信号: '{signal}'", "suggestion": "给角色的'愚蠢'行为提供合理动机（如情绪失控、信息不对称）"}
        return None

    def _check_speech_patterns(self, text, outline):
        """检查口头禅/语言习惯是否统一。"""
        return None  # 需要多章节对比，单章检查有限

    def _check_appearance_consistency(self, text, outline):
        """检查外貌描写是否前后矛盾。"""
        import re
        colors = re.findall(r"(黑|白|红|蓝|绿|黄|紫|金|银)(发|瞳|眸|衣|袍|裙|衫)", text)
        if len(set(colors)) > 6:
            return {"level": "info", "message": "外貌色彩描写较多，注意前后一致性", "suggestion": "建立角色外貌卡，统一关键视觉标记"}
        return None

    def _check_character_timeline(self, text, outline):
        """检查角色时间线。"""
        return None  # 需要多章节数据

    # ---- 物资与战力检查 (8-13) ----
    def _check_forgotten_items(self, text, outline):
        """检查法宝/技能是否被遗忘。"""
        import re
        # 提取提到的法宝/物品
        items = re.findall(r"(?:得到|获得|取出|掏出|手中|携带)(.{2,6}(?:剑|刀|枪|符|丹|珠|印|镜|塔|鼎))", text)
        if not items:
            return None
        unique_items = list(set(items))
        forgotten = []
        # 使用动词：提到物品后立刻使用不算遗忘
        use_verbs = r"(?:拍|贴|用|扔|祭出|催动|激活|点燃|念|挥|斩|杀|刺|挡|握|举|拔|收|放|吞|吃|喝|化作|瞬间|顿时|随即)"
        for item in unique_items:
            first = text.find(item)
            if first < 0:
                continue
            # 检查物品提到后200字内是否有使用动作
            after_text = text[first:first+300]
            if re.search(use_verbs, after_text):
                continue  # 有使用动作，不算遗忘
            # 检查物品是否只出现1次且全文较长（说明后面再也没提过）
            count = text.count(item)
            if count == 1 and len(text) > 5000:
                forgotten.append(item)
        if forgotten:
            return {"level": "info", "message": f"以下物品只出现1次且未见使用: {', '.join(forgotten[:3])}", "suggestion": "确认后续是否有回收，若无则考虑删除"}
        return None

    def _check_power_system(self, text, outline):
        """检查战力体系是否崩坏。"""
        import re
        # 检测越级战斗
        cross_level = re.findall(r"凝气.*(?:击杀|斩杀|秒杀).*(?:筑基|金丹|元婴)", text)
        if cross_level:
            return {"level": "warning", "message": f"检测到越级战斗{len(cross_level)}次", "suggestion": "越级战斗需有充分理由（法宝、秘术、特殊体质），否则战力体系崩坏"}
        return None

    def _check_resource_consistency(self, text, outline):
        """检查物资数量是否矛盾。"""
        return None

    def _check_resource_usage(self, text, outline):
        """检查资源使用是否合理。"""
        return None

    def _check_breakthrough_cost(self, text, outline):
        """检查突破代价是否被削弱。"""
        import re
        easy_breakthrough = re.findall(r"(?:轻[松易]|简单|容易).{0,10}(?:突破|进阶|晋升)", text)
        if easy_breakthrough:
            return {"level": "warning", "message": f"检测到可能过于轻松的突破{len(easy_breakthrough)}次", "suggestion": "突破应有代价和风险，否则升级感贬值"}
        return None

    def _check_currency_system(self, text, outline):
        """检查货币体系是否混乱。"""
        import re
        currencies = set(re.findall(r"(灵石|金币|银两|铜钱|游戏分|人民币|元)", text))
        if len(currencies) > 3:
            return {"level": "info", "message": f"出现多种货币: {', '.join(currencies)}，注意汇率和换算逻辑", "suggestion": "建立清晰的货币体系表"}
        return None

    # ---- 伏笔与逻辑检查 (14-20) ----
    def _check_foreshadowing(self, text, outline):
        """检查伏笔是否被遗忘。"""
        import re
        foreshadow = re.findall(r"(?:据说|传说|听说|传闻|隐约|仿佛).{5,30}(?:秘密|真相|隐秘|传说|预言)", text)
        if len(foreshadow) > 2:
            return {"level": "info", "message": f"埋设了{len(foreshadow)}个伏笔/悬念，注意后续回收", "suggestion": "建立伏笔清单，标注埋设位置和计划回收时间"}
        return None

    def _check_foreshadowing_payoff(self, text, outline):
        """检查伏笔回收是否生硬。"""
        return None

    def _check_logic_holes(self, text, outline):
        """检查逻辑漏洞。"""
        import re
        # 检测常见逻辑漏洞模式
        holes = []
        if re.search(r"明明.{5,20}却不去", text):
            holes.append("有能力却不行动")
        if re.search(r"早就知道.{5,20}却没有", text):
            holes.append("早知如此却不作为")
        if holes:
            return {"level": "warning", "message": f"可能的逻辑漏洞: {', '.join(holes)}", "suggestion": "为角色的'不合理'行为提供动机解释"}
        return None

    def _check_coincidence_overload(self, text, outline):
        """检查巧合是否过多。"""
        import re
        coincidences = re.findall(r"(?:恰[好巧]|刚好|正[好巧]|碰[巧然]|无[独巧])", text)
        if len(coincidences) > 3:
            return {"level": "warning", "message": f"巧合出现{len(coincidences)}次，过多巧合削弱说服力", "suggestion": "将部分巧合改为角色主动布局的结果"}
        return None

    def _check_timeline_logic(self, text, outline):
        """检查时间线合理性。"""
        return None

    def _check_information_access(self, text, outline):
        """检查信息获取是否合理。"""
        return None

    def _check_villain_logic(self, text, outline):
        """检查反派行为逻辑。"""
        import re
        stupid_villain = re.findall(r"反派.{0,10}(?:废话|解释|炫耀|大笑)", text)
        if stupid_villain:
            return {"level": "info", "message": "检测到反派话多/行为不合理模式", "suggestion": "给反派的'失误'提供合理解释（如轻敌、信息不对称）"}
        return None

    # ---- 文风与表达检查 (21-27) ----
    def _check_ai_flavor(self, text, outline):
        """AI味检测——核心模块。基于公开研究（stop-slop-zh、搜狐/知乎AI写作分析）。"""
        issues = []
        ai_patterns = [
            # 套话连接词
            (r"综上所述", "critical", "AI最爱的总结套话，直接删掉"),
            (r"值得注意的是", "critical", "AI最爱的过渡套话，直接删掉"),
            (r"不难发现", "warning", "AI的判断套话，直接说发现"),
            (r"让我们拭目以待", "critical", "AI最爱的结尾套话，用悬念收尾"),
            (r"在当今.{2,15}的时代", "critical", "AI最爱的开头套话，直接切入"),
            (r"随着.{2,15}的不断(?:进步|发展|深入)", "critical", "AI的时代背景套话"),
            (r"越来越多的", "warning", "AI的数据模糊化，用具体数字"),
            (r"不可忽视的", "warning", "AI的强调套话"),
            # 排比三件套
            (r"首先[，,].{5,30}其次[，,].{5,30}最后", "critical", "AI的排比三件套，打散结构"),
            # 金句收尾
            (r"(?:这|那).{0,5}(?:不仅|不只).{5,30}更是", "warning", "AI的递进金句"),
            # 真正的AI味句式
            (r"他(?:的)?心中不由得.{2,6}(?:一惊|一震|一沉|一紧)", "critical", "AI的内心独白模板"),
            (r"一股(?:暖流|寒意|热流)涌上(?:心头|心间|全身)", "critical", "AI的情绪描写模板"),
            (r"不由自主地", "critical", "AI的高频词"),
        ]
        import re
        for pattern, level, suggestion in ai_patterns:
            matches = re.findall(pattern, text)
            if matches:
                issues.append({
                    "level": level,
                    "message": f"AI味句式「{matches[0][:20]}...」出现{len(matches)}次",
                    "suggestion": suggestion,
                    "pattern": pattern
                })
        if issues:
            return issues[0]  # 返回最严重的一个
        return None

    def _check_description_bloat(self, text, outline):
        """检查描写是否冗长。"""
        import re
        # 检测连续描写段落（超过200字无对话/动作）
        paragraphs = text.split("\n")
        for i, para in enumerate(paragraphs):
            clean = para.strip()
            if len(clean) > 300 and "。" in clean:
                sentences = clean.split("。")
                has_dialogue = any("" in s or "说" in s or "道" in s for s in sentences)
                if not has_dialogue:
                    return {"level": "warning", "message": f"第{i+1}段纯描写超过300字，可能冗长", "suggestion": "穿插对话或动作打破描写节奏"}
        return None

    def _check_combat_dullness(self, text, outline):
        """检查战斗是否枯燥。"""
        import re
        combat_words = ["攻击", "防御", "闪避", "抵挡", "轰出", "劈出", "斩出"]
        combat_count = sum(text.count(w) for w in combat_words)
        if combat_count > 10:
            # 检查是否有情感/心理穿插
            emotion_words = ["恐惧", "兴奋", "决然", "疯狂", "绝望", "热血"]
            emotion_count = sum(text.count(w) for w in emotion_words)
            if emotion_count < 2:
                return {"level": "warning", "message": "战斗描写密集但缺乏情感穿插，可能枯燥", "suggestion": "在战斗中穿插角色心理、观众反应、环境变化"}
        return None

    def _check_emotional_impact(self, text, outline):
        """检查情绪是否到位。"""
        return None

    def _check_humor_naturalness(self, text, outline):
        """检查幽默是否自然。"""
        return None

    def _check_dialogue_quality(self, text, outline):
        """检查对话质量。"""
        import re
        # 检测"说教式"对话
        preachy = re.findall(r'[\u201c\u201d\u300c\u300d].{50,}[\u201c\u201d\u300c\u300d].*(?:说道|道|说)', text)
        if len(preachy) > 2:
            return {"level": "warning", "message": f"检测到{len(preachy)}段长篇说教式对话", "suggestion": "长对话应穿插动作、表情、环境描写，避免大段独白"}
        return None

    def _check_sensory_detail(self, text, outline):
        """检查感官描写丰富度。"""
        senses = {
            "视觉": ["看到", "目光", "眼中", "眼前", "注视", "凝视"],
            "听觉": ["听到", "声音", "响起", "轰鸣", "寂静", "嗡鸣"],
            "嗅觉": ["闻到", "香味", "气味", "血腥味", "恶臭"],
            "触觉": ["感受到", "冰冷", "滚烫", "柔软", "粗糙"],
            "味觉": ["尝到", "苦涩", "甘甜", "血腥"],
        }
        used_senses = []
        for sense, words in senses.items():
            if any(w in text for w in words):
                used_senses.append(sense)
        if len(used_senses) < 2:
            return {"level": "info", "message": f"感官描写偏少（仅覆盖{', '.join(used_senses)}），描写可能平面", "suggestion": "增加听觉、嗅觉、触觉描写，让场景更立体"}
        return None

    # ---- 结构与节奏检查 (28-32) ----
    def _check_chapter_hook(self, text, outline):
        """检查章节结尾是否有钩子 (oh-story标准：悬念/反转/决定/发现)。"""
        last_300 = text[-300:] if len(text) > 300 else text
        hook_types = {
            "悬念": ["？", "……", "怎么回事", "什么情况"],
            "反转": ["突然", "然而", "但是", "没想到", "竟然"],
            "危机": ["不好", "来了", "出现", "危险", "追"],
            "决定": ["决定", "选择", "答应", "拒绝", "答应"],
            "发现": ["只见", "原来", "发现", "看到", "竟是"],
        }
        found_hooks = []
        for hook_type, signals in hook_types.items():
            for s in signals:
                if s in last_300:
                    found_hooks.append(hook_type)
                    break
        if not found_hooks:
            return {"severity": "S2", "message": "章节结尾缺乏钩子，读者可能流失", "evidence": f"结尾300字: '{last_300[-50:]}'", "fix": "用悬念/反转/决定/发现中的一种作为章节收尾，制造翻页欲"}
        return {"level": "highlight", "message": f"章节结尾有钩子: {', '.join(found_hooks)}"}

    def _check_satisfaction_density(self, text, outline):
        """检查爽点密度 (平台感知：番茄>起点>知乎)。"""
        import re
        cool_points = re.findall(r"(?:震惊|目瞪口呆|难以置信|不可思议|惊骇|骇然|倒吸|惊叹|轰动|沸腾|打脸|逆袭|碾压|秒杀)", text)
        word_count = len(text)
        if word_count > 1000:
            density = len(cool_points) / (word_count / 1000)
            min_density = self.rubric.get("min_satisfaction_per_1k", 1.0)
            if density < min_density:
                severity = "S2" if self.platform in ("fanqie",) else "S3"
                return {"severity": severity, "message": f"爽点密度偏低（每千字{density:.1f}个，{self.rubric['name']}建议≥{min_density}）", "evidence": f"共{len(cool_points)}个爽点/{word_count}字", "fix": "每1000-2000字安排一个爽点（打脸/突破/震惊/反转）"}
            elif density > 5:
                return {"severity": "S3", "message": f"爽点密度偏高（每千字{density:.1f}个），可能审美疲劳", "evidence": f"共{len(cool_points)}个爽点/{word_count}字", "fix": "爽点之间留出铺垫和过渡空间"}
        return None

    def _check_opening_hook(self, text, outline):
        """检查开篇抓人度 (oh-story标准：前300-500字)。"""
        first_500 = text[:500]
        hook_elements = []
        # 悬念
        if any(w in first_500 for w in ["？", "怎么回事", "什么情况", "不可能"]):
            hook_elements.append("悬念")
        # 危机
        if any(w in first_500 for w in ["危机", "危险", "追杀", "死亡", "血", "伤", "逃"]):
            hook_elements.append("危机")
        # 金手指
        if any(w in first_500 for w in ["穿越", "重生", "系统", "金手指", "觉醒", "传承"]):
            hook_elements.append("金手指")
        # 冲突
        if any(w in first_500 for w in ["冲突", "吵架", "打", "杀", "滚", "找死", "废物"]):
            hook_elements.append("冲突")
        # 反转
        if any(w in first_500 for w in ["竟然", "居然", "没想到", "不可能", "怎么会"]):
            hook_elements.append("反转")
        # 主角快速出场
        protagonist出场 = bool(re.search(r"[我他她]", first_500[:200]))

        if not hook_elements:
            return {"severity": "S2", "message": "开篇500字缺乏抓人元素", "evidence": f"开头: '{first_500[:80]}...'", "fix": "开篇立即建立悬念/冲突/危机，避免大段背景介绍或天气描写"}
        result = {"level": "highlight", "message": f"开篇包含: {', '.join(hook_elements)}"}
        if not protagonist出场:
            result["message"] += " (注意：主角未在前200字出场)"
        return result

    def _check_climax_intensity(self, text, outline):
        """检查高潮燃度。"""
        return None

    def _check_subplot_intrusion(self, text, outline):
        """检查支线是否挤压主线。"""
        return None

    # ---- 大纲与偏离检查 (33-36) ----
    def _check_outline_deviation(self, text, outline):
        """检查是否偏离大纲。"""
        if outline:
            return {"level": "info", "message": "大纲比对需要人工确认，系统仅提供关键词匹配参考"}
        return None

    def _check_dialogue_overload(self, text, outline):
        """检查对话是否过于密集。"""
        import re
        dialogue_count = len(re.findall(r"[\"「].*?[\"」]", text))
        total_chars = len(text)
        if total_chars > 0 and dialogue_count > 0:
            ratio = dialogue_count * 30 / total_chars  # 假设每段对话平均30字
            if ratio > 0.6:
                return {"level": "warning", "message": f"对话占比{ratio:.0%}，可能过于密集", "suggestion": "穿插动作、心理、环境描写，打破对话节奏"}
        return None

    def _check_exposition_overload(self, text, outline):
        """检查背景描写是否过多。"""
        import re
        exposition = re.findall(r"(?:据说|传说|原本|以前|曾经|当初|从前).{10,50}(?:因此|所以|于是|故而)", text)
        if len(exposition) > 3:
            return {"level": "warning", "message": f"背景叙述段落较多（{len(exposition)}处），可能拖慢节奏", "suggestion": "将背景信息融入对话和行动中，避免大段旁白"}
        return None

    def _check_narrator_intrusion(self, text, outline):
        """检查旁白是否过多。"""
        import re
        narrator_voice = re.findall(r"(?:笔者|作者|事实上|实际上|不得不说|客观来说)", text)
        if narrator_voice:
            return {"level": "warning", "message": f"检测到作者旁白介入{len(narrator_voice)}次", "suggestion": "小说应通过角色视角叙事，避免作者跳出来评论"}
        return None


# ==========================================
# 模块2：去AI味检测器
# ==========================================
class AIDetector:
    """去AI味检测器 v2 (oh-story方法论)。
    
    三遍法：
    第一遍：模式扫描 - 检测AI写作指纹（套话/水词/叠加描写/章末总结体）
    第二遍：深度分析 - 检测结构性问题（排比堆砌/情绪告知/比喻滥用）
    第三遍：综合评估 - 输出AI味浓度评分 + 具体修改建议
    
    过度保护：删除比例上限（轻度≤15%/中度≤25%/重度≤35%）
    """

    # === AI写作指纹库 (对齐oh-story anti-ai-writing.md) ===
    FINGERPRINTS = {
        # 一、高频AI用词
        "高频套话": [
            (r"综上所述", "AI总结套话", "直接删掉"),
            (r"值得注意的是", "AI过渡套话", "直接删掉"),
            (r"不难发现", "AI判断套话", "删掉，直接说发现"),
            (r"换句话说", "AI解释套话", "删掉，直接说"),
            (r"让我们拭目以待", "AI结尾套话", "用具体行动收尾"),
            (r"在当今.{2,15}的时代", "AI开头套话", "直接切入主题"),
            (r"随着.{2,15}的不断(?:进步|发展|深入)", "AI时代背景", "用具体案例替代"),
            (r"越来越多的", "AI数据模糊化", "用具体数字替代"),
            (r"与此同时", "AI连接词", "用'这时'替代"),
            (r"不可忽视的", "AI强调套话", "直接说重要"),
            (r"不由自主地", "AI高频词", "删除，直接写动作"),
            (r"缓缓开口", "AI对话起手式", "用动作引出对话"),
            (r"深吸一口气", "AI情绪起手式", "直接删或改成角色动作"),
        ],
        # 二、情绪告知 (Show Don't Tell违反)
        "情绪告知": [
            (r"他感到一阵.{2,6}", "直接告知情绪", "用动作展示（如'手在抖'）"),
            (r"内心充满了.{2,6}", "直接告知情绪", "用具体行为展示"),
            (r"一股.{2,6}涌上心头", "情绪标签模板", "用身体反应替代"),
            (r"心中涌起一股", "情绪模板", "用动作替代感受"),
            (r"眼中闪过一丝", "情绪模板", "用'他垂下眼'或'眯起眼'"),
            (r"嘴角勾起一抹", "表情模板", "用'他嘴角一扯'或'乐了'"),
            (r"他(?:的)?心中不由得.{2,6}(?:一惊|一震|一沉|一紧)", "内心独白模板", "删除'不由得'，直接写动作"),
            (r"一股(?:暖流|寒意|热流)涌上(?:心头|心间|全身)", "情绪模板", "用行动替代感受"),
        ],
        # 三、章末总结体 (oh-story明确禁止)
        "章末总结体": [
            (r"他终于明白了", "章末感悟", "用动作/对话收尾"),
            (r"这一夜.{0,5}(?:注定|无人入眠|注定不平静)", "章末升华", "用悬念收尾"),
            (r"人生就是.{5,20}", "章末哲理", "删掉，让读者自己感悟"),
            (r"更大的风暴.{0,5}即将来临", "章末预告", "用具体事件暗示"),
            (r"他不知道的是", "章末悬念模板", "直接展示发生了什么"),
        ],
        # 四、叠加式描写 (同一动作掰开写三遍)
        "叠加式描写": [
            (r"先.{5,20}再.{5,20}最后.{5,20}", "叠加三段式", "揉进同一段连续叙述"),
            (r"不仅.{5,20}而且.{5,20}更.{5,20}", "递进排比", "打散为自然叙述"),
        ],
        # 五、排比堆砌
        "排比堆砌": [
            (r"首先[，,].{5,30}其次[，,].{5,30}最后", "排比三件套", "打散结构，不要一二三"),
            (r"一方面.{5,30}另一方面", "对比套话", "用具体案例替代"),
            (r"(?:这|那).{0,5}(?:不仅|不只).{5,30}更是", "递进金句", "用行动收尾"),
            (r"(?:这|那).{0,5}才是.{2,15}(?:真正|本质)", "升华金句", "让读者自己感悟"),
        ],
        # 六、比喻滥用
        "比喻滥用": [
            (r"仿佛.{2,8}般", "万能比喻", "优先白描，确需比喻时用生活化表达"),
            (r"宛如.{2,8}似的", "万能比喻", "优先白描"),
            (r"像.{2,6}一样", "通用比喻", "用具体动作替代"),
        ],
        # 七、引号滥用 (oh-story特别指出)
        "引号滥用": [
            (r"所谓的.{2,10}", "引号强调普通名词", "去掉引号，用事件本身体现分量"),
            (r"完成这次.{2,10}", "引号包装概念", "直接说完成"),
        ],
    }

    # 自然文本替换参考 (对齐oh-story自然文本特征表)
    REPLACEMENTS = {
        "深吸一口气": "直接删；若确有功能，改成角色当下动作",
        "眼中闪过一丝": "他垂下眼/眯起眼",
        "嘴角勾起一抹": "他嘴角一扯/乐了",
        "仿佛": "优先直接白描；确需比喻时只留生活化、角色化比喻",
        "不禁": "直接写动作",
        "缓缓开口": "说/用动作引出对话",
        "不由自主地": "删除，直接写动作",
        "心中涌起一股": "用动作替代",
        "一股暖流涌上心头": "用身体反应替代",
    }

    # 删除比例上限 (oh-story过度保护)
    DELETION_LIMITS = {
        "light": 0.15,   # 轻度AI味：≤15%
        "moderate": 0.25, # 中度AI味：≤25%
        "heavy": 0.35,    # 重度AI味：≤35%
    }

    def __init__(self):
        pass

    def _locate(self, text, keyword):
        """定位关键词在文本中的位置。"""
        idx = text.find(keyword)
        if idx < 0:
            return ""
        paragraph = text[:idx].count("\n") + 1
        return f"第{paragraph}段(偏移{idx})"

    def detect(self, text):
        """第一遍：模式扫描 - 检测AI写作指纹。"""
        import re
        all_issues = []
        total_matches = 0

        for category, patterns in self.FINGERPRINTS.items():
            category_issues = []
            for pattern, reason, fix in patterns:
                matches = list(re.finditer(pattern, text))
                if matches:
                    total_matches += len(matches)
                    # 取前2个作为证据
                    evidence = []
                    for m in matches[:2]:
                        loc = self._locate(text, m.group())
                        evidence.append(f"'{m.group()[:20]}'({loc})")
                    category_issues.append({
                        "pattern": pattern,
                        "count": len(matches),
                        "reason": reason,
                        "fix": fix,
                        "evidence": "; ".join(evidence),
                    })
            if category_issues:
                all_issues.append({
                    "category": category,
                    "issues": category_issues,
                    "total": sum(i["count"] for i in category_issues),
                })

        return {
            "total_matches": total_matches,
            "categories": all_issues,
            "text_length": len(text),
        }

    def detect_depth(self, text):
        """第二遍：深度分析 - 结构性问题检测。"""
        import re
        depth_issues = []

        # 检测情绪告知密度
        tell_patterns = re.findall(r"(?:感到|觉得|意识到|明白|知道).{0,5}(?:紧张|害怕|开心|难过|愤怒|悲伤)", text)
        if len(tell_patterns) > 3:
            depth_issues.append({
                "type": "情绪告知过度",
                "count": len(tell_patterns),
                "severity": "S2",
                "fix": "用动作/身体反应替代直接情绪告知",
                "evidence": f"共{len(tell_patterns)}处情绪告知",
            })

        # 检测段落长度均匀度 (AI特征：段落长度过于整齐)
        paragraphs = [p for p in text.split("\n") if len(p.strip()) > 20]
        if len(paragraphs) > 5:
            lengths = [len(p) for p in paragraphs]
            avg = sum(lengths) / len(lengths)
            variance = sum((l - avg) ** 2 for l in lengths) / len(lengths)
            if variance < 100:  # 方差很小说明段落长度过于均匀
                depth_issues.append({
                    "type": "段落长度过于均匀",
                    "count": len(paragraphs),
                    "severity": "S3",
                    "fix": "爽点/转折压短段落，推理/氛围放长段落",
                    "evidence": f"段落长度方差{variance:.0f}（过小）",
                })

        # 检测连续排比
        triple_parallel = re.findall(r"(?:是.{2,10}[，,]){2,}", text)
        if len(triple_parallel) > 2:
            depth_issues.append({
                "type": "连续排比堆砌",
                "count": len(triple_parallel),
                "severity": "S2",
                "fix": "排比最多1-2个，从不连续3+",
                "evidence": f"连续排比{len(triple_parallel)}处",
            })

        return depth_issues

    def assess_level(self, scan_result, depth_result):
        """第三遍：综合评估 - AI味浓度评分。"""
        total = scan_result["total_matches"]
        text_len = scan_result["text_length"]
        depth_count = len(depth_result)

        if text_len == 0:
            return {"ai_score": 0, "level": "none", "deletion_limit": 0}

        # 计算AI味浓度 (0-10)
        base_score = min(total / max(text_len / 500, 1), 5)
        depth_bonus = min(depth_count * 0.5, 3)
        ai_score = round(min(base_score + depth_bonus, 10), 1)

        # 确定等级和删除上限
        if ai_score >= 7:
            level = "heavy"
        elif ai_score >= 4:
            level = "moderate"
        else:
            level = "light"

        return {
            "ai_score": ai_score,
            "level": level,
            "level_cn": {"light": "轻度", "moderate": "中度", "heavy": "重度", "none": "无"}[level],
            "deletion_limit": self.DELETION_LIMITS.get(level, 0.15),
            "total_matches": total,
            "depth_issues": depth_count,
        }

    def format_report(self, scan_result, depth_result=None, assessment=None):
        """格式化去AI味报告 (oh-story三遍法结果)。"""
        if assessment is None:
            assessment = self.assess_level(scan_result, depth_result or [])
        if depth_result is None:
            depth_result = []

        lines = []
        lines.append("=" * 60)
        lines.append(f"  🤖 去AI味检测报告 (三遍法)")
        lines.append("=" * 60)
        lines.append("")
        lines.append(f"AI味浓度: {assessment['ai_score']}/10 ({assessment['level_cn']})")
        lines.append(f"删除上限: {assessment['deletion_limit']:.0%} (过度保护)")
        lines.append("")

        # 第一遍：模式扫描结果
        lines.append("【第一遍：模式扫描】")
        if scan_result["categories"]:
            for cat_data in scan_result["categories"]:
                lines.append(f"  📌 {cat_data['category']} ({cat_data['total']}处)")
                for issue in cat_data["issues"]:
                    lines.append(f"    ✖ 「{issue['reason']}」出现{issue['count']}次")
                    lines.append(f"      证据: {issue['evidence']}")
                    lines.append(f"      修改: {issue['fix']}")
        else:
            lines.append("  ✅ 未检测到明显AI写作指纹")
        lines.append("")

        # 第二遍：深度分析
        if depth_result:
            lines.append("【第二遍：深度分析】")
            for d in depth_result:
                sev_icon = {"S1": "🔴", "S2": "🟡", "S3": "🟢"}.get(d["severity"], "⚪")
                lines.append(f"  {sev_icon} {d['type']} ({d['count']}处)")
                lines.append(f"    证据: {d['evidence']}")
                lines.append(f"    修改: {d['fix']}")
            lines.append("")

        # 替换参考
        lines.append("【自然表达替换参考】")
        for old_expr, new_expr in self.REPLACEMENTS.items():
            if old_expr in scan_result.get("_raw_text", ""):
                lines.append(f"  「{old_expr}」→ {new_expr}")
        lines.append("")

        lines.append(f"总结: 共{assessment['total_matches']}处AI指纹, {assessment['depth_issues']}处结构问题 → {assessment['level_cn']}AI味")
        return "\n".join(lines)

# ==========================================
# 模块3：半部小说续写引擎
# ==========================================
class ContinuationEngine:
    """分析已有稿件，诊断卡点，提供续写方案。"""

    def __init__(self, db):
        self.db = db

    def analyze(self, text, style_ref=None):
        """五维拆解分析。"""
        report = {
            "structure": self._analyze_structure(text),
            "characters": self._analyze_characters(text),
            "style": self._analyze_style(text),
            "foreshadowing": self._analyze_foreshadowing(text),
            "satisfaction": self._analyze_satisfaction(text),
        }
        return report

    def diagnose_stuck(self, text, last_chapter_summary=""):
        """诊断卡文类型，给出续写路径。"""
        diagnosis = {
            "stuck_type": self._identify_stuck_type(text),
            "paths": [],
        }
        stuck_type = diagnosis["stuck_type"]
        if stuck_type == "剧情枯竭":
            diagnosis["paths"] = [
                {"name": "引入新势力", "desc": "新的敌人/盟友出现，打破僵局", "pros": "制造新冲突", "cons": "可能节奏突兀"},
                {"name": "揭示秘密", "desc": "已有角色/物品背后隐藏真相浮出水面", "pros": "回收伏笔", "cons": "需要前期铺垫"},
                {"name": "升级突破", "desc": "主角获得新能力/资源，打开新局面", "pros": "爽感强", "cons": "需合理代价"},
            ]
        elif stuck_type == "节奏失衡":
            diagnosis["paths"] = [
                {"name": "跳过过渡", "desc": "直接切入下一个冲突点", "pros": "节奏加快", "cons": "可能跳戏"},
                {"name": "加入日常", "desc": "用轻松日常调节节奏", "pros": "张弛有度", "cons": "可能被说水"},
                {"name": "支线收束", "desc": "将散开的支线收拢到主线", "pros": "结构完整", "cons": "需要提前规划"},
            ]
        elif stuck_type == "人物崩塌":
            diagnosis["paths"] = [
                {"name": "回溯动机", "desc": "重新审视角色的核心动机，让行为逻辑回归", "pros": "人设稳固", "cons": "可能需要改前文"},
                {"name": "外部压力", "desc": "用极端环境逼迫角色做出非常规选择，解释行为偏差", "pros": "合理化异常", "cons": "不能常用"},
            ]
        elif stuck_type == "设定漏洞":
            diagnosis["paths"] = [
                {"name": "补设定", "desc": "用角色对话/旁白补充解释规则", "pros": "漏洞修复", "cons": "可能生硬"},
                {"name": "利用漏洞", "desc": "将漏洞变成伏笔，后续揭示这是'被设计的'", "pros": "化bug为feature", "cons": "需要后续兑现"},
            ]
        else:
            diagnosis["paths"] = [
                {"name": "时间跳跃", "desc": "跳到下一个关键时间点", "pros": "跳过无聊期", "cons": "可能丢失细节"},
                {"name": "视角切换", "desc": "切换到其他角色视角，从新角度推进剧情", "pros": "信息增量", "cons": "可能分散焦点"},
            ]
        return diagnosis

    def generate_continuation(self, text, path_name, style_ref=None, word_count=800):
        """根据选择的路径生成续写示范。"""
        # 分析当前文本的风格
        style = self._analyze_style(text)
        last_para = text[-500:] if len(text) > 500 else text
        # 构建续写prompt
        prompt = f"""基于以下文本风格和续写路径，生成{word_count}字续写。

【当前文本风格】
{style}

【最后段落】
{last_para[-300:]}

【续写路径】{path_name}

【要求】
1. 保持原文风格和人设
2. 自然衔接，不突兀
3. 包含至少一个爽点或悬念钩子
4. 避免AI味句式

请直接输出续写内容："""
        return prompt

    def _analyze_structure(self, text):
        """分析剧情结构。"""
        word_count = len(text)
        has_conflict = any(w in text for w in ["冲突", "战斗", "争吵", "追杀", "危机"])
        has_climax = any(w in text for w in ["爆发", "最终", "决战", "突破", "真相"])
        has_setup = any(w in text for w in ["原来", "曾经", "从前", "背景"])
        parts = []
        if has_setup: parts.append("铺垫✓")
        if has_conflict: parts.append("冲突✓")
        if has_climax: parts.append("高潮✓")
        return f"字数: {word_count} | 结构: {', '.join(parts) if parts else '结构尚不清晰'}"

    def _analyze_characters(self, text):
        """分析人物。"""
        import re
        # 提取名字
        names = re.findall(r"[\u4e00-\u9fff]{2,4}(?=[说道喊叫看笑哭])", text)
        from collections import Counter
        name_counts = Counter(names).most_common(5)
        return f"出场角色: {', '.join(f'{n}({c}次)' for n, c in name_counts)}"

    def _analyze_style(self, text):
        """分析文风。"""
        word_count = len(text)
        import re
        dialogue_count = len(re.findall(r"[\"「].*?[\"」]", text))
        dialogue_ratio = dialogue_count * 30 / max(word_count, 1)
        # 判断风格
        style_tags = []
        if dialogue_ratio > 0.4: style_tags.append("对话密集")
        else: style_tags.append("描写为主")
        if any(w in text for w in ["搞笑", "哈哈", "笑死", "吐槽"]): style_tags.append("幽默")
        if any(w in text for w in ["热血", "燃", "战", "杀"]): style_tags.append("热血")
        if any(w in text for w in ["温馨", "温暖", "治愈"]): style_tags.append("治愈")
        if any(w in text for w in ["阴暗", "诡异", "恐怖", "黑暗"]): style_tags.append("暗黑")
        return f"风格标签: {', '.join(style_tags) if style_tags else '风格中性'} | 对话占比: {dialogue_ratio:.0%}"

    def _analyze_foreshadowing(self, text):
        """分析伏笔。"""
        import re
        foreshadows = re.findall(r"(?:据说|传说|隐约|仿佛|好像).{5,30}(?:秘密|真相|隐秘)", text)
        return f"伏笔数: {len(foreshadows)}"

    def _analyze_satisfaction(self, text):
        """分析爽点。"""
        import re
        cool_points = re.findall(r"(?:震惊|目瞪口呆|难以置信|骇然|轰动|秒杀|碾压)", text)
        return f"爽点数: {len(cool_points)}"

    def _identify_stuck_type(self, text):
        """识别卡文类型。"""
        import re
        last_part = text[-2000:] if len(text) > 2000 else text
        word_count = len(last_part)
        # 信号检测
        signals = {}
        # 剧情枯竭信号
        plot_signals = re.findall(r"(?:不知|不知道|茫然|无从|毫无头绪|不知所措|该怎么|怎么办|接下来)", last_part)
        signals["剧情枯竭"] = len(plot_signals)
        # 节奏失衡信号：对话过多或描写过多
        dialogue_count = len(re.findall(r"[\"「]", last_part))
        dialogue_ratio = dialogue_count * 20 / max(word_count, 1)
        if dialogue_ratio > 0.5:
            signals["节奏失衡"] = 3
        elif dialogue_ratio < 0.05 and word_count > 500:
            signals["节奏失衡"] = 2
        # 人物崩塌信号
        character_signals = re.findall(r"(?:突然|忽然|竟然|居然).{5,15}(?:变了|转变|不同|不像|反常)", last_part)
        signals["人物崩塌"] = len(character_signals)
        # 设定漏洞信号
        setting_signals = re.findall(r"(?:矛盾|不合理|说不通|解释不了|说不过去)", last_part)
        signals["设定漏洞"] = len(setting_signals)
        # 感情线僵硬信号
        romance_signals = re.findall(r"(?:突然|莫名其妙|不知为何).{5,15}(?:喜欢|爱上|心动|动情)", last_part)
        signals["感情线僵硬"] = len(romance_signals)
        # 返回最高分的卡文类型
        if max(signals.values()) == 0:
            # 没有明显信号，根据文本特征判断
            if word_count < 300:
                return "剧情枯竭"
            return "剧情枯竭"
        return max(signals, key=signals.get)


# ==========================================
# 模块4：文风仿写器
# ==========================================
class StyleImitator:
    """分析文风，生成仿写内容。"""

    def __init__(self, db=None):
        self.db = db or []

    def analyze_style(self, text, author_name=None):
        """深度分析文本风格，返回风格指纹。"""
        import re
        analysis = {
            "word_count": len(text),
            "sentence_avg_len": self._avg_sentence_len(text),
            "dialogue_ratio": self._dialogue_ratio(text),
            "paragraph_avg_len": self._avg_paragraph_len(text),
            "adjective_density": self._adjective_density(text),
            "exclamation_rate": text.count("！") / max(len(text), 1),
            "question_rate": text.count("？") / max(len(text), 1),
            "ellipsis_rate": text.count("……") / max(len(text), 1),
            "top_words": self._top_keywords(text),
            "style_tags": [],
        }
        # 判断风格标签
        if analysis["dialogue_ratio"] > 0.4:
            analysis["style_tags"].append("对话驱动")
        elif analysis["dialogue_ratio"] > 0.2:
            analysis["style_tags"].append("对话+描写混合")
        else:
            analysis["style_tags"].append("描写驱动")
        if analysis["sentence_avg_len"] < 15:
            analysis["style_tags"].append("短句为主·节奏快")
        elif analysis["sentence_avg_len"] > 30:
            analysis["style_tags"].append("长句为主·节奏慢")
        else:
            analysis["style_tags"].append("句长适中")
        if analysis["exclamation_rate"] > 0.01:
            analysis["style_tags"].append("情绪强烈")
        if analysis["ellipsis_rate"] > 0.005:
            analysis["style_tags"].append("留白多·文艺感")
        # 额外指标
        analysis["question_rate"] = text.count("？") / max(len(text), 1)
        if analysis["question_rate"] > 0.01:
            analysis["style_tags"].append("疑问多·思辨型")
        # 检测动作描写密度
        import re
        action_verbs = re.findall(r"(?:站|坐|走|跑|跳|拿|放|看|听|说|笑|哭|喊|叫|打|杀|挥|劈|斩|挡|闪|躲|冲|扑|推|拉|握|捏|踢|踩|扔|丢|捡|抱|摸|敲|砸|摔|踢)", text)
        analysis["action_density"] = len(action_verbs) / max(len(text), 1)
        if analysis["action_density"] > 0.03:
            analysis["style_tags"].append("动作密集·画面感强")
        # 检测心理描写密度
        mind_words = re.findall(r"(?:心中|内心|心想|暗想|暗忖|思忖|觉得|感到|感觉|想到|回忆|想起)", text)
        analysis["mind_density"] = len(mind_words) / max(len(text), 1)
        if analysis["mind_density"] > 0.01:
            analysis["style_tags"].append("心理描写多·内心戏丰富")
        # 匹配写作风格
        if author_name:
            matched = self._match_author_style(analysis, author_name)
            analysis["matched_author"] = matched
        return analysis

    def generate_imitation(self, style_analysis, topic, word_count=800, author_name=None):
        """根据风格分析生成仿写prompt（含原文语料参考）。"""
        # ===== 新增：从语料库获取原文参考 =====
        corpus_ref = ""
        if author_name and HAS_CORPUS:
            corpus_loader = get_corpus_loader()
            few_shot = corpus_loader.get_few_shot_prompt(author_name, limit=3)
            if few_shot:
                corpus_ref = f"""
【原文精读 - {author_name}】
以下是该作者的代表性原文片段。请仔细观察其句式节奏、断句习惯、信息密度，然后模仿这种"味道"来写。
不要模仿内容，要模仿笔法。

{few_shot}

"""
        
        prompt = f"""请仿写以下风格的{word_count}字小说片段。

{corpus_ref}【风格指纹】
- 平均句长: {style_analysis['sentence_avg_len']:.1f}字
- 对话占比: {style_analysis['dialogue_ratio']:.0%}
- 风格标签: {', '.join(style_analysis['style_tags'])}
- 感叹号频率: {style_analysis['exclamation_rate']:.4f}
- 省略号频率: {style_analysis['ellipsis_rate']:.4f}
- 高频词: {', '.join(style_analysis['top_words'][:10])}

【主题/场景】{topic}

【要求】
1. 严格匹配上述风格指纹和原文片段的笔法
2. 避免AI味句式（不要用'不由得'、'一股暖流涌上心头'、'他知道，自己必须变强'等）
3. 包含至少一个记忆点（金句/名场面/反转）
4. 句式要有变化：长短交替，不要全是中等长度的句子
5. 场景描写要有感官细节
6. 心理描写要用具体念头，不要概括

请直接输出仿写内容："""
        return prompt + COPYRIGHT_NOTICE

    def _avg_sentence_len(self, text):
        import re
        sentences = re.split(r"[。！？\n]", text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 3]
        if not sentences:
            return 0
        return sum(len(s) for s in sentences) / len(sentences)

    def _dialogue_ratio(self, text):
        import re
        # 匹配中文弯引号、直引号、日式引号
        dialogues = re.findall(r'[\u201c\u300c\u300e"].*?[\u201d\u300d\u300f"]', text)
        dialogue_chars = sum(len(d) for d in dialogues)
        return dialogue_chars / max(len(text), 1)
    def _avg_paragraph_len(self, text):
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        return sum(len(p) for p in paragraphs) / max(len(paragraphs), 1)

    def _adjective_density(self, text):
        import re
        adjectives = re.findall(r"[^\u4e00-\u9fff]?([\u4e00-\u9fff]{2}(?:的|地|得))", text)
        return len(adjectives) / max(len(text), 1)

    def _top_keywords(self, text, n=15):
        from collections import Counter
        stopwords = {"一个","他们","我们","你们","这个","那个","什么","怎么","没有","不是","可以","已经","但是","然而","所以","因为","如果","虽然","就是","还是","只是","这样","那样","自己","这里","那里","时候","知道","看到","听到","说道","看着","觉得","出来","起来","过来","开始","然后","突然","忽然","可能","应该","不会","不能","没有","一直","已经","终于","居然","竟然","不过","而是","或者","而且","并且","尤其","甚至","除了","至少","终于","既然","虽然","无论","不管","只有","只要","不过","然而","因此","于是","然后","接着","随后","首先","其次","最后","一天","一下","一些","一切","一样","一般","一种","同时","之后","之前","以来","之后","面前","眼前","身旁","身边","之中","之间","以上","以下","其中","之外","之间","面前","地上","头上","手里","心中","背后","面前","远处","前方","身后","四周","周围","旁边"}
        # 用正则提取2-4字中文词，但按标点和常见词边界切分
        import re
        # 先按标点分句
        sentences = re.split(r"[。！？，、；：""''\u3000\n\r]", text)
        words = []
        for sent in sentences:
            sent = sent.strip()
            if len(sent) < 2:
                continue
            # 提取2-4字的中文片段
            fragments = re.findall(r"[\u4e00-\u9fff]{2,4}", sent)
            words.extend(fragments)
        filtered = [w for w in words if w not in stopwords and len(w) >= 2]
        return [w for w, _ in Counter(filtered).most_common(n)]

    def _match_author_style(self, analysis, author_name):
        """匹配写作风格。"""
        for author in self.db:
            if author["name"] == author_name:
                return {"name": author["name"], "genre": author.get("genre", ""), "match": "direct"}
        return {"name": "未匹配", "match": "none"}


# ==========================================
# 模块5：开篇诊断器
# ==========================================
class OpeningDiagnosis:
    """黄金三章诊断：分析开篇是否抓人。"""

    def diagnose(self, text, chapter_count=3):
        """诊断开篇质量。"""
        # 提取前3章或前6000字
        chapters = self._split_chapters(text)
        target = chapters[:chapter_count] if len(chapters) >= chapter_count else chapters
        target_text = "\n".join(target)
        if not target_text:
            target_text = text[:6000]

        report = {
            "hook_score": self._score_hook(target_text),
            "character_score": self._score_character(target_text),
            "conflict_score": self._score_conflict(target_text),
            "worldbuilding_score": self._score_worldbuilding(target_text),
            "pacing_score": self._score_pacing(target_text),
            "issues": [],
            "suggestions": [],
        }
        # 综合评分
        scores = [report["hook_score"], report["character_score"],
                  report["conflict_score"], report["worldbuilding_score"],
                  report["pacing_score"]]
        report["total_score"] = sum(scores) / len(scores)
        # 生成建议
        if report["hook_score"] < 60:
            report["issues"].append("开篇钩子不足")
            report["suggestions"].append("第一章第一段就应建立悬念/危机/冲突，不要从日常开始")
        if report["character_score"] < 60:
            report["issues"].append("主角形象模糊")
            report["suggestions"].append("第一章内必须让读者知道主角是谁、处境如何、想要什么")
        if report["conflict_score"] < 60:
            report["issues"].append("冲突建立太慢")
            report["suggestions"].append("前三章必须出现至少一个核心冲突，且与主角直接相关")
        if report["worldbuilding_score"] > 80:
            report["issues"].append("世界观介绍过多")
            report["suggestions"].append("世界观融入剧情中展示，不要集中讲解")
        if report["pacing_score"] < 60:
            report["issues"].append("节奏拖沓")
            report["suggestions"].append("每章至少一个小高潮或反转，删除无意义的过渡段落")
        return report

    def format_report(self, report):
        """格式化诊断报告。"""
        lines = ["=" * 50, "  📖 黄金三章诊断报告", "=" * 50, ""]
        metrics = [
            ("开篇钩子", report["hook_score"]),
            ("主角塑造", report["character_score"]),
            ("冲突建立", report["conflict_score"]),
            ("世界观展示", report["worldbuilding_score"]),
            ("节奏控制", report["pacing_score"]),
        ]
        for name, score in metrics:
            bar = "█" * (score // 5) + "░" * (20 - score // 5)
            lines.append(f"  {name}: {bar} {score}分")
        lines.append(f"\n  综合评分: {report['total_score']:.0f}/100")
        if report["issues"]:
            lines.append("\n【问题】")
            for issue in report["issues"]:
                lines.append(f"  ⚠ {issue}")
        if report["suggestions"]:
            lines.append("\n【修改建议】")
            for i, sug in enumerate(report["suggestions"], 1):
                lines.append(f"  {i}. {sug}")
        return "\n".join(lines)

    def _split_chapters(self, text):
        """按章节分割。"""
        import re
        chapters = re.split(r"(?=第.{1,5}章)", text)
        return [c.strip() for c in chapters if c.strip()]

    def _score_hook(self, text):
        """开篇钩子评分。"""
        first_500 = text[:500]
        score = 50
        if any(w in first_500 for w in ["？", "悬念", "神秘", "不知"]): score += 15
        if any(w in first_500 for w in ["危机", "危险", "追杀", "死亡", "瘫痪"]): score += 15
        if any(w in first_500 for w in ["穿越", "重生", "系统", "金手指", "广告"]): score += 10
        if any(w in first_500 for w in ["冲突", "吵架", "打", "骂"]): score += 10
        # 扣分项
        if any(w in first_500 for w in ["很久以前", "话说", "在某个", "据说"]): score -= 15
        if len(first_500) > 300 and not any(w in first_500 for w in ["。", "！", "？"]): score -= 10
        return min(max(score, 0), 100)

    def _score_character(self, text):
        """主角塑造评分。"""
        first_2000 = text[:2000]
        score = 50
        import re
        # 是否有名字
        if re.search(r"[\u4e00-\u9fff]{2,4}(?=.{0,5}(?:是|坐在|站在|躺在|走|跑))", first_2000):
            score += 10
        # 是否有处境描写
        if any(w in first_2000 for w in ["瘫痪", "穷", "弱", "废", "底层", "孤儿", "被追杀"]):
            score += 15
        # 是否有欲望/目标
        if any(w in first_2000 for w in ["想要", "希望", "必须", "一定要", "发誓"]):
            score += 15
        # 是否有性格展示
        if any(w in first_2000 for w in ["脾气", "性格", "习惯", "口头禅"]):
            score += 10
        return min(max(score, 0), 100)

    def _score_conflict(self, text):
        """冲突建立评分。"""
        first_3000 = text[:3000]
        score = 50
        if any(w in first_3000 for w in ["追杀", "战斗", "争吵", "危机", "威胁"]):
            score += 20
        if any(w in first_3000 for w in ["反派", "敌人", "对手", "仇人"]):
            score += 15
        if any(w in first_3000 for w in ["困境", "难题", "选择", "两难"]):
            score += 15
        return min(max(score, 0), 100)

    def _score_worldbuilding(self, text):
        """世界观展示评分（高分=过多，需要扣分）。"""
        first_3000 = text[:3000]
        score = 50
        import re
        exposition = re.findall(r"(?:据说|传说|原本|以前|曾经|在.{2,10}世界|在这个)", first_3000)
        score += len(exposition) * 10  # 越多分越高（表示世界观展示过多）
        return min(max(score, 0), 100)

    def _score_pacing(self, text):
        """节奏控制评分。"""
        score = 50
        import re
        # 检查是否有"空段落"
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        empty_ratio = sum(1 for p in paragraphs if len(p) < 20) / max(len(paragraphs), 1)
        if empty_ratio > 0.3: score -= 15
        # 检查对话密度
        dialogue_count = len(re.findall(r"[\"「]", text))
        if dialogue_count > 0 and dialogue_count / max(len(text), 1) > 0.005:
            score += 10  # 适当对话有助于节奏
        # 检查是否有爽点
        if any(w in text for w in ["震惊", "秒杀", "碾压", "逆袭", "突破"]):
            score += 15
        return min(max(score, 0), 100)


# ==========================================
# 模块6：AI编辑部流水线
# ==========================================
class EditorialPipeline:
    """AI编辑部：扫榜→大纲→枪手→审稿→改稿 五角色协作。"""

    def __init__(self, db):
        self.db = db
        self.auditor = NovelAuditor()
        self.detector = AIDetector()
        self.continuation = ContinuationEngine(db)
        self.opener = OpeningDiagnosis()
        self.imitator = StyleImitator(NOVEL_DECONSTRUCTION_DB)

    def scout(self, genre=None, keyword=None):
        """扫榜小哥：分析市场趋势，推荐题材方向。"""
        report = {
            "trending_genres": [],
            "hot_keywords": [],
            "recommended_authors": [],
            "opening_tips": [],
        }
        # 根据类型匹配推荐作者
        for author in self.db:
            if genre and author.get("category") == genre:
                report["recommended_authors"].append({
                    "name": author["name"],
                    "genre": author.get("genre", ""),
                    "reason": f"在{genre}领域有突出建树",
                })
        # 通用趋势建议
        report["opening_tips"] = [
            "开篇即冲突，不要铺垫超过500字",
            "第一章必须出现金手指/系统/特殊能力的暗示",
            "前三章必须完成'主角处境→危机降临→初步应对'的完整弧线",
            "每章结尾留钩子，让读者想点下一章",
        ]
        return report

    def outline(self, concept, volumes=3):
        """大纲老手：根据创意生成完整大纲。"""
        prompt = f"""你是一位资深网文大纲策划师。请根据以下创意，生成{volumes}卷大纲。

【创意】{concept}

【输出格式】
一、核心设定
- 类型定位
- 核心玩法/金手指
- 世界观框架

二、主要人物
- 主角（性格、背景、动机、弧线）
- 女主/伙伴（2-3人）
- 反派（至少1个有深度的对手）

三、分卷大纲
第1卷：[卷名]
- 核心冲突
- 关键节点（3-5个）
- 卷末高潮

第2卷：...
第3卷：...

四、伏笔清单
- 埋设位置 → 回收位置 → 效果

五、爽点排布表
- 每卷至少3个大爽点，每3-5章一个小爽点

请基于以上框架输出完整大纲："""
        return prompt

    def ghostwriter(self, outline_text, style_ref=None, chapter_num=1, word_count=3000, author_name=None):
        """枪手代笔：根据大纲写正文。"""
        style_info = ""
        if style_ref:
            analysis = self.imitator.analyze_style(style_ref)
            style_info = f"""
【文风要求】
- 平均句长: {analysis['sentence_avg_len']:.0f}字
- 风格标签: {', '.join(analysis['style_tags'])}
- 对话占比: {analysis['dialogue_ratio']:.0%}
"""
        
        # ===== 新增：从语料库获取原文参考 =====
        corpus_ref = ""
        if author_name and HAS_CORPUS:
            corpus_loader = get_corpus_loader()
            # 根据大纲内容推断场景类型
            scene_hints = []
            for tag, keywords in [
                ('battle', ['战斗', '打斗', '对决', '大战', '比武']),
                ('dialogue', ['对话', '谈判', '交涉', '嘴炮']),
                ('environment', ['场景', '环境', '描写', '登场']),
                ('psychology', ['心理', '内心', '独白', '情感']),
                ('opening', ['开篇', '出场', '开局']),
                ('climax', ['高潮', '逆袭', '打脸', '突破']),
            ]:
                if any(k in outline_text for k in keywords):
                    scene_hints.append(tag)
            
            scene_type = scene_hints[0] if scene_hints else None
            few_shot = corpus_loader.get_few_shot_prompt(author_name, scene_type=scene_type, limit=3)
            if few_shot:
                corpus_ref = f"""
【文风参考原文 - {author_name}】
以下是目标作者的代表性原文片段。写作时请模仿其句式节奏、断句习惯、描写与叙事的比例、信息密度。
不要模仿内容，要模仿"味道"。

{few_shot}
"""
        
        prompt = f"""你是一位专业网文写手。请根据以下大纲写第{chapter_num}章，约{word_count}字。

【大纲】
{outline_text}
{style_info}{corpus_ref}
【写作要求】
1. 开篇即抓人，不要铺垫
2. 章末留钩子
3. 避免AI味（不要用'不由得'、'一股暖流涌上心头'、'他知道，自己必须变强'等句式）
4. 对话要有个性，体现角色身份
5. 动作描写要具体，不要泛泛而谈
6. 每1000字至少一个爽点或情绪转折
7. 句式要有变化：长短交替，不要全是中等长度的句子
8. 场景描写要有感官细节（视觉、听觉、触觉、嗅觉）
9. 心理描写要用具体念头，不要用概括性描述

请直接输出正文："""
        return prompt + COPYRIGHT_NOTICE

    def editor(self, text, outline=None):
        """毒舌编辑：35维审计 + AI味检测。"""
        audit_report = self.auditor.audit(text, outline)
        ai_report = self.detector.detect(text)
        return {
            "audit": self.auditor.format_report(audit_report),
            "ai_flavor": self.detector.format_report(ai_report),
            "audit_raw": audit_report,
            "ai_raw": ai_report,
        }

    def rewriter(self, text, issues):
        """改稿编辑：根据审计报告修改文本。"""
        # 将问题按严重程度排序
        critical = [i for i in issues if i.get('level') in ['严重', 'Critical', '🔴']]
        warnings = [i for i in issues if i.get('level') in ['中等', 'Warning', '🟡']]
        
        issue_text = ""
        for i in (critical + warnings)[:10]:
            issue_text += f"- [{i.get('level','')}] {i.get('message','')}: {i.get('suggestion','')}\n"
        
        prompt = f"""你是一位资深改稿编辑。请根据以下审计报告修改文本。

【原文】
{text[:5000]}

【审计发现的问题】
{issue_text}

【修改要求】
1. 只修改有问题的部分，保持原文精华
2. 每处修改标注【修改原因】
3. 避免引入新的AI味句式（不要用'不由得'、'一股暖流涌上心头'、'他知道，自己必须变强'等）
4. 保持原文风格和节奏
5. 重点处理严重和中等问题
6. 修改后的文字句式要有变化，长短交替
7. 心理描写要用具体念头，不要概括

请输出修改后的完整文本："""
        return prompt

    def iterative_write(self, outline_text, style_ref=None, chapter_num=1, 
                        word_count=3000, author_name=None, max_rounds=3):
        """
        迭代写作：写完→审→改→再审→再改，直到通过或达到最大轮次。
        
        返回：
            dict: {
                "final_text": 最终文本,
                "rounds": 轮次记录,
                "passed": 是否通过审计
            }
        """
        rounds = []
        
        # 第一轮：生成初稿
        ghost_prompt = self.ghostwriter(outline_text, style_ref, chapter_num, word_count, author_name)
        rounds.append({
            "round": 1,
            "stage": "初稿生成",
            "prompt": ghost_prompt,
            "status": "waiting_for_ai"
        })
        
        # 后续轮次的 prompt 模板（供外部调用时使用）
        for round_num in range(2, max_rounds + 1):
            rounds.append({
                "round": round_num,
                "stage": "审稿+改稿",
                "audit_prompt_template": "请将上一轮生成的文本传入 editor() 进行审计",
                "rewrite_prompt_template": "请将审计报告传入 rewriter() 进行修改",
                "status": "pending"
            })
        
        return {
            "ghost_prompt": ghost_prompt,
            "audit_method": "self.editor(text, outline_text)",
            "rewrite_method": "self.rewriter(text, issues)",
            "max_rounds": max_rounds,
            "rounds": rounds,
            "usage": """使用方式：
1. 用 ghost_prompt 调用AI生成初稿
2. 用 editor(text, outline) 审计初稿
3. 如果有严重问题，用 rewriter(text, issues) 修改
4. 重复2-3，直到没有严重问题或达到最大轮次
"""
        }

    def run_pipeline(self, concept, style_ref=None, author_name=None, max_rounds=3):
        """运行完整流水线（含迭代机制）。"""
        results = {}
        # 1. 扫榜
        results["scout"] = self.scout()
        # 2. 大纲
        results["outline_prompt"] = self.outline(concept)
        # 3. 迭代写作配置
        results["iterative_config"] = {
            "author_name": author_name,
            "max_rounds": max_rounds,
            "workflow": [
                "① 扫榜完成 → 确定题材方向",
                "② 大纲生成 → 请审阅大纲，确认后进入写作",
                "③ 枪手代笔 → 根据大纲+原文语料逐章写作",
                "④ 毒舌编辑 → 每章完成后自动审计（35维+AI味）",
                "⑤ 改稿编辑 → 根据审计报告修改（最多{max_rounds}轮）",
                "⑥ 终审拍板 → 没有严重问题后你确认发布",
            ],
            "key_change": "每一步都基于原文语料库的few-shot参考，而非模板指令"
        }
        results["next_steps"] = [
            "扫榜完成 → 确定题材方向",
            "大纲生成 → 请审阅大纲，确认后进入写作",
            "枪手代笔 → 根据大纲逐章写作（自动注入原文参考）",
            "毒舌编辑 → 每章完成后自动审计",
            "改稿编辑 → 根据审计报告修改，最多{max_rounds}轮迭代",
            "终审拍板 → 你确认后发布",
        ]
        return results

    def format_scout_report(self, report):
        """格式化扫榜报告。"""
        lines = ["=" * 50, "    扫榜小哥·市场报告", "=" * 50, ""]
        if report["recommended_authors"]:
            lines.append("【推荐参考作者】")
            for author in report["recommended_authors"][:5]:
                lines.append(f"  • {author['name']}（{author['genre']}）- {author['reason']}")
            lines.append("")
        if report["opening_tips"]:
            lines.append("【开篇技巧】")
            for tip in report["opening_tips"]:
                lines.append(f"  • {tip}")
        return "\n".join(lines)



# ==========================================
# 6. 集成所有模块的统一 Skill 门面
# ==========================================
class NovelDeconstructionSkill:
    """集成全部功能的统一入口。"""

    def __init__(self):
        self.parser = DeconstructionParser()
        self.matcher = DeconstructionMatcher(NOVEL_DECONSTRUCTION_DB)
        self.generator = DeconstructionPromptGenerator()
        # 新增模块
        self.auditor = NovelAuditor()
        self.detector = AIDetector()
        self.continuation = ContinuationEngine(NOVEL_DECONSTRUCTION_DB)
        self.opener = OpeningDiagnosis()
        self.imitator = StyleImitator(NOVEL_DECONSTRUCTION_DB)
        self.pipeline = EditorialPipeline(NOVEL_DECONSTRUCTION_DB)

    def execute(self, user_input: str, return_prompt_only: bool = True) -> str:
        intent = self.parser.parse(user_input)
        matched_data = self.matcher.match(intent)
        if not matched_data:
            available = [a["name"] for a in NOVEL_DECONSTRUCTION_DB[:20]]
            hint = "、".join(available) + " 等"
            return f"⚠️ 未匹配到相关作者。\n\n当前数据库包含以下作者：{hint}\n\n请尝试输入作者名、简称或分类关键词。"
        final_prompt = self.generator.generate(intent, matched_data)
        if return_prompt_only:
            return final_prompt
        else:
            return json.dumps({"intent": intent, "matched_authors": [a["name"] for a in matched_data], "final_prompt": final_prompt}, ensure_ascii=False, indent=2)

    def audit(self, text, outline=None):
        """35维审计。"""
        report = self.auditor.audit(text, outline)
        return self.auditor.format_report(report)

    def detect_ai(self, text):
        """AI味检测。"""
        issues = self.detector.detect(text)
        return self.detector.format_report(issues)

    def diagnose_opening(self, text):
        """黄金三章诊断。"""
        report = self.opener.diagnose(text)
        return self.opener.format_report(report)

    def analyze_style(self, text, author_name=None):
        """文风分析。"""
        return self.imitator.analyze_style(text, author_name)

    def imitate_style(self, text, topic, word_count=800):
        """文风仿写。"""
        analysis = self.imitator.analyze_style(text)
        return self.imitator.generate_imitation(analysis, topic, word_count)

    def diagnose_stuck(self, text):
        """卡文诊断。"""
        return self.continuation.diagnose_stuck(text)

    def scout(self, genre=None):
        """扫榜。"""
        report = self.pipeline.scout(genre)
        return self.pipeline.format_scout_report(report)

    def outline(self, concept, volumes=3):
        """生成大纲。"""
        return self.pipeline.outline(concept, volumes)

    def ghostwrite(self, outline_text, style_ref=None, chapter=1, words=3000, author_name=None):
        """枪手代笔。"""
        return self.pipeline.ghostwriter(outline_text, style_ref, chapter, words, author_name=author_name)

    def full_audit(self, text, outline=None):
        """完整审计（35维 + AI味）。"""
        return self.pipeline.editor(text, outline)



if __name__ == "__main__":
    skill = NovelDeconstructionSkill()
    print("="*60 + "\n测试：武侠风格\n" + "="*60)
    print(skill.execute("帮我拆解武侠江湖风格"))
    print("\n" + "="*60 + "\n测试：四大名著\n" + "="*60)
    print(skill.execute("曹雪芹的红楼梦怎么写的？"))
    print("\n" + "="*60 + "\n测试：分类过滤 '武侠'\n" + "="*60)
    print(skill.execute("帮我拆解武侠类作者"))
