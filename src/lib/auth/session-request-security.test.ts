import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedSessionRateLimit,
  sessionAuditLine,
  sessionResponseHeaders,
  validateSessionMutationOrigin,
} from "./session-request-security";

function request(headers: Record<string, string> = {}, method = "POST") {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    method,
    url: "http://web:3000/api/auth/session",
  };
}

test("session mutation requires the externally forwarded same origin", () => {
  const allowed = validateSessionMutationOrigin(request({
    origin: "https://radar.example.com",
    "sec-fetch-site": "same-origin",
    "x-forwarded-host": "radar.example.com",
    "x-forwarded-proto": "https",
  }));
  const crossSite = validateSessionMutationOrigin(request({
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
    "x-forwarded-host": "radar.example.com",
    "x-forwarded-proto": "https",
  }));
  const missing = validateSessionMutationOrigin(request());

  assert.deepEqual(allowed, { allowed: true, reason: "same_origin" });
  assert.equal(crossSite.allowed, false);
  assert.equal(missing.allowed, false);
  assert.equal(validateSessionMutationOrigin(request({}, "GET")).allowed, true);
});

test("invalid rate limit configuration fails to the bounded default", () => {
  assert.equal(boundedSessionRateLimit(undefined), 30);
  assert.equal(boundedSessionRateLimit("not-a-number"), 30);
  assert.equal(boundedSessionRateLimit("0"), 5);
  assert.equal(boundedSessionRateLimit("999"), 120);
});

test("session responses are never cacheable and audit lines contain no credentials", () => {
  const headers = sessionResponseHeaders(true, { "x-ratelimit-remaining": "2" });
  const audit = sessionAuditLine("invalid_credentials", true, new Date("2026-07-17T00:00:00Z"));

  assert.equal(headers["cache-control"], "no-store, max-age=0");
  assert.equal(headers["x-chuan-private-mode"], "enabled");
  assert.equal(headers["x-ratelimit-remaining"], "2");
  assert.doesNotMatch(audit, /password|secret|token|cookie|account|subject/iu);
});
