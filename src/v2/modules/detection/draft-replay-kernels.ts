import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2_DRAFT_DETECTORS,
  M2_DRAFT_REPLAY_EVALUATION_VERSION,
  M2_DRAFT_REPLAY_RULE_SET,
  M2_DRAFT_REPLAY_RULE_SET_DIGEST,
  M2_DRAFT_REPLAY_RULE_SET_VERSION,
  M2DraftReplayEvaluationSchema,
  M2DraftReplayKernelInputSchema,
  buildM2DraftReplayInputDigest,
  type M2DraftDetectorDefinition,
  type M2DraftReplayEvaluation,
  type M2DraftReplayKernelInput,
} from "./draft-replay-contract";
import {
  M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS,
  buildM2DiagnosticStrengthComponent,
  buildM2NotRankableDiagnosticStrength,
  buildM2RankableDiagnosticStrength,
  type M2DraftDiagnosticStrengthComponent,
} from "./draft-diagnostic-strength-contract";

type Observation = M2DraftReplayKernelInput["observations"][number];
type Direction = "LONG" | "SHORT" | "UNKNOWN";

type PreparedInput = Readonly<{
  input: M2DraftReplayKernelInput;
  observationsByKey: ReadonlyMap<string, Observation>;
  inputDigest: string;
}>;

type ReadValue<T> = Readonly<{
  available: boolean;
  semanticKey: string;
  observation: Observation | null;
  value: T | null;
}>;

type DirectionProbe = Readonly<{
  direction: "LONG" | "SHORT";
  available: boolean;
  matched: boolean;
  usedKeys: readonly string[];
  missingKeys: readonly string[];
  strengthComponents: readonly M2DraftDiagnosticStrengthComponent[];
}>;

type KernelConclusion = Readonly<{
  status: M2DraftReplayEvaluation["evaluationStatus"];
  direction: Direction | null;
  usedKeys: readonly string[];
  missingKeys: readonly string[];
  reasonCodes: readonly string[];
  counterHints: readonly string[];
  strengthComponents: readonly M2DraftDiagnosticStrengthComponent[];
  rankingExclusionReason: "NO_MATCH" | "VETOED" | "DATA_UNAVAILABLE" | null;
}>;

const DECIMAL_VALUE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function prepareInput(rawInput: M2DraftReplayKernelInput): PreparedInput {
  const input = M2DraftReplayKernelInputSchema.parse(rawInput);
  const canonicalObservations = [...input.observations].sort((left, right) =>
    left.semanticKey.localeCompare(right.semanticKey));
  return {
    input,
    observationsByKey: new Map(
      canonicalObservations.map((observation) => [
        observation.semanticKey,
        observation,
      ]),
    ),
    inputDigest: buildM2DraftReplayInputDigest(input),
  };
}

function usable(observation: Observation | undefined): observation is Observation {
  return observation !== undefined &&
    observation.value !== null &&
    ["FRESH", "PARTIAL"].includes(observation.quality.status);
}

function readNumber(input: PreparedInput, semanticKey: string): ReadValue<number> {
  const observation = input.observationsByKey.get(semanticKey);
  if (!usable(observation)) {
    return { available: false, semanticKey, observation: observation ?? null, value: null };
  }
  if (typeof observation.value === "number") {
    return {
      available: Number.isFinite(observation.value),
      semanticKey,
      observation,
      value: Number.isFinite(observation.value) ? observation.value : null,
    };
  }
  if (
    typeof observation.value !== "string" ||
    !DECIMAL_VALUE.test(observation.value)
  ) {
    return { available: false, semanticKey, observation, value: null };
  }
  const value = Number(observation.value);
  return {
    available: Number.isFinite(value),
    semanticKey,
    observation,
    value: Number.isFinite(value) ? value : null,
  };
}

function readBoolean(input: PreparedInput, semanticKey: string): ReadValue<boolean> {
  const observation = input.observationsByKey.get(semanticKey);
  if (!usable(observation) || typeof observation.value !== "boolean") {
    return { available: false, semanticKey, observation: observation ?? null, value: null };
  }
  return { available: true, semanticKey, observation, value: observation.value };
}

type StrengthNormalizationId =
  (typeof M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS)[keyof typeof M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS];

