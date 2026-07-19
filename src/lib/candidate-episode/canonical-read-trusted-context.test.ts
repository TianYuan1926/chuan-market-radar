import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CandidateTrustedReadContextProvider,
  CANDIDATE_TRUSTED_READ_CONTEXT_TRANSACTION,
  assertCandidateTrustedReadContext,
  parseCandidateReadAuthorityManifest,
  type CandidateTrustedReadContext,
} from "./canonical-read-trusted-context";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";

const releaseId = "candidate-shadow-trusted-context-test";
const startedAt = "2026-07-12T00:00:00.000Z";
const generatedAt = "2026-07-12T00:59:00.000Z";
const updatedAt = "2026-07-12T01:00:00.000Z";
const databaseNow = "2026-07-12T01:05:00.000Z";

function digest(raw: string) {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "candidate-read-authority-manifest.v1",
    migrationId: "candidate-episode-v1",
    scope: "production_radar",
    releaseId,
    authorityEpoch: 3,
    phase: "canonical_compat",
    generatedAt,
    flags: { dualRead: true, canonicalRead: true, reviewRead: true },
    evidence: {
      reconciliation: {
        status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
        evidenceHash: `sha256:${"a".repeat(64)}`,
      },
      dualRead: {
        status: "PASS_DUAL_READ_OBSERVATION",
        evidenceHash: `sha256:${"b".repeat(64)}`,
      },
      canonicalCompat: { status: "missing", evidenceHash: null },
    },
    ...overrides,
  });
}

function control(raw: string, overrides: Record<string, unknown> = {}) {
  return {
    phase: "canonical_compat",
    epoch: "3",
    started_at: startedAt,
    deadline_at: "2026-07-15T00:00:00.000Z",
    write_frozen: true,
    approved_release_id: releaseId,
    approval_digest: digest(raw),
    updated_at: updatedAt,
    database_now: databaseNow,
    ...overrides,
  };
}

function fixture({
  env = {},
  raw = manifest(),
  row,
}: {
  env?: Record<string, string | undefined>;
  raw?: string;
  row?: Record<string, unknown> | null;
} = {}) {
  let transactionOptions: unknown = null;
  let querySql = "";
  let queryParams: unknown[] = [];
  const transactions: PostgresTransactionAdapter = {
    async withTransaction(options, work) {
      transactionOptions = options;
      const tx: TransactionContext = {
        async query<T>(sql: string, params: unknown[] = []) {
          querySql = sql;
          queryParams = params;
          return { rows: (row === null ? [] : [row ?? control(raw)]) as T[] };
        },
        async withSavepoint(workWithSavepoint) {
          return workWithSavepoint(tx);
        },
      };
      return work(tx);
    },
  };
  const provider = new CandidateTrustedReadContextProvider({
    transactions,
    env: {
      CANDIDATE_RUNTIME_RELEASE_ID: releaseId,
      CANDIDATE_EPISODE_DUAL_READ: "true",
      CANDIDATE_EPISODE_CANONICAL_READ: "true",
      CANDIDATE_EPISODE_REVIEW_READ: "true",
      ...env,
    },
    readAuthorityManifest: async () => raw,
  });
  return {
    provider,
    observed: () => ({ transactionOptions, querySql, queryParams }),
  };
}

test("trusted provider binds policy and control to one read-only database snapshot", async () => {
  const setup = fixture();
  const signal = new AbortController().signal;
  const context = await setup.provider.read({ signal });
  assert.equal(context.schemaVersion, "candidate-trusted-read-context.v1");
  assert.equal(context.authorityEpoch, 3);
  assert.equal(context.approvedReleaseId, releaseId);
  assert.equal(context.policy.releaseId, releaseId);
  assert.equal(context.policy.asOf, databaseNow);
  assert.equal(context.policy.checkpointKind, "24h");
  assert.deepEqual(context.policy.observationCohort, {
    from: startedAt,
    toExclusive: databaseNow,
  });
  assert.equal(context.control.phase, "canonical_compat");
  assert.equal(context.control.reconciliationEvidenceStatus,
    "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL");
  assert.equal(context.control.dualReadEvidenceStatus, "PASS_DUAL_READ_OBSERVATION");
  assert.equal(context.control.canonicalCompatEvidenceStatus, "missing");
  assert.match(context.authorityFingerprint, /^sha256:[0-9a-f]{64}$/);
  const observed = setup.observed();
  assert.deepEqual(observed.transactionOptions, {
    ...CANDIDATE_TRUSTED_READ_CONTEXT_TRANSACTION,
    signal,
  });
  assert.match(observed.querySql, /candidate_migration_control/);
  assert.deepEqual(observed.queryParams, ["candidate-episode-v1"]);
});

test("trusted provider binds continuation cycle env manifest and database control", async () => {
  const cycleId = "candidate-episode-v1-cycle-2";
  const raw = manifest({ migrationId: cycleId });
  const setup = fixture({
    env: { CANDIDATE_RUNTIME_MIGRATION_ID: cycleId },
    raw,
    row: control(raw),
  });
  const context = await setup.provider.read({ signal: new AbortController().signal });
  assert.equal(context.migrationId, cycleId);
  assert.deepEqual(setup.observed().queryParams, [cycleId]);
});

test("phase cannot manufacture evidence PASS or flags", async () => {
  const missingEvidence = manifest({
    evidence: {
      reconciliation: { status: "missing", evidenceHash: null },
      dualRead: { status: "missing", evidenceHash: null },
      canonicalCompat: { status: "missing", evidenceHash: null },
    },
  });
  await assert.rejects(
    fixture({ raw: missingEvidence }).provider.read({ signal: new AbortController().signal }),
    /candidate_read_evidence_phase_mismatch/,
  );

  await assert.rejects(
    fixture({ env: { CANDIDATE_EPISODE_DUAL_READ: "false" } }).provider
      .read({ signal: new AbortController().signal }),
    /candidate_read_runtime_flag_phase_mismatch/,
  );
});

