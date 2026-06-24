import {
  normalizeExternalEvent,
  type ExternalEvent,
  type ExternalEventInput,
  type SourceFetchRun,
} from "./intel-contract";

const coingeckoTrendingUrl = "https://api.coingecko.com/api/v3/search/trending";
const defaultLimit = 10;
const defaultTimeoutMs = 4_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type CoingeckoTrendingCoin = {
  item?: {
    id?: unknown;
    name?: unknown;
    symbol?: unknown;
    small?: unknown;
    thumb?: unknown;
    market_cap_rank?: unknown;
    data?: {
      price_change_percentage_24h?: {
        usd?: unknown;
      };
      total_volume?: unknown;
    };
  };
};

export type CoingeckoTrendingCollectorOptions = {
  enabled?: boolean;
  fetchImpl?: FetchLike;
  limit?: number;
  now?: Date;
  timeoutMs?: number;
};

export type CoingeckoTrendingCollectorResult = {
  events: ExternalEvent[];
  latestRuns: SourceFetchRun[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function impactFromChange(change24h: number | undefined): ExternalEventInput["impact"] {
  if (change24h !== undefined && change24h <= -12) {
    return "risk_context";
  }

  return "neutral_context";
}

function trendingCoinToEvent(row: CoingeckoTrendingCoin, index: number, observedAt: string): ExternalEvent | undefined {
  const item = row.item;

  if (!item) {
    return undefined;
  }

  const id = asString(item.id);
  const symbol = asString(item.symbol).toUpperCase();
  const name = asString(item.name);
  const imageUrl = asString(item.small) || asString(item.thumb);
  const rank = asFiniteNumber(item.market_cap_rank);
  const change24h = asFiniteNumber(item.data?.price_change_percentage_24h?.usd);
  const volume = asFiniteNumber(item.data?.total_volume);

  if (!id && !symbol && !name) {
    return undefined;
  }

  const rankText = rank === undefined ? "市值排名未知" : `市值排名 #${rank}`;
  const changeText = change24h === undefined ? "24h 变化未知" : `24h 变化 ${change24h.toFixed(2)}%`;
  const volumeText = volume === undefined ? "成交额未知" : `成交额 ${Math.round(volume).toLocaleString("en-US")}`;

  return normalizeExternalEvent({
    id: `coingecko-trending-${id || symbol || index}`,
    sourceId: "coingecko_trending",
    kind: "NARRATIVE_CATALYST",
    symbol: symbol || undefined,
    tokenIdentity: {
      coingeckoId: id || undefined,
      confidence: id && symbol ? 85 : 55,
      imageUrl: imageUrl || undefined,
      name: name || undefined,
      symbol: symbol || undefined,
    },
    title: `CoinGecko 热门关注 · ${symbol || name || id}`,
    summary: [
      `${name || symbol || id} 出现在 CoinGecko trending search。`,
      rankText,
      changeText,
      volumeText,
      "只表示市场关注度上升，不能单独生成交易结论。",
    ].join("；"),
    sourceUrl: id ? `https://www.coingecko.com/en/coins/${id}` : undefined,
    observedAt,
    impact: impactFromChange(change24h),
    confidence: rank === undefined ? 50 : Math.max(45, Math.min(75, 80 - Math.floor(rank / 20))),
  });
}

async function fetchJsonWithTimeout(fetchImpl: FetchLike, url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": "ChuanMarketRadar/1.0 external-intel context-only",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectCoingeckoTrendingExternalIntel({
  enabled = true,
  fetchImpl = fetch,
  limit = defaultLimit,
  now = new Date(),
  timeoutMs = defaultTimeoutMs,
}: CoingeckoTrendingCollectorOptions = {}): Promise<CoingeckoTrendingCollectorResult> {
  const startedAtMs = Date.now();
  const startedAt = now.toISOString();

  if (!enabled) {
    return {
      events: [],
      latestRuns: [{
        id: `coingecko-trending-${startedAt}`,
        sourceId: "coingecko_trending",
        startedAt,
        finishedAt: new Date(startedAtMs).toISOString(),
        status: "skipped",
        rowsRead: 0,
        rowsAccepted: 0,
        latencyMs: 0,
      }],
    };
  }

  try {
    const raw = await fetchJsonWithTimeout(fetchImpl, coingeckoTrendingUrl, timeoutMs) as { coins?: unknown };
    const rows: unknown[] = Array.isArray(raw.coins)
      ? raw.coins.slice(0, Math.max(0, Math.min(30, limit)))
      : [];
    const observedAt = now.toISOString();
    const events = rows
      .map((row: unknown, index: number) => trendingCoinToEvent(row as CoingeckoTrendingCoin, index, observedAt))
      .filter((event: ExternalEvent | undefined): event is ExternalEvent => Boolean(event));

    return {
      events,
      latestRuns: [{
        id: `coingecko-trending-${observedAt}`,
        sourceId: "coingecko_trending",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: events.length > 0 ? "success" : "partial",
        rowsRead: rows.length,
        rowsAccepted: events.length,
        latencyMs: Date.now() - startedAtMs,
      }],
    };
  } catch (error) {
    return {
      events: [],
      latestRuns: [{
        id: `coingecko-trending-${startedAt}`,
        sourceId: "coingecko_trending",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        rowsRead: 0,
        rowsAccepted: 0,
        latencyMs: Date.now() - startedAtMs,
        error: error instanceof Error ? error.message : "unknown CoinGecko trending collector error",
      }],
    };
  }
}
