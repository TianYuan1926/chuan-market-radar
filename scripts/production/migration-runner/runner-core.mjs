import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const AUTHORIZED_SOURCE_COMMIT =
  "e9604336c24fdc625437c43bba4d9a7688e58cd0";
export const AUTHORIZED_MANIFEST_HASH =
  "56ad07d07263e35495cf20eb43dccfb8c36a0ad50a3f8e517634188ba658d102";
export const AUTHORIZED_ARTIFACT_HASH =
  "ab0e6f06e5ccab3b919e4e91212f5628160f41582a1d2e2ca443bdd4aee8b76f";
export const PRODUCTION_WORKTREE = "/home/ubuntu/apps/chuan-market-radar";
export const MIGRATION_OWNER_ROLE = "candidate_migration_role";
export const APPLICATION_RUNTIME_ROLE = "market_radar_app_runtime";
export const MIGRATION_LOGIN_ROLE = "market_radar_migration_login";

export const EXPECTED_MIGRATION_CHECKSUMS = Object.freeze({
  "001_candidate_episode_authority.sql":
    "5062af033796f13ce9bcbe34040f9ae5cbdbf3b4eecaab18243e0c07a6d7f94e",
  "002_candidate_episode_event_ledger.sql":
    "71cf7ca3b76427b7ed5dbf32ffdb4c425e18bc6056bcfbb20945b0e95cfcebdf",
  "003_candidate_episode_checkpoint.sql":
    "2eae9c3d50be2b159d7311663ae6cdafae8edb984e883825e16e24c9520ad6d0",
  "004_candidate_episode_outcome.sql":
    "dce46556277582016382a778fa7769906a5809af6d7680b35f119abd949dd7ab",
  "005_candidate_episode_outbox.sql":
    "b9f509b0c0358248d216ba8d47add8a21338f09144af576674164b0bdfb2ee0b",
  "006_candidate_legacy_import_registry.sql":
    "715d0d5f4a330dcb4595967b4fff1d78f2c01f05b7a32b118267a9273375ca7c",
  "007_candidate_runtime_roles_and_permissions.sql":
    "f89869c5650693b65157ad671359d9ab3d412f1e14336b24e7335b4b23cc6448",
  "008_candidate_constraints_and_procedures.sql":
    "f289062a70d89d2c4b80bfdcd942653b672301ff3ac27c301b592af271d0cb17",
});

export const CANDIDATE_ROLE_ALLOWLIST = Object.freeze([
  "candidate_migration_role",
  "candidate_application_writer_role",
  "candidate_application_reader_role",
  "candidate_shadow_executor_role",
  "candidate_review_reader_role",
  "candidate_backup_restore_role",
  "candidate_audit_role",
]);

const roleBootstrapBoundary =
  "\n\nREVOKE ALL ON SCHEMA candidate_authority FROM PUBLIC;";
const ownerTransitionBoundary =
  "ALTER SCHEMA candidate_authority OWNER TO candidate_migration_role;\n";
const secretPattern =
  /(postgres(?:ql)?:\/\/|redis:\/\/|(?:^|[^a-z0-9_])(?:password|token|secret|api[_-]?key)\s*=|begin (?:rsa|openssh|private) key)/i;
const destructiveSqlPattern =
  /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|ROLE|COLUMN)|TRUNCATE|VACUUM\s+FULL|REINDEX\s+SYSTEM)\b/i;
const legacyMutationPattern =
  /\b(?:ALTER|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:public\.)?(?:journal_events|scan_archives|v3_forward_map_snapshots|rank_profiles|daily_mover_snapshots|daily_mover_assets|mover_attribution_reviews|radar_miss_reviews|ohlcv_candle_cache|scan_asset_states|macro_market_snapshots|frontend_ui_states)\b/i;
const featureFlagPattern =
  /CANDIDATE_EPISODE_(?:CANONICAL_WRITE|SHADOW_WRITE|DUAL_READ|CANONICAL_READ|REVIEW_READ)/i;

