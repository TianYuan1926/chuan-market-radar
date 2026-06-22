import type { NextRequest } from "next/server";
import {
  boundedFrontendLiveEventLimit,
  buildFrontendLiveEvents,
} from "@/lib/market/live-events";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";
import { readConfiguredRuntimeProbeReport } from "@/lib/runtime/worker-heartbeat";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const defaultIntervalMs = 5_000;
const minIntervalMs = 2_000;
const maxIntervalMs = 30_000;

function positiveInterval(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultIntervalMs;
  }

  return Math.max(minIntervalMs, Math.min(maxIntervalMs, Math.floor(parsed)));
}

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function buildPayload(limit: number) {
  const runtimeProbes = await readConfiguredRuntimeProbeReport(process.env);

  return buildFrontendLiveEvents({
    limit,
    repository: appPersistenceRepository,
    runtimeProbes,
  });
}

export function GET(request: NextRequest) {
  const limit = boundedFrontendLiveEventLimit(request.nextUrl.searchParams.get("limit"));
  const intervalMs = positiveInterval(request.nextUrl.searchParams.get("intervalMs"));

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const push = async () => {
        if (closed) {
          return;
        }

        try {
          const payload = await buildPayload(limit);
          controller.enqueue(sseEvent("frontend-live-events", payload));
        } catch (error) {
          controller.enqueue(sseEvent("frontend-live-events-error", {
            error: error instanceof Error ? error.message : "unknown_error",
            ok: false,
          }));
        }

        if (!closed) {
          timer = setTimeout(push, intervalMs);
        }
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) {
          clearTimeout(timer);
        }
        try {
          controller.close();
        } catch {
          // The browser may already have closed the connection.
        }
      });

      controller.enqueue(sseEvent("frontend-live-events-open", {
        intervalMs,
        ok: true,
        triggeredScan: false,
        version: "frontend-live-events.sse.v1",
      }));
      await push();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
      "x-chuan-contract": "frontend-live-events.sse.v1",
      "x-chuan-triggered-scan": "false",
    },
  });
}
