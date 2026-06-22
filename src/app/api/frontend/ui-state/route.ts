import { NextResponse, type NextRequest } from "next/server";
import { resource } from "@/lib/data-status";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";
import type {
  FrontendUiStateEntry,
  FrontendUiStateKind,
} from "@/lib/persistence/persistence-contract";

export const dynamic = "force-dynamic";

const frontendUiStateRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_UI_STATE_RATE_LIMIT ?? 180),
  windowMs: 60_000,
});

const validKinds: FrontendUiStateKind[] = [
  "pet_progress",
  "egg_progress",
  "ui_preferences",
];
const maxPayloadBytes = Number(process.env.FRONTEND_UI_STATE_MAX_BYTES ?? 32_768);

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFrontendUiStateKind(value: unknown): value is FrontendUiStateKind {
  return typeof value === "string" && validKinds.includes(value as FrontendUiStateKind);
}

function payloadSizeBytes(payload: unknown) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function buildEntry(kind: FrontendUiStateKind, payload: Record<string, unknown>, updatedAt?: unknown) {
  const parsedUpdatedAt = typeof updatedAt === "string" && !Number.isNaN(Date.parse(updatedAt))
    ? updatedAt
    : new Date().toISOString();

  return {
    allowedUse: "ui_state_only",
    canAutoAdjustWeights: false,
    canCreateTradeSignal: false,
    canMutateLiveRanking: false,
    kind,
    payload,
    updatedAt: parsedUpdatedAt,
    version: "frontend-ui-state.v1",
  } satisfies FrontendUiStateEntry;
}

export async function GET(request: NextRequest) {
  const limit = frontendUiStateRateLimiter.consume(`frontend-ui-state:get:${clientKey(request)}`);

  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", resetAt: limit.resetAt },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const kind = request.nextUrl.searchParams.get("kind");

  if (!isFrontendUiStateKind(kind)) {
    return NextResponse.json(
      { ok: false, error: "invalid_ui_state_kind", validKinds },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  const entry = await appPersistenceRepository.getFrontendUiState(kind);
  const uiState = resource(entry, entry ? "live" : "empty", {
    source: `${appPersistenceRepository.mode}:frontend_ui_states`,
    updatedAt: entry?.updatedAt,
    reason: entry ? undefined : "该前端状态还没有写入服务器。",
  });

  return NextResponse.json(
    { ok: true, uiState },
    {
      headers: {
        ...rateLimitHeaders(limit),
        "cache-control": "no-store",
        "x-chuan-contract": "frontend-ui-state.v1",
        "x-chuan-data-status": uiState.status,
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const limit = frontendUiStateRateLimiter.consume(`frontend-ui-state:post:${clientKey(request)}`);

  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", resetAt: limit.resetAt },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(body) || !isFrontendUiStateKind(body.kind) || !isRecord(body.payload)) {
    return NextResponse.json(
      { ok: false, error: "invalid_ui_state_request", validKinds },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  const size = payloadSizeBytes(body.payload);

  if (size > maxPayloadBytes) {
    return NextResponse.json(
      {
        ok: false,
        error: "ui_state_payload_too_large",
        maxPayloadBytes,
        payloadBytes: size,
      },
      { status: 413, headers: rateLimitHeaders(limit) },
    );
  }

  const entry = await appPersistenceRepository.upsertFrontendUiState(
    buildEntry(body.kind, body.payload, body.updatedAt),
  );
  const uiState = resource(entry, "live", {
    source: `${appPersistenceRepository.mode}:frontend_ui_states`,
    updatedAt: entry.updatedAt,
  });

  return NextResponse.json(
    { ok: true, uiState },
    {
      headers: {
        ...rateLimitHeaders(limit),
        "cache-control": "no-store",
        "x-chuan-contract": "frontend-ui-state.v1",
        "x-chuan-data-status": uiState.status,
      },
    },
  );
}
