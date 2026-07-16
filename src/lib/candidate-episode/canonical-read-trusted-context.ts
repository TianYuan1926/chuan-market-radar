import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  normalizeCandidateCanonicalReadPolicy,
  type CandidateCanonicalReadPolicy,
  type CandidateReadRouteInput,
} from "./canonical-read-model";
import type { CandidateAuthorityPhase } from "./feature-flags";
import type { PostgresTransactionAdapter } from "./transaction-adapter";

export const CANDIDATE_TRUSTED_READ_CONTEXT_SCHEMA_VERSION =
  "candidate-trusted-read-context.v1" as const;
export const CANDIDATE_READ_AUTHORITY_MANIFEST_SCHEMA_VERSION =
  "candidate-read-authority-manifest.v1" as const;
export const CANDIDATE_READ_AUTHORITY_MANIFEST_PATH =
  "/run/market-radar/candidate-read-authority.json" as const;
export const CANDIDATE_READ_AUTHORITY_MIGRATION_ID = "candidate-episode-v1" as const;
export const CANDIDATE_CANONICAL_API_CHECKPOINT_KIND = "24h" as const;
export const CANDIDATE_READ_AUTHORITY_APPROVAL_MAXIMUM_AGE_MS = 90 * 60 * 1_000;

export const CANDIDATE_TRUSTED_READ_CONTEXT_TRANSACTION = {
  deferrable: true,
  idleInTransactionTimeoutMs: 5_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 1,
  readOnly: true,
  statementTimeoutMs: 3_000,
} as const;

export type CandidateTrustedReadControl = Omit<
  CandidateReadRouteInput,
  "codeCanonicalReadAllowed"
>;

type CandidateReadEvidenceStatus =
  | "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
  | "PASS_DUAL_READ_OBSERVATION"
  | "PASS_CANONICAL_COMPAT_OBSERVATION"
  | "missing";

type CandidateReadAuthorityManifest = Readonly<{
  schemaVersion: typeof CANDIDATE_READ_AUTHORITY_MANIFEST_SCHEMA_VERSION;
  migrationId: typeof CANDIDATE_READ_AUTHORITY_MIGRATION_ID;
  scope: "production_radar";
  releaseId: string;
  authorityEpoch: number;
  phase: CandidateAuthorityPhase;
  generatedAt: string;
  flags: Readonly<{
    dualRead: boolean;
    canonicalRead: boolean;
    reviewRead: boolean;
  }>;
  evidence: Readonly<{
    reconciliation: Readonly<{
      status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" | "missing";
      evidenceHash: string | null;
    }>;
    dualRead: Readonly<{
      status: "PASS_DUAL_READ_OBSERVATION" | "missing";
      evidenceHash: string | null;
    }>;
    canonicalCompat: Readonly<{
      status: "PASS_CANONICAL_COMPAT_OBSERVATION" | "missing";
      evidenceHash: string | null;
    }>;
  }>;
}>;

type CandidateControlRow = {
  phase: unknown;
  epoch: unknown;
  started_at: unknown;
  deadline_at: unknown;
  write_frozen: unknown;
  approved_release_id: unknown;
  approval_digest: unknown;
  updated_at: unknown;
  database_now: unknown;
};

export type CandidateTrustedReadContext = Readonly<{
  schemaVersion: typeof CANDIDATE_TRUSTED_READ_CONTEXT_SCHEMA_VERSION;
  migrationId: typeof CANDIDATE_READ_AUTHORITY_MIGRATION_ID;
  scope: "production_radar";
  databaseNow: string;
  authorityEpoch: number;
  authorityFingerprint: string;
  approvedReleaseId: string;
  approvalDigest: string;
  phase: CandidateAuthorityPhase;
  flags: CandidateReadAuthorityManifest["flags"];
  evidence: CandidateReadAuthorityManifest["evidence"];
  policy: CandidateCanonicalReadPolicy;
  control: CandidateTrustedReadControl;
}>;

