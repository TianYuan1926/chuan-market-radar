export const FULL_SCOPE_ASSETS = Object.freeze([
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "DOGE",
] as const);

export const FULL_SCOPE_CATALOG_RECEIVED_AT = "2026-01-15T00:00:00.000Z";
export const FULL_SCOPE_PRICE_SNAPSHOT_RECEIVED_AT =
  "2026-01-15T00:00:00.200Z";
export const FULL_SCOPE_EVENT_TIME_MS = "1768435200100";

export function fullScopeBinanceCatalog(
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  return {
    symbols: [
      ...assets.map((baseAsset) => ({
        baseAsset,
        contractType: "PERPETUAL",
        marginAsset: "USDT",
        quoteAsset: "USDT",
        status: "TRADING",
        symbol: `${baseAsset}USDT`,
      })),
      {
        baseAsset: "NEW",
        contractType: "PERPETUAL",
        marginAsset: "USDT",
        quoteAsset: "USDT",
        status: "PENDING_TRADING",
        symbol: "NEWUSDT",
      },
      {
        baseAsset: "BTC",
        contractType: "CURRENT_QUARTER",
        marginAsset: "USDT",
        quoteAsset: "USDT",
        status: "TRADING",
        symbol: "BTCUSDT_260327",
      },
    ],
  };
}

export function fullScopeOkxCatalog(
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  return {
    code: "0",
    data: [
      ...assets.map((baseAsset) => ({
        ctType: "linear",
        ctVal: baseAsset === "BTC" ? "0.01" : "1",
        ctValCcy: baseAsset,
        instCategory: "1",
        instFamily: `${baseAsset}-USDT`,
        instId: `${baseAsset}-USDT-SWAP`,
        instType: "SWAP",
        quoteCcy: "USDT",
        settleCcy: "USDT",
        state: "live",
        uly: `${baseAsset}-USDT`,
      })),
      {
        ctType: "inverse",
        ctVal: "100",
        ctValCcy: "BTC",
        instCategory: "1",
        instFamily: "BTC-USD",
        instId: "BTC-USD-SWAP",
        instType: "SWAP",
        quoteCcy: "USD",
        settleCcy: "BTC",
        state: "live",
        uly: "BTC-USD",
      },
      {
        ctType: "linear",
        ctVal: "1",
        ctValCcy: "PAUSED",
        instCategory: "1",
        instFamily: "PAUSED-USDT",
        instId: "PAUSED-USDT-SWAP",
        instType: "SWAP",
        quoteCcy: "USDT",
        settleCcy: "USDT",
        state: "suspend",
        uly: "PAUSED-USDT",
      },
    ],
  };
}

export function fullScopeBybitCatalogPages(
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  const rows = assets.map((baseCoin) => ({
    baseCoin,
    contractType: "LinearPerpetual",
    isPreListing: false,
    quoteCoin: "USDT",
    settleCoin: "USDT",
    status: "Trading",
    symbol: `${baseCoin}USDT`,
  }));
  return [
    {
      result: {
        category: "linear",
        list: rows.slice(0, 3),
        nextPageCursor: "full-scope-page-2",
      },
      retCode: 0,
    },
    {
      result: {
        category: "linear",
        list: [
          ...rows.slice(3),
          {
            baseCoin: "PRE",
            contractType: "LinearPerpetual",
            isPreListing: true,
            quoteCoin: "USDT",
            settleCoin: "USDT",
            status: "PreLaunch",
            symbol: "PREUSDT",
          },
          {
            baseCoin: "CLOSED",
            contractType: "LinearPerpetual",
            isPreListing: false,
            quoteCoin: "USDT",
            settleCoin: "USDT",
            status: "Closed",
            symbol: "CLOSEDUSDT",
          },
        ],
        nextPageCursor: "",
      },
      retCode: 0,
    },
  ] as const;
}

export function fullScopeBinanceMarkPrices(
  eventTimeMs = FULL_SCOPE_EVENT_TIME_MS,
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  return assets.map((baseAsset, index) => ({
    markPrice: String(42_000 + index * 100),
    symbol: `${baseAsset}USDT`,
    time: eventTimeMs,
  }));
}

export function fullScopeOkxMarkPrices(
  eventTimeMs = FULL_SCOPE_EVENT_TIME_MS,
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  return {
    code: "0",
    data: assets.map((baseAsset, index) => ({
      instId: `${baseAsset}-USDT-SWAP`,
      markPx: String(42_001 + index * 100),
      ts: eventTimeMs,
    })),
  };
}

export function fullScopeBybitMarkPrices(
  eventTimeMs = FULL_SCOPE_EVENT_TIME_MS,
  assets: readonly string[] = FULL_SCOPE_ASSETS,
) {
  return {
    result: {
      category: "linear",
      list: assets.map((baseAsset, index) => ({
        markPrice: String(41_999 + index * 100),
        symbol: `${baseAsset}USDT`,
      })),
    },
    retCode: 0,
    time: eventTimeMs,
  };
}
