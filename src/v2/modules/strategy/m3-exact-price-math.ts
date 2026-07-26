const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export const M3_CONSERVATIVE_REWARD_RISK_CALCULATION_VERSION =
  "m3-conservative-reward-risk.v1" as const;

type ParsedDecimal = Readonly<{
  coefficient: bigint;
  scale: number;
}>;

export type DecimalRoundingMode = "FLOOR" | "CEIL" | "HALF_UP";

function powerOfTen(exponent: number): bigint {
  let value = BigInt(1);
  for (let index = 0; index < exponent; index += 1) {
    value *= BigInt(10);
  }
  return value;
}

function parseDecimal(value: string): ParsedDecimal {
  if (
    value.length > 128 ||
    !POSITIVE_DECIMAL.test(value) ||
    !/[1-9]/u.test(value)
  ) {
    throw new Error(`invalid positive decimal: ${value}`);
  }
  const [integer, fraction = ""] = value.split(".");
  return {
    coefficient: BigInt(`${integer}${fraction}`),
    scale: fraction.length,
  };
}

function formatScaled(value: bigint, scale: number): string {
  const divisor = powerOfTen(scale);
  const integer = value / divisor;
  const fraction = (value % divisor)
    .toString()
    .padStart(scale, "0")
    .replace(/0+$/u, "");
  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

function roundedDivision(
  numerator: bigint,
  denominator: bigint,
  mode: DecimalRoundingMode,
): bigint {
  if (denominator <= 0) {
    throw new Error("decimal denominator must be positive");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === BigInt(0) || mode === "FLOOR") {
    return quotient;
  }
  if (mode === "CEIL") {
    return quotient + BigInt(1);
  }
  return remainder * BigInt(2) >= denominator
    ? quotient + BigInt(1)
    : quotient;
}

function alignedCoefficients(values: readonly string[]): {
  coefficients: bigint[];
  scale: number;
} {
  const parsed = values.map(parseDecimal);
  const scale = Math.max(...parsed.map((item) => item.scale));
  return {
    coefficients: parsed.map(
      (item) => item.coefficient * powerOfTen(scale - item.scale),
    ),
    scale,
  };
}

function ratioAsNumber(
  numerator: bigint,
  denominator: bigint,
  precision: number,
): number {
  if (
    numerator <= BigInt(0) ||
    denominator <= BigInt(0) ||
    !Number.isSafeInteger(precision) ||
    precision < 0 ||
    precision > 12
  ) {
    return 0;
  }
  const scale = powerOfTen(precision);
  const rounded = roundedDivision(
    numerator * scale,
    denominator,
    "HALF_UP",
  );
  return Number(formatScaled(rounded, precision));
}

export function shiftPriceByBps(
  price: string,
  bps: number,
  direction: "ADD" | "SUBTRACT",
  rounding: DecimalRoundingMode,
  minimumOutputPrecision = 12,
): string {
  if (
    !Number.isSafeInteger(bps) ||
    bps < 0 ||
    bps >= 10_000 ||
    !Number.isSafeInteger(minimumOutputPrecision) ||
    minimumOutputPrecision < 0 ||
    minimumOutputPrecision > 18
  ) {
    throw new Error("invalid basis-point price shift");
  }
  const parsed = parseDecimal(price);
  const outputScale = Math.max(parsed.scale, minimumOutputPrecision);
  const multiplier = BigInt(direction === "ADD" ? 10_000 + bps : 10_000 - bps);
  const numerator =
    parsed.coefficient *
    multiplier *
    powerOfTen(outputScale - parsed.scale);
  const shifted = roundedDivision(numerator, BigInt(10_000), rounding);
  if (shifted <= BigInt(0)) {
    throw new Error("basis-point shift produced a non-positive price");
  }
  return formatScaled(shifted, outputScale);
}

export function multiplyDecimalByBps(
  value: string,
  bps: number,
  rounding: DecimalRoundingMode,
  minimumOutputPrecision = 2,
): string {
  if (
    !Number.isSafeInteger(bps) ||
    bps < 0 ||
    bps > 10_000 ||
    !Number.isSafeInteger(minimumOutputPrecision) ||
    minimumOutputPrecision < 0 ||
    minimumOutputPrecision > 18
  ) {
    throw new Error("invalid basis-point decimal multiplication");
  }
  const parsed = parseDecimal(value);
  const outputScale = Math.max(parsed.scale, minimumOutputPrecision);
  const numerator =
    parsed.coefficient *
    BigInt(bps) *
    powerOfTen(outputScale - parsed.scale);
  const multiplied = roundedDivision(numerator, BigInt(10_000), rounding);
  return formatScaled(multiplied, outputScale);
}

export function calculateSpreadBpsCeil(
  bestBidPrice: string,
  bestAskPrice: string,
): number {
  const { coefficients } = alignedCoefficients([
    bestBidPrice,
    bestAskPrice,
  ]);
  const bid = coefficients[0]!;
  const ask = coefficients[1]!;
  if (ask <= bid) {
    throw new Error("best ask must be above best bid");
  }
  const spreadBps = roundedDivision(
    (ask - bid) * BigInt(20_000),
    ask + bid,
    "CEIL",
  );
  const result = Number(spreadBps);
  if (!Number.isSafeInteger(result) || result >= 10_000) {
    throw new Error("spread is outside the supported basis-point range");
  }
  return result;
}

export function calculateAdverseDistanceBpsCeil(
  referencePrice: string,
  boundaryPrice: string,
  direction: "LONG" | "SHORT",
): number {
  const { coefficients } = alignedCoefficients([
    referencePrice,
    boundaryPrice,
  ]);
  const reference = coefficients[0]!;
  const boundary = coefficients[1]!;
  const adverseDistance = direction === "LONG"
    ? reference > boundary
      ? reference - boundary
      : BigInt(0)
    : reference < boundary
      ? boundary - reference
      : BigInt(0);
  if (adverseDistance === BigInt(0)) {
    return 0;
  }
  const distanceBps = roundedDivision(
    adverseDistance * BigInt(10_000),
    boundary,
    "CEIL",
  );
  const result = Number(distanceBps);
  if (!Number.isSafeInteger(result) || result >= 10_000) {
    throw new Error("adverse distance is outside the supported range");
  }
  return result;
}

export function isWithinDistanceBps(
  referencePrice: string,
  levelPrice: string,
  maximumDistanceBps: number,
): boolean {
  if (!Number.isSafeInteger(maximumDistanceBps) || maximumDistanceBps < 0) {
    return false;
  }
  const { coefficients } = alignedCoefficients([
    referencePrice,
    levelPrice,
  ]);
  const reference = coefficients[0]!;
  const level = coefficients[1]!;
  const distance = reference >= level ? reference - level : level - reference;
  return distance * BigInt(10_000) <=
    reference * BigInt(maximumDistanceBps);
}

export function calculateConservativeRewardRisk(input: Readonly<{
  direction: "LONG" | "SHORT";
  conservativeEntryPrice: string;
  structuralStop: string;
  targets: readonly Readonly<{
    price: string;
    allocationPercent: number;
  }>[];
  feePerSideBps: number;
  slippagePerSideBps: number;
  fundingBps: number;
  precision: number;
}>): Readonly<{
  grossRewardRisk: number;
  estimatedNetRewardRisk: number;
  totalConservativeCostBps: number;
}> {
  const allocationTotal = input.targets.reduce(
    (sum, target) => sum + target.allocationPercent,
    0,
  );
  if (
    input.targets.length === 0 ||
    allocationTotal !== 100 ||
    input.targets.some(
      (target) =>
        !Number.isSafeInteger(target.allocationPercent) ||
        target.allocationPercent <= 0,
    ) ||
    !Number.isSafeInteger(input.feePerSideBps) ||
    !Number.isSafeInteger(input.slippagePerSideBps) ||
    !Number.isSafeInteger(input.fundingBps)
  ) {
    throw new Error("invalid reward-risk inputs");
  }

  const prices = [
    input.conservativeEntryPrice,
    input.structuralStop,
    ...input.targets.map((target) => target.price),
  ];
  const { coefficients } = alignedCoefficients(prices);
  const entry = coefficients[0]!;
  const stop = coefficients[1]!;
  const targetPrices = coefficients.slice(2);
  const risk = input.direction === "LONG" ? entry - stop : stop - entry;
  if (risk <= BigInt(0)) {
    throw new Error("structural stop is not on the adverse side of entry");
  }

  let weightedReward = BigInt(0);
  for (const [index, target] of input.targets.entries()) {
    const targetPrice = targetPrices[index]!;
    const reward = input.direction === "LONG"
      ? targetPrice - entry
      : entry - targetPrice;
    if (reward <= BigInt(0)) {
      throw new Error("target is not on the rewarding side of entry");
    }
    weightedReward += reward * BigInt(target.allocationPercent);
  }

  const fundingCostBps = Math.max(input.fundingBps, 0);
  const totalConservativeCostBps =
    2 * input.feePerSideBps +
    2 * input.slippagePerSideBps +
    fundingCostBps;
  const costNumerator = entry * BigInt(totalConservativeCostBps);
  const netRewardNumerator =
    weightedReward * BigInt(100) - costNumerator;
  const netRiskNumerator =
    risk * BigInt(10_000) + costNumerator;

  return {
    grossRewardRisk: ratioAsNumber(
      weightedReward,
      risk * BigInt(100),
      input.precision,
    ),
    estimatedNetRewardRisk: ratioAsNumber(
      netRewardNumerator,
      netRiskNumerator,
      input.precision,
    ),
    totalConservativeCostBps,
  };
}
