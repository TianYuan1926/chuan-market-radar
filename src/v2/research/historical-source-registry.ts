import {
  M2_DRAFT_DETECTORS,
} from "../modules/detection/draft-replay-contract";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
  buildM2HistoricalAcquisitionPlan,
} from "./historical-acquisition-contract";
import {
  M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION,
  assessM2HistoricalSource,
  buildM2HistoricalSourceQualification,
} from "./historical-source-qualification";
import {
  M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE,
} from "./historical-instrument-source-registry";
import {
  M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
  buildM2HistoricalRightsReviewArtifact,
} from "./historical-rights-review";

export const M2_BINANCE_ARCHIVE_CLOCK_POLICY = Object.freeze({
  policyId: "v2-m2-binance-closed-candle-modeled-availability.v1",
  eventTimeBasis: "CLOSED_CANDLE_CLOSE_TIME",
  availabilityTimeMode: "MODELED_CONSERVATIVE_LATENCY",
  conservativeLatencySeconds: 10,
  archiveRetrievalTimeUsedAsMarketKnowledgeTime: false,
} as const);

export const M2_BINANCE_ARCHIVE_CLOCK_POLICY_DIGEST = stableContentHash(
  M2_BINANCE_ARCHIVE_CLOCK_POLICY,
);

export const M2_BINANCE_VISION_RIGHTS_REVIEW =
  buildM2HistoricalRightsReviewArtifact({
    schemaVersion: M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
    sourceRegistryId: "binance-vision-usds-futures-public-archive.v1",
    sourceOperator: "Binance",
    intendedUse: "PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH",
    deploymentAudience: "SINGLE_ACCOUNT_OWNER_PRIVATE_ACCESS",
    decision: "PENDING_HUMAN_REVIEW",
    decisionOrigin: "PENDING_HUMAN_REVIEW",
    evidenceEnvironment: "EXTERNAL_REVIEW_EVIDENCE",
    retentionRight: "UNKNOWN",
    replayRight: "UNKNOWN",
    redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
    reviewerType: "UNASSIGNED",
    reviewerIdentity: null,
    reviewedAt: null,
    reviewValidUntil: null,
    jurisdictionScope: null,
    accountScope: null,
    reviewerAttestationDigest: null,
    evidence: [
      {
        evidenceId: "binance-public-data-repository-license",
        evidenceType: "OFFICIAL_LICENSE",
        sourceOperator: "Binance",
        url: "https://github.com/binance/binance-public-data/blob/master/LICENSE",
        capturedAt: "2026-07-20T07:30:00.000Z",
        termsEffectiveAt: null,
        contentDigest: null,
        contentBytes: null,
        captureStatus: "REFERENCE_ONLY_UNHASHED",
        retentionClass: "REFERENCE_ONLY",
        appliesToDataClasses: ["HISTORICAL_MARKET_DATA"],
      },
      {
        evidenceId: "binance-terms-reference",
        evidenceType: "OFFICIAL_TERMS",
        sourceOperator: "Binance",
        url: "https://www.binance.com/en/terms",
        capturedAt: "2026-07-20T07:30:00.000Z",
        termsEffectiveAt: null,
        contentDigest: null,
        contentBytes: null,
        captureStatus: "REFERENCE_ONLY_UNHASHED",
        retentionClass: "REFERENCE_ONLY",
        appliesToDataClasses: [
          "HISTORICAL_MARKET_DATA",
          "CURRENT_MARKET_DATA",
          "INSTRUMENT_REFERENCE_DATA",
        ],
      },
    ],
    rawTermsStoredInRepository: false,
    rawMarketDataRedistributionAllowed: false,
    revocationDisposition:
      "DELETE_RETAINED_RAW_DATA_AND_REVOKE_DERIVED_ACCESS",
    limitations: [
      "repository_license_must_not_be_assumed_to_license_market_data",
      "account_owner_or_qualified_counsel_decision_required",
      "official_terms_content_capture_still_required",
    ],
  });

