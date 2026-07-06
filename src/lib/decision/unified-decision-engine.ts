import type {
  StrategyV3TradePlan,
} from "@/lib/analysis/v3/types";
import type {
  MarketRegimeAssessment,
} from "@/lib/market-regime/market-regime";

export type UnifiedDecisionState =
  | "OBSERVE"
  | "WAIT"
  | "BLOCKED"
  | "TRADE_PLAN_READY";

export type BackendDecisionMaturity =
  | "LIGHT_SCAN_MARK"
  | "DEEP_SCAN_CANDIDATE"
  | "EVIDENCE_SIGNAL"
  | "TRADE_PLAN_READY"
  | "BLOCKED"
  | "INVALIDATED"
  | "COOLDOWN"
  | "REVIEW_ONLY";

export type UnifiedDecisionBlocker = {
  reason: string;
  removable: boolean;
  unblockCondition: string;
};

export type UnifiedWaitPlan = {
  confirmation: string;
  invalidation: string;
  trigger: string;
  whyNotNow: string;
};

export type UnifiedReadyPlan = {
  direction: "long" | "short";
  plannedEntryPrice: number;
  rewardRisk: number;
  structuralStop: number;
  targets: number[];
};

export type UnifiedDecisionInput = {
  backendMaturity: BackendDecisionMaturity;
  marketRegime?: MarketRegimeAssessment | null;
  minimumRewardRisk?: number;
  symbol: string;
  tradePlan?: StrategyV3TradePlan | null;
};

export type UnifiedDecisionResult = {
  allowedUse: "backend_decision_only";
  blockers: UnifiedDecisionBlocker[];
  canAutoExecute: false;
  canCreateTradePlanFromRegime: false;
  canMutateLiveRanking: false;
  decision: UnifiedDecisionState;
  marketRegimeContext: {
    dataStatus: MarketRegimeAssessment["dataStatus"] | "UNAVAILABLE";
    primary: MarketRegimeAssessment["primary"] | "UNKNOWN";
    warnings: string[];
  };
  readyPlan: UnifiedReadyPlan | null;
  reasons: string[];
  symbol: string;
  waitPlan: UnifiedWaitPlan | null;
};

const DEFAULT_MINIMUM_REWARD_RISK = 3;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function blocker(reason: string, unblockCondition: string, removable = true): UnifiedDecisionBlocker {
  return {
    reason,
    removable,
    unblockCondition,
  };
}

function regimeContext(regime: MarketRegimeAssessment | null | undefined): UnifiedDecisionResult["marketRegimeContext"] {
  if (!regime) {
    return {
      dataStatus: "UNAVAILABLE",
      primary: "UNKNOWN",
      warnings: ["市场状态未接入；只能作为缺失 context，不能生成 READY。"],
    };
  }

  return {
    dataStatus: regime.dataStatus,
    primary: regime.primary,
    warnings: regime.warnings,
  };
}

function waitPlanFrom(plan: StrategyV3TradePlan): UnifiedWaitPlan | null {
  if (plan.status !== "WAIT_PULLBACK" && plan.status !== "WAIT_RETEST") {
    return null;
  }

  const trigger = plan.triggerCondition ?? "";
  const invalidation = plan.invalidation ?? "";
  const confirmation = plan.secondaryConfirmation ?? "";
  const whyNotNow = plan.whyNotNow ?? plan.waitReason ?? "";

  if (
    trigger.trim().length === 0 ||
    invalidation.trim().length === 0 ||
    confirmation.trim().length === 0 ||
    whyNotNow.trim().length === 0
  ) {
    return null;
  }

  return {
    confirmation,
    invalidation,
    trigger,
    whyNotNow,
  };
}

