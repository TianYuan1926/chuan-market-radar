import type { MarketSignal } from "@/lib/analysis/types";
import type { UniverseRegistry, UniverseScanPlan } from "./universe-registry";
import type {
  DerivativeSnapshot,
  MarketTicker,
  ScanPromotionBridgeSample,
  ScanCoverage,
  ScanStatePoolAssetSample,
  ScanStatePoolCounts,
  ScanStatePoolKey,
  ScanStatePoolLane,
  ScanStatePoolReason,
  ScanStatePoolReport,
  ScanTierKey,
  VenueCoverageQuality,
} from "./types";

export type BuildScanStatePoolReportOptions = {
  batchPlan: UniverseScanPlan;
  derivatives?: DerivativeSnapshot[];
  registry: UniverseRegistry;
  signals?: MarketSignal[];
  tickers?: MarketTicker[];
};

const stateOrder: ScanStatePoolKey[] = [
  "BATTLE_READY",
  "BATTLE_WATCH",
  "CANDIDATE",
  "DEEP_QUEUE",
  "HOT",
  "REVIVE_WATCH",
  "WARM",
  "COLD",
  "COOLDOWN",
];

const laneLabels: Record<ScanStatePoolKey, string> = {
  BATTLE_READY: "作战准备",
  BATTLE_WATCH: "作战观察",
  CANDIDATE: "候选池",
  COLD: "冷池",
  COOLDOWN: "冷却池",
  DEEP_QUEUE: "深扫队列",
  HOT: "热池",
  REVIVE_WATCH: "复活观察",
  WARM: "温池",
};

const laneCadenceHints: Record<ScanStatePoolKey, string> = {
  BATTLE_READY: "每轮复核",
  BATTLE_WATCH: "高频跟踪",
  CANDIDATE: "进入预筛",
  COLD: "低频轻扫",
  COOLDOWN: "等待降温",
  DEEP_QUEUE: "本轮深扫",
  HOT: "优先插队",
  REVIVE_WATCH: "复盘复活",
  WARM: "中频轮转",
};

const laneOperatorHints: Record<ScanStatePoolKey, string> = {
  BATTLE_READY: "接近完整计划，但仍必须经过 RR、风险门和失效条件。",
  BATTLE_WATCH: "方向或位置仍差确认，不允许提前抢跑。",
  CANDIDATE: "已有候选证据，等待结构、位置和资金质量继续确认。",
  COLD: "未删除，只是降频轻扫，保留冷门探索入口。",
  COOLDOWN: "过热、风险高或结构失效，等待降温、回踩或反抽修复。",
  DEEP_QUEUE: "本轮已经消耗 CoinGlass 名额，需要把结果转成证据或降频。",
  HOT: "出现明显价格/量能/OI 异动，优先观察但不等于可追。",
  REVIVE_WATCH: "来自复盘、历史或近期信号的漏网复查，不自动调权。",
  WARM: "有流动性、覆盖或优先级迹象，继续中频轮转。",
};

function emptyCounts(): ScanStatePoolCounts {
  return {
    BATTLE_READY: 0,
    BATTLE_WATCH: 0,
    CANDIDATE: 0,
    COLD: 0,
    COOLDOWN: 0,
    DEEP_QUEUE: 0,
    HOT: 0,
    REVIVE_WATCH: 0,
    WARM: 0,
  };
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace("/", "").replace("-", "");
}

function symbolFromBaseAsset(baseAsset: string) {
  return `${baseAsset.toUpperCase()}USDT`;
}

function hasReviewPriority(reasons: string[]) {
  return reasons.includes("history") || reasons.includes("recent_signal");
}

