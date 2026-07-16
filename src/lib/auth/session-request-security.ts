export type SessionRequestHeaders = {
  get(name: string): string | null;
};

export type SessionMutationRequest = {
  headers: SessionRequestHeaders;
  method: string;
  url: string;
};

export type SessionAuditOutcome =
  | "login_success"
  | "logout"
  | "invalid_credentials"
  | "invalid_origin"
  | "misconfigured"
  | "rate_limited"
  | "request_invalid"
  | "session_create_failed";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

function forwardedOrigin(request: SessionMutationRequest) {
  const requestUrl = new URL(request.url);
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
    requestUrl.protocol.replace(/:$/u, "");
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    requestUrl.host;

  if (!host || !["http", "https"].includes(protocol)) {
    return null;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function validateSessionMutationOrigin(request: SessionMutationRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return { allowed: true as const, reason: "safe_method" as const };
  }

  const origin = firstHeaderValue(request.headers.get("origin"));
  const expectedOrigin = forwardedOrigin(request);
  const fetchSite = firstHeaderValue(request.headers.get("sec-fetch-site"));

  if (!origin || !expectedOrigin) {
    return { allowed: false as const, reason: "origin_missing" as const };
  }

  let normalizedOrigin = "";
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return { allowed: false as const, reason: "origin_invalid" as const };
  }

  if (normalizedOrigin !== expectedOrigin) {
    return { allowed: false as const, reason: "origin_mismatch" as const };
  }

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { allowed: false as const, reason: "fetch_site_mismatch" as const };
  }

  return { allowed: true as const, reason: "same_origin" as const };
}

export function boundedSessionRateLimit(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(Math.floor(parsed), 5), 120);
}

export function sessionResponseHeaders<T extends Record<string, string>>(
  privateModeEnabled: boolean,
  additional: T = {} as T,
) {
  return {
    ...additional,
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    vary: "Cookie",
    "x-chuan-private-mode": privateModeEnabled ? "enabled" : "disabled",
  } as T & {
    "cache-control": string;
    pragma: string;
    vary: string;
    "x-chuan-private-mode": string;
  };
}

export function sessionAuditLine(
  outcome: SessionAuditOutcome,
  privateModeEnabled: boolean,
  at = new Date(),
) {
  return JSON.stringify({
    at: at.toISOString(),
    event: "private_session_security",
    outcome,
    privateModeEnabled,
  });
}
