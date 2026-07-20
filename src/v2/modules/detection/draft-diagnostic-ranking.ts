import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2_DRAFT_DETECTORS,
  M2DraftReplayEvaluationSchema,
  M2DraftReplayKernelInputSchema,
  buildM2DraftReplayInputDigest,
  type M2DraftReplayEvaluation,
  type M2DraftReplayKernelInput,
} from "./draft-replay-contract";

export const M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION =
  "v2-m2-draft-diagnostic-ranking-policy.v1" as const;
export const M2_DRAFT_DIAGNOSTIC_RANKING_ITEM_VERSION =
  "v2-m2-draft-diagnostic-ranking-item.v1" as const;
export const M2_DRAFT_DIAGNOSTIC_RANKING_REPORT_VERSION =
  "v2-m2-draft-diagnostic-ranking-report.v1" as const;

export const M2_DRAFT_DIAGNOSTIC_RANKING_POLICY = deepFreezeArtifact({
  schemaVersion: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
  authority: "DRAFT_REPLAY_DIAGNOSTIC_ONLY",
  scoreMeaning: "RELATIVE_RULE_MARGIN_NOT_PROBABILITY_OR_TRADE_GRADE",
  fixedDetectorDenominatorRequired: true,
  groupingIdentity: [
    "canonicalInstrumentId",
    "opportunityFamily",
    "directionHypothesis",
    "eventCutoff",
  ],
  baseAggregation: "ARITHMETIC_MEAN_OF_RANKABLE_DETECTOR_STRENGTHS",
  consensusBonusPerAdditionalDetector: 0.025,
  consensusBonusMaximum: 0.05,
  topK: 20,
  tieBreak: "STABLE_SHA256_WITH_PUBLIC_FIXED_SALT",
  tieBreakSalt: "market-radar-v2-m2-draft-ranking-v1",
  candidateEmissionAllowed: false,
  runtimeReadAllowed: false,
  futureOutcomeReadAllowed: false,
} as const);

export const M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST = stableContentHash(
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY,
);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

function roundScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

const EvaluationStrengthSchema = z.strictObject({
  evaluationId: NonEmptyStringSchema,
  detectorId: NonEmptyStringSchema,
  opportunityPattern: NonEmptyStringSchema,
  strengthScore: RatioSchema,
});

const RankingItemCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_ITEM_VERSION),
  rankingAuthority: z.literal("DRAFT_REPLAY_DIAGNOSTIC_ONLY"),
  candidateEmissionAllowed: z.literal(false),
  policyVersion: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION),
  policyDigest: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST),
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  opportunityFamily: z.enum(["PRE_MOVE", "BREAKOUT_RETEST"]),
  directionHypothesis: z.enum(["LONG", "SHORT", "UNKNOWN"]),
  eventCutoff: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  inputDigest: DigestSchema,
  evaluationStrengths: z.array(EvaluationStrengthSchema).min(1),
  baseStrength: RatioSchema,
  consensusBonus: RatioSchema,
  rankingScore: RatioSchema,
  tieBreakDigest: DigestSchema,
});

