import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_CAPABILITY_IDS,
  M1_FAILURE_SEMANTICS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
  type M1CapabilityId,
  type M1FailureSemantic,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_SOURCE_CONFORMANCE_VERSION =
  "v2-m1-exact-source-conformance.v1" as const;

export const M1_SOURCE_CONFORMANCE_PROBE_IDS = [
  "BINANCE_SERVER_TIME",
  "BINANCE_DERIVATIVE_CATALOG",
  "BINANCE_SPOT_CATALOG",
  "OKX_SERVER_TIME",
  "OKX_DERIVATIVE_CATALOG",
  "OKX_SPOT_CATALOG",
  "BYBIT_SERVER_TIME",
  "BYBIT_DERIVATIVE_CATALOG",
  "BYBIT_SPOT_CATALOG",
  "BYBIT_LISTING_ANNOUNCEMENT",
  "BITGET_SERVER_TIME",
  "BITGET_DERIVATIVE_CATALOG",
  "BITGET_SPOT_CATALOG",
  "BITGET_LISTING_ANNOUNCEMENT",
  "COINGLASS_SUPPORTED_COINS",
] as const;

export type M1SourceConformanceProbeId =
  (typeof M1_SOURCE_CONFORMANCE_PROBE_IDS)[number];

export const M1_IDENTITY_GATE_PROBE_IDS = [
  "BINANCE_SERVER_TIME",
  "BINANCE_DERIVATIVE_CATALOG",
  "OKX_SERVER_TIME",
  "OKX_DERIVATIVE_CATALOG",
  "BYBIT_SERVER_TIME",
  "BYBIT_DERIVATIVE_CATALOG",
  "BITGET_SERVER_TIME",
  "BITGET_DERIVATIVE_CATALOG",
] as const satisfies readonly M1SourceConformanceProbeId[];

export const M1_LISTING_GATE_PROBE_IDS = [
  "BINANCE_SPOT_CATALOG",
  "OKX_SPOT_CATALOG",
  "BYBIT_SPOT_CATALOG",
  "BYBIT_LISTING_ANNOUNCEMENT",
  "BITGET_SPOT_CATALOG",
  "BITGET_LISTING_ANNOUNCEMENT",
] as const satisfies readonly M1SourceConformanceProbeId[];

export const M1_COINGLASS_GATE_PROBE_IDS = [
  "COINGLASS_SUPPORTED_COINS",
] as const satisfies readonly M1SourceConformanceProbeId[];

export const M1_SOURCE_CONFORMANCE_FAILURES = [
  ...M1_FAILURE_SEMANTICS,
  "MISSING_REQUIRED_READ_ONLY_CREDENTIAL",
  "PROVIDER_BODY_ERROR_UNAVAILABLE",
  "PROBE_DEFINITION_DRIFT",
] as const;

export type M1SourceConformanceFailure =
  (typeof M1_SOURCE_CONFORMANCE_FAILURES)[number];

export type M1SourceConformanceGate =
  | "MULTI_ASSET_IDENTITY"
  | "LISTING_INTELLIGENCE"
  | "COINGLASS_CONTEXT";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ProbeIdSchema = z.enum(M1_SOURCE_CONFORMANCE_PROBE_IDS);
const UniqueStringsSchema = z.array(z.string()).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  },
);

