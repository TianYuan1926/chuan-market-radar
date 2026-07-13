import type { PostgresTransactionAdapter } from "./transaction-adapter";

export const SHADOW_CAPTURE_ALERT_THRESHOLDS = Object.freeze({
  oldestPendingWarningSeconds: 300,
  oldestPendingCriticalSeconds: 600,
  unresolvedQuarantineCritical: 1,
});

type MonitorRow = {
  phase: string | null;
  authority_epoch: number | string | null;
  deadline_at: Date | string | null;
  deadline_expired: boolean | null;
  pending_total: number | string;
  claimed_total: number | string;
  retry_wait_total: number | string;
  completed_total: number | string;
  quarantined_total: number | string;
  unresolved_quarantine_total: number | string;
  unresolved_total: number | string;
  oldest_unresolved_age_seconds: number | string | null;
};

function count(value: number | string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${field}_invalid`);
  return parsed;
}

function optionalTimestamp(value: Date | string | null) {
  if (value === null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("deadline_at_invalid");
  return new Date(parsed).toISOString();
}

export class CandidateShadowCaptureMonitor {
  constructor(private readonly transactions: PostgresTransactionAdapter) {}

  async read(scope: "production_radar", migrationId: string) {
    if (!migrationId.trim()) throw new Error("migration_id_required");
    const response = await this.transactions.withTransaction({
      deferrable: true,
      isolation: "serializable",
      readOnly: true,
      maxRetries: 1,
      lockTimeoutMs: 1_000,
      statementTimeoutMs: 10_000,
      idleInTransactionTimeoutMs: 10_000,
    }, (tx) => tx.query<MonitorRow>(`
      WITH source_items AS (
        SELECT outbox.*,
          EXISTS (
            SELECT 1
            FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
            WHERE resolution.scope = outbox.scope
              AND resolution.quarantined_outbox_id = outbox.outbox_id
          ) AS has_resolution
        FROM candidate_authority.candidate_episode_ingest_outbox outbox
        WHERE outbox.scope = $1 AND outbox.source_type = 'legacy_scan_candidate'
      ), aggregate AS (
        SELECT
          count(*) FILTER (WHERE status = 'pending')::bigint AS pending_total,
          count(*) FILTER (WHERE status = 'claimed')::bigint AS claimed_total,
          count(*) FILTER (WHERE status = 'retry_wait')::bigint AS retry_wait_total,
          count(*) FILTER (WHERE status = 'completed')::bigint AS completed_total,
          count(*) FILTER (WHERE status = 'quarantined')::bigint AS quarantined_total,
          count(*) FILTER (WHERE status = 'quarantined' AND NOT has_resolution)::bigint
            AS unresolved_quarantine_total,
          count(*) FILTER (WHERE status <> 'completed' AND NOT has_resolution)::bigint
            AS unresolved_total,
          extract(epoch FROM clock_timestamp() - min(created_at) FILTER (
            WHERE status <> 'completed' AND NOT has_resolution
          )) AS oldest_unresolved_age_seconds
        FROM source_items
      )
      SELECT control.phase, control.epoch AS authority_epoch, control.deadline_at,
        control.deadline_at < clock_timestamp() AS deadline_expired,
        aggregate.pending_total, aggregate.claimed_total, aggregate.retry_wait_total,
        aggregate.completed_total, aggregate.quarantined_total,
        aggregate.unresolved_quarantine_total, aggregate.unresolved_total,
        aggregate.oldest_unresolved_age_seconds
      FROM aggregate
      LEFT JOIN candidate_authority.candidate_migration_control control
        ON control.migration_id = $2
    `, [scope, migrationId]));
    const row = response.rows[0];
    if (!row) throw new Error("shadow_monitor_result_missing");
    const unresolvedQuarantine = count(
      row.unresolved_quarantine_total,
      "unresolved_quarantine_total",
    );
    const oldestPendingAgeSeconds = row.oldest_unresolved_age_seconds === null
      ? null
      : Math.max(0, Number(row.oldest_unresolved_age_seconds));
    if (oldestPendingAgeSeconds !== null && !Number.isFinite(oldestPendingAgeSeconds)) {
      throw new Error("oldest_unresolved_age_seconds_invalid");
    }
    const deadlineAt = optionalTimestamp(row.deadline_at);
    const deadlineExpired = row.deadline_expired === true;
    const blockers: string[] = [];
    const warnings: string[] = [];
    if (unresolvedQuarantine >= SHADOW_CAPTURE_ALERT_THRESHOLDS.unresolvedQuarantineCritical) {
      blockers.push("unresolved_quarantine");
    }
    if (oldestPendingAgeSeconds !== null
        && oldestPendingAgeSeconds >= SHADOW_CAPTURE_ALERT_THRESHOLDS.oldestPendingCriticalSeconds) {
      blockers.push("oldest_pending_critical");
    } else if (oldestPendingAgeSeconds !== null
        && oldestPendingAgeSeconds >= SHADOW_CAPTURE_ALERT_THRESHOLDS.oldestPendingWarningSeconds) {
      warnings.push("oldest_pending_warning");
    }
    if (deadlineExpired && row.phase !== "legacy") blockers.push("shadow_deadline_expired");
    if (count(row.retry_wait_total, "retry_wait_total") > 0) warnings.push("retry_wait_present");

    return {
      scope,
      migrationId,
      phase: row.phase,
      authorityEpoch: row.authority_epoch === null
        ? null
        : count(row.authority_epoch, "authority_epoch"),
      deadlineAt,
      status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "partial" : "ready",
      blockers,
      warnings,
      metrics: {
        outboxPendingTotal: count(row.pending_total, "pending_total"),
        outboxClaimedTotal: count(row.claimed_total, "claimed_total"),
        outboxRetryWaitTotal: count(row.retry_wait_total, "retry_wait_total"),
        outboxCompletedTotal: count(row.completed_total, "completed_total"),
        outboxQuarantinedTotal: count(row.quarantined_total, "quarantined_total"),
        unresolvedQuarantineTotal: unresolvedQuarantine,
        unresolvedTotal: count(row.unresolved_total, "unresolved_total"),
        oldestPendingAgeSeconds,
      },
    } as const;
  }
}
