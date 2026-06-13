import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildScanArchiveBundle } from "./scan-archive-bundle";
import type { ScanArchiveSummary, ScanReplayFrame } from "./types";

function scanSummary(
  id: string,
  generatedAt: string,
  topSymbols: string[],
): ScanArchiveSummary {
  return {
    id,
    source: "mock",
    status: "ready",
    generatedAt,
    scannedCount: id === "scan-b" ? 25 : 24,
    anomalyCount: id === "scan-b" ? 5 : 4,
    candidateCount: topSymbols.length,
    topSymbols,
    notes: ["archive bundle test"],
  };
}

function replayFrame(
  id: string,
  generatedAt: string,
  symbols: string[],
): ScanReplayFrame {
  return {
    id,
    source: "mock",
    status: "ready",
    generatedAt,
    nextScanAt: "2026-06-12T10:45:00.000+08:00",
    cadenceMinutes: 15,
    scannedCount: id === "scan-b" ? 25 : 24,
    anomalyCount: id === "scan-b" ? 5 : 4,
    candidateCount: symbols.length,
    signals: symbols.map((symbol) => ({
      id: `${symbol.toLowerCase()}-signal`,
      symbol,
      direction: "long",
      state: "near_trigger",
      timeframe: "15m",
      confidence: 75,
      risk: "medium",
      riskReward: 3.2,
      strategyStatus: "waiting",
      updatedAt: generatedAt,
      summary: `${symbol} test replay`,
    })),
  };
}

test("buildScanArchiveBundle reads durable archive state through the repository", async () => {
  const repository = createMemoryPersistenceRepository({ maxScanArchives: 24 });
  await repository.addScanArchive(
    scanSummary("scan-a", "2026-06-12T10:15:00.000+08:00", ["ENAUSDT"]),
    replayFrame("scan-a", "2026-06-12T10:15:00.000+08:00", ["ENAUSDT"]),
  );
  await repository.addScanArchive(
    scanSummary("scan-b", "2026-06-12T10:30:00.000+08:00", ["ENAUSDT", "SUIUSDT"]),
    replayFrame("scan-b", "2026-06-12T10:30:00.000+08:00", ["ENAUSDT", "SUIUSDT"]),
  );

  const bundle = await buildScanArchiveBundle(repository, "scan-a", {
    listLimit: 8,
    maxEntries: 24,
  });

  assert.deepEqual(bundle.entries.map((entry) => entry.id), ["scan-b", "scan-a"]);
  assert.equal(bundle.latestReplay?.id, "scan-a");
  assert.deepEqual(bundle.comparison?.newSignalSymbols, ["SUIUSDT"]);
  assert.deepEqual(bundle.retention, {
    storage: "memory",
    durable: false,
    maxEntries: 24,
  });
});
