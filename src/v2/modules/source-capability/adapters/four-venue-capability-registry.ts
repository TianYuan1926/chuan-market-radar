import {
  M1_CAPABILITY_IDS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_CAPABILITY_REGISTRY_VERSION,
  M1_SOURCE_IDS,
  M1_FAILURE_SEMANTICS,
  type M1AssetDomain,
  type M1CapabilityDefinition,
  type M1CapabilityId,
  type M1CapabilityRow,
  type M1EvidenceReference,
  type M1FailureSemantic,
  type M1SourceCapabilityRegistry,
  type M1SourceId,
  type M1SourceProfile,
  buildM1SourceCapabilityRegistry,
} from "../source-capability-contract";

const REVIEWED_AT = "2026-07-23T04:00:00.000Z";

const CRYPTO: M1AssetDomain[] = ["CRYPTO_LINEAR_PERPETUAL"];
const EQUITY: M1AssetDomain[] = [
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
];
const DERIVATIVE_DOMAINS: M1AssetDomain[] = [...CRYPTO, ...EQUITY];
const LISTING_DOMAINS: M1AssetDomain[] = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
  "EQUITY_CFD",
  "OTHER_RWA_DERIVATIVE",
  "ASSET_LISTING_WATCH",
];
const CROSS_MARKET: M1AssetDomain[] = ["CROSS_MARKET_CONTEXT"];

const ALL_SOURCE_FAILURES = [...M1_FAILURE_SEMANTICS] satisfies
  M1FailureSemantic[];

