import type { AltcoinMacroAnchorInput, AltcoinMacroAnchorSource } from "./macro-weather";

export type MacroMarketSnapshot = {
  allowedUse: "macro_context_only";
  btcDominancePercent: number;
  canCreateTradeSignal: false;
  ethDominancePercent: number | null;
  fetchedAt: string;
  guardrail: string;
  id: string;
  source: AltcoinMacroAnchorSource;
  total2MarketCapUsd: number;
  total3MarketCapUsd: number;
  totalMarketCapChangePercent24h: number | null;
  totalMarketCapUsd: number;
  updatedAt: string;
};

type CoinGeckoGlobalPayload = {
  data?: {
    market_cap_change_percentage_24h_usd?: unknown;
    market_cap_percentage?: {
      btc?: unknown;
      eth?: unknown;
    };
    total_market_cap?: {
      usd?: unknown;
    };
    updated_at?: unknown;
  };
};

export type MacroMarketFetch = typeof fetch;

export type FetchCoinGeckoGlobalMacroSnapshotOptions = {
  fetcher?: MacroMarketFetch;
  now?: () => Date;
};

const macroGuardrail = "BTC.D/TOTAL2/TOTAL3 只能作为山寨大盘环境锚点，不能直接生成交易方向，不能降低 3:1 最低盈亏比。";

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }

  return rounded(((current - previous) / previous) * 100);
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function snapshotId(fetchedAt: string) {
  return `macro-coingecko-global-${fetchedAt.replace(/[^0-9]/gu, "")}`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }

  return rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function timeWindowAverage(
  snapshots: MacroMarketSnapshot[],
  newestAt: string,
  windowDays: number,
) {
  const newestTime = sortableTime(newestAt);

  if (newestTime === 0) {
    return undefined;
  }

  const earliestTime = newestTime - windowDays * 24 * 60 * 60 * 1000;
  const values = snapshots
    .filter((snapshot) => {
      const time = sortableTime(snapshot.fetchedAt);

      return time > 0 && time >= earliestTime && time <= newestTime;
    })
    .map((snapshot) => snapshot.btcDominancePercent);

  return average(values);
}

function nearestSnapshotAtLeastAgo(
  snapshots: MacroMarketSnapshot[],
  newestAt: string,
  minimumAgeHours: number,
) {
  const newestTime = sortableTime(newestAt);
  const targetTime = newestTime - minimumAgeHours * 60 * 60 * 1000;

  if (newestTime === 0) {
    return null;
  }

  return snapshots
    .filter((snapshot) => sortableTime(snapshot.fetchedAt) <= targetTime)
    .sort((left, right) => Math.abs(sortableTime(left.fetchedAt) - targetTime) - Math.abs(sortableTime(right.fetchedAt) - targetTime))[0] ?? null;
}

export function normalizeCoinGeckoGlobalPayload(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): MacroMarketSnapshot | null {
  const data = (payload as CoinGeckoGlobalPayload | null)?.data;
  const btcDominancePercent = finiteNumber(data?.market_cap_percentage?.btc);
  const ethDominancePercent = finiteNumber(data?.market_cap_percentage?.eth);
  const totalMarketCapUsd = finiteNumber(data?.total_market_cap?.usd);

  if (
    btcDominancePercent === null ||
    btcDominancePercent <= 0 ||
    totalMarketCapUsd === null ||
    totalMarketCapUsd <= 0
  ) {
    return null;
  }

  const updatedAt = typeof data?.updated_at === "number"
    ? new Date(data.updated_at * 1000).toISOString()
    : fetchedAt;
  const total2Percent = Math.max(0, 100 - btcDominancePercent);
  const total3Percent = Math.max(0, 100 - btcDominancePercent - (ethDominancePercent ?? 0));

  return {
    allowedUse: "macro_context_only",
    btcDominancePercent: rounded(btcDominancePercent),
    canCreateTradeSignal: false,
    ethDominancePercent: ethDominancePercent === null ? null : rounded(ethDominancePercent),
    fetchedAt,
    guardrail: macroGuardrail,
    id: snapshotId(fetchedAt),
    source: "coingecko_global",
    total2MarketCapUsd: rounded(totalMarketCapUsd * (total2Percent / 100)),
    total3MarketCapUsd: rounded(totalMarketCapUsd * (total3Percent / 100)),
    totalMarketCapChangePercent24h: finiteNumber(data?.market_cap_change_percentage_24h_usd),
    totalMarketCapUsd: rounded(totalMarketCapUsd),
    updatedAt,
  };
}

export function buildAltcoinMacroAnchorInputFromSnapshots(
  snapshots: MacroMarketSnapshot[],
): AltcoinMacroAnchorInput | null {
  const sorted = [...snapshots].sort((left, right) => sortableTime(right.fetchedAt) - sortableTime(left.fetchedAt));
  const current = sorted[0];

  if (!current) {
    return null;
  }

  const previous24h = nearestSnapshotAtLeastAgo(sorted, current.fetchedAt, 20);

  return {
    btcDominance7dAveragePercent: timeWindowAverage(sorted, current.fetchedAt, 7),
    btcDominance30dAveragePercent: timeWindowAverage(sorted, current.fetchedAt, 30),
    btcDominancePercent: current.btcDominancePercent,
    ethDominancePercent: current.ethDominancePercent ?? undefined,
    source: current.source,
    total2ChangePercent24h: previous24h
      ? percentChange(current.total2MarketCapUsd, previous24h.total2MarketCapUsd) ?? undefined
      : undefined,
    total3ChangePercent24h: previous24h
      ? percentChange(current.total3MarketCapUsd, previous24h.total3MarketCapUsd) ?? undefined
      : undefined,
    totalMarketCapUsd: current.totalMarketCapUsd,
    updatedAt: current.updatedAt,
  };
}

export async function fetchCoinGeckoGlobalMacroSnapshot({
  fetcher = fetch,
  now = () => new Date(),
}: FetchCoinGeckoGlobalMacroSnapshotOptions = {}) {
  const fetchedAt = now().toISOString();
  const response = await fetcher("https://api.coingecko.com/api/v3/global", {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko global macro request failed with HTTP ${response.status}`);
  }

  return normalizeCoinGeckoGlobalPayload(await response.json(), fetchedAt);
}
