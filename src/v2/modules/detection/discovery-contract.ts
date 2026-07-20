import { z } from "zod";
import type {
  CandidateEpisode,
  DirectionHypothesis,
  DiscoveryCandidate,
  OpportunityThesis,
} from "../../domain/contracts";
import {
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_DIRECTIONS_BY_FAMILY,
  OPPORTUNITY_PATTERNS_BY_FAMILY,
  type OpportunityFamily,
  type OpportunityPattern,
} from "../../domain/product-constitution";
import type { CandidatePriority } from "../../domain/states";
import {
  CandidateEpisodeSchema,
  DiscoveryCandidateSchema,
  OpportunityThesisSchema,
} from "../../runtime-schema/decision-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M2_DISCOVERY_CONTRACT_VERSION =
  "v2-m2-discovery-contract.v1" as const;
export const M2_DETECTOR_INPUT_VERSION =
  "v2-m2-detector-read-input.v1" as const;
export const M2_DISCOVERY_FUNNEL_VERSION =
  "v2-m2-discovery-funnel-denominators.v1" as const;

const CandidateDirectionSchema = z.enum(["LONG", "SHORT", "UNKNOWN"]);

export const M2_OPPORTUNITY_FAMILY_DEFINITIONS = Object.freeze([
  {
    family: "PRE_MOVE",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.PRE_MOVE,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.PRE_MOVE,
    primaryDiscoveryCodes: [
      "compression_before_expansion",
      "flow_leads_price",
      "relative_behavior_leads_market",
      "liquidity_state_changes_early",
    ],
    commonCounterHintCodes: [
      "move_already_consumed",
      "single_source_anomaly",
      "thin_liquidity_distortion",
      "funding_or_positioning_overheated",
    ],
  },
  {
    family: "BREAKOUT_RETEST",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.BREAKOUT_RETEST,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.BREAKOUT_RETEST,
    primaryDiscoveryCodes: [
      "structural_boundary_tested",
      "breakout_edge_visible",
      "role_flip_retest_visible",
    ],
    commonCounterHintCodes: [
      "price_returned_inside_structure",
      "breakout_without_participation",
      "insufficient_structural_space",
    ],
  },
  {
    family: "TREND_CONTINUATION",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.TREND_CONTINUATION,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.TREND_CONTINUATION,
    primaryDiscoveryCodes: [
      "trend_compression_visible",
      "structural_pullback_holds",
      "directional_momentum_resumes",
    ],
    commonCounterHintCodes: [
      "trend_structure_damaged",
      "momentum_exhaustion_visible",
      "continuation_entry_late",
    ],
  },
  {
    family: "REVERSAL_RANGE",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.REVERSAL_RANGE,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.REVERSAL_RANGE,
    primaryDiscoveryCodes: [
      "key_level_reversal_attempt",
      "range_edge_reaction_attempt",
      "failed_continuation_visible",
    ],
    commonCounterHintCodes: [
      "countertrend_without_confirmation",
      "range_expansion_risk",
      "liquidity_sweep_not_reclaimed",
    ],
  },
  {
    family: "RELATIVE_STRENGTH",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.RELATIVE_STRENGTH,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.RELATIVE_STRENGTH,
    primaryDiscoveryCodes: [
      "benchmark_adjusted_strength_persists",
      "benchmark_adjusted_weakness_persists",
      "peer_group_divergence_visible",
    ],
    commonCounterHintCodes: [
      "single_benchmark_shock",
      "low_turnover_relative_distortion",
      "relative_move_not_persistent",
    ],
  },
  {
    family: "DERIVATIVES_FLOW",
    patterns: OPPORTUNITY_PATTERNS_BY_FAMILY.DERIVATIVES_FLOW,
    allowedDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY.DERIVATIVES_FLOW,
    primaryDiscoveryCodes: [
      "price_positioning_divergence_visible",
      "crowding_release_visible",
      "funding_basis_dislocation_visible",
    ],
    commonCounterHintCodes: [
      "derivatives_capability_unavailable",
      "post_liquidation_noise",
      "crowding_already_extreme",
    ],
  },
] as const satisfies readonly Readonly<{
  family: OpportunityFamily;
  patterns: readonly OpportunityPattern[];
  allowedDirections: readonly Exclude<DirectionHypothesis, "NEUTRAL">[];
  primaryDiscoveryCodes: readonly string[];
  commonCounterHintCodes: readonly string[];
}>[]);

