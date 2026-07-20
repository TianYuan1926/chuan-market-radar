import { z } from "zod";
import {
  isOpportunityPatternForFamily,
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_PATTERNS,
} from "../../domain/product-constitution";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  QualityAssessmentSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import { deepFreezeArtifact } from "../universe/stable-artifact";
import {
  M2DetectorReadInputSchema,
  M2_OPPORTUNITY_FAMILY_DEFINITIONS,
} from "./discovery-contract";

export const M2_DISCOVERY_GOLDEN_FIXTURE_VERSION =
  "v2-m2-discovery-golden-fixtures.v1" as const;

export const M2_POINT_IN_TIME_FLAGS = [
  "DISCOVERY_ELIGIBLE_AT_CUTOFF",
  "EARLY_SETUP_AT_CUTOFF",
  "DIRECTION_UNRESOLVED_AT_CUTOFF",
  "LATE_AT_CUTOFF",
  "NOISE_RISK_AT_CUTOFF",
  "FAKEOUT_RISK_AT_CUTOFF",
  "DATA_UNAVAILABLE_AT_CUTOFF",
  "COUNTEREXAMPLE_AT_CUTOFF",
] as const;

const ObservationValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]).nullable();

export const M2PointInTimeObservationSchema = z.strictObject({
  observationId: NonEmptyStringSchema,
  semanticKey: NonEmptyStringSchema,
  value: ObservationValueSchema,
  unit: NonEmptyStringSchema,
  observedAt: IsoDateTimeSchema,
  sourceReferenceId: NonEmptyStringSchema,
  quality: QualityAssessmentSchema,
});

export const M2DiscoveryGoldenCaseSchema = z.strictObject({
  caseId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  opportunityPattern: z.enum(OPPORTUNITY_PATTERNS),
  directionHypothesis: z.enum(["LONG", "SHORT", "UNKNOWN"]),
  sourceCutoff: IsoDateTimeSchema,
  detectorInput: M2DetectorReadInputSchema,
  observations: z.array(M2PointInTimeObservationSchema).min(2),
  expectedDisposition: z.enum([
    "DISCOVER",
    "NO_CANDIDATE",
    "DATA_UNAVAILABLE",
  ]),
  pointInTimeFlags: z.array(z.enum(M2_POINT_IN_TIME_FLAGS)).min(1),
  reasonCodes: ReasonCodesSchema.min(1),
}).superRefine((fixtureCase, context) => {
  if (!isOpportunityPatternForFamily(
    fixtureCase.opportunityFamily,
    fixtureCase.opportunityPattern,
  )) {
    context.addIssue({
      code: "custom",
      message: "golden case pattern does not belong to its family",
      path: ["opportunityPattern"],
    });
  }
  const definition = M2_OPPORTUNITY_FAMILY_DEFINITIONS.find(
    (candidate) => candidate.family === fixtureCase.opportunityFamily,
  );
  if (!definition?.allowedDirections.includes(
    fixtureCase.directionHypothesis as never,
  )) {
    context.addIssue({
      code: "custom",
      message: "golden case direction is not allowed by the family contract",
      path: ["directionHypothesis"],
    });
  }
  if (
    fixtureCase.sourceCutoff !== fixtureCase.detectorInput.eventCutoff
  ) {
    context.addIssue({
      code: "custom",
      message: "golden case cutoff must equal its detector input cutoff",
      path: ["sourceCutoff"],
    });
  }
  const sourceReferences = new Set([
    fixtureCase.detectorInput.universe.artifactId,
    fixtureCase.detectorInput.featureSet.artifactId,
    fixtureCase.detectorInput.featureQuality.artifactId,
    fixtureCase.detectorInput.marketContext.artifactId,
    fixtureCase.detectorInput.observedPrice.artifactId,
    ...fixtureCase.detectorInput.featureSet.featureIds,
  ]);
  for (const [index, observation] of fixtureCase.observations.entries()) {
    if (Date.parse(observation.observedAt) > Date.parse(fixtureCase.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "golden observation cannot occur after the case cutoff",
        path: ["observations", index, "observedAt"],
      });
    }
    if (!sourceReferences.has(observation.sourceReferenceId)) {
      context.addIssue({
        code: "custom",
        message: "golden observation requires declared detector lineage",
        path: ["observations", index, "sourceReferenceId"],
      });
    }
  }
  if (new Set(fixtureCase.observations.map(
    (observation) => observation.observationId,
  )).size !== fixtureCase.observations.length) {
    context.addIssue({
      code: "custom",
      message: "golden observation ids must be unique within a case",
      path: ["observations"],
    });
  }
  if (new Set(fixtureCase.pointInTimeFlags).size !==
    fixtureCase.pointInTimeFlags.length) {
    context.addIssue({
      code: "custom",
      message: "point-in-time flags must be unique",
      path: ["pointInTimeFlags"],
    });
  }
  if (new Set(fixtureCase.reasonCodes).size !== fixtureCase.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "golden case reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
  if (
    fixtureCase.expectedDisposition === "DISCOVER" &&
    !fixtureCase.pointInTimeFlags.includes("DISCOVERY_ELIGIBLE_AT_CUTOFF")
  ) {
    context.addIssue({
      code: "custom",
      message: "discover cases require an eligibility flag at cutoff",
      path: ["pointInTimeFlags"],
    });
  }
  if (
    fixtureCase.expectedDisposition === "DATA_UNAVAILABLE" &&
    !fixtureCase.pointInTimeFlags.includes("DATA_UNAVAILABLE_AT_CUTOFF")
  ) {
    context.addIssue({
      code: "custom",
      message: "unavailable cases require an unavailable flag at cutoff",
      path: ["pointInTimeFlags"],
    });
  }
  if (
    fixtureCase.expectedDisposition === "NO_CANDIDATE" &&
    !fixtureCase.pointInTimeFlags.includes("COUNTEREXAMPLE_AT_CUTOFF")
  ) {
    context.addIssue({
      code: "custom",
      message: "no-candidate cases require an explicit counterexample flag",
      path: ["pointInTimeFlags"],
    });
  }
});

