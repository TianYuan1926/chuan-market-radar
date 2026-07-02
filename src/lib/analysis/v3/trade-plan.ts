import type {
  MarketSignal,
} from "../types";
import type {
  StrategyV3TradePlan,
  StrategyV3TrendContext,
  V3LocationDirection,
  V3TradePlanStatus,
} from "./types";

export type BuildV3TradePlanInput = {
  currentPrice: number;
  signal: MarketSignal;
  trendContext: StrategyV3TrendContext;
};

function priceLabel(value: number | null) {
  if (value === null) {
    return "待确认";
  }

  return value >= 100 ? value.toFixed(2) : value.toFixed(6);
}

function directionLabel(direction: V3LocationDirection) {
  if (direction === "long") {
    return "多头";
  }

  if (direction === "short") {
    return "空头";
  }

  return "中性";
}

function waitStatus(direction: V3LocationDirection): V3TradePlanStatus {
  return direction === "short" ? "WAIT_RETEST" : "WAIT_PULLBACK";
}

const minimumPlanRewardRisk = 3;
const maximumPlanStopDistancePercent = 6;

function waitTriggerText(direction: V3LocationDirection, status: V3TradePlanStatus) {
  if (direction === "long") {
    return status === "WAIT_RETEST"
      ? "触发条件：突破关键压力后，回踩不跌回压力下方，触发K线不能刺破结构止损，并且 15m/1h 收盘重新站稳，才进入人工复核。"
      : "触发条件：回踩关键支撑后不破，触发K线不能刺破结构止损，15m/1h 出现承接，低点不再刷新，才进入人工复核。";
  }

  if (direction === "short") {
    return status === "WAIT_PULLBACK"
      ? "触发条件：跌破关键支撑后，反抽无法收回支撑上方，触发K线不能刺破结构止损，并且 15m/1h 收盘继续承压，才进入人工复核。"
      : "触发条件：反抽关键压力后不过，触发K线不能刺破结构止损，15m/1h 出现承压，高点不再刷新，才进入人工复核。";
  }

  return "触发条件：方向未明确前只观察，不能生成多空计划。";
}

function waitReviewText(blockedBy: string[], direction: V3LocationDirection) {
  const unique = [...new Set(blockedBy)];
  const notes: string[] = [];

  if (unique.includes("structure_confirmation_pending")) {
    notes.push(
      direction === "short"
        ? "结构等待点：先等有效跌破支撑，或反抽支撑失败，不能在中间位置直接追空。"
        : "结构等待点：先等有效突破压力，或回踩支撑承接，不能在中间位置直接追多。",
    );
  }

  if (unique.includes("no_recent_touch")) {
    notes.push("位置等待点：价格还没有重新触碰关键位，暂时只能观察，不能把中间位置当入场位。");
  }

  if (unique.includes("no_relevant_level") || unique.includes("location_rr")) {
    notes.push("关键位等待点：支撑、压力或箱体边界还不清楚，先补关键位再谈计划。");
  }

  if (unique.includes("no_structural_stop")) {
    notes.push("结构止损质量：当前没有可验证防守位，不能用随手画的价格当止损。");
  }

  if (unique.includes("invalid_structural_stop")) {
    notes.push("结构止损质量：止损位置和方向相反，说明当前关键位映射错误，必须重建支撑/压力。");
  }

  if (unique.includes("no_nearest_target")) {
    notes.push("目标位质量：前方没有可追溯目标位，不能为了生成计划硬编 TP。");
  }

  if (unique.includes("invalid_nearest_target")) {
    notes.push("目标位质量：目标位在错误方向，当前目标投射无效，必须重新识别前高/前低或箱体边界。");
  }

  if (unique.includes("reaction_not_confirmed")) {
    notes.push(
      direction === "short"
        ? "反应等待点：需要看到反抽承压、上影线或收盘继续弱，才允许复核空头计划。"
        : "反应等待点：需要看到回踩承接、下影线或收盘重新走强，才允许复核多头计划。",
    );
  }

  if (unique.includes("reward_risk_below_minimum") || unique.includes("stop_distance_too_wide")) {
    notes.push("赔率等待点：当前止损距离或目标空间不合格，等价格更靠近防守位或目标位重新打开。");
  }

  if (unique.includes("stop_distance_too_tight")) {
    notes.push("结构止损质量：止损距离过近容易被普通波动扫掉，必须等待更清晰的防守位或二次确认。");
  }

  if (unique.includes("stop_distance_too_wide")) {
    notes.push("结构止损质量：止损距离过宽会把小波动变成大亏损，必须等更靠近防守位或改用更近的有效结构。");
  }

  if (unique.includes("bull_structure_broken")) {
    notes.push("结构修复等待点：多头结构短线受损，必须重新站回关键位并形成承接，不能把破位后的反抽直接当入场。");
  }

  if (unique.includes("bear_structure_broken")) {
    notes.push("结构修复等待点：空头结构短线受损，必须重新跌回关键位并形成承压，不能把收复后的回落直接当入场。");
  }

  if (unique.includes("structure_repair_pending")) {
    notes.push(
      direction === "short"
        ? "结构修复等待点：空头还在修复确认阶段，必须看到反抽承压或重新跌回关键位，不能直接追空。"
        : "结构修复等待点：多头还在修复确认阶段，必须看到回踩承接或重新站回关键位，不能直接追多。",
    );
  }

  if (notes.length === 0) {
    return "";
  }

  return notes.join(" ");
}

