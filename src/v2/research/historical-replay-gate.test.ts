import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_DRAFT_DETECTORS,
  M2_DRAFT_REPLAY_INPUT_VERSION,
  M2_DRAFT_REPLAY_RULE_SET_DIGEST,
  type M2DraftReplayKernelInput,
} from "../modules/detection/draft-replay-contract";
import {
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
} from "../modules/detection/draft-diagnostic-ranking";
import { M2_DISCOVERY_GOLDEN_FIXTURES } from "../testing/m2-discovery-golden-fixtures";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  M2_HISTORICAL_REPLAY_DATASET_VERSION,
  M2_HISTORICAL_REPLAY_EXPERIMENT_VERSION,
  M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST,
  M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION,
  M2_HISTORICAL_REPLAY_HOLDOUT_ARTIFACT_VERSION,
  M2HistoricalReplayDatasetBundleSchema,
  M2HistoricalReplayExperimentSchema,
  assessM2HistoricalReplayDataset,
  buildM2HistoricalReplayDataset,
  buildM2HistoricalReplayHoldoutArtifact,
  type M2HistoricalReplayDatasetBundle,
  type M2HistoricalReplayExperiment,
  type M2HistoricalReplayHoldoutArtifact,
} from "./historical-replay-contract";
import {
  M2_HISTORICAL_BACKGROUND_POLICY,
  M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST,
  M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_VERSION,
  M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY,
  M2_HISTORICAL_KNOWLEDGE_TIME_POLICY,
  M2_HISTORICAL_MATCHING_POLICY,
  M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY,
  M2_HISTORICAL_SPLIT_POLICY,
  M2_HISTORICAL_TRIAL_REGISTRY,
  buildM2HistoricalEventThresholdRegistry,
} from "./historical-cohort-construction-policy";
import {
  M2HistoricalReplayGateReportSchema,
  evaluateM2ReplayThresholds,
  runM2HistoricalReplayGate,
  type M2ProportionMetric,
  type M2ReplayMetricRow,
} from "./historical-replay-gate";

type GoldenCase =
  (typeof M2_DISCOVERY_GOLDEN_FIXTURES.cases)[number];

const SYNTHETIC_SOURCE_DIGEST =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SYNTHETIC_RIGHTS_DIGEST =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPLIT_CUTOFFS = {
  TRAIN: "2026-01-05T00:01:00.000Z",
  VALIDATION: "2026-01-10T00:01:00.000Z",
  HOLDOUT: "2026-01-15T00:01:00.000Z",
} as const;

const SYNTHETIC_THRESHOLD_REGISTRY =
  buildM2HistoricalEventThresholdRegistry({
    registryName: "m2.2-test-only-thresholds",
    frozenAt: "2026-01-07T00:00:00.000Z",
    distributions: (["60M", "4H", "24H"] as const).flatMap((horizon) =>
      (["LONG", "SHORT"] as const).map((direction) => ({
        split: "TRAIN" as const,
        horizon,
        direction,
        excursionPercents: Array.from({ length: 1_000 }, () => 1),
        sourceDigest: SYNTHETIC_SOURCE_DIGEST,
      }))),
  });

function thresholdEntry(horizon: "60M" | "4H" | "24H", direction: "LONG" | "SHORT") {
  const entry = SYNTHETIC_THRESHOLD_REGISTRY.entries.find(
    (candidate) =>
      candidate.horizon === horizon && candidate.direction === direction,
  );
  assert.ok(entry);
  return entry;
}

function kernelInputForCase(
  fixtureCase: GoldenCase,
  split: keyof typeof SPLIT_CUTOFFS,
): M2DraftReplayKernelInput {
  const cutoff = SPLIT_CUTOFFS[split];
  const observedAt = new Date(Date.parse(cutoff) - 10_000).toISOString();
  const identitySuffix = split.toLowerCase();
  const detectorInput = structuredClone(fixtureCase.detectorInput);
  detectorInput.canonicalInstrumentId =
    `${detectorInput.canonicalInstrumentId}:${identitySuffix}`;
  detectorInput.underlyingGroupId =
    `${detectorInput.underlyingGroupId}:${identitySuffix}`;
  detectorInput.eventCutoff = cutoff;
  detectorInput.knowledgeCutoff = cutoff;
  for (const reference of [
    detectorInput.universe,
    detectorInput.featureSet,
    detectorInput.featureQuality,
    detectorInput.marketContext,
    detectorInput.observedPrice,
  ]) {
    reference.sourceCutoff = cutoff;
    reference.availableAt = cutoff;
  }
  return {
    schemaVersion: M2_DRAFT_REPLAY_INPUT_VERSION,
    executionMode: "REPLAY_ONLY_NO_AUTHORITY",
    detectorInput,
    observations: fixtureCase.observations.map((observation) => ({
      observationId: observation.observationId,
      featureId: observation.sourceReferenceId,
      semanticKey: observation.semanticKey,
      value: observation.value,
      unit: observation.unit,
      observedAt,
      quality: observation.quality,
    })),
  };
}

function fixtureCase(caseId: string): GoldenCase {
  const found = M2_DISCOVERY_GOLDEN_FIXTURES.cases.find(
    (candidate) => candidate.caseId === caseId,
  );
  assert.ok(found, `missing golden fixture ${caseId}`);
  return found;
}

