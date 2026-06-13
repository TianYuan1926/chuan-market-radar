import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRateLimiter } from "./rate-limit";

test("MemoryRateLimiter allows requests until the window limit is reached", () => {
  const limiter = new MemoryRateLimiter({
    limit: 2,
    windowMs: 60_000,
  });

  const first = limiter.consume("scan-api", new Date("2026-06-12T02:00:00.000Z"));
  const second = limiter.consume("scan-api", new Date("2026-06-12T02:00:10.000Z"));
  const third = limiter.consume("scan-api", new Date("2026-06-12T02:00:20.000Z"));

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(third.resetAt, "2026-06-12T02:01:00.000Z");
});

test("MemoryRateLimiter resets the bucket after the window expires", () => {
  const limiter = new MemoryRateLimiter({
    limit: 1,
    windowMs: 30_000,
  });

  limiter.consume("journal-api", new Date("2026-06-12T02:00:00.000Z"));
  const blocked = limiter.consume("journal-api", new Date("2026-06-12T02:00:10.000Z"));
  const reset = limiter.consume("journal-api", new Date("2026-06-12T02:00:31.000Z"));

  assert.equal(blocked.allowed, false);
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 0);
  assert.equal(reset.resetAt, "2026-06-12T02:01:01.000Z");
});

test("MemoryRateLimiter isolates buckets by key", () => {
  const limiter = new MemoryRateLimiter({
    limit: 1,
    windowMs: 30_000,
  });

  const left = limiter.consume("client-a", new Date("2026-06-12T02:00:00.000Z"));
  const right = limiter.consume("client-b", new Date("2026-06-12T02:00:00.000Z"));

  assert.equal(left.allowed, true);
  assert.equal(right.allowed, true);
});
