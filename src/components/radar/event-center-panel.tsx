import { BellRing, CircleAlert, History, RadioTower, TrendingUp } from "lucide-react";
import { buildScanEventFeed, type ScanEvent } from "@/lib/market/scan-events";
import type { ScanArchiveBundle } from "@/lib/market/types";

type EventCenterPanelProps = {
  archive?: ScanArchiveBundle;
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

function eventIcon(event: ScanEvent) {
  if (event.type === "new_signal") {
    return <BellRing size={15} strokeWidth={2.3} />;
  }

  if (event.type === "signal_removed") {
    return <CircleAlert size={15} strokeWidth={2.3} />;
  }

  if (event.type === "system_shift") {
    return <RadioTower size={15} strokeWidth={2.3} />;
  }

  if (event.type === "scan_delta") {
    return <TrendingUp size={15} strokeWidth={2.3} />;
  }

  return <History size={15} strokeWidth={2.3} />;
}

function formatSymbols(symbols: string[]) {
  return symbols.map((symbol) => symbol.replace(/USDT$/, "")).slice(0, 4);
}

export function EventCenterPanel({ archive }: EventCenterPanelProps) {
  const events = buildScanEventFeed(archive, {
    limit: 7,
  });

  return (
    <section className="module event-module">
      <div className="module-head">
        <h2>事件中心</h2>
        <span className="tag">{events.length} EVENTS</span>
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
                  <span className="mono">{event.type.replaceAll("_", " ")}</span>
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
