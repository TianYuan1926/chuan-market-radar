import { createHash } from "node:crypto";

export type EvidenceGradeOutcomeStatus =
  | "recorded"
  | "missed"
  | "data_unavailable";

export type EvidenceGradeDirection = "long" | "short";

export type EvidenceGradeCandle = {
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type EvidenceGradeV1Input = {
  status: EvidenceGradeOutcomeStatus;
  direction: EvidenceGradeDirection | null;
  observation: {
    factId: string;
    observedAt: string;
    price: number;
  } | null;
  window: {
    start: string;
    end: string;
    dueAt: string;
    validatedAt: string;
  };
  historical: {
    source: string;
    instrumentId: string;
    interval: "1m";
  } | null;
  candles: EvidenceGradeCandle[] | null;
};

export type EvidenceGradeV1Result = {
  coverage: {
    interval: "1m" | null;
    expected: number | null;
    actual: number | null;
    missing: number | null;
    duplicates: number | null;
    ratio: number | null;
    candleSetHash: string | null;
  };
  metrics: {
    mfe: number | null;
    mae: number | null;
    returnAtClose: number | null;
  };
  evidenceGrade: boolean;
  evidenceGradeVersion: "eg.v1";
  evidenceGradeReasons: string[];
  contentHash: string;
};

export class EvidenceGradeValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EvidenceGradeValidationError";
  }
}

const minuteMs = 60_000;

function fail(code: string): never {
  throw new EvidenceGradeValidationError(code);
}

