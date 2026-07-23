import assert from "node:assert/strict";
import test from "node:test";
import { stableContentHash } from "../universe/stable-artifact";
import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  segmentBindingFromScope,
} from "./m3-multi-asset-decision-contract";
import {
  M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION,
  M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION,
  M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
  qualifyM3MultiAssetAnalysis,
  sealM3MultiAssetCalibrationReference,
  verifyM3MultiAssetQualificationHash,
} from "./m3-multi-asset-qualification";
import {
  M3_MULTI_ASSET_FIXTURE_TIMES,
  M3_MULTI_ASSET_LANE_FIXTURES,
  buildM3MultiAssetAnalysisFixture,
  buildM3MultiAssetFullLaneFixture,
  calibratedM3MultiAssetReference,
} from "./testing/m3-multi-asset-fixtures";

function withoutCalibrationHash(
  calibration: ReturnType<typeof calibratedM3MultiAssetReference>,
) {
  const { calibrationHash, ...body } = calibration;
  void calibrationHash;
  return body;
}

function qualify(
  analysis: ReturnType<
    typeof buildM3MultiAssetAnalysisFixture
  >["analysis"],
  evidenceCalibration: ReturnType<
    typeof calibratedM3MultiAssetReference
  >,
  setupCalibration: ReturnType<
    typeof calibratedM3MultiAssetReference
  >,
) {
  return qualifyM3MultiAssetAnalysis({
    schemaVersion: M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION,
    policyVersion: M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    generatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.qualificationGeneratedAt,
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.qualificationCutoff,
    analysis,
    evidenceCalibration,
    setupCalibration,
  });
}

function uncalibratedEvidence(
  analysis: ReturnType<
    typeof buildM3MultiAssetAnalysisFixture
  >["analysis"],
) {
  return sealM3MultiAssetCalibrationReference({
    schemaVersion: M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION,
    status: "INSUFFICIENT",
    dimension: "EVIDENCE",
    segment: segmentBindingFromScope(analysis.binding),
    opportunityFamily: analysis.opportunity.opportunityFamily,
    direction: analysis.directionBias === "SHORT" ? "SHORT" : "LONG",
    regime: analysis.regime,
    calibrationVersion: null,
    cohortId: null,
    untouchedHoldoutId: null,
    cohortDigest: null,
    untouchedHoldoutDigest: null,
    thresholdSetDigest: null,
    metricDefinitionDigest: null,
    sampleSize: 0,
    coveredRegimes: [],
    untouchedHoldout: false,
    holdoutAccessCount: 0,
    thresholdsFrozenBeforeHoldout: false,
    futureLeakageDetected: false,
    evidenceIds: [],
    sourceCutoff: null,
    evaluatedAt: null,
    reasonCodes: ["fixture_evidence_calibration_insufficient"],
  });
}

test("all four lanes qualify evidence and setup independently", () => {
  for (const config of M3_MULTI_ASSET_LANE_FIXTURES) {
    const fixture = buildM3MultiAssetFullLaneFixture(config);
    assert.equal(
      fixture.qualificationResult.status,
      "QUALIFIED_RESEARCH_ONLY",
    );
    assert.equal(fixture.qualification.evidenceDisposition, "QUALIFIED");
    assert.equal(fixture.qualification.setupDisposition, "QUALIFIED");
    assert.equal(
      fixture.qualification.evidenceCalibrationDisposition,
      "CALIBRATED",
    );
    assert.equal(
      fixture.qualification.setupCalibrationDisposition,
      "CALIBRATED",
    );
    assert.deepEqual(fixture.qualification.blockers, []);
    assert.equal(fixture.qualification.evidenceGrade, null);
    assert.equal(fixture.qualification.setupGrade, null);
    assert.equal(fixture.qualification.estimatedProbability, null);
    assert.equal(fixture.qualification.confidenceInterval, null);
    assert.equal(fixture.qualification.promotionEligible, false);
    assert.equal(fixture.qualification.strategyAuthority, false);
    assert.equal(fixture.qualification.readyAuthority, false);
    assert.equal(
      verifyM3MultiAssetQualificationHash(fixture.qualification),
      true,
    );
  }
});

test("calibration is reusable across instruments only inside one exact segment", () => {
  const config = M3_MULTI_ASSET_LANE_FIXTURES[0];
  const primary = buildM3MultiAssetAnalysisFixture(config, {
    instrumentSuffix: "primary",
  });
  const secondary = buildM3MultiAssetAnalysisFixture(config, {
    instrumentSuffix: "secondary",
  });
  const result = qualify(
    secondary.analysis,
    calibratedM3MultiAssetReference(primary.analysis, "EVIDENCE"),
    calibratedM3MultiAssetReference(primary.analysis, "SETUP"),
  );
  assert.equal(result.status, "QUALIFIED_RESEARCH_ONLY");
  assert.notEqual(
    primary.analysis.binding.canonicalInstrumentId,
    secondary.analysis.binding.canonicalInstrumentId,
  );
});

