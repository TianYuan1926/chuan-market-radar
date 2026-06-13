import type {
  MarketRadarSnapshot,
  ScanArchiveSummary,
  ScanComparison,
  ScanReplayFrame,
} from "./types";

export type ScanArchiveStoreOptions = {
  maxEntries?: number;
  initialSnapshots?: MarketRadarSnapshot[];
};

export type ScanArchiveStore = {
  maxEntries: number;
  add: (snapshot: MarketRadarSnapshot) => ScanArchiveSummary;
  list: (limit?: number) => ScanArchiveSummary[];
  get: (id: string) => MarketRadarSnapshot | null;
  latest: () => ScanArchiveSummary | null;
  replay: (id?: string) => ScanReplayFrame | null;
  compareLatest: () => ScanComparison | null;
  clear: () => void;
};

type ArchiveEntry = {
  snapshot: MarketRadarSnapshot;
  summary: ScanArchiveSummary;
};

function compactSnapshot(snapshot: MarketRadarSnapshot): MarketRadarSnapshot {
  return {
    metadata: snapshot.metadata,
    instrumentPool: snapshot.instrumentPool,
    instruments: snapshot.instruments,
    tickers: snapshot.tickers,
    derivatives: snapshot.derivatives,
    heatmap: snapshot.heatmap,
    signals: snapshot.signals,
    journalEvents: snapshot.journalEvents,
  };
}

function sortSignalsByConfidence(snapshot: MarketRadarSnapshot) {
  return [...snapshot.signals].sort(
    (left, right) => right.confidence - left.confidence || left.symbol.localeCompare(right.symbol),
  );
}

function signalIdSet(snapshot: MarketRadarSnapshot) {
  return new Set(snapshot.signals.map((signal) => signal.id));
}

function signalSymbolsById(snapshot: MarketRadarSnapshot) {
  return new Map(snapshot.signals.map((signal) => [signal.id, signal.symbol]));
}

function replaySignalIdSet(frame: ScanReplayFrame) {
  return new Set(frame.signals.map((signal) => signal.id));
}

function replaySignalSymbolsById(frame: ScanReplayFrame) {
  return new Map(frame.signals.map((signal) => [signal.id, signal.symbol]));
}

export function summarizeScanSnapshot(snapshot: MarketRadarSnapshot): ScanArchiveSummary {
  return {
    id: snapshot.metadata.id,
    source: snapshot.metadata.source,
    status: snapshot.metadata.status,
    generatedAt: snapshot.metadata.generatedAt,
    scannedCount: snapshot.metadata.scannedCount,
    anomalyCount: snapshot.metadata.anomalyCount,
    candidateCount: snapshot.metadata.candidateCount,
    topSymbols: sortSignalsByConfidence(snapshot)
      .slice(0, 5)
      .map((signal) => signal.symbol),
    notes: snapshot.metadata.notes.slice(0, 4),
  };
}

export function createReplayFrame(snapshot: MarketRadarSnapshot): ScanReplayFrame {
  return {
    id: snapshot.metadata.id,
    source: snapshot.metadata.source,
    status: snapshot.metadata.status,
    generatedAt: snapshot.metadata.generatedAt,
    nextScanAt: snapshot.metadata.nextScanAt,
    cadenceMinutes: snapshot.metadata.cadenceMinutes,
    scannedCount: snapshot.metadata.scannedCount,
    anomalyCount: snapshot.metadata.anomalyCount,
    candidateCount: snapshot.metadata.candidateCount,
    signals: sortSignalsByConfidence(snapshot).map((signal) => ({
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      state: signal.state,
      timeframe: signal.timeframe,
      confidence: signal.confidence,
      risk: signal.risk,
      riskReward: signal.strategy.riskReward,
      strategyStatus: signal.strategy.status ?? "unknown",
      updatedAt: signal.updatedAt,
      summary: signal.summary,
    })),
  };
}

