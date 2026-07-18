import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildTransportBundle,
  createProductionExecutionRequest,
  EXECUTION_CONTRACT_PATH,
  prepareAdminUrl,
  validateProductionExecutionRequest,
  validateProductionPacketContract,
} from "./bundle.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);

function evidenceGroup({ cycle, release, sourceCommit, directory }) {
  return {
    authorityEpoch: 1,
    closeoutPath: `${directory}/cycle-observation-closeout.json`,
    closeoutSha256: hash("1"),
    commit: sourceCommit,
    finalPath: `${directory}/cycle-observation-final.json`,
    finalSha256: hash("2"),
    migrationId: cycle,
    releaseId: release,
    samplesPath: `${directory}/cycle-observation-samples.jsonl`,
    samplesSha256: hash("3"),
  };
}

function runtime() {
  const unifiedDirectory =
    "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-cycle5pack";
  return {
    approvedProductionCommit: commit("b"),
    webImageId: `sha256:${hash("c")}`,
    composeSha256: hash("d"),
    productionEnvSha256: hash("e"),
    postgresAdminEnvPath:
      "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    captureSpecification: {
      schemaVersion: "candidate-lineage-capture-specification.v3",
      packageId: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
      productionMutationAllowed: false,
      outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
      unified: evidenceGroup({
        cycle: "candidate-episode-v1-cycle-5",
        release: "candidate-shadow-lineage-packet-cycle-5",
        sourceCommit: commit("b"),
        directory: unifiedDirectory,
      }),
    },
  };
}

const sourceIdentity = {
  sourceCommit: commit("4"),
  sourceTree: commit("5"),
  sourceParentCommit: commit("6"),
  sourceDiffSha256: hash("7"),
  sourcePathSetSha256: hash("8"),
  gateEvidenceSha256: hash("9"),
  policySha256: hash("a"),
};

test("lineage production packet contract and deterministic redacted transport are valid", async () => {
  const contract = await validateProductionPacketContract();
  assert.equal(contract.status, "PASS_LOCAL_LINEAGE_PRODUCTION_PACKET");
  assert.deepEqual(contract.violations, []);

  const root = await mkdtemp(join(tmpdir(), "lineage-bundle-test-"));
  try {
    const first = await buildTransportBundle({
      output: join(root, "first.tar.gz"), sourceIdentity, approvalEligible: true,
    });
    const second = await buildTransportBundle({
      output: join(root, "second.tar.gz"), sourceIdentity, approvalEligible: true,
    });
    assert.equal(first.status, "PASS_FINAL_LINEAGE_CAPTURE_TRANSPORT_BUNDLE");
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, []);
    assert.equal((await stat(first.output)).mode & 0o077, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("one-time request binds packet, production identity, all source evidence, and no services", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-request-test-"));
  try {
    const transport = await buildTransportBundle({
      output: join(root, "packet.tar.gz"), sourceIdentity, approvalEligible: true,
    });
    const execution = JSON.parse(await readFile(EXECUTION_CONTRACT_PATH, "utf8"));
    const now = new Date("2026-07-17T00:00:00.000Z");
    const request = createProductionExecutionRequest({
      manifest: transport.manifest,
      execution,
      bundleSha256: transport.sha256,
      runtime: runtime(),
      now,
      approvalId: "MR-G0-LINEAGE-TEST-001",
      nonce: "11111111-2222-4333-8444-555555555555",
    });
    assert.deepEqual(request.services, []);
    assert.equal(request.executeReadOnlyLineageCapture, true);
    assert.equal(request.autonomyAuthorization.maxExecutions, 1);
    assert.equal(request.autonomyAuthorization.rollbackTarget,
      "none:read-only:no-production-mutation");
    await validateProductionExecutionRequest(
      request, transport.manifest, execution, transport.sha256,
      { now, verifyEvidence: false },
    );

    const tampered = structuredClone(request);
    tampered.captureSpecification.unified.samplesSha256 = hash("f");
    await assert.rejects(
      validateProductionExecutionRequest(
        tampered, transport.manifest, execution, transport.sha256,
        { now, verifyEvidence: false },
      ),
      /authorization_capture_binding_mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current production commit cannot drift from current-cycle evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-request-test-"));
  try {
    const transport = await buildTransportBundle({
      output: join(root, "packet.tar.gz"), sourceIdentity, approvalEligible: true,
    });
    const execution = JSON.parse(await readFile(EXECUTION_CONTRACT_PATH, "utf8"));
    const drifted = runtime();
    drifted.approvedProductionCommit = commit("c");
    assert.throws(() => createProductionExecutionRequest({
      manifest: transport.manifest,
      execution,
      bundleSha256: transport.sha256,
      runtime: drifted,
    }), /runtime_unified_commit_not_current_production/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("admin URL preparation writes a private file without returning credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "lineage-admin-url-test-"));
  try {
    const output = join(root, "database.url");
    const passwordKey = ["POSTGRES", "PASSWORD"].join("_");
    const fixturePassword = ["fixture", "value"].join("-");
    const input = Buffer.from(`POSTGRES_USER=lineage_admin\n${passwordKey}=${fixturePassword}\0lineage_admin\0market_radar`);
    const result = await prepareAdminUrl(input, output);
    assert.deepEqual(result, { status: "pass", secretsPrinted: false });
    assert.equal((await stat(output)).mode & 0o077, 0);
    assert.match(await readFile(output, "utf8"), /^postgresql:\/\/lineage_admin:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
