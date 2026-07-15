import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const PACKAGE_ID = "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION";
const CAPABILITY_BY_PURPOSE = Object.freeze({
  consumer: "candidate_shadow_executor_role",
  monitor: "candidate_audit_role",
  source: "candidate_application_writer_role",
});
const ENV_BY_PURPOSE = Object.freeze({
  consumer: "CANDIDATE_CONSUMER_DATABASE_URL",
  monitor: "CANDIDATE_MONITOR_DATABASE_URL",
  source: "CANDIDATE_SOURCE_DATABASE_URL",
});
const PURPOSES = Object.freeze(["source", "consumer", "monitor"]);
const DORMANT_SUMMARY_KEYS = Object.freeze([
  "baselineCommit", "candidateDormant", "candidateWorkerAbsent", "completedAt",
  "continuousReadyFresh", "databaseMutation", "detachedHead", "environmentMutation",
  "observationDurationSeconds", "otherServiceMutation", "packageId", "redisMutation",
  "rollbackCleanupRequiresSeparateApproval", "rollbackImageRetained", "rollbackWebImageRef",
  "sampleCount", "status", "targetCommit", "webImageId",
]);

export class RuntimeIdentityPolicyError extends Error {
  constructor(readonlyReason) {
    super(`candidate runtime identity policy rejected: ${readonlyReason}`);
    this.name = "RuntimeIdentityPolicyError";
    this.reason = readonlyReason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new RuntimeIdentityPolicyError(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseTimestamp(value, reason) {
  const timestamp = Date.parse(value);
  ensure(Number.isFinite(timestamp), reason);
  return timestamp;
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  const keys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "approvedArtifactSha256",
    "approvedProductionCommit", "approvedRunnerSourceCommit", "approvedWebImageId",
    "automaticDatabaseRollbackAllowed", "automaticEnvironmentRollbackAllowed",
    "automaticWebRollbackAllowed", "baseEnvSha256", "businessDmlAllowed",
    "candidateControlLifecycleStartAllowed",
    "candidateDatabaseUrlConfigurationAllowed", "candidateFeatureFlagEnablementAllowed",
    "candidateWorkerStartAllowed", "codeActivationAllowed", "composeSha256",
    "databaseRoleMutationAllowed", "dormantDeployEvidenceSha256", "dormantDeployStatus",
    "environmentMutationAllowed", "execute", "identityOverridePath", "identityOverrideSha256",
    "identityWrapperPath", "identityWrapperSha256", "migrationAllowed", "operator", "packageId",
    "productionEnvSha256", "rollbackWebImageRef", "runtimeAccessSha256", "schemaDdlAllowed",
    "services", "webRecreateAllowed",
  ];
  ensure(exactKeys(request, keys), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.dormantDeployStatus === contract.dormantEvidence?.finalStatus,
    "dormant_deploy_not_pass");
  ensure(request.dormantDeployEvidenceSha256 === contract.dormantEvidence?.summarySha256,
    "dormant_evidence_checksum_mismatch");
  ensure(/^[0-9a-f]{40}$/.test(request.approvedRunnerSourceCommit ?? ""),
    "approved_runner_source_commit_invalid");
  ensure(request.approvedProductionCommit === contract.productionTarget?.commit,
    "approved_production_commit_mismatch");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.approvedWebImageId ?? ""),
    "approved_web_image_invalid");
  ensure(/^market-radar-rollback\/wp-g0-2-runtime-identity:web-[0-9a-f]{16}$/.test(
    request.rollbackWebImageRef ?? "",
  ), "rollback_web_image_ref_invalid");
  ensure(request.rollbackWebImageRef.endsWith(request.approvedWebImageId.slice(7, 23)),
    "rollback_web_image_binding_mismatch");
  ensure(contract.productionTarget?.repositoryState === "clean_detached",
    "production_repository_state_invalid");
  ensure(request.approvedArtifactSha256 === contract.artifact.sha256, "approved_artifact_checksum_mismatch");
  ensure(request.runtimeAccessSha256 === contract.runtimeAccess.sqlSha256, "runtime_access_checksum_mismatch");
  for (const key of [
    "baseEnvSha256", "composeSha256", "dormantDeployEvidenceSha256", "productionEnvSha256",
  ]) ensure(/^[0-9a-f]{64}$/.test(request[key] ?? ""), `${key}_invalid`);
  ensure(request.identityWrapperPath === contract.productionIdentity?.wrapperPath,
    "identity_wrapper_path_mismatch");
  ensure(request.identityWrapperSha256 === contract.productionIdentity?.wrapperSha256,
    "identity_wrapper_checksum_mismatch");
  ensure(request.identityOverridePath === contract.productionIdentity?.overridePath,
    "identity_override_path_mismatch");
  ensure(request.identityOverrideSha256 === contract.productionIdentity?.overrideSha256,
    "identity_override_checksum_mismatch");
  ensure(JSON.stringify(request.services) === '["web"]', "service_allowlist_mismatch");
  ensure(request.execute === true, "execute_not_approved");
  ensure(request.databaseRoleMutationAllowed === true, "database_role_mutation_not_approved");
  ensure(request.candidateDatabaseUrlConfigurationAllowed === true, "candidate_url_configuration_not_approved");
  ensure(request.environmentMutationAllowed === true, "environment_mutation_not_approved");
  ensure(request.webRecreateAllowed === true, "web_recreate_not_approved");
  ensure(request.automaticDatabaseRollbackAllowed === true, "database_rollback_not_approved");
  ensure(request.automaticEnvironmentRollbackAllowed === true, "environment_rollback_not_approved");
  ensure(request.automaticWebRollbackAllowed === true, "web_rollback_not_approved");
  for (const key of [
    "businessDmlAllowed", "candidateControlLifecycleStartAllowed",
    "candidateFeatureFlagEnablementAllowed", "candidateWorkerStartAllowed",
    "codeActivationAllowed", "migrationAllowed", "schemaDdlAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(typeof request.approvalRef === "string" && request.approvalRef.length >= 8, "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.length >= 2, "operator_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000, "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "approval_window_not_active");
  return request;
}

export function validateDormantEvidence(dormant, request, contract, { now = new Date() } = {}) {
  const boundary = contract.dormantEvidence ?? {};
  ensure(exactKeys(dormant, DORMANT_SUMMARY_KEYS), "dormant_evidence_keys_mismatch");
  ensure(dormant.status === boundary.finalStatus, "dormant_deploy_not_pass");
  ensure(dormant.packageId === boundary.packageId, "dormant_package_mismatch");
  ensure(dormant.baselineCommit === boundary.baselineCommit, "dormant_baseline_mismatch");
  ensure(dormant.targetCommit === request.approvedProductionCommit
    && dormant.targetCommit === contract.productionTarget?.commit,
  "dormant_commit_mismatch");
  ensure(dormant.webImageId === request.approvedWebImageId, "dormant_web_image_mismatch");
  const completedAt = parseTimestamp(dormant.completedAt, "dormant_evidence_completed_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(completedAt <= nowMs + 60_000
    && nowMs - completedAt <= boundary.maximumEvidenceAgeHours * 60 * 60_000,
  "dormant_evidence_not_fresh");
  ensure(dormant.observationDurationSeconds >= boundary.minimumObservationSeconds,
    "dormant_observation_too_short");
  ensure(dormant.sampleCount >= boundary.minimumSampleCount, "dormant_sample_count_too_low");
  ensure(dormant.detachedHead === true, "dormant_head_not_detached");
  ensure(dormant.continuousReadyFresh === true, "dormant_health_not_continuous");
  ensure(dormant.candidateDormant === boundary.candidateRuntimeDormantRequired,
    "dormant_runtime_boundary_mismatch");
  ensure(dormant.candidateWorkerAbsent === boundary.candidateWorkerAbsentRequired,
    "dormant_worker_boundary_mismatch");
  ensure(dormant.rollbackImageRetained === true, "dormant_rollback_image_not_retained");
  ensure(dormant.rollbackCleanupRequiresSeparateApproval === true,
    "dormant_rollback_cleanup_boundary_mismatch");
  ensure(/^market-radar-rollback\/wp-g0-2-dormant:web-[0-9a-f]{16}$/.test(
    dormant.rollbackWebImageRef ?? "",
  ), "dormant_rollback_image_ref_invalid");
  for (const key of ["databaseMutation", "redisMutation", "environmentMutation", "otherServiceMutation"]) {
    ensure(dormant[key] === false, `dormant_${key}_must_be_false`);
  }
  return dormant;
}

async function assertSecureFile(path, label) {
  const file = await stat(path);
  ensure(file.isFile(), `${label}_not_file`);
  ensure((file.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(file.size > 0 && file.size <= 64 * 1024, `${label}_size_invalid`);
}

export async function readSecureText(path, label) {
  await assertSecureFile(path, label);
  const value = (await readFile(path, "utf8")).trim();
  ensure(value.length > 0, `${label}_empty`);
  return value;
}

export async function readSecureJson(path, label) {
  const value = JSON.parse(await readSecureText(path, label));
  ensure(value && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  return value;
}

export function validateCredentials(credentials, { environment = "production" } = {}) {
  ensure(credentials.schemaVersion === "candidate-runtime-identity-credentials.v1", "credential_schema_invalid");
  ensure(credentials.environment === environment, "credential_environment_mismatch");
  ensure(/^[a-z][a-z0-9_]{2,62}$/.test(credentials.databaseName ?? ""), "database_name_invalid");
  if (environment === "production") {
    ensure(credentials.databaseHost === "postgres", "database_host_invalid");
    ensure(credentials.databasePort === 5432, "database_port_invalid");
  } else {
    ensure(["127.0.0.1", "localhost"].includes(credentials.databaseHost), "database_host_invalid");
    ensure(Number.isInteger(credentials.databasePort) && credentials.databasePort > 1024, "database_port_invalid");
  }
  ensure(exactKeys(credentials.identities, PURPOSES), "identity_keys_mismatch");
  const logins = [];
  for (const purpose of PURPOSES) {
    const identity = credentials.identities[purpose];
    ensure(exactKeys(identity, ["login", "password"]), `identity_keys_mismatch:${purpose}`);
    ensure(/^market_radar_candidate_[a-z0-9_]{3,38}$/.test(identity.login ?? ""), `login_invalid:${purpose}`);
    ensure(/^[A-Za-z0-9_-]{32,128}$/.test(identity.password ?? ""), `password_invalid:${purpose}`);
    logins.push(identity.login);
  }
  ensure(new Set(logins).size === PURPOSES.length, "runtime_logins_not_unique");
  return credentials;
}

export function candidateConnectionUrl(credentials, purpose) {
  const identity = credentials.identities[purpose];
  const url = new URL("postgresql://placeholder@placeholder/placeholder");
  url.username = identity.login;
  url.password = identity.password;
  url.hostname = credentials.databaseHost;
  url.port = String(credentials.databasePort);
  url.pathname = `/${credentials.databaseName}`;
  return url.toString();
}

function quoteEnv(value) {
  ensure(!/[\r\n]/.test(value), "environment_value_newline");
  return JSON.stringify(value);
}

export function renderIdentityEnvironment(source, credentials) {
  const replacements = Object.fromEntries(PURPOSES.map((purpose) => [
    ENV_BY_PURPOSE[purpose],
    candidateConnectionUrl(credentials, purpose),
  ]));
  const seen = new Set();
  const lines = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in replacements)) return line;
    ensure(!seen.has(match[1]), `environment_key_duplicate:${match[1]}`);
    seen.add(match[1]);
    return `${match[1]}=${quoteEnv(replacements[match[1]])}`;
  });
  for (const purpose of PURPOSES) {
    const key = ENV_BY_PURPOSE[purpose];
    if (!seen.has(key)) lines.push(`${key}=${quoteEnv(replacements[key])}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function passwordLiteral(client, password) {
  const result = await client.query("SELECT quote_literal($1) AS value", [password]);
  ensure(/^'.*'$/.test(result.rows[0]?.value ?? ""), "password_quote_failed");
  return result.rows[0].value;
}

async function assertDatabaseBoundary(client, credentials) {
  const identity = await client.query(`
    SELECT current_user, rolsuper, rolcreaterole
    FROM pg_roles WHERE rolname = current_user
  `);
  ensure(identity.rows[0] && (identity.rows[0].rolsuper || identity.rows[0].rolcreaterole), "role_admin_privilege_missing");
  const boundary = await client.query(`
    SELECT
      (SELECT count(*)::int FROM candidate_authority.schema_migrations WHERE status='applied') AS ledger,
      (SELECT count(*)::int FROM candidate_authority.candidate_migration_control) AS controls,
      (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY($1::text[])) AS capability_roles,
      (SELECT count(*)::int FROM pg_roles WHERE rolname = ANY($2::text[])) AS runtime_logins,
      has_table_privilege('candidate_application_writer_role','public.scan_archives','SELECT') AS writer_select,
      has_table_privilege('candidate_application_writer_role','public.scan_archives','INSERT') AS writer_insert
  `, [Object.values(CAPABILITY_BY_PURPOSE), PURPOSES.map((purpose) => credentials.identities[purpose].login)]);
  const row = boundary.rows[0];
  ensure(row?.ledger === 9, "candidate_ledger_not_9");
  ensure(row?.controls === 0, "candidate_control_not_empty");
  ensure(row?.capability_roles === 3, "candidate_capability_role_missing");
  ensure(row?.runtime_logins === 0, "candidate_runtime_login_already_exists");
  ensure(row?.writer_select === false && row?.writer_insert === false, "runtime_access_already_applied");
}

export async function preflightRuntimeIdentityBoundary(client, credentials) {
  await assertDatabaseBoundary(client, credentials);
  return {
    candidateControlRows: 0,
    candidateLedgerApplied: 9,
    runtimeLogins: 0,
    writerArchiveAccessApplied: false,
  };
}

async function verifyProvisioned(client, credentials) {
  const rows = await client.query(`
    SELECT login.rolname, login.rolsuper, login.rolinherit, login.rolcreaterole,
      login.rolcreatedb, login.rolreplication, login.rolbypassrls,
      array_agg(parent.rolname::text ORDER BY parent.rolname) FILTER (WHERE parent.rolname IS NOT NULL) AS memberships
    FROM pg_roles login
    LEFT JOIN pg_auth_members membership ON membership.member = login.oid
    LEFT JOIN pg_roles parent ON parent.oid = membership.roleid
    WHERE login.rolname = ANY($1::text[])
    GROUP BY login.oid, login.rolname, login.rolsuper, login.rolinherit,
      login.rolcreaterole, login.rolcreatedb, login.rolreplication, login.rolbypassrls
    ORDER BY login.rolname
  `, [PURPOSES.map((purpose) => credentials.identities[purpose].login)]);
  ensure(rows.rows.length === 3, "runtime_login_count_invalid");
  for (const purpose of PURPOSES) {
    const login = credentials.identities[purpose].login;
    const row = rows.rows.find((candidate) => candidate.rolname === login);
    ensure(row && !row.rolsuper && !row.rolinherit && !row.rolcreaterole && !row.rolcreatedb
      && !row.rolreplication && !row.rolbypassrls, `runtime_login_attributes_invalid:${purpose}`);
    ensure(JSON.stringify(row.memberships) === JSON.stringify([CAPABILITY_BY_PURPOSE[purpose]]), `runtime_membership_invalid:${purpose}`);
  }
  const access = await client.query(`SELECT
    has_table_privilege('candidate_application_writer_role','public.scan_archives','SELECT') AS writer_select,
    has_table_privilege('candidate_application_writer_role','public.scan_archives','INSERT') AS writer_insert,
    has_table_privilege('candidate_application_writer_role','public.scan_archives','UPDATE') AS writer_update,
    has_table_privilege('candidate_application_writer_role','public.scan_archives','DELETE') AS writer_delete,
    has_table_privilege('candidate_shadow_executor_role','public.scan_archives','SELECT') AS consumer_select,
    has_table_privilege('candidate_audit_role','public.scan_archives','SELECT') AS monitor_select`);
  ensure(access.rows[0]?.writer_select && access.rows[0]?.writer_insert, "writer_archive_access_missing");
  ensure(!access.rows[0]?.writer_update && !access.rows[0]?.writer_delete
    && !access.rows[0]?.consumer_select && !access.rows[0]?.monitor_select, "runtime_access_too_broad");
  return { capabilityMemberships: 3, dangerousAttributes: 0, runtimeLogins: 3 };
}

export async function provisionRuntimeIdentities(client, credentials, accessSql) {
  await client.query("BEGIN");
  try {
    await assertDatabaseBoundary(client, credentials);
    for (const purpose of PURPOSES) {
      const { login, password } = credentials.identities[purpose];
      const literal = await passwordLiteral(client, password);
      await client.query(`CREATE ROLE ${login} LOGIN PASSWORD ${literal}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await client.query(`GRANT ${CAPABILITY_BY_PURPOSE[purpose]} TO ${login}`);
    }
    await client.query(accessSql);
    const result = await verifyProvisioned(client, credentials);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function rollbackRuntimeIdentities(client, credentials) {
  await client.query("BEGIN");
  try {
    for (const purpose of PURPOSES) {
      const login = credentials.identities[purpose].login;
      const owned = await client.query(`SELECT
        (SELECT count(*)::int FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
        + (SELECT count(*)::int FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS count`, [login]);
      ensure((owned.rows[0]?.count ?? 0) === 0, `runtime_login_owns_objects:${purpose}`);
      await client.query(`REVOKE ${CAPABILITY_BY_PURPOSE[purpose]} FROM ${login}`);
      await client.query(`DROP ROLE ${login}`);
    }
    await client.query("REVOKE ALL ON TABLE public.scan_archives FROM candidate_application_writer_role");
    await client.query("COMMIT");
    return { runtimeLoginsDropped: 3, writerArchiveAccessRevoked: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function withAdminClient(urlFile, work) {
  const { default: pg } = await import("pg");
  const { Client } = pg;
  const connectionString = await readSecureText(urlFile, "role_admin_url");
  const client = new Client({ application_name: "market-radar-candidate-runtime-identity", connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, target);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "request") {
    const contract = JSON.parse(await readFile(resolve(options.contract), "utf8"));
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    validateApprovalRequest(request, contract, options.now ? { now: new Date(options.now) } : {});
    process.stdout.write('{"status":"pass","requestValid":true,"containsSecret":false}\n');
    return;
  }
  if (command === "dormant-evidence") {
    const contract = JSON.parse(await readFile(resolve(options.contract), "utf8"));
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    const dormant = JSON.parse(await readFile(resolve(options.evidence), "utf8"));
    validateDormantEvidence(dormant, request, contract, options.now ? { now: new Date(options.now) } : {});
    process.stdout.write('{"status":"pass","dormantEvidenceValid":true,"containsSecret":false}\n');
    return;
  }
  const credentials = validateCredentials(
    await readSecureJson(resolve(options.credentials), "credentials"),
    { environment: options.environment ?? "production" },
  );
  if (command === "credentials") {
    process.stdout.write('{"status":"pass","runtimeLogins":3,"secretsPrinted":false}\n');
    return;
  }
  if (command === "render-env") {
    const rendered = renderIdentityEnvironment(await readFile(resolve(options.source), "utf8"), credentials);
    await writeAtomic(options.output, rendered);
    process.stdout.write('{"status":"pass","candidateUrlsConfigured":3,"secretsPrinted":false}\n');
    return;
  }
  if (command === "preflight") {
    const result = await withAdminClient(resolve(options["admin-url-file"]), (client) => (
      preflightRuntimeIdentityBoundary(client, credentials)
    ));
    process.stdout.write(`${JSON.stringify({ status: "pass", ...result, secretsPrinted: false })}\n`);
    return;
  }
  const accessSql = await readFile(resolve(options["access-sql"]), "utf8");
  const expectedSha = options["access-sha256"];
  ensure(sha256(accessSql) === expectedSha, "runtime_access_checksum_mismatch");
  const result = await withAdminClient(resolve(options["admin-url-file"]), (client) => (
    command === "provision"
      ? provisionRuntimeIdentities(client, credentials, accessSql)
      : rollbackRuntimeIdentities(client, credentials)
  ));
  process.stdout.write(`${JSON.stringify({ status: "pass", ...result, secretsPrinted: false })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", reason: error.reason ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
