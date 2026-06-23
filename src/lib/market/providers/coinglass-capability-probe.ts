import { isCronRequestAuthorized } from "../../api/cron-auth";
import {
  buildCoinGlassRuntimeCapabilityReport,
  classifyCoinGlassRuntimeFailure,
  type CoinGlassRuntimeCapabilityReport,
  type CoinGlassRuntimeEndpointReport,
  type CoinGlassRuntimeEndpointStatus,
} from "../data-source-capabilities";
import { CoinGlassApiError, requestCoinGlass } from "./coinglass-client";

export type CoinGlassCapabilityProbeEndpoint = {
  endpoint: string;
  id: string;
  label: string;
  query?: Record<string, string | number | boolean | undefined>;
  usesDeepScanEvidence: boolean;
};

export type CoinGlassCapabilityProbeEndpointReport = CoinGlassRuntimeEndpointReport & {
  canUseForDeepScan: boolean;
  sampleShape?: string;
};

export type CoinGlassCapabilityProbeReport = Omit<CoinGlassRuntimeCapabilityReport, "endpointStatuses"> & {
  endpointStatuses: CoinGlassCapabilityProbeEndpointReport[];
  mode: "coinglass_hobbyist_live_capability_probe";
  requestedEndpoints: number;
};

export type CoinGlassCapabilityProbeEnv = {
  COINGLASS_API_KEY?: string;
  COINGLASS_REQUEST_INTERVAL_MS?: string;
  CRON_SECRET?: string;
  MARKET_DATA_PROVIDER?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
};

export type AdminCoinGlassCapabilityProbeResult = {
  body: {
    capability?: CoinGlassCapabilityProbeReport;
    detail?: string;
    error?: string;
    ok: boolean;
  };
  status: number;
};

const defaultProbeEndpoints: CoinGlassCapabilityProbeEndpoint[] = [
  {
    endpoint: "/api/user/account/subscription",
    id: "account_subscription",
    label: "账户等级与到期",
    usesDeepScanEvidence: false,
  },
  {
    endpoint: "/api/futures/supported-exchanges",
    id: "supported_exchanges",
    label: "支持交易所",
    usesDeepScanEvidence: false,
  },
  {
    endpoint: "/api/futures/supported-coins",
    id: "supported_coins",
    label: "支持币种",
    usesDeepScanEvidence: false,
  },
  {
    endpoint: "/api/futures/supported-exchange-pairs",
    id: "supported_exchange_pairs",
    label: "支持交易对",
    usesDeepScanEvidence: false,
  },
  {
    endpoint: "/api/futures/pairs-markets",
    id: "futures_pairs_markets",
    label: "合约市场基础数据",
    query: { symbol: "BTC" },
    usesDeepScanEvidence: true,
  },
  {
    endpoint: "/api/futures/open-interest/exchange-list",
    id: "open_interest_current",
    label: "当前 OI",
    query: { symbol: "BTC" },
    usesDeepScanEvidence: true,
  },
  {
    endpoint: "/api/futures/funding-rate/exchange-list",
    id: "funding_current",
    label: "当前 Funding",
    query: { symbol: "BTC" },
    usesDeepScanEvidence: true,
  },
  {
    endpoint: "/api/futures/taker-buy-sell-volume/exchange-list",
    id: "taker_buy_sell_current",
    label: "当前 Taker Buy/Sell",
    query: { symbol: "BTC" },
    usesDeepScanEvidence: true,
  },
];

function configuredForCoinGlass(env: CoinGlassCapabilityProbeEnv) {
  return env.MARKET_DATA_PROVIDER === "coinglass";
}

function safeCoinGlassProbeIntervalMs(value?: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 500;
  }

  return Math.min(60_000, Math.max(0, Math.floor(parsed)));
}

function safeMessage(value: string) {
  return value.trim().slice(0, 180);
}

function sampleShape(data: unknown) {
  if (Array.isArray(data)) {
    const first = data[0];

    if (!first || typeof first !== "object") {
      return `array(${data.length})`;
    }

    return `array(${data.length}) keys:${Object.keys(first).slice(0, 8).join(",")}`;
  }

  if (data && typeof data === "object") {
    return `object keys:${Object.keys(data).slice(0, 8).join(",")}`;
  }

  return String(typeof data);
}

function readyStatusFromData(data: unknown): CoinGlassRuntimeEndpointStatus {
  if (data === null || data === undefined) {
    return "empty";
  }

  if (Array.isArray(data) && data.length === 0) {
    return "empty";
  }

  return "ready";
}

function reportFromError(
  endpoint: CoinGlassCapabilityProbeEndpoint,
  error: unknown,
): CoinGlassCapabilityProbeEndpointReport {
  if (error instanceof CoinGlassApiError) {
    const status = classifyCoinGlassRuntimeFailure({
      code: error.code,
      httpStatus: error.httpStatus,
      message: error.message,
    });

    return {
      canUseForDeepScan: false,
      code: error.code,
      endpoint: endpoint.endpoint,
      httpStatus: error.httpStatus,
      id: endpoint.id,
      label: endpoint.label,
      message: safeMessage(error.message),
      status,
    };
  }

  return {
    canUseForDeepScan: false,
    endpoint: endpoint.endpoint,
    id: endpoint.id,
    label: endpoint.label,
    message: safeMessage(error instanceof Error ? error.message : String(error)),
    status: "failed",
  };
}