export const M1SourceConformanceProbeObservationSchema = z.strictObject({
  probeId: ProbeIdSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  gate: z.enum([
    "MULTI_ASSET_IDENTITY",
    "LISTING_INTELLIGENCE",
    "COINGLASS_CONTEXT",
  ]),
  definitionDigest: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  outcome: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  attemptStartedAt: IsoDateTimeSchema.nullable(),
  receivedAt: IsoDateTimeSchema.nullable(),
  latencyMs: NonNegativeIntegerSchema.nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  responseBodyDigest: DigestSchema.nullable(),
  responseBytes: NonNegativeIntegerSchema.nullable(),
  topLevelKeys: UniqueStringsSchema,
  recordKeys: UniqueStringsSchema,
  observedRecordCount: NonNegativeIntegerSchema.nullable(),
  providerServerTime: IsoDateTimeSchema.nullable(),
  absoluteClockSkewMs: NonNegativeIntegerSchema.nullable(),
  paginationStatus: z.enum([
    "NOT_APPLICABLE",
    "COMPLETE",
    "BOUNDED_COMPLETE",
    "INCOMPLETE",
    "NOT_RUN",
  ]),
  credentialDisposition: z.enum([
    "PUBLIC_NO_CREDENTIAL",
    "READ_ONLY_KEY_USED_NOT_RETAINED",
    "MISSING_REQUIRED_READ_ONLY_KEY",
  ]),
  failure: z.enum(M1_SOURCE_CONFORMANCE_FAILURES).nullable(),
  reasonCodes: ReasonCodesSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
}).superRefine((observation, context) => {
  const hasAttempt = observation.attemptStartedAt !== null;
  if (
    hasAttempt !==
      (
        observation.receivedAt !== null &&
        observation.latencyMs !== null
      )
  ) {
    context.addIssue({
      code: "custom",
      message: "attempt chronology fields must be present together",
      path: ["attemptStartedAt"],
    });
  }
  if (
    observation.attemptStartedAt !== null &&
    observation.receivedAt !== null &&
    Date.parse(observation.attemptStartedAt) >
      Date.parse(observation.receivedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "probe cannot be received before it starts",
      path: ["receivedAt"],
    });
  }
  if (observation.outcome === "PASS") {
    for (const [field, value] of [
      ["httpStatus", observation.httpStatus],
      ["responseBodyDigest", observation.responseBodyDigest],
      ["responseBytes", observation.responseBytes],
      ["observedRecordCount", observation.observedRecordCount],
    ] as const) {
      if (value === null) {
        context.addIssue({
          code: "custom",
          message: `PASS probe requires ${field}`,
          path: [field],
        });
      }
    }
    if (
      observation.httpStatus !== null &&
      (observation.httpStatus < 200 || observation.httpStatus >= 300)
    ) {
      context.addIssue({
        code: "custom",
        message: "PASS probe requires a 2xx response",
        path: ["httpStatus"],
      });
    }
    if (observation.failure !== null || observation.reasonCodes.length > 0) {
      context.addIssue({
        code: "custom",
        message: "PASS probe cannot carry failure reasons",
        path: ["failure"],
      });
    }
    if (
      observation.paginationStatus === "INCOMPLETE" ||
      observation.paginationStatus === "NOT_RUN"
    ) {
      context.addIssue({
        code: "custom",
        message: "PASS probe requires completed pagination semantics",
        path: ["paginationStatus"],
      });
    }
  } else if (
    observation.failure === null ||
    observation.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "non-PASS probe requires a failure and reason",
      path: ["failure"],
    });
  }
  if (
    observation.outcome === "NOT_RUN" &&
    (
      observation.attemptStartedAt !== null ||
      observation.httpStatus !== null ||
      observation.responseBodyDigest !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "NOT_RUN cannot carry attempted response evidence",
      path: ["outcome"],
    });
  }
  if (
    observation.credentialDisposition ===
      "MISSING_REQUIRED_READ_ONLY_KEY" &&
    (
      observation.outcome !== "NOT_RUN" ||
      observation.failure !== "MISSING_REQUIRED_READ_ONLY_CREDENTIAL"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "missing credential must remain an explicit NOT_RUN",
      path: ["credentialDisposition"],
    });
  }
  if (
    observation.paginationStatus === "BOUNDED_COMPLETE" &&
    (
      observation.outcome !== "PASS" ||
      observation.capabilityId !== "LISTING_ANNOUNCEMENT"
    )
  ) {
    context.addIssue({
      code: "custom",
      message:
        "bounded pagination completion is reserved for passing listing announcement probes",
      path: ["paginationStatus"],
    });
  }
});

export type M1SourceConformanceProbeObservation = z.infer<
  typeof M1SourceConformanceProbeObservationSchema
>;

const GateStatusSchema = z.enum([
  "PASS",
  "BLOCKED",
  "NOT_EVALUATED_TEST_ONLY",
]);

