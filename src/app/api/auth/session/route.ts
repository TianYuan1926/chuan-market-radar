import { NextResponse, type NextRequest } from "next/server";
import {
  createPrivateSessionToken,
  privateSessionConfig,
  verifyPrivatePassword,
  verifyPrivateSessionToken,
} from "@/lib/auth/private-session";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

const authRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.AUTH_SESSION_RATE_LIMIT ?? 30),
  windowMs: 60_000,
});

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
        "cache-control": "no-store",
        "x-chuan-private-mode": config.enabled ? "enabled" : "disabled",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const limit = authRateLimiter.consume(`auth-session:${clientKey(request)}`);

  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", resetAt: limit.resetAt },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const config = privateSessionConfig(process.env);
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const account = isRecord(body) && typeof body.account === "string"
    ? body.account.trim()
    : "operator";
  const password = isRecord(body) && typeof body.password === "string" ? body.password : "";

  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        privateMode: { configured: config.configured, enabled: false },
        subject: account || "operator",
      },
      {
        headers: {
          ...rateLimitHeaders(limit),
          "cache-control": "no-store",
          "x-chuan-private-mode": "disabled",
        },
      },
    );
  }

  if (!config.configured) {
    return NextResponse.json(
      { ok: false, error: "private_mode_misconfigured" },
      { status: 503, headers: rateLimitHeaders(limit) },
    );
  }

  if (!verifyPrivatePassword(password, process.env)) {
    return NextResponse.json(
      { ok: false, error: "invalid_credentials" },
      { status: 401, headers: rateLimitHeaders(limit) },
    );
  }

  const token = await createPrivateSessionToken(account || "operator", process.env);

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "session_create_failed" },
      { status: 503, headers: rateLimitHeaders(limit) },
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
      headers: {
        ...rateLimitHeaders(limit),
        "cache-control": "no-store",
        "x-chuan-private-mode": "enabled",
      },
    },
  );
  response.cookies.set(config.cookieName, token, {
    httpOnly: true,
    maxAge: config.ttlSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function DELETE() {
  const config = privateSessionConfig(process.env);
  const response = NextResponse.json(
    { ok: true, authenticated: false },
    {
      headers: {
        "cache-control": "no-store",
        "x-chuan-private-mode": config.enabled ? "enabled" : "disabled",
      },
    },
  );

  response.cookies.set(config.cookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
