import { z } from "zod";
import type { OutcomeRecord } from "../../domain/contracts";
import {
  FiniteNumberSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeFiniteSchema,
} from "../../runtime-schema/primitives";
import { OutcomeRecordSchema } from "../../runtime-schema/learning-runtime-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import { assertM3DecisionSnapshotIntegrity } from "../decision/m3-decision-read-model-runtime";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

export const M3_STRATEGY_OUTCOME_RUNTIME_VERSION =
  "m3-strategy-outcome-runtime.v1" as const;
export const M3_STRATEGY_OUTCOME_ATTRIBUTION_VERSION =
  "m3-strategy-outcome-attribution.v1" as const;

const M3OutcomeEventObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("OBSERVED"),
    opportunityEventId: NonEmptyStringSchema,
    eventLabelVersion: NonEmptyStringSchema,
    eventStartAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    status: z.literal("NO_EVENT"),
    opportunityEventId: NonEmptyStringSchema,
    eventLabelVersion: NonEmptyStringSchema,
    eventStartAt: z.null(),
  }),
  z.strictObject({
    status: z.literal("UNAVAILABLE"),
    opportunityEventId: z.null(),
    eventLabelVersion: z.null(),
    eventStartAt: z.null(),
  }),
]);

export const M3OutcomeObservationSchema = z.strictObject({
  schemaVersion: z.literal("m3-outcome-observation.v1"),
  outcomePolicyVersion: NonEmptyStringSchema,
  checkpoint: z.enum(["1H", "4H", "24H"]),
  status: z.enum([
    "TP_FIRST",
    "SL_FIRST",
    "PARTIAL",
    "EXPIRED",
    "NOT_TRIGGERED",
    "DATA_UNAVAILABLE",
  ]),
  generatedAt: IsoDateTimeSchema,
  factCutoff: IsoDateTimeSchema,
  measurementFactIds: z.array(NonEmptyStringSchema),
  maximumFavorableExcursion: NonNegativeFiniteSchema.nullable(),
  maximumAdverseExcursion: NonNegativeFiniteSchema.nullable(),
  netR: FiniteNumberSchema.nullable(),
  event: M3OutcomeEventObservationSchema,
}).superRefine((observation, context) => {
  if (
    new Set(observation.measurementFactIds).size !==
      observation.measurementFactIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "measurement fact ids must be unique",
      path: ["measurementFactIds"],
    });
  }
  if (Date.parse(observation.factCutoff) > Date.parse(observation.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "outcome observation cannot precede its fact cutoff",
      path: ["generatedAt"],
    });
  }
  if (
    observation.event.status === "OBSERVED" &&
    Date.parse(observation.event.eventStartAt) > Date.parse(observation.factCutoff)
  ) {
    context.addIssue({
      code: "custom",
      message: "event start cannot be known after the measurement cutoff",
      path: ["event", "eventStartAt"],
    });
  }
  const measurements = [
    observation.maximumFavorableExcursion,
    observation.maximumAdverseExcursion,
    observation.netR,
  ];
  if (
    ["TP_FIRST", "SL_FIRST", "PARTIAL"].includes(observation.status) &&
    measurements.some((value) => value === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "triggered outcome observations require complete execution measurements",
      path: ["status"],
    });
  }
  if (
    ["EXPIRED", "NOT_TRIGGERED", "DATA_UNAVAILABLE"].includes(
      observation.status,
    ) && measurements.some((value) => value !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "non-triggered observations cannot claim execution measurements",
      path: ["status"],
    });
  }
  if (
    observation.status === "DATA_UNAVAILABLE" &&
    (
      observation.measurementFactIds.length > 0 ||
      observation.event.status !== "UNAVAILABLE"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "DATA_UNAVAILABLE requires empty fact lineage and unavailable event classification",
      path: ["status"],
    });
  }
  if (
    observation.status !== "DATA_UNAVAILABLE" &&
    observation.measurementFactIds.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "evaluated outcomes require point-in-time measurement facts",
      path: ["measurementFactIds"],
    });
  }
});

export type M3OutcomeObservation = z.infer<
  typeof M3OutcomeObservationSchema
