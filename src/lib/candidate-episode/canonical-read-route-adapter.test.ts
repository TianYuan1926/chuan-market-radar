import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { JournalEvent } from "../analysis/types";
import {
  CandidateCanonicalApiRouteAdapter,
  buildCandidateReadHttpResponse,
  parseCandidateReadRouteRequest,
  type CandidateReadRouteAdapterDependencies,
} from "./canonical-read-route-adapter";
import { buildCandidateCanonicalOracleFromRaw } from "./canonical-read-oracle";
import { buildCandidateCanonicalApiResource } from "./canonical-read-resource";
import type { CandidateTrustedReadContext } from "./canonical-read-trusted-context";

const policy = {
  scope: "production_radar",
  asOf: "2026-07-12T01:00:00.000Z",
  releaseId: "candidate-route-adapter-test",
  checkpointKind: "1h",
  evidenceGradeVersion: "eg.v1",
  observationCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
  dueCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
} as const;

const control = {
  phase: "canonical" as const,
  dualReadRequested: false,
  canonicalReadRequested: true,
  reviewReadRequested: true,
  reconciliationEvidenceStatus:
    "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
  dualReadEvidenceStatus: "PASS_DUAL_READ_OBSERVATION" as const,
  canonicalCompatEvidenceStatus: "PASS_CANONICAL_COMPAT_OBSERVATION" as const,
};

const flags = { dualRead: false, canonicalRead: true, reviewRead: true } as const;
const evidence = {
  reconciliation: {
    status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" as const,
    evidenceHash: `sha256:${"1".repeat(64)}`,
  },
  dualRead: {
    status: "PASS_DUAL_READ_OBSERVATION" as const,
    evidenceHash: `sha256:${"2".repeat(64)}`,
  },
  canonicalCompat: {
    status: "PASS_CANONICAL_COMPAT_OBSERVATION" as const,
    evidenceHash: `sha256:${"3".repeat(64)}`,
  },
};

