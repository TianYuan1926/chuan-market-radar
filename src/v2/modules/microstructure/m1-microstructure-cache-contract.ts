import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  QualityAssessmentSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import { M1_MICROSTRUCTURE_AUTHORITY } from "./m1-microstructure-contract";

export const M1_MICROSTRUCTURE_CACHE_POLICY_VERSION =
  "v2-m1-microstructure-cache-policy.v1" as const;
export const M1_MICROSTRUCTURE_CACHE_READ_VERSION =
  "v2-m1-microstructure-cache-read.v1" as const;

export const M1_MICROSTRUCTURE_CACHE_LAYERS = [
  "L1_PROCESS_MEMORY",
  "L2_REDIS",
  "L3_POSTGRESQL",
  "L4_COS",
] as const;

export const M1_MICROSTRUCTURE_ARTIFACT_CLASSES = [
  "MICROSTRUCTURE_FACT",
  "LIQUIDITY_WALL_EPISODE",
  "MARKET_MECHANICS_FEATURE_SET",
] as const;

export const M1_MICROSTRUCTURE_CACHE_KEY_DIMENSIONS = Object.freeze([
  "scopeEpoch",
  "sourceId",
  "venue",
  "canonicalInstrumentId",
  "artifactClass",
  "schemaVersion",
  "featureVersion",
  "window",
  "sourceCutoff",
] as const);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const LayerSchema = z.enum(M1_MICROSTRUCTURE_CACHE_LAYERS);
const ArtifactClassSchema = z.enum(M1_MICROSTRUCTURE_ARTIFACT_CLASSES);
const UniqueStringsSchema = z.array(NonEmptyStringSchema).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "cache key dimensions must be unique",
      });
    }
  },
);

function omitContentHash(value: object): Record<string, unknown> {
  const content = {
    ...(value as Record<string, unknown>),
  };
  delete content.contentHash;
  return content;
}

const CachePolicyRowSchema = z.strictObject({
  layer: LayerSchema,
  artifactClass: ArtifactClassSchema,
  ttlSeconds: NonNegativeIntegerSchema.nullable(),
  retentionSeconds: NonNegativeIntegerSchema,
  authorityClass: z.enum([
    "NON_AUTHORITATIVE_REBUILDABLE_CACHE",
    "STRUCTURED_AUDIT_AUTHORITY",
    "IMMUTABLE_REPLAY_AUTHORITY",
  ]),
  rebuildable: z.boolean(),
  keyDimensions: UniqueStringsSchema,
  staleReturnedExplicitly: z.literal(true),
  missingReturnedExplicitly: z.literal(true),
  backgroundRefreshMayPromoteStale: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
}).superRefine((row, context) => {
  const expectedDimensions = M1_MICROSTRUCTURE_CACHE_KEY_DIMENSIONS;
  if (
    row.keyDimensions.length !== expectedDimensions.length ||
    expectedDimensions.some((dimension) =>
      !row.keyDimensions.includes(dimension))
  ) {
    context.addIssue({
      code: "custom",
      message: "cache rows must bind every identity and point-in-time key dimension",
      path: ["keyDimensions"],
    });
  }
  const hotCache = ["L1_PROCESS_MEMORY", "L2_REDIS"].includes(row.layer);
  if (
    hotCache !==
      (
        row.authorityClass === "NON_AUTHORITATIVE_REBUILDABLE_CACHE" &&
        row.rebuildable &&
        row.ttlSeconds !== null &&
        row.ttlSeconds > 0
      )
  ) {
    context.addIssue({
      code: "custom",
      message: "L1/L2 must be bounded rebuildable caches and cannot be audit authority",
      path: ["authorityClass"],
    });
  }
  if (
    row.layer === "L3_POSTGRESQL" &&
    (
      row.authorityClass !== "STRUCTURED_AUDIT_AUTHORITY" ||
      row.rebuildable ||
      row.ttlSeconds !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "PostgreSQL must retain structured audit authority without cache TTL",
      path: ["layer"],
    });
  }
  if (
    row.layer === "L4_COS" &&
    (
      row.authorityClass !== "IMMUTABLE_REPLAY_AUTHORITY" ||
      row.rebuildable ||
      row.ttlSeconds !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "COS must retain immutable replay authority without cache TTL",
      path: ["layer"],
    });
  }
  if (row.retentionSeconds === 0) {
    context.addIssue({
      code: "custom",
      message: "every cache or authority row requires a bounded retention window",
      path: ["retentionSeconds"],
    });
  }
});

