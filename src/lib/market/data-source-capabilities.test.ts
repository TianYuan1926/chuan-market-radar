import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoinGlassRuntimeCapabilityReport,
  buildDataSourceCapabilityPlan,
  classifyCoinGlassRuntimeFailure,
} from "./data-source-capabilities";

test("buildDataSourceCapabilityPlan exposes CoinGlass Hobbyist allowlist without leaking secrets", () => {
  const plan = buildDataSourceCapabilityPlan({
    COINGLASS_API_KEY: "real-secret-must-not-appear",
    MARKET_DATA_PROVIDER: "coinglass",
  });

  assert.equal(plan.mode, "single_server_three_source_v1");
  assert.equal(plan.coinGlassHobbyist.accountPlan, "hobbyist");
  assert.equal(plan.coinGlassHobbyist.minuteLimit, 30);
  assert.equal(
    plan.providers.find((provider) => provider.id === "coinglass_paid")?.implementationStatus,
    "enabled",
  );
  assert.doesNotMatch(JSON.stringify(plan), /real-secret-must-not-appear/u);
});

test("buildDataSourceCapabilityPlan keeps unsupported Hobbyist endpoints blocked", () => {
  const plan = buildDataSourceCapabilityPlan({
    COINGLASS_API_KEY: "configured",
    MARKET_DATA_PROVIDER: "coinglass",
  });
  const families = plan.coinGlassHobbyist.endpointFamilies;

  const priceChange = families.find((family) => family.id === "coins_price_change");
  assert.equal(priceChange?.hobbyistStatus, "unsupported_by_hobbyist");
  assert.equal(priceChange?.implementationStatus, "blocked");
  assert.match(priceChange?.fallbackBehavior ?? "", /Binance\/OKX public ticker/u);

  const indicators = families.find((family) => family.id === "technical_indicators");
  assert.equal(indicators?.hobbyistStatus, "unsupported_by_hobbyist");
  assert.equal(indicators?.implementationStatus, "blocked");
  assert.match(indicators?.guardrail ?? "", /本地计算指标|指标/u);

  const liquidation = families.find((family) => family.id === "liquidation_heatmap_map_max_pain");
  assert.equal(liquidation?.hobbyistStatus, "disabled_by_blueprint");
  assert.equal(liquidation?.implementationStatus, "disabled");
  assert.deepEqual(liquidation?.visualizationTarget, []);
});

test("buildDataSourceCapabilityPlan maps supported endpoints to trading visual surfaces", () => {
  const plan = buildDataSourceCapabilityPlan({
    COINGLASS_API_KEY: "configured",
    MARKET_DATA_PROVIDER: "coinglass",
  });
  const families = plan.coinGlassHobbyist.endpointFamilies;

  const oi = families.find((family) => family.id === "open_interest_current");
  assert.equal(oi?.hobbyistStatus, "supported_by_hobbyist");
  assert.equal(oi?.implementationStatus, "enabled");
  assert.ok(oi?.visualizationTarget.includes("candidate_deep_scan"));
  assert.ok(oi?.visualizationTarget.includes("signal_dossier_evidence"));

  const oiHistory = families.find((family) => family.id === "open_interest_history");
  assert.equal(oiHistory?.intervalLimit, ">=4h");
  assert.match(oiHistory?.guardrail ?? "", /15m\/30m/u);

  assert.ok(plan.visualizationContracts.some((contract) => contract.id === "scan_proof"));
  assert.ok(plan.visualizationContracts.some((contract) => contract.id === "review_evolution"));
});

test("buildCoinGlassRuntimeCapabilityReport marks Upgrade plan as unavailable evidence", () => {
  const report = buildCoinGlassRuntimeCapabilityReport({
    checkedAt: "2026-06-23T00:00:00.000Z",
    diagnostics: {
      cleanRows: 0,
      coinGlassRequestsPlanned: 2,
      rawRows: 0,
      requestFailures: [
        {
          code: "401",
          error: "Upgrade plan",
          httpStatus: 200,
          symbol: "BTC",
        },
      ],
    },
    env: {
      COINGLASS_API_KEY: "configured-secret",
      MARKET_DATA_PROVIDER: "coinglass",
    },
  });

  assert.equal(report.deepScanStatus, "upgrade_required");
  assert.equal(report.canCreateDerivativeEvidence, false);
  assert.equal(report.endpointStatuses[0]?.status, "upgrade_required");
  assert.match(report.operatorHint, /Upgrade plan/u);
  assert.doesNotMatch(JSON.stringify(report), /configured-secret/u);
});

test("buildCoinGlassRuntimeCapabilityReport only permits derivative evidence after clean rows", () => {
  const report = buildCoinGlassRuntimeCapabilityReport({
    checkedAt: "2026-06-23T00:00:00.000Z",
    diagnostics: {
      cleanRows: 3,
      coinGlassRequestsPlanned: 3,
      rawRows: 5,
      requestFailures: [],
    },
    env: {
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    },
  });

  assert.equal(report.deepScanStatus, "ready");
  assert.equal(report.canCreateDerivativeEvidence, true);
});

test("classifyCoinGlassRuntimeFailure keeps auth, rate limit and upgrade distinct", () => {
  assert.equal(classifyCoinGlassRuntimeFailure({ message: "Upgrade Plan" }), "upgrade_required");
  assert.equal(classifyCoinGlassRuntimeFailure({ httpStatus: 401, message: "Unauthorized" }), "auth_error");
  assert.equal(classifyCoinGlassRuntimeFailure({ httpStatus: 429, message: "Rate limit" }), "rate_limited");
  assert.equal(classifyCoinGlassRuntimeFailure({ httpStatus: 400, message: "symbol parameter required" }), "param_error");
});