function timestamp(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function roundMetric(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function nullableCoverage(): EvidenceGradeV1Result["coverage"] {
  return {
    interval: null,
    expected: null,
    actual: null,
    missing: null,
    duplicates: null,
    ratio: null,
    candleSetHash: null,
  };
}

function nullableMetrics(): EvidenceGradeV1Result["metrics"] {
  return {
    mfe: null,
    mae: null,
    returnAtClose: null,
  };
}

function canonicalCandle(candle: EvidenceGradeCandle) {
  return {
    closeTime: new Date(timestamp(candle.closeTime, "INVALID_CANDLE_TIME")).toISOString(),
    openTime: new Date(timestamp(candle.openTime, "INVALID_CANDLE_TIME")).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? null,
  };
}

function compareCandles(
  left: ReturnType<typeof canonicalCandle>,
  right: ReturnType<typeof canonicalCandle>,
) {
  return (
    left.openTime.localeCompare(right.openTime) ||
    left.closeTime.localeCompare(right.closeTime) ||
    left.open - right.open ||
    left.high - right.high ||
    left.low - right.low ||
    left.close - right.close ||
    (left.volume ?? 0) - (right.volume ?? 0)
  );
}

function assertCandlePrices(candle: EvidenceGradeCandle) {
  const values = [candle.open, candle.high, candle.low, candle.close];
  if (
    values.some((value) => !Number.isFinite(value) || value <= 0) ||
    candle.high < Math.max(candle.open, candle.close) ||
    candle.low > Math.min(candle.open, candle.close) ||
    candle.high < candle.low ||
    (candle.volume !== undefined && (!Number.isFinite(candle.volume) || candle.volume < 0))
  ) {
    fail("INVALID_CANDLE_PRICE");
  }
}

function buildContentHash(input: {
  coverage: EvidenceGradeV1Result["coverage"];
  direction: EvidenceGradeDirection | null;
  evidenceGrade: boolean;
  evidenceGradeReasons: string[];
  historical: EvidenceGradeV1Input["historical"];
  metrics: EvidenceGradeV1Result["metrics"];
  observation: EvidenceGradeV1Input["observation"];
  status: EvidenceGradeOutcomeStatus;
  window: EvidenceGradeV1Input["window"];
}) {
  return digest({
    schemaVersion: "eg.v1",
    status: input.status,
    direction: input.direction,
    observation: input.observation
      ? {
        ...input.observation,
        observedAt: new Date(
          timestamp(input.observation.observedAt, "INVALID_OBSERVATION_FACT"),
        ).toISOString(),
      }
      : null,
    historical: input.historical,
    window: {
      start: new Date(timestamp(input.window.start, "INVALID_WINDOW")).toISOString(),
      end: new Date(timestamp(input.window.end, "INVALID_WINDOW")).toISOString(),
      dueAt: new Date(timestamp(input.window.dueAt, "INVALID_WINDOW")).toISOString(),
    },
    coverage: input.coverage,
    metrics: input.metrics,
    evidenceGrade: input.evidenceGrade,
    evidenceGradeReasons: input.evidenceGradeReasons,
  });
}

export function validateEvidenceGradeV1(
  input: EvidenceGradeV1Input,
): EvidenceGradeV1Result {
  const windowStart = timestamp(input.window.start, "INVALID_WINDOW");
  const windowEnd = timestamp(input.window.end, "INVALID_WINDOW");
  const dueAt = timestamp(input.window.dueAt, "INVALID_WINDOW");
  const validatedAt = timestamp(input.window.validatedAt, "INVALID_WINDOW");

  if (windowEnd <= windowStart || (windowEnd - windowStart) % minuteMs !== 0) {
    fail("INVALID_WINDOW");
  }
  if (windowEnd > dueAt) fail("WINDOW_END_AFTER_DUE_AT");
  if (validatedAt < dueAt) fail("VALIDATED_BEFORE_DUE_AT");

  if (input.observation?.price === 0) fail("INVALID_OBSERVATION_PRICE");

  if (input.status !== "recorded") {
    const coverage = nullableCoverage();
    const metrics = nullableMetrics();
    const evidenceGradeReasons = ["OUTCOME_STATUS_NOT_RECORDED"];
    return {
      coverage,
      metrics,
      evidenceGrade: false,
      evidenceGradeVersion: "eg.v1",
      evidenceGradeReasons,
      contentHash: buildContentHash({
        coverage,
        direction: input.direction,
        evidenceGrade: false,
        evidenceGradeReasons,
        historical: input.historical,
        metrics,
        observation: input.observation,
        status: input.status,
        window: input.window,
      }),
    };
  }

  const observation = input.observation;
  if (
    !observation ||
    !observation.factId.trim() ||
    !Number.isFinite(observation.price) ||
    observation.price <= 0
  ) {
    fail(observation?.price === 0 ? "INVALID_OBSERVATION_PRICE" : "INVALID_OBSERVATION_FACT");
  }
  if (timestamp(observation.observedAt, "INVALID_OBSERVATION_FACT") !== windowStart) {
    fail("OBSERVATION_WINDOW_MISMATCH");
  }
  if (input.direction !== "long" && input.direction !== "short") {
    fail("INVALID_DIRECTION");
  }
  if (
    !input.historical ||
    !input.historical.source.trim() ||
    !input.historical.instrumentId.trim()
  ) {
    fail("INVALID_HISTORICAL_SOURCE");
  }
  if (input.historical.interval !== "1m") fail("UNSUPPORTED_CANDLE_INTERVAL");
  if (!input.candles || input.candles.length === 0) fail("MISSING_CANDLES");

  const candles = input.candles.map((candle) => {
    assertCandlePrices(candle);
    const openTime = timestamp(candle.openTime, "INVALID_CANDLE_TIME");
    const closeTime = timestamp(candle.closeTime, "INVALID_CANDLE_TIME");

    if (openTime < windowStart || closeTime > windowEnd || openTime >= windowEnd) {
      fail("CANDLE_OUTSIDE_WINDOW");
    }
    if (closeTime > dueAt) fail("CANDLE_AFTER_DUE_AT");
    if (closeTime > validatedAt) fail("CANDLE_NOT_CLOSED");
    if (
      closeTime - openTime !== minuteMs ||
      (openTime - windowStart) % minuteMs !== 0
    ) {
      fail("INVALID_CANDLE_INTERVAL");
    }

    return canonicalCandle(candle);
  }).sort(compareCandles);

  const expected = (windowEnd - windowStart) / minuteMs;
  const slotCounts = new Map<number, number>();
  for (const candle of candles) {
    const slot = (timestamp(candle.openTime, "INVALID_CANDLE_TIME") - windowStart) / minuteMs;
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }

  const actual = slotCounts.size;
  const duplicates = [...slotCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const missing = expected - actual;
  const coverage: EvidenceGradeV1Result["coverage"] = {
    interval: "1m",
    expected,
    actual,
    missing,
    duplicates,
    ratio: Math.round((actual / expected) * 1_000_000) / 1_000_000,
    candleSetHash: digest(candles),
  };

  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const close = candles.at(-1)!.close;
  const price = observation.price;
  const metrics = input.direction === "short"
    ? {
      mfe: roundMetric(Math.max(0, ((price - low) / price) * 100)),
      mae: roundMetric(Math.max(0, ((high - price) / price) * 100)),
      returnAtClose: roundMetric(((price - close) / price) * 100),
    }
    : {
      mfe: roundMetric(Math.max(0, ((high - price) / price) * 100)),
      mae: roundMetric(Math.max(0, ((price - low) / price) * 100)),
      returnAtClose: roundMetric(((close - price) / price) * 100),
    };

  const evidenceGradeReasons: string[] = [];
  if (duplicates > 0) evidenceGradeReasons.push("DUPLICATE_CANDLE_SLOTS");
  if (missing > 0) evidenceGradeReasons.push("MISSING_CANDLE_SLOTS");
  const evidenceGrade = evidenceGradeReasons.length === 0;

  return {
    coverage,
    metrics,
    evidenceGrade,
    evidenceGradeVersion: "eg.v1",
    evidenceGradeReasons,
    contentHash: buildContentHash({
      coverage,
      direction: input.direction,
      evidenceGrade,
      evidenceGradeReasons,
      historical: input.historical,
      metrics,
      observation: input.observation,
      status: input.status,
      window: input.window,
    }),
  };
}
