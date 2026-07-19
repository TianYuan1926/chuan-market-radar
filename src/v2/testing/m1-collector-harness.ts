import type { TargetVenue } from "../domain/product-constitution";
import type { ProviderFailure } from "../modules/universe/catalog-types";
import type {
  PublicJsonRequest,
  PublicJsonResult,
  PublicJsonTransport,
} from "../modules/universe/public-json-transport";
import type {
  CollectorArtifactStore,
  CollectorClock,
  CollectorProviderOperation,
} from "../modules/market-fact/collector/contracts";
import type { M1ArtifactName } from "../modules/market-fact/store/contracts";
import type { M1ArtifactAppendRequest } from "../modules/market-fact/store/postgres-artifact-store";
import {
  FULL_SCOPE_ASSETS,
  fullScopeBinanceCatalog,
  fullScopeBinanceTickers,
  fullScopeBybitCatalogPages,
  fullScopeBybitTickers,
  fullScopeOkxCatalog,
  fullScopeOkxTickers,
} from "./m1-full-scope-provider-fixtures";

export class MutableCollectorClock implements CollectorClock {
  #nowMs: number;

  constructor(initial: string) {
    this.#nowMs = Date.parse(initial);
  }

  now(): Date {
    return new Date(this.#nowMs);
  }

  advance(ms: number): void {
    this.#nowMs += ms;
  }
}

type FailureKey =
  | `${TargetVenue}:${CollectorProviderOperation}`
  | "BYBIT_LINEAR_PERPETUAL:CATALOG_PAGE_2";

export class FullScopeProviderHarness {
  readonly assetsByVenue: Record<TargetVenue, string[]> = {
    BINANCE_FUTURES: [...FULL_SCOPE_ASSETS],
    OKX_SWAP: [...FULL_SCOPE_ASSETS],
    BYBIT_LINEAR_PERPETUAL: [...FULL_SCOPE_ASSETS],
  };
  readonly calls: Array<Readonly<{
    operation: CollectorProviderOperation;
    url: string;
    venue: TargetVenue;
  }>> = [];
  readonly failures = new Map<FailureKey, ProviderFailure>();
  readonly omittedTickers: Record<TargetVenue, Set<string>> = {
    BINANCE_FUTURES: new Set(),
    OKX_SWAP: new Set(),
    BYBIT_LINEAR_PERPETUAL: new Set(),
  };
  readonly #clock: CollectorClock;

  constructor(clock: CollectorClock) {
    this.#clock = clock;
  }

  readonly transport: PublicJsonTransport = async (request) => {
    const route = this.#route(request);
    this.calls.push({
      operation: route.operation,
      url: request.url,
      venue: route.venue,
    });
    const failureKey: FailureKey =
      route.venue === "BYBIT_LINEAR_PERPETUAL" &&
        route.operation === "CATALOG" &&
        new URL(request.url).searchParams.has("cursor")
        ? "BYBIT_LINEAR_PERPETUAL:CATALOG_PAGE_2"
        : `${route.venue}:${route.operation}`;
    const failure = this.failures.get(failureKey);
    const receivedAt = this.#clock.now().toISOString();
    if (failure !== undefined) {
      return {
        failure,
        ok: false,
        receivedAt,
        status: failure.kind === "RATE_LIMITED" ? 429 : null,
      };
    }
    const eventTimeMs = String(this.#clock.now().getTime() - 100);
    return {
      data: this.#data(route.venue, route.operation, request, eventTimeMs),
      ok: true,
      receivedAt,
      status: 200,
    };
  };

  setFailure(key: FailureKey, failure: ProviderFailure): void {
    this.failures.set(key, failure);
  }

  clearFailures(): void {
    this.failures.clear();
  }

  #route(request: PublicJsonRequest): {
    operation: CollectorProviderOperation;
    venue: TargetVenue;
  } {
    const url = new URL(request.url);
    if (url.hostname === "fapi.binance.com") {
      return {
        operation: url.pathname.includes("exchangeInfo") ? "CATALOG" : "TICKER",
        venue: "BINANCE_FUTURES",
      };
    }
    if (url.hostname === "www.okx.com") {
      return {
        operation: url.pathname.includes("public/instruments")
          ? "CATALOG"
          : "TICKER",
        venue: "OKX_SWAP",
      };
    }
    if (url.hostname === "api.bybit.com") {
      return {
        operation: url.pathname.includes("instruments-info")
          ? "CATALOG"
          : "TICKER",
        venue: "BYBIT_LINEAR_PERPETUAL",
      };
    }
    throw new Error("test harness received an unknown provider host");
  }

  #data(
    venue: TargetVenue,
    operation: CollectorProviderOperation,
    request: PublicJsonRequest,
    eventTimeMs: string,
  ): unknown {
    const assets = this.assetsByVenue[venue];
    if (operation === "CATALOG") {
      if (venue === "BINANCE_FUTURES") {
        return fullScopeBinanceCatalog(assets);
      }
      if (venue === "OKX_SWAP") {
        return fullScopeOkxCatalog(assets);
      }
      const pages = fullScopeBybitCatalogPages(assets);
      return new URL(request.url).searchParams.has("cursor")
        ? pages[1]
        : pages[0];
    }
    const tickerAssets = assets.filter(
      (asset) => !this.omittedTickers[venue].has(asset),
    );
    if (venue === "BINANCE_FUTURES") {
      return fullScopeBinanceTickers(eventTimeMs, tickerAssets);
    }
    if (venue === "OKX_SWAP") {
      return fullScopeOkxTickers(eventTimeMs, tickerAssets);
    }
    return fullScopeBybitTickers(eventTimeMs, tickerAssets);
  }
}

export class RecordingCollectorStore implements CollectorArtifactStore {
  readonly calls: M1ArtifactAppendRequest<M1ArtifactName>[][] = [];
  readonly #seen = new Set<string>();
  failNext = false;

  async appendArtifacts(
    requests: readonly M1ArtifactAppendRequest<M1ArtifactName>[],
  ): Promise<readonly Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
  }>[]> {
    this.calls.push([...requests]);
    if (this.failNext) {
      this.failNext = false;
      throw new Error("injected durable store failure");
    }
    return requests.map((request) => {
      const identity = request.artifact as unknown as {
        factId?: string;
        snapshotId?: string;
      };
      const id = identity.factId ?? identity.snapshotId;
      if (id === undefined) {
        throw new Error("test store received an artifact without identity");
      }
      const key = `${request.artifactName}:${id}`;
      const status = this.#seen.has(key) ? "IDEMPOTENT_REPLAY" : "INSERTED";
      this.#seen.add(key);
      return { status } as const;
    });
  }
}

export function successfulPublicJsonResult(
  data: unknown,
  receivedAt: string,
): PublicJsonResult {
  return { data, ok: true, receivedAt, status: 200 };
}
