import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { OPPORTUNITY_FAMILIES } from "../../domain/product-constitution";
import { M2_DISCOVERY_GOLDEN_FIXTURES } from "../../testing/m2-discovery-golden-fixtures";
import {
  M2DiscoveryGoldenFixtureSchema,
  parseM2DiscoveryGoldenFixture,
} from "./golden-fixture-contract";

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return productionTypeScriptFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

test("covers every family with long, short and point-in-time counterexamples", () => {
  const fixture = M2_DISCOVERY_GOLDEN_FIXTURES;
  assert.equal(fixture.cases.length, 19);
  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(fixture.cases), true);

  for (const family of OPPORTUNITY_FAMILIES) {
    const cases = fixture.cases.filter(
      (fixtureCase) => fixtureCase.opportunityFamily === family,
    );
    assert.ok(cases.some((fixtureCase) =>
      fixtureCase.directionHypothesis === "LONG" &&
      fixtureCase.expectedDisposition === "DISCOVER"
    ), `${family}:long`);
    assert.ok(cases.some((fixtureCase) =>
      fixtureCase.directionHypothesis === "SHORT" &&
      fixtureCase.expectedDisposition === "DISCOVER"
    ), `${family}:short`);
    assert.ok(cases.some((fixtureCase) =>
      fixtureCase.expectedDisposition !== "DISCOVER"
    ), `${family}:counterexample`);
  }
  assert.ok(fixture.cases.some((fixtureCase) =>
    fixtureCase.opportunityFamily === "PRE_MOVE" &&
    fixtureCase.directionHypothesis === "UNKNOWN" &&
    fixtureCase.expectedDisposition === "DISCOVER"
  ));
});

test("keeps every observation and detector reference at or before cutoff", () => {
  for (const fixtureCase of M2_DISCOVERY_GOLDEN_FIXTURES.cases) {
    const cutoff = Date.parse(fixtureCase.sourceCutoff);
    assert.equal(fixtureCase.detectorInput.eventCutoff, fixtureCase.sourceCutoff);
    assert.ok(
      Date.parse(fixtureCase.detectorInput.eventCutoff) <=
        Date.parse(fixtureCase.detectorInput.knowledgeCutoff),
    );
    for (const reference of [
      fixtureCase.detectorInput.universe,
      fixtureCase.detectorInput.featureSet,
      fixtureCase.detectorInput.featureQuality,
      fixtureCase.detectorInput.marketContext,
      fixtureCase.detectorInput.observedPrice,
    ]) {
      assert.ok(Date.parse(reference.sourceCutoff) <= cutoff);
      assert.ok(
        Date.parse(reference.availableAt) <=
          Date.parse(fixtureCase.detectorInput.knowledgeCutoff),
      );
    }
    for (const observation of fixtureCase.observations) {
      assert.ok(Date.parse(observation.observedAt) <= cutoff);
    }
  }
});

test("retains explicit late, noise, fakeout and unavailable negatives", () => {
  const flags = new Set(M2_DISCOVERY_GOLDEN_FIXTURES.cases.flatMap(
    (fixtureCase) => fixtureCase.pointInTimeFlags,
  ));
  for (const required of [
    "LATE_AT_CUTOFF",
    "NOISE_RISK_AT_CUTOFF",
    "FAKEOUT_RISK_AT_CUTOFF",
    "DATA_UNAVAILABLE_AT_CUTOFF",
  ]) {
    assert.ok(flags.has(required as never), required);
  }
  const unavailable = M2_DISCOVERY_GOLDEN_FIXTURES.cases.find(
    (fixtureCase) => fixtureCase.expectedDisposition === "DATA_UNAVAILABLE",
  );
  assert.ok(unavailable);
  assert.equal(unavailable.detectorInput.inputQuality.status, "PARTIAL");
  assert.ok(unavailable.observations.every(
    (observation) => observation.quality.status === "UNAVAILABLE",
  ));
});

test("rejects future fields and future material before schema decoding", () => {
  const fixture = M2_DISCOVERY_GOLDEN_FIXTURES;
  assert.throws(() => parseM2DiscoveryGoldenFixture({
    ...fixture,
    futureMfe: 0.4,
  }), /future field/u);
  assert.throws(() => parseM2DiscoveryGoldenFixture({
    ...fixture,
    cases: fixture.cases.map((fixtureCase, index) => index === 0
      ? {
        ...fixtureCase,
        reasonCodes: ["outcome_hit_after_selection"],
      }
      : fixtureCase),
  }), /future material/u);
  assert.throws(() => parseM2DiscoveryGoldenFixture({
    ...fixture,
    cases: fixture.cases.map((fixtureCase, index) => index === 0
      ? {
        ...fixtureCase,
        observations: fixtureCase.observations.map((observation, observationIndex) =>
          observationIndex === 0
            ? { ...observation, semanticKey: "future_outcome" }
            : observation),
      }
      : fixtureCase),
  }), /future material/u);
  assert.throws(() => parseM2DiscoveryGoldenFixture({
    ...fixture,
    cases: fixture.cases.map((fixtureCase, index) => index === 0
      ? { ...fixtureCase, reasonCodes: ["quality_hit"] }
      : fixtureCase),
  }), /future material/u);
});

test("rejects cutoff drift, undeclared lineage and runtime fixture authority", () => {
  const fixture = M2_DISCOVERY_GOLDEN_FIXTURES;
  const firstCase = fixture.cases[0]!;
  assert.equal(M2DiscoveryGoldenFixtureSchema.safeParse({
    ...fixture,
    runtimeImportAllowed: true,
  }).success, false);
  assert.equal(M2DiscoveryGoldenFixtureSchema.safeParse({
    ...fixture,
    cases: [{
      ...firstCase,
      observations: firstCase.observations.map((observation, index) => index === 0
        ? { ...observation, observedAt: "2026-01-15T00:01:01.000Z" }
        : observation),
    }, ...fixture.cases.slice(1)],
  }).success, false);
  assert.equal(M2DiscoveryGoldenFixtureSchema.safeParse({
    ...fixture,
    cases: [{
      ...firstCase,
      observations: firstCase.observations.map((observation, index) => index === 0
        ? { ...observation, sourceReferenceId: "undeclared-feature" }
        : observation),
    }, ...fixture.cases.slice(1)],
  }).success, false);
  assert.equal(M2DiscoveryGoldenFixtureSchema.safeParse({
    ...fixture,
    cases: [{
      ...firstCase,
      reasonCodes: [firstCase.reasonCodes[0], firstCase.reasonCodes[0]],
    }, ...fixture.cases.slice(1)],
  }).success, false);
});

test("keeps test-only golden fixtures out of production imports", () => {
  const productionRoots = [
    "src/v2/domain",
    "src/v2/entrypoints",
    "src/v2/modules",
    "src/v2/runtime-schema",
  ];
  for (const sourceRoot of productionRoots) {
    for (const file of productionTypeScriptFiles(join(process.cwd(), sourceRoot))) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        source.includes("testing/m2-discovery-golden-fixtures"),
        false,
        file,
      );
    }
  }
});
