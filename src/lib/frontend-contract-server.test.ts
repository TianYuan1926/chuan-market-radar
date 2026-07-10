import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { dataStatusToHealthLevel } from "./contracts/frontend-health-level";

test("only live frontend resources map to ready health", () => {
  assert.equal(dataStatusToHealthLevel("live"), "ready");
  assert.equal(dataStatusToHealthLevel("cached"), "degraded");
  assert.equal(dataStatusToHealthLevel("stale"), "degraded");
  assert.equal(dataStatusToHealthLevel("partial"), "degraded");
  assert.equal(dataStatusToHealthLevel("empty"), "degraded");
  assert.equal(dataStatusToHealthLevel("failed"), "blocked");
  assert.equal(dataStatusToHealthLevel("error"), "blocked");
});

test("frontend truth surfaces do not claim practical readiness or animate market facts", () => {
  const siteNav = readFileSync(new URL("../components/site-nav.tsx", import.meta.url), "utf8");
  const scanProof = readFileSync(new URL("../components/scan-proof.tsx", import.meta.url), "utf8");
  const radarControl = readFileSync(new URL("../components/dashboard/radar-control.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(siteNav, /实战雷达/u);
  assert.match(siteNav, /研究雷达/u);
  assert.doesNotMatch(scanProof, /useLiveNumber/u);
  assert.equal((`${scanProof}\n${radarControl}`.match(/全市场扫描证明/gu) ?? []).length, 1);
});
