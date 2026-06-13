import type { ScanArchiveBundle, ScanArchiveSummary, ScanComparison } from "./types";

export type ScanEventType =
  | "new_signal"
  | "signal_removed"
  | "scan_delta"
  | "system_shift"
  | "scan_heartbeat";

export type ScanEventSeverity = "hot" | "watch" | "cooldown" | "system" | "quiet";

export type ScanEvent = {
  actionHint: string;
  detail: string;
  generatedAt: string;
  id: string;
  metrics?: {
    anomalyDelta?: number;
    candidateDelta?: number;
    scannedDelta?: number;
  };
  severity: ScanEventSeverity;
  symbols: string[];
  title: string;
  type: ScanEventType;
};

export type BuildScanEventFeedOptions = {
  limit?: number;
};

function stripQuote(symbol: string) {
  return symbol.replace(/USDT$/, "");
}

function symbolText(symbols: string[]) {
  return symbols.length > 0 ? symbols.map(stripQuote).join(" / ") : "无";
}

function comparisonTime(comparison: ScanComparison, entries: ScanArchiveSummary[]) {
  return entries.find((entry) => entry.id === comparison.toId)?.generatedAt ??
    entries[0]?.generatedAt ??
    new Date(0).toISOString();
}

function heartbeatSeverity(entry: ScanArchiveSummary): ScanEventSeverity {
  if (entry.status === "failed") {
    return "system";
  }

  if (entry.status === "stale" || entry.status === "partial") {
    return "watch";
  }

  return "quiet";
}

function heartbeatDetail(entry: ScanArchiveSummary) {
  const symbols = entry.topSymbols.length ? symbolText(entry.topSymbols.slice(0, 3)) : "没有候选";
  const batchNote = entry.notes.find((note) => note.startsWith("batch "));

  return `${entry.status} / scan ${entry.scannedCount} / anomaly ${entry.anomalyCount} / ${symbols}${
    batchNote ? ` / ${batchNote}` : ""
  }`;
}

function hasScanDelta(comparison: ScanComparison) {
  return comparison.anomalyDelta !== 0 ||
    comparison.candidateDelta !== 0 ||
    comparison.scannedDelta !== 0;
}

export function buildScanEventFeed(
  archive: ScanArchiveBundle | undefined,
  { limit = 8 }: BuildScanEventFeedOptions = {},
): ScanEvent[] {
  if (!archive) {
    return [];
  }

  const events: ScanEvent[] = [];
  const comparison = archive.comparison;

  if (comparison) {
    const generatedAt = comparisonTime(comparison, archive.entries);

    if (comparison.newSignalSymbols.length > 0) {
      events.push({
        actionHint: "先看结构位置和失效点，禁止因为新增候选直接追单。",
        detail: `${symbolText(comparison.newSignalSymbols)} 进入候选池，需要进入反证检查。`,
        generatedAt,
        id: `${comparison.toId}:new:${comparison.newSignalSymbols.join("-")}`,
        severity: "hot",
        symbols: comparison.newSignalSymbols,
        title: "新增异动候选",
        type: "new_signal",
      });
    }

    if (comparison.removedSignalSymbols.length > 0) {
      events.push({
        actionHint: "从候选池移除不等于反向开仓，只代表原信号不再满足条件。",
        detail: `${symbolText(comparison.removedSignalSymbols)} 已离开候选池，等待下一轮重新确认。`,
        generatedAt,
        id: `${comparison.toId}:removed:${comparison.removedSignalSymbols.join("-")}`,
        severity: "cooldown",
        symbols: comparison.removedSignalSymbols,
        title: "候选冷却",
        type: "signal_removed",
      });
    }

    if (comparison.statusChanged || comparison.sourceChanged) {
      events.push({
        actionHint: "先确认数据源和扫描状态，再决定是否采信当前候选。",
        detail: "状态或数据源发生变化，需要检查系统状态面板和扫描备注。",
        generatedAt,
        id: `${comparison.toId}:system-shift`,
        severity: "system",
        symbols: [],
        title: "系统状态切换",
        type: "system_shift",
      });
    }

    if (hasScanDelta(comparison)) {
      events.push({
        actionHint: "强度变化只说明环境变了，交易动作仍要服从策略门槛。",
        detail: `异常 ${comparison.anomalyDelta >= 0 ? "+" : ""}${comparison.anomalyDelta} / 候选 ${
          comparison.candidateDelta >= 0 ? "+" : ""
        }${comparison.candidateDelta} / 扫描 ${comparison.scannedDelta >= 0 ? "+" : ""}${comparison.scannedDelta}`,
        generatedAt,
        id: `${comparison.toId}:delta`,
        metrics: {
          anomalyDelta: comparison.anomalyDelta,
          candidateDelta: comparison.candidateDelta,
          scannedDelta: comparison.scannedDelta,
        },
        severity: comparison.anomalyDelta > 0 || comparison.candidateDelta > 0 ? "watch" : "quiet",
        symbols: [],
        title: "扫描强度变化",
        type: "scan_delta",
      });
    }
  }

  for (const entry of archive.entries) {
    events.push({
      actionHint: "作为上下文记录，不单独构成交易理由。",
      detail: heartbeatDetail(entry),
      generatedAt: entry.generatedAt,
      id: `${entry.id}:heartbeat`,
      severity: heartbeatSeverity(entry),
      symbols: entry.topSymbols.slice(0, 3),
      title: "扫描心跳",
      type: "scan_heartbeat",
    });
  }

  return events.slice(0, limit);
}
