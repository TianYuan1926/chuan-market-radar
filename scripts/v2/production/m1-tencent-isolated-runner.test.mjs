import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildStageFailure,
  runnerNames,
  splitDockerFormatRecord,
} from "./m1-tencent-isolated-runner.mjs";

const sourceCommit = "a".repeat(40);

test("Tencent runner generates only run-scoped Docker identities", () => {
  const names = runnerNames("1760000000000", sourceCommit);
  assert.deepEqual(names, {
    builder: "v2m1b1a21760000000000",
    builderContainer: "buildx_buildkit_v2m1b1a217600000000000",
    buildxProof: "v2-m1-b1a-buildx-proof-1760000000000",
    collectorImage: `market-radar-v2-m1-collector:b1a-${sourceCommit}`,
    egressNetwork: "v2-m1-b1a-egress-1760000000000",
    postgres: "v2-m1-b1a-postgres-1760000000000",
    storageNetwork: "v2-m1-b1a-storage-1760000000000",
    worker: "v2-m1-b1a-worker-1760000000000",
  });
  assert.throws(() => runnerNames("latest", sourceCommit));
  assert.throws(() => runnerNames("1760000000000", "main"));
});

test("Tencent runner parses Docker fields without relying on tab expansion", () => {
  assert.deepEqual(
    splitDockerFormatRecord("one|two|three", 3, "TEST_FORMAT_FAILED"),
    ["one", "two", "three"],
  );
  assert.throws(() =>
    splitDockerFormatRecord("one\\ttwo", 2, "TEST_FORMAT_FAILED")
  );
  assert.throws(() =>
    splitDockerFormatRecord("one||three", 3, "TEST_FORMAT_FAILED")
  );
});

test("Tencent runner is isolated, bounded, no-authority, and self-cleaning", async () => {
  const source = await readFile(
    "scripts/v2/production/m1-tencent-isolated-runner.mjs",
    "utf8",
  );
  for (const required of [
    "B1A_TENCENT_RUNNER_PROVIDER",
    'const SCOPE_LABEL = "b1a2-isolated-preflight"',
    `'{{with (index .State "Health")}}{{.Status}}{{else}}none{{end}}'`,
    "BUILD_CPU_NANO = 1_500_000_000",
    "BUILD_MEMORY_BYTES = 2 * 1024 * 1024 * 1024",
    '"--read-only"',
    '"--cap-drop"',
    '"no-new-privileges"',
    '"--network-alias"',
    '"v2-m1-postgres"',
    '"V2_M1_LIVE_REHEARSAL=1"',
    "V2_M1_REHEARSAL_SOURCE_COMMIT=",
    '"PROVE_PINNED_RUNNER_BINARY"',
    '"PROVE_PINNED_BUILDX_PLUGIN"',
    '"sha256sum"',
    "readFile(process.execPath)",
    "BUILDX_PLUGIN_PATH",
    "B1A_BUILDX_IMAGE",
    "HOME=${homedir()}",
    '"buildx", "rm", "--force"',
    '"RESTORE_EXACT_HOST_STATE"',
    "proveTencentHostSafety(hostSafetyInput)",
  ]) {
    assert.ok(source.includes(required), `missing isolated runner boundary: ${required}`);
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
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `forbidden production capability: ${forbidden}`,
    );
  }
});

test("Tencent runner preserves the primary failure when restoration is unproven", () => {
  const report = buildStageFailure({
    code: "CONTAINER_SNAPSHOT_FAILED",
    hostSafety: null,
    restorationCode: "HOST_RESTORATION_NOT_PROVEN",
    runId: "1760000000000",
    sourceCommit,
  });
  assert.deepEqual(report.diagnostic, {
    code: "CONTAINER_SNAPSHOT_FAILED",
    restorationCode: "HOST_RESTORATION_NOT_PROVEN",
  });
  assert.equal(report.scope.productionMutation, "UNKNOWN");
  assert.equal("rawError" in report.diagnostic, false);
});