function strengthNumberComponent(
  read: ReadValue<number>,
  normalizationId: StrengthNormalizationId,
  directionRole: "LONG" | "SHORT" | "SHARED",
): M2DraftDiagnosticStrengthComponent {
  if (!read.available || read.observation === null || read.value === null) {
    throw new Error("cannot score an unavailable numeric observation");
  }
  return buildM2DiagnosticStrengthComponent({
    normalizationId,
    observationId: read.observation.observationId,
    directionRole,
    observedValue: read.value,
  });
}

function strengthBooleanComponent(
  read: ReadValue<boolean>,
  normalizationId: StrengthNormalizationId,
  directionRole: "LONG" | "SHORT" | "SHARED",
): M2DraftDiagnosticStrengthComponent {
  if (!read.available || read.observation === null || read.value === null) {
    throw new Error("cannot score an unavailable boolean observation");
  }
  return buildM2DiagnosticStrengthComponent({
    normalizationId,
    observationId: read.observation.observationId,
    directionRole,
    observedValue: read.value ? 1 : 0,
  });
}

function uniqueStrengthComponents(
  components: readonly M2DraftDiagnosticStrengthComponent[],
): M2DraftDiagnosticStrengthComponent[] {
  const unique = new Map<string, M2DraftDiagnosticStrengthComponent>();
  for (const component of components) {
    const key =
      `${component.normalizationId}:${component.observationId}:${component.directionRole}`;
    unique.set(key, component);
  }
  return [...unique.values()];
}

function probeNumbers(
  direction: "LONG" | "SHORT",
  reads: readonly ReadValue<number>[],
  predicate: (values: readonly number[]) => boolean,
  strength: (reads: readonly ReadValue<number>[]) =>
    readonly M2DraftDiagnosticStrengthComponent[],
): DirectionProbe {
  const missingKeys = reads
    .filter((read) => !read.available)
    .map((read) => read.semanticKey);
  const available = missingKeys.length === 0;
  return {
    direction,
    available,
    matched: available && predicate(reads.map((read) => read.value ?? Number.NaN)),
    usedKeys: available ? reads.map((read) => read.semanticKey) : [],
    missingKeys,
    strengthComponents: available ? strength(reads) : [],
  };
}

function probeBooleanAndNumbers(
  direction: "LONG" | "SHORT",
  booleanRead: ReadValue<boolean>,
  numberReads: readonly ReadValue<number>[],
  predicate: (flag: boolean, values: readonly number[]) => boolean,
  strength: (
    booleanRead: ReadValue<boolean>,
    numberReads: readonly ReadValue<number>[],
  ) => readonly M2DraftDiagnosticStrengthComponent[],
): DirectionProbe {
  const reads = [booleanRead, ...numberReads];
  const missingKeys = reads
    .filter((read) => !read.available)
    .map((read) => read.semanticKey);
  const available = missingKeys.length === 0;
  return {
    direction,
    available,
    matched: available && predicate(
      booleanRead.value ?? false,
      numberReads.map((read) => read.value ?? Number.NaN),
    ),
    usedKeys: available ? reads.map((read) => read.semanticKey) : [],
    missingKeys,
    strengthComponents: available ? strength(booleanRead, numberReads) : [],
  };
}

