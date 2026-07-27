import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeDecimalStringSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
} from "../../../runtime-schema/primitives";
import {
  M1_MICROSTRUCTURE_FACT_TYPES,
} from "../../microstructure/m1-microstructure-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1SourceId,
} from "../../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";

export const M1_EXPANDED_SHADOW_PROVIDER_PROFILE_VERSION =
  "v2-m1-expanded-shadow-provider-profile.v1" as const;
export const M1_EXPANDED_SHADOW_PROVIDER_PLAN_VERSION =
  "v2-m1-expanded-shadow-provider-plan.v1" as const;
export const M1_EXPANDED_SHADOW_OBSERVATION_VERSION =
  "v2-m1-expanded-shadow-provider-observation.v1" as const;

export const M1_SHADOW_CONNECTION_ROLES = [
  "BINANCE_PUBLIC_HIGH_FREQUENCY",
  "BINANCE_MARKET_REGULAR",
  "OKX_PUBLIC",
  "BYBIT_LINEAR_PUBLIC",
  "BITGET_UTA_PUBLIC",
] as const;

export const M1_SHADOW_SOURCE_COMPLETENESS = [
  "PROVIDER_EVENT_FEED",
  "PROVIDER_AGGREGATED_EVENT_FEED",
  "PROVIDER_SAMPLED_LIQUIDATION_FEED",
  "PROVIDER_SAMPLED_MAX_SIDE_PER_SECOND",
  "PROVIDER_POINT_IN_TIME_SNAPSHOT",
  "PROVIDER_INCREMENTAL_BOOK",
] as const;

export const M1_SHADOW_SEQUENCE_ASSURANCE = [
  "PREVIOUS_SEQUENCE_CONTIGUITY",
  "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
  "EVENT_ID_MONOTONICITY",
  "NO_SEQUENCE_PROVIDER_LIMITATION",
] as const;

