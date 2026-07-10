import { join } from "node:path";
import { Pool } from "pg";
import { assertRehearsalDatabaseTarget } from "../../lib/candidate-episode/database-safety";
import {
  loadCandidateMigrationFiles,
  runCandidateMigrations,
} from "../../lib/candidate-episode/migration-runner";

const designDigest = "2ac5f5f290fa5eed1664736edd6e2aa641815a30e8beb1a349cf49e6634f0d24";
const approvalRef = "WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL";
const releaseId = "wp-g0.2-migration-implementation.v1";

function readEnvironment(argv: string[]) {
  const index = argv.indexOf("--environment");
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

async function main() {
  const target = assertRehearsalDatabaseTarget({
    environment: readEnvironment(process.argv.slice(2)),
    env: process.env,
  });
  const connectionString = process.env.WP_G0_2_REHEARSAL_DATABASE_URL!;
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const migrations = await loadCandidateMigrationFiles(
      join(process.cwd(), "migrations", "candidate-episode"),
    );
    const result = await runCandidateMigrations({
      approvalRef,
      designDigest,
      migrations,
      pool,
      releaseId,
    });
    const verification = await pool.query<{
      columns: string;
      migrations: string;
      tables: string;
    }>(`SELECT
      (SELECT count(*)::text FROM information_schema.tables
       WHERE table_schema = 'candidate_authority' AND table_type = 'BASE TABLE') AS tables,
      (SELECT count(*)::text FROM information_schema.columns
       WHERE table_schema = 'candidate_authority') AS columns,
      (SELECT count(*)::text FROM candidate_authority.schema_migrations
       WHERE status = 'applied') AS migrations`);

    process.stdout.write(`${JSON.stringify({
      status: "pass",
      target,
      migrationCount: migrations.length,
      ...result,
      verification: verification.rows[0],
    })}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const failure = error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "unknown rehearsal migration failure" };
  process.stderr.write(`${JSON.stringify({ status: "fail", failure })}\n`);
  process.exitCode = 23;
});
