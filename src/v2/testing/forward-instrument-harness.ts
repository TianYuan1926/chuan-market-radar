import assert from "node:assert/strict";
import {
  buildM2ForwardInstrumentProvenance,
} from "../research/forward-instrument-provenance";

export const TEST_FORWARD_INSTRUMENT_RELEASE_ID =
  "0123456789abcdef0123456789abcdef01234567";
export const TEST_FORWARD_INSTRUMENT_PROVENANCE =
  buildM2ForwardInstrumentProvenance(TEST_FORWARD_INSTRUMENT_RELEASE_ID);

export type SyntheticForwardInstrumentState = {
  binanceRows: Array<Record<string, unknown>>;
  bybitPages: Array<Array<Record<string, unknown>>>;
  failHosts: Set<string>;
  okxRows: Array<Record<string, unknown>>;
};

export class MutableForwardInstrumentClock {
  #currentMs: number;
  readonly #stepMs: number;

  constructor(startedAt: string, stepMs = 1) {
    this.#currentMs = Date.parse(startedAt);
    this.#stepMs = stepMs;
  }

  readonly now = (): Date => {
    const value = new Date(this.#currentMs);
    this.#currentMs += this.#stepMs;
    return value;
  };

  advance(milliseconds: number): void {
    assert.ok(Number.isSafeInteger(milliseconds) && milliseconds >= 0);
    this.#currentMs += milliseconds;
  }
}

export function syntheticForwardInstrumentState(): SyntheticForwardInstrumentState {
  return {
    binanceRows: [{
      baseAsset: "AAA",
      contractType: "PERPETUAL",
      marginAsset: "USDT",
      quoteAsset: "USDT",
      status: "TRADING",
      symbol: "AAAUSDT",
    }],
    okxRows: [{
      ctType: "linear",
      ctVal: "1",
      ctValCcy: "BBB",
      instCategory: "1",
      instFamily: "BBB-USDT",
      instId: "BBB-USDT-SWAP",
      instType: "SWAP",
      quoteCcy: "USDT",
      settleCcy: "USDT",
      state: "live",
      uly: "BBB-USDT",
    }],
    bybitPages: [[{
      baseCoin: "CCC",
      contractType: "LinearPerpetual",
      quoteCoin: "USDT",
      settleCoin: "USDT",
      status: "Trading",
      symbol: "CCCUSDT",
    }]],
    failHosts: new Set<string>(),
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

export function syntheticForwardInstrumentFetch(
  state: SyntheticForwardInstrumentState,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (state.failHosts.has(url.hostname)) {
      return jsonResponse({ error: "synthetic provider failure" }, 503);
    }
    if (url.hostname === "fapi.binance.com") {
      return jsonResponse({ symbols: state.binanceRows });
    }
    if (url.hostname === "www.okx.com") {
      return jsonResponse({ code: "0", data: state.okxRows });
    }
    if (url.hostname === "api.bybit.com") {
      const cursor = url.searchParams.get("cursor");
      const pageIndex = cursor === null
        ? 0
        : Number(/^synthetic-page-(\d+)$/u.exec(cursor)?.[1] ?? Number.NaN);
      const page = state.bybitPages[pageIndex];
      if (page === undefined) {
        return jsonResponse({ error: "synthetic cursor invalid" }, 400);
      }
      return jsonResponse({
        result: {
          category: "linear",
          list: page,
          nextPageCursor: pageIndex + 1 < state.bybitPages.length
            ? `synthetic-page-${pageIndex + 1}`
            : "",
        },
        retCode: 0,
      });
    }
    throw new Error(`unexpected synthetic provider host: ${url.hostname}`);
  }) as typeof fetch;
}
