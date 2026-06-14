import type { SignalState } from "@/lib/analysis/types";

import type { ExchangeId } from "./types";

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
  window: "1h" | "4h" | "24h" | "3d";
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
  | "liquidation_pressure"
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

export type DailyMoverReview = {
  id: string;
  symbol: string;
  direction: DailyMoverDirection;
  observedAt: string;
  allowedUse: "research_only";
  guardrail: string;
  attribution: MoverAttribution;
  radarReview: RadarMoverReview;
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

  if ((mover.liquidationUsd24h ?? 0) >= 10_000_000) {
    drivers.push("liquidation_pressure");
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

function improvementTags(
  mover: DailyMover,
  drivers: MoverDriver[],
  matchedSignalIds: string[],
  learnabilityValue: MoverAttribution["learnability"],
) {
  if (matchedSignalIds.length > 0 || learnabilityValue === "not_learnable") {
    return [];
  }

  const tags: string[] = [];

  if (drivers.includes("volume_expansion") || drivers.includes("open_interest_expansion")) {
    tags.push("review_volume_oi_weight");
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
    radarReview: {
      status: radarStatus,
      matchedSignalIds,
      improvementTags: improvementTags(mover, drivers, matchedSignalIds, learnabilityValue),
    },
  };
}