function appendReason(
  reasons: ScanStatePoolReason[],
  reason: ScanStatePoolReason,
) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function signalDrivenState(signal: MarketSignal, reasons: ScanStatePoolReason[]): ScanStatePoolKey {
  if (
    signal.state === "invalidated" ||
    signal.risk === "blocked" ||
    signal.risk === "high" ||
    signal.strategy.noChase
  ) {
    appendReason(reasons, "cooldown_risk");

    return "COOLDOWN";
  }

  if (signal.state === "triggered" || signal.state === "near_trigger") {
    appendReason(reasons, "battle_ready");

    return "BATTLE_READY";
  }

  if (signal.state === "waiting_confirmation") {
    appendReason(reasons, "battle_watch");

    return "BATTLE_WATCH";
  }

  if (signal.state === "abnormal_watch" || signal.state === "normal_watch") {
    appendReason(reasons, "signal_candidate");

    return "CANDIDATE";
  }

  appendReason(reasons, "tier_rotation");

  return "DEEP_QUEUE";
}

function compactBlocker(value: string) {
  return value.replaceAll("_", " ");
}

function hasV3ConflictOrInvalidation(signal: MarketSignal) {
  const trendContext = signal.strategyV3?.trendContext;

  return (
    trendContext?.state === "CONFLICT" ||
    trendContext?.state === "INVALIDATED" ||
    trendContext?.decision === "CONFLICT_WAIT" ||
    trendContext?.decision === "INVALIDATED" ||
    (trendContext?.conflicts.length ?? 0) > 0
  );
}

function hasBattleReadyV3(signal: MarketSignal) {
  const decision = signal.strategyV3?.trendContext?.decision;

  return (
    signal.strategyV3?.tradePlan?.isPlanEligible === true ||
    decision === "LONG_PLAN" ||
    decision === "SHORT_PLAN"
  );
}

function hasBattleWatchV3(signal: MarketSignal) {
  const decision = signal.strategyV3?.trendContext?.decision;

  return (
    decision === "PREPARE_LONG" ||
    decision === "PREPARE_SHORT" ||
    decision === "WAIT_LONG_BREAKOUT" ||
    decision === "WAIT_LONG_PULLBACK" ||
    decision === "WAIT_SHORT_BREAKDOWN" ||
    decision === "WAIT_SHORT_RETEST"
  );
}

function bridgeSummary({
  blockers,
  drivers,
  signal,
  suggestedState,
}: {
  blockers: string[];
  drivers: string[];
  signal: MarketSignal;
  suggestedState: ScanStatePoolKey;
}) {
  const primaryDriver = drivers[0] ?? "已有扫描信号";
  const primaryBlocker = blockers[0];

  if (suggestedState === "COOLDOWN") {
    return `${signal.symbol} 进入冷却：${primaryBlocker ?? "v2/v3 风控或结构证据不足"}。`;
  }

  if (suggestedState === "BATTLE_READY") {
    return `${signal.symbol} 可进入作战准备：${primaryDriver}，但仍只读解释，不改 live ranking。`;
  }

  if (suggestedState === "BATTLE_WATCH") {
    return `${signal.symbol} 保持作战观察：${primaryDriver}，等待结构确认或回踩。`;
  }

  return `${signal.symbol} 保持候选观察：${primaryDriver}。`;
}

