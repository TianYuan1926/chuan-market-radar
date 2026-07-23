import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  M3_MULTI_ASSET_REGIMES,
  M3MultiAssetDigestSchema,
  M3MultiAssetEvidenceReferenceSchema,
  M3MultiAssetOpportunitySchema,
  M3MultiAssetPositiveDecimalSchema,
  M3MultiAssetScopeBindingSchema,
  M3MultiAssetSegmentBindingSchema,
  M3MultiAssetStructuralLevelSchema,
  isM3MultiAssetEquityDomain,
  isM3MultiAssetFamilyAllowedForLane,
  sameM3MultiAssetBinding,
  sameM3MultiAssetSegment,
  segmentBindingFromScope,
  uniqueSorted,
  type M3MultiAssetScopeBinding,
  type M3MultiAssetStructuralLevel,
} from "./m3-multi-asset-decision-contract";
import {
  M3MultiAssetAnalysisSnapshotSchema,
  verifyM3MultiAssetAnalysisHash,
} from "./m3-multi-asset-analysis";
import {
  M3MultiAssetQualificationSchema,
  verifyM3MultiAssetQualificationHash,
} from "./m3-multi-asset-qualification";
import {
  M3_MULTI_ASSET_REWARD_RISK_VERSION,
  calculateM3MultiAssetRewardRisk,
  compareM3MultiAssetPrices,
  isM3MultiAssetPriceWithinBps,
  shiftM3MultiAssetPriceByBps,
} from "./m3-multi-asset-exact-price-math";

export const M3_MULTI_ASSET_STRATEGY_INPUT_VERSION =
  "m3-multi-asset-strategy-input.v2" as const;
export const M3_MULTI_ASSET_STRATEGY_DRAFT_VERSION =
  "m3-multi-asset-strategy-draft.v2" as const;
export const M3_MULTI_ASSET_STRATEGY_RESULT_VERSION =
  "m3-multi-asset-strategy-result.v2" as const;
export const M3_MULTI_ASSET_STRATEGY_POLICY_SCHEMA_VERSION =
  "m3-multi-asset-strategy-policy.v2" as const;
export const M3_MULTI_ASSET_COST_SNAPSHOT_VERSION =
  "m3-multi-asset-cost-snapshot.v2" as const;
export const M3_MULTI_ASSET_REFERENCE_PRICE_VERSION =
  "m3-multi-asset-reference-price.v2" as const;
export const M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION =
  "m3-multi-asset-four-lane-strategy-construction.v2-research-only" as const;

export const M3_MULTI_ASSET_COST_COMPONENTS = [
  "FEE",
  "SLIPPAGE",
  "FUNDING",
  "CLOSED_SESSION_BASIS",
  "FX",
] as const;

export const M3_MULTI_ASSET_ENTRY_STOP_KINDS = [
  "SUPPORT",
  "RESISTANCE",
  "RANGE_EDGE",
  "LIQUIDITY",
] as const;

const CalibratedDirectionSchema = z.enum(["LONG", "SHORT"]);
const CalibratedRegimeSchema = z.enum([
  "TREND",
  "RANGE",
  "TRANSITION",
  "STRESS",
]);

function uniqueArray<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });
}

export function m3MultiAssetEvidenceSetDigest(
  evidenceIds: readonly string[],
): string {
  return stableContentHash({
    evidenceIds: uniqueSorted(evidenceIds),
  });
}

const M3MultiAssetStrategyPolicyBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_STRATEGY_POLICY_SCHEMA_VERSION),
  status: z.literal("CALIBRATED_RESEARCH_ONLY"),
  segment: M3MultiAssetSegmentBindingSchema,
  opportunityFamily: M3MultiAssetOpportunitySchema.shape.opportunityFamily,
  direction: CalibratedDirectionSchema,
  regime: CalibratedRegimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  evaluatedAt: IsoDateTimeSchema,
  policyVersion: NonEmptyStringSchema,
  templateVersion: NonEmptyStringSchema,
  evidenceCalibrationHash: M3MultiAssetDigestSchema,
  setupCalibrationHash: M3MultiAssetDigestSchema,
  policyEvidenceIds: uniqueArray(NonEmptyStringSchema).min(2),
  policyEvidenceDigest: M3MultiAssetDigestSchema,
  allowedEntryKinds: uniqueArray(
    z.enum(M3_MULTI_ASSET_ENTRY_STOP_KINDS),
  ).min(1),
  allowedStopKinds: uniqueArray(
    z.enum(M3_MULTI_ASSET_ENTRY_STOP_KINDS),
  ).min(1),
  allowedTargetKinds: uniqueArray(
    M3MultiAssetStructuralLevelSchema.shape.kind,
  ).min(1),
  fibTargetPolicy: z.enum(["PROHIBITED", "VALIDATED_EXTENSION_ONLY"]),
  validatedFibExtensionEvidenceIds:
    uniqueArray(NonEmptyStringSchema),
  validatedFibExtensionDigest: M3MultiAssetDigestSchema.nullable(),
  entryTrigger: NonEmptyStringSchema,
  structuralInvalidation: NonEmptyStringSchema,
  noChaseCondition: NonEmptyStringSchema,
  partialTakeProfitPolicy: NonEmptyStringSchema,
  confirmationWindowSeconds: z.number().int().min(1).max(86_400),
  entryZoneBufferBps: z.number().int().min(0).max(500),
  structuralStopBufferBps: z.number().int().min(0).max(1_000),
  maximumEntryDistanceBps: z.number().int().min(0).max(5_000),
  minimumGrossRewardRisk: z.number().finite().min(3).max(100),
  minimumEstimatedNetRewardRisk: z.number().finite().min(3).max(100),
  rewardRiskPrecision: z.number().int().min(0).max(12),
  draftLifetimeSeconds: z.number().int().min(60).max(86_400),
}).superRefine((policy, context) => {
  if (Date.parse(policy.sourceCutoff) > Date.parse(policy.evaluatedAt)) {
    context.addIssue({
      code: "custom",
      message: "strategy policy cannot be evaluated before its source cutoff",
      path: ["evaluatedAt"],
    });
  }
  if (
    !isM3MultiAssetFamilyAllowedForLane(
      policy.segment.decisionLane,
      policy.opportunityFamily,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "strategy family is not calibrated for the decision lane",
      path: ["opportunityFamily"],
    });
  }
  if (
    policy.policyEvidenceDigest !==
      m3MultiAssetEvidenceSetDigest(policy.policyEvidenceIds)
  ) {
    context.addIssue({
      code: "custom",
      message: "policy evidence digest does not seal the exact evidence set",
      path: ["policyEvidenceDigest"],
    });
  }
  if (policy.fibTargetPolicy === "PROHIBITED") {
    if (
      policy.validatedFibExtensionEvidenceIds.length > 0 ||
      policy.validatedFibExtensionDigest !== null ||
      policy.allowedTargetKinds.includes("FIB_ZONE")
    ) {
      context.addIssue({
        code: "custom",
        message: "prohibited Fib policy cannot carry or allow Fib evidence",
        path: ["fibTargetPolicy"],
      });
    }
    return;
  }
  if (
    !policy.allowedTargetKinds.includes("FIB_ZONE") ||
    policy.validatedFibExtensionEvidenceIds.length === 0 ||
    policy.validatedFibExtensionDigest !==
      m3MultiAssetEvidenceSetDigest(
        policy.validatedFibExtensionEvidenceIds,
      )
  ) {
    context.addIssue({
      code: "custom",
      message: "Fib targets require an exact validated extension evidence set",
      path: ["validatedFibExtensionDigest"],
    });
  }
});

