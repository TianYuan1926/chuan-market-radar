import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseRecord, validateReleaseSchemaDocument } from "./release-record-check.mjs";

const now = new Date("2026-07-17T00:00:00Z");

function fixture() {
  return {
    schemaVersion: "market-radar-release-record.v1",
    status: "pass",
    releaseId: "market-radar-20260716-a1",
    generatedAt: "2026-07-16T23:00:00Z",
    validUntil: "2026-07-17T12:00:00Z",
    environment: "production",
    source: {
      branch: "main",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      remoteCommit: "a".repeat(40),
      worktreeClean: true,
    },
    runtime: {
      gitCommit: "a".repeat(40),
      imageDigests: { web: `sha256:${"c".repeat(64)}`, "scanner-worker": `sha256:${"d".repeat(64)}` },
      composeSha256: "e".repeat(64),
      envFingerprintSha256: "f".repeat(64),
      contentSha256: "1".repeat(64),
    },
    database: { migrationStatus: "applied_verified", migrationIds: ["001", "009"] },
    evidence: {
      status: "pass",
      generatedAt: "2026-07-16T23:00:00Z",
      expiresAt: "2026-07-17T12:00:00Z",
      artifactSha256: "2".repeat(64),
    },
    health: {
      status: "pass",
      checkedAt: "2026-07-16T23:30:00Z",
      artifactSha256: "3".repeat(64),
    },
    rollback: {
      commit: "4".repeat(40),
      imageDigests: { web: `sha256:${"5".repeat(64)}` },
      tested: true,
      databaseRollbackAuthorized: false,
    },
    alignment: {
      git: true,
      images: true,
      compose: true,
      environment: true,
      content: true,
      migrations: true,
      evidence: true,
      health: true,
      rollback: true,
    },
  };
}

test("release schema and standard are machine locked but production remains blocked", () => {
  const result = validateReleaseSchemaDocument();
  assert.equal(result.status, "pass");
  assert.equal(result.productionMutationAllowed, false);
  assert.match(result.productionDecision, /BLOCKED_UNTIL_CURRENT_PRODUCTION/);
});

test("release record requires one aligned Git image content evidence and rollback truth", () => {
  assert.equal(validateReleaseRecord(fixture(), now).status, "pass");
  const mutations = [
    (value) => { value.source.worktreeClean = false; },
    (value) => { value.source.remoteCommit = "9".repeat(40); },
    (value) => { value.runtime.gitCommit = "8".repeat(40); },
    (value) => { value.runtime.imageDigests.web = "latest"; },
    (value) => { value.evidence.expiresAt = "2026-07-16T23:59:00Z"; },
    (value) => { value.health.status = "fail"; },
    (value) => { value.rollback.tested = false; },
    (value) => { value.alignment.content = false; },
    (value) => { value.source.branch = "release"; },
    (value) => { value.password = "not-allowed"; },
  ];
  for (const mutate of mutations) {
    const record = fixture();
    mutate(record);
    assert.equal(validateReleaseRecord(record, now).status, "fail");
  }
});

test("runtime health cannot substitute for stale release evidence", () => {
  const record = fixture();
  record.generatedAt = "2026-07-15T00:00:00Z";
  record.validUntil = "2026-07-18T00:00:00Z";
  assert.equal(record.health.status, "pass");
  assert.match(validateReleaseRecord(record, now).violations.join("\n"), /record_window_invalid/);
});
