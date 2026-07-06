import type { MarketSignal, SignalState } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";

export type AlertSeverity = "watch" | "high" | "critical" | "operations";
export type AlertSound = "none" | "tick" | "pulse" | "alarm";
export type AlertType = "signal_alert" | "system_stale" | "system_failed";
export type AlertSignalThreshold = Exclude<AlertSeverity, "operations">;

export type AlertEvent = {
  actionHint: string;
  detail: string;
  generatedAt: string;
  id: string;
  severity: AlertSeverity;
  sound: AlertSound;
  state?: SignalState;
  symbol?: string;
  title: string;
  type: AlertType;
};

export type AlertHistoryStatus = "active" | "archived" | "seen";

export type AlertHistoryEntry = AlertEvent & {
  archivedAt?: string;
  historyStatus: AlertHistoryStatus;
  seenAt?: string;
};

export type AlertHistoryAction = {
  alertId: string;
  at: string;
  type: "archive" | "restore" | "seen";
};

export type AlertHistoryFilter = "active" | "all" | "archived" | "signal" | "system" | "unseen";

export type AlertHistoryReport = {
  activeCount: number;
  allowedUse: "in_app_only";
  archivedCount: number;
  canUseTelegram: false;
  canUseWebhook: false;
  entries: AlertHistoryEntry[];
  externalChannelsEnabled: false;
  filter: AlertHistoryFilter;
  guardrail: string;
  retentionLimit: number;
  totalCount: number;
  unseenCount: number;
};

export type AlertBuildMetadata = {
  generatedAt: string;
  scanId: string;
};

export type QuietHours = {
  endHour: number;
  startHour: number;
  timeZone: string;
};

export type AlertPreferences = {
  browserNotificationsEnabled: boolean;
  dedupeWindowMinutes: number;
  minimumSignalSeverity: AlertSignalThreshold;
  quietHours: QuietHours;
  quietHoursEnabled: boolean;
  soundEnabled: boolean;
};

export type SoundProfile = {
  muted: boolean;
  name: AlertSound;
  shouldPlay: boolean;
  volume: number;
};

export type AlertControlReport = {
  activeChannels: string[];
  allowedUse: "in_app_only";
  canUseTelegram: false;
  canUseWebhook: false;
  dedupeWindowMinutes: number;
  externalChannelsEnabled: false;
  mode: "local_alert_control_mvp";
  operatorHint: string;
  quietHoursLabel: string;
  soundArmed: boolean;
  suppressedByQuietHours: boolean;
  thresholdLabel: string;
};

const defaultDedupeWindowMs = 8 * 60 * 1000;
const defaultAlertHistoryLimit = 50;

