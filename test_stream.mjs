import { stream, THINK_PREFIX } from './dist/llm.js';

const messages = [
  { role: "system", content: "你是天衍，一个小说创作助手。直接回复。" },
  { role: "user", content: "你好" },
];

try {
  const gen = stream(messages, undefined, {});
  for await (const chunk of gen) {
    console.log("CHUNK:", chunk.slice(0, 200));
  }
  console.log("STREAM DONE");
} catch (e) {
  console.error("ERROR:", e.message);
}