export const M3MultiAssetStrategyPolicySchema =
  M3MultiAssetStrategyPolicyBodySchema.extend({
    policyHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetStrategyPolicy = z.infer<
  typeof M3MultiAssetStrategyPolicySchema
>;

export function sealM3MultiAssetStrategyPolicy(
  body: z.input<typeof M3MultiAssetStrategyPolicyBodySchema>,
): M3MultiAssetStrategyPolicy {
  const parsed = M3MultiAssetStrategyPolicyBodySchema.parse(body);
  return deepFreezeArtifact({
    ...parsed,
    policyHash: stableContentHash(parsed),
  });
}

export function verifyM3MultiAssetStrategyPolicyHash(
  policy: M3MultiAssetStrategyPolicy,
): boolean {
  const parsed = M3MultiAssetStrategyPolicySchema.safeParse(policy);
  if (!parsed.success) return false;
  const { policyHash, ...body } = parsed.data;
  return stableContentHash(body) === policyHash;
}

const M3MultiAssetCostComponentSchema = z.strictObject({
  component: z.enum(M3_MULTI_ASSET_COST_COMPONENTS),
  status: z.enum(["PASS", "BLOCKED", "UNAVAILABLE"]),
  conservativeBps: NonNegativeIntegerSchema.max(5_000).nullable(),
  evidenceReferences:
    uniqueArray(M3MultiAssetEvidenceReferenceSchema),
  reasonCodes: ReasonCodesSchema,
}).superRefine((component, context) => {
  const evidenceIds = component.evidenceReferences.map(
    (evidence) => evidence.evidenceId,
  );
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "cost evidence references must have unique evidence ids",
      path: ["evidenceReferences"],
    });
  }
  if (new Set(component.reasonCodes).size !== component.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "cost reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
  if (component.status === "PASS") {
    if (
      component.conservativeBps === null ||
      component.evidenceReferences.length === 0 ||
      component.evidenceReferences.some((evidence) =>
        evidence.status !== "PASS"
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "PASS cost requires a value and PASS evidence",
      });
    }
    return;
  }
  if (component.conservativeBps !== null || component.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-PASS cost must abstain from a value and explain why",
    });
  }
});

const M3MultiAssetCostSnapshotBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_COST_SNAPSHOT_VERSION),
  binding: M3MultiAssetScopeBindingSchema,
  sourceCutoff: IsoDateTimeSchema,
  availableAt: IsoDateTimeSchema,
  components: z.array(M3MultiAssetCostComponentSchema).min(1),
  reasonCodes: ReasonCodesSchema,
}).superRefine((snapshot, context) => {
  if (Date.parse(snapshot.sourceCutoff) > Date.parse(snapshot.availableAt)) {
    context.addIssue({
      code: "custom",
      message: "cost snapshot cannot be available before source cutoff",
      path: ["availableAt"],
    });
  }
  const componentIds = snapshot.components.map((item) => item.component);
  if (new Set(componentIds).size !== componentIds.length) {
    context.addIssue({
      code: "custom",
      message: "cost components must be unique",
      path: ["components"],
    });
  }
  if (new Set(snapshot.reasonCodes).size !== snapshot.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "cost snapshot reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
  for (const [componentIndex, component] of snapshot.components.entries()) {
    for (
      const [evidenceIndex, evidence] of
      component.evidenceReferences.entries()
    ) {
      if (!sameM3MultiAssetBinding(snapshot.binding, evidence)) {
        context.addIssue({
          code: "custom",
          message: "cost evidence must use the exact instrument binding",
          path: [
            "components",
            componentIndex,
            "evidenceReferences",
            evidenceIndex,
          ],
        });
      }
      if (
        Date.parse(evidence.sourceCutoff) >
          Date.parse(snapshot.sourceCutoff) ||
        Date.parse(evidence.availableAt) > Date.parse(snapshot.availableAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "cost snapshot cannot consume future evidence",
          path: [
            "components",
            componentIndex,
            "evidenceReferences",
            evidenceIndex,
          ],
        });
      }
    }
  }
});