function replayStep(
  stepId: string,
  preparedInput: M2DraftReplayKernelInput,
  unavailable = false,
) {
  return {
    stepId,
    eventCutoff: preparedInput.detectorInput.eventCutoff,
    knowledgeCutoff: preparedInput.detectorInput.knowledgeCutoff,
    detectorInput: unavailable ? null : preparedInput,
    unavailableReasonCodes: unavailable
      ? ["test_only_detector_input_unavailable"]
      : [],
  } as const;
}

function replayRecord(input: Readonly<{
  recordId: string;
  split: "TRAIN" | "VALIDATION" | "HOLDOUT";
  sourceCase: GoldenCase;
  target:
    | "EVENT"
    | "MATCHED_NON_EVENT"
    | "BACKGROUND_NON_EVENT";
  matchedEventId?: string;
  unavailable?: boolean;
}>) {
  const stepId = `step:${input.recordId}`;
  const preparedInput = kernelInputForCase(input.sourceCase, input.split);
  const cutoff = Date.parse(preparedInput.detectorInput.eventCutoff);
  const common = {
    recordId: input.recordId,
    split: input.split,
    canonicalInstrumentId: preparedInput.detectorInput.canonicalInstrumentId,
    underlyingGroupId: preparedInput.detectorInput.underlyingGroupId,
    marketRegime: "RANGE" as const,
    liquidityBucket: "HIGH" as const,
    preCutoffAssignmentProof: {
      assignmentCutoff: preparedInput.detectorInput.eventCutoff,
      regimePolicyId: M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY.policyId,
      regimePolicyDigest:
        M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY.policyDigest,
      regimeEvidenceFactIds: [`regime-fact:${input.recordId}`],
      liquidityPolicyId: M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY.policyId,
      liquidityPolicyDigest:
        M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY.policyDigest,
      liquidityEvidenceFactIds: [`liquidity-fact:${input.recordId}`],
    },
    detectorIds: [M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId],
    replaySteps: [replayStep(stepId, preparedInput, input.unavailable)],
    sourceRecordIds: [`source-record:${input.recordId}`],
  };
  if (input.target === "EVENT") {
    const eventThreshold = thresholdEntry("60M", "LONG");
    return {
      ...common,
      target: {
        targetKind: "EVENT" as const,
        eventId: `event:${input.split}`,
        horizon: "60M" as const,
        direction: "LONG" as const,
        eventStartAt: new Date(cutoff + 19 * 60_000).toISOString(),
        publicBreakoutAt: new Date(cutoff + 30 * 60_000).toISOString(),
        thresholdEntryId: eventThreshold.thresholdEntryId,
        thresholdRegistryDigest: SYNTHETIC_THRESHOLD_REGISTRY.registryDigest,
        thresholdPercent: eventThreshold.effectiveThresholdPercent,
        stepOutcomeLabels: [{
          stepId,
          moveConsumedFractionAtCutoff: 0.08,
        }],
        sourceFactIds: [`event-fact:${input.split}`],
      },
    };
  }
  if (input.target === "MATCHED_NON_EVENT") {
    return {
      ...common,
      target: {
        targetKind: "MATCHED_NON_EVENT" as const,
        controlId: `control:${input.split}`,
        matchedEventId: input.matchedEventId!,
        matchedDirection: "LONG" as const,
        noExpansionConfirmedThrough: new Date(
          cutoff + 24 * 60 * 60_000,
        ).toISOString(),
        matchingPolicyId: M2_HISTORICAL_MATCHING_POLICY.policyId,
        matchingPolicyDigest: M2_HISTORICAL_MATCHING_POLICY.policyDigest,
        sourceFactIds: [`control-fact:${input.split}`],
      },
    };
  }
  return {
    ...common,
    target: {
      targetKind: "BACKGROUND_NON_EVENT" as const,
      backgroundWindowId: `background:${input.split}`,
      noExpansionConfirmedThrough: new Date(
        cutoff + 24 * 60 * 60_000,
      ).toISOString(),
      samplingPolicyId: M2_HISTORICAL_BACKGROUND_POLICY.policyId,
      samplingPolicyDigest: M2_HISTORICAL_BACKGROUND_POLICY.policyDigest,
      sourceFactIds: [`background-fact:${input.split}`],
    },
  };
}