export const M1_FOUR_VENUE_CAPABILITY_DEFINITIONS = [
  {
    capabilityId: "SERVER_TIME",
    label: "Provider server time",
    factSemantics: "Provider clock used to measure skew and knowledge time.",
    targetTiers: ["T0_CATALOG_EVENT"],
    defaultAssetDomains: LISTING_DOMAINS,
    persistenceClass: "REFERENCE_SNAPSHOT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    label: "Derivative instrument catalog",
    factSemantics:
      "Point-in-time contract identity, lifecycle, precision, limits and settlement metadata.",
    targetTiers: ["T0_CATALOG_EVENT"],
    defaultAssetDomains: LISTING_DOMAINS,
    persistenceClass: "EVENT_LEDGER",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "SPOT_INSTRUMENT_CATALOG",
    label: "Spot instrument catalog",
    factSemantics:
      "Point-in-time spot listing identity used only for asset listing watch and cross-checking.",
    targetTiers: ["T0_CATALOG_EVENT"],
    defaultAssetDomains: ["ASSET_LISTING_WATCH"],
    persistenceClass: "EVENT_LEDGER",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "LISTING_ANNOUNCEMENT",
    label: "Listing and delisting announcement",
    factSemantics:
      "Official publication time and event classification for listing lifecycle intelligence.",
    targetTiers: ["T0_CATALOG_EVENT"],
    defaultAssetDomains: LISTING_DOMAINS,
    persistenceClass: "EVENT_LEDGER",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "INSTRUMENT_STATUS_STREAM",
    label: "Instrument status stream",
    factSemantics:
      "Incremental contract specification or lifecycle state changes with provider sequence semantics.",
    targetTiers: ["T0_CATALOG_EVENT"],
    defaultAssetDomains: LISTING_DOMAINS,
    persistenceClass: "EVENT_LEDGER",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "TICKER",
    label: "Ticker",
    factSemantics:
      "Venue-scoped last price, bid/ask and rolling volume snapshot.",
    targetTiers: ["T1_WIDE_MARKET"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "MARK_PRICE",
    label: "Mark price",
    factSemantics:
      "Venue liquidation-reference mark price with provider event time.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "INDEX_PRICE",
    label: "Index or reference price",
    factSemantics:
      "Venue reference index used to explain basis and mark construction.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "TRADE_KLINE",
    label: "Trade-price Kline",
    factSemantics:
      "Closed or forming OHLCV bar derived by the venue from traded prices.",
    targetTiers: ["T1_WIDE_MARKET", "T2_CANDIDATE_BURST"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "MARK_PRICE_KLINE",
    label: "Mark-price Kline",
    factSemantics: "OHLC bar of the venue mark-price series.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "INDEX_PRICE_KLINE",
    label: "Index-price Kline",
    factSemantics: "OHLC bar of the venue reference-index series.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "PUBLIC_TRADE",
    label: "Public trades",
    factSemantics:
      "Public match events used for bounded flow and slippage research.",
    targetTiers: ["T2_CANDIDATE_BURST"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "BOUNDED_BURST_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "ORDER_BOOK_SNAPSHOT",
    label: "Order-book snapshot",
    factSemantics:
      "Provider depth snapshot used to seed or reconcile a local order book.",
    targetTiers: ["T1_WIDE_MARKET", "T2_CANDIDATE_BURST"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "ORDER_BOOK_DELTA",
    label: "Order-book delta stream",
    factSemantics:
      "Sequenced incremental depth updates with explicit gap recovery.",
    targetTiers: ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "BOUNDED_BURST_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "OPEN_INTEREST_CURRENT",
    label: "Current open interest",
    factSemantics: "Venue-scoped current unsettled contract exposure.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "OPEN_INTEREST_HISTORY",
    label: "Open-interest history",
    factSemantics: "Time series of venue or aggregate open interest.",
    targetTiers: ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "FUNDING_CURRENT",
    label: "Current funding",
    factSemantics:
      "Current or predicted venue funding rate and next settlement time.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "FUNDING_HISTORY",
    label: "Funding history",
    factSemantics: "Settled venue or aggregate funding-rate history.",
    targetTiers: ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "LIQUIDATION_EVENT",
    label: "Public liquidation event",
    factSemantics:
      "Venue or aggregate public forced-liquidation observation, never a trade trigger by itself.",
    targetTiers: ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "BOUNDED_BURST_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "LONG_SHORT_RATIO",
    label: "Long-short ratio",
    factSemantics:
      "Venue or aggregate account/position crowding ratio used as contextual evidence.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "TAKER_FLOW",
    label: "Taker buy-sell flow",
    factSemantics:
      "Aggressive buy/sell volume or a lineage-preserving derivation from public trades.",
    targetTiers: ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "BOUNDED_BURST_FACT",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "PRICE_LIMIT_RISK_RULE",
    label: "Price limit and risk rule",
    factSemantics:
      "Point-in-time venue order-price bands, risk parameters and contract limits.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "REFERENCE_SNAPSHOT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "INSTRUMENT_FEE_SCHEDULE",
    label: "Instrument fee schedule",
    factSemantics:
      "Public instrument-level maker/taker or equivalent execution-cost schedule.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "REFERENCE_SNAPSHOT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "HISTORICAL_BULK_ARCHIVE",
    label: "Historical bulk archive",
    factSemantics:
      "Immutable or versioned first-party historical market-data object.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: DERIVATIVE_DOMAINS,
    persistenceClass: "RESEARCH_ARCHIVE",
    valueClass: "HIGH_VALUE",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "EQUITY_SESSION_REFERENCE",
    label: "Equity session reference",
    factSemantics:
      "Underlying exchange calendar, regular session and off-hours pricing semantics.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: EQUITY,
    persistenceClass: "REFERENCE_SNAPSHOT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "EQUITY_CORPORATE_ACTION",
    label: "Equity corporate action",
    factSemantics:
      "Point-in-time split, dividend, halt and symbol-change event affecting the derivative.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: EQUITY,
    persistenceClass: "EVENT_LEDGER",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "FX_REFERENCE",
    label: "FX reference",
    factSemantics:
      "Timestamped fiat-to-settlement-asset conversion used in equity basis and cost models.",
    targetTiers: ["T1_WIDE_MARKET", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: EQUITY,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CORE_REQUIRED",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "OPTIONS_MARKET_CONTEXT",
    label: "Options market context",
    factSemantics:
      "Aggregate options positioning or volatility context, not an execution venue fact.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: CROSS_MARKET,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "ETF_FLOW_CONTEXT",
    label: "ETF flow context",
    factSemantics:
      "BTC/ETH or relevant equity ETF flow context used only for regime interpretation.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: CROSS_MARKET,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "EXCHANGE_BALANCE_CONTEXT",
    label: "Exchange balance context",
    factSemantics:
      "Low-frequency aggregate exchange holdings or balance context.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: CROSS_MARKET,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "SENTIMENT_INDEX_CONTEXT",
    label: "Sentiment index context",
    factSemantics:
      "External sentiment regime observation, never a standalone direction signal.",
    targetTiers: ["T3_DEEP_VALIDATION"],
    defaultAssetDomains: CROSS_MARKET,
    persistenceClass: "POINT_IN_TIME_FACT",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "TOKEN_UNLOCK_EVENT",
    label: "Token unlock event",
    factSemantics:
      "Point-in-time token supply unlock event used as a risk and event context.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: ["CRYPTO_LINEAR_PERPETUAL", "ASSET_LISTING_WATCH"],
    persistenceClass: "EVENT_LEDGER",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
  {
    capabilityId: "MARKET_NEWS_EVENT",
    label: "Market news event",
    factSemantics:
      "Timestamped source-attributed event context; never treated as market fact or direction by itself.",
    targetTiers: ["T0_CATALOG_EVENT", "T3_DEEP_VALIDATION"],
    defaultAssetDomains: [...LISTING_DOMAINS, "CROSS_MARKET_CONTEXT"],
    persistenceClass: "EVENT_LEDGER",
    valueClass: "CONDITIONAL_CONTEXT",
    privateTradingOrAccountData: false,
  },
] as const satisfies readonly M1CapabilityDefinition[];

const ALL_MARKET_CAPABILITIES = M1_CAPABILITY_IDS.filter((capabilityId) =>
  ![
    "OPTIONS_MARKET_CONTEXT",
    "ETF_FLOW_CONTEXT",
    "EXCHANGE_BALANCE_CONTEXT",
    "SENTIMENT_INDEX_CONTEXT",
    "TOKEN_UNLOCK_EVENT",
    "MARKET_NEWS_EVENT",
  ].includes(capabilityId)
);

export const M1_FOUR_VENUE_OFFICIAL_EVIDENCE = [
  {
    evidenceId: "binance-usdm-market-data-2026-07-23",
    sourceId: "BINANCE_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ALL_MARKET_CAPABILITIES.filter((capabilityId) =>
      ![
        "LISTING_ANNOUNCEMENT",
        "INSTRUMENT_STATUS_STREAM",
        "INSTRUMENT_FEE_SCHEDULE",
        "HISTORICAL_BULK_ARCHIVE",
        "EQUITY_SESSION_REFERENCE",
        "EQUITY_CORPORATE_ACTION",
        "FX_REFERENCE",
      ].includes(capabilityId)
    ),
  },
  {
    evidenceId: "binance-usdm-websocket-market-streams-2026-07-23",
    sourceId: "BINANCE_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "INSTRUMENT_STATUS_STREAM",
      "ORDER_BOOK_DELTA",
      "LIQUIDATION_EVENT",
    ],
  },
  {
    evidenceId: "binance-public-data-archive-2026-07-23",
    sourceId: "BINANCE_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://github.com/binance/binance-public-data",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["HISTORICAL_BULK_ARCHIVE"],
  },
  {
    evidenceId: "binance-stock-perpetuals-2026-07-23",
    sourceId: "BINANCE_FUTURES",
    evidenceType: "OFFICIAL_PRODUCT_DOCUMENTATION",
    url:
      "https://academy.binance.com/en/articles/how-to-trade-stock-perpetual-contracts-on-binance",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "EQUITY_SESSION_REFERENCE",
      "EQUITY_CORPORATE_ACTION",
    ],
  },
  {
    evidenceId: "okx-v5-api-2026-07-23",
    sourceId: "OKX_SWAP",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://www.okx.com/docs-v5/en/",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ALL_MARKET_CAPABILITIES.filter((capabilityId) =>
      ![
        "LISTING_ANNOUNCEMENT",
        "HISTORICAL_BULK_ARCHIVE",
        "EQUITY_SESSION_REFERENCE",
        "EQUITY_CORPORATE_ACTION",
        "FX_REFERENCE",
      ].includes(capabilityId)
    ),
  },
  {
    evidenceId: "okx-instrument-channel-2026-07-23",
    sourceId: "OKX_SWAP",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://www.okx.com/docs-v5/trick_en/",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "INSTRUMENT_STATUS_STREAM",
    ],
  },
  {
    evidenceId: "okx-stock-perpetuals-2026-07-23",
    sourceId: "OKX_SWAP",
    evidenceType: "OFFICIAL_PRODUCT_DOCUMENTATION",
    url: "https://www.okx.com/en-us/help/stock-perpetuals",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "EQUITY_SESSION_REFERENCE",
      "EQUITY_CORPORATE_ACTION",
    ],
  },
  {
    evidenceId: "bybit-market-api-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://bybit-exchange.github.io/docs/api-explorer/v5/market/market",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ALL_MARKET_CAPABILITIES.filter((capabilityId) =>
      ![
        "LISTING_ANNOUNCEMENT",
        "INSTRUMENT_STATUS_STREAM",
        "INSTRUMENT_FEE_SCHEDULE",
        "HISTORICAL_BULK_ARCHIVE",
        "EQUITY_SESSION_REFERENCE",
        "EQUITY_CORPORATE_ACTION",
        "FX_REFERENCE",
      ].includes(capabilityId)
    ),
  },
  {
    evidenceId: "bybit-instrument-info-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://bybit-exchange.github.io/docs/v5/market/instrument",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "SPOT_INSTRUMENT_CATALOG",
      "PRICE_LIMIT_RISK_RULE",
    ],
  },
  {
    evidenceId: "bybit-announcements-api-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://bybit-exchange.github.io/docs/v5/announcement",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["LISTING_ANNOUNCEMENT", "MARKET_NEWS_EVENT"],
  },
  {
    evidenceId: "bybit-orderbook-websocket-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["ORDER_BOOK_DELTA"],
  },
  {
    evidenceId: "bybit-liquidation-websocket-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["LIQUIDATION_EVENT"],
  },
  {
    evidenceId: "bybit-tradfi-perpetuals-2026-07-23",
    sourceId: "BYBIT_DERIVATIVES",
    evidenceType: "OFFICIAL_PRODUCT_DOCUMENTATION",
    url:
      "https://www.bybit.com/en/help-center/article/Introduction-to-TradFi-Perpetual-Contracts",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "EQUITY_SESSION_REFERENCE",
      "EQUITY_CORPORATE_ACTION",
    ],
  },
  {
    evidenceId: "bitget-contract-config-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://www.bitget.com/api-doc/classic/contract/market/Get-All-Symbols-Contracts",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "INSTRUMENT_FEE_SCHEDULE",
      "PRICE_LIMIT_RISK_RULE",
    ],
  },
  {
    evidenceId: "bitget-announcements-api-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://www.bitget.com/api-doc/common/notice/Get-All-Notices",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["LISTING_ANNOUNCEMENT", "MARKET_NEWS_EVENT"],
  },
  {
    evidenceId: "bitget-candles-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://www.bitget.com/api-doc/contract/market/Get-Candle-Data",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "TRADE_KLINE",
      "MARK_PRICE_KLINE",
      "INDEX_PRICE_KLINE",
    ],
  },
  {
    evidenceId: "bitget-market-api-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://www.bitget.com/api-doc/common/intro",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "SERVER_TIME",
      "SPOT_INSTRUMENT_CATALOG",
      "TICKER",
      "MARK_PRICE",
      "INDEX_PRICE",
      "PUBLIC_TRADE",
      "ORDER_BOOK_SNAPSHOT",
      "OPEN_INTEREST_CURRENT",
      "FUNDING_CURRENT",
      "LONG_SHORT_RATIO",
    ],
  },
  {
    evidenceId: "bitget-depth-websocket-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://www.bitget.com/api-doc/contract/websocket/public/Order-Book-Channel",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["ORDER_BOOK_DELTA"],
  },
  {
    evidenceId: "bitget-funding-history-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url:
      "https://www.bitget.com/api-doc/classic/contract/market/Get-History-Funding-Rate",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["FUNDING_HISTORY"],
  },
  {
    evidenceId: "bitget-stock-perpetuals-2026-07-23",
    sourceId: "BITGET_FUTURES",
    evidenceType: "OFFICIAL_PRODUCT_DOCUMENTATION",
    url: "https://www.bitget.com/support/articles/12560603835927",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "EQUITY_SESSION_REFERENCE",
      "EQUITY_CORPORATE_ACTION",
    ],
  },
  {
    evidenceId: "coinglass-endpoint-overview-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://docs.coinglass.com/reference/endpoint-overview",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "SPOT_INSTRUMENT_CATALOG",
      "TICKER",
      "TRADE_KLINE",
      "ORDER_BOOK_SNAPSHOT",
      "OPEN_INTEREST_CURRENT",
      "OPEN_INTEREST_HISTORY",
      "FUNDING_CURRENT",
      "FUNDING_HISTORY",
      "LIQUIDATION_EVENT",
      "LONG_SHORT_RATIO",
      "TAKER_FLOW",
      "OPTIONS_MARKET_CONTEXT",
      "ETF_FLOW_CONTEXT",
      "EXCHANGE_BALANCE_CONTEXT",
      "SENTIMENT_INDEX_CONTEXT",
      "TOKEN_UNLOCK_EVENT",
      "MARKET_NEWS_EVENT",
    ],
  },
  {
    evidenceId: "coinglass-authentication-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://docs.coinglass.com/reference/authentication",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: M1_CAPABILITY_IDS.filter((capabilityId) =>
      capabilityId !== "SERVER_TIME"
    ),
  },
  {
    evidenceId: "coinglass-hobbyist-pricing-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_PLAN_DOCUMENTATION",
    url: "https://www.coinglass.com/pricing",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: M1_CAPABILITY_IDS.filter((capabilityId) =>
      capabilityId !== "SERVER_TIME"
    ),
  },
  {
    evidenceId: "coinglass-supported-coins-hobbyist-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://docs.coinglass.com/reference/trading-market",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["DERIVATIVE_INSTRUMENT_CATALOG"],
  },
  {
    evidenceId: "coinglass-news-hobbyist-unavailable-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://docs.coinglass.com/reference/article-list",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["MARKET_NEWS_EVENT"],
  },
  {
    evidenceId: "coinglass-liquidation-ws-standard-2026-07-23",
    sourceId: "COINGLASS_V4",
    evidenceType: "OFFICIAL_API_DOCUMENTATION",
    url: "https://docs.coinglass.com/reference/ws-liquidation-order",
    reviewedAt: REVIEWED_AT,
    captureStatus: "REFERENCE_ONLY_UNHASHED",
    contentDigest: null,
    supportsCapabilityIds: ["LIQUIDATION_EVENT"],
  },
] as const satisfies readonly M1EvidenceReference[];

