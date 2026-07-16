import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  CandidateTrustedReadContextProvider,
} from "./canonical-read-trusted-context";
import { assertRehearsalDatabaseTarget } from "./database-safety";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_TRUSTED_CONTEXT_REHEARSAL_DATABASE_URL;
const integrationTest = rehearsalUrl ? test : test.skip;

function connectionForLogin(connectionString: string, login: string) {
  const url = new URL(connectionString);
  url.username = login;
  url.password = "";
  return url.toString();
}

function digest(raw: string) {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

integrationTest("PostgreSQL 16 provides trusted context through read-only audit identity", async () => {
  const target = assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: { ...process.env, WP_G0_2_REHEARSAL_DATABASE_URL: rehearsalUrl },
  });
  assert.match(target.databaseName, /^wp_g0_2_rehearsal_/);
  assert.equal(target.hostClass, "local");

  const admin = new Pool({ connectionString: rehearsalUrl, max: 3 });
  const suffix = `${process.pid}_${Date.now()}`;
  const login = `market_radar_candidate_trusted_${suffix}`.slice(0, 62);
  const releaseId = "candidate-shadow-trusted-context-pg16";
  const generatedAt = new Date(Date.now() - 30_000).toISOString();
  const rawManifest = JSON.stringify({
    schemaVersion: "candidate-read-authority-manifest.v1",
    migrationId: "candidate-episode-v1",
    scope: "production_radar",
    releaseId,
    authorityEpoch: 2,
    phase: "shadow_verify",
    generatedAt,
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
  await admin.query(`CREATE ROLE ${login} LOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query(`GRANT candidate_audit_role TO ${login}`);
  await admin.query(`INSERT INTO candidate_authority.candidate_migration_control (
    migration_id, phase, epoch, started_at, deadline_at, write_frozen,
    approved_release_id, approval_digest, updated_at
  ) VALUES (
    'candidate-episode-v1','shadow_verify',2,clock_timestamp()-interval '1 hour',
    clock_timestamp()+interval '47 hours',false,$1,$2,clock_timestamp()
  )`, [releaseId, digest(rawManifest)]);
  try {
    const pool = new Pool({ connectionString: connectionForLogin(rehearsalUrl as string, login), max: 2 });
    try {
      const provider = new CandidateTrustedReadContextProvider({
        transactions: createPostgresTransactionAdapter(pool, { role: "candidate_audit_role" }),
        env: {
          CANDIDATE_RUNTIME_RELEASE_ID: releaseId,
          CANDIDATE_EPISODE_DUAL_READ: "true",
          CANDIDATE_EPISODE_CANONICAL_READ: "false",
          CANDIDATE_EPISODE_REVIEW_READ: "false",
        },
        readAuthorityManifest: async () => rawManifest,
      });
      const context = await provider.read({ signal: new AbortController().signal });
      assert.equal(context.phase, "shadow_verify");
      assert.equal(context.authorityEpoch, 2);
      assert.equal(context.policy.releaseId, releaseId);
      assert.equal(context.control.dualReadRequested, true);
      assert.equal(context.control.canonicalReadRequested, false);
      assert.equal(context.control.reconciliationEvidenceStatus,
        "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL");

      const client = await pool.connect();
      try {
        await client.query("SET ROLE candidate_audit_role");
        await assert.rejects(
          client.query(`UPDATE candidate_authority.candidate_migration_control
            SET updated_at=clock_timestamp() WHERE migration_id='candidate-episode-v1'`),
          (error) => typeof error === "object" && error !== null && "code" in error
            && error.code === "42501",
        );
        await client.query("RESET ROLE");
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query("DELETE FROM candidate_authority.candidate_migration_control WHERE migration_id='candidate-episode-v1'")
      .catch(() => undefined);
    await admin.query(`REVOKE candidate_audit_role FROM ${login}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${login}`).catch(() => undefined);
    await admin.end();
  }
});
