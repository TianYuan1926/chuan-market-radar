import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RUNNER = "scripts/v2/production/m1-production-storage-p0r-runner.sh";

test("plan exposes the exact no-mutation and isolated-restore boundary", () => {
  const plan = JSON.parse(execFileSync("bash", [RUNNER, "plan"], { encoding: "utf8" }));
  assert.equal(plan.sourceTransaction, "REPEATABLE_READ_READ_ONLY");
  assert.equal(plan.plaintextDumpCreated, false);
  assert.equal(plan.offHostAvailabilityZoneType, "SINGLE_AZ_REQUIRED");
  assert.equal(plan.offHostVersioning, "ENABLED");
  assert.equal(plan.offHostRetention, "COMPLIANCE_30D_MINIMUM");
  assert.equal(plan.offHostObjectKey, "HIGH_ENTROPY_RUN_BOUND");
  assert.equal(plan.preUploadAbsenceRequired, true);
  assert.equal(plan.stsPolicyPlanBound, true);
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
    "m1-production-storage-p0r-cos-provisioning.mjs\" verify-plan",
    '--provisioning-plan "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json"',
    '--run-id "${RUN_ID}"',
    "EXPECTED_SOURCE_DIRECTORY",
    "EXPECTED_OUTPUT_DIRECTORY",
    '"/dev/shm/market-radar-v2-p0r-${RUN_ID}.age-identity.txt"',
  ]) assert.ok(combined.includes(required), `missing runner invariant: ${required}`);
  for (const forbidden of [
    "git pull",
    "git checkout",
    "docker compose up",
    "docker compose down",
    "prisma migrate",
    "psql -c",
  ]) assert.equal(source.includes(forbidden), false, `forbidden runner action: ${forbidden}`);
});

test("runner shell parses without executing production actions", () => {
  execFileSync("bash", ["-n", RUNNER]);
});
