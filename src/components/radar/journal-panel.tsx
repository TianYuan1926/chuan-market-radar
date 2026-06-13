import { BookOpenCheck, ClipboardList, ShieldCheck } from "lucide-react";
import type { JournalAction, JournalEvent, MarketSignal } from "@/lib/analysis/types";

type JournalPanelProps = {
  events: JournalEvent[];
  selected?: MarketSignal;
  status: "idle" | "saving" | "saved" | "error";
  onCreate: (action: JournalAction) => void;
};

const resultMeta = {
  win: { label: "命中" },
  loss: { label: "失误" },
  saved: { label: "避险" },
  watching: { label: "跟踪" },
} as const;

const statusText = {
  idle: "READY",
  saving: "SAVING",
  saved: "SAVED",
  error: "LOCAL",
} as const;

const actionButtons: {
  action: JournalAction;
  label: string;
  helper: string;
  Icon: typeof BookOpenCheck;
}[] = [
  {
    action: "track",
    label: "记录观察",
    helper: "进跟踪队列",
    Icon: BookOpenCheck,
  },
  {
    action: "paper_trade",
    label: "纸面跟踪",
    helper: "验证策略",
    Icon: ClipboardList,
  },
  {
    action: "skip",
    label: "拒绝追单",
    helper: "纪律加分",
    Icon: ShieldCheck,
  },
];

function formatReviewTime(value?: string) {
  if (!value) {
    return "待定";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function JournalPanel({ events, onCreate, selected, status }: JournalPanelProps) {
  const selectedLabel = selected?.symbol.replace("USDT", "") ?? "NONE";
  const trackingCount = events.filter((event) => event.reviewStatus === "tracking").length;

  return (
    <section className="module">
      <div className="module-head">
        <h2>复盘记录</h2>
        <span className="tag">{statusText[status]}</span>
      </div>

      <div className="journal-command">
        <div className="journal-selected">
          <span className="mono">SELECTED</span>
          <strong>{selectedLabel}</strong>
          <small>{selected?.strategy.status?.toUpperCase() ?? "WAITING"} / RR {selected?.strategy.riskReward.toFixed(2) ?? "0.00"}R</small>
        </div>

        <div className="journal-actions">
          {actionButtons.map(({ Icon, action, helper, label }) => (
            <button
              className="journal-action-button"
              disabled={!selected || status === "saving"}
              key={action}
              onClick={() => onCreate(action)}
              type="button"
            >
              <Icon aria-hidden="true" size={16} strokeWidth={2} />
              <span>
                <b>{label}</b>
                <small>{helper}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="journal-meta-grid" aria-label="复盘队列状态">
          <span><b>{events.length}</b> total</span>
          <span><b>{trackingCount}</b> tracking</span>
          <span><b>{formatReviewTime(events[0]?.plannedReviewAt)}</b> next</span>
        </div>
      </div>

      <div className="review-list">
        {events.map((event) => {
          const meta = resultMeta[event.result];

          return (
            <article className="review-row" key={event.id}>
              <strong>{event.symbol.replace("USDT", "")}</strong>
              <span className="row-note">
                <b>{meta.label} / {event.title}</b>
                <small>{event.trigger ?? event.note}</small>
              </span>
              <strong className={event.rankDelta > 0 ? "tone-good" : event.rankDelta < 0 ? "tone-bad" : "tone-amber"}>
                {event.rankDelta > 0 ? `+${event.rankDelta}` : event.rankDelta}
              </strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
