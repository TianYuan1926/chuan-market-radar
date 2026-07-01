import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
  KeyLevelDirection,
  KeyLevelStatus,
  KeyLevelType,
  TrendTimeframe,
} from "./types";

export type BuildKeyLevelsInput = {
  candles: Candle[];
  currentPrice: number;
  symbol: string;
  timeframe: TrendTimeframe;
};

function roundPrice(value: number) {
  return Number(value.toFixed(value >= 100 ? 2 : 6));
}

function averageRange(candles: Candle[]) {
  if (candles.length === 0) {
    return 0;
  }

  return candles.reduce((total, candle) => total + Math.max(0, candle.high - candle.low), 0) / candles.length;
}

function zoneWidth(price: number, candles: Candle[]) {
  const atrProxy = averageRange(candles) * 0.28;
  const percentFloor = price * 0.0025;

  return Math.max(atrProxy, percentFloor);
}

function statusFor({
  currentPrice,
  direction,
  zoneHigh,
  zoneLow,
}: {
  currentPrice: number;
  direction: KeyLevelDirection;
  zoneHigh: number;
  zoneLow: number;
}): KeyLevelStatus {
  if (currentPrice >= zoneLow && currentPrice <= zoneHigh) {
    return "ARRIVED";
  }

  if (direction === "RESISTANCE" && currentPrice > zoneHigh) {
    return "BROKEN";
  }

  if (direction === "SUPPORT" && currentPrice < zoneLow) {
    return "BROKEN";
  }

  return "POTENTIAL";
}

function makeLevel({
  candles,
  currentPrice,
  direction,
  price,
  symbol,
  timeframe,
  type,
}: {
  candles: Candle[];
  currentPrice: number;
  direction: KeyLevelDirection;
  price: number;
  symbol: string;
  timeframe: TrendTimeframe;
  type: KeyLevelType;
}): KeyLevel {
  const width = zoneWidth(price, candles);
  const zoneLow = roundPrice(price - width / 2);
  const zoneHigh = roundPrice(price + width / 2);
  const status = statusFor({
    currentPrice,
    direction,
    zoneHigh,
    zoneLow,
  });
  const distanceScore = Math.max(0, 100 - Math.abs(currentPrice - price) / Math.max(price, 1) * 1000);
  const typeScore = type === "RANGE_HIGH" || type === "RANGE_LOW" ? 82 : 72;
  const roleFlipReasons = direction === "SUPPORT"
    ? [
      `${timeframe} role-flip support generated after price broke above a prior resistance.`,
      `突破压力后的回踩防守位，只能作为等待承接确认的结构依据。`,
    ]
    : [
      `${timeframe} role-flip resistance generated after price broke below a prior support.`,
      `跌破支撑后的反抽压力位，只能作为等待承压确认的结构依据。`,
    ];
  const roleFlipConfirmationRules = direction === "SUPPORT"
    ? [
      "Retest the flipped zone without closing back below zoneLow.",
      "回踩该区间后重新收回 zoneHigh，并形成更高低点。",
    ]
    : [
      "Retest the flipped zone without closing back above zoneHigh.",
      "反抽该区间后重新跌回 zoneLow，并形成更低高点。",
    ];

  return {
    id: `${symbol}-${timeframe}-${type.toLowerCase()}-${roundPrice(price)}`,
    symbol,
    timeframe,
    type,
    zoneLow,
    zoneHigh,
    midPrice: roundPrice((zoneLow + zoneHigh) / 2),
    direction,
    keyScore: Math.round(Math.min(95, typeScore + distanceScore * 0.12)),
    reactionScore: status === "ARRIVED" ? 38 : status === "BROKEN" ? 20 : 0,
    confluenceScore: type === "RANGE_HIGH" || type === "RANGE_LOW" ? 68 : 48,
    status,
    reasons: type === "ROLE_FLIP"
      ? roleFlipReasons
      : [
        `${timeframe} ${type.replaceAll("_", " ").toLowerCase()} generated from recent OHLCV structure.`,
        `Zone width uses ATR-like candle range memory instead of a single point.`,
      ],
    confirmationRules: type === "ROLE_FLIP"
      ? roleFlipConfirmationRules
      : direction === "SUPPORT"
        ? [
          "Price reclaims zoneHigh after entering the support zone.",
          "A higher low forms on the execution timeframe.",
        ]
        : [
          "Price fails to close above zoneHigh or re-enters below zoneLow.",
          "A lower high forms after rejection.",
        ],
    invalidationRule: direction === "SUPPORT"
      ? `Close below ${zoneLow} invalidates this support zone.`
      : `Close above ${zoneHigh} and retest hold invalidates this resistance zone.`,
  };
}

