import type { SignalState } from "@/lib/analysis/types";

import type { ExchangeId, MarketDataSource } from "./types";

export type DailyMoverDirection = "gainer" | "loser";

export type DailyMover = {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  direction: DailyMoverDirection;
  rank: number;
  observedAt: string;
  priceChangePercent: number;
  volume24hUsd: number;
  openInterestChangePercent?: number;
  fundingRate?: number;
  liquidationUsd24h?: number;
  eventTags?: string[];
};

export type PreMoveWindow = {
  window: "1h" | "3h" | "4h" | "6h" | "12h" | "24h" | "3d";
  startedAt: string;
  endedAt: string;
  priceChangePercent: number;
  volumeChangePercent?: number;
  openInterestChangePercent?: number;
  fundingRate?: number;
  radarSignalIds: string[];
};

export type RadarSignalSnapshot = {
  id: string;
  symbol: string;
  state: SignalState;
  confidence: number;
  updatedAt: string;
};

export type MoverDriver =
  | "volume_expansion"
  | "open_interest_expansion"
  | "funding_pressure"
  | "pre_move_drift"
  | "low_liquidity_or_one_off";

export type MoverAttribution = {
  primaryDrivers: MoverDriver[];
  evidenceStrength: "weak" | "medium" | "strong";
  learnability: "learnable" | "watchlist" | "not_learnable";
};

export type RadarMoverReview = {
  status: "caught" | "missed" | "not_learnable";
  matchedSignalIds: string[];
  improvementTags: string[];
};

export type PreMovePatternType =
  | "early_drift_before_move"
  | "funding_crowding_before_move"
  | "no_reliable_premark"
  | "quiet_accumulation_before_move"
  | "volume_oi_build_up";

export type DailyMoverPreMovePattern = {
  bestWindow: PreMoveWindow["window"] | null;
  clues: string[];
  earlyWarningScore: number;
  missedBecause: string[];
  type: PreMovePatternType;
};

export type DailyMoverReview = {
  id: string;
  symbol: string;
  direction: DailyMoverDirection;
  observedAt: string;
  allowedUse: "research_only";
  guardrail: string;
  attribution: MoverAttribution;
  preMovePattern?: DailyMoverPreMovePattern;
  radarReview: RadarMoverReview;
};

export type DailyMoverSnapshot = {
  id: string;
  source: MarketDataSource;
  observedAt: string;
  gainers: DailyMover[];
  losers: DailyMover[];
  reviews: DailyMoverReview[];
};

export type DailyMoverReviewInput = {
  mover: DailyMover;
  preMoveWindows: PreMoveWindow[];
  radarSignals: RadarSignalSnapshot[];
};

const minStudyVolumeUsd = 5_000_000;

function absoluteMax(values: Array<number | undefined>) {
  return Math.max(0, ...values.map((value) => Math.abs(value ?? 0)));
}

function hasOneOffEvent(tags: string[] = []) {
  return tags.some((tag) => (
    tag === "low_liquidity"
    || tag === "single_venue_spike"
    || tag === "news_shock"
    || tag === "listing_event"
  ));
}