function fingerprint(approvalDigest: string) {
  const proof = {
    migrationId: "candidate-episode-v1",
    authorityEpoch: 4,
    approvedReleaseId: policy.releaseId,
    approvalDigest,
    phase: "canonical",
    flags,
    evidence,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(proof)).digest("hex")}`;
}

const approvalDigest = `sha256:${"b".repeat(64)}`;

const trustedContext: CandidateTrustedReadContext = {
  schemaVersion: "candidate-trusted-read-context.v1",
  migrationId: "candidate-episode-v1",
  scope: "production_radar",
  databaseNow: policy.asOf,
  authorityEpoch: 4,
  authorityFingerprint: fingerprint(approvalDigest),
  approvedReleaseId: policy.releaseId,
  approvalDigest,
  phase: "canonical",
  flags,
  evidence,
  policy,
  control,
};

const legacyEvent: JournalEvent = {
  id: "legacy-route-adapter-1",
  symbol: "BTCUSDT",
  title: "legacy",
  result: "watching",
  note: "diagnostic only",
  rankDelta: 0,
  createdAt: "2026-07-12T00:05:00.000Z",
  direction: "neutral",
};

function dependencies(overrides: Partial<CandidateReadRouteAdapterDependencies> = {}) {
  const calls = { candidate: 0, compare: 0, legacy: 0, trusted: 0 };
  const value: CandidateReadRouteAdapterDependencies = {
    readTrustedContext: async () => {
      calls.trusted += 1;
      return trustedContext;
    },
    readLegacyEvents: async () => {
      calls.legacy += 1;
      return [legacyEvent];
    },
    readCandidate: async () => {
      calls.candidate += 1;
      throw new Error("current code lock must keep Candidate unread");
    },
    compareCandidateReference: async () => {
      calls.compare += 1;
      throw new Error("current code lock must keep Oracle unread");
    },
    ...overrides,
  };
  return { calls, value };
}

test("public query accepts only bounded limit and a complete cursor pair", () => {
  assert.deepEqual(parseCandidateReadRouteRequest(new URLSearchParams()), {
    status: "valid",
    request: { limit: 100, cursor: null },
  });
  const parsed = parseCandidateReadRouteRequest(new URLSearchParams({
    limit: "25",
    cursorFirstSeenAt: "2026-07-12T00:05:00.000Z",
    cursorEpisodeId: "018f47d6-2c40-7e30-8a20-000000000101",
  }));
  assert.equal(parsed.status, "valid");
  if (parsed.status !== "valid") return;
  assert.equal(parsed.request.limit, 25);
  assert.equal(parsed.request.cursor?.firstSeenAt, "2026-07-12T00:05:00.000Z");

  const forbidden = parseCandidateReadRouteRequest(new URLSearchParams({
    phase: "canonical",
    releaseId: "request-controlled-release",
  }));
  assert.equal(forbidden.status, "invalid");
  if (forbidden.status !== "invalid") return;
  assert.ok(forbidden.blockers.includes("candidate_read_query_unknown:phase"));
  assert.ok(forbidden.blockers.includes("candidate_read_query_unknown:releaseId"));
});

test("invalid query returns 400 before trusted control or any data read", async () => {
  const fixture = dependencies({
    readTrustedContext: async () => {
      fixture.calls.trusted += 1;
      return trustedContext;
    },
  });
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value)
    .execute(new URLSearchParams("limit=1001&phase=canonical"));
  assert.equal(response.statusCode, 400);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body.ok, false);
  assert.deepEqual(fixture.calls, { candidate: 0, compare: 0, legacy: 0, trusted: 0 });
});

test("current code lock forces lazy Legacy diagnostic despite canonical trusted control", async () => {
  let maximumEvents = 0;
  const fixture = dependencies({
    readLegacyEvents: async (input) => {
      fixture.calls.legacy += 1;
      maximumEvents = input.maximumEvents;
      return [legacyEvent, { ...legacyEvent, id: "legacy-route-adapter-2" }];
    },
  });
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value)
    .execute(new URLSearchParams({ limit: "1" }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-chuan-read-source"], "legacy");
  assert.equal(response.headers["x-chuan-authority"], "legacy_projection_non_authoritative");
  assert.equal(response.body.ok, true);
  if (!response.body.ok) return;
  assert.equal(response.body.resource.mode, "legacy_only");
  assert.equal(response.body.resource.data.legacyDiagnostic?.observations?.length, 1);
  assert.ok(response.body.resource.blockers.includes("canonical_read_not_authorized_in_code"));
  assert.equal(maximumEvents, 1);
  assert.deepEqual(fixture.calls, { candidate: 0, compare: 0, legacy: 1, trusted: 2 });
});

test("cursor on Legacy response is explicit noncanonical diagnostic behavior", async () => {
  const fixture = dependencies();
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value).execute(
    new URLSearchParams({
      cursorFirstSeenAt: "2026-07-12T00:05:00.000Z",
      cursorEpisodeId: "018f47d6-2c40-7e30-8a20-000000000101",
    }),
  );
  assert.equal(response.body.ok, true);
  if (!response.body.ok) return;
  assert.ok(response.body.resource.blockers.includes("legacy_diagnostic_cursor_noncanonical"));
  assert.equal(response.body.resource.candidateCanonicalReviewUsable, false);
});

test("invalid trusted context returns 503 without touching data dependencies", async () => {
  const invalidPolicy = dependencies({
    readTrustedContext: async () => {
      invalidPolicy.calls.trusted += 1;
      return { ...trustedContext, policy: { ...policy, releaseId: "" } };
    },
  });
  const policyResponse = await new CandidateCanonicalApiRouteAdapter(invalidPolicy.value)
    .execute(new URLSearchParams());
  assert.equal(policyResponse.statusCode, 503);
  assert.equal(policyResponse.body.ok, false);
  assert.deepEqual(invalidPolicy.calls, { candidate: 0, compare: 0, legacy: 0, trusted: 1 });

  const invalidControl = dependencies({
    readTrustedContext: async () => {
      invalidControl.calls.trusted += 1;
      return { ...trustedContext, control: { ...control, phase: "request_phase" as never } };
    },
  });
  const controlResponse = await new CandidateCanonicalApiRouteAdapter(invalidControl.value)
    .execute(new URLSearchParams());
  assert.equal(controlResponse.statusCode, 503);
  assert.equal(controlResponse.body.ok, false);
  assert.deepEqual(invalidControl.calls, { candidate: 0, compare: 0, legacy: 0, trusted: 1 });
});

test("hanging trusted control is bounded and returns 503 without data reads", async () => {
  let aborted = false;
  const fixture = dependencies({
    readTrustedContext: ({ signal }) => new Promise((_, reject) => {
      fixture.calls.trusted += 1;
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    }),
  });
  const startedAt = Date.now();
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value)
    .execute(new URLSearchParams());
  const elapsed = Date.now() - startedAt;
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.ok(elapsed >= 1_900 && elapsed < 6_000, `unexpected timeout elapsed=${elapsed}`);
  assert.equal(aborted, true);
  assert.deepEqual(fixture.calls, { candidate: 0, compare: 0, legacy: 0, trusted: 1 });
});

test("authority fingerprint drift during data read returns 503 and discards the result", async () => {
  const changedApprovalDigest = `sha256:${"c".repeat(64)}`;
  const fixture = dependencies({
    readTrustedContext: async () => {
      fixture.calls.trusted += 1;
      return fixture.calls.trusted === 1
        ? trustedContext
        : {
            ...trustedContext,
            approvalDigest: changedApprovalDigest,
            authorityFingerprint: fingerprint(changedApprovalDigest),
          };
    },
  });
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value)
    .execute(new URLSearchParams());
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  if (response.body.ok) return;
  assert.ok(response.body.blockers.includes("candidate_read_authority_changed_during_read"));
  assert.deepEqual(fixture.calls, { candidate: 0, compare: 0, legacy: 1, trusted: 2 });
});

test("dependency failure returns 503 without stale or empty fallback", async () => {
  const fixture = dependencies({
    readLegacyEvents: async () => {
      fixture.calls.legacy += 1;
      throw new Error("legacy unavailable");
    },
  });
  const response = await new CandidateCanonicalApiRouteAdapter(fixture.value)
    .execute(new URLSearchParams());
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["x-chuan-data-status"], "unavailable");
  assert.equal(response.body.ok, false);
  if (response.body.ok) return;
  assert.equal(response.body.error, "candidate_read_dependency_unavailable");
  assert.equal(response.body.resource, null);
});

test("HTTP mapper keeps partial visible and unavailable non-200", () => {
  const ready = buildCandidateCanonicalOracleFromRaw({
    policy,
    raw: { databaseNow: policy.asOf, episodes: [], checkpoints: [], outcomes: [] },
  });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const partialResource = buildCandidateCanonicalApiResource({
    mode: "canonical_authority",
    source: "candidate",
    result: { ...ready, status: "partial", blockers: ["review_invariant_failed"] },
    parity: null,
  });
  const partialResponse = buildCandidateReadHttpResponse(partialResource);
  assert.equal(partialResponse.statusCode, 200);
  assert.equal(partialResponse.headers["x-chuan-data-status"], "partial");

  const unavailableResource = buildCandidateCanonicalApiResource({
    mode: "canonical_authority",
    source: "candidate",
    result: {
      schemaVersion: "candidate-canonical-read.v1",
      status: "unavailable",
      authority: "candidate_authority",
      allowedUse: "candidate_lifecycle_and_review_only",
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      policy: null,
      reason: "candidate_database_read_failed",
      databaseNow: null,
      episodes: null,
      page: null,
      review: null,
      contentHash: null,
    },
    parity: null,
  });
  const unavailableResponse = buildCandidateReadHttpResponse(unavailableResource);
  assert.equal(unavailableResponse.statusCode, 503);
  assert.equal(unavailableResponse.body.ok, false);
  assert.equal(unavailableResponse.headers["cache-control"], "no-store");
});