export class RunnerPolicyError extends Error {
  constructor(reason, message = reason) {
    super(message);
    this.name = "RunnerPolicyError";
    this.reason = reason;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashIdentity(value) {
  return value ? `sha256:${sha256(value)}` : null;
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

export async function assertOutsideProductionWorktree({
  cwd = process.cwd(),
  productionWorktree = PRODUCTION_WORKTREE,
}) {
  const resolvedCwd = await realpath(resolve(cwd));
  let resolvedWorktree;

  try {
    resolvedWorktree = await realpath(resolve(productionWorktree));
  } catch {
    resolvedWorktree = resolve(productionWorktree);
  }

  if (isInside(resolvedWorktree, resolvedCwd)) {
    throw new RunnerPolicyError(
      "cwd_inside_production_worktree",
      "Migration runner must execute outside the production worktree.",
    );
  }

  return { cwd: resolvedCwd, productionWorktree: resolvedWorktree };
}

export async function assertSecureFile(filePath) {
  const metadata = await stat(filePath);
  const mode = metadata.mode & 0o777;

  if (!metadata.isFile()) {
    throw new RunnerPolicyError("secret_path_not_file");
  }
  if ((mode & 0o077) !== 0) {
    throw new RunnerPolicyError("secret_file_permissions_too_open");
  }

  return { mode: mode.toString(8), size: metadata.size };
}

export function redact(value) {
  if (typeof value === "string") {
    return secretPattern.test(value) ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /password|secret|token|connection|string|url/i.test(key)
          ? entry == null
            ? entry
            : "[REDACTED]"
          : redact(entry),
      ]),
    );
  }
  return value;
}

function assertExactHash(actual, expected, reason) {
  if (actual !== expected) {
    throw new RunnerPolicyError(reason, `${reason}: expected locked hash`);
  }
}

export function validateApprovalWindow(request, now = new Date()) {
  const issuedAt = Date.parse(request.approvalIssuedAt ?? "");
  const expiresAt = Date.parse(request.approvalExpiresAt ?? "");
  const nowMs = now.getTime();

  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new RunnerPolicyError("approval_window_missing");
  }
  if (issuedAt > nowMs || expiresAt <= nowMs || expiresAt - issuedAt > 24 * 60 * 60 * 1000) {
    throw new RunnerPolicyError("approval_window_invalid_or_expired");
  }
}

export function validateRequest(request, { now = new Date() } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new RunnerPolicyError("request_invalid");
  }

  for (const field of [
    "approvalRef",
    "migrationReleaseId",
    "operator",
    "applicationRelease",
  ]) {
    if (typeof request[field] !== "string" || !request[field].trim()) {
      throw new RunnerPolicyError(`${field}_missing`);
    }
  }

  validateApprovalWindow(request, now);
  assertExactHash(
    request.sourceCommit,
    AUTHORIZED_SOURCE_COMMIT,
    "source_commit_mismatch",
  );
  assertExactHash(
    request.manifestHash,
    AUTHORIZED_MANIFEST_HASH,
    "manifest_hash_mismatch",
  );
  assertExactHash(
    request.artifactHash,
    AUTHORIZED_ARTIFACT_HASH,
    "artifact_hash_mismatch",
  );

  if (!new Set(["rehearsal", "production"]).has(request.targetClass)) {
    throw new RunnerPolicyError("target_class_invalid");
  }
  if (request.execute !== true && request.execute !== false) {
    throw new RunnerPolicyError("execute_flag_missing");
  }
  if (request.roleBootstrapEnabled !== true && request.roleBootstrapEnabled !== false) {
    throw new RunnerPolicyError("role_bootstrap_flag_missing");
  }
  if (request.schemaMigrationEnabled !== true && request.schemaMigrationEnabled !== false) {
    throw new RunnerPolicyError("schema_migration_flag_missing");
  }
  if (!/^\d+(?:ms|s|min)$/.test(request.lockTimeout ?? "")) {
    throw new RunnerPolicyError("lock_timeout_invalid");
  }
  if (!/^\d+(?:ms|s|min)$/.test(request.statementTimeout ?? "")) {
    throw new RunnerPolicyError("statement_timeout_invalid");
  }

  if (!request.execute && (request.roleBootstrapEnabled || request.schemaMigrationEnabled)) {
    throw new RunnerPolicyError("dry_run_phase_enablement_forbidden");
  }
  if (request.targetClass === "production" && request.execute && !request.confirmationDigest) {
    throw new RunnerPolicyError("production_confirmation_digest_missing");
  }

  return request;
}