function syntheticDataset(options: Readonly<{
  controlMatches?: boolean;
  holdoutEventUnavailable?: boolean;
}> = {}): M2HistoricalReplayDatasetBundle {
  const match = fixtureCase("pre-move-long-compression");
  const noMatch = fixtureCase("pre-move-thin-liquidity-counterexample");
  const records = (["TRAIN", "VALIDATION", "HOLDOUT"] as const).flatMap(
    (split) => [
      replayRecord({
        recordId: `record:event:${split}`,
        split,
        sourceCase: match,
        target: "EVENT",
        unavailable: split === "HOLDOUT" && options.holdoutEventUnavailable,
      }),
      replayRecord({
        recordId: `record:control:${split}`,
        split,
        sourceCase: options.controlMatches ? match : noMatch,
        target: "MATCHED_NON_EVENT",
        matchedEventId: `event:${split}`,
      }),
      replayRecord({
        recordId: `record:background:${split}`,
        split,
        sourceCase: noMatch,
        target: "BACKGROUND_NON_EVENT",
      }),
    ],
  );
  return buildM2HistoricalReplayDataset({
    schemaVersion: M2_HISTORICAL_REPLAY_DATASET_VERSION,
    manifest: {
      datasetKind: "SYNTHETIC_CONTRACT_ONLY",
      datasetName: "m2.2-test-only-synthetic-cohort",
      frozenAt: "2026-01-17T00:00:00.000Z",
      eventLabelVersion: "significant-expansion-event.v1",
      constructionPolicyVersion:
        M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_VERSION,
      constructionPolicyDigest:
        M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST,
      detectorRuleSetVersion: "v2-m2-draft-replay-rules.v2",
      detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
      diagnosticRankingPolicyVersion:
        M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
      diagnosticRankingPolicyDigest:
        M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
      evaluatedDetectorIds: [
        M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
      ],
      eventThresholdRegistry: SYNTHETIC_THRESHOLD_REGISTRY,
      sourceRights: [{
        sourceRegistryId: "test-only-source",
        providerId: "test-only-provider",
        capabilityId: "synthetic-contract-fixture",
        sourceType: "SYNTHETIC_TEST_FIXTURE",
        licenseReviewStatus: "NOT_REVIEWED",
        retentionRight: "UNKNOWN",
        replayRight: "UNKNOWN",
        redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
        reviewedAt: null,
        evidenceDigest: SYNTHETIC_RIGHTS_DIGEST,
      }],
      pointInTimeProof: {
        eventTimeComplete: true,
        knowledgeCutoffComplete: true,
        lineageComplete: true,
        candidateUniverseCoverageComplete: true,
        immutableSourcePayloadDigest: SYNTHETIC_SOURCE_DIGEST,
        knowledgeTime: {
          mode: "OBSERVED_RECEIVED_AT",
          receivedAtComplete: true,
          sourceClockPolicyId: "test-only-clock.v1",
          sourceClockPolicyDigest: SYNTHETIC_SOURCE_DIGEST,
        },
      },
      splitPolicy: {
        policyId: M2_HISTORICAL_SPLIT_POLICY.policyId,
        policyDigest: M2_HISTORICAL_SPLIT_POLICY.policyDigest,
        strategy: "PURGED_TIME_SYMBOL_REGIME_HOLDOUT",
        purgeSeconds: 86_400,
        embargoSeconds: 86_400,
        assignmentFrozenAt: "2026-01-03T00:00:00.000Z",
        windows: [
          {
            split: "TRAIN",
            startedAt: "2026-01-04T00:00:00.000Z",
            endedAt: "2026-01-06T00:00:00.000Z",
          },
          {
            split: "VALIDATION",
            startedAt: "2026-01-09T00:00:00.000Z",
            endedAt: "2026-01-11T00:00:00.000Z",
          },
          {
            split: "HOLDOUT",
            startedAt: "2026-01-14T00:00:00.000Z",
            endedAt: "2026-01-16T00:00:00.000Z",
          },
        ],
        holdoutUnderlyingGroupIsolation: "GROUP_DISJOINT",
        symbolAssignmentEvidenceDigest: SYNTHETIC_SOURCE_DIGEST,
        regimeAssignmentEvidenceDigest: SYNTHETIC_RIGHTS_DIGEST,
        holdoutDimensions: ["TIME", "SYMBOL", "REGIME"],
      },
      coverage: {
        startedAt: "2026-01-04T00:00:00.000Z",
        endedAt: "2026-01-17T00:00:00.000Z",
        instrumentCount: 6,
        instrumentDayCount: 6,
        evaluationWindowCount: records.length,
      },
      recordCounts: {
        train: 3,
        validation: 3,
        holdout: 3,
        event: 3,
        matchedNonEvent: 3,
        backgroundNonEvent: 3,
      },
      requiredStrata: [{
        opportunityFamily: "PRE_MOVE",
        direction: "LONG",
        marketRegime: "RANGE",
        liquidityBucket: "HIGH",
      }],
      registeredTrialIds: M2_HISTORICAL_TRIAL_REGISTRY.trials.map(
        (registeredTrial) => registeredTrial.trialId,
      ),
      holdoutCustody: {
        custodyMode: "INLINE_TEST_ONLY",
        reasonCodes: ["synthetic_fixture_is_not_lifecycle_evidence"],
      },
    },
    records,
  });
}

