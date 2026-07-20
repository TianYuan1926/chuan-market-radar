import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type {
  CandidateEpisode,
  DiscoveryCandidate,
  OpportunityThesis,
} from "../../domain/contracts";
import {
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_PATTERNS,
} from "../../domain/product-constitution";
import {
  CandidateEpisodeSchema,
  DiscoveryCandidateSchema,
  OpportunityThesisSchema,
} from "../../runtime-schema/decision-schemas";
import {
  buildM2CandidateEpisodeKey,
  buildM2DiscoveryFunnelReport,
  classifyM2CandidateRelationship,
  M2_DETECTOR_INPUT_VERSION,
  M2_OPPORTUNITY_FAMILY_DEFINITIONS,
  M2DetectorReadInputSchema,
  validateM2CandidateAgainstDetectorInput,
  validateM2CandidateBundle,
} from "./discovery-contract";

const RELEASE_ID = "m2-contract-release";
const WINDOW_START = "2026-01-15T00:00:00.000Z";
const FIRST_CUTOFF = "2026-01-15T00:00:05.000Z";
const FIRST_DETECTED = "2026-01-15T00:00:10.000Z";
const SECOND_CUTOFF = "2026-01-15T00:00:06.000Z";
const SECOND_DETECTED = "2026-01-15T00:00:12.000Z";
const GENERATED = "2026-01-15T00:00:20.000Z";
const WINDOW_END = "2026-01-15T00:15:00.000Z";
const INSTRUMENT_ID = "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT";
const GROUP_ID = "BTC:USDT_LINEAR_PERPETUAL";

const freshQuality = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const;

const uncertainty = {
  data: {
    dimension: "data",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "m2-contract-calibration.v1",
    lastValidatedAt: GENERATED,
  },
  model: {
    dimension: "model",
    status: "MEDIUM",
    reasonCodes: ["detector_shadow_only"],
    sampleSize: 100,
    calibrationVersion: "m2-contract-calibration.v1",
    lastValidatedAt: GENERATED,
  },
  market: {
    dimension: "market",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "m2-contract-calibration.v1",
    lastValidatedAt: GENERATED,
  },
  execution: {
    dimension: "execution",
    status: "UNKNOWN",
    reasonCodes: ["execution_not_evaluated_at_discovery"],
    sampleSize: null,
    calibrationVersion: null,
    lastValidatedAt: null,
  },
} as const;

