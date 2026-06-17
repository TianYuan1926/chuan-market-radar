import assert from "node:assert/strict";
import test from "node:test";

import {
  createEvidenceLedger,
  type EvidenceItem,
} from "./evidence-ledger";

const baseEvidence: EvidenceItem = {
  id: "ev-1",
  symbol: "ENAUSDT",
  timeframe: "1h",
  family: "PRICE_STRUCTURE",
  source: "market_structure",
  label: "range_breakout_retest",
  direction: "BULLISH",
  strength: 72,
  confidence: 84,
  weightHint: 0.28,
  dataFreshness: "fresh",
  fact: "1h candles reclaimed the range high and held the retest.",
  reasoning: "A clean reclaim and retest supports a bullish structure hypothesis.",
  createdAt: "2026-06-17T00:00:00.000Z",
};

test("evidence ledger stores traceable evidence items with required market fields", () => {
  const ledger = createEvidenceLedger([baseEvidence]);

  assert.deepEqual(ledger.all(), [baseEvidence]);
  assert.equal(ledger.getById("ev-1"), baseEvidence);
  assert.equal(ledger.getById("missing"), undefined);
});

test("evidence ledger groups evidence by family", () => {
  const riskEvidence: EvidenceItem = {
    ...baseEvidence,
    id: "ev-2",
    family: "DERIVATIVES",
    source: "funding_interpreter",
    label: "funding_crowding",
    direction: "RISK",
    fact: "Funding is elevated while price stalls under resistance.",
    reasoning: "Crowded leverage raises chase and exhaustion risk.",
  };
  const ledger = createEvidenceLedger([baseEvidence, riskEvidence]);

  assert.deepEqual(ledger.byFamily("PRICE_STRUCTURE"), [baseEvidence]);
  assert.deepEqual(ledger.byFamily("DERIVATIVES"), [riskEvidence]);
  assert.deepEqual(ledger.byFamily("TECHNICAL_INDICATOR"), []);
});

test("evidence ledger dedupes same source timeframe and label", () => {
  const updatedEvidence: EvidenceItem = {
    ...baseEvidence,
    id: "ev-1b",
    strength: 81,
    fact: "1h candles reclaimed the range high twice and held the retest.",
    reasoning: "The newest structure reading replaces the stale duplicate.",
    createdAt: "2026-06-17T00:05:00.000Z",
  };
  const independentEvidence: EvidenceItem = {
    ...baseEvidence,
    id: "ev-3",
    timeframe: "4h",
    strength: 66,
  };

  const ledger = createEvidenceLedger([baseEvidence, updatedEvidence, independentEvidence]);

  assert.deepEqual(ledger.all(), [updatedEvidence, independentEvidence]);
  assert.equal(ledger.getById("ev-1"), undefined);
  assert.equal(ledger.getById("ev-1b"), updatedEvidence);
});

test("evidence ledger append returns a new ledger without mutating the original", () => {
  const emptyLedger = createEvidenceLedger();
  const nextLedger = emptyLedger.append(baseEvidence);

  assert.deepEqual(emptyLedger.all(), []);
  assert.deepEqual(nextLedger.all(), [baseEvidence]);
  assert.equal(nextLedger.getById("ev-1"), baseEvidence);
});
