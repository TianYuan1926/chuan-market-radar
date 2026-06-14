import { BellRing, CircleAlert, History, RadioTower, TrendingUp } from "lucide-react";
import type { AlertEvent } from "@/lib/alerts/alert-policy";
import { buildScanEventFeed, type ScanEvent } from "@/lib/market/scan-events";
import type { SignalSetDelta } from "@/lib/market/live-refresh";
import type { ScanArchiveBundle } from "@/lib/market/types";

type EventCenterPanelProps = {
  alertEvents?: AlertEvent[];
  archive?: ScanArchiveBundle;
  liveDelta?: SignalSetDelta | null;
  liveGeneratedAt?: string;
  liveScanId?: string;
};

type DisplayEvent = {
  actionHint: string;
  detail: string;
  generatedAt: string;
  id: string;
  severity: ScanEvent["severity"] | "critical" | "operations" | "high";
  symbols: string[];
  title: string;
  type: ScanEvent["type"] | AlertEvent["type"];
};

function formatEventTime(value: string) {
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

function eventIcon(event: DisplayEvent) {
  if (event.type === "signal_alert") {
    return <BellRing size={15} strokeWidth={2.3} />;
  }

  if (event.type === "system_failed" || event.type === "signal_removed") {
    return <CircleAlert size={15} strokeWidth={2.3} />;
  }

  if (event.type === "system_stale" || event.type === "system_shift") {
    return <RadioTower size={15} strokeWidth={2.3} />;
  }

  if (event.type === "new_signal") {
    return <BellRing size={15} strokeWidth={2.3} />;
  }

  if (event.type === "scan_delta" || event.type === "signal_shift") {
    return <TrendingUp size={15} strokeWidth={2.3} />;
  }

  return <History size={15} strokeWidth={2.3} />;
}

function formatSymbols(symbols: string[]) {
  return symbols.map((symbol) => symbol.replace(/USDT$/, "")).slice(0, 4);
}

function eventTypeLabel(type: DisplayEvent["type"]) {
  const labels: Record<string, string> = {
    new_signal: "新增信号",
    scan_delta: "扫描变化",
    signal_alert: "信号告警",
    signal_removed: "信号移除",
    signal_shift: "信号变化",
    system_failed: "系统失败",
    system_shift: "系统变化",
    system_stale: "系统延迟",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function alertToDisplayEvent(event: AlertEvent): DisplayEvent {
  return {
    actionHint: event.actionHint,
    detail: event.detail,
    generatedAt: event.generatedAt,
    id: event.id,
    severity: event.severity,
    symbols: event.symbol ? [event.symbol] : [],
    title: event.title,
    type: event.type,
  };
}

export function EventCenterPanel({
  alertEvents = [],
  archive,
  liveDelta,
  liveGeneratedAt,
  liveScanId,
}: EventCenterPanelProps) {
  const events: DisplayEvent[] = [
    ...alertEvents.map(alertToDisplayEvent),
    ...buildScanEventFeed(archive, {
      limit: 7,
      liveDelta,
      liveGeneratedAt,
      liveScanId,
    }),
  ].slice(0, 7);

  return (
    <section className="module event-module">
      <div className="module-head">
        <h2>事件中心</h2>
        <span className="tag">{events.length} 事件</span>
      </div>

      {events.length > 0 ? (
        <div className="event-stream" aria-label="异动事件流">
          {events.map((event) => (
            <article className={`event-card event-card--${event.severity}`} key={event.id}>
              <div className="event-card__rail">
                {eventIcon(event)}
                <span>{formatEventTime(event.generatedAt)}</span>
              </div>
              <div className="event-card__body">
                <div className="event-card__title">
                  <strong>{event.title}</strong>
                  <span className="mono">{eventTypeLabel(event.type)}</span>
                </div>
                {event.symbols.length > 0 ? (
                  <div className="event-symbols" aria-label="事件币种">
                    {formatSymbols(event.symbols).map((symbol) => (
                      <span key={`${event.id}-${symbol}`}>{symbol}</span>
                    ))}
                  </div>
                ) : null}
                <p>{event.detail}</p>
                <small>{event.actionHint}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>等待第一轮扫描事件。</p>
        </div>
      )}
    </section>
  );
}