function detectorInput(cutoff = FIRST_CUTOFF) {
  return {
    schemaVersion: M2_DETECTOR_INPUT_VERSION,
    readAuthority: "POINT_IN_TIME_REFERENCES_ONLY",
    releaseId: RELEASE_ID,
    canonicalInstrumentId: INSTRUMENT_ID,
    underlyingGroupId: GROUP_ID,
    eventCutoff: cutoff,
    knowledgeCutoff: cutoff,
    universe: {
      artifactId: "universe-m2-contract",
      releaseId: RELEASE_ID,
      sourceCutoff: WINDOW_START,
      availableAt: cutoff,
      eligible: true,
    },
    featureSet: {
      artifactId: "feature-set-m2-contract",
      releaseId: RELEASE_ID,
      sourceCutoff: cutoff,
      availableAt: cutoff,
      featureIds: ["compression-15m", "volume-expansion-5m"],
    },
    featureQuality: {
      artifactId: "feature-quality-m2-contract",
      releaseId: RELEASE_ID,
      sourceCutoff: cutoff,
      availableAt: cutoff,
    },
    marketContext: {
      artifactId: "context-m2-contract",
      releaseId: RELEASE_ID,
      sourceCutoff: cutoff,
      availableAt: cutoff,
    },
    observedPrice: {
      artifactId: "price-fact-m2-contract",
      releaseId: RELEASE_ID,
      sourceCutoff: cutoff,
      availableAt: cutoff,
      value: "100",
    },
    inputQuality: freshQuality,
  } as const;
}

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return DiscoveryCandidateSchema.parse({
    schemaVersion: "discovery-candidate.v2",
    releaseId: RELEASE_ID,
    producerModule: "multi_opportunity_detection",
    generatedAt: "2026-01-15T00:00:11.000Z",
    sourceCutoff: FIRST_CUTOFF,
    contentHash: "sha256:m2-candidate-one",
    candidateId: "candidate-m2-one",
    canonicalInstrumentId: INSTRUMENT_ID,
    underlyingGroupId: GROUP_ID,
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_COMPRESSION",
    directionHypothesis: "LONG",
    detectorId: "pre-move-compression-long",
    detectorVersion: "pre-move-compression-long.v1",
    detectorLifecycle: "SHADOW",
    emissionScope: "SHADOW",
    firstDetectedAt: FIRST_DETECTED,
    observedPrice: "100",
    observedPriceFactId: "price-fact-m2-contract",
    expiresAt: "2026-01-15T00:05:00.000Z",
    inputLineage: {
      universeSnapshotId: "universe-m2-contract",
      universeSourceCutoff: WINDOW_START,
      universeAvailableAt: FIRST_CUTOFF,
      featureSetSnapshotId: "feature-set-m2-contract",
      featureQualitySnapshotId: "feature-quality-m2-contract",
      featureSourceCutoff: FIRST_CUTOFF,
      featureAvailableAt: FIRST_CUTOFF,
      featureQualitySourceCutoff: FIRST_CUTOFF,
      featureQualityAvailableAt: FIRST_CUTOFF,
      marketContextSnapshotId: "context-m2-contract",
      contextSourceCutoff: FIRST_CUTOFF,
      contextAvailableAt: FIRST_CUTOFF,
      observedPriceSourceCutoff: FIRST_CUTOFF,
      observedPriceAvailableAt: FIRST_CUTOFF,
      knowledgeCutoff: FIRST_CUTOFF,
      featureIds: ["compression-15m", "volume-expansion-5m"],
    },
    inputQuality: freshQuality,
    reasonCodes: ["compression_before_expansion"],
    counterHints: ["direction_confirmation_pending"],
    priority: "P1",
    priorityBasis: {
      policyVersion: "m2-candidate-priority.v1",
      urgency: "SOON",
      potentialValue: "HIGH",
      expiryRisk: "MEDIUM",
      resourceCost: "LOW",
      reasonCodes: ["pre_move_window_is_time_sensitive"],
    },
    ...overrides,
  });
}

function secondCandidate(): DiscoveryCandidate {
  return candidate({
    generatedAt: "2026-01-15T00:00:13.000Z",
    sourceCutoff: SECOND_CUTOFF,
    contentHash: "sha256:m2-candidate-two",
    candidateId: "candidate-m2-two",
    opportunityPattern: "PRE_MOVE_FLOW_DIVERGENCE",
    detectorId: "pre-move-flow-long",
    detectorVersion: "pre-move-flow-long.v1",
    firstDetectedAt: SECOND_DETECTED,
    expiresAt: "2026-01-15T00:06:00.000Z",
    inputLineage: {
      universeSnapshotId: "universe-m2-contract",
      universeSourceCutoff: WINDOW_START,
      universeAvailableAt: SECOND_CUTOFF,
      featureSetSnapshotId: "feature-set-m2-contract-two",
      featureQualitySnapshotId: "feature-quality-m2-contract-two",
      featureSourceCutoff: SECOND_CUTOFF,
      featureAvailableAt: SECOND_CUTOFF,
      featureQualitySourceCutoff: SECOND_CUTOFF,
      featureQualityAvailableAt: SECOND_CUTOFF,
      marketContextSnapshotId: "context-m2-contract-two",
      contextSourceCutoff: SECOND_CUTOFF,
      contextAvailableAt: SECOND_CUTOFF,
      observedPriceSourceCutoff: SECOND_CUTOFF,
      observedPriceAvailableAt: SECOND_CUTOFF,
      knowledgeCutoff: SECOND_CUTOFF,
      featureIds: ["aggressive-buy-flow-5m", "price-response-5m"],
    },
    reasonCodes: ["flow_leads_price"],
    priority: "P0",
    priorityBasis: {
      policyVersion: "m2-candidate-priority.v1",
      urgency: "IMMEDIATE",
      potentialValue: "HIGH",
      expiryRisk: "HIGH",
      resourceCost: "MEDIUM",
      reasonCodes: ["flow_divergence_is_expiring"],
    },
  });
}