export function validateIdentityRequest(request, { now = new Date() } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new RunnerPolicyError("identity_request_invalid");
  }
  if (
    request.workPackage !==
    "WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION"
  ) {
    throw new RunnerPolicyError("identity_work_package_mismatch");
  }
  for (const field of ["approvalRef", "operator", "applicationRelease"]) {
    if (typeof request[field] !== "string" || !request[field].trim()) {
      throw new RunnerPolicyError(`${field}_missing`);
    }
  }
  validateApprovalWindow(request, now);
  if (request.targetClass !== "production" && request.targetClass !== "rehearsal") {
    throw new RunnerPolicyError("target_class_invalid");
  }
  if (request.identityExecute !== true && request.identityExecute !== false) {
    throw new RunnerPolicyError("identity_execute_flag_missing");
  }

  return request;
}

export async function validateIdentityConfirmation({
  confirmationFile,
  request,
  now = new Date(),
}) {
  if (!request.identityExecute) {
    throw new RunnerPolicyError("identity_execute_not_enabled");
  }
  if (!confirmationFile) {
    throw new RunnerPolicyError("confirmation_file_missing");
  }
  await assertSecureFile(confirmationFile);
  const expiresAt = Date.parse(request.confirmationExpiresAt ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new RunnerPolicyError("confirmation_expired");
  }
  const token = (await readFile(confirmationFile, "utf8")).trim();
  if (!token || sha256(token) !== request.confirmationDigest) {
    throw new RunnerPolicyError("confirmation_token_mismatch");
  }
  return true;
}

export function validateWorktreeGuardSnapshot(
  snapshot,
  {
    expectedHead,
    expectedWorktree = PRODUCTION_WORKTREE,
    maxAgeMs = 5 * 60 * 1000,
    now = new Date(),
  } = {},
) {
  const capturedAt = Date.parse(snapshot?.capturedAt ?? "");
  if (!Number.isFinite(capturedAt) || capturedAt > now.getTime() + 30_000) {
    throw new RunnerPolicyError("worktree_guard_timestamp_invalid");
  }
  if (now.getTime() - capturedAt > maxAgeMs) {
    throw new RunnerPolicyError("worktree_guard_stale");
  }
  if (
    snapshot.clean !== true ||
    snapshot.statusEntryCount !== 0 ||
    snapshot.compareStatus === "fail"
  ) {
    throw new RunnerPolicyError("worktree_guard_not_clean");
  }
  if (snapshot.worktree !== expectedWorktree) {
    throw new RunnerPolicyError("worktree_guard_path_mismatch");
  }
  if (!expectedHead || snapshot.head !== expectedHead) {
    throw new RunnerPolicyError("worktree_guard_head_mismatch");
  }
  for (const field of ["pathHash", "metadataHash", "envMetadataHash"]) {
    if (!/^[a-f0-9]{64}$/.test(snapshot[field] ?? "")) {
      throw new RunnerPolicyError("worktree_guard_hash_invalid");
    }
  }
  return snapshot;
}

export async function loadWorktreeGuardSnapshot(filePath, options) {
  await assertSecureFile(filePath);
  return validateWorktreeGuardSnapshot(JSON.parse(await readFile(filePath, "utf8")), options);
}

export async function validateConfirmation({
  confirmationFile,
  request,
  now = new Date(),
}) {
  if (!request.execute) {
    throw new RunnerPolicyError("execute_not_enabled");
  }
  if (!confirmationFile) {
    throw new RunnerPolicyError("confirmation_file_missing");
  }

  await assertSecureFile(confirmationFile);
  const expiresAt = Date.parse(request.confirmationExpiresAt ?? "");

  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new RunnerPolicyError("confirmation_expired");
  }

  const token = (await readFile(confirmationFile, "utf8")).trim();

  if (!token || sha256(token) !== request.confirmationDigest) {
    throw new RunnerPolicyError("confirmation_token_mismatch");
  }

  return true;
}

