import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";

const RUNNER = "scripts/v2/production/m1-production-storage-p0r-runner.sh";

test("plan exposes the exact no-mutation and isolated-restore boundary", () => {
  const plan = JSON.parse(execFileSync("bash", [RUNNER, "plan"], { encoding: "utf8" }));
  assert.equal(plan.schemaVersion, "v2-m1-production-storage-p0r-runner-plan.v6");
  assert.equal(plan.sourceTransaction, "REPEATABLE_READ_READ_ONLY");
  assert.equal(plan.plaintextDumpCreated, false);
  assert.equal(plan.offHostAvailabilityZoneType, "SINGLE_AZ_REQUIRED");
  assert.equal(plan.offHostVersioning, "ENABLED");
  assert.equal(plan.offHostRetention, "COMPLIANCE_30D_MINIMUM");
  assert.equal(plan.offHostObjectKey, "HIGH_ENTROPY_RUN_BOUND");
  assert.equal(plan.offHostReadOnlyPreflightBeforeDatabaseCapture, true);
  assert.equal(plan.preUploadAbsenceRequired, true);
  assert.equal(plan.stsPolicyPlanBound, true);
  assert.equal(plan.containerSelection, "EXACT_COMPOSE_PROJECT_AND_SERVICE_LABELS");
  assert.equal(plan.composeInterpolationRequired, false);
  assert.equal(
    plan.runtimeDependencyBoundary,
    "EXACT_SOURCE_BOUND_P0R_NODE_RUNTIME_CAPSULE",
  );
  assert.equal(plan.runtimeNodeVersion, "22.23.1");
  assert.deepEqual(plan.runtimePackageVersions, { pg: "8.16.3" });
  assert.equal(plan.productionNodeRuntimeRequired, true);
  assert.equal(plan.productionNodeModulesRequired, false);
  assert.equal(plan.sanitizedFailureSiteOnly, true);
  assert.equal(plan.evidenceOutputDirectoryCreation, "ATOMIC_MODE_700");
  assert.equal(plan.privateEphemeralRunnerDirectory, true);
  assert.equal(plan.ephemeralFileCreation, "EXCLUSIVE_MODE_600");
  assert.equal(plan.restoreNetworkMode, "none");
  assert.equal(plan.restoreCpuNano, 1_500_000_000);
  assert.equal(plan.restoreMemoryBytes, 2 * 1024 ** 3);
  assert.equal(plan.restoreMemorySwapBytes, 3 * 1024 ** 3);
  assert.equal(plan.restorePidsLimit, 256);
  assert.equal(plan.hostPortsPublished, false);
  assert.equal(plan.productionNetworksAttached, false);
  assert.equal(plan.productionVolumesMounted, false);
  assert.equal(plan.productionCredentialsMounted, false);
  assert.equal(plan.productionDatabaseMutation, false);
  assert.equal(plan.productionServiceMutation, false);
  assert.equal(plan.productionRepositoryMutation, false);
  assert.equal(plan.migrationAllowed, false);
  assert.equal(plan.capacityMutationAllowed, false);
});