function episode(candidates: readonly DiscoveryCandidate[]): CandidateEpisode {
  return CandidateEpisodeSchema.parse({
    schemaVersion: "candidate-episode.v2",
    releaseId: RELEASE_ID,
    producerModule: "candidate_lifecycle_opportunity_thesis",
    generatedAt: GENERATED,
    sourceCutoff: SECOND_CUTOFF,
    contentHash: "sha256:m2-episode",
    episodeId: "episode-m2-one",
    episodeKey: buildM2CandidateEpisodeKey({
      canonicalInstrumentId: INSTRUMENT_ID,
      opportunityFamily: "PRE_MOVE",
      directionHypothesis: "LONG",
      episodeWindowPolicyVersion: "m2-episode-window.v1",
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    }),
    canonicalInstrumentId: INSTRUMENT_ID,
    underlyingGroupId: GROUP_ID,
    opportunityFamily: "PRE_MOVE",
    opportunityPatterns: candidates.map((item) => item.opportunityPattern),
    directionHypothesis: "LONG",
    episodeWindow: {
      policyVersion: "m2-episode-window.v1",
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    },
    lifecycle: "DISCOVERED",
    previousLifecycle: null,
    transitionKind: "CREATED",
    priority: "P0",
    priorityPolicyVersion: "m2-candidate-priority.v1",
    thesisId: "thesis-m2-one",
    candidateIds: candidates.map((item) => item.candidateId),
    firstSeenAt: FIRST_DETECTED,
    lastSeenAt: SECOND_DETECTED,
    expiresAt: WINDOW_END,
    transitionedAt: GENERATED,
    transitionReasonCodes: ["first_candidate_episode_created"],
    rowVersion: 1,
    idempotencyKey: "m2-episode:create:episode-m2-one:1",
    outboxEventId: "m2-outbox:episode-m2-one:1",
  });
}

function thesis(candidates: readonly DiscoveryCandidate[]): OpportunityThesis {
  return OpportunityThesisSchema.parse({
    schemaVersion: "opportunity-thesis.v2",
    releaseId: RELEASE_ID,
    producerModule: "candidate_lifecycle_opportunity_thesis",
    generatedAt: GENERATED,
    sourceCutoff: SECOND_CUTOFF,
    contentHash: "sha256:m2-thesis",
    thesisId: "thesis-m2-one",
    episodeId: "episode-m2-one",
    thesisVersion: 1,
    thesisAuthority: "VALIDATION_HYPOTHESIS_ONLY",
    canonicalInstrumentId: INSTRUMENT_ID,
    underlyingGroupId: GROUP_ID,
    opportunityFamily: "PRE_MOVE",
    opportunityPatterns: candidates.map((item) => item.opportunityPattern),
    directionHypothesis: "LONG",
    detectorSources: candidates.map((item) => ({
      candidateId: item.candidateId,
      detectorId: item.detectorId,
      detectorVersion: item.detectorVersion,
      detectorLifecycle: item.detectorLifecycle,
      emissionScope: item.emissionScope,
      opportunityPattern: item.opportunityPattern,
      firstDetectedAt: item.firstDetectedAt,
      candidateSourceCutoff: item.sourceCutoff,
    })),
    firstDetectedAt: FIRST_DETECTED,
    updatedAt: GENERATED,
    supportingReasons: candidates.flatMap((item) => item.reasonCodes),
    conflictingReasons: ["direction_confirmation_pending"],
    knownUnknowns: ["deep_derivatives_validation_not_run"],
    uncertainty,
  });
}

test("freezes exactly six disjoint family taxonomies without collapsing patterns", () => {
  assert.deepEqual(
    M2_OPPORTUNITY_FAMILY_DEFINITIONS.map((definition) => definition.family),
    OPPORTUNITY_FAMILIES,
  );
  const patterns = M2_OPPORTUNITY_FAMILY_DEFINITIONS.flatMap(
    (definition) => definition.patterns,
  );
  assert.deepEqual([...patterns].sort(), [...OPPORTUNITY_PATTERNS].sort());
  assert.equal(new Set(patterns).size, patterns.length);
  assert.deepEqual(
    M2_OPPORTUNITY_FAMILY_DEFINITIONS.find(
      (definition) => definition.family === "REVERSAL_RANGE",
    )?.patterns,
    ["KEY_LEVEL_REVERSAL", "RANGE_EDGE"],
  );
});

