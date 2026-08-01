import { z } from "zod";
import {
  DecisionSnapshotSchema,
  StrategyDecisionSchema,
  StrategyDraftSchema,
} from "../../runtime-schema/decision-schemas";
import {
  AlertEventSchema,
  OutcomeRecordSchema,
} from "../../runtime-schema/learning-runtime-schemas";

export const M3_STRATEGY_ARCHETYPE_LINEAGE_CONTRACT_VERSION =
  "m3-strategy-archetype-lineage-contract.v1" as const;

type LineageCarrier = Readonly<{
  strategyArchetype: Readonly<{ contentHash: string }>;
  strategyContextTags: Readonly<{ contentHash: string }>;
  strategyStateLabel: Readonly<{
    actionState: string;
    localizationKey: string;
  }>;
}>;

function addParityIssues(
  expected: LineageCarrier,
  actual: LineageCarrier,
  path: string,
  context: z.core.$RefinementCtx,
): void {
  if (
    actual.strategyArchetype.contentHash !==
      expected.strategyArchetype.contentHash ||
    actual.strategyContextTags.contentHash !==
      expected.strategyContextTags.contentHash ||
    actual.strategyStateLabel.actionState !==
      expected.strategyStateLabel.actionState ||
    actual.strategyStateLabel.localizationKey !==
      expected.strategyStateLabel.localizationKey
  ) {
    context.addIssue({
      code: "custom",
      message: `${path} must preserve the original strategy label lineage without post-hoc rewriting`,
      path: [path],
    });
  }
}

export const M3StrategyArchetypeLineageBundleSchema = z.strictObject({
  schemaVersion: z.literal(M3_STRATEGY_ARCHETYPE_LINEAGE_CONTRACT_VERSION),
  draft: StrategyDraftSchema,
  decision: StrategyDecisionSchema,
  snapshot: DecisionSnapshotSchema,
  alerts: z.array(AlertEventSchema),
  outcomes: z.array(OutcomeRecordSchema),
}).superRefine((bundle, context) => {
  if (
    bundle.decision.draftId !== bundle.draft.draftId ||
    bundle.decision.episodeId !== bundle.draft.episodeId
  ) {
    context.addIssue({
      code: "custom",
      message: "decision must reference the exact labeled StrategyDraft",
      path: ["decision", "draftId"],
    });
  }

  const draftCarrier: LineageCarrier = {
    strategyArchetype: bundle.draft.strategyArchetype,
    strategyContextTags: bundle.draft.strategyContextTags,
    strategyStateLabel: bundle.decision.strategyStateLabel,
  };
  addParityIssues(draftCarrier, bundle.decision, "decision", context);

  if (
    bundle.snapshot.decision.decisionId !== bundle.decision.decisionId ||
    bundle.snapshot.decision.contentHash !== bundle.decision.contentHash ||
    bundle.snapshot.episodeId !== bundle.decision.episodeId
  ) {
    context.addIssue({
      code: "custom",
      message: "DecisionSnapshot must embed the exact authoritative decision",
      path: ["snapshot", "decision"],
    });
  }
  addParityIssues(bundle.decision, bundle.snapshot, "snapshot", context);

  for (const [index, alert] of bundle.alerts.entries()) {
    if (
      alert.decisionSnapshotId !== bundle.snapshot.snapshotId ||
      alert.episodeId !== bundle.snapshot.episodeId
    ) {
      context.addIssue({
        code: "custom",
        message: "alert must reference the exact labeled DecisionSnapshot",
        path: ["alerts", index, "decisionSnapshotId"],
      });
    }
    addParityIssues(
      bundle.snapshot,
      alert,
      `alerts.${index}`,
      context,
    );
  }

  for (const [index, outcome] of bundle.outcomes.entries()) {
    if (
      outcome.decisionSnapshotId !== bundle.snapshot.snapshotId ||
      outcome.episodeId !== bundle.snapshot.episodeId
    ) {
      context.addIssue({
        code: "custom",
        message: "outcome must reference the exact labeled DecisionSnapshot",
        path: ["outcomes", index, "decisionSnapshotId"],
      });
    }
    addParityIssues(
      bundle.snapshot,
      outcome,
      `outcomes.${index}`,
      context,
    );
  }
});

export type M3StrategyArchetypeLineageBundle = z.infer<
  typeof M3StrategyArchetypeLineageBundleSchema
>;
