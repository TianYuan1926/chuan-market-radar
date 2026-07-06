export type DataSourceCapabilityProviderId =
  | "binance_public"
  | "coinglass_paid"
  | "okx_public";

export type DataSourceCapabilityArea =
  | "capability_contract"
  | "deep_derivatives"
  | "derivatives_public"
  | "light_scan"
  | "market_context"
  | "ohlcv_structure"
  | "review_backfill"
  | "universe";

export type DataSourceImplementationStatus =
  | "blocked"
  | "disabled"
  | "enabled"
  | "partial"
  | "planned";

export type CoinGlassRuntimeEndpointStatus =
  | "auth_error"
  | "empty"
  | "failed"
  | "not_configured"
  | "not_requested"
  | "param_error"
  | "ready"
  | "rate_limited"
  | "upgrade_required";

export type CoinGlassHobbyistSupportStatus =
  | "disabled_by_blueprint"
  | "supported_by_hobbyist"
  | "unsupported_by_hobbyist";

export type DataVisualizationSurface =
  | "candidate_deep_scan"
  | "macro_weather"
  | "review_evolution"
  | "scan_proof"
  | "signal_dossier_evidence"
  | "source_status";

export type DataSourceCapabilityProvider = {
  id: DataSourceCapabilityProviderId;
  label: string;
  implementationStatus: DataSourceImplementationStatus;
  role: "confirming_source" | "cross_check_source" | "primary_public_source";
  requestModel: "api_key_paid" | "public_no_key";
  hardLimit: string;
  implementedAreas: DataSourceCapabilityArea[];
  plannedAreas: DataSourceCapabilityArea[];
  modules: string[];
  guardrail: string;
};

export type DataSourceCapabilityMatrixRow = {
  area: DataSourceCapabilityArea;
  label: string;
  primaryProvider: DataSourceCapabilityProviderId;
  supportingProviders: DataSourceCapabilityProviderId[];
  implementationStatus: DataSourceImplementationStatus;
  scanLayer: "deep_scan" | "light_scan" | "review" | "structure" | "system";
  persistencePolicy: "cache_only" | "long_term_fact" | "summary_only";
  guardrail: string;
};

export type CoinGlassHobbyistEndpointFamily = {
  endpoint: string;
  fallbackBehavior: string;
  guardrail: string;
  hobbyistStatus: CoinGlassHobbyistSupportStatus;
  id: string;
  implementationStatus: DataSourceImplementationStatus;
  intervalLimit: ">=4h" | "current" | "disabled" | "external_source_required" | "n/a";
  label: string;
  scanLayer: "deep_scan" | "macro" | "review" | "system" | "unsupported";
  visualizationTarget: DataVisualizationSurface[];
};

export type DataVisualizationContract = {
  guardrail: string;
  id: DataVisualizationSurface;
  label: string;
  purpose: string;
  requiredFields: string[];
};

export type DataSourceCapabilityPlan = {
  coinGlassHobbyist: {
    accountPlan: "hobbyist";
    docsCheckedAt: string;
    endpointFamilies: CoinGlassHobbyistEndpointFamily[];
    guardrail: string;
    minuteLimit: number;
    unsupportedCount: number;
  };
  mode: "single_server_three_source_v1";
  operatorHint: string;
  providers: DataSourceCapabilityProvider[];
  matrix: DataSourceCapabilityMatrixRow[];
  guardrails: string[];
  visualizationContracts: DataVisualizationContract[];
};

export type CoinGlassRuntimeEndpointReport = {
  code?: string;
  endpoint: string;
  httpStatus?: number;
  id: string;
  label: string;
  message?: string;
  status: CoinGlassRuntimeEndpointStatus;
};

export type CoinGlassRuntimeCapabilityReport = {
  accountPlan: "hobbyist";
  canCreateDerivativeEvidence: boolean;
  checkedAt: string;
  deepScanStatus: CoinGlassRuntimeEndpointStatus;
  endpointStatuses: CoinGlassRuntimeEndpointReport[];
  guardrails: string[];
  keyConfigured: boolean;
  minuteLimit: number;
  operatorHint: string;
};

export type CoinGlassRuntimeRequestDiagnostics = {
  cleanRows?: number;
  coinGlassRequestsPlanned?: number;
  rawRows?: number;
  requestFailures?: Array<{
    code?: string;
    error: string;
    httpStatus?: number;
    symbol: string;
  }>;
};

