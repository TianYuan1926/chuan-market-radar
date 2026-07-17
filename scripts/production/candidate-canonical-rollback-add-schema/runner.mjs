#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

export const PACKAGE_ID = "WP-G0.2-CANONICAL-ROLLBACK-SAFETY-PRODUCTION-ADD-SCHEMA";
export const MIGRATION_FILE = "migrations/candidate-episode/010_candidate_canonical_rollback_safety.sql";
export const MIGRATION_VERSION = "010_candidate_canonical_rollback_safety";
export const MIGRATION_CHECKSUM = "2ae3247a64e08159adfb74a6da48bf0a51a45cba356fe4ad666482a18d0cb1ba";
export const MIGRATION_OWNER_ROLE = "candidate_migration_role";
export const MIGRATION_LOGIN_ROLE = "market_radar_migration_login";
export const ROLLBACK_FUNCTION =
  "candidate_authority.rollback_canonical_migration_control_v1(text,bigint,text,text)";
export const EXPECTED_MIGRATIONS = Object.freeze({
  "001_candidate_episode_authority": "5062af033796f13ce9bcbe34040f9ae5cbdbf3b4eecaab18243e0c07a6d7f94e",
  "002_candidate_episode_event_ledger": "71cf7ca3b76427b7ed5dbf32ffdb4c425e18bc6056bcfbb20945b0e95cfcebdf",
  "003_candidate_episode_checkpoint": "2eae9c3d50be2b159d7311663ae6cdafae8edb984e883825e16e24c9520ad6d0",
  "004_candidate_episode_outcome": "dce46556277582016382a778fa7769906a5809af6d7680b35f119abd949dd7ab",
  "005_candidate_episode_outbox": "b9f509b0c0358248d216ba8d47add8a21338f09144af576674164b0bdfb2ee0b",
  "006_candidate_legacy_import_registry": "715d0d5f4a330dcb4595967b4fff1d78f2c01f05b7a32b118267a9273375ca7c",
  "007_candidate_runtime_roles_and_permissions": "f89869c5650693b65157ad671359d9ab3d412f1e14336b24e7335b4b23cc6448",
  "008_candidate_constraints_and_procedures": "f289062a70d89d2c4b80bfdcd942653b672301ff3ac27c301b592af271d0cb17",
  "009_candidate_shadow_capture_safety": "2cc236dc6c44528b3ebba54e555d3ca07e95ba18709fd467b9578df9dd7979e5",
  [MIGRATION_VERSION]: MIGRATION_CHECKSUM,
});

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const RELEASE = /^wp-g0-2-canonical-rollback-safety-[a-z0-9][a-z0-9._-]{7,100}$/u;
const APPROVAL = /^MR-G0-CANONICAL-ROLLBACK-SAFETY-[A-Z0-9-]{12,160}$/u;

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateRequest(request, { now = new Date(), production = false } = {}) {
  ensure(request?.schemaVersion === "candidate-canonical-rollback-add-schema-request.v1"
    && request.packageId === PACKAGE_ID && request.actionClass === "additive_schema_migration"
    && request.riskTier === "R2_DATABASE_SCHEMA", "request_identity_invalid");
  ensure(request.migrationFile === MIGRATION_FILE && request.migrationVersion === MIGRATION_VERSION
    && request.migrationChecksum === MIGRATION_CHECKSUM, "request_migration_identity_invalid");
  ensure(request.expectedAppliedBaselineCount === 9 && request.expectedAppliedCompletionCount === 10
    && request.onlyPendingMigration === MIGRATION_VERSION, "request_ledger_boundary_invalid");
  ensure(request.roleBootstrapAllowed === false && request.destructiveSqlAllowed === false
    && request.businessDataMutationAllowed === false && request.featureFlagMutationAllowed === false
    && request.serviceMutationAllowed === false && request.sourceSyncAllowed === false,
  "request_scope_invalid");
  ensure(COMMIT.test(request.sourceCommit ?? "") && COMMIT.test(request.sourceTree ?? "")
    && HASH.test(request.contractSha256 ?? "") && HASH.test(request.runnerArtifactSha256 ?? "")
    && HASH.test(request.transportArtifactSha256 ?? "") && HASH.test(request.bundleSha256 ?? ""),
  "request_hash_binding_invalid");
  ensure(RELEASE.test(request.migrationReleaseId ?? "") && APPROVAL.test(request.approvalRef ?? ""),
    "request_release_identity_invalid");
  ensure(request.lockTimeout === "5s" && request.statementTimeout === "30s"
    && request.idleTransactionTimeout === "60s", "request_timeout_invalid");
  const issued = Date.parse(request.approvalIssuedAt ?? "");
  const expires = Date.parse(request.approvalExpiresAt ?? "");
  ensure(Number.isFinite(issued) && Number.isFinite(expires) && issued <= now.getTime()
    && expires > now.getTime() && expires - issued <= 90 * 60 * 1000,
  "request_approval_window_invalid");
  if (production) {
    const approval = request.autonomyAuthorization;
    ensure(approval?.schemaVersion === "market-radar-package-authorization.v1"
      && approval.mode === "g0_g8_standing_user_grant"
      && approval.approvedBy === "user_standing_grant" && approval.packageId === PACKAGE_ID
      && approval.actionClass === "additive_schema_migration"
      && approval.riskTier === "R2_DATABASE_SCHEMA" && approval.maxExecutions === 1
      && approval.targetCommit === request.sourceCommit
      && approval.targetTree === request.sourceTree
      && approval.artifactSha256 === request.transportArtifactSha256
      && approval.imageOrMigrationSha256 === MIGRATION_CHECKSUM,
    "request_autonomy_authorization_invalid");
  }
  return request;
}

