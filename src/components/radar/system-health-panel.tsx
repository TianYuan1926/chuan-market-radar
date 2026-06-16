import { Activity, Archive, Clock3, Database, RadioTower, TimerReset } from "lucide-react";
import type { SystemHealthLevel, SystemHealthReport } from "@/lib/api/system-health";

type SystemHealthPanelProps = {
  health: SystemHealthReport;
};

function levelLabel(level: SystemHealthLevel) {
  return {
    ready: "就绪",
    preview: "预览",
    degraded: "检查",
    blocked: "阻断",
  }[level];
}

function sourceLabel(value: SystemHealthReport["dataSource"]["activeSource"]) {
  return {
    coingecko: "CoinGecko",
    coinglass: "CoinGlass",
    composite: "聚合源",
    exchange_public: "交易所公开源",
    mock: "演示源",
  }[value];
}

function modeLabel(value: SystemHealthReport["dataSource"]["mode"]) {
  return value === "live" ? "实时" : "演示";
}

function dataSourceStatusLabel(value: SystemHealthReport["dataSource"]["status"]) {
  return {
    fallback: "回退",
    missing_key: "缺密钥",
    preview: "预览",
    ready: "就绪",
  }[value];
}

function freshnessLabel(value: SystemHealthReport["scan"]["freshness"]) {
  return {
    aging: "接近过期",
    expired: "已过期",
    fresh: "新鲜",
    unknown: "未知",
  }[value];
}

function operationsVerdictLabel(value: SystemHealthReport["operations"]["verdict"]) {
  return {
    attention: "注意",
    blocked: "阻断",
    healthy: "健康",
    watch: "观察",
  }[value];
}

function outcomeStatusLabel(value: SystemHealthReport["outcomes"]["status"]) {
  return {
    collecting: "收集",
    covered: "覆盖",
    idle: "待样本",
    reviewing: "待写回",
  }[value];
}

function databaseStatusLabel(value: SystemHealthReport["persistence"]["databaseStatus"]) {
  return {
    configured: "已配置",
    fallback: "回退",
    ready: "就绪",
    unconfigured: "未配置",
  }[value] ?? value;
}

function operationNoteLabel(value: string) {
  return value
    .replace(/^batch /, "批次 ")
    .replace(/^requests /, "请求 ")
    .replace(/^scan runtime:/, "扫描耗时：");
}

function formatAge(value: number | null) {
  return value === null ? "--" : `${value}m`;
}

function healthTone(level: SystemHealthLevel) {
  return `health-${level}`;
}

function formatClock(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatCountdown(value: number | null) {
  return value === null ? "--" : `${value}m`;
}

function formatPercent(value: number) {
  return `${value}%`;
}

export function SystemHealthPanel({ health }: SystemHealthPanelProps) {
  const notes = [
    health.operations.batchDetail,
    health.operations.requestDetail,
    health.operations.runtimeDetail,
  ].filter((note): note is string => Boolean(note));

  return (
    <section className={`module health-module ${healthTone(health.level)}`}>
      <div className="module-head">
        <h2>系统状态</h2>
        <span className={`tag tag--${health.level}`}>{levelLabel(health.level)}</span>
      </div>

      <div className="health-readout">
        <div className="health-core">
          <div className="health-core__glyph" aria-hidden="true">
            <Activity size={21} strokeWidth={2.3} />
          </div>
          <div>
            <span className="mono">系统检查</span>
            <strong>{health.summary}</strong>
          </div>
        </div>

        <div className="health-grid" aria-label="系统健康摘要">
          <span>
            <RadioTower size={14} strokeWidth={2.2} />
            <b>{sourceLabel(health.dataSource.activeSource)}</b>
            {modeLabel(health.dataSource.mode)}
          </span>
          <span>
            <Database size={14} strokeWidth={2.2} />
            <b>{databaseStatusLabel(health.persistence.databaseStatus)}</b>
            {health.persistence.databaseDriver}
          </span>
          <span>
            <Activity size={14} strokeWidth={2.2} />
            <b>{freshnessLabel(health.scan.freshness)}</b>
            延迟 {formatAge(health.scan.ageMinutes)}
          </span>
          <span>
            <Archive size={14} strokeWidth={2.2} />
            <b>{health.archive.entries}</b>
            帧
          </span>
        </div>

        <div className={`health-ops health-ops--${health.operations.verdict}`}>
          <div className="health-ops__head">
            <div>
              <span className="mono">扫描运维</span>
              <strong>{health.operations.operatorHint}</strong>
            </div>
            <b>{operationsVerdictLabel(health.operations.verdict)}</b>
          </div>

          <div className="health-op-matrix" aria-label="扫描运维摘要">
            <span>
              <Clock3 size={14} strokeWidth={2.2} />
              <b>{formatClock(health.operations.lastSuccessfulScanAt)}</b>
              最近成功
            </span>
            <span>
              <TimerReset size={14} strokeWidth={2.2} />
              <b>{formatCountdown(health.operations.minutesUntilNextScan)}</b>
              下次扫描
            </span>
            <span>
              <Activity size={14} strokeWidth={2.2} />
              <b>{formatCountdown(health.operations.minutesUntilStale)}</b>
              失效窗口
            </span>
            <span>
              <Archive size={14} strokeWidth={2.2} />
              <b>{health.operations.recentProblemCount}</b>
              异常帧
            </span>
          </div>

          <div className="health-op-matrix" aria-label="扫描覆盖摘要">
            <span>
              <RadioTower size={14} strokeWidth={2.2} />
              <b>{health.coverage.scanned}/{health.coverage.eligible}</b>
              已扫
            </span>
            <span>
              <Archive size={14} strokeWidth={2.2} />
              <b>{health.coverage.pending}</b>
              待扫
            </span>
            <span>
              <TimerReset size={14} strokeWidth={2.2} />
              <b>{health.coverage.batchIndex + 1}/{health.coverage.totalBatches}</b>
              批次
            </span>
            <span>
              <Activity size={14} strokeWidth={2.2} />
              <b>{dataSourceStatusLabel(health.dataSource.status)}</b>
              数据源
            </span>
          </div>

          <div className="health-outcomes" aria-label="自动复盘摘要">
            <div className="health-ops__head">
              <div>
                <span className="mono">自动复盘</span>
                <strong>{health.outcomes.operatorHint}</strong>
              </div>
              <b>{outcomeStatusLabel(health.outcomes.status)}</b>
            </div>

            <div className="health-op-matrix">
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{formatPercent(health.outcomes.coveragePercent)}</b>
                覆盖率
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{health.outcomes.pendingEvents}</b>
                待复查
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{health.outcomes.dueEvents}</b>
                到期
              </span>
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{formatClock(health.outcomes.latestOutcomeAt)}</b>
                最近写回
              </span>
            </div>
          </div>

          {notes.length > 0 ? (
            <div className="health-op-notes" aria-label="扫描运行备注">
              {notes.map((note) => (
                <span key={note}>{operationNoteLabel(note)}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="health-guards">
          {health.guards.map((guard) => (
            <article className={`health-guard health-guard--${guard.state}`} key={guard.id}>
              <span>{guard.label}</span>
              <strong>{levelLabel(guard.state)}</strong>
              <small>{guard.detail}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
