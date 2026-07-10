import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

type Registry = {
  fields: Array<{ column: string; table: string }>;
};

const migrationDirectory = join(process.cwd(), "migrations", "candidate-episode");
const contractDirectory = join(process.cwd(), "src", "lib", "candidate-episode", "contracts");

async function migrationSql() {
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const sql = (await Promise.all(files.map((file) => readFile(join(migrationDirectory, file), "utf8")))).join("\n");
  return { files, sql };
}

function ddlFields(sql: string) {
  const fields: string[] = [];

  for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? candidate_authority\.([a-z_]+) \(([\s\S]*?)\n\);/g)) {
    const table = match[1];
    for (const line of match[2].split("\n")) {
      const column = /^  ([a-z][a-z0-9_]*)\s+/.exec(line)?.[1];
      if (column) {
        fields.push(`${table}.${column}`);
      }
    }
  }

  return fields;
}

test("migration layout is versioned and responsibility-split", async () => {
  const { files } = await migrationSql();

  assert.deepEqual(files, [
    "001_candidate_episode_authority.sql",
    "002_candidate_episode_event_ledger.sql",
    "003_candidate_episode_checkpoint.sql",
    "004_candidate_episode_outcome.sql",
    "005_candidate_episode_outbox.sql",
    "006_candidate_legacy_import_registry.sql",
    "007_candidate_runtime_roles_and_permissions.sql",
    "008_candidate_constraints_and_procedures.sql",
  ]);
});

test("migration DDL covers every approved registry field exactly once", async () => {
  const { sql } = await migrationSql();
  const registryFiles = (await readdir(contractDirectory)).filter((file) => file.endsWith(".json"));
  const registryFields = (
    await Promise.all(
      registryFiles.map(async (file) =>
        (JSON.parse(await readFile(join(contractDirectory, file), "utf8")) as Registry).fields.map(
          (field) => `${field.table}.${field.column}`,
        ),
      ),
    )
  ).flat();
  const fields = ddlFields(sql);

  assert.equal(fields.length, 151);
  assert.equal(new Set(fields).size, 151);
  assert.deepEqual(fields.filter((field) => !registryFields.includes(field)), []);
  assert.deepEqual(registryFields.filter((field) => !fields.includes(field)), []);
});

test("migration is additive and does not touch legacy tables", async () => {
  const { sql } = await migrationSql();

  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+(public\.)?(journal_events|scan_asset_states)\b/i);
  assert.doesNotMatch(sql, /\bPASSWORD\b|DATABASE_URL|POSTGRES_URL|CRON_SECRET/i);
});

test("database boundary includes required guards, procedures and roles", async () => {
  const { sql } = await migrationSql();

  for (const object of [
    "candidate_episodes_one_active_v1",
    "guard_candidate_episode_mutation_v1",
    "reject_immutable_row_mutation_v1",
    "open_or_refresh_episode_v1",
    "close_episode_v1",
    "assert_episode_direction_v1",
    "schedule_checkpoint_v1",
    "claim_checkpoints_v1",
    "retry_checkpoint_v1",
    "record_outcome_v1",
    "claim_outbox_v1",
    "retry_outbox_v1",
    "complete_outbox_v1",
    "transition_migration_control_v1",
    "candidate_migration_role",
    "candidate_application_writer_role",
    "candidate_application_reader_role",
    "candidate_shadow_executor_role",
    "candidate_review_reader_role",
    "candidate_backup_restore_role",
    "candidate_audit_role",
  ]) {
    assert.match(sql, new RegExp(`\\b${object}\\b`), object);
  }
  assert.match(sql, /checkpoint schedule idempotency command hash conflict/);
  assert.match(sql, /terminal Outcome content hash conflict/);
  assert.match(sql, /stale Checkpoint fencing token rejected/);
  assert.equal((sql.match(/\^sha256:\[0-9a-f\]\{64\}\$/g) ?? []).length, 4);
});
