export const CATALOG_RECEIVED_AT = "2026-01-14T23:59:59.900Z";
export const SOURCE_CUTOFF = "2026-01-15T00:00:00.000Z";
export const TICKER_RECEIVED_AT = "2026-01-15T00:00:00.100Z";
export const NORMALIZED_AT = "2026-01-15T00:00:00.200Z";
export const GENERATED_AT = "2026-01-15T00:00:00.300Z";
export const EVENT_TIME_MS = "1768435200000";

export const BINANCE_CATALOG = {
  symbols: [
    {
      baseAsset: "BTC",
      contractType: "PERPETUAL",
      marginAsset: "USDT",
      quoteAsset: "USDT",
      status: "TRADING",
      symbol: "BTCUSDT",
    },
  ],
};

export const OKX_CATALOG = {
  code: "0",
  data: [
    {
      ctType: "linear",
      ctVal: "0.01",
      ctValCcy: "BTC",
      instCategory: "1",
      instFamily: "BTC-USDT",
      instId: "BTC-USDT-SWAP",
      instType: "SWAP",
      settleCcy: "USDT",
      state: "live",
      uly: "BTC-USDT",
    },
  ],
};

export const BYBIT_CATALOG = {
  result: {
    category: "linear",
    list: [
      {
        baseCoin: "BTC",
        contractType: "LinearPerpetual",
        isPreListing: false,
        quoteCoin: "USDT",
        settleCoin: "USDT",
        status: "Trading",
        symbol: "BTCUSDT",
      },
    ],
    nextPageCursor: "",
  },
  retCode: 0,
};

export const BINANCE_TICKERS = [
  { price: "42000.00", symbol: "BTCUSDT", time: EVENT_TIME_MS },
];

export const OKX_TICKERS = {
  code: "0",
  data: [
    { instId: "BTC-USDT-SWAP", last: "42001.00", ts: EVENT_TIME_MS },
  ],
};

export const BYBIT_TICKERS = {
  result: {
    category: "linear",
    list: [{ lastPrice: "41999.50", symbol: "BTCUSDT" }],
  },
  retCode: 0,
  time: EVENT_TIME_MS,
};