export const M1_FOUR_VENUE_SOURCE_PROFILES = [
  {
    sourceId: "BINANCE_FUTURES",
    sourceClass: "VENUE",
    role: "PRIMARY_POINT_IN_TIME_FACT_SOURCE",
    accountPlan: "PUBLIC_NO_ACCOUNT",
    credentialClass: "PUBLIC_NO_CREDENTIAL",
    rightsStatus: "OFFICIAL_TERMS_REVIEW_REQUIRED",
    jurisdictionStatus: "RUNTIME_AVAILABILITY_UNVERIFIED",
    implementationBoundary: "SCOPE_V1_PARTIAL_ONLY",
    officialEvidenceIds: [
      "binance-public-data-archive-2026-07-23",
      "binance-stock-perpetuals-2026-07-23",
      "binance-usdm-market-data-2026-07-23",
      "binance-usdm-websocket-market-streams-2026-07-23",
    ],
    failureSemantics: ALL_SOURCE_FAILURES,
    secretMaterialPresent: false,
  },
  {
    sourceId: "OKX_SWAP",
    sourceClass: "VENUE",
    role: "PRIMARY_POINT_IN_TIME_FACT_SOURCE",
    accountPlan: "PUBLIC_NO_ACCOUNT",
    credentialClass: "PUBLIC_NO_CREDENTIAL",
    rightsStatus: "OFFICIAL_TERMS_REVIEW_REQUIRED",
    jurisdictionStatus: "RUNTIME_AVAILABILITY_UNVERIFIED",
    implementationBoundary: "SCOPE_V1_PARTIAL_ONLY",
    officialEvidenceIds: [
      "okx-instrument-channel-2026-07-23",
      "okx-stock-perpetuals-2026-07-23",
      "okx-v5-api-2026-07-23",
    ],
    failureSemantics: ALL_SOURCE_FAILURES,
    secretMaterialPresent: false,
  },
  {
    sourceId: "BYBIT_DERIVATIVES",
    sourceClass: "VENUE",
    role: "PRIMARY_POINT_IN_TIME_FACT_SOURCE",
    accountPlan: "PUBLIC_NO_ACCOUNT",
    credentialClass: "PUBLIC_NO_CREDENTIAL",
    rightsStatus: "OFFICIAL_TERMS_REVIEW_REQUIRED",
    jurisdictionStatus: "RUNTIME_AVAILABILITY_UNVERIFIED",
    implementationBoundary: "SCOPE_V1_PARTIAL_ONLY",
    officialEvidenceIds: [
      "bybit-announcements-api-2026-07-23",
      "bybit-instrument-info-2026-07-23",
      "bybit-liquidation-websocket-2026-07-23",
      "bybit-market-api-2026-07-23",
      "bybit-orderbook-websocket-2026-07-23",
      "bybit-tradfi-perpetuals-2026-07-23",
    ],
    failureSemantics: ALL_SOURCE_FAILURES,
    secretMaterialPresent: false,
  },
  {
    sourceId: "BITGET_FUTURES",
    sourceClass: "VENUE",
    role: "PRIMARY_POINT_IN_TIME_FACT_SOURCE",
    accountPlan: "PUBLIC_NO_ACCOUNT",
    credentialClass: "PUBLIC_NO_CREDENTIAL",
    rightsStatus: "OFFICIAL_TERMS_REVIEW_REQUIRED",
    jurisdictionStatus: "RUNTIME_AVAILABILITY_UNVERIFIED",
    implementationBoundary: "NOT_IMPLEMENTED_SCOPE_V2",
    officialEvidenceIds: [
      "bitget-announcements-api-2026-07-23",
      "bitget-candles-2026-07-23",
      "bitget-contract-config-2026-07-23",
      "bitget-depth-websocket-2026-07-23",
      "bitget-funding-history-2026-07-23",
      "bitget-market-api-2026-07-23",
      "bitget-stock-perpetuals-2026-07-23",
    ],
    failureSemantics: ALL_SOURCE_FAILURES,
    secretMaterialPresent: false,
  },
  {
    sourceId: "COINGLASS_V4",
    sourceClass: "AGGREGATOR",
    role: "CANDIDATE_CONFIRMATION_AND_CONTEXT_SOURCE",
    accountPlan: "HOBBYIST_USER_CONFIRMED",
    credentialClass: "READ_ONLY_API_KEY",
    rightsStatus: "PERSONAL_USE_PLAN_TERMS_REVIEW_REQUIRED",
    jurisdictionStatus: "RUNTIME_AVAILABILITY_UNVERIFIED",
    implementationBoundary: "NOT_IMPLEMENTED_SCOPE_V2",
    officialEvidenceIds: [
      "coinglass-authentication-2026-07-23",
      "coinglass-endpoint-overview-2026-07-23",
      "coinglass-hobbyist-pricing-2026-07-23",
      "coinglass-liquidation-ws-standard-2026-07-23",
      "coinglass-news-hobbyist-unavailable-2026-07-23",
      "coinglass-supported-coins-hobbyist-2026-07-23",
    ],
    failureSemantics: ALL_SOURCE_FAILURES,
    secretMaterialPresent: false,
  },
] as const satisfies readonly M1SourceProfile[];

type Seed = {
  endpoint?: string;
  channel?: string;
  evidenceIds: readonly string[];
  documentationStatus?: M1CapabilityRow["documentationStatus"];
  entitlementStatus?: M1CapabilityRow["entitlementStatus"];
  disposition?: M1CapabilityRow["disposition"];
  assetDomains?: readonly M1AssetDomain[];
  sourceSemantics?: string;
  rateLimitRule?: string;
  rateLimitEvidenceId?: string;
  paginationMode?: M1CapabilityRow["pagination"]["mode"];
  paginationRule?: string;
  historyHorizon?: string;
  pushCadence?: string;
  pointInTimeSuitability?: M1CapabilityRow["pointInTimeSuitability"];
  replaySuitability?: M1CapabilityRow["replaySuitability"];
  costAndStorageClass?: M1CapabilityRow["costAndStorageClass"];
  reasonCodes?: readonly string[];
  implementedScopeV1?: {
    implementationEvidence: readonly string[];
    runtimeEvidenceIds: readonly string[];
  };
};

type SeedMap = { readonly [K in M1CapabilityId]: Seed };

function documented(
  endpoint: string | null,
  evidenceIds: readonly string[],
  overrides: Omit<Seed, "endpoint" | "evidenceIds"> = {},
): Seed {
  return {
    ...overrides,
    endpoint: endpoint ?? undefined,
    evidenceIds,
    documentationStatus: "OFFICIAL_DOCUMENTED",
    disposition: overrides.disposition ?? "ADOPTED_AS_FACT",
  };
}

function documentedChannel(
  channel: string,
  evidenceIds: readonly string[],
  overrides: Omit<Seed, "channel" | "evidenceIds"> = {},
): Seed {
  return {
    ...overrides,
    channel,
    evidenceIds,
    documentationStatus: "OFFICIAL_DOCUMENTED",
    disposition: overrides.disposition ?? "ADOPTED_AS_FACT",
  };
}

