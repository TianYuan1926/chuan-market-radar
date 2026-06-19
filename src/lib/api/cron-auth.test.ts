import assert from "node:assert/strict";
import test from "node:test";
import { isCronRequestAuthorized } from "./cron-auth";

test("isCronRequestAuthorized allows local development without a cron secret", () => {
  assert.equal(isCronRequestAuthorized(null, { NODE_ENV: "development" }), true);
});

test("isCronRequestAuthorized blocks hosted runtimes when the cron secret is missing", () => {
  assert.equal(isCronRequestAuthorized(null, { VERCEL: "1", VERCEL_ENV: "production" }), false);
  assert.equal(isCronRequestAuthorized(null, { NODE_ENV: "production" }), false);
});

test("isCronRequestAuthorized can require a cron secret for admin execution endpoints", () => {
  assert.equal(isCronRequestAuthorized(null, { NODE_ENV: "development" }, { requireSecret: true }), false);
  assert.equal(isCronRequestAuthorized("Bearer anything", { NODE_ENV: "development" }, { requireSecret: true }), false);
});

test("isCronRequestAuthorized requires the exact bearer token when a cron secret is configured", () => {
  const env = {
    CRON_SECRET: "secret-123",
    VERCEL: "1",
  };

  assert.equal(isCronRequestAuthorized("Bearer secret-123", env), true);
  assert.equal(isCronRequestAuthorized("Bearer wrong", env), false);
  assert.equal(isCronRequestAuthorized(null, env), false);
});