const cachePolicyCoreShape = {
  schemaVersion: z.literal(M1_MICROSTRUCTURE_CACHE_POLICY_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  policyId: NonEmptyStringSchema,
  rows: z.array(CachePolicyRowSchema).length(
    M1_MICROSTRUCTURE_CACHE_LAYERS.length *
      M1_MICROSTRUCTURE_ARTIFACT_CLASSES.length,
  ),
  singleFlightRequired: z.literal(true),
  jitterRequired: z.literal(true),
  quotaAwareSchedulingRequired: z.literal(true),
  circuitBreakerRequired: z.literal(true),
  frontendProviderDirectReadAllowed: z.literal(false),
  staleMayBecomeFresh: z.literal(false),
  missingMayBecomeZero: z.literal(false),
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
} as const;

function validateCachePolicy(
  policy: z.infer<z.ZodObject<typeof cachePolicyCoreShape>>,
  context: z.RefinementCtx,
): void {
  const keys = policy.rows.map((row) => `${row.layer}:${row.artifactClass}`);
  if (new Set(keys).size !== policy.rows.length) {
    context.addIssue({
      code: "custom",
      message: "cache policy must contain one row per layer and artifact class",
      path: ["rows"],
    });
  }
  for (const layer of M1_MICROSTRUCTURE_CACHE_LAYERS) {
    for (const artifactClass of M1_MICROSTRUCTURE_ARTIFACT_CLASSES) {
      if (!keys.includes(`${layer}:${artifactClass}`)) {
        context.addIssue({
          code: "custom",
          message: "cache policy denominator is incomplete",
          path: ["rows"],
        });
      }
    }
  }
}

export const M1MicrostructureCachePolicyInputSchema = z
  .strictObject(cachePolicyCoreShape)
  .superRefine(validateCachePolicy);

export const M1MicrostructureCachePolicySchema = z.strictObject({
  ...cachePolicyCoreShape,
  contentHash: DigestSchema,
}).superRefine((policy, context) => {
  validateCachePolicy(policy, context);
  const content = omitContentHash(policy);
  if (policy.contentHash !== stableContentHash(content)) {
    context.addIssue({
      code: "custom",
      message: "microstructure cache policy content hash mismatch",
      path: ["contentHash"],
    });
  }
});

export type M1MicrostructureCachePolicyInput = z.infer<
  typeof M1MicrostructureCachePolicyInputSchema
>;
export type M1MicrostructureCachePolicy = z.infer<
  typeof M1MicrostructureCachePolicySchema
>;

export function buildM1MicrostructureCachePolicy(
  rawInput: M1MicrostructureCachePolicyInput,
): M1MicrostructureCachePolicy {
  const input = M1MicrostructureCachePolicyInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    rows: [...input.rows]
      .map((row) => ({
        ...row,
        keyDimensions: [...row.keyDimensions].sort(),
      }))
      .sort((left, right) =>
        `${left.layer}:${left.artifactClass}`.localeCompare(
          `${right.layer}:${right.artifactClass}`,
        )),
  };
  return deepFreezeArtifact(M1MicrostructureCachePolicySchema.parse({
    ...canonicalInput,
    contentHash: stableContentHash(canonicalInput),
  }));
}

const RETENTION_SECONDS = Object.freeze({
  MICROSTRUCTURE_FACT: 7 * 24 * 60 * 60,
  LIQUIDITY_WALL_EPISODE: 30 * 24 * 60 * 60,
  MARKET_MECHANICS_FEATURE_SET: 90 * 24 * 60 * 60,
} as const);