function combineDirectionalProbes(input: {
  long: DirectionProbe;
  short: DirectionProbe;
  allowUnknown: boolean;
  longReason: string;
  shortReason: string;
  conflictReason: string;
  noMatchReason: string;
}): KernelConclusion {
  const matched = [input.long, input.short].filter((item) => item.matched);
  const missingKeys = uniqueSorted([
    ...input.long.missingKeys,
    ...input.short.missingKeys,
  ]);
  if (matched.length === 2) {
    return input.allowUnknown
      ? {
        status: "MATCHED_DRAFT_HYPOTHESIS",
        direction: "UNKNOWN",
        usedKeys: uniqueSorted([
          ...input.long.usedKeys,
          ...input.short.usedKeys,
        ]),
        missingKeys: [],
        reasonCodes: [input.conflictReason],
        counterHints: ["direction_confirmation_pending"],
        strengthComponents: uniqueStrengthComponents([
          ...input.long.strengthComponents,
          ...input.short.strengthComponents,
        ]),
        rankingExclusionReason: null,
      }
      : {
        status: "NO_MATCH",
        direction: null,
        usedKeys: uniqueSorted([
          ...input.long.usedKeys,
          ...input.short.usedKeys,
        ]),
        missingKeys: [],
        reasonCodes: ["conflicting_breakout_directions_blocked"],
        counterHints: ["direction_conflict"],
        strengthComponents: [],
        rankingExclusionReason: "NO_MATCH",
      };
  }
  if (matched.length === 1) {
    const selected = matched[0]!;
    return {
      status: "MATCHED_DRAFT_HYPOTHESIS",
      direction: selected.direction,
      usedKeys: selected.usedKeys,
      missingKeys,
      reasonCodes: [
        selected.direction === "LONG" ? input.longReason : input.shortReason,
      ],
      counterHints: missingKeys.length > 0
        ? ["opposite_direction_inputs_unavailable"]
        : [],
      strengthComponents: selected.strengthComponents,
      rankingExclusionReason: null,
    };
  }
  if (!input.long.available || !input.short.available) {
    return {
      status: "DATA_UNAVAILABLE",
      direction: null,
      usedKeys: uniqueSorted([
        ...input.long.usedKeys,
        ...input.short.usedKeys,
      ]),
      missingKeys,
      reasonCodes: ["required_detector_observation_unavailable"],
      counterHints: [],
      strengthComponents: [],
      rankingExclusionReason: "DATA_UNAVAILABLE",
    };
  }
  return {
    status: "NO_MATCH",
    direction: null,
    usedKeys: uniqueSorted([
      ...input.long.usedKeys,
      ...input.short.usedKeys,
    ]),
    missingKeys: [],
    reasonCodes: [input.noMatchReason],
    counterHints: [],
    strengthComponents: [],
    rankingExclusionReason: "NO_MATCH",
  };
}

function optionalPartialCounterHints(input: PreparedInput): string[] {
  return input.input.detectorInput.inputQuality.status === "PARTIAL"
    ? ["detector_input_partial"]
    : [];
}

function preMoveVeto(input: PreparedInput): KernelConclusion | null {
  const thresholds = M2_DRAFT_REPLAY_RULE_SET.preMove;
  const volumeSpike = readNumber(input, "volume_spike_multiple");
  const quotedDepth = readNumber(input, "quoted_depth_usdt");
  const venueCount = readNumber(input, "venue_confirmation_count");
  if (
    volumeSpike.available && quotedDepth.available && venueCount.available &&
    volumeSpike.value! >= thresholds.noiseVolumeSpikeMultipleMinimum &&
    quotedDepth.value! <= thresholds.noiseQuotedDepthUsdtMaximum &&
    venueCount.value! <= thresholds.noiseVenueConfirmationCountMaximum
  ) {
    return {
      status: "NO_MATCH",
      direction: null,
      usedKeys: [
        volumeSpike.semanticKey,
        quotedDepth.semanticKey,
        venueCount.semanticKey,
      ],
      missingKeys: [],
      reasonCodes: ["pre_move_thin_liquidity_noise_veto"],
      counterHints: ["single_source_anomaly", "thin_liquidity_distortion"],
      strengthComponents: [],
      rankingExclusionReason: "VETOED",
    };
  }
  const moveConsumed = readNumber(input, "move_consumed_ratio");
  if (
    moveConsumed.available &&
    moveConsumed.value! >= thresholds.lateMoveConsumedRatioMinimum
  ) {
    return {
      status: "NO_MATCH",
      direction: null,
      usedKeys: [moveConsumed.semanticKey],
      missingKeys: [],
      reasonCodes: ["pre_move_already_consumed_veto"],
      counterHints: ["move_already_consumed"],
      strengthComponents: [],
      rankingExclusionReason: "VETOED",
    };
  }
  return null;
}

function breakoutVeto(input: PreparedInput): KernelConclusion | null {
  const closedInside = readBoolean(input, "closed_back_inside_range");
  if (closedInside.available && closedInside.value === true) {
    const intrabar = readBoolean(input, "intrabar_breakout_seen");
    return {
      status: "NO_MATCH",
      direction: null,
      usedKeys: uniqueSorted([
        closedInside.semanticKey,
        ...(intrabar.available ? [intrabar.semanticKey] : []),
      ]),
      missingKeys: [],
      reasonCodes: ["breakout_structure_reentry_veto"],
      counterHints: ["fakeout_risk"],
      strengthComponents: [],
      rankingExclusionReason: "VETOED",
    };
  }
  const moveConsumed = readNumber(input, "move_consumed_ratio");
  if (
    moveConsumed.available &&
    moveConsumed.value! >=
      M2_DRAFT_REPLAY_RULE_SET.breakoutRetest.lateMoveConsumedRatioMinimum
  ) {
    return {
      status: "NO_MATCH",
      direction: null,
      usedKeys: [moveConsumed.semanticKey],
      missingKeys: [],
      reasonCodes: ["breakout_retest_already_consumed_veto"],
      counterHints: ["move_already_consumed"],
      strengthComponents: [],
      rankingExclusionReason: "VETOED",
    };
  }
  return null;
}

