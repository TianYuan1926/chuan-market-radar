import type {
  Candle,
} from "../market/ohlcv/types";
import type {
  Timeframe,
} from "../analysis/types";
import {
  buildProfessionalBacktestAuditCase,
  summarizeProfessionalBacktestRound,
  type ProfessionalAuditDerivativesInput,
  type ProfessionalAuditFinding,
  type ProfessionalAuditRemediation,
  type ProfessionalBacktestAuditCase,
} from "./professional-audit";

export type ProfessionalReplayOptions = {
  horizonBars?: number;
  maxCasesInReport?: number;
  moveThresholdPct?: number;
  stepBars?: number;
  topN?: number;
};

export type ProfessionalReplayInput = {
  baseInterval: Extract<Timeframe, "15m">;
  candlesBySymbol: Map<string, Candle[]>;
  derivativesBySymbol?: Map<string, ProfessionalDerivativePoint[]>;
  generatedAt?: string;
  options?: ProfessionalReplayOptions;
};

export type ProfessionalDerivativePoint = {
  fundingRate?: number;
  observedAt: string;
  openInterestUsd?: number;
  source: "coinglass" | "public_exchange";
};

export type ProfessionalReplayReport = {
  cases: ProfessionalBacktestAuditCase[];
  findings: ProfessionalAuditFinding[];
  generatedAt: string;
  guardrails: string[];
  input: {
    baseInterval: Timeframe;
    derivativesSymbolsUsed: number;
    horizonBars: number;
    replayTimes: number;
    symbolsUsed: string[];
    topN: number;
  };
  remediationPlan: ProfessionalAuditRemediation[];
  roundSummary: ReturnType<typeof summarizeProfessionalBacktestRound>;
  schemaVersion: "professional-backtest-audit-report.v2";
  summary: string;
};

const defaultOptions = {
  horizonBars: 96,
  maxCasesInReport: 200,
  moveThresholdPct: 10,
  stepBars: 4,
  topN: 20,
};

function normalizeOptions(options?: ProfessionalReplayOptions) {
  return {
    horizonBars: Math.max(1, Math.round(options?.horizonBars ?? defaultOptions.horizonBars)),
    maxCasesInReport: Math.max(1, Math.round(options?.maxCasesInReport ?? defaultOptions.maxCasesInReport)),
    moveThresholdPct: Math.max(0.1, options?.moveThresholdPct ?? defaultOptions.moveThresholdPct),
    stepBars: Math.max(1, Math.round(options?.stepBars ?? defaultOptions.stepBars)),
    topN: Math.max(1, Math.round(options?.topN ?? defaultOptions.topN)),
  };
}

function aggregateCandles(candles: Candle[], groupSize: number): Candle[] {
  const aggregated: Candle[] = [];

  for (let index = 0; index + groupSize <= candles.length; index += groupSize) {
    const group = candles.slice(index, index + groupSize);
    const first = group[0];
    const last = group.at(-1);

    if (!first || !last) {
      continue;
    }

    aggregated.push({
      close: last.close,
      closeTime: last.closeTime,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      open: first.open,
      openTime: first.openTime,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    });
  }

  return aggregated;
}

export function buildReplayCandlesByTimeframe(baseCandles: Candle[]): Partial<Record<Timeframe, Candle[]>> {
  return {
    "15m": baseCandles,
    "1h": aggregateCandles(baseCandles, 4),
    "4h": aggregateCandles(baseCandles, 16),
    "1d": aggregateCandles(baseCandles, 96),
  };
}

function commonReplayIndexes(candlesBySymbol: Map<string, Candle[]>, options: ReturnType<typeof normalizeOptions>) {
  const maxLength = Math.max(...[...candlesBySymbol.values()].map((candles) => candles.length), 0);
  const minHistory = 96;
  const indexes: number[] = [];

  for (let index = minHistory; index < maxLength - options.horizonBars; index += options.stepBars) {
    const available = [...candlesBySymbol.values()].filter((candles) => candles[index]?.openTime).length;

    if (available >= Math.max(2, Math.floor(candlesBySymbol.size * 0.4))) {
      indexes.push(index);
    }
  }

  return indexes;
}

