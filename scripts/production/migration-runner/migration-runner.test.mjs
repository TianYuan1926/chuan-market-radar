import assert from "node:assert/strict";
import { mkdtemp, mkdir, chmod, copyFile, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUTHORIZED_ARTIFACT_HASH,
  AUTHORIZED_MANIFEST_HASH,
  AUTHORIZED_SOURCE_COMMIT,
  CANDIDATE_ROLE_ALLOWLIST,
  EXPECTED_MIGRATION_CHECKSUMS,
  RunnerPolicyError,
  assertOutsideProductionWorktree,
  assertSecureFile,
  loadAndValidateArtifact,
  redact,
  sha256,
  splitRoleBootstrapMigration,
  splitSchemaOwnerTransition,
  validateConfirmation,
  validateMigrationSql,
  validateRequest,
  validateRoleBootstrapSql,
  validateRoleIdentity,
  validateWorktreeGuardSnapshot,
} from "./runner-core.mjs";
import { verifyMigrationIdentity } from "./migration-runner.mjs";

const now = new Date("2026-07-11T02:00:00.000Z");
const baseRequest = {
  applicationRelease: "0599f802f261fe8e3c1982a07106f362bd62ac13",
  approvalExpiresAt: "2026-07-11T03:00:00.000Z",
  approvalIssuedAt: "2026-07-11T01:00:00.000Z",
  approvalRef: "wp-g0-2-identity-runner-user-contract",
  artifactHash: AUTHORIZED_ARTIFACT_HASH,
  execute: false,
  lockTimeout: "5s",
  manifestHash: AUTHORIZED_MANIFEST_HASH,
  migrationReleaseId: "wp-g0-2-schema-test",
  operator: "test-operator",
  roleBootstrapEnabled: false,
  schemaMigrationEnabled: false,
  sourceCommit: AUTHORIZED_SOURCE_COMMIT,
  statementTimeout: "10min",
  targetClass: "production",
};

function rejectsReason(reason, operation) {
  return assert.rejects(operation, (error) =>
    error instanceof RunnerPolicyError && error.reason === reason);
}

function throwsReason(reason, operation) {
  assert.throws(operation, (error) =>
    error instanceof RunnerPolicyError && error.reason === reason);
}

test("accepts a fresh explicit production dry-run request", () => {
  assert.equal(validateRequest(baseRequest, { now }), baseRequest);
});

for (const [name, patch, reason] of [
  ["approvalRef", { approvalRef: "" }, "approvalRef_missing"],
  ["source commit", { sourceCommit: "f".repeat(40) }, "source_commit_mismatch"],
  ["manifest hash", { manifestHash: "a".repeat(64) }, "manifest_hash_mismatch"],
  ["artifact hash", { artifactHash: "b".repeat(64) }, "artifact_hash_mismatch"],
  ["target class", { targetClass: "live" }, "target_class_invalid"],
  ["lock timeout", { lockTimeout: "forever" }, "lock_timeout_invalid"],
  ["statement timeout", { statementTimeout: "" }, "statement_timeout_invalid"],
  ["execute flag", { execute: undefined }, "execute_flag_missing"],
  ["role bootstrap flag", { roleBootstrapEnabled: undefined }, "role_bootstrap_flag_missing"],
  ["schema flag", { schemaMigrationEnabled: undefined }, "schema_migration_flag_missing"],
] ) {
  test(`rejects invalid ${name}`, () => {
    throwsReason(reason, () => validateRequest({ ...baseRequest, ...patch }, { now }));
  });
}

test("rejects an expired approval", () => {
  throwsReason("approval_window_invalid_or_expired", () =>
    validateRequest({ ...baseRequest, approvalExpiresAt: "2026-07-11T01:59:59.000Z" }, { now }));
});

test("rejects enabled phases while execute is false", () => {
  throwsReason("dry_run_phase_enablement_forbidden", () =>
    validateRequest({ ...baseRequest, roleBootstrapEnabled: true }, { now }));
});

