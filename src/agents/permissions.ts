/**
 * 天衍 权限系统 v2 — 参考Claude Code 7级权限模式
 * 
 * 7级权限模式：
 * 1. bypassPermissions - 全部允许（仅测试）
 * 2. dontAsk - 全部允许但记录日志
 * 3. auto - LLM分类器判断
 * 4. acceptEdits - 文件编辑自动批准
 * 5. default - 标准交互模式
 * 6. plan - 只读模式
 * 7. bubble - 上报父Agent
 */

export type PermissionMode = 
  | "bypassPermissions"
  | "dontAsk"
  | "auto"
  | "acceptEdits"
  | "default"
  | "plan"
  | "bubble";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  needsConfirmation?: boolean;
}

// 只读工具列表
const READONLY_TOOLS = new Set([
  "read_file", "list_files", "search_files", "web_search", "web_fetch",
  "query_characters", "query_world", "query_chapters", "quality_check",
  "list_authors", "list_elements", "bash",
]);

// 危险工具列表
const DESTRUCTIVE_TOOLS = new Set([
  "delete_file", "bash",
]);

// 写入工具列表
const WRITE_TOOLS = new Set([
  "write_file", "edit_file", "manage_character", "add_element",
  "manage_outline", "manage_world", "continue_writing", "ghostwrite",
  "polish", "delegate_to_agent",
]);

export function checkPermission(
  toolName: string,
  args: Record<string, unknown>,
  mode: PermissionMode,
  agentName: string,
  isReadonlyAgent: boolean,
): PermissionCheck {
  // bypassPermissions: 全部允许
  if (mode === "bypassPermissions") {
    return { allowed: true };
  }

  // dontAsk: 全部允许但记录
  if (mode === "dontAsk") {
    return { allowed: true };
  }

  // plan模式: 只允许只读工具
  if (mode === "plan") {
    if (READONLY_TOOLS.has(toolName)) {
      return { allowed: true };
    }
    return { allowed: false, reason: "plan模式下不允许写入操作" };
  }

  // bubble模式: 危险操作上报父Agent
  if (mode === "bubble") {
    if (DESTRUCTIVE_TOOLS.has(toolName)) {
      return { allowed: false, reason: "bubble模式: 危险操作需要父Agent批准", needsConfirmation: true };
    }
    if (WRITE_TOOLS.has(toolName)) {
      return { allowed: false, reason: "bubble模式: 写入操作需要父Agent批准", needsConfirmation: true };
    }
    return { allowed: true };
  }

  // 只读Agent: 只允许只读工具
  if (isReadonlyAgent) {
    if (READONLY_TOOLS.has(toolName)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `只读Agent (${agentName}) 不能调用写入工具 ${toolName}` };
  }

  // acceptEdits: 文件编辑自动批准，其他需要确认
  if (mode === "acceptEdits") {
    if (toolName === "write_file" || toolName === "edit_file") {
      return { allowed: true };
    }
    if (DESTRUCTIVE_TOOLS.has(toolName)) {
      return { allowed: false, reason: "需要用户确认", needsConfirmation: true };
    }
    return { allowed: true };
  }

  // default模式: 危险操作需要确认
  if (mode === "default") {
    if (DESTRUCTIVE_TOOLS.has(toolName)) {
      return { allowed: false, reason: "需要用户确认", needsConfirmation: true };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

// 获取Agent的默认权限模式
export function getDefaultPermissionMode(agentName: string): PermissionMode {
  const readonlyAgents = new Set(["consistency-checker", "story-explorer", "presenter"]);
  if (readonlyAgents.has(agentName)) {
    return "plan";  // 只读Agent用plan模式
  }
  return "default";
}
