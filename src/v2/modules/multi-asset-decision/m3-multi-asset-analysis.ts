import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  M3_MULTI_ASSET_DIRECTIONS,
  M3_MULTI_ASSET_REGIMES,
  M3_MULTI_ASSET_STRUCTURAL_LEVEL_EVIDENCE_CATEGORIES,
  M3MultiAssetAnalysisObservationSchema,
  M3MultiAssetDigestSchema,
  M3MultiAssetOpportunitySchema,
  M3MultiAssetScopeBindingSchema,
  M3MultiAssetStructuralLevelSchema,
  isM3MultiAssetFamilyAllowedForLane,
  isM3MultiAssetOpportunityPatternForFamily,
  isM3MultiAssetDecisionLifecycle,
  isM3MultiAssetExecutionDomain,
  requiredM3MultiAssetAnalysisCategories,
  sameM3MultiAssetBinding,
  uniqueSorted,
  type M3MultiAssetAnalysisCategory,
} from "./m3-multi-asset-decision-contract";

export const M3_MULTI_ASSET_ANALYSIS_INPUT_VERSION =
  "m3-multi-asset-analysis-input.v1" as const;
export const M3_MULTI_ASSET_ANALYSIS_SNAPSHOT_VERSION =
  "m3-multi-asset-analysis-snapshot.v1" as const;
export const M3_MULTI_ASSET_ANALYSIS_RESULT_VERSION =
  "m3-multi-asset-analysis-result.v1" as const;
export const M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION =
  "m3-multi-asset-domain-analysis-policy.v1-research-only" as const;

const ELIGIBILITY_CATEGORIES = new Set<M3MultiAssetAnalysisCategory>([
  "IDENTITY",
  "LISTING_LIFECYCLE",
  "POINT_IN_TIME_MARKET",
  "JURISDICTION",
  "MARK_INDEX_REFERENCE",
  "TRADITIONAL_MARKET_SESSION",
  "UNDERLYING_REFERENCE",
  "CORPORATE_ACTION",
  "FX_REFERENCE",
  "CLOSED_SESSION_BASIS",
  "CONTRACT_SPECIFICATIONS",
  "LISTING_WARMUP_BEHAVIOR",
]);

export const M3MultiAssetAnalysisInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_ANALYSIS_INPUT_VERSION),
  policyVersion: z.literal(M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  binding: M3MultiAssetScopeBindingSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  opportunity: M3MultiAssetOpportunitySchema,
  regime: z.enum(M3_MULTI_ASSET_REGIMES),
  observations: z.array(M3MultiAssetAnalysisObservationSchema).min(1),
  structuralLevels: z.array(M3MultiAssetStructuralLevelSchema),
});

export type M3MultiAssetAnalysisInput = z.infer<
  typeof M3MultiAssetAnalysisInputSchema
>;

const M3MultiAssetAnalysisSnapshotBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_ANALYSIS_SNAPSHOT_VERSION),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  policyVersion: z.literal(M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION),
  analysisId: NonEmptyStringSchema,
  binding: M3MultiAssetScopeBindingSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  opportunity: M3MultiAssetOpportunitySchema,
  regime: z.enum(M3_MULTI_ASSET_REGIMES),
  directionBias: z.enum(M3_MULTI_ASSET_DIRECTIONS),
  requiredCategories: z.array(
    M3MultiAssetAnalysisObservationSchema.shape.category,
  ),
  passedCategories: z.array(
    M3MultiAssetAnalysisObservationSchema.shape.category,
  ),
  missingCategories: z.array(
    M3MultiAssetAnalysisObservationSchema.shape.category,
  ),
  supportingEvidenceIds: z.array(NonEmptyStringSchema),
  counterEvidenceIds: z.array(NonEmptyStringSchema),
  structuralLevels: z.array(M3MultiAssetStructuralLevelSchema),
  evidenceBlockers: z.array(NonEmptyStringSchema),
  setupBlockers: z.array(NonEmptyStringSchema),
  integrityBlockers: z.array(NonEmptyStringSchema),
  blockers: z.array(NonEmptyStringSchema),
  promotionEligible: z.literal(false),
  signalLevel: z.null(),
  strategyAuthority: z.literal(false),
  readyAuthority: z.literal(false),
}).superRefine((analysis, context) => {
  for (const [path, values] of [
    ["requiredCategories", analysis.requiredCategories],
    ["passedCategories", analysis.passedCategories],
    ["missingCategories", analysis.missingCategories],
    ["supportingEvidenceIds", analysis.supportingEvidenceIds],
    ["counterEvidenceIds", analysis.counterEvidenceIds],
    ["evidenceBlockers", analysis.evidenceBlockers],
    ["setupBlockers", analysis.setupBlockers],
    ["integrityBlockers", analysis.integrityBlockers],
    ["blockers", analysis.blockers],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `${path} must be unique`,
        path: [path],
      });
    }
  }
  const required = [...analysis.requiredCategories].sort();
  const partition = [
    ...analysis.passedCategories,
    ...analysis.missingCategories,
  ].sort();
  if (
    required.length !== partition.length ||
    required.some((value, index) => value !== partition[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "passed and missing categories must partition requirements",
      path: ["requiredCategories"],
    });
  }
  const expectedBlockers = uniqueSorted([
    ...analysis.evidenceBlockers,
    ...analysis.setupBlockers,
    ...analysis.integrityBlockers,
  ]);
  if (
    expectedBlockers.length !== analysis.blockers.length ||
    expectedBlockers.some(
      (value, index) => value !== analysis.blockers[index],
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "blockers must be the exact normalized blocker union",
      path: ["blockers"],
    });
  }
});

