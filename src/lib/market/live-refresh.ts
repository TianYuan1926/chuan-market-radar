import type { MarketSignal } from "../analysis/types";

export type RefreshPlanReason = "next_scan" | "min_guard" | "max_guard" | "fallback";

export type RefreshPlan = {
  intervalMs: number;
  reason: RefreshPlanReason;
};

export type SignalSetDelta = {
  changedSymbols: string[];
  hasActionableChange: boolean;
  isNewScan: boolean;
  newSymbols: string[];
  removedSymbols: string[];
};

export type CompareSignalSetsOptions = {
  nextScanId: string;
  nextSignals: MarketSignal[];
  previousScanId: string;
  previousSignals: MarketSignal[];
};

export type SignalSoundOptions = {
  delta: SignalSetDelta;
  firstLoad: boolean;
  pageVisible: boolean;
  soundEnabled: boolean;
};

const defaultRefreshMs = 60_000;
const minRefreshMs = 45_000;
const maxRefreshMs = 180_000;
const scanSettleMs = 5_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function bySymbol(signals: MarketSignal[]) {
  return new Map(signals.map((signal) => [signal.symbol, signal]));
}

function signalFingerprint(signal: MarketSignal) {
  return [
    signal.direction,
    signal.state,
    signal.timeframe,
    signal.risk,
    signal.confidence,
    signal.strategy.status ?? "unknown",
    signal.strategy.riskReward,
  ].join("|");
}

export function buildRefreshPlan({
  fallbackMs = defaultRefreshMs,
  maxMs = maxRefreshMs,
  minMs = minRefreshMs,
  nextScanAt,
  now,
}: {
  fallbackMs?: number;
  maxMs?: number;
  minMs?: number;
  nextScanAt: string;
  now: Date;
}): RefreshPlan {
  const nextScanTime = new Date(nextScanAt).getTime();

  if (Number.isNaN(nextScanTime)) {
    return {
      intervalMs: clamp(fallbackMs, minMs, maxMs),
      reason: "fallback",
    };
  }

  const intervalMs = nextScanTime - now.getTime() + scanSettleMs;

  if (intervalMs < minMs) {
    return {
      intervalMs: minMs,
      reason: "min_guard",
    };
  }

  if (intervalMs > maxMs) {
    return {
      intervalMs: maxMs,
      reason: "max_guard",
    };
  }

  return {
    intervalMs,
    reason: "next_scan",
  };
}

export function compareSignalSets({
  nextScanId,
  nextSignals,
  previousScanId,
  previousSignals,
}: CompareSignalSetsOptions): SignalSetDelta {
  const previousBySymbol = bySymbol(previousSignals);
  const nextBySymbol = bySymbol(nextSignals);
  const newSymbols = nextSignals
    .map((signal) => signal.symbol)
    .filter((symbol) => !previousBySymbol.has(symbol));
  const removedSymbols = previousSignals
    .map((signal) => signal.symbol)
    .filter((symbol) => !nextBySymbol.has(symbol));
  const changedSymbols = nextSignals
    .filter((signal) => {
      const previous = previousBySymbol.get(signal.symbol);

      return previous ? signalFingerprint(previous) !== signalFingerprint(signal) : false;
    })
    .map((signal) => signal.symbol);
  const isNewScan = previousScanId !== nextScanId;
  const hasActionableChange = isNewScan &&
    (newSymbols.length > 0 || removedSymbols.length > 0 || changedSymbols.length > 0);

  return {
    changedSymbols,
    hasActionableChange,
    isNewScan,
    newSymbols,
    removedSymbols,
  };
}

export function shouldPlaySignalSound({
  delta,
  firstLoad,
  pageVisible,
  soundEnabled,
}: SignalSoundOptions) {
  return soundEnabled && pageVisible && !firstLoad && delta.hasActionableChange;
}
