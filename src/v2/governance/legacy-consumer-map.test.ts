import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyConsumerMap,
  isV2OwnedRepositoryPath,
  type LegacyCapabilityAtlas,
  type LegacyConsumerMap,
  type LegacyExtractionPolicy,
} from "./legacy-consumer-map";

const repositoryRoot = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as T;
}

test("keeps every V2 graph root outside the Legacy consumer map", () => {
  for (const path of [
    "src/v2/modules/example.ts",
    "deploy/v2/m1-collector/Dockerfile.ts",
    "scripts/v2/production/release.mjs",
    "tools/v2/check-contract.mjs",
    ".github/workflows/v2-m1-5-b1-reachable-runner-preflight.yml",
  ]) {
    assert.equal(isV2OwnedRepositoryPath(path), true, path);
  }

  for (const path of [
    "src/lib/market/example.ts",
    "deploy/workers/scanner-worker.js",
    "scripts/deploy-production.mjs",
    "tools/check-production.mjs",
    ".github/workflows/production.yml",
  ]) {
    assert.equal(isV2OwnedRepositoryPath(path), false, path);
  }
});

test("keeps the reviewed Legacy consumer map byte-for-structure current", () => {
  const atlas = readJson<LegacyCapabilityAtlas>(
    "docs/architecture/v2/legacy-capability-atlas.v1.json",
  );
  const policy = readJson<LegacyExtractionPolicy>(
    "docs/architecture/v2/LEGACY_EXTRACTION_POLICY_V1.json",
  );
  const committedMap = readJson<LegacyConsumerMap>(
    "docs/architecture/v2/legacy-consumer-map.v1.json",
  );
  const currentMap = buildLegacyConsumerMap(repositoryRoot, atlas, policy);

  assert.deepEqual(
    currentMap,
    committedMap,
    "Legacy graph changed; regenerate and review the consumer map",
  );
});

test("keeps every capability reviewed and every deletion gate closed", () => {
  const map = readJson<LegacyConsumerMap>(
    "docs/architecture/v2/legacy-consumer-map.v1.json",
  );

  assert.equal(map.capabilities.length, 22);
  assert.equal(map.totals.capabilities, 22);
  assert.ok(map.totals.sourceFiles > 0);
  assert.ok(map.totals.directRuntimeConsumerEdges > 0);
  assert.ok(map.totals.runtimeEntrypoints > 0);
  assert.ok(map.totals.extractionCandidates > 0);
  assert.ok(map.totals.storageObjects > 0);
  assert.equal(map.legacyDeletionAllowed, false);
  assert.equal(map.legacyRuntimeImportAllowed, false);
  assert.equal(map.copyPasteWithoutBehavioralFixtureAllowed, false);

  for (const capability of map.capabilities) {
    assert.equal(capability.deletionAllowedNow, false, capability.capabilityId);
    assert.ok(capability.sourceFiles.length > 0, capability.capabilityId);
    assert.ok(capability.sourceDigest.startsWith("sha256:"));
    assert.ok(capability.decision.length > 0);
    assert.ok(capability.decisionReason.length > 0);
    assert.ok(capability.deleteGate.length > 0);
  }
});