export type DataSourceCapabilityEnv = {
  COINGLASS_API_KEY?: string;
  MARKET_DATA_PROVIDER?: string;
};

function normalizeCapabilityMessage(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

export function classifyCoinGlassRuntimeFailure(input: {
  code?: string | number;
  httpStatus?: number;
  message?: string;
}): CoinGlassRuntimeEndpointStatus {
  const code = String(input.code ?? "").trim().toLowerCase();
  const message = normalizeCapabilityMessage(input.message);
  const status = input.httpStatus;

  if (message.includes("upgrade plan") || message.includes("upgrade required")) {
    return "upgrade_required";
  }

  if (
    code === "401" ||
    status === 401 ||
    message.includes("invalid api key") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  ) {
    return "auth_error";
  }

  if (code === "429" || status === 429 || message.includes("rate limit")) {
    return "rate_limited";
  }

  if (
    code === "400" ||
    status === 400 ||
    message.includes("parameter") ||
    message.includes("param") ||
    message.includes("required") ||
    message.includes("invalid symbol")
  ) {
    return "param_error";
  }

  return "failed";
}

function statusFromDeepScanDiagnostics(
  diagnostics: CoinGlassRuntimeRequestDiagnostics | null | undefined,
): CoinGlassRuntimeEndpointStatus {
  if (!diagnostics || (diagnostics.coinGlassRequestsPlanned ?? 0) <= 0) {
    return "not_requested";
  }

  if ((diagnostics.cleanRows ?? 0) > 0) {
    return "ready";
  }

  const failures = diagnostics.requestFailures ?? [];
  const classifiedFailures = failures.map((failure) =>
    classifyCoinGlassRuntimeFailure({
      code: failure.code,
      httpStatus: failure.httpStatus,
      message: failure.error,
    })
  );

  if (classifiedFailures.includes("upgrade_required")) {
    return "upgrade_required";
  }

  if (classifiedFailures.includes("auth_error")) {
    return "auth_error";
  }

  if (classifiedFailures.includes("rate_limited")) {
    return "rate_limited";
  }

  if (classifiedFailures.includes("param_error")) {
    return "param_error";
  }

  if ((diagnostics.rawRows ?? 0) === 0) {
    return "empty";
  }

  return "failed";
}

function operatorHintFromRuntimeStatus(status: CoinGlassRuntimeEndpointStatus) {
  if (status === "ready") {
    return "CoinGlass 合约深扫已经返回可用行，可以进入衍生品证据层；仍要遵守 30 次/分钟、批次和缓存边界。";
  }

  if (status === "upgrade_required") {
    return "CoinGlass 返回 Upgrade plan，本轮只能保留公共轻扫和结构预筛；不能生成 CoinGlass 衍生品 Evidence 或交易计划就绪。";
  }

  if (status === "auth_error") {
    return "CoinGlass 鉴权失败，先检查服务器 COINGLASS_API_KEY 和套餐状态；公共轻扫可继续运行但不能冒充深扫。";
  }

  if (status === "rate_limited") {
    return "CoinGlass 触发限速，降低请求节奏并等待窗口恢复；不要改用旧缓存冒充实时深扫。";
  }

  if (status === "empty") {
    return "CoinGlass 请求成功但没有可用行，必须显示 empty/partial，并继续观察下一批候选。";
  }

  if (status === "param_error") {
    return "CoinGlass 端点可访问但请求参数不匹配，需要修正 symbol/exchange/interval；不能把参数错误误判成套餐不可用。";
  }

  if (status === "not_requested") {
    return "本次健康读数没有新增 CoinGlass 请求，只能说明上次扫描的深扫状态；需要受保护能力体检确认端点权限。";
  }

  if (status === "not_configured") {
    return "未配置 CoinGlass API key，付费深扫不可用。";
  }

  return "CoinGlass 合约深扫失败，保留公共轻扫、状态池和诊断输出，先排查失败原因。";
}

export function buildCoinGlassRuntimeCapabilityReport({
  checkedAt,
  diagnostics,
  env = {
    COINGLASS_API_KEY: process.env.COINGLASS_API_KEY,
    MARKET_DATA_PROVIDER: process.env.MARKET_DATA_PROVIDER,
  },
}: {
  checkedAt: string;
  diagnostics?: CoinGlassRuntimeRequestDiagnostics | null;
  env?: DataSourceCapabilityEnv;
}): CoinGlassRuntimeCapabilityReport {
  const keyConfigured = configuredForCoinGlass(env) && hasCoinGlassKey(env);
  const deepScanStatus = keyConfigured
    ? statusFromDeepScanDiagnostics(diagnostics)
    : "not_configured";
  const pairsMarketFailure = diagnostics?.requestFailures?.[0];

  return {
    accountPlan: "hobbyist",
    canCreateDerivativeEvidence: deepScanStatus === "ready",
    checkedAt,
    deepScanStatus,
    endpointStatuses: [
      {
        code: pairsMarketFailure?.code,
        endpoint: "/api/futures/pairs-markets",
        httpStatus: pairsMarketFailure?.httpStatus,
        id: "futures_pairs_markets",
        label: "合约市场基础数据",
        message: pairsMarketFailure?.error,
        status: deepScanStatus,
      },
    ],
    guardrails: [
      "运行态能力来自本轮扫描诊断或受保护体检，不等同于官方文档白名单。",
      "deepScanStatus 不是交易计划，只决定 CoinGlass 衍生品证据是否可用。",
      "Upgrade plan、鉴权失败、限速、空返回都必须显示为 partial/unavailable，不能解释成市场没有机会。",
    ],
    keyConfigured,
    minuteLimit: 30,
    operatorHint: operatorHintFromRuntimeStatus(deepScanStatus),
  };
}

function hasCoinGlassKey(env: DataSourceCapabilityEnv) {
  return Boolean(env.COINGLASS_API_KEY?.trim());
}

function configuredForCoinGlass(env: DataSourceCapabilityEnv) {
  return env.MARKET_DATA_PROVIDER === "coinglass";
}

function coinGlassEndpointImplementationStatus({
  coinGlassReady,
  hobbyistStatus,
}: {
  coinGlassReady: boolean;
  hobbyistStatus: CoinGlassHobbyistSupportStatus;
}): DataSourceImplementationStatus {
  if (hobbyistStatus === "disabled_by_blueprint") {
    return "disabled";
  }

  if (hobbyistStatus === "unsupported_by_hobbyist") {
    return "blocked";
  }

  return coinGlassReady ? "enabled" : "blocked";
}

function coinGlassEndpointFamily(
  input: Omit<CoinGlassHobbyistEndpointFamily, "implementationStatus">,
  coinGlassReady: boolean,
): CoinGlassHobbyistEndpointFamily {
  return {
    ...input,
    implementationStatus: coinGlassEndpointImplementationStatus({
      coinGlassReady,
      hobbyistStatus: input.hobbyistStatus,
    }),
  };
}

function coinGlassHobbyistEndpointFamilies(
  coinGlassReady: boolean,
): CoinGlassHobbyistEndpointFamily[] {
  return [
    coinGlassEndpointFamily({
      endpoint: "/api/user/account/subscription",
      fallbackBehavior: "显示套餐状态未知，不影响 public light scan。",
      guardrail: "不输出 API key，不把账号状态查询失败等同于行情失败。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "account_subscription",
      intervalLimit: "n/a",
      label: "账户等级与到期",
      scanLayer: "system",
      visualizationTarget: ["source_status", "scan_proof"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/supported-exchanges",
      fallbackBehavior: "保留上次支持交易所快照或显示 unavailable。",
      guardrail: "只证明 CoinGlass 支持范围，不代表本轮已深扫。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "supported_exchanges",
      intervalLimit: "n/a",
      label: "支持交易所",
      scanLayer: "system",
      visualizationTarget: ["scan_proof", "source_status"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/supported-exchange-pairs",
      fallbackBehavior: "回退到 Binance/OKX public universe，并标记 CoinGlass pair map stale。",
      guardrail: "用于 USDT 永续过滤和交易所覆盖，不直接生成 Evidence。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "supported_exchange_pairs",
      intervalLimit: "current",
      label: "支持交易对",
      scanLayer: "system",
      visualizationTarget: ["scan_proof", "source_status"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/supported-coins",
      fallbackBehavior: "继续使用 Binance/OKX 发现池，CoinGlass supported coins 标记 partial。",
      guardrail: "与 public universe 交叉验证，不能替代全市场轻扫。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "supported_coins",
      intervalLimit: "current",
      label: "支持币种",
      scanLayer: "system",
      visualizationTarget: ["scan_proof", "source_status"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/pairs-markets",
      fallbackBehavior: "深扫卡片显示市场基础数据缺失，保留结构和 public light scan。",
      guardrail: "只对候选使用，不全市场高频刷。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "futures_pairs_markets",
      intervalLimit: "current",
      label: "合约市场基础数据",
      scanLayer: "deep_scan",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/open-interest/exchange-list",
      fallbackBehavior: "OI 当前数据标记 unavailable，不能阻断 public discovery。",
      guardrail: "OI 上升不能单独看涨，只能作为资金质量证据。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "open_interest_current",
      intervalLimit: "current",
      label: "当前 OI",
      scanLayer: "deep_scan",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/open-interest/history",
      fallbackBehavior: "历史 OI 只显示 4h+ 不足，不用于短周期发现。",
      guardrail: "Hobbyist 历史周期限制 >=4h，不能当 15m/30m 早期发现源。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "open_interest_history",
      intervalLimit: ">=4h",
      label: "OI 历史",
      scanLayer: "review",
      visualizationTarget: ["signal_dossier_evidence", "review_evolution"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/funding-rate/exchange-list",
      fallbackBehavior: "Funding 当前值缺失时降级为未知拥挤状态。",
      guardrail: "高 Funding 是拥挤风险，不是强势本身。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "funding_current",
      intervalLimit: "current",
      label: "当前 Funding",
      scanLayer: "deep_scan",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/funding-rate/history",
      fallbackBehavior: "只展示 4h+ Funding 复盘趋势，短周期用当前值。",
      guardrail: "Hobbyist 历史周期限制 >=4h，不能冒充分钟级 funding 历史。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "funding_history",
      intervalLimit: ">=4h",
      label: "Funding 历史",
      scanLayer: "review",
      visualizationTarget: ["signal_dossier_evidence", "review_evolution"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/taker-buy-sell-volume/exchange-list",
      fallbackBehavior: "主动买卖天平显示 unavailable，Evidence 保留缺口。",
      guardrail: "只能验证资金推动质量，不单独决定方向。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "taker_buy_sell_current",
      intervalLimit: "current",
      label: "当前 Taker Buy/Sell",
      scanLayer: "deep_scan",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/v2/taker-buy-sell-volume/history",
      fallbackBehavior: "只展示 4h+ 主动买卖复盘趋势。",
      guardrail: "Hobbyist 历史周期限制 >=4h，短周期 CVD 不可用。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "taker_buy_sell_history",
      intervalLimit: ">=4h",
      label: "Taker Buy/Sell 历史",
      scanLayer: "review",
      visualizationTarget: ["signal_dossier_evidence", "review_evolution"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/global-long-short-account-ratio/history",
      fallbackBehavior: "多空拥挤条显示 unavailable，不阻断交易所 public 结构扫描。",
      guardrail: "极端多空比只能作为拥挤证据，不能单独决定方向。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "long_short_history",
      intervalLimit: ">=4h",
      label: "多空账户 / 大户多空历史",
      scanLayer: "deep_scan",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/etf/bitcoin/* + /api/etf/ethereum/*",
      fallbackBehavior: "Macro Weather 标记 ETF 数据不可用。",
      guardrail: "只做 BTC/ETH 大盘天气，不抢山寨主线。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "btc_eth_etf",
      intervalLimit: "current",
      label: "BTC/ETH ETF",
      scanLayer: "macro",
      visualizationTarget: ["macro_weather"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/index/fear-greed-history",
      fallbackBehavior: "情绪仪表显示 unavailable。",
      guardrail: "只做背景降权或加权，不能直接触发交易计划。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "fear_greed",
      intervalLimit: "current",
      label: "恐惧贪婪指数",
      scanLayer: "macro",
      visualizationTarget: ["macro_weather"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/exchange/assets + /api/exchange/balance/list",
      fallbackBehavior: "交易所余额背景隐藏或标记 stale。",
      guardrail: "低频资金背景，不做短线入场依据。",
      hobbyistStatus: "supported_by_hobbyist",
      id: "exchange_assets_balances",
      intervalLimit: "current",
      label: "交易所资产 / 余额",
      scanLayer: "macro",
      visualizationTarget: ["macro_weather"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/coins-price-change",
      fallbackBehavior: "必须使用 Binance/OKX public ticker 自己算全市场涨跌。",
      guardrail: "Hobbyist 不支持，不能用旧缓存或 mock 冒充 CoinGlass 全市场涨跌榜。",
      hobbyistStatus: "unsupported_by_hobbyist",
      id: "coins_price_change",
      intervalLimit: "external_source_required",
      label: "CoinGlass 全市场涨跌幅",
      scanLayer: "unsupported",
      visualizationTarget: ["scan_proof"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/rsi/list + indicator endpoints",
      fallbackBehavior: "必须从 Binance/OKX K 线本地计算指标。",
      guardrail: "Hobbyist 不支持 CoinGlass 指标接口；指标只能是低权重辅助证据。",
      hobbyistStatus: "unsupported_by_hobbyist",
      id: "technical_indicators",
      intervalLimit: "external_source_required",
      label: "CoinGlass 技术指标接口",
      scanLayer: "unsupported",
      visualizationTarget: ["signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/article/list",
      fallbackBehavior: "后续另接免费 RSS/交易所公告源；当前显示 unsupported_by_plan。",
      guardrail: "Hobbyist 不支持 CoinGlass News，不能显示成已接入资讯流。",
      hobbyistStatus: "unsupported_by_hobbyist",
      id: "news",
      intervalLimit: "external_source_required",
      label: "CoinGlass News",
      scanLayer: "unsupported",
      visualizationTarget: ["macro_weather"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/cvd/history + /api/futures/netflow-list + /api/futures/net-position/history",
      fallbackBehavior: "用 Taker Buy/Sell 作为 CVD proxy，并明确不是真实 CVD。",
      guardrail: "Hobbyist 不支持 CVD/NetFlow/Net Position，不能作为已接资金流。",
      hobbyistStatus: "unsupported_by_hobbyist",
      id: "cvd_netflow_net_position",
      intervalLimit: "external_source_required",
      label: "CVD / NetFlow / Net Position",
      scanLayer: "unsupported",
      visualizationTarget: ["candidate_deep_scan", "signal_dossier_evidence"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/index/altcoin-season + /api/index/bitcoin-dominance + /api/coin/unlock-list",
      fallbackBehavior: "如需要，另选免费公开源或延后。",
      guardrail: "Hobbyist 不支持，不能挂到 Macro Weather 里冒充已接入。",
      hobbyistStatus: "unsupported_by_hobbyist",
      id: "unsupported_macro_and_unlocks",
      intervalLimit: "external_source_required",
      label: "Altcoin Season / BTC Dominance / Token Unlock",
      scanLayer: "unsupported",
      visualizationTarget: ["macro_weather"],
    }, coinGlassReady),
    coinGlassEndpointFamily({
      endpoint: "/api/futures/liquidation/heatmap/* + map + max-pain",
      fallbackBehavior: "完全不接入；UI 不显示清算热力图目标位。",
      guardrail: "项目蓝图禁用清算热力图、清算区和潜在清算区交易模块。",
      hobbyistStatus: "disabled_by_blueprint",
      id: "liquidation_heatmap_map_max_pain",
      intervalLimit: "disabled",
      label: "Liquidation Heatmap / Map / Max Pain",
      scanLayer: "unsupported",
      visualizationTarget: [],
    }, coinGlassReady),
  ];
}

function visualizationContracts(): DataVisualizationContract[] {
  return [
    {
      guardrail: "必须显示支持/不支持/partial/stale，不能让用户误以为 CoinGlass 是全市场发现源。",
      id: "scan_proof",
      label: "扫描证明",
      purpose: "证明系统正在扫全市场，并说明 CoinGlass 深扫预算用在哪里。",
      requiredFields: ["sourceStatus", "supportedExchanges", "supportedPairs", "budget", "batchPlan", "hiddenCounts"],
    },
    {
      guardrail: "展示账号和数据源状态，不展示任何密钥。",
      id: "source_status",
      label: "数据源状态",
      purpose: "说明 Binance/OKX/CoinGlass 当前是否可用、是否降级。",
      requiredFields: ["provider", "plan", "minuteLimit", "status", "fallbackBehavior"],
    },
    {
      guardrail: "只对候选深扫，不对全市场盲扫。",
      id: "candidate_deep_scan",
      label: "候选深扫",
      purpose: "展示 OI、Funding、Taker、多空拥挤和交易所分布。",
      requiredFields: ["symbol", "oi", "funding", "takerBuySell", "longShort", "exchangeDistribution"],
    },
    {
      guardrail: "所有图表必须能追溯到 EvidenceItem 或明确标记 unavailable。",
      id: "signal_dossier_evidence",
      label: "单币档案证据",
      purpose: "把单币结构、关键位、衍生品、Risk Gate 和结构盈亏比放到同一个档案里。",
      requiredFields: ["symbol", "structure", "keyLevels", "oi", "funding", "taker", "riskGate", "rewardRisk"],
    },
    {
      guardrail: "只做环境解释和调权，不抢山寨机会主线。",
      id: "macro_weather",
      label: "Macro Weather",
      purpose: "展示 BTC/ETH ETF、情绪和交易所资产背景。",
      requiredFields: ["btcEthContext", "etf", "fearGreed", "exchangeBalances"],
    },
    {
      guardrail: "复盘先只读和人工校准，不自动改真实权重。",
      id: "review_evolution",
      label: "Review Evolution",
      purpose: "验证 OI/Funding/Taker 是否支持后续走势，记录漏判和误判。",
      requiredFields: ["signalId", "outcome", "oiAfter", "fundingAfter", "takerAfter", "missedOpportunity"],
    },
  ];
}

export function buildDataSourceCapabilityPlan(
  env: DataSourceCapabilityEnv = {
    COINGLASS_API_KEY: process.env.COINGLASS_API_KEY,
    MARKET_DATA_PROVIDER: process.env.MARKET_DATA_PROVIDER,
  },
): DataSourceCapabilityPlan {
  const coinGlassReady = configuredForCoinGlass(env) && hasCoinGlassKey(env);
  const coinGlassStatus: DataSourceImplementationStatus = coinGlassReady ? "enabled" : "blocked";
  const endpointFamilies = coinGlassHobbyistEndpointFamilies(coinGlassReady);

  return {
    coinGlassHobbyist: {
      accountPlan: "hobbyist",
      docsCheckedAt: "2026-06-20",
      endpointFamilies,
      guardrail:
        "CoinGlass Hobbyist 是候选深扫确认源，不是全市场分钟级发现源；不支持端点必须显式显示 unsupported_by_plan。",
      minuteLimit: 30,
      unsupportedCount: endpointFamilies.filter((family) =>
        family.hobbyistStatus !== "supported_by_hobbyist"
      ).length,
    },
    mode: "single_server_three_source_v1",
    operatorHint:
      "Binance/OKX 负责全市场发现和结构预筛；CoinGlass 只负责高价值候选的合约资金深扫确认。",
    providers: [
      {
        id: "binance_public",
        label: "Binance Public Futures",
        implementationStatus: "enabled",
        role: "primary_public_source",
        requestModel: "public_no_key",
        hardLimit: "公开接口，无站内密钥；仍需缓存和限频，不能暴力全量多周期重算。",
        implementedAreas: ["universe", "light_scan", "ohlcv_structure", "market_context"],
        plannedAreas: ["derivatives_public", "review_backfill"],
        modules: [
          "src/lib/market/providers/binance-universe-discovery.ts",
          "src/lib/market/providers/public-light-scan.ts",
          "src/lib/market/ohlcv/public-exchange-provider.ts",
        ],
        guardrail:
          "只能用于发现、K线结构和公开辅助数据，不能单独生成交易方向或绕过 Risk Gate。",
      },
      {
        id: "okx_public",
        label: "OKX Public Swap",
        implementationStatus: "partial",
        role: "cross_check_source",
        requestModel: "public_no_key",
        hardLimit: "公开接口，无站内密钥；当前已接 universe/light scan，K线和公开衍生品仍需补齐。",
        implementedAreas: ["universe", "light_scan"],
        plannedAreas: ["ohlcv_structure", "derivatives_public", "review_backfill"],
        modules: [
          "src/lib/market/providers/okx-universe-discovery.ts",
          "src/lib/market/providers/public-light-scan.ts",
        ],
        guardrail:
          "主要用于交叉验证和补漏；单 OKX 异常只能提高观察优先级，不能直接成为交易证据。",
      },
      {
        id: "coinglass_paid",
        label: "CoinGlass Paid API",
        implementationStatus: coinGlassStatus,
        role: "confirming_source",
        requestModel: "api_key_paid",
        hardLimit: "Hobbyist 会员外部限速约 30 调用/分钟，站内必须使用批次、预算、缓存和失败降级。",
        implementedAreas: coinGlassReady
          ? ["deep_derivatives", "market_context", "review_backfill"]
          : [],
        plannedAreas: coinGlassReady
          ? ["derivatives_public"]
          : ["deep_derivatives", "market_context", "review_backfill"],
        modules: [
          "src/lib/market/providers/coinglass-client.ts",
          "src/lib/market/providers/coinglass-provider.ts",
          "src/lib/market/providers/coinglass-daily-movers.ts",
        ],
        guardrail:
          "只做资金质量、拥挤风险和高价值候选确认；套餐限制、空返回和限速必须降级，不能拖垮全市场轻扫。",
      },
    ],
    matrix: [
      {
        area: "capability_contract",
        label: "CoinGlass Hobbyist 能力白名单",
        primaryProvider: "coinglass_paid",
        supportingProviders: ["binance_public", "okx_public"],
        implementationStatus: "enabled",
        scanLayer: "system",
        persistencePolicy: "summary_only",
        guardrail: "任何 CoinGlass 新端点必须先进入白名单；unsupported_by_hobbyist 不能被标记 enabled。",
      },
      {
        area: "universe",
        label: "全市场合约池",
        primaryProvider: "binance_public",
        supportingProviders: ["okx_public"],
        implementationStatus: "enabled",
        scanLayer: "system",
        persistencePolicy: "summary_only",
        guardrail: "用于确定可轮转资产池，不直接生成 EvidenceItem。",
      },
      {
        area: "light_scan",
        label: "全市场轻扫",
        primaryProvider: "binance_public",
        supportingProviders: ["okx_public"],
        implementationStatus: "enabled",
        scanLayer: "light_scan",
        persistencePolicy: "summary_only",
        guardrail: "只能生成优先级和状态池提示，不直接给方向。",
      },
      {
        area: "ohlcv_structure",
        label: "K线结构 / 关键位 / Forward Map",
        primaryProvider: "binance_public",
        supportingProviders: ["okx_public"],
        implementationStatus: "partial",
        scanLayer: "structure",
        persistencePolicy: "long_term_fact",
        guardrail: "结构事实进入 v3/Evidence 前必须保留来源和周期，低周期不能推翻高周期。",
      },
      {
        area: "derivatives_public",
        label: "公开衍生品辅助",
        primaryProvider: "binance_public",
        supportingProviders: ["okx_public"],
        implementationStatus: "planned",
        scanLayer: "structure",
        persistencePolicy: "summary_only",
        guardrail: "OI/Funding/Taker 只能作为资金质量辅助，不单独决定多空。",
      },
      {
        area: "deep_derivatives",
        label: "CoinGlass 合约深扫",
        primaryProvider: "coinglass_paid",
        supportingProviders: ["binance_public", "okx_public"],
        implementationStatus: coinGlassStatus,
        scanLayer: "deep_scan",
        persistencePolicy: "long_term_fact",
        guardrail: "只深扫状态池高价值候选；失败时保留 public light scan 和 scan proof。",
      },
      {
        area: "market_context",
        label: "BTC/ETH/市场天气",
        primaryProvider: "binance_public",
        supportingProviders: ["coinglass_paid"],
        implementationStatus: "enabled",
        scanLayer: "system",
        persistencePolicy: "summary_only",
        guardrail: "大盘天气只能调权和解释环境，不能一刀切禁止山寨机会。",
      },
      {
        area: "review_backfill",
        label: "复盘回填 / missed opportunity",
        primaryProvider: "binance_public",
        supportingProviders: ["coinglass_paid", "okx_public"],
        implementationStatus: "partial",
        scanLayer: "review",
        persistencePolicy: "long_term_fact",
        guardrail: "复盘样本先进入人工校准和影子权重，不自动改真实策略权重。",
      },
    ],
    guardrails: [
      "public_sources_discover_but_never_trade_directly",
      "coinglass_confirms_but_never_blocks_public_scan",
      "all_capabilities_must_feed_evidence_or_review",
      "no_secret_in_capability_plan",
      "ui_must_show_source_status_and_hidden_counts",
    ],
    visualizationContracts: visualizationContracts(),
  };
}