test("venue, lane, domain and lifecycle segments cannot substitute each other", () => {
  const target = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  for (const foreignConfig of M3_MULTI_ASSET_LANE_FIXTURES.slice(1)) {
    const foreign = buildM3MultiAssetAnalysisFixture(foreignConfig);
    const result = qualify(
      target.analysis,
      calibratedM3MultiAssetReference(foreign.analysis, "EVIDENCE"),
      calibratedM3MultiAssetReference(foreign.analysis, "SETUP"),
    );
    assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
    assert.equal(
      result.qualification?.evidenceCalibrationDisposition,
      "MISMATCH",
    );
    assert.equal(
      result.qualification?.setupCalibrationDisposition,
      "MISMATCH",
    );
    assert.ok(result.reasonCodes.includes(
      "evidence_calibration_segment_mismatch",
    ));
    assert.ok(result.reasonCodes.includes(
      "setup_calibration_segment_mismatch",
    ));
  }
});

test("evidence can abstain while setup remains independently qualified", () => {
  const analysis = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[1],
  ).analysis;
  const result = qualify(
    analysis,
    uncalibratedEvidence(analysis),
    calibratedM3MultiAssetReference(analysis, "SETUP"),
  );
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.equal(result.qualification?.evidenceDisposition, "INSUFFICIENT");
  assert.equal(result.qualification?.setupDisposition, "QUALIFIED");
  assert.equal(
    result.qualification?.evidenceCalibrationDisposition,
    "INSUFFICIENT",
  );
  assert.equal(
    result.qualification?.setupCalibrationDisposition,
    "CALIBRATED",
  );
});

test("calibrated claims require sample, regime, holdout and no-leakage proof", () => {
  const analysis = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  ).analysis;
  const base = withoutCalibrationHash(
    calibratedM3MultiAssetReference(analysis, "EVIDENCE"),
  );
  assert.throws(
    () => sealM3MultiAssetCalibrationReference({
      ...base,
      sampleSize: 59,
    }),
    /minimum sample size/u,
  );
  assert.throws(
    () => sealM3MultiAssetCalibrationReference({
      ...base,
      holdoutAccessCount: 2,
    }),
    /holdout or leakage/u,
  );
  assert.throws(
    () => sealM3MultiAssetCalibrationReference({
      ...base,
      futureLeakageDetected: true,
    }),
    /holdout or leakage/u,
  );
  assert.throws(
    () => sealM3MultiAssetCalibrationReference({
      ...base,
      coveredRegimes: ["TREND", "RANGE"],
    }),
    /broad regime coverage/u,
  );
});

test("future calibration is an explicit integrity abstention", () => {
  const analysis = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  ).analysis;
  const evidence = calibratedM3MultiAssetReference(analysis, "EVIDENCE");
  const futureEvidence = sealM3MultiAssetCalibrationReference({
    ...withoutCalibrationHash(evidence),
    sourceCutoff: "2026-07-01T00:01:10.000Z",
    evaluatedAt: "2026-07-01T00:01:20.000Z",
  });
  const result = qualify(
    analysis,
    futureEvidence,
    calibratedM3MultiAssetReference(analysis, "SETUP"),
  );
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.issues.some((issue) =>
    issue.code === "qualification_consumes_future_calibration"
  ));
  assert.ok(result.reasonCodes.includes(
    "multi_asset_qualification_integrity_failed",
  ));
});

test("tampered calibration and swapped dimensions fail closed", () => {
  const analysis = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[3],
  ).analysis;
  const evidence = calibratedM3MultiAssetReference(analysis, "EVIDENCE");
  const setup = calibratedM3MultiAssetReference(analysis, "SETUP");
  const tamperedEvidence = {
    ...evidence,
    calibrationHash: stableContentHash("tampered-calibration"),
  };
  const tampered = qualify(analysis, tamperedEvidence, setup);
  assert.equal(tampered.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(tampered.issues.some((issue) =>
    issue.code === "multi_asset_calibration_hash_mismatch"
  ));

  const swapped = qualify(analysis, setup, evidence);
  assert.equal(swapped.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(swapped.issues.some((issue) =>
    issue.code === "multi_asset_calibration_dimension_mismatch"
  ));
});