test("approval digest release epoch and phase must match exact manifest bytes", async () => {
  const raw = manifest();
  await assert.rejects(
    fixture({ raw, row: control(raw, { approval_digest: `sha256:${"0".repeat(64)}` }) }).provider
      .read({ signal: new AbortController().signal }),
    /candidate_read_authority_manifest_digest_mismatch/,
  );
  await assert.rejects(
    fixture({ raw, row: control(raw, { epoch: "4" }) }).provider
      .read({ signal: new AbortController().signal }),
    /candidate_read_authority_manifest_control_mismatch/,
  );
  await assert.rejects(
    fixture({ env: { CANDIDATE_RUNTIME_RELEASE_ID: "candidate-shadow-wrong-release" } }).provider
      .read({ signal: new AbortController().signal }),
    /candidate_read_runtime_release_mismatch/,
  );
});

test("missing, unsafe deadline, or phase freeze mismatch fails closed", async () => {
  await assert.rejects(
    fixture({ row: null }).provider.read({ signal: new AbortController().signal }),
    /candidate_read_control_not_unique/,
  );
  const raw = manifest();
  const expiredFrozen = await fixture({
    raw,
    row: control(raw, { database_now: "2026-07-15T00:00:01.000Z" }),
  }).provider.read({ signal: new AbortController().signal });
  assert.equal(expiredFrozen.phase, "canonical_compat");
  await assert.rejects(
    fixture({ raw, row: control(raw, { write_frozen: false }) }).provider
      .read({ signal: new AbortController().signal }),
    /candidate_read_control_freeze_boundary_invalid/,
  );
  const shadowRaw = manifest({
    phase: "shadow_verify",
    flags: { dualRead: true, canonicalRead: false, reviewRead: false },
    evidence: {
      reconciliation: {
        status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
        evidenceHash: `sha256:${"a".repeat(64)}`,
      },
      dualRead: { status: "missing", evidenceHash: null },
      canonicalCompat: { status: "missing", evidenceHash: null },
    },
  });
  await assert.rejects(
    fixture({
      env: {
        CANDIDATE_EPISODE_CANONICAL_READ: "false",
        CANDIDATE_EPISODE_REVIEW_READ: "false",
      },
      raw: shadowRaw,
      row: control(shadowRaw, {
        database_now: "2026-07-15T00:00:01.000Z",
        phase: "shadow_verify",
        write_frozen: false,
      }),
    }).provider.read({ signal: new AbortController().signal }),
    /candidate_read_control_deadline_expired/,
  );
});

test("authority manifest rejects unknown fields and stale approval windows", async () => {
  assert.throws(
    () => parseCandidateReadAuthorityManifest(manifest({ hiddenAuthority: true })),
    /candidate_read_authority_manifest_shape_invalid/,
  );
  const raw = manifest({ generatedAt: "2026-07-11T20:00:00.000Z" });
  await assert.rejects(
    fixture({ raw }).provider.read({ signal: new AbortController().signal }),
    /candidate_read_authority_manifest_approval_window_invalid/,
  );
});

test("trusted context assertion rejects release and phase disagreement", () => {
  const contextFlags = { dualRead: true, canonicalRead: true, reviewRead: true } as const;
  const contextEvidence = {
    reconciliation: {
      status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
      evidenceHash: `sha256:${"1".repeat(64)}`,
    },
    dualRead: {
      status: "PASS_DUAL_READ_OBSERVATION" as const,
      evidenceHash: `sha256:${"2".repeat(64)}`,
    },
    canonicalCompat: { status: "missing" as const, evidenceHash: null },
  };
  const approvalDigest = `sha256:${"b".repeat(64)}`;
  const authorityFingerprint = digest(JSON.stringify({
    migrationId: "candidate-episode-v1",
    authorityEpoch: 3,
    approvedReleaseId: releaseId,
    approvalDigest,
    phase: "canonical_compat",
    flags: contextFlags,
    evidence: contextEvidence,
  }));
  const valid: CandidateTrustedReadContext = {
    schemaVersion: "candidate-trusted-read-context.v1",
    migrationId: "candidate-episode-v1",
    scope: "production_radar",
    databaseNow,
    authorityEpoch: 3,
    authorityFingerprint,
    approvedReleaseId: releaseId,
    approvalDigest,
    phase: "canonical_compat",
    flags: contextFlags,
    evidence: contextEvidence,
    policy: {
      scope: "production_radar",
      asOf: databaseNow,
      releaseId,
      checkpointKind: "24h",
      evidenceGradeVersion: "eg.v1",
      observationCohort: { from: startedAt, toExclusive: databaseNow },
      dueCohort: { from: startedAt, toExclusive: databaseNow },
    },
    control: {
      phase: "canonical_compat",
      dualReadRequested: true,
      canonicalReadRequested: true,
      reviewReadRequested: true,
      reconciliationEvidenceStatus:
        "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
      dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION",
      canonicalCompatEvidenceStatus: "missing",
    },
  };
  assert.equal(assertCandidateTrustedReadContext(valid), valid);
  assert.throws(
    () => assertCandidateTrustedReadContext({
      ...valid,
      policy: { ...valid.policy, releaseId: "candidate-shadow-other" },
    }),
    /candidate_trusted_read_context_invalid/,
  );
  assert.throws(
    () => assertCandidateTrustedReadContext({
      ...valid,
      control: { ...valid.control, phase: "shadow_verify" },
    }),
    /candidate_trusted_read_context_invalid/,
  );
});
