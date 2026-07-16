import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateCanonicalApiResource,
  type CandidateCanonicalApiResource,
} from "./canonical-read-resource";
import {
  buildCandidateCanonicalOracleFromRaw,
  type CandidateCanonicalOracleRaw,
} from "./canonical-read-oracle";
import { compareCandidateCanonicalReferenceReads } from "./canonical-read-model";
import { buildLegacyCandidateDiagnosticRead } from "./legacy-read-diagnostic";

const policy = {
  scope: "production_radar",
  asOf: "2026-07-12T01:00:00.000Z",
  releaseId: "candidate-resource-test",
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

const episode = {
  schema_version: "candidate-episode.v1",
  scope: "production_radar",
  episode_id: "018f47d6-2c40-7e30-8a20-000000000101",
  canonical_instrument_id: "BINANCE:BTCUSDT:PERP",
  venue_context: { venue: "BINANCE" },
  first_seen_at: "2026-07-12T00:05:00.000Z",
  last_seen_at: "2026-07-12T00:10:00.000Z",
  observation_price: null,
  observation_price_fact_id: null,
  discovery_reasons: ["light_scan_candidate"],
  priority_tier: "A",
  lifecycle: "discovered" as const,
  maturity: "light_candidate" as const,
  direction_state: "unknown" as const,
  expires_at: null,
  closed_at: null,
  closed_reason: null,
  parent_episode_id: null,
  release_id: policy.releaseId,
  source_scan_cycle_id: "scan-resource-1",
  row_version: "1",
};

const raw: CandidateCanonicalOracleRaw = {
  databaseNow: policy.asOf,
  episodes: [episode],
  checkpoints: [],
  outcomes: [],
};

function candidateReady() {
  const candidate = buildCandidateCanonicalOracleFromRaw({ policy, raw });
  assert.equal(candidate.status, "ready");
  return candidate;
}

function legacy(events: Parameters<typeof buildLegacyCandidateDiagnosticRead>[0]["events"] = []) {
  return buildLegacyCandidateDiagnosticRead({ events, policy });
}

function assertNoAuthority(resource: CandidateCanonicalApiResource) {
  assert.equal(resource.canAuthorizeCutover, false);
  assert.equal(resource.canCreateTradePlan, false);
  assert.equal(resource.canMutateLiveRanking, false);
  assert.equal(resource.automaticPhaseAdvance, false);
}

test("legacy-only resource stays diagnostic and empty never becomes canonical ready", () => {
  const result = buildCandidateCanonicalApiResource({
    mode: "legacy_only",
    source: "legacy",
    result: legacy(),
    parity: null,
  });
  assert.equal(result.status, "empty");
  assert.equal(result.authority, "legacy_projection_non_authoritative");
  assert.equal(result.candidateCanonicalReviewUsable, false);
  assert.equal(result.data.candidateCanonical, null);
  assert.equal(result.data.legacyDiagnostic?.canProveCanonicalParity, false);
  assert.ok(result.blockers.includes("legacy_projection_non_authoritative"));
  assertNoAuthority(result);
});

test("dual-read response can report parity but still returns only Legacy diagnostic authority", () => {
  const candidate = candidateReady();
  const parity = compareCandidateCanonicalReferenceReads(candidate, structuredClone(candidate));
  const result = buildCandidateCanonicalApiResource({
    mode: "dual_read_legacy_authority",
    source: "legacy",
    result: legacy([{
      id: "legacy-resource-1",
      symbol: "BTCUSDT",
      title: "legacy",
      result: "watching",
      note: "diagnostic",
      rankDelta: 0,
      createdAt: "2026-07-12T00:05:00.000Z",
      direction: "neutral",
    }]),
    parity,
  });
  assert.equal(result.status, "diagnostic_only");
  assert.equal(result.readSource, "legacy");
  assert.equal(result.parity?.status, "pass");
  assert.equal(result.data.candidateCanonical, null);
  assert.equal(result.candidateCanonicalReviewUsable, false);
  assertNoAuthority(result);
});

test("canonical compat exposes Candidate only for a ready zero-difference reference", () => {
  const candidate = candidateReady();
  const parity = compareCandidateCanonicalReferenceReads(candidate, structuredClone(candidate));
  const result = buildCandidateCanonicalApiResource({
    mode: "canonical_compat_candidate",
    source: "candidate",
    result: candidate,
    parity,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.authority, "candidate_authority");
  assert.equal(result.candidateCanonicalReviewUsable, true);
  assert.equal(result.data.candidateCanonical?.status, "ready");
  assert.equal(result.data.candidateCanonical?.episodes[0]?.directionState, "unknown");
  assert.equal(result.data.candidateCanonical?.episodes[0]?.observationPrice, null);
  assert.equal(result.data.legacyDiagnostic, null);
  assertNoAuthority(result);
});

test("canonical compat fallback is explicit and cannot carry Candidate data", () => {
  const result = buildCandidateCanonicalApiResource({
    mode: "canonical_compat_candidate",
    source: "legacy_fallback",
    result: legacy(),
    parity: {
      status: "fail",
      differenceCount: 1,
      differences: ["review.counts.totalEpisodes"],
      comparisonHash: "sha256:parity-drift",
    },
  });
  assert.equal(result.readSource, "legacy_fallback");
  assert.equal(result.authority, "legacy_projection_non_authoritative");
  assert.equal(result.data.candidateCanonical, null);
  assert.ok(result.blockers.includes("candidate_reference_parity_not_pass"));
  assertNoAuthority(result);
});

test("canonical authority preserves partial and unavailable without Legacy fallback", () => {
  const ready = candidateReady();
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const partial = {
    ...ready,
    status: "partial" as const,
    blockers: ["candidate_review_invariant_failed:terminalOutcomePartitionReconciles"],
  };
  const partialResource = buildCandidateCanonicalApiResource({
    mode: "canonical_authority",
    source: "candidate",
    result: partial,
    parity: null,
  });
  assert.equal(partialResource.status, "partial");
  assert.equal(partialResource.candidateCanonicalReviewUsable, false);
  assert.equal(partialResource.data.legacyDiagnostic, null);

  const unavailable = {
    schemaVersion: "candidate-canonical-read.v1" as const,
    status: "unavailable" as const,
    authority: "candidate_authority" as const,
    allowedUse: "candidate_lifecycle_and_review_only" as const,
    canCreateTradePlan: false as const,
    canMutateLiveRanking: false as const,
    policy: null,
    reason: "candidate_database_read_failed" as const,
    databaseNow: null,
    episodes: null,
    page: null,
    review: null,
    contentHash: null,
  };
  const unavailableResource = buildCandidateCanonicalApiResource({
    mode: "canonical_authority",
    source: "candidate",
    result: unavailable,
    parity: null,
  });
  assert.equal(unavailableResource.status, "unavailable");
  assert.equal(unavailableResource.readSource, "candidate");
  assert.deepEqual(unavailableResource.blockers, ["candidate_database_read_failed"]);
  assert.equal(unavailableResource.data.legacyDiagnostic, null);
  assertNoAuthority(unavailableResource);
});

test("illegal source result or parity combinations fail closed deterministically", () => {
  const candidate = candidateReady();
  const invalid = buildCandidateCanonicalApiResource({
    mode: "canonical_compat_candidate",
    source: "candidate",
    result: candidate,
    parity: {
      status: "fail",
      differenceCount: 1,
      differences: ["policy.releaseId"],
      comparisonHash: "sha256:not-pass",
    },
    routeBlockers: ["route_evidence_missing"],
  });
  const repeated = buildCandidateCanonicalApiResource({
    mode: "canonical_compat_candidate",
    source: "candidate",
    result: candidate,
    parity: {
      status: "fail",
      differenceCount: 1,
      differences: ["policy.releaseId"],
      comparisonHash: "sha256:not-pass",
    },
    routeBlockers: ["route_evidence_missing"],
  });
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.readSource, "none");
  assert.equal(invalid.authority, "resource_contract_unavailable");
  assert.equal(invalid.data.candidateCanonical, null);
  assert.equal(invalid.data.legacyDiagnostic, null);
  assert.ok(invalid.blockers.includes("candidate_read_resource_contract_invalid"));
  assert.equal(invalid.contentHash, repeated.contentHash);
  assertNoAuthority(invalid);

  const forgedParity = buildCandidateCanonicalApiResource({
    mode: "canonical_compat_candidate",
    source: "candidate",
    result: candidate,
    parity: {
      status: "pass",
      differenceCount: 0,
      differences: [],
      comparisonHash: "not-a-proof-hash",
    },
  });
  assert.equal(forgedParity.status, "unavailable");
  assert.equal(forgedParity.authority, "resource_contract_unavailable");

  const inflatedLegacy = {
    ...legacy(),
    canProveCanonicalParity: true,
  } as unknown as ReturnType<typeof buildLegacyCandidateDiagnosticRead>;
  const forgedLegacy = buildCandidateCanonicalApiResource({
    mode: "legacy_only",
    source: "legacy",
    result: inflatedLegacy,
    parity: null,
  });
  assert.equal(forgedLegacy.status, "unavailable");
  assert.equal(forgedLegacy.data.legacyDiagnostic, null);
});