const DetectorArtifactReferenceSchema = z.strictObject({
  artifactId: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  sourceCutoff: IsoDateTimeSchema,
  availableAt: IsoDateTimeSchema,
});

export const M2DetectorReadInputSchema = z.strictObject({
  schemaVersion: z.literal(M2_DETECTOR_INPUT_VERSION),
  readAuthority: z.literal("POINT_IN_TIME_REFERENCES_ONLY"),
  releaseId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  eventCutoff: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  universe: DetectorArtifactReferenceSchema.extend({
    eligible: z.literal(true),
  }),
  featureSet: DetectorArtifactReferenceSchema.extend({
    featureIds: z.array(NonEmptyStringSchema).min(1),
  }),
  featureQuality: DetectorArtifactReferenceSchema,
  marketContext: DetectorArtifactReferenceSchema,
  observedPrice: DetectorArtifactReferenceSchema.extend({
    value: PositiveDecimalStringSchema,
  }),
  inputQuality: QualityAssessmentSchema,
}).superRefine((input, context) => {
  for (const [field, reference] of [
    ["universe", input.universe],
    ["featureSet", input.featureSet],
    ["featureQuality", input.featureQuality],
    ["marketContext", input.marketContext],
    ["observedPrice", input.observedPrice],
  ] as const) {
    if (reference.releaseId !== input.releaseId) {
      context.addIssue({
        code: "custom",
        message: "detector input cannot mix release identities",
        path: [field, "releaseId"],
      });
    }
    if (Date.parse(reference.sourceCutoff) > Date.parse(input.eventCutoff)) {
      context.addIssue({
        code: "custom",
        message: "detector input cannot read beyond its event cutoff",
        path: [field, "sourceCutoff"],
      });
    }
    if (
      Date.parse(reference.sourceCutoff) > Date.parse(reference.availableAt) ||
      Date.parse(reference.availableAt) > Date.parse(input.knowledgeCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "detector input was not available by its knowledge cutoff",
        path: [field, "availableAt"],
      });
    }
  }
  if (Date.parse(input.eventCutoff) > Date.parse(input.knowledgeCutoff)) {
    context.addIssue({
      code: "custom",
      message: "detector event cutoff cannot exceed knowledge cutoff",
      path: ["eventCutoff"],
    });
  }
  if (!(["FRESH", "PARTIAL"] as const).includes(
    input.inputQuality.status as "FRESH" | "PARTIAL",
  )) {
    context.addIssue({
      code: "custom",
      message: "detector input must be FRESH or explicitly PARTIAL",
      path: ["inputQuality", "status"],
    });
  }
  if (new Set(input.featureSet.featureIds).size !==
    input.featureSet.featureIds.length) {
    context.addIssue({
      code: "custom",
      message: "detector feature references must be unique",
      path: ["featureSet", "featureIds"],
    });
  }
});

export type M2DetectorReadInput = z.infer<typeof M2DetectorReadInputSchema>;

export type M2CandidateInputValidationReport = Readonly<{
  schemaVersion: typeof M2_DISCOVERY_CONTRACT_VERSION;
  status: "PASS" | "BLOCKED";
  candidateId: string;
  reasonCodes: readonly string[];
}>;

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