function roleFlipLevelsFrom({
  candles,
  currentPrice,
  levels,
  symbol,
  timeframe,
}: BuildKeyLevelsInput & { levels: KeyLevel[] }) {
  return levels.flatMap((level) => {
    if (level.direction === "RESISTANCE" && currentPrice > level.zoneHigh) {
      return makeLevel({
        candles,
        currentPrice,
        direction: "SUPPORT",
        price: level.zoneHigh,
        symbol,
        timeframe,
        type: "ROLE_FLIP",
      });
    }

    if (level.direction === "SUPPORT" && currentPrice < level.zoneLow) {
      return makeLevel({
        candles,
        currentPrice,
        direction: "RESISTANCE",
        price: level.zoneLow,
        symbol,
        timeframe,
        type: "ROLE_FLIP",
      });
    }

    return [];
  });
}

function uniqueByRoundedPrice(levels: KeyLevel[]) {
  const seen = new Set<string>();

  return levels.filter((level) => {
    const key = `${level.direction}:${Math.round(level.midPrice * 100)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

export function buildKeyLevels({
  candles,
  currentPrice,
  symbol,
  timeframe,
}: BuildKeyLevelsInput): KeyLevel[] {
  if (candles.length < 3) {
    return [];
  }

  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const swingLevels: KeyLevel[] = [];

  for (let index = 1; index < candles.length - 1; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    const next = candles[index + 1];

    if (current.high > previous.high && current.high > next.high) {
      swingLevels.push(makeLevel({
        candles,
        currentPrice,
        direction: "RESISTANCE",
        price: current.high,
        symbol,
        timeframe,
        type: "SWING_HIGH",
      }));
    }

    if (current.low < previous.low && current.low < next.low) {
      swingLevels.push(makeLevel({
        candles,
        currentPrice,
        direction: "SUPPORT",
        price: current.low,
        symbol,
        timeframe,
        type: "SWING_LOW",
      }));
    }
  }

  const rangeLevels = [
    makeLevel({
      candles,
      currentPrice,
      direction: "RESISTANCE",
      price: rangeHigh,
      symbol,
      timeframe,
      type: "RANGE_HIGH",
    }),
    makeLevel({
      candles,
      currentPrice,
      direction: "SUPPORT",
      price: rangeLow,
      symbol,
      timeframe,
      type: "RANGE_LOW",
    }),
  ];
  const baseLevels = uniqueByRoundedPrice([...rangeLevels, ...swingLevels]);
  const levels = uniqueByRoundedPrice([
    ...baseLevels,
    ...roleFlipLevelsFrom({
      candles,
      currentPrice,
      levels: baseLevels,
      symbol,
      timeframe,
    }),
  ]);
  const supports = levels
    .filter((level) => level.direction === "SUPPORT")
    .sort((first, second) => second.keyScore - first.keyScore || second.midPrice - first.midPrice)
    .slice(0, 3);
  const resistances = levels
    .filter((level) => level.direction === "RESISTANCE")
    .sort((first, second) => second.keyScore - first.keyScore || first.midPrice - second.midPrice)
    .slice(0, 3);

  return [...supports, ...resistances].sort((first, second) => second.keyScore - first.keyScore);
}
