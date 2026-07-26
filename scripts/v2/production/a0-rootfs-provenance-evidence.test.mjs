import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  loadA0ReleaseQualificationPolicy,
  stableDigest,
} from "./a0-release-qualification-contract.mjs";
import {
  validateA0ImageInspect,
  validateA0RuntimeSmokeEvidence,
} from "./a0-rootfs-provenance-evidence.mjs";
import {
  A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA,
} from "./a0-runtime-smoke-evidence.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

test("A0 image provenance accepts only the exact non-root bounded image config", async () => {
  const { policy } = await loadA0ReleaseQualificationPolicy(repositoryRoot);
  const inspect = [{
    Architecture: "amd64",
    Config: {
      Entrypoint: [
        "/nodejs/bin/node",
        ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
      ],
      Env: [
        "PATH=/usr/local/bin",
        "NODE_ENV=production",
        "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
      ],
      Labels: {
        "org.opencontainers.image.revision": SOURCE_COMMIT,
      },
      User: "65532:65532",
      WorkingDir: "/app",
    },
    Id: `sha256:${"a".repeat(64)}`,
    Os: "linux",
    RootFS: {
      Layers: [`sha256:${"b".repeat(64)}`],
    },
    Size: 100_000_000,
  }];
  const validated = validateA0ImageInspect(inspect, policy, SOURCE_COMMIT);
  assert.match(validated.configurationDigest, /^sha256:[0-9a-f]{64}$/u);

  const root = structuredClone(inspect);
  root[0].Config.User = "0:0";
  assert.throws(
    () => validateA0ImageInspect(root, policy, SOURCE_COMMIT),
  );
  const oversized = structuredClone(inspect);
  oversized[0].Size = policy.reproducibility.maximumImageBytes + 1;
  assert.throws(
    () => validateA0ImageInspect(oversized, policy, SOURCE_COMMIT),
  );
});

test("A0 rootfs provenance rejects altered runtime-smoke evidence", () => {
  const core = {
    schemaVersion: A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA,
    status: "PASS_RUNTIME_LOADS_AND_FAILS_CLOSED_BEFORE_NETWORK_OR_DATABASE",
    sourceCommit: SOURCE_COMMIT,
    nodeVersion: "22.23.1",
    execution: {
      networkMode: "NONE",
      rootFilesystem: "READ_ONLY",
      authorityProbe: "INTENTIONALLY_INVALID_BEFORE_POOL_CREATION",
      entrypointExitCode: 1,
      failure: {
        authorityMode: "NO_AUTHORITY",
        automaticTradingAllowed: false,
        contractVersion: "v2-m1-collector-process.v1",
        errorCode: "COLLECTOR_PROCESS_FAILED",
        status: "FAILED",
      },
    },
    productionRead: false,
    productionMutation: false,
    productionCredentials: false,
    automaticTradingAllowed: false,
  };
  const evidence = {
    ...core,
    evidenceHash: stableDigest(core),
  };
  assert.equal(
    validateA0RuntimeSmokeEvidence(evidence, SOURCE_COMMIT),
    evidence,
  );
  const altered = JSON.parse(canonicalJson(evidence));
  altered.execution.networkMode = "DEFAULT";
  assert.throws(
    () => validateA0RuntimeSmokeEvidence(altered, SOURCE_COMMIT),
  );
});