function isWaitEntryOnlyBlocker(blocker: string) {
  return blocker === "reward_risk_below_minimum" ||
    blocker === "stop_distance_too_wide" ||
    blocker === "chase_risk";
}

function isReactionFailureBlocker(blocker: string) {
  return blocker === "support_lost" || blocker === "resistance_reclaimed";
}

function structureRepairEligible({
  direction,
  trendContext,
}: {
  direction: V3LocationDirection;
  trendContext: StrategyV3TrendContext;
}) {
  const location = trendContext.locationRiskReward;
  const reaction = trendContext.reactionQuality;

  if (!location || !reaction || direction === "neutral") {
    return false;
  }

  const minRewardRisk = Math.max(minimumPlanRewardRisk, location.minRewardRisk);
  const locationQualityOk = location.isTradeEligible &&
    location.rewardRisk !== null &&
    Number.isFinite(location.rewardRisk) &&
    location.rewardRisk >= minRewardRisk;
  const reactionAlreadyFailed = reaction.status === "FAILED" ||
    reaction.riskFlags.some(isReactionFailureBlocker);

  return locationQualityOk && !reactionAlreadyFailed;
}

function invalidationText({
  structuralStop,
  direction,
}: {
  structuralStop: number | null;
  direction: V3LocationDirection;
}) {
  const stop = priceLabel(structuralStop);

  if (direction === "long") {
    return `结构失效：有效跌破结构止损 ${stop}，或突破后重新跌回箱体，计划作废。`;
  }

  if (direction === "short") {
    return `结构失效：有效收回结构止损 ${stop}，或跌破后重新站回箱体，计划作废。`;
  }

  return "结构失效：方向未明确，暂不生成失效价。";
}

