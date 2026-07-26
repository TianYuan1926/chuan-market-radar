import { parse } from "lossless-json";

export class M1ShadowJsonFrameError extends Error {
  readonly reason:
    | "EMPTY_JSON_FRAME"
    | "DUPLICATE_JSON_KEY"
    | "INVALID_JSON_FRAME"
    | "NON_FINITE_JSON_NUMBER";

  constructor(
    reason: M1ShadowJsonFrameError["reason"],
    cause?: unknown,
  ) {
    super(reason, { cause });
    this.name = "M1ShadowJsonFrameError";
    this.reason = reason;
  }
}

function parseProviderNumber(value: string): string | number {
  if (/^-?\d+$/u.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new M1ShadowJsonFrameError("NON_FINITE_JSON_NUMBER");
  }
  return numeric;
}

export function parseM1ShadowLosslessJsonFrame(frame: string): unknown {
  if (frame.trim().length === 0) {
    throw new M1ShadowJsonFrameError("EMPTY_JSON_FRAME");
  }
  try {
    return parse(frame, null, {
      parseNumber: parseProviderNumber,
      onDuplicateKey: ({ key }) => {
        throw new M1ShadowJsonFrameError(
          "DUPLICATE_JSON_KEY",
          new Error(`duplicate provider JSON key: ${key}`),
        );
      },
    });
  } catch (error) {
    if (error instanceof M1ShadowJsonFrameError) throw error;
    throw new M1ShadowJsonFrameError("INVALID_JSON_FRAME", error);
  }
}
