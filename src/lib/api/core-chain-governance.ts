import type { SignalMaturityStage } from "../analysis/types";
import type { MarketRadarSnapshot } from "../market/types";
import type { BusinessCapabilityReport, BusinessCapabilityStage } from "./business-capability";
import type { SystemHealthReport } from "./system-health";

export type CoreChainGovernanceSchemaVersion = "core-chain-governance.v1";

export type CoreChainStepId =
  | "full_market_discovery"
  | "candidate_filtering"
  | "deep_scan_verification"
  | "structure_analysis"
  | "risk_reward_gate"
  | "trade_plan_readiness"
  | "review_evolution";

export type CoreFeatureClass =
  | "core"
  | "supporting"
  | "downgraded"
  | "merge"
  | "rebuild"
  | "delete";

export type CoreFeatureAction =
  | "delete"
  | "downgrade"
  | "keep"
  | "merge"
  | "rebuild"
  | "strengthen";

export type CoreReadinessStatus =
  | "blocked"
  | "collecting"
  | "partial"
  | "ready"
  | "watch";

export type CoreChainStep = {
  id: CoreChainStepId;
  title: string;
  status: CoreReadinessStatus;
  summary: string;
  requiredEvidence: string[];
  blockers: string[];
  nextAction: string;
  guardrail: string;
};

export type CoreFeatureTriageItem = {
  id: string;
  label: string;
  classification: CoreFeatureClass;
  action: CoreFeatureAction;
  reason: string;
  linkedSteps: CoreChainStepId[];
  guardrail: string;
};

export type CorePageRole = {
  route: string;
  role: "core" | "supporting";
  job: string;
  mustShow: string[];
  mustNotShow: string[];
};

export type CoreApiRole = {
  route: string;
  role: "core" | "supporting" | "operations";
  job: string;
  mustReturn: string[];
  mustNotDo: string[];
};

export type CoreP0CompletionCheck = {
  key: string;
  label: string;
  status: "fail" | "pass";
  detail: string;
};

export type CoreP0Completion = {
  percent: number;
  status: "blocked" | "ready";
  summary: string;
  checks: CoreP0CompletionCheck[];
  remaining: string[];
};

export type CoreP1Completion = CoreP0Completion;

export type CoreChainGovernanceReport = {
  schemaVersion: CoreChainGovernanceSchemaVersion;
  generatedAt: string;
  allowedUse: "product_governance_only";
  canAutoExecute: false;
  canCreateTradeSignal: false;
  canMutateLiveRanking: false;
  coreObjective: string;
  chain: CoreChainStep[];
  featureTriage: CoreFeatureTriageItem[];
  pageRoles: CorePageRole[];
  apiRoles: CoreApiRole[];
  p0Completion: CoreP0Completion;
  p1Completion: CoreP1Completion;
  readiness: {
    blockedSteps: number;
    coreReadySteps: number;
    totalSteps: number;
    status: CoreReadinessStatus;
  };
  cleanupRules: string[];
  operatingSequence: string[];
};

function stage(
  report: BusinessCapabilityReport,
  id: BusinessCapabilityStage["id"],
) {
  return report.stages.find((item) => item.id === id);
}

function statusFromStage(item: BusinessCapabilityStage | undefined): CoreReadinessStatus {
  if (!item) return "collecting";
  if (item.status === "blocked") return "blocked";
  if (item.status === "disabled") return "blocked";
  if (item.status === "ready") return "ready";
  if (item.status === "watch") return "watch";
  if (item.status === "partial") return "partial";
  return "collecting";
}

function maturityCounts(snapshot: MarketRadarSnapshot): Record<SignalMaturityStage, number> {
  return snapshot.metadata.signalMaturity?.counts ?? {
    DEEP_SCAN_CANDIDATE: 0,
    EVIDENCE_SIGNAL: snapshot.signals.filter((signal) => signal.maturity?.stage === "EVIDENCE_SIGNAL").length,
    LIGHT_SCAN_MARK: snapshot.metadata.lightScan?.candidateCount ?? 0,
    REVIEW_ONLY: snapshot.signals.filter((signal) => signal.maturity?.stage === "REVIEW_ONLY").length,
    TRADE_PLAN_READY: snapshot.signals.filter((signal) => signal.maturity?.stage === "TRADE_PLAN_READY").length,
  };
}