function uniqueRemediations(cases: ProfessionalBacktestAuditCase[]) {
  const seen = new Set<string>();
  const remediations: ProfessionalAuditRemediation[] = [];

  for (const item of cases) {
    for (const remediation of item.remediationPlan) {
      const key = `${remediation.layer}:${remediation.targetModule}:${remediation.action}`;

      if (!seen.has(key)) {
        seen.add(key);
        remediations.push(remediation);
      }
    }
  }

  return remediations.sort((left, right) => left.priority.localeCompare(right.priority));
}

function topFindings(cases: ProfessionalBacktestAuditCase[]) {
  const findings = cases.flatMap((item) => item.findings);

  return findings
    .sort((left, right) => {
      const severityWeight = { high: 3, medium: 2, low: 1 };

      return severityWeight[right.severity] - severityWeight[left.severity] ||
        left.id.localeCompare(right.id);
    })
    .slice(0, 100);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sortDerivativePoints(points: ProfessionalDerivativePoint[] = []) {
  return [...points]
    .filter((point) => Number.isFinite(Date.parse(point.observedAt)))
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

function latestDerivativePointAt(points: ProfessionalDerivativePoint[], observedMs: number, field: "fundingRate" | "openInterestUsd") {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];

    if (!point) {
      continue;
    }

    const timestamp = Date.parse(point.observedAt);

    if (timestamp <= observedMs && isFiniteNumber(point[field])) {
      return point;
    }
  }

  return null;
}

function previousOpenInterestPoint(points: ProfessionalDerivativePoint[], observedMs: number, currentMs: number) {
  const preferredCutoff = observedMs - 24 * 60 * 60_000;
  let fallback: ProfessionalDerivativePoint | null = null;

  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];

    if (!point || !isFiniteNumber(point.openInterestUsd)) {
      continue;
    }

    const timestamp = Date.parse(point.observedAt);

    if (timestamp >= currentMs || timestamp > observedMs) {
      continue;
    }

    if (!fallback) {
      fallback = point;
    }

    if (timestamp <= preferredCutoff) {
      return point;
    }
  }

  return fallback;
}

