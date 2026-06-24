import {
  normalizeExternalEvent,
  type ExternalEvent,
  type ExternalEventInput,
  type SourceFetchRun,
} from "./intel-contract";

const dexBoostsUrl = "https://api.dexscreener.com/token-boosts/latest/v1";
const defaultLimit = 12;
const defaultTimeoutMs = 4_500;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type DexScreenerBoostRow = {
  url?: unknown;
  chainId?: unknown;
  tokenAddress?: unknown;
  amount?: unknown;
  totalAmount?: unknown;
  description?: unknown;
};

export type DexScreenerCollectorOptions = {
  enabled?: boolean;
  fetchImpl?: FetchLike;
  limit?: number;
  now?: Date;
  timeoutMs?: number;
};

export type DexScreenerCollectorResult = {
  events: ExternalEvent[];
  latestRuns: SourceFetchRun[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function chainLabel(chainId: string) {
  if (chainId === "bsc") return "BSC";
  if (chainId === "ethereum") return "Ethereum";
  if (chainId === "solana") return "Solana";
  if (chainId === "base") return "Base";
  if (chainId === "arbitrum") return "Arbitrum";
  return chainId || "unknown-chain";
}

function safeImpact(amount: number | undefined, totalAmount: number | undefined): ExternalEventInput["impact"] {
  if ((totalAmount ?? 0) >= 1_000 || (amount ?? 0) >= 500) {
    return "bullish_context";
  }

  return "neutral_context";
}

function boostToEvent(row: DexScreenerBoostRow, index: number, observedAt: string): ExternalEvent | undefined {
  const chainId = asString(row.chainId);
  const tokenAddress = asString(row.tokenAddress);
  const sourceUrl = asString(row.url);
  const amount = asFiniteNumber(row.amount);
  const totalAmount = asFiniteNumber(row.totalAmount);
  const description = asString(row.description);

  if (!chainId || !tokenAddress) {
    return undefined;
  }

  const title = `DEX boost · ${chainLabel(chainId)}`;
  const amountText = amount === undefined ? "本次 boost 金额未知" : `本次 boost ${amount}`;
  const totalText = totalAmount === undefined ? "累计 boost 未知" : `累计 boost ${totalAmount}`;
  const summary = [
    `${chainLabel(chainId)} token ${tokenAddress} 出现在 DEX Screener latest boosts。`,
    amountText,
    totalText,
    description ? `描述：${description}` : "无公开描述。",
    "只作为早期观察和风险背景，不生成交易结论。",
  ].join("；");

  return normalizeExternalEvent({
    id: `dexscreener-boost-${chainId}-${tokenAddress}-${index}`,
    sourceId: "dex_screener_public_api",
    kind: "NARRATIVE_CATALYST",
    tokenIdentity: {
      chainId,
      contractAddress: tokenAddress,
      confidence: 55,
    },
    title,
    summary,
    sourceUrl: sourceUrl || undefined,
    observedAt,
    impact: safeImpact(amount, totalAmount),
    confidence: totalAmount === undefined ? 45 : Math.min(75, 45 + Math.floor(totalAmount / 100)),
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
      throw new Error(`DEX Screener HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectDexScreenerExternalIntel({
  enabled = true,
  fetchImpl = fetch,
  limit = defaultLimit,
  now = new Date(),
  timeoutMs = defaultTimeoutMs,
}: DexScreenerCollectorOptions = {}): Promise<DexScreenerCollectorResult> {
  const startedAtMs = Date.now();
  const startedAt = now.toISOString();

  if (!enabled) {
    return {
      events: [],
      latestRuns: [{
        id: `dexscreener-${startedAt}`,
        sourceId: "dex_screener_public_api",
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
    const raw = await fetchJsonWithTimeout(fetchImpl, dexBoostsUrl, timeoutMs);
    const rows = Array.isArray(raw) ? raw.slice(0, Math.max(0, Math.min(50, limit))) : [];
    const observedAt = now.toISOString();
    const events = rows
      .map((row, index) => boostToEvent(row as DexScreenerBoostRow, index, observedAt))
      .filter((event): event is ExternalEvent => Boolean(event));
    const finishedAt = new Date().toISOString();

    return {
      events,
      latestRuns: [{
        id: `dexscreener-${observedAt}`,
        sourceId: "dex_screener_public_api",
        startedAt,
        finishedAt,
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
        id: `dexscreener-${startedAt}`,
        sourceId: "dex_screener_public_api",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        rowsRead: 0,
        rowsAccepted: 0,
        latencyMs: Date.now() - startedAtMs,
        error: error instanceof Error ? error.message : "unknown DEX Screener collector error",
      }],
    };
  }
}
