/**
 * 天衍 工作流状态机 — Phase Gate + State Machine 双重约束
 * 
 * 8个阶段，线性推进，审查不通过可打回重写。
 * 代码层面强制：跳步直接报错。
 */

export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface PhaseInfo {
  phase: Phase;
  name: string;
  description: string;
  requiredPreconditions: string[];
  allowedNext: Phase[];
  agent: string;
}

// ===== 8个阶段定义 =====
export const PHASES: Record<Phase, PhaseInfo> = {
  1: {
    phase: 1,
    name: "扫榜调研",
    description: "扫描市场热门榜单，分析题材趋势",
    requiredPreconditions: ["项目已创建"],
    allowedNext: [2],
    agent: "story-architect",
  },
  2: {
    phase: 2,
    name: "拆书解构",
    description: "拆解对标畅销书的钩子/节奏/人设/文风",
    requiredPreconditions: ["阶段1完成"],
    allowedNext: [3],
    agent: "story-architect",
  },
  3: {
    phase: 3,
    name: "定文风定位",
    description: "确定文风/题材/核心梗/情绪曲线",
    requiredPreconditions: ["阶段2完成"],
    allowedNext: [4],
    agent: "story-architect",
  },
  4: {
    phase: 4,
    name: "大纲搭建",
    description: "全书体量→卷纲→细纲→伏笔/时间线",
    requiredPreconditions: ["阶段3完成", "有角色档案", "有世界观"],
    allowedNext: [5],
    agent: "story-architect",
  },
  5: {
    phase: 5,
    name: "正文写作",
    description: "细纲→加载上下文→揉进→字数验证",
    requiredPreconditions: ["阶段4完成", "有大纲"],
    allowedNext: [6],
    agent: "narrative-writer",
  },
  6: {
    phase: 6,
    name: "毒舌编辑",
    description: "总编毒舌标准逐章审稿",
    requiredPreconditions: ["阶段5完成", "有正文"],
    allowedNext: [7],
    agent: "orchestrator",
  },
  7: {
    phase: 7,
    name: "审核质检",
    description: "一致性+伏笔+去AI味+格式合规",
    requiredPreconditions: ["阶段6完成"],
    allowedNext: [5, 8],  // 5=打回重写, 8=通过定稿
    agent: "consistency-checker",
  },
  8: {
    phase: 8,
    name: "定稿入库",
    description: "审核通过→标记定稿→推进下一章",
    requiredPreconditions: ["阶段7通过"],
    allowedNext: [1],  // 下一本书或下一章
    agent: "orchestrator",
  },
};

// ===== 状态机：检查转换是否合法 =====
export function canTransition(from: Phase, to: Phase): boolean {
  const phase = PHASES[from];
  if (!phase) return false;
  return phase.allowedNext.includes(to);
}

// ===== Phase Gate：检查前置条件 =====
export interface PreconditionResult {
  passed: boolean;
  failed: string[];
}

export function checkPreconditions(
  targetPhase: Phase,
  projectState: {
    currentPhase: Phase;
    hasCharacters: boolean;
    hasWorld: boolean;
    hasOutline: boolean;
    hasContent: boolean;
    hasChapters: boolean;
  }
): PreconditionResult {
  const phase = PHASES[targetPhase];
  const failed: string[] = [];

  for (const pre of phase.requiredPreconditions) {
    switch (pre) {
      case "项目已创建":
        break; // 总是通过
      case "阶段1完成":
        if (projectState.currentPhase < 1) failed.push("阶段1未完成");
        break;
      case "阶段2完成":
        if (projectState.currentPhase < 2) failed.push("阶段2未完成");
        break;
      case "阶段3完成":
        if (projectState.currentPhase < 3) failed.push("阶段3未完成");
        break;
      case "阶段4完成":
        if (projectState.currentPhase < 4) failed.push("阶段4未完成");
        break;
      case "阶段5完成":
        if (projectState.currentPhase < 5) failed.push("阶段5未完成");
        break;
      case "阶段6完成":
        if (projectState.currentPhase < 6) failed.push("阶段6未完成");
        break;
      case "阶段7完成":
        if (projectState.currentPhase < 7) failed.push("阶段7未完成");
        break;
      case "阶段7通过":
        if (projectState.currentPhase < 7) failed.push("阶段7未通过");
        break;
      case "有角色档案":
        if (!projectState.hasCharacters) failed.push("缺少角色档案");
        break;
      case "有世界观":
        if (!projectState.hasWorld) failed.push("缺少世界观设定");
        break;
      case "有大纲":
        if (!projectState.hasOutline) failed.push("缺少大纲");
        break;
      case "有正文":
        if (!projectState.hasContent) failed.push("缺少正文内容");
        break;
    }
  }

  return { passed: failed.length === 0, failed };
}