test("validates the locked eight-file artifact", async () => {
  const artifact = await loadAndValidateArtifact(process.cwd());
  assert.equal(artifact.migrationFileCount, 8);
  assert.equal(artifact.artifactHash, AUTHORIZED_ARTIFACT_HASH);
});

test("artifact hash uses the canonical filename to checksum map", async () => {
  const map = {};
  for (const filename of Object.keys(EXPECTED_MIGRATION_CHECKSUMS)) {
    map[filename] = sha256(await readFile(join("migrations/candidate-episode", filename)));
  }
  assert.equal(sha256(JSON.stringify(map)), AUTHORIZED_ARTIFACT_HASH);
});

test("rejects a migration file set mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-file-set-"));
  await mkdir(join(root, "migrations", "candidate-episode"), { recursive: true });
  await writeFile(join(root, "migrations", "candidate-episode", "001_extra.sql"), "SELECT 1;\n");
  try {
    await rejectsReason("migration_file_set_mismatch", () => loadAndValidateArtifact(root));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects checksum drift in a complete artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-checksum-"));
  const destination = join(root, "migrations", "candidate-episode");
  await mkdir(destination, { recursive: true });
  for (const filename of Object.keys(EXPECTED_MIGRATION_CHECKSUMS)) {
    await copyFile(join("migrations/candidate-episode", filename), join(destination, filename));
  }
  await writeFile(join(destination, "001_candidate_episode_authority.sql"), "SELECT 1;\n");
  try {
    await rejectsReason("migration_checksum_mismatch", () => loadAndValidateArtifact(root));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("role migration split recomposes the exact locked bytes", async () => {
  const sql = await readFile(
    "migrations/candidate-episode/007_candidate_runtime_roles_and_permissions.sql",
    "utf8",
  );
  const split = splitRoleBootstrapMigration(sql);
  assert.equal(`${split.roleBootstrapSql}\n\n${split.schemaMigrationSql}`, sql);
  const ownerTransition = splitSchemaOwnerTransition(split.schemaMigrationSql);
  assert.equal(
    `${ownerTransition.migrationLoginSql}${ownerTransition.ownerRoleSql}`,
    split.schemaMigrationSql,
  );
});

test("rejects a missing role bootstrap split boundary", () => {
  throwsReason("role_bootstrap_boundary_mismatch", () => splitRoleBootstrapMigration("SELECT 1;"));
});

test("rejects a missing owner transition split boundary", () => {
  throwsReason("schema_owner_transition_boundary_mismatch", () =>
    splitSchemaOwnerTransition("SELECT 1;"));
});

test("accepts only the approved role bootstrap allowlist", async () => {
  const sql = await readFile(
    "migrations/candidate-episode/007_candidate_runtime_roles_and_permissions.sql",
    "utf8",
  );
  assert.equal(validateRoleBootstrapSql(splitRoleBootstrapMigration(sql).roleBootstrapSql), true);
  assert.equal(CANDIDATE_ROLE_ALLOWLIST.length, 7);
});

test("rejects an unexpected candidate role", async () => {
  const sql = await readFile(
    "migrations/candidate-episode/007_candidate_runtime_roles_and_permissions.sql",
    "utf8",
  );
  const roleSql = splitRoleBootstrapMigration(sql).roleBootstrapSql.replace(
    "'candidate_audit_role'",
    "'candidate_unapproved_role'",
  );
  throwsReason("role_bootstrap_role_not_allowlisted", () => validateRoleBootstrapSql(roleSql));
});

for (const [name, sql, reason] of [
  ["destructive SQL", "DROP TABLE candidate_authority.x", "destructive_sql_detected"],
  ["legacy mutation", "UPDATE journal_events SET payload='{}'", "legacy_business_mutation_detected"],
  ["feature flag SQL", "SELECT 'CANDIDATE_EPISODE_CANONICAL_WRITE'", "feature_flag_sql_detected"],
  ["secret pattern", "SELECT 'postgresql://user:value@host/db'", "secret_pattern_in_migration"],
]) {
  test(`rejects ${name}`, () => {
    throwsReason(reason, () => validateMigrationSql("synthetic.sql", sql));
  });
}

test("allows a runner cwd outside the protected worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-outside-"));
  const worktree = join(root, "worktree");
  const cwd = join(root, "ops");
  await mkdir(worktree);
  await mkdir(cwd);
  try {
    const result = await assertOutsideProductionWorktree({ cwd, productionWorktree: worktree });
    assert.equal(result.cwd, await realpath(cwd));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a runner cwd inside the protected worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-inside-"));
  const cwd = join(root, "nested");
  await mkdir(cwd);
  try {
    await rejectsReason("cwd_inside_production_worktree", () =>
      assertOutsideProductionWorktree({ cwd, productionWorktree: root }));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

const guardSnapshot = {
  capturedAt: now.toISOString(),
  clean: true,
  compareStatus: "pass",
  envMetadataHash: "a".repeat(64),
  head: baseRequest.applicationRelease,
  metadataHash: "b".repeat(64),
  pathHash: "c".repeat(64),
  statusEntryCount: 0,
  worktree: "/home/ubuntu/apps/chuan-market-radar",
};

test("accepts a fresh clean production worktree guard snapshot", () => {
  assert.equal(
    validateWorktreeGuardSnapshot(guardSnapshot, {
      expectedHead: baseRequest.applicationRelease,
      now,
    }),
    guardSnapshot,
  );
});

test("rejects a stale production worktree guard snapshot", () => {
  throwsReason("worktree_guard_stale", () =>
    validateWorktreeGuardSnapshot(
      { ...guardSnapshot, capturedAt: "2026-07-11T01:00:00.000Z" },
      { expectedHead: baseRequest.applicationRelease, now },
    ));
});

test("rejects a dirty production worktree guard snapshot", () => {
  throwsReason("worktree_guard_not_clean", () =>
    validateWorktreeGuardSnapshot(
      { ...guardSnapshot, clean: false, statusEntryCount: 1 },
      { expectedHead: baseRequest.applicationRelease, now },
    ));
});

test("rejects a production worktree guard HEAD mismatch", () => {
  throwsReason("worktree_guard_head_mismatch", () =>
    validateWorktreeGuardSnapshot(guardSnapshot, {
      expectedHead: "f".repeat(40),
      now,
    }));
});

test("accepts a mode 0600 secret file", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-secret-"));
  const file = join(root, "secret");
  await writeFile(file, "value", { mode: 0o600 });
  try {
    assert.equal((await assertSecureFile(file)).mode, "600");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a group-readable secret file", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-open-secret-"));
  const file = join(root, "secret");
  await writeFile(file, "value", { mode: 0o600 });
  await chmod(file, 0o640);
  try {
    await rejectsReason("secret_file_permissions_too_open", () => assertSecureFile(file));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

const leastPrivilegeLogin = {
  rolbypassrls: false,
  rolcanlogin: true,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolreplication: false,
  rolsuper: false,
};

test("accepts least-privilege application and migration identities", () => {
  assert.equal(validateRoleIdentity(leastPrivilegeLogin, "application"), true);
  assert.equal(validateRoleIdentity(leastPrivilegeLogin, "migration"), true);
});

function migrationVerificationClient({ boundaryError = null, ownerMember = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes("FROM pg_roles")) {
        return {
          rows: [{
            role_name: "market_radar_migration_login",
            ...leastPrivilegeLogin,
          }],
        };
      }
      if (sql.includes("pg_has_role")) return { rows: [{ owner_member: ownerMember }] };
      if (sql === "SET ROLE candidate_migration_role") return { rows: [] };
      if (sql.includes("candidate_authority.schema_migrations")) {
        if (boundaryError) throw boundaryError;
        return {
          rows: [{ candidate_schema_present: true, migration_rows: 8 }],
        };
      }
      if (sql === "RESET ROLE") return { rows: [] };
      throw new Error(`unexpected_query:${sql}`);
    },
  };
}

test("post-schema verification activates the owner role for a NOINHERIT migration login", async () => {
  const client = migrationVerificationClient();
  const result = await verifyMigrationIdentity(client);

  assert.equal(result.rolinherit, false);
  assert.equal(result.ownerMembership, true);
  assert.equal(result.candidateSchemaPresent, true);
  assert.equal(result.migrationRegistryRows, 8);
  assert.ok(
    client.queries.indexOf("SET ROLE candidate_migration_role")
      < client.queries.findIndex((sql) => sql.includes("candidate_authority.schema_migrations")),
  );
  assert.equal(client.queries.at(-1), "RESET ROLE");
});

test("post-schema verification resets the owner role when the boundary read fails", async () => {
  const error = Object.assign(new Error("permission denied for schema candidate_authority"), {
    code: "42501",
  });
  const client = migrationVerificationClient({ boundaryError: error });

  await assert.rejects(() => verifyMigrationIdentity(client), error);
  assert.equal(client.queries.at(-1), "RESET ROLE");
});

test("migration verification does not activate the owner role without membership", async () => {
  const client = migrationVerificationClient({ ownerMember: false });
  const result = await verifyMigrationIdentity(client);

  assert.equal(result.ownerMembership, false);
  assert.equal(result.candidateSchemaPresent, null);
  assert.equal(result.migrationRegistryRows, null);
  assert.equal(client.queries.includes("SET ROLE candidate_migration_role"), false);
});

test("rejects a superuser application identity", () => {
  throwsReason("application_role_capability_invalid", () =>
    validateRoleIdentity({ ...leastPrivilegeLogin, rolsuper: true }, "application"));
});

test("rejects a CREATEROLE migration identity", () => {
  throwsReason("migration_role_capability_invalid", () =>
    validateRoleIdentity({ ...leastPrivilegeLogin, rolcreaterole: true }, "migration"));
});

test("accepts a NOLOGIN owner identity", () => {
  assert.equal(validateRoleIdentity({ ...leastPrivilegeLogin, rolcanlogin: false }, "owner"), true);
});

test("accepts a superuser break-glass identity", () => {
  assert.equal(validateRoleIdentity({ ...leastPrivilegeLogin, rolsuper: true }, "break_glass"), true);
});

test("validates a fresh confirmation token from a mode 0600 file", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-confirm-"));
  const file = join(root, "confirmation");
  const token = "one-time-confirmation";
  await writeFile(file, token, { mode: 0o600 });
  try {
    assert.equal(
      await validateConfirmation({
        confirmationFile: file,
        now,
        request: {
          ...baseRequest,
          confirmationDigest: sha256(token),
          confirmationExpiresAt: "2026-07-11T02:05:00.000Z",
          execute: true,
        },
      }),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a mismatched confirmation token", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-confirm-bad-"));
  const file = join(root, "confirmation");
  await writeFile(file, "wrong", { mode: 0o600 });
  try {
    await rejectsReason("confirmation_token_mismatch", () =>
      validateConfirmation({
        confirmationFile: file,
        now,
        request: {
          ...baseRequest,
          confirmationDigest: sha256("right"),
          confirmationExpiresAt: "2026-07-11T02:05:00.000Z",
          execute: true,
        },
      }));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("redacts connection-like fields and values", () => {
  assert.deepEqual(redact({ connectionString: "postgresql://x:y@host/db", safe: "ok" }), {
    connectionString: "[REDACTED]",
    safe: "ok",
  });
});

test("preserves redacted role class session counts for production evidence", () => {
  assert.deepEqual(redact({
    activeRoleClassCounts: {
      application_runtime: 1,
      break_glass: 0,
      migration_login: 0,
      other_login: 0,
    },
    activeRoleCounts: [{ role_hash: "hash", session_count: 1 }],
  }), {
    activeRoleClassCounts: {
      application_runtime: 1,
      break_glass: 0,
      migration_login: 0,
      other_login: 0,
    },
    activeRoleCounts: [{ role_hash: "hash", session_count: 1 }],
  });
});
