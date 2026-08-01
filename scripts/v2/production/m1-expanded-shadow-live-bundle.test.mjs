import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildM1ExpandedShadowApprovalRequest,
  compileM1ExpandedShadowRuntime,
  loadM1ExpandedShadowRuntimeDependencies,
} from "./m1-expanded-shadow-live-bundle.mjs";
import {
  DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
  M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
  M1_EXPANDED_SHADOW_POSTGRES_IMAGE,
} from "./m1-expanded-shadow-live-runner.mjs";
import {
  canonicalJson,
  sha256,
} from "./m1-source-conformance-live-runner.mjs";

const COMMIT = "a".repeat(40);
const execFileAsync = promisify(execFile);

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function reference(kind) {
  return {
    artifactId: `${kind}:fixture`,
    contentHash: digest(kind === "runtime" ? "1" : "2"),
    path:
      kind === "runtime"
        ? `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.runtimeAdapterEvidenceRoot}/fixture.json`
        : `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.conformanceEvidenceRoot}/fixture.json`,
    releaseId: COMMIT,
    sha256: (kind === "runtime" ? "3" : "4").repeat(64),
  };
}

test("bundle request builder preserves exact manifest and upstream bindings", () => {
  const manifest = {
    schemaVersion: "fixture",
    sourceCommit: COMMIT,
    transportArchiveSha256: digest("5"),
  };
  const request = buildM1ExpandedShadowApprovalRequest({
    approval: {
      dispatchId: "m1-expanded-shadow-20260727t030000z",
      expectedContainerIds: ["6".repeat(64)],
      expectedPostgresImageId: digest("7"),
      expectedProductionHead: "b".repeat(40),
      expectedTopologyBeforeHash: digest("8"),
      expiresAt: "2026-07-27T04:30:00.000Z",
      issuedAt: "2026-07-27T03:00:00.000Z",
      revocationEpoch: 10,
      rotationOrdinal: 2,
      runnerUnitName: "market-radar-m1-expanded-shadow-live02",
      sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    },
    bundleSha256: "9".repeat(64),
    conformanceArtifact: reference("conformance"),
    manifest,
    runtimeAdapterArtifact: reference("runtime"),
    sourceCommit: COMMIT,
    sourceTree: "c".repeat(40),
  });
  assert.equal(request.packageId, M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID);
  assert.equal(request.releaseManifest, manifest);
  assert.equal(
    request.artifactManifestSha256,
    sha256(canonicalJson(manifest)),
  );
  assert.equal(request.postgresImageReference, M1_EXPANDED_SHADOW_POSTGRES_IMAGE);
  assert.equal(request.runtimeAdapterArtifact.releaseId, COMMIT);
  assert.equal(request.conformanceArtifact.releaseId, COMMIT);
  assert.equal(request.rotationOrdinal, 2);
});

test("bundle source is deterministic, committed-only and contains no install path", async () => {
  const [bundle, tsconfig] = await Promise.all([
    readFile(
      "scripts/v2/production/m1-expanded-shadow-live-bundle.mjs",
      "utf8",
    ),
    readFile("tsconfig.m1-expanded-shadow-live-package.json", "utf8"),
  ]);
  for (const required of [
    "writeDeterministicUstar",
    '"gzip"',
    '["-n", "-9", "-c", archivePath]',
    "assertCommittedFile",
    "source commit is not the exact pushed source ref",
    "package-lock.json",
    "dependencyClosure",
    "zodRuntimeTreeHash",
    "compiledRuntimeTreeHash",
    "transportArchiveSha256",
    "containsSecrets: false",
  ]) {
    assert.ok(bundle.includes(required), `missing bundle control: ${required}`);
  }
  for (const forbidden of [
    "npm install",
    "npm ci",
    "git checkout",
    "git pull",
    "COINGLASS_API_KEY",
    ".env.production",
  ]) {
    assert.equal(bundle.includes(forbidden), false);
  }
  const parsed = JSON.parse(tsconfig);
  assert.deepEqual(parsed.files, [
    "src/v2/entrypoints/m1-expanded-shadow-live-runtime.ts",
  ]);
  assert.deepEqual(parsed.include, []);
});

test("bundle closes the compiled code and lock-derived runtime dependencies", async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), "m1-expanded-shadow-package-test-"),
  );
  try {
    const compiled = await compileM1ExpandedShadowRuntime(
      process.cwd(),
      join(temporary, "compiled"),
    );
    const dependencies = await loadM1ExpandedShadowRuntimeDependencies(
      process.cwd(),
    );
    assert.ok(compiled.length >= 35 && compiled.length <= 55);
    assert.ok(
      compiled.includes("v2/entrypoints/m1-expanded-shadow-live-runtime.js"),
    );
    assert.deepEqual(dependencies.names, [
      "lossless-json",
      "pg",
      "pg-cloudflare",
      "pg-connection-string",
      "pg-int8",
      "pg-pool",
      "pg-protocol",
      "pg-types",
      "pgpass",
      "postgres-array",
      "postgres-bytea",
      "postgres-date",
      "postgres-interval",
      "split2",
      "xtend",
      "zod",
    ]);
    assert.ok(
      dependencies.files.length >= 175 &&
        dependencies.files.length <= 215,
    );
    assert.match(
      dependencies.dependencyLockSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.match(
      dependencies.zodRuntimeTreeHash,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.equal(
      dependencies.files.some((file) =>
        /(?:^|\/)(?:test|tests)(?:\/|\.|-)/u.test(file.bundlePath)
      ),
      false,
    );
    assert.ok(
      compiled.length + dependencies.files.length + 4 <= 256,
      "release manifest file ceiling must include scripts and package-lock",
    );
    for (const file of dependencies.files) {
      const target = join(
        temporary,
        "compiled",
        file.bundlePath.replace(/^runtime\//u, ""),
      );
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file.bytesPath, target);
    }
    const runtimeEntry = join(
      temporary,
      "compiled/v2/entrypoints/m1-expanded-shadow-live-runtime.js",
    );
    const smoke = [
      "const runtime=require(process.argv[1]);",
      "const pg=require(process.argv[2]);",
      "process.stdout.write(JSON.stringify({",
      "capture:typeof runtime.captureM1MicrostructureForwardWorker,",
      "listingJoin:typeof runtime.buildM2ListingVenueEventEvidenceJoin,",
      "listingVerify:typeof runtime.verifyM2ListingVenueEventRuntimeEvidenceSet,",
      "multiAsset:typeof runtime.runM1MultiAssetShadowWorker,",
      "pool:typeof pg.Pool",
      "}));",
    ].join("");
    const { stdout } = await execFileAsync(process.execPath, [
      "-e",
      smoke,
      runtimeEntry,
      join(temporary, "compiled/node_modules/pg"),
    ], {
      cwd: temporary,
      encoding: "utf8",
      env: {
        HOME: temporary,
        LANG: "C",
        LC_ALL: "C",
        PATH: dirname(process.execPath),
      },
      timeout: 30_000,
    });
    assert.deepEqual(JSON.parse(stdout), {
      capture: "function",
      listingJoin: "function",
      listingVerify: "function",
      multiAsset: "function",
      pool: "function",
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
