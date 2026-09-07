// Thinking内容过滤器 — 过滤模型reasoning_content中泄漏的system prompt内容

const PROMPT_KEYWORDS: string[] = [
  "reference material formatting",
  "file format",
  "bold formatting",
  "markdown heading",
  "main sections are formatted",
  "code blocks",
  "images and tables",
  "code formatting",
  "role: developer",
  "role: system",
  "assistant should",
  "do not use triple backtick",
  "do not include inline",
  "with heading level",
  "before the next heading",
  "wrap in backtick",
  "every file path",
  "all main sections",
];

function hasPromptSignature(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMPT_KEYWORDS.some((kw) => lower.includes(kw));
}

function isEnglishDominant(text: string): boolean {
  if (!text || text.length < 30) return false;
  let asciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) asciiCount++;
  }
  return asciiCount / text.length > 0.85;
}

export function isPromptLeakage(text: string): boolean {
  if (!text || text.length < 30) return false;
  return isEnglishDominant(text) && hasPromptSignature(text);
}