export async function readLockedMigration(root = process.cwd()) {
  const path = resolve(root, MIGRATION_FILE);
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
    "migration_file_invalid");
  const bytes = await readFile(path);
  ensure(sha256(bytes) === MIGRATION_CHECKSUM, "migration_checksum_mismatch");
  const sql = bytes.toString("utf8");
  ensure(/CREATE OR REPLACE FUNCTION candidate_authority\.rollback_canonical_migration_control_v1/u.test(sql)
    && /SECURITY DEFINER/u.test(sql) && /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/u.test(sql)
    && /GRANT EXECUTE ON FUNCTION[\s\S]*TO candidate_migration_role/u.test(sql),
  "migration_sql_contract_invalid");
  ensure(!/\b(?:DROP|TRUNCATE|DELETE|INSERT|ALTER TABLE|CREATE TABLE|CREATE ROLE)\b/iu.test(sql),
    "migration_sql_scope_invalid");
  return { bytes, sql };
}

async function identity(client) {
  const result = await client.query(`SELECT current_user, session_user,
    role.rolsuper, role.rolcreaterole, role.rolcreatedb, role.rolreplication, role.rolbypassrls,
    pg_has_role(current_user, $1, 'MEMBER') AS migration_member
    FROM pg_roles role WHERE role.rolname = current_user`, [MIGRATION_OWNER_ROLE]);
  const row = result.rows[0];
  ensure(row?.current_user === MIGRATION_LOGIN_ROLE && row.session_user === MIGRATION_LOGIN_ROLE
    && row.rolsuper === false && row.rolcreaterole === false && row.rolcreatedb === false
    && row.rolreplication === false && row.rolbypassrls === false
    && row.migration_member === true, "migration_identity_invalid");
  return row;
}

async function ledger(client) {
  const result = await client.query(`SELECT version, checksum, status
    FROM candidate_authority.schema_migrations ORDER BY version`);
  return result.rows;
}

export function validateLedger(rows, expectedCount) {
  ensure(Array.isArray(rows) && rows.length === expectedCount, "migration_ledger_count_invalid");
  const expected = Object.entries(EXPECTED_MIGRATIONS).slice(0, expectedCount);
  ensure(rows.every((row, index) => row.version === expected[index][0]
    && row.checksum === expected[index][1] && row.status === "applied"),
  "migration_ledger_identity_invalid");
  return rows;
}

