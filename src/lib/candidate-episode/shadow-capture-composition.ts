import type { ScanArchiveSummary, ScanReplayFrame, MarketRadarSnapshot } from "../market/types";
import type { PersistenceRepository } from "../persistence/persistence-store";
import { CandidateEpisodeService } from "./candidate-episode-service";
import { CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED } from "./feature-flags";
import { CandidateOutboxService } from "./outbox-service";
import { CandidateShadowCaptureConsumer, type ShadowCaptureMetric } from "./shadow-capture-consumer";
import { CandidateShadowCaptureMonitor } from "./shadow-capture-monitor";
import {
  buildShadowCandidateObservations,
  evaluateShadowCaptureRuntimeGate,
  type ShadowCaptureControlSnapshot,
} from "./shadow-capture-runtime";
import { CandidateShadowCaptureSourceWriter } from "./shadow-capture-source";
import type { PostgresTransactionAdapter } from "./transaction-adapter";
import {
  CANDIDATE_MIGRATION_FAMILY,
  resolveCandidateValidationCycleId,
} from "./candidate-validation-cycle";

export const CANDIDATE_SHADOW_MIGRATION_ID = CANDIDATE_MIGRATION_FAMILY;
export const CANDIDATE_SHADOW_SCOPE = "production_radar" as const;

type ShadowCaptureCompositionEnv = Record<string, string | undefined>;

type ControlRow = {
  phase: string | null;
  epoch: number | string | null;
  deadline_at: Date | string | null;
  write_frozen: boolean | null;
  approved_release_id: string | null;
  database_now: Date | string;
};

type CandidateShadowCaptureCompositionDependencies = {
  codeActivationAllowed?: boolean;
  consumerTransactions: PostgresTransactionAdapter | null;
  env?: ShadowCaptureCompositionEnv;
  monitorTransactions: PostgresTransactionAdapter | null;
  now?: () => Date;
  repository: PersistenceRepository;
  sourceTransactions: PostgresTransactionAdapter | null;
};

export type CandidateShadowRuntimeBlocker =
  | "drain_only_source_disabled"
  | "source_transaction_adapter_unavailable"
  | "consumer_transaction_adapter_unavailable"
  | "monitor_transaction_adapter_unavailable"
  | "release_id_missing"
  | "migration_id_invalid"
  | "control_read_failed"
  | ReturnType<typeof evaluateShadowCaptureRuntimeGate>["blockers"][number];

export type CandidateShadowRuntimeState = Readonly<{
  authorityEpoch: number | null;
  blockers: readonly CandidateShadowRuntimeBlocker[];
  enabled: boolean;
  databaseNow: string;
  expectedReleaseId: string | null;
  migrationId: string;
  mode: "active" | "dormant";
  scope: typeof CANDIDATE_SHADOW_SCOPE;
}>;

function exactTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function releaseId(env: ShadowCaptureCompositionEnv) {
  return env.CANDIDATE_RUNTIME_RELEASE_ID?.trim() || null;
}

function runtimeId(env: ShadowCaptureCompositionEnv, release: string) {
  const instance = env.CANDIDATE_SHADOW_RUNTIME_ID?.trim()
    || env.HOSTNAME?.trim()
    || "single-instance";
  return `candidate-shadow:${release}:${instance}`.slice(0, 240);
}

function canonicalIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapControl(row: ControlRow | undefined) {
  if (!row) return { control: null, databaseNow: null } as const;
  const databaseNow = canonicalIso(row.database_now);
  if (
    row.phase === null
    || row.epoch === null
    || row.deadline_at === null
    || row.write_frozen === null
    || row.approved_release_id === null
  ) {
    return { control: null, databaseNow } as const;
  }
  const epoch = Number(row.epoch);
  if (!Number.isSafeInteger(epoch)) return { control: null, databaseNow } as const;

  return {
    control: {
      approvedReleaseId: row.approved_release_id,
      deadlineAt: canonicalIso(row.deadline_at),
      epoch,
      phase: row.phase,
      writeFrozen: row.write_frozen,
    },
    databaseNow,
  };
}

export class CandidateShadowCaptureComposition {
  private readonly codeActivationAllowed: boolean;
  private readonly env: ShadowCaptureCompositionEnv;
  private readonly now: () => Date;

  constructor(private readonly dependencies: CandidateShadowCaptureCompositionDependencies) {
    this.codeActivationAllowed = dependencies.codeActivationAllowed
      ?? CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED;
    this.env = dependencies.env ?? process.env;
    this.now = dependencies.now ?? (() => new Date());
  }

