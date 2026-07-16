import { NextResponse, type NextRequest } from "next/server";
import {
  createPrivateSessionToken,
  privateSessionConfig,
  verifyPrivatePassword,
  verifyPrivateSessionToken,
} from "@/lib/auth/private-session";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import {
  boundedSessionRateLimit,
  sessionAuditLine,
  sessionResponseHeaders,
  validateSessionMutationOrigin,
  type SessionAuditOutcome,
} from "@/lib/auth/session-request-security";

export const dynamic = "force-dynamic";

const authRateLimiter = new MemoryRateLimiter({
  limit: boundedSessionRateLimit(process.env.AUTH_SESSION_RATE_LIMIT),
  windowMs: 60_000,
});

function audit(outcome: SessionAuditOutcome, privateModeEnabled: boolean) {
  const line = sessionAuditLine(outcome, privateModeEnabled);
  if (["login_success", "logout"].includes(outcome)) console.info(line);
  else console.warn(line);
}

function responseHeaders(privateModeEnabled: boolean, additional: Record<string, string> = {}) {
  return sessionResponseHeaders(privateModeEnabled, additional);
}

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const config = privateSessionConfig(process.env);
  const token = request.cookies.get(config.cookieName)?.value;
  const session = config.enabled
    ? await verifyPrivateSessionToken(token, process.env)
    : null;

  return NextResponse.json(
    {
      ok: true,
      authenticated: config.enabled ? Boolean(session) : true,
      privateMode: {
        configured: config.configured,
        enabled: config.enabled,
      },
      subject: session?.sub ?? null,
    },
    {
      headers: {
        ...responseHeaders(config.enabled),
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const limit = authRateLimiter.consume(`auth-session:${clientKey(request)}`);
  const config = privateSessionConfig(process.env);
  const headers = responseHeaders(config.enabled, rateLimitHeaders(limit));

  if (!limit.allowed) {
    audit("rate_limited", config.enabled);
    return NextResponse.json(
      { ok: false, error: "rate_limited", resetAt: limit.resetAt },
      { status: 429, headers },
    );
  }

  const origin = validateSessionMutationOrigin(request);
  if (!origin.allowed) {
    audit("invalid_origin", config.enabled);
    return NextResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403, headers },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    audit("request_invalid", config.enabled);
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers });
  }

  const account = isRecord(body) && typeof body.account === "string"
    ? body.account.trim()
    : "operator";
  const password = isRecord(body) && typeof body.password === "string" ? body.password : "";

  if (account.length > 128 || password.length > 4096) {
    audit("request_invalid", config.enabled);
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413, headers });
  }

  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        privateMode: { configured: config.configured, enabled: false },
        subject: account || "operator",
      },
      {
        headers,
      },
    );
  }

  if (!config.configured) {
    audit("misconfigured", config.enabled);
    return NextResponse.json(
      { ok: false, error: "private_mode_misconfigured", issues: config.configurationIssues },
      { status: 503, headers },
    );
  }

  if (!verifyPrivatePassword(password, process.env)) {
    audit("invalid_credentials", config.enabled);
    return NextResponse.json(
      { ok: false, error: "invalid_credentials" },
      { status: 401, headers },
    );
  }

  const token = await createPrivateSessionToken(account || "operator", process.env);

  if (!token) {
    audit("session_create_failed", config.enabled);
    return NextResponse.json(
      { ok: false, error: "session_create_failed" },
      { status: 503, headers },
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
      authenticated: true,
      privateMode: { configured: true, enabled: true },
      subject: account || "operator",
    },
    {
      headers,
    },
  );
  response.cookies.set(config.cookieName, token, {
    httpOnly: true,
    maxAge: config.ttlSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
  audit("login_success", config.enabled);

  return response;
}

export async function DELETE(request: NextRequest) {
  const config = privateSessionConfig(process.env);
  const origin = validateSessionMutationOrigin(request);
  const headers = responseHeaders(config.enabled);

  if (!origin.allowed) {
    audit("invalid_origin", config.enabled);
    return NextResponse.json(
      { ok: false, error: "invalid_origin" },
      { status: 403, headers },
    );
  }

  const response = NextResponse.json(
    { ok: true, authenticated: false },
    {
      headers,
    },
  );

  response.cookies.set(config.cookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
  audit("logout", config.enabled);

  return response;
}
