import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { buildPersistenceSchemaSql } from "../persistence/persistence-contract";
import {
  createCandidateRuntimeDatabase,
  transactionRoleByPurpose,
  type CandidateRuntimeDatabasePurpose,
} from "./candidate-runtime-database";
import { assertRehearsalDatabaseTarget } from "./database-safety";
import {
  createPostgresTransactionAdapter,
  type PostgresTransactionPool,
  type TransactionContext,
} from "./transaction-adapter";

const { Pool } = pg;
const rehearsalUrl = process.env.WP_G0_2_RUNTIME_IDENTITY_REHEARSAL_DATABASE_URL?.trim();
const integrationTest = rehearsalUrl ? test : test.skip;

const loginByPurpose = {
  consumer: "candidate_consumer_login_rehearsal",
  monitor: "candidate_monitor_login_rehearsal",
  source: "candidate_source_login_rehearsal",
} as const satisfies Record<CandidateRuntimeDatabasePurpose, string>;

type SqlStateError = Error & { code?: string };

function urlForLogin(databaseUrl: string, login: string) {
  const url = new URL(databaseUrl);
  url.username = login;
  url.password = "";
  return url.toString();
}

async function expectDenied(tx: TransactionContext, sql: string) {
  await assert.rejects(
    tx.withSavepoint((savepoint) => savepoint.query(sql)),
    (error: SqlStateError) => {
      assert.equal(error.code, "42501");
      return true;
    },
  );
}