export function splitRoleBootstrapMigration(sql) {
  const boundaryIndex = sql.indexOf(roleBootstrapBoundary);

  if (boundaryIndex < 0 || sql.indexOf(roleBootstrapBoundary, boundaryIndex + 1) >= 0) {
    throw new RunnerPolicyError("role_bootstrap_boundary_mismatch");
  }

  const roleBootstrapSql = sql.slice(0, boundaryIndex);
  const schemaMigrationSql = sql.slice(boundaryIndex + 2);

  if (`${roleBootstrapSql}\n\n${schemaMigrationSql}` !== sql) {
    throw new RunnerPolicyError("role_bootstrap_recomposition_mismatch");
  }

  return { roleBootstrapSql, schemaMigrationSql };
}

export function splitSchemaOwnerTransition(schemaMigrationSql) {
  const boundaryIndex = schemaMigrationSql.indexOf(ownerTransitionBoundary);
  if (
    boundaryIndex < 0 ||
    schemaMigrationSql.indexOf(ownerTransitionBoundary, boundaryIndex + 1) >= 0
  ) {
    throw new RunnerPolicyError("schema_owner_transition_boundary_mismatch");
  }

  const transitionEnd = boundaryIndex + ownerTransitionBoundary.length;
  const beforeOwnerSql = schemaMigrationSql.slice(0, boundaryIndex);
  const schemaOwnerSql = schemaMigrationSql.slice(boundaryIndex, transitionEnd);
  const migrationLoginSql = `${beforeOwnerSql}${schemaOwnerSql}`;
  const ownerRoleSql = schemaMigrationSql.slice(transitionEnd);
  if (`${migrationLoginSql}${ownerRoleSql}` !== schemaMigrationSql) {
    throw new RunnerPolicyError("schema_owner_transition_recomposition_mismatch");
  }
  if (!ownerRoleSql.trim().startsWith("ALTER TABLE candidate_authority.schema_migrations")) {
    throw new RunnerPolicyError("schema_owner_transition_tail_mismatch");
  }

  return { beforeOwnerSql, migrationLoginSql, ownerRoleSql, schemaOwnerSql };
}

export function validateRoleBootstrapSql(sql) {
  if (destructiveSqlPattern.test(sql) || featureFlagPattern.test(sql)) {
    throw new RunnerPolicyError("role_bootstrap_forbidden_sql");
  }
  if (/\bLOGIN\b/i.test(sql) || /\bSUPERUSER\b/i.test(sql.replace(/NOSUPERUSER/gi, ""))) {
    throw new RunnerPolicyError("role_bootstrap_forbidden_attribute");
  }

  const quotedNames = [...sql.matchAll(/'([a-z][a-z0-9_]+)'/g)].map((match) => match[1]);
  const roleNames = quotedNames.filter((name) => name.startsWith("candidate_"));
  const unexpected = roleNames.filter((name) => !CANDIDATE_ROLE_ALLOWLIST.includes(name));

  if (unexpected.length > 0) {
    throw new RunnerPolicyError("role_bootstrap_role_not_allowlisted");
  }
  for (const roleName of CANDIDATE_ROLE_ALLOWLIST) {
    if (!roleNames.includes(roleName)) {
      throw new RunnerPolicyError("role_bootstrap_allowlist_incomplete");
    }
  }

  return true;
}

export function validateMigrationSql(filename, sql) {
  if (destructiveSqlPattern.test(sql)) {
    throw new RunnerPolicyError("destructive_sql_detected", filename);
  }
  if (legacyMutationPattern.test(sql)) {
    throw new RunnerPolicyError("legacy_business_mutation_detected", filename);
  }
  if (featureFlagPattern.test(sql)) {
    throw new RunnerPolicyError("feature_flag_sql_detected", filename);
  }
  if (secretPattern.test(sql)) {
    throw new RunnerPolicyError("secret_pattern_in_migration", filename);
  }

  return true;
}