export const M3MultiAssetCostSnapshotSchema =
  M3MultiAssetCostSnapshotBodySchema.extend({
    costSnapshotHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetCostSnapshot = z.infer<
  typeof M3MultiAssetCostSnapshotSchema
>;

export function sealM3MultiAssetCostSnapshot(
  body: z.input<typeof M3MultiAssetCostSnapshotBodySchema>,
): M3MultiAssetCostSnapshot {
  const parsed = M3MultiAssetCostSnapshotBodySchema.parse(body);
  return deepFreezeArtifact({
    ...parsed,
    costSnapshotHash: stableContentHash(parsed),
  });
}

export function verifyM3MultiAssetCostSnapshotHash(
  snapshot: M3MultiAssetCostSnapshot,
): boolean {
  const parsed = M3MultiAssetCostSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return false;
  const { costSnapshotHash, ...body } = parsed.data;
  return stableContentHash(body) === costSnapshotHash;
}

const M3MultiAssetReferencePriceBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_REFERENCE_PRICE_VERSION),
  binding: M3MultiAssetScopeBindingSchema,
  price: M3MultiAssetPositiveDecimalSchema.nullable(),
  status: z.enum(["FRESH", "PARTIAL", "STALE", "UNAVAILABLE"]),
  sourceCutoff: IsoDateTimeSchema,
  availableAt: IsoDateTimeSchema,
  factIds: uniqueArray(NonEmptyStringSchema),
  evidenceReferences:
    uniqueArray(M3MultiAssetEvidenceReferenceSchema),
  reasonCodes: ReasonCodesSchema,
}).superRefine((reference, context) => {
  if (Date.parse(reference.sourceCutoff) > Date.parse(reference.availableAt)) {
    context.addIssue({
      code: "custom",
      message: "reference price cannot be available before source cutoff",
      path: ["availableAt"],
    });
  }
  const evidenceIds = reference.evidenceReferences.map(
    (evidence) => evidence.evidenceId,
  );
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "reference evidence ids must be unique",
      path: ["evidenceReferences"],
    });
  }
  if (new Set(reference.reasonCodes).size !== reference.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "reference price reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
  if (reference.status === "FRESH") {
    const availableFactIds = new Set(
      reference.evidenceReferences.flatMap((evidence) => evidence.factIds),
    );
    if (
      reference.price === null ||
      reference.factIds.length === 0 ||
      reference.evidenceReferences.length === 0 ||
      reference.evidenceReferences.some((evidence) =>
        evidence.status !== "PASS"
      ) ||
      reference.factIds.some((factId) => !availableFactIds.has(factId))
    ) {
      context.addIssue({
        code: "custom",
        message: "fresh reference price requires exact PASS fact lineage",
      });
    }
  } else if (reference.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-fresh reference price must explain why",
      path: ["reasonCodes"],
    });
  }
  if (
    reference.status === "UNAVAILABLE" &&
    (reference.price !== null || reference.factIds.length > 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "unavailable reference price cannot claim a price or facts",
      path: ["price"],
    });
  }
  for (const [index, evidence] of reference.evidenceReferences.entries()) {
    if (!sameM3MultiAssetBinding(reference.binding, evidence)) {
      context.addIssue({
        code: "custom",
        message: "reference evidence must use the exact instrument binding",
        path: ["evidenceReferences", index],
      });
    }
    if (
      Date.parse(evidence.sourceCutoff) >
        Date.parse(reference.sourceCutoff) ||
      Date.parse(evidence.availableAt) > Date.parse(reference.availableAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "reference price cannot consume future evidence",
        path: ["evidenceReferences", index],
      });
    }
  }
});

export const M3MultiAssetReferencePriceSchema =
  M3MultiAssetReferencePriceBodySchema.extend({
    referencePriceHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetReferencePrice = z.infer<
  typeof M3MultiAssetReferencePriceSchema
>;

export function sealM3MultiAssetReferencePrice(
  body: z.input<typeof M3MultiAssetReferencePriceBodySchema>,
): M3MultiAssetReferencePrice {
  const parsed = M3MultiAssetReferencePriceBodySchema.parse(body);
  return deepFreezeArtifact({
    ...parsed,
    referencePriceHash: stableContentHash(parsed),
  });
}

export function verifyM3MultiAssetReferencePriceHash(
  reference: M3MultiAssetReferencePrice,
): boolean {
  const parsed = M3MultiAssetReferencePriceSchema.safeParse(reference);
  if (!parsed.success) return false;
  const { referencePriceHash, ...body } = parsed.data;
  return stableContentHash(body) === referencePriceHash;
}

export const M3MultiAssetStrategyInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_STRATEGY_INPUT_VERSION),
  constructionVersion: z.literal(
    M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION,
  ),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  analysis: M3MultiAssetAnalysisSnapshotSchema,
  qualification: M3MultiAssetQualificationSchema,
  policy: M3MultiAssetStrategyPolicySchema,
  costSnapshot: M3MultiAssetCostSnapshotSchema,
  referencePrice: M3MultiAssetReferencePriceSchema,
  selection: z.strictObject({
    entryLevelId: NonEmptyStringSchema,
    stopBaseLevelId: NonEmptyStringSchema,
    targetLevelIds: uniqueArray(NonEmptyStringSchema).min(1).max(3),
  }),
}).superRefine((input, context) => {
  const selectedIds = [
    input.selection.entryLevelId,
    input.selection.stopBaseLevelId,
    ...input.selection.targetLevelIds,
  ];
  if (new Set(selectedIds).size !== selectedIds.length) {
    context.addIssue({
      code: "custom",
      message: "entry, stop and target levels must be distinct",
      path: ["selection"],
    });
  }
});