function finalizeEvaluation(
  prepared: PreparedInput,
  detector: M2DraftDetectorDefinition,
  conclusion: KernelConclusion,
): M2DraftReplayEvaluation {
  const usedObservationIds = uniqueSorted(conclusion.usedKeys.flatMap((key) => {
    const observation = prepared.observationsByKey.get(key);
    return observation === undefined ? [] : [observation.observationId];
  }));
  const counterHints = uniqueSorted([
    ...conclusion.counterHints,
    ...optionalPartialCounterHints(prepared),
  ]).filter((hint) => !conclusion.reasonCodes.includes(hint));
  const inputQualityStatus = prepared.input.detectorInput.inputQuality.status;
  if (inputQualityStatus !== "FRESH" && inputQualityStatus !== "PARTIAL") {
    throw new Error("draft diagnostic strength requires rankable input quality");
  }
  const diagnosticStrength = conclusion.status ===
      "MATCHED_DRAFT_HYPOTHESIS"
    ? buildM2RankableDiagnosticStrength({
      components: conclusion.strengthComponents,
      inputQualityStatus,
      direction: conclusion.direction ?? "UNKNOWN",
    })
    : buildM2NotRankableDiagnosticStrength(
      conclusion.rankingExclusionReason ??
        (conclusion.status === "DATA_UNAVAILABLE"
          ? "DATA_UNAVAILABLE"
          : "NO_MATCH"),
    );
  const content = {
    evaluationAuthority: "DRAFT_REPLAY_DIAGNOSTIC_ONLY",
    detectorId: detector.detectorId,
    detectorVersion: detector.detectorVersion,
    detectorLifecycle: "DRAFT",
    candidateEmissionAllowed: false,
    opportunityFamily: detector.opportunityFamily,
    evaluationStatus: conclusion.status,
    hypothesis: conclusion.direction === null
      ? null
      : {
        opportunityPattern: detector.opportunityPattern,
        directionHypothesis: conclusion.direction,
      },
    eventCutoff: prepared.input.detectorInput.eventCutoff,
    knowledgeCutoff: prepared.input.detectorInput.knowledgeCutoff,
    ruleSetVersion: M2_DRAFT_REPLAY_RULE_SET_VERSION,
    ruleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    inputDigest: prepared.inputDigest,
    usedObservationIds,
    missingSemanticKeys: uniqueSorted(conclusion.missingKeys),
    reasonCodes: uniqueSorted(conclusion.reasonCodes),
    counterHints,
    diagnosticStrength,
  } as const;
  const evaluationDigest = stableContentHash(content);
  return deepFreezeArtifact(M2DraftReplayEvaluationSchema.parse({
    schemaVersion: M2_DRAFT_REPLAY_EVALUATION_VERSION,
    ...content,
    evaluationDigest,
    evaluationId: `draft-replay-evaluation:${evaluationDigest.slice("sha256:".length)}`,
  }));
}

function runKernel(
  rawInput: M2DraftReplayKernelInput,
  detector: M2DraftDetectorDefinition,
  evaluate: (input: PreparedInput) => KernelConclusion,
  veto: (input: PreparedInput) => KernelConclusion | null,
): M2DraftReplayEvaluation {
  const input = prepareInput(rawInput);
  return finalizeEvaluation(input, detector, veto(input) ?? evaluate(input));
}

