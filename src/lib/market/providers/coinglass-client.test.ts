import assert from "node:assert/strict";
import test from "node:test";
import {
  CoinGlassApiError,
  buildCoinGlassUrl,
  reserveCoinGlassGlobalRequestSlotForTest,
  requestCoinGlass,
  resetCoinGlassGlobalPaceForTest,
} from "./coinglass-client";

test("buildCoinGlassUrl appends query parameters and preserves the v4 base URL", () => {
  const url = buildCoinGlassUrl("/api/futures/pairs-markets", {
    symbol: "BTC",
    empty: undefined,
  });

  assert.equal(
    url.toString(),
    "https://open-api-v4.coinglass.com/api/futures/pairs-markets?symbol=BTC",
  );
});

test("requestCoinGlass sends the CG-API-KEY header and returns response data", async () => {
  let requestedUrl = "";
  let requestedKey = "";

  const data = await requestCoinGlass<{ ok: boolean }>({
    apiKey: "test-key",
    path: "/api/test",
    fetcher: async (input, init) => {
      requestedUrl = input.toString();
      requestedKey = init?.headers instanceof Headers
        ? init.headers.get("CG-API-KEY") ?? ""
        : "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: { ok: true },
      }));
    },
  });

  assert.equal(requestedUrl, "https://open-api-v4.coinglass.com/api/test");
  assert.equal(requestedKey, "test-key");
  assert.deepEqual(data, { ok: true });
});

test("requestCoinGlass exposes API errors and rate-limit headers", async () => {
  await assert.rejects(
    () => requestCoinGlass({
      apiKey: "bad-key",
      path: "/api/test",
      fetcher: async () => new Response(JSON.stringify({
        code: "429",
        msg: "Rate limit exceeded",
        data: null,
      }), {
        status: 429,
        headers: {
          "API-KEY-MAX-LIMIT": "120",
          "API-KEY-USE-LIMIT": "121",
        },
      }),
    }),
    (error) => {
      if (!(error instanceof CoinGlassApiError)) {
        return false;
      }

      assert.equal(error.code, "429");
      assert.equal(error.httpStatus, 429);
      assert.equal(error.rateLimit?.max, 120);
      assert.equal(error.rateLimit?.used, 121);
      return true;
    },
  );
});

test("CoinGlass global pacing serializes concurrent request slots", async () => {
  resetCoinGlassGlobalPaceForTest();

  let now = 1_000;
  const sleeps: number[] = [];

  const reservedAt = await Promise.all([
    reserveCoinGlassGlobalRequestSlotForTest({
      intervalMs: 100,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    }),
    reserveCoinGlassGlobalRequestSlotForTest({
      intervalMs: 100,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    }),
    reserveCoinGlassGlobalRequestSlotForTest({
      intervalMs: 100,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    }),
  ]);

  assert.deepEqual(sleeps, [100, 100]);
  assert.deepEqual(reservedAt, [1_000, 1_100, 1_200]);

  resetCoinGlassGlobalPaceForTest();
});
