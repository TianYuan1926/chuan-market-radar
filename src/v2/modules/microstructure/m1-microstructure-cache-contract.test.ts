import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_MICROSTRUCTURE_ARTIFACT_CLASSES,
  M1_MICROSTRUCTURE_CACHE_KEY_DIMENSIONS,
  M1_MICROSTRUCTURE_CACHE_LAYERS,
  M1_MICROSTRUCTURE_CACHE_POLICY,
  M1MicrostructureCachePolicySchema,
  buildM1MicrostructureCachePolicy,
  evaluateM1MicrostructureCacheRead,
  type M1MicrostructureCachePolicyInput,
  type M1MicrostructureCacheReadInput,
} from "./m1-microstructure-cache-contract";

const STORED_AT = "2026-07-26T01:00:00.000Z";
const READ_AT = "2026-07-26T01:00:01.000Z";

const fresh = {
  status: "FRESH" as const,
  ageMs: 1_000,
  reasonCodes: [] as string[],
};

function readInput(
  overrides: Partial<M1MicrostructureCacheReadInput> = {},
): M1MicrostructureCacheReadInput {
  return {
    schemaVersion: "v2-m1-microstructure-cache-read.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    policyContentHash: M1_MICROSTRUCTURE_CACHE_POLICY.contentHash,
    layer: "L2_REDIS",
    artifactClass: "MICROSTRUCTURE_FACT",
    sourceId: "BINANCE_FUTURES",
    venue: "BINANCE_FUTURES",
    canonicalInstrumentId: "scope-v2:binance:btcusdt",
    artifactSchemaVersion: "v2-m1-microstructure-fact.v1",
    featureVersion: "not-applicable",
    window: "event",
    sourceCutoff: "2026-07-26T00:59:59.900Z",
    storedAt: STORED_AT,
    readAt: READ_AT,
    payloadPresent: true,
    payloadContentHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceQuality: fresh,
    ...overrides,
  };
}