export const M1_EXPANDED_SHADOW_PROVIDER_PROFILES = deepFreezeArtifact({
  schemaVersion: M1_EXPANDED_SHADOW_PROVIDER_PROFILE_VERSION,
  scopeEpoch: M1_SCOPE_EPOCH,
  reviewedAt: "2026-07-26T00:00:00.000Z",
  authorityBoundary:
    "PUBLIC_READ_ONLY_CAPTURE_NO_FACT_CANDIDATE_SIGNAL_STRATEGY_READY_OR_TRADING_AUTHORITY",
  venues: {
    BINANCE_FUTURES: {
      sourceEpoch: "BINANCE_USDS_M_FUTURES_ROUTED_WS_2026_04_23",
      jsonIntegerPolicy: "REJECT_UNSAFE_NATIVE_NUMBERS_ACCEPT_DECIMAL_STRINGS",
      websocketEndpoints: {
        public: {
          role: "BINANCE_PUBLIC_HIGH_FREQUENCY",
          url: "wss://fstream.binance.com/public/stream",
          host: "fstream.binance.com",
        },
        market: {
          role: "BINANCE_MARKET_REGULAR",
          url: "wss://fstream.binance.com/market/stream",
          host: "fstream.binance.com",
        },
      },
      restSnapshot: {
        urlTemplate:
          "https://fapi.binance.com/fapi/v1/depth?symbol={symbol}&limit=1000",
        host: "fapi.binance.com",
      },
      heartbeat: {
        mode: "PROTOCOL_PING_PONG",
        intervalMs: 180_000,
      },
      channels: {
        PUBLIC_TRADE: {
          endpoint: "market",
          template: "{symbol_lower}@aggTrade",
          completeness: "PROVIDER_AGGREGATED_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
        },
        TOP_OF_BOOK: {
          endpoint: "public",
          template: "{symbol_lower}@bookTicker",
          completeness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
        },
        ORDER_BOOK_SNAPSHOT: {
          endpoint: "restSnapshot",
          template: "REST_DEPTH_1000",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        ORDER_BOOK_DELTA: {
          endpoint: "public",
          template: "{symbol_lower}@depth@100ms",
          completeness: "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        LIQUIDATION_EVENT: {
          endpoint: "market",
          template: "{symbol_lower}@forceOrder",
          completeness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        MARK_INDEX_REFERENCE: {
          endpoint: "market",
          template: "{symbol_lower}@markPrice@1s",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
      },
      officialDocumentation: [
        "https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Connect",
        "https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Important-WebSocket-Change-Notice",
        "https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/How-to-manage-a-local-order-book-correctly",
      ],
    },
    OKX_SWAP: {
      sourceEpoch: "OKX_V5_PUBLIC_WS_SEQUENCE_2026",
      jsonIntegerPolicy:
        "LOSSLESS_INTEGER_DECODE_REQUIRED_REJECT_UNSAFE_NATIVE_NUMBERS",
      websocketEndpoints: {
        public: {
          role: "OKX_PUBLIC",
          url: "wss://ws.okx.com:8443/ws/v5/public",
          host: "ws.okx.com",
        },
      },
      restSnapshot: null,
      heartbeat: {
        mode: "TEXT_PING_PONG",
        intervalMs: 20_000,
      },
      channels: {
        PUBLIC_TRADE: {
          endpoint: "public",
          template: "trades",
          completeness: "PROVIDER_AGGREGATED_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
        },
        TOP_OF_BOOK: {
          endpoint: "public",
          template: "bbo-tbt",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
        },
        ORDER_BOOK_SNAPSHOT: {
          endpoint: "public",
          template: "books:snapshot",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        ORDER_BOOK_DELTA: {
          endpoint: "public",
          template: "books:update",
          completeness: "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        LIQUIDATION_EVENT: {
          endpoint: "public",
          template: "liquidation-orders",
          completeness: "PROVIDER_SAMPLED_LIQUIDATION_FEED",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        MARK_INDEX_REFERENCE: {
          endpoint: "public",
          template: "mark-price+index-tickers",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
      },
      officialDocumentation: [
        "https://www.okx.com/docs-v5/en/",
        "https://www.okx.com/docs-v5/trick_en/",
        "https://www.okx.com/docs-v5/log_en/",
      ],
    },
    BYBIT_DERIVATIVES: {
      sourceEpoch: "BYBIT_V5_LINEAR_PUBLIC_2026",
      jsonIntegerPolicy:
        "LOSSLESS_INTEGER_DECODE_REQUIRED_REJECT_UNSAFE_NATIVE_NUMBERS",
      websocketEndpoints: {
        public: {
          role: "BYBIT_LINEAR_PUBLIC",
          url: "wss://stream.bybit.com/v5/public/linear",
          host: "stream.bybit.com",
        },
      },
      restSnapshot: null,
      heartbeat: {
        mode: "JSON_PING_PONG",
        intervalMs: 20_000,
      },
      channels: {
        PUBLIC_TRADE: {
          endpoint: "public",
          template: "publicTrade.{symbol}",
          completeness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
        },
        TOP_OF_BOOK: {
          endpoint: "public",
          template: "tickers.{symbol}",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        ORDER_BOOK_SNAPSHOT: {
          endpoint: "public",
          template: "orderbook.50.{symbol}:snapshot",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
        },
        ORDER_BOOK_DELTA: {
          endpoint: "public",
          template: "orderbook.50.{symbol}:delta",
          completeness: "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
        },
        LIQUIDATION_EVENT: {
          endpoint: "public",
          template: "allLiquidation.{symbol}",
          completeness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        MARK_INDEX_REFERENCE: {
          endpoint: "public",
          template: "tickers.{symbol}",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
      },
      officialDocumentation: [
        "https://bybit-exchange.github.io/docs/v5/ws/connect",
        "https://bybit-exchange.github.io/docs/v5/websocket/public/trade",
        "https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook",
        "https://bybit-exchange.github.io/docs/v5/websocket/public/ticker",
        "https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation",
      ],
    },
    BITGET_FUTURES: {
      sourceEpoch: "BITGET_UTA_V3_PUBLIC_2026_06_23",
      jsonIntegerPolicy:
        "LOSSLESS_INTEGER_DECODE_REQUIRED_REJECT_UNSAFE_NATIVE_NUMBERS",
      websocketEndpoints: {
        public: {
          role: "BITGET_UTA_PUBLIC",
          url: "wss://ws.bitget.com/v3/ws/public",
          host: "ws.bitget.com",
        },
      },
      restSnapshot: null,
      heartbeat: {
        mode: "TEXT_PING_PONG",
        intervalMs: 30_000,
      },
      channels: {
        PUBLIC_TRADE: {
          endpoint: "public",
          template: "publicTrade",
          completeness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
        },
        TOP_OF_BOOK: {
          endpoint: "public",
          template: "ticker",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        ORDER_BOOK_SNAPSHOT: {
          endpoint: "public",
          template: "books:snapshot",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        ORDER_BOOK_DELTA: {
          endpoint: "public",
          template: "books:update",
          completeness: "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        },
        LIQUIDATION_EVENT: {
          endpoint: "public",
          template: "liquidation",
          completeness: "PROVIDER_SAMPLED_MAX_SIDE_PER_SECOND",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
        MARK_INDEX_REFERENCE: {
          endpoint: "public",
          template: "ticker",
          completeness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        },
      },
      officialDocumentation: [
        "https://www.bitget.com/api-doc/uta/guide",
        "https://www.bitget.com/api-doc/uta/websocket/public/New-Trades-Channel",
        "https://www.bitget.com/api-doc/uta/websocket/public/Tickers-Channel",
        "https://www.bitget.com/api-doc/uta/websocket/public/Order-Book-Channel",
        "https://www.bitget.com/api-doc/uta/websocket/public/Liquidation-Channel",
        "https://www.bitget.com/api-doc/uta/changelog",
      ],
    },
  },
} as const);

export const M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST =
  stableContentHash(M1_EXPANDED_SHADOW_PROVIDER_PROFILES);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const TransportSymbolSchema = z.string().regex(/^[A-Z0-9][A-Z0-9._-]{1,80}$/u);
const SizeUnitSchema = z.enum([
  "BASE_ASSET",
  "QUOTE_ASSET",
  "CONTRACT",
  "PROVIDER_AMOUNT",
]);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const FactTypeSchema = z.enum(M1_MICROSTRUCTURE_FACT_TYPES);
const SourceCompletenessSchema = z.enum(M1_SHADOW_SOURCE_COMPLETENESS);
const SequenceAssuranceSchema = z.enum(M1_SHADOW_SEQUENCE_ASSURANCE);
const ConnectionRoleSchema = z.enum(M1_SHADOW_CONNECTION_ROLES);

export const M1ShadowProviderSubjectSchema = z.strictObject({
  subjectId: NonEmptyStringSchema,
  venue: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema,
  transportSymbol: TransportSymbolSchema,
  referenceInstrumentId: TransportSymbolSchema.nullable(),
  instrumentFamily: TransportSymbolSchema.nullable(),
  sizeUnit: SizeUnitSchema,
}).superRefine((subject, context) => {
  if (
    subject.venue === "OKX_SWAP" &&
    (
      subject.referenceInstrumentId === null ||
      subject.instrumentFamily === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "OKX requires explicit point-in-time index and instrument family",
    });
  }
  if (
    subject.venue !== "OKX_SWAP" &&
    (
      subject.referenceInstrumentId !== null ||
      subject.instrumentFamily !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "non-OKX subjects cannot carry an inferred OKX reference identity",
    });
  }
});

export type M1ShadowProviderSubject = z.infer<
  typeof M1ShadowProviderSubjectSchema
>;

const SubscriptionFrameSchema = z.strictObject({
  frameId: NonEmptyStringSchema,
  body: z.record(z.string(), z.unknown()),
  bodyDigest: DigestSchema,
});

const ConnectionPlanSchema = z.strictObject({
  connectionId: NonEmptyStringSchema,
  venue: VenueSchema,
  role: ConnectionRoleSchema,
  url: z.string().url(),
  allowedHost: NonEmptyStringSchema,
  heartbeatMode: z.enum([
    "PROTOCOL_PING_PONG",
    "TEXT_PING_PONG",
    "JSON_PING_PONG",
  ]),
  heartbeatIntervalMs: z.number().int().positive(),
  subscriptionFrames: z.array(SubscriptionFrameSchema).min(1),
  factTypes: z.array(FactTypeSchema).min(1),
  subjectIds: z.array(NonEmptyStringSchema).min(1),
});

const RestSnapshotPlanSchema = z.strictObject({
  requestId: NonEmptyStringSchema,
  venue: z.literal("BINANCE_FUTURES"),
  subjectId: NonEmptyStringSchema,
  allowedHost: z.literal("fapi.binance.com"),
  url: z.string().url(),
  factType: z.literal("ORDER_BOOK_SNAPSHOT"),
});

const ProviderPlanCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_EXPANDED_SHADOW_PROVIDER_PLAN_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  providerProfileDigest: z.literal(
    M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
  ),
  subjects: z.array(M1ShadowProviderSubjectSchema).min(8).max(2_000),
  connections: z.array(ConnectionPlanSchema).length(5),
  restSnapshots: z.array(RestSnapshotPlanSchema),
  allowedHosts: z.array(NonEmptyStringSchema).length(5),
  sourceEpochs: z.strictObject({
    BINANCE_FUTURES: NonEmptyStringSchema,
    OKX_SWAP: NonEmptyStringSchema,
    BYBIT_DERIVATIVES: NonEmptyStringSchema,
    BITGET_FUTURES: NonEmptyStringSchema,
  }),
  rawBodyRetentionAllowed: z.literal(false),
  credentialsRequired: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
});

const EXPECTED_ALLOWED_HOSTS = [
  "fapi.binance.com",
  "fstream.binance.com",
  "stream.bybit.com",
  "ws.bitget.com",
  "ws.okx.com",
] as const;

const EXPECTED_CONNECTION_BOUNDARIES = {
  BINANCE_PUBLIC_HIGH_FREQUENCY: {
    venue: "BINANCE_FUTURES",
    url: "wss://fstream.binance.com/public/stream",
    allowedHost: "fstream.binance.com",
  },
  BINANCE_MARKET_REGULAR: {
    venue: "BINANCE_FUTURES",
    url: "wss://fstream.binance.com/market/stream",
    allowedHost: "fstream.binance.com",
  },
  OKX_PUBLIC: {
    venue: "OKX_SWAP",
    url: "wss://ws.okx.com:8443/ws/v5/public",
    allowedHost: "ws.okx.com",
  },
  BYBIT_LINEAR_PUBLIC: {
    venue: "BYBIT_DERIVATIVES",
    url: "wss://stream.bybit.com/v5/public/linear",
    allowedHost: "stream.bybit.com",
  },
  BITGET_UTA_PUBLIC: {
    venue: "BITGET_FUTURES",
    url: "wss://ws.bitget.com/v3/ws/public",
    allowedHost: "ws.bitget.com",
  },
} as const satisfies Record<
  (typeof M1_SHADOW_CONNECTION_ROLES)[number],
  {
    readonly venue: (typeof M1_VENUE_SOURCE_IDS)[number];
    readonly url: string;
    readonly allowedHost: string;
  }
>;

function validateProviderEndpointBoundaries(
  plan: z.infer<typeof ProviderPlanCoreSchema>,
  context: z.RefinementCtx,
): void {
  if (
    JSON.stringify(plan.allowedHosts) !==
      JSON.stringify(EXPECTED_ALLOWED_HOSTS)
  ) {
    context.addIssue({
      code: "custom",
      message: "provider plan host allowlist drifted",
      path: ["allowedHosts"],
    });
  }

  const roles = plan.connections.map((connection) => connection.role);
  if (
    new Set(roles).size !== M1_SHADOW_CONNECTION_ROLES.length ||
    M1_SHADOW_CONNECTION_ROLES.some((role) => !roles.includes(role))
  ) {
    context.addIssue({
      code: "custom",
      message: "provider plan connection role denominator drifted",
      path: ["connections"],
    });
  }

  for (const [index, connection] of plan.connections.entries()) {
    const expected = EXPECTED_CONNECTION_BOUNDARIES[connection.role];
    if (
      connection.venue !== expected.venue ||
      connection.url !== expected.url ||
      connection.allowedHost !== expected.allowedHost
    ) {
      context.addIssue({
        code: "custom",
        message: "provider connection endpoint boundary drifted",
        path: ["connections", index],
      });
    }
    const expectedSubjectIds = plan.subjects
      .filter((subject) => subject.venue === connection.venue)
      .map((subject) => subject.subjectId)
      .sort();
    if (
      JSON.stringify(connection.subjectIds) !==
        JSON.stringify(expectedSubjectIds)
    ) {
      context.addIssue({
        code: "custom",
        message: "provider connection subject denominator drifted",
        path: ["connections", index, "subjectIds"],
      });
    }
  }

  const binanceSubjects = plan.subjects
    .filter((subject) => subject.venue === "BINANCE_FUTURES")
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
  const restRequests = [...plan.restSnapshots]
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
  if (restRequests.length !== binanceSubjects.length) {
    context.addIssue({
      code: "custom",
      message: "provider REST snapshot denominator drifted",
      path: ["restSnapshots"],
    });
  }
  for (const [index, subject] of binanceSubjects.entries()) {
    const request = restRequests[index];
    if (request === undefined || request.subjectId !== subject.subjectId) {
      context.addIssue({
        code: "custom",
        message: "provider REST snapshot subject drifted",
        path: ["restSnapshots", index],
      });
      continue;
    }
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      context.addIssue({
        code: "custom",
        message: "provider REST snapshot URL invalid",
        path: ["restSnapshots", index, "url"],
      });
      continue;
    }
    const queryKeys = [...url.searchParams.keys()].sort();
    if (
      url.protocol !== "https:" ||
      url.hostname !== "fapi.binance.com" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/fapi/v1/depth" ||
      JSON.stringify(queryKeys) !== JSON.stringify(["limit", "symbol"]) ||
      url.searchParams.get("symbol") !== subject.transportSymbol ||
      url.searchParams.get("limit") !== "1000"
    ) {
      context.addIssue({
        code: "custom",
        message: "provider REST snapshot endpoint boundary drifted",
        path: ["restSnapshots", index, "url"],
      });
    }
  }
}

export const M1ExpandedShadowProviderPlanSchema =
  ProviderPlanCoreSchema.extend({
    planId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((plan, context) => {
    const core = providerPlanCore(plan);
    validateProviderEndpointBoundaries(core, context);
    const expectedHash = stableContentHash(core);
    if (plan.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "provider plan content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      plan.planId !==
        `m1-shadow-provider-plan:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "provider plan id mismatch",
        path: ["planId"],
      });
    }
  });

export type M1ExpandedShadowProviderPlan = z.infer<
  typeof M1ExpandedShadowProviderPlanSchema
>;

function providerPlanCore(
  plan: z.input<typeof ProviderPlanCoreSchema> & {
    readonly planId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ProviderPlanCoreSchema> {
  return ProviderPlanCoreSchema.parse({
    schemaVersion: plan.schemaVersion,
    scopeEpoch: plan.scopeEpoch,
    releaseId: plan.releaseId,
    generatedAt: plan.generatedAt,
    providerProfileDigest: plan.providerProfileDigest,
    subjects: plan.subjects,
    connections: plan.connections,
    restSnapshots: plan.restSnapshots,
    allowedHosts: plan.allowedHosts,
    sourceEpochs: plan.sourceEpochs,
    rawBodyRetentionAllowed: plan.rawBodyRetentionAllowed,
    credentialsRequired: plan.credentialsRequired,
    factAuthorityGranted: plan.factAuthorityGranted,
    candidateAuthorityGranted: plan.candidateAuthorityGranted,
    strategyAuthorityGranted: plan.strategyAuthorityGranted,
    readyAuthorityGranted: plan.readyAuthorityGranted,
    automaticTradingAllowed: plan.automaticTradingAllowed,
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function frame(frameId: string, body: Record<string, unknown>) {
  return {
    frameId,
    body,
    bodyDigest: stableContentHash(body),
  };
}

function subjectsFor(
  subjects: readonly M1ShadowProviderSubject[],
  venue: M1SourceId,
): M1ShadowProviderSubject[] {
  return subjects.filter((subject) => subject.venue === venue);
}

function connection(input: {
  readonly connectionId: string;
  readonly venue: (typeof M1_VENUE_SOURCE_IDS)[number];
  readonly role: (typeof M1_SHADOW_CONNECTION_ROLES)[number];
  readonly url: string;
  readonly allowedHost: string;
  readonly heartbeatMode:
    | "PROTOCOL_PING_PONG"
    | "TEXT_PING_PONG"
    | "JSON_PING_PONG";
  readonly heartbeatIntervalMs: number;
  readonly frames: readonly ReturnType<typeof frame>[];
  readonly factTypes: readonly (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number][];
  readonly subjectIds: readonly string[];
}) {
  return ConnectionPlanSchema.parse({
    connectionId: input.connectionId,
    venue: input.venue,
    role: input.role,
    url: input.url,
    allowedHost: input.allowedHost,
    heartbeatMode: input.heartbeatMode,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
    subscriptionFrames: input.frames,
    factTypes: uniqueSorted(input.factTypes),
    subjectIds: uniqueSorted(input.subjectIds),
  });
}

export function buildM1ExpandedShadowProviderPlan(input: {
  readonly releaseId: string;
  readonly generatedAt: string;
  readonly subjects: readonly M1ShadowProviderSubject[];
}): M1ExpandedShadowProviderPlan {
  const releaseId = ReleaseIdSchema.parse(input.releaseId);
  const generatedAt = IsoDateTimeSchema.parse(input.generatedAt);
  const subjects = input.subjects
    .map((subject) => M1ShadowProviderSubjectSchema.parse(subject))
    .sort((left, right) =>
      left.venue.localeCompare(right.venue) ||
      left.subjectId.localeCompare(right.subjectId)
    );
  if (new Set(subjects.map((subject) => subject.subjectId)).size !== subjects.length) {
    throw new Error("provider subject ids must be unique");
  }
  for (const venue of M1_VENUE_SOURCE_IDS) {
    if (subjectsFor(subjects, venue).length < 2) {
      throw new Error(`provider plan requires trigger and control for ${venue}`);
    }
  }

  const binance = subjectsFor(subjects, "BINANCE_FUTURES");
  const okx = subjectsFor(subjects, "OKX_SWAP");
  const bybit = subjectsFor(subjects, "BYBIT_DERIVATIVES");
  const bitget = subjectsFor(subjects, "BITGET_FUTURES");
  const connections = [
    connection({
      connectionId: "m1-shadow:binance:public",
      venue: "BINANCE_FUTURES",
      role: "BINANCE_PUBLIC_HIGH_FREQUENCY",
      url: M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BINANCE_FUTURES
        .websocketEndpoints.public.url,
      allowedHost: "fstream.binance.com",
      heartbeatMode: "PROTOCOL_PING_PONG",
      heartbeatIntervalMs: 180_000,
      frames: [
        frame("m1-shadow:binance:public:subscribe", {
          method: "SUBSCRIBE",
          params: uniqueSorted(binance.flatMap((subject) => [
            `${subject.transportSymbol.toLowerCase()}@bookTicker`,
            `${subject.transportSymbol.toLowerCase()}@depth@100ms`,
          ])),
          id: "m1-shadow-binance-public",
        }),
      ],
      factTypes: ["TOP_OF_BOOK", "ORDER_BOOK_DELTA"],
      subjectIds: binance.map((subject) => subject.subjectId),
    }),
    connection({
      connectionId: "m1-shadow:binance:market",
      venue: "BINANCE_FUTURES",
      role: "BINANCE_MARKET_REGULAR",
      url: M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BINANCE_FUTURES
        .websocketEndpoints.market.url,
      allowedHost: "fstream.binance.com",
      heartbeatMode: "PROTOCOL_PING_PONG",
      heartbeatIntervalMs: 180_000,
      frames: [
        frame("m1-shadow:binance:market:subscribe", {
          method: "SUBSCRIBE",
          params: uniqueSorted(binance.flatMap((subject) => [
            `${subject.transportSymbol.toLowerCase()}@aggTrade`,
            `${subject.transportSymbol.toLowerCase()}@forceOrder`,
            `${subject.transportSymbol.toLowerCase()}@markPrice@1s`,
          ])),
          id: "m1-shadow-binance-market",
        }),
      ],
      factTypes: [
        "PUBLIC_TRADE",
        "LIQUIDATION_EVENT",
        "MARK_INDEX_REFERENCE",
      ],
      subjectIds: binance.map((subject) => subject.subjectId),
    }),
    connection({
      connectionId: "m1-shadow:okx:public",
      venue: "OKX_SWAP",
      role: "OKX_PUBLIC",
      url: M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.OKX_SWAP
        .websocketEndpoints.public.url,
      allowedHost: "ws.okx.com",
      heartbeatMode: "TEXT_PING_PONG",
      heartbeatIntervalMs: 20_000,
      frames: [
        frame("m1-shadow:okx:public:subscribe", {
          op: "subscribe",
          args: [
            ...okx.flatMap((subject) => [
              { channel: "trades", instId: subject.transportSymbol },
              { channel: "bbo-tbt", instId: subject.transportSymbol },
              { channel: "books", instId: subject.transportSymbol },
              { channel: "mark-price", instId: subject.transportSymbol },
              {
                channel: "index-tickers",
                instId: subject.referenceInstrumentId,
              },
            ]),
            ...uniqueSorted(
              okx.map((subject) => subject.instrumentFamily!),
            ).map((instrumentFamily) => ({
              channel: "liquidation-orders",
              instType: "SWAP",
              instFamily: instrumentFamily,
            })),
          ],
        }),
      ],
      factTypes: M1_MICROSTRUCTURE_FACT_TYPES,
      subjectIds: okx.map((subject) => subject.subjectId),
    }),
    connection({
      connectionId: "m1-shadow:bybit:linear-public",
      venue: "BYBIT_DERIVATIVES",
      role: "BYBIT_LINEAR_PUBLIC",
      url: M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BYBIT_DERIVATIVES
        .websocketEndpoints.public.url,
      allowedHost: "stream.bybit.com",
      heartbeatMode: "JSON_PING_PONG",
      heartbeatIntervalMs: 20_000,
      frames: [
        frame("m1-shadow:bybit:public:subscribe", {
          op: "subscribe",
          args: uniqueSorted(bybit.flatMap((subject) => [
            `publicTrade.${subject.transportSymbol}`,
            `orderbook.50.${subject.transportSymbol}`,
            `tickers.${subject.transportSymbol}`,
            `allLiquidation.${subject.transportSymbol}`,
          ])),
          req_id: "m1-shadow-bybit-public",
        }),
      ],
      factTypes: M1_MICROSTRUCTURE_FACT_TYPES,
      subjectIds: bybit.map((subject) => subject.subjectId),
    }),
    connection({
      connectionId: "m1-shadow:bitget:uta-public",
      venue: "BITGET_FUTURES",
      role: "BITGET_UTA_PUBLIC",
      url: M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BITGET_FUTURES
        .websocketEndpoints.public.url,
      allowedHost: "ws.bitget.com",
      heartbeatMode: "TEXT_PING_PONG",
      heartbeatIntervalMs: 30_000,
      frames: [
        frame("m1-shadow:bitget:public:subscribe", {
          op: "subscribe",
          args: [
            ...bitget.flatMap((subject) => [
              {
                instType: "usdt-futures",
                topic: "publicTrade",
                symbol: subject.transportSymbol,
              },
              {
                instType: "usdt-futures",
                topic: "ticker",
                symbol: subject.transportSymbol,
              },
              {
                instType: "usdt-futures",
                topic: "books",
                symbol: subject.transportSymbol,
              },
            ]),
            {
              instType: "usdt-futures",
              topic: "liquidation",
            },
          ],
        }),
      ],
      factTypes: M1_MICROSTRUCTURE_FACT_TYPES,
      subjectIds: bitget.map((subject) => subject.subjectId),
    }),
  ];
  const restSnapshots = binance.map((subject) =>
    RestSnapshotPlanSchema.parse({
      requestId: `m1-shadow:binance:depth:${subject.subjectId}`,
      venue: "BINANCE_FUTURES",
      subjectId: subject.subjectId,
      allowedHost: "fapi.binance.com",
      url:
        `https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(subject.transportSymbol)}&limit=1000`,
      factType: "ORDER_BOOK_SNAPSHOT",
    })
  );
  const core = providerPlanCore({
    schemaVersion: M1_EXPANDED_SHADOW_PROVIDER_PLAN_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId,
    generatedAt,
    providerProfileDigest: M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
    subjects,
    connections,
    restSnapshots,
    allowedHosts: [...EXPECTED_ALLOWED_HOSTS],
    sourceEpochs: {
      BINANCE_FUTURES:
        M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BINANCE_FUTURES.sourceEpoch,
      OKX_SWAP:
        M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.OKX_SWAP.sourceEpoch,
      BYBIT_DERIVATIVES:
        M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BYBIT_DERIVATIVES.sourceEpoch,
      BITGET_FUTURES:
        M1_EXPANDED_SHADOW_PROVIDER_PROFILES.venues.BITGET_FUTURES.sourceEpoch,
    },
    rawBodyRetentionAllowed: false,
    credentialsRequired: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ExpandedShadowProviderPlanSchema.parse({
    ...core,
    planId: `m1-shadow-provider-plan:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

const BookLevelTupleSchema = z.tuple([
  PositiveDecimalStringSchema,
  NonNegativeDecimalStringSchema,
]);

const TradePayloadSchema = z.strictObject({
  kind: z.literal("PUBLIC_TRADE"),
  tradeId: NonEmptyStringSchema,
  price: PositiveDecimalStringSchema,
  size: PositiveDecimalStringSchema,
  aggressorSide: z.enum(["BUY", "SELL", "UNKNOWN"]),
  makerSideKnown: z.boolean(),
  blockTrade: z.boolean().nullable(),
  rpiTrade: z.boolean().nullable(),
});

const TopOfBookPayloadSchema = z.strictObject({
  kind: z.literal("TOP_OF_BOOK"),
  bestBidPrice: PositiveDecimalStringSchema,
  bestBidSize: PositiveDecimalStringSchema,
  bestAskPrice: PositiveDecimalStringSchema,
  bestAskSize: PositiveDecimalStringSchema,
});

const BookPayloadSchema = z.strictObject({
  kind: z.enum(["ORDER_BOOK_SNAPSHOT", "ORDER_BOOK_DELTA"]),
  bids: z.array(BookLevelTupleSchema).max(2_000),
  asks: z.array(BookLevelTupleSchema).max(2_000),
  maximumDepth: NonNegativeIntegerSchema.nullable(),
});

const LiquidationPayloadSchema = z.strictObject({
  kind: z.literal("LIQUIDATION_EVENT"),
  liquidationId: NonEmptyStringSchema,
  liquidatedSide: z.enum(["LONG", "SHORT", "UNKNOWN"]),
  price: PositiveDecimalStringSchema,
  size: PositiveDecimalStringSchema,
  providerAmountUnit: z.enum([
    "BASE_ASSET",
    "QUOTE_ASSET",
    "CONTRACT",
    "UNKNOWN",
  ]),
});

const MarkIndexPayloadSchema = z.strictObject({
  kind: z.literal("MARK_INDEX_REFERENCE"),
  markPrice: PositiveDecimalStringSchema.nullable(),
  indexPrice: PositiveDecimalStringSchema.nullable(),
}).superRefine((payload, context) => {
  if (payload.markPrice === null && payload.indexPrice === null) {
    context.addIssue({
      code: "custom",
      message: "mark/index observation requires one real provider value",
    });
  }
});

const ObservationPayloadSchema = z.discriminatedUnion("kind", [
  TradePayloadSchema,
  TopOfBookPayloadSchema,
  BookPayloadSchema,
  LiquidationPayloadSchema,
  MarkIndexPayloadSchema,
]);

const ObservationCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_EXPANDED_SHADOW_OBSERVATION_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  providerProfileDigest: z.literal(
    M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
  ),
  venue: VenueSchema,
  subjectId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  transportSymbol: TransportSymbolSchema,
  factType: FactTypeSchema,
  sourceEventId: NonEmptyStringSchema,
  sourceEventAt: IsoDateTimeSchema,
  receivedAt: IsoDateTimeSchema,
  sourceCompleteness: SourceCompletenessSchema,
  sequenceAssurance: SequenceAssuranceSchema,
  sequenceStart: NonEmptyStringSchema.nullable(),
  sequenceEnd: NonEmptyStringSchema.nullable(),
  previousSequence: NonEmptyStringSchema.nullable(),
  snapshotReset: z.boolean(),
  sizeUnit: SizeUnitSchema,
  payload: ObservationPayloadSchema,
  providerPayloadHash: DigestSchema,
  providerPayloadBytes: NonNegativeIntegerSchema,
  rawBodyRetained: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
});

export const M1ShadowProviderObservationSchema =
  ObservationCoreSchema.extend({
    observationId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((observation, context) => {
    if (observation.payload.kind !== observation.factType) {
      context.addIssue({
        code: "custom",
        message: "fact type and provider payload kind disagree",
        path: ["payload"],
      });
    }
    if (
      Date.parse(observation.sourceEventAt) > Date.parse(observation.receivedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "provider event time cannot be after local receive time",
        path: ["sourceEventAt"],
      });
    }
    const expectedHash = stableContentHash(observationCore(observation));
    if (observation.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "provider observation content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      observation.observationId !==
        `m1-shadow-observation:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "provider observation id mismatch",
        path: ["observationId"],
      });
    }
  });

export type M1ShadowProviderObservation = z.infer<
  typeof M1ShadowProviderObservationSchema
>;

function observationCore(
  observation: z.input<typeof ObservationCoreSchema> & {
    readonly observationId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ObservationCoreSchema> {
  return ObservationCoreSchema.parse({
    schemaVersion: observation.schemaVersion,
    scopeEpoch: observation.scopeEpoch,
    providerProfileDigest: observation.providerProfileDigest,
    venue: observation.venue,
    subjectId: observation.subjectId,
    venueInstrumentId: observation.venueInstrumentId,
    transportSymbol: observation.transportSymbol,
    factType: observation.factType,
    sourceEventId: observation.sourceEventId,
    sourceEventAt: observation.sourceEventAt,
    receivedAt: observation.receivedAt,
    sourceCompleteness: observation.sourceCompleteness,
    sequenceAssurance: observation.sequenceAssurance,
    sequenceStart: observation.sequenceStart,
    sequenceEnd: observation.sequenceEnd,
    previousSequence: observation.previousSequence,
    snapshotReset: observation.snapshotReset,
    sizeUnit: observation.sizeUnit,
    payload: observation.payload,
    providerPayloadHash: observation.providerPayloadHash,
    providerPayloadBytes: observation.providerPayloadBytes,
    rawBodyRetained: observation.rawBodyRetained,
    factAuthorityGranted: observation.factAuthorityGranted,
    candidateAuthorityGranted: observation.candidateAuthorityGranted,
    strategyAuthorityGranted: observation.strategyAuthorityGranted,
    readyAuthorityGranted: observation.readyAuthorityGranted,
    automaticTradingAllowed: observation.automaticTradingAllowed,
  });
}

type ObservationInput = Omit<
  z.input<typeof ObservationCoreSchema>,
  | "schemaVersion"
  | "scopeEpoch"
  | "providerProfileDigest"
  | "rawBodyRetained"
  | "factAuthorityGranted"
  | "candidateAuthorityGranted"
  | "strategyAuthorityGranted"
  | "readyAuthorityGranted"
  | "automaticTradingAllowed"
>;

function createObservation(input: ObservationInput): M1ShadowProviderObservation {
  const core = observationCore({
    ...input,
    schemaVersion: M1_EXPANDED_SHADOW_OBSERVATION_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    providerProfileDigest: M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
    rawBodyRetained: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ShadowProviderObservationSchema.parse({
    ...core,
    observationId: `m1-shadow-observation:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerString(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return typeof value === "string" && /^\d+$/u.test(value) ? value : null;
}

function positiveDecimal(value: unknown): string | null {
  const parsed = PositiveDecimalStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function nonNegativeDecimal(value: unknown): string | null {
  const parsed = NonNegativeDecimalStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function eventIso(value: unknown): string | null {
  const milliseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function payloadEvidence(payload: unknown) {
  const serialized = JSON.stringify(payload);
  return {
    providerPayloadHash: stableContentHash(payload),
    providerPayloadBytes: Buffer.byteLength(serialized, "utf8"),
  };
}

function subjectsBySymbol(
  subjects: readonly M1ShadowProviderSubject[],
  venue: (typeof M1_VENUE_SOURCE_IDS)[number],
  symbol: string,
  reference = false,
): M1ShadowProviderSubject[] {
  return subjects.filter((subject) =>
    subject.venue === venue &&
    (
      reference
        ? subject.referenceInstrumentId === symbol
        : subject.transportSymbol === symbol
    )
  );
}

function bookLevels(value: unknown): [string, string][] | null {
  if (!Array.isArray(value)) return null;
  const levels: [string, string][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 2) return null;
    const price = positiveDecimal(row[0]);
    const size = nonNegativeDecimal(row[1]);
    if (price === null || size === null) return null;
    levels.push([price, size]);
  }
  return levels;
}

export type M1ShadowProviderParseResult =
  | Readonly<{
    status: "DATA";
    observations: readonly M1ShadowProviderObservation[];
    heartbeatObserved: true;
    reasonCodes: readonly string[];
  }>
  | Readonly<{
    status: "CONTROL";
    observations: readonly [];
    heartbeatObserved: boolean;
    reasonCodes: readonly string[];
  }>
  | Readonly<{
    status: "SCHEMA_DRIFT";
    observations: readonly [];
    heartbeatObserved: false;
    reasonCodes: readonly ["provider_schema_drift_unavailable"];
  }>;

function data(
  observations: readonly M1ShadowProviderObservation[],
  reasonCodes: readonly string[] = [],
): M1ShadowProviderParseResult {
  return observations.length === 0
    ? {
      status: "CONTROL",
      observations: [],
      heartbeatObserved: true,
      reasonCodes,
    }
    : {
      status: "DATA",
      observations,
      heartbeatObserved: true,
      reasonCodes,
    };
}

function drift(): M1ShadowProviderParseResult {
  return {
    status: "SCHEMA_DRIFT",
    observations: [],
    heartbeatObserved: false,
    reasonCodes: ["provider_schema_drift_unavailable"],
  };
}

function control(
  heartbeatObserved: boolean,
  reasonCodes: readonly string[] = [],
): M1ShadowProviderParseResult {
  return {
    status: "CONTROL",
    observations: [],
    heartbeatObserved,
    reasonCodes,
  };
}

function withSubject(input: {
  readonly subject: M1ShadowProviderSubject;
  readonly receivedAt: string;
  readonly providerPayload: unknown;
  readonly factType: (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number];
  readonly sourceEventId: string;
  readonly sourceEventAt: string;
  readonly sourceCompleteness:
    (typeof M1_SHADOW_SOURCE_COMPLETENESS)[number];
  readonly sequenceAssurance:
    (typeof M1_SHADOW_SEQUENCE_ASSURANCE)[number];
  readonly sequenceStart: string | null;
  readonly sequenceEnd: string | null;
  readonly previousSequence: string | null;
  readonly snapshotReset: boolean;
  readonly payload: z.input<typeof ObservationPayloadSchema>;
}): M1ShadowProviderObservation {
  return createObservation({
    venue: input.subject.venue,
    subjectId: input.subject.subjectId,
    venueInstrumentId: input.subject.venueInstrumentId,
    transportSymbol: input.subject.transportSymbol,
    factType: input.factType,
    sourceEventId: input.sourceEventId,
    sourceEventAt: input.sourceEventAt,
    receivedAt: input.receivedAt,
    sourceCompleteness: input.sourceCompleteness,
    sequenceAssurance: input.sequenceAssurance,
    sequenceStart: input.sequenceStart,
    sequenceEnd: input.sequenceEnd,
    previousSequence: input.previousSequence,
    snapshotReset: input.snapshotReset,
    sizeUnit: input.subject.sizeUnit,
    payload: input.payload,
    ...payloadEvidence(input.providerPayload),
  });
}

function parseBinance(input: {
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly subjects: readonly M1ShadowProviderSubject[];
  readonly transportKind: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
  readonly subjectId?: string;
}): M1ShadowProviderParseResult {
  const wrapped = object(input.payload);
  if (wrapped === null) return drift();
  const payload = object(wrapped.data) ?? wrapped;
  const evidencePayload = object(wrapped.data) === null ? wrapped : wrapped.data;
  if (input.transportKind === "REST_SNAPSHOT") {
    const subject = input.subjects.find((item) =>
      item.venue === "BINANCE_FUTURES" &&
      item.subjectId === input.subjectId
    );
    const sequence = integerString(payload.lastUpdateId);
    const bids = bookLevels(payload.bids);
    const asks = bookLevels(payload.asks);
    const sourceEventAt = eventIso(payload.E ?? payload.T) ?? input.receivedAt;
    if (
      subject === undefined ||
      sequence === null ||
      bids === null ||
      asks === null
    ) return drift();
    return data([
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "ORDER_BOOK_SNAPSHOT",
        sourceEventId: `binance-depth-snapshot:${subject.transportSymbol}:${sequence}`,
        sourceEventAt,
        sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
        sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        sequenceStart: sequence,
        sequenceEnd: sequence,
        previousSequence: null,
        snapshotReset: true,
        payload: {
          kind: "ORDER_BOOK_SNAPSHOT",
          bids,
          asks,
          maximumDepth: 1_000,
        },
      }),
    ]);
  }
  if (payload.result === null && payload.id !== undefined) {
    return control(true, ["subscription_acknowledged"]);
  }
  const eventType = stringValue(payload.e);
  const symbol = stringValue(payload.s);
  if (
    eventType === null &&
    payload.u !== undefined &&
    payload.b !== undefined &&
    payload.B !== undefined &&
    payload.a !== undefined &&
    payload.A !== undefined
  ) {
    const stream = stringValue(wrapped.stream);
    const streamSymbol =
      symbol ?? stream?.split("@")[0]?.toUpperCase() ?? null;
    if (streamSymbol === null) return drift();
    const subjects = subjectsBySymbol(
      input.subjects,
      "BINANCE_FUTURES",
      streamSymbol,
    );
    const bid = positiveDecimal(payload.b);
    const bidSize = positiveDecimal(payload.B);
    const ask = positiveDecimal(payload.a);
    const askSize = positiveDecimal(payload.A);
    const sequence = integerString(payload.u);
    if (
      subjects.length === 0 ||
      bid === null ||
      bidSize === null ||
      ask === null ||
      askSize === null ||
      sequence === null
    ) return drift();
    return data(subjects.map((subject) =>
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "TOP_OF_BOOK",
        sourceEventId: `binance-book-ticker:${streamSymbol}:${sequence}`,
        sourceEventAt: input.receivedAt,
        sourceCompleteness: "PROVIDER_EVENT_FEED",
        sequenceAssurance: "EVENT_ID_MONOTONICITY",
        sequenceStart: sequence,
        sequenceEnd: sequence,
        previousSequence: null,
        snapshotReset: false,
        payload: {
          kind: "TOP_OF_BOOK",
          bestBidPrice: bid,
          bestBidSize: bidSize,
          bestAskPrice: ask,
          bestAskSize: askSize,
        },
      })
    ));
  }
  if (symbol === null) return drift();
  const subjects = subjectsBySymbol(
    input.subjects,
    "BINANCE_FUTURES",
    symbol,
  );
  if (subjects.length === 0) return control(true, ["unselected_symbol_ignored"]);
  if (eventType === "aggTrade") {
    const tradeId = integerString(payload.a);
    const price = positiveDecimal(payload.p);
    const size = positiveDecimal(payload.q);
    const sourceEventAt = eventIso(payload.T);
    if (
      tradeId === null ||
      price === null ||
      size === null ||
      sourceEventAt === null ||
      typeof payload.m !== "boolean"
    ) return drift();
    return data(subjects.map((subject) =>
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "PUBLIC_TRADE",
        sourceEventId: `binance-agg-trade:${symbol}:${tradeId}`,
        sourceEventAt,
        sourceCompleteness: "PROVIDER_AGGREGATED_EVENT_FEED",
        sequenceAssurance: "EVENT_ID_MONOTONICITY",
        sequenceStart: tradeId,
        sequenceEnd: tradeId,
        previousSequence: null,
        snapshotReset: false,
        payload: {
          kind: "PUBLIC_TRADE",
          tradeId,
          price,
          size,
          aggressorSide: payload.m ? "SELL" : "BUY",
          makerSideKnown: true,
          blockTrade: null,
          rpiTrade: null,
        },
      })
    ));
  }
  if (eventType === "depthUpdate") {
    const start = integerString(payload.U);
    const end = integerString(payload.u);
    const previous = integerString(payload.pu);
    const bids = bookLevels(payload.b);
    const asks = bookLevels(payload.a);
    const sourceEventAt = eventIso(payload.T ?? payload.E);
    if (
      start === null ||
      end === null ||
      previous === null ||
      bids === null ||
      asks === null ||
      sourceEventAt === null
    ) return drift();
    return data(subjects.map((subject) =>
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "ORDER_BOOK_DELTA",
        sourceEventId: `binance-depth:${symbol}:${start}:${end}`,
        sourceEventAt,
        sourceCompleteness: "PROVIDER_INCREMENTAL_BOOK",
        sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
        sequenceStart: start,
        sequenceEnd: end,
        previousSequence: previous,
        snapshotReset: false,
        payload: {
          kind: "ORDER_BOOK_DELTA",
          bids,
          asks,
          maximumDepth: null,
        },
      })
    ));
  }
  if (eventType === "markPriceUpdate") {
    const sourceEventAt = eventIso(payload.E);
    const markPrice = positiveDecimal(payload.p);
    const indexPrice = positiveDecimal(payload.i);
    if (
      sourceEventAt === null ||
      (markPrice === null && indexPrice === null)
    ) return drift();
    return data(subjects.map((subject) =>
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "MARK_INDEX_REFERENCE",
        sourceEventId: `binance-mark-index:${symbol}:${payload.E}`,
        sourceEventAt,
        sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
        sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        sequenceStart: null,
        sequenceEnd: null,
        previousSequence: null,
        snapshotReset: false,
        payload: {
          kind: "MARK_INDEX_REFERENCE",
          markPrice,
          indexPrice,
        },
      })
    ));
  }
  if (eventType === "forceOrder") {
    const order = object(payload.o);
    if (order === null) return drift();
    const sourceEventAt = eventIso(order.T ?? payload.E);
    const price = positiveDecimal(order.ap ?? order.p);
    const size = positiveDecimal(order.z ?? order.q);
    const side = stringValue(order.S);
    if (
      sourceEventAt === null ||
      price === null ||
      size === null ||
      (side !== "BUY" && side !== "SELL")
    ) return drift();
    return data(subjects.map((subject) =>
      withSubject({
        subject,
        receivedAt: input.receivedAt,
        providerPayload: evidencePayload,
        factType: "LIQUIDATION_EVENT",
        sourceEventId:
          `binance-liquidation:${symbol}:${sourceEventAt}:${side}:${price}:${size}`,
        sourceEventAt,
        sourceCompleteness: "PROVIDER_EVENT_FEED",
        sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
        sequenceStart: null,
        sequenceEnd: null,
        previousSequence: null,
        snapshotReset: false,
        payload: {
          kind: "LIQUIDATION_EVENT",
          liquidationId:
            `binance:${symbol}:${sourceEventAt}:${side}:${price}:${size}`,
          liquidatedSide: side === "SELL" ? "LONG" : "SHORT",
          price,
          size,
          providerAmountUnit: "BASE_ASSET",
        },
      })
    ));
  }
  return drift();
}

function parseOkx(input: {
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly subjects: readonly M1ShadowProviderSubject[];
}): M1ShadowProviderParseResult {
  if (input.payload === "pong") return control(true, ["heartbeat_pong"]);
  const payload = object(input.payload);
  if (payload === null) return drift();
  if (payload.event === "subscribe") {
    return control(true, ["subscription_acknowledged"]);
  }
  if (payload.event === "error") return drift();
  const arg = object(payload.arg);
  const rows = Array.isArray(payload.data) ? payload.data : null;
  const channel = stringValue(arg?.channel);
  if (arg === null || rows === null || channel === null) return drift();
  const action = stringValue(payload.action);
  const observations: M1ShadowProviderObservation[] = [];
  for (const rawRow of rows) {
    const row = object(rawRow);
    if (row === null) return drift();
    if (channel === "trades") {
      const symbol = stringValue(row.instId);
      const tradeId = stringValue(row.tradeId);
      const price = positiveDecimal(row.px);
      const size = positiveDecimal(row.sz);
      const sourceEventAt = eventIso(row.ts);
      const side = stringValue(row.side);
      if (
        symbol === null ||
        tradeId === null ||
        price === null ||
        size === null ||
        sourceEventAt === null ||
        (side !== "buy" && side !== "sell")
      ) return drift();
      for (const subject of subjectsBySymbol(
        input.subjects,
        "OKX_SWAP",
        symbol,
      )) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "PUBLIC_TRADE",
          sourceEventId: `okx-trade:${symbol}:${tradeId}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_AGGREGATED_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
          sequenceStart: integerString(row.seqId),
          sequenceEnd: integerString(row.seqId),
          previousSequence: null,
          snapshotReset: false,
          payload: {
            kind: "PUBLIC_TRADE",
            tradeId,
            price,
            size,
            aggressorSide: side === "buy" ? "BUY" : "SELL",
            makerSideKnown: true,
            blockTrade: null,
            rpiTrade: row.source === "1" ? true : row.source === "0" ? false : null,
          },
        }));
      }
      continue;
    }
    if (["books", "bbo-tbt"].includes(channel)) {
      const symbol = stringValue(row.instId);
      const bids = bookLevels(row.bids);
      const asks = bookLevels(row.asks);
      const sourceEventAt = eventIso(row.ts);
      const sequence = integerString(row.seqId);
      const previous = integerString(row.prevSeqId);
      if (
        symbol === null ||
        bids === null ||
        asks === null ||
        sourceEventAt === null ||
        sequence === null
      ) return drift();
      for (const subject of subjectsBySymbol(
        input.subjects,
        "OKX_SWAP",
        symbol,
      )) {
        if (channel === "bbo-tbt") {
          const bid = bids[0];
          const ask = asks[0];
          if (
            bid === undefined ||
            ask === undefined ||
            bid[1] === "0" ||
            ask[1] === "0"
          ) return drift();
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: "TOP_OF_BOOK",
            sourceEventId: `okx-bbo:${symbol}:${sequence}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
            sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
            sequenceStart: sequence,
            sequenceEnd: sequence,
            previousSequence: previous,
            snapshotReset: true,
            payload: {
              kind: "TOP_OF_BOOK",
              bestBidPrice: bid[0],
              bestBidSize: bid[1],
              bestAskPrice: ask[0],
              bestAskSize: ask[1],
            },
          }));
        } else {
          const snapshot = action === "snapshot";
          if (!snapshot && action !== "update") return drift();
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: snapshot
              ? "ORDER_BOOK_SNAPSHOT"
              : "ORDER_BOOK_DELTA",
            sourceEventId: `okx-books:${symbol}:${sequence}:${action}`,
            sourceEventAt,
            sourceCompleteness: snapshot
              ? "PROVIDER_POINT_IN_TIME_SNAPSHOT"
              : "PROVIDER_INCREMENTAL_BOOK",
            sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
            sequenceStart: sequence,
            sequenceEnd: sequence,
            previousSequence: previous,
            snapshotReset: snapshot,
            payload: {
              kind: snapshot ? "ORDER_BOOK_SNAPSHOT" : "ORDER_BOOK_DELTA",
              bids,
              asks,
              maximumDepth: 400,
            },
          }));
        }
      }
      continue;
    }
    if (channel === "mark-price" || channel === "index-tickers") {
      const reference = channel === "index-tickers";
      const symbol = stringValue(row.instId);
      const sourceEventAt = eventIso(row.ts);
      const price = positiveDecimal(reference ? row.idxPx : row.markPx);
      if (symbol === null || sourceEventAt === null || price === null) {
        return drift();
      }
      for (const subject of subjectsBySymbol(
        input.subjects,
        "OKX_SWAP",
        symbol,
        reference,
      )) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "MARK_INDEX_REFERENCE",
          sourceEventId:
            `okx-${reference ? "index" : "mark"}:${symbol}:${row.ts}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
          sequenceStart: null,
          sequenceEnd: null,
          previousSequence: null,
          snapshotReset: false,
          payload: {
            kind: "MARK_INDEX_REFERENCE",
            markPrice: reference ? null : price,
            indexPrice: reference ? price : null,
          },
        }));
      }
      continue;
    }
    if (channel === "liquidation-orders") {
      const symbol = stringValue(row.instId);
      const details = Array.isArray(row.details) ? row.details : null;
      if (symbol === null || details === null) return drift();
      for (const rawDetail of details) {
        const detail = object(rawDetail);
        if (detail === null) return drift();
        const sourceEventAt = eventIso(detail.ts);
        const price = positiveDecimal(detail.bkPx);
        const size = positiveDecimal(detail.sz);
        const positionSide = stringValue(detail.posSide);
        if (
          sourceEventAt === null ||
          price === null ||
          size === null
        ) return drift();
        for (const subject of subjectsBySymbol(
          input.subjects,
          "OKX_SWAP",
          symbol,
        )) {
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawDetail,
            factType: "LIQUIDATION_EVENT",
            sourceEventId:
              `okx-liquidation:${symbol}:${sourceEventAt}:${positionSide}:${price}:${size}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_SAMPLED_LIQUIDATION_FEED",
            sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
            sequenceStart: null,
            sequenceEnd: null,
            previousSequence: null,
            snapshotReset: false,
            payload: {
              kind: "LIQUIDATION_EVENT",
              liquidationId:
                `okx:${symbol}:${sourceEventAt}:${positionSide}:${price}:${size}`,
              liquidatedSide:
                positionSide === "long"
                  ? "LONG"
                  : positionSide === "short"
                    ? "SHORT"
                    : "UNKNOWN",
              price,
              size,
              providerAmountUnit: "CONTRACT",
            },
          }));
        }
      }
      continue;
    }
    return drift();
  }
  return data(
    observations,
    channel === "liquidation-orders"
      ? ["provider_sampled_liquidation_feed_not_total_market"]
      : [],
  );
}

