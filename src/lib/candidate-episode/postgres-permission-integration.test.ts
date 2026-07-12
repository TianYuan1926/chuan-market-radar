import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { assertRehearsalDatabaseTarget } from "./database-safety";

const { Client } = pg;

const DATABASE_URL_ENV = "WP_G0_2_REHEARSAL_DATABASE_URL";
const rehearsalDatabaseUrl = process.env[DATABASE_URL_ENV]?.trim();

const CANDIDATE_ROLES = [
  "candidate_migration_role",
  "candidate_application_writer_role",
  "candidate_application_reader_role",
  "candidate_shadow_executor_role",
  "candidate_review_reader_role",
  "candidate_backup_restore_role",
  "candidate_audit_role",
] as const;

type CandidateRole = (typeof CANDIDATE_ROLES)[number];
type PgClient = InstanceType<typeof Client>;
type SqlStateError = Error & { code?: string };

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const CORE_READER_TABLES = [
  "candidate_episodes",
  "candidate_episode_events",
  "candidate_episode_checkpoints",
  "candidate_episode_outcomes",
] as const;

const REVIEW_READER_TABLES = [
  "candidate_episodes",
  "candidate_episode_checkpoints",
  "candidate_episode_outcomes",
  "candidate_outbox_quarantine_resolutions",
] as const;

const ALL_AUTHORITY_TABLES = [
  "schema_migrations",
  "candidate_episodes",
  "candidate_episode_events",
  "candidate_episode_checkpoints",
  "candidate_episode_outcomes",
  "candidate_episode_ingest_outbox",
  "candidate_outbox_quarantine_resolutions",
  "candidate_episode_legacy_imports",
  "candidate_migration_control",
] as const;

