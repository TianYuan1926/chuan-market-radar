import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  assessMarketRegime,
} from "./market-regime";

function candles(closes: number[]): Candle[] {
  return closes.map((close, index) => ({
    closeTime: `2026-07-06T${String(index).padStart(2, "0")}:59:59.000Z`,
    close,
    high: close * 1.01,
    low: close * 0.99,
    open: index === 0 ? close : closes[index - 1] ?? close,
    openTime: `2026-07-06T${String(index).padStart(2, "0")}:00:00.000Z`,
    volume: 1000 + index,
  }));
}

test("assessMarketRegime returns UNKNOWN/PARTIAL when data is insufficient", () => {
  const regime = assessMarketRegime({
    candles: candles([100, 101]),
    minimumCandles: 24,
  });

  assert.equal(regime.primary, "UNKNOWN");
  assert.equal(regime.dataStatus, "PARTIAL");
  assert.equal(regime.canCreateTradePlan, false);
  assert.equal(regime.canMutateLiveRanking, false);
});

test("assessMarketRegime detects trend up and stays context-only", () => {
  const regime = assessMarketRegime({
    altBreadthPercent: 52,
    altVolumeChangePercent: 3,
    btcDominanceChangePercent: 0.1,
    candles: candles(Array.from({ length: 24 }, (_, index) => 100 + index * 0.3)),
    liquidityScore: 80,
    minimumCandles: 24,
  });

  assert.equal(regime.primary, "TREND_UP");
  assert.equal(regime.dataStatus, "READY");
  assert.equal(regime.allowedUse, "market_context_only");
  assert.equal(regime.canCreateTradePlan, false);
});

test("assessMarketRegime detects risk off from trend down plus weak alt breadth", () => {
  const regime = assessMarketRegime({
    altBreadthPercent: 22,
    altVolumeChangePercent: -12,
    btcDominanceChangePercent: 1.2,
    candles: candles(Array.from({ length: 24 }, (_, index) => 120 - index * 0.4)),
    liquidityScore: 70,
    minimumCandles: 24,
  });

  assert.equal(regime.primary, "RISK_OFF");
  assert.ok(regime.secondary.includes("TREND_DOWN"));
  assert.match(regime.warnings.join(" "), /不能替代个币结构和 RR/);
});

test("assessMarketRegime detects alt rotation without granting decision authority", () => {
  const regime = assessMarketRegime({
    altBreadthPercent: 68,
    altVolumeChangePercent: 18,
    btcDominanceChangePercent: -0.9,
    candles: candles(Array.from({ length: 24 }, (_, index) => 100 + Math.sin(index) * 0.4)),
    liquidityScore: 76,
    minimumCandles: 24,
  });

  assert.equal(regime.primary, "ALT_ROTATION");
  assert.equal(regime.canCreateTradePlan, false);
  assert.equal(regime.canMutateLiveRanking, false);
});

test("assessMarketRegime prioritizes low liquidity as risk context", () => {
  const regime = assessMarketRegime({
    altBreadthPercent: 55,
    altVolumeChangePercent: 2,
    btcDominanceChangePercent: 0,
    candles: candles(Array.from({ length: 24 }, (_, index) => 100 + index * 0.05)),
    liquidityScore: 20,
    minimumCandles: 24,
  });

  assert.equal(regime.primary, "LOW_LIQUIDITY");
  assert.ok(regime.warnings.some((warning) => warning.includes("不能直接阻断或生成 READY")));
});