function planQualityFlags({
  currentPrice,
  direction,
  trendContext,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  trendContext: StrategyV3TrendContext;
}) {
  const location = trendContext.locationRiskReward;

  if (!location || direction === "neutral") {
    return [];
  }

  const flags: string[] = [];
  const minRewardRisk = Math.max(minimumPlanRewardRisk, location.minRewardRisk);
  const structuralStop = location.structuralStop;
  const target = location.nearestTarget;

  if (structuralStop === null || !Number.isFinite(structuralStop)) {
    flags.push("no_structural_stop");
  } else if (direction === "long" && structuralStop >= currentPrice) {
    flags.push("invalid_structural_stop");
  } else if (direction === "short" && structuralStop <= currentPrice) {
    flags.push("invalid_structural_stop");
  }

  if (target === null || !Number.isFinite(target)) {
    flags.push("no_nearest_target");
  } else if (direction === "long" && target <= currentPrice) {
    flags.push("invalid_nearest_target");
  } else if (direction === "short" && target >= currentPrice) {
    flags.push("invalid_nearest_target");
  }

  if (
    location.rewardRisk === null ||
    !Number.isFinite(location.rewardRisk) ||
    location.rewardRisk < minRewardRisk
  ) {
    flags.push("reward_risk_below_minimum");
  }

  if (
    !Number.isFinite(location.stopDistancePercent) ||
    location.stopDistancePercent <= 0 ||
    location.stopDistancePercent > maximumPlanStopDistancePercent
  ) {
    flags.push("stop_distance_too_wide");
  }

  if (
    Number.isFinite(location.stopDistancePercent) &&
    location.stopDistancePercent > 0 &&
    location.stopDistancePercent < 0.35
  ) {
    flags.push("stop_distance_too_tight");
  }

  return [...new Set(flags)];
}

function basePlan({
  blockedBy,
  currentPrice,
  direction,
  isPlanEligible,
  status,
  summary,
  trendContext,
  waitEntryPrice = null,
  waitEntryRewardRisk = null,
}: {
  blockedBy: string[];
  currentPrice: number;
  direction: V3LocationDirection;
  isPlanEligible: boolean;
  status: V3TradePlanStatus;
  summary: string;
  trendContext: StrategyV3TrendContext;
  waitEntryPrice?: number | null;
  waitEntryRewardRisk?: number | null;
}): StrategyV3TradePlan {
  const location = trendContext.locationRiskReward;
  const structuralStop = location?.structuralStop ?? null;
  const target = location?.nearestTarget ?? null;
  const effectiveRewardRisk = waitEntryRewardRisk ?? location?.rewardRisk ?? null;
  const directionText = directionLabel(direction);
  const riskMap = structuralStop !== null && target !== null
    ? `${waitEntryPrice !== null ? `等待入场 ${priceLabel(waitEntryPrice)}，` : ""}结构止损 ${priceLabel(structuralStop)}，第一目标 ${priceLabel(target)}，RR ${priceLabel(effectiveRewardRisk)}:1`
    : "结构止损或目标仍待确认";
  const entryContext = direction === "long"
    ? "等待靠近支撑后的承接确认，或突破后回踩不破再人工复核"
    : direction === "short"
      ? "等待靠近压力后的承压确认，或跌破后反抽不过再人工复核"
      : "等待方向明确";
  const waitTrigger = waitTriggerText(direction, status);
  const isWaitPlan = status === "WAIT_PULLBACK" || status === "WAIT_RETEST";
  const qualityReview = waitReviewText(blockedBy, direction);
  const plannedEntryPrice = waitEntryPrice ?? (isPlanEligible ? currentPrice : null);

  return {
    allowedUse: "research_only",
    blockedBy: [...new Set(blockedBy)],
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    confirmationChecklist: [
      "Risk Gate 已通过或阻断原因已明确",
      "位置/RR 不低于 3:1",
      isWaitPlan ? waitTrigger : "入场触发已经确认或无需等待触发",
      isWaitPlan ? "触发K线不能先刺破结构止损，否则只记录为失效观察，不视为入场触发。" : "结构止损未被触发前，执行条件保持有效。",
      qualityReview || "等待原因已经拆分到结构、位置、反应或赔率",
      "回踩/反抽质量已确认",
      "趋势完整度保持健康；如果处于结构修复等待，只允许等待确认，不允许直接执行。",
    ],
    direction,
    entryZone: `${directionText}计划草案：${priceLabel(currentPrice)} 附近，${entryContext}；${riskMap}。${isWaitPlan ? waitTrigger : ""}${qualityReview ? ` ${qualityReview}` : ""}`,
    hasAutoExecution: false,
    invalidation: invalidationText({ direction, structuralStop }),
    isPlanEligible,
    manualReviewRequired: true,
    plannedEntryPrice,
    positionSizing: isPlanEligible ? "只允许小仓试错，禁止追单；仓位需按结构止损距离反推。" : "未满足门控，不给仓位建议。",
    rewardRisk: effectiveRewardRisk,
    status,
    structuralStop,
    summary,
    takeProfitPlan: target === null
      ? "目标位待确认，不能制定分批止盈。"
      : `第一目标 ${priceLabel(target)}；到达前不得移动失效条件，触达后只做分批管理。`,
    targets: target === null ? [] : [target],
  };
}

