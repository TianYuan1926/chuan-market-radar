import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_PRECURSOR_ABLATION_GROUPS,
  M2_PRECURSOR_DIRECTIONS,
  M2_PRECURSOR_FAMILIES,
  M2_PRECURSOR_METRIC_CONTRACT,
  M2_PRECURSOR_OUTCOME_CLASSES,
  M2_PRECURSOR_RESEARCH_AUTHORITY,
  M2PrecursorAtlasSchema,
  assessM2PrecursorResearchReadiness,
  buildDefaultM2PrecursorAtlas,
  buildM2PrecursorAtlas,
  buildM2SectorSnapshot,
  type M2PrecursorResearchEvidence,
  type M2SectorSnapshotInput,
} from "./m2-precursor-atlas-contract";

const RELEASE = "b".repeat(40);
const FROZEN_AT = "2026-07-26T02:00:00.000Z";
const atlas = buildDefaultM2PrecursorAtlas(FROZEN_AT);

function sectorInput(
  overrides: Partial<M2SectorSnapshotInput> = {},
): M2SectorSnapshotInput {
  return {
    schemaVersion: "v2-m2-point-in-time-sector-snapshot.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    taxonomySource: "coingecko-category-research",
    taxonomyVersion: "taxonomy-20260726",
    knowledgeTime: "2026-07-26T02:00:00.000Z",
    sourceCutoff: "2026-07-26T01:59:59.000Z",
    generatedAt: "2026-07-26T02:00:00.100Z",
    btcBetaAdjustmentVersion: "btc-beta.v1",
    ethBetaAdjustmentVersion: "eth-beta.v1",
    memberships: [
      {
        canonicalInstrumentId: "scope-v2:binance:dogeusdt",
        sectorId: "meme",
        role: "LEADER",
        observedAt: "2026-07-26T01:59:58.000Z",
        sourceEvidenceIds: ["taxonomy-evidence-2", "taxonomy-evidence-1"],
        reasonCodes: [],
      },
      {
        canonicalInstrumentId: "scope-v2:binance:shibusdt",
        sectorId: "meme",
        role: "LAGGARD",
        observedAt: "2026-07-26T01:59:58.000Z",
        sourceEvidenceIds: ["taxonomy-evidence-3"],
        reasonCodes: [],
      },
    ],
    relationships: [
      {
        leaderInstrumentId: "scope-v2:binance:dogeusdt",
        followerInstrumentId: "scope-v2:binance:shibusdt",
        direction: "UP_PROPAGATION",
        leadLagMs: 120_000,
        stability: 0.61,
        sampleSize: 80,
        sourceEvidenceIds: ["lead-lag-evidence-1"],
        status: "RESEARCH_ONLY",
        reasonCodes: ["point_in_time_lead_lag_observed"],
      },
    ],
    futureMembershipAllowed: false,
    hindsightLeaderRelabelingAllowed: false,
    candidateEmissionAllowed: false,
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
    ...overrides,
  };
}

function passingEvidence(
  overrides: Partial<M2PrecursorResearchEvidence> = {},
): M2PrecursorResearchEvidence {
  const venues = [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ] as const;
  const regimes = ["TREND", "RANGE", "TRANSITION", "STRESS"] as const;
  const liquiditySegments = [
    "DEEP",
    "NORMAL",
    "THIN",
    "NEW_LISTING",
  ] as const;
  const segmentEvidence = M2_PRECURSOR_FAMILIES.flatMap((family) =>
    (["LONG", "SHORT"] as const).flatMap((direction) =>
      venues.flatMap((venue, venueIndex) =>
        regimes.map((regime, regimeIndex) => {
          const stratum = `${family}:${direction}:${venue}:${regime}`;
          return {
            family,
            direction,
            venue,
            regime,
            liquiditySegment:
              liquiditySegments[
                (venueIndex + regimeIndex) % liquiditySegments.length
              ]!,
            lifecycleState:
              family === "EVENT_LISTING_TRANSITION" && regimeIndex === 0
                ? "TRADING_WARMUP" as const
                : "ESTABLISHED" as const,
            trialRegistrationId: `trial:${family}:${direction}`,
            cohortId: `cohort:${stratum}`,
            upExpansionCount: 10,
            downExpansionCount: 10,
            noExpansionCount: 20,
            matchedControlCount: 40,
            sourceEvidenceIds: [`segment-evidence:${stratum}`],
            qualityStatus: "PASS" as const,
            reasonCodes: ["segment_denominator_complete"],
          };
        })
      )
    )
  );
  return {
    schemaVersion: "v2-m2-precursor-research-evidence.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RELEASE,
    atlasContentHash: atlas.contentHash,
    evaluatedAt: "2026-07-26T03:00:00.000Z",
    sourceCutoff: "2026-07-26T02:59:59.000Z",
    evidenceMode: "FORWARD_ONLY",
    historicalL2Availability: "UNAVAILABLE",
    segmentEvidence,
    ablations: M2_PRECURSOR_ABLATION_GROUPS.map((group) => ({
      group,
      status: "PASS",
      trialRegistrationId: `ablation-trial:${group}`,
      evidenceIds: [`ablation-evidence:${group}`],
      incrementalValueObserved: group !== "EVENT_AND_SUPPLEMENTAL_CONTEXT",
      reasonCodes: ["ablation_executed"],
    })),
    holdout: {
      holdoutId: "untouched-holdout-1",
      manifestDigest:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: "SEALED_UNTOUCHED",
      sealedAt: "2026-07-26T02:30:00.000Z",
      openedAt: null,
      accessCount: 0,
    },
    forwardShadow: {
      status: "PASS",
      evidenceIds: ["forward-shadow-evidence-1"],
      frozenDurationSeconds: 2_592_000,
      observedSegmentCount: segmentEvidence.length,
    },
    metricPlanFrozen: true,
    futureLeakCount: 0,
    rightsAndEntitlementStatus: "PASS",
    independentAuditStatus: "PASS",
    probabilityOutputAllowed: false,
    candidateEmissionAllowed: false,
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
    ...overrides,
  };
}