export function validateM2CandidateAgainstDetectorInput(
  rawCandidate: DiscoveryCandidate,
  rawInput: M2DetectorReadInput,
): M2CandidateInputValidationReport {
  const candidate = DiscoveryCandidateSchema.parse(rawCandidate);
  const input = M2DetectorReadInputSchema.parse(rawInput);
  const reasons = new Set<string>();
  if (
    candidate.releaseId !== input.releaseId ||
    candidate.canonicalInstrumentId !== input.canonicalInstrumentId ||
    candidate.underlyingGroupId !== input.underlyingGroupId
  ) {
    reasons.add("candidate_detector_input_identity_mismatch");
  }
  if (
    !sameInstant(candidate.sourceCutoff, input.eventCutoff) ||
    !sameInstant(candidate.inputLineage.knowledgeCutoff, input.knowledgeCutoff)
  ) {
    reasons.add("candidate_detector_input_cutoff_mismatch");
  }
  const lineagePairs = [
    {
      candidateId: candidate.inputLineage.universeSnapshotId,
      candidateSourceCutoff: candidate.inputLineage.universeSourceCutoff,
      candidateAvailableAt: candidate.inputLineage.universeAvailableAt,
      inputReference: input.universe,
    },
    {
      candidateId: candidate.inputLineage.featureSetSnapshotId,
      candidateSourceCutoff: candidate.inputLineage.featureSourceCutoff,
      candidateAvailableAt: candidate.inputLineage.featureAvailableAt,
      inputReference: input.featureSet,
    },
    {
      candidateId: candidate.inputLineage.featureQualitySnapshotId,
      candidateSourceCutoff: candidate.inputLineage.featureQualitySourceCutoff,
      candidateAvailableAt: candidate.inputLineage.featureQualityAvailableAt,
      inputReference: input.featureQuality,
    },
    {
      candidateId: candidate.inputLineage.marketContextSnapshotId,
      candidateSourceCutoff: candidate.inputLineage.contextSourceCutoff,
      candidateAvailableAt: candidate.inputLineage.contextAvailableAt,
      inputReference: input.marketContext,
    },
    {
      candidateId: candidate.observedPriceFactId,
      candidateSourceCutoff: candidate.inputLineage.observedPriceSourceCutoff,
      candidateAvailableAt: candidate.inputLineage.observedPriceAvailableAt,
      inputReference: input.observedPrice,
    },
  ];
  if (lineagePairs.some((pair) =>
    pair.candidateId !== pair.inputReference.artifactId ||
    !sameInstant(pair.candidateSourceCutoff, pair.inputReference.sourceCutoff) ||
    !sameInstant(pair.candidateAvailableAt, pair.inputReference.availableAt)
  )) {
    reasons.add("candidate_detector_input_artifact_lineage_mismatch");
  }
  if (!sameMembers(
    candidate.inputLineage.featureIds,
    input.featureSet.featureIds,
  )) {
    reasons.add("candidate_detector_input_feature_population_mismatch");
  }
  if (candidate.observedPrice !== input.observedPrice.value) {
    reasons.add("candidate_detector_input_observed_price_mismatch");
  }
  if (stableContentHash(candidate.inputQuality) !==
    stableContentHash(input.inputQuality)) {
    reasons.add("candidate_detector_input_quality_mismatch");
  }
  return deepFreezeArtifact({
    schemaVersion: M2_DISCOVERY_CONTRACT_VERSION,
    status: reasons.size === 0 ? "PASS" : "BLOCKED",
    candidateId: candidate.candidateId,
    reasonCodes: [...reasons].sort(),
  });
}

export const M2CandidateEpisodeIdentitySchema = z.strictObject({
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  directionHypothesis: CandidateDirectionSchema,
  episodeWindowPolicyVersion: NonEmptyStringSchema,
  windowStart: IsoDateTimeSchema,
  windowEnd: IsoDateTimeSchema,
}).superRefine((identity, context) => {
  if (Date.parse(identity.windowStart) >= Date.parse(identity.windowEnd)) {
    context.addIssue({
      code: "custom",
      message: "episode identity requires a positive window",
      path: ["windowEnd"],
    });
  }
});

export type M2CandidateEpisodeIdentity = z.infer<
  typeof M2CandidateEpisodeIdentitySchema
>;

