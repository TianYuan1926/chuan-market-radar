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

const NOW = "2026-07-20T08:00:00.000Z";
const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function approvedQualification() {
  const clockPolicy = {
    policyId: "test-clock.v1",
    eventTimeBasis: "CLOSED_CANDLE_CLOSE_TIME",
    availabilityTimeMode: "MODELED_CONSERVATIVE_LATENCY",
    conservativeLatencySeconds: 10,
    archiveRetrievalTimeUsedAsMarketKnowledgeTime: false,
  } as const;
  return buildM2HistoricalSourceQualification({
    schemaVersion: M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION,
    sourceRegistryId: "test-approved-source",
    providerId: "TEST_PROVIDER",
    capabilityId: "TEST_ARCHIVE",
    sourceType: "VENUE_PUBLIC_ARCHIVE",
    qualifiedAt: NOW,
    evidence: [
      {
        evidenceId: "rights-evidence",
        evidenceType: "OFFICIAL_TERMS",
        url: "https://example.com/official-terms",
        capturedAt: NOW,
        contentDigest: HASH_A,
        captureStatus: "HASHED_CONTENT_CAPTURED",
      },
      {
        evidenceId: "probe-evidence",
        evidenceType: "TECHNICAL_PROBE",
        url: "https://archive.example.com/object.zip",
        capturedAt: NOW,
        contentDigest: HASH_B,
        captureStatus: "HASHED_CONTENT_CAPTURED",
      },
    ],
    rightsReview: {
      intendedUse: "PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH",
      decision: "APPROVED",
      retentionRight: "GRANTED",
      replayRight: "GRANTED",
      redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
      reviewerType: "ACCOUNT_OWNER",
      reviewerIdentity: "test-account-owner",
      reviewedAt: NOW,
      evidenceIds: ["rights-evidence"],
      limitations: [],
    },
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
    instrumentHistory: {
      evidenceMode: "POINT_IN_TIME_INSTRUMENT_SNAPSHOTS",
      onboardAtComplete: true,
      delistAtComplete: true,
      contractTypeComplete: true,
      settlementAssetComplete: true,
      underlyingClassComplete: true,
      tradingStatusComplete: true,
      evidenceDigest: HASH_A,
      reasonCodes: [],
    },
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

test("an agent-shaped pending review cannot be disguised as approved source rights", () => {
  const qualification = approvedQualification();
  const forged = structuredClone(qualification);
  forged.rightsReview.reviewerType = "UNASSIGNED";
  forged.rightsReview.reviewerIdentity = null;
  forged.rightsReview.reviewedAt = null;
  assert.throws(
    () => M2HistoricalSourceQualificationSchema.parse(forged),
    /approved source rights require granted rights and a human review/u,
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