function buildPromotionBridgeSample({
  baseAsset,
  currentState,
  signal,
}: {
  baseAsset: string;
  currentState: ScanStatePoolKey;
  signal: MarketSignal;
}): ScanPromotionBridgeSample | undefined {
  if (!signal.strategyV2 && !signal.strategyV3) {
    return undefined;
  }

  const blockers: string[] = [];
  const drivers: string[] = [];
  const v2 = signal.strategyV2;
  const v3 = signal.strategyV3;
  const v3RiskGate = v3?.trendContext?.riskGate;
  const rewardRisk = v3?.tradePlan?.rewardRisk ?? signal.strategy.riskReward ?? null;

  if (v2) {
    drivers.push(`v2 ${v2.stage}/${v2.decision}`);

    if (!v2.riskGate.allowed) {
      blockers.push(`v2门控: ${v2.riskGate.blockedBy.map(compactBlocker).join(" / ")}`);
    }
  }

  if (v3?.trendContext) {
    drivers.push(`v3 ${v3.trendContext.state}/${v3.trendContext.decision}`);

    if (!v3.trendContext.riskGate.allowed) {
      blockers.push(`v3门控: ${v3.trendContext.riskGate.blockedBy.slice(0, 3).join(" / ")}`);
    }

    if (v3.trendContext.noParticipationReasons.length > 0) {
      blockers.push(`v3不参与: ${v3.trendContext.noParticipationReasons.slice(0, 2).join(" / ")}`);
    }
  }

  if (rewardRisk !== null && rewardRisk > 0 && rewardRisk < 3) {
    blockers.push(`赔率不足: ${rewardRisk.toFixed(2)}R < 3R`);
  }

  if (signal.strategy.noChase || signal.risk === "high" || signal.risk === "blocked") {
    blockers.push(signal.strategy.noChase ? "现有策略禁止追单" : `旧引擎风险: ${signal.risk}`);
  }

  if (hasV3ConflictOrInvalidation(signal) || signal.state === "invalidated") {
    blockers.push("周期冲突或结构失效");
  }

  const riskGateAllowed = (v2?.riskGate.allowed ?? true) && (v3RiskGate?.allowed ?? true);
  const suggestedState: ScanStatePoolKey = blockers.length > 0
    ? "COOLDOWN"
    : hasBattleReadyV3(signal) && riskGateAllowed
      ? "BATTLE_READY"
      : hasBattleWatchV3(signal) || signal.state === "waiting_confirmation" || signal.state === "near_trigger"
        ? "BATTLE_WATCH"
        : currentState === "BATTLE_READY" || currentState === "BATTLE_WATCH"
          ? currentState
          : "CANDIDATE";

  return {
    allowedUse: "scan_explanation_only",
    baseAsset,
    blockers,
    canMutateLiveRanking: false,
    currentState,
    drivers,
    rewardRisk,
    summary: bridgeSummary({
      blockers,
      drivers,
      signal,
      suggestedState,
    }),
    suggestedState,
    symbol: signal.symbol,
    v2: v2
      ? {
        decision: v2.decision,
        riskGateAllowed: v2.riskGate.allowed,
        stage: v2.stage,
      }
      : undefined,
    v3: v3?.trendContext
      ? {
        decision: v3.trendContext.decision,
        riskGateAllowed: v3.trendContext.riskGate.allowed,
        state: v3.trendContext.state,
      }
      : undefined,
  };
}

function marketActivityState({
  derivative,
  dynamicReasons,
  isSelected,
  reasons,
  ticker,
  tier,
}: {
  derivative?: DerivativeSnapshot;
  dynamicReasons: string[];
  isSelected: boolean;
  reasons: ScanStatePoolReason[];
  ticker?: MarketTicker;
  tier: ScanTierKey;
}): ScanStatePoolKey {
  const change = Math.abs(ticker?.changePercent24h ?? 0);
  const oiChange = Math.abs(derivative?.openInterestChangePercent ?? 0);

  if (hasReviewPriority(dynamicReasons)) {
    appendReason(reasons, "recent_or_historical_review");

    return "REVIVE_WATCH";
  }

  if (change >= 4) {
    appendReason(reasons, "volume_price_anomaly");

    return "HOT";
  }

  if (oiChange >= 12) {
    appendReason(reasons, "derivative_activity");

    return "HOT";
  }

  if (isSelected) {
    appendReason(reasons, "tier_rotation");

    return "DEEP_QUEUE";
  }

  if (tier === "core" || tier === "active" || dynamicReasons.length > 0) {
    appendReason(reasons, dynamicReasons.length > 0 ? "dynamic_priority" : "light_scan_pending");

    return "WARM";
  }

  appendReason(reasons, "cold_exploration");

  return "COLD";
}

function nextActionForState(state: ScanStatePoolKey) {
  return {
    BATTLE_READY: "检查入场、止损、目标和失效条件",
    BATTLE_WATCH: "等待突破、回踩或反抽确认",
    CANDIDATE: "补结构、位置和资金质量证据",
    COLD: "保留低频轻扫和冷门探索",
    COOLDOWN: "等待降温或结构修复",
    DEEP_QUEUE: "把本轮深扫结果转成证据",
    HOT: "观察是否有结构确认，禁止直接追",
    REVIVE_WATCH: "用复盘样本验证是否漏判",
    WARM: "继续轮转，出现多入口证据再晋级",
  }[state];
}

