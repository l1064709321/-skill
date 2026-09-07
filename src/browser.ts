// 真实浏览器访问层 — Playwright + stealth 反检测
import { getSettings } from "./config.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// 使用 playwright-extra + stealth 插件绕过反爬检测
const { chromium } = await import("playwright-extra");
const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
chromium.use(stealth());

/* ===== 浏览器单例 + 串行队列 ===== */
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let queue: Promise<unknown> = Promise.resolve();

const NAV_TIMEOUT = 30_000;
const OP_TIMEOUT  = 90_000;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return browser;
}

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn, fn);
  queue = task.then(() => {}, () => {});
  return task;
}

async function withPage<T>(fn: (page: any) => Promise<T>, timeoutMs = OP_TIMEOUT): Promise<T> {
  return serial(async () => {
    const b = await getBrowser();
    const ctx = await b.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "Chrome/131.0.0.0 Safari/537.36",
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    try {
      return await Promise.race([
        fn(page),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("browser timeout")), timeoutMs),
        ),
      ]);
    } finally {
      await ctx.close().catch(() => {});
    }
  });
}

/* ===== 对外 API ===== */

/** 真实浏览器 Bing 搜索 */
export async function browserSearch(
  query: string,
  maxResults = 10,
): Promise<{
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  count: number;
  engine: string;
}> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN&setlang=zh-Hans`;
  const items = await withPage(async (page) => {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2000);
    // 先尝试 li.b_algo (bing 全球版)，再尝试 cn.bing.com 结果块
    let results = await page.evaluate((max: number) => {
      const doc: any = (globalThis as any).document;
      const out: Array<{ title: string; url: string; snippet: string }> = [];
      // bing 全球版
      for (const li of doc.querySelectorAll("li.b_algo")) {
        if (out.length >= max) break;
        const a: any = li.querySelector("h2 a");
        const p: any = li.querySelector("p");
        if (a) out.push({ title: (a.textContent||"").trim(), url: a.href, snippet: (p?.textContent||"").trim().slice(0,300) });
      }
      // cn.bing.com 国内版搜索结果 (常见结构)
      if (out.length === 0) {
        for (const item of doc.querySelectorAll(".c-container, .b_algo, .news-card")) {
          if (out.length >= max) break;
          const a: any = item.querySelector("h2 a, .title a");
          const s: any = item.querySelector("p, .content, .abstract");
          if (a && a.href?.startsWith("http")) out.push({ title: (a.textContent||"").trim(), url: a.href, snippet: (s?.textContent||"").trim().slice(0,300) });
        }
      }
      return out;
    }, maxResults);
    // 如果 DOM 解析无结果，从链接列表中筛选搜索结果样式的链接
    if (results.length === 0) {
      results = await page.evaluate((max: number) => {
        const doc: any = (globalThis as any).document;
        const out: Array<{ title: string; url: string; snippet: string }> = [];
        for (const a of Array.from(doc.querySelectorAll("a[href]")) as any[]) {
          if (out.length >= max) break;
          const href = a.href;
          if (!href || !href.startsWith("http") || href.includes("bing.com") || href.includes("microsoft.com")) continue;
          const t = (a.textContent||"").trim();
          if (t.length > 6 && t.length < 200) out.push({ title: t.slice(0,100), url: href, snippet: "" });
        }
        return out;
      }, maxResults);
    }
    return results;
  });
  return { query, results: items, count: items.length, engine: "bing-stealth" };
}

/** 真实浏览器打开 URL，提取渲染后正文 + 链接列表 */
export async function browserFetch(
  url: string,
  maxChars = 12000,
  waitMs = 4000,
): Promise<{
  url: string;
  finalUrl: string;
  title: string;
  content: string;
  chars: number;
  links: Array<{ text: string; href: string }>;
}> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(waitMs);
    const finalUrl = page.url();
    const data = await page.evaluate((max: number) => {
      const doc: any = (globalThis as any).document;
      const title = doc.title || "";
      const text = (doc.body?.innerText || doc.body?.textContent || "").slice(0, max);
      const links: Array<{ text: string; href: string }> = [];
      for (const a of Array.from(doc.querySelectorAll("a[href]")).slice(0, 80) as any[]) {
        const href = a.href;
        if (!href?.startsWith("http")) continue;
        const t = (a.textContent || "").trim();
        if (t.length >= 2 && t.length <= 200) links.push({ text: t.slice(0, 100), href });
        if (links.length >= 20) break;
      }
      return { title, text, links };
    }, maxChars);
    return { url, finalUrl, title: data.title, content: data.text, chars: data.text.length, links: data.links };
  });
}

/** 真实浏览器截图，返回服务器可访问路径 */
export async function browserScreenshot(
  url: string,
  name = "screenshot",
  width = 1280,
  height = 800,
): Promise<{
  url: string;
  finalUrl: string;
  title: string;
  path: string;
  width: number;
  height: number;
}> {
  return withPage(async (page) => {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    const title = await page.title();
    const dir = join(getSettings().dataDir, "screenshots");
    mkdirSync(dir, { recursive: true });
    const filename = `${name}-${Date.now()}.png`;
    await page.screenshot({ path: join(dir, filename), fullPage: false });
    return { url, finalUrl, title, path: `/screenshots/${filename}`, width, height };
  }, OP_TIMEOUT);
}

const shutdown = async () => { try { await browser?.close(); } catch {} process.exit(); };
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