// ===== 强制推进阶段 =====
export function advancePhase(
  currentPhase: Phase,
  targetPhase: Phase,
  projectState: Parameters<typeof checkPreconditions>[1]
): { success: boolean; error?: string; newPhase?: Phase } {
  // 检查转换合法性
  if (!canTransition(currentPhase, targetPhase)) {
    return {
      success: false,
      error: `不允许从阶段${currentPhase}(${PHASES[currentPhase].name})跳到阶段${targetPhase}(${PHASES[targetPhase].name})。允许的下一步: ${PHASES[currentPhase].allowedNext.map(p => `${p}(${PHASES[p as Phase].name})`).join(", ")}`,
    };
  }

  // 检查前置条件
  const check = checkPreconditions(targetPhase, projectState);
  if (!check.passed) {
    return {
      success: false,
      error: `阶段${targetPhase}(${PHASES[targetPhase].name})前置条件不满足: ${check.failed.join("; ")}`,
    };
  }

  return { success: true, newPhase: targetPhase };
}

// ===== 获取当前阶段信息 =====
export function getPhaseInfo(phase: Phase): PhaseInfo {
  return PHASES[phase];
}

// ===== 工具到阶段的映射 =====
export const TOOL_PHASE_MAP: Record<string, Phase> = {
  "scan_bestseller": 1,
  "analyze_novel": 2,
  "deconstruct": 2,
  "generate_outline": 4,
  "manage_outline": 4,
  "continue_writing": 5,
  "ghostwrite": 5,
  "polish": 5,
  "review_chapter": 6,
  "quality_check": 7,
  "audit_novel": 7,
  "detect_ai": 7,
  "full_audit": 7,
};

// ===== 检查工具是否在当前阶段允许执行 =====
export function isToolAllowedInPhase(
  toolName: string,
  currentPhase: Phase,
  reviewResult?: string
): { allowed: boolean; reason?: string } {
  // 查询类工具始终允许
  const alwaysAllowed = ["query_project", "delegate_to_agent", "list_files", "read_file"];
  if (alwaysAllowed.includes(toolName)) {
    return { allowed: true };
  }

  const requiredPhase = TOOL_PHASE_MAP[toolName];
  if (requiredPhase === undefined) {
    return { allowed: true }; // 未映射的工具允许执行
  }

  // 审查不通过时，允许主笔工具（打回重写）
  if (currentPhase === 7 && reviewResult === "rejected") {
    const revisionTools = ["continue_writing", "ghostwrite", "polish"];
    if (revisionTools.includes(toolName)) {
      return { allowed: true, reason: "审查打回，允许重写" };
    }
  }

  if (currentPhase < requiredPhase) {
    return {
      allowed: false,
      reason: `工具 ${toolName} 需要阶段${requiredPhase}(${PHASES[requiredPhase as Phase]?.name || ""})，当前阶段${currentPhase}(${PHASES[currentPhase].name})不允许执行`,
    };
  }

  return { allowed: true };
}