function buildLane(
  id: ScanStatePoolKey,
  samples: ScanStatePoolAssetSample[],
): ScanStatePoolLane {
  const stateSamples = samples.filter((sample) => sample.state === id);

  return {
    cadenceHint: laneCadenceHints[id],
    count: stateSamples.length,
    id,
    label: laneLabels[id],
    operatorHint: laneOperatorHints[id],
    queued: stateSamples.filter((sample) => !sample.selectedThisRound).length,
    samples: stateSamples.slice(0, 6).map((sample) => sample.baseAsset),
    selected: stateSamples.filter((sample) => sample.selectedThisRound).length,
  };
}

function fallbackLane(
  id: ScanStatePoolKey,
  count: number,
  selected = 0,
  samples: string[] = [],
): ScanStatePoolLane {
  return {
    cadenceHint: laneCadenceHints[id],
    count,
    id,
    label: laneLabels[id],
    operatorHint: laneOperatorHints[id],
    queued: Math.max(0, count - selected),
    samples,
    selected,
  };
}

function buildDeepScanProof(
  batchPlan: UniverseScanPlan,
  samples: ScanStatePoolAssetSample[],
): ScanStatePoolReport["deepScan"] {
  const selectedSamples = samples.filter((sample) => sample.selectedThisRound);
  const selectedAssets = selectedSamples.map((sample) => sample.baseAsset);
  const queuedAssets = samples
    .filter((sample) =>
      !sample.selectedThisRound &&
      (sample.state === "BATTLE_READY" ||
        sample.state === "BATTLE_WATCH" ||
        sample.state === "CANDIDATE" ||
        sample.state === "HOT" ||
        sample.state === "REVIVE_WATCH")
    )
    .map((sample) => sample.baseAsset)
    .slice(0, 12);

  return {
    anchorSlots: batchPlan.anchorAssets.length,
    battleSlots: selectedSamples.filter((sample) =>
      sample.state === "BATTLE_READY" || sample.state === "BATTLE_WATCH"
    ).length,
    capacity: batchPlan.requestsPlanned,
    explorationSlots: selectedSamples.filter((sample) =>
      sample.state === "COLD" || sample.tier === "long_tail"
    ).length,
    guardrail: "深扫名额只来自本轮 batchPlan，不因状态池展示增加 CoinGlass 请求。",
    hotSlots: selectedSamples.filter((sample) => sample.state === "HOT").length,
    queuedAssets,
    reviveSlots: selectedSamples.filter((sample) => sample.state === "REVIVE_WATCH").length,
    selectedAssets,
  };
}