type CandidateTrustedContextEnv = Record<string, string | undefined>;

function hash(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashObject(value: unknown) {
  return hash(JSON.stringify(value));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("candidate_read_authority_manifest_invalid");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error("candidate_read_authority_manifest_shape_invalid");
  }
}

function iso(value: unknown, reason: string) {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "string"
      ? Date.parse(value)
      : Number.NaN;
  if (!Number.isFinite(timestamp)) throw new Error(reason);
  return new Date(timestamp).toISOString();
}

function safeInteger(value: unknown, reason: string) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 1) throw new Error(reason);
  return Number(parsed);
}

function safeIdentifier(value: unknown, reason: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,160}$/.test(value)) {
    throw new Error(reason);
  }
  return value;
}

function sha256(value: unknown, reason: string) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(reason);
  }
  return value;
}

function phase(value: unknown): CandidateAuthorityPhase {
  if (!["legacy", "shadow_capture", "shadow_verify", "canonical_compat", "canonical"]
    .includes(String(value))) {
    throw new Error("candidate_read_authority_phase_invalid");
  }
  return value as CandidateAuthorityPhase;
}

function explicitFlag(env: CandidateTrustedContextEnv, key: string) {
  const value = env[key]?.trim().toLowerCase();
  if (value !== "true" && value !== "false") {
    throw new Error(`candidate_read_runtime_flag_invalid:${key}`);
  }
  return value === "true";
}

function runtimeFlags(env: CandidateTrustedContextEnv) {
  return {
    dualRead: explicitFlag(env, "CANDIDATE_EPISODE_DUAL_READ"),
    canonicalRead: explicitFlag(env, "CANDIDATE_EPISODE_CANONICAL_READ"),
    reviewRead: explicitFlag(env, "CANDIDATE_EPISODE_REVIEW_READ"),
  } as const;
}

function evidenceEntry<T extends Exclude<CandidateReadEvidenceStatus, "missing">>(
  value: unknown,
  allowedPass: T,
): Readonly<
  | { status: "missing"; evidenceHash: null }
  | { status: T; evidenceHash: string }
> {
  const entry = record(value);
  exactKeys(entry, ["status", "evidenceHash"]);
  if (entry.status !== "missing" && entry.status !== allowedPass) {
    throw new Error("candidate_read_authority_evidence_status_invalid");
  }
  if (entry.status === "missing") {
    if (entry.evidenceHash !== null) throw new Error("candidate_read_missing_evidence_hash_present");
    return { status: "missing", evidenceHash: null } as const;
  }
  return {
    status: allowedPass,
    evidenceHash: sha256(entry.evidenceHash, "candidate_read_evidence_hash_invalid"),
  };
}

