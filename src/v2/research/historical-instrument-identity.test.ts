import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
  M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
  M2_HISTORICAL_INSTRUMENT_RECORD_VERSION,
  M2HistoricalInstrumentCoverageArtifactSchema,
  buildM2HistoricalInstrumentCapabilityArtifact,
  buildM2HistoricalInstrumentCoverageArtifact,
  buildM2HistoricalInstrumentRecord,
  resolveM2HistoricalInstrumentEligibility,
} from "./historical-instrument-identity";
import {
  M2_BINANCE_CURRENT_INSTRUMENT_CAPABILITY,
  M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE,
  M2_HISTORICAL_INSTRUMENT_SOURCE_CANDIDATES,
} from "./historical-instrument-source-registry";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function qualifiedCapability() {
  return buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "test-point-in-time-source",
    providerId: "BINANCE_USDS_FUTURES",
    sourceOperator: "Test Venue",
    sourceClass: "VENUE_OFFICIAL",
    evidenceMode: "OFFICIAL_POINT_IN_TIME_SNAPSHOT_ARCHIVE",
    assessedAt: "2026-02-02T00:00:00.000Z",
    captureStartedAt: null,
    coverage: {
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-02-01T00:00:00.000Z",
    },
    documentation: [{
      evidenceId: "point-in-time-source-doc",
      evidenceType: "OFFICIAL_DOCUMENTATION",
      url: "https://source.example/point-in-time-instruments",
      capturedAt: "2026-02-01T01:00:00.000Z",
      contentDigest: HASH_A,
      contentBytes: 1_000,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      claimScope: "HISTORICAL_INSTRUMENT_COVERAGE",
    }],
    guarantees: {
      fullUniverseDenominator: true,
      includesDelistedInstruments: true,
      onboardAt: true,
      delistAt: true,
      contractType: true,
      settlementAsset: true,
      underlyingClass: true,
      tradingStatusIntervals: true,
      symbolReuseDisambiguation: true,
    },
    declaredLimitations: [],
  });
}

type StatusInterval = {
  status:
    | "PREOPEN"
    | "TRADING"
    | "SUSPENDED"
    | "DELISTING"
    | "DELISTED"
    | "SETTLED"
    | "UNKNOWN";
  effectiveFrom: string;
  effectiveTo: string | null;
  knowledgeAt: string;
  sourceRecordId: string;
  evidenceDigest: string;
};

function instrumentRecord(input: {
  capability?: ReturnType<typeof qualifiedCapability>;
  providerInstrumentKey?: string;
  historicalInstrumentId?: string;
  identityEpoch?: string;
  providerSymbol?: string;
  providerId?: string;
  onboardAt?: string;
  identityKnownAt?: string;
  delistState?: "NOT_DELISTED_AS_OF_COVERAGE_END" | "DELISTED_AT" | "UNKNOWN";
  delistAt?: string | null;
  intervals?: StatusInterval[];
}) {
  const capability = input.capability ?? qualifiedCapability();
  return buildM2HistoricalInstrumentRecord({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_RECORD_VERSION,
    sourceCapabilityId: capability.capabilityArtifactId,
    sourceCapabilityDigest: capability.capabilityDigest,
    providerId: input.providerId ?? capability.providerId,
    venue: "BINANCE_FUTURES",
    providerInstrumentKey:
      input.providerInstrumentKey ?? "BINANCE:BTCUSDT:2025-12-01",
    providerSymbol: input.providerSymbol ?? "BTCUSDT",
    historicalInstrumentId:
      input.historicalInstrumentId ?? "BINANCE:BTCUSDT:BTC:2025-12-01",
    runtimeCanonicalInstrumentId:
      "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    identityEpoch: input.identityEpoch ?? "2025-12-01-BTC-USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    settlementClass: "STABLECOIN",
    contractClass: "LINEAR_STABLECOIN_SETTLED_PERPETUAL",
    contractSize: "1",
    underlyingClass: "CRYPTO_ASSET",
    onboardAt: input.onboardAt ?? "2025-12-01T00:00:00.000Z",
    delistState: input.delistState ?? "NOT_DELISTED_AS_OF_COVERAGE_END",
    delistAt: input.delistAt ?? null,
    identityKnownAt:
      input.identityKnownAt ?? "2025-11-30T00:00:00.000Z",
    recordCoverageEndAt: "2026-02-01T00:00:00.000Z",
    sourceRecordIds: ["instrument-record-1"],
    identityEvidenceDigests: [HASH_B],
    statusIntervals: input.intervals ?? [{
      status: "TRADING",
      effectiveFrom: "2025-12-01T00:00:00.000Z",
      effectiveTo: null,
      knowledgeAt: "2025-11-30T00:00:00.000Z",
      sourceRecordId: "status-record-1",
      evidenceDigest: HASH_C,
    }],
    reasonCodes: [],
  });
}