function parseBybit(input: {
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly subjects: readonly M1ShadowProviderSubject[];
}): M1ShadowProviderParseResult {
  const payload = object(input.payload);
  if (payload === null) return drift();
  if (payload.op === "subscribe" || payload.ret_msg === "pong") {
    return control(true, [
      payload.op === "subscribe"
        ? "subscription_acknowledged"
        : "heartbeat_pong",
    ]);
  }
  const topic = stringValue(payload.topic);
  const rows = Array.isArray(payload.data)
    ? payload.data
    : object(payload.data) === null
      ? null
      : [payload.data];
  if (topic === null || rows === null) return drift();
  const symbol = topic.split(".").at(-1);
  if (symbol === undefined) return drift();
  const subjects = subjectsBySymbol(
    input.subjects,
    "BYBIT_DERIVATIVES",
    symbol,
  );
  if (subjects.length === 0) return control(true, ["unselected_symbol_ignored"]);
  const observations: M1ShadowProviderObservation[] = [];
  for (const rawRow of rows) {
    const row = object(rawRow);
    if (row === null) return drift();
    if (topic.startsWith("publicTrade.")) {
      const tradeId = stringValue(row.i);
      const price = positiveDecimal(row.p);
      const size = positiveDecimal(row.v);
      const sourceEventAt = eventIso(row.T);
      const side = stringValue(row.S);
      const sequence = integerString(row.seq);
      if (
        tradeId === null ||
        price === null ||
        size === null ||
        sourceEventAt === null ||
        sequence === null ||
        (side !== "Buy" && side !== "Sell")
      ) return drift();
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "PUBLIC_TRADE",
          sourceEventId: `bybit-trade:${symbol}:${tradeId}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
          sequenceStart: sequence,
          sequenceEnd: sequence,
          previousSequence: null,
          snapshotReset: false,
          payload: {
            kind: "PUBLIC_TRADE",
            tradeId,
            price,
            size,
            aggressorSide: side === "Buy" ? "BUY" : "SELL",
            makerSideKnown: true,
            blockTrade: typeof row.BT === "boolean" ? row.BT : null,
            rpiTrade: typeof row.RPI === "boolean" ? row.RPI : null,
          },
        }));
      }
      continue;
    }
    if (topic.startsWith("orderbook.50.")) {
      const bids = bookLevels(row.b);
      const asks = bookLevels(row.a);
      const sequence = integerString(row.u);
      const sourceEventAt = eventIso(payload.cts ?? payload.ts);
      const snapshot = payload.type === "snapshot";
      if (
        bids === null ||
        asks === null ||
        sequence === null ||
        sourceEventAt === null ||
        (!snapshot && payload.type !== "delta")
      ) return drift();
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: snapshot
            ? "ORDER_BOOK_SNAPSHOT"
            : "ORDER_BOOK_DELTA",
          sourceEventId:
            `bybit-orderbook:${symbol}:${sequence}:${payload.type}`,
          sourceEventAt,
          sourceCompleteness: snapshot
            ? "PROVIDER_POINT_IN_TIME_SNAPSHOT"
            : "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
          sequenceStart: sequence,
          sequenceEnd: sequence,
          previousSequence: null,
          snapshotReset: snapshot || sequence === "1",
          payload: {
            kind: snapshot ? "ORDER_BOOK_SNAPSHOT" : "ORDER_BOOK_DELTA",
            bids,
            asks,
            maximumDepth: 50,
          },
        }));
      }
      continue;
    }
    if (topic.startsWith("tickers.")) {
      const sourceEventAt = eventIso(payload.ts);
      const bid = positiveDecimal(row.bid1Price);
      const bidSize = positiveDecimal(row.bid1Size);
      const ask = positiveDecimal(row.ask1Price);
      const askSize = positiveDecimal(row.ask1Size);
      const markPrice = positiveDecimal(row.markPrice);
      const indexPrice = positiveDecimal(row.indexPrice);
      if (sourceEventAt === null) return drift();
      for (const subject of subjects) {
        if (
          bid !== null &&
          bidSize !== null &&
          ask !== null &&
          askSize !== null
        ) {
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: "TOP_OF_BOOK",
            sourceEventId: `bybit-ticker-bbo:${symbol}:${payload.ts}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
            sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
            sequenceStart: null,
            sequenceEnd: null,
            previousSequence: null,
            snapshotReset: false,
            payload: {
              kind: "TOP_OF_BOOK",
              bestBidPrice: bid,
              bestBidSize: bidSize,
              bestAskPrice: ask,
              bestAskSize: askSize,
            },
          }));
        }
        if (markPrice !== null || indexPrice !== null) {
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: "MARK_INDEX_REFERENCE",
            sourceEventId: `bybit-ticker-mark-index:${symbol}:${payload.ts}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
            sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
            sequenceStart: null,
            sequenceEnd: null,
            previousSequence: null,
            snapshotReset: false,
            payload: {
              kind: "MARK_INDEX_REFERENCE",
              markPrice,
              indexPrice,
            },
          }));
        }
      }
      if (observations.length === 0) return drift();
      continue;
    }
    if (topic.startsWith("allLiquidation.")) {
      const sourceEventAt = eventIso(row.T);
      const price = positiveDecimal(row.p);
      const size = positiveDecimal(row.v);
      const side = stringValue(row.S);
      if (
        sourceEventAt === null ||
        price === null ||
        size === null ||
        (side !== "Buy" && side !== "Sell")
      ) return drift();
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "LIQUIDATION_EVENT",
          sourceEventId:
            `bybit-liquidation:${symbol}:${row.T}:${side}:${price}:${size}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
          sequenceStart: null,
          sequenceEnd: null,
          previousSequence: null,
          snapshotReset: false,
          payload: {
            kind: "LIQUIDATION_EVENT",
            liquidationId:
              `bybit:${symbol}:${row.T}:${side}:${price}:${size}`,
            liquidatedSide: side === "Buy" ? "LONG" : "SHORT",
            price,
            size,
            providerAmountUnit: "BASE_ASSET",
          },
        }));
      }
      continue;
    }
    return drift();
  }
  return data(observations);
}