export function runPreMoveCompressionDraftReplay(
  rawInput: M2DraftReplayKernelInput,
): M2DraftReplayEvaluation {
  return runKernel(
    rawInput,
    M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION,
    (input) => {
      const thresholds = M2_DRAFT_REPLAY_RULE_SET.preMove;
      const compression = readNumber(input, "volatility_compression_percentile");
      const consumed = readNumber(input, "move_consumed_ratio");
      const long = probeNumbers("LONG", [
        compression,
        readNumber(input, "buy_volume_acceleration"),
        consumed,
      ], ([compressionValue, acceleration, consumedValue]) =>
        compressionValue <= thresholds.compressionPercentileMaximum &&
        acceleration >= thresholds.longBuyAccelerationMinimum &&
        consumedValue <= thresholds.earlyMoveConsumedRatioMaximum,
      ([compressionRead, accelerationRead, consumedRead]) => [
        strengthNumberComponent(
          compressionRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.VOLATILITY_COMPRESSION,
          "SHARED",
        ),
        strengthNumberComponent(
          accelerationRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.BUY_VOLUME_ACCELERATION,
          "LONG",
        ),
        strengthNumberComponent(
          consumedRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.MOVE_CONSUMED,
          "SHARED",
        ),
      ]);
      const short = probeNumbers("SHORT", [
        compression,
        readNumber(input, "sell_volume_acceleration"),
        consumed,
      ], ([compressionValue, acceleration, consumedValue]) =>
        compressionValue <= thresholds.compressionPercentileMaximum &&
        acceleration >= thresholds.shortSellAccelerationMinimum &&
        consumedValue <= thresholds.earlyMoveConsumedRatioMaximum,
      ([compressionRead, accelerationRead, consumedRead]) => [
        strengthNumberComponent(
          compressionRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.VOLATILITY_COMPRESSION,
          "SHARED",
        ),
        strengthNumberComponent(
          accelerationRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.SELL_VOLUME_ACCELERATION,
          "SHORT",
        ),
        strengthNumberComponent(
          consumedRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.MOVE_CONSUMED,
          "SHARED",
        ),
      ]);
      return combineDirectionalProbes({
        long,
        short,
        allowUnknown: true,
        longReason: "compression_with_early_buy_participation",
        shortReason: "compression_with_early_sell_participation",
        conflictReason: "compression_with_two_sided_acceleration",
        noMatchReason: "pre_move_compression_thresholds_not_met",
      });
    },
    preMoveVeto,
  );
}

export function runPreMoveFlowDivergenceDraftReplay(
  rawInput: M2DraftReplayKernelInput,
): M2DraftReplayEvaluation {
  return runKernel(
    rawInput,
    M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE,
    (input) => {
      const thresholds = M2_DRAFT_REPLAY_RULE_SET.preMove;
      const priceResponse = readNumber(input, "price_response_ratio");
      const consumed = readNumber(input, "move_consumed_ratio");
      const long = probeNumbers("LONG", [
        readNumber(input, "aggressive_buy_flow_ratio"),
        priceResponse,
        consumed,
      ], ([flow, response, consumedValue]) =>
        flow >= thresholds.directionalFlowRatioMinimum &&
        Math.abs(response) <= thresholds.flatPriceResponseAbsoluteMaximum &&
        consumedValue <= thresholds.earlyMoveConsumedRatioMaximum,
      ([flowRead, responseRead, consumedRead]) => [
        strengthNumberComponent(
          flowRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.AGGRESSIVE_BUY_FLOW,
          "LONG",
        ),
        strengthNumberComponent(
          responseRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.PRICE_RESPONSE_ABSOLUTE,
          "SHARED",
        ),
        strengthNumberComponent(
          consumedRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.MOVE_CONSUMED,
          "SHARED",
        ),
      ]);
      const short = probeNumbers("SHORT", [
        readNumber(input, "aggressive_sell_flow_ratio"),
        priceResponse,
        consumed,
      ], ([flow, response, consumedValue]) =>
        flow >= thresholds.directionalFlowRatioMinimum &&
        Math.abs(response) <= thresholds.flatPriceResponseAbsoluteMaximum &&
        consumedValue <= thresholds.earlyMoveConsumedRatioMaximum,
      ([flowRead, responseRead, consumedRead]) => [
        strengthNumberComponent(
          flowRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.AGGRESSIVE_SELL_FLOW,
          "SHORT",
        ),
        strengthNumberComponent(
          responseRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.PRICE_RESPONSE_ABSOLUTE,
          "SHARED",
        ),
        strengthNumberComponent(
          consumedRead!,
          M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.MOVE_CONSUMED,
          "SHARED",
        ),
      ]);
      return combineDirectionalProbes({
        long,
        short,
        allowUnknown: true,
        longReason: "buy_flow_leads_flat_price",
        shortReason: "sell_flow_leads_flat_price",
        conflictReason: "two_sided_flow_leads_flat_price",
        noMatchReason: "pre_move_flow_divergence_thresholds_not_met",
      });
    },
    preMoveVeto,
  );
}

