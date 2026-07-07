import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const scriptPath = join(rootDir, "scripts/production/observability.mjs");
const fixtureCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();

function nodeEnv() {
  return {
    ...process.env,
    MARKET_RADAR_SOURCE_BRANCH: "phase4-3-2-production-evidence-consistency",
    MARKET_RADAR_SOURCE_COMMIT: fixtureCommit,
    MARKET_RADAR_REMOTE_COMMIT: fixtureCommit,
  };
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: nodeEnv(),
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `${args.join(" ")} should fail`);
  } else {
    assert.equal(result.status, 0, `${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

function runNodeAsync(args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: rootDir,
      env: nodeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectRun(new Error(`${args.join(" ")} timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, options.timeoutMs || 60000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (options.expectFailure) {
        assert.notEqual(code, 0, `${args.join(" ")} should fail`);
      } else {
        assert.equal(code, 0, `${args.join(" ")} failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
      }
      resolveRun({ status: code, stdout, stderr });
    });
  });
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

async function withFixtureServer(callback, options = {}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const bodyByPath = {
      "/api/health": {
        ok: true,
        health: {
          level: "ready",
          persistence: { databaseStatus: "ready" },
          runtimeProbes: {
            redis: { status: "ready" },
            workers: [{ key: "scanner-worker", status: "ready" }],
          },
          scan: options.scan || { freshness: "fresh", status: "ready" },
        },
      },
      "/api/frontend/radar-contract": {
        contract: {
          radarSignals: {
            data: [{
              id: "fixture-btc",
              maturity: "WAIT",
              symbol: "BTCUSDT",
              unifiedDecision: {
                blockerCount: 1,
                canTradeNow: false,
                decision: "WAIT",
                readyPlan: null,
                source: "unified_decision_engine",
              },
            }],
          },
        },
      },
      "/api/radar/backend-contract": {
        ok: true,
        contract: { source: "fixture", status: "ready" },
      },
      "/api/frontend/kline-contract": {
        kline: { overlays: [], status: "live", symbol: url.searchParams.get("symbol") || "BTCUSDT" },
      },
    };
    const body = bodyByPath[url.pathname] || { ok: true };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function generatePhase432Evidence(parentDir, options = {}) {
  const evidenceDir = join(parentDir, "phase432");
  await withFixtureServer(async (baseUrl) => {
    await runNodeAsync([
      "evidence",
      "--mode",
      "real_production",
      "--base-url",
      baseUrl,
      "--out-dir",
      evidenceDir,
    ]);
  }, options);
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

test("phase 4.3.2 production evidence includes changed files and redacts dry-run-only wording", async () => {
  const parent = makeTempDir();
  try {
    const zipPath = await generatePhase432Evidence(parent);
    const outDir = join(parent, "unzipped");
    unzipFixture(zipPath, outDir);
    const changedFiles = readFileSync(join(outDir, "changed-files.txt"), "utf8");
    const grepEvidence = readFileSync(join(outDir, "grep-evidence.md"), "utf8");
    const summary = JSON.parse(readFileSync(join(outDir, "phase4-3-2-summary.json"), "utf8"));
    assert.match(changedFiles, /比较基线 commit/);
    assert.match(changedFiles, /当前 commit/);
    assert.match(changedFiles, /已提交差异文件/);
    assert.doesNotMatch(grepEvidence, /真实腾讯云部署尚未执行|本轮未部署腾讯云|部署授权前计划/);
    assert.equal(summary.secret_leak_check, "pass");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("phase 4.3.2 production evidence preserves partial scan status without promoting it to pass", async () => {
  const parent = makeTempDir();
  try {
    const zipPath = await generatePhase432Evidence(parent, { scan: { freshness: "fresh", status: "partial" } });
    const parsed = validateZip(zipPath);
    assert.equal(parsed.status, "pass");
    const outDir = join(parent, "unzipped-partial");
    unzipFixture(zipPath, outDir);
    const summary = JSON.parse(readFileSync(join(outDir, "phase4-3-2-summary.json"), "utf8"));
    assert.equal(summary.production_health, "partial");
    assert.equal(summary.production_status, "partial");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("production evidence validator still fails real unredacted secret-like values in grep evidence", () => {
  const parent = makeTempDir();
  try {
    const validZip = generateDryRunEvidence(parent);
    const badZip = mutateZip(validZip, parent, (dir) => {
      const fakeSecretName = ["COINGLASS", "API", "KEY"].join("_");
      writeFileSync(join(dir, "grep-evidence.md"), `${fakeSecretName}=not-a-real-key\n`);
    });
    const parsed = validateZip(badZip, { expectFailure: true });
    assert.match(parsed.errors.join("\n"), /potential secret pattern found in grep-evidence\.md/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
