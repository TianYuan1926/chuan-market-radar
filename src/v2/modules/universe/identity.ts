import type { InstrumentIdentity } from "../../domain/contracts";
import type { TargetVenue } from "../../domain/product-constitution";
import { stableSha256 } from "./stable-artifact";

const ASSET_CODE = /^[\p{L}\p{M}\p{N}]{1,32}$/u;
const VENUE_INSTRUMENT_ID = /^[\p{L}\p{M}\p{N}_-]{2,80}$/u;
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function normalizeCode(value: string, pattern: RegExp): string | null {
  const normalized = value
    .trim()
    .normalize("NFC")
    .replace(/[a-z]/gu, (character) => character.toUpperCase());
  return pattern.test(normalized) ? normalized : null;
}

export function normalizeAssetCode(value: string): string | null {
  return normalizeCode(value, ASSET_CODE);
}

export function normalizeVenueInstrumentId(value: string): string | null {
  return normalizeCode(value, VENUE_INSTRUMENT_ID);
}

export function normalizePositiveDecimal(value: string): string | null {
  const normalized = value.trim();
  if (!POSITIVE_DECIMAL.test(normalized) || !/[1-9]/u.test(normalized)) {
    return null;
  }
  return normalized;
}

export function createInstrumentIdentity(input: {
  baseAsset: string;
  contractSize: string;
  quoteAsset: string;
  settlementAsset: string;
  venue: TargetVenue;
  venueInstrumentId: string;
}): InstrumentIdentity | null {
  const venueInstrumentId = normalizeVenueInstrumentId(
    input.venueInstrumentId,
  );
  const baseAsset = normalizeAssetCode(input.baseAsset);
  const quoteAsset = normalizeAssetCode(input.quoteAsset);
  const settlementAsset = normalizeAssetCode(input.settlementAsset);
  const contractSize = normalizePositiveDecimal(input.contractSize);

  if (
    venueInstrumentId === null ||
    baseAsset === null ||
    quoteAsset === null ||
    settlementAsset === null ||
    contractSize === null
  ) {
    return null;
  }

  return {
    canonicalInstrumentId:
      `${input.venue}:${venueInstrumentId}:LINEAR_PERPETUAL:${settlementAsset}`,
    underlyingGroupId: `${baseAsset}:${settlementAsset}_LINEAR_PERPETUAL`,
    venue: input.venue,
    venueInstrumentId,
    baseAsset,
    quoteAsset,
    settlementAsset,
    contractType: "LINEAR_PERPETUAL",
    contractSize,
  };
}

export function createObservationId(
  venue: TargetVenue,
  pageIndex: number,
  rowIndex: number,
  rawRecord: unknown,
): string {
  const digest = stableSha256(rawRecord).slice(0, 20);
  return `${venue}:catalog:${pageIndex}:${rowIndex}:${digest}`;
}