export function runPreMoveLiquidityShiftDraftReplay(
  rawInput: M2DraftReplayKernelInput,
): M2DraftReplayEvaluation {
  return runKernel(
    rawInput,
    M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT,
    (input) => {
      const thresholds = M2_DRAFT_REPLAY_RULE_SET.preMove;
      const spread = readNumber(input, "spread_contraction_ratio");
      const depth = readNumber(input, "depth_expansion_ratio");
      const balance = readNumber(input, "directional_flow_balance");
      const missingKeys = [spread, depth, balance]
        .filter((read) => !read.available)
        .map((read) => read.semanticKey);
      if (missingKeys.length > 0) {
        return {
          status: "DATA_UNAVAILABLE",
          direction: null,
          usedKeys: [],
          missingKeys,
          reasonCodes: ["required_detector_observation_unavailable"],
          counterHints: [],
          strengthComponents: [],
          rankingExclusionReason: "DATA_UNAVAILABLE",
        };
      }
      const usedKeys = [spread.semanticKey, depth.semanticKey, balance.semanticKey];
      if (
        spread.value! > thresholds.spreadContractionRatioMaximum ||
        depth.value! < thresholds.depthExpansionRatioMinimum
      ) {
        return {
          status: "NO_MATCH",
          direction: null,
          usedKeys,
          missingKeys: [],
          reasonCodes: ["pre_move_liquidity_shift_thresholds_not_met"],
          counterHints: [],
          strengthComponents: [],
          rankingExclusionReason: "NO_MATCH",
        };
      }
      const direction: Direction = balance.value! >=
        thresholds.directionalBalanceLongMinimum
        ? "LONG"
        : balance.value! <= thresholds.directionalBalanceShortMaximum
          ? "SHORT"
          : "UNKNOWN";
      const balanceNormalization = direction === "LONG"
        ? M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DIRECTIONAL_BALANCE_LONG
        : direction === "SHORT"
          ? M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DIRECTIONAL_BALANCE_SHORT
          : M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DIRECTIONAL_BALANCE_CONTEXT;
      return {
        status: "MATCHED_DRAFT_HYPOTHESIS",
        direction,
        usedKeys,
        missingKeys: [],
        reasonCodes: [direction === "UNKNOWN"
          ? "liquidity_state_changed_before_direction_confirmation"
          : direction === "LONG"
            ? "liquidity_shift_with_buy_side_balance"
            : "liquidity_shift_with_sell_side_balance"],
        counterHints: direction === "UNKNOWN"
          ? ["direction_confirmation_pending"]
          : [],
        strengthComponents: [
          strengthNumberComponent(
            spread,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.SPREAD_CONTRACTION,
            "SHARED",
          ),
          strengthNumberComponent(
            depth,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DEPTH_EXPANSION,
            "SHARED",
          ),
          strengthNumberComponent(
            balance,
            balanceNormalization,
            direction === "UNKNOWN" ? "SHARED" : direction,
          ),
        ],
        rankingExclusionReason: null,
      };
    },
    preMoveVeto,
  );
}

export function runBreakoutEdgeDraftReplay(
  rawInput: M2DraftReplayKernelInput,
): M2DraftReplayEvaluation {
  return runKernel(
    rawInput,
    M2_DRAFT_DETECTORS.BREAKOUT_EDGE,
    (input) => {
      const thresholds = M2_DRAFT_REPLAY_RULE_SET.breakoutRetest;
      const long = probeBooleanAndNumbers(
        "LONG",
        readBoolean(input, "close_above_resistance"),
        [
        readNumber(input, "breakout_volume_multiple"),
        readNumber(input, "distance_above_level_bps"),
        ],
        (closedAbove, [participation, distance]) =>
        closedAbove === true &&
        participation! >= thresholds.breakoutParticipationMultipleMinimum &&
        distance! >= 0 && distance! <= thresholds.edgeDistanceBpsMaximum,
        (closedAboveRead, [participationRead, distanceRead]) => [
          strengthBooleanComponent(
            closedAboveRead,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.CLOSE_ABOVE_RESISTANCE,
            "LONG",
          ),
          strengthNumberComponent(
            participationRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.BREAKOUT_PARTICIPATION,
            "LONG",
          ),
          strengthNumberComponent(
            distanceRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DISTANCE_ABOVE_LEVEL,
            "LONG",
          ),
        ],
      );
      const short = probeBooleanAndNumbers(
        "SHORT",
        readBoolean(input, "close_below_support"),
        [
        readNumber(input, "breakdown_volume_multiple"),
        readNumber(input, "distance_below_level_bps"),
        ],
        (closedBelow, [participation, distance]) =>
        closedBelow === true &&
        participation! >= thresholds.breakdownParticipationMultipleMinimum &&
        distance! >= 0 && distance! <= thresholds.edgeDistanceBpsMaximum,
        (closedBelowRead, [participationRead, distanceRead]) => [
          strengthBooleanComponent(
            closedBelowRead,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.CLOSE_BELOW_SUPPORT,
            "SHORT",
          ),
          strengthNumberComponent(
            participationRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.BREAKDOWN_PARTICIPATION,
            "SHORT",
          ),
          strengthNumberComponent(
            distanceRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.DISTANCE_BELOW_LEVEL,
            "SHORT",
          ),
        ],
      );
      return combineDirectionalProbes({
        long,
        short,
        allowUnknown: false,
        longReason: "resistance_break_with_participation",
        shortReason: "support_break_with_participation",
        conflictReason: "unused_breakout_direction_conflict",
        noMatchReason: "breakout_edge_thresholds_not_met",
      });
    },
    breakoutVeto,
  );
}