function unavailable(reasonCode: string): Seed {
  return {
    evidenceIds: [],
    documentationStatus: "NO_OFFICIAL_CAPABILITY_FOUND",
    entitlementStatus: "NOT_APPLICABLE",
    disposition: "UNAVAILABLE",
    historyHorizon: "UNAVAILABLE",
    pushCadence: "UNAVAILABLE",
    pointInTimeSuitability: "UNSUITABLE",
    replaySuitability: "UNSUITABLE",
    costAndStorageClass: "NONE",
    reasonCodes: [reasonCode],
  };
}

function notApplicable(reasonCode: string): Seed {
  return {
    evidenceIds: [],
    documentationStatus: "NOT_APPLICABLE",
    entitlementStatus: "NOT_APPLICABLE",
    disposition: "UNAVAILABLE",
    historyHorizon: "NOT_APPLICABLE",
    pushCadence: "NOT_APPLICABLE",
    pointInTimeSuitability: "UNSUITABLE",
    replaySuitability: "UNSUITABLE",
    costAndStorageClass: "NONE",
    reasonCodes: [reasonCode],
  };
}

function documentedUnsupported(
  evidenceIds: readonly string[],
  reasonCode: string,
  overrides: Omit<Seed, "evidenceIds" | "reasonCodes"> = {},
): Seed {
  return {
    ...overrides,
    evidenceIds,
    documentationStatus: "OFFICIAL_DOCUMENTED",
    disposition: "OBSERVED_UNSUPPORTED",
    pointInTimeSuitability: "UNVERIFIED",
    replaySuitability: "UNVERIFIED",
    reasonCodes: [reasonCode],
  };
}

function coinGlassGated(
  endpoint: string,
  evidenceIds: readonly string[],
  overrides: Omit<
    Seed,
    "endpoint" | "evidenceIds" | "documentationStatus" | "entitlementStatus"
  > = {},
): Seed {
  return {
    ...overrides,
    endpoint,
    evidenceIds,
    documentationStatus: "OFFICIAL_DOCUMENTED_PLAN_GATED",
    entitlementStatus: "PLAN_ENTITLEMENT_UNVERIFIED",
    disposition: overrides.disposition ?? "ADOPTED_AS_FACT",
    rateLimitRule: "Hobbyist plan maximum 30 requests per minute.",
    rateLimitEvidenceId: "coinglass-hobbyist-pricing-2026-07-23",
    costAndStorageClass: "EXTERNAL_QUOTA_BOUND",
    reasonCodes: [
      ...(overrides.reasonCodes ?? []),
      "endpoint_entitlement_requires_exact_plan_probe",
    ],
  };
}

function coinGlassRejected(
  endpoint: string,
  evidenceIds: readonly string[],
  reasonCode: string,
): Seed {
  return {
    endpoint,
    evidenceIds,
    documentationStatus: "OFFICIAL_DOCUMENTED_PLAN_GATED",
    entitlementStatus: "HOBBYIST_UNAVAILABLE",
    disposition: "REJECTED_UNLICENSED",
    rateLimitRule: "Hobbyist plan maximum 30 requests per minute.",
    rateLimitEvidenceId: "coinglass-hobbyist-pricing-2026-07-23",
    historyHorizon: "UNAVAILABLE_TO_HOBBYIST",
    pushCadence: "UNAVAILABLE_TO_HOBBYIST",
    pointInTimeSuitability: "UNSUITABLE",
    replaySuitability: "UNSUITABLE",
    costAndStorageClass: "NONE",
    reasonCodes: [reasonCode],
  };
}

const BINANCE_API = ["binance-usdm-market-data-2026-07-23"];
const BINANCE_WS = ["binance-usdm-websocket-market-streams-2026-07-23"];
const OKX_API = ["okx-v5-api-2026-07-23"];
const BYBIT_API = ["bybit-market-api-2026-07-23"];
const BITGET_API = ["bitget-market-api-2026-07-23"];

const BINANCE_SEEDS = {
  SERVER_TIME: documented("/fapi/v1/time", BINANCE_API),
  DERIVATIVE_INSTRUMENT_CATALOG: documented(
    "/fapi/v1/exchangeInfo",
    ["binance-usdm-market-data-2026-07-23", "binance-stock-perpetuals-2026-07-23"],
    {
      assetDomains: DERIVATIVE_DOMAINS,
      implementedScopeV1: {
        implementationEvidence: [
          "src/v2/modules/universe/adapters/binance-catalog.ts",
        ],
        runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
      },
    },
  ),
  SPOT_INSTRUMENT_CATALOG: unavailable(
    "spot_catalog_not_reviewed_in_binance_futures_source",
  ),
  LISTING_ANNOUNCEMENT: unavailable(
    "official_machine_readable_announcement_api_not_verified",
  ),
  INSTRUMENT_STATUS_STREAM: documentedChannel(
    "!contractInfo",
    BINANCE_WS,
    {
      pushCadence: "EVENT_DRIVEN_PROVIDER_STREAM",
      reasonCodes: ["channel_payload_mapping_requires_scope_v2_adapter"],
    },
  ),
  TICKER: documented("/fapi/v1/ticker/24hr", BINANCE_API),
  MARK_PRICE: documented("/fapi/v1/premiumIndex", BINANCE_API, {
    implementedScopeV1: {
      implementationEvidence: [
        "src/v2/modules/market-fact/adapters/binance-mark-price.ts",
      ],
      runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
    },
  }),
  INDEX_PRICE: documented("/fapi/v1/premiumIndex", BINANCE_API),
  TRADE_KLINE: documented("/fapi/v1/klines", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
  }),
  MARK_PRICE_KLINE: documented("/fapi/v1/markPriceKlines", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
  }),
  INDEX_PRICE_KLINE: documented("/fapi/v1/indexPriceKlines", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
  }),
  PUBLIC_TRADE: documented("/fapi/v1/aggTrades", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  ORDER_BOOK_SNAPSHOT: documented("/fapi/v1/depth", BINANCE_API, {
    paginationMode: "LIMIT_ONLY",
  }),
  ORDER_BOOK_DELTA: documentedChannel(
    "<symbol>@depth",
    BINANCE_WS,
    {
      pushCadence: "100ms_OR_250ms_PROVIDER_STREAM",
      costAndStorageClass: "HIGH_EVENT_STREAM",
    },
  ),
  OPEN_INTEREST_CURRENT: documented("/fapi/v1/openInterest", BINANCE_API),
  OPEN_INTEREST_HISTORY: documented(
    "/futures/data/openInterestHist",
    BINANCE_API,
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon: "OFFICIAL_ENDPOINT_LIMITED_RECENT_HISTORY",
    },
  ),
  FUNDING_CURRENT: documented("/fapi/v1/premiumIndex", BINANCE_API),
  FUNDING_HISTORY: documented("/fapi/v1/fundingRate", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
  }),
  LIQUIDATION_EVENT: documentedChannel("!forceOrder@arr", BINANCE_WS, {
    pushCadence: "1000ms_PROVIDER_SNAPSHOT_STREAM",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  LONG_SHORT_RATIO: documented(
    "/futures/data/globalLongShortAccountRatio",
    BINANCE_API,
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon: "OFFICIAL_ENDPOINT_LIMITED_RECENT_HISTORY",
    },
  ),
  TAKER_FLOW: documented("/futures/data/takerlongshortRatio", BINANCE_API, {
    paginationMode: "TIME_WINDOW",
    historyHorizon: "OFFICIAL_ENDPOINT_LIMITED_RECENT_HISTORY",
  }),
  PRICE_LIMIT_RISK_RULE: documented("/fapi/v1/exchangeInfo", BINANCE_API),
  INSTRUMENT_FEE_SCHEDULE: unavailable(
    "public_instrument_fee_schedule_not_verified_without_account_auth",
  ),
  HISTORICAL_BULK_ARCHIVE: documented(
    "https://data.binance.vision/",
    ["binance-public-data-archive-2026-07-23"],
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon: "OBJECT_MANIFEST_DEPENDENT",
      replaySuitability: "CONDITIONAL",
      costAndStorageClass: "MEDIUM_TIMESERIES",
      reasonCodes: ["rights_review_required_before_bulk_retention"],
    },
  ),
  EQUITY_SESSION_REFERENCE: documentedUnsupported(
    ["binance-stock-perpetuals-2026-07-23"],
    "machine_readable_session_calendar_not_verified",
    { assetDomains: EQUITY },
  ),
  EQUITY_CORPORATE_ACTION: documentedUnsupported(
    ["binance-stock-perpetuals-2026-07-23"],
    "machine_readable_corporate_action_feed_not_verified",
    { assetDomains: EQUITY },
  ),
  FX_REFERENCE: unavailable("machine_readable_fx_reference_not_verified"),
  OPTIONS_MARKET_CONTEXT: notApplicable(
    "venue_derivatives_source_not_selected_for_options_context",
  ),
  ETF_FLOW_CONTEXT: notApplicable(
    "venue_derivatives_source_not_selected_for_etf_flow_context",
  ),
  EXCHANGE_BALANCE_CONTEXT: notApplicable(
    "venue_derivatives_source_not_selected_for_exchange_balance_context",
  ),
  SENTIMENT_INDEX_CONTEXT: notApplicable(
    "venue_derivatives_source_not_selected_for_sentiment_context",
  ),
  TOKEN_UNLOCK_EVENT: unavailable(
    "official_machine_readable_token_unlock_feed_not_verified",
  ),
  MARKET_NEWS_EVENT: unavailable(
    "official_machine_readable_news_api_not_verified",
  ),
} as const satisfies SeedMap;

