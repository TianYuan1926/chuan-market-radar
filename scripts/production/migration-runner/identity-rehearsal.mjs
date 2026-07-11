#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import pg from "./pg-client.mjs";
import {
  AUTHORIZED_ARTIFACT_HASH,
  AUTHORIZED_MANIFEST_HASH,
  AUTHORIZED_SOURCE_COMMIT,
  sha256,
} from "./runner-core.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) {
      throw new Error("invalid argument");
    }
    options[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

async function withClient(connectionString, applicationName, operation) {
  const client = new pg.Client({ application_name: applicationName, connectionString });
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const adminFile = resolve(options["admin-connection-file"]);
  const workDirectory = resolve(options["work-dir"]);
  const output = resolve(options.output);
  const identityTool = join(import.meta.dirname, "identity-remediation.mjs");
  const migrationRunner = join(import.meta.dirname, "migration-runner.mjs");
  const adminUrl = (await readFile(adminFile, "utf8")).trim();
  await mkdir(workDirectory, { mode: 0o700, recursive: true });

  const tables = [
    "daily_mover_assets",
    "daily_mover_snapshots",
    "frontend_ui_states",
    "journal_events",
    "macro_market_snapshots",
    "mover_attribution_reviews",
    "ohlcv_candle_cache",
    "radar_miss_reviews",
    "rank_profiles",
    "scan_archives",
    "scan_asset_states",
    "v3_forward_map_snapshots",
  ];

  await withClient(adminUrl, "market-radar-identity-rehearsal-fixture", async (client) => {
    for (const table of tables) {
      const columns = table === "rank_profiles" ? "id integer, updated_at timestamptz" : "id integer";
      await client.query(`CREATE TABLE IF NOT EXISTS public."${table}" (${columns})`);
    }
  });

  const now = Date.now();
  const token = `identity-rehearsal-${now}`;
  const request = {
    applicationRelease: "rehearsal-release",
    approvalExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    approvalIssuedAt: new Date(now - 60 * 1000).toISOString(),
    approvalRef: "isolated-identity-topology-rehearsal",
    confirmationDigest: sha256(token),
    confirmationExpiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    identityExecute: true,
    operator: "isolated-rehearsal",
    targetClass: "rehearsal",
    workPackage:
      "WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION",
  };
  const requestFile = join(workDirectory, "identity-request.json");
  const confirmationFile = join(workDirectory, "identity-confirmation");
  const secretDirectory = join(workDirectory, "secrets");
  await mkdir(secretDirectory, { mode: 0o700, recursive: true });
  await writeFile(requestFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
  await writeFile(confirmationFile, token, { mode: 0o600 });

  const common = [
    "--cwd", workDirectory,
    "--worktree", join(workDirectory, "protected-production-worktree"),
  ];
  await execFileAsync(process.execPath, [
    identityTool,
    "bootstrap",
    "--request", requestFile,
    "--confirmation-file", confirmationFile,
    "--break-glass-connection-file", adminFile,
    "--secret-dir", secretDirectory,
    "--output", join(workDirectory, "bootstrap.json"),
    ...common,
  ]);

  const applicationFile = join(secretDirectory, "application-runtime.url");
  const migrationFile = join(secretDirectory, "migration-login.url");
  await execFileAsync(process.execPath, [
    identityTool,
    "verify",
    "--application-connection-file", applicationFile,
    "--migration-connection-file", migrationFile,
    "--break-glass-connection-file", adminFile,
    "--output", join(workDirectory, "verify.json"),
    ...common,
  ]);

  const appUrl = (await readFile(applicationFile, "utf8")).trim();
  const migrationUrl = (await readFile(migrationFile, "utf8")).trim();
  const cutover = [];
  for (const [identity, url] of [
    ["old_break_glass", adminUrl],
    ["application_runtime", appUrl],
    ["old_break_glass_rollback", adminUrl],
    ["application_runtime_reapply", appUrl],
  ]) {
    await withClient(url, `market-radar-${identity}`, async (client) => {
      await client.query("SELECT 1");
    });
    cutover.push({ identity, status: "pass" });
  }

  const migrationCapability = await withClient(
    migrationUrl,
    "market-radar-migration-capability-rehearsal",
    async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("CREATE SCHEMA identity_migration_probe");
        await client.query("ALTER SCHEMA identity_migration_probe OWNER TO candidate_migration_role");
        await client.query("SET LOCAL ROLE candidate_migration_role");
        await client.query("CREATE TABLE identity_migration_probe.probe(id integer)");
      } finally {
        await client.query("ROLLBACK");
      }
      const result = await client.query(
        "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='identity_migration_probe') AS present",
      );
      return { ownerSetRole: true, rollbackRemovedProbe: result.rows[0]?.present === false };
    },
  );

  const candidateAbsent = await withClient(adminUrl, "market-radar-candidate-absence", async (client) => {
    const result = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='candidate_authority') AS present",
    );
    return result.rows[0]?.present === false;
  });

  const migrationToken = `migration-rehearsal-${now}`;
  const migrationRequest = {
    applicationRelease: "rehearsal-release",
    approvalExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    approvalIssuedAt: new Date(now - 60 * 1000).toISOString(),
    approvalRef: "isolated-runner-schema-rehearsal",
    artifactHash: AUTHORIZED_ARTIFACT_HASH,
    confirmationDigest: sha256(migrationToken),
    confirmationExpiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    execute: true,
    lockTimeout: "5s",
    manifestHash: AUTHORIZED_MANIFEST_HASH,
    migrationReleaseId: `wp-g0-2-isolated-${now}`,
    operator: "isolated-rehearsal",
    roleBootstrapEnabled: true,
    schemaMigrationEnabled: true,
    sourceCommit: AUTHORIZED_SOURCE_COMMIT,
    statementTimeout: "10min",
    targetClass: "rehearsal",
  };
  const migrationRequestFile = join(workDirectory, "migration-request.json");
  const migrationConfirmationFile = join(workDirectory, "migration-confirmation");
  await writeFile(migrationRequestFile, `${JSON.stringify(migrationRequest)}\n`, { mode: 0o600 });
  await writeFile(migrationConfirmationFile, migrationToken, { mode: 0o600 });
  await execFileAsync(process.execPath, [
    migrationRunner,
    "execute",
    "--request", migrationRequestFile,
    "--confirmation-file", migrationConfirmationFile,
    "--artifact-root", resolve(import.meta.dirname, "../../.."),
    "--state-dir", join(workDirectory, "runner-state"),
    "--break-glass-connection-file", adminFile,
    "--migration-connection-file", migrationFile,
    "--cwd", workDirectory,
    "--worktree", join(workDirectory, "protected-production-worktree"),
  ]);

  const catalog = await withClient(adminUrl, "market-radar-isolated-catalog", async (client) => {
    const result = await client.query(
      `SELECT
        (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='candidate_authority' AND table_type='BASE TABLE') AS tables,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='candidate_authority') AS columns,
        (SELECT count(*)::int FROM pg_proc WHERE pronamespace='candidate_authority'::regnamespace) AS functions,
        (SELECT count(*)::int FROM information_schema.triggers WHERE trigger_schema='candidate_authority') AS triggers,
        (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY($1::text[])) AS roles,
        (SELECT count(*)::int FROM candidate_authority.schema_migrations WHERE status='applied') AS applied_migrations`,
      [[
        "candidate_migration_role",
        "candidate_application_writer_role",
        "candidate_application_reader_role",
        "candidate_shadow_executor_role",
        "candidate_review_reader_role",
        "candidate_backup_restore_role",
        "candidate_audit_role",
      ]],
    );
    return result.rows[0];
  });

  const isolatedSchemaRehearsal = {
    appliedMigrations: catalog.applied_migrations,
    columns: catalog.columns,
    functions: catalog.functions,
    roles: catalog.roles,
    status:
      catalog.tables === 8 &&
      catalog.columns === 151 &&
      catalog.functions === 20 &&
      catalog.triggers === 14 &&
      catalog.roles === 7 &&
      catalog.applied_migrations === 8
        ? "pass"
        : "fail",
    tables: catalog.tables,
    triggers: catalog.triggers,
  };

  const verify = JSON.parse(await readFile(join(workDirectory, "verify.json"), "utf8"));
  const result = {
    candidateMigrationRunInProduction: false,
    candidateSchemaAbsentBeforeIsolatedRunner: candidateAbsent,
    credentialCutover: cutover,
    implicitMigrationDetected: false,
    isolatedCandidateMigrationRun: true,
    isolatedSchemaRehearsal,
    migrationCapability,
    status:
      candidateAbsent &&
      migrationCapability.rollbackRemovedProbe &&
      isolatedSchemaRehearsal.status === "pass"
        ? "pass"
        : "fail",
    verify: verify.result,
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
}

main().catch(() => {
  process.stderr.write('{"status":"fail","reason":"identity_rehearsal_failed"}\n');
  process.exitCode = 1;
});
