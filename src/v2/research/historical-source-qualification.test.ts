import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_DRAFT_DETECTORS,
} from "../modules/detection/draft-replay-contract";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
  M2HistoricalAcquisitionPlanSchema,
  buildM2HistoricalAcquisitionPlan,
  evaluateM2HistoricalAcquisitionPreflight,
} from "./historical-acquisition-contract";
import {
  M2_BINANCE_VISION_SOURCE_ASSESSMENT,
  M2_BINANCE_VISION_SOURCE_QUALIFICATION,
  M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
} from "./historical-source-registry";
import {
  M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION,
  M2HistoricalSourceQualificationSchema,
  assessM2HistoricalSource,
  buildM2HistoricalSourceQualification,
} from "./historical-source-qualification";
import {
  M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
  M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
  M2_HISTORICAL_INSTRUMENT_RECORD_VERSION,
  buildM2HistoricalInstrumentCapabilityArtifact,
  buildM2HistoricalInstrumentCoverageArtifact,
  buildM2HistoricalInstrumentRecord,
} from "./historical-instrument-identity";
import {
  M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
  buildM2HistoricalRightsReviewArtifact,
} from "./historical-rights-review";

const NOW = "2026-07-20T08:00:00.000Z";
const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function approvedQualification() {
  const clockPolicy = {
    policyId: "test-clock.v1",
    eventTimeBasis: "CLOSED_CANDLE_CLOSE_TIME",
    availabilityTimeMode: "MODELED_CONSERVATIVE_LATENCY",
    conservativeLatencySeconds: 10,
    archiveRetrievalTimeUsedAsMarketKnowledgeTime: false,
  } as const;
  const rightsReview = buildM2HistoricalRightsReviewArtifact({
    schemaVersion: M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
    sourceRegistryId: "test-approved-source",
    sourceOperator: "Test Source",
    intendedUse: "PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH",
    deploymentAudience: "SINGLE_ACCOUNT_OWNER_PRIVATE_ACCESS",
    decision: "APPROVED",
    decisionOrigin: "EXTERNAL_HUMAN_REVIEW_RECORD",
    evidenceEnvironment: "EXTERNAL_REVIEW_EVIDENCE",
    retentionRight: "GRANTED",
    replayRight: "GRANTED",
    redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
    reviewerType: "ACCOUNT_OWNER",
    reviewerIdentity: "test-account-owner-review-record",
    reviewedAt: NOW,
    reviewValidUntil: "2027-01-20T08:00:00.000Z",
    jurisdictionScope: "test-jurisdiction",
    accountScope: "test-private-account",
    reviewerAttestationDigest: HASH_C,
    evidence: [{
      evidenceId: "rights-evidence",
      evidenceType: "OFFICIAL_TERMS",
      sourceOperator: "Test Source",
      url: "https://example.com/official-terms",
      capturedAt: NOW,
      termsEffectiveAt: NOW,
      contentDigest: HASH_A,
      contentBytes: 1_000,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      appliesToDataClasses: [
        "HISTORICAL_MARKET_DATA",
        "INSTRUMENT_REFERENCE_DATA",
      ],
    }],
    rawTermsStoredInRepository: false,
    rawMarketDataRedistributionAllowed: false,
    revocationDisposition:
      "DELETE_RETAINED_RAW_DATA_AND_REVOKE_DERIVED_ACCESS",
    limitations: [],
  });
  const instrumentCapability =
    buildM2HistoricalInstrumentCapabilityArtifact({
      schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
      capabilityRegistryId: "test-point-in-time-instrument-source",
      providerId: "TEST_PROVIDER",
      sourceOperator: "Test Source",
      sourceClass: "VENUE_OFFICIAL",
      evidenceMode: "OFFICIAL_POINT_IN_TIME_SNAPSHOT_ARCHIVE",
      assessedAt: NOW,
      captureStartedAt: null,
      coverage: {
        startedAt: "2026-06-01T00:00:00.000Z",
        endedAt: "2026-07-01T00:00:00.000Z",
      },
      documentation: [{
        evidenceId: "instrument-history-evidence",
        evidenceType: "OFFICIAL_DOCUMENTATION",
        url: "https://example.com/point-in-time-instruments",
        capturedAt: NOW,
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
  const instrumentRecord = buildM2HistoricalInstrumentRecord({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_RECORD_VERSION,
    sourceCapabilityId: instrumentCapability.capabilityArtifactId,
    sourceCapabilityDigest: instrumentCapability.capabilityDigest,
    providerId: "TEST_PROVIDER",
    venue: "BINANCE_FUTURES",
    providerInstrumentKey: "TEST_PROVIDER:BTCUSDT:2026-06",
    providerSymbol: "BTCUSDT",
    historicalInstrumentId: "TEST_PROVIDER:BTCUSDT:BTC:2026-06",
    runtimeCanonicalInstrumentId:
      "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    identityEpoch: "BTCUSDT-BTC-2026-06",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    settlementClass: "STABLECOIN",
    contractClass: "LINEAR_STABLECOIN_SETTLED_PERPETUAL",
    contractSize: "1",
    underlyingClass: "CRYPTO_ASSET",
    onboardAt: "2026-05-01T00:00:00.000Z",
    delistState: "NOT_DELISTED_AS_OF_COVERAGE_END",
    delistAt: null,
    identityKnownAt: "2026-05-01T00:00:00.000Z",
    recordCoverageEndAt: "2026-07-01T00:00:00.000Z",
    sourceRecordIds: ["instrument-source-record"],
    identityEvidenceDigests: [HASH_A],
    statusIntervals: [{
      status: "TRADING",
      effectiveFrom: "2026-05-01T00:00:00.000Z",
      effectiveTo: null,
      knowledgeAt: "2026-05-01T00:00:00.000Z",
      sourceRecordId: "instrument-status-record",
      evidenceDigest: HASH_B,
    }],
    reasonCodes: [],
  });
  const instrumentHistory = buildM2HistoricalInstrumentCoverageArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: NOW,
    requestedWindow: {
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    denominator: {
      mode: "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
      manifestDigest: HASH_C,
      expectedInstruments: [{
        providerInstrumentKey: "TEST_PROVIDER:BTCUSDT:2026-06",
        providerSymbol: "BTCUSDT",
      }],
    },
    capability: instrumentCapability,
    records: [instrumentRecord],
  });
  return buildM2HistoricalSourceQualification({
    schemaVersion: M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION,
    sourceRegistryId: "test-approved-source",
    providerId: "TEST_PROVIDER",
    capabilityId: "TEST_ARCHIVE",
    sourceType: "VENUE_PUBLIC_ARCHIVE",
    qualifiedAt: NOW,
    evidence: [
      {
        evidenceId: "probe-evidence",
        evidenceType: "TECHNICAL_PROBE",
        url: "https://archive.example.com/object.zip",
        capturedAt: NOW,
        contentDigest: HASH_B,
        captureStatus: "HASHED_CONTENT_CAPTURED",
      },
    ],
    rightsReview,
    technical: {
      archiveHostAllowlist: ["archive.example.com"],
      authClass: "PUBLIC_NO_CREDENTIAL",
      transport: "HTTPS_GET_HEAD_ONLY",
      objectAddressing: "EXACT_IMMUTABLE_OBJECT_MANIFEST",
      checksumAlgorithm: "SHA256",
      providerChecksumRequired: true,
      probeStatus: "PASS",
      lastProbeAt: NOW,
      probeEvidenceIds: ["probe-evidence"],
      knownObjectCount: 1,
      knownObjectBytes: 1_000,
      reasonCodes: [],
    },
    instrumentHistory,
    sourceClock: {
      ...clockPolicy,
      policyDigest: stableContentHash(clockPolicy),
      reasonCodes: ["knowledge_time_is_modeled_not_observed"],
    },
    detectorCoverage: [{
      detectorId: M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
      coverageStatus: "SUPPORTED",
      requiredDatasetKinds: ["KLINE_1M"],
      unavailableDatasetKinds: [],
      reasonCodes: [],
    }],
  });
}

test("Binance archive candidate stays blocked until rights and point-in-time instrument history exist", () => {
  assert.equal(M2_BINANCE_VISION_SOURCE_ASSESSMENT.assessmentStatus, "BLOCKED");
  assert.equal(M2_BINANCE_VISION_SOURCE_ASSESSMENT.metadataProbeAllowed, true);
  assert.equal(M2_BINANCE_VISION_SOURCE_ASSESSMENT.bulkAcquisitionAllowed, false);
  assert.equal(M2_BINANCE_VISION_SOURCE_ASSESSMENT.cohortFreezeAllowed, false);
  assert.deepEqual(
    M2_BINANCE_VISION_SOURCE_ASSESSMENT.eligibleDetectorIds,
    [
      M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId,
      M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
      M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
      M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId,
    ].sort(),
  );
  assert.deepEqual(M2_BINANCE_VISION_SOURCE_ASSESSMENT.blockedDetectorIds, [
    M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
  ]);
  assert.ok(
    M2_BINANCE_VISION_SOURCE_ASSESSMENT.blockerReasonCodes.includes(
      "source_rights_human_review_pending",
    ),
  );
  assert.ok(
    M2_BINANCE_VISION_SOURCE_ASSESSMENT.blockerReasonCodes.includes(
      "point_in_time_instrument_history_missing",
    ),
  );
});

test("a source becomes cohort-ready only with hashed rights evidence and complete point-in-time identity", () => {
  const qualification = approvedQualification();
  const assessment = assessM2HistoricalSource(qualification);
  assert.equal(assessment.assessmentStatus, "READY");
  assert.equal(assessment.bulkAcquisitionAllowed, true);
  assert.equal(assessment.cohortFreezeAllowed, true);
  assert.deepEqual(assessment.blockerReasonCodes, []);
  assert.deepEqual(assessment.warningReasonCodes, [
    "knowledge_time_is_modeled_not_observed",
  ]);
});

test("approved rights cannot open bulk acquisition before historical identity passes", () => {
  const approved = approvedQualification();
  const { qualificationDigest, qualificationId, ...core } = approved;
  assert.ok(qualificationDigest);
  assert.ok(qualificationId);
  const currentOnlyCapability =
    buildM2HistoricalInstrumentCapabilityArtifact({
      schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
      capabilityRegistryId: "test-current-only-instrument-source",
      providerId: "TEST_PROVIDER",
      sourceOperator: "Test Source",
      sourceClass: "VENUE_OFFICIAL",
      evidenceMode: "CURRENT_SNAPSHOT_ONLY",
      assessedAt: NOW,
      captureStartedAt: null,
      coverage: { startedAt: null, endedAt: null },
      documentation: [{
        evidenceId: "current-only-instrument-doc",
        evidenceType: "OFFICIAL_DOCUMENTATION",
        url: "https://example.com/current-instruments",
        capturedAt: NOW,
        contentDigest: HASH_A,
        contentBytes: 1_000,
        captureStatus: "HASHED_CONTENT_CAPTURED",
        retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
        claimScope: "CURRENT_INSTRUMENT_FIELDS",
      }],
      guarantees: {
        fullUniverseDenominator: true,
        includesDelistedInstruments: false,
        onboardAt: true,
        delistAt: false,
        contractType: true,
        settlementAsset: true,
        underlyingClass: true,
        tradingStatusIntervals: false,
        symbolReuseDisambiguation: false,
      },
      declaredLimitations: ["current_snapshot_cannot_backfill_history"],
    });
  const blockedHistory = buildM2HistoricalInstrumentCoverageArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: NOW,
    requestedWindow: {
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    denominator: {
      mode: "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
      manifestDigest: HASH_C,
      expectedInstruments: [{
        providerInstrumentKey: "TEST_PROVIDER:BTCUSDT:2026-06",
        providerSymbol: "BTCUSDT",
      }],
    },
    capability: currentOnlyCapability,
    records: [],
  });
  const qualification = buildM2HistoricalSourceQualification({
    ...core,
    instrumentHistory: blockedHistory,
  });
  const assessment = assessM2HistoricalSource(qualification);
  assert.equal(assessment.bulkAcquisitionAllowed, false);
  assert.equal(assessment.cohortFreezeAllowed, false);
  assert.ok(assessment.blockerReasonCodes.includes(
    "point_in_time_instrument_history_missing",
  ));
});

test("provider drift and unknown knowledge time cannot open source authority", () => {
  const approved = approvedQualification();
  const { qualificationDigest, qualificationId, ...core } = approved;
  assert.ok(qualificationDigest);
  assert.ok(qualificationId);
  assert.throws(
    () => buildM2HistoricalSourceQualification({
      ...core,
      providerId: "DIFFERENT_PROVIDER",
    }),
    /instrument history provider binding mismatch/u,
  );

  const unknownClockPolicy = {
    policyId: "test-unknown-clock.v1",
    eventTimeBasis: "CLOSED_CANDLE_CLOSE_TIME",
    availabilityTimeMode: "UNKNOWN",
    conservativeLatencySeconds: null,
    archiveRetrievalTimeUsedAsMarketKnowledgeTime: false,
  } as const;
  const qualification = buildM2HistoricalSourceQualification({
    ...core,
    sourceClock: {
      ...unknownClockPolicy,
      policyDigest: stableContentHash(unknownClockPolicy),
      reasonCodes: ["source_knowledge_time_policy_unknown"],
    },
  });
  const assessment = assessM2HistoricalSource(qualification);
  assert.equal(assessment.assessmentStatus, "BLOCKED");
  assert.equal(assessment.bulkAcquisitionAllowed, false);
  assert.equal(assessment.cohortFreezeAllowed, false);
  assert.ok(assessment.blockerReasonCodes.includes(
    "source_knowledge_time_policy_unknown",
  ));
});

test("an agent-shaped pending review cannot be disguised as approved source rights", () => {
  const qualification = approvedQualification();
  const forged = structuredClone(qualification);
  forged.rightsReview.reviewerType = "UNASSIGNED";
  forged.rightsReview.reviewerIdentity = null;
  forged.rightsReview.reviewedAt = null;
  assert.throws(
    () => M2HistoricalSourceQualificationSchema.parse(forged),
    /completed source rights require external human evidence/u,
  );
});

test("source qualification content and identity are tamper-evident", () => {
  const forged = structuredClone(M2_BINANCE_VISION_SOURCE_QUALIFICATION);
  forged.technical.knownObjectBytes += 1;
  assert.throws(
    () => M2HistoricalSourceQualificationSchema.parse(forged),
    /source qualification digest mismatch/u,
  );
});

test("the bounded one-object technical pilot is allowed outside the worktree", () => {
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: NOW,
    outputRoot: "/tmp/market-radar-v2-m2-2-pilot",
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 218_000_000_000,
  });
  assert.equal(preflight.decision, "ALLOW");
  assert.deepEqual(preflight.reasonCodes, []);
  assert.equal(preflight.projectedFreeBytesAfterCompletion, 217_981_000_000);
});

