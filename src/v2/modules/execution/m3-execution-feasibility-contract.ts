import { z } from "zod";
import type {
  ExecutionFeasibilitySnapshot,
  FeasibilityCheck,
  MarketContextSnapshot,
  QualityAssessment,
  StrategyDraft,
} from "../../domain/contracts";
import {
  OPPORTUNITY_FAMILIES,
  TARGET_VENUES,
} from "../../domain/product-constitution";
import {
  ExecutionFeasibilitySnapshotSchema,
  StrategyDraftSchema,
} from "../../runtime-schema/decision-schemas";
import { MarketContextSnapshotSchema } from "../../runtime-schema/foundation-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
  compareNonNegativeDecimalStrings,
} from "../../runtime-schema/primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  calculateAdverseDistanceBpsCeil,
  calculateConservativeRewardRisk,
  calculateSpreadBpsCeil,
  multiplyDecimalByBps,
} from "../strategy/m3-exact-price-math";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_EXECUTION_COST_MODEL_VERSION,
  M3_EXECUTION_FEASIBILITY_MODE,
  M3_EXECUTION_FEASIBILITY_POLICY_VERSION,
  M3_EXECUTION_TEST_THRESHOLDS,
  M3_EXECUTION_THRESHOLD_VERSION,
} from "./m3-execution-feasibility-policy";

export const M3_EXECUTION_FACT_SNAPSHOT_VERSION =
  "m3-execution-fact-snapshot.v1" as const;
export const M3_EXECUTION_FEASIBILITY_INPUT_VERSION =
  "m3-execution-feasibility-input.v1" as const;
export const M3_EXECUTION_FEASIBILITY_RESULT_VERSION =
  "m3-execution-feasibility-result.v1" as const;

const FactIdsSchema = z.array(NonEmptyStringSchema).min(1).superRefine(
  (factIds, context) => {
    if (new Set(factIds).size !== factIds.length) {
      context.addIssue({
        code: "custom",
        message: "fact ids must be unique within each lineage category",
      });
    }
  },
);

export const M3ExecutionFactLineageSchema = z.strictObject({
  quoteFactIds: FactIdsSchema,
  depthFactIds: FactIdsSchema,
  feeFactIds: FactIdsSchema,
  fundingFactIds: FactIdsSchema,
  venueStatusFactIds: FactIdsSchema,
  fillabilityFactIds: FactIdsSchema,
  gapRiskFactIds: FactIdsSchema,
  stopSweepRiskFactIds: FactIdsSchema,
});

export const M3ExecutionFactSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(M3_EXECUTION_FACT_SNAPSHOT_VERSION),
  authority: z.literal("TEST_FIXTURE_ONLY"),
  canonicalInstrumentId: NonEmptyStringSchema,
  venue: z.enum(TARGET_VENUES),
  observedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  markPrice: PositiveDecimalStringSchema,
  bestBidPrice: PositiveDecimalStringSchema,
  bestAskPrice: PositiveDecimalStringSchema,
  depthAtMaximumSlippageNotional: PositiveDecimalStringSchema,
  estimatedSlippagePerSideBps: z.number().int().nonnegative().max(9_999),
  feePerSideBps: z.number().int().nonnegative().max(9_999),
  conservativeFundingCostBps: z.number().int().nonnegative().max(9_999),
  venueStatus: z.enum(["TRADING", "HALTED", "MAINTENANCE", "UNKNOWN"]),
  fillabilityStatus: z.enum(["LIKELY", "UNCERTAIN", "UNLIKELY", "UNKNOWN"]),
  fillabilityModelVersion: NonEmptyStringSchema,
  fillabilityModelAuthority: z.literal("TEST_ONLY_UNCALIBRATED"),
  gapRisk: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  stopSweepRisk: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  lineage: M3ExecutionFactLineageSchema,
  quality: QualityAssessmentSchema,
}).superRefine((facts, context) => {
  if (Date.parse(facts.sourceCutoff) > Date.parse(facts.observedAt)) {
    context.addIssue({
      code: "custom",
      message: "execution facts cannot be observed before their source cutoff",
      path: ["observedAt"],
    });
  }
  if (
    compareNonNegativeDecimalStrings(
      facts.bestBidPrice,
      facts.bestAskPrice,
    ) >= 0
  ) {
    context.addIssue({
      code: "custom",
      message: "best bid must be below best ask",
      path: ["bestAskPrice"],
    });
  }
});