test("default atlas registers eight families in separate LONG, SHORT and UNKNOWN lanes", () => {
  assert.equal(
    atlas.hypotheses.length,
    M2_PRECURSOR_FAMILIES.length * M2_PRECURSOR_DIRECTIONS.length,
  );
  for (const family of M2_PRECURSOR_FAMILIES) {
    const familyHypotheses = atlas.hypotheses.filter(
      (hypothesis) => hypothesis.family === family,
    );
    assert.deepEqual(
      familyHypotheses.map((hypothesis) => hypothesis.direction).sort(),
      [...M2_PRECURSOR_DIRECTIONS].sort(),
    );
    const long = familyHypotheses.find((item) => item.direction === "LONG")!;
    const short = familyHypotheses.find((item) => item.direction === "SHORT")!;
    assert.notDeepEqual(
      [...long.requiredFeatureKeys].sort(),
      [...short.requiredFeatureKeys].sort(),
    );
  }
  assert.deepEqual(atlas.outcomeClasses, M2_PRECURSOR_OUTCOME_CLASSES);
  assert.equal(atlas.directionMayBeSignFlip, false);
  assert.equal(atlas.totalScoreAuthorityAllowed, false);
  assert.equal(atlas.candidateEmissionAllowed, false);
  assert.equal(atlas.signalGradeAllowed, false);
  assert.equal(atlas.readyAuthorityAllowed, false);
  assert.equal(Object.isFrozen(atlas), true);
});

test("atlas identity is deterministic across non-semantic input ordering", () => {
  const reordered = buildM2PrecursorAtlas({
    schemaVersion: atlas.schemaVersion,
    scopeEpoch: atlas.scopeEpoch,
    atlasVersion: atlas.atlasVersion,
    frozenAt: atlas.frozenAt,
    featureRegistry: [...atlas.featureRegistry].reverse(),
    hypotheses: [...atlas.hypotheses].reverse(),
    outcomeClasses: [
      "UP_EXPANSION",
      "DOWN_EXPANSION",
      "NO_EXPANSION",
    ] as [
      "UP_EXPANSION",
      "DOWN_EXPANSION",
      "NO_EXPANSION",
    ],
    matchedControlRequired: true,
    untouchedHoldoutRequired: true,
    featureAblationRequired: true,
    futureLeakAllowed: false,
    directionMayBeSignFlip: false,
    totalScoreAuthorityAllowed: false,
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    readyAuthorityAllowed: false,
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
  });
  assert.equal(reordered.contentHash, atlas.contentHash);
  assert.equal(reordered.atlasId, atlas.atlasId);
});

