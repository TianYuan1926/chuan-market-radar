import { Activity, GitCompareArrows, History, RotateCcw } from "lucide-react";
import type { ScanArchiveBundle, ScanArchiveSummary } from "@/lib/market/types";

type ReplayPanelProps = {
  archive?: ScanArchiveBundle;
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatDelta(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function deltaTone(value: number) {
  if (value > 0) {
    return "tone-good";
  }

  if (value < 0) {
    return "tone-bad";
  }

  return "tone-amber";
}

function symbolPreview(entry: ScanArchiveSummary) {
  if (!entry.topSymbols.length) {
    return "暂无信号";
  }

  return entry.topSymbols
    .slice(0, 3)
    .map((symbol) => symbol.replace("USDT", ""))
    .join(" / ");
}

function scanStatusLabel(value: string) {
  const labels: Record<string, string> = {
    failed: "失败",
    partial: "部分",
    ready: "就绪",
    stale: "延迟",
  };

  return labels[value] ?? value;
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = {
    coingecko: "CoinGecko",
    coinglass: "CoinGlass",
    composite: "聚合源",
    exchange_public: "交易所公开源",
    mock: "演示源",
  };

  return labels[value] ?? value;
}

export function ReplayPanel({ archive }: ReplayPanelProps) {
  const entries = archive?.entries ?? [];
  const latest = archive?.latestReplay;
  const comparison = archive?.comparison;

  return (
    <section className="module replay-module">
      <div className="module-head">
        <h2>扫描回放</h2>
        <span className="tag">{entries.length} 帧</span>
      </div>

      <div className="replay-command">
        <div className="replay-primary">
          <div className="replay-orbit" aria-hidden="true">
            <RotateCcw size={22} strokeWidth={2.4} />
          </div>
          <span className="mono">最新帧</span>
          <strong>{latest ? formatTime(latest.generatedAt) : "--:--"}</strong>
          <small>
            {latest
              ? `${scanStatusLabel(latest.status)} / ${sourceLabel(latest.source)} / ${latest.signals.length} 信号`
              : "等待"}
          </small>
        </div>

        <div className="replay-delta-grid" aria-label="扫描差值">
          <span>
            <Activity size={14} strokeWidth={2.2} />
            <b className={comparison ? deltaTone(comparison.anomalyDelta) : "tone-amber"}>
              {comparison ? formatDelta(comparison.anomalyDelta) : "0"}
            </b>
            异动
          </span>
          <span>
            <GitCompareArrows size={14} strokeWidth={2.2} />
            <b className={comparison ? deltaTone(comparison.candidateDelta) : "tone-amber"}>
              {comparison ? formatDelta(comparison.candidateDelta) : "0"}
            </b>
            候选
          </span>
        </div>

        <div className="replay-change-line">
          <span>
            <b>新增</b>
            {comparison?.newSignalSymbols.length
              ? comparison.newSignalSymbols.map((symbol) => symbol.replace("USDT", "")).join(" / ")
              : "无"}
          </span>
          <span>
            <b>移除</b>
            {comparison?.removedSignalSymbols.length
              ? comparison.removedSignalSymbols.map((symbol) => symbol.replace("USDT", "")).join(" / ")
              : "无"}
          </span>
        </div>
      </div>

      <div className="replay-timeline">
        {entries.map((entry, index) => (
          <article className="replay-frame" key={entry.id}>
            <div className="replay-frame__rail">
              <History size={14} strokeWidth={2.2} />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="replay-frame__body">
              <strong>{formatTime(entry.generatedAt)} / {symbolPreview(entry)}</strong>
              <small>
                {scanStatusLabel(entry.status)} / 扫描 {entry.scannedCount} / 异动 {entry.anomalyCount} /
                候选 {entry.candidateCount}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