export function buildScanStatePoolReport({
  batchPlan,
  derivatives = [],
  registry,
  signals = [],
  tickers = [],
}: BuildScanStatePoolReportOptions): ScanStatePoolReport {
  const selectedBaseAssets = new Set(batchPlan.assets.map((asset) => asset.toUpperCase()));
  const tickerBySymbol = new Map(tickers.map((ticker) => [normalizeSymbol(ticker.symbol), ticker]));
  const derivativeBySymbol = new Map(derivatives.map((derivative) => [normalizeSymbol(derivative.symbol), derivative]));
  const signalBySymbol = new Map(signals.map((signal) => [normalizeSymbol(signal.symbol), signal]));
  const dynamicCandidateBySymbol = new Map(
    batchPlan.dynamicPriority.candidates.map((candidate) => [normalizeSymbol(candidate.symbol), candidate]),
  );
  const counts = emptyCounts();
  const samples: ScanStatePoolAssetSample[] = [];

  for (const asset of registry.assets) {
    const symbol = normalizeSymbol(asset.symbol);
    const isSelected = selectedBaseAssets.has(asset.baseAsset);
    const signal = signalBySymbol.get(symbol);
    const ticker = tickerBySymbol.get(symbol);
    const derivative = derivativeBySymbol.get(symbol);
    const dynamicCandidate = dynamicCandidateBySymbol.get(symbol);
    const reasons: ScanStatePoolReason[] = [];

    if (asset.isAnchor) {
      appendReason(reasons, "anchor_market_context");
    }

    if (isSelected) {
      appendReason(reasons, "tier_rotation");
    } else {
      appendReason(reasons, "light_scan_pending");
    }

    if (dynamicCandidate && dynamicCandidate.reasons.length > 0) {
      appendReason(reasons, "dynamic_priority");
    }

    const state = signal
      ? signalDrivenState(signal, reasons)
      : marketActivityState({
          derivative,
          dynamicReasons: dynamicCandidate?.reasons ?? [],
          isSelected,
          reasons,
          ticker,
          tier: asset.tier,
        });
    const promotionBridge = signal
      ? buildPromotionBridgeSample({
        baseAsset: asset.baseAsset,
        currentState: state,
        signal,
      })
      : undefined;

    counts[state] += 1;

    samples.push({
      baseAsset: asset.baseAsset,
      cadenceHint: laneCadenceHints[state],
      nextAction: nextActionForState(state),
      promotionBridge,
      reasons,
      scannedThisRound: Boolean(ticker || signal || isSelected),
      selectedThisRound: isSelected,
      state,
      symbol,
      tier: asset.tier,
      venueCoverage: asset.venueCoverage,
    });
  }

  const coldExplorationAssets = samples
    .filter((sample) => sample.selectedThisRound && (sample.state === "COLD" || sample.tier === "long_tail"))
    .map((sample) => sample.baseAsset)
    .slice(0, 8);
  const reviveWatchAssets = samples
    .filter((sample) => sample.state === "REVIVE_WATCH")
    .map((sample) => sample.baseAsset)
    .slice(0, 8);
  const sortedSamples = [...samples].sort((left, right) =>
    stateOrder.indexOf(left.state) - stateOrder.indexOf(right.state) ||
    Number(right.selectedThisRound) - Number(left.selectedThisRound) ||
    left.baseAsset.localeCompare(right.baseAsset)
  );
  const promotionSamples = samples
    .map((sample) => sample.promotionBridge)
    .filter((sample): sample is ScanPromotionBridgeSample => sample !== undefined)
    .sort((left, right) =>
      stateOrder.indexOf(left.suggestedState) - stateOrder.indexOf(right.suggestedState) ||
      Number(right.rewardRisk ?? 0) - Number(left.rewardRisk ?? 0) ||
      left.baseAsset.localeCompare(right.baseAsset)
    );

  return {
    assetSamples: sortedSamples.slice(0, 80),
    counts,
    deepScan: buildDeepScanProof(batchPlan, samples),
    guardrail: "状态池只调整优先级、扫描频率、复查顺序和展示解释；不能永久删除可交易标的，也不能绕过 Risk Gate。",
    lanes: stateOrder.map((state) => buildLane(state, samples)),
    mode: "state_pool_mvp",
    omittedAssetCount: Math.max(0, sortedSamples.length - 80),
    proof: {
      coldExplorationAssets,
      nextBatchAssets: batchPlan.pendingAssets.slice(0, 10),
      notEliminatedAssets: registry.assets.length,
      notes: [
        "前置层不是硬漏斗，未进入深扫的资产保留在 COLD/WARM/REVIVE_WATCH 等状态池。",
        "BATTLE_READY 仍需 RR、失效条件、RiskScore 和证据冲突检查。",
        "DEEP_QUEUE 容量来自 COINGLASS_BATCH_SIZE 与预算，不由前端展示扩张。",
      ],
      pendingAssets: batchPlan.pendingAssets.slice(0, 10),
      reviveWatchAssets,
      scannedAssets: batchPlan.assets,
      universeAssets: registry.assets.length,
    },
    promotionBridge: {
      guardrail: "晋级桥只读取 v2/v3 已有结论生成解释，不新增交易信号、不改实时排序、不绕过 Risk Gate。",
      samples: promotionSamples.slice(0, 8),
      summary: {
        blockedByRisk: promotionSamples.filter((sample) => sample.blockers.some((blocker) => /门控|风险|追单/u.test(blocker))).length,
        conflictOrInvalidated: promotionSamples.filter((sample) => sample.blockers.some((blocker) => /冲突|失效/u.test(blocker))).length,
        eligibleForBattle: promotionSamples.filter((sample) => sample.suggestedState === "BATTLE_READY").length,
        readonlySignals: promotionSamples.length,
        rewardRiskBlocked: promotionSamples.filter((sample) => sample.blockers.some((blocker) => /赔率不足/u.test(blocker))).length,
      },
    },
  };
}

