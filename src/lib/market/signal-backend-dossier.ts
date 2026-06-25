import type { Timeframe } from "@/lib/analysis/types";
import type { StrategyV3Dossier } from "@/lib/analysis/v3/types";
import type { JournalEvent, MarketSignal } from "../analysis/types";
import { buildTradingViewUrl, toTradingViewSymbol } from "./tradingview-links";
import type { MarketRadarSnapshot, ScanLightScanCandidate } from "./types";

export type SignalBackendDossier = {
  found: boolean;
  generatedAt: string;
  guardrails: string[];
  symbol: string;
  chart: {
    availableTimeframes: string[];
    selectedTimeframe: Timeframe | null;
    tradingView: {
      interval: string | null;
      symbol: string | null;
      url: string | null;
    };
  };
  evidence: {
    conflictingCount: number;
    items: MarketSignal["evidence"];
    neutralCount: number;
    supportiveCount: number;
    total: number;
  };
  journal: {
    recentEvents: JournalEvent[];
    totalEvents: number;
  };
  discovery?: {
    candidate: ScanLightScanCandidate | null;
    source: "light_scan_top_candidate" | "not_in_light_scan_top_candidates";
  };
  signal: {
    confidence: number;
    direction: MarketSignal["direction"];
    exchange: string;
    id: string;
    risk: MarketSignal["risk"];
    state: MarketSignal["state"];
    summary: string;
    timeframeGate?: MarketSignal["timeframeGate"];
    timeframe: MarketSignal["timeframe"];
    updatedAt: string;
  } | null;
  execution?: {
    maxLeverage: number | null;
    maxLeverageSource: "coinglass_instrument_tag" | "fixed_btc_eth" | "unknown";
  };
  strategyV3: StrategyV3Dossier | null;
};

function normalizeInputSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[-_/]/g, "");
}

function normalizeComparableSymbol(value: string) {
  const normalized = normalizeInputSymbol(value);

  if (normalized.endsWith("USDT")) {
    return normalized;
  }

  if (normalized.endsWith("USDC") || normalized.endsWith("USD")) {
    return `${normalized.replace(/(USDC|USD)$/u, "")}USDT`;
  }

  return `${normalized}USDT`;
}

function displayMissingSymbol(input: string) {
  return normalizeInputSymbol(input).replace(/(USDT|USDC|USD)$/u, "");
}

function signalMatches(signal: MarketSignal, symbol: string) {
  const targetSymbol = normalizeComparableSymbol(symbol);
  const targetBase = targetSymbol.replace(/USDT$/u, "");
  const signalSymbol = normalizeComparableSymbol(signal.symbol);

  return signalSymbol === targetSymbol || signalSymbol.replace(/USDT$/u, "") === targetBase;
}

