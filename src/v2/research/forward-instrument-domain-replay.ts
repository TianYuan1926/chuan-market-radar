import { z } from "zod";
import {
  normalizeBinanceMultiAssetCatalog,
  normalizeBybitMultiAssetCatalog,
  normalizeOkxMultiAssetCatalog,
  type M1CatalogNormalizationResult,
} from "../modules/multi-asset-universe/adapters/four-venue-multi-asset-catalog";
import {
  M1_ASSET_DOMAINS,
  type M1AssetDomain,
} from "../modules/source-capability/source-capability-contract";
import type {
  ForwardInstrumentProviderId,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import type {
  M2ForwardInstrumentSnapshot,
} from "./forward-instrument-capture";
import type {
  M2ForwardInstrumentEvidenceStore,
} from "./forward-instrument-evidence-store";

export const M2_FORWARD_INSTRUMENT_DOMAIN_REPLAY_VERSION =
  "v2-m2-forward-instrument-domain-replay.v1" as const;

const BybitPageSchema = z.object({
  retCode: z.number().int(),
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
    nextPageCursor: z.string().optional(),
  }).passthrough(),
}).passthrough();

type DomainCountKey = M1AssetDomain | "UNRESOLVED";

export type M2ForwardInstrumentDomainReplay = Readonly<{
  schemaVersion: typeof M2_FORWARD_INSTRUMENT_DOMAIN_REPLAY_VERSION;
  status: "PASS_LATEST_RAW_DOMAIN_REPLAY";
  providerCount: 3;
  multiAssetSeparationObserved: boolean;
  unresolvedClassificationObserved: boolean;
  providerResults: readonly Readonly<{
    providerId: ForwardInstrumentProviderId;
    sourceId: M1CatalogNormalizationResult["sourceId"];
    normalizationStatus: M1CatalogNormalizationResult["status"];
    rawRecordCount: number;
    observationCount: number;
    countsByAssetDomain: Readonly<Record<DomainCountKey, number>>;
    exactIdentityCount: number;
    partialIdentityCount: number;
    unresolvedIdentityCount: number;
    broadRwaCount: number;
    broadEquitySubtypeUnresolvedCount: number;
    targetMechanismExcludedCount: number;
    authorityBoundary:
      "NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY";
  }>[];
  candidateEmissionAllowed: false;
  strategyAuthorityAllowed: false;
  readyAuthorityAllowed: false;
  officialMappingCompletenessProven: false;
}>;

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function emptyDomainCounts(): Record<DomainCountKey, number> {
  return {
    CRYPTO_LINEAR_PERPETUAL: 0,
    EQUITY_SINGLE_NAME_PERPETUAL: 0,
    EQUITY_INDEX_ETF_PERPETUAL: 0,
    EQUITY_CFD: 0,
    OTHER_RWA_DERIVATIVE: 0,
    ASSET_LISTING_WATCH: 0,
    CROSS_MARKET_CONTEXT: 0,
    UNRESOLVED: 0,
  };
}

async function parsedRawPages(input: Readonly<{
  snapshot: M2ForwardInstrumentSnapshot;
  store: M2ForwardInstrumentEvidenceStore;
}>): Promise<readonly unknown[]> {
  const pages: unknown[] = [];
  for (const evidence of input.snapshot.rawEvidence) {
    const bytes = await input.store.readRaw(evidence);
    pages.push(JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown);
  }
  return Object.freeze(pages);
}

function bybitMergedPayload(pages: readonly unknown[]): unknown {
  const parsed = pages.map((page) => BybitPageSchema.parse(page));
  ensure(parsed.length > 0, "Bybit domain replay requires retained raw pages");
  ensure(
    parsed.every((page) =>
      page.retCode === 0 && page.result.category === "linear"
    ),
    "Bybit domain replay rejects provider errors or category drift",
  );
  return {
    retCode: 0,
    result: {
      category: "linear",
      list: parsed.flatMap((page) => page.result.list),
      nextPageCursor: "",
    },
  };
}

function normalize(input: Readonly<{
  pages: readonly unknown[];
  snapshot: M2ForwardInstrumentSnapshot;
}>): M1CatalogNormalizationResult {
  if (input.snapshot.providerId === "BINANCE_USDS_FUTURES") {
    ensure(
      input.pages.length === 1,
      "Binance domain replay requires exactly one retained raw page",
    );
    return normalizeBinanceMultiAssetCatalog({
      payload: input.pages[0],
      receivedAt: input.snapshot.sourceCutoff,
    });
  }
  if (input.snapshot.providerId === "OKX_SWAP") {
    ensure(
      input.pages.length === 1,
      "OKX domain replay requires exactly one retained raw page",
    );
    return normalizeOkxMultiAssetCatalog({
      payload: input.pages[0],
      receivedAt: input.snapshot.sourceCutoff,
    });
  }
  return normalizeBybitMultiAssetCatalog({
    payload: bybitMergedPayload(input.pages),
    receivedAt: input.snapshot.sourceCutoff,
  });
}