const TTL_SECONDS = Object.freeze({
  L1_PROCESS_MEMORY: {
    MICROSTRUCTURE_FACT: 2,
    LIQUIDITY_WALL_EPISODE: 5,
    MARKET_MECHANICS_FEATURE_SET: 2,
  },
  L2_REDIS: {
    MICROSTRUCTURE_FACT: 15,
    LIQUIDITY_WALL_EPISODE: 30,
    MARKET_MECHANICS_FEATURE_SET: 15,
  },
} as const);

export const M1_MICROSTRUCTURE_CACHE_POLICY =
  buildM1MicrostructureCachePolicy({
    schemaVersion: M1_MICROSTRUCTURE_CACHE_POLICY_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    policyId: "v2-m1-microstructure-cache-policy",
    rows: M1_MICROSTRUCTURE_CACHE_LAYERS.flatMap((layer) =>
      M1_MICROSTRUCTURE_ARTIFACT_CLASSES.map((artifactClass) => {
        const hotCache =
          layer === "L1_PROCESS_MEMORY" || layer === "L2_REDIS";
        return {
          layer,
          artifactClass,
          ttlSeconds: hotCache
            ? TTL_SECONDS[layer][artifactClass]
            : null,
          retentionSeconds: RETENTION_SECONDS[artifactClass],
          authorityClass: layer === "L3_POSTGRESQL"
            ? "STRUCTURED_AUDIT_AUTHORITY" as const
            : layer === "L4_COS"
              ? "IMMUTABLE_REPLAY_AUTHORITY" as const
              : "NON_AUTHORITATIVE_REBUILDABLE_CACHE" as const,
          rebuildable: hotCache,
          keyDimensions: [...M1_MICROSTRUCTURE_CACHE_KEY_DIMENSIONS],
          staleReturnedExplicitly: true,
          missingReturnedExplicitly: true,
          backgroundRefreshMayPromoteStale: false,
          candidateEmissionAllowed: false,
        };
      })
    ),
    singleFlightRequired: true,
    jitterRequired: true,
    quotaAwareSchedulingRequired: true,
    circuitBreakerRequired: true,
    frontendProviderDirectReadAllowed: false,
    staleMayBecomeFresh: false,
    missingMayBecomeZero: false,
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
  });

export const M1MicrostructureCacheReadInputSchema = z.strictObject({
  schemaVersion: z.literal(M1_MICROSTRUCTURE_CACHE_READ_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  policyContentHash: DigestSchema,
  layer: LayerSchema,
  artifactClass: ArtifactClassSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  canonicalInstrumentId: NonEmptyStringSchema,
  artifactSchemaVersion: NonEmptyStringSchema,
  featureVersion: NonEmptyStringSchema,
  window: NonEmptyStringSchema,
  sourceCutoff: IsoDateTimeSchema,
  storedAt: IsoDateTimeSchema.nullable(),
  readAt: IsoDateTimeSchema,
  payloadPresent: z.boolean(),
  payloadContentHash: DigestSchema.nullable(),
  sourceQuality: QualityAssessmentSchema,
}).superRefine((input, context) => {
  if (
    input.policyContentHash !== M1_MICROSTRUCTURE_CACHE_POLICY.contentHash
  ) {
    context.addIssue({
      code: "custom",
      message: "cache read must bind the active cache policy",
      path: ["policyContentHash"],
    });
  }
  if (
    input.payloadPresent !==
      (input.payloadContentHash !== null && input.storedAt !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "cache payload presence, hash and stored time must agree",
      path: ["payloadPresent"],
    });
  }
  if (
    input.storedAt !== null &&
    (
      Date.parse(input.sourceCutoff) > Date.parse(input.storedAt) ||
      Date.parse(input.storedAt) > Date.parse(input.readAt)
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "cache read point-in-time lineage is not monotonic",
      path: ["storedAt"],
    });
  }
});