export function parseCandidateReadAuthorityManifest(raw: string): CandidateReadAuthorityManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("candidate_read_authority_manifest_json_invalid");
  }
  const manifest = record(parsed);
  exactKeys(manifest, [
    "schemaVersion", "migrationId", "scope", "releaseId", "authorityEpoch",
    "phase", "generatedAt", "flags", "evidence",
  ]);
  if (manifest.schemaVersion !== CANDIDATE_READ_AUTHORITY_MANIFEST_SCHEMA_VERSION
      || manifest.migrationId !== CANDIDATE_READ_AUTHORITY_MIGRATION_ID
      || manifest.scope !== "production_radar") {
    throw new Error("candidate_read_authority_manifest_identity_invalid");
  }
  const flags = record(manifest.flags);
  exactKeys(flags, ["dualRead", "canonicalRead", "reviewRead"]);
  if (typeof flags.dualRead !== "boolean"
      || typeof flags.canonicalRead !== "boolean"
      || typeof flags.reviewRead !== "boolean") {
    throw new Error("candidate_read_authority_manifest_flags_invalid");
  }
  const evidence = record(manifest.evidence);
  exactKeys(evidence, ["reconciliation", "dualRead", "canonicalCompat"]);
  return {
    schemaVersion: CANDIDATE_READ_AUTHORITY_MANIFEST_SCHEMA_VERSION,
    migrationId: CANDIDATE_READ_AUTHORITY_MIGRATION_ID,
    scope: "production_radar",
    releaseId: safeIdentifier(manifest.releaseId, "candidate_read_manifest_release_invalid"),
    authorityEpoch: safeInteger(manifest.authorityEpoch, "candidate_read_manifest_epoch_invalid"),
    phase: phase(manifest.phase),
    generatedAt: iso(manifest.generatedAt, "candidate_read_manifest_time_invalid"),
    flags: {
      dualRead: flags.dualRead,
      canonicalRead: flags.canonicalRead,
      reviewRead: flags.reviewRead,
    },
    evidence: {
      reconciliation: evidenceEntry(
        evidence.reconciliation,
        "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
      ),
      dualRead: evidenceEntry(evidence.dualRead, "PASS_DUAL_READ_OBSERVATION"),
      canonicalCompat: evidenceEntry(
        evidence.canonicalCompat,
        "PASS_CANONICAL_COMPAT_OBSERVATION",
      ),
    },
  };
}