function providerResult(
  providerId: ForwardInstrumentProviderId,
  result: M1CatalogNormalizationResult,
): M2ForwardInstrumentDomainReplay["providerResults"][number] {
  const countsByAssetDomain = emptyDomainCounts();
  let exactIdentityCount = 0;
  let partialIdentityCount = 0;
  let unresolvedIdentityCount = 0;
  let broadEquitySubtypeUnresolvedCount = 0;
  let targetMechanismExcludedCount = 0;
  for (const observation of result.observations) {
    countsByAssetDomain[observation.assetDomain ?? "UNRESOLVED"] += 1;
    if (observation.identityStatus === "EXACT") {
      exactIdentityCount += 1;
    } else if (observation.identityStatus === "PARTIAL") {
      partialIdentityCount += 1;
    } else {
      unresolvedIdentityCount += 1;
    }
    if (observation.reasonCodes.includes(
      "bybit_stock_category_does_not_distinguish_single_name_from_etf",
    )) {
      broadEquitySubtypeUnresolvedCount += 1;
    }
    if (observation.reasonCodes.includes("contract_outside_target_mechanism")) {
      targetMechanismExcludedCount += 1;
    }
  }
  ensure(
    Object.values(countsByAssetDomain).reduce(
      (sum, value) => sum + value,
      0,
    ) === result.observations.length &&
      exactIdentityCount + partialIdentityCount + unresolvedIdentityCount ===
        result.observations.length,
    "domain replay accounting is incomplete",
  );
  return Object.freeze({
    providerId,
    sourceId: result.sourceId,
    normalizationStatus: result.status,
    rawRecordCount: result.rawRecordCount,
    observationCount: result.observations.length,
    countsByAssetDomain: Object.freeze(countsByAssetDomain),
    exactIdentityCount,
    partialIdentityCount,
    unresolvedIdentityCount,
    broadRwaCount:
      countsByAssetDomain.OTHER_RWA_DERIVATIVE,
    broadEquitySubtypeUnresolvedCount,
    targetMechanismExcludedCount,
    authorityBoundary: result.authorityBoundary,
  });
}

export async function replayLatestM2ForwardInstrumentDomains(
  input: Readonly<{
    snapshots: readonly M2ForwardInstrumentSnapshot[];
    store: M2ForwardInstrumentEvidenceStore;
  }>,
): Promise<M2ForwardInstrumentDomainReplay> {
  ensure(
    input.snapshots.length === 3 &&
      new Set(input.snapshots.map((snapshot) => snapshot.providerId)).size === 3,
    "domain replay requires one latest snapshot for every provider",
  );
  const providerResults:
    Array<M2ForwardInstrumentDomainReplay["providerResults"][number]> = [];
  for (const snapshot of [...input.snapshots].sort((left, right) =>
    left.providerId.localeCompare(right.providerId))) {
    ensure(
      snapshot.captureStatus === "COMPLETE",
      "domain replay requires complete latest snapshots",
    );
    const pages = await parsedRawPages({ snapshot, store: input.store });
    const result = normalize({ pages, snapshot });
    ensure(
      result.rawRecordCount === snapshot.denominator.providerRowCount &&
        result.rawRecordCount === snapshot.accounting.length &&
        result.observations.length === result.rawRecordCount,
      "domain replay denominator does not match retained forward accounting",
    );
    providerResults.push(providerResult(snapshot.providerId, result));
  }
  const nonzeroDomains = M1_ASSET_DOMAINS.filter((assetDomain) =>
    providerResults.some((result) =>
      result.countsByAssetDomain[assetDomain] > 0
    ));
  return Object.freeze({
    schemaVersion: M2_FORWARD_INSTRUMENT_DOMAIN_REPLAY_VERSION,
    status: "PASS_LATEST_RAW_DOMAIN_REPLAY",
    providerCount: 3,
    multiAssetSeparationObserved: nonzeroDomains.length > 1,
    unresolvedClassificationObserved: providerResults.some((result) =>
      result.countsByAssetDomain.UNRESOLVED > 0 ||
      result.broadEquitySubtypeUnresolvedCount > 0),
    providerResults: Object.freeze(providerResults),
    candidateEmissionAllowed: false,
    strategyAuthorityAllowed: false,
    readyAuthorityAllowed: false,
    officialMappingCompletenessProven: false,
  });
}
