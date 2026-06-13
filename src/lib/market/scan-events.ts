import type { SignalSetDelta } from "./live-refresh";
import type { ScanArchiveBundle, ScanArchiveSummary, ScanComparison } from "./types";

export type ScanEventType =
  | "new_signal"
  | "signal_removed"
  | "signal_shift"
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
  liveDelta?: SignalSetDelta | null;
  liveGeneratedAt?: string;
  liveScanId?: string;
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

function buildLiveDeltaEvents({
  generatedAt,
  liveDelta,
  scanId,
}: {
  generatedAt: string;
  liveDelta: SignalSetDelta | null | undefined;
  scanId: string;
}): ScanEvent[] {
  if (!liveDelta?.hasActionableChange) {
    return [];
  }

  const events: ScanEvent[] = [];

  if (liveDelta.newSymbols.length > 0) {
    events.push({
      actionHint: "这是前端刚刚捕捉到的新增异动，先打开K线和失效位，不允许直接追。",
      detail: `${symbolText(liveDelta.newSymbols)} 刚进入实时候选，需要马上做结构确认。`,
      generatedAt,
      id: `${scanId}:live:new:${liveDelta.newSymbols.join("-")}`,
      severity: "hot",
      symbols: liveDelta.newSymbols,
      title: "实时新增异动",
      type: "new_signal",
    });
  }

  if (liveDelta.changedSymbols.length > 0) {
    events.push({
      actionHint: "变化代表条件有移动，重新检查触发价、状态和风险等级。",
      detail: `${symbolText(liveDelta.changedSymbols)} 的方向、状态、周期或策略字段发生变化。`,
      generatedAt,
      id: `${scanId}:live:shift:${liveDelta.changedSymbols.join("-")}`,
      severity: "watch",
      symbols: liveDelta.changedSymbols,
      title: "实时信号变化",
      type: "signal_shift",
    });
  }

  if (liveDelta.removedSymbols.length > 0) {
    events.push({
      actionHint: "候选冷却只代表原条件失效，不自动构成反向交易理由。",
      detail: `${symbolText(liveDelta.removedSymbols)} 从实时候选中移除，等待下一轮重新确认。`,
      generatedAt,
      id: `${scanId}:live:removed:${liveDelta.removedSymbols.join("-")}`,
      severity: "cooldown",
      symbols: liveDelta.removedSymbols,
      title: "实时候选冷却",
      type: "signal_removed",
    });
  }

  return events;
}

export function buildScanEventFeed(
  archive: ScanArchiveBundle | undefined,
  {
    limit = 8,
    liveDelta,
    liveGeneratedAt,
    liveScanId,
  }: BuildScanEventFeedOptions = {},
): ScanEvent[] {
  const events: ScanEvent[] = [];
  const fallbackGeneratedAt = liveGeneratedAt ?? archive?.entries[0]?.generatedAt ?? new Date(0).toISOString();

  events.push(...buildLiveDeltaEvents({
    generatedAt: fallbackGeneratedAt,
    liveDelta,
    scanId: liveScanId ?? "live-scan",
  }));

  if (!archive) {
    return events.slice(0, limit);
  }

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
