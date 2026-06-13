import type {
  ContractInstrument,
  InstrumentPoolOptions,
  InstrumentPoolResult,
  InstrumentRejectionReason,
  RejectedInstrument,
} from "./types";

const defaultOptions = {
  minVolume24hUsd: 5_000_000,
  allowedQuoteAssets: ["USDT"],
  allowedMarketTypes: ["perpetual"],
} satisfies Required<InstrumentPoolOptions>;

function rejectionReason(
  instrument: ContractInstrument,
  options: Required<InstrumentPoolOptions>,
): InstrumentRejectionReason | null {
  if (!instrument.isActive) {
    return "inactive";
  }

  if (!options.allowedQuoteAssets.includes(instrument.quoteAsset)) {
    return "quote_not_supported";
  }

  if (!options.allowedMarketTypes.includes(instrument.marketType)) {
    return "market_type_not_supported";
  }

  if (instrument.volume24hUsd < options.minVolume24hUsd) {
    return "volume_below_floor";
  }

  return null;
}

function deduplicateByExchangeSymbol(instruments: ContractInstrument[]) {
  const byKey = new Map<string, ContractInstrument>();

  for (const instrument of instruments) {
    const key = `${instrument.exchange}:${instrument.symbol}`;
    const existing = byKey.get(key);

    if (!existing || instrument.volume24hUsd > existing.volume24hUsd) {
      byKey.set(key, instrument);
    }
  }

  return Array.from(byKey.values());
}

export function buildContractInstrumentPool(
  instruments: ContractInstrument[],
  options: InstrumentPoolOptions = {},
): InstrumentPoolResult {
  const normalizedOptions: Required<InstrumentPoolOptions> = {
    ...defaultOptions,
    ...options,
  };
  const deduplicated = deduplicateByExchangeSymbol(instruments);
  const rejected: RejectedInstrument[] = [];
  const accepted: ContractInstrument[] = [];

  for (const instrument of deduplicated) {
    const reason = rejectionReason(instrument, normalizedOptions);

    if (reason) {
      rejected.push({ instrument, reason });
    } else {
      accepted.push(instrument);
    }
  }

  accepted.sort((left, right) => right.volume24hUsd - left.volume24hUsd);

  return {
    instruments: accepted,
    rejected,
    summary: {
      total: instruments.length,
      accepted: accepted.length,
      rejected: rejected.length,
      duplicatesRemoved: instruments.length - deduplicated.length,
      minVolume24hUsd: normalizedOptions.minVolume24hUsd,
      quoteAssets: normalizedOptions.allowedQuoteAssets,
      marketTypes: normalizedOptions.allowedMarketTypes,
    },
  };
}