function expectedPhaseState(value: CandidateAuthorityPhase) {
  const missing = "missing" as const;
  if (value === "shadow_verify") {
    return {
      flags: { dualRead: true, canonicalRead: false, reviewRead: false },
      evidence: {
        reconciliation: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
        dualRead: missing,
        canonicalCompat: missing,
      },
    };
  }
  if (value === "canonical_compat") {
    return {
      flags: { dualRead: true, canonicalRead: true, reviewRead: true },
      evidence: {
        reconciliation: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
        dualRead: "PASS_DUAL_READ_OBSERVATION" as const,
        canonicalCompat: missing,
      },
    };
  }
  if (value === "canonical") {
    return {
      flags: { dualRead: false, canonicalRead: true, reviewRead: true },
      evidence: {
        reconciliation: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
        dualRead: "PASS_DUAL_READ_OBSERVATION" as const,
        canonicalCompat: "PASS_CANONICAL_COMPAT_OBSERVATION" as const,
      },
    };
  }
  return {
    flags: { dualRead: false, canonicalRead: false, reviewRead: false },
    evidence: { reconciliation: missing, dualRead: missing, canonicalCompat: missing },
  };
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildContext({
  env,
  rawManifest,
  row,
}: {
  env: CandidateTrustedContextEnv;
  rawManifest: string;
  row: CandidateControlRow;
}): CandidateTrustedReadContext {
  const manifest = parseCandidateReadAuthorityManifest(rawManifest);
  const controlPhase = phase(row.phase);
  const authorityEpoch = safeInteger(row.epoch, "candidate_read_control_epoch_invalid");
  const approvedReleaseId = safeIdentifier(
    row.approved_release_id,
    "candidate_read_control_release_invalid",
  );
  const approvalDigest = sha256(row.approval_digest, "candidate_read_control_digest_invalid");
  const startedAt = iso(row.started_at, "candidate_read_control_started_at_invalid");
  const deadlineAt = iso(row.deadline_at, "candidate_read_control_deadline_invalid");
  const updatedAt = iso(row.updated_at, "candidate_read_control_updated_at_invalid");
  const databaseNow = iso(row.database_now, "candidate_read_database_now_invalid");
  const startedMs = Date.parse(startedAt);
  const deadlineMs = Date.parse(deadlineAt);
  const updatedMs = Date.parse(updatedAt);
  const nowMs = Date.parse(databaseNow);
  const generatedMs = Date.parse(manifest.generatedAt);
  if (startedMs >= nowMs || deadlineMs <= startedMs || updatedMs < startedMs || updatedMs > nowMs) {
    throw new Error("candidate_read_control_time_boundary_invalid");
  }
  if (controlPhase !== "legacy" && controlPhase !== "canonical" && nowMs > deadlineMs) {
    throw new Error("candidate_read_control_deadline_expired");
  }
  if (generatedMs > updatedMs
      || updatedMs - generatedMs > CANDIDATE_READ_AUTHORITY_APPROVAL_MAXIMUM_AGE_MS) {
    throw new Error("candidate_read_authority_manifest_approval_window_invalid");
  }
  if (typeof row.write_frozen !== "boolean"
      || (controlPhase === "legacy" ? row.write_frozen !== true : row.write_frozen !== false)) {
    throw new Error("candidate_read_control_freeze_boundary_invalid");
  }
  if (approvalDigest !== hash(rawManifest)) {
    throw new Error("candidate_read_authority_manifest_digest_mismatch");
  }
  if (manifest.releaseId !== approvedReleaseId
      || manifest.authorityEpoch !== authorityEpoch
      || manifest.phase !== controlPhase) {
    throw new Error("candidate_read_authority_manifest_control_mismatch");
  }
  const expectedReleaseId = safeIdentifier(
    env.CANDIDATE_RUNTIME_RELEASE_ID?.trim(),
    "candidate_read_runtime_release_invalid",
  );
  if (expectedReleaseId !== approvedReleaseId) {
    throw new Error("candidate_read_runtime_release_mismatch");
  }
  const actualFlags = runtimeFlags(env);
  const expected = expectedPhaseState(controlPhase);
  if (!equal(actualFlags, manifest.flags) || !equal(actualFlags, expected.flags)) {
    throw new Error("candidate_read_runtime_flag_phase_mismatch");
  }
  const manifestEvidence = {
    reconciliation: manifest.evidence.reconciliation.status,
    dualRead: manifest.evidence.dualRead.status,
    canonicalCompat: manifest.evidence.canonicalCompat.status,
  };
  if (!equal(manifestEvidence, expected.evidence)) {
    throw new Error("candidate_read_evidence_phase_mismatch");
  }
  const policy = normalizeCandidateCanonicalReadPolicy({
    scope: "production_radar",
    asOf: databaseNow,
    releaseId: approvedReleaseId,
    checkpointKind: CANDIDATE_CANONICAL_API_CHECKPOINT_KIND,
    evidenceGradeVersion: "eg.v1",
    observationCohort: { from: startedAt, toExclusive: databaseNow },
    dueCohort: { from: startedAt, toExclusive: databaseNow },
  });
  const control: CandidateTrustedReadControl = {
    phase: controlPhase,
    dualReadRequested: actualFlags.dualRead,
    canonicalReadRequested: actualFlags.canonicalRead,
    reviewReadRequested: actualFlags.reviewRead,
    reconciliationEvidenceStatus: manifest.evidence.reconciliation.status,
    dualReadEvidenceStatus: manifest.evidence.dualRead.status,
    canonicalCompatEvidenceStatus: manifest.evidence.canonicalCompat.status,
  };
  const authorityFingerprint = hashObject({
    migrationId: CANDIDATE_READ_AUTHORITY_MIGRATION_ID,
    authorityEpoch,
    approvedReleaseId,
    approvalDigest,
    phase: controlPhase,
    flags: actualFlags,
    evidence: manifest.evidence,
  });
  return {
    schemaVersion: CANDIDATE_TRUSTED_READ_CONTEXT_SCHEMA_VERSION,
    migrationId: CANDIDATE_READ_AUTHORITY_MIGRATION_ID,
    scope: "production_radar",
    databaseNow,
    authorityEpoch,
    authorityFingerprint,
    approvedReleaseId,
    approvalDigest,
    phase: controlPhase,
    flags: actualFlags,
    evidence: manifest.evidence,
    policy,
    control,
  };
}

export function assertCandidateTrustedReadContext(
  value: CandidateTrustedReadContext,
): CandidateTrustedReadContext {
  if (value.schemaVersion !== CANDIDATE_TRUSTED_READ_CONTEXT_SCHEMA_VERSION
      || value.migrationId !== CANDIDATE_READ_AUTHORITY_MIGRATION_ID
      || value.scope !== "production_radar"
      || value.phase !== value.control.phase
      || value.approvedReleaseId !== value.policy.releaseId
      || value.databaseNow !== value.policy.asOf
      || !Number.isSafeInteger(value.authorityEpoch)
      || value.authorityEpoch < 1
      || !/^sha256:[0-9a-f]{64}$/.test(value.approvalDigest)
      || !/^sha256:[0-9a-f]{64}$/.test(value.authorityFingerprint)) {
    throw new Error("candidate_trusted_read_context_invalid");
  }
  normalizeCandidateCanonicalReadPolicy(value.policy);
  const expected = expectedPhaseState(value.phase);
  const controlFlags = {
    dualRead: value.control.dualReadRequested,
    canonicalRead: value.control.canonicalReadRequested,
    reviewRead: value.control.reviewReadRequested,
  };
  const controlEvidence = {
    reconciliation: value.control.reconciliationEvidenceStatus,
    dualRead: value.control.dualReadEvidenceStatus,
    canonicalCompat: value.control.canonicalCompatEvidenceStatus,
  };
  const evidenceStatuses = {
    reconciliation: value.evidence.reconciliation.status,
    dualRead: value.evidence.dualRead.status,
    canonicalCompat: value.evidence.canonicalCompat.status,
  };
  const expectedFingerprint = hashObject({
    migrationId: value.migrationId,
    authorityEpoch: value.authorityEpoch,
    approvedReleaseId: value.approvedReleaseId,
    approvalDigest: value.approvalDigest,
    phase: value.phase,
    flags: value.flags,
    evidence: value.evidence,
  });
  if (!equal(value.flags, controlFlags)
      || !equal(value.flags, expected.flags)
      || !equal(evidenceStatuses, controlEvidence)
      || !equal(evidenceStatuses, expected.evidence)
      || value.authorityFingerprint !== expectedFingerprint) {
    throw new Error("candidate_trusted_read_context_proof_invalid");
  }
  return value;
}

export async function readCandidateAuthorityManifestFile({
  signal,
}: {
  signal: AbortSignal;
}) {
  return readFile(CANDIDATE_READ_AUTHORITY_MANIFEST_PATH, { encoding: "utf8", signal });
}

export class CandidateTrustedReadContextProvider {
  constructor(private readonly dependencies: Readonly<{
    transactions: PostgresTransactionAdapter;
    env?: CandidateTrustedContextEnv;
    readAuthorityManifest?: (context: Readonly<{ signal: AbortSignal }>) => Promise<string>;
  }>) {}

  async read({ signal }: { signal: AbortSignal }) {
    const env = this.dependencies.env ?? process.env;
    const readAuthorityManifest = this.dependencies.readAuthorityManifest
      ?? readCandidateAuthorityManifestFile;
    return this.dependencies.transactions.withTransaction(
      { ...CANDIDATE_TRUSTED_READ_CONTEXT_TRANSACTION, signal },
      async (tx) => {
        const result = await tx.query<CandidateControlRow>(`SELECT
          phase, epoch::text, started_at, deadline_at, write_frozen,
          approved_release_id, approval_digest, updated_at,
          clock_timestamp() AS database_now
        FROM candidate_authority.candidate_migration_control
        WHERE migration_id=$1`, [CANDIDATE_READ_AUTHORITY_MIGRATION_ID]);
        if (result.rows.length !== 1) throw new Error("candidate_read_control_not_unique");
        const rawManifest = await readAuthorityManifest({ signal });
        return buildContext({ env, rawManifest, row: result.rows[0] });
      },
    );
  }
}
