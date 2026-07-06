export type UiCanonicalStatus =
  | "TRADE"
  | "WAIT"
  | "OBSERVE"
  | "BLOCKED"
  | "CANDIDATE"
  | "EVIDENCE_SIGNAL"
  | "EVIDENCE_OBSERVE"
  | "TRADE_PLAN_READY"
  | "STALE"
  | "PARTIAL"
  | "FAILED"
  | "SERVED_CACHE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "DEGRADED"
  | "EMPTY"
  | "UNKNOWN"
  | "NOT_CONFIGURED";

export type UiStatusRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type UiStatusDefinition = {
  internalStatus: UiCanonicalStatus;
  displayCn: string;
  descriptionCn: string;
  canTrade: boolean;
  canEnterSniper: boolean;
  userAction: string;
  riskLevel: UiStatusRiskLevel;
  allowedPages: string[];
  forbiddenDisplayNames: string[];
};

const ALL_PAGES = [
  "/dashboard",
  "/signals",
  "/leaderboard",
  "/market",
  "/token/[id]",
  "/review",
  "/system",
];

export const UI_STATUS_DICTIONARY: Record<UiCanonicalStatus, UiStatusDefinition> = {
  TRADE: {
    internalStatus: "TRADE",
    displayCn: "交易计划就绪",
    descriptionCn: "仅表示页面 L1 决策层可展示交易计划就绪；计划就绪区准入仍以 TRADE_PLAN_READY 为唯一事实源。",
    canTrade: true,
    canEnterSniper: false,
    userAction: "进入单币档案复核入场、止损、目标和失效条件。",
    riskLevel: "medium",
    allowedPages: ["/signals", "/token/[id]"],
    forbiddenDisplayNames: ["候选", "观察", "等待"],
  },
  WAIT: {
    internalStatus: "WAIT",
    displayCn: "等待条件",
    descriptionCn: "有观察价值，但触发、回踩、反抽、结构或风控条件未齐。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待后端条件重新确认，不手动追单。",
    riskLevel: "medium",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["交易信号", "狙击目标", "计划就绪"],
  },
  OBSERVE: {
    internalStatus: "OBSERVE",
    displayCn: "仅观察",
    descriptionCn: "只做市场观察或复盘样本，不具备交易计划条件。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "只观察，不执行。",
    riskLevel: "low",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["交易信号", "狙击目标", "计划就绪"],
  },
  BLOCKED: {
    internalStatus: "BLOCKED",
    displayCn: "风控阻断",
    descriptionCn: "被风险、结构、赔率、数据质量或失效条件拦截。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "阅读阻断原因，等待重新进入链路。",
    riskLevel: "high",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["可交易", "狙击目标", "计划就绪"],
  },
  CANDIDATE: {
    internalStatus: "CANDIDATE",
    displayCn: "候选观察",
    descriptionCn: "轻扫、榜单或调度层发现的待验证标的，不是交易计划或执行依据。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待深扫和证据融合。",
    riskLevel: "medium",
    allowedPages: ["/dashboard", "/signals", "/leaderboard", "/market", "/token/[id]"],
    forbiddenDisplayNames: ["交易信号", "狙击目标", "计划就绪"],
  },
  EVIDENCE_SIGNAL: {
    internalStatus: "EVIDENCE_SIGNAL",
    displayCn: "证据观察",
    descriptionCn: "已有部分结构或数据证据，但交易计划尚未通过完整门禁。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "进入单币档案核对缺什么，不执行。",
    riskLevel: "medium",
    allowedPages: ["/dashboard", "/signals", "/token/[id]", "/review"],
    forbiddenDisplayNames: ["交易信号", "买入信号", "卖出信号", "狙击目标", "计划就绪"],
  },
  EVIDENCE_OBSERVE: {
    internalStatus: "EVIDENCE_OBSERVE",
    displayCn: "证据观察",
    descriptionCn: "前端展示语义，与 EVIDENCE_SIGNAL 同义但避免“信号”误读。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "只观察证据链，不执行。",
    riskLevel: "medium",
    allowedPages: ["/dashboard", "/signals", "/token/[id]", "/review"],
    forbiddenDisplayNames: ["交易信号", "狙击目标", "计划就绪"],
  },
  TRADE_PLAN_READY: {
    internalStatus: "TRADE_PLAN_READY",
    displayCn: "交易计划就绪",
    descriptionCn: "后端策略层确认结构、结构盈亏比、风控、入场、止损、目标和失效条件。",
    canTrade: true,
    canEnterSniper: true,
    userAction: "人工复核后再决定是否执行。",
    riskLevel: "medium",
    allowedPages: ["/signals", "/token/[id]"],
    forbiddenDisplayNames: ["候选", "仅观察"],
  },
  STALE: {
    internalStatus: "STALE",
    displayCn: "数据过期",
    descriptionCn: "数据超过新鲜度阈值，只能参考，不能当作实时状态。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待刷新或手动查看数据源健康。",
    riskLevel: "high",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["实时", "最新", "live"],
  },
  PARTIAL: {
    internalStatus: "PARTIAL",
    displayCn: "部分可用",
    descriptionCn: "部分数据源缺失，结论不完整。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "先看缺失项，不把不完整数据当交易依据。",
    riskLevel: "medium",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["完整", "实时", "计划就绪"],
  },
  FAILED: {
    internalStatus: "FAILED",
    displayCn: "数据失败",
    descriptionCn: "数据源或任务失败，不能用旧值冒充真实。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "查看系统中心和数据源状态。",
    riskLevel: "critical",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["实时", "正常", "计划就绪"],
  },
  SERVED_CACHE: {
    internalStatus: "SERVED_CACHE",
    displayCn: "缓存快照",
    descriptionCn: "本次返回的是缓存，不代表刚完成扫描。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待下一轮真实扫描写入。",
    riskLevel: "medium",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["重新扫描", "刚更新", "实时"],
  },
  RATE_LIMITED: {
    internalStatus: "RATE_LIMITED",
    displayCn: "接口限流",
    descriptionCn: "外部数据源触发限速，扫描或深扫需要排队。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待节流恢复。",
    riskLevel: "medium",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["实时", "完整"],
  },
  TIMEOUT: {
    internalStatus: "TIMEOUT",
    displayCn: "请求超时",
    descriptionCn: "外部数据或内部服务超时，当前结果不完整。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待重试或查看系统中心。",
    riskLevel: "high",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["正常", "实时"],
  },
  DEGRADED: {
    internalStatus: "DEGRADED",
    displayCn: "降级运行",
    descriptionCn: "系统可运行，但部分链路不可用或质量不足。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "只做观察，不把降级输出当完整结论。",
    riskLevel: "medium",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["完全正常", "实战可用"],
  },
  EMPTY: {
    internalStatus: "EMPTY",
    displayCn: "暂无数据",
    descriptionCn: "查询成功但没有结果；必须区分无机会和数据缺失。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "查看空状态说明。",
    riskLevel: "low",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["0 等于真实值", "计划就绪"],
  },
  UNKNOWN: {
    internalStatus: "UNKNOWN",
    displayCn: "状态未知",
    descriptionCn: "系统无法确认真实状态，不能做交易解释。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "等待后端明确状态。",
    riskLevel: "high",
    allowedPages: ALL_PAGES,
    forbiddenDisplayNames: ["正常", "实时", "计划就绪"],
  },
  NOT_CONFIGURED: {
    internalStatus: "NOT_CONFIGURED",
    displayCn: "未配置",
    descriptionCn: "对应数据源或能力未配置，不能展示成失败行情。",
    canTrade: false,
    canEnterSniper: false,
    userAction: "补齐配置后再验证。",
    riskLevel: "medium",
    allowedPages: ["/system", "/dashboard"],
    forbiddenDisplayNames: ["行情失败", "无机会", "实时"],
  },
};

