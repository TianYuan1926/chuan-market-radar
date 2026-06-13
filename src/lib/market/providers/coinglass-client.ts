export const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com";

export type CoinGlassQuery = Record<string, string | number | boolean | undefined>;

export type CoinGlassRequestOptions = {
  apiKey: string;
  path: string;
  query?: CoinGlassQuery;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export type CoinGlassRateLimit = {
  max?: number;
  used?: number;
};

export type CoinGlassEnvelope<T> = {
  code: string | number;
  msg?: string;
  data: T;
};

export class CoinGlassApiError extends Error {
  code: string;
  httpStatus: number;
  rateLimit?: CoinGlassRateLimit;

  constructor({
    code,
    httpStatus,
    message,
    rateLimit,
  }: {
    code: string;
    httpStatus: number;
    message: string;
    rateLimit?: CoinGlassRateLimit;
  }) {
    super(message);
    this.name = "CoinGlassApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.rateLimit = rateLimit;
  }
}

function toNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function rateLimitFromHeaders(headers: Headers): CoinGlassRateLimit {
  return {
    max: toNumber(headers.get("API-KEY-MAX-LIMIT")),
    used: toNumber(headers.get("API-KEY-USE-LIMIT")),
  };
}

export function buildCoinGlassUrl(
  path: string,
  query: CoinGlassQuery = {},
  baseUrl = COINGLASS_BASE_URL,
) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

export async function requestCoinGlass<T>({
  apiKey,
  baseUrl,
  fetcher = fetch,
  path,
  query,
}: CoinGlassRequestOptions): Promise<T> {
  const url = buildCoinGlassUrl(path, query, baseUrl);
  const headers = new Headers({
    accept: "application/json",
    "CG-API-KEY": apiKey,
  });
  const response = await fetcher(url, {
    method: "GET",
    headers,
  });
  const payload = await response.json() as CoinGlassEnvelope<T>;
  const code = String(payload.code);

  if (!response.ok || code !== "0") {
    throw new CoinGlassApiError({
      code,
      httpStatus: response.status,
      message: payload.msg ?? `CoinGlass request failed with code ${code}`,
      rateLimit: rateLimitFromHeaders(response.headers),
    });
  }

  return payload.data;
}
