import assert from "node:assert/strict";
import test from "node:test";
import {
  validateHttpsSessionEvidence,
  validateLocalHttpsSessionPreparation,
} from "./g0-https-session-gate.mjs";

const now = new Date("2026-07-17T00:00:00Z");

function fixture() {
  return {
    schemaVersion: "market-radar-g0-https-session-evidence.v1",
    status: "pass",
    generatedAt: "2026-07-16T23:00:00Z",
    validUntil: "2026-07-17T12:00:00Z",
    identity: {
      releaseId: "market-radar-release-20260716",
      commit: "a".repeat(40),
      sourceArtifactSha256: "b".repeat(64),
    },
    access: {
      accessMode: "public_tls",
      host: "radar.example.com",
      httpsReachable: true,
      certificateVerified: true,
      httpRedirectStatus: 308,
      mixedContentCount: 0,
      publicListenerCount: 1,
      trustedNetworkEnforced: false,
      hstsMaxAge: 31_536_000,
      contentSecurityPolicy: true,
      permissionsPolicy: true,
    },
    tlsBurnIn: {
      startedAt: "2026-07-09T22:55:00Z",
      endedAt: "2026-07-16T23:00:00Z",
      sampleCount: 2020,
      maxGapSeconds: 300,
      failureCount: 0,
      releaseId: "market-radar-release-20260716",
    },
    privateSession: {
      enabled: true,
      configured: true,
      unauthenticatedPageRejected: true,
      unauthenticatedApiRejected: true,
      cookieSecure: true,
      cookieHttpOnly: true,
      cookieSameSite: "lax",
      logoutInvalidated: true,
      noStore: true,
      loginRateLimited: true,
      securityLogRedacted: true,
      rotationProcedureReady: true,
    },
  };
}

test("local HTTPS and private-session preparation remains production blocked", () => {
  const result = validateLocalHttpsSessionPreparation();
  assert.equal(result.status, "pass");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.currentDefaultPublicHostIsPlainHttp, true);
  assert.match(result.productionDecision, /BLOCKED_PENDING/);
});

test("private-session credentials are scoped to Web and not inherited by workers", () => {
  const result = validateLocalHttpsSessionPreparation();
  assert.equal(result.status, "pass");
  assert.equal(
    result.violations.includes("session_credentials_exposed_to_shared_worker_environment"),
    false,
  );
});

test("G0 HTTPS evidence requires exact seven-day TLS and private-session proof", () => {
  assert.equal(validateHttpsSessionEvidence(fixture(), now).status, "pass");

  for (const mutate of [
    (value) => { value.access.certificateVerified = false; },
    (value) => { value.access.hstsMaxAge = 0; },
    (value) => { value.tlsBurnIn.sampleCount = 100; },
    (value) => { value.tlsBurnIn.failureCount = 1; },
    (value) => { value.privateSession.cookieSecure = false; },
    (value) => { value.privateSession.logoutInvalidated = false; },
    (value) => { value.privateSession.noStore = false; },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.equal(validateHttpsSessionEvidence(evidence, now).status, "fail");
  }
});

test("trusted private mode requires zero public listeners", () => {
  const evidence = fixture();
  evidence.access = {
    ...evidence.access,
    accessMode: "trusted_private",
    host: "10.0.0.8",
    publicListenerCount: 0,
    trustedNetworkEnforced: true,
    hstsMaxAge: 0,
  };
  assert.equal(validateHttpsSessionEvidence(evidence, now).status, "pass");
  evidence.access.publicListenerCount = 1;
  assert.equal(validateHttpsSessionEvidence(evidence, now).status, "fail");
});
