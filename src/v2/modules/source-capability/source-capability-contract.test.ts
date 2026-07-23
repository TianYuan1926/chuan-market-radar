import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_CAPABILITY_IDS,
  M1_SOURCE_IDS,
  M1_VENUE_SOURCE_IDS,
  assessM1SourceCapabilityRegistry,
  buildM1SourceCapabilityRegistry,
  type M1SourceCapabilityRegistry,
} from "./source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "./adapters/four-venue-capability-registry";

function registryCore(): Omit<
  M1SourceCapabilityRegistry,
  "registryDigest"
> {
  const clone = structuredClone(M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY);
  const { registryDigest, ...core } = clone;
  assert.match(registryDigest, /^sha256:[0-9a-f]{64}$/u);
  return core;
}

function row(sourceId: string, capabilityId: string) {
  const found = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.capabilityId === capabilityId,
  );
  assert.ok(found, `missing ${sourceId}:${capabilityId}`);
  return found;
}

test("builds a complete deterministic five-source capability registry", () => {
  const registry = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY;
  const assessment = assessM1SourceCapabilityRegistry(registry);

  assert.equal(assessment.status, "PASS");
  assert.equal(assessment.expectedRowCount, 165);
  assert.equal(assessment.observedRowCount, 165);
  assert.equal(assessment.scopeV2RuntimePassRowCount, 0);
  assert.deepEqual(assessment.violations, []);
  assert.equal(registry.venueDenominator, 4);
  assert.equal(registry.sourceDenominator, 5);
  assert.equal(registry.capabilityDenominator, 33);
  assert.equal(registry.runtimeNetworkRequestsPerformed, false);
  assert.equal(registry.productionChanged, false);
  assert.equal(registry.secretMaterialPresent, false);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.rows), true);

  const rebuilt = buildM1SourceCapabilityRegistry(registryCore());
  assert.equal(rebuilt.registryDigest, registry.registryDigest);
});

test("accounts every source and capability pair exactly once", () => {
  const rows = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows;
  const keys = rows.map((candidate) =>
    `${candidate.sourceId}:${candidate.capabilityId}`
  );

  assert.equal(new Set(keys).size, M1_SOURCE_IDS.length * M1_CAPABILITY_IDS.length);
  for (const sourceId of M1_SOURCE_IDS) {
    for (const capabilityId of M1_CAPABILITY_IDS) {
      assert.equal(
        keys.filter((key) => key === `${sourceId}:${capabilityId}`).length,
        1,
      );
    }
  }
  assert.deepEqual(
    M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.sources
      .filter((source) => source.sourceClass === "VENUE")
      .map((source) => source.sourceId)
      .sort(),
    [...M1_VENUE_SOURCE_IDS].sort(),
  );
});

test("keeps official product availability separate from adapter and runtime proof", () => {
  for (const sourceId of M1_VENUE_SOURCE_IDS) {
    const catalog = row(sourceId, "DERIVATIVE_INSTRUMENT_CATALOG");
    assert.equal(
      catalog.assetDomains.includes("EQUITY_SINGLE_NAME_PERPETUAL"),
      true,
    );
    assert.equal(
      catalog.assetDomains.includes("EQUITY_INDEX_ETF_PERPETUAL"),
      true,
    );
  }

  const binance = row("BINANCE_FUTURES", "DERIVATIVE_INSTRUMENT_CATALOG");
  assert.equal(binance.documentationStatus, "OFFICIAL_DOCUMENTED");
  assert.equal(binance.implementationStatus, "IMPLEMENTED_SCOPE_V1_ONLY");
  assert.equal(binance.runtimeProbeStatus, "PASS_SCOPE_V1_ONLY");
  assert.ok(
    binance.evidenceIds.includes("binance-stock-perpetuals-2026-07-23"),
  );

  const bitget = row("BITGET_FUTURES", "DERIVATIVE_INSTRUMENT_CATALOG");
  assert.equal(bitget.documentationStatus, "OFFICIAL_DOCUMENTED");
  assert.equal(bitget.implementationStatus, "NOT_IMPLEMENTED_SCOPE_V2");
  assert.equal(bitget.runtimeProbeStatus, "NOT_RUN_SCOPE_V2");
  assert.ok(bitget.reasonCodes.includes("isRwa_does_not_prove_stock_identity"));
});

test("registers listing watch without inventing unsupported announcement APIs", () => {
  const bybit = row("BYBIT_DERIVATIVES", "LISTING_ANNOUNCEMENT");
  const bitget = row("BITGET_FUTURES", "LISTING_ANNOUNCEMENT");
  const binance = row("BINANCE_FUTURES", "LISTING_ANNOUNCEMENT");
  const okx = row("OKX_SWAP", "INSTRUMENT_STATUS_STREAM");

  assert.equal(bybit.endpoint, "/v5/announcements/index");
  assert.equal(bybit.pagination.mode, "CURSOR");
  assert.equal(bitget.endpoint, "/api/v2/public/annoucements");
  assert.equal(bitget.historyHorizon, "ONE_MONTH");
  assert.equal(binance.disposition, "UNAVAILABLE");
  assert.equal(binance.endpoint, null);
  assert.equal(okx.channel, "instruments");

  for (const candidate of [bybit, bitget, binance, okx]) {
    assert.ok(
      candidate.assetDomains.includes("ASSET_LISTING_WATCH") ||
      candidate.capabilityId === "INSTRUMENT_STATUS_STREAM",
    );
  }
});

