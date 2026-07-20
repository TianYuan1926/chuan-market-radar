import assert from "node:assert/strict";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B1A_BRANCH,
  B1A_GITHUB_RUNNER_PROVIDER,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
  stableDigest,
  validateTencentHostSafety,
} from "./m1-reachable-runner-preflight.mjs";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const SCHEMA_VERSION =
  "v2-m1-reachable-runner-failure-diagnostic.v2";
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TARGET_VENUES = new Set([
  "BINANCE_FUTURES",
  "BYBIT_LINEAR_PERPETUAL",
  "OKX_SWAP",
]);
const RUNTIME_STATES = new Set([
  "COLD_START",
  "RECONCILING",
  "COLLECTING",
  "PERSISTING",
  "READY",
  "DEGRADED",
  "BACKPRESSURED",
]);
const CYCLE_TRIGGERS = new Set([
  "STARTUP_FULL",
  "INCREMENTAL_TICKER",
  "PERIODIC_RECONCILIATION",
  "RECOVERY",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function logDigest(tap) {
  return stableDigest({ tap });
}

function tapCounts(tap) {
  const counts = { fail: null, pass: null, skipped: null, tests: null };
  for (const line of tap.split(/\r?\n/u)) {
    const match = /^\s*# (tests|pass|fail|skipped) (\d+)\s*$/u.exec(line);
    if (match) {
      counts[match[1]] = Number(match[2]);
    }
  }
  return counts;
}

function errorCategories(tap) {
  const categories = new Set(["TEST_PROCESS_FAILURE"]);
  const checks = [
    ["ASSERTION_FAILURE", /AssertionError|ERR_ASSERTION/u],
    ["DATABASE_CONNECTIVITY", /Postgres|postgres|ECONNREFUSED[^\n]*5432|pg_isready/u],
    ["FILESYSTEM_PERMISSION", /EACCES|EPERM|permission denied|read-only file system/iu],
    ["NETWORK_DNS", /ENOTFOUND|EAI_AGAIN|getaddrinfo/iu],
    ["NETWORK_RESET", /ECONNRESET|socket hang up/iu],
    ["NETWORK_TIMEOUT", /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|timed? ?out/iu],
    ["PROVIDER_FORBIDDEN", /HTTP[_ ]?403|status(?: code)?[:= ]+403|forbidden/iu],
    ["PROVIDER_RATE_LIMIT", /HTTP[_ ]?429|status(?: code)?[:= ]+429|rate.?limit/iu],
    ["PROVIDER_REGION_RESTRICTED", /HTTP[_ ]?451|status(?: code)?[:= ]+451|region|location.?restrict/iu],
  ];
  for (const [category, pattern] of checks) {
    if (pattern.test(tap)) {
      categories.add(category);
    }
  }
  return [...categories].sort();
}

function tapIdentifiers(tap) {
  const values = new Set();
  const pattern = /(?:^|\n)\s*(?:code|failureType):\s*['"]?([A-Za-z0-9_:-]{1,64})/gu;
  for (const match of tap.matchAll(pattern)) {
    values.add(match[1]);
  }
  return [...values].sort();
}

function providerFailures(tap) {
  const failures = new Map();
  for (const rawLine of tap.split(/\r?\n/u)) {
    const candidate = rawLine.trim().replace(/^#\s?/u, "");
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!Array.isArray(record.cycles)) {
      continue;
    }
    for (const cycle of record.cycles) {
      if (!Array.isArray(cycle?.providerFailures)) {
        continue;
      }
      for (const failure of cycle.providerFailures) {
        if (
          !isRecord(failure) ||
          !TARGET_VENUES.has(failure.venue) ||
          !["CATALOG", "TICKER"].includes(failure.operation) ||
          !/^[A-Z0-9_]{1,64}$/u.test(failure.kind) ||
          !/^[A-Za-z0-9_.:-]{1,128}$/u.test(failure.reasonCode)
        ) {
          continue;
        }
        const normalized = {
          kind: failure.kind,
          operation: failure.operation,
          reasonCode: failure.reasonCode,
          venue: failure.venue,
        };
        failures.set(JSON.stringify(normalized), normalized);
      }
    }
  }
  return [...failures.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function coverageSummary(coverage) {
  if (!isRecord(coverage) || !Array.isArray(coverage.venues)) {
    return null;
  }
  const fields = [
    "accountedCount",
    "collectedCount",
    "eligibleCount",
    "freshCount",
    "providerObservedCount",
  ];
  const normalize = (record) => {
    const normalized = Object.fromEntries(fields.map((field) => [
      field,
      record[field] === null && field === "providerObservedCount"
        ? null
        : nonNegativeInteger(record[field]),
    ]));
    return Object.values(normalized).some((value, index) =>
      value === null && fields[index] !== "providerObservedCount"
    )
      ? null
      : normalized;
  };
  const total = normalize(coverage);
  if (total === null) {
    return null;
  }
  const venues = coverage.venues.map((venue) => {
    if (!isRecord(venue) || !TARGET_VENUES.has(venue.venue)) {
      return null;
    }
    const counts = normalize(venue);
    return counts === null ? null : { ...counts, venue: venue.venue };
  });
  if (
    venues.some((venue) => venue === null) ||
    new Set(venues.map((venue) => venue.venue)).size !== TARGET_VENUES.size
  ) {
    return null;
  }
  return {
    ...total,
    venues: venues.sort((left, right) => left.venue.localeCompare(right.venue)),
  };
}

function cycleSummaries(tap) {
  const summaries = [];
  const seen = new Set();
  for (const rawLine of tap.split(/\r?\n/u)) {
    const candidate = rawLine.trim().replace(/^#\s?/u, "");
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!Array.isArray(record.cycles) || record.cycles.length > 4) {
      continue;
    }
    for (const cycle of record.cycles) {
      const coverage = coverageSummary(cycle?.coverage);
      const reasons = Array.isArray(cycle?.reasons)
        ? cycle.reasons.filter((reason) =>
          typeof reason === "string" &&
          /^[A-Za-z0-9_.:-]{1,128}$/u.test(reason)
        ).slice(0, 32).sort()
        : null;
      if (
        coverage === null ||
        !["READY", "NOT_READY"].includes(cycle?.operationalReadiness) ||
        !RUNTIME_STATES.has(cycle?.state) ||
        !CYCLE_TRIGGERS.has(cycle?.trigger) ||
        reasons === null
      ) {
        continue;
      }
      const normalized = {
        coverage,
        operationalReadiness: cycle.operationalReadiness,
        reasons,
        state: cycle.state,
        trigger: cycle.trigger,
      };
      const identity = JSON.stringify(normalized);
      if (!seen.has(identity)) {
        seen.add(identity);
        summaries.push(normalized);
      }
    }
  }
  return summaries;
}

function sloConclusions(tap) {
  const conclusions = new Set();
  for (const rawLine of tap.split(/\r?\n/u)) {
    const candidate = rawLine.trim().replace(/^#\s?/u, "");
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
      continue;
    }
    try {
      const value = JSON.parse(candidate).sloConclusion;
      if (["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"].includes(value)) {
        conclusions.add(value);
      }
    } catch {
      // Ignore non-JSON TAP diagnostics.
    }
  }
  return [...conclusions].sort();
}

export function verifyFailureDiagnostic(report) {
  assert.ok(isRecord(report));
  assert.match(report.evidenceDigest, SHA256_PATTERN);
  const { evidenceDigest, evidenceId, ...core } = report;
  assert.equal(evidenceDigest, stableDigest(core));
  assert.equal(
    evidenceId,
    `v2-m1-b1a-failure:${evidenceDigest.slice("sha256:".length)}`,
  );
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.status, "FAIL_REACHABLE_DOCKER_RUNNER_PREFLIGHT");
  assert.equal(report.scope.productionMutation, false);
  assert.equal(report.scope.rawLogIncluded, false);
  assert.ok(
    [B1A_GITHUB_RUNNER_PROVIDER, B1A_TENCENT_RUNNER_PROVIDER].includes(
      report.runner.provider,
    ),
  );
  if (report.runner.provider === B1A_TENCENT_RUNNER_PROVIDER) {
    assert.equal(report.scope.productionHostUsed, true);
    assert.equal(report.hostSafety?.cleanupVerified, true);
    assert.equal(report.hostSafety?.exactDockerStateRestored, true);
  } else {
    assert.equal(report.scope.productionHostUsed, false);
    assert.equal("hostSafety" in report, false);
  }
  return report;
}

export function buildFailureDiagnostic(input) {
  const runnerProvider =
    input.runnerProvider ?? B1A_GITHUB_RUNNER_PROVIDER;
  assert.ok(
    [B1A_GITHUB_RUNNER_PROVIDER, B1A_TENCENT_RUNNER_PROVIDER].includes(
      runnerProvider,
    ),
  );
  assert.match(input.sourceCommit, COMMIT_PATTERN);
  assert.equal(input.repository, B1A_REPOSITORY);
  assert.equal(input.ref, `refs/heads/${B1A_BRANCH}`);
  assert.match(String(input.runId), /^[1-9][0-9]*$/u);
  assert.ok(Number.isSafeInteger(input.runAttempt) && input.runAttempt > 0);
  assert.ok(Number.isSafeInteger(input.exitCode) && input.exitCode > 0);
  assert.equal(new Date(input.generatedAt).toISOString(), input.generatedAt);
  assert.equal(typeof input.liveTap, "string");
  assert.ok(Buffer.byteLength(input.liveTap) > 0);
  const hostSafety =
    runnerProvider === B1A_TENCENT_RUNNER_PROVIDER
      ? validateTencentHostSafety(input.hostSafety)
      : null;

  const core = {
    diagnostic: {
      categories: errorCategories(input.liveTap),
      cycleSummaries: cycleSummaries(input.liveTap),
      exitCode: input.exitCode,
      providerFailures: providerFailures(input.liveTap),
      tapByteLength: Buffer.byteLength(input.liveTap),
      tapCounts: tapCounts(input.liveTap),
      tapDigest: logDigest(input.liveTap),
      tapIdentifiers: tapIdentifiers(input.liveTap),
      sloConclusions: sloConclusions(input.liveTap),
    },
    generatedAt: input.generatedAt,
    runner: {
      attempt: input.runAttempt,
      id: String(input.runId),
      provider: runnerProvider,
    },
    schemaVersion: SCHEMA_VERSION,
    scope: {
      automaticTradingAllowed: false,
      productionHostUsed:
        runnerProvider === B1A_TENCENT_RUNNER_PROVIDER,
      productionMutation: false,
      productionNetworkUsed: false,
      productionSecretsUsed: false,
      rawLogIncluded: false,
      tradingPlanGenerated: false,
    },
    source: {
      commit: input.sourceCommit,
      ref: input.ref,
      repository: input.repository,
    },
    status: "FAIL_REACHABLE_DOCKER_RUNNER_PREFLIGHT",
    ...(hostSafety === null ? {} : { hostSafety }),
  };
  const evidenceDigest = stableDigest(core);
  return verifyFailureDiagnostic({
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1a-failure:${evidenceDigest.slice("sha256:".length)}`,
  });
}

async function readTap(path) {
  const stats = await lstat(path);
  assert.ok(stats.isFile() && !stats.isSymbolicLink());
  assert.ok(stats.size > 0 && stats.size <= MAX_INPUT_BYTES);
  return readFile(path, "utf8");
}

function parseFlags(arguments_) {
  const flags = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    assert.match(name ?? "", /^--[a-z0-9-]+$/u);
    assert.ok(value !== undefined && value !== "");
    assert.equal(flags.has(name), false);
    flags.set(name, value);
  }
  return flags;
}

function required(flags, name) {
  const value = flags.get(name);
  assert.ok(value, `missing ${name}`);
  return value;
}

async function runCli() {
  const flags = parseFlags(process.argv.slice(2));
  const expected = new Set([
    "--exit-code",
    "--generated-at",
    "--live-tap",
    "--output",
    "--ref",
    "--repository",
    "--run-attempt",
    "--run-id",
    "--source-commit",
  ]);
  assert.equal(flags.size, expected.size);
  for (const name of flags.keys()) {
    assert.ok(expected.has(name), `unknown flag ${name}`);
  }
  const report = buildFailureDiagnostic({
    exitCode: Number(required(flags, "--exit-code")),
    generatedAt: required(flags, "--generated-at"),
    liveTap: await readTap(required(flags, "--live-tap")),
    ref: required(flags, "--ref"),
    repository: required(flags, "--repository"),
    runAttempt: Number(required(flags, "--run-attempt")),
    runId: required(flags, "--run-id"),
    sourceCommit: required(flags, "--source-commit"),
  });
  const output = resolve(required(flags, "--output"));
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${report.status} ${report.evidenceDigest}\n`);
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(
      `M1_REACHABLE_RUNNER_DIAGNOSTIC_FAIL ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
