"use client";

import { BellRing, BellOff, SlidersHorizontal, Volume2 } from "lucide-react";
import type {
  AlertControlReport,
  AlertEvent,
  AlertHistoryReport,
  AlertPreferences,
  AlertSignalThreshold,
} from "@/lib/alerts/alert-policy";

type AlertControlPanelProps = {
  alertEvents: AlertEvent[];
  alertHistory?: AlertHistoryReport;
  preferences: AlertPreferences;
  report: AlertControlReport;
  onBrowserNotificationsChange: (enabled: boolean) => void;
  onDedupeWindowChange: (minutes: number) => void;
  onMinimumSeverityChange: (severity: AlertSignalThreshold) => void;
  onQuietHoursChange: (enabled: boolean) => void;
  onSoundToggle: () => void;
};

const severityOptions: Array<{
  description: string;
  label: string;
  value: AlertSignalThreshold;
}> = [
  {
    description: "观察、接近触发、已触发都进入站内事件中心。",
    label: "观察以上",
    value: "watch",
  },
  {
    description: "过滤普通观察，只保留接近触发和已触发。",
    label: "接近触发",
    value: "high",
  },
  {
    description: "只保留已触发和系统失败这类最高优先级事件。",
    label: "仅触发",
    value: "critical",
  },
];

const dedupeOptions = [5, 8, 15];

function severityCount(events: AlertEvent[], severity: AlertEvent["severity"]) {
  return events.filter((event) => event.severity === severity).length;
}

export function AlertControlPanel({
  alertEvents,
  alertHistory,
  preferences,
  report,
  onBrowserNotificationsChange,
  onDedupeWindowChange,
  onMinimumSeverityChange,
  onQuietHoursChange,
  onSoundToggle,
}: AlertControlPanelProps) {
  return (
    <section className="module alert-control-module" aria-label="站内告警设置">
      <div className="module-head">
        <div>
          <h2>站内告警设置</h2>
          <span>Local alert control · 不接外部 Webhook</span>
        </div>
        <span className="tag">In-app only</span>
      </div>

      <div className="alert-control__summary" aria-label="告警控制摘要">
        <span>
          <BellRing size={14} strokeWidth={2.2} />
          <b>{alertHistory?.activeCount ?? alertEvents.length}</b>
          活跃事件
        </span>
        <span>
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          <b>{report.thresholdLabel}</b>
          信号阈值
        </span>
        <span>
          <Volume2 size={14} strokeWidth={2.2} />
          <b>{report.soundArmed ? "可响铃" : "静音"}</b>
          声音状态
        </span>
        <span>
          <BellOff size={14} strokeWidth={2.2} />
          <b>{report.dedupeWindowMinutes}m</b>
          去重窗口
        </span>
      </div>

      <div className="alert-control__severity" aria-label="告警等级阈值">
        {severityOptions.map((option) => (
          <button
            aria-pressed={preferences.minimumSignalSeverity === option.value}
            className={preferences.minimumSignalSeverity === option.value ? "is-active" : ""}
            key={option.value}
            onClick={() => onMinimumSeverityChange(option.value)}
            title={option.description}
            type="button"
          >
            <b>{option.label}</b>
            <small>{option.description}</small>
          </button>
        ))}
      </div>

      <div className="alert-control__toggles" aria-label="告警通道开关">
        <button
          aria-pressed={preferences.soundEnabled}
          className={preferences.soundEnabled ? "is-active" : ""}
          onClick={onSoundToggle}
          type="button"
        >
          <b>提示音</b>
          <small>{preferences.soundEnabled ? "已武装" : "关闭"}</small>
        </button>
        <button
          aria-pressed={preferences.browserNotificationsEnabled}
          className={preferences.browserNotificationsEnabled ? "is-active" : ""}
          onClick={() => onBrowserNotificationsChange(!preferences.browserNotificationsEnabled)}
          type="button"
        >
          <b>浏览器通知</b>
          <small>{preferences.browserNotificationsEnabled ? "已开启" : "需授权"}</small>
        </button>
        <button
          aria-pressed={preferences.quietHoursEnabled}
          className={preferences.quietHoursEnabled ? "is-active" : ""}
          onClick={() => onQuietHoursChange(!preferences.quietHoursEnabled)}
          type="button"
        >
          <b>静默时段</b>
          <small>{report.quietHoursLabel}</small>
        </button>
      </div>

      <div className="alert-control__dedupe" aria-label="告警去重窗口">
        {dedupeOptions.map((minutes) => (
          <button
            aria-pressed={preferences.dedupeWindowMinutes === minutes}
            className={preferences.dedupeWindowMinutes === minutes ? "is-active" : ""}
            key={minutes}
            onClick={() => onDedupeWindowChange(minutes)}
            type="button"
          >
            {minutes}m
          </button>
        ))}
      </div>

      <div className="alert-control__channels" aria-label="告警通道边界">
        <span><b>{report.activeChannels.join(" / ") || "站内事件中心"}</b>当前通道</span>
        <span><b>{report.externalChannelsEnabled ? "开启" : "关闭"}</b>Telegram/Webhook</span>
        <span><b>{severityCount(alertEvents, "critical")}/{severityCount(alertEvents, "high")}/{severityCount(alertEvents, "watch")}</b>Critical/High/Watch</span>
        {alertHistory ? (
          <>
            <span><b>{alertHistory.unseenCount}</b>未读</span>
            <span><b>{alertHistory.archivedCount}</b>归档</span>
            <span><b>{alertHistory.retentionLimit}</b>本地保留</span>
          </>
        ) : null}
      </div>

      <p>{alertHistory ? `${report.operatorHint} ${alertHistory.guardrail}` : report.operatorHint}</p>
    </section>
  );
}