function parseBitget(input: {
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly subjects: readonly M1ShadowProviderSubject[];
}): M1ShadowProviderParseResult {
  if (input.payload === "pong") return control(true, ["heartbeat_pong"]);
  const payload = object(input.payload);
  if (payload === null) return drift();
  if (payload.event === "subscribe") {
    return control(true, ["subscription_acknowledged"]);
  }
  if (payload.event === "error") return drift();
  const arg = object(payload.arg);
  const rows = Array.isArray(payload.data) ? payload.data : null;
  const topic = stringValue(arg?.topic);
  if (arg === null || rows === null || topic === null) return drift();
  const observations: M1ShadowProviderObservation[] = [];
  for (const rawRow of rows) {
    const row = object(rawRow);
    if (row === null) return drift();
    const symbol = stringValue(arg.symbol ?? row.symbol);
    if (symbol === null) return drift();
    const subjects = subjectsBySymbol(
      input.subjects,
      "BITGET_FUTURES",
      symbol,
    );
    if (subjects.length === 0) continue;
    if (topic === "publicTrade") {
      const tradeId = stringValue(row.i);
      const price = positiveDecimal(row.p);
      const size = positiveDecimal(row.v);
      const sourceEventAt = eventIso(row.T);
      const side = stringValue(row.S);
      if (
        tradeId === null ||
        price === null ||
        size === null ||
        sourceEventAt === null ||
        (side !== "buy" && side !== "sell")
      ) return drift();
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "PUBLIC_TRADE",
          sourceEventId: `bitget-trade:${symbol}:${tradeId}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_EVENT_FEED",
          sequenceAssurance: "EVENT_ID_MONOTONICITY",
          sequenceStart: tradeId,
          sequenceEnd: tradeId,
          previousSequence: null,
          snapshotReset: payload.action === "snapshot",
          payload: {
            kind: "PUBLIC_TRADE",
            tradeId,
            price,
            size,
            aggressorSide: side === "buy" ? "BUY" : "SELL",
            makerSideKnown: true,
            blockTrade: null,
            rpiTrade: row.isRPI === "yes"
              ? true
              : row.isRPI === "no"
                ? false
                : null,
          },
        }));
      }
      continue;
    }
    if (topic === "ticker") {
      const sourceEventAt = eventIso(payload.ts);
      const bid = positiveDecimal(row.bid1Price);
      const bidSize = positiveDecimal(row.bid1Size);
      const ask = positiveDecimal(row.ask1Price);
      const askSize = positiveDecimal(row.ask1Size);
      const markPrice = positiveDecimal(row.markPrice);
      const indexPrice = positiveDecimal(row.indexPrice);
      if (sourceEventAt === null) return drift();
      for (const subject of subjects) {
        if (
          bid !== null &&
          bidSize !== null &&
          ask !== null &&
          askSize !== null
        ) {
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: "TOP_OF_BOOK",
            sourceEventId: `bitget-ticker-bbo:${symbol}:${payload.ts}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
            sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
            sequenceStart: null,
            sequenceEnd: null,
            previousSequence: null,
            snapshotReset: false,
            payload: {
              kind: "TOP_OF_BOOK",
              bestBidPrice: bid,
              bestBidSize: bidSize,
              bestAskPrice: ask,
              bestAskSize: askSize,
            },
          }));
        }
        if (markPrice !== null || indexPrice !== null) {
          observations.push(withSubject({
            subject,
            receivedAt: input.receivedAt,
            providerPayload: rawRow,
            factType: "MARK_INDEX_REFERENCE",
            sourceEventId: `bitget-ticker-mark-index:${symbol}:${payload.ts}`,
            sourceEventAt,
            sourceCompleteness: "PROVIDER_POINT_IN_TIME_SNAPSHOT",
            sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
            sequenceStart: null,
            sequenceEnd: null,
            previousSequence: null,
            snapshotReset: false,
            payload: {
              kind: "MARK_INDEX_REFERENCE",
              markPrice,
              indexPrice,
            },
          }));
        }
      }
      if (observations.length === 0) return drift();
      continue;
    }
    if (topic === "books") {
      const bids = bookLevels(row.b);
      const asks = bookLevels(row.a);
      const sequence = integerString(row.seq);
      const previous = integerString(row.pseq);
      const sourceEventAt = eventIso(row.ts ?? payload.ts);
      const snapshot = payload.action === "snapshot";
      if (
        bids === null ||
        asks === null ||
        sequence === null ||
        previous === null ||
        sourceEventAt === null ||
        (!snapshot && payload.action !== "update")
      ) return drift();
      const maximumDepthRaw = Number(row.maxDepth);
      const maximumDepth =
        Number.isSafeInteger(maximumDepthRaw) && maximumDepthRaw >= 0
          ? maximumDepthRaw
          : null;
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: snapshot
            ? "ORDER_BOOK_SNAPSHOT"
            : "ORDER_BOOK_DELTA",
          sourceEventId:
            `bitget-books:${symbol}:${sequence}:${payload.action}`,
          sourceEventAt,
          sourceCompleteness: snapshot
            ? "PROVIDER_POINT_IN_TIME_SNAPSHOT"
            : "PROVIDER_INCREMENTAL_BOOK",
          sequenceAssurance: "PREVIOUS_SEQUENCE_CONTIGUITY",
          sequenceStart: sequence,
          sequenceEnd: sequence,
          previousSequence: previous,
          snapshotReset: snapshot || previous === "0",
          payload: {
            kind: snapshot ? "ORDER_BOOK_SNAPSHOT" : "ORDER_BOOK_DELTA",
            bids,
            asks,
            maximumDepth,
          },
        }));
      }
      continue;
    }
    if (topic === "liquidation") {
      const sourceEventAt = eventIso(row.ts);
      const price = positiveDecimal(row.price);
      const size = positiveDecimal(row.amount);
      const side = stringValue(row.side);
      if (
        sourceEventAt === null ||
        price === null ||
        size === null ||
        (side !== "buy" && side !== "sell")
      ) return drift();
      for (const subject of subjects) {
        observations.push(withSubject({
          subject,
          receivedAt: input.receivedAt,
          providerPayload: rawRow,
          factType: "LIQUIDATION_EVENT",
          sourceEventId:
            `bitget-liquidation:${symbol}:${row.ts}:${side}:${price}:${size}`,
          sourceEventAt,
          sourceCompleteness: "PROVIDER_SAMPLED_MAX_SIDE_PER_SECOND",
          sequenceAssurance: "NO_SEQUENCE_PROVIDER_LIMITATION",
          sequenceStart: null,
          sequenceEnd: null,
          previousSequence: null,
          snapshotReset: false,
          payload: {
            kind: "LIQUIDATION_EVENT",
            liquidationId:
              `bitget:${symbol}:${row.ts}:${side}:${price}:${size}`,
            liquidatedSide: side === "buy" ? "LONG" : "SHORT",
            price,
            size,
            providerAmountUnit: "QUOTE_ASSET",
          },
        }));
      }
      continue;
    }
    return drift();
  }
  return data(
    observations,
    topic === "liquidation"
      ? ["provider_sampled_liquidation_feed_not_total_market"]
      : [],
  );
}

