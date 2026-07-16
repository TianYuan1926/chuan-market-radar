import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  const activationRoot = "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-candidate-activation-proof-release";
  return {
    activationCloseoutPath: `${activationRoot}/observation-closeout.json`,
    activationCloseoutSha256: "1".repeat(64),
    activationEvidencePath: `${activationRoot}/observation-final.json`,
    activationEvidenceSha256: "2".repeat(64),
    activationSamplesPath: `${activationRoot}/observation-samples.jsonl`,
    activationSamplesSha256: "3".repeat(64),
    approvedProductionCommit: "4".repeat(40),
    authorityEpoch: 3,
    composeSha256: "5".repeat(64),
    postgresAdminEnvPath: "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    productionEnvSha256: "6".repeat(64),
    releaseId: "candidate-shadow-proof-release",
    webImageId: `sha256:${"7".repeat(64)}`,
  };
}

async function contracts() {
  const [preparation, execution] = await Promise.all([
    readFile("docs/governance/wp-g0-2-shadow-verify-reconciliation-preparation.v1.json", "utf8")
      .then(JSON.parse),
    readFile("docs/governance/wp-g0-2-reconciliation-production-execution.v1.json", "utf8")
      .then(JSON.parse),
  ]);
  return { preparation, execution };
}

test("reconciliation execution contract is exact and does not claim production execution", async () => {
  const result = await validateProductionExecutionContract();
  assert.equal(result.status, "PASS_LOCAL_RECONCILIATION_PRODUCTION_PACKET");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("transport template is deterministic, redacted, and contains no request or credential", async () => {
  const directory = await mkdtemp("/tmp/candidate-reconciliation-bundle-");
  try {
    const first = join(directory, "first.tar.gz");
    const second = join(directory, "second.tar.gz");
    const a = await buildTransportBundle({ output: first, sourceIdentity: null, approvalEligible: false });
    const b = await buildTransportBundle({ output: second, sourceIdentity: null, approvalEligible: false });
    assert.equal(a.sha256, b.sha256);
    assert.deepEqual(await readFile(first), await readFile(second));
    const { stdout } = await execFileAsync("tar", ["-tzf", first]);
    assert.doesNotMatch(stdout, /(?:^|\/)(?:\.env(?:\.|$)|approval-request\.json|migration-admin\.url|postgres-admin\.env)/u);
    assert.equal(a.manifest.containsSecrets, false);
    assert.equal(a.manifest.approvalEligible, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external request binds exact observation, production identity, packet, and standing grant", async () => {
  const directory = await mkdtemp("/tmp/candidate-reconciliation-request-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const built = await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    const manifest = approvedManifest(built.manifest);
    const { preparation, execution } = await contracts();
    const request = createProductionExecutionRequest({
      manifest,
      execution,
      preparation,
      bundleSha256: "a".repeat(64),
      runtime: runtimeFixture(),
      now: new Date("2026-07-17T00:00:00.000Z"),
      approvalId: "MR-G0-RECON-TEST",
      nonce: "12345678-1234-4234-8234-123456789abc",
    });
    const validated = await validateProductionExecutionRequest(
      request, manifest, preparation, execution, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    );
    assert.equal(validated.executeReadOnlyComparison, true);
    assert.equal(validated.reconciliationApproval.minimumComparedWrites, 10_000);
    await assert.rejects(() => validateProductionExecutionRequest(
      { ...request, approvedProductionCommit: "f".repeat(40) },
      manifest, preparation, execution, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /preflight_binding|inner_reconciliation_binding/u);
    await assert.rejects(() => validateProductionExecutionRequest(
      { ...request, executeReadOnlyComparison: false },
      manifest, preparation, execution, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /request_identity_invalid/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("staged transport rejects byte drift and symlink substitution", async () => {
  const directory = await mkdtemp("/tmp/candidate-reconciliation-stage-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const stage = join(directory, "stage");
    await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    await execFileAsync("mkdir", ["-p", stage]);
    await execFileAsync("tar", ["-xzf", archive, "-C", stage]);
    const manifest = approvedManifest(JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8")));
    assert.equal((await verifyStagedTransport(stage, manifest)).status,
      "PASS_LOCAL_RECONCILIATION_PRODUCTION_PACKET");
    const target = join(stage, "scripts/production/candidate-reconciliation/production-runner.sh");
    const original = await readFile(target);
    await writeFile(target, `${original}\n# drift\n`);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /transport_artifact_mismatch/u);
    await writeFile(target, original);
    await rm(target);
    await symlink("/dev/null", target);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /artifact_not_regular/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("admin URL creation consumes framed input and never returns credentials", async () => {
  const directory = await mkdtemp("/tmp/candidate-reconciliation-admin-");
  try {
    const output = join(directory, "migration-admin.url");
    const passwordKey = ["POSTGRES", "PASSWORD"].join("_");
    const result = await prepareAdminUrl(
      Buffer.from(`POSTGRES_USER=market_radar_admin\n${passwordKey}=test-only-value\0market_radar_admin\0market_radar`),
      output,
    );
    assert.deepEqual(result, { status: "pass", secretsPrinted: false });
    const parsed = new URL((await readFile(output, "utf8")).trim());
    assert.equal(parsed.hostname, "postgres");
    assert.equal(parsed.pathname, "/market_radar");
    assert.equal(Object.hasOwn(result, "url"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