const OKX_SEEDS = {
  SERVER_TIME: documented("/api/v5/public/time", OKX_API),
  DERIVATIVE_INSTRUMENT_CATALOG: documented(
    "/api/v5/public/instruments?instType=SWAP",
    ["okx-v5-api-2026-07-23", "okx-stock-perpetuals-2026-07-23"],
    {
      assetDomains: DERIVATIVE_DOMAINS,
      implementedScopeV1: {
        implementationEvidence: [
          "src/v2/modules/universe/adapters/okx-catalog.ts",
        ],
        runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
      },
    },
  ),
  SPOT_INSTRUMENT_CATALOG: documented(
    "/api/v5/public/instruments?instType=SPOT",
    OKX_API,
    { assetDomains: ["ASSET_LISTING_WATCH"] },
  ),
  LISTING_ANNOUNCEMENT: unavailable(
    "official_machine_readable_announcement_api_not_verified",
  ),
  INSTRUMENT_STATUS_STREAM: documentedChannel(
    "instruments",
    ["okx-instrument-channel-2026-07-23"],
    {
      pushCadence: "EVENT_DRIVEN_PROVIDER_STREAM",
      reasonCodes: ["channel_payload_mapping_requires_scope_v2_adapter"],
    },
  ),
  TICKER: documented("/api/v5/market/tickers?instType=SWAP", OKX_API),
  MARK_PRICE: documented("/api/v5/public/mark-price?instType=SWAP", OKX_API, {
    implementedScopeV1: {
      implementationEvidence: [
        "src/v2/modules/market-fact/adapters/okx-mark-price.ts",
      ],
      runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
    },
  }),
  INDEX_PRICE: documented("/api/v5/market/index-tickers", OKX_API),
  TRADE_KLINE: documented("/api/v5/market/history-candles", OKX_API, {
    paginationMode: "TIME_WINDOW",
  }),
  MARK_PRICE_KLINE: documented("/api/v5/market/mark-price-candles", OKX_API, {
    paginationMode: "TIME_WINDOW",
  }),
  INDEX_PRICE_KLINE: documented("/api/v5/market/index-candles", OKX_API, {
    paginationMode: "TIME_WINDOW",
  }),
  PUBLIC_TRADE: documented("/api/v5/market/history-trades", OKX_API, {
    paginationMode: "CURSOR",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  ORDER_BOOK_SNAPSHOT: documented("/api/v5/market/books", OKX_API, {
    paginationMode: "LIMIT_ONLY",
  }),
  ORDER_BOOK_DELTA: documentedChannel("books", OKX_API, {
    pushCadence: "SEQUENCED_PROVIDER_STREAM",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  OPEN_INTEREST_CURRENT: documented("/api/v5/public/open-interest", OKX_API),
  OPEN_INTEREST_HISTORY: documented(
    "/api/v5/rubik/stat/contracts/open-interest-history",
    OKX_API,
    { paginationMode: "TIME_WINDOW" },
  ),
  FUNDING_CURRENT: documented("/api/v5/public/funding-rate", OKX_API),
  FUNDING_HISTORY: documented(
    "/api/v5/public/funding-rate-history",
    OKX_API,
    { paginationMode: "CURSOR" },
  ),
  LIQUIDATION_EVENT: documented("/api/v5/public/liquidation-orders", OKX_API, {
    paginationMode: "TIME_WINDOW",
  }),
  LONG_SHORT_RATIO: documented(
    "/api/v5/rubik/stat/contracts/long-short-account-ratio",
    OKX_API,
    { paginationMode: "TIME_WINDOW" },
  ),
  TAKER_FLOW: documented("/api/v5/rubik/stat/taker-volume", OKX_API, {
    paginationMode: "TIME_WINDOW",
  }),
  PRICE_LIMIT_RISK_RULE: documented("/api/v5/public/price-limit", OKX_API),
  INSTRUMENT_FEE_SCHEDULE: unavailable(
    "fee_rate_endpoint_requires_private_account_auth",
  ),
  HISTORICAL_BULK_ARCHIVE: unavailable(
    "immutable_public_bulk_archive_not_qualified",
  ),
  EQUITY_SESSION_REFERENCE: documentedUnsupported(
    ["okx-stock-perpetuals-2026-07-23"],
    "machine_readable_session_calendar_not_verified",
    { assetDomains: EQUITY },
  ),
  EQUITY_CORPORATE_ACTION: documentedUnsupported(
    ["okx-stock-perpetuals-2026-07-23"],
    "machine_readable_corporate_action_feed_not_verified",
    { assetDomains: EQUITY },
  ),
  FX_REFERENCE: unavailable("machine_readable_fx_reference_not_verified"),
  OPTIONS_MARKET_CONTEXT: notApplicable(
    "venue_swap_source_not_selected_for_options_context",
  ),
  ETF_FLOW_CONTEXT: notApplicable(
    "venue_swap_source_not_selected_for_etf_flow_context",
  ),
  EXCHANGE_BALANCE_CONTEXT: notApplicable(
    "venue_swap_source_not_selected_for_exchange_balance_context",
  ),
  SENTIMENT_INDEX_CONTEXT: notApplicable(
    "venue_swap_source_not_selected_for_sentiment_context",
  ),
  TOKEN_UNLOCK_EVENT: unavailable(
    "official_machine_readable_token_unlock_feed_not_verified",
  ),
  MARKET_NEWS_EVENT: unavailable(
    "official_machine_readable_news_api_not_verified",
  ),
} as const satisfies SeedMap;

const BYBIT_SEEDS = {
  SERVER_TIME: documented("/v5/market/time", BYBIT_API),
  DERIVATIVE_INSTRUMENT_CATALOG: documented(
    "/v5/market/instruments-info?category=linear",
    [
      "bybit-instrument-info-2026-07-23",
      "bybit-tradfi-perpetuals-2026-07-23",
    ],
    {
      assetDomains: DERIVATIVE_DOMAINS,
      paginationMode: "CURSOR",
      paginationRule: "Follow nextPageCursor until empty; repeated cursor fails closed.",
      implementedScopeV1: {
        implementationEvidence: [
          "src/v2/modules/universe/adapters/bybit-catalog.ts",
        ],
        runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
      },
    },
  ),
  SPOT_INSTRUMENT_CATALOG: documented(
    "/v5/market/instruments-info?category=spot",
    ["bybit-instrument-info-2026-07-23"],
    {
      assetDomains: ["ASSET_LISTING_WATCH"],
      paginationMode: "CURSOR",
    },
  ),
  LISTING_ANNOUNCEMENT: documented(
    "/v5/announcements/index",
    ["bybit-announcements-api-2026-07-23"],
    {
      assetDomains: LISTING_DOMAINS,
      paginationMode: "CURSOR",
      historyHorizon: "PROVIDER_ANNOUNCEMENT_HISTORY_ENDPOINT_DEPENDENT",
      rateLimitRule: "Official endpoint-specific IP limit applies.",
      rateLimitEvidenceId: "bybit-announcements-api-2026-07-23",
    },
  ),
  INSTRUMENT_STATUS_STREAM: unavailable(
    "official_machine_readable_instrument_status_stream_not_verified",
  ),
  TICKER: documented("/v5/market/tickers", BYBIT_API),
  MARK_PRICE: documented("/v5/market/tickers", BYBIT_API, {
    implementedScopeV1: {
      implementationEvidence: [
        "src/v2/modules/market-fact/adapters/bybit-mark-price.ts",
      ],
      runtimeEvidenceIds: ["V2_M1_1_IDENTITY_FACT_DELIVERY_REPORT"],
    },
  }),
  INDEX_PRICE: documented("/v5/market/tickers", BYBIT_API),
  TRADE_KLINE: documented("/v5/market/kline", BYBIT_API, {
    paginationMode: "TIME_WINDOW",
  }),
  MARK_PRICE_KLINE: documented("/v5/market/mark-price-kline", BYBIT_API, {
    paginationMode: "TIME_WINDOW",
  }),
  INDEX_PRICE_KLINE: documented("/v5/market/index-price-kline", BYBIT_API, {
    paginationMode: "TIME_WINDOW",
  }),
  PUBLIC_TRADE: documented("/v5/market/recent-trade", BYBIT_API, {
    paginationMode: "CURSOR",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  ORDER_BOOK_SNAPSHOT: documented("/v5/market/orderbook", BYBIT_API, {
    paginationMode: "LIMIT_ONLY",
  }),
  ORDER_BOOK_DELTA: documentedChannel(
    "orderbook.{depth}.{symbol}",
    ["bybit-orderbook-websocket-2026-07-23"],
    {
      pushCadence: "DEPTH_SPECIFIC_10ms_TO_500ms_PROVIDER_STREAM",
      costAndStorageClass: "HIGH_EVENT_STREAM",
    },
  ),
  OPEN_INTEREST_CURRENT: documented("/v5/market/open-interest", BYBIT_API, {
    paginationMode: "CURSOR",
  }),
  OPEN_INTEREST_HISTORY: documented("/v5/market/open-interest", BYBIT_API, {
    paginationMode: "CURSOR",
    historyHorizon: "PROVIDER_INTERVAL_AND_LIMIT_DEPENDENT",
  }),
  FUNDING_CURRENT: documented("/v5/market/tickers", BYBIT_API),
  FUNDING_HISTORY: documented("/v5/market/history-fund-rate", BYBIT_API, {
    paginationMode: "CURSOR",
  }),
  LIQUIDATION_EVENT: documentedChannel(
    "allLiquidation.{symbol}",
    ["bybit-liquidation-websocket-2026-07-23"],
    {
      pushCadence: "500ms_PROVIDER_STREAM",
      costAndStorageClass: "HIGH_EVENT_STREAM",
    },
  ),
  LONG_SHORT_RATIO: documented("/v5/market/account-ratio", BYBIT_API, {
    paginationMode: "TIME_WINDOW",
  }),
  TAKER_FLOW: documented(
    "/v5/market/recent-trade",
    BYBIT_API,
    {
      disposition: "DERIVED_WITH_LINEAGE",
      sourceSemantics:
        "Aggressive side is derived from public trade tick direction with source lineage.",
      paginationMode: "CURSOR",
      costAndStorageClass: "HIGH_EVENT_STREAM",
      reasonCodes: ["no_direct_taker_flow_endpoint_selected"],
    },
  ),
  PRICE_LIMIT_RISK_RULE: documented(
    "/v5/market/order-price-limit + /v5/market/instruments-info",
    ["bybit-instrument-info-2026-07-23", "bybit-market-api-2026-07-23"],
  ),
  INSTRUMENT_FEE_SCHEDULE: unavailable(
    "fee_rate_endpoint_requires_private_account_auth",
  ),
  HISTORICAL_BULK_ARCHIVE: unavailable(
    "immutable_public_bulk_archive_not_qualified",
  ),
  EQUITY_SESSION_REFERENCE: documentedUnsupported(
    ["bybit-tradfi-perpetuals-2026-07-23"],
    "machine_readable_session_calendar_not_verified",
    { assetDomains: EQUITY },
  ),
  EQUITY_CORPORATE_ACTION: documentedUnsupported(
    ["bybit-tradfi-perpetuals-2026-07-23"],
    "machine_readable_corporate_action_feed_not_verified",
    { assetDomains: EQUITY },
  ),
  FX_REFERENCE: unavailable("machine_readable_fx_reference_not_verified"),
  OPTIONS_MARKET_CONTEXT: notApplicable(
    "venue_linear_source_not_selected_for_options_context",
  ),
  ETF_FLOW_CONTEXT: notApplicable(
    "venue_linear_source_not_selected_for_etf_flow_context",
  ),
  EXCHANGE_BALANCE_CONTEXT: notApplicable(
    "venue_linear_source_not_selected_for_exchange_balance_context",
  ),
  SENTIMENT_INDEX_CONTEXT: notApplicable(
    "venue_linear_source_not_selected_for_sentiment_context",
  ),
  TOKEN_UNLOCK_EVENT: unavailable(
    "official_machine_readable_token_unlock_feed_not_verified",
  ),
  MARKET_NEWS_EVENT: documented(
    "/v5/announcements/index",
    ["bybit-announcements-api-2026-07-23"],
    {
      disposition: "OBSERVED_UNSUPPORTED",
      paginationMode: "CURSOR",
      reasonCodes: [
        "announcement_event_may_inform_context_but_cannot_be_market_fact",
      ],
    },
  ),
} as const satisfies SeedMap;

const BITGET_SEEDS = {
  SERVER_TIME: documented("/api/v2/public/time", BITGET_API),
  DERIVATIVE_INSTRUMENT_CATALOG: documented(
    "/api/v2/mix/market/contracts",
    ["bitget-contract-config-2026-07-23", "bitget-stock-perpetuals-2026-07-23"],
    {
      assetDomains: DERIVATIVE_DOMAINS,
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-contract-config-2026-07-23",
      reasonCodes: [
        "isRwa_does_not_prove_stock_identity",
        "stock_identity_requires_scope_v2_normalization",
      ],
    },
  ),
  SPOT_INSTRUMENT_CATALOG: documented(
    "/api/v2/spot/public/symbols",
    BITGET_API,
    { assetDomains: ["ASSET_LISTING_WATCH"] },
  ),
  LISTING_ANNOUNCEMENT: documented(
    "/api/v2/public/annoucements",
    ["bitget-announcements-api-2026-07-23"],
    {
      assetDomains: LISTING_DOMAINS,
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-announcements-api-2026-07-23",
      paginationMode: "CURSOR",
      paginationRule:
        "Maximum 10 records per page; use the last annId as the next cursor.",
      historyHorizon: "ONE_MONTH",
    },
  ),
  INSTRUMENT_STATUS_STREAM: unavailable(
    "official_machine_readable_instrument_status_stream_not_verified",
  ),
  TICKER: documented("/api/v2/mix/market/ticker", BITGET_API),
  MARK_PRICE: documented("/api/v2/mix/market/symbol-price", BITGET_API),
  INDEX_PRICE: documented("/api/v2/mix/market/symbol-price", BITGET_API),
  TRADE_KLINE: documented(
    "/api/v2/mix/market/candles?kLineType=MARKET",
    ["bitget-candles-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-candles-2026-07-23",
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "INTERVAL_DEPENDENT_1M_TO_AT_LEAST_360D_MAX_90D_PER_REQUEST",
    },
  ),
  MARK_PRICE_KLINE: documented(
    "/api/v2/mix/market/candles?kLineType=MARK",
    ["bitget-candles-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-candles-2026-07-23",
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "INTERVAL_DEPENDENT_1M_TO_AT_LEAST_360D_MAX_90D_PER_REQUEST",
    },
  ),
  INDEX_PRICE_KLINE: documented(
    "/api/v2/mix/market/candles?kLineType=INDEX",
    ["bitget-candles-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-candles-2026-07-23",
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "INTERVAL_DEPENDENT_1M_TO_AT_LEAST_360D_MAX_90D_PER_REQUEST",
    },
  ),
  PUBLIC_TRADE: documented("/api/v2/mix/market/fills", BITGET_API, {
    paginationMode: "LIMIT_ONLY",
    costAndStorageClass: "HIGH_EVENT_STREAM",
  }),
  ORDER_BOOK_SNAPSHOT: documented(
    "/api/v2/mix/market/merge-depth",
    BITGET_API,
    { paginationMode: "LIMIT_ONLY" },
  ),
  ORDER_BOOK_DELTA: documentedChannel(
    "books",
    ["bitget-depth-websocket-2026-07-23"],
    {
      pushCadence: "150ms_PROVIDER_STREAM_WITH_CRC32",
      costAndStorageClass: "HIGH_EVENT_STREAM",
    },
  ),
  OPEN_INTEREST_CURRENT: documented(
    "/api/v2/mix/market/open-interest",
    BITGET_API,
  ),
  OPEN_INTEREST_HISTORY: unavailable(
    "official_futures_open_interest_history_endpoint_not_verified",
  ),
  FUNDING_CURRENT: documented(
    "/api/v3/market/current-fund-rate",
    BITGET_API,
  ),
  FUNDING_HISTORY: documented(
    "/api/v2/mix/market/history-fund-rate",
    ["bitget-funding-history-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-funding-history-2026-07-23",
      paginationMode: "PAGE_NUMBER",
      paginationRule: "pageNo with pageSize up to 100.",
    },
  ),
  LIQUIDATION_EVENT: unavailable(
    "official_public_liquidation_event_endpoint_not_verified",
  ),
  LONG_SHORT_RATIO: documented(
    "/api/v2/mix/market/account-long-short",
    BITGET_API,
    { paginationMode: "TIME_WINDOW" },
  ),
  TAKER_FLOW: unavailable("official_direct_taker_flow_endpoint_not_verified"),
  PRICE_LIMIT_RISK_RULE: documented(
    "/api/v2/mix/market/contracts",
    ["bitget-contract-config-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-contract-config-2026-07-23",
    },
  ),
  INSTRUMENT_FEE_SCHEDULE: documented(
    "/api/v2/mix/market/contracts",
    ["bitget-contract-config-2026-07-23"],
    {
      rateLimitRule: "20 requests per second per IP.",
      rateLimitEvidenceId: "bitget-contract-config-2026-07-23",
    },
  ),
  HISTORICAL_BULK_ARCHIVE: unavailable(
    "immutable_public_bulk_archive_not_qualified",
  ),
  EQUITY_SESSION_REFERENCE: documentedUnsupported(
    ["bitget-stock-perpetuals-2026-07-23"],
    "machine_readable_session_calendar_not_verified",
    { assetDomains: EQUITY },
  ),
  EQUITY_CORPORATE_ACTION: documentedUnsupported(
    ["bitget-stock-perpetuals-2026-07-23"],
    "machine_readable_corporate_action_feed_not_verified",
    { assetDomains: EQUITY },
  ),
  FX_REFERENCE: unavailable("machine_readable_fx_reference_not_verified"),
  OPTIONS_MARKET_CONTEXT: notApplicable(
    "venue_futures_source_not_selected_for_options_context",
  ),
  ETF_FLOW_CONTEXT: notApplicable(
    "venue_futures_source_not_selected_for_etf_flow_context",
  ),
  EXCHANGE_BALANCE_CONTEXT: notApplicable(
    "venue_futures_source_not_selected_for_exchange_balance_context",
  ),
  SENTIMENT_INDEX_CONTEXT: notApplicable(
    "venue_futures_source_not_selected_for_sentiment_context",
  ),
  TOKEN_UNLOCK_EVENT: unavailable(
    "official_machine_readable_token_unlock_feed_not_verified",
  ),
  MARKET_NEWS_EVENT: documented(
    "/api/v2/public/annoucements",
    ["bitget-announcements-api-2026-07-23"],
    {
      disposition: "OBSERVED_UNSUPPORTED",
      paginationMode: "CURSOR",
      historyHorizon: "ONE_MONTH",
      reasonCodes: [
        "announcement_event_may_inform_context_but_cannot_be_market_fact",
      ],
    },
  ),
} as const satisfies SeedMap;

const COINGLASS_OVERVIEW = [
  "coinglass-authentication-2026-07-23",
  "coinglass-endpoint-overview-2026-07-23",
  "coinglass-hobbyist-pricing-2026-07-23",
];

const COINGLASS_SEEDS = {
  SERVER_TIME: notApplicable("coinglass_server_time_capability_not_documented"),
  DERIVATIVE_INSTRUMENT_CATALOG: {
    ...coinGlassGated(
      "/api/futures/supported-coins",
      [
        ...COINGLASS_OVERVIEW,
        "coinglass-supported-coins-hobbyist-2026-07-23",
      ],
      {
        disposition: "DERIVED_WITH_LINEAGE",
        assetDomains: CRYPTO,
        sourceSemantics:
          "Supported-coin coverage is confirmation context and cannot replace venue instrument catalogs.",
        reasonCodes: [
          "supported_coins_is_not_a_complete_venue_instrument_catalog",
        ],
      },
    ),
    entitlementStatus: "HOBBYIST_CONFIRMED",
  },
  SPOT_INSTRUMENT_CATALOG: coinGlassGated(
    "/api/spot/supported-coins",
    COINGLASS_OVERVIEW,
    {
      disposition: "DERIVED_WITH_LINEAGE",
      assetDomains: ["ASSET_LISTING_WATCH"],
      reasonCodes: ["cannot_replace_first_party_spot_catalog"],
    },
  ),
  LISTING_ANNOUNCEMENT: unavailable(
    "coinglass_listing_announcement_capability_not_documented",
  ),
  INSTRUMENT_STATUS_STREAM: unavailable(
    "coinglass_instrument_status_stream_not_documented",
  ),
  TICKER: coinGlassGated(
    "/api/futures/pairs-markets",
    COINGLASS_OVERVIEW,
    {
      disposition: "DERIVED_WITH_LINEAGE",
      reasonCodes: ["aggregate_context_cannot_replace_venue_ticker"],
    },
  ),
  MARK_PRICE: unavailable(
    "coinglass_point_in_time_venue_mark_price_not_selected",
  ),
  INDEX_PRICE: unavailable(
    "coinglass_point_in_time_venue_index_price_not_selected",
  ),
  TRADE_KLINE: coinGlassGated(
    "/api/futures/price/history",
    COINGLASS_OVERVIEW,
    {
      disposition: "REJECTED_REDUNDANT",
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "HOBBYIST_4H_INTERVAL_UP_TO_180_DAYS_FINER_INTERVALS_NOT_INCLUDED",
      replaySuitability: "CONDITIONAL",
      reasonCodes: ["first_party_venue_klines_are_preferred"],
    },
  ),
  MARK_PRICE_KLINE: unavailable(
    "coinglass_mark_price_kline_not_documented_for_selected_plan",
  ),
  INDEX_PRICE_KLINE: unavailable(
    "coinglass_index_price_kline_not_documented_for_selected_plan",
  ),
  PUBLIC_TRADE: unavailable(
    "coinglass_public_trade_tape_not_selected_or_entitlement_unverified",
  ),
  ORDER_BOOK_SNAPSHOT: coinGlassGated(
    "/api/futures/orderbook/ask-bids-history",
    COINGLASS_OVERVIEW,
    {
      disposition: "DERIVED_WITH_LINEAGE",
      historyHorizon: "PLAN_AND_ENDPOINT_DEPENDENT_UNVERIFIED",
      reasonCodes: ["aggregate_orderbook_cannot_seed_venue_local_book"],
    },
  ),
  ORDER_BOOK_DELTA: unavailable(
    "coinglass_sequenced_orderbook_delta_not_selected",
  ),
  OPEN_INTEREST_CURRENT: coinGlassGated(
    "/api/futures/open-interest/exchange-list",
    COINGLASS_OVERVIEW,
  ),
  OPEN_INTEREST_HISTORY: coinGlassGated(
    "/api/futures/open-interest/history",
    COINGLASS_OVERVIEW,
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "HOBBYIST_4H_INTERVAL_UP_TO_180_DAYS_FINER_INTERVALS_NOT_INCLUDED",
      replaySuitability: "CONDITIONAL",
    },
  ),
  FUNDING_CURRENT: coinGlassGated(
    "/api/futures/funding-rate/exchange-list",
    COINGLASS_OVERVIEW,
  ),
  FUNDING_HISTORY: coinGlassGated(
    "/api/futures/funding-rate/history",
    COINGLASS_OVERVIEW,
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "HOBBYIST_4H_INTERVAL_UP_TO_180_DAYS_FINER_INTERVALS_NOT_INCLUDED",
      replaySuitability: "CONDITIONAL",
    },
  ),
  LIQUIDATION_EVENT: coinGlassRejected(
    "wss://open-api-v4.coinglass.com/ws-api",
    [
      ...COINGLASS_OVERVIEW,
      "coinglass-liquidation-ws-standard-2026-07-23",
    ],
    "liquidation_websocket_requires_standard_or_above",
  ),
  LONG_SHORT_RATIO: coinGlassGated(
    "/api/futures/global-long-short-account-ratio/history",
    COINGLASS_OVERVIEW,
    {
      paginationMode: "TIME_WINDOW",
      historyHorizon:
        "HOBBYIST_4H_INTERVAL_UP_TO_180_DAYS_FINER_INTERVALS_NOT_INCLUDED",
      replaySuitability: "CONDITIONAL",
    },
  ),
  TAKER_FLOW: coinGlassGated(
    "/api/futures/taker-buy-sell-volume/exchange-list",
    COINGLASS_OVERVIEW,
  ),
  PRICE_LIMIT_RISK_RULE: unavailable(
    "coinglass_is_not_authority_for_venue_order_price_limits",
  ),
  INSTRUMENT_FEE_SCHEDULE: unavailable(
    "coinglass_is_not_authority_for_account_or_instrument_fees",
  ),
  HISTORICAL_BULK_ARCHIVE: unavailable(
    "coinglass_immutable_bulk_archive_not_documented",
  ),
  EQUITY_SESSION_REFERENCE: unavailable(
    "coinglass_equity_session_reference_not_documented",
  ),
  EQUITY_CORPORATE_ACTION: unavailable(
    "coinglass_equity_corporate_action_feed_not_documented",
  ),
  FX_REFERENCE: unavailable("coinglass_fx_reference_not_documented"),
  OPTIONS_MARKET_CONTEXT: coinGlassGated(
    "/api/option/*",
    COINGLASS_OVERVIEW,
    {
      assetDomains: CROSS_MARKET,
      sourceSemantics:
        "Aggregate options context is retained only as deep-validation context.",
    },
  ),
  ETF_FLOW_CONTEXT: coinGlassGated(
    "/api/etf/*",
    COINGLASS_OVERVIEW,
    { assetDomains: CROSS_MARKET },
  ),
  EXCHANGE_BALANCE_CONTEXT: coinGlassGated(
    "/api/exchange/assets + /api/exchange/balance/list",
    COINGLASS_OVERVIEW,
    { assetDomains: CROSS_MARKET },
  ),
  SENTIMENT_INDEX_CONTEXT: coinGlassGated(
    "/api/index/fear-greed-history",
    COINGLASS_OVERVIEW,
    { assetDomains: CROSS_MARKET },
  ),
  TOKEN_UNLOCK_EVENT: coinGlassGated(
    "/api/coin/unlock-list",
    COINGLASS_OVERVIEW,
    {
      assetDomains: ["CRYPTO_LINEAR_PERPETUAL", "ASSET_LISTING_WATCH"],
      reasonCodes: [
        "event_context_only_never_a_direction_signal",
        "exact_hobbyist_entitlement_unverified",
      ],
    },
  ),
  MARKET_NEWS_EVENT: coinGlassRejected(
    "/api/article/list",
    [
      ...COINGLASS_OVERVIEW,
      "coinglass-news-hobbyist-unavailable-2026-07-23",
    ],
    "news_endpoint_is_unavailable_on_hobbyist",
  ),
} as const satisfies SeedMap;

const SEEDS_BY_SOURCE = {
  BINANCE_FUTURES: BINANCE_SEEDS,
  OKX_SWAP: OKX_SEEDS,
  BYBIT_DERIVATIVES: BYBIT_SEEDS,
  BITGET_FUTURES: BITGET_SEEDS,
  COINGLASS_V4: COINGLASS_SEEDS,
} as const satisfies Record<M1SourceId, SeedMap>;

const DEFINITIONS_BY_ID = new Map(
  M1_FOUR_VENUE_CAPABILITY_DEFINITIONS.map((definition) => [
    definition.capabilityId,
    definition,
  ]),
);
const SOURCE_PROFILE_BY_ID = new Map(
  M1_FOUR_VENUE_SOURCE_PROFILES.map((source) => [source.sourceId, source]),
);

function buildRow(
  sourceId: M1SourceId,
  capabilityId: M1CapabilityId,
  seed: Seed,
): M1CapabilityRow {
  const definition = DEFINITIONS_BY_ID.get(capabilityId);
  const source = SOURCE_PROFILE_BY_ID.get(sourceId);
  if (!definition || !source) {
    throw new Error(`missing registry definition for ${sourceId}:${capabilityId}`);
  }

  const unavailableRow = seed.documentationStatus === "NOT_APPLICABLE" ||
    seed.documentationStatus === "NO_OFFICIAL_CAPABILITY_FOUND";
  const documentedRow = !unavailableRow;
  const isCoinGlass = sourceId === "COINGLASS_V4";
  const entitlementStatus = seed.entitlementStatus ??
    (documentedRow
      ? isCoinGlass
        ? "PLAN_ENTITLEMENT_UNVERIFIED"
        : "PUBLIC_NO_KEY"
      : "NOT_APPLICABLE");
  const rateLimit = !documentedRow
    ? {
      status: "NOT_APPLICABLE" as const,
      rule: null,
      evidenceId: null,
    }
    : seed.rateLimitEvidenceId && seed.rateLimitRule
      ? {
        status: "DOCUMENTED" as const,
        rule: seed.rateLimitRule,
        evidenceId: seed.rateLimitEvidenceId,
      }
      : {
        status: "UNVERIFIED" as const,
        rule: "Endpoint-specific official limit must be captured before activation.",
        evidenceId: null,
      };

  return {
    sourceId,
    capabilityId,
    assetDomains: [...(seed.assetDomains ?? definition.defaultAssetDomains)],
    endpoint: seed.endpoint ?? null,
    channel: seed.channel ?? null,
    sourceSemantics: seed.sourceSemantics ?? definition.factSemantics,
    authClass: documentedRow
      ? source.credentialClass
      : "NOT_APPLICABLE",
    documentationStatus:
      seed.documentationStatus ?? "OFFICIAL_DOCUMENTED",
    entitlementStatus,
    rateLimit,
    pagination: {
      mode: unavailableRow
        ? "NOT_APPLICABLE"
        : seed.paginationMode ?? "UNVERIFIED",
      rule: unavailableRow
        ? null
        : seed.paginationRule ??
          "Pagination must terminate explicitly; truncation fails closed.",
    },
    historyHorizon: seed.historyHorizon ??
      (documentedRow
        ? "CURRENT_OR_ENDPOINT_DEFINED_ONLY_NO_ASSUMED_BACKFILL"
        : "UNAVAILABLE"),
    pushCadence: seed.pushCadence ??
      (seed.channel ? "PROVIDER_STREAM_SEMANTICS" : "REST_PULL_ENDPOINT_SPECIFIC"),
    pointInTimeSuitability: seed.pointInTimeSuitability ??
      (documentedRow ? "CONDITIONAL" : "UNSUITABLE"),
    replaySuitability: seed.replaySuitability ??
      (documentedRow ? "CONDITIONAL" : "UNSUITABLE"),
    rightsStatus: documentedRow ? source.rightsStatus : "NOT_APPLICABLE",
    implementationStatus: seed.implementedScopeV1
      ? "IMPLEMENTED_SCOPE_V1_ONLY"
      : unavailableRow
        ? "NOT_APPLICABLE"
        : "NOT_IMPLEMENTED_SCOPE_V2",
    implementationEvidence: seed.implementedScopeV1
      ? [...seed.implementedScopeV1.implementationEvidence]
      : [],
    runtimeProbeStatus: seed.implementedScopeV1
      ? "PASS_SCOPE_V1_ONLY"
      : unavailableRow
        ? "NOT_APPLICABLE"
        : "NOT_RUN_SCOPE_V2",
    runtimeEvidenceIds: seed.implementedScopeV1
      ? [...seed.implementedScopeV1.runtimeEvidenceIds]
      : [],
    disposition: seed.disposition ??
      (documentedRow ? "ADOPTED_AS_FACT" : "UNAVAILABLE"),
    costAndStorageClass: seed.costAndStorageClass ??
      (documentedRow
        ? seed.channel
          ? "HIGH_EVENT_STREAM"
          : "LOW_CURRENT_SNAPSHOT"
        : "NONE"),
    fallbackPolicy: "NO_SYNTHETIC_OR_STALE_FALLBACK",
    evidenceIds: [...seed.evidenceIds],
    failureSemantics: [...source.failureSemantics],
    reasonCodes: [...(seed.reasonCodes ?? [])],
  };
}

const ROWS = M1_SOURCE_IDS.flatMap((sourceId) =>
  M1_CAPABILITY_IDS.map((capabilityId) =>
    buildRow(sourceId, capabilityId, SEEDS_BY_SOURCE[sourceId][capabilityId])
  )
);

export const M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY:
  M1SourceCapabilityRegistry = buildM1SourceCapabilityRegistry({
    schemaVersion: M1_SOURCE_CAPABILITY_REGISTRY_VERSION,
    registryId: "market-radar-v2-four-venue-source-capability-registry.v1",
    scopeEpoch: M1_SCOPE_EPOCH,
    reviewedAt: REVIEWED_AT,
    evidence: [...M1_FOUR_VENUE_OFFICIAL_EVIDENCE],
    sources: [...M1_FOUR_VENUE_SOURCE_PROFILES],
    capabilities: [...M1_FOUR_VENUE_CAPABILITY_DEFINITIONS],
    rows: ROWS,
    venueDenominator: 4,
    sourceDenominator: 5,
    capabilityDenominator: M1_CAPABILITY_IDS.length,
    runtimeNetworkRequestsPerformed: false,
    productionChanged: false,
    secretMaterialPresent: false,
    authorityBoundary:
      "GOVERNANCE_REGISTRY_ONLY_NO_FACT_CANDIDATE_STRATEGY_OR_READY_AUTHORITY",
  });