test("cache policy accounts for every layer and artifact exactly once", () => {
  assert.equal(
    M1_MICROSTRUCTURE_CACHE_POLICY.rows.length,
    M1_MICROSTRUCTURE_CACHE_LAYERS.length *
      M1_MICROSTRUCTURE_ARTIFACT_CLASSES.length,
  );
  const keys = M1_MICROSTRUCTURE_CACHE_POLICY.rows.map((row) =>
    `${row.layer}:${row.artifactClass}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    M1_MICROSTRUCTURE_CACHE_POLICY.frontendProviderDirectReadAllowed,
    false,
  );
  assert.equal(M1_MICROSTRUCTURE_CACHE_POLICY.staleMayBecomeFresh, false);
  assert.equal(M1_MICROSTRUCTURE_CACHE_POLICY.missingMayBecomeZero, false);
  assert.equal(M1_MICROSTRUCTURE_CACHE_POLICY.candidateEmissionAllowed, false);
  assert.equal(Object.isFrozen(M1_MICROSTRUCTURE_CACHE_POLICY), true);
});

test("L1 and L2 are rebuildable caches while L3 and L4 retain audit authority", () => {
  for (const row of M1_MICROSTRUCTURE_CACHE_POLICY.rows) {
    assert.deepEqual(
      row.keyDimensions,
      [...M1_MICROSTRUCTURE_CACHE_KEY_DIMENSIONS].sort(),
    );
    if (row.layer === "L1_PROCESS_MEMORY" || row.layer === "L2_REDIS") {
      assert.equal(
        row.authorityClass,
        "NON_AUTHORITATIVE_REBUILDABLE_CACHE",
      );
      assert.equal(row.rebuildable, true);
      assert.ok((row.ttlSeconds ?? 0) > 0);
    } else {
      assert.equal(row.rebuildable, false);
      assert.equal(row.ttlSeconds, null);
      assert.notEqual(
        row.authorityClass,
        "NON_AUTHORITATIVE_REBUILDABLE_CACHE",
      );
    }
  }
});

test("fresh cache hits remain research-only and never decision-usable", () => {
  const result = evaluateM1MicrostructureCacheRead(readInput());
  assert.equal(result.status, "FRESH_HIT");
  assert.equal(result.researchUsable, true);
  assert.equal(result.decisionUsable, false);
  assert.equal(result.candidateEmissionAllowed, false);
  assert.equal(result.missingRepresentedAsZero, false);
  assert.equal(result.stalePromotedToFresh, false);
  assert.equal(Object.isFrozen(result), true);
});

test("expired L1 and L2 payloads are returned explicitly as stale", () => {
  const result = evaluateM1MicrostructureCacheRead(readInput({
    layer: "L1_PROCESS_MEMORY",
    readAt: "2026-07-26T01:00:03.000Z",
  }));
  assert.equal(result.status, "STALE_EXPLICIT");
  assert.equal(result.researchUsable, false);
  assert.ok(result.reasonCodes.includes("cache_ttl_expired"));
});

test("authoritative layers do not acquire an invented cache TTL", () => {
  const result = evaluateM1MicrostructureCacheRead(readInput({
    layer: "L3_POSTGRESQL",
    readAt: "2026-07-27T01:00:00.000Z",
  }));
  assert.equal(result.status, "FRESH_HIT");
  assert.equal(result.researchUsable, true);
});

test("missing payloads stay missing and never become numeric zero", () => {
  const result = evaluateM1MicrostructureCacheRead(readInput({
    storedAt: null,
    payloadPresent: false,
    payloadContentHash: null,
    sourceQuality: {
      status: "UNAVAILABLE",
      ageMs: null,
      reasonCodes: ["provider_unavailable"],
    },
  }));
  assert.equal(result.status, "MISS_EXPLICIT");
  assert.equal(result.payloadContentHash, null);
  assert.equal(result.missingRepresentedAsZero, false);
  assert.equal(result.researchUsable, false);
});

test("stale, partial and invalid source quality cannot be promoted by cache", () => {
  const cases: readonly {
    quality: M1MicrostructureCacheReadInput["sourceQuality"];
    expected: "STALE_EXPLICIT" | "PARTIAL_HIT" | "INVALID_EXPLICIT";
  }[] = [
    {
      quality: {
        status: "STALE",
        ageMs: 20_000,
        reasonCodes: ["source_stale"],
      },
      expected: "STALE_EXPLICIT",
    },
    {
      quality: {
        status: "PARTIAL",
        ageMs: 1_000,
        reasonCodes: ["sequence_partial"],
      },
      expected: "PARTIAL_HIT",
    },
    {
      quality: {
        status: "INVALID",
        ageMs: 1_000,
        reasonCodes: ["schema_invalid"],
      },
      expected: "INVALID_EXPLICIT",
    },
  ];
  for (const item of cases) {
    const result = evaluateM1MicrostructureCacheRead(readInput({
      sourceQuality: item.quality,
    }));
    assert.equal(result.status, item.expected);
    assert.equal(result.researchUsable, false);
    assert.equal(result.stalePromotedToFresh, false);
  }
});

test("cache identity includes Venue, instrument, version, window and cutoff", () => {
  const baseline = evaluateM1MicrostructureCacheRead(readInput());
  for (const override of [
    { venue: "BITGET_FUTURES" as const },
    { canonicalInstrumentId: "scope-v2:binance:ethusdt" },
    { featureVersion: "feature.v2" },
    { window: "1m" },
    { sourceCutoff: "2026-07-26T00:59:59.800Z" },
  ]) {
    const changed = evaluateM1MicrostructureCacheRead(readInput(override));
    assert.notEqual(changed.cacheKey, baseline.cacheKey);
  }
});

test("policy tampering and incomplete layer denominators are rejected", () => {
  const tampered = structuredClone(M1_MICROSTRUCTURE_CACHE_POLICY);
  tampered.rows[0]!.ttlSeconds = null;
  assert.equal(
    M1MicrostructureCachePolicySchema.safeParse(tampered).success,
    false,
  );

  const input = {
    ...M1_MICROSTRUCTURE_CACHE_POLICY,
    rows: M1_MICROSTRUCTURE_CACHE_POLICY.rows.slice(1),
  };
  const withoutHash = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "contentHash"),
  ) as M1MicrostructureCachePolicyInput;
  assert.throws(
    () => buildM1MicrostructureCachePolicy(withoutHash),
    /expected array to have 12 items|cache policy denominator/u,
  );
});
