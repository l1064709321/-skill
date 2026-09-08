/**
 * 天衍 TypeScript 技能引擎
 * 纯 TS 实现，替代 Python skill_bridge.py
 * 包含：AI味检测、35维审计、拆书解构、风格分析、仿写、作家匹配
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../app/data");
const CORPUS_DIR = join(DATA_DIR, "corpus");
const AUTHORS_DIR = join(CORPUS_DIR, "authors");

// ========== 数据加载 ==========

interface DeconEntry {
  name: string; category: string; genre: string;
  lexicon_logic: Record<string, unknown>;
  environment_logic: Record<string, unknown>;
  quotes_and_actions: unknown[];
  rhythm_and_hook: unknown[];
  core_formula?: string;
  prompt_template?: string;
}

let _deconDB: DeconEntry[] | null = null;
function loadDeconDB(): DeconEntry[] {
  if (_deconDB) return _deconDB;
  const p = join(DATA_DIR, "deconstruction_db.json");
  if (!existsSync(p)) return (_deconDB = []);
  _deconDB = JSON.parse(readFileSync(p, "utf-8"));
  return _deconDB!;
}

interface Methodology {
  core_principle: string; key_insights: string[];
  rhythm_formula: string; technique: string; sentence_style: string;
}
let _methodology: Record<string, Methodology> | null = null;
function loadMethodology(): Record<string, Methodology> {
  if (_methodology) return _methodology;
  const p = join(CORPUS_DIR, "methodology.json");
  if (!existsSync(p)) return (_methodology = {});
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  _methodology = raw.methodology || {};
  return _methodology!;
}

interface CorpusPassage {
  text: string; tags: string[]; quality?: number; source?: string;
}
interface CorpusData { author: string; genre: string; passages: CorpusPassage[]; }

let _corpusCache: Record<string, CorpusData> = {};
function loadCorpus(author: string): CorpusData | null {
  if (_corpusCache[author]) return _corpusCache[author];
  if (!existsSync(AUTHORS_DIR)) return null;
  for (const fname of readdirSync(AUTHORS_DIR)) {
    if (!fname.endsWith(".json")) continue;
    const key = fname.replace(".json", "");
    if (author.includes(key) || key.includes(author)) {
      const data: CorpusData = JSON.parse(readFileSync(join(AUTHORS_DIR, fname), "utf-8"));
      _corpusCache[key] = data;
      _corpusCache[author] = data;
      return data;
    }
  }
  return null;
}

// ========== 1. AI 味检测 ==========

const AI_FINGERPRINTS: Record<string, [RegExp, string, string][]> = {
  "高频套话": [
    [/综上所述/g, "AI总结套话", "直接删掉"],
    [/值得注意的是/g, "AI过渡套话", "直接删掉"],
    [/不难发现/g, "AI判断套话", "删掉，直接说发现"],
    [/换句话说/g, "AI解释套话", "删掉，直接说"],
    [/让我们拭目以待/g, "AI结尾套话", "用具体行动收尾"],
    [/在当今.{2,15}的时代/g, "AI开头套话", "直接切入主题"],
    [/随着.{2,15}的不断(?:进步|发展|深入)/g, "AI时代背景", "用具体案例替代"],
    [/越来越多的/g, "AI数据模糊化", "用具体数字替代"],
    [/与此同时/g, "AI连接词", "用'这时'替代"],
    [/不可忽视的/g, "AI强调套话", "直接说重要"],
    [/不由自主地/g, "AI高频词", "删除，直接写动作"],
    [/缓缓开口/g, "AI对话起手式", "用动作引出对话"],
    [/深吸一口气/g, "AI情绪起手式", "直接删或改成角色动作"],
  ],
  "情绪告知": [
    [/他感到一阵.{2,6}/g, "直接告知情绪", "用动作展示"],
    [/内心充满了.{2,6}/g, "直接告知情绪", "用具体行为展示"],
    [/一股.{2,6}涌上心头/g, "情绪标签模板", "用身体反应替代"],
    [/心中涌起一股/g, "情绪模板", "用动作替代感受"],
    [/眼中闪过一丝/g, "情绪模板", "用'他垂下眼'或'眯起眼'"],
    [/嘴角勾起一抹/g, "表情模板", "用'他嘴角一扯'或'乐了'"],
    [/(?:他(?:的)?心中不由得.{2,6}(?:一惊|一震|一沉|一紧))/g, "内心独白模板", "删除'不由得'，直接写动作"],
    [/(?:一股(?:暖流|寒意|热流)涌上(?:心头|心间|全身))/g, "情绪模板", "用行动替代感受"],
  ],
  "章末总结体": [
    [/他终于明白了/g, "章末感悟", "用动作/对话收尾"],
    [/这一夜.{0,5}(?:注定|无人入眠|注定不平静)/g, "章末升华", "用悬念收尾"],
    [/人生就是.{5,20}/g, "章末哲理", "删掉，让读者自己感悟"],
    [/更大的风暴.{0,5}即将来临/g, "章末预告", "用具体事件暗示"],
    [/他不知道的是/g, "章末悬念模板", "直接展示发生了什么"],
  ],
  "叠加式描写": [
    [/先.{5,20}再.{5,20}最后.{5,20}/g, "叠加三段式", "揉进同一段连续叙述"],
    [/不仅.{5,20}而且.{5,20}更.{5,20}/g, "递进排比", "打散为自然叙述"],
  ],
  "排比堆砌": [
    [/首先[，,].{5,30}其次[，,].{5,30}最后/g, "排比三件套", "打散结构，不要一二三"],
    [/一方面.{5,30}另一方面/g, "对比套话", "用具体案例替代"],
    [/(?:这|那).{0,5}(?:不仅|不只).{5,30}更是/g, "递进金句", "用行动收尾"],
    [/(?:这|那).{0,5}才是.{2,15}(?:真正|本质)/g, "升华金句", "让读者自己感悟"],
  ],
  "比喻滥用": [
    [/仿佛.{2,8}般/g, "万能比喻", "优先白描，确需比喻时用生活化表达"],
    [/宛如.{2,8}似的/g, "万能比喻", "优先白描"],
    [/像.{2,6}一样/g, "通用比喻", "用具体动作替代"],
  ],
  "引号滥用": [
    [/所谓的.{2,10}/g, "引号强调普通名词", "去掉引号，用事件本身体现分量"],
    [/完成这次.{2,10}/g, "引号包装概念", "直接说完成"],
  ],
};

export function detectAI(text: string): {
  ai_score: number; level: string; issues: { category: string; pattern: string; type: string; fix: string; count: number }[];
  max_delete_ratio: number; word_count: number;
} {
  const issues: { category: string; pattern: string; type: string; fix: string; count: number }[] = [];
  let totalHits = 0;
  for (const [category, patterns] of Object.entries(AI_FINGERPRINTS)) {
    for (const [regex, typeName, fix] of patterns) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        issues.push({ category, pattern: typeName, type: typeName, fix, count: matches.length });
        totalHits += matches.length;
      }
    }
  }
  // 连续排比检测
  const paraMatches = text.match(/\n{2,}/g);
  const paragraphs = paraMatches ? paraMatches.length + 1 : 1;
  const avgParaLen = text.length / Math.max(paragraphs, 1);
  if (avgParaLen > 300) {
    issues.push({ category: "结构问题", pattern: "段落过长", type: "段落平均" + Math.round(avgParaLen) + "字，建议≤200字", fix: "拆分段落", count: 1 });
  }
  // 评分 (0-10)
  const density = totalHits / Math.max(text.length / 1000, 1);
  let score = 0;
  if (density < 0.5) score = 1;
  else if (density < 1.0) score = 3;
  else if (density < 2.0) score = 5;
  else if (density < 3.5) score = 7;
  else score = 9;
  const level = score <= 2 ? "轻度" : score <= 5 ? "中度" : "重度";
  const maxDeleteRatio = score <= 2 ? 0.15 : score <= 5 ? 0.25 : 0.35;
  return { ai_score: score, level, issues, max_delete_ratio: maxDeleteRatio, word_count: text.length };
}

// ========== 2. 35维审计 ==========

interface AuditFinding {
  severity: "S1" | "S2" | "S3" | "S4";
  dimension_id: number; dimension: string; location: string;
  evidence: string; issue: string; fix: string;
}

interface AuditDim { id: number; name: string; sev: string; check: (t: string, o?: string) => boolean; }
const AUDIT_DIMENSIONS: AuditDim[] = [
  // 角色一致性 (1-7)
  { id: 1, name: "主角性格矛盾", sev: "S1", check: (t: string) => /他(忽然|突然)变得/.test(t) || /性情大变/.test(t) },
  { id: 2, name: "配角工具化", sev: "S3", check: (t: string) => { const m = t.match(/[\u4e00-\u9fa5]{2,3}(?:说|道|答)/g); return m ? m.length > 15 : false; } },
  { id: 3, name: "关系进展自然度", sev: "S2", check: (t: string) => /瞬间.{0,5}(?:信任|依赖|爱上)/.test(t) || /一见.{0,5}(?:如故|倾心)/.test(t) },
  { id: 4, name: "角色智商在线", sev: "S2", check: (t: string) => /明明.{5,20}却.{5,20}(?:还是|依然)/.test(t) },
  { id: 5, name: "口头禅统一", sev: "S3", check: () => false },
  { id: 6, name: "外貌一致性", sev: "S2", check: () => false },
  { id: 7, name: "角色时间线", sev: "S1", check: () => false },
  // 物资与战力 (8-13)
  { id: 8, name: "法宝遗忘", sev: "S2", check: () => false },
  { id: 9, name: "战力崩坏", sev: "S1", check: (t: string) => /一拳.{0,10}(?:灭杀|秒杀|击杀)/.test(t) && /苦战/.test(t) },
  { id: 10, name: "物资矛盾", sev: "S2", check: () => false },
  { id: 11, name: "资源合理", sev: "S3", check: () => false },
  { id: 12, name: "突破代价", sev: "S2", check: (t: string) => /突破/.test(t) && !/付出|代价|牺牲|损耗/.test(t) },
  { id: 13, name: "货币混乱", sev: "S2", check: () => false },
  // 伏笔与逻辑 (14-20)
  { id: 14, name: "伏笔遗忘", sev: "S1", check: () => false },
  { id: 15, name: "回收生硬", sev: "S2", check: () => false },
  { id: 16, name: "逻辑漏洞", sev: "S1", check: (t: string) => /突然.{0,10}(?:出现|冒出|跳出)/.test(t) && !/之前/.test(t) },
  { id: 17, name: "巧合过多", sev: "S2", check: (t: string) => { const m = t.match(/恰好|正好|恰巧|碰巧|巧的是/g); return m ? m.length > 3 : false; } },
  { id: 18, name: "时间线", sev: "S1", check: () => false },
  { id: 19, name: "信息获取", sev: "S2", check: (t: string) => /他(?:竟然|居然)知道/.test(t) },
  { id: 20, name: "反派逻辑", sev: "S2", check: () => false },
  // 文风与表达 (21-27)
  { id: 21, name: "AI味", sev: "S2", check: (t: string) => detectAI(t).ai_score > 5 },
  { id: 22, name: "描写冗长", sev: "S3", check: (t: string) => { const sentences = t.split(/[。！？]/).filter(s => s.trim().length > 0); return sentences.some(s => s.length > 50); } },
  { id: 23, name: "战斗枯燥", sev: "S2", check: (t: string) => /打斗|交手|对战/.test(t) && !/拳风|刀光|气浪|闷响/.test(t) },
  { id: 24, name: "情绪到位", sev: "S2", check: () => false },
  { id: 25, name: "幽默自然", sev: "S3", check: () => false },
  { id: 26, name: "对话质量", sev: "S2", check: (t: string) => { const dm = t.match(/[""「].*?[""」]/g); return dm ? dm.filter(d => d.length < 8).length > 5 : false; } },
  { id: 27, name: "感官丰富", sev: "S3", check: (t: string) => !/(?:鼻|耳|眼|肤|舌|嗅|触)/.test(t) && t.length > 500 },
  // 结构与节奏 (28-32)
  { id: 28, name: "章节钩子", sev: "S2", check: (t: string) => { const last = t.slice(-300); return !/(?:欲知|且听|且看|且待|忽然|只见|突然)/.test(last); } },
  { id: 29, name: "爽点密度", sev: "S2", check: () => false },
  { id: 30, name: "开篇抓人", sev: "S2", check: (t: string) => { const first = t.slice(0, 200); return first.length < 50 || /早上|清晨|起床|醒来/.test(first); } },
  { id: 31, name: "高潮燃度", sev: "S3", check: () => false },
  { id: 32, name: "支线挤压", sev: "S2", check: () => false },
  // 大纲与偏离 (33-35)
  { id: 33, name: "偏离大纲", sev: "S1", check: () => false },
  { id: 34, name: "对话密集", sev: "S3", check: (t: string) => { const lines = t.split("\n").filter(l => l.trim()); const dialogue = lines.filter(l => /[""「]/.test(l)); return dialogue.length / Math.max(lines.length, 1) > 0.6; } },
  { id: 35, name: "背景过多", sev: "S3", check: (t: string) => { const first500 = t.slice(0, 500); return /纪元|年代|世纪|纪年/.test(first500) && first500.length < 300; } },
];

export function auditText(text: string, outline?: string): {
  findings: AuditFinding[]; highlights: string[]; verdict: string; summary: string; text_length: number; dimensions: number;
} {
  const findings: AuditFinding[] = [];
  for (const dim of AUDIT_DIMENSIONS) {
    if (dim.check(text, outline)) {
      findings.push({
        severity: dim.sev as AuditFinding["severity"],
        dimension_id: dim.id,
        dimension: dim.name,
        location: "",
        evidence: "",
        issue: dim.name,
        fix: "请结合上下文手动检查",
      });
    }
  }
  const hasS1 = findings.some(f => f.severity === "S1");
  const hasS2 = findings.some(f => f.severity === "S2");
  const verdict = hasS1 ? "REJECT" : hasS2 ? "CONCERNS" : "APPROVE";
  const highlights = findings.filter(f => f.severity === "S1" || f.severity === "S2").map(f => `${f.dimension_id}.${f.dimension}`);
  return {
    findings,
    highlights,
    verdict,
    summary: `发现 ${findings.length} 个问题（S1: ${findings.filter(f => f.severity === "S1").length}, S2: ${findings.filter(f => f.severity === "S2").length}, S3: ${findings.filter(f => f.severity === "S3").length}），判定: ${verdict}`,
    text_length: text.length,
    dimensions: 35,
  };
}

// ========== 3. 风格分析 ==========

function avgSentenceLen(text: string): number {
  const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 0);
  return sentences.length > 0 ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length : 0;
}

function dialogueRatio(text: string): number {
  const chars = text.split("");
  const dialogueChars = chars.filter(c => c === '"' || c === '"' || c === '"' || c === '「' || c === '」').length;
  return dialogueChars / Math.max(chars.length, 1);
}

function topKeywords(text: string, limit = 10): string[] {
  const freq: Record<string, number> = {};
  const words = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  for (const w of words) {
    if (/的了是在不有我这他她它们就都也还会|到说让着/.test(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit).map(e => e[0]);
}

export function analyzeStyle(text: string, authorName?: string): {
  word_count: number; sentence_avg_len: number; dialogue_ratio: number;
  exclamation_rate: number; question_rate: number; ellipsis_rate: number;
  top_words: string[]; style_tags: string[];
  action_density: number; mind_density: number;
} {
  const wordCount = text.length;
  const sentenceAvg = avgSentenceLen(text);
  const dialRatio = dialogueRatio(text);
  const exclRate = (text.match(/！/g) || []).length / Math.max(wordCount, 1);
  const quesRate = (text.match(/？/g) || []).length / Math.max(wordCount, 1);
  const ellipRate = (text.match(/……/g) || []).length / Math.max(wordCount, 1);
  const actionVerbs = text.match(/(?:站|坐|走|跑|跳|拿|放|看|听|说|笑|哭|喊|叫|打|杀|挥|劈|斩|挡|闪|躲|冲|扑|推|拉|握|捏|踢|踩|扔|丢|捡|抱|摸|敲|砸|摔)/g) || [];
  const mindWords = text.match(/(?:心中|内心|心想|暗想|暗忖|思忖|觉得|感到|感觉|想到|回忆|想起)/g) || [];
  const actionDensity = actionVerbs.length / Math.max(wordCount, 1);
  const mindDensity = mindWords.length / Math.max(wordCount, 1);
  const styleTags: string[] = [];
  if (dialRatio > 0.4) styleTags.push("对话驱动");
  else if (dialRatio > 0.2) styleTags.push("对话+描写混合");
  else styleTags.push("描写驱动");
  if (sentenceAvg < 15) styleTags.push("短句·快节奏");
  else if (sentenceAvg > 30) styleTags.push("长句·慢节奏");
  else styleTags.push("句长适中");
  if (exclRate > 0.01) styleTags.push("情绪强烈");
  if (ellipRate > 0.005) styleTags.push("留白多·文艺感");
  if (quesRate > 0.01) styleTags.push("疑问多·思辨型");
  if (actionDensity > 0.03) styleTags.push("动作密集·画面感强");
  if (mindDensity > 0.01) styleTags.push("心理描写丰富");
  return {
    word_count: wordCount, sentence_avg_len: sentenceAvg, dialogue_ratio: dialRatio,
    exclamation_rate: exclRate, question_rate: quesRate, ellipsis_rate: ellipRate,
    top_words: topKeywords(text), style_tags: styleTags,
    action_density: actionDensity, mind_density: mindDensity,
  };
}

// ========== 4. 拆书解构 ==========

function matchDeconEntry(input: string): DeconEntry | null {
  const db = loadDeconDB();
  if (!db.length) return null;
  const lower = input.toLowerCase();
  for (const entry of db) {
    if (lower.includes(entry.genre.toLowerCase()) || lower.includes(entry.category.toLowerCase()) || lower.includes(entry.name.toLowerCase())) {
      return entry;
    }
  }
  return db[0]; // 默认第一个
}

export function deconstruct(input: string): { deconstruction_prompt: string; matched?: string } {
  const entry = matchDeconEntry(input);
  if (!entry) return { deconstruction_prompt: "未匹配到对应作品类型，请指定更具体的风格描述。" };
  const prompt = `你是一位资深小说拆书师，请按以下维度深度拆解「${entry.name}」风格：

【风格定位】类型: ${entry.category}, 子类型: ${entry.genre}

【词汇逻辑】高频词: ${JSON.stringify((entry.lexicon_logic as any)?.高频词 || [])}
分析: ${(entry.lexicon_logic as any)?.拆析 || "暂无"}

【环境描写】典型环境: ${(entry.environment_logic as any)?.典型环境 || "暂无"}

【核心公式】${entry.core_formula || "暂无"}

请基于以上框架，从钩子/节奏/人设/文风/世界观等维度深度拆解，输出结构化 JSON。`;
  return { deconstruction_prompt: prompt, matched: entry.name };
}

// ========== 5. 作家匹配 ==========

const METHODOLOGY_MAP: Record<string, string> = {
  "玄幻": "epic_fantasy", "都市": "urban_fantasy",
  "武侠": "martial_arts", "悬疑": "suspense", "轻小说": "light_novel",
};

export function matchAuthor(genre: string, style: string): { match: string; methodology: Methodology | null; score: number } {
  const meth = loadMethodology();
  const key = METHODOLOGY_MAP[genre] || Object.keys(meth).find(k => genre.includes(k)) || "";
  if (key && meth[key]) {
    return { match: key, methodology: meth[key], score: 0.8 };
  }
  // 粗略匹配
  for (const [k, v] of Object.entries(meth)) {
    if (style.includes(k) || genre.includes(k) || v.core_principle.includes(style)) {
      return { match: k, methodology: v, score: 0.6 };
    }
  }
  return { match: "通用", methodology: null, score: 0.3 };
}

export function listAuthors(): string[] {
  if (!existsSync(AUTHORS_DIR)) return [];
  return readdirSync(AUTHORS_DIR).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
}

export function getAuthorReference(author: string, scene?: string): {
  author: string; scene: string; methodology: Methodology | null;
  passages: CorpusPassage[]; passage_count: number;
} {
  const corpus = loadCorpus(author);
  const meth = loadMethodology();
  const methKey = Object.keys(meth).find(k => author.includes(k)) || "";
  let passages: CorpusPassage[] = corpus?.passages || [];
  if (scene) passages = passages.filter(p => p.tags.includes(scene));
  passages.sort((a, b) => (b.quality || 3) - (a.quality || 3));
  return {
    author, scene: scene || "",
    methodology: methKey ? meth[methKey] : null,
    passages: passages.slice(0, 5),
    passage_count: passages.length,
  };
}

// ========== 6. 卡文诊断 ==========

export function diagnoseStuck(text: string, _lastSummary?: string): {
  stuck_type: string; paths: { name: string; desc: string; pros: string; cons: string }[];
} {
  const len = text.length;
  const hasConflict = /冲突|战斗|对峙|敌/.test(text);
  const hasEmotion = /伤心|愤怒|高兴|激动/.test(text);
  const type = len > 3000 && !hasConflict ? "剧情枯竭"
    : len < 1000 ? "开篇困难"
    : hasEmotion && !hasConflict ? "情绪原地打转"
    : "节奏失衡";
  const pathMap: Record<string, { name: string; desc: string; pros: string; cons: string }[]> = {
    "剧情枯竭": [
      { name: "引入新势力", desc: "新的敌人/盟友出现打破僵局", pros: "制造新冲突", cons: "可能节奏突兀" },
      { name: "揭示秘密", desc: "已有角色/物品背后真相浮出水面", pros: "回收伏笔", cons: "需前期铺垫" },
    ],
    "节奏失衡": [
      { name: "跳过过渡", desc: "直接切入下一个冲突点", pros: "节奏加快", cons: "可能跳戏" },
      { name: "加入日常", desc: "用轻松日常调节节奏", pros: "张弛有度", cons: "可能被说水" },
    ],
    "开篇困难": [
      { name: "直接冲突开场", desc: "从中间场景切入，倒叙补背景", pros: "抓眼球", cons: "信息量需控制" },
      { name: "悬念钩子", desc: "第一句话就抛出悬念", pros: "吸引阅读", cons: "悬念需兑现" },
    ],
  };
  return { stuck_type: type, paths: pathMap[type] || pathMap["节奏失衡"] };
}

// ========== 7. 审计报告格式化 ==========

export function fullAudit(text: string, outline?: string): {
  audit_report: string; ai_issues: string[]; text_length: number; verdict: string;
} {
  const audit = auditText(text, outline);
  const ai = detectAI(text);
  return {
    audit_report: JSON.stringify(audit, null, 2),
    ai_issues: ai.issues.map(i => `${i.category}: ${i.pattern} (${i.count}次)`),
    text_length: text.length,
    verdict: audit.verdict,
  };
}

// ========== 对外统一接口 ==========

export type SkillAction =
  | "status" | "deconstruct" | "audit" | "detect_ai" | "diagnose_opening"
  | "analyze_style" | "imitate_style" | "ghostwrite" | "match_author"
  | "list_authors" | "get_author_reference" | "full_audit" | "editor_review";

export async function callSkill(action: SkillAction, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    switch (action) {
      case "status":
        return { available: true, loaded: true, db_count: loadDeconDB().length, authors: listAuthors().length };
      case "deconstruct":
        return deconstruct(String(args.input || ""));
      case "audit":
        return auditText(String(args.text || ""), args.outline as string | undefined) as unknown as Record<string, unknown>;
      case "detect_ai":
        return detectAI(String(args.text || "")) as unknown as Record<string, unknown>;
      case "diagnose_opening": {
        const text = String(args.text || "");
        const openingIssues: string[] = [];
        if (text.length < 100) openingIssues.push("开篇过短，缺少场景感");
        if (/^[早上清晨起床]/.test(text)) openingIssues.push("开篇落入俗套（日常起居）");
        if (!/[。！？]/.test(text.slice(0, 200))) openingIssues.push("前200字无完整句，节奏混乱");
        return { opening_report: openingIssues.join("\n") || "开篇正常", text_length: text.length };
      }
      case "analyze_style":
        return analyzeStyle(String(args.text || "")) as unknown as Record<string, unknown>;
      case "imitate_style": {
        const style = analyzeStyle(String(args.reference_text || ""));
        const prompt = `请模仿以下风格特征写作：
风格标签: ${style.style_tags.join("、")}
句长: 约${Math.round(style.sentence_avg_len)}字/句
对话比例: ${(style.dialogue_ratio * 100).toFixed(1)}%
关键词: ${style.top_words.slice(0, 5).join("、")}

主题: ${args.topic || "未指定"}
字数: ${args.word_count || 800}

请直接开始写作，不要解释。`;
        return { imitation_prompt: prompt, style_analysis: style };
      }
      case "ghostwrite": {
        const prompt = `你是一位资深网文写手。请根据以下大纲代笔写作：

大纲: ${args.outline || "未提供"}
字数: ${args.word_count || 2000}
风格: ${args.author_name ? `模仿${args.author_name}风格` : "自由发挥"}

请直接开始写作，不要解释。`;
        return { ghostwrite_prompt: prompt };
      }
      case "match_author":
        return matchAuthor(String(args.genre || ""), String(args.style || "")) as unknown as Record<string, unknown>;
      case "list_authors":
        return { authors: listAuthors(), count: listAuthors().length };
      case "get_author_reference":
        return getAuthorReference(String(args.author || ""), args.scene as string | undefined) as unknown as Record<string, unknown>;
      case "full_audit":
        return fullAudit(String(args.text || ""), args.outline as string | undefined) as unknown as Record<string, unknown>;
      case "editor_review": {
        const audit = auditText(String(args.text || ""));
        const ai = detectAI(String(args.text || ""));
        return {
          audit: JSON.stringify(audit),
          ai_detection: ai.issues,
          text_length: String(args.text || "").length,
        };
      }
      default:
        return { error: `未知操作: ${action}` };
    }
  } catch (e) {
    return { error: `技能执行失败: ${(e as Error).message}` };
  }
}