export const M2DiscoveryGoldenFixtureSchema = z.strictObject({
  schemaVersion: z.literal(M2_DISCOVERY_GOLDEN_FIXTURE_VERSION),
  fixtureScope: z.literal("TEST_ONLY_POINT_IN_TIME"),
  runtimeImportAllowed: z.literal(false),
  cases: z.array(M2DiscoveryGoldenCaseSchema).min(1),
}).superRefine((fixture, context) => {
  const caseIds = fixture.cases.map((fixtureCase) => fixtureCase.caseId);
  if (new Set(caseIds).size !== caseIds.length) {
    context.addIssue({
      code: "custom",
      message: "golden case ids must be globally unique",
      path: ["cases"],
    });
  }
  for (const family of OPPORTUNITY_FAMILIES) {
    const familyCases = fixture.cases.filter(
      (fixtureCase) => fixtureCase.opportunityFamily === family,
    );
    for (const direction of ["LONG", "SHORT"] as const) {
      if (!familyCases.some((fixtureCase) =>
        fixtureCase.directionHypothesis === direction &&
        fixtureCase.expectedDisposition === "DISCOVER"
      )) {
        context.addIssue({
          code: "custom",
          message: "every family requires long and short discovery fixtures",
          path: ["cases"],
        });
      }
    }
    if (!familyCases.some((fixtureCase) =>
      fixtureCase.expectedDisposition !== "DISCOVER"
    )) {
      context.addIssue({
        code: "custom",
        message: "every family requires a point-in-time counterexample",
        path: ["cases"],
      });
    }
  }
});

export type M2DiscoveryGoldenFixture = z.infer<
  typeof M2DiscoveryGoldenFixtureSchema
>;

const FORBIDDEN_FUTURE_KEY = /^(?:outcome|mfe|mae|quality[_-]?hit|public[_-]?breakout[_-]?time|event[_-]?start|future[_-]?(?:mfe|mae|outcome|price|candle|window|return))$/iu;
const FORBIDDEN_FUTURE_VALUE = /(?:future[_ -]?(?:mfe|mae|outcome|price|candle|window|return)|public[_ -]?breakout[_ -]?time|event[_ -]?start|quality[_ -]?hit|outcome[_ -]?(?:hit|label|record)|\b(?:mfe|mae)\b)/iu;

function assertNoFutureMaterial(value: unknown, path: string): void {
  if (typeof value === "string" && FORBIDDEN_FUTURE_VALUE.test(value)) {
    throw new Error(`future material is forbidden in M2 golden fixtures at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoFutureMaterial(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FUTURE_KEY.test(key)) {
      throw new Error(`future field ${key} is forbidden in M2 golden fixtures`);
    }
    assertNoFutureMaterial(child, `${path}.${key}`);
  }
}

export function parseM2DiscoveryGoldenFixture(
  rawFixture: unknown,
): M2DiscoveryGoldenFixture {
  assertNoFutureMaterial(rawFixture, "$fixture");
  return deepFreezeArtifact(M2DiscoveryGoldenFixtureSchema.parse(rawFixture));
}
