import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildEarlyShadowRunnerFailure,
} from "./m1-early-shadow-runner-evidence.mjs";
import {
  earlyShadowWorkerEnvironment,
  earlyShadowRunnerNames,
  parseEarlyShadowRunnerArguments,
} from "./m1-tencent-early-shadow-runner.mjs";

const sourceCommit = "a".repeat(40);

test("early-shadow runner generates only B1-B run-scoped Docker identities", () => {
  const names = earlyShadowRunnerNames("1760000000000", sourceCommit);
  assert.deepEqual(names, {
    builder: "v2m1b1b1760000000000",
    builderContainer: "buildx_buildkit_v2m1b1b17600000000000",
    buildxProof: "v2-m1-b1b-buildx-proof-1760000000000",
    collectorImage: `market-radar-v2-m1-collector:b1b-${sourceCommit}`,
    egressNetwork: "v2-m1-b1b-egress-1760000000000",
    postgres: "v2-m1-b1b-postgres-1760000000000",
    storageNetwork: "v2-m1-b1b-storage-1760000000000",
    worker: "v2-m1-b1b-worker-1760000000000",
  });
  assert.throws(() => earlyShadowRunnerNames("latest", sourceCommit));
  assert.throws(() => earlyShadowRunnerNames("1760000000000", "main"));
});

test("early-shadow runner requires one exact authorized source commit", () => {
  assert.equal(
    parseEarlyShadowRunnerArguments(["run", sourceCommit]),
    sourceCommit,
  );
  assert.throws(() => parseEarlyShadowRunnerArguments(["run"]));
  assert.throws(() => parseEarlyShadowRunnerArguments(["run", "main"]));
  assert.throws(() => parseEarlyShadowRunnerArguments(["verify", sourceCommit]));
});

test("early-shadow worker environment matches the bounded 31-cycle process contract", () => {
  const releaseId = `m1-5-b1b:${sourceCommit}`;
  const entries = earlyShadowWorkerEnvironment({ releaseId, sourceCommit });
  const environment = Object.fromEntries(entries.map((entry) => {
    const separator = entry.indexOf("=");
    assert.ok(separator > 0);
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));

  assert.equal(Object.isFrozen(entries), true);
  assert.equal(environment.V2_M1_COLLECTOR_SOURCE_COMMIT, sourceCommit);
  assert.equal(environment.V2_M1_COLLECTOR_RELEASE_ID, releaseId);
  assert.equal(environment.V2_M1_COLLECTOR_RUN_PROFILE, "EARLY_30_MINUTES");
  assert.equal(environment.V2_M1_COLLECTOR_CYCLE_INTERVAL_MS, "60000");
  assert.equal(environment.V2_M1_COLLECTOR_MAX_CYCLES, "31");
  assert.equal(environment.V2_M1_COLLECTOR_MAX_FACT_AGE_MS, "60000");
  assert.equal(
    environment.V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS,
    "3600000",
  );
  assert.equal(environment.V2_M1_COLLECTOR_RETENTION_MS, "604800000");
  assert.equal(environment.V2_M1_COLLECTOR_AUTHORITY_MODE, "NO_AUTHORITY");
  assert.equal(
    environment.V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED,
    "false",
  );
  assert.equal("V2_M1_COLLECTOR_WRITER_DATABASE_URL" in environment, false);
  assert.equal("V2_M1_COLLECTOR_READER_DATABASE_URL" in environment, false);
  assert.throws(() => earlyShadowWorkerEnvironment({
    releaseId: "unbound-release",
    sourceCommit,
  }));
});

test("early-shadow runner locks the atomic observation and isolation contract", async () => {
  const [runnerSource, evidenceSource] = await Promise.all([
    readFile(
      "scripts/v2/production/m1-tencent-early-shadow-runner.mjs",
      "utf8",
    ),
    readFile(
      "scripts/v2/production/m1-early-shadow-runner-evidence.mjs",
      "utf8",
    ),
  ]);
  const source = `${runnerSource}\n${evidenceSource}`;
  for (const required of [
    '"V2_M1_COLLECTOR_AUTHORITY_MODE=NO_AUTHORITY"',
    '"V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED=false"',
    '"V2_M1_COLLECTOR_RUN_PROFILE=EARLY_30_MINUTES"',
    '"V2_M1_COLLECTOR_CYCLE_INTERVAL_MS=60000"',
    '"V2_M1_COLLECTOR_MAX_CYCLES=31"',
    '"V2_M1_COLLECTOR_MAX_FACT_AGE_MS=60000"',
    'throw new RunnerFailure("SOURCE_COMMIT_BINDING_FAILED")',
    '"POSTGRES_HOST_AUTH_METHOD=trust"',
    '"--read-only"',
    '"--cap-drop"',
    '"no-new-privileges"',
    '"--network-alias", "v2-m1-postgres"',
    '"--tmpfs", "/var/lib/postgresql/data:',
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE=",
    "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE=",
    '"RUN_ATOMIC_31_CYCLE_SHADOW"',
    '"BUILD_DOMAIN_EVIDENCE"',
    '"RESTORE_EXACT_HOST_STATE"',
    "writeContentAddressedObject",
    'process.exitCode = 2',
  ]) {
    assert.ok(source.includes(required), `missing B1-B boundary: ${required}`);
  }
  for (const forbidden of [
    "docker compose",
    "systemctl",
    "/var/lib/docker",
    "chuan-market-radar-web",
    "chuan-market-radar-postgres",
    "CRON_SECRET",
    "COINGLASS_API_KEY",
    "REDIS_URL",
    "--privileged",
    "--network host",
    "--publish",
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL=",
    "V2_M1_COLLECTOR_READER_DATABASE_URL=",
  ]) {
    assert.equal(
      runnerSource.includes(forbidden),
      false,
      `forbidden B1-B production capability: ${forbidden}`,
    );
  }
});

test("early-shadow failure evidence preserves primary and restoration causes", () => {
  const report = buildEarlyShadowRunnerFailure({
    code: "EARLY_SHADOW_WORKER_FAILED",
    generatedAt: "2026-07-21T00:31:01.000Z",
    hostSafety: null,
    restorationCode: "HOST_RESTORATION_NOT_PROVEN",
    runId: "1760000000000",
    sourceCommit,
  });
  assert.deepEqual(report.diagnostic, {
    code: "EARLY_SHADOW_WORKER_FAILED",
    restorationCode: "HOST_RESTORATION_NOT_PROVEN",
  });
  assert.equal(report.scope.productionMutation, "UNKNOWN");
  assert.equal("rawError" in report.diagnostic, false);
});
