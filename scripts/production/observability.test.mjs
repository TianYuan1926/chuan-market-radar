import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const scriptPath = join(rootDir, "scripts/production/observability.mjs");

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      MARKET_RADAR_SOURCE_BRANCH: "phase4-3-2-production-evidence-consistency",
    },
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `${args.join(" ")} should fail`);
  } else {
    assert.equal(result.status, 0, `${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "mr-observability-test-"));
}

function zipFixture(dir, outPath) {
  rmSync(outPath, { force: true });
  execFileSync("zip", ["-q", "-r", outPath, "."], { cwd: dir, stdio: "ignore" });
}

function unzipFixture(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  execFileSync("unzip", ["-q", zipPath, "-d", outDir], { stdio: "ignore" });
}

function generateDryRunEvidence(parentDir) {
  const evidenceDir = join(parentDir, "valid");
  runNode(["evidence", "--dry-run", "--out-dir", evidenceDir]);
  return join(evidenceDir, "production-evidence.zip");
}

function validateZip(zipPath, options = {}) {
  const result = runNode(["validate", "--zip", zipPath], { expectFailure: options.expectFailure });
  const parsed = JSON.parse(result.stdout);
  if (options.expectFailure) {
    assert.equal(parsed.status, "fail");
  } else {
    assert.equal(parsed.status, "pass");
  }
  return parsed;
}

function mutateZip(validZip, parentDir, mutate) {
  const fixtureDir = join(parentDir, `fixture-${Math.random().toString(16).slice(2)}`);
  unzipFixture(validZip, fixtureDir);
  mutate(fixtureDir);
  const outZip = join(parentDir, `${Math.random().toString(16).slice(2)}.zip`);
  zipFixture(fixtureDir, outZip);
  return outZip;
}

test("production evidence validator passes a valid dry-run package and writes parseable JSON", () => {
  const parent = makeTempDir();
  try {
    const zipPath = generateDryRunEvidence(parent);
    const jsonOut = join(parent, "validate-result.json");
    runNode(["validate", "--zip", zipPath, "--json-out", jsonOut]);
    const parsed = JSON.parse(readFileSync(jsonOut, "utf8"));
    assert.equal(parsed.status, "pass");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator fails command failure text in grep evidence", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      writeFileSync(join(dir, "grep-evidence.md"), "rg: command not found\n");
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /command execution failure text/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator fails unfinished placeholder text", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      writeFileSync(join(dir, "grep-evidence.md"), "placeholder\n");
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /placeholder or stale commit/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator fails invalid JSON files", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      writeFileSync(join(dir, "phase4-1-summary.json"), "{ invalid json");
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /invalid JSON/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator fails changed-files files without required sections", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      writeFileSync(join(dir, "changed-files.txt"), "only loose text\n");
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /changed-files\.txt must include baseline commit/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator fails mixed phase summary files", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      cpSync(join(dir, "phase4-1-summary.json"), join(dir, "phase4-3-2-summary.json"));
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /multiple phase summary files/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