test("runner encodes hard cleanup, digest binding and no-source-sync invariants", async () => {
  const source = await readFile(RUNNER, "utf8");
  const capture = await readFile(
    "scripts/v2/production/m1-production-storage-backup-capture.mjs",
    "utf8",
  );
  const combined = `${source}\n${capture}`;
  for (const required of [
    "--network none",
    "NetworkSettings.Networks",
    "$networks.none.IPAddress",
    "--read-only",
    "--cpus 1.5",
    "--memory 2g",
    "--pids-limit 256",
    "--security-opt no-new-privileges=true",
    "--single-transaction",
    "--snapshot=",
    "AGE_IDENTITY_REMOVED=true",
    "COS_CREDENTIAL_REMOVED=true",
    "P0R runtime directory was not removed",
    ".[0].Image == $imageId",
    ".[0].HostConfig.ReadonlyRootfs == true",
    ".[0].HostConfig.Privileged == false",
    "Docker state did not return to the production baseline",
    "production worktree changed during P0R",
    "capacityMutationPerformed: false",
    "migrationPerformed: false",
    "executed runner path is not the checksum-bound staging file",
    "P0R_AGE_RECIPIENT_SHA256",
    "P0R_COS_PROVISIONING_PLAN_SHA256",
    "P0R_COS_PROVISIONING_TOOL_SHA256",
    "P0R_NODE_RUNTIME_SHA256",
    "P0R_RUNTIME_CAPSULE_TOOL_SHA256",
    "P0R_SESSION_SHA256",
    '"${RUNTIME_CAPSULE_TOOL_SOURCE}" extract',
    '--archive "${NODE_RUNTIME_SOURCE}"',
    '--destination "${HOST_RUNTIME_DIRECTORY}"',
    '--expected-sha256 "${NODE_RUNTIME_SHA256}"',
    "P0R Node runtime capsule extraction failed",
    '"$(sudo -n "${HOST_NODE_BINARY}" --version)" == "v22.23.1"',
    "m1-production-storage-p0r-cos-provisioning.mjs\" verify-plan",
    '"${RUNTIME_DIRECTORY}/p0r-cos-archive" preflight',
    '--provisioning-plan "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json"',
    '--run-id "${RUN_ID}"',
    "EXPECTED_SOURCE_DIRECTORY",
    "EXPECTED_OUTPUT_DIRECTORY",
    "! -L \"${OUTPUT_DIRECTORY}\"",
    'mkdir --mode=700 -- "${OUTPUT_DIRECTORY}"',
    "P0R evidence output directory is invalid",
    "com.docker.compose.project=chuan-market-radar",
    "com.docker.compose.service=${service}",
    "write_private_text_exclusive",
    'mktemp -d "/dev/shm/market-radar-v2-p0r-${RUN_ID}.runner.XXXXXX"',
    "require_private_runtime_file",
    "age canary encrypted exclusive creation failed",
    "age canary decrypted exclusive creation failed",
    "P0R private runner directory was not removed",
    '"/dev/shm/market-radar-v2-p0r-${RUN_ID}.age-identity.txt"',
    '"COS credential file" 65536 0',
    '"age identity file" 8192 0',
    "AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}",
    "! -L \"${path}\"",
  ]) assert.ok(combined.includes(required), `missing runner invariant: ${required}`);
  assert.ok(
    source.indexOf('"${RUNTIME_DIRECTORY}/p0r-cos-archive" preflight')
      < source.indexOf('m1-production-storage-backup-capture.mjs" capture'),
    "COS authorization preflight must run before production database capture",
  );
  for (const forbidden of [
    "git pull",
    "git checkout",
    "docker compose up",
    "docker compose down",
    "docker compose",
    "sudo -n tee",
    "HOST_NODE_MODULES",
    "/app/node_modules",
    'ln -s "${HOST_NODE_MODULES}"',
    "prisma migrate",
    "psql -c",
  ]) assert.equal(source.includes(forbidden), false, `forbidden runner action: ${forbidden}`);
});

test("P0R Node tools allow only built-ins, local modules and locked pg", async () => {
  const pending = [
    "scripts/v2/production/m1-production-storage-backup-capture.mjs",
    "scripts/v2/production/m1-production-storage-database-fingerprint.mjs",
    "scripts/v2/production/m1-production-storage-read-only-preflight.mjs",
    "scripts/v2/production/m1-production-storage-recovery-evidence.mjs",
    "scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs",
    "scripts/v2/production/m1-production-storage-p0r-runtime-capsule.mjs",
  ].map((path) => resolve(path));
  const allowedRoot = resolve("scripts/v2/production");
  const visited = new Set();
  const bareImports = new Set();

  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    assert.ok(path.startsWith(`${allowedRoot}/`), `runtime import escaped: ${path}`);
    const source = await readFile(path, "utf8");
    const specifiers = [
      ...source.matchAll(
        /(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu,
      ),
      ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/gu),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith("node:")) continue;
      if (specifier === "pg") {
        bareImports.add(specifier);
        continue;
      }
      assert.ok(
        specifier.startsWith("."),
        `unlocked runtime package is forbidden: ${path} -> ${specifier}`,
      );
      pending.push(resolve(dirname(path), specifier));
    }
  }
  assert.deepEqual([...bareImports], ["pg"]);
});

test("runner failures expose only a bounded source site", () => {
  const result = spawnSync("bash", [RUNNER, "invalid-mode"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const diagnostic = JSON.parse(result.stderr.trim());
  assert.deepEqual(Object.keys(diagnostic).sort(), ["reasonCode", "status"]);
  assert.match(diagnostic.reasonCode, /^p0r_runner_line_[1-9][0-9]{0,4}$/u);
  assert.equal(diagnostic.status, "BLOCKED");
  assert.doesNotMatch(result.stderr, /mode must be/u);
});

test("runner shell parses without executing production actions", () => {
  execFileSync("bash", ["-n", RUNNER]);
});