function coverage(input: {
  capability?: ReturnType<typeof qualifiedCapability>;
  expected?: { providerInstrumentKey: string; providerSymbol: string }[];
  records?: ReturnType<typeof instrumentRecord>[];
}) {
  const capability = input.capability ?? qualifiedCapability();
  return buildM2HistoricalInstrumentCoverageArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: "2026-02-02T00:00:00.000Z",
    requestedWindow: {
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-02-01T00:00:00.000Z",
    },
    denominator: {
      mode: "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
      manifestDigest: HASH_A,
      expectedInstruments: input.expected ?? [{
        providerInstrumentKey: "BINANCE:BTCUSDT:2025-12-01",
        providerSymbol: "BTCUSDT",
      }],
    },
    capability,
    records: input.records ?? [instrumentRecord({ capability })],
  });
}

test("complete point-in-time identity and status intervals can pass coverage", () => {
  const artifact = coverage({});
  assert.equal(artifact.coverageStatus, "READY");
  assert.equal(artifact.readyForCohortFreeze, true);
  assert.equal(artifact.expectedInstrumentCount, 1);
  assert.equal(artifact.resolvedInstrumentCount, 1);
  assert.equal(artifact.unresolvedInstrumentCount, 0);
});

test("current exchange metadata cannot be used to backfill history", () => {
  const artifact = buildM2HistoricalInstrumentCoverageArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: "2026-07-20T10:36:05.000Z",
    requestedWindow: {
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-02-01T00:00:00.000Z",
    },
    denominator: {
      mode: "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
      manifestDigest: HASH_A,
      expectedInstruments: [{
        providerInstrumentKey: "BINANCE:BTCUSDT:2025-12-01",
        providerSymbol: "BTCUSDT",
      }],
    },
    capability: M2_BINANCE_CURRENT_INSTRUMENT_CAPABILITY,
    records: [],
  });
  assert.equal(artifact.coverageStatus, "BLOCKED");
  assert.ok(artifact.blockerReasonCodes.includes(
    "historical_instrument_source_not_qualified",
  ));
});

test("archive object presence remains a denominator hint, never eligibility", () => {
  assert.equal(
    M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE.coverageStatus,
    "BLOCKED",
  );
  assert.equal(
    M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE.denominatorMode,
    "TECHNICAL_PILOT_ONLY",
  );
  assert.ok(
    M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE.blockerReasonCodes
      .includes("point_in_time_instrument_denominator_missing"),
  );
});

test("documented source candidates remain research-only until exact guarantees pass", () => {
  assert.equal(M2_HISTORICAL_INSTRUMENT_SOURCE_CANDIDATES.length, 5);
  assert.ok(M2_HISTORICAL_INSTRUMENT_SOURCE_CANDIDATES.every(
    (candidate) => candidate.assessmentStatus === "RESEARCH_ONLY",
  ));
  assert.ok(M2_HISTORICAL_INSTRUMENT_SOURCE_CANDIDATES.every(
    (candidate) => candidate.blockerReasonCodes.length > 0,
  ));
});

test("an unaccounted status interval gap blocks cohort freeze", () => {
  const capability = qualifiedCapability();
  const record = instrumentRecord({
    capability,
    intervals: [
      {
        status: "TRADING",
        effectiveFrom: "2025-12-01T00:00:00.000Z",
        effectiveTo: "2026-01-15T00:00:00.000Z",
        knowledgeAt: "2025-11-30T00:00:00.000Z",
        sourceRecordId: "status-record-1",
        evidenceDigest: HASH_C,
      },
      {
        status: "TRADING",
        effectiveFrom: "2026-01-16T00:00:00.000Z",
        effectiveTo: null,
        knowledgeAt: "2026-01-15T00:00:00.000Z",
        sourceRecordId: "status-record-2",
        evidenceDigest: HASH_C,
      },
    ],
  });
  const artifact = coverage({ capability, records: [record] });
  assert.equal(artifact.coverageStatus, "BLOCKED");
  assert.ok(artifact.unresolvedInstruments[0]!.reasonCodes.includes(
    "instrument_status_interval_gap",
  ));
});

