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

const outcomeMeta = {
  pending: { label: "待复查" },
  partial_win: { label: "首目标" },
  saved: { label: "已避险" },
  loss: { label: "已失效" },
  expired: { label: "已过期" },
} as const;

const statusText = {
  idle: "就绪",
  saving: "保存中",
  saved: "已保存",
  error: "本地",
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

function nextReviewAt(event: JournalEvent) {
  return event.reviewCheckpoints?.find((checkpoint) => checkpoint.status !== "complete")?.reviewAt ??
    event.reviewCheckpoints?.at(-1)?.reviewAt ??
    event.plannedReviewAt;
}

function nextQueueReviewAt(events: JournalEvent[]) {
  const pending = events
    .map(nextReviewAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => {
      const leftTime = new Date(left).getTime();
      const rightTime = new Date(right).getTime();

      return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
    });

  return pending[0];
}

function outcomeLabel(event: JournalEvent) {
  return event.outcomeStatus ? outcomeMeta[event.outcomeStatus].label : resultMeta[event.result].label;
}

function hitLabel(value?: boolean) {
  return value ? "已到" : "等待";
}

function strategyStatusLabel(value?: string) {
  if (!value) {
    return "等待候选";
  }

  const labels: Record<string, string> = {
    actionable: "可执行",
    blocked: "已阻断",
    confirmed: "已确认",
    cooldown: "冷却中",
    invalidated: "已失效",
    near_trigger: "接近触发",
    observe_only: "只观察",
    pending: "待确认",
    tracking: "跟踪中",
    triggered: "已触发",
    waiting: "等待",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function reviewStatusLabel(value?: string) {
  if (!value) {
    return "进行中";
  }

  const labels: Record<string, string> = {
    closed: "已关闭",
    complete: "完成",
    open: "进行中",
    queued: "排队中",
    tracking: "跟踪中",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

export function JournalPanel({ events, onCreate, selected, status }: JournalPanelProps) {
  const selectedLabel = selected?.symbol.replace("USDT", "") ?? "未选择";
  const trackingCount = events.filter((event) => event.reviewStatus === "tracking").length;
  const queueReviewAt = nextQueueReviewAt(events);

  return (
    <section className="module">
      <div className="module-head">
        <h2>复盘记录</h2>
        <span className="tag">{statusText[status]}</span>
      </div>

      <div className="journal-command">
        <div className="journal-selected">
          <span className="mono">当前标的</span>
          <strong>{selectedLabel}</strong>
          <small>{strategyStatusLabel(selected?.strategy.status)} / RR {selected?.strategy.riskReward.toFixed(2) ?? "0.00"}R</small>
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
          <span><b>{events.length}</b> 总数</span>
          <span><b>{trackingCount}</b> 跟踪</span>
          <span><b>{formatReviewTime(queueReviewAt)}</b> 下次</span>
        </div>
      </div>

      <div className="review-list">
        {events.map((event) => {
          const meta = resultMeta[event.result];

          return (
            <article className="review-row" key={event.id}>
              <strong>{event.symbol.replace("USDT", "")}</strong>
              <span className="row-note">
                <b>{outcomeLabel(event)} / {event.title}</b>
                <small>{event.trigger ?? event.note}</small>
                <span className="review-row__state">
                  <span>{meta.label}</span>
                  <span>复查 {formatReviewTime(nextReviewAt(event))}</span>
                  <span>{reviewStatusLabel(event.reviewStatus)}</span>
                </span>
                <span className="review-row__flags" aria-label={`${event.symbol} 复盘状态`}>
                  <span className={event.triggerHit ? "is-hit" : ""}>触发 {hitLabel(event.triggerHit)}</span>
                  <span className={event.invalidationHit ? "is-hit is-bad" : ""}>失效 {hitLabel(event.invalidationHit)}</span>
                  <span className={event.firstTargetHit ? "is-hit" : ""}>目标1 {hitLabel(event.firstTargetHit)}</span>
                </span>
                {(event.lessons?.length ?? 0) > 0 ? (
                  <span className="lesson-tags">
                    {event.lessons?.slice(0, 3).map((lesson) => (
                      <i key={lesson}>{lesson}</i>
                    ))}
                  </span>
                ) : null}
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