function separatelyCustodiedSyntheticDataset(): Readonly<{
  dataset: M2HistoricalReplayDatasetBundle;
  holdoutArtifact: M2HistoricalReplayHoldoutArtifact;
}> {
  const inline = syntheticDataset();
  const holdoutWindow = inline.manifest.splitPolicy.windows[2];
  const holdoutArtifact = buildM2HistoricalReplayHoldoutArtifact({
    schemaVersion: M2_HISTORICAL_REPLAY_HOLDOUT_ARTIFACT_VERSION,
    datasetName: inline.manifest.datasetName,
    frozenAt: inline.manifest.frozenAt,
    eventLabelVersion: inline.manifest.eventLabelVersion,
    constructionPolicyVersion: inline.manifest.constructionPolicyVersion,
    constructionPolicyDigest: inline.manifest.constructionPolicyDigest,
    detectorRuleSetVersion: inline.manifest.detectorRuleSetVersion,
    detectorRuleSetDigest: inline.manifest.detectorRuleSetDigest,
    diagnosticRankingPolicyDigest:
      inline.manifest.diagnosticRankingPolicyDigest,
    eventThresholdRegistry: inline.manifest.eventThresholdRegistry,
    evaluatedDetectorIds: inline.manifest.evaluatedDetectorIds,
    splitWindow: {
      startedAt: holdoutWindow.startedAt,
      endedAt: holdoutWindow.endedAt,
    },
    records: structuredClone(inline.records.filter(
      (record) => record.split === "HOLDOUT",
    )),
  });
  const manifest = structuredClone(inline.manifest);
  manifest.holdoutCustody = {
    custodyMode: "SEPARATE_IMMUTABLE_ARTIFACT",
    artifactId: holdoutArtifact.artifactId,
    artifactDigest: holdoutArtifact.artifactDigest,
    committedSummary: holdoutArtifact.summary,
    custodyPolicyId: "test-only-single-use-custody.v1",
    custodyPolicyDigest: SYNTHETIC_RIGHTS_DIGEST,
    custodianIdentity: "test-only-independent-custodian",
    readGrantPolicy: "SINGLE_USE_GATE_ONLY",
  };
  return {
    dataset: buildM2HistoricalReplayDataset({
      schemaVersion: inline.schemaVersion,
      manifest,
      records: structuredClone(inline.records.filter(
        (record) => record.split !== "HOLDOUT",
      )),
    }),
    holdoutArtifact,
  };
}

function contractExperiment(
  dataset: M2HistoricalReplayDatasetBundle,
): M2HistoricalReplayExperiment {
  return M2HistoricalReplayExperimentSchema.parse({
    schemaVersion: M2_HISTORICAL_REPLAY_EXPERIMENT_VERSION,
    experimentId: "experiment:test-only-contract",
    codeVersion: "test-only-code-version",
    datasetSnapshotId: dataset.datasetSnapshotId,
    gatePolicyVersion: M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION,
    gatePolicyDigest: M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST,
    constructionPolicyDigest:
      M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST,
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
    eventThresholdRegistryId: dataset.manifest.eventThresholdRegistry.registryId,
    eventThresholdRegistryDigest:
      dataset.manifest.eventThresholdRegistry.registryDigest,
    trialRegistryId: M2_HISTORICAL_TRIAL_REGISTRY.registryId,
    trialRegistryDigest: M2_HISTORICAL_TRIAL_REGISTRY.registryDigest,
    evaluationMode: "CONTRACT_TEST_ONLY",
    registeredAt: "2026-01-17T00:01:00.000Z",
    thresholdFrozenAt: "2026-01-17T00:02:00.000Z",
    holdoutOpenedAt: null,
    holdoutAccessCount: 0,
    holdoutAccessEvidence: null,
    trials: M2_HISTORICAL_TRIAL_REGISTRY.trials.map((registeredTrial) => ({
      trialId: registeredTrial.trialId,
      role: registeredTrial.role,
      registeredAt: "2026-01-17T00:01:00.000Z",
      parameterSet: registeredTrial.parameterSet,
      parameterSetDigest: registeredTrial.parameterSetDigest,
    })),
    selectedBaselineTrialId: M2_HISTORICAL_TRIAL_REGISTRY.trials.find(
      (registeredTrial) => registeredTrial.role === "BASELINE",
    )!.trialId,
    allTrialsReported: false,
    sensitivityEvidence: {
      status: "NOT_RUN",
      reasonCodes: ["test_only_sensitivity_not_run"],
    },
    topKReplayEvidence: {
      status: "UNAVAILABLE",
      reasonCodes: ["draft_kernel_has_no_ranking_authority"],
    },
  });
}

function untouchedHoldoutExperiment(
  dataset: M2HistoricalReplayDatasetBundle,
  holdoutArtifact: M2HistoricalReplayHoldoutArtifact,
): M2HistoricalReplayExperiment {
  const baseline = contractExperiment(dataset);
  return M2HistoricalReplayExperimentSchema.parse({
    ...baseline,
    evaluationMode: "UNTOUCHED_HOLDOUT_GATE",
    holdoutOpenedAt: "2026-01-17T00:03:00.000Z",
    holdoutAccessCount: 1,
    holdoutAccessEvidence: {
      accessId: "test-only-single-use-access",
      artifactId: holdoutArtifact.artifactId,
      artifactDigest: holdoutArtifact.artifactDigest,
      custodianIdentity: "test-only-independent-custodian",
      openedAt: "2026-01-17T00:03:00.000Z",
      resultSealedAt: "2026-01-17T00:04:00.000Z",
      accessLedgerDigest: SYNTHETIC_SOURCE_DIGEST,
    },
  });
}

