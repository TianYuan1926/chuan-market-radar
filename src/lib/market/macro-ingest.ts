import { isCronRequestAuthorized } from "../api/cron-auth";
import type {
  PersistenceEnv,
  PersistenceRepository,
} from "../persistence/persistence-store";
import {
  fetchCoinGeckoGlobalMacroSnapshot,
  type MacroMarketFetch,
  type MacroMarketSnapshot,
} from "./macro-snapshot";

export type MacroMarketIngestResult = {
  notes: string[];
  scope: string;
  snapshot: MacroMarketSnapshot;
  status: "stored";
  storage: PersistenceRepository["mode"];
};

export type MacroMarketIngestOptions = {
  fetcher?: MacroMarketFetch;
  now?: () => Date;
  repository: PersistenceRepository;
};

export type AdminMacroMarketIngestError =
  | "macro_ingest_failed"
  | "macro_secret_missing"
  | "macro_source_unavailable"
  | "unauthorized";

export type AdminMacroMarketIngestResponseBody =
  | {
      macro: {
        btcDominancePercent: number;
        fetchedAt: string;
        guardrail: string;
        scope: string;
        snapshotId: string;
        source: MacroMarketSnapshot["source"];
        storage: PersistenceRepository["mode"];
        total2MarketCapUsd: number;
        total3MarketCapUsd: number;
      };
      ok: true;
    }
  | {
      detail: string;
      error: AdminMacroMarketIngestError;
      ok: false;
    };

export type AdminMacroMarketIngestResponse = {
  body: AdminMacroMarketIngestResponseBody;
  status: number;
};

export type RunAdminMacroMarketIngestOptions = {
  authorization?: string | null;
  env?: PersistenceEnv;
  ingest?: (options: MacroMarketIngestOptions) => Promise<MacroMarketIngestResult>;
  repository: PersistenceRepository;
};

function errorResponse(
  status: number,
  body: Extract<AdminMacroMarketIngestResponseBody, { ok: false }>,
): AdminMacroMarketIngestResponse {
  return {
    body,
    status,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown macro market ingest error";
}

export async function runMacroMarketIngest({
  fetcher,
  now,
  repository,
}: MacroMarketIngestOptions): Promise<MacroMarketIngestResult> {
  const snapshot = await fetchCoinGeckoGlobalMacroSnapshot({
    fetcher,
    now,
  });

  if (!snapshot) {
    throw new Error("CoinGecko global macro payload was incomplete");
  }

  const storedSnapshot = await repository.addMacroMarketSnapshot(snapshot);

  return {
    notes: [
      `macro ingest: stored ${storedSnapshot.source} snapshot ${storedSnapshot.id}`,
      "macro guardrail: BTC.D/TOTAL2/TOTAL3 are environment context only; no trade signal, no auto weights, no RR downgrade.",
      `repository storage: ${repository.mode}`,
    ],
    scope: repository.scope,
    snapshot: storedSnapshot,
    status: "stored",
    storage: repository.mode,
  };
}

export async function runAdminMacroMarketIngest({
  authorization,
  env = {},
  ingest = runMacroMarketIngest,
  repository,
}: RunAdminMacroMarketIngestOptions): Promise<AdminMacroMarketIngestResponse> {
  if (!env.CRON_SECRET?.trim()) {
    return errorResponse(503, {
      detail: "Set CRON_SECRET before enabling the macro market ingest endpoint.",
      error: "macro_secret_missing",
      ok: false,
    });
  }

  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return errorResponse(401, {
      detail: "The macro market ingest request must include the correct Bearer token.",
      error: "unauthorized",
      ok: false,
    });
  }

  try {
    const result = await ingest({
      repository,
    });

    return {
      body: {
        macro: {
          btcDominancePercent: result.snapshot.btcDominancePercent,
          fetchedAt: result.snapshot.fetchedAt,
          guardrail: result.snapshot.guardrail,
          scope: result.scope,
          snapshotId: result.snapshot.id,
          source: result.snapshot.source,
          storage: result.storage,
          total2MarketCapUsd: result.snapshot.total2MarketCapUsd,
          total3MarketCapUsd: result.snapshot.total3MarketCapUsd,
        },
        ok: true,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      detail: errorMessage(error),
      error: "macro_ingest_failed",
      ok: false,
    });
  }
}