export const M2DraftDiagnosticRankingItemSchema =
  RankingItemCoreSchema.extend({
    itemDigest: DigestSchema,
    rankingItemId: NonEmptyStringSchema,
  }).superRefine((item, context) => {
    const evaluationIds = item.evaluationStrengths.map(
      (strength) => strength.evaluationId,
    );
    const detectorIds = item.evaluationStrengths.map(
      (strength) => strength.detectorId,
    );
    if (
      new Set(evaluationIds).size !== evaluationIds.length ||
      new Set(detectorIds).size !== detectorIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "ranking item evaluation and detector identities must be unique",
        path: ["evaluationStrengths"],
      });
    }
    const baseStrength = roundScore(item.evaluationStrengths.reduce(
      (total, strength) => total + strength.strengthScore,
      0,
    ) / item.evaluationStrengths.length);
    const consensusBonus = roundScore(Math.min(
      M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.consensusBonusMaximum,
      Math.max(0, item.evaluationStrengths.length - 1) *
        M2_DRAFT_DIAGNOSTIC_RANKING_POLICY
          .consensusBonusPerAdditionalDetector,
    ));
    if (Math.abs(item.baseStrength - baseStrength) > 1e-12) {
      context.addIssue({
        code: "custom",
        message: "ranking base strength is inconsistent",
        path: ["baseStrength"],
      });
    }
    if (Math.abs(item.consensusBonus - consensusBonus) > 1e-12) {
      context.addIssue({
        code: "custom",
        message: "ranking consensus bonus is inconsistent",
        path: ["consensusBonus"],
      });
    }
    if (
      Math.abs(item.rankingScore - roundScore(baseStrength + consensusBonus)) >
        1e-12
    ) {
      context.addIssue({
        code: "custom",
        message: "ranking score is inconsistent",
        path: ["rankingScore"],
      });
    }
    const expectedTieBreak = stableContentHash({
      canonicalInstrumentId: item.canonicalInstrumentId,
      directionHypothesis: item.directionHypothesis,
      eventCutoff: item.eventCutoff,
      opportunityFamily: item.opportunityFamily,
      salt: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.tieBreakSalt,
    });
    if (item.tieBreakDigest !== expectedTieBreak) {
      context.addIssue({
        code: "custom",
        message: "ranking tie-break identity is inconsistent",
        path: ["tieBreakDigest"],
      });
    }
    const { itemDigest, rankingItemId, ...core } = item;
    const expectedItemDigest = stableContentHash(core);
    if (itemDigest !== expectedItemDigest) {
      context.addIssue({
        code: "custom",
        message: "ranking item digest mismatch",
        path: ["itemDigest"],
      });
    }
    if (
      rankingItemId !==
        `draft-ranking-item:${expectedItemDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "ranking item identity mismatch",
        path: ["rankingItemId"],
      });
    }
  });

export type M2DraftDiagnosticRankingItem = z.infer<
  typeof M2DraftDiagnosticRankingItemSchema
>;

const RankedItemSchema = z.strictObject({
  rank: z.number().int().positive(),
  item: M2DraftDiagnosticRankingItemSchema,
});

const RankingReportCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_REPORT_VERSION),
  rankingWindowId: NonEmptyStringSchema,
  policyVersion: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION),
  policyDigest: z.literal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST),
  eventCutoff: IsoDateTimeSchema,
  requiredDetectorIds: z.array(NonEmptyStringSchema).min(1),
  sourceCount: z.number().int().positive(),
  evaluationCount: NonNegativeIntegerSchema,
  rankableEvaluationCount: NonNegativeIntegerSchema,
  excludedEvaluationCount: NonNegativeIntegerSchema,
  eligibleItemCount: NonNegativeIntegerSchema,
  k: z.literal(20),
  rankedItems: z.array(RankedItemSchema).max(20),
  candidateEmissionAllowed: z.literal(false),
});

export const M2DraftDiagnosticRankingReportSchema =
  RankingReportCoreSchema.extend({
    reportDigest: DigestSchema,
  }).superRefine((report, context) => {
    if (
      report.rankableEvaluationCount + report.excludedEvaluationCount !==
        report.evaluationCount
    ) {
      context.addIssue({
        code: "custom",
        message: "ranking evaluation denominators are inconsistent",
        path: ["evaluationCount"],
      });
    }
    if (
      report.rankedItems.length !== Math.min(report.k, report.eligibleItemCount)
    ) {
      context.addIssue({
        code: "custom",
        message: "ranking report does not contain the exact top-K denominator",
        path: ["rankedItems"],
      });
    }
    for (const [index, ranked] of report.rankedItems.entries()) {
      if (ranked.rank !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "ranking positions must be contiguous and one-based",
          path: ["rankedItems", index, "rank"],
        });
      }
      if (Date.parse(ranked.item.eventCutoff) !== Date.parse(report.eventCutoff)) {
        context.addIssue({
          code: "custom",
          message: "ranking item cutoff disagrees with its window",
          path: ["rankedItems", index, "item", "eventCutoff"],
        });
      }
      if (index > 0) {
        const previous = report.rankedItems[index - 1]!.item;
        if (
          previous.rankingScore < ranked.item.rankingScore ||
          (previous.rankingScore === ranked.item.rankingScore &&
            previous.tieBreakDigest > ranked.item.tieBreakDigest)
        ) {
          context.addIssue({
            code: "custom",
            message: "ranking items violate score and stable tie-break order",
            path: ["rankedItems", index],
          });
        }
      }
    }
    const { reportDigest, ...core } = report;
    if (reportDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "ranking report digest mismatch",
        path: ["reportDigest"],
      });
    }
  });

export type M2DraftDiagnosticRankingReport = z.infer<
  typeof M2DraftDiagnosticRankingReportSchema
>;

export type M2DraftDiagnosticRankingSource = Readonly<{
  input: M2DraftReplayKernelInput;
  evaluations: readonly M2DraftReplayEvaluation[];
}>;

function buildRankingItem(input: Readonly<{
  sourceInput: M2DraftReplayKernelInput;
  evaluations: readonly M2DraftReplayEvaluation[];
}>): M2DraftDiagnosticRankingItem {
  const first = input.evaluations[0]!;
  const evaluationStrengths = input.evaluations.map((evaluation) => {
    if (
      evaluation.diagnosticStrength.status !== "RANKABLE_MATCH" ||
      evaluation.hypothesis === null
    ) {
      throw new Error("ranking item received an unrankable evaluation");
    }
    return {
      evaluationId: evaluation.evaluationId,
      detectorId: evaluation.detectorId,
      opportunityPattern: evaluation.hypothesis.opportunityPattern,
      strengthScore: evaluation.diagnosticStrength.score,
    };
  }).sort((left, right) => left.detectorId.localeCompare(right.detectorId));
  const baseStrength = roundScore(evaluationStrengths.reduce(
    (total, strength) => total + strength.strengthScore,
    0,
  ) / evaluationStrengths.length);
  const consensusBonus = roundScore(Math.min(
    M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.consensusBonusMaximum,
    Math.max(0, evaluationStrengths.length - 1) *
      M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.consensusBonusPerAdditionalDetector,
  ));
  const directionHypothesis = first.hypothesis!.directionHypothesis;
  const core = RankingItemCoreSchema.parse({
    schemaVersion: M2_DRAFT_DIAGNOSTIC_RANKING_ITEM_VERSION,
    rankingAuthority: "DRAFT_REPLAY_DIAGNOSTIC_ONLY",
    candidateEmissionAllowed: false,
    policyVersion: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
    policyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
    canonicalInstrumentId: input.sourceInput.detectorInput.canonicalInstrumentId,
    underlyingGroupId: input.sourceInput.detectorInput.underlyingGroupId,
    opportunityFamily: first.opportunityFamily,
    directionHypothesis,
    eventCutoff: first.eventCutoff,
    knowledgeCutoff: first.knowledgeCutoff,
    inputDigest: first.inputDigest,
    evaluationStrengths,
    baseStrength,
    consensusBonus,
    rankingScore: roundScore(baseStrength + consensusBonus),
    tieBreakDigest: stableContentHash({
      canonicalInstrumentId:
        input.sourceInput.detectorInput.canonicalInstrumentId,
      directionHypothesis,
      eventCutoff: first.eventCutoff,
      opportunityFamily: first.opportunityFamily,
      salt: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.tieBreakSalt,
    }),
  });
  const itemDigest = stableContentHash(core);
  return deepFreezeArtifact(M2DraftDiagnosticRankingItemSchema.parse({
    ...core,
    itemDigest,
    rankingItemId:
      `draft-ranking-item:${itemDigest.slice("sha256:".length)}`,
  }));
}

export function rankM2DraftReplayDiagnostics(input: Readonly<{
  rankingWindowId: string;
  requiredDetectorIds: readonly string[];
  sources: readonly M2DraftDiagnosticRankingSource[];
}>): M2DraftDiagnosticRankingReport {
  if (input.sources.length === 0) {
    throw new Error("diagnostic ranking requires at least one source");
  }
  const registeredDetectorIds = new Set<string>(Object.values(M2_DRAFT_DETECTORS).map(
    (detector) => detector.detectorId,
  ));
  const requiredDetectorIds = [...input.requiredDetectorIds].sort();
  if (
    requiredDetectorIds.length === 0 ||
    new Set(requiredDetectorIds).size !== requiredDetectorIds.length ||
    requiredDetectorIds.some((id) => !registeredDetectorIds.has(id))
  ) {
    throw new Error("diagnostic ranking detector denominator is invalid");
  }
  const parsedSources = input.sources.map((source) => ({
    input: M2DraftReplayKernelInputSchema.parse(source.input),
    evaluations: source.evaluations.map((evaluation) =>
      M2DraftReplayEvaluationSchema.parse(evaluation)),
  }));
  const eventCutoff = parsedSources[0]!.input.detectorInput.eventCutoff;
  const sourceIdentities = new Set<string>();
  const items: M2DraftDiagnosticRankingItem[] = [];
  let evaluationCount = 0;
  let rankableEvaluationCount = 0;
  for (const source of parsedSources) {
    const sourceIdentity =
      `${source.input.detectorInput.canonicalInstrumentId}:${source.input.detectorInput.eventCutoff}`;
    if (sourceIdentities.has(sourceIdentity)) {
      throw new Error("diagnostic ranking source identity is duplicated");
    }
    sourceIdentities.add(sourceIdentity);
    if (Date.parse(source.input.detectorInput.eventCutoff) !==
      Date.parse(eventCutoff)) {
      throw new Error("diagnostic ranking sources must share one event cutoff");
    }
    const actualDetectorIds = source.evaluations.map(
      (evaluation) => evaluation.detectorId,
    ).sort();
    if (
      actualDetectorIds.length !== requiredDetectorIds.length ||
      actualDetectorIds.some((id, index) => id !== requiredDetectorIds[index])
    ) {
      throw new Error("diagnostic ranking source omitted its fixed detector denominator");
    }
    const expectedInputDigest = buildM2DraftReplayInputDigest(source.input);
    for (const evaluation of source.evaluations) {
      if (
        evaluation.inputDigest !== expectedInputDigest ||
        Date.parse(evaluation.eventCutoff) !== Date.parse(eventCutoff) ||
        Date.parse(evaluation.knowledgeCutoff) !==
          Date.parse(source.input.detectorInput.knowledgeCutoff)
      ) {
        throw new Error("diagnostic ranking evaluation escaped its point-in-time input");
      }
    }
    evaluationCount += source.evaluations.length;
    const rankable = source.evaluations.filter((evaluation) =>
      evaluation.diagnosticStrength.status === "RANKABLE_MATCH" &&
      evaluation.hypothesis !== null);
    rankableEvaluationCount += rankable.length;
    const groups = new Map<string, M2DraftReplayEvaluation[]>();
    for (const evaluation of rankable) {
      const key =
        `${evaluation.opportunityFamily}:${evaluation.hypothesis!.directionHypothesis}`;
      groups.set(key, [...(groups.get(key) ?? []), evaluation]);
    }
    for (const evaluations of groups.values()) {
      items.push(buildRankingItem({
        sourceInput: source.input,
        evaluations,
      }));
    }
  }
  const orderedItems = [...items].sort((left, right) =>
    right.rankingScore - left.rankingScore ||
    left.tieBreakDigest.localeCompare(right.tieBreakDigest));
  const rankedItems = orderedItems
    .slice(0, M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.topK)
    .map((item, index) => ({ rank: index + 1, item }));
  const core = RankingReportCoreSchema.parse({
    schemaVersion: M2_DRAFT_DIAGNOSTIC_RANKING_REPORT_VERSION,
    rankingWindowId: input.rankingWindowId,
    policyVersion: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
    policyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
    eventCutoff,
    requiredDetectorIds,
    sourceCount: parsedSources.length,
    evaluationCount,
    rankableEvaluationCount,
    excludedEvaluationCount: evaluationCount - rankableEvaluationCount,
    eligibleItemCount: orderedItems.length,
    k: 20,
    rankedItems,
    candidateEmissionAllowed: false,
  });
  return deepFreezeArtifact(M2DraftDiagnosticRankingReportSchema.parse({
    ...core,
    reportDigest: stableContentHash(core),
  }));
}