export function parseM1ExpandedShadowProviderMessage(input: {
  readonly plan: M1ExpandedShadowProviderPlan;
  readonly venue: (typeof M1_VENUE_SOURCE_IDS)[number];
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly transportKind?: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
  readonly subjectId?: string;
}): M1ShadowProviderParseResult {
  const plan = M1ExpandedShadowProviderPlanSchema.parse(input.plan);
  const receivedAt = IsoDateTimeSchema.parse(input.receivedAt);
  if (input.venue === "BINANCE_FUTURES") {
    return parseBinance({
      payload: input.payload,
      receivedAt,
      subjects: plan.subjects,
      transportKind: input.transportKind ?? "WEBSOCKET_MESSAGE",
      subjectId: input.subjectId,
    });
  }
  if ((input.transportKind ?? "WEBSOCKET_MESSAGE") !== "WEBSOCKET_MESSAGE") {
    return drift();
  }
  if (input.venue === "OKX_SWAP") {
    return parseOkx({
      payload: input.payload,
      receivedAt,
      subjects: plan.subjects,
    });
  }
  if (input.venue === "BYBIT_DERIVATIVES") {
    return parseBybit({
      payload: input.payload,
      receivedAt,
      subjects: plan.subjects,
    });
  }
  return parseBitget({
    payload: input.payload,
    receivedAt,
    subjects: plan.subjects,
  });
}

