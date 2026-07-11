import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const productionScript = "scripts/production/capacity-remediation/production-encrypted-backup.sh";
const restoreScript = "scripts/production/capacity-remediation/local-restore-drill.sh";

function run(script, args = [], env = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("both remediation scripts pass bash syntax validation", () => {
  for (const script of [productionScript, restoreScript]) {
    const result = spawnSync("bash", ["-n", script], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("production backup defaults to a non-mutating plan", () => {
  const result = run(productionScript, [], {
    AUTHORIZED_HEAD: "a".repeat(40),
    BACKUP_ID: "capacity-test-20260711T100000Z",
    OPS_ROOT: "/var/lib/market-radar-ops/capacity-test",
    PUBLIC_CERT: "/secure/public-cert.pem",
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.connectsToProductionDatabase, false);
  assert.equal(plan.executesMigration, false);
  assert.equal(plan.executesRestore, false);
  assert.equal(plan.deletesDockerResources, false);
});

test("production backup refuses execute without the exact confirmation", () => {
  const result = run(productionScript, ["execute"], {
    AUTHORIZED_HEAD: "a".repeat(40),
    BACKUP_ID: "capacity-test-20260711T100000Z",
    OPS_ROOT: "/var/lib/market-radar-ops/capacity-test",
    PUBLIC_CERT: "/secure/public-cert.pem",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /confirmation/i);
});

test("local restore defaults to a non-mutating plan", () => {
  const result = run(restoreScript, [], {
    ENCRYPTED_BACKUP: "/secure/backup.cms",
    MANIFEST: "/secure/manifest.json",
    PRIVATE_KEY: "/secure/private-key.pem",
    PUBLIC_CERT: "/secure/public-cert.pem",
    RESULT_FILE: "/secure/result.json",
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.targetClass, "external_isolated");
  assert.equal(plan.connectsToProduction, false);
  assert.equal(plan.outputsBusinessRows, false);
});

test("local restore refuses execute without the exact confirmation", () => {
  const result = run(restoreScript, ["execute"], {
    ENCRYPTED_BACKUP: "/secure/backup.cms",
    MANIFEST: "/secure/manifest.json",
    PRIVATE_KEY: "/secure/private-key.pem",
    PUBLIC_CERT: "/secure/public-cert.pem",
    RESULT_FILE: "/secure/result.json",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /confirmation/i);
});

test("production script cannot receive or export the private key", async () => {
  const source = await readFile(productionScript, "utf8");
  assert.equal(source.includes("PRIVATE_KEY"), false);
  assert.match(source, /openssl cms -encrypt/);
  assert.doesNotMatch(source, /openssl cms -decrypt/);
  assert.doesNotMatch(source, /\{40\}|\{7,95\}/);
});

test("production script transfers only encrypted backup manifest and public certificate", async () => {
  const source = await readFile(productionScript, "utf8");
  assert.match(source, /cp .*ENCRYPTED_BACKUP.*TRANSFER_DIR/);
  assert.match(source, /cp .*MANIFEST.*TRANSFER_DIR/);
  assert.match(source, /cp .*PUBLIC_CERT.*TRANSFER_DIR/);
  assert.doesNotMatch(source, /cp .*RAW_DUMP.*TRANSFER_DIR/);
});

test("remediation scripts forbid destructive production shortcuts", async () => {
  const source = `${await readFile(productionScript, "utf8")}\n${await readFile(restoreScript, "utf8")}`;
  for (const forbidden of [
    "docker system prune",
    "docker image prune",
    "docker volume prune",
    "docker volume rm",
    "DROP DATABASE",
    "DROP SCHEMA",
    "TRUNCATE ",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("production backup retains the raw dump root-only until separate cleanup approval", async () => {
  const source = await readFile(productionScript, "utf8");
  assert.match(source, /rawDumpRetainedRootOnly/);
  assert.doesNotMatch(source, /rm .*RAW_DUMP/);
});

test("local restore always stops postgres and removes plaintext working files", async () => {
  const source = await readFile(restoreScript, "utf8");
  assert.match(source, /cleanup_restore_workspace/);
  assert.match(source, /pg_ctl.*stop/);
  assert.match(source, /rm -rf.*WORK_DIR/);
  assert.match(source, /rm -rf.*SOCKET_DIR/);
});