const M3MultiAssetTargetSchema = z.strictObject({
  targetId: NonEmptyStringSchema,
  sourceLevelId: NonEmptyStringSchema,
  sourceKind: M3MultiAssetStructuralLevelSchema.shape.kind,
  price: M3MultiAssetPositiveDecimalSchema,
  allocationPercent: z.number().int().min(1).max(100),
  evidenceIds: uniqueArray(NonEmptyStringSchema).min(1),
});

const M3MultiAssetAppliedCostSchema = z.strictObject({
  component: z.enum(M3_MULTI_ASSET_COST_COMPONENTS),
  conservativeBps: NonNegativeIntegerSchema.max(5_000),
  multiplier: z.union([z.literal(1), z.literal(2)]),
  evidenceIds: uniqueArray(NonEmptyStringSchema).min(1),
});

const M3MultiAssetStrategyDraftBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_STRATEGY_DRAFT_VERSION),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  constructionVersion: z.literal(
    M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION,
  ),
  draftId: NonEmptyStringSchema,
  binding: M3MultiAssetScopeBindingSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  analysisId: NonEmptyStringSchema,
  analysisHash: M3MultiAssetDigestSchema,
  qualificationId: NonEmptyStringSchema,
  qualificationHash: M3MultiAssetDigestSchema,
  opportunityFamily: M3MultiAssetOpportunitySchema.shape.opportunityFamily,
  regime: z.enum(M3_MULTI_ASSET_REGIMES),
  direction: CalibratedDirectionSchema,
  evidenceCalibrationHash: M3MultiAssetDigestSchema,
  setupCalibrationHash: M3MultiAssetDigestSchema,
  policyVersion: NonEmptyStringSchema,
  templateVersion: NonEmptyStringSchema,
  policyHash: M3MultiAssetDigestSchema,
  policyEvidenceDigest: M3MultiAssetDigestSchema,
  costSnapshotHash: M3MultiAssetDigestSchema,
  referencePriceHash: M3MultiAssetDigestSchema,
  referencePrice: M3MultiAssetPositiveDecimalSchema,
  referencePriceFactIds: uniqueArray(NonEmptyStringSchema).min(1),
  referencePriceEvidenceIds: uniqueArray(NonEmptyStringSchema).min(1),
  entryAnchorLevelId: NonEmptyStringSchema,
  entryAnchorKind: z.enum(M3_MULTI_ASSET_ENTRY_STOP_KINDS),
  plannedEntryZone: z.strictObject({
    lower: M3MultiAssetPositiveDecimalSchema,
    upper: M3MultiAssetPositiveDecimalSchema,
  }),
  conservativeEntryPrice: M3MultiAssetPositiveDecimalSchema,
  entryZoneBufferBps: NonNegativeIntegerSchema,
  structuralStopBaseLevelId: NonEmptyStringSchema,
  structuralStopBaseKind: z.enum(M3_MULTI_ASSET_ENTRY_STOP_KINDS),
  structuralStopBase: M3MultiAssetPositiveDecimalSchema,
  structuralStop: M3MultiAssetPositiveDecimalSchema,
  structuralStopBufferBps: NonNegativeIntegerSchema,
  targets: z.array(M3MultiAssetTargetSchema).min(1).max(3),
  validatedFibExtensionEvidenceIds:
    uniqueArray(NonEmptyStringSchema),
  validatedFibExtensionDigest: M3MultiAssetDigestSchema.nullable(),
  rewardRiskCalculationVersion: z.literal(
    M3_MULTI_ASSET_REWARD_RISK_VERSION,
  ),
  grossRewardRisk: z.number().finite().nonnegative(),
  estimatedNetRewardRisk: z.number().finite().nonnegative(),
  appliedCostComponents:
    z.array(M3MultiAssetAppliedCostSchema).min(3).max(5),
  totalConservativeCostBps: NonNegativeIntegerSchema,
  whyNowEvidenceIds: uniqueArray(NonEmptyStringSchema).min(1),
  counterEvidenceIds: uniqueArray(NonEmptyStringSchema),
  entryTrigger: NonEmptyStringSchema,
  structuralInvalidation: NonEmptyStringSchema,
  noChaseCondition: NonEmptyStringSchema,
  partialTakeProfitPolicy: NonEmptyStringSchema,
  confirmationWindowSeconds: NonNegativeIntegerSchema,
  blockers: z.tuple([]),
  signalLevel: z.null(),
  strategyAuthority: z.literal(false),
  readyAuthority: z.literal(false),
  executionAuthority: z.literal(false),
}).superRefine((draft, context) => {
  if (Date.parse(draft.generatedAt) >= Date.parse(draft.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "strategy draft must expire after generation",
      path: ["expiresAt"],
    });
  }
  if (
    compareM3MultiAssetPrices(
      draft.plannedEntryZone.lower,
      draft.plannedEntryZone.upper,
    ) > 0 ||
    compareM3MultiAssetPrices(
      draft.conservativeEntryPrice,
      draft.plannedEntryZone.lower,
    ) < 0 ||
    compareM3MultiAssetPrices(
      draft.conservativeEntryPrice,
      draft.plannedEntryZone.upper,
    ) > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "conservative entry must remain inside the ordered entry zone",
      path: ["conservativeEntryPrice"],
    });
  }
  if (
    draft.targets.reduce(
      (sum, target) => sum + target.allocationPercent,
      0,
    ) !== 100
  ) {
    context.addIssue({
      code: "custom",
      message: "target allocations must total 100 percent",
      path: ["targets"],
    });
  }
  const targetIds = draft.targets.map((target) => target.targetId);
  const targetLevelIds = draft.targets.map((target) => target.sourceLevelId);
  if (
    new Set(targetIds).size !== targetIds.length ||
    new Set(targetLevelIds).size !== targetLevelIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "draft targets and source levels must be unique",
      path: ["targets"],
    });
  }
  const appliedComponents = draft.appliedCostComponents.map(
    (component) => component.component,
  );
  if (new Set(appliedComponents).size !== appliedComponents.length) {
    context.addIssue({
      code: "custom",
      message: "applied cost components must be unique",
      path: ["appliedCostComponents"],
    });
  }
  const expectedCost = draft.appliedCostComponents.reduce(
    (sum, component) =>
      sum + component.conservativeBps * component.multiplier,
    0,
  );
  if (expectedCost !== draft.totalConservativeCostBps) {
    context.addIssue({
      code: "custom",
      message: "total cost must equal the exact applied component total",
      path: ["totalConservativeCostBps"],
    });
  }
  const expectedComponents = requiredCostComponents(
    draft.binding.assetDomain,
  );
  if (
    expectedComponents.length !== appliedComponents.length ||
    expectedComponents.some((component) =>
      !appliedComponents.includes(component)
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "draft must carry every required domain cost component",
      path: ["appliedCostComponents"],
    });
  }
  for (const target of draft.targets) {
    if (
      target.sourceKind === "FIB_ZONE" &&
      (
        draft.validatedFibExtensionDigest === null ||
        !target.evidenceIds.some((evidenceId) =>
          draft.validatedFibExtensionEvidenceIds.includes(evidenceId)
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Fib target is not bound to validated extension evidence",
        path: ["targets"],
      });
    }
  }
});

