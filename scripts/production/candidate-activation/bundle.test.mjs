import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  createProductionExecutionRequest,
  prepareAdminUrl,
  validateProductionExecutionContract,
  validateProductionExecutionRequest,
  verifyStagedTransport,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);

function approvedManifest(template) {
  return {
    ...template,
    approvalEligible: true,
    sourceCommit: "2".repeat(40),
    sourceTree: "3".repeat(40),
    sourceParentCommit: "1".repeat(40),
    sourceDiffSha256: "4".repeat(64),
    sourcePathSetSha256: "5".repeat(64),
    gateEvidenceSha256: "6".repeat(64),
    policySha256: "7".repeat(64),
  };
}

function runtimeFixture() {
  return {
    baseEnvSha256: "1".repeat(64),
    composeSha256: "2".repeat(64),
    dormantDeployStatus: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
    dormantEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-dormant-runtime-deploy-proof/summary.json",
    dormantEvidenceSha256: "3".repeat(64),
    identityOverridePath: "/var/lib/market-radar-ops/runtime/runtime-identity.override.yml",
    identityOverrideSha256: "4".repeat(64),
    identityWrapperPath: "/var/lib/market-radar-ops/runtime/compose-identity-safe",
    identityWrapperSha256: "5".repeat(64),
    postgresAdminEnvPath: "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    productionEnvSha256: "6".repeat(64),
    rollbackCommit: "9".repeat(40),
    runtimeIdentityEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-runtime-identity-proof/runtime-identity-result.json",
    runtimeIdentityEvidenceSha256: "7".repeat(64),
    runtimeIdentityStatus: "PASS_RUNTIME_IDENTITY_AND_PERMISSION",
    webImageId: `sha256:${"8".repeat(64)}`,
  };
}

test("activation release contract is exact without claiming production execution", async () => {
  const result = await validateProductionExecutionContract();
  assert.equal(result.status, "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("transport template is reproducible, redacted and excludes external requests", async () => {
  const directory = await mkdtemp("/tmp/candidate-activation-bundle-");
  try {
    const first = join(directory, "first.tar.gz");
    const second = join(directory, "second.tar.gz");
    const a = await buildTransportBundle({ output: first, sourceIdentity: null, approvalEligible: false });
    const b = await buildTransportBundle({ output: second, sourceIdentity: null, approvalEligible: false });
    assert.equal(a.sha256, b.sha256);
    assert.deepEqual(await readFile(first), await readFile(second));
    const { stdout } = await execFileAsync("tar", ["-tzf", first]);
    assert.doesNotMatch(stdout, /(?:^|\/)(?:\.env(?:\.|$)|approval-request\.json|migration-admin\.url|postgres-admin\.env)/);
    assert.equal(a.manifest.containsSecrets, false);
    assert.equal(a.manifest.approvalEligible, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("exact external request binds release, transport, rollback and standing grant", async () => {
  const directory = await mkdtemp("/tmp/candidate-activation-request-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const built = await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    const manifest = approvedManifest(built.manifest);
    const contract = JSON.parse(await readFile("docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json", "utf8"));
    const request = createProductionExecutionRequest({
      manifest,
      contract,
      bundleSha256: "a".repeat(64),
      runtime: runtimeFixture(),
      now: new Date("2026-07-16T00:00:00.000Z"),
    });
    assert.equal(validateProductionExecutionRequest(
      request, manifest, contract, "a".repeat(64), { now: new Date("2026-07-16T00:01:00.000Z") },
    ).execute, true);
    assert.throws(() => validateProductionExecutionRequest(
      { ...request, approvedCommit: "f".repeat(40) }, manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-16T00:01:00.000Z") },
    ), /commit_binding/);
    assert.throws(() => validateProductionExecutionRequest(
      { ...request, approvalDigest: `sha256:${"0".repeat(64)}` }, manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-16T00:01:00.000Z") },
    ), /approval_digest_binding/);
    assert.throws(() => validateProductionExecutionRequest(
      { ...request, canonicalWriteAllowed: true }, manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-16T00:01:00.000Z") },
    ), /canonicalWriteAllowed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("staged transport rejects byte drift and symlink substitution", async () => {
  const directory = await mkdtemp("/tmp/candidate-activation-stage-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const stage = join(directory, "stage");
    await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    await execFileAsync("mkdir", ["-p", stage]);
    await execFileAsync("tar", ["-xzf", archive, "-C", stage]);
    const manifest = approvedManifest(JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8")));
    assert.ok((await verifyStagedTransport(stage, manifest)).fileCount > 20);
    const target = join(stage, "src/lib/candidate-episode/feature-flags.ts");
    const original = await readFile(target);
    await writeFile(target, `${original}\n// drift\n`);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /checksum_mismatch/);
    await writeFile(target, original);
    await rm(target);
    await execFileAsync("ln", ["-s", "/dev/null", target]);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /not_regular/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("admin URL preparation consumes NUL framed input without returning credentials", async () => {
  const directory = await mkdtemp("/tmp/candidate-activation-admin-");
  try {
    const output = join(directory, "migration-admin.url");
    const passwordKey = ["POSTGRES", "PASSWORD"].join("_");
    const result = await prepareAdminUrl(
      Buffer.from(`POSTGRES_USER=market_radar_admin\n${passwordKey}=test-only-not-a-real-credential\0market_radar_admin\0market_radar`),
      output,
    );
    assert.deepEqual(result, { status: "pass", secretsPrinted: false });
    const parsed = new URL((await readFile(output, "utf8")).trim());
    assert.equal(parsed.hostname, "postgres");
    assert.equal(parsed.pathname, "/market_radar");
    assert.equal((await readFile(output, "utf8")).includes("placeholder"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