test("status learned after it became effective is exposed as leakage", () => {
  const capability = qualifiedCapability();
  const record = instrumentRecord({
    capability,
    intervals: [{
      status: "TRADING",
      effectiveFrom: "2025-12-01T00:00:00.000Z",
      effectiveTo: null,
      knowledgeAt: "2026-01-02T00:00:00.000Z",
      sourceRecordId: "late-status-record",
      evidenceDigest: HASH_C,
    }],
  });
  const artifact = coverage({ capability, records: [record] });
  assert.equal(artifact.coverageStatus, "BLOCKED");
  assert.ok(artifact.unresolvedInstruments[0]!.reasonCodes.includes(
    "instrument_status_knowledge_time_leakage",
  ));
});

test("provider symbol reuse requires non-overlapping identity epochs", () => {
  const capability = qualifiedCapability();
  const first = instrumentRecord({ capability });
  const second = instrumentRecord({
    capability,
    providerInstrumentKey: "BINANCE:BTCUSDT:2026-01-15",
    historicalInstrumentId: "BINANCE:BTCUSDT:OTHER:2026-01-15",
    identityEpoch: "2026-01-15-OTHER-USDT",
    onboardAt: "2026-01-15T00:00:00.000Z",
    intervals: [{
      status: "TRADING",
      effectiveFrom: "2026-01-15T00:00:00.000Z",
      effectiveTo: null,
      knowledgeAt: "2026-01-14T00:00:00.000Z",
      sourceRecordId: "status-record-reused-symbol",
      evidenceDigest: HASH_C,
    }],
  });
  const artifact = coverage({
    capability,
    expected: [
      {
        providerInstrumentKey: first.providerInstrumentKey,
        providerSymbol: first.providerSymbol,
      },
      {
        providerInstrumentKey: second.providerInstrumentKey,
        providerSymbol: second.providerSymbol,
      },
    ],
    records: [first, second],
  });
  assert.equal(artifact.coverageStatus, "BLOCKED");
  assert.ok(artifact.blockerReasonCodes.includes(
    "provider_symbol_identity_epochs_overlap",
  ));
});

test("eligibility resolution distinguishes trading, suspended and unknown", () => {
  const capability = qualifiedCapability();
  const record = instrumentRecord({
    capability,
    intervals: [
      {
        status: "TRADING",
        effectiveFrom: "2025-12-01T00:00:00.000Z",
        effectiveTo: "2026-01-15T00:00:00.000Z",
        knowledgeAt: "2025-11-30T00:00:00.000Z",
        sourceRecordId: "status-trading",
        evidenceDigest: HASH_C,
      },
      {
        status: "SUSPENDED",
        effectiveFrom: "2026-01-15T00:00:00.000Z",
        effectiveTo: null,
        knowledgeAt: "2026-01-14T00:00:00.000Z",
        sourceRecordId: "status-suspended",
        evidenceDigest: HASH_C,
      },
    ],
  });
  assert.equal(resolveM2HistoricalInstrumentEligibility({
    capability,
    record,
    cutoffAt: "2026-01-10T00:00:00.000Z",
  }).status, "ELIGIBLE");
  assert.equal(resolveM2HistoricalInstrumentEligibility({
    capability,
    record,
    cutoffAt: "2026-01-20T00:00:00.000Z",
  }).status, "INELIGIBLE");

  const lateKnowledge = instrumentRecord({
    capability,
    intervals: [{
      status: "TRADING",
      effectiveFrom: "2025-12-01T00:00:00.000Z",
      effectiveTo: null,
      knowledgeAt: "2026-01-11T00:00:00.000Z",
      sourceRecordId: "status-late",
      evidenceDigest: HASH_C,
    }],
  });
  assert.equal(resolveM2HistoricalInstrumentEligibility({
    capability,
    record: lateKnowledge,
    cutoffAt: "2026-01-10T00:00:00.000Z",
  }).status, "UNRESOLVED");
});