export function buildM2CandidateEpisodeKey(
  input: M2CandidateEpisodeIdentity,
): string {
  const identity = M2CandidateEpisodeIdentitySchema.parse(input);
  return `candidate-episode:${stableContentHash({
    ...identity,
    windowStart: new Date(identity.windowStart).toISOString(),
    windowEnd: new Date(identity.windowEnd).toISOString(),
  }).slice("sha256:".length)}`;
}

export type M2CandidateRelationship =
  | "SAME_EPISODE"
  | "NEW_EPISODE_WINDOW"
  | "PARALLEL_DIRECTION_THESIS"
  | "PARALLEL_FAMILY_THESIS"
  | "INDEPENDENT_INSTRUMENT";

export function classifyM2CandidateRelationship(
  left: M2CandidateEpisodeIdentity,
  right: M2CandidateEpisodeIdentity,
): M2CandidateRelationship {
  const parsedLeft = M2CandidateEpisodeIdentitySchema.parse(left);
  const parsedRight = M2CandidateEpisodeIdentitySchema.parse(right);
  if (parsedLeft.canonicalInstrumentId !== parsedRight.canonicalInstrumentId) {
    return "INDEPENDENT_INSTRUMENT";
  }
  if (parsedLeft.opportunityFamily !== parsedRight.opportunityFamily) {
    return "PARALLEL_FAMILY_THESIS";
  }
  if (parsedLeft.directionHypothesis !== parsedRight.directionHypothesis) {
    return "PARALLEL_DIRECTION_THESIS";
  }
  return buildM2CandidateEpisodeKey(parsedLeft) ===
      buildM2CandidateEpisodeKey(parsedRight)
    ? "SAME_EPISODE"
    : "NEW_EPISODE_WINDOW";
}

export type M2CandidateBundleValidationReport = Readonly<{
  schemaVersion: typeof M2_DISCOVERY_CONTRACT_VERSION;
  status: "PASS" | "BLOCKED";
  candidateCount: number;
  detectorCount: number;
  patternCount: number;
  reasonCodes: readonly string[];
}>;

const PRIORITY_ORDER: Record<CandidatePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const canonicalLeft = [...left].sort();
  const canonicalRight = [...right].sort();
  return canonicalLeft.every(
    (value, index) => value === canonicalRight[index],
  );
}

function timestampAt(
  values: readonly string[],
  order: "EARLIEST" | "LATEST",
): string {
  return values.reduce((selected, candidate) => {
    const comparison = Date.parse(candidate) - Date.parse(selected);
    return order === "EARLIEST"
      ? (comparison < 0 ? candidate : selected)
      : (comparison > 0 ? candidate : selected);
  });
}

