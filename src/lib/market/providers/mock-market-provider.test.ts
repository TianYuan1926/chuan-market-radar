import assert from "node:assert/strict";
import test from "node:test";
import { mockMarketProvider } from "./mock-market-provider";

test("mock market provider includes indicator matrix evidence for the strategy card preview", async () => {
  const snapshot = await mockMarketProvider.fetchSnapshot();
  const signal = snapshot.signals.find((item) => item.symbol === "ENAUSDT");

  assert.ok(signal, "ENAUSDT demo signal should exist");
  assert.ok(
    signal.evidence.some((item) => item.label === "多周期指标矩阵"),
    "demo signal should expose multi-timeframe indicator matrix evidence",
  );
  assert.ok(
    signal.evidence.some((item) => item.label === "成交量分布"),
    "demo signal should expose volume distribution evidence",
  );
});