function missingContextPlan(input: BuildV3TradePlanInput, missing: string[]) {
  return basePlan({
    blockedBy: missing,
    currentPrice: input.currentPrice,
    direction: input.signal.direction,
    isPlanEligible: false,
    status: "BLOCKED",
    summary: `v3 计划草案：缺少 ${missing.join(" / ")}，不能生成结构化计划。`,
    trendContext: input.trendContext,
  });
}

export function buildV3TradePlan(input: BuildV3TradePlanInput): StrategyV3TradePlan {
  const direction = input.signal.direction;
  const missing = [
    input.trendContext.locationRiskReward ? null : "location_rr",
    input.trendContext.reactionQuality ? null : "reaction_quality",
    input.trendContext.trendIntegrity ? null : "trend_integrity",
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    return missingContextPlan(input, missing);
  }

  const location = input.trendContext.locationRiskReward;
  const reaction = input.trendContext.reactionQuality;
  const integrity = input.trendContext.trendIntegrity;

  if (!location || !reaction || !integrity) {
    return missingContextPlan(input, missing);
  }

  if (direction === "neutral") {
    return basePlan({
      blockedBy: ["neutral_direction"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：方向中性，只观察，不生成多空计划。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status === "EXHAUSTION_RISK") {
    return basePlan({
      blockedBy: integrity.riskFlags,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：趋势衰竭风险只降低追单质量，不反向生成对手方向执行信号。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status === "DAMAGED_TREND") {
    const blockedBy = [
      ...integrity.riskFlags,
      ...input.trendContext.riskGate.blockedBy,
      ...reaction.riskFlags,
    ];

    if (structureRepairEligible({ direction, trendContext: input.trendContext })) {
      return basePlan({
        blockedBy,
        currentPrice: input.currentPrice,
        direction,
        isPlanEligible: false,
        status: waitStatus(direction),
        summary: direction === "long"
          ? "v3 计划草案：多头结构短线受损，不给现价交易计划；等待重新站回关键位并确认承接后再人工复核。"
          : "v3 计划草案：空头结构短线受损，不给现价交易计划；等待重新跌回关键位并确认承压后再人工复核。",
        trendContext: input.trendContext,
      });
    }

    return basePlan({
      blockedBy,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "BLOCKED",
      summary: "v3 计划草案：趋势完整度已破坏，计划阻断。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status === "STRUCTURE_REPAIR_PENDING") {
    const blockedBy = [
      ...integrity.riskFlags,
      ...input.trendContext.riskGate.blockedBy,
      ...reaction.riskFlags,
    ];

    if (reaction.status === "FAILED" || reaction.riskFlags.some(isReactionFailureBlocker)) {
      return basePlan({
        blockedBy,
        currentPrice: input.currentPrice,
        direction,
        isPlanEligible: false,
        status: "BLOCKED",
        summary: "v3 计划草案：结构处于修复等待，但回踩/反抽反应已经失败，计划阻断。",
        trendContext: input.trendContext,
      });
    }

    if (structureRepairEligible({ direction, trendContext: input.trendContext })) {
      return basePlan({
        blockedBy,
        currentPrice: input.currentPrice,
        direction,
        isPlanEligible: false,
        status: waitStatus(direction),
        summary: direction === "long"
          ? "v3 计划草案：多头处于结构修复等待，不给现价交易计划；等待重新站回关键位、回踩承接和二次确认后再人工复核。"
          : "v3 计划草案：空头处于结构修复等待，不给现价交易计划；等待重新跌回关键位、反抽承压和二次确认后再人工复核。",
        trendContext: input.trendContext,
      });
    }

    return basePlan({
      blockedBy,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：结构处于修复等待，但关键位、RR 或反应质量还不够，只观察。",
      trendContext: input.trendContext,
    });
  }

  const planQualityBlockedBy = planQualityFlags({
    currentPrice: input.currentPrice,
    direction,
    trendContext: input.trendContext,
  });

  if (!location.isTradeEligible || !input.trendContext.riskGate.allowed || planQualityBlockedBy.length > 0) {
    const blockedBy = [
      ...location.riskFlags,
      ...input.trendContext.riskGate.blockedBy,
      ...planQualityBlockedBy,
    ];
    const hardBlockers = [...new Set(blockedBy)].filter((blocker) => !isWaitEntryOnlyBlocker(blocker));
    const hasValidWaitEntry = location.waitEntryPrice !== null &&
      location.waitEntryPrice !== undefined &&
      location.waitEntryRewardRisk !== null &&
      location.waitEntryRewardRisk !== undefined &&
      location.waitEntryRewardRisk >= Math.max(minimumPlanRewardRisk, location.minRewardRisk);

    if (hasValidWaitEntry && hardBlockers.length === 0) {
      return basePlan({
        blockedBy: [...new Set(blockedBy)],
        currentPrice: input.currentPrice,
        direction,
        isPlanEligible: false,
        status: waitStatus(direction),
        summary: direction === "long"
          ? `v3 计划草案：当前位置不追多，等待回踩到 ${priceLabel(location.waitEntryPrice ?? null)} 附近，RR 重新达到 ${priceLabel(location.waitEntryRewardRisk ?? null)}:1 后再人工复核。`
          : `v3 计划草案：当前位置不追空，等待反抽到 ${priceLabel(location.waitEntryPrice ?? null)} 附近，RR 重新达到 ${priceLabel(location.waitEntryRewardRisk ?? null)}:1 后再人工复核。`,
        trendContext: input.trendContext,
        waitEntryPrice: location.waitEntryPrice,
        waitEntryRewardRisk: location.waitEntryRewardRisk,
      });
    }

    return basePlan({
      blockedBy,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "BLOCKED",
      summary: "v3 计划草案：位置/RR 或 Risk Gate 未通过，不能生成可执行草案。",
      trendContext: input.trendContext,
    });
  }

  if (
    input.trendContext.state === "RANGE_IDLE" ||
    input.trendContext.state === "RANGE_COMPRESSION"
  ) {
    return basePlan({
      blockedBy: ["structure_confirmation_pending"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: waitStatus(direction),
      summary: direction === "long"
        ? "v3 计划草案：RR 合格，但结构还未确认，等待突破或回踩承接后再进入人工复核。"
        : "v3 计划草案：RR 合格，但结构还未确认，等待跌破或反抽承压后再进入人工复核。",
      trendContext: input.trendContext,
    });
  }

  if (reaction.status !== "CONFIRMED") {
    return basePlan({
      blockedBy: reaction.riskFlags.length > 0 ? reaction.riskFlags : ["reaction_not_confirmed"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: waitStatus(direction),
      summary: direction === "long"
        ? "v3 计划草案：等待回踩承接确认，暂不生成多头执行草案。"
        : "v3 计划草案：等待反抽承压确认，暂不生成空头执行草案。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status !== "HEALTHY_TREND") {
    return basePlan({
      blockedBy: integrity.riskFlags.length > 0 ? integrity.riskFlags : ["trend_integrity_not_healthy"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：趋势完整度未达到健康状态，只观察。",
      trendContext: input.trendContext,
    });
  }

  return basePlan({
    blockedBy: [],
    currentPrice: input.currentPrice,
    direction,
    isPlanEligible: true,
    status: direction === "short" ? "READY_SHORT" : "READY_LONG",
    summary: `v3 只读${directionLabel(direction)}计划草案：结构、位置/RR、回踩/反抽、趋势完整度和 Risk Gate 均通过；仍需人工确认，不自动下单。`,
    trendContext: input.trendContext,
  });
}
