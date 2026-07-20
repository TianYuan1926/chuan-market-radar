import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runnerNames } from "./m1-tencent-isolated-runner.mjs";

const sourceCommit = "a".repeat(40);

test("Tencent runner generates only run-scoped Docker identities", () => {
  const names = runnerNames("1760000000000", sourceCommit);
  assert.deepEqual(names, {
    builder: "v2m1b1a21760000000000",
    builderContainer: "buildx_buildkit_v2m1b1a217600000000000",
    collectorImage: `market-radar-v2-m1-collector:b1a-${sourceCommit}`,
    egressNetwork: "v2-m1-b1a-egress-1760000000000",
    postgres: "v2-m1-b1a-postgres-1760000000000",
    storageNetwork: "v2-m1-b1a-storage-1760000000000",
    worker: "v2-m1-b1a-worker-1760000000000",
  });
  assert.throws(() => runnerNames("latest", sourceCommit));
  assert.throws(() => runnerNames("1760000000000", "main"));
});

test("Tencent runner is isolated, bounded, no-authority, and self-cleaning", async () => {
  const source = await readFile(
    "scripts/v2/production/m1-tencent-isolated-runner.mjs",
    "utf8",
  );
  for (const required of [
    "B1A_TENCENT_RUNNER_PROVIDER",
    'const SCOPE_LABEL = "b1a2-isolated-preflight"',
    "BUILD_CPU_NANO = 1_500_000_000",
    "BUILD_MEMORY_BYTES = 2 * 1024 * 1024 * 1024",
    '"--read-only"',
    '"--cap-drop"',
    '"no-new-privileges"',
    '"--network-alias"',
    '"v2-m1-postgres"',
    '"V2_M1_LIVE_REHEARSAL=1"',
    "V2_M1_REHEARSAL_SOURCE_COMMIT=",
    '"buildx", "rm", "--force"',
    '"RESTORE_EXACT_HOST_STATE"',
    "validateTencentHostSafety(hostSafetyInput)",
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