function readyPlanFrom(plan: StrategyV3TradePlan, minimumRewardRisk: number): {
  blockers: UnifiedDecisionBlocker[];
  readyPlan: UnifiedReadyPlan | null;
} {
  const blockers: UnifiedDecisionBlocker[] = [];
  const readyStatus = plan.status === "READY_LONG" || plan.status === "READY_SHORT";
  const direction = plan.status === "READY_SHORT" ? "short" : plan.status === "READY_LONG" ? "long" : null;

  if (!readyStatus || !direction) {
    blockers.push(blocker("trade_plan_not_ready_status", "后端 v3 trade plan 必须是 READY_LONG 或 READY_SHORT。", true));
  }

  if (!plan.isPlanEligible) {
    blockers.push(blocker("trade_plan_not_eligible", "后端计划必须明确 isPlanEligible=true。", true));
  }

  if (!isFiniteNumber(plan.rewardRisk) || plan.rewardRisk < minimumRewardRisk) {
    blockers.push(blocker("reward_risk_below_minimum", `结构盈亏比必须 >= ${minimumRewardRisk}:1。`, true));
  }

  if (!isFiniteNumber(plan.structuralStop)) {
    blockers.push(blocker("missing_structural_stop", "必须有后端结构止损，不能由前端或 regime 推导。", true));
  }

  if (plan.targets.length === 0 || !plan.targets.every(isFiniteNumber)) {
    blockers.push(blocker("missing_structural_target", "必须有后端结构目标位，不能硬编 TP。", true));
  }

  if (!isFiniteNumber(plan.plannedEntryPrice)) {
    blockers.push(blocker("missing_planned_entry", "必须有后端 plannedEntryPrice。", true));
  }

  if (plan.blockedBy.length > 0) {
    blockers.push(blocker("plan_has_blockers", `先解除阻断：${unique(plan.blockedBy).join(" / ")}。`, true));
  }

  if (blockers.length > 0 || !direction) {
    return {
      blockers,
      readyPlan: null,
    };
  }

  const plannedEntryPrice = plan.plannedEntryPrice;
  const rewardRisk = plan.rewardRisk;
  const structuralStop = plan.structuralStop;

  if (
    !isFiniteNumber(plannedEntryPrice) ||
    !isFiniteNumber(rewardRisk) ||
    !isFiniteNumber(structuralStop)
  ) {
    return {
      blockers: [
        blocker("ready_numeric_fields_invalid", "READY 输出必须保留有效 plannedEntryPrice、rewardRisk 和 structuralStop。", true),
      ],
      readyPlan: null,
    };
  }

  return {
    blockers: [],
    readyPlan: {
      direction,
      plannedEntryPrice,
      rewardRisk,
      structuralStop,
      targets: plan.targets,
    },
  };
}

export function buildUnifiedDecision(input: UnifiedDecisionInput): UnifiedDecisionResult {
  const minimumRewardRisk = input.minimumRewardRisk ?? DEFAULT_MINIMUM_REWARD_RISK;
  const plan = input.tradePlan ?? null;
  const marketRegimeContext = regimeContext(input.marketRegime);
  const base = {
    allowedUse: "backend_decision_only" as const,
    canAutoExecute: false as const,
    canCreateTradePlanFromRegime: false as const,
    canMutateLiveRanking: false as const,
    marketRegimeContext,
    readyPlan: null,
    symbol: input.symbol,
    waitPlan: null,
  };

  if (!plan) {
    return {
      ...base,
      blockers: [],
      decision: "OBSERVE",
      reasons: ["没有后端结构化 trade plan；只能观察，不能生成入场/止损/目标。"],
    };
  }

  const maturityBlocker = input.backendMaturity === "TRADE_PLAN_READY"
    ? null
    : blocker(
      "backend_maturity_not_ready",
      "只有后端 maturity=TRADE_PLAN_READY 且完整 trade plan 通过，才允许 READY。",
      true,
    );

  if (plan.status === "WAIT_PULLBACK" || plan.status === "WAIT_RETEST") {
    const waitPlan = waitPlanFrom(plan);

    if (!waitPlan) {
      return {
        ...base,
        blockers: [
          blocker(
            "wait_quality_incomplete",
            "WAIT 必须同时具备 trigger、invalidation、confirmation、whyNotNow。",
            true,
          ),
        ],
        decision: "BLOCKED",
        reasons: ["WAIT 条件不完整，不能包装成有效等待计划。"],
      };
    }

    return {
      ...base,
      blockers: [],
      decision: "WAIT",
      reasons: unique([
        plan.summary,
        "WAIT 只说明等待触发和失效边界，不是交易计划就绪。",
      ]),
      waitPlan,
    };
  }

  if (plan.status === "READY_LONG" || plan.status === "READY_SHORT") {
    const ready = readyPlanFrom(plan, minimumRewardRisk);
    const blockers = maturityBlocker ? [maturityBlocker, ...ready.blockers] : ready.blockers;

    if (blockers.length > 0 || !ready.readyPlan) {
      return {
        ...base,
        blockers,
        decision: "BLOCKED",
        reasons: ["后端计划看似 READY，但没有通过统一决策引擎硬门槛。"],
      };
    }

    return {
      ...base,
      blockers: [],
      decision: "TRADE_PLAN_READY",
      readyPlan: ready.readyPlan,
      reasons: unique([
        plan.summary,
        `后端 mature trade plan 已满足结构止损、目标位、RR >= ${minimumRewardRisk}:1 且无 blocker。`,
      ]),
    };
  }

  if (plan.status === "BLOCKED") {
    return {
      ...base,
      blockers: unique(plan.blockedBy).map((reason) =>
        blocker(reason, `解除或重新验证 ${reason} 后，重新运行后端结构分析和风控门禁。`, true)
      ),
      decision: "BLOCKED",
      reasons: unique([
        plan.summary,
        "BLOCKED 不允许进入计划就绪区。",
      ]),
    };
  }

  return {
    ...base,
    blockers: maturityBlocker ? [maturityBlocker] : [],
    decision: "OBSERVE",
    reasons: unique([
      plan.summary,
      "当前状态只允许观察；不能由前端、regime 或 review 推导交易计划。",
    ]),
  };
}