test("accepts only same-release point-in-time detector references", () => {
  assert.equal(M2DetectorReadInputSchema.parse(detectorInput()).readAuthority,
    "POINT_IN_TIME_REFERENCES_ONLY");

  assert.equal(M2DetectorReadInputSchema.safeParse({
    ...detectorInput(),
    marketContext: {
      ...detectorInput().marketContext,
      sourceCutoff: "2026-01-15T00:00:06.000Z",
    },
  }).success, false);
  assert.equal(M2DetectorReadInputSchema.safeParse({
    ...detectorInput(),
    marketContext: {
      ...detectorInput().marketContext,
      availableAt: "2026-01-15T00:00:06.000Z",
    },
  }).success, false);
  assert.equal(M2DetectorReadInputSchema.safeParse({
    ...detectorInput(),
    observedPrice: {
      ...detectorInput().observedPrice,
      releaseId: "another-release",
    },
  }).success, false);
  assert.equal(M2DetectorReadInputSchema.safeParse({
    ...detectorInput(),
    inputQuality: {
      status: "STALE",
      ageMs: 60_000,
      reasonCodes: ["stale_input"],
    },
  }).success, false);
});

test("candidate schema blocks lifecycle escalation, family drift and decision fields", () => {
  const valid = candidate();
  assert.equal(valid.schemaVersion, "discovery-candidate.v2");
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    detectorLifecycle: "REPLAY_VALIDATED",
    emissionScope: "PRODUCTION",
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    detectorLifecycle: "SUSPENDED",
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    opportunityPattern: "RANGE_EDGE",
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    directionHypothesis: "NEUTRAL",
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "BREAKOUT_EDGE",
    directionHypothesis: "UNKNOWN",
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    generatedAt: valid.expiresAt,
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    inputLineage: {
      ...valid.inputLineage,
      featureAvailableAt: "2026-01-15T00:00:06.000Z",
    },
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    reasonCodes: [valid.reasonCodes[0], valid.reasonCodes[0]],
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    counterHints: [valid.reasonCodes[0]],
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    priorityBasis: {
      ...valid.priorityBasis,
      reasonCodes: ["expires_soon", "expires_soon"],
    },
  }).success, false);
  assert.equal(DiscoveryCandidateSchema.safeParse({
    ...valid,
    evidenceGrade: "A",
    setupGrade: "PREMIUM",
    actionState: "TRADE_PLAN_READY",
    entry: "100",
  }).success, false);
});

test("binds every candidate field to the exact detector input lineage", () => {
  const validCandidate = candidate();
  const input = M2DetectorReadInputSchema.parse(detectorInput());
  assert.deepEqual(validateM2CandidateAgainstDetectorInput(
    validCandidate,
    input,
  ), {
    schemaVersion: "v2-m2-discovery-contract.v1",
    status: "PASS",
    candidateId: validCandidate.candidateId,
    reasonCodes: [],
  });

  const wrongFeatureSet = DiscoveryCandidateSchema.parse({
    ...validCandidate,
    inputLineage: {
      ...validCandidate.inputLineage,
      featureSetSnapshotId: "another-feature-set",
    },
  });
  assert.ok(validateM2CandidateAgainstDetectorInput(
    wrongFeatureSet,
    input,
  ).reasonCodes.includes("candidate_detector_input_artifact_lineage_mismatch"));

  const wrongPrice = DiscoveryCandidateSchema.parse({
    ...validCandidate,
    observedPrice: "101",
  });
  assert.ok(validateM2CandidateAgainstDetectorInput(
    wrongPrice,
    input,
  ).reasonCodes.includes("candidate_detector_input_observed_price_mismatch"));
});

