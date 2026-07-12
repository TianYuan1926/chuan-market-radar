import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-runtime-identity-permission-local.v1.json",
);

const expectedTopology = Object.freeze({
  consumer: {
    connectionEnv: "CANDIDATE_CONSUMER_DATABASE_URL",
    transactionRole: "candidate_shadow_executor_role",
  },
  monitor: {
    connectionEnv: "CANDIDATE_MONITOR_DATABASE_URL",
    transactionRole: "candidate_audit_role",
  },
  source: {
    connectionEnv: "CANDIDATE_SOURCE_DATABASE_URL",
    transactionRole: "candidate_application_writer_role",
  },
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export async function loadRuntimeIdentityContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateRuntimeIdentityPreparation(contract) {
  contract ??= await loadRuntimeIdentityContract();
  const violations = [];
  const read = (path) => readFile(resolve(ROOT, path), "utf8");
  const [accessSql, databaseSource, adapterSource, rehearsalSource] = await Promise.all([
    read(contract.runtimeAccess?.sqlPath ?? "missing"),
    read("src/lib/candidate-episode/candidate-runtime-database.ts"),
    read("src/lib/candidate-episode/transaction-adapter.ts"),
    read("scripts/rehearsal/candidate-runtime-identity-postgres16.sh"),
  ]);

  if (contract.schemaVersion !== "wp-g0.2-runtime-identity-permission-local.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionConnected !== false) {
    violations.push("production_boundary");
  }
  if (
    contract.productionIdentityProvisioned !== false
    || contract.productionEnvironmentConfigured !== false
    || contract.productionRuntimeActivated !== false
  ) {
    violations.push("production_state_claim");
  }
  for (const [purpose, expected] of Object.entries(expectedTopology)) {
    const actual = contract.identityTopology?.[purpose];
    if (
      actual?.connectionEnv !== expected.connectionEnv
      || actual?.transactionRole !== expected.transactionRole
      || actual?.loginInherit !== false
      || actual?.membershipCount !== 1
    ) {
      violations.push(`identity_topology:${purpose}`);
    }
    if (!databaseSource.includes(`${purpose}: "${expected.transactionRole}"`)) {
      violations.push(`runtime_role_mapping:${purpose}`);
    }
  }
  if (contract.loginAttributes?.inherit !== false || contract.loginAttributes?.superuser !== false) {
    violations.push("dangerous_login_attribute");
  }
  if (
    contract.transactionBoundary?.explicitSetLocalRoleRequired !== true
    || contract.transactionBoundary?.dynamicRoleFromEnvironmentAllowed !== false
    || !adapterSource.includes("SET LOCAL ROLE")
    || !adapterSource.includes("Invalid PostgreSQL transaction role")
  ) {
    violations.push("set_local_role_boundary");
  }
  if (sha256(accessSql) !== contract.runtimeAccess?.sqlSha256) {
    violations.push("runtime_access_checksum");
  }
  if (
    !/GRANT SELECT, INSERT ON TABLE public\.scan_archives TO candidate_application_writer_role/.test(accessSql)
    || /GRANT[^;]*(UPDATE|DELETE|TRUNCATE|ALL)[^;]*scan_archives/i.test(accessSql)
    || !accessSql.includes("candidate_shadow_executor_role")
    || !accessSql.includes("candidate_audit_role")
  ) {
    violations.push("runtime_access_scope");
  }
  if (!exactArray(contract.runtimeAccess?.sourceScanArchivePrivileges, ["SELECT", "INSERT"])) {
    violations.push("source_archive_privileges");
  }
  if (
    contract.runtimeAccess?.sourceScanArchiveUpdateDelete !== false
    || contract.runtimeAccess?.consumerDirectTableAccess !== false
    || contract.runtimeAccess?.monitorWrite !== false
  ) {
    violations.push("runtime_deny_boundary");
  }
  if (
    !rehearsalSource.includes("WP_G0_2_REHEARSAL=true")
    || !rehearsalSource.includes("productionConnected\":false")
    || rehearsalSource.includes("ALLOW_PRODUCTION_DATABASE")
  ) {
    violations.push("rehearsal_safety");
  }
  if (!contract.forbiddenInThisPackage?.includes("production_role_creation")) {
    violations.push("production_role_creation_not_forbidden");
  }

  return {
    status: violations.length === 0 ? "PASS_LOCAL_RUNTIME_IDENTITY_PREPARATION" : "FAIL",
    productionDecision: "BLOCKED_UNTIL_DORMANT_DEPLOY_PASS_AND_NEW_EXPLICIT_APPROVAL",
    productionMutationAllowed: false,
    topology: expectedTopology,
    runtimeAccessSha256: sha256(accessSql),
    violations,
  };
}

async function main() {
  const result = await validateRuntimeIdentityPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS_LOCAL_RUNTIME_IDENTITY_PREPARATION") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