export function validateM2CandidateBundle(input: {
  candidates: readonly DiscoveryCandidate[];
  episode: CandidateEpisode;
  thesis: OpportunityThesis;
}): M2CandidateBundleValidationReport {
  const candidates = z.array(DiscoveryCandidateSchema).min(1).parse(input.candidates);
  const episode = CandidateEpisodeSchema.parse(input.episode);
  const thesis = OpportunityThesisSchema.parse(input.thesis);
  const reasons = new Set<string>();
  const firstCandidate = candidates[0]!;

  const candidateIds = candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    reasons.add("candidate_bundle_duplicate_candidate_id");
  }
  if (!sameMembers(candidateIds, episode.candidateIds)) {
    reasons.add("episode_candidate_population_mismatch");
  }
  if (!sameMembers(
    candidateIds,
    thesis.detectorSources.map((source) => source.candidateId),
  )) {
    reasons.add("thesis_candidate_population_mismatch");
  }

  for (const candidate of candidates) {
    if (
      candidate.canonicalInstrumentId !== episode.canonicalInstrumentId ||
      candidate.canonicalInstrumentId !== thesis.canonicalInstrumentId ||
      candidate.underlyingGroupId !== episode.underlyingGroupId ||
      candidate.underlyingGroupId !== thesis.underlyingGroupId
    ) {
      reasons.add("candidate_bundle_instrument_identity_mismatch");
    }
    if (
      candidate.opportunityFamily !== episode.opportunityFamily ||
      candidate.opportunityFamily !== thesis.opportunityFamily
    ) {
      reasons.add("candidate_bundle_family_mismatch");
    }
    if (
      candidate.directionHypothesis !== episode.directionHypothesis ||
      candidate.directionHypothesis !== thesis.directionHypothesis
    ) {
      reasons.add("candidate_bundle_direction_mismatch");
    }
    if (
      candidate.releaseId !== episode.releaseId ||
      candidate.releaseId !== thesis.releaseId
    ) {
      reasons.add("candidate_bundle_release_mismatch");
    }
    if (
      Date.parse(candidate.firstDetectedAt) <
        Date.parse(episode.episodeWindow.windowStart) ||
      Date.parse(candidate.firstDetectedAt) >=
        Date.parse(episode.episodeWindow.windowEnd)
    ) {
      reasons.add("candidate_outside_episode_window");
    }
    if (Date.parse(candidate.expiresAt) > Date.parse(episode.expiresAt)) {
      reasons.add("candidate_expiry_exceeds_episode_window");
    }
  }

  const patterns = [...new Set(candidates.map(
    (candidate) => candidate.opportunityPattern,
  ))].sort();
  if (!sameMembers(patterns, episode.opportunityPatterns) ||
    !sameMembers(patterns, thesis.opportunityPatterns)) {
    reasons.add("candidate_bundle_pattern_population_mismatch");
  }

  const earliestDetection = timestampAt(
    candidates.map((candidate) => candidate.firstDetectedAt),
    "EARLIEST",
  );
  const latestDetection = timestampAt(
    candidates.map((candidate) => candidate.firstDetectedAt),
    "LATEST",
  );
  if (
    Date.parse(episode.firstSeenAt) !== Date.parse(earliestDetection) ||
    Date.parse(thesis.firstDetectedAt) !== Date.parse(earliestDetection)
  ) {
    reasons.add("candidate_bundle_first_detection_mismatch");
  }
  if (Date.parse(episode.lastSeenAt) !== Date.parse(latestDetection)) {
    reasons.add("candidate_bundle_last_detection_mismatch");
  }
  const latestSourceCutoff = timestampAt(
    candidates.map((candidate) => candidate.sourceCutoff),
    "LATEST",
  );
  if (
    Date.parse(episode.sourceCutoff) !== Date.parse(latestSourceCutoff) ||
    Date.parse(thesis.sourceCutoff) !== Date.parse(latestSourceCutoff)
  ) {
    reasons.add("candidate_bundle_source_cutoff_mismatch");
  }

  const expectedPriority = candidates
    .map((candidate) => candidate.priority)
    .sort((left, right) => PRIORITY_ORDER[left] - PRIORITY_ORDER[right])[0]!;
  if (episode.priority !== expectedPriority) {
    reasons.add("episode_priority_does_not_match_highest_resource_priority");
  }
  const priorityPolicies = new Set(candidates.map(
    (candidate) => candidate.priorityBasis.policyVersion,
  ));
  if (
    priorityPolicies.size !== 1 ||
    !priorityPolicies.has(episode.priorityPolicyVersion)
  ) {
    reasons.add("candidate_bundle_priority_policy_mismatch");
  }

  const expectedEpisodeKey = buildM2CandidateEpisodeKey({
    canonicalInstrumentId: firstCandidate.canonicalInstrumentId,
    opportunityFamily: firstCandidate.opportunityFamily,
    directionHypothesis: firstCandidate.directionHypothesis,
    episodeWindowPolicyVersion: episode.episodeWindow.policyVersion,
    windowStart: episode.episodeWindow.windowStart,
    windowEnd: episode.episodeWindow.windowEnd,
  });
  if (episode.episodeKey !== expectedEpisodeKey) {
    reasons.add("candidate_episode_key_mismatch");
  }
  if (episode.thesisId !== thesis.thesisId || episode.episodeId !== thesis.episodeId) {
    reasons.add("episode_thesis_identity_mismatch");
  }

  for (const candidate of candidates) {
    const source = thesis.detectorSources.find(
      (candidateSource) => candidateSource.candidateId === candidate.candidateId,
    );
    if (
      source === undefined ||
      source.detectorId !== candidate.detectorId ||
      source.detectorVersion !== candidate.detectorVersion ||
      source.detectorLifecycle !== candidate.detectorLifecycle ||
      source.emissionScope !== candidate.emissionScope ||
      source.opportunityPattern !== candidate.opportunityPattern ||
      source.firstDetectedAt !== candidate.firstDetectedAt ||
      source.candidateSourceCutoff !== candidate.sourceCutoff
    ) {
      reasons.add("thesis_detector_source_mismatch");
    }
  }

  return deepFreezeArtifact({
    schemaVersion: M2_DISCOVERY_CONTRACT_VERSION,
    status: reasons.size === 0 ? "PASS" : "BLOCKED",
    candidateCount: candidates.length,
    detectorCount: new Set(candidates.map((candidate) => candidate.detectorId)).size,
    patternCount: patterns.length,
    reasonCodes: [...reasons].sort(),
  });
}

