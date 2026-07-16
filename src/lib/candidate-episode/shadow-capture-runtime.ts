import type { MarketRadarSnapshot } from "../market/types";
import { CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED } from "./feature-flags";
import {
  validateShadowCandidateObservation,
  type ShadowCandidateObservationV1,
} from "./shadow-capture-source";

export type ShadowCaptureRuntimeBlocker =
  | "kill_switch_off"
  | "release_not_authorized_in_code"
  | "database_repository_required"
  | "production_scope_required"
  | "migration_control_missing"
  | "migration_phase_inactive"
  | "migration_epoch_invalid"
  | "migration_deadline_expired"
  | "migration_write_frozen"
  | "release_mismatch";

export type ShadowCaptureControlSnapshot = Readonly<{
  phase: string;
  epoch: number;
  deadlineAt: string;
  writeFrozen: boolean;
  approvedReleaseId: string;
}>;

export type ShadowCaptureRuntimeGateInput = Readonly<{
  killSwitchRequested: boolean;
  codeActivationAllowed: boolean;
  repositoryMode: "database" | "memory";
  scope: string;
  expectedReleaseId: string;
  now: string;
  control: ShadowCaptureControlSnapshot | null;
}>;

export type ShadowCandidateMappingRejection = Readonly<{
  sourceId: string;
  symbol: string;
  reason: "instrument_identity_unresolved" | "venue_unsupported";
}>;

const supportedVenues = new Set(["BINANCE", "OKX", "BYBIT"] as const);

function parsedTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateShadowCaptureRuntimeGate(input: ShadowCaptureRuntimeGateInput) {
  const blockers: ShadowCaptureRuntimeBlocker[] = [];
  if (!input.killSwitchRequested) blockers.push("kill_switch_off");
  if (!input.codeActivationAllowed) blockers.push("release_not_authorized_in_code");
  if (input.repositoryMode !== "database") blockers.push("database_repository_required");
  if (input.scope !== "production_radar") blockers.push("production_scope_required");
  if (!input.control) {
    blockers.push("migration_control_missing");
  } else {
    if (!["shadow_capture", "shadow_verify", "canonical_compat"].includes(input.control.phase)) {
      blockers.push("migration_phase_inactive");
    }
    if (!Number.isSafeInteger(input.control.epoch) || input.control.epoch < 1) {
      blockers.push("migration_epoch_invalid");
    }
    const now = parsedTime(input.now);
    const deadline = parsedTime(input.control.deadlineAt);
    if (now === null || deadline === null || now > deadline) {
      blockers.push("migration_deadline_expired");
    }
    if (input.control.writeFrozen) blockers.push("migration_write_frozen");
    if (input.control.approvedReleaseId !== input.expectedReleaseId) {
      blockers.push("release_mismatch");
    }
  }
  return {
    enabled: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
  } as const;
}

export function evaluateCurrentShadowCaptureRuntimeGate(
  input: Omit<ShadowCaptureRuntimeGateInput, "codeActivationAllowed">,
) {
  return evaluateShadowCaptureRuntimeGate({
    ...input,
    codeActivationAllowed: CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED,
  });
}

function priorityTier(score: number) {
  if (score >= 80) return "A" as const;
  if (score >= 60) return "B" as const;
  return "C" as const;
}

function priceFact(
  snapshot: MarketRadarSnapshot,
  symbol: string,
  exchange: string,
) {
  const ticker = snapshot.tickers.find((item) => (
    item.symbol === symbol && item.exchange === exchange && item.price > 0
  ));
  return ticker
    ? {
        observationPrice: String(ticker.price),
        observationPriceFactId: `ticker:${exchange}:${symbol}:${ticker.updatedAt}`,
      }
    : { observationPrice: null, observationPriceFactId: null };
}

export function buildShadowCandidateObservations(
  snapshot: MarketRadarSnapshot,
  releaseId: string,
) {
  if (!releaseId.trim()) throw new Error("shadow_release_id_required");
  const observations = new Map<string, ShadowCandidateObservationV1>();
  const rejections: ShadowCandidateMappingRejection[] = [];
  const activePerpetualsByIdentity = new Map<string, MarketRadarSnapshot["instruments"][number]>();
  for (const item of [
    ...(snapshot.instrumentUniverse ?? []),
    ...snapshot.instruments,
  ]) {
    if (!item.isActive || item.marketType !== "perpetual") continue;
    const identity = `${item.exchange}:${item.symbol}`;
    if (!activePerpetualsByIdentity.has(identity)) {
      activePerpetualsByIdentity.set(identity, item);
    }
  }
  const activePerpetuals = [...activePerpetualsByIdentity.values()];

  const addObservation = ({
    sourceId,
    symbol,
    exchange,
    maturity,
    score,
    reasons,
  }: {
    sourceId: string;
    symbol: string;
    exchange?: string;
    maturity: "light_candidate" | "deep_candidate";
    score: number;
    reasons: string[];
  }) => {
    const exact = activePerpetuals.filter((instrument) => (
      instrument.symbol === symbol && (!exchange || instrument.exchange === exchange)
    ));
    const supported = exact.filter((instrument) => (
      supportedVenues.has(instrument.exchange as "BINANCE" | "OKX" | "BYBIT")
    ));
    if (supported.length === 0) {
      rejections.push({
        sourceId,
        symbol,
        reason: exact.length > 0 ? "venue_unsupported" : "instrument_identity_unresolved",
      });
      return;
    }
    for (const instrument of supported) {
      const price = priceFact(snapshot, instrument.symbol, instrument.exchange);
      const observation: ShadowCandidateObservationV1 = {
        schemaVersion: "shadow-candidate-observation.v1",
        canonicalInstrumentId: instrument.id,
        venueContext: {
          schemaVersion: "shadow-venue-context.v1",
          venue: instrument.exchange as "BINANCE" | "OKX" | "BYBIT",
          venueInstrumentId: instrument.symbol,
          contractType: "perpetual",
          settlementAsset: instrument.quoteAsset,
          resolutionStatus: "resolved",
          identityEvidenceIds: [
            `instrument:${instrument.id}`,
            `scan:${snapshot.metadata.id}`,
          ],
        },
        firstSeenAt: snapshot.metadata.generatedAt,
        lastSeenAt: snapshot.metadata.generatedAt,
        ...price,
        discoveryReasons: reasons,
        priorityTier: priorityTier(score),
        maturity,
        directionState: "unknown",
        expiresAt: null,
        releaseId,
        sourceScanCycleId: snapshot.metadata.id,
      };
      validateShadowCandidateObservation(observation);
      const existing = observations.get(instrument.id);
      if (!existing || existing.maturity === "light_candidate") {
        observations.set(instrument.id, observation);
      }
    }
  };

  for (const candidate of snapshot.metadata.lightScan?.topCandidates ?? []) {
    addObservation({
      sourceId: `light:${candidate.symbol}`,
      symbol: candidate.symbol,
      maturity: "light_candidate",
      score: candidate.score,
      reasons: ["light_scan_candidate"],
    });
  }
  for (const signal of snapshot.signals) {
    if (signal.maturity?.stage !== "DEEP_SCAN_CANDIDATE") continue;
    addObservation({
      sourceId: signal.id,
      symbol: signal.symbol,
      exchange: signal.exchange,
      maturity: "deep_candidate",
      score: signal.confidence,
      reasons: ["deep_scan_candidate"],
    });
  }

  return {
    observations: [...observations.values()].sort((left, right) => (
      left.canonicalInstrumentId.localeCompare(right.canonicalInstrumentId)
    )),
    rejections,
    complete: rejections.length === 0,
  } as const;
}