test("builds one immutable cohort with event, matched-control and background denominators", () => {
  const dataset = syntheticDataset();
  assert.match(dataset.datasetContentDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(dataset.manifest.recordCounts.event, 3);
  assert.equal(dataset.manifest.recordCounts.matchedNonEvent, 3);
  assert.equal(dataset.manifest.recordCounts.backgroundNonEvent, 3);
  assert.deepEqual(
    dataset.records.map((record) => record.recordId),
    [...dataset.records.map((record) => record.recordId)].sort(),
  );

  const tampered = structuredClone(dataset);
  const event = tampered.records.find(
    (record) => record.target.targetKind === "EVENT",
  )!;
  assert.equal(event.target.targetKind, "EVENT");
  event.target.stepOutcomeLabels[0]!.moveConsumedFractionAtCutoff = 0.99;
  assert.equal(M2HistoricalReplayDatasetBundleSchema.safeParse(tampered).success,
    false);
});

test("keeps separately custodied holdout payload physically out of the research bundle", () => {
  const { dataset, holdoutArtifact } = separatelyCustodiedSyntheticDataset();
  assert.equal(dataset.records.some((record) => record.split === "HOLDOUT"),
    false);
  assert.equal(holdoutArtifact.records.every(
    (record) => record.split === "HOLDOUT",
  ), true);
  assert.equal(dataset.manifest.recordCounts.holdout,
    holdoutArtifact.summary.recordCount);
  assert.equal(dataset.manifest.coverage.instrumentDayCount, 6);

  const leaked = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: [
      ...structuredClone(dataset.records),
      structuredClone(holdoutArtifact.records[0]!),
    ],
  };
  assert.throws(
    () => buildM2HistoricalReplayDataset(leaked),
    /holdout records cannot be inline/u,
  );
});

test("opens only the committed holdout artifact at the single-use Gate", () => {
  const { dataset, holdoutArtifact } = separatelyCustodiedSyntheticDataset();
  const experiment = untouchedHoldoutExperiment(dataset, holdoutArtifact);
  const missingArtifact = runM2HistoricalReplayGate({ dataset, experiment });
  assert.equal(missingArtifact.gateStatus, "INVALID");
  assert.equal(missingArtifact.overallMetrics.eventDenominatorCount, 0);
  assert.ok(missingArtifact.reasonCodes.includes(
    "sealed_holdout_artifact_not_supplied_to_gate",
  ));

  const report = runM2HistoricalReplayGate({
    dataset,
    experiment,
    holdoutArtifact,
  });
  assert.equal(report.evaluatedHoldoutArtifactDigest,
    holdoutArtifact.artifactDigest);
  assert.equal(report.overallMetrics.eventDenominatorCount, 1);
  assert.equal(report.overallMetrics.matchedNonEventDenominatorCount, 1);
  assert.equal(report.overallMetrics.candidatesPerInstrumentDay, 0.5);
  assert.equal(report.gateStatus, "INSUFFICIENT");
});

test("physically rejects future outcome fields from detector replay input", () => {
  const dataset = syntheticDataset();
  const rawCore = {
    schemaVersion: dataset.schemaVersion,
    manifest: dataset.manifest,
    records: structuredClone(dataset.records),
  } as Record<string, unknown> & { records: Array<Record<string, unknown>> };
  const record = rawCore.records[0]!;
  const steps = record.replaySteps as Array<Record<string, unknown>>;
  const detectorInput = steps[0]!.detectorInput as Record<string, unknown>;
  detectorInput.futureOutcome = { mfe: 12, publicBreakoutTime: "later" };
  assert.throws(
    () => buildM2HistoricalReplayDataset(rawCore as never),
    /unrecognized|futureOutcome/iu,
  );
});

test("verifies purge/embargo windows and holdout group isolation from records", () => {
  const dataset = syntheticDataset();
  const overlappingWindows = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  overlappingWindows.manifest.splitPolicy.windows[1].startedAt =
    "2026-01-06T00:30:00.000Z";
  assert.throws(
    () => buildM2HistoricalReplayDataset(overlappingWindows),
    /purge and embargo gap/u,
  );

  const leakedGroup = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  const train = leakedGroup.records.find((record) => record.split === "TRAIN")!;
  const holdout = leakedGroup.records.find(
    (record) => record.split === "HOLDOUT",
  )!;
  holdout.underlyingGroupId = train.underlyingGroupId;
  const detectorInput = holdout.replaySteps[0]!.detectorInput;
  assert.ok(detectorInput);
  detectorInput.detectorInput.underlyingGroupId = train.underlyingGroupId;
  assert.throws(
    () => buildM2HistoricalReplayDataset(leakedGroup),
    /holdout underlying groups must be disjoint/u,
  );

  const omittedStratum = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  omittedStratum.manifest.requiredStrata[0]!.liquidityBucket = "MEDIUM";
  assert.throws(
    () => buildM2HistoricalReplayDataset(omittedStratum),
    /strata cannot be omitted/u,
  );

  const cherryPickedDetectorDenominator = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  const background = cherryPickedDetectorDenominator.records.find(
    (record) => record.target.targetKind === "BACKGROUND_NON_EVENT",
  )!;
  background.detectorIds = [M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId];
  assert.throws(
    () => buildM2HistoricalReplayDataset(cherryPickedDetectorDenominator),
    /frozen Detector set/u,
  );
});

