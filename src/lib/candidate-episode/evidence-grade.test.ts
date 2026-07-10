import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceGradeValidationError,
  validateEvidenceGradeV1,
  type EvidenceGradeV1Input,
} from "./evidence-grade";

const minute = 60_000;
const windowStart = "2026-07-10T00:00:00.000Z";
const windowEnd = "2026-07-10T00:03:00.000Z";

function candle(
  minuteOffset: number,
  prices: { open: number; high: number; low: number; close: number },
) {
  const openTime = new Date(Date.parse(windowStart) + minuteOffset * minute).toISOString();
  const closeTime = new Date(Date.parse(openTime) + minute).toISOString();

  return { openTime, closeTime, ...prices };
}

function recordedInput(
  overrides: Partial<EvidenceGradeV1Input> = {},
): EvidenceGradeV1Input {
  return {
    status: "recorded",
    direction: "long",
    observation: {
      factId: "observation-fact-1",
      observedAt: windowStart,
      price: 100,
    },
    window: {
      start: windowStart,
      end: windowEnd,
      dueAt: windowEnd,
      validatedAt: windowEnd,
    },
    historical: {
      source: "fixture-exchange",
      instrumentId: "BTCUSDT-PERP",
      interval: "1m",
    },
    candles: [
      candle(0, { open: 100, high: 102, low: 99, close: 101 }),
      candle(1, { open: 101, high: 105, low: 98, close: 103 }),
      candle(2, { open: 103, high: 104, low: 97, close: 104 }),
    ],
    ...overrides,
  };
}