export function mergeAlertEventsById(events: AlertEvent[], limit = 12) {
  const eventsById = new Map<string, AlertEvent>();

  for (const event of events) {
    if (!eventsById.has(event.id)) {
      eventsById.set(event.id, event);
    }
  }

  return Array.from(eventsById.values()).slice(0, limit);
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function latestAlertEvents(events: AlertEvent[]) {
  const sortedEvents = [...events].sort((left, right) => sortableTime(right.generatedAt) - sortableTime(left.generatedAt));
  const seenIds = new Set<string>();
  const uniqueEvents: AlertEvent[] = [];

  for (const event of sortedEvents) {
    if (seenIds.has(event.id)) {
      continue;
    }

    seenIds.add(event.id);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function actionsForAlert(actions: AlertHistoryAction[], alertId: string) {
  return actions
    .filter((action) => action.alertId === alertId)
    .sort((left, right) => sortableTime(left.at) - sortableTime(right.at));
}

function historyEntryFor(event: AlertEvent, actions: AlertHistoryAction[]): AlertHistoryEntry {
  let archivedAt: string | undefined;
  let seenAt: string | undefined;

  for (const action of actionsForAlert(actions, event.id)) {
    if (action.type === "seen") {
      seenAt = action.at;
      continue;
    }

    if (action.type === "archive") {
      archivedAt = action.at;
      seenAt = seenAt ?? action.at;
      continue;
    }

    archivedAt = undefined;
  }

  return {
    ...event,
    archivedAt,
    historyStatus: archivedAt ? "archived" : seenAt ? "seen" : "active",
    seenAt,
  };
}

function keepHistoryEntryForFilter(entry: AlertHistoryEntry, filter: AlertHistoryFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return entry.historyStatus !== "archived";
  }

  if (filter === "unseen") {
    return entry.historyStatus === "active";
  }

  if (filter === "archived") {
    return entry.historyStatus === "archived";
  }

  if (filter === "signal") {
    return entry.type === "signal_alert" && entry.historyStatus !== "archived";
  }

  return entry.type !== "signal_alert" && entry.historyStatus !== "archived";
}

export function buildAlertHistoryReport(
  events: AlertEvent[],
  actions: AlertHistoryAction[] = [],
  options: {
    filter?: AlertHistoryFilter;
    limit?: number;
  } = {},
): AlertHistoryReport {
  const retentionLimit = Math.max(1, Math.floor(options.limit ?? defaultAlertHistoryLimit));
  const filter = options.filter ?? "active";
  const entries = latestAlertEvents(events)
    .map((event) => historyEntryFor(event, actions));
  const filteredEntries = entries
    .filter((entry) => keepHistoryEntryForFilter(entry, filter))
    .slice(0, retentionLimit);

  return {
    activeCount: entries.filter((entry) => entry.historyStatus !== "archived").length,
    allowedUse: "in_app_only",
    archivedCount: entries.filter((entry) => entry.historyStatus === "archived").length,
    canUseTelegram: false,
    canUseWebhook: false,
    entries: filteredEntries,
    externalChannelsEnabled: false,
    filter,
    guardrail: "站内告警历史只用于本地查看、标记已读和归档，不接 Telegram/Webhook，不自动下单。",
    retentionLimit,
    totalCount: entries.length,
    unseenCount: entries.filter((entry) => entry.historyStatus === "active").length,
  };
}

function stripQuote(symbol: string) {
  return symbol.replace(/USDT$/, "");
}

function severityForSignal(signal: MarketSignal): AlertSeverity | null {
  if (signal.state === "triggered") {
    return "critical";
  }

  if (signal.state === "near_trigger") {
    return "high";
  }

  if (signal.state === "waiting_confirmation" || signal.state === "abnormal_watch") {
    return "watch";
  }

  return null;
}

function severityRank(severity: AlertSignalThreshold) {
  return {
    critical: 3,
    high: 2,
    watch: 1,
  }[severity];
}

function signalAlertSeverity(event: AlertEvent): AlertSignalThreshold | null {
  if (event.type !== "signal_alert" || event.severity === "operations") {
    return null;
  }

  return event.severity;
}

function soundNameForSeverity(severity: AlertSeverity): AlertSound {
  const sounds: Record<AlertSeverity, AlertSound> = {
    critical: "alarm",
    high: "pulse",
    operations: "pulse",
    watch: "tick",
  };

  return sounds[severity];
}

function titleForSignal(signal: MarketSignal, severity: AlertSeverity) {
  const symbol = stripQuote(signal.symbol);

  if (severity === "critical") {
    return `${symbol} 已触发`;
  }

  if (severity === "high") {
    return `${symbol} 接近触发`;
  }

  return `${symbol} 进入观察`;
}

function actionHintForSignal(signal: MarketSignal, severity: AlertSeverity) {
  if (severity === "critical") {
    return `先打开 K 线确认触发条件，再检查失效位：${signal.strategy.invalidation}`;
  }

  if (severity === "high") {
    return `只允许做触发前检查，不允许因为告警直接追单。失效条件：${signal.strategy.invalidation}`;
  }

  return "保持观察，等待结构、成交量和失效位同时清楚。";
}

function soundVolumeForSeverity(severity: AlertSeverity) {
  return {
    critical: 0.1,
    high: 0.07,
    operations: 0.06,
    watch: 0.04,
  }[severity];
}

function hourInTimeZone(value: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);

  return Number(hour);
}

function isQuietHour(now: Date, quietHours?: QuietHours) {
  if (!quietHours) {
    return false;
  }

  const hour = hourInTimeZone(now, quietHours.timeZone);

  if (Number.isNaN(hour)) {
    return false;
  }

  if (quietHours.startHour === quietHours.endHour) {
    return true;
  }

  if (quietHours.startHour < quietHours.endHour) {
    return hour >= quietHours.startHour && hour < quietHours.endHour;
  }

  return hour >= quietHours.startHour || hour < quietHours.endHour;
}

export function buildAlertEvent(
  signal: MarketSignal,
  metadata: AlertBuildMetadata,
): AlertEvent | null {
  const severity = severityForSignal(signal);

  if (!severity) {
    return null;
  }

  return {
    actionHint: actionHintForSignal(signal, severity),
    detail: `${signal.summary} / 结构盈亏比 ${signal.strategy.riskReward.toFixed(2)}:1 / ${signal.timeframe}`,
    generatedAt: metadata.generatedAt,
    id: `${metadata.scanId}:alert:${signal.symbol}:${signal.state}`,
    severity,
    sound: soundNameForSeverity(severity),
    state: signal.state,
    symbol: signal.symbol,
    title: titleForSignal(signal, severity),
    type: "signal_alert",
  };
}

export function shouldSuppressAlert(
  event: AlertEvent,
  previousEvents: AlertEvent[],
  now: Date,
  dedupeWindowMs = defaultDedupeWindowMs,
) {
  const nowTime = now.getTime();

  return previousEvents.some((previous) => {
    if (previous.type !== event.type || previous.symbol !== event.symbol || previous.state !== event.state) {
      return false;
    }

    const previousTime = new Date(previous.generatedAt).getTime();

    return !Number.isNaN(previousTime) && nowTime - previousTime <= dedupeWindowMs;
  });
}

export function soundProfileForSeverity(
  severity: AlertSeverity,
  options: {
    now?: Date;
    quietHours?: QuietHours;
  } = {},
): SoundProfile {
  const muted = isQuietHour(options.now ?? new Date(), options.quietHours);
  const name = soundNameForSeverity(severity);

  return {
    muted,
    name: muted ? "none" : name,
    shouldPlay: !muted && name !== "none",
    volume: muted ? 0 : soundVolumeForSeverity(severity),
  };
}

export function shouldKeepAlertEventForPreferences(event: AlertEvent, preferences: AlertPreferences) {
  const signalSeverity = signalAlertSeverity(event);

  if (!signalSeverity) {
    return true;
  }

  return severityRank(signalSeverity) >= severityRank(preferences.minimumSignalSeverity);
}

export function buildAlertControlReport(
  preferences: AlertPreferences,
  now = new Date(),
): AlertControlReport {
  const quietHours = preferences.quietHoursEnabled ? preferences.quietHours : undefined;
  const suppressedByQuietHours = isQuietHour(now, quietHours);
  const activeChannels = [
    "站内事件中心",
    preferences.soundEnabled && !suppressedByQuietHours ? "声音" : null,
    preferences.browserNotificationsEnabled ? "浏览器通知" : null,
  ].filter((channel): channel is string => Boolean(channel));
  const thresholdLabel = {
    critical: "仅触发",
    high: "接近触发+触发",
    watch: "观察以上",
  }[preferences.minimumSignalSeverity];

  return {
    activeChannels,
    allowedUse: "in_app_only",
    canUseTelegram: false,
    canUseWebhook: false,
    dedupeWindowMinutes: preferences.dedupeWindowMinutes,
    externalChannelsEnabled: false,
    mode: "local_alert_control_mvp",
    operatorHint: "站内告警只做提醒和上下文聚合，不自动下单，不接 Telegram/Webhook。",
    quietHoursLabel: preferences.quietHoursEnabled
      ? `${preferences.quietHours.startHour}:00-${preferences.quietHours.endHour}:00 ${preferences.quietHours.timeZone}`
      : "关闭",
    soundArmed: preferences.soundEnabled && !suppressedByQuietHours,
    suppressedByQuietHours,
    thresholdLabel,
  };
}

export function notificationCopyForAlert(event: AlertEvent) {
  if (event.type === "system_failed") {
    return {
      body: event.detail,
      title: "川 · 系统扫描失败",
    };
  }

  if (event.type === "system_stale") {
    return {
      body: event.detail,
      title: "川 · 扫描结果过期",
    };
  }

  return {
    body: `${event.detail}。先确认触发与失效，不允许盲目追单。`,
    title: `川 · ${stripQuote(event.symbol ?? "")} ${event.state?.replaceAll("_", " ") ?? "alert"}`,
  };
}

export function buildOperationsAlertEvent(health: SystemHealthReport): AlertEvent | null {
  if (health.scan.status === "failed" || health.operations.verdict === "blocked") {
    return {
      actionHint: health.operations.operatorHint,
      detail: health.operations.operatorHint,
      generatedAt: health.generatedAt,
      id: `${health.generatedAt}:operations:failed`,
      severity: "critical",
      sound: "alarm",
      title: "扫描失败",
      type: "system_failed",
    };
  }

  if (health.scan.freshness === "expired" || health.operations.verdict === "attention") {
    return {
      actionHint: health.operations.operatorHint,
      detail: health.operations.operatorHint,
      generatedAt: health.generatedAt,
      id: `${health.generatedAt}:operations:stale`,
      severity: "operations",
      sound: "pulse",
      title: "扫描过期",
      type: "system_stale",
    };
  }

  return null;
}
