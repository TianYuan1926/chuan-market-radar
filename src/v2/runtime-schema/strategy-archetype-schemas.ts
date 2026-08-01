import { z } from "zod";
import {
  M3_STRATEGY_TEST_SCOPE_EPOCH,
  STRATEGY_ARCHETYPE_DEFINITIONS,
  STRATEGY_ARCHETYPE_IDS,
  STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION,
  STRATEGY_ARCHETYPE_REASON_CODES,
  STRATEGY_ARCHETYPE_TAXONOMY_VERSION,
  STRATEGY_CONTEXT_ASSET_DOMAINS,
  STRATEGY_CONTEXT_COUNTER_EVIDENCE_FLAGS,
  STRATEGY_CONTEXT_EVIDENCE_DRIVERS,
  STRATEGY_CONTEXT_EXECUTION_CONSTRAINTS,
  STRATEGY_CONTEXT_LIQUIDITY_BUCKETS,
  STRATEGY_CONTEXT_LISTING_LIFECYCLES,
  STRATEGY_CONTEXT_MARKET_STAGES,
  STRATEGY_CONTEXT_REGIMES,
  STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION,
  STRATEGY_CONTEXT_TAXONOMY_VERSION,
  STRATEGY_CONTEXT_TIMEFRAME_ALIGNMENTS,
  STRATEGY_CONTEXT_UNBOUND_DIMENSIONS,
  STRATEGY_CONTEXT_VENUES,
  STRATEGY_CONTEXT_VOLATILITY_STATES,
  STRATEGY_STATE_LABEL_SCHEMA_VERSION,
  STRATEGY_STATE_LOCALIZATION_KEYS,
  STRATEGY_STRUCTURE_INTERACTIONS,
  STRATEGY_TRIGGER_PATTERNS,
  type StrategyArchetypeId,
  type StrategyArchetypeLabel,
  type StrategyContextTags,
  type StrategyStateLabel,
} from "../domain/strategy-archetype";
import { OPPORTUNITY_FAMILIES } from "../domain/product-constitution";
import { ACTION_STATES, type ActionState } from "../domain/states";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "./primitives";

const ARCHETYPE_ALLOWED_FAMILIES = Object.freeze({
  BREAKOUT_RETEST_LONG: ["BREAKOUT_RETEST"],
  BREAKDOWN_RETEST_SHORT: ["BREAKOUT_RETEST"],
  SUPPORT_BOUNCE_LONG: [
    "REVERSAL_RANGE",
    "RELATIVE_STRENGTH",
    "DERIVATIVES_FLOW",
  ],
  RESISTANCE_REJECTION_SHORT: [
    "REVERSAL_RANGE",
    "RELATIVE_STRENGTH",
    "DERIVATIVES_FLOW",
  ],
  TREND_PULLBACK_CONTINUATION_LONG: ["TREND_CONTINUATION"],
  TREND_RALLY_CONTINUATION_SHORT: ["TREND_CONTINUATION"],
  FAILED_BREAKDOWN_REVERSAL_LONG: ["REVERSAL_RANGE"],
  FAILED_BREAKOUT_REVERSAL_SHORT: ["REVERSAL_RANGE"],
  RANGE_LOW_REVERSAL_LONG: [
    "REVERSAL_RANGE",
    "RELATIVE_STRENGTH",
    "DERIVATIVES_FLOW",
  ],
  RANGE_HIGH_REVERSAL_SHORT: [
    "REVERSAL_RANGE",
    "RELATIVE_STRENGTH",
    "DERIVATIVES_FLOW",
  ],
  COMPRESSION_EXPANSION_LONG: ["PRE_MOVE"],
  COMPRESSION_EXPANSION_SHORT: ["PRE_MOVE"],
  LIQUIDITY_SWEEP_RECLAIM_LONG: ["REVERSAL_RANGE"],
  LIQUIDITY_SWEEP_REJECT_SHORT: ["REVERSAL_RANGE"],
} as const satisfies Record<StrategyArchetypeId, readonly string[]>);

function isUniqueSorted(values: readonly string[]): boolean {
  return values.every((value, index) =>
    index === 0 || values[index - 1]!.localeCompare(value) < 0
  );
}

export function strategyArchetypeContentHash(
  label: Omit<StrategyArchetypeLabel, "contentHash">,
): string {
  return stableContentHash(label);
}

export function strategyContextTagsContentHash(
  tags: Omit<StrategyContextTags, "contentHash">,
): string {
  return stableContentHash(tags);
}