  async runtimeState(purpose: "source" | "consumer" = "consumer"): Promise<CandidateShadowRuntimeState> {
    const expectedReleaseId = releaseId(this.env);
    const blockers: CandidateShadowRuntimeBlocker[] = [];
    let migrationId: string | null = null;
    try {
      migrationId = resolveCandidateValidationCycleId(this.env);
    } catch {
      blockers.push("migration_id_invalid");
    }

    if (!this.dependencies.monitorTransactions) {
      blockers.push("monitor_transaction_adapter_unavailable");
    }
    if (!this.dependencies.sourceTransactions) {
      blockers.push("source_transaction_adapter_unavailable");
    }
    if (purpose === "source" && exactTrue(this.env.CANDIDATE_EPISODE_DRAIN_ONLY)) {
      blockers.push("drain_only_source_disabled");
    }
    if (purpose === "consumer" && !this.dependencies.consumerTransactions) {
      blockers.push("consumer_transaction_adapter_unavailable");
    }
    if (!expectedReleaseId) blockers.push("release_id_missing");

    let control: ShadowCaptureControlSnapshot | null = null;
    let databaseNow = this.now().toISOString();
    if (this.dependencies.monitorTransactions) {
      try {
        const snapshot = migrationId ? await this.readControl(migrationId) : null;
        control = snapshot?.control ?? null;
        databaseNow = snapshot?.databaseNow ?? databaseNow;
      } catch {
        blockers.push("control_read_failed");
      }
    }

    const gate = evaluateShadowCaptureRuntimeGate({
      codeActivationAllowed: this.codeActivationAllowed,
      control,
      expectedReleaseId: expectedReleaseId ?? "unconfigured",
      killSwitchRequested: exactTrue(this.env.CANDIDATE_EPISODE_SHADOW_WRITE),
      now: databaseNow,
      repositoryMode: this.dependencies.repository.mode,
      scope: CANDIDATE_SHADOW_SCOPE,
    });
    blockers.push(...gate.blockers);
    const uniqueBlockers = [...new Set(blockers)];

    return {
      authorityEpoch: control?.epoch ?? null,
      blockers: uniqueBlockers,
      databaseNow,
      enabled: uniqueBlockers.length === 0,
      expectedReleaseId,
      migrationId: migrationId ?? CANDIDATE_SHADOW_MIGRATION_ID,
      mode: uniqueBlockers.length === 0 ? "active" : "dormant",
      scope: CANDIDATE_SHADOW_SCOPE,
    };
  }

  async persistScanArchive(
    summary: ScanArchiveSummary,
    replayFrame: ScanReplayFrame,
    snapshot?: MarketRadarSnapshot,
  ) {
    const runtime = await this.runtimeState("source");
    if (!runtime.enabled || !this.dependencies.sourceTransactions) {
      const stored = await this.dependencies.repository.addScanArchive(summary, replayFrame, snapshot);
      return {
        mapping: null,
        runtime,
        shadowCapture: { status: "dormant" },
        stored,
      } as const;
    }
    if (!snapshot) throw new Error("shadow_snapshot_required");

    const mapping = buildShadowCandidateObservations(snapshot, runtime.expectedReleaseId as string);
    if (!mapping.complete) {
      return {
        mapping,
        runtime,
        shadowCapture: {
          code: "shadow_candidate_identity_mapping_incomplete",
          status: "failed",
        },
        stored: null,
      } as const;
    }
    const writer = new CandidateShadowCaptureSourceWriter(this.dependencies.sourceTransactions);
    try {
      await writer.persist({
        authorityEpoch: runtime.authorityEpoch as number,
        candidateScope: CANDIDATE_SHADOW_SCOPE,
        candidates: mapping.observations,
        legacyScope: this.dependencies.repository.scope,
        migrationId: runtime.migrationId,
        replayFrame,
        snapshot,
        summary,
      });
    } catch {
      return {
        mapping,
        runtime,
        shadowCapture: {
          code: "shadow_candidate_source_persist_failed",
          status: "failed",
        },
        stored: null,
      } as const;
    }

    try {
      await this.dependencies.repository.addV3ForwardMapSnapshots(replayFrame);
    } catch {
      return {
        mapping,
        runtime,
        shadowCapture: {
          code: "shadow_candidate_forward_map_persist_failed",
          status: "failed",
        },
        stored: summary,
      } as const;
    }

    return {
      mapping,
      runtime,
      shadowCapture: { status: "persisted" },
      stored: summary,
    } as const;
  }

  async runBatch({ limit = 50, signal }: { limit?: number; signal?: AbortSignal } = {}) {
    const runtime = await this.runtimeState("consumer");
    if (
      !runtime.enabled
      || !this.dependencies.consumerTransactions
      || !this.dependencies.sourceTransactions
    ) {
      return { batch: null, metrics: [], runtime } as const;
    }

    const metrics: ShadowCaptureMetric[] = [];
    const outbox = new CandidateOutboxService(this.dependencies.consumerTransactions);
    const episodes = new CandidateEpisodeService(this.dependencies.sourceTransactions);
    const consumer = new CandidateShadowCaptureConsumer({
      episodes,
      onMetric: (metric) => metrics.push(metric),
      outbox,
    });
    const batch = await consumer.runBatch({
      authorityEpoch: runtime.authorityEpoch as number,
      limit,
      migrationId: runtime.migrationId,
      now: runtime.databaseNow,
      runtimeId: runtimeId(this.env, runtime.expectedReleaseId as string),
      scope: CANDIDATE_SHADOW_SCOPE,
      signal,
    });

    return { batch, metrics, runtime } as const;
  }

  async monitor() {
    if (!this.dependencies.monitorTransactions) return null;
    return new CandidateShadowCaptureMonitor(this.dependencies.monitorTransactions).read(
      CANDIDATE_SHADOW_SCOPE,
      resolveCandidateValidationCycleId(this.env),
    );
  }

  private async readControl(migrationId: string) {
    if (!this.dependencies.monitorTransactions) {
      throw new Error("monitor_transaction_adapter_unavailable");
    }
    const result = await this.dependencies.monitorTransactions.withTransaction({
      deferrable: true,
      idleInTransactionTimeoutMs: 10_000,
      isolation: "serializable",
      lockTimeoutMs: 1_000,
      maxRetries: 1,
      readOnly: true,
      statementTimeoutMs: 10_000,
    }, (tx) => tx.query<ControlRow>(`
      SELECT control.phase, control.epoch, control.deadline_at, control.write_frozen,
        control.approved_release_id, clock_timestamp() AS database_now
      FROM (SELECT 1) clock
      LEFT JOIN candidate_authority.candidate_migration_control control
        ON control.migration_id = $1
    `, [migrationId]));

    return mapControl(result.rows[0]);
  }
}