export const M1MicrostructureCacheReadResultSchema = z.strictObject({
  schemaVersion: z.literal(M1_MICROSTRUCTURE_CACHE_READ_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  cacheKey: DigestSchema,
  status: z.enum([
    "FRESH_HIT",
    "PARTIAL_HIT",
    "STALE_EXPLICIT",
    "MISS_EXPLICIT",
    "INVALID_EXPLICIT",
  ]),
  layer: LayerSchema,
  artifactClass: ArtifactClassSchema,
  ageMs: NonNegativeIntegerSchema.nullable(),
  payloadContentHash: DigestSchema.nullable(),
  sourceQuality: QualityAssessmentSchema,
  researchUsable: z.boolean(),
  decisionUsable: z.literal(false),
  missingRepresentedAsZero: z.literal(false),
  stalePromotedToFresh: z.literal(false),
  reasonCodes: ReasonCodesSchema.min(1),
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
  contentHash: DigestSchema,
});

export type M1MicrostructureCacheReadInput = z.infer<
  typeof M1MicrostructureCacheReadInputSchema
>;
export type M1MicrostructureCacheReadResult = z.infer<
  typeof M1MicrostructureCacheReadResultSchema
>;

export function evaluateM1MicrostructureCacheRead(
  rawInput: M1MicrostructureCacheReadInput,
): M1MicrostructureCacheReadResult {
  const input = M1MicrostructureCacheReadInputSchema.parse(rawInput);
  const policyRow = M1_MICROSTRUCTURE_CACHE_POLICY.rows.find((row) =>
    row.layer === input.layer &&
    row.artifactClass === input.artifactClass
  );
  if (policyRow === undefined) {
    throw new Error("active cache policy row is missing");
  }
  const cacheKey = stableContentHash({
    scopeEpoch: input.scopeEpoch,
    sourceId: input.sourceId,
    venue: input.venue,
    canonicalInstrumentId: input.canonicalInstrumentId,
    artifactClass: input.artifactClass,
    schemaVersion: input.artifactSchemaVersion,
    featureVersion: input.featureVersion,
    window: input.window,
    sourceCutoff: input.sourceCutoff,
  });
  const ageMs = input.storedAt === null
    ? null
    : Date.parse(input.readAt) - Date.parse(input.storedAt);
  const ttlExpired =
    policyRow.ttlSeconds !== null &&
    ageMs !== null &&
    ageMs > policyRow.ttlSeconds * 1_000;

  let status: M1MicrostructureCacheReadResult["status"];
  let reasons: string[];
  if (!input.payloadPresent) {
    status = "MISS_EXPLICIT";
    reasons = ["cache_payload_missing_explicit"];
  } else if (input.sourceQuality.status === "INVALID") {
    status = "INVALID_EXPLICIT";
    reasons = [
      "cache_source_quality_invalid",
      ...input.sourceQuality.reasonCodes,
    ];
  } else if (
    ttlExpired ||
    input.sourceQuality.status === "STALE"
  ) {
    status = "STALE_EXPLICIT";
    reasons = [
      ...(ttlExpired ? ["cache_ttl_expired"] : []),
      ...(input.sourceQuality.status === "STALE"
        ? input.sourceQuality.reasonCodes
        : []),
    ];
  } else if (input.sourceQuality.status === "PARTIAL") {
    status = "PARTIAL_HIT";
    reasons = [
      `cache_source_${input.sourceQuality.status.toLowerCase()}`,
      ...input.sourceQuality.reasonCodes,
    ];
  } else if (input.sourceQuality.status === "FRESH") {
    status = "FRESH_HIT";
    reasons = ["cache_payload_fresh"];
  } else {
    status = "MISS_EXPLICIT";
    reasons = [
      "cache_source_unavailable",
      ...input.sourceQuality.reasonCodes,
    ];
  }

  const body = {
    schemaVersion: M1_MICROSTRUCTURE_CACHE_READ_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    cacheKey,
    status,
    layer: input.layer,
    artifactClass: input.artifactClass,
    ageMs,
    payloadContentHash: input.payloadContentHash,
    sourceQuality: input.sourceQuality,
    researchUsable: status === "FRESH_HIT",
    decisionUsable: false,
    missingRepresentedAsZero: false,
    stalePromotedToFresh: false,
    reasonCodes: [...new Set(reasons)].sort(),
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
  } as const;
  return deepFreezeArtifact(M1MicrostructureCacheReadResultSchema.parse({
    ...body,
    contentHash: stableContentHash(body),
  }));
}
