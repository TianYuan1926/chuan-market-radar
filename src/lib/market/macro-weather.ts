import type { MarketSignal } from "../analysis/types";
import type { DerivativeSnapshot, MarketDataStatus, MarketTicker } from "./types";

export type MacroWeatherRegime =
  | "tailwind"
  | "headwind"
  | "chop"
  | "leverage_crowded"
  | "deleveraging"
  | "volatility_expansion"
  | "unknown";

export type MacroWeatherTone = "good" | "warn" | "bad" | "neutral";

export type MacroWeatherAnchor = {
  symbol: "BTCUSDT" | "ETHUSDT";
  changePercent24h: number | null;
  fundingRateZScore: number | null;
  openInterestChangePercent: number | null;
  liquidationUsd24h: number | null;
};

export type AltcoinMacroAnchorSource =
  | "coingecko_global"
  | "coinglass"
  | "manual"
  | "unknown";

export type AltcoinMacroAnchorInput = {
  btcDominance7dAveragePercent?: number;
  btcDominance30dAveragePercent?: number;
  btcDominancePercent: number;
  ethDominancePercent?: number;
  source: AltcoinMacroAnchorSource;
  total2ChangePercent24h?: number;
  total3ChangePercent24h?: number;
  totalMarketCapUsd: number;
  updatedAt: string;
};

export type AltcoinMacroAnchorReport = {
  btcDominancePercent: number;
  btcDominanceTrend: "falling" | "flat" | "rising" | "unknown";
  ethDominancePercent: number | null;
  guardrail: string;
  source: AltcoinMacroAnchorSource;
  summary: string;
  tone: MacroWeatherTone;
  total2ChangePercent24h: number | null;
  total2MarketCapUsd: number;
  total3ChangePercent24h: number | null;
  total3MarketCapUsd: number;
  totalMarketCapUsd: number;
  updatedAt: string;
};

export type MacroWeatherReport = {
  anchors: MacroWeatherAnchor[];
  canMutateWeights: false;
  evidence: Array<{
    label: string;
    tone: MacroWeatherTone;
    value: string;
  }>;
  guidance: {
    altcoinBias: "supportive" | "caution" | "defensive" | "wait";
    longWeightHint: string;
    riskHint: string;
    shortWeightHint: string;
  };
  metrics: {
    altcoinAdvanceDecline: {
      advancing: number;
      breadthPercent: number | null;
      declining: number;
      neutral: number;
    };
    anchorDivergencePercent: number | null;
    averageAnchorChangePercent: number | null;
    averageFundingZScore: number | null;
    averageOpenInterestChangePercent: number | null;
    altcoinMacro: AltcoinMacroAnchorReport | null;
    liquidationUsd24h: number;
  };
  primaryRegime: MacroWeatherRegime;
  regimes: Array<{
    active: boolean;
    detail: string;
    key: MacroWeatherRegime;
    label: string;
    tone: MacroWeatherTone;
  }>;
  requestPolicy: "no_extra_requests";
  statusLabel: string;
  summary: string;
  tone: MacroWeatherTone;
};

export type BuildMacroWeatherInput = {
  altcoinMacro?: AltcoinMacroAnchorInput;
  derivatives: DerivativeSnapshot[];
  metadataStatus: MarketDataStatus;
  signals: MarketSignal[];
  tickers: MarketTicker[];
};

const anchorSymbols = ["BTCUSDT", "ETHUSDT"] as const;

const labels: Record<MacroWeatherRegime, string> = {
  chop: "震荡",
  deleveraging: "去杠杆",
  headwind: "逆风",
  leverage_crowded: "杠杆拥挤",
  tailwind: "顺风",
  unknown: "未知",
  volatility_expansion: "波动扩张",
};

