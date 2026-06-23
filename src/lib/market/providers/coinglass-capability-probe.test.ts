import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoinGlassCapabilityProbeReport,
  coinGlassCapabilityProbeEndpointsForTest,
  runAdminCoinGlassCapabilityProbe,
} from "./coinglass-capability-probe";

test("runAdminCoinGlassCapabilityProbe requires CRON_SECRET authorization", async () => {
  const missingSecret = await runAdminCoinGlassCapabilityProbe({
    authorization: null,
    env: {
      MARKET_DATA_PROVIDER: "coinglass",
      NODE_ENV: "production",
    },
  });

  assert.equal(missingSecret.status, 503);
  assert.equal(missingSecret.body.error, "cron_secret_missing");

  const unauthorized = await runAdminCoinGlassCapabilityProbe({
    authorization: "Bearer wrong",
    env: {
      COINGLASS_API_KEY: "configured",
      CRON_SECRET: "correct",
      MARKET_DATA_PROVIDER: "coinglass",
      NODE_ENV: "production",
    },
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, "unauthorized");
});

test("buildCoinGlassCapabilityProbeReport reports not_configured without calling CoinGlass", async () => {
  let called = false;
  const report = await buildCoinGlassCapabilityProbeReport({
    env: {
      MARKET_DATA_PROVIDER: "coinglass",
    },
    fetcher: async () => {
      called = true;
      return new Response("{}");
    },
  });

  assert.equal(called, false);
  assert.equal(report.deepScanStatus, "not_configured");
  assert.deepEqual(report.availableDeepEndpointIds, []);
  assert.equal(report.providerCanFetchPairMarkets, false);
  assert.equal(report.requestedEndpoints, 0);
  assert.equal(report.endpointStatuses.every((endpoint) => endpoint.status === "not_configured"), true);
});

test("buildCoinGlassCapabilityProbeReport identifies Upgrade plan without leaking secrets", async () => {
  const requestedPaths: string[] = [];
  const endpoints = coinGlassCapabilityProbeEndpointsForTest.slice(0, 5);
  const report = await buildCoinGlassCapabilityProbeReport({
    endpoints,
    env: {
      COINGLASS_API_KEY: "secret-must-not-leak",
      COINGLASS_REQUEST_INTERVAL_MS: "0",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    fetcher: async (input) => {
      const url = new URL(input.toString());
      requestedPaths.push(url.pathname);

      if (url.pathname === "/api/futures/pairs-markets") {
        return new Response(JSON.stringify({
          code: "401",
          msg: "Upgrade plan",
          data: null,
        }));
      }

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [{ id: url.pathname }],
      }));
    },
  });

  assert.equal(report.requestedEndpoints, endpoints.length);
  assert.equal(report.deepScanStatus, "upgrade_required");
  assert.equal(report.canCreateDerivativeEvidence, false);
  assert.equal(report.providerCanFetchPairMarkets, false);
  assert.deepEqual(report.availableDeepEndpointIds, []);
  assert.deepEqual(report.blockedDeepEndpointIds, ["futures_pairs_markets"]);
  assert.equal(report.endpointStatuses.find((endpoint) => endpoint.id === "futures_pairs_markets")?.status, "upgrade_required");
  assert.deepEqual(requestedPaths, endpoints.map((endpoint) => endpoint.endpoint));
  assert.doesNotMatch(JSON.stringify(report), /secret-must-not-leak/u);
});

test("buildCoinGlassCapabilityProbeReport keeps provider blocked when pair markets fail but auxiliary endpoints are ready", async () => {
  const endpoints = coinGlassCapabilityProbeEndpointsForTest.filter((endpoint) =>
    ["futures_pairs_markets", "open_interest_current", "funding_current"].includes(endpoint.id)
  );
  const report = await buildCoinGlassCapabilityProbeReport({
    endpoints,
    env: {
      COINGLASS_API_KEY: "secret-must-not-leak",
      COINGLASS_REQUEST_INTERVAL_MS: "0",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    fetcher: async (input) => {
      const url = new URL(input.toString());

      if (url.pathname === "/api/futures/pairs-markets") {
        return new Response(JSON.stringify({
          code: "400",
          msg: "Invalid API key provided",
          data: null,
        }));
      }

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [{ symbol: "BTCUSDT", value: 1 }],
      }));
    },
  });

  assert.equal(report.deepScanStatus, "auth_error");
  assert.equal(report.providerCanFetchPairMarkets, false);
  assert.equal(report.canCreateDerivativeEvidence, false);
  assert.deepEqual(report.availableDeepEndpointIds, ["open_interest_current", "funding_current"]);
  assert.deepEqual(report.blockedDeepEndpointIds, ["futures_pairs_markets"]);
});
