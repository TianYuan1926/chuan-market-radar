import assert from "node:assert/strict";
import test from "node:test";
import {
  professionalAuditRadarScore,
  resolveProfessionalAuditHorizonBarsByBand,
} from "./professional-audit-round";

test("resolveProfessionalAuditHorizonBarsByBand keeps small medium large validation windows distinct", () => {
  assert.deepEqual(resolveProfessionalAuditHorizonBarsByBand(), {
    large: 384,
    medium: 96,
    small: 16,
  });
});

test("resolveProfessionalAuditHorizonBarsByBand accepts explicit per-band overrides", () => {
  assert.deepEqual(resolveProfessionalAuditHorizonBarsByBand({
    large: 480,
    medium: 120,
    small: 20,
  }), {
    large: 480,
    medium: 120,
    small: 20,
  });
});

test("professionalAuditRadarScore rewards early pullback and retest opportunities over late extensions", () => {
  const earlyPullback = professionalAuditRadarScore({
    compressionPct: 34,
    confidence: 61,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.2,
    rangePositionPct: 36,
    symbol: "ARBUSDT",
    volumeRatio: 1.62,
  });
  const lateBreakout = professionalAuditRadarScore({
    compressionPct: 72,
    confidence: 78,
    direction: "long",
    lateAtSelection: true,
    movePct: 13.8,
    rangePositionPct: 92,
    symbol: "ARBUSDT",
    volumeRatio: 2.4,
  });

  assert.ok(
    earlyPullback > lateBreakout,
    `expected early pullback score ${earlyPullback} to beat late breakout score ${lateBreakout}`,
  );
});

test("professionalAuditRadarScore does not let high-volatility meme chase dominate early setups", () => {
  const memeChase = professionalAuditRadarScore({
    compressionPct: 66,
    confidence: 82,
    direction: "long",
    lateAtSelection: true,
    movePct: 18.5,
    rangePositionPct: 95,
    symbol: "1000PEPEUSDT",
    volumeRatio: 3.8,
  });
  const memeEarlySetup = professionalAuditRadarScore({
    compressionPct: 28,
    confidence: 62,
    direction: "long",
    lateAtSelection: false,
    movePct: 4.4,
    rangePositionPct: 33,
    symbol: "1000PEPEUSDT",
    volumeRatio: 1.7,
  });

  assert.ok(
    memeEarlySetup > memeChase,
    `expected meme early setup score ${memeEarlySetup} to beat meme chase score ${memeChase}`,
  );
});

test("professionalAuditRadarScore handles short retest opportunities directionally", () => {
  const shortRetest = professionalAuditRadarScore({
    compressionPct: 39,
    confidence: 60,
    direction: "short",
    lateAtSelection: false,
    movePct: -3.8,
    rangePositionPct: 67,
    symbol: "TIAUSDT",
    volumeRatio: 1.45,
  });
  const alreadyDumpedShort = professionalAuditRadarScore({
    compressionPct: 70,
    confidence: 75,
    direction: "short",
    lateAtSelection: true,
    movePct: -14.2,
    rangePositionPct: 8,
    symbol: "TIAUSDT",
    volumeRatio: 2.3,
  });

  assert.ok(
    shortRetest > alreadyDumpedShort,
    `expected short retest score ${shortRetest} to beat already dumped score ${alreadyDumpedShort}`,
  );
});
