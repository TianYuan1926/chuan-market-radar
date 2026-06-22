import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  buildFrontendLiveEvents,
  type FrontendLiveEvent,
} from "./live-events";
import type {
  ScanArchiveSummary,
  ScanReplayFrame,
} from "./types";

function summary(overrides: Partial<ScanArchiveSummary> = {}): ScanArchiveSummary {
  return {
    anomalyCount: 2,
    candidateCount: 1,
    generatedAt: "2026-06-22T08:15:00.000Z",
    id: "scan-current",
    notes: ["batch 2/4: ENA,SUI"],
    scannedCount: 12,
    source: "coinglass",
    status: "ready",
    topSymbols: ["ENAUSDT"],
    ...overrides,
  };
}

function replay(overrides: Partial<ScanReplayFrame> = {}): ScanReplayFrame {
  return {
    anomalyCount: 2,
    cadenceMinutes: 15,
    candidateCount: 1,
    generatedAt: "2026-06-22T08:15:00.000Z",
    id: "scan-current",
    nextScanAt: "2026-06-22T08:30:00.000Z",
    scannedCount: 12,
    signals: [
      {
        confidence: 82,
        direction: "long",
        id: "ena-long",
        risk: "medium",
        riskReward: 3.4,
        state: "near_trigger",
        strategyStatus: "waiting",
        summary: "ENA entered validation.",
        symbol: "ENAUSDT",
        timeframe: "1h",
        updatedAt: "2026-06-22T08:14:00.000Z",
      },
    ],
    source: "coinglass",
    status: "ready",
    ...overrides,
  };
}

function eventTypes(events: FrontendLiveEvent[]) {
  return events.map((event) => event.type);
}

test("buildFrontendLiveEvents returns an honest empty contract when no archive exists", async () => {
  const repository = createMemoryPersistenceRepository();
  const contract = await buildFrontendLiveEvents({
    now: new Date("2026-06-22T08:16:00.000Z"),
    repository,
  });

  assert.equal(contract.ok, true);
  assert.equal(contract.events.length, 0);
  assert.equal(contract.meta.emptyReason, "no_scan_archive");
  assert.equal(contract.meta.source, "archive");
  assert.equal(contract.meta.triggeredScan, false);
});

test("buildFrontendLiveEvents maps archive deltas into bounded frontend event types", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addScanArchive(
    summary({
      candidateCount: 1,
      generatedAt: "2026-06-22T08:00:00.000Z",
      id: "scan-previous",
      topSymbols: ["ONDOUSDT"],
    }),
    replay({
      candidateCount: 1,
      generatedAt: "2026-06-22T08:00:00.000Z",
      id: "scan-previous",
      nextScanAt: "2026-06-22T08:15:00.000Z",
      signals: [
        {
          confidence: 71,
          direction: "short",
          id: "ondo-short",
          risk: "high",
          riskReward: 2.2,
          state: "normal_watch",
          strategyStatus: "blocked",
          summary: "ONDO lost confirmation.",
          symbol: "ONDOUSDT",
          timeframe: "1h",
          updatedAt: "2026-06-22T07:58:00.000Z",
        },
      ],
    }),
  );
  await repository.addScanArchive(summary(), replay());

  const contract = await buildFrontendLiveEvents({
    limit: 4,
    now: new Date("2026-06-22T08:16:00.000Z"),
    repository,
    runtimeProbes: {
      generatedAt: "2026-06-22T08:16:00.000Z",
      redis: {
        checkedAt: "2026-06-22T08:16:00.000Z",
        detail: "Redis 可读，运行心跳探针可用。",
        status: "healthy",
      },
      staleAfterSeconds: 900,
      workers: [
        {
          ageSec: 12,
          detail: "心跳正常",
          key: "scanner-worker",
          lastSeenAt: "2026-06-22T08:15:48.000Z",
          name: "scanner-worker",
          status: "healthy",
          task: "scan",
        },
      ],
    },
  });

  assert.equal(contract.meta.triggeredScan, false);
  assert.equal(contract.meta.limit, 4);
  assert.equal(contract.events.length, 4);
  assert.deepEqual(eventTypes(contract.events), [
    "candidate_change",
    "signal_change",
    "scan_heartbeat",
    "system_status",
  ]);
  assert.deepEqual(contract.events[0]?.symbols, ["ENAUSDT"]);
  assert.deepEqual(contract.events[1]?.symbols, ["ONDOUSDT"]);
  assert.equal(contract.events[3]?.payload.runtime?.redisStatus, "healthy");
});