test("binds every event to the frozen TRAIN-only threshold registry", () => {
  const dataset = syntheticDataset();
  const arbitraryThreshold = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  const event = arbitraryThreshold.records.find(
    (record) => record.target.targetKind === "EVENT",
  )!;
  assert.equal(event.target.targetKind, "EVENT");
  event.target.thresholdPercent += 0.01;
  assert.throws(
    () => buildM2HistoricalReplayDataset(arbitraryThreshold),
    /frozen TRAIN-only threshold/u,
  );

  const arbitraryEntry = {
    schemaVersion: dataset.schemaVersion,
    manifest: structuredClone(dataset.manifest),
    records: structuredClone(dataset.records),
  };
  const otherEvent = arbitraryEntry.records.find(
    (record) => record.target.targetKind === "EVENT",
  )!;
  assert.equal(otherEvent.target.targetKind, "EVENT");
  otherEvent.target.thresholdEntryId = "threshold:arbitrary";
  assert.throws(
    () => buildM2HistoricalReplayDataset(arbitraryEntry),
    /frozen TRAIN-only threshold/u,
  );
});

test("rejects matched, background, regime and liquidity policy drift", () => {
  const dataset = syntheticDataset();
  for (const drift of [
    {
      targetKind: "MATCHED_NON_EVENT",
      field: "matchingPolicyId",
      value: "arbitrary-matching-policy",
    },
    {
      targetKind: "BACKGROUND_NON_EVENT",
      field: "samplingPolicyDigest",
      value: SYNTHETIC_SOURCE_DIGEST,
    },
  ] as const) {
    const raw = {
      schemaVersion: dataset.schemaVersion,
      manifest: structuredClone(dataset.manifest),
      records: structuredClone(dataset.records),
    };
    const record = raw.records.find(
      (candidate) => candidate.target.targetKind === drift.targetKind,
    )!;
    Reflect.set(record.target, drift.field, drift.value);
    assert.throws(() => buildM2HistoricalReplayDataset(raw), /Invalid input/u);
  }

  for (const field of ["regimePolicyDigest", "liquidityPolicyDigest"] as const) {
    const raw = {
      schemaVersion: dataset.schemaVersion,
      manifest: structuredClone(dataset.manifest),
      records: structuredClone(dataset.records),
    };
    Reflect.set(
      raw.records[0]!.preCutoffAssignmentProof,
      field,
      SYNTHETIC_SOURCE_DIGEST,
    );
    assert.throws(() => buildM2HistoricalReplayDataset(raw), /Invalid input/u);
  }
});

test("discloses modeled knowledge time and rejects a false receivedAt claim", () => {
  const observed = syntheticDataset();
  const modeledCore = {
    schemaVersion: observed.schemaVersion,
    manifest: structuredClone(observed.manifest),
    records: structuredClone(observed.records),
  };
  modeledCore.manifest.pointInTimeProof.knowledgeTime = {
    mode: "MODELED_CONSERVATIVE_AVAILABILITY",
    receivedAtComplete: false,
    modelPolicyId: M2_HISTORICAL_KNOWLEDGE_TIME_POLICY.policyId,
    modelPolicyDigest: M2_HISTORICAL_KNOWLEDGE_TIME_POLICY.policyDigest,
    baseLatencySeconds: 5,
    latencyScale: 1,
    disclosure: "MODELED_NOT_OBSERVED",
  };
  const modeled = buildM2HistoricalReplayDataset(modeledCore);
  assert.equal(
    modeled.manifest.pointInTimeProof.knowledgeTime.mode,
    "MODELED_CONSERVATIVE_AVAILABILITY",
  );

  const dishonest = structuredClone(modeledCore);
  Reflect.set(
    dishonest.manifest.pointInTimeProof.knowledgeTime,
    "receivedAtComplete",
    true,
  );
  assert.throws(
    () => buildM2HistoricalReplayDataset(dishonest),
    /Invalid input/u,
  );
});

test("rejects trial omission even when a drifted parameter digest is self-consistent", () => {
  const dataset = syntheticDataset();
  const omitted = structuredClone(contractExperiment(dataset));
  omitted.trials.pop();
  assert.throws(
    () => M2HistoricalReplayExperimentSchema.parse(omitted),
    /every pre-registered trial/u,
  );

  const drifted = structuredClone(contractExperiment(dataset));
  drifted.trials[0]!.parameterSet = {
    ...drifted.trials[0]!.parameterSet,
    unregisteredAdvantage: true,
  };
  drifted.trials[0]!.parameterSetDigest = stableContentHash(
    drifted.trials[0]!.parameterSet,
  );
  assert.throws(
    () => M2HistoricalReplayExperimentSchema.parse(drifted),
    /drifted from the pre-registered parameters/u,
  );
});

test("runs target-blind first detection and reports all three required denominators", () => {
  const dataset = syntheticDataset();
  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  assert.equal(report.overallMetrics.candidateDenominatorCount, 3);
  assert.equal(report.overallMetrics.eventDenominatorCount, 3);
  assert.equal(report.overallMetrics.matchedNonEventDenominatorCount, 3);
  assert.equal(report.overallMetrics.earlyCapturedEventCount, 3);
  assert.equal(report.overallMetrics.eventRecall.value, 1);
  assert.equal(report.overallMetrics.leadTime.medianSeconds, 1_800);
  assert.equal(report.overallMetrics.noiseCandidateCount, 0);
  assert.equal(report.overallMetrics.candidatePrecision.value, 1);
});