export const M3MultiAssetAnalysisSnapshotSchema =
  M3MultiAssetAnalysisSnapshotBodySchema.extend({
    analysisHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetAnalysisSnapshot = z.infer<
  typeof M3MultiAssetAnalysisSnapshotSchema
>;

export type M3MultiAssetAnalysisIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3MultiAssetAnalysisResult = Readonly<{
  schemaVersion: typeof M3_MULTI_ASSET_ANALYSIS_RESULT_VERSION;
  status:
    | "ANALYZED_RESEARCH_ONLY"
    | "ABSTAINED_RESEARCH_ONLY"
    | "BLOCKED_INVALID_INPUT";
  authority: typeof M3_MULTI_ASSET_DECISION_AUTHORITY;
  analysis: M3MultiAssetAnalysisSnapshot | null;
  reasonCodes: readonly string[];
  issues: readonly M3MultiAssetAnalysisIssue[];
  resultHash: string;
}>;

function result(
  body: Omit<M3MultiAssetAnalysisResult, "resultHash">,
): M3MultiAssetAnalysisResult {
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

function invalidInputResult(
  issues: readonly M3MultiAssetAnalysisIssue[],
): M3MultiAssetAnalysisResult {
  const normalized = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
  );
  return result({
    schemaVersion: M3_MULTI_ASSET_ANALYSIS_RESULT_VERSION,
    status: "BLOCKED_INVALID_INPUT",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    analysis: null,
    reasonCodes: ["m3_multi_asset_analysis_input_schema_rejected"],
    issues: normalized,
  });
}

function analysisSnapshot(
  body: z.infer<typeof M3MultiAssetAnalysisSnapshotBodySchema>,
): M3MultiAssetAnalysisSnapshot {
  return deepFreezeArtifact({
    ...body,
    analysisHash: stableContentHash(body),
  });
}

export function verifyM3MultiAssetAnalysisHash(
  analysis: M3MultiAssetAnalysisSnapshot,
): boolean {
  const parsed = M3MultiAssetAnalysisSnapshotSchema.safeParse(analysis);
  if (!parsed.success) return false;
  const { analysisHash, ...body } = parsed.data;
  const expectedId = `m3-multi-asset-analysis:${stableSha256({
    binding: body.binding,
    opportunity: body.opportunity,
    sourceCutoff: body.sourceCutoff,
    policyVersion: body.policyVersion,
  }).slice(0, 24)}`;
  return stableContentHash(body) === analysisHash &&
    body.analysisId === expectedId;
}

function issue(
  issues: M3MultiAssetAnalysisIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

export function analyzeM3MultiAssetOpportunity(
  input: unknown,
): M3MultiAssetAnalysisResult {
  const parsed = M3MultiAssetAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInputResult(parsed.error.issues.map((schemaIssue) => ({
      code: "m3_multi_asset_analysis_input_schema_rejected",
      path: schemaIssue.path.length === 0
        ? "$"
        : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }

  const value = parsed.data;
  const evidenceBlockers: string[] = [];
  const setupBlockers: string[] = [];
  const integrityBlockers: string[] = [];
  const issues: M3MultiAssetAnalysisIssue[] = [];
  const binding = value.binding;

  if (Date.parse(value.sourceCutoff) > Date.parse(value.generatedAt)) {
    issue(
      issues,
      "m3_multi_asset_analysis_generated_before_cutoff",
      "generatedAt",
      "analysis cannot be generated before its source cutoff",
    );
  }
  if (!isM3MultiAssetExecutionDomain(binding.assetDomain)) {
    evidenceBlockers.push(
      `asset_domain_not_analysis_eligible:${binding.assetDomain.toLowerCase()}`,
    );
  }
  if (!isM3MultiAssetDecisionLifecycle(binding.lifecycleState)) {
    evidenceBlockers.push(
      `lifecycle_not_analysis_eligible:${binding.lifecycleState.toLowerCase()}`,
    );
  }
  if (
    !isM3MultiAssetFamilyAllowedForLane(
      binding.decisionLane,
      value.opportunity.opportunityFamily,
    )
  ) {
    issue(
      issues,
      "opportunity_family_lane_mismatch",
      "opportunity.opportunityFamily",
      "opportunity family is not eligible for the selected decision lane",
    );
  }

  for (const pattern of value.opportunity.opportunityPatterns) {
    if (
      !isM3MultiAssetOpportunityPatternForFamily(
        value.opportunity.opportunityFamily,
        pattern,
      )
    ) {
      issue(
        issues,
        "opportunity_pattern_family_mismatch",
        "opportunity.opportunityPatterns",
        "opportunity pattern must belong to the selected family",
      );
    }
  }

  const observationIds = value.observations.map((item) => item.observationId);
  const evidenceIds = value.observations.map(
    (item) => item.evidence.evidenceId,
  );
  if (new Set(observationIds).size !== observationIds.length) {
    issue(
      issues,
      "duplicate_multi_asset_observation_id",
      "observations",
      "analysis observation ids must be unique",
    );
  }
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    issue(
      issues,
      "duplicate_multi_asset_evidence_id",
      "observations",
      "analysis evidence ids must be unique",
    );
  }

  for (const [index, observation] of value.observations.entries()) {
    if (!sameM3MultiAssetBinding(binding, observation.evidence)) {
      issue(
        issues,
        "multi_asset_evidence_binding_mismatch",
        `observations.${index}.evidence`,
        "evidence cannot be borrowed across scope, release, venue, domain, lifecycle or identity",
      );
    }
    if (
      Date.parse(observation.evidence.sourceCutoff) >
        Date.parse(value.sourceCutoff) ||
      Date.parse(observation.evidence.availableAt) >
        Date.parse(value.generatedAt)
    ) {
      issue(
        issues,
        "multi_asset_evidence_not_available_at_cutoff",
        `observations.${index}.evidence`,
        "analysis cannot consume future evidence",
      );
    }
  }

  const requiredCategories = requiredM3MultiAssetAnalysisCategories(
    binding.assetDomain,
    binding.lifecycleState,
  );
  const observedCategories = new Set<M3MultiAssetAnalysisCategory>();
  const supportingCategories = new Set<M3MultiAssetAnalysisCategory>();
  const contradictingCategories = new Set<M3MultiAssetAnalysisCategory>();
  for (const observation of value.observations) {
    if (
      observation.evidence.status === "PASS" &&
      observation.stance !== "MISSING"
    ) {
      observedCategories.add(observation.category);
      if (observation.stance === "SUPPORTING") {
        supportingCategories.add(observation.category);
      } else {
        contradictingCategories.add(observation.category);
      }
    }
  }

  const passedCategories: M3MultiAssetAnalysisCategory[] = [];
  const missingCategories: M3MultiAssetAnalysisCategory[] = [];
  for (const category of requiredCategories) {
    if (!observedCategories.has(category)) {
      missingCategories.push(category);
      evidenceBlockers.push(
        `missing_domain_analysis_category:${category.toLowerCase()}`,
      );
      continue;
    }
    if (
      ELIGIBILITY_CATEGORIES.has(category) &&
      (
        !supportingCategories.has(category) ||
        contradictingCategories.has(category)
      )
    ) {
      missingCategories.push(category);
      evidenceBlockers.push(
        `contradicting_domain_prerequisite:${category.toLowerCase()}`,
      );
      continue;
    }
    passedCategories.push(category);
  }

  const evidenceById = new Map(
    value.observations.map((item) => [item.evidence.evidenceId, item]),
  );
  const levelIds = value.structuralLevels.map((level) => level.levelId);
  if (new Set(levelIds).size !== levelIds.length) {
    issue(
      issues,
      "duplicate_multi_asset_structural_level",
      "structuralLevels",
      "structural level ids must be unique",
    );
  }
  if (value.structuralLevels.length === 0) {
    setupBlockers.push("multi_asset_structural_levels_missing");
  }
  if (
    value.structuralLevels.length > 0 &&
    value.structuralLevels.every((level) => level.kind === "FIB_ZONE")
  ) {
    setupBlockers.push("multi_asset_fib_only_structure_forbidden");
  }
  for (const [index, level] of value.structuralLevels.entries()) {
    for (const evidenceId of level.evidenceIds) {
      const observation = evidenceById.get(evidenceId);
      if (
        observation === undefined ||
        observation.evidence.status !== "PASS" ||
        observation.stance === "MISSING" ||
        !(
          M3_MULTI_ASSET_STRUCTURAL_LEVEL_EVIDENCE_CATEGORIES as
            readonly string[]
        ).includes(observation.category)
      ) {
        issue(
          issues,
          "structural_level_evidence_invalid",
          `structuralLevels.${index}.evidenceIds`,
          "structural levels require declared PASS point-in-time evidence",
        );
      }
    }
  }

  const directionVotes = new Set(
    value.observations
      .filter((observation) =>
        observation.stance === "SUPPORTING" &&
        observation.evidence.status === "PASS" &&
        (observation.direction === "LONG" ||
          observation.direction === "SHORT")
      )
      .map((observation) => observation.direction),
  );
  const directionBias = directionVotes.size === 1
    ? [...directionVotes][0]!
    : "UNKNOWN";
  if (directionVotes.size > 1) {
    setupBlockers.push("multi_asset_direction_conflict");
  } else if (directionVotes.size === 0) {
    setupBlockers.push("multi_asset_direction_unresolved");
  }

  if (issues.length > 0) {
    integrityBlockers.push("multi_asset_analysis_integrity_failed");
  }

  const normalizedEvidenceBlockers = uniqueSorted(evidenceBlockers);
  const normalizedSetupBlockers = uniqueSorted(setupBlockers);
  const normalizedIntegrityBlockers = uniqueSorted(integrityBlockers);
  const normalizedBlockers = uniqueSorted([
    ...normalizedEvidenceBlockers,
    ...normalizedSetupBlockers,
    ...normalizedIntegrityBlockers,
  ]);
  const snapshot = analysisSnapshot({
    schemaVersion: M3_MULTI_ASSET_ANALYSIS_SNAPSHOT_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    policyVersion: M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION,
    analysisId: `m3-multi-asset-analysis:${stableSha256({
      binding,
      opportunity: value.opportunity,
      sourceCutoff: value.sourceCutoff,
      policyVersion: M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION,
    }).slice(0, 24)}`,
    binding,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    opportunity: value.opportunity,
    regime: value.regime,
    directionBias,
    requiredCategories: [...requiredCategories],
    passedCategories: uniqueSorted(passedCategories),
    missingCategories: uniqueSorted(missingCategories),
    supportingEvidenceIds: uniqueSorted(value.observations
      .filter((item) =>
        item.stance === "SUPPORTING" && item.evidence.status === "PASS"
      )
      .map((item) => item.evidence.evidenceId)),
    counterEvidenceIds: uniqueSorted(value.observations
      .filter((item) => item.stance === "CONTRADICTING")
      .map((item) => item.evidence.evidenceId)),
    structuralLevels: [...value.structuralLevels]
      .sort((left, right) => left.levelId.localeCompare(right.levelId)),
    evidenceBlockers: normalizedEvidenceBlockers,
    setupBlockers: normalizedSetupBlockers,
    integrityBlockers: normalizedIntegrityBlockers,
    blockers: normalizedBlockers,
    promotionEligible: false,
    signalLevel: null,
    strategyAuthority: false,
    readyAuthority: false,
  });

  return result({
    schemaVersion: M3_MULTI_ASSET_ANALYSIS_RESULT_VERSION,
    status: normalizedBlockers.length === 0
      ? "ANALYZED_RESEARCH_ONLY"
      : "ABSTAINED_RESEARCH_ONLY",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    analysis: snapshot,
    reasonCodes: normalizedBlockers.length === 0
      ? ["multi_asset_analysis_research_only_complete"]
      : normalizedBlockers,
    issues: [...issues].sort((left, right) =>
      `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
    ),
  });
}
