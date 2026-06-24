import type {
  MarketSignal,
  SignalMaturity,
  SignalMaturityReason,
  SignalMaturityStage,
} from "../analysis/types";
import type { ScanLightScanCandidate } from "./types";

export type SignalMaturityDiagnostics = {
  candidateLaneSymbols: string[];
  counts: Record<SignalMaturityStage, number>;
  guardrail: string;
  mainSignalSymbols: string[];
  rules: string[];
  tradePlanReadySymbols: string[];
};

const labels: Record<SignalMaturityStage, string> = {
  LIGHT_SCAN_MARK: "轻扫标记",
  DEEP_SCAN_CANDIDATE: "深扫候选",
  EVIDENCE_SIGNAL: "证据融合信号",
  TRADE_PLAN_READY: "交易计划就绪",
};

function maturity({
  reasons,
  stage,
}: {
  reasons: SignalMaturityReason[];
  stage: SignalMaturityStage;
}): SignalMaturity {
  return {
    canAttachTradePlan: stage === "TRADE_PLAN_READY",
    canEnterMainSignalArea: stage === "EVIDENCE_SIGNAL" || stage === "TRADE_PLAN_READY",
    canRequestAiReview: stage === "EVIDENCE_SIGNAL" || stage === "TRADE_PLAN_READY",
    label: labels[stage],
    reasons,
    stage,
  };
}

function uniqueReasons(reasons: SignalMaturityReason[]) {
  return [...new Set(reasons)];
}

function v3TradePlanStatusReady(status: string | undefined) {
  return status === "READY_LONG" || status === "READY_SHORT";
}

function v3PlanEligible(signal: MarketSignal) {
  const tradePlan = signal.strategyV3?.tradePlan;

  return signal.timeframeGate?.allowed !== false &&
    tradePlan?.isPlanEligible === true &&
    v3TradePlanStatusReady(tradePlan.status) &&
    (tradePlan.rewardRisk ?? signal.strategy.riskReward) >= 3 &&
    signal.risk !== "high" &&
    signal.risk !== "blocked";
}

function hasStructuredEvidence(signal: MarketSignal) {
  return signal.evidence.length > 0 ||
    Boolean(signal.strategyV2) ||
    Boolean(signal.strategyV3?.trendContext) ||
    Boolean(signal.strategyV3?.keyLevels.length) ||
    Boolean(signal.strategyV3?.forwardLevels.length);
}

export function classifyLightScanMaturity(candidate: ScanLightScanCandidate): SignalMaturity {
  void candidate;

  return maturity({
    stage: "LIGHT_SCAN_MARK",
    reasons: ["light_scan_only"],
  });
}

export function classifySignalMaturity(signal: MarketSignal): SignalMaturity {
  const reasons: SignalMaturityReason[] = [];

  if (signal.state === "insufficient_data" || signal.strategy.status === "blocked") {
    reasons.push("insufficient_data");
  }

  if (
    signal.risk === "high" ||
    signal.risk === "blocked" ||
    signal.strategy.riskReward < 3 ||
    signal.timeframeGate?.allowed === false ||
    signal.strategyV3?.tradePlan?.isPlanEligible === false ||
    signal.strategyV3?.trendContext?.riskGate.allowed === false
  ) {
    reasons.push("risk_gate_or_rr_blocked");
  }

  if (signal.timeframeGate?.allowed === false) {
    reasons.push("timeframe_gate_blocked");
  }

  if (v3PlanEligible(signal)) {
    return maturity({
      stage: "TRADE_PLAN_READY",
      reasons: uniqueReasons([...reasons, "eligible_v3_trade_plan"]),
    });
  }

  if (hasStructuredEvidence(signal) && signal.state !== "insufficient_data") {
    return maturity({
      stage: "EVIDENCE_SIGNAL",
      reasons: uniqueReasons([...reasons, "has_structured_evidence", "trade_plan_not_ready"]),
    });
  }

  return maturity({
    stage: "DEEP_SCAN_CANDIDATE",
    reasons: uniqueReasons(reasons.length ? reasons : ["trade_plan_not_ready"]),
  });
}

export function applySignalMaturity(signal: MarketSignal): MarketSignal {
  return {
    ...signal,
    maturity: classifySignalMaturity(signal),
  };
}

function emptyCounts(): Record<SignalMaturityStage, number> {
  return {
    LIGHT_SCAN_MARK: 0,
    DEEP_SCAN_CANDIDATE: 0,
    EVIDENCE_SIGNAL: 0,
    TRADE_PLAN_READY: 0,
  };
}

function maturityFor(signal: MarketSignal) {
  return classifySignalMaturity(signal);
}

export function buildSignalMaturityDiagnostics({
  lightScanMarkCount = 0,
  signals,
}: {
  lightScanMarkCount?: number;
  signals: MarketSignal[];
}): SignalMaturityDiagnostics {
  const counts = emptyCounts();
  const mainSignalSymbols: string[] = [];
  const candidateLaneSymbols: string[] = [];
  const tradePlanReadySymbols: string[] = [];

  counts.LIGHT_SCAN_MARK = lightScanMarkCount;

  for (const signal of signals) {
    const current = maturityFor(signal);
    counts[current.stage] += 1;

    if (current.stage === "DEEP_SCAN_CANDIDATE") {
      candidateLaneSymbols.push(signal.symbol);
    }

    if (current.canEnterMainSignalArea) {
      mainSignalSymbols.push(signal.symbol);
    }

    if (current.stage === "TRADE_PLAN_READY") {
      tradePlanReadySymbols.push(signal.symbol);
    }
  }

  return {
    candidateLaneSymbols,
    counts,
    guardrail: "轻扫标记不进入主信号区；深扫候选只能进候选/验证中区域；只有证据融合信号和交易计划就绪能进入主信号区。",
    mainSignalSymbols,
    rules: [
      "LIGHT_SCAN_MARK is scheduling input only",
      "DEEP_SCAN_CANDIDATE is visible as verifying candidate only",
      "EVIDENCE_SIGNAL can enter the main signal area without a trade plan",
      "TRADE_PLAN_READY is the only maturity allowed to attach a structured trade plan",
    ],
    tradePlanReadySymbols,
  };
}

export function applySignalMaturityToSnapshot<T extends { metadata: { lightScan?: { candidateCount: number }; signalMaturity?: SignalMaturityDiagnostics }; signals: MarketSignal[] }>(
  snapshot: T,
): T {
  const signals = snapshot.signals.map((signal) => applySignalMaturity(signal));

  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      signalMaturity: buildSignalMaturityDiagnostics({
        lightScanMarkCount: snapshot.metadata.lightScan?.candidateCount ?? 0,
        signals,
      }),
    },
    signals,
  };
}