test("measures lead time from when evidence became knowable", () => {
  const inline = syntheticDataset();
  const records = structuredClone(inline.records);
  for (const record of records.filter(
    (candidate) => candidate.target.targetKind === "EVENT",
  )) {
    const step = record.replaySteps[0]!;
    const knownAt = new Date(
      Date.parse(step.eventCutoff) + 5 * 60_000,
    ).toISOString();
    step.knowledgeCutoff = knownAt;
    assert.ok(step.detectorInput);
    step.detectorInput.detectorInput.knowledgeCutoff = knownAt;
  }
  const dataset = buildM2HistoricalReplayDataset({
    schemaVersion: inline.schemaVersion,
    manifest: structuredClone(inline.manifest),
    records,
  });
  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  assert.equal(report.overallMetrics.leadTime.medianSeconds, 1_500);
});

test("counts matched and background false positives in the candidate denominator", () => {
  const dataset = syntheticDataset({ controlMatches: true });
  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  assert.equal(report.overallMetrics.candidateDenominatorCount, 6);
  assert.equal(report.overallMetrics.earlyTruePositiveCandidateCount, 3);
  assert.equal(report.overallMetrics.candidatePrecision.value, 0.5);
  assert.equal(report.overallMetrics.activatedMatchedNonEventCount, 3);
  assert.equal(report.overallMetrics.matchedNonEventActivationRate.value, 1);
  assert.equal(report.overallMetrics.noiseCandidateCount, 3);
  assert.equal(report.overallMetrics.lateNoiseRate.value, 0.5);
});

test("keeps unavailable events in the event denominator", () => {
  const dataset = syntheticDataset({ holdoutEventUnavailable: true });
  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  assert.equal(report.overallMetrics.eventDenominatorCount, 3);
  assert.equal(report.overallMetrics.earlyCapturedEventCount, 2);
  assert.equal(report.overallMetrics.unavailableEventCount, 1);
  assert.equal(report.overallMetrics.unavailableEventRate.value, 1 / 3);
});

test("never lets synthetic contract fixtures promote a Detector", () => {
  const dataset = syntheticDataset();
  const acceptance = assessM2HistoricalReplayDataset(dataset);
  assert.equal(acceptance.status, "INELIGIBLE");
  assert.equal(acceptance.lifecycleDecisionEligible, false);
  assert.ok(acceptance.reasonCodes.includes(
    "synthetic_dataset_cannot_support_lifecycle_decision",
  ));

  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  assert.equal(report.gateStatus, "INSUFFICIENT");
  assert.equal(report.detectorLifecycleBefore, "DRAFT");
  assert.equal(report.proposedLifecycle, "DRAFT");
  assert.equal(report.lifecycleMutationAllowed, false);
  assert.equal(report.candidateEmissionAllowed, false);
  assert.equal(report.proposalEligible, false);
  assert.ok(report.reasonCodes.includes("untouched_holdout_gate_not_executed"));
});

test("requires one post-freeze access for an untouched holdout Gate", () => {
  const dataset = syntheticDataset();
  const raw = {
    ...contractExperiment(dataset),
    evaluationMode: "UNTOUCHED_HOLDOUT_GATE",
  };
  assert.throws(
    () => M2HistoricalReplayExperimentSchema.parse(raw),
    /holdout Gate requires one post-freeze holdout access/u,
  );
});

function proportion(
  numerator: number,
  denominator: number,
  lowerBound: number,
  upperBound: number,
): M2ProportionMetric {
  return {
    numerator,
    denominator,
    value: numerator / denominator,
    confidenceLevel: 0.95,
    lowerBound,
    upperBound,
  };
}

function passingMetric(scopeId: string): M2ReplayMetricRow {
  return {
    scope: {
      scopeId,
      opportunityFamily: "PRE_MOVE",
      detectorId: null,
      direction: scopeId.startsWith("STRATUM") ? "LONG" : null,
      marketRegime: scopeId.startsWith("STRATUM") ? "RANGE" : null,
      liquidityBucket: scopeId.startsWith("STRATUM") ? "HIGH" : null,
    },
    candidateDenominatorCount: 200,
    earlyTruePositiveCandidateCount: 120,
    candidatePrecision: proportion(120, 200, 0.53, 0.67),
    eventDenominatorCount: 200,
    earlyCapturedEventCount: 120,
    eventRecall: proportion(120, 200, 0.53, 0.67),
    matchedNonEventDenominatorCount: 200,
    activatedMatchedNonEventCount: 20,
    matchedNonEventActivationRate: proportion(20, 200, 0.06, 0.15),
    unavailableEventCount: 0,
    unavailableEventRate: proportion(0, 200, 0, 0.02),
    lateCandidateCount: 10,
    noiseCandidateCount: 20,
    wrongDirectionCandidateCount: 0,
    lateNoiseRate: proportion(30, 200, 0.11, 0.21),
    candidatesPerInstrumentDay: 0.2,
    leadTime: {
      sampleSize: 120,
      p25Seconds: 900,
      medianSeconds: 1_800,
      p75Seconds: 3_600,
      medianConfidenceLowerSeconds: 1_500,
      medianConfidenceUpperSeconds: 2_100,
    },
  };
}

