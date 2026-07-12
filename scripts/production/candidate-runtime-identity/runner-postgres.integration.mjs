import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import pg from "pg";
import {
  candidateConnectionUrl,
  provisionRuntimeIdentities,
  rollbackRuntimeIdentities,
  validateCredentials,
} from "./runner.mjs";

const { Client } = pg;
const require = createRequire(import.meta.url);
const { buildPersistenceSchemaSql } = require(
  resolve(process.cwd(), ".tmp/market-tests/lib/persistence/persistence-contract.js"),
);
const databaseUrl = process.env.WP_G0_2_RUNTIME_IDENTITY_RUNNER_REHEARSAL_DATABASE_URL?.trim();
assert.ok(databaseUrl, "runner rehearsal database URL is required");
const parsed = new URL(databaseUrl);
const credentials = validateCredentials({
  databaseHost: parsed.hostname,
  databaseName: parsed.pathname.replace(/^\//, ""),
  databasePort: Number(parsed.port),
  environment: "rehearsal",
  identities: {
    consumer: { login: "market_radar_candidate_runner_consumer", password: "B".repeat(40) },
    monitor: { login: "market_radar_candidate_runner_monitor", password: "C".repeat(40) },
    source: { login: "market_radar_candidate_runner_source", password: "A".repeat(40) },
  },
  schemaVersion: "candidate-runtime-identity-credentials.v1",
}, { environment: "rehearsal" });
const accessSql = await readFile(
  resolve(process.cwd(), "scripts/production/candidate-runtime-identity/runtime-access.sql"),
  "utf8",
);
const admin = new Client({ connectionString: databaseUrl });

await admin.connect();
try {
  await admin.query(buildPersistenceSchemaSql());
  assert.deepEqual(await provisionRuntimeIdentities(admin, credentials, accessSql), {
    capabilityMemberships: 3,
    dangerousAttributes: 0,
    runtimeLogins: 3,
  });

  for (const purpose of ["source", "consumer", "monitor"]) {
    const client = new Client({ connectionString: candidateConnectionUrl(credentials, purpose) });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${{
        consumer: "candidate_shadow_executor_role",
        monitor: "candidate_audit_role",
        source: "candidate_application_writer_role",
      }[purpose]}`);
      const identity = await client.query("SELECT current_user, session_user");
      assert.equal(identity.rows[0].session_user, credentials.identities[purpose].login);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }

  assert.deepEqual(await rollbackRuntimeIdentities(admin, credentials), {
    runtimeLoginsDropped: 3,
    writerArchiveAccessRevoked: true,
  });
  const after = await admin.query(`SELECT
    (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY($1::text[])) AS logins,
    has_table_privilege('candidate_application_writer_role','public.scan_archives','SELECT') AS writer_select,
    has_table_privilege('candidate_application_writer_role','public.scan_archives','INSERT') AS writer_insert`, [
    Object.values(credentials.identities).map((identity) => identity.login),
  ]);
  assert.deepEqual(after.rows[0], { logins: 0, writer_insert: false, writer_select: false });
  process.stdout.write('{"status":"pass","provisioned":3,"rolledBack":3,"secretsPrinted":false,"productionConnected":false}\n');
} finally {
  await admin.end();
}