export const REQUIRED_UI_STATUS_KEYS: UiCanonicalStatus[] = [
  "TRADE",
  "WAIT",
  "OBSERVE",
  "BLOCKED",
  "CANDIDATE",
  "EVIDENCE_SIGNAL",
  "EVIDENCE_OBSERVE",
  "TRADE_PLAN_READY",
  "STALE",
  "PARTIAL",
  "FAILED",
  "SERVED_CACHE",
  "RATE_LIMITED",
  "TIMEOUT",
  "DEGRADED",
  "EMPTY",
  "UNKNOWN",
  "NOT_CONFIGURED",
];

export function uiStatusDefinition(status: UiCanonicalStatus): UiStatusDefinition {
  return UI_STATUS_DICTIONARY[status];
}

export function uiStatusLabel(status: UiCanonicalStatus): string {
  return uiStatusDefinition(status).displayCn;
}

export function uiStatusCanEnterSniper(status: UiCanonicalStatus): boolean {
  return uiStatusDefinition(status).canEnterSniper;
}

export function uiStatusCanTrade(status: UiCanonicalStatus): boolean {
  return uiStatusDefinition(status).canTrade;
}

export function forbiddenStatusDisplayMatches(status: UiCanonicalStatus, text: string): string[] {
  const normalized = text.toLowerCase();
  return uiStatusDefinition(status).forbiddenDisplayNames.filter((name) =>
    normalized.includes(name.toLowerCase()),
  );
}

export function assertNoForbiddenStatusDisplay(status: UiCanonicalStatus, text: string): void {
  const matches = forbiddenStatusDisplayMatches(status, text);
  if (matches.length > 0) {
    throw new Error(`status_display_forbidden:${status}:${matches.join(",")}`);
  }
}

export function normalizeDataStatusToUiStatus(status: string | null | undefined): UiCanonicalStatus {
  switch (status) {
    case "live":
      return "OBSERVE";
    case "cached":
      return "SERVED_CACHE";
    case "stale":
      return "STALE";
    case "partial":
      return "PARTIAL";
    case "empty":
      return "EMPTY";
    case "failed":
    case "error":
      return "FAILED";
    case "loading":
      return "WAIT";
    default:
      return "UNKNOWN";
  }
}