function aggregateDeepScanStatus(
  reports: CoinGlassCapabilityProbeEndpointReport[],
): CoinGlassRuntimeEndpointStatus {
  const deepReports = reports.filter((report) => report.canUseForDeepScan || [
    "futures_pairs_markets",
    "open_interest_current",
    "funding_current",
    "taker_buy_sell_current",
  ].includes(report.id));

  if (deepReports.some((report) => report.status === "ready")) {
    return "ready";
  }

  if (deepReports.some((report) => report.status === "upgrade_required")) {
    return "upgrade_required";
  }

  if (deepReports.some((report) => report.status === "auth_error")) {
    return "auth_error";
  }

  if (deepReports.some((report) => report.status === "rate_limited")) {
    return "rate_limited";
  }

  if (deepReports.some((report) => report.status === "param_error")) {
    return "param_error";
  }

  if (deepReports.some((report) => report.status === "empty")) {
    return "empty";
  }

  return "failed";
}

function operatorHint(status: CoinGlassRuntimeEndpointStatus) {
  if (status === "ready") {
    return "受保护体检确认至少一个 CoinGlass 合约深扫端点可用；后续仍要按候选池低频调用。";
  }

  if (status === "upgrade_required") {
    return "受保护体检确认 CoinGlass 合约深扫端点返回 Upgrade plan；不能把公共轻扫包装成 CoinGlass 衍生品证据。";
  }

  if (status === "auth_error") {
    return "受保护体检确认 CoinGlass 鉴权异常；优先检查服务器环境变量和账号套餐。";
  }

  if (status === "rate_limited") {
    return "受保护体检触发 CoinGlass 限速；降低请求频率并等待额度恢复。";
  }

  if (status === "empty") {
    return "受保护体检请求成功但返回空数据；前端只能显示 empty/partial，不能生成交易计划。";
  }

  if (status === "param_error") {
    return "受保护体检确认 CoinGlass 端点可访问但参数不匹配；先修正 symbol/exchange/interval 组合，不能按套餐失败处理。";
  }

  return "受保护体检未确认 CoinGlass 合约深扫可用；保留公共轻扫和结构预筛，同时继续排查端点。";
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildCoinGlassCapabilityProbeReport({
  env = process.env,
  endpoints = defaultProbeEndpoints,
  fetcher,
  now = () => new Date(),
  paceSleep = sleep,
}: {
  endpoints?: CoinGlassCapabilityProbeEndpoint[];
  env?: CoinGlassCapabilityProbeEnv;
  fetcher?: typeof fetch;
  now?: () => Date;
  paceSleep?: (ms: number) => Promise<void>;
}): Promise<CoinGlassCapabilityProbeReport> {
  const checkedAt = now().toISOString();
  const apiKey = env.COINGLASS_API_KEY?.trim();
  const baseRuntime = buildCoinGlassRuntimeCapabilityReport({
    checkedAt,
    diagnostics: null,
    env,
  });

  if (!configuredForCoinGlass(env) || !apiKey) {
    return {
      ...baseRuntime,
      endpointStatuses: endpoints.map((endpoint) => ({
        canUseForDeepScan: false,
        endpoint: endpoint.endpoint,
        id: endpoint.id,
        label: endpoint.label,
        status: "not_configured",
      })),
      mode: "coinglass_hobbyist_live_capability_probe",
      requestedEndpoints: 0,
    };
  }

  const reports: CoinGlassCapabilityProbeEndpointReport[] = [];
  const intervalMs = safeCoinGlassProbeIntervalMs(env.COINGLASS_REQUEST_INTERVAL_MS);

  for (const endpoint of endpoints) {
    if (reports.length > 0) {
      await paceSleep(intervalMs);
    }

    try {
      const data = await requestCoinGlass<unknown>({
        apiKey,
        fetcher,
        path: endpoint.endpoint,
        query: endpoint.query,
      });
      const status = readyStatusFromData(data);

      reports.push({
        canUseForDeepScan: endpoint.usesDeepScanEvidence && status === "ready",
        endpoint: endpoint.endpoint,
        id: endpoint.id,
        label: endpoint.label,
        sampleShape: sampleShape(data),
        status,
      });
    } catch (error) {
      reports.push(reportFromError(endpoint, error));
    }
  }

  const deepScanStatus = aggregateDeepScanStatus(reports);

  return {
    ...baseRuntime,
    canCreateDerivativeEvidence: reports.some((report) => report.canUseForDeepScan),
    deepScanStatus,
    endpointStatuses: reports,
    mode: "coinglass_hobbyist_live_capability_probe",
    operatorHint: operatorHint(deepScanStatus),
    requestedEndpoints: endpoints.length,
  };
}

export async function runAdminCoinGlassCapabilityProbe({
  authorization,
  env = process.env,
  fetcher,
  now,
}: {
  authorization: string | null;
  env?: CoinGlassCapabilityProbeEnv;
  fetcher?: typeof fetch;
  now?: () => Date;
}): Promise<AdminCoinGlassCapabilityProbeResult> {
  if (!env.CRON_SECRET?.trim()) {
    return {
      body: {
        ok: false,
        error: "cron_secret_missing",
        detail: "Set CRON_SECRET before enabling the CoinGlass capability probe.",
      },
      status: 503,
    };
  }

  if (!isCronRequestAuthorized(authorization, env, { requireSecret: true })) {
    return {
      body: {
        ok: false,
        error: "unauthorized",
      },
      status: 401,
    };
  }

  const capability = await buildCoinGlassCapabilityProbeReport({
    env,
    fetcher,
    now,
  });

  return {
    body: {
      ok: true,
      capability,
    },
    status: 200,
  };
}

export const coinGlassCapabilityProbeEndpointsForTest = defaultProbeEndpoints;
