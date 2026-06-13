import { Activity, Archive, Clock3, Database, RadioTower, TimerReset } from "lucide-react";
import type { SystemHealthLevel, SystemHealthReport } from "@/lib/api/system-health";

type SystemHealthPanelProps = {
  health: SystemHealthReport;
};

function levelLabel(level: SystemHealthLevel) {
  return {
    ready: "READY",
    preview: "PREVIEW",
    degraded: "CHECK",
    blocked: "BLOCKED",
  }[level];
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
            <span className="mono">SYSTEM CHECK</span>
            <strong>{health.summary}</strong>
          </div>
        </div>

        <div className="health-grid" aria-label="系统健康摘要">
          <span>
            <RadioTower size={14} strokeWidth={2.2} />
            <b>{health.dataSource.activeSource}</b>
            {health.dataSource.mode}
          </span>
          <span>
            <Database size={14} strokeWidth={2.2} />
            <b>{health.persistence.databaseStatus}</b>
            {health.persistence.databaseDriver}
          </span>
          <span>
            <Activity size={14} strokeWidth={2.2} />
            <b>{health.scan.freshness}</b>
            age {formatAge(health.scan.ageMinutes)}
          </span>
          <span>
            <Archive size={14} strokeWidth={2.2} />
            <b>{health.archive.entries}</b>
            frames
          </span>
        </div>

        <div className={`health-ops health-ops--${health.operations.verdict}`}>
          <div className="health-ops__head">
            <div>
              <span className="mono">SCAN OPS</span>
              <strong>{health.operations.operatorHint}</strong>
            </div>
            <b>{health.operations.verdict.toUpperCase()}</b>
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
              scanned
            </span>
            <span>
              <Archive size={14} strokeWidth={2.2} />
              <b>{health.coverage.pending}</b>
              pending
            </span>
            <span>
              <TimerReset size={14} strokeWidth={2.2} />
              <b>{health.coverage.batchIndex + 1}/{health.coverage.totalBatches}</b>
              batch
            </span>
            <span>
              <Activity size={14} strokeWidth={2.2} />
              <b>{health.dataSource.status.toUpperCase()}</b>
              provider
            </span>
          </div>

          {notes.length > 0 ? (
            <div className="health-op-notes" aria-label="扫描运行备注">
              {notes.map((note) => (
                <span key={note}>{note}</span>
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