test("expresses CoinGlass Hobbyist entitlement boundaries without embedding credentials", () => {
  const registry = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY;
  const profile = registry.sources.find(
    (source) => source.sourceId === "COINGLASS_V4",
  );
  assert.ok(profile);
  assert.equal(profile.accountPlan, "HOBBYIST_USER_CONFIRMED");
  assert.equal(profile.credentialClass, "READ_ONLY_API_KEY");
  assert.equal(profile.secretMaterialPresent, false);

  const supportedCoins = row(
    "COINGLASS_V4",
    "DERIVATIVE_INSTRUMENT_CATALOG",
  );
  assert.equal(supportedCoins.entitlementStatus, "HOBBYIST_CONFIRMED");
  assert.equal(supportedCoins.disposition, "DERIVED_WITH_LINEAGE");

  for (const capabilityId of ["OPEN_INTEREST_CURRENT", "FUNDING_HISTORY"] as const) {
    const capability = row("COINGLASS_V4", capabilityId);
    assert.equal(
      capability.entitlementStatus,
      "PLAN_ENTITLEMENT_UNVERIFIED",
    );
    assert.equal(capability.rateLimit.status, "DOCUMENTED");
    assert.match(capability.rateLimit.rule ?? "", /30 requests per minute/u);
    assert.ok(
      capability.reasonCodes.includes(
        "endpoint_entitlement_requires_exact_plan_probe",
      ),
    );
  }

  for (const capabilityId of ["LIQUIDATION_EVENT", "MARKET_NEWS_EVENT"] as const) {
    const capability = row("COINGLASS_V4", capabilityId);
    assert.equal(capability.entitlementStatus, "HOBBYIST_UNAVAILABLE");
    assert.equal(capability.disposition, "REJECTED_UNLICENSED");
    assert.equal(capability.runtimeProbeStatus, "NOT_RUN_SCOPE_V2");
  }

  assert.doesNotMatch(
    JSON.stringify(registry),
    /(?:api[-_ ]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9+/=_-]{12,}/iu,
  );
});

test("makes limits, horizons, failures and no-stale fallback explicit on every row", () => {
  for (const candidate of M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows) {
    assert.ok(candidate.historyHorizon.length > 0);
    assert.ok(candidate.pushCadence.length > 0);
    assert.ok(candidate.failureSemantics.length > 0);
    assert.equal(candidate.fallbackPolicy, "NO_SYNTHETIC_OR_STALE_FALLBACK");
    assert.notEqual(candidate.rateLimit.status, undefined);
    assert.notEqual(candidate.pagination.mode, undefined);
    if (
      candidate.documentationStatus === "NO_OFFICIAL_CAPABILITY_FOUND" ||
      candidate.documentationStatus === "NOT_APPLICABLE"
    ) {
      assert.equal(candidate.endpoint, null);
      assert.equal(candidate.channel, null);
      assert.equal(candidate.disposition, "UNAVAILABLE");
      assert.ok(candidate.reasonCodes.length > 0);
    }
  }
});

test("fails closed when the matrix is truncated or its digest is modified", () => {
  const truncated = structuredClone(M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY);
  truncated.rows.pop();
  const truncatedAssessment = assessM1SourceCapabilityRegistry(truncated);
  assert.equal(truncatedAssessment.status, "FAIL");
  assert.deepEqual(truncatedAssessment.violations, ["schema_validation_failed"]);

  const tampered = structuredClone(M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY);
  tampered.registryDigest =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  const tamperedAssessment = assessM1SourceCapabilityRegistry(tampered);
  assert.equal(tamperedAssessment.status, "FAIL");
  assert.ok(tamperedAssessment.violations.includes("registry_digest_mismatch"));
});

test("contains governance data only and grants no market or trading authority", () => {
  const registry = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY;
  assert.equal(
    registry.authorityBoundary,
    "GOVERNANCE_REGISTRY_ONLY_NO_FACT_CANDIDATE_STRATEGY_OR_READY_AUTHORITY",
  );
  assert.equal(
    registry.capabilities.every(
      (capability) => capability.privateTradingOrAccountData === false,
    ),
    true,
  );
  assert.equal(
    registry.rows.some((candidate) =>
      candidate.runtimeProbeStatus === "NOT_RUN_SCOPE_V2"
    ),
    true,
  );
  assert.equal(
    registry.rows.some((candidate) =>
      candidate.implementationStatus === "NOT_IMPLEMENTED_SCOPE_V2"
    ),
    true,
  );
});
