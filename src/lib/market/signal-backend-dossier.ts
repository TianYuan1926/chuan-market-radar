import type { Timeframe } from "@/lib/analysis/types";
import type { StrategyV3Dossier } from "@/lib/analysis/v3/types";
import type { JournalEvent, MarketSignal } from "../analysis/types";
import { buildTradingViewUrl, toTradingViewSymbol } from "./tradingview-links";
import type { MarketRadarSnapshot } from "./types";

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
  signal: {
    confidence: number;
    direction: MarketSignal["direction"];
    exchange: string;
    id: string;
    risk: MarketSignal["risk"];
    state: MarketSignal["state"];
    summary: string;
    timeframe: MarketSignal["timeframe"];
    updatedAt: string;
  } | null;
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
  snapshot,
  symbol,
}: {
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
    signal: signal
      ? {
          confidence: signal.confidence,
          direction: signal.direction,
          exchange: signal.exchange,
          id: signal.id,
          risk: signal.risk,
          state: signal.state,
          summary: signal.summary,
          timeframe: signal.timeframe,
          updatedAt: signal.updatedAt,
        }
      : null,
    strategyV3: signal?.strategyV3 ?? null,
  };
}