async function functionBoundary(client, { expected }) {
  const result = await client.query(`SELECT
    to_regprocedure($1) IS NOT NULL AS exists,
    COALESCE((SELECT owner.rolname FROM pg_proc procedure
      JOIN pg_roles owner ON owner.oid = procedure.proowner
      WHERE procedure.oid = to_regprocedure($1)), '') AS owner,
    COALESCE((SELECT procedure.prosecdef FROM pg_proc procedure
      WHERE procedure.oid = to_regprocedure($1)), false) AS security_definer,
    COALESCE((SELECT procedure.proconfig::text FROM pg_proc procedure
      WHERE procedure.oid = to_regprocedure($1)), '') AS config,
    COALESCE((SELECT has_function_privilege('candidate_application_writer_role', procedure.oid,
      'EXECUTE') FROM pg_proc procedure WHERE procedure.oid=to_regprocedure($1)), false) AS writer_execute,
    COALESCE((SELECT has_function_privilege('candidate_application_reader_role', procedure.oid,
      'EXECUTE') FROM pg_proc procedure WHERE procedure.oid=to_regprocedure($1)), false) AS reader_execute,
    COALESCE((SELECT has_function_privilege('candidate_shadow_executor_role', procedure.oid,
      'EXECUTE') FROM pg_proc procedure WHERE procedure.oid=to_regprocedure($1)), false) AS shadow_execute,
    COALESCE((SELECT has_function_privilege('candidate_review_reader_role', procedure.oid,
      'EXECUTE') FROM pg_proc procedure WHERE procedure.oid=to_regprocedure($1)), false) AS review_execute,
    COALESCE((SELECT EXISTS (SELECT 1
      FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) acl
      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
      FROM pg_proc procedure WHERE procedure.oid=to_regprocedure($1)), false) AS public_execute,
    has_table_privilege('candidate_application_writer_role',
      'candidate_authority.candidate_migration_control', 'UPDATE') AS writer_control_update`,
  [ROLLBACK_FUNCTION]);
  const row = result.rows[0];
  ensure(row?.exists === expected, expected ? "rollback_function_missing" : "rollback_function_preexists");
  if (expected) {
    ensure(row.owner === MIGRATION_OWNER_ROLE && row.security_definer === true
      && row.config.includes("search_path=pg_catalog, candidate_authority")
      && row.writer_execute === false && row.reader_execute === false
      && row.shadow_execute === false && row.review_execute === false
      && row.public_execute === false && row.writer_control_update === false,
    "rollback_function_privilege_invalid");
  }
  return row;
}

async function businessSnapshot(client) {
  const result = await client.query(`SELECT json_build_object(
    'episodes', (SELECT count(*) FROM candidate_authority.candidate_episodes),
    'events', (SELECT count(*) FROM candidate_authority.candidate_episode_events),
    'checkpoints', (SELECT count(*) FROM candidate_authority.candidate_episode_checkpoints),
    'outcomes', (SELECT count(*) FROM candidate_authority.candidate_episode_outcomes),
    'outbox', (SELECT count(*) FROM candidate_authority.candidate_episode_ingest_outbox),
    'resolutions', (SELECT count(*) FROM candidate_authority.candidate_outbox_quarantine_resolutions),
    'controls', (SELECT count(*) FROM candidate_authority.candidate_migration_control),
    'legacyImports', (SELECT count(*) FROM candidate_authority.candidate_episode_legacy_imports)
  ) AS snapshot`);
  return result.rows[0].snapshot;
}

async function schemaFingerprint(client) {
  const result = await client.query(`SELECT json_build_object(
    'columns', COALESCE((SELECT json_agg(json_build_array(table_name, ordinal_position,
      column_name, data_type, is_nullable, column_default) ORDER BY table_name, ordinal_position)
      FROM information_schema.columns WHERE table_schema='candidate_authority'), '[]'::json),
    'functions', COALESCE((SELECT json_agg(json_build_array(
      procedure.proname, pg_get_function_identity_arguments(procedure.oid), owner.rolname,
      procedure.prosecdef, procedure.proconfig::text, procedure.proacl::text)
      ORDER BY procedure.proname, pg_get_function_identity_arguments(procedure.oid))
      FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
      JOIN pg_roles owner ON owner.oid=procedure.proowner
      WHERE namespace.nspname='candidate_authority'), '[]'::json)
  ) AS catalog`);
  return `sha256:${sha256(JSON.stringify(result.rows[0].catalog))}`;
}

