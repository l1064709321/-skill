// 沙箱代码执行器 — 白名单模式 + firejail/pypy3 降级
import { spawn, execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SANDBOX_ENABLED = process.env.SANDBOX_ENABLED !== "false";
const SANDBOX_TIMEOUT = Number(process.env.SANDBOX_TIMEOUT) || 30;

const SAFE_MODULES = new Set([
  "math", "random", "datetime", "json", "re", "string",
  "collections", "itertools", "functools", "operator",
  "textwrap", "decimal", "fractions", "statistics",
  "copy", "pprint", "heapq", "bisect", "array",
]);

const DANGEROUS_MODULES = new Set([
  "os", "subprocess", "shutil", "socket", "http", "urllib",
  "requests", "httpx", "aiohttp", "ctypes", "signal",
  "multiprocessing", "threading", "importlib", "code",
  "codeop", "compileall", "zipimport", "pkgutil",
  "sys", "io", "pathlib", "tempfile", "glob",
  "pickle", "shelve", "sqlite3", "csv", "xml",
  "ast", "dis", "inspect", "pdb", "profile",
]);

const DANGEROUS_CALLS: [RegExp, string][] = [
  [/\beval\s*\(/, "eval"],
  [/\bexec\s*\(/, "exec"],
  [/\bcompile\s*\(/, "compile"],
  [/__import__\s*\(/, "__import__"],
  [/__builtins__/, "__builtins__"],
  [/\bglobals\s*\(\s*\)/, "globals()"],
  [/\blocals\s*\(\s*\)/, "locals()"],
  [/\bvars\s*\(\s*\)/, "vars()"],
  [/\bbreakpoint\s*\(\s*\)/, "breakpoint()"],
];

const IMPORT_RE = /^\s*(?:import|from)\s+(\w+)/gm;

export interface SandboxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  sandbox: string;
}

export function precheckCode(code: string): string | null {
  for (const [pattern, label] of DANGEROUS_CALLS) {
    if (pattern.test(code)) {
      return `代码预检失败: 禁止使用 ${label} (沙箱安全限制)`;
    }
  }
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0; // reset regex state
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const mod = match[1]!;
    if (DANGEROUS_MODULES.has(mod)) {
      return `代码预检失败: 禁止导入模块 '${mod}' (沙箱安全限制)`;
    }
    if (!SAFE_MODULES.has(mod)) {
      return `代码预检失败: 模块 '${mod}' 不在白名单中`;
    }
  }
  return null;
}

function binaryExists(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "ignore", timeout: 2000 });
    return true;
  } catch { return false; }
}

export function executeCode(code: string, timeout?: number): Promise<SandboxResult> {
  if (!SANDBOX_ENABLED) {
    return Promise.resolve({ ok: false, stdout: "", stderr: "沙箱已禁用", durationMs: 0, timedOut: false, sandbox: "disabled" });
  }
  const precheckErr = precheckCode(code);
  if (precheckErr) {
    return Promise.resolve({ ok: false, stdout: "", stderr: precheckErr, durationMs: 0, timedOut: false, sandbox: "precheck" });
  }

  const t = timeout || SANDBOX_TIMEOUT;
  const scriptPath = join(tmpdir(), `sandbox_${Date.now()}.py`);
  writeFileSync(scriptPath, code, "utf-8");

  const hasFirejail = binaryExists("firejail");
  const hasPypy3 = binaryExists("pypy3");
  let cmd: string[];
  let sandboxLevel: string;

  if (hasFirejail && hasPypy3) {
    cmd = ["firejail", "--net=none", "--noroot", "--quiet", "pypy3", scriptPath];
    sandboxLevel = "firejail+pypy3";
  } else if (hasPypy3) {
    cmd = ["pypy3", scriptPath];
    sandboxLevel = "pypy3-only";
  } else {
    cmd = ["python3", scriptPath];
    sandboxLevel = "python-only";
  }

  return new Promise((resolve) => {
    const t0 = Date.now();
    const proc = spawn(cmd[0]!, cmd.slice(1), {
      timeout: t * 1000,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8" },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d; });
    proc.stderr.on("data", (d: Buffer) => { stderr += d; });
    proc.on("close", (code_) => {
      try { unlinkSync(scriptPath); } catch {}
      resolve({ ok: code_ === 0, stdout, stderr, durationMs: Date.now() - t0, timedOut: false, sandbox: sandboxLevel });
    });
    proc.on("error", () => {
      try { unlinkSync(scriptPath); } catch {}
      resolve({ ok: false, stdout: "", stderr: "沙箱执行异常", durationMs: Date.now() - t0, timedOut: false, sandbox: sandboxLevel });
    });
    // 超时保护: 确保进程被杀死时也清理临时文件
    proc.on("spawn", () => {
      const killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        try { unlinkSync(scriptPath); } catch {}
      }, (t + 5) * 1000);
      proc.on("close", () => clearTimeout(killTimer));
    });
  });
}