export const M3MultiAssetStrategyDraftSchema =
  M3MultiAssetStrategyDraftBodySchema.extend({
    draftHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetStrategyDraft = z.infer<
  typeof M3MultiAssetStrategyDraftSchema
>;

export type M3MultiAssetStrategyIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3MultiAssetStrategyResult = Readonly<{
  schemaVersion: typeof M3_MULTI_ASSET_STRATEGY_RESULT_VERSION;
  status:
    | "CONSTRUCTED_RESEARCH_ONLY"
    | "ABSTAINED_NO_DRAFT"
    | "BLOCKED_INVALID_INPUT";
  authority: typeof M3_MULTI_ASSET_DECISION_AUTHORITY;
  draft: M3MultiAssetStrategyDraft | null;
  reasonCodes: readonly string[];
  issues: readonly M3MultiAssetStrategyIssue[];
  resultHash: string;
}>;

function result(
  body: Omit<M3MultiAssetStrategyResult, "resultHash">,
): M3MultiAssetStrategyResult {
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

function invalidInputResult(
  issues: readonly M3MultiAssetStrategyIssue[],
): M3MultiAssetStrategyResult {
  const normalized = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
  );
  return result({
    schemaVersion: M3_MULTI_ASSET_STRATEGY_RESULT_VERSION,
    status: "BLOCKED_INVALID_INPUT",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    draft: null,
    reasonCodes: ["m3_multi_asset_strategy_input_schema_rejected"],
    issues: normalized,
  });
}

function strategyDraftId(input: Readonly<{
  analysisHash: string;
  qualificationHash: string;
  policyHash: string;
  costSnapshotHash: string;
  referencePriceHash: string;
  sourceCutoff: string;
  entryLevelId: string;
  stopBaseLevelId: string;
  targetLevelIds: readonly string[];
}>): string {
  return `m3-multi-asset-strategy:${stableSha256(input).slice(0, 24)}`;
}

export function verifyM3MultiAssetStrategyDraftHash(
  draft: M3MultiAssetStrategyDraft,
): boolean {
  const parsed = M3MultiAssetStrategyDraftSchema.safeParse(draft);
  if (!parsed.success) return false;
  const { draftHash, ...body } = parsed.data;
  return stableContentHash(body) === draftHash &&
    body.draftId === strategyDraftId({
      analysisHash: body.analysisHash,
      qualificationHash: body.qualificationHash,
      policyHash: body.policyHash,
      costSnapshotHash: body.costSnapshotHash,
      referencePriceHash: body.referencePriceHash,
      sourceCutoff: body.sourceCutoff,
      entryLevelId: body.entryAnchorLevelId,
      stopBaseLevelId: body.structuralStopBaseLevelId,
      targetLevelIds: body.targets.map((target) => target.sourceLevelId),
    });
}

function targetAllocations(count: number): number[] {
  if (count === 1) return [100];
  if (count === 2) return [60, 40];
  return [50, 30, 20];
}

function requiredCostComponents(
  assetDomain: M3MultiAssetScopeBinding["assetDomain"],
): readonly (typeof M3_MULTI_ASSET_COST_COMPONENTS)[number][] {
  return isM3MultiAssetEquityDomain(assetDomain)
    ? M3_MULTI_ASSET_COST_COMPONENTS
    : ["FEE", "SLIPPAGE", "FUNDING"];
}

function costMultiplier(
  component: (typeof M3_MULTI_ASSET_COST_COMPONENTS)[number],
): 1 | 2 {
  return component === "FEE" || component === "SLIPPAGE" ? 2 : 1;
}

function sameBinding(
  left: M3MultiAssetScopeBinding,
  right: M3MultiAssetScopeBinding,
): boolean {
  return stableContentHash(left) === stableContentHash(right);
}

function addIssue(
  issues: M3MultiAssetStrategyIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function constructValidatedM3MultiAssetStrategy(
  value: z.infer<typeof M3MultiAssetStrategyInputSchema>,
): M3MultiAssetStrategyResult {
  const {
    analysis,
    qualification,
    policy,
    costSnapshot,
    referencePrice,
  } = value;
  const blockers: string[] = [];
  const issues: M3MultiAssetStrategyIssue[] = [];

  if (!verifyM3MultiAssetAnalysisHash(analysis)) {
    addIssue(
      issues,
      "strategy_analysis_hash_mismatch",
      "analysis.analysisHash",
      "strategy requires the exact immutable analysis artifact",
    );
  }
  if (!verifyM3MultiAssetQualificationHash(qualification)) {
    addIssue(
      issues,
      "strategy_qualification_hash_mismatch",
      "qualification.qualificationHash",
      "strategy requires the exact immutable qualification artifact",
    );
  }
  if (!verifyM3MultiAssetStrategyPolicyHash(policy)) {
    addIssue(
      issues,
      "strategy_policy_hash_mismatch",
      "policy.policyHash",
      "strategy requires the exact immutable calibrated policy",
    );
  }
  if (!verifyM3MultiAssetCostSnapshotHash(costSnapshot)) {
    addIssue(
      issues,
      "strategy_cost_snapshot_hash_mismatch",
      "costSnapshot.costSnapshotHash",
      "strategy requires the exact immutable cost snapshot",
    );
  }
  if (!verifyM3MultiAssetReferencePriceHash(referencePrice)) {
    addIssue(
      issues,
      "strategy_reference_price_hash_mismatch",
      "referencePrice.referencePriceHash",
      "strategy requires the exact immutable reference price",
    );
  }

  if (Date.parse(value.sourceCutoff) > Date.parse(value.generatedAt)) {
    addIssue(
      issues,
      "strategy_generated_before_cutoff",
      "generatedAt",
      "strategy cannot be generated before its source cutoff",
    );
  }
  for (const [path, cutoff, availableAt] of [
    ["analysis", analysis.sourceCutoff, analysis.generatedAt],
    ["qualification", qualification.sourceCutoff, qualification.generatedAt],
    ["policy", policy.sourceCutoff, policy.evaluatedAt],
    ["costSnapshot", costSnapshot.sourceCutoff, costSnapshot.availableAt],
    ["referencePrice", referencePrice.sourceCutoff, referencePrice.availableAt],
  ] as const) {
    if (
      Date.parse(cutoff) > Date.parse(value.sourceCutoff) ||
      Date.parse(availableAt) > Date.parse(value.generatedAt)
    ) {
      addIssue(
        issues,
        "strategy_input_not_available_at_cutoff",
        path,
        "strategy cannot consume a future artifact",
      );
    }
  }

  for (const [name, binding] of [
    ["qualification", qualification.binding],
    ["costSnapshot", costSnapshot.binding],
    ["referencePrice", referencePrice.binding],
  ] as const) {
    if (!sameBinding(analysis.binding, binding)) {
      blockers.push(`strategy_${name.toLowerCase()}_binding_mismatch`);
    }
  }
  if (
    !sameM3MultiAssetSegment(
      segmentBindingFromScope(analysis.binding),
      policy.segment,
    )
  ) {
    blockers.push("strategy_policy_segment_mismatch");
  }
  if (
    qualification.analysisId !== analysis.analysisId ||
    qualification.analysisHash !== analysis.analysisHash ||
    stableContentHash(qualification.opportunity) !==
      stableContentHash(analysis.opportunity)
  ) {
    blockers.push("strategy_analysis_qualification_lineage_mismatch");
  }
  if (
    qualification.evidenceDisposition !== "QUALIFIED" ||
    qualification.setupDisposition !== "QUALIFIED" ||
    qualification.evidenceCalibrationDisposition !== "CALIBRATED" ||
    qualification.setupCalibrationDisposition !== "CALIBRATED" ||
    qualification.blockers.length > 0
  ) {
    blockers.push("strategy_qualification_not_eligible");
  }
  if (
    qualification.direction !== "LONG" &&
    qualification.direction !== "SHORT"
  ) {
    blockers.push("strategy_direction_unresolved");
  }
  if (
    policy.direction !== qualification.direction ||
    policy.opportunityFamily !== analysis.opportunity.opportunityFamily ||
    policy.regime !== analysis.regime ||
    policy.evidenceCalibrationHash !==
      qualification.evidenceCalibrationHash ||
    policy.setupCalibrationHash !== qualification.setupCalibrationHash
  ) {
    blockers.push("strategy_policy_calibration_or_thesis_mismatch");
  }
  if (referencePrice.status !== "FRESH" || referencePrice.price === null) {
    blockers.push("strategy_reference_price_not_fresh");
  }

  const componentById = new Map(
    costSnapshot.components.map((component) => [component.component, component]),
  );
  const requiredComponents = requiredCostComponents(
    analysis.binding.assetDomain,
  );
  for (const componentId of requiredComponents) {
    const component = componentById.get(componentId);
    if (component === undefined) {
      blockers.push(
        `strategy_cost_component_missing:${componentId.toLowerCase()}`,
      );
    } else if (
      component.status !== "PASS" ||
      component.conservativeBps === null
    ) {
      blockers.push(
        `strategy_cost_component_${component.status.toLowerCase()}:` +
          componentId.toLowerCase(),
      );
    }
  }

  const levels = new Map(
    analysis.structuralLevels.map((level) => [level.levelId, level]),
  );
  const entryLevel = levels.get(value.selection.entryLevelId);
  const stopBaseLevel = levels.get(value.selection.stopBaseLevelId);
  const targetLevels = value.selection.targetLevelIds
    .map((id) => levels.get(id))
    .filter((level): level is M3MultiAssetStructuralLevel =>
      level !== undefined
    );
  if (entryLevel === undefined) blockers.push("strategy_entry_level_missing");
  if (stopBaseLevel === undefined) {
    blockers.push("strategy_stop_base_level_missing");
  }
  if (targetLevels.length !== value.selection.targetLevelIds.length) {
    blockers.push("strategy_target_level_missing");
  }
  if (
    entryLevel !== undefined &&
    !policy.allowedEntryKinds.includes(
      entryLevel.kind as (typeof M3_MULTI_ASSET_ENTRY_STOP_KINDS)[number],
    )
  ) {
    blockers.push("strategy_entry_kind_not_calibrated");
  }
  if (
    stopBaseLevel !== undefined &&
    !policy.allowedStopKinds.includes(
      stopBaseLevel.kind as (typeof M3_MULTI_ASSET_ENTRY_STOP_KINDS)[number],
    )
  ) {
    blockers.push("strategy_stop_kind_not_calibrated");
  }
  if (
    targetLevels.some((level) =>
      !policy.allowedTargetKinds.includes(level.kind)
    )
  ) {
    blockers.push("strategy_target_kind_not_calibrated");
  }
  for (const target of targetLevels) {
    if (
      target.kind === "FIB_ZONE" &&
      (
        policy.fibTargetPolicy !== "VALIDATED_EXTENSION_ONLY" ||
        policy.validatedFibExtensionDigest === null ||
        !target.evidenceIds.some((evidenceId) =>
          policy.validatedFibExtensionEvidenceIds.includes(evidenceId)
        )
      )
    ) {
      blockers.push("strategy_fib_target_not_validated");
    }
  }

  if (entryLevel !== undefined) {
    const referenceEvidenceIds = referencePrice.evidenceReferences.map(
      (evidence) => evidence.evidenceId,
    );
    if (
      !referenceEvidenceIds.some((evidenceId) =>
        entryLevel.evidenceIds.includes(evidenceId) &&
        analysis.supportingEvidenceIds.includes(evidenceId)
      )
    ) {
      blockers.push("strategy_reference_price_not_bound_to_entry_evidence");
    }
  }

  let draft: M3MultiAssetStrategyDraft | null = null;
  if (
    blockers.length === 0 &&
    issues.length === 0 &&
    entryLevel !== undefined &&
    stopBaseLevel !== undefined &&
    targetLevels.length > 0 &&
    referencePrice.price !== null &&
    (qualification.direction === "LONG" ||
      qualification.direction === "SHORT")
  ) {
    const direction = qualification.direction;
    if (
      !isM3MultiAssetPriceWithinBps(
        referencePrice.price,
        entryLevel.price,
        policy.maximumEntryDistanceBps,
      )
    ) {
      blockers.push("strategy_entry_too_far_from_reference");
    } else {
      const entryLower = shiftM3MultiAssetPriceByBps(
        entryLevel.price,
        policy.entryZoneBufferBps,
        "SUBTRACT",
        "FLOOR",
      );
      const entryUpper = shiftM3MultiAssetPriceByBps(
        entryLevel.price,
        policy.entryZoneBufferBps,
        "ADD",
        "CEIL",
      );
      const conservativeEntryPrice = direction === "LONG"
        ? entryUpper
        : entryLower;
      const stopBaseComparison = compareM3MultiAssetPrices(
        stopBaseLevel.price,
        conservativeEntryPrice,
      );
      if (
        (direction === "LONG" && stopBaseComparison >= 0) ||
        (direction === "SHORT" && stopBaseComparison <= 0)
      ) {
        blockers.push("strategy_stop_base_not_on_adverse_side");
      }
      const structuralStop = shiftM3MultiAssetPriceByBps(
        stopBaseLevel.price,
        policy.structuralStopBufferBps,
        direction === "LONG" ? "SUBTRACT" : "ADD",
        direction === "LONG" ? "FLOOR" : "CEIL",
      );
      const stopComparison = compareM3MultiAssetPrices(
        structuralStop,
        conservativeEntryPrice,
      );
      if (
        (direction === "LONG" && stopComparison >= 0) ||
        (direction === "SHORT" && stopComparison <= 0)
      ) {
        blockers.push("strategy_stop_not_on_adverse_side");
      }
      if (
        targetLevels.some((level) => {
          const comparison = compareM3MultiAssetPrices(
            level.price,
            conservativeEntryPrice,
          );
          return direction === "LONG" ? comparison <= 0 : comparison >= 0;
        })
      ) {
        blockers.push("strategy_target_not_on_rewarding_side");
      }

      if (blockers.length === 0) {
        const allocations = targetAllocations(targetLevels.length);
        const targets = targetLevels.map((level, index) => ({
          targetId: `target:${index + 1}:${level.levelId}`,
          sourceLevelId: level.levelId,
          sourceKind: level.kind,
          price: level.price,
          allocationPercent: allocations[index]!,
          evidenceIds: uniqueSorted(level.evidenceIds),
        }));
        const appliedCostComponents = requiredComponents.map((componentId) => {
          const component = componentById.get(componentId);
          if (
            component === undefined ||
            component.status !== "PASS" ||
            component.conservativeBps === null
          ) {
            throw new Error("required PASS cost disappeared after validation");
          }
          return {
            component: componentId,
            conservativeBps: component.conservativeBps,
            multiplier: costMultiplier(componentId),
            evidenceIds: uniqueSorted(
              component.evidenceReferences.map(
                (evidence) => evidence.evidenceId,
              ),
            ),
          };
        });
        const totalConservativeCostBps = appliedCostComponents.reduce(
          (sum, component) =>
            sum + component.conservativeBps * component.multiplier,
          0,
        );
        const rewardRisk = calculateM3MultiAssetRewardRisk({
          direction,
          conservativeEntryPrice,
          structuralStop,
          targets,
          totalConservativeCostBps,
          precision: policy.rewardRiskPrecision,
        });
        if (
          rewardRisk.grossRewardRisk < policy.minimumGrossRewardRisk ||
          rewardRisk.estimatedNetRewardRisk <
            policy.minimumEstimatedNetRewardRisk
        ) {
          blockers.push("strategy_reward_risk_below_calibrated_floor");
        } else {
          const draftIdentity = {
            analysisHash: analysis.analysisHash,
            qualificationHash: qualification.qualificationHash,
            policyHash: policy.policyHash,
            costSnapshotHash: costSnapshot.costSnapshotHash,
            referencePriceHash: referencePrice.referencePriceHash,
            sourceCutoff: value.sourceCutoff,
            entryLevelId: entryLevel.levelId,
            stopBaseLevelId: stopBaseLevel.levelId,
            targetLevelIds: targetLevels.map((level) => level.levelId),
          };
          const body = M3MultiAssetStrategyDraftBodySchema.parse({
            schemaVersion: M3_MULTI_ASSET_STRATEGY_DRAFT_VERSION,
            authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
            constructionVersion:
              M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION,
            draftId: strategyDraftId(draftIdentity),
            binding: analysis.binding,
            generatedAt: value.generatedAt,
            sourceCutoff: value.sourceCutoff,
            expiresAt: new Date(
              Date.parse(value.generatedAt) +
                policy.draftLifetimeSeconds * 1_000,
            ).toISOString(),
            analysisId: analysis.analysisId,
            analysisHash: analysis.analysisHash,
            qualificationId: qualification.qualificationId,
            qualificationHash: qualification.qualificationHash,
            opportunityFamily: analysis.opportunity.opportunityFamily,
            regime: analysis.regime,
            direction,
            evidenceCalibrationHash: qualification.evidenceCalibrationHash,
            setupCalibrationHash: qualification.setupCalibrationHash,
            policyVersion: policy.policyVersion,
            templateVersion: policy.templateVersion,
            policyHash: policy.policyHash,
            policyEvidenceDigest: policy.policyEvidenceDigest,
            costSnapshotHash: costSnapshot.costSnapshotHash,
            referencePriceHash: referencePrice.referencePriceHash,
            referencePrice: referencePrice.price,
            referencePriceFactIds: uniqueSorted(referencePrice.factIds),
            referencePriceEvidenceIds: uniqueSorted(
              referencePrice.evidenceReferences.map(
                (evidence) => evidence.evidenceId,
              ),
            ),
            entryAnchorLevelId: entryLevel.levelId,
            entryAnchorKind: entryLevel.kind,
            plannedEntryZone: {
              lower: entryLower,
              upper: entryUpper,
            },
            conservativeEntryPrice,
            entryZoneBufferBps: policy.entryZoneBufferBps,
            structuralStopBaseLevelId: stopBaseLevel.levelId,
            structuralStopBaseKind: stopBaseLevel.kind,
            structuralStopBase: stopBaseLevel.price,
            structuralStop,
            structuralStopBufferBps: policy.structuralStopBufferBps,
            targets,
            validatedFibExtensionEvidenceIds:
              policy.validatedFibExtensionEvidenceIds,
            validatedFibExtensionDigest:
              policy.validatedFibExtensionDigest,
            rewardRiskCalculationVersion:
              M3_MULTI_ASSET_REWARD_RISK_VERSION,
            grossRewardRisk: rewardRisk.grossRewardRisk,
            estimatedNetRewardRisk: rewardRisk.estimatedNetRewardRisk,
            appliedCostComponents,
            totalConservativeCostBps,
            whyNowEvidenceIds: uniqueSorted(analysis.supportingEvidenceIds),
            counterEvidenceIds: uniqueSorted(analysis.counterEvidenceIds),
            entryTrigger: policy.entryTrigger,
            structuralInvalidation: policy.structuralInvalidation,
            noChaseCondition: policy.noChaseCondition,
            partialTakeProfitPolicy: policy.partialTakeProfitPolicy,
            confirmationWindowSeconds: policy.confirmationWindowSeconds,
            blockers: [],
            signalLevel: null,
            strategyAuthority: false,
            readyAuthority: false,
            executionAuthority: false,
          });
          draft = deepFreezeArtifact({
            ...body,
            draftHash: stableContentHash(body),
          });
        }
      }
    }
  }

  if (issues.length > 0) {
    blockers.push("multi_asset_strategy_integrity_failed");
  }
  const normalizedBlockers = uniqueSorted(blockers);
  return result({
    schemaVersion: M3_MULTI_ASSET_STRATEGY_RESULT_VERSION,
    status: draft !== null && normalizedBlockers.length === 0
      ? "CONSTRUCTED_RESEARCH_ONLY"
      : "ABSTAINED_NO_DRAFT",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    draft: normalizedBlockers.length === 0 ? draft : null,
    reasonCodes: normalizedBlockers.length === 0
      ? ["multi_asset_strategy_research_only_constructed"]
      : normalizedBlockers,
    issues: [...issues].sort((left, right) =>
      `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
    ),
  });
}

export function constructM3MultiAssetStrategy(
  input: unknown,
): M3MultiAssetStrategyResult {
  const parsed = M3MultiAssetStrategyInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInputResult(parsed.error.issues.map((schemaIssue) => ({
      code: "m3_multi_asset_strategy_input_schema_rejected",
      path: schemaIssue.path.length === 0
        ? "$"
        : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }
  try {
    return constructValidatedM3MultiAssetStrategy(parsed.data);
  } catch {
    return result({
      schemaVersion: M3_MULTI_ASSET_STRATEGY_RESULT_VERSION,
      status: "ABSTAINED_NO_DRAFT",
      authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
      draft: null,
      reasonCodes: ["multi_asset_strategy_exact_construction_rejected"],
      issues: [{
        code: "multi_asset_strategy_exact_construction_rejected",
        path: "$",
        message: "exact strategy construction failed closed",
      }],
    });
  }
}
