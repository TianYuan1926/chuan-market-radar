import assert from "node:assert/strict";
import test from "node:test";
import { MutableCollectorClock } from "../../../testing/m1-collector-harness";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import type { CollectorRequestPolicy } from "./contracts";
import { CollectorRequestGovernor } from "./adapters/request-governor";

function policy(overrides: Partial<CollectorRequestPolicy> = {}): CollectorRequestPolicy {
  return {
    globalMaxConcurrentRequests: 1,
    maxQueueDepth: 1,
    maxQueueWaitMs: 1_000,
    providerBudgets: {
      BINANCE_FUTURES: {
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 2,
        windowMs: 60_000,
      },
      OKX_SWAP: {
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 2,
        windowMs: 60_000,
      },
      BYBIT_LINEAR_PERPETUAL: {
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 2,
        windowMs: 60_000,
      },
    },
    ...overrides,
  };
}

test("enforces provider rolling quotas and resets only after the configured window", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.000Z");
  const delegate: PublicJsonTransport = async () => ({
    data: {},
    ok: true,
    receivedAt: clock.now().toISOString(),
    status: 200,
  });
  const governor = new CollectorRequestGovernor({
    clock,
    delegate,
    policy: policy({
      providerBudgets: {
        ...policy().providerBudgets,
        BINANCE_FUTURES: {
          maxConcurrentRequests: 1,
          maxRequestsPerWindow: 1,
          windowMs: 60_000,
        },
      },
    }),
  });
  governor.beginCycle("quota-cycle");
  const transport = governor.transportFor("BINANCE_FUTURES");
  const request = {
    allowedHost: "fapi.binance.com",
    url: "https://fapi.binance.com/fapi/v1/exchangeInfo",
  };

  assert.equal((await transport(request)).ok, true);
  const rejected = await transport(request);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.ok ? null : rejected.failure.kind, "RATE_LIMITED");
  assert.equal(
    rejected.ok ? null : rejected.failure.reasonCode,
    "collector_provider_quota_exhausted",
  );
  clock.advance(60_000);
  assert.equal((await transport(request)).ok, true);
  assert.equal(governor.snapshot().venues[0]?.quotaRejected, 1);
});

test("bounds concurrency and rejects queue overflow without invoking the provider", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.000Z");
  const releases: Array<() => void> = [];
  let delegateCalls = 0;
  const delegate: PublicJsonTransport = async () => {
    delegateCalls += 1;
    await new Promise<void>((resolve) => releases.push(resolve));
    return {
      data: {},
      ok: true,
      receivedAt: clock.now().toISOString(),
      status: 200,
    };
  };
  const governor = new CollectorRequestGovernor({
    clock,
    delegate,
    policy: policy(),
  });
  governor.beginCycle("queue-cycle");
  const transport = governor.transportFor("BINANCE_FUTURES");
  const request = {
    allowedHost: "fapi.binance.com",
    url: "https://fapi.binance.com/fapi/v1/exchangeInfo",
  };
  const first = transport(request);
  const second = transport(request);
  const third = await transport(request);

  assert.equal(third.ok, false);
  assert.equal(
    third.ok ? null : third.failure.reasonCode,
    "collector_backpressure_queue_full",
  );
  assert.equal(delegateCalls, 1);
  assert.equal(governor.snapshot().queueDepth, 1);
  releases.shift()?.();
  assert.equal((await first).ok, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(delegateCalls, 2);
  releases.shift()?.();
  assert.equal((await second).ok, true);
  const telemetry = governor.snapshot();
  assert.equal(telemetry.maxGlobalConcurrencyObserved, 1);
  assert.equal(telemetry.maxQueueDepthObserved, 1);
  assert.equal(telemetry.queueRejected, 1);
});

test("expires queued work that exceeds its waiting budget", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.000Z");
  const releases: Array<() => void> = [];
  const delegate: PublicJsonTransport = async () => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return {
      data: {},
      ok: true,
      receivedAt: clock.now().toISOString(),
      status: 200,
    };
  };
  const governor = new CollectorRequestGovernor({
    clock,
    delegate,
    policy: policy(),
  });
  governor.beginCycle("queue-timeout-cycle");
  const transport = governor.transportFor("BINANCE_FUTURES");
  const request = {
    allowedHost: "fapi.binance.com",
    url: "https://fapi.binance.com/fapi/v1/exchangeInfo",
  };
  const first = transport(request);
  const second = transport(request);
  clock.advance(1_001);
  releases.shift()?.();
  await first;
  const expired = await second;

  assert.equal(expired.ok, false);
  assert.equal(
    expired.ok ? null : expired.failure.reasonCode,
    "collector_backpressure_queue_timeout",
  );
  assert.equal(governor.snapshot().queueRejected, 1);
});

test("rejects cross-venue hosts before quota or network use", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.000Z");
  let called = false;
  const governor = new CollectorRequestGovernor({
    clock,
    delegate: async () => {
      called = true;
      throw new Error("must not be called");
    },
    policy: policy(),
  });
  governor.beginCycle("host-cycle");
  const result = await governor.transportFor("BINANCE_FUTURES")({
    allowedHost: "www.okx.com",
    url: "https://www.okx.com/api/v5/public/instruments",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.ok ? null : result.failure.reasonCode,
    "collector_adapter_host_mismatch",
  );
  assert.equal(called, false);
});