function maxLeverageFromTags(tags: string[]) {
  for (const tag of tags) {
    const match = /^lev:(\d+(?:\.\d+)?)$/u.exec(tag.trim());
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function executionContext(snapshot: MarketRadarSnapshot, symbol: string): SignalBackendDossier["execution"] {
  const targetSymbol = normalizeComparableSymbol(symbol);
  const targetBase = targetSymbol.replace(/USDT$/u, "");

  if (targetBase === "BTC" || targetBase === "ETH") {
    return {
      maxLeverage: 150,
      maxLeverageSource: "fixed_btc_eth",
    };
  }

  const matches = snapshot.instruments.filter((instrument) =>
    normalizeComparableSymbol(instrument.symbol) === targetSymbol ||
    normalizeComparableSymbol(instrument.symbol).replace(/USDT$/u, "") === targetBase
  );
  const maxLeverage = matches
    .map((instrument) => maxLeverageFromTags(instrument.tags))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0] ?? null;

  return {
    maxLeverage,
    maxLeverageSource: maxLeverage ? "coinglass_instrument_tag" : "unknown",
  };
}

function availableTimeframes(signal: MarketSignal) {
  const timeframes = new Set<string>();

  timeframes.add(signal.timeframe);

  for (const timeframe of signal.strategyV3?.sourceTimeframes ?? []) {
    timeframes.add(timeframe);
  }

  for (const item of signal.strategyV3?.trendContext?.timeframes ?? []) {
    timeframes.add(item.timeframe);
  }

  return Array.from(timeframes);
}

function evidenceSummary(signal: MarketSignal | null): SignalBackendDossier["evidence"] {
  const items = signal?.evidence ?? [];

  return {
    conflictingCount: items.filter((item) => item.polarity === "conflicting" || item.polarity === "blocking").length,
    items,
    neutralCount: items.filter((item) => item.polarity === "neutral").length,
    supportiveCount: items.filter((item) => item.polarity === "supportive").length,
    total: items.length,
  };
}

function journalSummary({
  signal,
  snapshot,
}: {
  signal: MarketSignal | null;
  snapshot: MarketRadarSnapshot;
}): SignalBackendDossier["journal"] {
  if (!signal) {
    return {
      recentEvents: [],
      totalEvents: 0,
    };
  }

  const signalSymbol = normalizeComparableSymbol(signal.symbol);
  const events = snapshot.journalEvents.filter((event) =>
    event.signalId === signal.id ||
    normalizeComparableSymbol(event.symbol) === signalSymbol
  );

  return {
    recentEvents: events.slice(0, 8),
    totalEvents: events.length,
  };
}

function lightScanCandidateMatches(candidate: ScanLightScanCandidate, symbol: string) {
  const targetSymbol = normalizeComparableSymbol(symbol);
  const targetBase = targetSymbol.replace(/USDT$/u, "");
  const candidateSymbol = normalizeComparableSymbol(candidate.symbol);
  const candidateBase = normalizeComparableSymbol(candidate.baseAsset).replace(/USDT$/u, "");

  return candidateSymbol === targetSymbol ||
    candidateSymbol.replace(/USDT$/u, "") === targetBase ||
    candidateBase === targetBase;
}

function discoveryContext({
  lightScanCandidates = [],
  symbol,
}: {
  lightScanCandidates?: ScanLightScanCandidate[];
  symbol: string;
}): SignalBackendDossier["discovery"] {
  const candidate = lightScanCandidates.find((item) => lightScanCandidateMatches(item, symbol)) ?? null;

  return {
    candidate,
    source: candidate ? "light_scan_top_candidate" : "not_in_light_scan_top_candidates",
  };
}

function chartContext(signal: MarketSignal | null): SignalBackendDossier["chart"] {
  if (!signal) {
    return {
      availableTimeframes: [],
      selectedTimeframe: null,
      tradingView: {
        interval: null,
        symbol: null,
        url: null,
      },
    };
  }

  const tradingViewSymbol = toTradingViewSymbol({
    exchange: signal.exchange,
    symbol: signal.symbol,
  });

  return {
    availableTimeframes: availableTimeframes(signal),
    selectedTimeframe: signal.timeframe,
    tradingView: {
      interval: signal.timeframe,
      symbol: tradingViewSymbol,
      url: buildTradingViewUrl({
        baseUrl: "https://www.tradingview.com/chart/",
        exchange: signal.exchange,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
      }),
    },
  };
}

export function buildSignalBackendDossier({
  lightScanCandidates,
  snapshot,
  symbol,
}: {
  lightScanCandidates?: ScanLightScanCandidate[];
  snapshot: MarketRadarSnapshot;
  symbol: string;
}): SignalBackendDossier {
  const signal = snapshot.signals.find((item) => signalMatches(item, symbol)) ?? null;

  return {
    found: signal !== null,
    generatedAt: snapshot.metadata.generatedAt,
    guardrails: [
      "no_auto_execution",
      "no_auto_weight_change",
      "no_live_ranking_mutation",
      "report_is_translation_only",
      "tradingview_is_external_chart",
    ],
    symbol: signal?.symbol ?? displayMissingSymbol(symbol),
    chart: chartContext(signal),
    evidence: evidenceSummary(signal),
    journal: journalSummary({
      signal,
      snapshot,
    }),
    discovery: discoveryContext({
      lightScanCandidates,
      symbol: signal?.symbol ?? symbol,
    }),
    signal: signal
      ? {
          confidence: signal.confidence,
          direction: signal.direction,
          exchange: signal.exchange,
          id: signal.id,
          risk: signal.risk,
          state: signal.state,
          summary: signal.summary,
          ...(signal.timeframeGate ? { timeframeGate: signal.timeframeGate } : {}),
          timeframe: signal.timeframe,
          updatedAt: signal.updatedAt,
        }
      : null,
    execution: executionContext(snapshot, signal?.symbol ?? symbol),
    strategyV3: signal?.strategyV3 ?? null,
  };
}
