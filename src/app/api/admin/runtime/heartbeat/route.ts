import { NextResponse, type NextRequest } from "next/server";
import { isCronRequestAuthorized } from "@/lib/api/cron-auth";
import {
  normalizeRuntimeWorkerKey,
  writeConfiguredWorkerHeartbeat,
  type WorkerHeartbeatStatus,
} from "@/lib/runtime/worker-heartbeat";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set<WorkerHeartbeatStatus>(["starting", "ok", "error"]);

function textField(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function statusField(value: unknown): WorkerHeartbeatStatus {
  return allowedStatuses.has(value as WorkerHeartbeatStatus) ? value as WorkerHeartbeatStatus : "ok";
}

function elapsedMsField(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

export async function POST(request: NextRequest) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"), process.env, { requireSecret: true })) {
    return NextResponse.json({
      ok: false,
      error: "unauthorized",
    }, {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "x-chuan-runtime-heartbeat": "blocked",
      },
    });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const worker = normalizeRuntimeWorkerKey(textField(body.worker, 80) ?? "");

  if (worker === "unknown-worker") {
    return NextResponse.json({
      ok: false,
      error: "worker_required",
    }, {
      status: 400,
      headers: {
        "cache-control": "no-store",
        "x-chuan-runtime-heartbeat": "invalid",
      },
    });
  }

  const result = await writeConfiguredWorkerHeartbeat({
    detail: textField(body.detail),
    elapsedMs: elapsedMsField(body.elapsedMs),
    status: statusField(body.status),
    task: textField(body.task, 120),
    worker,
  }, process.env);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: {
      "cache-control": "no-store",
      "x-chuan-runtime-heartbeat": result.ok ? "stored" : "unavailable",
    },
  });
}