function isLowLiquidityOrOneOff(mover: DailyMover) {
  return mover.volume24hUsd < minStudyVolumeUsd || hasOneOffEvent(mover.eventTags);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function matchedRadarSignalIds(
  preMoveWindows: PreMoveWindow[],
  radarSignals: RadarSignalSnapshot[],
  symbol: string,
) {
  const knownSignalIds = new Set(
    radarSignals
      .filter((signal) => signal.symbol === symbol)
      .map((signal) => signal.id),
  );

  return unique(
    preMoveWindows.flatMap((window) => (
      window.radarSignalIds.filter((id) => knownSignalIds.has(id))
    )),
  );
}

function attributionDrivers(mover: DailyMover, preMoveWindows: PreMoveWindow[]): MoverDriver[] {
  if (isLowLiquidityOrOneOff(mover)) {
    return ["low_liquidity_or_one_off"];
  }

  const drivers: MoverDriver[] = [];
  const maxVolumeChange = absoluteMax(preMoveWindows.map((window) => window.volumeChangePercent));
  const maxOpenInterestChange = absoluteMax([
    mover.openInterestChangePercent,
    ...preMoveWindows.map((window) => window.openInterestChangePercent),
  ]);
  const maxFunding = absoluteMax([
    mover.fundingRate,
    ...preMoveWindows.map((window) => window.fundingRate),
  ]);
  const maxPreMoveDrift = absoluteMax(preMoveWindows.map((window) => window.priceChangePercent));

  if (maxVolumeChange >= 100) {
    drivers.push("volume_expansion");
  }

  if (maxOpenInterestChange >= 15) {
    drivers.push("open_interest_expansion");
  }

  if (maxFunding >= 0.0005) {
    drivers.push("funding_pressure");
  }

  if (maxPreMoveDrift >= 5) {
    drivers.push("pre_move_drift");
  }

  return drivers.length > 0 ? unique(drivers) : ["pre_move_drift"];
}

function evidenceStrength(mover: DailyMover, drivers: MoverDriver[]): MoverAttribution["evidenceStrength"] {
  if (drivers.includes("low_liquidity_or_one_off")) {
    return "weak";
  }

  if (drivers.length >= 2 && mover.volume24hUsd >= 20_000_000) {
    return "strong";
  }

  return drivers.length > 0 ? "medium" : "weak";
}

function learnability(
  mover: DailyMover,
  strength: MoverAttribution["evidenceStrength"],
): MoverAttribution["learnability"] {
  if (isLowLiquidityOrOneOff(mover)) {
    return "not_learnable";
  }

  return strength === "strong" ? "learnable" : "watchlist";
}

function preMoveWindowScore(window: PreMoveWindow) {
  const volumeChange = Math.abs(window.volumeChangePercent ?? 0);
  const openInterestChange = Math.abs(window.openInterestChangePercent ?? 0);
  const funding = Math.abs(window.fundingRate ?? 0);
  const drift = Math.abs(window.priceChangePercent);

  let score = 0;

  if (volumeChange >= 150) {
    score += 30;
  } else if (volumeChange >= 100) {
    score += 24;
  } else if (volumeChange >= 50) {
    score += 14;
  } else if (volumeChange >= 25) {
    score += 7;
  }

  if (openInterestChange >= 25) {
    score += 24;
  } else if (openInterestChange >= 15) {
    score += 18;
  } else if (openInterestChange >= 8) {
    score += 10;
  }

  if (funding >= 0.001) {
    score += 12;
  } else if (funding >= 0.0005) {
    score += 8;
  }

  if (drift >= 1.5 && drift <= 8) {
    score += 16;
  } else if (drift > 8 && drift <= 12) {
    score += 6;
  } else if (drift > 12) {
    score -= 15;
  }

  if (window.radarSignalIds.length > 0) {
    score += 18;
  }

  return clampScore(score);
}

function bestPreMoveWindow(preMoveWindows: PreMoveWindow[]) {
  return [...preMoveWindows].sort((first, second) => (
    preMoveWindowScore(second) - preMoveWindowScore(first)
  ))[0];
}

function preMoveClues(window: PreMoveWindow | undefined, matchedSignalIds: string[]) {
  if (!window) {
    return [];
  }

  const clues: string[] = [];
  const volumeChange = Math.abs(window.volumeChangePercent ?? 0);
  const openInterestChange = Math.abs(window.openInterestChangePercent ?? 0);
  const funding = Math.abs(window.fundingRate ?? 0);
  const drift = Math.abs(window.priceChangePercent);

  if (volumeChange >= 50) {
    clues.push(`${window.window} 成交量提前放大 ${volumeChange.toFixed(1)}%`);
  }

  if (openInterestChange >= 8) {
    clues.push(`${window.window} OI 提前变化 ${openInterestChange.toFixed(1)}%`);
  }

  if (funding >= 0.0005) {
    clues.push(`${window.window} Funding 已出现拥挤倾向`);
  }

  if (drift >= 1.5 && drift <= 8) {
    clues.push(`${window.window} 价格已有可学习的启动前漂移`);
  }

  if (matchedSignalIds.length > 0) {
    clues.push("雷达在启动前窗口留下过匹配信号");
  } else if (window.radarSignalIds.length === 0) {
    clues.push("启动前窗口没有关联雷达信号");
  }

  return clues;
}

function preMovePatternType(window: PreMoveWindow | undefined, score: number): PreMovePatternType {
  if (!window) {
    return "no_reliable_premark";
  }

  const volumeChange = Math.abs(window.volumeChangePercent ?? 0);
  const openInterestChange = Math.abs(window.openInterestChangePercent ?? 0);
  const funding = Math.abs(window.fundingRate ?? 0);
  const drift = Math.abs(window.priceChangePercent);

  if (score < 25 && !(drift >= 1.5 && drift <= 8)) {
    return "no_reliable_premark";
  }

  if (drift <= 3 && volumeChange >= 50 && openInterestChange >= 8) {
    return "quiet_accumulation_before_move";
  }

  if (volumeChange >= 50 || openInterestChange >= 15) {
    return "volume_oi_build_up";
  }

  if (funding >= 0.0005) {
    return "funding_crowding_before_move";
  }

  if (drift >= 1.5 && drift <= 8) {
    return "early_drift_before_move";
  }

  return "no_reliable_premark";
}

function preMoveMissedBecause(
  window: PreMoveWindow | undefined,
  score: number,
  matchedSignalIds: string[],
) {
  if (!window || matchedSignalIds.length > 0 || score < 25) {
    return [];
  }

  const reasons: string[] = [];
  const volumeChange = Math.abs(window.volumeChangePercent ?? 0);
  const openInterestChange = Math.abs(window.openInterestChangePercent ?? 0);
  const drift = Math.abs(window.priceChangePercent);

  if (score >= 55) {
    reasons.push("启动前窗口已有较强征兆，但雷达没有留下成熟信号，需复核轻扫到深扫的晋级条件。");
  }

  if (volumeChange >= 50 || openInterestChange >= 8) {
    reasons.push("成交量或 OI 提前变化没有获得足够排序权重，需复核候选池优先级。");
  }

  if (window.radarSignalIds.length === 0) {
    reasons.push("窗口内没有关联 radarSignalId，需复核全市场覆盖、信号持久化和轮换公平性。");
  }

  if (drift > 8) {
    reasons.push("价格在复盘窗口内已经明显先动，需检查提醒是否过晚。");
  }

  return unique(reasons);
}

function buildPreMovePattern(
  mover: DailyMover,
  preMoveWindows: PreMoveWindow[],
  matchedSignalIds: string[],
): DailyMoverPreMovePattern {
  if (isLowLiquidityOrOneOff(mover)) {
    return {
      bestWindow: null,
      clues: ["低流动性或单点事件样本，不纳入可学习启动前征兆。"],
      earlyWarningScore: 0,
      missedBecause: [],
      type: "no_reliable_premark",
    };
  }

  const bestWindow = bestPreMoveWindow(preMoveWindows);
  const score = bestWindow ? preMoveWindowScore(bestWindow) : 0;
  const type = preMovePatternType(bestWindow, score);

  return {
    bestWindow: type === "no_reliable_premark" ? null : bestWindow?.window ?? null,
    clues: preMoveClues(bestWindow, matchedSignalIds),
    earlyWarningScore: score,
    missedBecause: preMoveMissedBecause(bestWindow, score, matchedSignalIds),
    type,
  };
}

function improvementTags(
  mover: DailyMover,
  drivers: MoverDriver[],
  matchedSignalIds: string[],
  learnabilityValue: MoverAttribution["learnability"],
  preMovePattern: DailyMoverPreMovePattern,
) {
  if (matchedSignalIds.length > 0 || learnabilityValue === "not_learnable") {
    return [];
  }

  const tags: string[] = [];

  if (drivers.includes("volume_expansion") || drivers.includes("open_interest_expansion")) {
    tags.push("review_volume_oi_weight");
  }

  if (preMovePattern.earlyWarningScore >= 50) {
    tags.push("review_pre_move_window_weight");
  }

  if (mover.direction === "loser") {
    tags.push("review_short_side_detection");
  }

  if (tags.length === 0) {
    tags.push("review_universe_coverage");
  }

  return tags;
}

export function buildDailyMoverReview({
  mover,
  preMoveWindows,
  radarSignals,
}: DailyMoverReviewInput): DailyMoverReview {
  const drivers = attributionDrivers(mover, preMoveWindows);
  const strength = evidenceStrength(mover, drivers);
  const learnabilityValue = learnability(mover, strength);
  const matchedSignalIds = matchedRadarSignalIds(preMoveWindows, radarSignals, mover.symbol);
  const preMovePattern = buildPreMovePattern(mover, preMoveWindows, matchedSignalIds);
  const radarStatus = learnabilityValue === "not_learnable"
    ? "not_learnable"
    : matchedSignalIds.length > 0
      ? "caught"
      : "missed";

  return {
    id: mover.id,
    symbol: mover.symbol,
    direction: mover.direction,
    observedAt: mover.observedAt,
    allowedUse: "research_only",
    guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
    attribution: {
      primaryDrivers: drivers,
      evidenceStrength: strength,
      learnability: learnabilityValue,
    },
    preMovePattern,
    radarReview: {
      status: radarStatus,
      matchedSignalIds,
      improvementTags: improvementTags(mover, drivers, matchedSignalIds, learnabilityValue, preMovePattern),
    },
  };
}
