import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { MarketRadarSnapshot } from "../market/types";
import { buildPersistenceSchemaSql } from "../persistence/persistence-contract";
import { createPostgresPersistenceRepository } from "../persistence/persistence-store";
import { CandidateShadowCaptureComposition } from "./shadow-capture-composition";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_COMPOSITION_REHEARSAL_DATABASE_URL;
const integrationTest = rehearsalUrl ? test : test.skip;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

integrationTest("isolated PostgreSQL 16 proves the complete composition archive-outbox-consumer path", async () => {
  assert.match(rehearsalUrl!, /127\.0\.0\.1/);
  assert.match(rehearsalUrl!, /wp_g0_2_rehearsal_composition/);
  const pool = new Pool({ connectionString: rehearsalUrl, max: 6 });
  const now = new Date("2026-07-12T04:00:00.000Z");
  const releaseId = "composition-rehearsal-v1";
  const scanId = "composition-pg16-scan-1";
  const summary = {
    anomalyCount: 1,
    candidateCount: 1,
    generatedAt: now.toISOString(),
    id: scanId,
    notes: ["composition_rehearsal_only"],
    scannedCount: 1,
    source: "coinglass" as const,
    status: "ready" as const,
    topSymbols: ["BTCUSDT"],
  };
  const replayFrame = {
    anomalyCount: 1,
    cadenceMinutes: 5,
    candidateCount: 1,
    generatedAt: now.toISOString(),
    id: scanId,
    nextScanAt: new Date(now.getTime() + 300_000).toISOString(),
    scannedCount: 1,
    signals: [],
    source: "coinglass" as const,
    status: "ready" as const,
  };
  const snapshot = {
    derivatives: [],
    heatmap: [],
    instrumentPool: { instruments: [], rejected: [], summary: {
      accepted: 1, duplicatesRemoved: 0, marketTypes: ["perpetual"], minVolume24hUsd: 0,
      quoteAssets: ["USDT"], rejected: 0, total: 1,
    } },
    instruments: [{
      baseAsset: "BTC", exchange: "BINANCE", id: "BINANCE:BTCUSDT:PERPETUAL",
      isActive: true, lastSeenAt: now.toISOString(), marketType: "perpetual",
      quoteAsset: "USDT", symbol: "BTCUSDT", tags: [], volume24hUsd: 1_000_000,
    }],
    journalEvents: [],
    metadata: {
      ...summary,
      cadenceMinutes: 5,
      isRealtime: true,
      lightScan: {
        acceptedCount: 1, candidateCount: 1, generatedAt: now.toISOString(), notes: [],
        requestCount: 1, source: "binance", status: "ready",
        topCandidates: [{
          baseAsset: "BTC", changePercent24h: 4, distanceFromHighPercent: 2,
          distanceFromLowPercent: 8, price: 100, reasons: ["volume expansion"], score: 82,
          state: "HOT", symbol: "BTCUSDT", volatilityPercent: 4, volume24hUsd: 1_000_000,
        }],
        universeCount: 1,
      },
      mode: "scheduled",
      nextScanAt: replayFrame.nextScanAt,
      riskGate: "on",
      source: "composite",
      staleAfterMinutes: 15,
    },
    signals: [],
    tickers: [{
      changePercent24h: 4, exchange: "BINANCE", high24h: 104, low24h: 96,
      price: 100, symbol: "BTCUSDT", updatedAt: now.toISOString(), volume24hUsd: 1_000_000,
    }],
  } satisfies MarketRadarSnapshot;

  try {
    await pool.query(buildPersistenceSchemaSql());
    await pool.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
         migration_id, phase, epoch, started_at, deadline_at, write_frozen,
         approved_release_id, approval_digest, updated_at
       ) VALUES ($1,'shadow_capture',1,$2,$3,false,$4,$5,$2)`,
      [
        "candidate-episode-v1",
        now.toISOString(),
        new Date(now.getTime() + 72 * 60 * 60_000).toISOString(),
        releaseId,
        sha256("composition-rehearsal-approval"),
      ],
    );
    const transactions = createPostgresTransactionAdapter(pool);
    const composition = new CandidateShadowCaptureComposition({
      codeActivationAllowed: true,
      consumerTransactions: transactions,
      env: {
        CANDIDATE_EPISODE_SHADOW_WRITE: "true",
        CANDIDATE_RUNTIME_RELEASE_ID: releaseId,
      },
      now: () => now,
      monitorTransactions: transactions,
      repository: createPostgresPersistenceRepository({ client: pool, scope: "composition_rehearsal" }),
      sourceTransactions: transactions,
    });

    const persisted = await composition.persistScanArchive(summary, replayFrame, snapshot);
    assert.equal(persisted.runtime.mode, "active");
    assert.equal(persisted.mapping?.observations.length, 1);
    const before = await pool.query<{ archives: string; pending: string }>(`
      SELECT
        (SELECT count(*)::text FROM scan_archives WHERE scope='composition_rehearsal') AS archives,
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
          WHERE source_type='legacy_scan_candidate' AND status='pending') AS pending
    `);
    assert.deepEqual(before.rows[0], { archives: "1", pending: "1" });

    const consumed = await composition.runBatch({ limit: 10 });
    assert.equal(consumed.batch?.completed, 1);
    const after = await pool.query<{ completed: string; episodes: string }>(`
      SELECT
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
          WHERE source_type='legacy_scan_candidate' AND status='completed') AS completed,
        (SELECT count(*)::text FROM candidate_authority.candidate_episodes) AS episodes
    `);
    assert.deepEqual(after.rows[0], { completed: "1", episodes: "1" });
    const monitor = await composition.monitor();
    assert.equal(monitor?.metrics.unresolvedTotal, 0);
    assert.equal(monitor?.status, "ready");

    await pool.query(`CREATE ROLE composition_legacy_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await pool.query("GRANT SELECT, INSERT, UPDATE ON TABLE scan_archives TO composition_legacy_runtime");
    const legacyUrl = rehearsalUrl!.replace("rehearsal@", "composition_legacy_runtime@");
    const legacyPool = new Pool({ connectionString: legacyUrl, max: 2 });
    try {
      const dormantScanId = "composition-pg16-dormant-identity";
      const dormantSummary = { ...summary, id: dormantScanId };
      const dormantReplay = { ...replayFrame, id: dormantScanId };
      const dormantSnapshot = {
        ...snapshot,
        metadata: { ...snapshot.metadata, id: dormantScanId },
      };
      const legacyTransactions = createPostgresTransactionAdapter(legacyPool);
      const dormant = new CandidateShadowCaptureComposition({
        codeActivationAllowed: true,
        consumerTransactions: legacyTransactions,
        env: {
          CANDIDATE_EPISODE_SHADOW_WRITE: "true",
          CANDIDATE_RUNTIME_RELEASE_ID: releaseId,
        },
        monitorTransactions: legacyTransactions,
        repository: createPostgresPersistenceRepository({
          client: legacyPool,
          scope: "composition_legacy_runtime",
        }),
        sourceTransactions: legacyTransactions,
      });
      const dormantResult = await dormant.persistScanArchive(
        dormantSummary,
        dormantReplay,
        dormantSnapshot,
      );
      assert.equal(dormantResult.runtime.mode, "dormant");
      assert.equal(dormantResult.runtime.blockers.includes("control_read_failed"), true);
      const dormantProof = await pool.query<{ archives: string; outbox: string }>(`
        SELECT
          (SELECT count(*)::text FROM scan_archives
            WHERE scope='composition_legacy_runtime' AND id=$1) AS archives,
          (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
            WHERE source_id LIKE $1 || ':%') AS outbox
      `, [dormantScanId]);
      assert.deepEqual(dormantProof.rows[0], { archives: "1", outbox: "0" });
    } finally {
      await legacyPool.end();
    }
  } finally {
    await pool.end();
  }
});