const FunnelInputSchema = z.strictObject({
  cohortId: NonEmptyStringSchema,
  cohortStart: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  eligibleInstrumentIds: z.array(NonEmptyStringSchema),
  evaluatedInstrumentIds: z.array(NonEmptyStringSchema),
  dataUnavailableInstrumentIds: z.array(NonEmptyStringSchema),
  discoveredEpisodeIds: z.array(NonEmptyStringSchema),
  deepValidatedEpisodeIds: z.array(NonEmptyStringSchema),
  actionableEpisodeIds: z.array(NonEmptyStringSchema),
  dataUnavailableEpisodeIds: z.array(NonEmptyStringSchema),
});

export type M2DiscoveryFunnelInput = z.infer<typeof FunnelInputSchema>;

type FunnelStage = Readonly<{
  semantics:
    | "ALL_UNIQUE_DISCOVERED_EPISODES"
    | "ALL_DISCOVERED_EPISODES_WITH_COMPLETED_DEEP_VALIDATION"
    | "ALL_DEEP_VALIDATED_EPISODES_WITH_TRADE_PLAN_READY_DECISION";
  count: number;
  populationDigest: string;
}>;

export type M2DiscoveryFunnelReport = Readonly<{
  schemaVersion: typeof M2_DISCOVERY_FUNNEL_VERSION;
  status: "PASS" | "PARTIAL" | "BLOCKED" | "INSUFFICIENT_EVIDENCE";
  cohortId: string;
  cohortStart: string;
  sourceCutoff: string;
  eligibleInstrumentCount: number;
  evaluatedInstrumentCount: number;
  notEvaluatedInstrumentCount: number;
  dataUnavailableInstrumentCount: number;
  dataUnavailableEpisodeCount: number;
  discovered: FunnelStage;
  deepValidated: FunnelStage;
  actionable: FunnelStage;
  reasonCodes: readonly string[];
}>;

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function subset(values: readonly string[], population: readonly string[]): boolean {
  const allowed = new Set(population);
  return values.every((value) => allowed.has(value));
}

function populationDigest(values: readonly string[]): string {
  return stableContentHash([...values].sort());
}