export const StrategyArchetypeLabelSchema = z.strictObject({
  schemaVersion: z.literal(STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION),
  id: z.enum(STRATEGY_ARCHETYPE_IDS),
  taxonomyVersion: z.literal(STRATEGY_ARCHETYPE_TAXONOMY_VERSION),
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  direction: z.enum(["LONG", "SHORT"]),
  structureInteraction: z.enum(STRATEGY_STRUCTURE_INTERACTIONS),
  triggerPattern: z.enum(STRATEGY_TRIGGER_PATTERNS),
  reasonCodes: z.array(z.enum(STRATEGY_ARCHETYPE_REASON_CODES)).min(1),
  analysisSnapshotId: NonEmptyStringSchema,
  signalQualificationId: NonEmptyStringSchema,
  evidencePackageId: NonEmptyStringSchema,
  structuralLevelIds: z.array(NonEmptyStringSchema).min(1),
  policyVersion: NonEmptyStringSchema,
  generatorVersion: NonEmptyStringSchema,
  releaseIdentity: NonEmptyStringSchema,
  scopeEpoch: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  contentHash: NonEmptyStringSchema,
}).superRefine((label, context) => {
  const definition = STRATEGY_ARCHETYPE_DEFINITIONS[label.id];
  if (
    label.direction !== definition.direction ||
    label.structureInteraction !== definition.structureInteraction ||
    label.triggerPattern !== definition.triggerPattern
  ) {
    context.addIssue({
      code: "custom",
      message: "strategy archetype fields must match the canonical taxonomy definition",
      path: ["id"],
    });
  }
  if (
    !(ARCHETYPE_ALLOWED_FAMILIES[label.id] as readonly string[]).includes(
      label.opportunityFamily,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "strategy archetype is not valid for the declared opportunity family",
      path: ["opportunityFamily"],
    });
  }
  for (const [path, values] of [
    ["reasonCodes", label.reasonCodes],
    ["structuralLevelIds", label.structuralLevelIds],
  ] as const) {
    if (!isUniqueSorted(values)) {
      context.addIssue({
        code: "custom",
        message: `${path} must be unique and canonically sorted`,
        path: [path],
      });
    }
  }
  const { contentHash, ...content } = label;
  if (contentHash !== strategyArchetypeContentHash(content)) {
    context.addIssue({
      code: "custom",
      message: "strategy archetype content hash does not match its canonical payload",
      path: ["contentHash"],
    });
  }
}) satisfies z.ZodType<StrategyArchetypeLabel>;

export const StrategyContextTagsSchema = z.strictObject({
  schemaVersion: z.literal(STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION),
  taxonomyVersion: z.literal(STRATEGY_CONTEXT_TAXONOMY_VERSION),
  scopeEpoch: NonEmptyStringSchema,
  regime: z.enum(STRATEGY_CONTEXT_REGIMES),
  liquidityBucket: z.enum(STRATEGY_CONTEXT_LIQUIDITY_BUCKETS),
  venueSet: z.array(z.enum(STRATEGY_CONTEXT_VENUES)),
  assetDomain: z.enum(STRATEGY_CONTEXT_ASSET_DOMAINS),
  listingLifecycle: z.enum(STRATEGY_CONTEXT_LISTING_LIFECYCLES),
  timeframeAlignment: z.enum(STRATEGY_CONTEXT_TIMEFRAME_ALIGNMENTS),
  volatilityState: z.enum(STRATEGY_CONTEXT_VOLATILITY_STATES),
  marketContext: z.enum(STRATEGY_CONTEXT_MARKET_STAGES),
  evidenceDrivers: z.array(z.enum(STRATEGY_CONTEXT_EVIDENCE_DRIVERS)).min(1),
  counterEvidenceFlags: z.array(
    z.enum(STRATEGY_CONTEXT_COUNTER_EVIDENCE_FLAGS),
  ),
  executionConstraints: z.array(
    z.enum(STRATEGY_CONTEXT_EXECUTION_CONSTRAINTS),
  ),
  unboundDimensions: z.array(z.enum(STRATEGY_CONTEXT_UNBOUND_DIMENSIONS)),
  contentHash: NonEmptyStringSchema,
}).superRefine((tags, context) => {
  for (const [path, values] of [
    ["venueSet", tags.venueSet],
    ["evidenceDrivers", tags.evidenceDrivers],
    ["counterEvidenceFlags", tags.counterEvidenceFlags],
    ["executionConstraints", tags.executionConstraints],
    ["unboundDimensions", tags.unboundDimensions],
  ] as const) {
    if (!isUniqueSorted(values)) {
      context.addIssue({
        code: "custom",
        message: `${path} must be unique and canonically sorted`,
        path: [path],
      });
    }
  }
  if (
    tags.scopeEpoch === M3_STRATEGY_TEST_SCOPE_EPOCH &&
    (
      tags.venueSet.length !== 0 ||
      tags.assetDomain !== "UNBOUND_TEST_ONLY" ||
      tags.listingLifecycle !== "UNBOUND_TEST_ONLY" ||
      tags.liquidityBucket !== "UNBOUND_TEST_ONLY" ||
      !tags.unboundDimensions.includes("VENUE_SET") ||
      !tags.unboundDimensions.includes("ASSET_DOMAIN") ||
      !tags.unboundDimensions.includes("LISTING_LIFECYCLE") ||
      !tags.unboundDimensions.includes("LIQUIDITY_BUCKET")
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "test-only unbound context must not claim scoped venue, asset, lifecycle or liquidity truth",
      path: ["scopeEpoch"],
    });
  }
  const { contentHash, ...content } = tags;
  if (contentHash !== strategyContextTagsContentHash(content)) {
    context.addIssue({
      code: "custom",
      message: "strategy context tags content hash does not match their canonical payload",
      path: ["contentHash"],
    });
  }
}) satisfies z.ZodType<StrategyContextTags>;

export function strategyStateLabelFor(
  actionState: ActionState,
): StrategyStateLabel {
  return Object.freeze({
    schemaVersion: STRATEGY_STATE_LABEL_SCHEMA_VERSION,
    actionState,
    localizationKey: STRATEGY_STATE_LOCALIZATION_KEYS[actionState],
  });
}

export const StrategyStateLabelSchema = z.strictObject({
  schemaVersion: z.literal(STRATEGY_STATE_LABEL_SCHEMA_VERSION),
  actionState: z.enum(ACTION_STATES),
  localizationKey: z.enum([
    "strategy.state.observe",
    "strategy.state.wait",
    "strategy.state.blocked",
    "strategy.state.trade_plan_ready",
  ]),
}).superRefine((label, context) => {
  if (label.localizationKey !== STRATEGY_STATE_LOCALIZATION_KEYS[label.actionState]) {
    context.addIssue({
      code: "custom",
      message: "strategy state label must be derived only from ActionState",
      path: ["localizationKey"],
    });
  }
}) satisfies z.ZodType<StrategyStateLabel>;