export async function loadAndValidateArtifact(artifactRoot) {
  const migrationDirectory = join(artifactRoot, "migrations", "candidate-episode");
  const filenames = (await readdir(migrationDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const expectedFilenames = Object.keys(EXPECTED_MIGRATION_CHECKSUMS);

  if (JSON.stringify(filenames) !== JSON.stringify(expectedFilenames)) {
    throw new RunnerPolicyError("migration_file_set_mismatch");
  }

  const files = [];
  const checksumMap = {};

  for (const filename of filenames) {
    const sql = await readFile(join(migrationDirectory, filename), "utf8");
    const checksum = sha256(sql);
    assertExactHash(
      checksum,
      EXPECTED_MIGRATION_CHECKSUMS[filename],
      "migration_checksum_mismatch",
    );
    validateMigrationSql(filename, sql);
    files.push({ checksum, filename, sql });
    checksumMap[filename] = checksum;
  }

  const roleMigration = files.find((file) =>
    file.filename.startsWith("007_candidate_runtime_roles_and_permissions"),
  );

  if (!roleMigration) {
    throw new RunnerPolicyError("role_bootstrap_migration_missing");
  }

  const split = splitRoleBootstrapMigration(roleMigration.sql);
  const ownerTransition = splitSchemaOwnerTransition(split.schemaMigrationSql);
  validateRoleBootstrapSql(split.roleBootstrapSql);
  assertExactHash(
    sha256(JSON.stringify(checksumMap)),
    AUTHORIZED_ARTIFACT_HASH,
    "artifact_hash_mismatch",
  );

  return {
    artifactHash: AUTHORIZED_ARTIFACT_HASH,
    files,
    migrationDirectory,
    migrationFileCount: files.length,
    roleBootstrap: {
      filename: roleMigration.filename,
      migrationLoginSqlChecksum: sha256(ownerTransition.migrationLoginSql),
      ownerRoleSqlChecksum: sha256(ownerTransition.ownerRoleSql),
      roleBootstrapChecksum: sha256(split.roleBootstrapSql),
      schemaRemainderChecksum: sha256(split.schemaMigrationSql),
    },
  };
}

export async function gitSnapshot(worktree) {
  const [headResult, statusResult] = await Promise.all([
    execFileAsync("git", ["-C", worktree, "rev-parse", "HEAD"]),
    execFileAsync("git", ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"]),
  ]);

  return {
    clean: statusResult.stdout.trim() === "",
    head: headResult.stdout.trim(),
    statusEntryCount: statusResult.stdout.trim()
      ? statusResult.stdout.trim().split("\n").length
      : 0,
  };
}

export function validateRoleIdentity(identity, expectedClass) {
  if (!identity || typeof identity !== "object") {
    throw new RunnerPolicyError("identity_missing");
  }

  const forbidden = ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls"];

  if (expectedClass === "application" || expectedClass === "migration") {
    if (!identity.rolcanlogin || forbidden.some((field) => identity[field])) {
      throw new RunnerPolicyError(`${expectedClass}_role_capability_invalid`);
    }
  }
  if (expectedClass === "owner") {
    if (identity.rolcanlogin || forbidden.some((field) => identity[field])) {
      throw new RunnerPolicyError("owner_role_capability_invalid");
    }
  }
  if (expectedClass === "break_glass" && (!identity.rolcanlogin || !identity.rolsuper)) {
    throw new RunnerPolicyError("break_glass_role_capability_invalid");
  }

  return true;
}

export function assertApplicationRoleRejected(identity) {
  validateRoleIdentity(identity, "application");
  throw new RunnerPolicyError("application_role_runner_use_rejected");
}

export function auditRecord({ command, request, result, status }) {
  return redact({
    applicationRelease: request.applicationRelease,
    approvalRefHash: hashIdentity(request.approvalRef),
    artifactHash: request.artifactHash,
    command,
    execute: request.execute,
    generatedAt: new Date().toISOString(),
    manifestHash: request.manifestHash,
    migrationReleaseId: request.migrationReleaseId,
    operatorHash: hashIdentity(request.operator),
    result,
    schemaMigrationEnabled: request.schemaMigrationEnabled,
    sourceCommit: request.sourceCommit,
    status,
    targetClass: request.targetClass,
    roleBootstrapEnabled: request.roleBootstrapEnabled,
  });
}

export async function findRepositoryRoot(startPath) {
  let current = resolve(startPath);

  while (true) {
    try {
      const packageJson = JSON.parse(await readFile(join(current, "package.json"), "utf8"));
      if (packageJson.name === "chuan-market-radar") {
        return current;
      }
    } catch {
      // Continue toward the filesystem root.
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new RunnerPolicyError("artifact_root_not_found");
    }
    current = parent;
  }
}