>;

const CHECKPOINT_MS = Object.freeze({
  "1H": 60 * 60 * 1_000,
  "4H": 4 * 60 * 60 * 1_000,
  "24H": 24 * 60 * 60 * 1_000,
} as const);

function outcomeContent(
  outcome: OutcomeRecord,
): Omit<OutcomeRecord, "outcomeId" | "contentHash"> {
  return omitArtifactFields(
    outcome as unknown as Readonly<Record<string, unknown>>,
    ["outcomeId", "contentHash"],
  ) as Omit<OutcomeRecord, "outcomeId" | "contentHash">;
}

export function assertM3StrategyOutcomeIntegrity(input: unknown): OutcomeRecord {
  const outcome = OutcomeRecordSchema.parse(input);
  const content = outcomeContent(outcome);
  const digest = stableSha256(content);
  if (
    outcome.contentHash !== stableContentHash(content) ||
    outcome.outcomeId !== `strategy-outcome:${digest.slice(0, 24)}`
  ) {
    throw new Error("OutcomeRecord content address does not match its payload");
  }
  return deepFreezeArtifact(outcome);
}

export function buildM3StrategyOutcome(input: Readonly<{
  decisionSnapshot: unknown;
  observation: unknown;
}>): OutcomeRecord {
  const snapshot = assertM3DecisionSnapshotIntegrity(input.decisionSnapshot);
  const observation = M3OutcomeObservationSchema.parse(input.observation);
  const decisionTime = Date.parse(snapshot.decision.decidedAt);
  const factCutoff = Date.parse(observation.factCutoff);
  if (
    factCutoff < Date.parse(snapshot.sourceCutoff) ||
    factCutoff < decisionTime + CHECKPOINT_MS[observation.checkpoint] ||
    Date.parse(observation.generatedAt) < Date.parse(snapshot.generatedAt)
  ) {
    throw new Error(
      "OutcomeRecord cannot use pre-decision facts or an incomplete checkpoint window",
    );
  }
  if (
    ["TP_FIRST", "SL_FIRST", "PARTIAL"].includes(observation.status) &&
    (
      snapshot.actionState !== "TRADE_PLAN_READY" ||
      snapshot.userFit !== "SUITABLE"
    )
  ) {
    throw new Error(
      "execution outcome status requires an exposed suitable TRADE_PLAN_READY snapshot",
    );
  }
  const leadTimeSeconds = observation.event.status === "OBSERVED"
    ? (Date.parse(observation.event.eventStartAt) -
      Date.parse(snapshot.firstDetectedAt)) / 1_000
    : null;
  const content: Omit<OutcomeRecord, "outcomeId" | "contentHash"> = {
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.OutcomeRecord,
    releaseId: snapshot.releaseId,
    producerModule: "outcome_evaluation",
    generatedAt: observation.generatedAt,
    sourceCutoff: observation.factCutoff,
    episodeId: snapshot.episodeId,
    decisionSnapshotId: snapshot.snapshotId,
    strategyArchetype: snapshot.strategyArchetype,
    strategyContextTags: snapshot.strategyContextTags,
    strategyStateLabel: snapshot.strategyStateLabel,
    outcomePolicyVersion: observation.outcomePolicyVersion,
    measurementFactIds: [...observation.measurementFactIds].sort(),
    eventStatus: observation.event.status,
    opportunityEventId: observation.event.opportunityEventId,
    eventLabelVersion: observation.event.eventLabelVersion,
    eventStartAt: observation.event.eventStartAt,
    firstDetectedAt: snapshot.firstDetectedAt,
    checkpoint: observation.checkpoint,
    status: observation.status,
    maximumFavorableExcursion: observation.maximumFavorableExcursion,
    maximumAdverseExcursion: observation.maximumAdverseExcursion,
    netR: observation.netR,
    leadTimeSeconds,
    factCutoff: observation.factCutoff,
  };
  const digest = stableSha256(content);
  return assertM3StrategyOutcomeIntegrity({
    ...content,
    outcomeId: `strategy-outcome:${digest.slice(0, 24)}`,
    contentHash: stableContentHash(content),
  });
}