export const M2_BINANCE_VISION_SOURCE_QUALIFICATION =
  buildM2HistoricalSourceQualification({
    schemaVersion: M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION,
    sourceRegistryId: "binance-vision-usds-futures-public-archive.v1",
    providerId: "BINANCE_USDS_FUTURES",
    capabilityId: "PUBLIC_MONTHLY_HISTORICAL_ARCHIVE",
    sourceType: "VENUE_PUBLIC_ARCHIVE",
    qualifiedAt: "2026-07-20T07:40:00.000Z",
    evidence: [
      {
        evidenceId: "binance-public-data-repository-readme",
        evidenceType: "OFFICIAL_DOCUMENTATION",
        url: "https://github.com/binance/binance-public-data",
        capturedAt: "2026-07-20T07:30:00.000Z",
        contentDigest: null,
        captureStatus: "REFERENCE_ONLY_UNHASHED",
      },
      {
        evidenceId: "binance-vision-known-object-probe-2026-07-20",
        evidenceType: "TECHNICAL_PROBE",
        url: "https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2026-06.zip",
        capturedAt: "2026-07-20T07:35:00.000Z",
        contentDigest:
          "sha256:9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490",
        captureStatus: "HASHED_CONTENT_CAPTURED",
      },
    ],
    rightsReview: M2_BINANCE_VISION_RIGHTS_REVIEW,
    technical: {
      archiveHostAllowlist: [
        "data.binance.vision",
        "s3.ap-northeast-1.amazonaws.com",
      ],
      authClass: "PUBLIC_NO_CREDENTIAL",
      transport: "HTTPS_GET_HEAD_ONLY",
      objectAddressing: "EXACT_IMMUTABLE_OBJECT_MANIFEST",
      checksumAlgorithm: "SHA256",
      providerChecksumRequired: true,
      probeStatus: "PASS",
      lastProbeAt: "2026-07-20T07:35:00.000Z",
      probeEvidenceIds: [
        "binance-vision-known-object-probe-2026-07-20",
      ],
      knownObjectCount: 1,
      knownObjectBytes: 1_838_455,
      reasonCodes: [],
    },
    instrumentHistory:
      M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE,
    sourceClock: {
      eventTimeBasis: M2_BINANCE_ARCHIVE_CLOCK_POLICY.eventTimeBasis,
      availabilityTimeMode:
        M2_BINANCE_ARCHIVE_CLOCK_POLICY.availabilityTimeMode,
      conservativeLatencySeconds:
        M2_BINANCE_ARCHIVE_CLOCK_POLICY.conservativeLatencySeconds,
      policyId: M2_BINANCE_ARCHIVE_CLOCK_POLICY.policyId,
      policyDigest: M2_BINANCE_ARCHIVE_CLOCK_POLICY_DIGEST,
      archiveRetrievalTimeUsedAsMarketKnowledgeTime: false,
      reasonCodes: ["knowledge_time_is_modeled_not_observed"],
    },
    detectorCoverage: [
      {
        detectorId: M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
        coverageStatus: "SUPPORTED",
        requiredDatasetKinds: ["KLINE_1M"],
        unavailableDatasetKinds: [],
        reasonCodes: [],
      },
      {
        detectorId: M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
        coverageStatus: "SUPPORTED",
        requiredDatasetKinds: ["KLINE_1M"],
        unavailableDatasetKinds: [],
        reasonCodes: [
          "aggressive_flow_uses_kline_taker_buy_volume_not_full_trade_tape",
        ],
      },
      {
        detectorId: M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
        coverageStatus: "UNSUPPORTED",
        requiredDatasetKinds: ["L2_BOOK_DEPTH"],
        unavailableDatasetKinds: ["L2_BOOK_DEPTH"],
        reasonCodes: [
          "monthly_kline_archive_cannot_reconstruct_l2_depth_shift",
        ],
      },
      {
        detectorId: M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId,
        coverageStatus: "SUPPORTED",
        requiredDatasetKinds: ["KLINE_1M"],
        unavailableDatasetKinds: [],
        reasonCodes: [],
      },
      {
        detectorId: M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId,
        coverageStatus: "SUPPORTED",
        requiredDatasetKinds: ["KLINE_1M"],
        unavailableDatasetKinds: [],
        reasonCodes: [],
      },
    ],
  });

export const M2_BINANCE_VISION_SOURCE_ASSESSMENT = assessM2HistoricalSource(
  M2_BINANCE_VISION_SOURCE_QUALIFICATION,
);

export const M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN =
  buildM2HistoricalAcquisitionPlan({
    schemaVersion: M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
    planName: "binance-vision-btcusdt-2026-06-technical-pilot",
    generatedAt: "2026-07-20T07:45:00.000Z",
    sourceQualificationId:
      M2_BINANCE_VISION_SOURCE_QUALIFICATION.qualificationId,
    sourceQualificationDigest:
      M2_BINANCE_VISION_SOURCE_QUALIFICATION.qualificationDigest,
    sourceAssessmentDigest:
      M2_BINANCE_VISION_SOURCE_ASSESSMENT.assessmentDigest,
    mode: "TECHNICAL_PILOT_ONLY",
    providerId: "BINANCE_USDS_FUTURES",
    archiveHostAllowlist: [
      "data.binance.vision",
      "s3.ap-northeast-1.amazonaws.com",
    ],
    coverage: {
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    selectedDetectorIds: [
      M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
    ],
    objects: [{
      objectId: "binance:um:monthly:klines:BTCUSDT:1m:2026-06",
      canonicalInstrumentId: "BINANCE:LINEAR_PERPETUAL:BTC:USDT:BTCUSDT",
      providerSymbol: "BTCUSDT",
      datasetKind: "KLINE_1M",
      period: "2026-06",
      dataUrl:
        "https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2026-06.zip",
      checksumUrl:
        "https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2026-06.zip.CHECKSUM",
      expectedFileName: "BTCUSDT-1m-2026-06.zip",
      expectedSha256:
        "sha256:9b214199eb5063585c7ed0f59ba19323326d68ac024b85106713989399204490",
      measuredCompressedBytes: 1_838_455,
      measurementObservedAt: "2026-07-20T07:35:00.000Z",
    }],
    budget: {
      objectCountMaximum: 1,
      compressedBytesMaximum: 2_000_000,
      extractedBytesMaximum: 15_000_000,
      temporaryBytesMaximum: 2_000_000,
      minimumFreeBytesAfterCompletion: 100_000_000_000,
      requiredFreeBytes: 100_019_000_000,
    },
    rawDataGitPolicy: "RAW_BYTES_OUTSIDE_WORKTREE_ONLY",
    postVerificationDisposition: "DELETE_RAW_AFTER_TECHNICAL_VERIFICATION",
    redirectPolicy: "REJECT_REDIRECT_OUTSIDE_ALLOWLIST",
    resumePolicy: "ATOMIC_PARTIAL_WITH_RANGE_VALIDATION",
    checksumPolicy: "VERIFY_PROVIDER_SHA256_BEFORE_PROMOTION",
  });
