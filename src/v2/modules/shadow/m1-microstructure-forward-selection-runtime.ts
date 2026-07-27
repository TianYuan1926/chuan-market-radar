import {
  M1MultiAssetBaseFactSnapshotSchema,
  type M1MultiAssetBaseFact,
  type M1MultiAssetBaseFactSnapshot,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1AssetDomain,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  M2_PRECURSOR_DIRECTIONS,
  M2_PRECURSOR_FAMILIES,
} from "../../research/m2-precursor-atlas-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  buildM1ExpandedShadowProviderPlan,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderSubject,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  buildM1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardSelectionPlanInput,
} from "./m1-microstructure-forward-shadow-contract";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

export const M1_MICROSTRUCTURE_FORWARD_SELECTION_RUNTIME_VERSION =
  "v2-m1-microstructure-forward-selection-runtime.v1" as const;
export const M1_MICROSTRUCTURE_FORWARD_SELECTION_FEATURE_VERSION =
  "v2-m1-microstructure-forward-selection-feature.v1" as const;

const ELIGIBLE_DOMAINS = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const satisfies readonly M1AssetDomain[];

const ELIGIBLE_LIFECYCLES = [
  "TRADING_WARMUP",
  "ESTABLISHED",
] as const;

const DOMAIN_ROTATION = [
  "CRYPTO_LINEAR_PERPETUAL",
  "CRYPTO_LINEAR_PERPETUAL",
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const satisfies readonly (typeof ELIGIBLE_DOMAINS)[number][];

const ESTABLISHED_HYPOTHESIS_FAMILIES = M2_PRECURSOR_FAMILIES.filter(
  (family) => family !== "EVENT_LISTING_TRANSITION",
);
const RESEARCH_DIRECTIONS = M2_PRECURSOR_DIRECTIONS.filter(
  (direction) => direction !== "UNKNOWN",
);

type EligibleDomain = (typeof ELIGIBLE_DOMAINS)[number];
type EligibleLifecycle = (typeof ELIGIBLE_LIFECYCLES)[number];
type SelectionSubject =
  M1MicrostructureForwardSelectionPlanInput["pairs"][number]["trigger"];

type JoinedSubject = Readonly<{
  identity: M1MultiAssetInstrumentObservation;
  fact: M1MultiAssetBaseFact;
  assetDomain: EligibleDomain;
  lifecycleState: EligibleLifecycle;
}>;

export type M1MicrostructureForwardSelectionRuntimeResult = Readonly<{
  schemaVersion: typeof M1_MICROSTRUCTURE_FORWARD_SELECTION_RUNTIME_VERSION;
  scopeEpoch: typeof M1_SCOPE_EPOCH;
  releaseId: string;
  generatedAt: string;
  identitySnapshotId: string;
  identitySnapshotHash: string;
  baseFactSnapshotId: string;
  baseFactSnapshotHash: string;
  deterministicSeedHash: string;
  selectionPlan: M1MicrostructureForwardSelectionPlan;
  providerPlan: M1ExpandedShadowProviderPlan;
  selectedSubjectCount: number;
  providerSubjectCount: number;
  regimeClassificationAuthority: false;
  liquiditySegmentationAuthority: false;
  outcomeFieldsRead: false;
  candidateStoreRead: false;
  candidateAuthorityGranted: false;
  strategyAuthorityGranted: false;
  readyAuthorityGranted: false;
  productionChanged: false;
  contentHash: string;
}>;

function pointInTimeMs(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an ISO date-time`);
  }
  return parsed;
}

function joinKey(input: {
  readonly sourceId: M1SourceId;
  readonly venueInstrumentId: string;
  readonly listingEpoch: string;
}): string {
  return [
    input.sourceId,
    input.venueInstrumentId,
    input.listingEpoch,
  ].join(":");
}

function hashIndex(hash: string, denominator: number): number {
  if (denominator < 1) {
    throw new Error("hash denominator must be positive");
  }
  return Number(
    BigInt(`0x${hash.slice(7, 23)}`) % BigInt(denominator),
  );
}

function assertPointInTimeInputs(input: {
  readonly upstream: M1MultiAssetShadowUpstreamBinding;
  readonly identity: M1MultiAssetIdentitySnapshot;
  readonly baseFact: M1MultiAssetBaseFactSnapshot;
  readonly generatedAt: string;
  readonly selectionCutoff: string;
  readonly windowStartsAt: string;
  readonly windowEndsAt: string;
}): void {
  const generatedAt = pointInTimeMs(input.generatedAt, "generatedAt");
  const selectionCutoff = pointInTimeMs(
    input.selectionCutoff,
    "selectionCutoff",
  );
  const windowStartsAt = pointInTimeMs(
    input.windowStartsAt,
    "windowStartsAt",
  );
  const windowEndsAt = pointInTimeMs(input.windowEndsAt, "windowEndsAt");
  if (
    generatedAt > selectionCutoff ||
    selectionCutoff > windowStartsAt ||
    windowStartsAt >= windowEndsAt
  ) {
    throw new Error("selection window chronology is invalid");
  }
  if (
    [
      input.upstream.generatedAt,
      input.upstream.sourceCutoff,
      input.identity.generatedAt,
      input.identity.sourceCutoff,
      input.baseFact.generatedAt,
      input.baseFact.sourceCutoff,
      input.baseFact.normalizedAt,
    ].some((value) => pointInTimeMs(value, "upstream snapshot time") > generatedAt)
  ) {
    throw new Error("selection cannot read a snapshot created after selection");
  }
  if (
    input.identity.releaseId !== input.upstream.releaseId ||
    input.baseFact.releaseId !== input.upstream.releaseId ||
    input.identity.upstreamBindingId !== input.upstream.upstreamBindingId ||
    input.identity.upstreamBindingHash !== input.upstream.contentHash ||
    input.baseFact.upstreamBindingId !== input.upstream.upstreamBindingId ||
    input.baseFact.upstreamBindingHash !== input.upstream.contentHash ||
    input.identity.registryDigest !== input.upstream.registryDigest ||
    input.baseFact.registryDigest !== input.upstream.registryDigest ||
    input.baseFact.identitySnapshotId !== input.identity.snapshotId ||
    input.baseFact.identitySnapshotHash !== input.identity.contentHash ||
    input.baseFact.catalogCaptureBindingId !==
      input.identity.catalogCaptureBindingId ||
    input.baseFact.catalogCaptureBindingHash !==
      input.identity.catalogCaptureBindingHash ||
    input.identity.evidenceClass !== input.upstream.evidenceClass ||
    input.baseFact.evidenceClass !== input.upstream.evidenceClass ||
    input.identity.networkEnvironment !== input.upstream.networkEnvironment ||
    input.baseFact.networkEnvironment !== input.upstream.networkEnvironment
  ) {
    throw new Error("selection input identity or exact upstream binding drifted");
  }
}

function assertFactLineageBeforeCutoff(
  fact: M1MultiAssetBaseFact,
  selectionCutoffMs: number,
): void {
  for (const field of Object.values(fact.fields)) {
    if (
      (field.eventTime !== null &&
        pointInTimeMs(field.eventTime, "field eventTime") >
          selectionCutoffMs) ||
      (field.receivedAt !== null &&
        pointInTimeMs(field.receivedAt, "field receivedAt") >
          selectionCutoffMs)
    ) {
      throw new Error("selection fact contains post-cutoff market knowledge");
    }
  }
}

function eligibleJoinedSubjects(input: {
  readonly identity: M1MultiAssetIdentitySnapshot;
  readonly baseFact: M1MultiAssetBaseFactSnapshot;
  readonly selectionCutoff: string;
}): readonly JoinedSubject[] {
  const selectionCutoffMs = pointInTimeMs(
    input.selectionCutoff,
    "selectionCutoff",
  );
  const identities = new Map(
    input.identity.observations.map((observation) => [
      joinKey(observation),
      observation,
    ]),
  );
  if (identities.size !== input.identity.observations.length) {
    throw new Error("identity snapshot contains duplicate selection subjects");
  }
  const joined: JoinedSubject[] = [];
  for (const fact of input.baseFact.facts) {
    const identity = identities.get(joinKey(fact));
    if (identity === undefined) {
      throw new Error("base Fact subject is missing from identity snapshot");
    }
    if (
      fact.canonicalInstrumentId !== identity.canonicalInstrumentId ||
      fact.identityEpoch !== identity.identityEpoch ||
      fact.assetDomain !== identity.assetDomain ||
      fact.lifecycleState !== identity.lifecycleState
    ) {
      throw new Error("base Fact and identity subject semantics drifted");
    }
    assertFactLineageBeforeCutoff(fact, selectionCutoffMs);
    if (
      fact.routeDisposition !== "ELIGIBLE_T1_WIDE_MARKET" ||
      fact.qualityStatus !== "FRESH" ||
      fact.canonicalInstrumentId === null ||
      identity.identityStatus !== "EXACT" ||
      identity.canonicalInstrumentId === null ||
      identity.providerTransportSymbol === null ||
      !ELIGIBLE_DOMAINS.includes(
        identity.assetDomain as EligibleDomain,
      ) ||
      !ELIGIBLE_LIFECYCLES.includes(
        identity.lifecycleState as EligibleLifecycle,
      ) ||
      pointInTimeMs(identity.knowledgeTime, "identity knowledgeTime") >
        selectionCutoffMs
    ) {
      continue;
    }
    if (
      identity.sourceId === "OKX_SWAP" &&
      (
        identity.providerRoutingAuthority !==
          "PROVIDER_CATALOG_EXPLICIT" ||
        identity.providerReferenceInstrumentId === null ||
        identity.providerInstrumentFamily === null
      )
    ) {
      continue;
    }
    if (
      identity.sourceId !== "OKX_SWAP" &&
      identity.providerRoutingAuthority !== "VENUE_INSTRUMENT_ID_EXACT"
    ) {
      continue;
    }
    joined.push({
      identity,
      fact,
      assetDomain: identity.assetDomain as EligibleDomain,
      lifecycleState: identity.lifecycleState as EligibleLifecycle,
    });
  }
  return joined;
}

function groupKey(subject: JoinedSubject): string {
  return [
    subject.identity.sourceId,
    subject.assetDomain,
    subject.lifecycleState,
    "UNKNOWN",
    "UNKNOWN",
  ].join(":");
}

function orderedGroupsForVenue(input: {
  readonly venue: M1SourceId;
  readonly subjects: readonly JoinedSubject[];
  readonly rotationOrdinal: number;
}): readonly (readonly JoinedSubject[])[] {
  const groups = new Map<string, JoinedSubject[]>();
  for (const subject of input.subjects) {
    if (subject.identity.sourceId !== input.venue) {
      continue;
    }
    const key = groupKey(subject);
    groups.set(key, [...(groups.get(key) ?? []), subject]);
  }
  const complete = [...groups.values()].filter((group) => group.length >= 2);
  const preferredDomain =
    DOMAIN_ROTATION[input.rotationOrdinal % DOMAIN_ROTATION.length]!;
  const domainRank = (domain: EligibleDomain): number => {
    if (domain === preferredDomain) {
      return 0;
    }
    if (domain === "CRYPTO_LINEAR_PERPETUAL") {
      return 1;
    }
    return 2 + ELIGIBLE_DOMAINS.indexOf(domain);
  };
  return complete.sort((left, right) =>
    domainRank(left[0]!.assetDomain) - domainRank(right[0]!.assetDomain) ||
    left[0]!.lifecycleState.localeCompare(right[0]!.lifecycleState) ||
    groupKey(left[0]!).localeCompare(groupKey(right[0]!))
  );
}

function selectionFeature(input: {
  readonly identity: M1MultiAssetInstrumentObservation;
  readonly fact: M1MultiAssetBaseFact;
  readonly selectionCutoff: string;
}): Readonly<{ id: string; hash: string }> {
  const core = {
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_SELECTION_FEATURE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceId: input.identity.sourceId,
    canonicalInstrumentId: input.identity.canonicalInstrumentId,
    listingEpoch: input.identity.listingEpoch,
    identityEpoch: input.identity.identityEpoch,
    identityKnowledgeTime: input.identity.knowledgeTime,
    providerRoutingAuthority: input.identity.providerRoutingAuthority,
    baseFactId: input.fact.factId,
    baseFactHash: input.fact.contentHash,
    baseFactSourceCutoff: input.fact.sourceCutoff,
    selectionCutoff: input.selectionCutoff,
    regime: "UNKNOWN",
    liquiditySegment: "UNKNOWN",
    regimeClassificationAuthority: false,
    liquiditySegmentationAuthority: false,
    outcomeFieldsRead: false,
    candidateStoreRead: false,
  } as const;
  const hash = stableContentHash(core);
  return {
    id: `m1-micro-selection-feature:${hash.slice(7, 31)}`,
    hash,
  };
}

function selectionSubject(
  subject: JoinedSubject,
  selectedAt: string,
  selectionCutoff: string,
): SelectionSubject {
  const feature = selectionFeature({
    identity: subject.identity,
    fact: subject.fact,
    selectionCutoff,
  });
  return {
    subjectId: subject.identity.canonicalInstrumentId!,
    venue: subject.identity.sourceId,
    assetDomain: subject.assetDomain,
    lifecycleState: subject.lifecycleState,
    canonicalInstrumentId: subject.identity.canonicalInstrumentId!,
    venueInstrumentId: subject.identity.venueInstrumentId,
    listingEpoch: subject.identity.listingEpoch,
    identityEpoch: subject.identity.identityEpoch,
    regime: "UNKNOWN",
    liquiditySegment: "UNKNOWN",
    featureSnapshotId: feature.id,
    featureSnapshotHash: feature.hash,
    selectedAt,
  };
}

function providerSubject(
  subject: JoinedSubject,
): M1ShadowProviderSubject {
  return {
    subjectId: subject.identity.canonicalInstrumentId!,
    venue: subject.identity.sourceId,
    venueInstrumentId: subject.identity.venueInstrumentId,
    transportSymbol: subject.identity.providerTransportSymbol!,
    referenceInstrumentId:
      subject.identity.sourceId === "OKX_SWAP"
        ? subject.identity.providerReferenceInstrumentId
        : null,
    instrumentFamily:
      subject.identity.sourceId === "OKX_SWAP"
        ? subject.identity.providerInstrumentFamily
        : null,
    sizeUnit: subject.identity.sourceId === "OKX_SWAP"
      ? "CONTRACT"
      : "BASE_ASSET",
  };
}

function pairAssignment(input: {
  readonly deterministicSeedHash: string;
  readonly venue: M1SourceId;
  readonly rotationOrdinal: number;
  readonly trigger: JoinedSubject;
  readonly control: JoinedSubject;
}) {
  const assignmentHash = stableContentHash({
    deterministicSeedHash: input.deterministicSeedHash,
    venue: input.venue,
    rotationOrdinal: input.rotationOrdinal,
    triggerFactHash: input.trigger.fact.contentHash,
    controlFactHash: input.control.fact.contentHash,
    researchAssignmentOnly: true,
  });
  const families = input.trigger.lifecycleState === "TRADING_WARMUP"
    ? ["EVENT_LISTING_TRANSITION"] as const
    : ESTABLISHED_HYPOTHESIS_FAMILIES;
  return {
    assignmentHash,
    family: families[hashIndex(assignmentHash, families.length)]!,
    direction:
      RESEARCH_DIRECTIONS[
        hashIndex(stableContentHash({ assignmentHash, axis: "direction" }), 2)
      ]!,
  };
}

export function buildM1MicrostructureForwardRuntimeSelection(input: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly identitySnapshot: M1MultiAssetIdentitySnapshot;
  readonly baseFactSnapshot: M1MultiAssetBaseFactSnapshot;
  readonly generatedAt: string;
  readonly selectionCutoff: string;
  readonly windowStartsAt: string;
  readonly windowEndsAt: string;
  readonly rotationOrdinal: number;
}): M1MicrostructureForwardSelectionRuntimeResult {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const identity = M1MultiAssetIdentitySnapshotSchema.parse(
    input.identitySnapshot,
  );
  const baseFact = M1MultiAssetBaseFactSnapshotSchema.parse(
    input.baseFactSnapshot,
  );
  if (!Number.isSafeInteger(input.rotationOrdinal) || input.rotationOrdinal < 0) {
    throw new Error("rotationOrdinal must be a non-negative safe integer");
  }
  assertPointInTimeInputs({
    upstream,
    identity,
    baseFact,
    generatedAt: input.generatedAt,
    selectionCutoff: input.selectionCutoff,
    windowStartsAt: input.windowStartsAt,
    windowEndsAt: input.windowEndsAt,
  });
  const eligible = eligibleJoinedSubjects({
    identity,
    baseFact,
    selectionCutoff: input.selectionCutoff,
  });
  const deterministicSeedHash = stableContentHash({
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_SELECTION_RUNTIME_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    upstreamBindingHash: upstream.contentHash,
    identitySnapshotHash: identity.contentHash,
    baseFactSnapshotHash: baseFact.contentHash,
    selectionCutoff: input.selectionCutoff,
    rotationOrdinal: input.rotationOrdinal,
    algorithm:
      "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
  });

  const selectedPairs: M1MicrostructureForwardSelectionPlanInput["pairs"] = [];
  const selectedJoined: JoinedSubject[] = [];
  for (const venue of M1_VENUE_SOURCE_IDS) {
    const group = orderedGroupsForVenue({
      venue,
      subjects: eligible,
      rotationOrdinal: input.rotationOrdinal,
    })[0];
    if (group === undefined) {
      throw new Error(
        `selection requires two fresh exact same-stratum subjects for ${venue}`,
      );
    }
    const ranked = [...group].sort((left, right) =>
      stableContentHash({
        deterministicSeedHash,
        rotationOrdinal: input.rotationOrdinal,
        venue,
        factHash: left.fact.contentHash,
      }).localeCompare(stableContentHash({
        deterministicSeedHash,
        rotationOrdinal: input.rotationOrdinal,
        venue,
        factHash: right.fact.contentHash,
      }))
    );
    const first = ranked[0]!;
    const second = ranked[1]!;
    const roleHash = stableContentHash({
      deterministicSeedHash,
      venue,
      first: first.fact.contentHash,
      second: second.fact.contentHash,
      axis: "research-role",
    });
    const trigger = hashIndex(roleHash, 2) === 0 ? first : second;
    const control = trigger === first ? second : first;
    const assignment = pairAssignment({
      deterministicSeedHash,
      venue,
      rotationOrdinal: input.rotationOrdinal,
      trigger,
      control,
    });
    const triggerSubject = selectionSubject(
      trigger,
      input.generatedAt,
      input.selectionCutoff,
    );
    const controlSubject = selectionSubject(
      control,
      input.generatedAt,
      input.selectionCutoff,
    );
    selectedPairs.push({
      pairId:
        `m1-micro-pair:${venue}:${
          assignment.assignmentHash.slice(7, 31)
        }`,
      hypothesisFamily: assignment.family,
      hypothesisDirection: assignment.direction,
      trigger: triggerSubject,
      matchedControl: controlSubject,
      matchingPolicy:
        "SAME_VENUE_DOMAIN_LIFECYCLE_REGIME_LIQUIDITY_POINT_IN_TIME",
      outcomeKnownAtSelection: false,
      candidateEpisodeUsedForSelection: false,
    });
    selectedJoined.push(trigger, control);
  }

  const selectionPlan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: upstream,
    plan: {
      releaseId: upstream.releaseId,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      generatedAt: input.generatedAt,
      selectionCutoff: input.selectionCutoff,
      windowStartsAt: input.windowStartsAt,
      windowEndsAt: input.windowEndsAt,
      universeSnapshotId: baseFact.snapshotId,
      universeSnapshotHash: baseFact.contentHash,
      rotationOrdinal: input.rotationOrdinal,
      deterministicSeedHash,
      selectionAlgorithm:
        "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
      pairs: selectedPairs,
      outcomeFieldsRead: false,
      futureDataRead: false,
      candidateStoreRead: false,
      automaticSelectionWeightMutationAllowed: false,
      candidateAuthorityGranted: false,
      strategyAuthorityGranted: false,
      readyAuthorityGranted: false,
    },
  });
  const providerSubjects = selectedJoined
    .map(providerSubject)
    .sort((left, right) =>
      left.venue.localeCompare(right.venue) ||
      left.subjectId.localeCompare(right.subjectId)
    );
  const providerPlan = buildM1ExpandedShadowProviderPlan({
    releaseId: upstream.releaseId,
    generatedAt: input.generatedAt,
    subjects: providerSubjects,
  });
  const core = {
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_SELECTION_RUNTIME_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    generatedAt: input.generatedAt,
    identitySnapshotId: identity.snapshotId,
    identitySnapshotHash: identity.contentHash,
    baseFactSnapshotId: baseFact.snapshotId,
    baseFactSnapshotHash: baseFact.contentHash,
    deterministicSeedHash,
    selectionPlan,
    providerPlan,
    selectedSubjectCount: selectedJoined.length,
    providerSubjectCount: providerSubjects.length,
    regimeClassificationAuthority: false as const,
    liquiditySegmentationAuthority: false as const,
    outcomeFieldsRead: false as const,
    candidateStoreRead: false as const,
    candidateAuthorityGranted: false as const,
    strategyAuthorityGranted: false as const,
    readyAuthorityGranted: false as const,
    productionChanged: false as const,
  };
  return deepFreezeArtifact({
    ...core,
    contentHash: stableContentHash(core),
  });
}