export function buildFallbackScanStatePoolReport(coverage: ScanCoverage): ScanStatePoolReport {
  const counts = emptyCounts();

  counts.DEEP_QUEUE = coverage.scanned;
  counts.COLD = coverage.pending;

  const deepQueueSamples = coverage.scannedAssets.slice(0, 8);
  const coldSamples = coverage.pendingAssets.slice(0, 8);

  return {
    assetSamples: [
      ...deepQueueSamples.map((baseAsset) => ({
        baseAsset,
        cadenceHint: laneCadenceHints.DEEP_QUEUE,
        nextAction: nextActionForState("DEEP_QUEUE"),
        reasons: ["tier_rotation"] as ScanStatePoolReason[],
        scannedThisRound: true,
        selectedThisRound: true,
        state: "DEEP_QUEUE" as const,
        symbol: symbolFromBaseAsset(baseAsset),
      })),
      ...coldSamples.map((baseAsset) => ({
        baseAsset,
        cadenceHint: laneCadenceHints.COLD,
        nextAction: nextActionForState("COLD"),
        reasons: ["light_scan_pending"] as ScanStatePoolReason[],
        scannedThisRound: false,
        selectedThisRound: false,
        state: "COLD" as const,
        symbol: symbolFromBaseAsset(baseAsset),
      })),
    ],
    counts,
    deepScan: {
      anchorSlots: 0,
      battleSlots: 0,
      capacity: coverage.scanned,
      explorationSlots: 0,
      guardrail: "缺少状态池 metadata 时，只从 coverage 构造降级证明，不增加请求。",
      hotSlots: 0,
      queuedAssets: coldSamples,
      reviveSlots: 0,
      selectedAssets: deepQueueSamples,
    },
    guardrail: "状态池降级报告只解释 coverage，不做交易判断。",
    lanes: [
      fallbackLane("DEEP_QUEUE", coverage.scanned, coverage.scanned, deepQueueSamples),
      fallbackLane("COLD", coverage.pending, 0, coldSamples),
      ...stateOrder
        .filter((state) => state !== "DEEP_QUEUE" && state !== "COLD")
        .map((state) => fallbackLane(state, 0)),
    ],
    mode: "state_pool_mvp",
    omittedAssetCount: 0,
    proof: {
      coldExplorationAssets: [],
      nextBatchAssets: coldSamples,
      notEliminatedAssets: coverage.eligible,
      notes: ["当前使用 coverage 降级状态池；下一次真实扫描会写入完整 statePool metadata。"],
      pendingAssets: coldSamples,
      reviveWatchAssets: [],
      scannedAssets: deepQueueSamples,
      universeAssets: coverage.eligible,
    },
    promotionBridge: {
      guardrail: "降级状态池没有 v2/v3 晋级桥样本；下一次真实扫描会从信号证据重建。",
      samples: [],
      summary: {
        blockedByRisk: 0,
        conflictOrInvalidated: 0,
        eligibleForBattle: 0,
        readonlySignals: 0,
        rewardRiskBlocked: 0,
      },
    },
  };
}

export function statePoolLabel(state: ScanStatePoolKey) {
  return laneLabels[state];
}

export function statePoolCadenceHint(state: ScanStatePoolKey) {
  return laneCadenceHints[state];
}

export function statePoolVenueLabel(value?: VenueCoverageQuality) {
  return {
    major_three: "三所",
    multi_exchange: "多所",
    single_exchange: "单所",
    unlisted: "待确认",
  }[value ?? "unlisted"];
}