test("eligibility never infers pre-onboard truth from an unqualified source", () => {
  const qualified = qualifiedCapability();
  const futureRecord = instrumentRecord({
    capability: qualified,
    onboardAt: "2026-01-15T00:00:00.000Z",
    identityKnownAt: "2026-01-05T00:00:00.000Z",
    intervals: [{
      status: "PREOPEN",
      effectiveFrom: "2026-01-05T00:00:00.000Z",
      effectiveTo: "2026-01-15T00:00:00.000Z",
      knowledgeAt: "2026-01-05T00:00:00.000Z",
      sourceRecordId: "status-preopen",
      evidenceDigest: HASH_C,
    }],
  });
  assert.deepEqual(resolveM2HistoricalInstrumentEligibility({
    capability: qualified,
    record: futureRecord,
    cutoffAt: "2026-01-10T00:00:00.000Z",
  }), {
    status: "INELIGIBLE",
    reasonCodes: ["instrument_not_yet_onboarded"],
  });

  const currentOnly = M2_BINANCE_CURRENT_INSTRUMENT_CAPABILITY;
  const unqualifiedRecord = instrumentRecord({
    capability: currentOnly,
    onboardAt: "2026-01-15T00:00:00.000Z",
    identityKnownAt: "2026-01-05T00:00:00.000Z",
  });
  const resolution = resolveM2HistoricalInstrumentEligibility({
    capability: currentOnly,
    record: unqualifiedRecord,
    cutoffAt: "2026-01-10T00:00:00.000Z",
  });
  assert.equal(resolution.status, "UNRESOLVED");
  assert.ok(resolution.reasonCodes.includes(
    "instrument_source_not_point_in_time_qualified",
  ));
});

test("coverage rejects a not-delisted claim that contains a terminal status", () => {
  const capability = qualifiedCapability();
  const contradictory = instrumentRecord({
    capability,
    intervals: [
      {
        status: "TRADING",
        effectiveFrom: "2025-12-01T00:00:00.000Z",
        effectiveTo: "2026-01-20T00:00:00.000Z",
        knowledgeAt: "2025-11-30T00:00:00.000Z",
        sourceRecordId: "status-trading",
        evidenceDigest: HASH_C,
      },
      {
        status: "DELISTED",
        effectiveFrom: "2026-01-20T00:00:00.000Z",
        effectiveTo: null,
        knowledgeAt: "2026-01-19T00:00:00.000Z",
        sourceRecordId: "status-delisted",
        evidenceDigest: HASH_C,
      },
    ],
  });
  const artifact = coverage({ capability, records: [contradictory] });
  assert.equal(artifact.coverageStatus, "BLOCKED");
  assert.ok(artifact.unresolvedInstruments[0]?.reasonCodes.includes(
    "instrument_delist_status_inconsistent",
  ));
});

test("provider binding is exact and the requested window is half-open", () => {
  const capability = qualifiedCapability();
  const wrongProvider = instrumentRecord({
    capability,
    providerId: "DIFFERENT_PROVIDER",
  });
  const resolution = resolveM2HistoricalInstrumentEligibility({
    capability,
    record: wrongProvider,
    cutoffAt: "2026-01-10T00:00:00.000Z",
  });
  assert.equal(resolution.status, "UNRESOLVED");
  assert.ok(resolution.reasonCodes.includes(
    "instrument_record_capability_binding_mismatch",
  ));

  const terminalAtWindowEnd = instrumentRecord({
    capability,
    intervals: [
      {
        status: "TRADING",
        effectiveFrom: "2025-12-01T00:00:00.000Z",
        effectiveTo: "2026-02-01T00:00:00.000Z",
        knowledgeAt: "2025-11-30T00:00:00.000Z",
        sourceRecordId: "status-trading",
        evidenceDigest: HASH_C,
      },
      {
        status: "DELISTED",
        effectiveFrom: "2026-02-01T00:00:00.000Z",
        effectiveTo: null,
        knowledgeAt: "2026-01-31T00:00:00.000Z",
        sourceRecordId: "status-delisted-at-window-end",
        evidenceDigest: HASH_C,
      },
    ],
  });
  assert.equal(
    coverage({ capability, records: [terminalAtWindowEnd] }).coverageStatus,
    "READY",
  );
});

test("instrument coverage artifacts are tamper-evident", () => {
  const forged = structuredClone(coverage({}));
  forged.resolvedInstrumentCount = 0;
  assert.throws(
    () => M2HistoricalInstrumentCoverageArtifactSchema.parse(forged),
    /historical instrument coverage accounting does not balance|historical instrument coverage digest mismatch/u,
  );
});
