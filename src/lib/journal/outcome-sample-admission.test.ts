import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent, SignalMaturityStage, SignalOutcomeStatus } from "@/lib/analysis/types";
import { buildOutcomeCalibrationAdmission } from "./outcome-sample-admission";

function outcomeEvent({
  id,
  outcomeStatus,
  result = "watching",
  signalMaturityStage = "EVIDENCE_SIGNAL",
}: {
  id: string;
  outcomeStatus: SignalOutcomeStatus;
  result?: JournalEvent["result"];
  signalMaturityStage?: SignalMaturityStage;
}): JournalEvent {
  return {
    id,
    signalId: `${id}-signal`,
    symbol: `${id.toUpperCase()}USDT`,
    title: "生命周期复盘",
    result,
    note: "自动复盘样本。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000Z",
    outcomeStatus,
    reviewStatus: outcomeStatus === "pending" ? "tracking" : "closed",
    signalMaturityStage,
  };
}

test("buildOutcomeCalibrationAdmission gates samples before manual calibration without auto weights", () => {
  const readyEvents = [
    ...Array.from({ length: 8 }, (_, index) => outcomeEvent({
      id: `validated-${index}`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    })),
    ...Array.from({ length: 4 }, (_, index) => outcomeEvent({
      id: `counter-${index}`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    })),
    outcomeEvent({ id: "pending-1", outcomeStatus: "pending" }),
  ];
  const collectingEvents = readyEvents.slice(0, 5);
  const blockedEvents = [
    outcomeEvent({ id: "loss-1", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "loss-2", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "loss-3", outcomeStatus: "loss", result: "loss" }),
    outcomeEvent({ id: "win-1", outcomeStatus: "partial_win", result: "win" }),
  ];

  const ready = buildOutcomeCalibrationAdmission(readyEvents);
  const collecting = buildOutcomeCalibrationAdmission(collectingEvents);
  const blocked = buildOutcomeCalibrationAdmission(blockedEvents);

  assert.equal(ready.status, "ready");
  assert.equal(ready.closedEvents, 12);
  assert.equal(ready.validatedEvents, 8);
  assert.equal(ready.counterEvidenceEvents, 4);
  assert.equal(ready.pendingEvents, 1);
  assert.equal(ready.validationRatePercent, 67);
  assert.equal(ready.manualCalibrationReady, true);
  assert.equal(ready.canAutoAdjustWeights, false);
  assert.equal(ready.autoWeightEligible, false);
  assert.equal(ready.allowedUse, "research_only");
  assert.match(ready.nextStep, /人工校准/);
  assert.match(ready.guardrail, /不能自动改权重/);

  assert.equal(collecting.status, "collecting");
  assert.equal(collecting.manualCalibrationReady, false);
  assert.match(collecting.blockers.join(" / "), /closed_samples_below_threshold/);

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.manualCalibrationReady, false);
  assert.match(blocked.blockers.join(" / "), /counterevidence_dominates/);
});

test("buildOutcomeCalibrationAdmission only counts evidence-level or trade-plan-ready signals", () => {
  const admission = buildOutcomeCalibrationAdmission([
    outcomeEvent({
      id: "evidence-win",
      outcomeStatus: "partial_win",
      result: "win",
      signalMaturityStage: "EVIDENCE_SIGNAL",
    }),
    outcomeEvent({
      id: "plan-win",
      outcomeStatus: "saved",
      result: "saved",
      signalMaturityStage: "TRADE_PLAN_READY",
    }),
    outcomeEvent({
      id: "deep-candidate",
      outcomeStatus: "loss",
      result: "loss",
      signalMaturityStage: "DEEP_SCAN_CANDIDATE",
    }),
    outcomeEvent({
      id: "light-mark",
      outcomeStatus: "loss",
      result: "loss",
      signalMaturityStage: "LIGHT_SCAN_MARK",
    }),
    {
      ...outcomeEvent({
        id: "legacy-unknown",
        outcomeStatus: "loss",
        result: "loss",
      }),
      signalMaturityStage: undefined,
    },
  ]);

  assert.equal(admission.sampleCount, 2);
  assert.equal(admission.validatedEvents, 2);
  assert.equal(admission.failedEvents, 0);
  assert.equal(admission.counterEvidenceEvents, 0);
});