test("missing directions, copied sign-flips and registry drift fail closed", () => {
  const core = {
    schemaVersion: atlas.schemaVersion,
    scopeEpoch: atlas.scopeEpoch,
    atlasVersion: atlas.atlasVersion,
    frozenAt: atlas.frozenAt,
    featureRegistry: [...atlas.featureRegistry],
    hypotheses: [...atlas.hypotheses],
    outcomeClasses: [
      "UP_EXPANSION",
      "DOWN_EXPANSION",
      "NO_EXPANSION",
    ] as [
      "UP_EXPANSION",
      "DOWN_EXPANSION",
      "NO_EXPANSION",
    ],
    matchedControlRequired: true as const,
    untouchedHoldoutRequired: true as const,
    featureAblationRequired: true as const,
    futureLeakAllowed: false as const,
    directionMayBeSignFlip: false as const,
    totalScoreAuthorityAllowed: false as const,
    candidateEmissionAllowed: false as const,
    signalGradeAllowed: false as const,
    readyAuthorityAllowed: false as const,
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
  };
  assert.throws(
    () => buildM2PrecursorAtlas({
      ...core,
      hypotheses: core.hypotheses.slice(1),
    }),
    /expected array to have 24 items|requires LONG, SHORT and UNKNOWN/u,
  );

  const copied = structuredClone(core.hypotheses);
  const long = copied.find((item) =>
    item.family === "COMPRESSION_ENERGY" && item.direction === "LONG")!;
  const shortIndex = copied.findIndex((item) =>
    item.family === "COMPRESSION_ENERGY" && item.direction === "SHORT");
  copied[shortIndex] = {
    ...copied[shortIndex]!,
    requiredFeatureKeys: [...long.requiredFeatureKeys],
  };
  assert.throws(
    () => buildM2PrecursorAtlas({ ...core, hypotheses: copied }),
    /cannot be a sign-flipped copy/u,
  );

  assert.throws(
    () => buildM2PrecursorAtlas({
      ...core,
      featureRegistry: core.featureRegistry.slice(1),
    }),
    /expected array to have 22 items|registry denominator/u,
  );
});

test("atlas and metric contracts cannot emit probability, Candidate or promotion", () => {
  for (const hypothesis of atlas.hypotheses) {
    assert.equal(hypothesis.thresholdLearningScope, "TRAIN_ONLY_UNFITTED");
    assert.equal(hypothesis.lifecycle, "DRAFT_UNCALIBRATED");
    assert.equal(hypothesis.probabilityOutputAllowed, false);
    assert.equal(hypothesis.candidateEmissionAllowed, false);
    assert.equal(hypothesis.automaticPromotionAllowed, false);
  }
  assert.equal(
    M2_PRECURSOR_METRIC_CONTRACT.probabilityOutputAllowedBeforeCalibration,
    false,
  );
  assert.equal(
    M2_PRECURSOR_METRIC_CONTRACT.signalGradeAllowedBeforeCalibration,
    false,
  );
  assert.ok(M2_PRECURSOR_METRIC_CONTRACT.metrics.includes("lead_time"));
  assert.ok(M2_PRECURSOR_METRIC_CONTRACT.metrics.includes("missed_mover_rate"));
  assert.ok(M2_PRECURSOR_METRIC_CONTRACT.metrics.includes("alert_burden"));
});

test("sector snapshots preserve point-in-time taxonomy and lead-lag identity", () => {
  const first = buildM2SectorSnapshot(sectorInput());
  const reordered = buildM2SectorSnapshot(sectorInput({
    memberships: [...sectorInput().memberships].reverse(),
  }));
  assert.equal(first.contentHash, reordered.contentHash);
  assert.equal(first.snapshotId, reordered.snapshotId);
  assert.equal(first.futureMembershipAllowed, false);
  assert.equal(first.hindsightLeaderRelabelingAllowed, false);
  assert.equal(first.candidateEmissionAllowed, false);
  assert.equal(Object.isFrozen(first.relationships), true);
});

test("sector snapshots reject future membership and hindsight relationships", () => {
  const future = sectorInput();
  future.memberships[0] = {
    ...future.memberships[0]!,
    observedAt: "2026-07-26T02:00:01.000Z",
  };
  assert.throws(
    () => buildM2SectorSnapshot(future),
    /cannot be observed after knowledge time/u,
  );

  const spliced = sectorInput();
  spliced.relationships[0] = {
    ...spliced.relationships[0]!,
    followerInstrumentId: "scope-v2:binance:future-winner",
  };
  assert.throws(
    () => buildM2SectorSnapshot(spliced),
    /must reference point-in-time membership/u,
  );
});

test("complete theoretical evidence can only advance to replay validation without emission", () => {
  const result = assessM2PrecursorResearchReadiness({
    atlas,
    evidence: passingEvidence(),
  });
  assert.equal(result.status, "READY_FOR_REPLAY_VALIDATION_NO_EMISSION");
  assert.equal(result.familyDirectionCoverage, 16);
  assert.equal(result.venueCoverage, 4);
  assert.equal(result.regimeCoverage, 4);
  assert.equal(result.liquiditySegmentCoverage, 4);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.candidateEmissionAllowed, false);
  assert.equal(result.signalGradeAllowed, false);
  assert.equal(result.readyAuthorityAllowed, false);
  assert.equal(Object.isFrozen(result), true);
});