function fundingZScore(points: ProfessionalDerivativePoint[], current: ProfessionalDerivativePoint, observedMs: number) {
  if (!isFiniteNumber(current.fundingRate)) {
    return undefined;
  }

  const currentMs = Date.parse(current.observedAt);
  const samples = points
    .filter((point) => {
      const timestamp = Date.parse(point.observedAt);

      return timestamp <= observedMs &&
        timestamp < currentMs &&
        isFiniteNumber(point.fundingRate);
    })
    .slice(-30)
    .map((point) => point.fundingRate as number);

  if (samples.length < 3) {
    return Number((current.fundingRate * 10_000).toFixed(2));
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const deviation = Math.sqrt(variance);

  if (deviation <= 0) {
    return 0;
  }

  return Number(((current.fundingRate - mean) / deviation).toFixed(2));
}

export function buildReplayDerivativesInput(
  points: ProfessionalDerivativePoint[] | undefined,
  observedAt: string,
): ProfessionalAuditDerivativesInput {
  const observedMs = Date.parse(observedAt);

  if (!Number.isFinite(observedMs)) {
    return {
      source: "unavailable",
      status: "unavailable",
    };
  }

  const sorted = sortDerivativePoints(points);
  const currentFunding = latestDerivativePointAt(sorted, observedMs, "fundingRate");
  const currentOpenInterest = latestDerivativePointAt(sorted, observedMs, "openInterestUsd");
  const source = currentFunding?.source ?? currentOpenInterest?.source;
  const input: ProfessionalAuditDerivativesInput = {
    source: source ?? "unavailable",
    status: "unavailable",
  };

  if (currentFunding) {
    const zScore = fundingZScore(sorted, currentFunding, observedMs);

    if (isFiniteNumber(zScore)) {
      input.fundingRateZScore = zScore;
    }
  }

  if (currentOpenInterest && isFiniteNumber(currentOpenInterest.openInterestUsd)) {
    const currentMs = Date.parse(currentOpenInterest.observedAt);
    const previous = previousOpenInterestPoint(sorted, observedMs, currentMs);

    if (previous && isFiniteNumber(previous.openInterestUsd) && previous.openInterestUsd > 0) {
      input.openInterestChangePercent = Number((((currentOpenInterest.openInterestUsd - previous.openInterestUsd) / previous.openInterestUsd) * 100).toFixed(2));
    }
  }

  const hasFunding = isFiniteNumber(input.fundingRateZScore);
  const hasOpenInterest = isFiniteNumber(input.openInterestChangePercent);

  if (hasFunding && hasOpenInterest) {
    input.status = "live";
  } else if (hasFunding || hasOpenInterest) {
    input.status = "partial";
  }

  return input;
}

export function runProfessionalReplay(input: ProfessionalReplayInput): ProfessionalReplayReport {
  const options = normalizeOptions(input.options);
  const replayIndexes = commonReplayIndexes(input.candlesBySymbol, options);
  const selectedCases: ProfessionalBacktestAuditCase[] = [];

  for (const index of replayIndexes) {
    const casesAtTime: ProfessionalBacktestAuditCase[] = [];

    for (const [symbol, candles] of input.candlesBySymbol.entries()) {
      const observed = candles[index];

      if (!observed) {
        continue;
      }

      const history = candles.slice(0, index + 1);
      const future = candles.slice(index + 1, index + 1 + options.horizonBars);

      if (history.length < 96 || future.length === 0) {
        continue;
      }

      casesAtTime.push(buildProfessionalBacktestAuditCase({
        candlesByTimeframe: buildReplayCandlesByTimeframe(history),
        derivatives: buildReplayDerivativesInput(input.derivativesBySymbol?.get(symbol), observed.openTime),
        exchange: "binance-public-futures",
        futureCandles: future,
        moveThresholdPct: options.moveThresholdPct,
        observedAt: observed.openTime,
        primaryTimeframe: "15m",
        symbol,
      }));
    }

    selectedCases.push(
      ...casesAtTime
        .sort((left, right) => right.signal.confidence - left.signal.confidence)
        .slice(0, options.topN),
    );

    if (selectedCases.length >= options.maxCasesInReport) {
      break;
    }
  }

  const cases = selectedCases.slice(0, options.maxCasesInReport);
  const roundSummary = summarizeProfessionalBacktestRound(cases);
  const findings = topFindings(cases);
  const remediationPlan = uniqueRemediations(cases);
  const high = roundSummary.highSeverityFindings;

  return {
    cases,
    findings,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    guardrails: [
      "专业回测 v2 只读审计，不自动下单。",
      "本报告用于发现扫描、分析、推理和交易计划问题，不是收益承诺。",
      "缺失的数据必须显示 unavailable，不能用 mock 或当前值冒充历史数据。",
    ],
    input: {
      baseInterval: input.baseInterval,
      derivativesSymbolsUsed: input.derivativesBySymbol?.size ?? 0,
      horizonBars: options.horizonBars,
      replayTimes: replayIndexes.length,
      symbolsUsed: [...input.candlesBySymbol.keys()],
      topN: options.topN,
    },
    remediationPlan,
    roundSummary,
    schemaVersion: "professional-backtest-audit-report.v2",
    summary: high > 0
      ? `专业回测 v2 发现 ${high} 个高优先级问题，必须先整改再谈实战参考。`
      : "专业回测 v2 未发现高优先级问题，仍需扩大样本继续验证。",
  };
}
