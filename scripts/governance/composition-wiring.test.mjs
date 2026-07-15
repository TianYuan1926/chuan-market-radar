import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import yaml from "js-yaml";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("candidate shadow compose service is profile-isolated and all feature flags default false", async () => {
  const compose = yaml.load(await source("docker-compose.yml"));
  const service = compose.services["candidate-shadow-worker"];
  assert.deepEqual(service.profiles, ["candidate-shadow-runtime"]);
  assert.deepEqual(service.command, [
    "node",
    "deploy/workers/protected-api-worker.mjs",
    "candidate-shadow",
  ]);
  assert.equal(service.environment.CANDIDATE_EPISODE_SHADOW_WRITE, "${CANDIDATE_EPISODE_SHADOW_WRITE:-false}");
  assert.equal(service.environment.CANDIDATE_SOURCE_DATABASE_URL, undefined);
  assert.equal(service.environment.CANDIDATE_CONSUMER_DATABASE_URL, undefined);
  assert.equal(service.environment.CANDIDATE_MONITOR_DATABASE_URL, undefined);
  assert.equal(compose.services.web.environment.CANDIDATE_SOURCE_DATABASE_URL, "${CANDIDATE_SOURCE_DATABASE_URL:-}");
  assert.equal(compose.services.web.environment.CANDIDATE_CONSUMER_DATABASE_URL, "${CANDIDATE_CONSUMER_DATABASE_URL:-}");
  assert.equal(compose.services.web.environment.CANDIDATE_MONITOR_DATABASE_URL, "${CANDIDATE_MONITOR_DATABASE_URL:-}");

  for (const name of [
    "CANDIDATE_EPISODE_CANONICAL_WRITE",
    "CANDIDATE_EPISODE_SHADOW_WRITE",
    "CANDIDATE_EPISODE_DUAL_READ",
    "CANDIDATE_EPISODE_CANONICAL_READ",
    "CANDIDATE_EPISODE_REVIEW_READ",
  ]) {
    assert.equal(compose.services.web.environment[name], `\${${name}:-false}`);
  }
});

test("composition is wired only at the authoritative application archive call and release-authorized", async () => {
  const [flags, radar, appComposition, worker] = await Promise.all([
    source("src/lib/candidate-episode/feature-flags.ts"),
    source("src/lib/market/radar-snapshot.ts"),
    source("src/lib/candidate-episode/app-shadow-capture-composition.ts"),
    source("deploy/workers/protected-api-worker.mjs"),
  ]);

  assert.match(flags, /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const/);
  assert.match(radar, /repository === appPersistenceRepository/);
  assert.match(radar, /appCandidateShadowCaptureComposition\.persistScanArchive/);
  assert.match(appComposition, /codeActivationAllowed: CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED/);
  assert.match(appComposition, /createCandidateRuntimeDatabase/);
  assert.doesNotMatch(appComposition, /appPersistenceTransactions/);
  assert.match(worker, /\/api\/admin\/candidate-shadow\/run/);
  assert.match(worker, /SIGTERM/);
  assert.match(worker, /graceful shutdown complete/);
});

test("machine contract keeps deployment and activation outside this local package", async () => {
  const contract = JSON.parse(await source(
    "docs/governance/wp-g0-2-shadow-capture-composition-wiring.v1.json",
  ));
  assert.equal(contract.status, "local_composition_wiring_verified_runtime_dormant");
  assert.equal(contract.productionAuthorization, false);
  assert.equal(contract.productionDeployed, false);
  assert.equal(contract.productionActivated, false);
  assert.equal(contract.runtimeGate.currentCodeAuthorization, false);
  assert.equal(contract.runtimeGate.currentDefaultFeatureFlagsEnabled, 0);
  assert.equal(contract.worker.startedByDefaultCompose, false);
  assert.equal(contract.composition.unresolvedIdentityHardStopsBeforeCandidateTransaction, true);
  assert.equal(contract.composition.candidateDatabaseUrlsExposedOnlyToWebComposition, true);
  assert.equal(contract.verification.productionConnected, false);
  assert.equal(contract.productionIdentity.legacyIdentityDormantFailClosedProven, true);
  assert.equal(contract.productionIdentity.leastPrivilegeActiveCompositionProven, false);
  assert.equal(contract.productionIdentity.activationBlockedUntilIdentityPackagePasses, true);
  assert.equal(contract.nextPackageRequiresExplicitProductionApproval, true);
});