export const M3ExecutionFeasibilityInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_EXECUTION_FEASIBILITY_INPUT_VERSION),
  executionMode: z.literal(M3_EXECUTION_FEASIBILITY_MODE),
  policyVersion: z.literal(M3_EXECUTION_FEASIBILITY_POLICY_VERSION),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  episodeId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  draft: StrategyDraftSchema,
  marketContext: MarketContextSnapshotSchema,
  executionFacts: M3ExecutionFactSnapshotSchema,
});

export type M3ExecutionFeasibilityInput = z.infer<
  typeof M3ExecutionFeasibilityInputSchema
>;

export type M3ExecutionFeasibilityIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3ExecutionFeasibilityResult = Readonly<{
  schemaVersion: typeof M3_EXECUTION_FEASIBILITY_RESULT_VERSION;
  status: "EVALUATED_TEST_ONLY" | "BLOCKED";
  authority: "TEST_ONLY_NO_READY_AUTHORITY";
  snapshot: ExecutionFeasibilitySnapshot | null;
  reasonCodes: readonly string[];
  issues: readonly M3ExecutionFeasibilityIssue[];
  resultHash: string;
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function issue(
  issues: M3ExecutionFeasibilityIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function allInputFactIds(
  lineage: z.infer<typeof M3ExecutionFactLineageSchema>,
): string[] {
  return uniqueSorted(Object.values(lineage).flat());
}

function validateIntegrity(
  input: M3ExecutionFeasibilityInput,
): M3ExecutionFeasibilityIssue[] {
  const issues: M3ExecutionFeasibilityIssue[] = [];
  const { draft, executionFacts, marketContext } = input;
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    issue(
      issues,
      "execution_feasibility_generated_before_cutoff",
      "generatedAt",
      "execution feasibility cannot be generated before its source cutoff",
    );
  }
  for (const [path, artifact] of [
    ["draft", draft],
    ["marketContext", marketContext],
  ] as const) {
    if (artifact.releaseId !== input.releaseId) {
      issue(
        issues,
        "cross_release_execution_input",
        `${path}.releaseId`,
        "execution feasibility cannot compose another release",
      );
    }
    if (
      Date.parse(artifact.sourceCutoff) > Date.parse(input.sourceCutoff) ||
      Date.parse(artifact.generatedAt) > Date.parse(input.generatedAt)
    ) {
      issue(
        issues,
        "execution_input_not_available_at_cutoff",
        path,
        "execution feasibility cannot consume a future artifact",
      );
    }
  }
  if (
    draft.episodeId !== input.episodeId ||
    draft.opportunityFamily !== input.opportunityFamily
  ) {
    issue(
      issues,
      "execution_strategy_identity_mismatch",
      "draft",
      "execution feasibility must preserve StrategyDraft Episode and family",
    );
  }
  if (
    executionFacts.canonicalInstrumentId !== input.canonicalInstrumentId
  ) {
    issue(
      issues,
      "execution_instrument_identity_mismatch",
      "executionFacts.canonicalInstrumentId",
      "execution facts must belong to the requested canonical instrument",
    );
  }
  if (
    Date.parse(executionFacts.sourceCutoff) >
      Date.parse(input.sourceCutoff) ||
    Date.parse(executionFacts.observedAt) > Date.parse(input.generatedAt)
  ) {
    issue(
      issues,
      "execution_fact_from_future",
      "executionFacts",
      "execution facts must be available by the feasibility cutoff",
    );
  }
  if (
    Date.parse(executionFacts.sourceCutoff) <
      Date.parse(draft.sourceCutoff) ||
    Date.parse(executionFacts.observedAt) < Date.parse(draft.generatedAt)
  ) {
    issue(
      issues,
      "execution_fact_predates_strategy",
      "executionFacts",
      "execution facts must be observed after StrategyDraft construction",
    );
  }
  if (draft.strategyAuthority !== "TEST_ONLY_UNCALIBRATED") {
    issue(
      issues,
      "execution_input_authority_exceeds_current_mode",
      "draft.strategyAuthority",
      "the current feasibility builder accepts only test-only drafts",
    );
  }
  return issues;
}

function check(
  input: Readonly<{
    checkId: FeasibilityCheck["checkId"];
    status: FeasibilityCheck["status"];
    observedValue: string | number | null;
    observedUnit: string;
    comparator: FeasibilityCheck["comparator"];
    thresholdValue: string | number | null;
    sourceFactIds: readonly string[];
    quality: QualityAssessment;
    reasonCodes: readonly string[];
  }>,
): FeasibilityCheck {
  return {
    ...input,
    thresholdVersion: M3_EXECUTION_THRESHOLD_VERSION,
    sourceFactIds: uniqueSorted(input.sourceFactIds),
    reasonCodes: uniqueSorted(input.reasonCodes),
  };
}

function thresholdStatus(
  passed: boolean,
  quality: QualityAssessment,
): FeasibilityCheck["status"] {
  return quality.status === "FRESH"
    ? passed
      ? "PASS"
      : "FAIL"
    : "UNAVAILABLE";
}

function categoricalRiskStatus(
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN",
  quality: QualityAssessment,
): FeasibilityCheck["status"] {
  if (quality.status !== "FRESH" || risk === "UNKNOWN") {
    return "UNAVAILABLE";
  }
  return risk === "LOW" ? "PASS" : "FAIL";
}

function aggregateQuality(
  executionQuality: QualityAssessment,
  marketQuality: QualityAssessment,
): QualityAssessment {
  if (
    executionQuality.status === "FRESH" &&
    marketQuality.status === "FRESH"
  ) {
    return {
      status: "FRESH",
      ageMs: Math.max(
        executionQuality.ageMs ?? 0,
        marketQuality.ageMs ?? 0,
      ),
      reasonCodes: uniqueSorted([
        ...executionQuality.reasonCodes,
        ...marketQuality.reasonCodes,
      ]),
    };
  }
  const failing = executionQuality.status !== "FRESH"
    ? executionQuality
    : marketQuality;
  return {
    status: failing.status,
    ageMs: failing.ageMs,
    reasonCodes: uniqueSorted([
      ...executionQuality.reasonCodes,
      ...marketQuality.reasonCodes,
      "execution_feasibility_input_not_fresh",
    ]),
  };
}

function buildChecks(
  input: M3ExecutionFeasibilityInput,
): Readonly<{
  checks: readonly FeasibilityCheck[];
  conservativeEntryPrice: string;
  estimatedNetRewardRisk: number | null;
  maximumExecutableNotional: string | null;
  estimatedAllInCostBps: number;
}> {
  const { draft, executionFacts: facts, marketContext } = input;
  const threshold = M3_EXECUTION_TEST_THRESHOLDS;
  const factIds = allInputFactIds(facts.lineage);
  const factsFresh =
    facts.quality.status === "FRESH" &&
    facts.quality.ageMs !== null &&
    facts.quality.ageMs <= threshold.maximumExecutionFactAgeMs;
  const pointInTimeStatus: FeasibilityCheck["status"] = factsFresh
    ? "PASS"
    : "UNAVAILABLE";
  const spreadBps = calculateSpreadBpsCeil(
    facts.bestBidPrice,
    facts.bestAskPrice,
  );
  const depthPass =
    compareNonNegativeDecimalStrings(
      facts.depthAtMaximumSlippageNotional,
      threshold.minimumDepthAtMaximumSlippageNotional,
    ) >= 0;
  const conservativeEntryPrice = draft.direction === "LONG"
    ? draft.plannedEntryZone.upper
    : draft.plannedEntryZone.lower;
  const adverseDriftBps = calculateAdverseDistanceBpsCeil(
    facts.markPrice,
    conservativeEntryPrice,
    draft.direction,
  );
  const rewardRisk = factsFresh
    ? calculateConservativeRewardRisk({
      direction: draft.direction,
      conservativeEntryPrice,
      structuralStop: draft.structuralStop,
      targets: draft.targets,
      feePerSideBps: facts.feePerSideBps,
      slippagePerSideBps: facts.estimatedSlippagePerSideBps,
      fundingBps: facts.conservativeFundingCostBps,
      precision: threshold.rewardRiskPrecision,
    })
    : null;
  const executionQuality = facts.quality;
  const checks = [
    check({
      checkId: "POINT_IN_TIME_FACTS",
      status: pointInTimeStatus,
      observedValue: facts.quality.ageMs,
      observedUnit: "milliseconds",
      comparator: "LTE",
      thresholdValue: threshold.maximumExecutionFactAgeMs,
      sourceFactIds: factIds,
      quality: executionQuality,
      reasonCodes: [
        factsFresh
          ? "execution_facts_fresh"
          : "execution_facts_not_fresh_or_age_unknown",
      ],
    }),
    check({
      checkId: "VENUE_TRADING_STATUS",
      status: facts.quality.status !== "FRESH" || facts.venueStatus === "UNKNOWN"
        ? "UNAVAILABLE"
        : facts.venueStatus === "TRADING"
          ? "PASS"
          : "FAIL",
      observedValue: facts.venueStatus,
      observedUnit: "state",
      comparator: "EQ",
      thresholdValue: "TRADING",
      sourceFactIds: facts.lineage.venueStatusFactIds,
      quality: executionQuality,
      reasonCodes: [`venue_status_${facts.venueStatus.toLowerCase()}`],
    }),
    check({
      checkId: "SPREAD",
      status: thresholdStatus(
        spreadBps <= threshold.maximumSpreadBps,
        executionQuality,
      ),
      observedValue: spreadBps,
      observedUnit: "bps",
      comparator: "LTE",
      thresholdValue: threshold.maximumSpreadBps,
      sourceFactIds: facts.lineage.quoteFactIds,
      quality: executionQuality,
      reasonCodes: [
        spreadBps <= threshold.maximumSpreadBps
          ? "spread_within_test_limit"
          : "spread_above_test_limit",
      ],
    }),
    check({
      checkId: "DEPTH",
      status: thresholdStatus(depthPass, executionQuality),
      observedValue: facts.depthAtMaximumSlippageNotional,
      observedUnit: "quote_notional",
      comparator: "GTE",
      thresholdValue: threshold.minimumDepthAtMaximumSlippageNotional,
      sourceFactIds: facts.lineage.depthFactIds,
      quality: executionQuality,
      reasonCodes: [
        depthPass
          ? "depth_within_test_requirement"
          : "depth_below_test_requirement",
      ],
    }),
    check({
      checkId: "SLIPPAGE",
      status: thresholdStatus(
        facts.estimatedSlippagePerSideBps <=
          threshold.maximumSlippagePerSideBps,
        executionQuality,
      ),
      observedValue: facts.estimatedSlippagePerSideBps,
      observedUnit: "bps_per_side",
      comparator: "LTE",
      thresholdValue: threshold.maximumSlippagePerSideBps,
      sourceFactIds: facts.lineage.depthFactIds,
      quality: executionQuality,
      reasonCodes: [
        facts.estimatedSlippagePerSideBps <=
          threshold.maximumSlippagePerSideBps
          ? "slippage_within_test_limit"
          : "slippage_above_test_limit",
      ],
    }),
    check({
      checkId: "FEE_SCHEDULE",
      status: thresholdStatus(
        facts.feePerSideBps <= threshold.maximumFeePerSideBps,
        executionQuality,
      ),
      observedValue: facts.feePerSideBps,
      observedUnit: "bps_per_side",
      comparator: "LTE",
      thresholdValue: threshold.maximumFeePerSideBps,
      sourceFactIds: facts.lineage.feeFactIds,
      quality: executionQuality,
      reasonCodes: [
        facts.feePerSideBps <= threshold.maximumFeePerSideBps
          ? "fee_schedule_within_test_limit"
          : "fee_schedule_above_test_limit",
      ],
    }),
    check({
      checkId: "FUNDING_COST",
      status: thresholdStatus(
        facts.conservativeFundingCostBps <=
          threshold.maximumConservativeFundingCostBps,
        executionQuality,
      ),
      observedValue: facts.conservativeFundingCostBps,
      observedUnit: "bps",
      comparator: "LTE",
      thresholdValue: threshold.maximumConservativeFundingCostBps,
      sourceFactIds: facts.lineage.fundingFactIds,
      quality: executionQuality,
      reasonCodes: [
        facts.conservativeFundingCostBps <=
          threshold.maximumConservativeFundingCostBps
          ? "funding_cost_within_test_limit"
          : "funding_cost_above_test_limit",
      ],
    }),
    check({
      checkId: "FILLABILITY",
      status:
        facts.quality.status !== "FRESH" ||
          facts.fillabilityStatus === "UNKNOWN" ||
          facts.fillabilityStatus === "UNCERTAIN"
          ? "UNAVAILABLE"
          : facts.fillabilityStatus === "LIKELY"
            ? "PASS"
            : "FAIL",
      observedValue: facts.fillabilityStatus,
      observedUnit: "model_state",
      comparator: "EQ",
      thresholdValue: "LIKELY",
      sourceFactIds: facts.lineage.fillabilityFactIds,
      quality: executionQuality,
      reasonCodes: [
        `fillability_${facts.fillabilityStatus.toLowerCase()}`,
        "fillability_model_test_only_uncalibrated",
      ],
    }),
    check({
      checkId: "PRICE_DRIFT",
      status: thresholdStatus(
        adverseDriftBps <= threshold.maximumAdversePriceDriftBps,
        executionQuality,
      ),
      observedValue: adverseDriftBps,
      observedUnit: "adverse_bps",
      comparator: "LTE",
      thresholdValue: threshold.maximumAdversePriceDriftBps,
      sourceFactIds: facts.lineage.quoteFactIds,
      quality: executionQuality,
      reasonCodes: [
        adverseDriftBps <= threshold.maximumAdversePriceDriftBps
          ? "price_not_chased_beyond_test_limit"
          : "price_chased_beyond_test_limit",
      ],
    }),
    check({
      checkId: "GAP_RISK",
      status: categoricalRiskStatus(facts.gapRisk, executionQuality),
      observedValue: facts.gapRisk,
      observedUnit: "risk_state",
      comparator: "EQ",
      thresholdValue: "LOW",
      sourceFactIds: facts.lineage.gapRiskFactIds,
      quality: executionQuality,
      reasonCodes: [`gap_risk_${facts.gapRisk.toLowerCase()}`],
    }),
    check({
      checkId: "STOP_SWEEP_RISK",
      status: categoricalRiskStatus(facts.stopSweepRisk, executionQuality),
      observedValue: facts.stopSweepRisk,
      observedUnit: "risk_state",
      comparator: "EQ",
      thresholdValue: "LOW",
      sourceFactIds: facts.lineage.stopSweepRiskFactIds,
      quality: executionQuality,
      reasonCodes: [
        `stop_sweep_risk_${facts.stopSweepRisk.toLowerCase()}`,
      ],
    }),
    check({
      checkId: "MARKET_LIQUIDITY",
      status:
        marketContext.quality.status !== "FRESH" ||
          marketContext.liquidity === "UNKNOWN"
          ? "UNAVAILABLE"
          : marketContext.liquidity === "HEALTHY"
            ? "PASS"
            : "FAIL",
      observedValue: marketContext.liquidity,
      observedUnit: "context_state",
      comparator: "EQ",
      thresholdValue: "HEALTHY",
      sourceFactIds: [],
      quality: marketContext.quality,
      reasonCodes: [
        `market_liquidity_${marketContext.liquidity.toLowerCase()}`,
      ],
    }),
    check({
      checkId: "NET_REWARD_RISK",
      status: rewardRisk === null
        ? "UNAVAILABLE"
        : rewardRisk.estimatedNetRewardRisk >=
            threshold.minimumEstimatedNetRewardRisk
          ? "PASS"
          : "FAIL",
      observedValue: rewardRisk?.estimatedNetRewardRisk ?? null,
      observedUnit: "reward_risk_ratio",
      comparator: "GTE",
      thresholdValue: threshold.minimumEstimatedNetRewardRisk,
      sourceFactIds: uniqueSorted([
        ...facts.lineage.feeFactIds,
        ...facts.lineage.fundingFactIds,
        ...facts.lineage.depthFactIds,
      ]),
      quality: executionQuality,
      reasonCodes: [
        rewardRisk === null
          ? "net_reward_risk_unavailable"
          : rewardRisk.estimatedNetRewardRisk >=
              threshold.minimumEstimatedNetRewardRisk
            ? "net_reward_risk_meets_test_minimum"
            : "net_reward_risk_below_test_minimum",
      ],
    }),
  ] as const satisfies readonly FeasibilityCheck[];

  return {
    checks,
    conservativeEntryPrice,
    estimatedNetRewardRisk: rewardRisk?.estimatedNetRewardRisk ?? null,
    maximumExecutableNotional:
      factsFresh && depthPass
        ? multiplyDecimalByBps(
          facts.depthAtMaximumSlippageNotional,
          threshold.executableDepthParticipationBps,
          "FLOOR",
          2,
        )
        : null,
    estimatedAllInCostBps:
      2 * facts.feePerSideBps +
      2 * facts.estimatedSlippagePerSideBps +
      facts.conservativeFundingCostBps,
  };
}

function blockedResult(
  issues: readonly M3ExecutionFeasibilityIssue[],
): M3ExecutionFeasibilityResult {
  const sortedIssues = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
  const body = {
    schemaVersion: M3_EXECUTION_FEASIBILITY_RESULT_VERSION,
    status: "BLOCKED" as const,
    authority: "TEST_ONLY_NO_READY_AUTHORITY" as const,
    snapshot: null,
    reasonCodes: uniqueSorted(sortedIssues.map((item) => item.code)),
    issues: sortedIssues,
  };
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

function buildSnapshot(
  input: M3ExecutionFeasibilityInput,
): ExecutionFeasibilitySnapshot {
  const calculation = buildChecks(input);
  const status: ExecutionFeasibilitySnapshot["status"] =
    calculation.checks.some((item) => item.status === "FAIL")
      ? "FAIL"
      : calculation.checks.some((item) => item.status === "UNAVAILABLE")
        ? "UNAVAILABLE"
        : "PASS";
  const failedOrUnavailableReasons = calculation.checks
    .filter((item) => item.status !== "PASS")
    .flatMap((item) => item.reasonCodes);
  const blockers = uniqueSorted([
    "execution_feasibility_authority_test_only_uncalibrated",
    "execution_thresholds_uncalibrated",
    "fillability_model_uncalibrated",
    ...(status === "FAIL" ? ["execution_feasibility_failed"] : []),
    ...(status === "UNAVAILABLE"
      ? ["execution_feasibility_unavailable"]
      : []),
    ...failedOrUnavailableReasons,
  ]);
  const quality = aggregateQuality(
    input.executionFacts.quality,
    input.marketContext.quality,
  );
  const inputFactIds = allInputFactIds(input.executionFacts.lineage);
  const content = {
    releaseId: input.releaseId,
    sourceCutoff: input.sourceCutoff,
    episodeId: input.episodeId,
    draftId: input.draft.draftId,
    canonicalInstrumentId: input.canonicalInstrumentId,
    venue: input.executionFacts.venue,
    opportunityFamily: input.opportunityFamily,
    feasibilityAuthority: "TEST_ONLY_UNCALIBRATED" as const,
    feasibilityPolicyVersion: M3_EXECUTION_FEASIBILITY_POLICY_VERSION,
    executionCostModelVersion: M3_EXECUTION_COST_MODEL_VERSION,
    status,
    checks: calculation.checks,
    conservativeEntryPrice: calculation.conservativeEntryPrice,
    executionFeePerSideBps: input.executionFacts.feePerSideBps,
    estimatedSlippagePerSideBps:
      input.executionFacts.estimatedSlippagePerSideBps,
    conservativeFundingCostBps:
      input.executionFacts.conservativeFundingCostBps,
    estimatedAllInCostBps: calculation.estimatedAllInCostBps,
    estimatedNetRewardRisk: calculation.estimatedNetRewardRisk,
    maximumExecutableNotional: calculation.maximumExecutableNotional,
    inputFactIds,
    blockers,
    quality,
    uncertainty: {
      ...input.marketContext.uncertainty,
      execution: {
        dimension: "execution" as const,
        status: "HIGH" as const,
        reasonCodes: [
          "execution_feasibility_test_only_uncalibrated",
          "fillability_model_test_only_uncalibrated",
        ],
        sampleSize: null,
        calibrationVersion: null,
        lastValidatedAt: null,
      },
    },
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(ExecutionFeasibilitySnapshotSchema.parse({
    schemaVersion:
      RUNTIME_OBJECT_SCHEMA_VERSIONS.ExecutionFeasibilitySnapshot,
    producerModule: "execution_feasibility_final_decision",
    generatedAt: input.generatedAt,
    contentHash: stableContentHash(content),
    feasibilityId: `execution-feasibility:${digest.slice(0, 24)}`,
    ...content,
  }));
}

export function assessM3ExecutionFeasibility(
  input: unknown,
): M3ExecutionFeasibilityResult {
  const parsed = M3ExecutionFeasibilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return blockedResult(parsed.error.issues.map((schemaIssue) => ({
      code: "execution_feasibility_input_schema_rejected",
      path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }
  const integrityIssues = validateIntegrity(parsed.data);
  if (integrityIssues.length > 0) {
    return blockedResult(integrityIssues);
  }
  let snapshot: ExecutionFeasibilitySnapshot;
  try {
    snapshot = buildSnapshot(parsed.data);
  } catch (error) {
    return blockedResult([{
      code: "execution_feasibility_calculation_rejected",
      path: "executionFacts",
      message: error instanceof Error
        ? error.message
        : "execution feasibility calculation failed",
    }]);
  }
  const body = {
    schemaVersion: M3_EXECUTION_FEASIBILITY_RESULT_VERSION,
    status: "EVALUATED_TEST_ONLY" as const,
    authority: "TEST_ONLY_NO_READY_AUTHORITY" as const,
    snapshot,
    reasonCodes: snapshot.blockers,
    issues: [] as readonly M3ExecutionFeasibilityIssue[],
  };
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

export type {
  MarketContextSnapshot,
  StrategyDraft,
};