function combineStatus(statuses: CoreReadinessStatus[]): CoreReadinessStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("collecting")) return "collecting";
  if (statuses.includes("partial")) return "partial";
  if (statuses.includes("watch")) return "watch";
  return "ready";
}

function stepFromStage({
  guardrail,
  id,
  requiredEvidence,
  stage,
  title,
}: {
  guardrail: string;
  id: CoreChainStepId;
  requiredEvidence: string[];
  stage: BusinessCapabilityStage | undefined;
  title: string;
}): CoreChainStep {
  const status = statusFromStage(stage);

  return {
    id,
    title,
    status,
    summary: stage?.summary ?? "等待后端能力报告。",
    requiredEvidence,
    blockers: status === "ready" ? [] : [stage?.nextAction ?? "能力报告缺失，先补合同。"],
    nextAction: stage?.nextAction ?? "补齐该环节的真实数据合同和验收指标。",
    guardrail,
  };
}

function buildChain({
  businessCapability,
  health,
  snapshot,
}: {
  businessCapability: BusinessCapabilityReport;
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): CoreChainStep[] {
  const counts = maturityCounts(snapshot);
  const tradePlanStatus: CoreReadinessStatus = counts.TRADE_PLAN_READY > 0
    ? "ready"
    : counts.EVIDENCE_SIGNAL > 0
      ? "partial"
      : "collecting";
  const reviewStatistics = health.reviewStatistics ?? {
    sampleStatus: "collecting",
    samples: {
      closed: 0,
      evidenceLevel: 0,
      pending: 0,
      total: 0,
      tradePlanReady: 0,
      withMetrics: 0,
    },
  };
  const reviewStatus = combineStatus([
    statusFromStage(stage(businessCapability, "signal_lifecycle")),
    statusFromStage(stage(businessCapability, "outcome_standard")),
    statusFromStage(stage(businessCapability, "evolution_suggestions")),
  ]);

  return [
    stepFromStage({
      id: "full_market_discovery",
      title: "全市场发现",
      stage: stage(businessCapability, "full_market_discovery"),
      requiredEvidence: ["Binance/OKX/Bybit 全市场 USDT 永续 universe", "WebSocket 或 public ticker 轻扫覆盖", "scanProof 覆盖数"],
      guardrail: "全市场发现只负责找异常和入池，不能直接给交易方向。",
    }),
    {
      id: "candidate_filtering",
      title: "候选筛选",
      status: combineStatus([
        statusFromStage(stage(businessCapability, "candidate_rotation")),
        statusFromStage(stage(businessCapability, "signal_maturity")),
      ]),
      summary: `轻扫 ${counts.LIGHT_SCAN_MARK}，深扫候选 ${counts.DEEP_SCAN_CANDIDATE}，证据信号 ${counts.EVIDENCE_SIGNAL}，计划就绪 ${counts.TRADE_PLAN_READY}。`,
      requiredEvidence: ["信号成熟度", "候选池轮换状态", "为什么进入/为什么排队"],
      blockers: counts.DEEP_SCAN_CANDIDATE + counts.EVIDENCE_SIGNAL + counts.TRADE_PLAN_READY > 0
        ? []
        : ["当前没有可展示候选，必须显示真实空态，不允许 mock 补位。"],
      nextAction: "继续保证候选、证据信号和计划就绪分层展示，不让候选冒充狙击目标。",
      guardrail: "LIGHT_SCAN_MARK 和 DEEP_SCAN_CANDIDATE 不能进入狙击榜。",
    },
    stepFromStage({
      id: "deep_scan_verification",
      title: "深扫验证",
      stage: stage(businessCapability, "deep_scan_verification"),
      requiredEvidence: ["CoinGlass OI/Funding/Long-Short", "公开交易所衍生品交叉验证", "请求失败和 partial 原因"],
      guardrail: "CoinGlass 付费数据用于资金质量确认；公开交易所 fallback 必须明确标注，不能冒充 CoinGlass。",
    }),
    stepFromStage({
      id: "structure_analysis",
      title: "结构分析",
      stage: stage(businessCapability, "analysis_reasoning"),
      requiredEvidence: ["多周期结构", "关键位", "突破/假突破", "回踩/反抽", "趋势完整度"],
      guardrail: "结构分析必须先于交易计划；低周期不能推翻高周期。",
    }),
    stepFromStage({
      id: "risk_reward_gate",
      title: "风险赔率",
      stage: stage(businessCapability, "risk_reward_gate"),
      requiredEvidence: ["结构止损", "目标位", "RR >= 3:1", "Risk Gate 阻断原因"],
      guardrail: "3:1 是最低结构赔率下限，不是固定目标；低于 3:1 禁止计划就绪。",
    }),
    {
      id: "trade_plan_readiness",
      title: "交易计划",
      status: tradePlanStatus,
      summary: `计划就绪 ${counts.TRADE_PLAN_READY}，证据信号 ${counts.EVIDENCE_SIGNAL}。`,
      requiredEvidence: ["入场触发", "止损", "目标", "分批止盈", "失效条件", "复盘追踪"],
      blockers: counts.TRADE_PLAN_READY > 0
        ? []
        : ["当前没有 TRADE_PLAN_READY，狙击榜必须允许为空。"],
      nextAction: counts.TRADE_PLAN_READY > 0
        ? "把完整计划集中到单币档案，不在列表页二次推导价格。"
        : "继续等待证据、结构、RR 和风控同时满足。",
      guardrail: "只有 TRADE_PLAN_READY 能进狙击榜；前端不能编入场、止损或目标。",
    },
    {
      id: "review_evolution",
      title: "复盘进化",
      status: reviewStatus,
      summary: `复盘样本 ${reviewStatistics.samples.total}，已关闭 ${reviewStatistics.samples.closed}，状态 ${reviewStatistics.sampleStatus}。`,
      requiredEvidence: ["信号发出价", "TP/SL 先后", "MFE/MAE", "超时", "漏判", "策略分型"],
      blockers: reviewStatus === "ready" || reviewStatus === "watch" ? [] : ["真实样本不足，不能宣传稳定胜率或自动调权。"],
      nextAction: "继续积累 outcome 样本和 missed opportunity，只输出人工复核建议。",
      guardrail: "复盘进化不能自动修改实时权重；样本不足只能显示 collecting。",
    },
  ];
}

function buildFeatureTriage(): CoreFeatureTriageItem[] {
  return [
    {
      id: "full_market_scan",
      label: "全市场扫描",
      classification: "core",
      action: "strengthen",
      reason: "这是发现山寨异动的入口，不做强就会退化成固定币巡检。",
      linkedSteps: ["full_market_discovery", "candidate_filtering"],
      guardrail: "覆盖和轮转必须可见，不能只展示少数信号卡。",
    },
    {
      id: "websocket_light_scan",
      label: "秒级轻扫",
      classification: "core",
      action: "strengthen",
      reason: "负责第一时间发现价格、成交和盘口异常。",
      linkedSteps: ["full_market_discovery"],
      guardrail: "轻扫只能入候选，不能直接生成交易结论。",
    },
    {
      id: "candidate_pool",
      label: "候选池",
      classification: "core",
      action: "strengthen",
      reason: "负责承接值得继续验证的币，必须和狙击榜分开。",
      linkedSteps: ["candidate_filtering"],
      guardrail: "候选只能标验证中，不能包装成推荐。",
    },
    {
      id: "coinglass_deep_scan",
      label: "CoinGlass 深扫",
      classification: "core",
      action: "strengthen",
      reason: "负责验证 OI、Funding、多空拥挤和资金质量。",
      linkedSteps: ["deep_scan_verification"],
      guardrail: "深扫失败要明示 partial/failed，不能用公开数据冒充付费深扫。",
    },
    {
      id: "structure_analysis",
      label: "结构分析",
      classification: "core",
      action: "strengthen",
      reason: "负责判断趋势、压缩、突破、假突破、回踩和衰竭。",
      linkedSteps: ["structure_analysis"],
      guardrail: "技术指标只能辅助结构，不能单独出结论。",
    },
    {
      id: "risk_reward",
      label: "风险赔率",
      classification: "core",
      action: "strengthen",
      reason: "负责阻断低赔率和高风险机会。",
      linkedSteps: ["risk_reward_gate"],
      guardrail: "RR 低于 3:1 直接拦截。",
    },
    {
      id: "token_dossier",
      label: "单币档案",
      classification: "core",
      action: "strengthen",
      reason: "这是交易判断主页面，必须讲清楚为什么看、怎么错、怎么复盘。",
      linkedSteps: ["structure_analysis", "risk_reward_gate", "trade_plan_readiness"],
      guardrail: "单币档案只能翻译后端事实，不能前端编计划。",
    },
    {
      id: "review_evolution",
      label: "复盘进化",
      classification: "core",
      action: "strengthen",
      reason: "负责判断系统准不准、漏了什么、哪些规则该降权。",
      linkedSteps: ["review_evolution"],
      guardrail: "复盘建议必须人工确认，不能自动调权。",
    },
    {
      id: "leaderboards",
      label: "涨跌幅/成交额榜单",
      classification: "supporting",
      action: "keep",
      reason: "用于观察市场热度，不等于推荐。",
      linkedSteps: ["full_market_discovery"],
      guardrail: "榜单必须标注口径和来源，不能进入狙击榜。",
    },
    {
      id: "macro_context",
      label: "BTC/ETH/BTC.D/TOTAL2/TOTAL3",
      classification: "supporting",
      action: "keep",
      reason: "用于判断山寨顺风逆风。",
      linkedSteps: ["structure_analysis", "risk_reward_gate"],
      guardrail: "宏观环境不能直接生成方向，也不能降低 RR 门槛。",
    },
    {
      id: "dex_watch",
      label: "DEX 新币观察",
      classification: "downgraded",
      action: "downgrade",
      reason: "有助于早期观察，但不能直接进入合约交易计划。",
      linkedSteps: ["full_market_discovery", "candidate_filtering"],
      guardrail: "DEX 只进观察池，不能进狙击榜。",
    },
    {
      id: "ai_counter_review",
      label: "规则反证",
      classification: "supporting",
      action: "keep",
      reason: "外部 AI 已取消，由代码规则审查高价值候选，找漏洞和反证。",
      linkedSteps: ["structure_analysis", "trade_plan_readiness", "review_evolution"],
      guardrail: "规则反证不能替代主规则引擎，不能扫全市场喊方向。",
    },
    {
      id: "alerts",
      label: "告警",
      classification: "supporting",
      action: "keep",
      reason: "提醒状态变化，不制造交易结论。",
      linkedSteps: ["candidate_filtering", "trade_plan_readiness", "review_evolution"],
      guardrail: "告警只能说状态变化，不能说买卖。",
    },
    {
      id: "rank_pet_eggs",
      label: "段位 / 宠物 / 彩蛋",
      classification: "supporting",
      action: "downgrade",
      reason: "只做纪律反馈、复盘反馈和系统状态提示。",
      linkedSteps: ["review_evolution"],
      guardrail: "UI 趣味元素不能影响市场判断、排序或计划。",
    },
    {
      id: "mock_market_facts",
      label: "mock 数据冒充真实数据",
      classification: "delete",
      action: "delete",
      reason: "会直接污染实战判断。",
      linkedSteps: ["full_market_discovery", "candidate_filtering", "review_evolution"],
      guardrail: "mock 只能留在隔离测试/预览，不能进入 active 页面事实源。",
    },
    {
      id: "evidence_less_recommendations",
      label: "无证据链推荐",
      classification: "rebuild",
      action: "rebuild",
      reason: "没有证据链就无法复盘，也无法判断真假。",
      linkedSteps: ["structure_analysis", "trade_plan_readiness"],
      guardrail: "任何推荐都必须能追溯 EvidenceItem、反证和 Risk Gate。",
    },
    {
      id: "duplicate_decorative_panels",
      label: "重复或只为好看的面板",
      classification: "merge",
      action: "merge",
      reason: "会稀释核心信息密度。",
      linkedSteps: ["full_market_discovery", "candidate_filtering", "review_evolution"],
      guardrail: "重复展示必须合并；不服务核心链路的面板必须删除或降级。",
    },
  ];
}

function buildPageRoles(): CorePageRole[] {
  return [
    {
      route: "/dashboard",
      role: "core",
      job: "系统作战面板，证明系统是否真的在扫描和运行。",
      mustShow: ["覆盖数", "轻扫数", "候选数", "深扫数", "证据信号数", "计划就绪数", "数据源状态"],
      mustNotShow: ["无来源的成功状态", "动画替代运行证明"],
    },
    {
      route: "/signals",
      role: "core",
      job: "候选池和狙击榜分层展示。",
      mustShow: ["成熟度", "为什么入池", "为什么不能交易", "是否计划就绪"],
      mustNotShow: ["候选冒充狙击目标", "无 RR 的交易计划"],
    },
    {
      route: "/token/[id]",
      role: "core",
      job: "单币交易判断档案。",
      mustShow: ["多周期结构", "关键位", "支持证据", "反证", "Risk Gate", "触发/止损/目标/失效", "复盘样本"],
      mustNotShow: ["前端编入场", "无来源关键位", "无复盘边界的结论"],
    },
    {
      route: "/review",
      role: "core",
      job: "复盘进化中心。",
      mustShow: ["命中/失败/超时", "MFE/MAE", "漏判", "策略分型", "样本是否有统计意义"],
      mustNotShow: ["样本不足时宣传胜率", "自动调权暗示"],
    },
    {
      route: "/leaderboard",
      role: "supporting",
      job: "真实市场观察榜单。",
      mustShow: ["榜单口径", "交易所范围", "更新时间", "是否候选/深扫/信号"],
      mustNotShow: ["榜单等于推荐", "候选池排序冒充全市场排名"],
    },
    {
      route: "/market",
      role: "supporting",
      job: "大盘和数据源环境。",
      mustShow: ["BTC/ETH", "BTC.D", "TOTAL2/TOTAL3", "OI/Funding", "partial/unavailable"],
      mustNotShow: ["大盘直接给个币买卖方向", "缺数据时显示 0"],
    },
    {
      route: "/system",
      role: "supporting",
      job: "数据源、worker、数据库和生产健康状态。",
      mustShow: ["CoinGlass", "Binance/OKX/Bybit", "WebSocket", "Redis", "Postgres", "worker heartbeat"],
      mustNotShow: ["硬编码 healthy", "隐藏失败"],
    },
  ];
}

function buildApiRoles(): CoreApiRole[] {
  return [
    {
      route: "/api/frontend/radar-contract",
      role: "core",
      job: "前端雷达总控事实源，汇总扫描证明、成熟度、数据源、核心治理、实时边界和轻扫质量。",
      mustReturn: ["scanProof", "radarSignals", "coreChainGovernance", "realtimeCapability", "lightScanQuality"],
      mustNotDo: ["触发扫描", "调用 CoinGlass", "生成交易计划"],
    },
    {
      route: "/api/frontend/leaderboard",
      role: "supporting",
      job: "真实市场榜单观察入口，提供涨幅、跌幅、成交额等市场观察口径。",
      mustReturn: ["source", "updatedAt", "rows", "sortMetric"],
      mustNotDo: ["用 mock 排名补位", "把榜单行升级成狙击目标", "生成入场/止损/目标"],
    },
    {
      route: "/api/frontend/token-dossier",
      role: "core",
      job: "单币档案事实源，承载结构、关键位、TradingView、证据链、反证和只读交易计划草案。",
      mustReturn: ["symbol", "chart", "evidence", "counter", "levels", "tradePlan"],
      mustNotDo: ["前端编计划", "缺 K 线时生成假蜡烛", "绕过 Risk Gate"],
    },
    {
      route: "/api/frontend/review-contract",
      role: "core",
      job: "复盘进化事实源，提供 outcome、missed opportunity、样本状态和策略分型表现。",
      mustReturn: ["sampleStatus", "lifecycles", "missedDetections", "evolutionSuggestions"],
      mustNotDo: ["样本不足时宣传胜率", "自动修改实时权重", "把轻扫标记计入命中率"],
    },
    {
      route: "/api/radar/backend-contract",
      role: "operations",
      job: "后端能力事实源，用于审计当前系统能力是否服务核心链路。",
      mustReturn: ["sourceAudit", "scanProof", "analysis.coreChainGovernance", "runtime"],
      mustNotDo: ["返回前端编造字段", "隐藏 CoinGlass 失败", "隐藏 partial/unavailable"],
    },
    {
      route: "/api/health",
      role: "operations",
      job: "生产健康事实源，用于确认数据源、数据库、扫描、worker 和复盘统计是否正常。",
      mustReturn: ["dataSource", "persistence", "scan", "runtime", "reviewStatistics"],
      mustNotDo: ["硬编码 healthy", "把缓存冒充实时", "把 mock 当生产 ready"],
    },
  ];
}

function buildP0Completion({
  apiRoles,
  chain,
  cleanupRules,
  featureTriage,
  pageRoles,
}: {
  apiRoles: CoreApiRole[];
  chain: CoreChainStep[];
  cleanupRules: string[];
  featureTriage: CoreFeatureTriageItem[];
  pageRoles: CorePageRole[];
}): CoreP0Completion {
  const requiredPages = ["/dashboard", "/signals", "/token/[id]", "/review", "/leaderboard", "/market", "/system"];
  const requiredApis = [
    "/api/frontend/radar-contract",
    "/api/frontend/leaderboard",
    "/api/frontend/token-dossier",
    "/api/frontend/review-contract",
    "/api/radar/backend-contract",
    "/api/health",
  ];
  const classes = new Set(featureTriage.map((item) => item.classification));
  const checks: CoreP0CompletionCheck[] = [
    {
      key: "core_chain_visible",
      label: "核心链路完整可见",
      status: chain.length === 7 ? "pass" : "fail",
      detail: `当前核心链路环节 ${chain.length}/7。`,
    },
    {
      key: "feature_triage_complete",
      label: "功能分级覆盖完整",
      status: ["core", "supporting", "downgraded", "merge", "rebuild", "delete"].every((item) => classes.has(item as CoreFeatureClass))
        ? "pass"
        : "fail",
      detail: `当前功能分级 ${featureTriage.length} 项，覆盖 ${Array.from(classes).join("/") || "none"}。`,
    },
    {
      key: "page_roles_complete",
      label: "页面职责覆盖完整",
      status: requiredPages.every((route) => pageRoles.some((page) => page.route === route)) ? "pass" : "fail",
      detail: `当前页面职责 ${pageRoles.length}/${requiredPages.length}。`,
    },
    {
      key: "api_roles_complete",
      label: "接口职责覆盖完整",
      status: requiredApis.every((route) => apiRoles.some((api) => api.route === route)) ? "pass" : "fail",
      detail: `当前接口职责 ${apiRoles.length}/${requiredApis.length}。`,
    },
    {
      key: "cleanup_guardrails",
      label: "清理规则有硬边界",
      status: /mock/.test(cleanupRules.join("\n")) && /前端展示能力不能强于后端真实能力/u.test(cleanupRules.join("\n"))
        ? "pass"
        : "fail",
      detail: `当前清理规则 ${cleanupRules.length} 条。`,
    },
    {
      key: "no_trading_authority",
      label: "治理层无交易权限",
      status: "pass",
      detail: "coreChainGovernance 只能做产品治理，不能生成交易信号、不能自动执行、不能改排序。",
    },
  ];
  const passed = checks.filter((check) => check.status === "pass").length;
  const percent = Math.round((passed / checks.length) * 100);
  const remaining = checks.filter((check) => check.status === "fail").map((check) => check.label);

  return {
    checks,
    percent,
    remaining,
    status: remaining.length === 0 ? "ready" : "blocked",
    summary: remaining.length === 0
      ? "P0 核心链路可见化与清理已闭环；后续只做维护，不阻塞 P1。"
      : `P0 尚未闭环：${remaining.join("、")}。`,
  };
}

function sourceNames(snapshot: MarketRadarSnapshot) {
  return new Set(
    (snapshot.metadata.diagnostics?.discovery.sources ?? [])
      .map((source) => source.source.toLowerCase()),
  );
}

function workerStatus(
  health: SystemHealthReport,
  key: string,
) {
  return health.runtimeProbes?.workers?.find((worker) => worker.key === key || worker.name === key)?.status;
}

function sourceAvailable(sources: Set<string>, name: "binance" | "bybit" | "okx") {
  return Array.from(sources).some((source) => source.includes(name));
}

function hasMicrostructureProxy(snapshot: MarketRadarSnapshot) {
  const lightScan = snapshot.metadata.lightScan;
  const candidates = lightScan?.topCandidates ?? [];

  if (candidates.some((candidate) =>
    candidate.microstructure?.proxyQuality === "rolling_price_volume_proxy" ||
    candidate.microstructure?.proxyQuality === "taker_trade_proxy"
  )) {
    return true;
  }

  if (lightScan?.source?.toLowerCase().includes("websocket")) {
    return true;
  }

  return (lightScan?.notes ?? []).some((note) =>
    /cvd proxy|trade flow proxy|websocket/i.test(note)
  );
}

function buildP1Completion({
  health,
  p0Completion,
  snapshot,
}: {
  health: SystemHealthReport;
  p0Completion: CoreP0Completion;
  snapshot: MarketRadarSnapshot;
}): CoreP1Completion {
  const lightScan = snapshot.metadata.lightScan ?? health.lightScan;
  const coverage = snapshot.metadata.coverage ?? health.coverage ?? null;
  const statePool = coverage?.statePool ?? health.scanStatePool ?? null;
  const rotationAudit = coverage?.rotationAudit;
  const sources = sourceNames(snapshot);
  const publicExchangeCount = (["binance", "okx", "bybit"] as const)
    .filter((source) => sourceAvailable(sources, source))
    .length;
  const lightScanReady = lightScan?.status === "ready" || lightScan?.status === "partial";
  const websocketStatus = workerStatus(health, "websocket-light-worker");
  const coinGlassGuarded = health.apiUsage?.status === "ready" &&
    health.apiUsage?.provider === "CoinGlass" &&
    health.apiUsage?.perMinuteLimit <= 30 &&
    health.apiUsage?.pacingMs > 0;
  const hasRotationFairness = Boolean(
    rotationAudit?.status === "healthy" ||
    rotationAudit?.status === "watch" ||
    ((statePool?.deepScan.capacity ?? 0) > 0 && (statePool?.deepScan.selectedAssets.length ?? 0) > 0),
  );
  const hasAntiDominance = Boolean(
    rotationAudit && rotationAudit.status !== "blocked" && rotationAudit.status !== "starved" ||
    (statePool?.proof.pendingAssets.length ?? 0) > 0 && (statePool?.proof.notEliminatedAssets ?? 0) > 0,
  );
  const hasLongTail = (statePool?.proof.coldExplorationAssets.length ?? 0) > 0 ||
    (statePool?.deepScan.explorationSlots ?? 0) > 0;
  const hasStatePoolFeedback = (statePool?.assetSamples.length ?? 0) > 0 ||
    (statePool?.promotionBridge.samples.length ?? 0) > 0 ||
    Object.values(statePool?.counts ?? {}).some((count) => count > 0);
  const checks: CoreP0CompletionCheck[] = [
    {
      key: "p0_ready_gate",
      label: "P0 已闭环",
      status: p0Completion.status === "ready" && p0Completion.percent === 100 ? "pass" : "fail",
      detail: `P0=${p0Completion.percent}%/${p0Completion.status}；P1 不能绕过核心链路治理。`,
    },
    {
      key: "public_light_scan_ready",
      label: "公开轻扫可用",
      status: lightScanReady && (lightScan?.acceptedCount ?? 0) > 0 ? "pass" : "fail",
      detail: `status=${lightScan?.status ?? "missing"} accepted=${lightScan?.acceptedCount ?? 0} universe=${lightScan?.universeCount ?? 0}。`,
    },
    {
      key: "websocket_worker_online",
      label: "WebSocket worker 在线",
      status: websocketStatus === "healthy" || websocketStatus === "degraded" ? "pass" : "fail",
      detail: `websocket-light-worker=${websocketStatus ?? "missing"}。`,
    },
    {
      key: "microstructure_proxy",
      label: "主动成交/CVD proxy 有边界",
      status: hasMicrostructureProxy(snapshot) ? "pass" : "fail",
      detail: "候选可带 taker_trade_proxy 或 rolling_price_volume_proxy；该指标只用于发现层排序，不是真实官方 CVD。",
    },
    {
      key: "rotation_fairness",
      label: "深扫轮转公平",
      status: hasRotationFairness ? "pass" : "fail",
      detail: `capacity=${statePool?.deepScan.capacity ?? 0} selected=${statePool?.deepScan.selectedAssets.length ?? 0} rotation=${rotationAudit?.status ?? "fallback"}。`,
    },
    {
      key: "anti_fixed_asset_dominance",
      label: "防固定币霸占",
      status: hasAntiDominance ? "pass" : "fail",
      detail: `pending=${statePool?.proof.pendingAssets.length ?? 0} notEliminated=${statePool?.proof.notEliminatedAssets ?? 0}。`,
    },
    {
      key: "long_tail_exploration",
      label: "长尾探索保底",
      status: hasLongTail ? "pass" : "fail",
      detail: `cold=${statePool?.proof.coldExplorationAssets.length ?? 0} explorationSlots=${statePool?.deepScan.explorationSlots ?? 0}。`,
    },
    {
      key: "state_pool_feedback",
      label: "状态池反馈参与调度",
      status: hasStatePoolFeedback ? "pass" : "fail",
      detail: `samples=${statePool?.assetSamples.length ?? 0} bridge=${statePool?.promotionBridge.samples.length ?? 0}。`,
    },
    {
      key: "public_exchange_lanes",
      label: "Binance/OKX/Bybit 公开源",
      status: publicExchangeCount >= 3 ? "pass" : "fail",
      detail: `已发现公开源 ${publicExchangeCount}/3：${Array.from(sources).join(", ") || "none"}。`,
    },
    {
      key: "coinglass_budget_guard",
      label: "CoinGlass 请求预算保护",
      status: coinGlassGuarded ? "pass" : "fail",
      detail: `status=${health.apiUsage?.status ?? "missing"} perMinute=${health.apiUsage?.perMinuteLimit ?? "unknown"} pacing=${health.apiUsage?.pacingMs ?? "unknown"}ms。`,
    },
    {
      key: "discovery_only_boundary",
      label: "发现层无交易权限",
      status: "pass",
      detail: "WebSocket、ticker、CVD proxy、轮转调度都不能直接生成交易计划。",
    },
  ];
  const passed = checks.filter((check) => check.status === "pass").length;
  const percent = Math.round((passed / checks.length) * 100);
  const remaining = checks.filter((check) => check.status === "fail").map((check) => check.label);

  return {
    checks,
    percent,
    remaining,
    status: remaining.length === 0 ? "ready" : "blocked",
    summary: remaining.length === 0
      ? "P1 快速全市场扫描发现层已闭环；后续进入 P2 机会发现质量增强。"
      : `P1 尚未闭环：${remaining.join("、")}。`,
  };
}

function readiness(chain: CoreChainStep[]): CoreChainGovernanceReport["readiness"] {
  const blockedSteps = chain.filter((step) => step.status === "blocked").length;
  const coreReadySteps = chain.filter((step) => step.status === "ready").length;
  const totalSteps = chain.length;
  const status: CoreReadinessStatus = blockedSteps > 0
    ? "blocked"
    : coreReadySteps === totalSteps
      ? "ready"
      : coreReadySteps >= 4
        ? "watch"
        : coreReadySteps >= 2
          ? "partial"
          : "collecting";

  return {
    blockedSteps,
    coreReadySteps,
    totalSteps,
    status,
  };
}

export function buildCoreChainGovernanceReport({
  businessCapability,
  health,
  snapshot,
}: {
  businessCapability: BusinessCapabilityReport;
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): CoreChainGovernanceReport {
  const chain = buildChain({ businessCapability, health, snapshot });
  const cleanupRules = [
    "不服务核心链路的功能必须删除、合并或降级。",
    "mock、旧缓存、0 值和装饰文案不能冒充真实数据。",
    "前端展示能力不能强于后端真实能力。",
    "候选、证据信号、交易计划就绪必须分层展示。",
    "所有交易计划必须经过 Evidence、Risk Gate、RR 和复盘追踪边界。",
  ];
  const featureTriage = buildFeatureTriage();
  const pageRoles = buildPageRoles();
  const apiRoles = buildApiRoles();
  const p0Completion = buildP0Completion({ apiRoles, chain, cleanupRules, featureTriage, pageRoles });
  const p1Completion = buildP1Completion({ health, p0Completion, snapshot });

  return {
    schemaVersion: "core-chain-governance.v1",
    generatedAt: health.generatedAt,
    allowedUse: "product_governance_only",
    canAutoExecute: false,
    canCreateTradeSignal: false,
    canMutateLiveRanking: false,
    coreObjective: "提前发现有潜力的山寨币异动，并判断它有没有交易价值。",
    chain,
    cleanupRules,
    featureTriage,
    operatingSequence: [
      "大盘是否允许做山寨",
      "板块/全市场是否有资金异动",
      "个币是否相对强或相对弱",
      "是否处于启动前/趋势切换状态",
      "是否靠近关键位",
      "量能和衍生品是否确认",
      "多周期是否冲突",
      "RR 是否至少 3:1",
      "Risk Gate 是否放行",
      "是否生成交易计划并进入复盘追踪",
    ],
    pageRoles,
    apiRoles,
    p0Completion,
    p1Completion,
    readiness: readiness(chain),
  };
}