export function buildM2DiscoveryFunnelReport(
  rawInput: M2DiscoveryFunnelInput,
): M2DiscoveryFunnelReport {
  const input = FunnelInputSchema.parse(rawInput);
  const reasons = new Set<string>();
  const populations = [
    input.eligibleInstrumentIds,
    input.evaluatedInstrumentIds,
    input.dataUnavailableInstrumentIds,
    input.discoveredEpisodeIds,
    input.deepValidatedEpisodeIds,
    input.actionableEpisodeIds,
    input.dataUnavailableEpisodeIds,
  ];
  if (populations.some((population) => !unique(population))) {
    reasons.add("discovery_funnel_population_contains_duplicates");
  }
  if (!subset(input.evaluatedInstrumentIds, input.eligibleInstrumentIds)) {
    reasons.add("evaluated_instrument_not_in_eligible_population");
  }
  if (!subset(input.dataUnavailableInstrumentIds, input.evaluatedInstrumentIds)) {
    reasons.add("unavailable_instrument_not_in_evaluated_population");
  }
  if (!subset(input.deepValidatedEpisodeIds, input.discoveredEpisodeIds)) {
    reasons.add("deep_validated_episode_not_in_discovered_population");
  }
  if (!subset(input.actionableEpisodeIds, input.deepValidatedEpisodeIds)) {
    reasons.add("actionable_episode_not_in_deep_validated_population");
  }
  if (!subset(input.dataUnavailableEpisodeIds, input.discoveredEpisodeIds)) {
    reasons.add("unavailable_episode_not_in_discovered_population");
  }
  if (Date.parse(input.cohortStart) > Date.parse(input.sourceCutoff)) {
    reasons.add("discovery_funnel_cohort_time_inverted");
  }

  let status: M2DiscoveryFunnelReport["status"];
  if (reasons.size > 0) {
    status = "BLOCKED";
  } else if (
    input.eligibleInstrumentIds.length === 0 ||
    input.evaluatedInstrumentIds.length === 0
  ) {
    status = "INSUFFICIENT_EVIDENCE";
    reasons.add("discovery_funnel_eligible_or_evaluated_population_empty");
  } else if (
    input.evaluatedInstrumentIds.length < input.eligibleInstrumentIds.length ||
    input.dataUnavailableInstrumentIds.length > 0 ||
    input.dataUnavailableEpisodeIds.length > 0
  ) {
    status = "PARTIAL";
    if (input.evaluatedInstrumentIds.length < input.eligibleInstrumentIds.length) {
      reasons.add("discovery_funnel_eligible_coverage_incomplete");
    }
    if (input.dataUnavailableInstrumentIds.length > 0) {
      reasons.add("discovery_funnel_instrument_data_unavailable");
    }
    if (input.dataUnavailableEpisodeIds.length > 0) {
      reasons.add("discovery_funnel_episode_data_unavailable");
    }
  } else {
    status = "PASS";
  }

  return deepFreezeArtifact({
    schemaVersion: M2_DISCOVERY_FUNNEL_VERSION,
    status,
    cohortId: input.cohortId,
    cohortStart: input.cohortStart,
    sourceCutoff: input.sourceCutoff,
    eligibleInstrumentCount: input.eligibleInstrumentIds.length,
    evaluatedInstrumentCount: input.evaluatedInstrumentIds.length,
    notEvaluatedInstrumentCount: Math.max(
      0,
      input.eligibleInstrumentIds.length - input.evaluatedInstrumentIds.length,
    ),
    dataUnavailableInstrumentCount: input.dataUnavailableInstrumentIds.length,
    dataUnavailableEpisodeCount: input.dataUnavailableEpisodeIds.length,
    discovered: {
      semantics: "ALL_UNIQUE_DISCOVERED_EPISODES",
      count: input.discoveredEpisodeIds.length,
      populationDigest: populationDigest(input.discoveredEpisodeIds),
    },
    deepValidated: {
      semantics: "ALL_DISCOVERED_EPISODES_WITH_COMPLETED_DEEP_VALIDATION",
      count: input.deepValidatedEpisodeIds.length,
      populationDigest: populationDigest(input.deepValidatedEpisodeIds),
    },
    actionable: {
      semantics: "ALL_DEEP_VALIDATED_EPISODES_WITH_TRADE_PLAN_READY_DECISION",
      count: input.actionableEpisodeIds.length,
      populationDigest: populationDigest(input.actionableEpisodeIds),
    },
    reasonCodes: [...reasons].sort(),
  });
}