export type M1ShadowSequenceState = Readonly<{
  venue: (typeof M1_VENUE_SOURCE_IDS)[number];
  subjectId: string;
  lastSequence: string | null;
  snapshotEstablished: boolean;
  deltaEstablished: boolean;
}>;

export type M1ShadowSequenceDecision = Readonly<{
  status: "APPLY" | "RESET" | "GAP" | "OUT_OF_ORDER" | "IGNORE_DUPLICATE";
  nextState: M1ShadowSequenceState;
  gapCount: 0 | 1;
  outOfOrderCount: 0 | 1;
  reasonCodes: readonly string[];
}>;

function compareIntegerStrings(left: string, right: string): -1 | 0 | 1 {
  const normalizedLeft = left.replace(/^0+(?=\d)/u, "");
  const normalizedRight = right.replace(/^0+(?=\d)/u, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  const comparison = normalizedLeft.localeCompare(normalizedRight);
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

export function evaluateM1ShadowOrderBookSequence(input: {
  readonly state: M1ShadowSequenceState | null;
  readonly observation: M1ShadowProviderObservation;
}): M1ShadowSequenceDecision {
  const observation = M1ShadowProviderObservationSchema.parse(
    input.observation,
  );
  if (
    observation.factType !== "ORDER_BOOK_SNAPSHOT" &&
    observation.factType !== "ORDER_BOOK_DELTA"
  ) {
    throw new Error("sequence evaluation only accepts order-book observations");
  }
  if (observation.sequenceEnd === null) {
    throw new Error("order-book observation is missing provider sequence");
  }
  const current: M1ShadowSequenceState = input.state ?? {
    venue: observation.venue,
    subjectId: observation.subjectId,
    lastSequence: null,
    snapshotEstablished: false,
    deltaEstablished: false,
  };
  if (
    current.venue !== observation.venue ||
    current.subjectId !== observation.subjectId
  ) {
    throw new Error("sequence state identity drifted");
  }
  const nextState = (
    snapshotEstablished = true,
    deltaEstablished = current.deltaEstablished,
  ): M1ShadowSequenceState => ({
    venue: current.venue,
    subjectId: current.subjectId,
    lastSequence: observation.sequenceEnd,
    snapshotEstablished,
    deltaEstablished,
  });
  if (
    observation.factType === "ORDER_BOOK_SNAPSHOT" ||
    observation.snapshotReset
  ) {
    return {
      status: "RESET",
      nextState: nextState(true, false),
      gapCount: 0,
      outOfOrderCount: 0,
      reasonCodes: ["provider_snapshot_reset_applied"],
    };
  }
  if (!current.snapshotEstablished || current.lastSequence === null) {
    return {
      status: "GAP",
      nextState: {
        ...current,
        snapshotEstablished: false,
        deltaEstablished: false,
      },
      gapCount: 1,
      outOfOrderCount: 0,
      reasonCodes: ["delta_before_snapshot_requires_resync"],
    };
  }
  const order = compareIntegerStrings(
    observation.sequenceEnd,
    current.lastSequence,
  );
  if (order < 0 && !current.deltaEstablished) {
    return {
      status: "IGNORE_DUPLICATE",
      nextState: current,
      gapCount: 0,
      outOfOrderCount: 0,
      reasonCodes: ["pre_snapshot_buffered_delta_discarded"],
    };
  }
  if (order < 0) {
    return {
      status: "OUT_OF_ORDER",
      nextState: current,
      gapCount: 0,
      outOfOrderCount: 1,
      reasonCodes: ["provider_sequence_regressed"],
    };
  }
  if (order === 0) {
    return {
      status: "IGNORE_DUPLICATE",
      nextState: current,
      gapCount: 0,
      outOfOrderCount: 0,
      reasonCodes: ["provider_duplicate_or_heartbeat_sequence"],
    };
  }
  if (!current.deltaEstablished) {
    const firstDeltaBridgesSnapshot =
      observation.venue === "BINANCE_FUTURES"
        ? observation.sequenceStart !== null &&
          compareIntegerStrings(
              observation.sequenceStart,
              current.lastSequence,
            ) <= 0 &&
          compareIntegerStrings(
              observation.sequenceEnd,
              current.lastSequence,
            ) >= 0
        : observation.sequenceAssurance ===
            "PREVIOUS_SEQUENCE_CONTIGUITY"
          ? observation.previousSequence !== null &&
            compareIntegerStrings(
                observation.previousSequence,
                current.lastSequence,
              ) <= 0 &&
            compareIntegerStrings(
                observation.sequenceEnd,
                current.lastSequence,
              ) >= 0
          : order > 0;
    if (!firstDeltaBridgesSnapshot) {
      return {
        status: "GAP",
        nextState: {
          ...current,
          snapshotEstablished: false,
          deltaEstablished: false,
        },
        gapCount: 1,
        outOfOrderCount: 0,
        reasonCodes: ["first_delta_does_not_bridge_snapshot_requires_resync"],
      };
    }
    return {
      status: "APPLY",
      nextState: nextState(true, true),
      gapCount: 0,
      outOfOrderCount: 0,
      reasonCodes: observation.sequenceAssurance ===
          "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET"
        ? ["provider_monotonic_only_no_contiguity_proof"]
        : [],
    };
  }
  if (
    observation.sequenceAssurance === "PREVIOUS_SEQUENCE_CONTIGUITY" &&
    observation.previousSequence !== current.lastSequence
  ) {
    return {
      status: "GAP",
      nextState: {
        ...current,
        snapshotEstablished: false,
        deltaEstablished: false,
      },
      gapCount: 1,
      outOfOrderCount: 0,
      reasonCodes: ["provider_previous_sequence_mismatch_requires_resync"],
    };
  }
  return {
    status: "APPLY",
    nextState: nextState(true, true),
    gapCount: 0,
    outOfOrderCount: 0,
    reasonCodes: observation.sequenceAssurance ===
        "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET"
      ? ["provider_monotonic_only_no_contiguity_proof"]
      : [],
  };
}
