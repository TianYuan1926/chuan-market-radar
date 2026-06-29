import type {
  SignalMaturityStage,
} from "../analysis/types";
import type {
  V3TradePlanStatus,
} from "../analysis/v3/types";

export type GoldenCaseCategory =
  | "accumulation"
  | "breakout"
  | "compression"
  | "exhaustion"
  | "fakeout"
  | "high_timeframe_conflict"
  | "late_move"
  | "rr_gate"
  | "wait_plan";

export type GoldenCaseDirection = "long" | "neutral" | "short";

export type GoldenCaseFacts = {
  btcRegime: "down" | "flat" | "up";
  closePositionPct: number;
  compressionPct: number;
  fundingState: "crowded" | "elevated" | "neutral";
  highTimeframeConflict: boolean;
  oiState: "falling" | "flat" | "rising" | "spiking";
  priceAction:
    | "accumulating"
    | "breakout_confirmed"
    | "breakout_failed"
    | "compression"
    | "dumped"
    | "exhaustion"
    | "pumped"
    | "pullback_reaction"
    | "retest_failed";
  rewardRisk: number | null;
  stopDistancePct: number;
  volumeState: "declining" | "normal" | "rising" | "spiking";
  waitTriggerQuality?: "invalid" | "none" | "valid";
};

export type GoldenCaseExpected = {
  allowTradePlan: boolean;
  category: GoldenCaseCategory;
  direction: GoldenCaseDirection;
  maxRiskScore?: number;
  minRiskScore?: number;
  maturity: SignalMaturityStage;
  requiredBlockers?: string[];
  status: V3TradePlanStatus;
};

export type GoldenCaseFixture = {
  description: string;
  expected: GoldenCaseExpected;
  facts: GoldenCaseFacts;
  id: string;
  title: string;
};

export type GoldenCaseDecision = {
  blockers: string[];
  category: GoldenCaseCategory;
  direction: GoldenCaseDirection;
  maturity: SignalMaturityStage;
  riskScore: number;
  status: V3TradePlanStatus;
  summary: string;
};

export type GoldenCaseFailure = {
  actual: unknown;
  expected: unknown;
  field: string;
  message: string;
};

export type GoldenCaseResult = {
  decision: GoldenCaseDecision;
  failures: GoldenCaseFailure[];
  fixture: GoldenCaseFixture;
  passed: boolean;
};

export type GoldenCaseRunSummary = {
  failed: number;
  generatedAt: string;
  passed: number;
  results: GoldenCaseResult[];
  schemaVersion: "golden-case-run.v1";
  status: "failed" | "passed";
  total: number;
};