type OutcomeStatus = OutcomeRecord["status"];
type OutcomeEventStatus = OutcomeRecord["eventStatus"];

export type M3StrategyOutcomeAttributionStratum = Readonly<{
  stratumKey: string;
  strategyArchetypeId: OutcomeRecord["strategyArchetype"]["id"];
  strategyTaxonomyVersion: OutcomeRecord["strategyArchetype"]["taxonomyVersion"];
  strategyPolicyVersion: string;
  direction: OutcomeRecord["strategyArchetype"]["direction"];
  actionState: OutcomeRecord["strategyStateLabel"]["actionState"];
  checkpoint: OutcomeRecord["checkpoint"];
  eventLabelVersion: string | null;
  regime: OutcomeRecord["strategyContextTags"]["regime"];
  liquidityBucket: OutcomeRecord["strategyContextTags"]["liquidityBucket"];
  venueSet: OutcomeRecord["strategyContextTags"]["venueSet"];
  assetDomain: OutcomeRecord["strategyContextTags"]["assetDomain"];
  listingLifecycle: OutcomeRecord["strategyContextTags"]["listingLifecycle"];
  sampleSize: number;
  outcomeStatusCounts: Readonly<Record<OutcomeStatus, number>>;
  eventStatusCounts: Readonly<Record<OutcomeEventStatus, number>>;
  measuredNetRSampleSize: number;
  meanNetR: number | null;
  measuredLeadTimeSampleSize: number;
  meanLeadTimeSeconds: number | null;
}>;

export type M3StrategyOutcomeAttributionReport = Readonly<{
  schemaVersion: typeof M3_STRATEGY_OUTCOME_ATTRIBUTION_VERSION;
  reportId: string;
  authority: "DESCRIPTIVE_ONLY";
  probabilityAuthority: "ABSENT";
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  outcomePolicyVersion: string;
  outcomeRecordIds: readonly string[];
  totalRecordCount: number;
  unavailableRecordCount: number;
  strata: readonly M3StrategyOutcomeAttributionStratum[];
  contentHash: string;
}>;

const OUTCOME_STATUSES: readonly OutcomeStatus[] = [
  "TP_FIRST",
  "SL_FIRST",
  "PARTIAL",
  "EXPIRED",
  "NOT_TRIGGERED",
  "DATA_UNAVAILABLE",
];
const EVENT_STATUSES: readonly OutcomeEventStatus[] = [
  "OBSERVED",
  "NO_EVENT",
  "UNAVAILABLE",
];

function zeroCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function buildM3StrategyOutcomeAttribution(input: Readonly<{
  outcomes: readonly unknown[];
  generatedAt: string;
}>): M3StrategyOutcomeAttributionReport {
  if (input.outcomes.length === 0) {
    throw new Error("strategy outcome attribution requires at least one record");
  }
  const outcomes = input.outcomes
    .map(assertM3StrategyOutcomeIntegrity)
    .sort((left, right) => left.outcomeId.localeCompare(right.outcomeId));
  const outcomeIds = outcomes.map((outcome) => outcome.outcomeId);
  const checkpointKeys = outcomes.map((outcome) =>
    `${outcome.decisionSnapshotId}:${outcome.checkpoint}:${outcome.outcomePolicyVersion}`
  );
  if (
    new Set(outcomeIds).size !== outcomeIds.length ||
    new Set(checkpointKeys).size !== checkpointKeys.length
  ) {
    throw new Error(
      "strategy outcome attribution rejects duplicate records or decision checkpoints",
    );
  }
  const releaseIds = new Set(outcomes.map((outcome) => outcome.releaseId));
  const policyVersions = new Set(
    outcomes.map((outcome) => outcome.outcomePolicyVersion),
  );
  if (releaseIds.size !== 1 || policyVersions.size !== 1) {
    throw new Error(
      "one attribution report cannot mix release or outcome policy identities",
    );
  }
  const generatedMs = Date.parse(input.generatedAt);
  if (
    !Number.isFinite(generatedMs) ||
    outcomes.some((outcome) => Date.parse(outcome.generatedAt) > generatedMs)
  ) {
    throw new Error("attribution report cannot precede an OutcomeRecord");
  }

  type MutableStratum = {
    basis: Omit<
      M3StrategyOutcomeAttributionStratum,
      | "stratumKey"
      | "sampleSize"
      | "outcomeStatusCounts"
      | "eventStatusCounts"
      | "measuredNetRSampleSize"
      | "meanNetR"
      | "measuredLeadTimeSampleSize"
      | "meanLeadTimeSeconds"
    >;
    outcomes: OutcomeRecord[];
  };
  const groups = new Map<string, MutableStratum>();
  for (const outcome of outcomes) {
    const basis: MutableStratum["basis"] = {
      strategyArchetypeId: outcome.strategyArchetype.id,
      strategyTaxonomyVersion: outcome.strategyArchetype.taxonomyVersion,
      strategyPolicyVersion: outcome.strategyArchetype.policyVersion,
      direction: outcome.strategyArchetype.direction,
      actionState: outcome.strategyStateLabel.actionState,
      checkpoint: outcome.checkpoint,
      eventLabelVersion: outcome.eventLabelVersion,
      regime: outcome.strategyContextTags.regime,
      liquidityBucket: outcome.strategyContextTags.liquidityBucket,
      venueSet: [...outcome.strategyContextTags.venueSet].sort(),
      assetDomain: outcome.strategyContextTags.assetDomain,
      listingLifecycle: outcome.strategyContextTags.listingLifecycle,
    };
    const key = stableContentHash(basis);
    const group = groups.get(key) ?? { basis, outcomes: [] };
    group.outcomes.push(outcome);
    groups.set(key, group);
  }
  const strata = [...groups.entries()].map(([stratumKey, group]) => {
    const outcomeStatusCounts = zeroCounts(OUTCOME_STATUSES);
    const eventStatusCounts = zeroCounts(EVENT_STATUSES);
    const netRs: number[] = [];
    const leadTimes: number[] = [];
    for (const outcome of group.outcomes) {
      outcomeStatusCounts[outcome.status] += 1;
      eventStatusCounts[outcome.eventStatus] += 1;
      if (outcome.netR !== null) {
        netRs.push(outcome.netR);
      }
      if (outcome.leadTimeSeconds !== null) {
        leadTimes.push(outcome.leadTimeSeconds);
      }
    }
    return {
      stratumKey,
      ...group.basis,
      sampleSize: group.outcomes.length,
      outcomeStatusCounts,
      eventStatusCounts,
      measuredNetRSampleSize: netRs.length,
      meanNetR: netRs.length === 0
        ? null
        : netRs.reduce((sum, value) => sum + value, 0) / netRs.length,
      measuredLeadTimeSampleSize: leadTimes.length,
      meanLeadTimeSeconds: leadTimes.length === 0
        ? null
        : leadTimes.reduce((sum, value) => sum + value, 0) /
          leadTimes.length,
    } satisfies M3StrategyOutcomeAttributionStratum;
  }).sort((left, right) => left.stratumKey.localeCompare(right.stratumKey));
  const sourceCutoff = outcomes.reduce((latest, outcome) =>
    Date.parse(outcome.factCutoff) > Date.parse(latest)
      ? outcome.factCutoff
      : latest, outcomes[0].factCutoff);
  const content = {
    schemaVersion: M3_STRATEGY_OUTCOME_ATTRIBUTION_VERSION,
    authority: "DESCRIPTIVE_ONLY" as const,
    probabilityAuthority: "ABSENT" as const,
    releaseId: outcomes[0].releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff,
    outcomePolicyVersion: outcomes[0].outcomePolicyVersion,
    outcomeRecordIds: outcomes.map((outcome) => outcome.outcomeId).sort(),
    totalRecordCount: outcomes.length,
    unavailableRecordCount: outcomes.filter(
      (outcome) => outcome.status === "DATA_UNAVAILABLE",
    ).length,
    strata,
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact({
    ...content,
    reportId: `strategy-outcome-attribution:${digest.slice(0, 24)}`,
    contentHash: stableContentHash(content),
  });
}