test("episode schema permits append-only active revisions and rejects lifecycle jumps", () => {
  const created = episode([candidate(), secondCandidate()]);
  const queued = {
    ...created,
    contentHash: "sha256:m2-episode-queued",
    lifecycle: "QUEUED",
    previousLifecycle: "DISCOVERED",
    transitionKind: "STATE_TRANSITION",
    transitionReasonCodes: ["deep_validation_quota_reserved"],
    rowVersion: 2,
    idempotencyKey: "m2-episode:transition:episode-m2-one:2",
    outboxEventId: "m2-outbox:episode-m2-one:2",
  } as const;
  assert.equal(CandidateEpisodeSchema.safeParse(queued).success, true);
  assert.equal(CandidateEpisodeSchema.safeParse({
    ...queued,
    lifecycle: "EVIDENCE_READY",
  }).success, false);
  assert.equal(CandidateEpisodeSchema.safeParse({
    ...queued,
    lifecycle: "DISCOVERED",
    previousLifecycle: "DISCOVERED",
    transitionKind: "CANDIDATE_MERGE",
  }).success, true);
  assert.equal(CandidateEpisodeSchema.safeParse({
    ...queued,
    lifecycle: "PROMOTED",
    previousLifecycle: "PROMOTED",
    transitionKind: "PRIORITY_CHANGE",
  }).success, false);
  assert.equal(CandidateEpisodeSchema.safeParse({
    ...queued,
    transitionReasonCodes: ["quota_reserved", "quota_reserved"],
  }).success, false);
});

test("thesis stays a source-complete hypothesis rather than direction truth", () => {
  const candidates = [candidate(), secondCandidate()];
  const valid = thesis(candidates);
  assert.equal(valid.thesisAuthority, "VALIDATION_HYPOTHESIS_ONLY");
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    thesisAuthority: "DIRECTION_TRUTH",
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    opportunityPatterns: [
      ...valid.opportunityPatterns,
      "PRE_MOVE_LIQUIDITY_SHIFT",
    ],
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    detectorSources: [
      ...valid.detectorSources,
      { ...valid.detectorSources[0]!, candidateId: "candidate-m2-three" },
    ],
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    conflictingReasons: [valid.supportingReasons[0]],
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    knownUnknowns: [valid.supportingReasons[0]],
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    detectorSources: valid.detectorSources.map((source, index) => index === 0
      ? { ...source, detectorLifecycle: "SUSPENDED" }
      : source),
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    detectorSources: valid.detectorSources.map((source, index) => index === 0
      ? { ...source, detectorLifecycle: "REPLAY_VALIDATED" }
      : source),
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    sourceCutoff: "2026-01-15T00:00:11.000Z",
    detectorSources: valid.detectorSources.map((source, index) => index === 0
      ? { ...source, candidateSourceCutoff: "2026-01-15T00:00:10.001Z" }
      : source),
  }).success, false);
  assert.equal(OpportunityThesisSchema.safeParse({
    ...valid,
    actionState: "TRADE_PLAN_READY",
  }).success, false);
});

test("dedupes only exact instrument family direction and frozen episode window", () => {
  const base = {
    canonicalInstrumentId: INSTRUMENT_ID,
    opportunityFamily: "PRE_MOVE",
    directionHypothesis: "LONG",
    episodeWindowPolicyVersion: "m2-episode-window.v1",
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  } as const;
  assert.equal(classifyM2CandidateRelationship(base, base), "SAME_EPISODE");
  assert.equal(classifyM2CandidateRelationship(base, {
    ...base,
    windowStart: "2026-01-15T08:00:00.000+08:00",
    windowEnd: "2026-01-15T08:15:00.000+08:00",
  }), "SAME_EPISODE");
  assert.equal(classifyM2CandidateRelationship(base, {
    ...base,
    windowStart: "2026-01-15T00:15:00.000Z",
    windowEnd: "2026-01-15T00:30:00.000Z",
  }), "NEW_EPISODE_WINDOW");
  assert.equal(classifyM2CandidateRelationship(base, {
    ...base,
    directionHypothesis: "SHORT",
  }), "PARALLEL_DIRECTION_THESIS");
  assert.equal(classifyM2CandidateRelationship(base, {
    ...base,
    opportunityFamily: "BREAKOUT_RETEST",
  }), "PARALLEL_FAMILY_THESIS");
  assert.equal(classifyM2CandidateRelationship(base, {
    ...base,
    canonicalInstrumentId: "OKX_SWAP:ETH-USDT-SWAP:LINEAR_PERPETUAL:USDT",
  }), "INDEPENDENT_INSTRUMENT");
});