const tones: Record<MacroWeatherRegime, MacroWeatherTone> = {
  chop: "neutral",
  deleveraging: "bad",
  headwind: "bad",
  leverage_crowded: "warn",
  tailwind: "good",
  unknown: "neutral",
  volatility_expansion: "warn",
};

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function average(values: Array<number | null | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "等待";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatScore(value: number | null) {
  return value === null ? "等待" : value.toFixed(1);
}

function formatUsd(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  return `$${value.toFixed(0)}`;
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function dominanceTrend(input: AltcoinMacroAnchorInput): AltcoinMacroAnchorReport["btcDominanceTrend"] {
  const references = [
    input.btcDominance7dAveragePercent,
    input.btcDominance30dAveragePercent,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (references.length === 0) {
    return "unknown";
  }

  const reference = average(references);

  if (reference === null) {
    return "unknown";
  }

  const delta = input.btcDominancePercent - reference;

  if (delta >= 0.6) {
    return "rising";
  }

  if (delta <= -0.6) {
    return "falling";
  }

  return "flat";
}

function buildAltcoinMacroAnchors(input?: AltcoinMacroAnchorInput): AltcoinMacroAnchorReport | null {
  if (!input || input.totalMarketCapUsd <= 0 || input.btcDominancePercent <= 0) {
    return null;
  }

  const ethDominancePercent = input.ethDominancePercent ?? null;
  const nonBtcPercent = Math.max(0, 100 - input.btcDominancePercent);
  const nonBtcEthPercent = Math.max(0, 100 - input.btcDominancePercent - (ethDominancePercent ?? 0));
  const total2MarketCapUsd = rounded(input.totalMarketCapUsd * (nonBtcPercent / 100));
  const total3MarketCapUsd = rounded(input.totalMarketCapUsd * (nonBtcEthPercent / 100));
  const trend = dominanceTrend(input);
  const total3Change = input.total3ChangePercent24h ?? null;
  const total2Change = input.total2ChangePercent24h ?? null;
  const tone: MacroWeatherTone = trend === "falling" && (total3Change ?? total2Change ?? 0) > 0
    ? "good"
    : trend === "rising" && (total3Change ?? total2Change ?? 0) <= 0.5
      ? "bad"
      : "neutral";
  const summary = tone === "good"
    ? "BTC.D 下行且 TOTAL2/TOTAL3 扩张，山寨资金环境偏顺风。"
    : tone === "bad"
      ? "BTC.D 上行且 TOTAL2/TOTAL3 走弱，山寨多头环境偏逆风。"
      : "BTC.D 与 TOTAL2/TOTAL3 暂未形成明确山寨顺逆风。";

  return {
    btcDominancePercent: rounded(input.btcDominancePercent),
    btcDominanceTrend: trend,
    ethDominancePercent: ethDominancePercent === null ? null : rounded(ethDominancePercent),
    guardrail: "BTC.D/TOTAL2/TOTAL3 只做山寨环境锚点，不降低 3:1 盈亏比，不直接生成买卖方向。",
    source: input.source,
    summary,
    tone,
    total2ChangePercent24h: total2Change === null ? null : rounded(total2Change),
    total2MarketCapUsd,
    total3ChangePercent24h: total3Change === null ? null : rounded(total3Change),
    total3MarketCapUsd,
    totalMarketCapUsd: rounded(input.totalMarketCapUsd),
    updatedAt: input.updatedAt,
  };
}

function buildAnchors(tickers: MarketTicker[], derivatives: DerivativeSnapshot[]): MacroWeatherAnchor[] {
  return anchorSymbols.map((symbol) => {
    const ticker = tickers.find((item) => normalizeSymbol(item.symbol) === symbol);
    const derivative = derivatives.find((item) => normalizeSymbol(item.symbol) === symbol);

    return {
      changePercent24h: ticker?.changePercent24h ?? null,
      fundingRateZScore: derivative?.fundingRateZScore ?? null,
      liquidationUsd24h: derivative?.liquidationUsd24h ?? null,
      openInterestChangePercent: derivative?.openInterestChangePercent ?? null,
      symbol,
    };
  });
}

function buildBreadth(tickers: MarketTicker[], signals: MarketSignal[]) {
  const altcoinTickers = tickers.filter((ticker) => !anchorSymbols.includes(normalizeSymbol(ticker.symbol) as typeof anchorSymbols[number]));

  if (altcoinTickers.length > 0) {
    const advancing = altcoinTickers.filter((ticker) => ticker.changePercent24h > 0.5).length;
    const declining = altcoinTickers.filter((ticker) => ticker.changePercent24h < -0.5).length;
    const neutral = altcoinTickers.length - advancing - declining;

    return {
      advancing,
      breadthPercent: ((advancing - declining) / altcoinTickers.length) * 100,
      declining,
      neutral,
    };
  }

  if (signals.length === 0) {
    return {
      advancing: 0,
      breadthPercent: null,
      declining: 0,
      neutral: 0,
    };
  }

  const advancing = signals.filter((signal) => signal.direction === "long").length;
  const declining = signals.filter((signal) => signal.direction === "short").length;
  const neutral = signals.length - advancing - declining;

  return {
    advancing,
    breadthPercent: ((advancing - declining) / signals.length) * 100,
    declining,
    neutral,
  };
}

function guidanceFor(regime: MacroWeatherRegime): MacroWeatherReport["guidance"] {
  if (regime === "tailwind") {
    return {
      altcoinBias: "supportive",
      longWeightHint: "多头候选可保留顺风解释，但必须等币种自身触发。",
      riskHint: "山寨环境偏顺风，仍禁止把 BTC/ETH 上涨当作直接进场理由。",
      shortWeightHint: "空头候选需要更强的币种独立弱势证据。",
    };
  }

  if (regime === "leverage_crowded") {
    return {
      altcoinBias: "caution",
      longWeightHint: "多头只保留低杠杆、低资金费率、回踩确认样本。",
      riskHint: "杠杆拥挤阶段禁止追高，先看回撤是否释放风险。",
      shortWeightHint: "空头不提前赌顶，只等失败回落后的确认。",
    };
  }

  if (regime === "deleveraging") {
    return {
      altcoinBias: "defensive",
      longWeightHint: "多头样本降为观察，除非出现独立抗跌和量能修复。",
      riskHint: "去杠杆阶段优先保护本金，等待清算后结构重新稳定。",
      shortWeightHint: "空头只在反抽失败或跌破后确认，避免低位追空。",
    };
  }

  if (regime === "headwind") {
    return {
      altcoinBias: "defensive",
      longWeightHint: "多头候选需要更高确认门槛。",
      riskHint: "BTC/ETH 逆风，山寨机会只看独立强势和明确失效条件。",
      shortWeightHint: "空头候选可保留优先级，但仍等结构确认。",
    };
  }

  if (regime === "volatility_expansion") {
    return {
      altcoinBias: "caution",
      longWeightHint: "多头等波动回落后再看触发质量。",
      riskHint: "波动扩张阶段容易扫损，仓位和止损距离必须更保守。",
      shortWeightHint: "空头同样等确认，不追瞬时清算针。",
    };
  }

  if (regime === "chop") {
    return {
      altcoinBias: "wait",
      longWeightHint: "多头只看独立放量突破样本。",
      riskHint: "大盘震荡，山寨容易假突破，优先等待更清晰的多周期共振。",
      shortWeightHint: "空头只看破位后反抽失败样本。",
    };
  }

  return {
    altcoinBias: "wait",
    longWeightHint: "等待 BTC/ETH 锚点恢复后再解释多头顺逆风。",
    riskHint: "等待有效大盘锚点，不把缺数据当作信号。",
    shortWeightHint: "等待 BTC/ETH 锚点恢复后再解释空头顺逆风。",
  };
}

function withAltcoinMacroGuidance(
  guidance: MacroWeatherReport["guidance"],
  altcoinMacro: AltcoinMacroAnchorReport | null,
): MacroWeatherReport["guidance"] {
  if (!altcoinMacro) {
    return guidance;
  }

  if (altcoinMacro.tone === "bad") {
    return {
      ...guidance,
      longWeightHint: `${guidance.longWeightHint} BTC.D 上行时，山寨多头必须等待更强独立强势和更近失效位。`,
      riskHint: `${guidance.riskHint} BTC.D/TOTAL2/TOTAL3 只是环境过滤，3:1 最低盈亏比不降低。`,
    };
  }

  if (altcoinMacro.tone === "good") {
    return {
      ...guidance,
      riskHint: `${guidance.riskHint} BTC.D 下行可解释山寨顺风，但仍必须由币种结构、量能和衍生品证据触发，3:1 最低盈亏比不降低。`,
    };
  }

  return {
    ...guidance,
    riskHint: `${guidance.riskHint} BTC.D/TOTAL2/TOTAL3 未给出明确方向，不参与提高信号等级。`,
  };
}

function summaryFor(regime: MacroWeatherRegime) {
  if (regime === "tailwind") {
    return "BTC/ETH 同向上行，山寨机会处在顺风环境，但排序仍由币种自身证据决定。";
  }

  if (regime === "leverage_crowded") {
    return "大盘上涨但资金费率和 OI 偏热，山寨机会需要防止追高和清算回撤。";
  }

  if (regime === "deleveraging") {
    return "BTC/ETH 下跌并伴随 OI 收缩或清算放大，山寨优先进入防守观察。";
  }

  if (regime === "headwind") {
    return "BTC/ETH 偏逆风，山寨需要独立强弱和结构确认，不能只看异动。";
  }

  if (regime === "volatility_expansion") {
    return "大盘波动扩张，山寨信号更容易被扫，优先降低追单冲动。";
  }

  if (regime === "chop") {
    return "BTC/ETH 分歧或横盘，山寨机会以等待确认和筛选独立强势为主。";
  }

  return "等待 BTC/ETH 锚点恢复，暂不把大盘天气用于机会解释。";
}

function appendAltcoinMacroSummary(summary: string, altcoinMacro: AltcoinMacroAnchorReport | null) {
  return altcoinMacro ? `${summary} ${altcoinMacro.summary}` : summary;
}

export function buildMacroWeather({
  altcoinMacro,
  derivatives,
  metadataStatus,
  signals,
  tickers,
}: BuildMacroWeatherInput): MacroWeatherReport {
  const altcoinMacroReport = buildAltcoinMacroAnchors(altcoinMacro);
  const anchors = buildAnchors(tickers, derivatives);
  const anchorChanges = anchors.map((anchor) => anchor.changePercent24h);
  const averageAnchorChangePercent = average(anchorChanges);
  const knownChanges = anchorChanges.filter((value): value is number => value !== null);
  const anchorDivergencePercent = knownChanges.length >= 2
    ? Math.abs(Math.max(...knownChanges) - Math.min(...knownChanges))
    : null;
  const averageFundingZScore = average(anchors.map((anchor) => anchor.fundingRateZScore));
  const averageOpenInterestChangePercent = average(anchors.map((anchor) => anchor.openInterestChangePercent));
  const liquidationUsd24h = anchors.reduce((sum, anchor) => sum + (anchor.liquidationUsd24h ?? 0), 0);
  const altcoinAdvanceDecline = buildBreadth(tickers, signals);
  const dominanceHeadwind = altcoinMacroReport?.tone === "bad";
  const dominanceTailwind = altcoinMacroReport?.tone === "good";
  const missingAnchors = knownChanges.length === 0;
  const unknown = metadataStatus === "failed" || metadataStatus === "stale" || missingAnchors;
  const deleveraging = !unknown &&
    averageAnchorChangePercent !== null &&
    averageAnchorChangePercent <= -1 &&
    ((averageOpenInterestChangePercent !== null && averageOpenInterestChangePercent <= -3) || liquidationUsd24h > 20_000_000);
  const leverageCrowded = !unknown &&
    averageFundingZScore !== null &&
    averageFundingZScore >= 1.5 &&
    averageOpenInterestChangePercent !== null &&
    averageOpenInterestChangePercent >= 6;
  const volatilityExpansion = !unknown &&
    ((averageAnchorChangePercent !== null && Math.abs(averageAnchorChangePercent) >= 2.5) ||
      (anchorDivergencePercent !== null && anchorDivergencePercent >= 2.5));
  const tailwind = !unknown && (
    (averageAnchorChangePercent !== null && averageAnchorChangePercent >= 1.2) ||
    (dominanceTailwind && averageAnchorChangePercent !== null && averageAnchorChangePercent >= -0.6)
  );
  const headwind = !unknown && (
    dominanceHeadwind ||
    (averageAnchorChangePercent !== null && averageAnchorChangePercent <= -1.2)
  );
  const chop = !unknown &&
    ((averageAnchorChangePercent !== null && Math.abs(averageAnchorChangePercent) <= 0.6) ||
      (anchorDivergencePercent !== null && anchorDivergencePercent >= 1.5));
  const primaryRegime: MacroWeatherRegime = unknown
    ? "unknown"
    : deleveraging
      ? "deleveraging"
      : leverageCrowded
        ? "leverage_crowded"
        : volatilityExpansion
          ? "volatility_expansion"
          : headwind
            ? "headwind"
            : tailwind
              ? "tailwind"
              : chop
                ? "chop"
                : "chop";
  const activeRegimes = new Set<MacroWeatherRegime>([
    ...(tailwind ? ["tailwind" as const] : []),
    ...(headwind ? ["headwind" as const] : []),
    ...(chop ? ["chop" as const] : []),
    ...(leverageCrowded ? ["leverage_crowded" as const] : []),
    ...(deleveraging ? ["deleveraging" as const] : []),
    ...(volatilityExpansion ? ["volatility_expansion" as const] : []),
    ...(unknown ? ["unknown" as const] : []),
  ]);

  return {
    anchors,
    canMutateWeights: false,
    evidence: [
      {
        label: "BTC/ETH 24h",
        tone: averageAnchorChangePercent === null ? "neutral" : averageAnchorChangePercent >= 1.2 ? "good" : averageAnchorChangePercent <= -1.2 ? "bad" : "neutral",
        value: formatPercent(averageAnchorChangePercent),
      },
      {
        label: "资金费率 Z",
        tone: averageFundingZScore !== null && averageFundingZScore >= 1.5 ? "warn" : "neutral",
        value: formatScore(averageFundingZScore),
      },
      {
        label: "OI 变化",
        tone: averageOpenInterestChangePercent === null ? "neutral" : averageOpenInterestChangePercent >= 6 ? "warn" : averageOpenInterestChangePercent <= -3 ? "bad" : "neutral",
        value: formatPercent(averageOpenInterestChangePercent),
      },
      {
        label: "24h 清算",
        tone: liquidationUsd24h > 20_000_000 ? "bad" : "neutral",
        value: formatUsd(liquidationUsd24h),
      },
      ...(altcoinMacroReport
        ? [
            {
              label: "BTC.D",
              tone: altcoinMacroReport.tone,
              value: `${formatPercent(altcoinMacroReport.btcDominancePercent)} / ${altcoinMacroReport.btcDominanceTrend}`,
            },
            {
              label: "TOTAL2/TOTAL3",
              tone: altcoinMacroReport.tone,
              value: `${formatUsd(altcoinMacroReport.total2MarketCapUsd)} / ${formatUsd(altcoinMacroReport.total3MarketCapUsd)}`,
            },
          ]
        : []),
    ],
    guidance: withAltcoinMacroGuidance(guidanceFor(primaryRegime), altcoinMacroReport),
    metrics: {
      altcoinAdvanceDecline,
      altcoinMacro: altcoinMacroReport,
      anchorDivergencePercent,
      averageAnchorChangePercent,
      averageFundingZScore,
      averageOpenInterestChangePercent,
      liquidationUsd24h,
    },
    primaryRegime,
    regimes: (Object.keys(labels) as MacroWeatherRegime[]).map((key) => ({
      active: activeRegimes.has(key) || key === primaryRegime,
      detail: key === primaryRegime ? "当前主天气" : "候选环境因子",
      key,
      label: labels[key],
      tone: tones[key],
    })),
    requestPolicy: "no_extra_requests",
    statusLabel: labels[primaryRegime],
    summary: appendAltcoinMacroSummary(summaryFor(primaryRegime), altcoinMacroReport),
    tone: tones[primaryRegime],
  };
}