test("current missing real evidence remains honestly blocked", () => {
  const result = assessM2PrecursorResearchReadiness({
    atlas,
    evidence: null,
  });
  assert.equal(result.status, "BLOCKED_RESEARCH_EVIDENCE");
  assert.ok(result.blockers.includes(
    "precursor_research_evidence_schema_rejected",
  ));
  assert.ok(result.blockers.includes(
    "precursor_family_direction_denominator_incomplete",
  ));
  assert.ok(result.blockers.includes(
    "precursor_untouched_holdout_not_sealed",
  ));
  assert.equal(result.candidateEmissionAllowed, false);
});

test("zero control classes, missing Venue coverage and future leaks block readiness", () => {
  const evidence = passingEvidence();
  evidence.segmentEvidence = evidence.segmentEvidence.map((segment) =>
    segment.family === "COMPRESSION_ENERGY" &&
      segment.direction === "LONG"
      ? { ...segment, noExpansionCount: 0 }
      : segment);
  evidence.segmentEvidence = evidence.segmentEvidence.filter(
    (segment) => segment.venue !== "BITGET_FUTURES",
  );
  evidence.futureLeakCount = 1;
  const result = assessM2PrecursorResearchReadiness({ atlas, evidence });
  assert.equal(result.status, "BLOCKED_RESEARCH_EVIDENCE");
  assert.ok(result.blockers.includes(
    "precursor_family_direction_denominator_incomplete",
  ));
  assert.ok(result.blockers.includes(
    "precursor_four_venue_denominator_incomplete",
  ));
  assert.ok(result.blockers.includes(
    "precursor_future_leak_detected_or_unknown",
  ));
});

test("each family-direction must independently cover Venue, regime and liquidity strata", () => {
  const evidence = passingEvidence();
  evidence.segmentEvidence = evidence.segmentEvidence.filter((segment) =>
    !(
      segment.family === "LIQUIDITY_SHIFT" &&
      segment.direction === "SHORT" &&
      (
        segment.venue === "BITGET_FUTURES" ||
        segment.regime === "STRESS" ||
        segment.regime === "TRANSITION" ||
        segment.liquiditySegment === "NEW_LISTING" ||
        segment.liquiditySegment === "THIN"
      )
    ));
  const result = assessM2PrecursorResearchReadiness({ atlas, evidence });
  assert.equal(result.status, "BLOCKED_RESEARCH_EVIDENCE");
  assert.ok(result.blockers.includes(
    "precursor_family_direction_venue_strata_incomplete:LIQUIDITY_SHIFT:SHORT",
  ));
  assert.ok(result.blockers.includes(
    "precursor_family_direction_regime_strata_incomplete:LIQUIDITY_SHIFT:SHORT",
  ));
  assert.ok(result.blockers.includes(
    "precursor_family_direction_liquidity_strata_incomplete:LIQUIDITY_SHIFT:SHORT",
  ));
});

test("holdout access, missing ablation, failed Shadow and absent audit block readiness", () => {
  const evidence = passingEvidence({
    holdout: {
      holdoutId: "untouched-holdout-1",
      manifestDigest:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: "OPENED",
      sealedAt: "2026-07-26T02:30:00.000Z",
      openedAt: "2026-07-26T02:45:00.000Z",
      accessCount: 1,
    },
    forwardShadow: {
      status: "FAIL",
      evidenceIds: ["failed-shadow-evidence"],
      frozenDurationSeconds: 60,
      observedSegmentCount: 1,
    },
    independentAuditStatus: "NOT_RUN",
  });
  evidence.ablations = evidence.ablations.slice(1);
  const result = assessM2PrecursorResearchReadiness({ atlas, evidence });
  assert.equal(result.status, "BLOCKED_RESEARCH_EVIDENCE");
  assert.ok(result.blockers.includes(
    "precursor_untouched_holdout_not_sealed",
  ));
  assert.ok(result.blockers.includes(
    "precursor_feature_ablation_incomplete",
  ));
  assert.ok(result.blockers.includes(
    "precursor_forward_shadow_not_passed",
  ));
  assert.ok(result.blockers.includes(
    "precursor_independent_audit_not_passed",
  ));
});

test("historical research cannot substitute incomplete L2 evidence", () => {
  const evidence = passingEvidence({
    evidenceMode: "HISTORICAL_POINT_IN_TIME",
    historicalL2Availability: "PARTIAL",
  });
  const parsed = assessM2PrecursorResearchReadiness({ atlas, evidence });
  assert.equal(parsed.status, "BLOCKED_RESEARCH_EVIDENCE");
  assert.ok(parsed.blockers.includes(
    "precursor_research_evidence_schema_rejected",
  ));
});

test("unknown atlas fields and hand-edited hashes are rejected", () => {
  assert.equal(
    M2PrecursorAtlasSchema.safeParse({
      ...atlas,
      authorityScore: 99,
    }).success,
    false,
  );
  assert.equal(
    M2PrecursorAtlasSchema.safeParse({
      ...atlas,
      contentHash:
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    }).success,
    false,
  );
});