integrationTest(
  "isolated PostgreSQL 16 proves NOINHERIT candidate runtime logins and cross-role denial",
  { concurrency: false },
  async () => {
    assert.ok(rehearsalUrl);
    const target = assertRehearsalDatabaseTarget({
      env: process.env,
      environment: "rehearsal",
    });
    assert.equal(target.transport, "unix_socket");

    const admin = new Pool({ connectionString: rehearsalUrl, max: 2 });
    const runtimePools = new Map<CandidateRuntimeDatabasePurpose, InstanceType<typeof Pool>>();
    try {
      await admin.query(buildPersistenceSchemaSql());
      const accessSql = await readFile(
        resolve(process.cwd(), "scripts/production/candidate-runtime-identity/runtime-access.sql"),
        "utf8",
      );
      await admin.query(accessSql);

      for (const purpose of ["source", "consumer", "monitor"] as const) {
        const login = loginByPurpose[purpose];
        await admin.query(`CREATE ROLE ${login}
          LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        await admin.query(`GRANT ${transactionRoleByPurpose[purpose]} TO ${login}`);
      }

      const roleRows = await admin.query<{
        memberships: number;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolname: string;
        rolreplication: boolean;
        rolsuper: boolean;
      }>(`
        SELECT login.rolname, login.rolsuper, login.rolinherit, login.rolcreaterole,
          login.rolcreatedb, login.rolreplication, login.rolbypassrls,
          count(membership.roleid)::int AS memberships
        FROM pg_roles login
        LEFT JOIN pg_auth_members membership ON membership.member = login.oid
        WHERE login.rolname = ANY($1::text[])
        GROUP BY login.oid, login.rolname, login.rolsuper, login.rolinherit,
          login.rolcreaterole, login.rolcreatedb, login.rolreplication, login.rolbypassrls
        ORDER BY login.rolname
      `, [Object.values(loginByPurpose)]);
      assert.equal(roleRows.rows.length, 3);
      for (const role of roleRows.rows) {
        assert.deepEqual({
          bypassRls: role.rolbypassrls,
          createDb: role.rolcreatedb,
          createRole: role.rolcreaterole,
          inherit: role.rolinherit,
          memberships: role.memberships,
          replication: role.rolreplication,
          superuser: role.rolsuper,
        }, {
          bypassRls: false,
          createDb: false,
          createRole: false,
          inherit: false,
          memberships: 1,
          replication: false,
          superuser: false,
        });
      }

      const env = Object.fromEntries(
        (["source", "consumer", "monitor"] as const).map((purpose) => [
          {
            consumer: "CANDIDATE_CONSUMER_DATABASE_URL",
            monitor: "CANDIDATE_MONITOR_DATABASE_URL",
            source: "CANDIDATE_SOURCE_DATABASE_URL",
          }[purpose],
          urlForLogin(rehearsalUrl, loginByPurpose[purpose]),
        ]),
      );
      const runtime = Object.fromEntries(
        (["source", "consumer", "monitor"] as const).map((purpose) => [
          purpose,
          createCandidateRuntimeDatabase({
            env,
            poolFactory(connectionString, receivedPurpose) {
              const pool = new Pool({ connectionString, max: 2 });
              runtimePools.set(receivedPurpose, pool);
              return pool as unknown as PostgresTransactionPool;
            },
            purpose,
          }),
        ]),
      ) as Record<CandidateRuntimeDatabasePurpose, ReturnType<typeof createCandidateRuntimeDatabase>>;

      await runtime.source.transactions!.withTransaction({}, async (tx) => {
        const identity = await tx.query<{ current_user: string; session_user: string }>(
          "SELECT current_user, session_user",
        );
        assert.deepEqual(identity.rows[0], {
          current_user: transactionRoleByPurpose.source,
          session_user: loginByPurpose.source,
        });
        await tx.query(`INSERT INTO public.scan_archives (
          id, scope, source, status, generated_at, scanned_count, anomaly_count,
          candidate_count, signals_count, top_symbols, payload
        ) VALUES ('identity-rehearsal','identity-rehearsal','coinglass','ready',clock_timestamp(),
          1,0,0,0,ARRAY[]::text[],'{}'::jsonb)`);
        const archive = await tx.query<{ id: string }>(
          "SELECT id FROM public.scan_archives WHERE scope='identity-rehearsal'",
        );
        assert.equal(archive.rows[0]?.id, "identity-rehearsal");
        await expectDenied(tx, "UPDATE public.scan_archives SET status='failed'");
        await expectDenied(tx, "DELETE FROM public.scan_archives");
        await expectDenied(tx, "INSERT INTO candidate_authority.candidate_episodes DEFAULT VALUES");
        await expectDenied(tx, "CREATE TABLE public.candidate_identity_forbidden(id integer)");
      });

      await runtime.consumer.transactions!.withTransaction({}, async (tx) => {
        const identity = await tx.query<{ current_user: string; session_user: string }>(
          "SELECT current_user, session_user",
        );
        assert.deepEqual(identity.rows[0], {
          current_user: transactionRoleByPurpose.consumer,
          session_user: loginByPurpose.consumer,
        });
        const privilege = await tx.query<{ claim: boolean; enqueue: boolean }>(`
          SELECT
            has_function_privilege(current_user,
              'candidate_authority.claim_shadow_candidate_outbox_v2(text,text,timestamptz,integer,integer,text,bigint)',
              'EXECUTE') AS claim,
            has_function_privilege(current_user,
              'candidate_authority.enqueue_shadow_candidate_outbox_v2(text,uuid,text,text,jsonb,text,text,text,bigint)',
              'EXECUTE') AS enqueue
        `);
        assert.deepEqual(privilege.rows[0], { claim: true, enqueue: false });
        await expectDenied(tx, "SELECT 1 FROM public.scan_archives LIMIT 1");
        await expectDenied(tx, "SELECT 1 FROM candidate_authority.candidate_episode_ingest_outbox LIMIT 1");
      });

      await runtime.monitor.transactions!.withTransaction({ readOnly: true }, async (tx) => {
        const identity = await tx.query<{ current_user: string; session_user: string }>(
          "SELECT current_user, session_user",
        );
        assert.deepEqual(identity.rows[0], {
          current_user: transactionRoleByPurpose.monitor,
          session_user: loginByPurpose.monitor,
        });
        await tx.query("SELECT 1 FROM candidate_authority.candidate_migration_control LIMIT 1");
        await expectDenied(tx, "SELECT 1 FROM public.scan_archives LIMIT 1");
      });
      await runtime.monitor.transactions!.withTransaction({}, async (tx) => {
        await expectDenied(tx, "UPDATE candidate_authority.candidate_migration_control SET write_frozen=true");
      });

      const sourcePool = runtimePools.get("source");
      assert.ok(sourcePool);
      const crossRole = createPostgresTransactionAdapter(
        sourcePool as unknown as PostgresTransactionPool,
        { role: transactionRoleByPurpose.consumer },
      );
      await assert.rejects(
        crossRole.withTransaction({}, async () => undefined),
        (error: SqlStateError) => {
          assert.equal(error.code, "42501");
          return true;
        },
      );
    } finally {
      await Promise.all([...runtimePools.values()].map((pool) => pool.end()));
      await admin.end();
    }
  },
);