export const M1SourceConformanceArtifactSchema = z.strictObject({
  schemaVersion: z.literal(M1_SOURCE_CONFORMANCE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  probePlanDigest: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "LOCAL_WORKSTATION",
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  expectedProbeCount: z.literal(15),
  observedProbeCount: z.literal(15),
  passCount: NonNegativeIntegerSchema,
  failCount: NonNegativeIntegerSchema,
  notRunCount: NonNegativeIntegerSchema,
  identityGateStatus: GateStatusSchema,
  listingGateStatus: GateStatusSchema,
  coinGlassGateStatus: GateStatusSchema,
  probes: z.array(M1SourceConformanceProbeObservationSchema).length(15),
  artifactId: NonEmptyStringSchema,
  contentHash: DigestSchema,
  authorityBoundary: z.literal(
    "READ_ONLY_SOURCE_CONFORMANCE_ONLY_NO_MARKET_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  runtimeNetworkRequestsPerformed: z.boolean(),
  productionChanged: z.literal(false),
  secretMaterialPresent: z.literal(false),
}).superRefine((artifact, context) => {
  if (Date.parse(artifact.sourceCutoff) > Date.parse(artifact.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "sourceCutoff cannot be later than generatedAt",
      path: ["sourceCutoff"],
    });
  }
  const probeIds = artifact.probes.map((probe) => probe.probeId);
  if (
    new Set(probeIds).size !== M1_SOURCE_CONFORMANCE_PROBE_IDS.length ||
    M1_SOURCE_CONFORMANCE_PROBE_IDS.some((probeId) =>
      !probeIds.includes(probeId)
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "artifact must account every exact probe once",
      path: ["probes"],
    });
  }
  const counts = {
    pass: artifact.probes.filter((probe) => probe.outcome === "PASS").length,
    fail: artifact.probes.filter((probe) => probe.outcome === "FAIL").length,
    notRun: artifact.probes.filter((probe) => probe.outcome === "NOT_RUN")
      .length,
  };
  if (
    artifact.passCount !== counts.pass ||
    artifact.failCount !== counts.fail ||
    artifact.notRunCount !== counts.notRun
  ) {
    context.addIssue({
      code: "custom",
      message: "probe outcome counts do not match observations",
      path: ["passCount"],
    });
  }
  if (
    artifact.runtimeNetworkRequestsPerformed !==
      artifact.probes.some((probe) => probe.attemptStartedAt !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "runtime request truth does not match probe attempts",
      path: ["runtimeNetworkRequestsPerformed"],
    });
  }
  if (
    artifact.probes.some((probe) => probe.evidenceClass !== artifact.evidenceClass)
  ) {
    context.addIssue({
      code: "custom",
      message: "probe and artifact evidence classes must match",
      path: ["evidenceClass"],
    });
  }
  const byId = new Map(artifact.probes.map((probe) => [probe.probeId, probe]));
  const expectedGate = (
    probeIds: readonly M1SourceConformanceProbeId[],
  ): z.infer<typeof GateStatusSchema> =>
    artifact.evidenceClass === "TEST_ONLY"
      ? "NOT_EVALUATED_TEST_ONLY"
      : probeIds.every((probeId) => byId.get(probeId)?.outcome === "PASS")
        ? "PASS"
        : "BLOCKED";
  for (const [field, actual, expected] of [
    [
      "identityGateStatus",
      artifact.identityGateStatus,
      expectedGate(M1_IDENTITY_GATE_PROBE_IDS),
    ],
    [
      "listingGateStatus",
      artifact.listingGateStatus,
      expectedGate(M1_LISTING_GATE_PROBE_IDS),
    ],
    [
      "coinGlassGateStatus",
      artifact.coinGlassGateStatus,
      expectedGate(M1_COINGLASS_GATE_PROBE_IDS),
    ],
  ] as const) {
    if (actual !== expected) {
      context.addIssue({
        code: "custom",
        message: `${field} does not match probe outcomes`,
        path: [field],
      });
    }
  }
  const sortedProbeIds = [...probeIds].sort();
  if (probeIds.some((probeId, index) => probeId !== sortedProbeIds[index])) {
    context.addIssue({
      code: "custom",
      message: "probes must use canonical probe-id ordering",
      path: ["probes"],
    });
  }
  const expectedContentHash = stableContentHash({
    scopeEpoch: artifact.scopeEpoch,
    releaseId: artifact.releaseId,
    generatedAt: artifact.generatedAt,
    sourceCutoff: artifact.sourceCutoff,
    registryDigest: artifact.registryDigest,
    probePlanDigest: artifact.probePlanDigest,
    evidenceClass: artifact.evidenceClass,
    networkEnvironment: artifact.networkEnvironment,
    expectedProbeCount: artifact.expectedProbeCount,
    observedProbeCount: artifact.observedProbeCount,
    passCount: artifact.passCount,
    failCount: artifact.failCount,
    notRunCount: artifact.notRunCount,
    identityGateStatus: artifact.identityGateStatus,
    listingGateStatus: artifact.listingGateStatus,
    coinGlassGateStatus: artifact.coinGlassGateStatus,
    probes: artifact.probes,
    authorityBoundary: artifact.authorityBoundary,
    runtimeNetworkRequestsPerformed: artifact.runtimeNetworkRequestsPerformed,
    productionChanged: artifact.productionChanged,
    secretMaterialPresent: artifact.secretMaterialPresent,
  });
  if (artifact.contentHash !== expectedContentHash) {
    context.addIssue({
      code: "custom",
      message: "source conformance content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    artifact.artifactId !==
      `source-conformance:${artifact.contentHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "source conformance artifact id mismatch",
      path: ["artifactId"],
    });
  }
});

export type M1SourceConformanceArtifact = z.infer<
  typeof M1SourceConformanceArtifactSchema
>;

export type M1SourceConformanceProbeDefinition = Readonly<{
  probeId: M1SourceConformanceProbeId;
  sourceId: M1SourceId;
  capabilityId: M1CapabilityId;
  gate: M1SourceConformanceGate;
  requiresReadOnlyApiKey: boolean;
  paginationExpectation:
    | "NOT_APPLICABLE"
    | "MUST_TERMINATE"
    | "BOUNDED_HEAD_WINDOW";
}>;

function gateStatus(
  evidenceClass: M1SourceConformanceArtifact["evidenceClass"],
  probeIds: readonly M1SourceConformanceProbeId[],
  observations: readonly M1SourceConformanceProbeObservation[],
): z.infer<typeof GateStatusSchema> {
  if (evidenceClass === "TEST_ONLY") {
    return "NOT_EVALUATED_TEST_ONLY";
  }
  const byId = new Map(observations.map((probe) => [probe.probeId, probe]));
  return probeIds.every((probeId) => byId.get(probeId)?.outcome === "PASS")
    ? "PASS"
    : "BLOCKED";
}

export function buildM1SourceConformanceArtifact(input: {
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  registryDigest: string;
  probePlanDigest: string;
  evidenceClass: M1SourceConformanceArtifact["evidenceClass"];
  networkEnvironment: M1SourceConformanceArtifact["networkEnvironment"];
  probes: readonly M1SourceConformanceProbeObservation[];
}): M1SourceConformanceArtifact {
  const probes = [...input.probes].sort((left, right) =>
    left.probeId.localeCompare(right.probeId)
  );
  const core = {
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    registryDigest: input.registryDigest,
    probePlanDigest: input.probePlanDigest,
    evidenceClass: input.evidenceClass,
    networkEnvironment: input.networkEnvironment,
    expectedProbeCount: 15 as const,
    observedProbeCount: 15 as const,
    passCount: probes.filter((probe) => probe.outcome === "PASS").length,
    failCount: probes.filter((probe) => probe.outcome === "FAIL").length,
    notRunCount: probes.filter((probe) => probe.outcome === "NOT_RUN").length,
    identityGateStatus: gateStatus(
      input.evidenceClass,
      M1_IDENTITY_GATE_PROBE_IDS,
      probes,
    ),
    listingGateStatus: gateStatus(
      input.evidenceClass,
      M1_LISTING_GATE_PROBE_IDS,
      probes,
    ),
    coinGlassGateStatus: gateStatus(
      input.evidenceClass,
      M1_COINGLASS_GATE_PROBE_IDS,
      probes,
    ),
    probes,
    authorityBoundary:
      "READ_ONLY_SOURCE_CONFORMANCE_ONLY_NO_MARKET_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY" as const,
    runtimeNetworkRequestsPerformed: probes.some(
      (probe) => probe.attemptStartedAt !== null,
    ),
    productionChanged: false as const,
    secretMaterialPresent: false as const,
  };
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1SourceConformanceArtifactSchema.parse({
    ...core,
    schemaVersion: M1_SOURCE_CONFORMANCE_VERSION,
    artifactId: `source-conformance:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

export function failureSemantic(
  value: M1SourceConformanceFailure,
): M1FailureSemantic | null {
  return (M1_FAILURE_SEMANTICS as readonly string[]).includes(value)
    ? value as M1FailureSemantic
    : null;
}
