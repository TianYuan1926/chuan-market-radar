export type CoreFactId =
  | "tradePlanReady"
  | "candidateCount"
  | "anomalyCount"
  | "radarSignals"
  | "scanFreshness"
  | "dataSourceStatus"
  | "reviewLatestReport"
  | "sniperBoardTargets"
  | "waitBlockedReady"
  | "servedCacheStalePartial"
  | "frontendChineseLabels"
  | "businessAllowedUse"
  | "canAutoExecute"
  | "canAutoAdjustWeights"
  | "canMutateLiveRanking";

export type FactAuthoringLayer =
  | "backend-contract"
  | "backend-strategy"
  | "backend-scan"
  | "backend-review"
  | "ui-schema";

export type FactConsumerLayer =
  | "frontend-display"
  | "frontend-adapter"
  | "review-page"
  | "system-page"
  | "deployment-check";

export type SingleSourceFactDefinition = {
  id: CoreFactId;
  sourceOfTruth: string;
  authoringLayer: FactAuthoringLayer;
  consumers: FactConsumerLayer[];
  frontendMayCompute: boolean;
  reviewMayMutateProduction: false;
  fallbackMayPretendLive: false;
  guardrail: string;
};

export const SINGLE_SOURCE_OF_TRUTH_FACTS: Record<CoreFactId, SingleSourceFactDefinition> = {
  tradePlanReady: {
    id: "tradePlanReady",
    sourceOfTruth: "backend.analysis.signalMaturity.tradePlanReadySymbols + signal.maturity.stage",
    authoringLayer: "backend-strategy",
    consumers: ["frontend-adapter", "frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "前端只能读取 TRADE_PLAN_READY；不能根据分数、结构盈亏比或文案自行升级。",
  },
  candidateCount: {
    id: "candidateCount",
    sourceOfTruth: "backend.presentation.counts.candidateLaneSignals",
    authoringLayer: "backend-contract",
    consumers: ["frontend-display", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "候选数量只说明等待验证，不代表交易机会数量。",
  },
  anomalyCount: {
    id: "anomalyCount",
    sourceOfTruth: "snapshot.signals + backend.presentation.counts.currentSignals",
    authoringLayer: "backend-scan",
    consumers: ["frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "异常数量不能被包装成计划就绪或推荐。",
  },
  radarSignals: {
    id: "radarSignals",
    sourceOfTruth: "/api/frontend/radar-contract.radarSignals",
    authoringLayer: "backend-contract",
    consumers: ["frontend-adapter", "frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "前端 fallback 只能补候选观察，必须标 partial，不能补交易计划。",
  },
  scanFreshness: {
    id: "scanFreshness",
    sourceOfTruth: "/api/health.health.scan.freshness + snapshot.metadata.status",
    authoringLayer: "backend-scan",
    consumers: ["frontend-display", "deployment-check"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "served_cache/stale/partial 不能显示成 live。",
  },
  dataSourceStatus: {
    id: "dataSourceStatus",
    sourceOfTruth: "/api/health.health.dataSource + backend.sourceAudit",
    authoringLayer: "backend-contract",
    consumers: ["frontend-display", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "数据源失败不能写成市场无机会。",
  },
  reviewLatestReport: {
    id: "reviewLatestReport",
    sourceOfTruth: "/api/frontend/review-contract.historicalBacktest",
    authoringLayer: "backend-review",
    consumers: ["review-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "回测/复盘只读研究结果，不能回写实时排序。",
  },
  sniperBoardTargets: {
    id: "sniperBoardTargets",
    sourceOfTruth: "TRADE_PLAN_READY radarSignals from backend contract",
    authoringLayer: "backend-strategy",
    consumers: ["frontend-adapter", "frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "计划就绪区只展示后端计划就绪样本；没有计划就绪就空。",
  },
  waitBlockedReady: {
    id: "waitBlockedReady",
    sourceOfTruth: "src/lib/ui-schema/status-dictionary.ts + backend maturity",
    authoringLayer: "ui-schema",
    consumers: ["frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "WAIT/BLOCKED/CANDIDATE/EVIDENCE_SIGNAL 不得互相替代。",
  },
  servedCacheStalePartial: {
    id: "servedCacheStalePartial",
    sourceOfTruth: "Resource.status + /api/scan.status + /api/health.scan",
    authoringLayer: "backend-contract",
    consumers: ["frontend-display", "deployment-check"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "缓存、过期、部分可用必须明确显示。",
  },
  frontendChineseLabels: {
    id: "frontendChineseLabels",
    sourceOfTruth: "src/lib/ui-schema/status-dictionary.ts",
    authoringLayer: "ui-schema",
    consumers: ["frontend-display"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "核心展示文案由状态词典统一输出。",
  },
  businessAllowedUse: {
    id: "businessAllowedUse",
    sourceOfTruth: "/api/radar/business-capability.allowedUse",
    authoringLayer: "backend-review",
    consumers: ["review-page", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "业务能力合同必须保持 research_only。",
  },
  canAutoExecute: {
    id: "canAutoExecute",
    sourceOfTruth: "/api/radar/business-capability.canAutoExecute",
    authoringLayer: "backend-review",
    consumers: ["review-page", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "永远不能自动下单。",
  },
  canAutoAdjustWeights: {
    id: "canAutoAdjustWeights",
    sourceOfTruth: "/api/radar/business-capability.canAutoAdjustWeights",
    authoringLayer: "backend-review",
    consumers: ["review-page", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "复盘只能提出建议，不能自动改权重。",
  },
  canMutateLiveRanking: {
    id: "canMutateLiveRanking",
    sourceOfTruth: "/api/radar/business-capability.canMutateLiveRanking",
    authoringLayer: "backend-review",
    consumers: ["review-page", "system-page"],
    frontendMayCompute: false,
    reviewMayMutateProduction: false,
    fallbackMayPretendLive: false,
    guardrail: "review/backtest 不得污染 production ranking。",
  },
};

export function singleSourceFact(id: CoreFactId): SingleSourceFactDefinition {
  return SINGLE_SOURCE_OF_TRUTH_FACTS[id];
}

export function assertFrontendMayNotCompute(id: CoreFactId): void {
  if (SINGLE_SOURCE_OF_TRUTH_FACTS[id].frontendMayCompute) {
    return;
  }
  throw new Error(`frontend_may_not_compute:${id}`);
}

export function singleSourceTruthSummary(): string[] {
  return Object.values(SINGLE_SOURCE_OF_TRUTH_FACTS).map((fact) =>
    `${fact.id}: ${fact.sourceOfTruth}`,
  );
}