describe(
  "candidate_authority PostgreSQL permission recovery",
  {
    concurrency: false,
    skip: rehearsalDatabaseUrl ? false : `${DATABASE_URL_ENV} is not explicitly set`,
  },
  () => {
    let client: PgClient;
    let savepointSequence = 0;

    const scope = "production_radar";
    const episodeId = randomUUID();
    const discoveryEventId = randomUUID();
    const checkpointId = randomUUID();
    const scheduleEventId = randomUUID();
    const retryEventId = randomUUID();
    const outcomeEventId = randomUUID();
    const outcomeId = randomUUID();
    const instrumentId = `AGENT_H_REHEARSAL_${episodeId}`;
    const releaseId = "wp-g0-2-agent-h-rehearsal";
    const writerRuntimeId = "agent-h-writer";
    const shadowRuntimeId = "agent-h-shadow";

    const firstSeenAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const lastSeenAt = new Date(firstSeenAt.getTime() + 60_000);
    const windowStart = new Date(Date.now() - 65 * 60 * 1_000);
    const windowEnd = new Date(Date.now() - 5 * 60 * 1_000);
    const dueAt = new Date(Date.now() - 4 * 60 * 1_000);
    const finalizeBy = new Date(Date.now() + 60 * 60 * 1_000);
    const firstClaimAt = new Date(Date.now() - 2 * 60 * 1_000);
    const nextAttemptAt = new Date(firstClaimAt.getTime() + 1_000);
    const secondClaimAt = new Date(firstClaimAt.getTime() + 2_000);
    const recordedAt = new Date(firstClaimAt.getTime() + 3_000);

    before(async () => {
      assert.ok(rehearsalDatabaseUrl, `${DATABASE_URL_ENV} must be explicitly set`);
      const target = assertRehearsalDatabaseTarget({
        environment: "rehearsal",
        env: process.env,
      });
      assert.equal(target.transport, "unix_socket");

      client = new Client({
        application_name: "wp-g0-2-agent-h-permission-rehearsal",
        connectionString: rehearsalDatabaseUrl,
      });
      await client.connect();
      await client.query("BEGIN");
    });

    after(async () => {
      if (!client) {
        return;
      }

      try {
        await client.query("ROLLBACK");
      } finally {
        await client.end();
      }
    });

    async function withRole<T>(role: CandidateRole, action: () => Promise<T>): Promise<T> {
      await client.query(`SET ROLE ${role}`);

      try {
        const currentRole = await client.query<{ current_user: string }>("SELECT current_user");
        assert.equal(currentRole.rows[0]?.current_user, role);
        return await action();
      } finally {
        await client.query("RESET ROLE");
      }
    }

    async function expectPermissionDenied(sql: string, params: unknown[] = []): Promise<void> {
      savepointSequence += 1;
      const savepoint = `agent_h_permission_${savepointSequence}`;
      await client.query(`SAVEPOINT ${savepoint}`);

      try {
        await assert.rejects(
          client.query(sql, params),
          (error: SqlStateError) => {
            assert.equal(error.code, "42501");
            return true;
          },
        );
      } finally {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    }

    async function assertReadableTables(role: CandidateRole, tables: readonly string[]): Promise<void> {
      await withRole(role, async () => {
        for (const table of tables) {
          await client.query(`SELECT 1 FROM candidate_authority.${table} LIMIT 1`);
        }

        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episodes SET updated_at = updated_at WHERE false",
        );
      });
    }

    test("all seven runtime roles exist without dangerous attributes", async () => {
      const result = await client.query<{
        rolbypassrls: boolean;
        rolcanlogin: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolname: string;
        rolreplication: boolean;
        rolsuper: boolean;
      }>(
        `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
                rolcanlogin, rolreplication, rolbypassrls
         FROM pg_catalog.pg_roles
         WHERE rolname = ANY($1::text[])
         ORDER BY rolname`,
        [[...CANDIDATE_ROLES]],
      );

      assert.deepEqual(
        result.rows.map((row) => row.rolname),
        [...CANDIDATE_ROLES].sort(),
      );

      for (const role of result.rows) {
        assert.deepEqual(
          {
            bypassRls: role.rolbypassrls,
            canLogin: role.rolcanlogin,
            createDb: role.rolcreatedb,
            createRole: role.rolcreaterole,
            inherit: role.rolinherit,
            replication: role.rolreplication,
            superuser: role.rolsuper,
          },
          {
            bypassRls: false,
            canLogin: false,
            createDb: false,
            createRole: false,
            inherit: false,
            replication: false,
            superuser: false,
          },
          `${role.rolname} has a dangerous role attribute`,
        );
      }
    });

    test("writer executes approved episode procedures but cannot mutate authority tables directly", async () => {
      await withRole("candidate_application_writer_role", async () => {
        const opened = await client.query<{ created: boolean; result_episode_id: string }>(
          `SELECT result_episode_id::text, created
           FROM candidate_authority.open_or_refresh_episode_v1(
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19
           )`,
          [
            scope,
            episodeId,
            discoveryEventId,
            instrumentId,
            { venue: "rehearsal" },
            firstSeenAt,
            lastSeenAt,
            "100.000000000000000000",
            `price-fact-${episodeId}`,
            ["permission_rehearsal"],
            "P2",
            "deep_candidate",
            "neutral",
            finalizeBy,
            releaseId,
            `scan-cycle-${episodeId}`,
            writerRuntimeId,
            `open-${episodeId}`,
            sha256(`open-hash-${episodeId}`),
          ],
        );

        assert.deepEqual(opened.rows[0], {
          created: true,
          result_episode_id: episodeId,
        });

        const scheduled = await client.query<{ created: boolean; result_checkpoint_id: string }>(
          `SELECT result_checkpoint_id::text, created
           FROM candidate_authority.schedule_checkpoint_v1(
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14
           )`,
          [
            scope,
            checkpointId,
            episodeId,
            discoveryEventId,
            scheduleEventId,
            "1h",
            dueAt,
            windowStart,
            windowEnd,
            finalizeBy,
            releaseId,
            writerRuntimeId,
            `schedule-${checkpointId}`,
            sha256(`schedule-hash-${checkpointId}`),
          ],
        );

        assert.deepEqual(scheduled.rows[0], {
          created: true,
          result_checkpoint_id: checkpointId,
        });
        await client.query(
          "SELECT candidate_authority.assert_episode_direction_v1($1, $2, $3, $4)",
          [scope, episodeId, instrumentId, "neutral"],
        );

        await expectPermissionDenied(
          "INSERT INTO candidate_authority.candidate_episodes DEFAULT VALUES",
        );
        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episodes SET updated_at = updated_at WHERE scope = $1 AND episode_id = $2",
          [scope, episodeId],
        );
        await expectPermissionDenied(
          "DELETE FROM candidate_authority.candidate_episodes WHERE scope = $1 AND episode_id = $2",
          [scope, episodeId],
        );
        await expectPermissionDenied(
          "ALTER TABLE candidate_authority.candidate_episodes ADD COLUMN agent_h_forbidden boolean",
        );
        await expectPermissionDenied("DROP TABLE candidate_authority.candidate_episodes");
        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episode_events SET event_time = event_time WHERE scope = $1 AND event_id = $2",
          [scope, discoveryEventId],
        );
        await expectPermissionDenied(
          "DELETE FROM candidate_authority.candidate_episode_events WHERE scope = $1 AND event_id = $2",
          [scope, discoveryEventId],
        );
      });
    });

    test("reader, review, audit, and backup roles are read-only within their approved table sets", async () => {
      await assertReadableTables("candidate_application_reader_role", CORE_READER_TABLES);
      await withRole("candidate_application_reader_role", async () => {
        await expectPermissionDenied(
          "SELECT 1 FROM candidate_authority.candidate_episode_ingest_outbox LIMIT 1",
        );
      });

      await assertReadableTables("candidate_review_reader_role", REVIEW_READER_TABLES);
      await withRole("candidate_review_reader_role", async () => {
        await expectPermissionDenied(
          "SELECT 1 FROM candidate_authority.candidate_episode_events LIMIT 1",
        );
      });

      await assertReadableTables("candidate_audit_role", ALL_AUTHORITY_TABLES);
      await assertReadableTables("candidate_backup_restore_role", ALL_AUTHORITY_TABLES);
    });

    test("shadow claims, retries, and records through procedures without Episode mutation rights", async () => {
      const outboxControlId = `agent-h-outbox-${episodeId}`;
      const outboxNow = new Date();
      await client.query(
        `INSERT INTO candidate_authority.candidate_migration_control (
           migration_id, phase, epoch, started_at, deadline_at, write_frozen,
           approved_release_id, approval_digest, updated_at
         ) VALUES ($1, 'shadow_verify', 1, $2, $3, false, $4, $5, $2)`,
        [
          outboxControlId,
          new Date(outboxNow.getTime() - 60_000),
          new Date(outboxNow.getTime() + 60 * 60 * 1_000),
          releaseId,
          `synthetic-approval-${episodeId}`,
        ],
      );
      await withRole("candidate_shadow_executor_role", async () => {
        const firstClaim = await client.query<{ checkpoint_id: string; fencing_token: string }>(
          `SELECT checkpoint_id::text, fencing_token::text
           FROM candidate_authority.claim_checkpoints_v1($1, $2, $3, $4, $5)
           WHERE checkpoint_id = $6`,
          [scope, shadowRuntimeId, firstClaimAt, 600, 100, checkpointId],
        );
        assert.equal(firstClaim.rows[0]?.checkpoint_id, checkpointId);

        const retried = await client.query<{ checkpoint_id: string; status: string }>(
          `SELECT checkpoint_id::text, status
           FROM candidate_authority.retry_checkpoint_v1(
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
           )`,
          [
            scope,
            checkpointId,
            shadowRuntimeId,
            firstClaim.rows[0]?.fencing_token,
            firstClaimAt,
            nextAttemptAt,
            "rehearsal_retry",
            "redacted rehearsal retry",
            retryEventId,
            `retry-${checkpointId}`,
            sha256(`retry-hash-${checkpointId}`),
          ],
        );
        assert.deepEqual(retried.rows[0], {
          checkpoint_id: checkpointId,
          status: "retry_wait",
        });

        const secondClaim = await client.query<{ checkpoint_id: string; fencing_token: string }>(
          `SELECT checkpoint_id::text, fencing_token::text
           FROM candidate_authority.claim_checkpoints_v1($1, $2, $3, $4, $5)
           WHERE checkpoint_id = $6`,
          [scope, shadowRuntimeId, secondClaimAt, 600, 100, checkpointId],
        );
        assert.equal(secondClaim.rows[0]?.checkpoint_id, checkpointId);

        const recorded = await client.query<{ outcome_id: string; status: string }>(
          `SELECT outcome_id::text, status
           FROM candidate_authority.record_outcome_v1(
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23, $24,
             $25, $26, $27, $28, $29, $30, $31, $32
           )`,
          [
            scope,
            outcomeId,
            checkpointId,
            shadowRuntimeId,
            secondClaim.rows[0]?.fencing_token,
            "recorded",
            sha256(`outcome-hash-${outcomeId}`),
            "100.000000000000000000",
            `price-fact-${episodeId}`,
            windowStart,
            windowEnd,
            "rehearsal_fixture",
            instrumentId,
            "1m",
            60,
            60,
            0,
            0,
            "1.000000",
            sha256(`candle-set-${outcomeId}`),
            "0.05000000",
            "-0.01000000",
            "0.02000000",
            true,
            [],
            recordedAt,
            releaseId,
            "agent-h-rehearsal.v1",
            recordedAt,
            outcomeEventId,
            `outcome-${outcomeId}`,
            sha256(`outcome-command-hash-${outcomeId}`),
          ],
        );

        assert.deepEqual(recorded.rows[0], {
          outcome_id: outcomeId,
          status: "recorded",
        });

        const outboxClaim = await client.query<{
          fencing_token: string;
          outbox_id: string;
          payload_hash: string;
        }>(
          `SELECT outbox_id::text, fencing_token::text, payload_hash
           FROM candidate_authority.claim_outbox_v1($1, $2, $3, $4, $5, $6, $7)
           WHERE outbox_id = $8`,
          [scope, shadowRuntimeId, outboxNow, 600, 100, outboxControlId, 1, discoveryEventId],
        );
        assert.equal(outboxClaim.rows[0]?.outbox_id, discoveryEventId);
        const outboxCompleted = await client.query<{ outbox_id: string; status: string }>(
          `SELECT outbox_id::text, status
           FROM candidate_authority.complete_outbox_v1($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            scope,
            discoveryEventId,
            shadowRuntimeId,
            outboxClaim.rows[0]?.fencing_token,
            outboxNow,
            outboxClaim.rows[0]?.payload_hash,
            outboxControlId,
            1,
          ],
        );
        assert.deepEqual(outboxCompleted.rows[0], {
          outbox_id: discoveryEventId,
          status: "completed",
        });

        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episodes SET updated_at = updated_at WHERE scope = $1 AND episode_id = $2",
          [scope, episodeId],
        );
        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episode_ingest_outbox SET payload = payload WHERE scope = $1 AND outbox_id = $2",
          [scope, discoveryEventId],
        );
      });

      await withRole("candidate_application_writer_role", async () => {
        await expectPermissionDenied(
          "UPDATE candidate_authority.candidate_episode_outcomes SET status = 'missed' WHERE scope = $1 AND outcome_id = $2",
          [scope, outcomeId],
        );
      });
    });
  },
);