test("eg.v1 admits a complete bounded 1m candle set and computes long metrics", () => {
  const result = validateEvidenceGradeV1(recordedInput());

  assert.deepEqual(result.coverage, {
    interval: "1m",
    expected: 3,
    actual: 3,
    missing: 0,
    duplicates: 0,
    ratio: 1,
    candleSetHash: result.coverage.candleSetHash,
  });
  assert.match(result.coverage.candleSetHash!, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.metrics, {
    mfe: 5,
    mae: 3,
    returnAtClose: 4,
  });
  assert.equal(result.evidenceGrade, true);
  assert.equal(result.evidenceGradeVersion, "eg.v1");
  assert.deepEqual(result.evidenceGradeReasons, []);
  assert.match(result.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("eg.v1 computes direction-aware short metrics", () => {
  const result = validateEvidenceGradeV1(
    recordedInput({ direction: "short" }),
  );

  assert.deepEqual(result.metrics, {
    mfe: 3,
    mae: 5,
    returnAtClose: -4,
  });
});

test("missing and duplicate slots remain recorded but are not evidence grade", () => {
  const duplicate = candle(0, { open: 100, high: 102, low: 99, close: 101 });
  const result = validateEvidenceGradeV1(
    recordedInput({
      candles: [
        duplicate,
        duplicate,
        candle(2, { open: 103, high: 104, low: 97, close: 104 }),
      ],
    }),
  );

  assert.deepEqual(
    {
      expected: result.coverage.expected,
      actual: result.coverage.actual,
      missing: result.coverage.missing,
      duplicates: result.coverage.duplicates,
      ratio: result.coverage.ratio,
    },
    { expected: 3, actual: 2, missing: 1, duplicates: 1, ratio: 0.666667 },
  );
  assert.equal(result.evidenceGrade, false);
  assert.deepEqual(result.evidenceGradeReasons, [
    "DUPLICATE_CANDLE_SLOTS",
    "MISSING_CANDLE_SLOTS",
  ]);
});

test("hashes are stable across input order and change with candle content", () => {
  const input = recordedInput();
  const original = validateEvidenceGradeV1(input);
  const reordered = validateEvidenceGradeV1({
    ...input,
    candles: [...input.candles!].reverse(),
  });
  const changed = validateEvidenceGradeV1({
    ...input,
    candles: input.candles!.map((item, index) =>
      index === 1 ? { ...item, close: item.close + 0.25 } : item,
    ),
  });

  assert.equal(reordered.coverage.candleSetHash, original.coverage.candleSetHash);
  assert.equal(reordered.contentHash, original.contentHash);
  assert.notEqual(changed.coverage.candleSetHash, original.coverage.candleSetHash);
  assert.notEqual(changed.contentHash, original.contentHash);
});

test("content hash normalizes equivalent timestamp representations", () => {
  const original = validateEvidenceGradeV1(recordedInput());
  const equivalent = validateEvidenceGradeV1(
    recordedInput({
      observation: {
        factId: "observation-fact-1",
        observedAt: "2026-07-10T08:00:00.000+08:00",
        price: 100,
      },
      window: {
        start: "2026-07-10T08:00:00.000+08:00",
        end: "2026-07-10T08:03:00.000+08:00",
        dueAt: "2026-07-10T08:03:00.000+08:00",
        validatedAt: "2026-07-10T08:03:00.000+08:00",
      },
    }),
  );

  assert.equal(equivalent.contentHash, original.contentHash);
});

test("missed and unavailable outcomes preserve null evidence metrics", () => {
  for (const status of ["missed", "data_unavailable"] as const) {
    const result = validateEvidenceGradeV1({
      status,
      direction: null,
      observation: null,
      window: {
        start: windowStart,
        end: windowEnd,
        dueAt: windowEnd,
        validatedAt: windowEnd,
      },
      historical: null,
      candles: null,
    });

    assert.deepEqual(result.metrics, {
      mfe: null,
      mae: null,
      returnAtClose: null,
    });
    assert.deepEqual(result.coverage, {
      interval: null,
      expected: null,
      actual: null,
      missing: null,
      duplicates: null,
      ratio: null,
      candleSetHash: null,
    });
    assert.equal(result.evidenceGrade, false);
    assert.deepEqual(result.evidenceGradeReasons, [
      "OUTCOME_STATUS_NOT_RECORDED",
    ]);
    assert.match(result.contentHash, /^sha256:[a-f0-9]{64}$/);
  }
});

for (const [name, input, code] of [
  [
    "rejects zero observation price",
    recordedInput({
      observation: {
        factId: "observation-fact-1",
        observedAt: windowStart,
        price: 0,
      },
    }),
    "INVALID_OBSERVATION_PRICE",
  ],
  [
    "rejects an untraceable observation fact",
    recordedInput({
      observation: { factId: "", observedAt: windowStart, price: 100 },
    }),
    "INVALID_OBSERVATION_FACT",
  ],
  [
    "rejects an observation fact outside the exact window start",
    recordedInput({
      observation: {
        factId: "observation-fact-1",
        observedAt: new Date(Date.parse(windowStart) + 1).toISOString(),
        price: 100,
      },
    }),
    "OBSERVATION_WINDOW_MISMATCH",
  ],
  [
    "rejects any interval except the approved 1m interval",
    recordedInput({
      historical: {
        source: "fixture-exchange",
        instrumentId: "BTCUSDT-PERP",
        interval: "5m" as "1m",
      },
    }),
    "UNSUPPORTED_CANDLE_INTERVAL",
  ],
  [
    "rejects a non-directional recorded outcome",
    recordedInput({ direction: "neutral" as "long" }),
    "INVALID_DIRECTION",
  ],
  [
    "rejects a window end after the checkpoint due time",
    recordedInput({
      window: {
        start: windowStart,
        end: windowEnd,
        dueAt: new Date(Date.parse(windowEnd) - 1).toISOString(),
        validatedAt: windowEnd,
      },
    }),
    "WINDOW_END_AFTER_DUE_AT",
  ],
  [
    "rejects a candle that closes beyond the planned window",
    recordedInput({
      candles: [
        candle(0, { open: 100, high: 102, low: 99, close: 101 }),
        candle(1, { open: 101, high: 105, low: 98, close: 103 }),
        candle(2, { open: 103, high: 104, low: 97, close: 104 }),
        candle(3, { open: 104, high: 106, low: 103, close: 105 }),
      ],
    }),
    "CANDLE_OUTSIDE_WINDOW",
  ],
  [
    "rejects validation before the checkpoint due time",
    recordedInput({
      window: {
        start: windowStart,
        end: windowEnd,
        dueAt: windowEnd,
        validatedAt: new Date(Date.parse(windowEnd) - 1).toISOString(),
      },
    }),
    "VALIDATED_BEFORE_DUE_AT",
  ],
  [
    "rejects a non-monotonic one-minute candle interval",
    recordedInput({
      candles: [
        candle(0, { open: 100, high: 102, low: 99, close: 101 }),
        {
          ...candle(1, { open: 101, high: 105, low: 98, close: 103 }),
          closeTime: new Date(Date.parse(windowStart) + 3 * minute).toISOString(),
        },
        candle(2, { open: 103, high: 104, low: 97, close: 104 }),
      ],
    }),
    "INVALID_CANDLE_INTERVAL",
  ],
] as const) {
  test(name, () => {
    assert.throws(
      () => validateEvidenceGradeV1(input),
      (error: unknown) =>
        error instanceof EvidenceGradeValidationError && error.code === code,
    );
  });
}