test("validates a multi-detector bundle without turning its thesis into truth", () => {
  const candidates = [candidate(), secondCandidate()];
  const validEpisode = episode(candidates);
  const validThesis = thesis(candidates);
  const report = validateM2CandidateBundle({
    candidates,
    episode: validEpisode,
    thesis: validThesis,
  });
  assert.deepEqual(report, {
    schemaVersion: "v2-m2-discovery-contract.v1",
    status: "PASS",
    candidateCount: 2,
    detectorCount: 2,
    patternCount: 2,
    reasonCodes: [],
  });
  assert.equal(validThesis.thesisAuthority, "VALIDATION_HYPOTHESIS_ONLY");

  const blocked = validateM2CandidateBundle({
    candidates,
    episode: CandidateEpisodeSchema.parse({
      ...validEpisode,
      candidateIds: [candidates[0]!.candidateId],
    }),
    thesis: validThesis,
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.reasonCodes.includes("episode_candidate_population_mismatch"));
});

test("keeps discovered, deep-validated and actionable populations explicit", () => {
  const pass = buildM2DiscoveryFunnelReport({
    cohortId: "m2-cohort-one",
    cohortStart: WINDOW_START,
    sourceCutoff: WINDOW_END,
    eligibleInstrumentIds: ["instrument-a", "instrument-b"],
    evaluatedInstrumentIds: ["instrument-a", "instrument-b"],
    dataUnavailableInstrumentIds: [],
    discoveredEpisodeIds: ["episode-a", "episode-b"],
    deepValidatedEpisodeIds: ["episode-a"],
    actionableEpisodeIds: [],
    dataUnavailableEpisodeIds: ["episode-b"],
  });
  assert.equal(pass.status, "PARTIAL");
  assert.equal(pass.discovered.count, 2);
  assert.equal(pass.deepValidated.count, 1);
  assert.equal(pass.actionable.count, 0);
  assert.equal(pass.dataUnavailableEpisodeCount, 1);

  const complete = buildM2DiscoveryFunnelReport({
    cohortId: "m2-cohort-complete",
    cohortStart: WINDOW_START,
    sourceCutoff: WINDOW_END,
    eligibleInstrumentIds: ["instrument-a"],
    evaluatedInstrumentIds: ["instrument-a"],
    dataUnavailableInstrumentIds: [],
    discoveredEpisodeIds: [],
    deepValidatedEpisodeIds: [],
    actionableEpisodeIds: [],
    dataUnavailableEpisodeIds: [],
  });
  assert.equal(complete.status, "PASS");
  assert.equal(complete.discovered.count, 0);

  const partial = buildM2DiscoveryFunnelReport({
    cohortId: "m2-cohort-partial",
    cohortStart: WINDOW_START,
    sourceCutoff: WINDOW_END,
    eligibleInstrumentIds: ["instrument-a", "instrument-b"],
    evaluatedInstrumentIds: ["instrument-a"],
    dataUnavailableInstrumentIds: [],
    discoveredEpisodeIds: [],
    deepValidatedEpisodeIds: [],
    actionableEpisodeIds: [],
    dataUnavailableEpisodeIds: [],
  });
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.notEvaluatedInstrumentCount, 1);

  const blocked = buildM2DiscoveryFunnelReport({
    cohortId: "m2-cohort-invalid",
    cohortStart: WINDOW_START,
    sourceCutoff: WINDOW_END,
    eligibleInstrumentIds: ["instrument-a"],
    evaluatedInstrumentIds: ["instrument-a"],
    dataUnavailableInstrumentIds: [],
    discoveredEpisodeIds: ["episode-a"],
    deepValidatedEpisodeIds: [],
    actionableEpisodeIds: ["episode-a"],
    dataUnavailableEpisodeIds: [],
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.reasonCodes.includes(
    "actionable_episode_not_in_deep_validated_population",
  ));
});

test("keeps the contract package detached from M1 runtime and future outcomes", () => {
  const source = readFileSync(
    join(process.cwd(), "src/v2/modules/detection/discovery-contract.ts"),
    "utf8",
  );
  for (const forbidden of [
    "modules/market-fact",
    "modules/feature",
    "modules/market-context",
    "OutcomeRecord",
    "publicBreakoutTime",
    "futureMfe",
    "futureMae",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