test("raw archives cannot be written inside the Git worktree", () => {
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: NOW,
    outputRoot: "/workspace/market-radar/.cache/raw",
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 218_000_000_000,
  });
  assert.equal(preflight.decision, "BLOCK");
  assert.ok(preflight.reasonCodes.includes(
    "raw_output_root_inside_git_worktree",
  ));
});

test("disk reserve is a hard acquisition gate", () => {
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: NOW,
    outputRoot: "/tmp/market-radar-v2-m2-2-pilot",
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 100_018_999_999,
  });
  assert.equal(preflight.decision, "BLOCK");
  assert.equal(preflight.projectedFreeBytesAfterCompletion, null);
  assert.ok(preflight.reasonCodes.includes(
    "insufficient_free_disk_for_bounded_acquisition",
  ));
});

test("preflight cannot be backdated before its frozen acquisition plan", () => {
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: "2026-07-20T07:44:59.999Z",
    outputRoot: "/tmp/market-radar-v2-m2-2-pilot",
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 218_000_000_000,
  });
  assert.equal(preflight.decision, "BLOCK");
  assert.ok(preflight.reasonCodes.includes(
    "acquisition_preflight_predates_frozen_plan",
  ));
});

test("bulk acquisition cannot reuse technical-probe permission", () => {
  const pilot = M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN;
  const plan = buildM2HistoricalAcquisitionPlan({
    schemaVersion: M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
    planName: "blocked-bulk-plan",
    generatedAt: pilot.generatedAt,
    sourceQualificationId: pilot.sourceQualificationId,
    sourceQualificationDigest: pilot.sourceQualificationDigest,
    sourceAssessmentDigest: pilot.sourceAssessmentDigest,
    mode: "BULK_ACQUISITION",
    providerId: pilot.providerId,
    archiveHostAllowlist: [...pilot.archiveHostAllowlist],
    coverage: pilot.coverage,
    selectedDetectorIds: [...pilot.selectedDetectorIds],
    objects: structuredClone(pilot.objects),
    budget: pilot.budget,
    rawDataGitPolicy: pilot.rawDataGitPolicy,
    postVerificationDisposition: "RETAIN_APPROVED_RESEARCH_ARCHIVE",
    redirectPolicy: pilot.redirectPolicy,
    resumePolicy: pilot.resumePolicy,
    checksumPolicy: pilot.checksumPolicy,
  });
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: NOW,
    outputRoot: "/tmp/market-radar-v2-m2-2-bulk",
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 218_000_000_000,
  });
  assert.equal(preflight.decision, "BLOCK");
  assert.ok(preflight.reasonCodes.includes(
    "source_not_approved_for_bulk_acquisition",
  ));
});

test("archive URLs cannot escape the exact HTTPS allowlist", () => {
  const forged = structuredClone(M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN);
  forged.objects[0]!.dataUrl =
    "https://attacker.example/data/BTCUSDT-1m-2026-06.zip";
  forged.objects[0]!.checksumUrl = `${forged.objects[0]!.dataUrl}.CHECKSUM`;
  assert.throws(
    () => M2HistoricalAcquisitionPlanSchema.parse(forged),
    /archive object host is outside the frozen allowlist/u,
  );
});