export function runRoleFlipRetestDraftReplay(
  rawInput: M2DraftReplayKernelInput,
): M2DraftReplayEvaluation {
  return runKernel(
    rawInput,
    M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST,
    (input) => {
      const thresholds = M2_DRAFT_REPLAY_RULE_SET.breakoutRetest;
      const rejection = readNumber(input, "retest_rejection_strength");
      const long = probeBooleanAndNumbers(
        "LONG",
        readBoolean(input, "close_above_resistance"),
        [
        rejection,
        readNumber(input, "buy_participation_multiple"),
        ],
        (closedAbove, [rejectionValue, participation]) =>
        closedAbove === true &&
        rejectionValue! >= thresholds.retestRejectionStrengthMinimum &&
        participation! >= thresholds.retestParticipationMultipleMinimum,
        (closedAboveRead, [rejectionRead, participationRead]) => [
          strengthBooleanComponent(
            closedAboveRead,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.CLOSE_ABOVE_RESISTANCE,
            "LONG",
          ),
          strengthNumberComponent(
            rejectionRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.RETEST_REJECTION,
            "LONG",
          ),
          strengthNumberComponent(
            participationRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.BUY_PARTICIPATION,
            "LONG",
          ),
        ],
      );
      const short = probeBooleanAndNumbers(
        "SHORT",
        readBoolean(input, "close_below_support"),
        [
        rejection,
        readNumber(input, "sell_participation_multiple"),
        ],
        (closedBelow, [rejectionValue, participation]) =>
        closedBelow === true &&
        rejectionValue! >= thresholds.retestRejectionStrengthMinimum &&
        participation! >= thresholds.retestParticipationMultipleMinimum,
        (closedBelowRead, [rejectionRead, participationRead]) => [
          strengthBooleanComponent(
            closedBelowRead,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.CLOSE_BELOW_SUPPORT,
            "SHORT",
          ),
          strengthNumberComponent(
            rejectionRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.RETEST_REJECTION,
            "SHORT",
          ),
          strengthNumberComponent(
            participationRead!,
            M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS.SELL_PARTICIPATION,
            "SHORT",
          ),
        ],
      );
      return combineDirectionalProbes({
        long,
        short,
        allowUnknown: false,
        longReason: "reclaimed_resistance_held_as_support",
        shortReason: "lost_support_rejected_as_resistance",
        conflictReason: "unused_retest_direction_conflict",
        noMatchReason: "role_flip_retest_thresholds_not_met",
      });
    },
    breakoutVeto,
  );
}

export function runPreMoveDraftReplayFamily(
  input: M2DraftReplayKernelInput,
): readonly M2DraftReplayEvaluation[] {
  return deepFreezeArtifact([
    runPreMoveCompressionDraftReplay(input),
    runPreMoveFlowDivergenceDraftReplay(input),
    runPreMoveLiquidityShiftDraftReplay(input),
  ]);
}

export function runBreakoutRetestDraftReplayFamily(
  input: M2DraftReplayKernelInput,
): readonly M2DraftReplayEvaluation[] {
  return deepFreezeArtifact([
    runBreakoutEdgeDraftReplay(input),
    runRoleFlipRetestDraftReplay(input),
  ]);
}
