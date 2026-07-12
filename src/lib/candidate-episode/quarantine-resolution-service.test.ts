import assert from "node:assert/strict";
import test from "node:test";
import type { PostgresTransactionAdapter } from "./transaction-adapter";
import type { TransactionContext } from "./transaction-adapter";
import { CandidateQuarantineResolutionService } from "./quarantine-resolution-service";
import type { ShadowCandidateObservationV1 } from "./shadow-capture-source";

const approvalDigest = `sha256:${"a".repeat(64)}`;
const sourcePayloadHash = `sha256:${"b".repeat(64)}`;

function payload(): ShadowCandidateObservationV1 {
  return {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERPETUAL",
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: "BTCUSDT",
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: ["instrument:BINANCE:BTCUSDT:PERPETUAL"],
    },
    firstSeenAt: "2026-07-12T00:00:00.000Z",
    lastSeenAt: "2026-07-12T00:00:00.000Z",
    observationPrice: "100000",
    observationPriceFactId: "ticker:BINANCE:BTCUSDT:2026-07-12T00:00:00.000Z",
    discoveryReasons: ["deep_scan_candidate"],
    priorityTier: "A",
    maturity: "deep_candidate",
    directionState: "unknown",
    expiresAt: null,
    releaseId: "release-1",
    sourceScanCycleId: "scan-1",
  };
}

function harness() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const transactions: PostgresTransactionAdapter = {
    async withTransaction(_options, work) {
      return work({
        async query<T>(sql: string, params: unknown[] = []) {
          calls.push({ sql, params });
          return {
            rows: [{
              resolution_id: "018f47d6-2c40-7e30-8a20-000000000010",
              scope: "production_radar",
              quarantined_outbox_id: "018f47d6-2c40-7e30-8a20-000000000001",
              resolution_action: params[3],
              reason_code: params[4],
              approval_ref: params[5],
              approval_digest: params[6],
              source_payload_hash: sourcePayloadHash,
              replacement_outbox_id: params[7],
              resolved_by_role: "market_radar_migration_login",
              resolved_at: "2026-07-12T00:01:00.000Z",
            }] as T[],
          };
        },
        async withSavepoint<T>(work: (tx: TransactionContext) => Promise<T>) {
          return work(this);
        },
      });
    },
  };
  const ids = [
    "018f47d6-2c40-7e30-8a20-000000000010",
    "018f47d6-2c40-7e30-8a20-000000000011",
  ];
  return {
    calls,
    service: new CandidateQuarantineResolutionService(transactions, {
      generateId: () => ids.shift()!,
    }),
  };
}

test("approved replay validates and hashes the replacement payload", async () => {
  const { calls, service } = harness();
  const result = await service.resolve({
    scope: "production_radar",
    quarantinedOutboxId: "018f47d6-2c40-7e30-8a20-000000000001",
    action: "replay_after_approved_fix",
    reasonCode: "payload_contract_fixed",
    approvalRef: "WP-G0.2/Q-001",
    approvalDigest,
    replacementPayload: payload(),
    migrationId: "candidate-episode-v1",
    authorityEpoch: 1,
  });

  assert.equal(result.replacementOutboxId, "018f47d6-2c40-7e30-8a20-000000000011");
  assert.match(String(calls[0]?.params[9]), /^sha256:[a-f0-9]{64}$/);
  assert.match(calls[0]?.sql ?? "", /resolve_shadow_outbox_quarantine_v3/);
});

test("approved exclusion never carries replacement data", async () => {
  const { calls, service } = harness();
  const result = await service.resolve({
    scope: "production_radar",
    quarantinedOutboxId: "018f47d6-2c40-7e30-8a20-000000000001",
    action: "exclude_invalid_source",
    reasonCode: "source_identity_invalid",
    approvalRef: "WP-G0.2/Q-002",
    approvalDigest,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 1,
  });

  assert.equal(result.replacementOutboxId, null);
  assert.equal(calls[0]?.params[7], null);
  assert.equal(calls[0]?.params[8], null);
  assert.equal(calls[0]?.params[9], null);
});

test("resolution rejects weak approval and action payload mismatches before SQL", async () => {
  const { calls, service } = harness();
  await assert.rejects(() => service.resolve({
    scope: "production_radar",
    quarantinedOutboxId: "outbox-1",
    action: "exclude_invalid_source",
    reasonCode: "bad reason",
    approvalRef: "approval",
    approvalDigest,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 1,
  }), /reason_code_invalid/);
  await assert.rejects(() => service.resolve({
    scope: "production_radar",
    quarantinedOutboxId: "outbox-1",
    action: "exclude_invalid_source",
    reasonCode: "invalid_source",
    approvalRef: "approval",
    approvalDigest: "not-a-digest",
    replacementPayload: payload(),
    migrationId: "candidate-episode-v1",
    authorityEpoch: 1,
  }), /approval_digest_invalid/);
  assert.equal(calls.length, 0);
});