test("separates policy PASS logic from lifecycle mutation authority", () => {
  const dataset = syntheticDataset();
  const baseline = contractExperiment(dataset);
  const experiment: M2HistoricalReplayExperiment = {
    ...baseline,
    evaluationMode: "UNTOUCHED_HOLDOUT_GATE",
    holdoutOpenedAt: "2026-01-17T00:03:00.000Z",
    holdoutAccessCount: 1,
    holdoutAccessEvidence: {
      accessId: "test-only-holdout-access",
      artifactId: "test-only-holdout-artifact",
      artifactDigest: SYNTHETIC_SOURCE_DIGEST,
      custodianIdentity: "test-only-custodian",
      openedAt: "2026-01-17T00:03:00.000Z",
      resultSealedAt: "2026-01-17T00:04:00.000Z",
      accessLedgerDigest: SYNTHETIC_RIGHTS_DIGEST,
    },
    allTrialsReported: true,
    sensitivityEvidence: {
      status: "PASS",
      registeredTrialIds: M2_HISTORICAL_TRIAL_REGISTRY.trials.map(
        (registeredTrial) => registeredTrial.trialId,
      ),
      reportedTrialIds: M2_HISTORICAL_TRIAL_REGISTRY.trials.map(
        (registeredTrial) => registeredTrial.trialId,
      ),
      failedTrialIds: [],
      evidenceDigest: SYNTHETIC_SOURCE_DIGEST,
      reasonCodes: [],
    },
    topKReplayEvidence: {
      status: "VERIFIED",
      k: 20,
      candidateCount: 20,
      lateNoiseCount: 2,
      lateNoiseRate: 0.1,
      rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
      evidenceDigest: SYNTHETIC_SOURCE_DIGEST,
    },
  };
  const family = passingMetric("FAMILY:PRE_MOVE");
  const result = evaluateM2ReplayThresholds({
    datasetAcceptance: {
      status: "ACCEPTED",
      lifecycleDecisionEligible: true,
      reasonCodes: [],
    },
    experiment,
    selectedFamilies: ["PRE_MOVE"],
    overallMetrics: passingMetric("ALL"),
    familyMetrics: [family],
    requiredStratumMetrics: [
      passingMetric("STRATUM:PRE_MOVE:LONG:RANGE:HIGH"),
    ],
    experimentConsistencyReasonCodes: [],
  });
  assert.deepEqual(result, { status: "PASS", reasonCodes: [] });

  const failed = evaluateM2ReplayThresholds({
    datasetAcceptance: {
      status: "ACCEPTED",
      lifecycleDecisionEligible: true,
      reasonCodes: [],
    },
    experiment,
    selectedFamilies: ["PRE_MOVE"],
    overallMetrics: passingMetric("ALL"),
    familyMetrics: [{
      ...family,
      eventRecall: proportion(60, 200, 0.24, 0.37),
      earlyCapturedEventCount: 60,
    }],
    requiredStratumMetrics: [
      passingMetric("STRATUM:PRE_MOVE:LONG:RANGE:HIGH"),
    ],
    experimentConsistencyReasonCodes: [],
  });
  assert.equal(failed.status, "FAIL");
  assert.ok(failed.reasonCodes.includes("event_recall_failed:PRE_MOVE"));

  const hiddenStratumFailure = evaluateM2ReplayThresholds({
    datasetAcceptance: {
      status: "ACCEPTED",
      lifecycleDecisionEligible: true,
      reasonCodes: [],
    },
    experiment,
    selectedFamilies: ["PRE_MOVE"],
    overallMetrics: passingMetric("ALL"),
    familyMetrics: [family],
    requiredStratumMetrics: [{
      ...passingMetric("STRATUM:PRE_MOVE:LONG:RANGE:HIGH"),
      eventRecall: proportion(6, 30, 0.1, 0.37),
      eventDenominatorCount: 30,
      earlyCapturedEventCount: 6,
      matchedNonEventDenominatorCount: 30,
      matchedNonEventActivationRate: proportion(2, 30, 0.02, 0.21),
      activatedMatchedNonEventCount: 2,
      unavailableEventRate: proportion(0, 30, 0, 0.11),
      leadTime: {
        sampleSize: 6,
        p25Seconds: 900,
        medianSeconds: 1_800,
        p75Seconds: 3_600,
        medianConfidenceLowerSeconds: 900,
        medianConfidenceUpperSeconds: 3_600,
      },
    }],
    experimentConsistencyReasonCodes: [],
  });
  assert.equal(hiddenStratumFailure.status, "FAIL");
  assert.ok(hiddenStratumFailure.reasonCodes.includes(
    "event_recall_failed:STRATUM:PRE_MOVE:LONG:RANGE:HIGH",
  ));
});

test("binds Gate reports to immutable content", () => {
  const dataset = syntheticDataset();
  const report = runM2HistoricalReplayGate({
    dataset,
    experiment: contractExperiment(dataset),
  });
  const tampered = { ...report, gateStatus: "PASS" as const };
  assert.equal(M2HistoricalReplayGateReportSchema.safeParse(tampered).success,
    false);
});
