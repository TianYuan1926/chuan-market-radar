import assert from "node:assert/strict";
import test from "node:test";
import type { ScanAssetState, ScanCoverage } from "./types";
import { buildScanAssetStatesFromCoverage } from "./scan-asset-state";

function state(overrides: Partial<ScanAssetState> = {}): ScanAssetState {
  return {
    baseAsset: "TIA",
    consecutiveSkipped: 2,
    deepScanCount1h: 0,
    deepScanCount24h: 1,
    dynamicPriorityScore: 0,
    lastDeepScannedAt: "2026-06-20T08:00:00.000Z",
    lastLightScannedAt: "2026-06-20T08:45:00.000Z",
    lastSelectedReason: "tier_rotation",
    lastSkippedReason: null,
    payload: {
      recentDeepScanTimes: ["2026-06-20T08:00:00.000Z"],
      source: "scan_rotation_state_v1",
    },
    rotationPriorityScore: 180000,
    statePool: "CANDIDATE",
    symbol: "TIAUSDT",
    tier: "active",
    updatedAt: "2026-06-20T08:45:00.000Z",
    wasDisplacedByDynamicPriority: false,
    ...overrides,
  };
}

function coverage(overrides: Partial<ScanCoverage> = {}): ScanCoverage {
  return {
    batchIndex: 7,
    coveragePercent: 2,
    dynamicPriority: {
      boostedAssets: ["TIA"],
      candidateCount: 2,
      candidates: [],
      enabled: true,
      reasonCounts: {
        anomaly: 1,
        early_opportunity: 0,
        liquidity: 1,
        recent_deep_scan: 0,
        overextended_move: 0,
        recent_signal: 1,
        rotation_age: 0,
        venue_coverage: 1,
      },
      slotsAvailable: 4,
      slotsUsed: 1,
      topAssets: [
        {
          baseAsset: "TIA",
          dynamicBoost: 820000,
          reasons: ["anomaly", "recent_signal"],
          score: 1000000,
          staticPriority: 180000,
          symbol: "TIAUSDT",
        },
      ],
    },
    eligible: 120,
    nextBatchIndex: 8,
    pending: 2,
    pendingAssets: ["SUI", "ENA"],
    scanned: 3,
    scannedAssets: ["BTC", "ETH", "TIA"],
    skipped: 0,
    skippedAssets: [],
    statePool: {
      assetSamples: [
        {
          baseAsset: "TIA",
          cadenceHint: "深扫",
          nextAction: "保持观察",
          priorityReason: "dynamic_priority:anomaly|recent_signal",
          reasons: ["dynamic_priority"],
          scannedThisRound: true,
          selectedThisRound: true,
          state: "BATTLE_WATCH",
          symbol: "TIAUSDT",
          tier: "active",
        },
        {
          baseAsset: "SUI",
          cadenceHint: "排队",
          nextAction: "等待轮转",
          priorityReason: "waiting_for_rotation",
          reasons: ["tier_rotation"],
          scannedThisRound: false,
          selectedThisRound: false,
          state: "COLD",
          symbol: "SUIUSDT",
          tier: "long_tail",
        },
      ],
      counts: {
        BATTLE_READY: 0,
        BATTLE_WATCH: 1,
        CANDIDATE: 0,
        COLD: 2,
        COOLDOWN: 0,
        DEEP_QUEUE: 3,
        HOT: 0,
      WARM: 0,
      },
      deepScan: {
        anchorSlots: 2,
        battleSlots: 1,
        capacity: 3,
        deepScanCoveragePercent: 2.5,
        estimatedCycleMinutes: 600,
        explorationSlots: 0,
        guardrail: "test",
        highPriorityPendingCount: 1,
        hotSlots: 1,
        oldestPendingAge: 30,
        pendingCount: 117,
        pendingQualitySamples: [
          {
            baseAsset: "SUI",
            priorityReason: "waiting_for_rotation",
            state: "COLD",
            symbol: "SUIUSDT",
          },
        ],
        queuedAssets: ["SUI", "ENA"],
        reviveSlots: 0,
        selectedAssets: ["BTC", "ETH", "TIA"],
        skippedLowPriorityCount: 116,
      },
      guardrail: "test",
      lanes: [],
      mode: "state_pool_mvp",
      omittedAssetCount: 0,
      proof: {
        coldExplorationAssets: [],
        nextBatchAssets: ["SUI", "ENA"],
        notEliminatedAssets: 120,
        notes: [],
        pendingAssets: ["SUI", "ENA"],
        reviveWatchAssets: [],
        scannedAssets: ["BTC", "ETH", "TIA"],
        universeAssets: 120,
      },
      promotionBridge: {
        guardrail: "test",
        samples: [],
        summary: {
          blockedByRisk: 0,
          conflictOrInvalidated: 0,
          eligibleForBattle: 0,
          readonlySignals: 0,
          rewardRiskBlocked: 0,
        },
      },
    },
    tierCounts: {
      active: 1,
      anchor: 2,
      core: 0,
      long_tail: 2,
    },
    total: 120,
    totalBatches: 40,
    twoStageAllocation: {
      guardrail: "test",
      mode: "two_stage_deep_scan_v1",
      slots: [],
      stageOne: {
        priorityCandidates: 2,
        priorityQueued: 1,
        source: "public_light_scan_and_repository_hints",
        universeAssets: 120,
      },
      stageTwo: {
        anchorSlots: 2,
        capacity: 3,
        explorationSlots: 0,
        prioritySlots: 1,
        queuedPriorityAssets: ["ENA"],
        rotationSlots: 0,
        selectedAssets: ["BTC", "ETH", "TIA"],
      },
    },
    ...overrides,
  };
}

test("buildScanAssetStatesFromCoverage records selected assets and increments skipped assets", () => {
  const states = buildScanAssetStatesFromCoverage({
    coverage: coverage(),
    generatedAt: "2026-06-20T09:15:00.000Z",
    previousStates: [
      state(),
      state({
        baseAsset: "SUI",
        consecutiveSkipped: 5,
        lastDeepScannedAt: null,
        lastSelectedReason: null,
        lastSkippedReason: "priority_queue_waiting",
        statePool: "COLD",
        symbol: "SUIUSDT",
        tier: "long_tail",
      }),
    ],
  });
  const bySymbol = new Map(states.map((item) => [item.symbol, item]));

  assert.equal(bySymbol.get("TIAUSDT")?.consecutiveSkipped, 0);
  assert.equal(bySymbol.get("TIAUSDT")?.lastDeepScannedAt, "2026-06-20T09:15:00.000Z");
  assert.equal(bySymbol.get("TIAUSDT")?.lastSelectedReason, "dynamic_priority");
  assert.equal(bySymbol.get("TIAUSDT")?.deepScanCount1h, 1);
  assert.equal(bySymbol.get("TIAUSDT")?.deepScanCount24h, 2);
  assert.equal(bySymbol.get("TIAUSDT")?.dynamicPriorityScore, 820000);
  assert.equal(bySymbol.get("SUIUSDT")?.consecutiveSkipped, 6);
  assert.equal(bySymbol.get("SUIUSDT")?.lastSkippedReason, "waiting_for_rotation");
  assert.equal(bySymbol.get("ENAUSDT")?.consecutiveSkipped, 1);
  assert.equal(bySymbol.get("ENAUSDT")?.wasDisplacedByDynamicPriority, true);
  assert.equal(bySymbol.get("ENAUSDT")?.lastSkippedReason, "priority_queue_waiting");
});