export function compareScanSnapshots(
  previous: MarketRadarSnapshot,
  current: MarketRadarSnapshot,
): ScanComparison {
  const previousIds = signalIdSet(previous);
  const currentIds = signalIdSet(current);
  const previousSymbols = signalSymbolsById(previous);
  const currentSymbols = signalSymbolsById(current);

  const newSignalSymbols = [...currentIds]
    .filter((id) => !previousIds.has(id))
    .map((id) => currentSymbols.get(id))
    .filter((symbol): symbol is string => Boolean(symbol));
  const removedSignalSymbols = [...previousIds]
    .filter((id) => !currentIds.has(id))
    .map((id) => previousSymbols.get(id))
    .filter((symbol): symbol is string => Boolean(symbol));

  return {
    fromId: previous.metadata.id,
    toId: current.metadata.id,
    scannedDelta: current.metadata.scannedCount - previous.metadata.scannedCount,
    anomalyDelta: current.metadata.anomalyCount - previous.metadata.anomalyCount,
    candidateDelta: current.metadata.candidateCount - previous.metadata.candidateCount,
    newSignalSymbols,
    removedSignalSymbols,
    statusChanged: previous.metadata.status !== current.metadata.status,
    sourceChanged: previous.metadata.source !== current.metadata.source,
  };
}

export function compareScanReplayFrames(
  previous: ScanReplayFrame,
  current: ScanReplayFrame,
): ScanComparison {
  const previousIds = replaySignalIdSet(previous);
  const currentIds = replaySignalIdSet(current);
  const previousSymbols = replaySignalSymbolsById(previous);
  const currentSymbols = replaySignalSymbolsById(current);

  const newSignalSymbols = [...currentIds]
    .filter((id) => !previousIds.has(id))
    .map((id) => currentSymbols.get(id))
    .filter((symbol): symbol is string => Boolean(symbol));
  const removedSignalSymbols = [...previousIds]
    .filter((id) => !currentIds.has(id))
    .map((id) => previousSymbols.get(id))
    .filter((symbol): symbol is string => Boolean(symbol));

  return {
    fromId: previous.id,
    toId: current.id,
    scannedDelta: current.scannedCount - previous.scannedCount,
    anomalyDelta: current.anomalyCount - previous.anomalyCount,
    candidateDelta: current.candidateCount - previous.candidateCount,
    newSignalSymbols,
    removedSignalSymbols,
    statusChanged: previous.status !== current.status,
    sourceChanged: previous.source !== current.source,
  };
}

export function createScanArchiveStore({
  initialSnapshots = [],
  maxEntries = 24,
}: ScanArchiveStoreOptions = {}): ScanArchiveStore {
  let entries: ArchiveEntry[] = [];

  const store: ScanArchiveStore = {
    maxEntries,

    add(snapshot) {
      const compact = compactSnapshot(snapshot);
      const summary = summarizeScanSnapshot(compact);

      entries = [
        {
          snapshot: compact,
          summary,
        },
        ...entries.filter((entry) => entry.summary.id !== summary.id),
      ].slice(0, maxEntries);

      return summary;
    },

    list(limit = maxEntries) {
      return entries.slice(0, limit).map((entry) => entry.summary);
    },

    get(id) {
      return entries.find((entry) => entry.summary.id === id)?.snapshot ?? null;
    },

    latest() {
      return entries[0]?.summary ?? null;
    },

    replay(id) {
      const snapshot = id ? store.get(id) : entries[0]?.snapshot ?? null;
      return snapshot ? createReplayFrame(snapshot) : null;
    },

    compareLatest() {
      if (entries.length < 2) {
        return null;
      }

      return compareScanSnapshots(entries[1].snapshot, entries[0].snapshot);
    },

    clear() {
      entries = [];
    },
  };

  for (const snapshot of initialSnapshots) {
    store.add(snapshot);
  }

  return store;
}
