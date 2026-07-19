import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { TARGET_VENUES } from "./product-constitution";

test("freezes one explicit instrument and fresh fact per target venue", () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "src/v2/fixtures/m1-foundation-slice.v1.json"),
      "utf8",
    ),
  ) as {
    facts: Array<{
      eventTime: string;
      normalizedAt: string;
      persistedAt: string | null;
      qualityStatus: string;
      value: string | null;
      venue: string;
    }>;
    instruments: Array<{
      canonicalInstrumentId: string;
      underlyingGroupId: string;
      venue: string;
    }>;
    sourceCutoff: string;
  };

  assert.deepEqual(
    fixture.instruments.map((instrument) => instrument.venue),
    TARGET_VENUES,
  );
  assert.deepEqual(
    fixture.facts.map((fact) => fact.venue),
    TARGET_VENUES,
  );
  assert.equal(
    new Set(
      fixture.instruments.map((instrument) =>
        instrument.canonicalInstrumentId),
    ).size,
    TARGET_VENUES.length,
  );
  assert.equal(
    new Set(
      fixture.instruments.map((instrument) => instrument.underlyingGroupId),
    ).size,
    1,
  );
  assert.equal(
    fixture.facts.every(
      (fact) =>
        fact.eventTime === fixture.sourceCutoff &&
        Date.parse(fact.normalizedAt) >= Date.parse(fact.eventTime) &&
        fact.persistedAt === null &&
        fact.qualityStatus === "FRESH" &&
        fact.value !== null &&
        Number(fact.value) > 0,
    ),
    true,
  );
});