export async function preflightDatabase(client) {
  await identity(client);
  await client.query(`SET ROLE ${MIGRATION_OWNER_ROLE}`);
  try {
    validateLedger(await ledger(client), 9);
    await functionBoundary(client, { expected: false });
    const control = await client.query(`SELECT count(*)::int AS count,
      count(*) FILTER (WHERE phase='canonical')::int AS canonical_count
      FROM candidate_authority.candidate_migration_control`);
    ensure(control.rows[0].canonical_count === 0,
      "canonical_phase_before_rollback_safety_forbidden");
    return {
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_PREFLIGHT",
      migrationRows: 9,
      controlRows: control.rows[0].count,
      canonicalRows: control.rows[0].canonical_count,
    };
  } finally {
    await client.query("RESET ROLE").catch(() => {});
  }
}

export async function executeDatabase(client, request, migrationSql) {
  validateRequest(request);
  await identity(client);
  await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [PACKAGE_ID]);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
      await client.query("SELECT set_config('lock_timeout', $1, true)", [request.lockTimeout]);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [request.statementTimeout]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
        [request.idleTransactionTimeout]);
      await client.query(`SET LOCAL ROLE ${MIGRATION_OWNER_ROLE}`);
      validateLedger(await ledger(client), 9);
      await functionBoundary(client, { expected: false });
      const beforeBusiness = await businessSnapshot(client);
      const fromFingerprint = await schemaFingerprint(client);
      const started = Date.now();
      await client.query(migrationSql);
      const toFingerprint = await schemaFingerprint(client);
      ensure(fromFingerprint !== toFingerprint, "schema_fingerprint_unchanged");
      await client.query(`INSERT INTO candidate_authority.schema_migrations (
        version, checksum, from_schema_fingerprint, to_schema_fingerprint, release_id,
        approval_ref, applied_at, applied_by_role, duration_ms, status
      ) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),current_user,$7,'applied')`, [
        MIGRATION_VERSION, MIGRATION_CHECKSUM, fromFingerprint, toFingerprint,
        request.migrationReleaseId, request.approvalRef, Math.max(0, Date.now() - started),
      ]);
      validateLedger(await ledger(client), 10);
      await functionBoundary(client, { expected: true });
      const afterBusiness = await businessSnapshot(client);
      ensure(JSON.stringify(beforeBusiness) === JSON.stringify(afterBusiness),
        "candidate_business_data_changed_in_migration_transaction");
      await client.query("COMMIT");
      return {
        status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_EXECUTE",
        applied: [MIGRATION_VERSION],
        skipped: Object.keys(EXPECTED_MIGRATIONS).slice(0, 9),
        businessDataChanged: false,
        fromSchemaFingerprint: fromFingerprint,
        toSchemaFingerprint: toFingerprint,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  } finally {
    await client.query("RESET ROLE").catch(() => {});
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [PACKAGE_ID])
      .catch(() => {});
  }
}

export async function verifyDatabase(client) {
  await identity(client);
  await client.query(`SET ROLE ${MIGRATION_OWNER_ROLE}`);
  try {
    validateLedger(await ledger(client), 10);
    const boundary = await functionBoundary(client, { expected: true });
    return {
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_VERIFY",
      migrationRows: 10,
      functionOwner: boundary.owner,
      leastPrivilege: true,
      candidateBusinessDataMutationObserved: false,
    };
  } finally {
    await client.query("RESET ROLE").catch(() => {});
  }
}

async function secureText(path) {
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0,
    "private_file_invalid");
  return (await readFile(path, "utf8")).trim();
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined, "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  ensure(["preflight", "execute", "verify"].includes(command), "command_invalid");
  const request = validateRequest(JSON.parse(await secureText(resolve(options.request))), {
    production: options.production === "true",
  });
  const connectionString = await secureText(resolve(options["migration-url-file"]));
  const client = new pg.Client({ connectionString,
    application_name: `market-radar-${PACKAGE_ID.toLowerCase()}` });
  await client.connect();
  try {
    const result = command === "preflight"
      ? await preflightDatabase(client)
      : command === "execute"
        ? await executeDatabase(client, request,
          (await readLockedMigration(resolve(options.root ?? process.cwd()))).sql)
        : await verifyDatabase(client);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
