import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";

export const M2_FORWARD_INSTRUMENT_CAPTURE_CONFIG_VERSION =
  "v2-m2-forward-instrument-capture-config.v2" as const;
export const M2_FORWARD_INSTRUMENT_RAW_EVIDENCE_VERSION =
  "v2-m2-forward-instrument-raw-evidence.v2" as const;
export const M2_FORWARD_INSTRUMENT_SNAPSHOT_VERSION =
  "v2-m2-forward-instrument-snapshot.v2" as const;
export const M2_FORWARD_INSTRUMENT_BATCH_VERSION =
  "v2-m2-forward-instrument-batch.v2" as const;
export const M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION =
  "v2-m2-forward-instrument-continuity.v2" as const;
export const M2_FORWARD_INSTRUMENT_ARTIFACT_REFERENCE_VERSION =
  "v2-m2-forward-instrument-artifact-reference.v2" as const;
export const M2_FORWARD_INSTRUMENT_CAPTURE_JOURNAL_VERSION =
  "v2-m2-forward-instrument-capture-journal.v2" as const;

export const M2_FORWARD_INSTRUMENT_DEFAULT_CADENCE_POLICY = Object.freeze({
  expectedCadenceMs: 5 * 60 * 1_000,
  maximumGapMs: 15 * 60 * 1_000,
  completeMissesToConfirm: 3,
  minimumConfirmationElapsedMs: 15 * 60 * 1_000,
});

const CAPTURE_CONFIG_DESCRIPTOR = Object.freeze({
  schemaVersion: M2_FORWARD_INSTRUMENT_CAPTURE_CONFIG_VERSION,
  authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
  captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START",
  targetScope: "LINEAR_USDT_SETTLED_PERPETUALS",
  providers: Object.freeze([
    "BINANCE_USDS_FUTURES:BINANCE_FUTURES",
    "BYBIT_LINEAR_PERPETUAL:BYBIT_LINEAR_PERPETUAL",
    "OKX_SWAP:OKX_SWAP",
  ]),
  cadencePolicy: M2_FORWARD_INSTRUMENT_DEFAULT_CADENCE_POLICY,
  artifactSchemas: Object.freeze([
    M2_FORWARD_INSTRUMENT_RAW_EVIDENCE_VERSION,
    M2_FORWARD_INSTRUMENT_SNAPSHOT_VERSION,
    M2_FORWARD_INSTRUMENT_BATCH_VERSION,
    M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION,
    M2_FORWARD_INSTRUMENT_ARTIFACT_REFERENCE_VERSION,
    M2_FORWARD_INSTRUMENT_CAPTURE_JOURNAL_VERSION,
  ]),
});

export const M2_FORWARD_INSTRUMENT_CAPTURE_CONFIG_DIGEST = stableContentHash(
  CAPTURE_CONFIG_DESCRIPTOR,
);

export const M2ForwardInstrumentReleaseIdSchema = z.string().regex(
  /^[0-9a-f]{40}$/u,
);

export const M2ForwardInstrumentProvenanceSchema = z.strictObject({
  releaseId: M2ForwardInstrumentReleaseIdSchema,
  captureConfigDigest: z.literal(M2_FORWARD_INSTRUMENT_CAPTURE_CONFIG_DIGEST),
});

export type M2ForwardInstrumentProvenance = z.infer<
  typeof M2ForwardInstrumentProvenanceSchema
>;

export function buildM2ForwardInstrumentProvenance(
  releaseId: string,
): M2ForwardInstrumentProvenance {
  return deepFreezeArtifact(M2ForwardInstrumentProvenanceSchema.parse({
    releaseId,
    captureConfigDigest: M2_FORWARD_INSTRUMENT_CAPTURE_CONFIG_DIGEST,
  }));
}
