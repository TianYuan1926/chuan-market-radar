const NON_NEGATIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

function powerOfTen(exponent: number): bigint {
  let value = BigInt(1);
  for (let index = 0; index < exponent; index += 1) {
    value *= BigInt(10);
  }
  return value;
}

function parseDecimal(value: string): ParsedDecimal | null {
  if (
    value.length > 128 ||
    !NON_NEGATIVE_DECIMAL.test(value) ||
    !/[1-9]/u.test(value)
  ) {
    return null;
  }
  const [integer, fraction = ""] = value.split(".");
  return {
    coefficient: BigInt(`${integer}${fraction}`),
    scale: fraction.length,
  };
}

function formatScaled(value: bigint, precision: number): string {
  const scale = powerOfTen(precision);
  const integer = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/u, "");
  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

export function computeThreeVenuePriceDispersion(
  prices: readonly string[],
  precision = 12,
): string | null {
  if (
    prices.length !== 3 ||
    !Number.isSafeInteger(precision) ||
    precision < 1 ||
    precision > 18
  ) {
    return null;
  }
  const parsed = prices.map(parseDecimal);
  if (parsed.some((value) => value === null)) {
    return null;
  }

  const decimals = parsed as ParsedDecimal[];
  const commonScale = Math.max(...decimals.map((value) => value.scale));
  const coefficients = decimals
    .map((value) =>
      value.coefficient * powerOfTen(commonScale - value.scale))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const minimum = coefficients[0]!;
  const median = coefficients[1]!;
  const maximum = coefficients[2]!;
  const spread = maximum - minimum;
  const outputScale = powerOfTen(precision);
  const rounded = (spread * outputScale + median / BigInt(2)) / median;
  return formatScaled(rounded, precision);
}
