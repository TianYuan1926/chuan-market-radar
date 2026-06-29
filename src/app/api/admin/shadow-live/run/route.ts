import { NextResponse, type NextRequest } from "next/server";
import { isCronRequestAuthorized } from "@/lib/api/cron-auth";
import { buildShadowLiveSignalTrackerReport } from "@/lib/journal/shadow-live-signal-tracker";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"), process.env, { requireSecret: true })) {
    return NextResponse.json(
      {
        ok: false,
        error: "shadow_live_secret_missing_or_invalid",
        detail: "影子实盘写入端点必须使用 CRON_SECRET Bearer 鉴权。",
      },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "x-chuan-shadow-live": "blocked",
        },
      },
    );
  }

  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "shadow_live_admin",
  });
  const report = buildShadowLiveSignalTrackerReport({
    signals: snapshot.signals,
  });
  const writtenEventIds: string[] = [];

  for (const entry of report.entries) {
    await appPersistenceRepository.addJournalEvent(entry);
    writtenEventIds.push(entry.id);
  }

  return NextResponse.json(
    {
      ok: true,
      shadowLive: {
        ...report,
        entries: undefined,
        writtenEventIds,
        writtenEvents: writtenEventIds.length,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-chuan-shadow-live": "processed",
      },
    },
  );
}
