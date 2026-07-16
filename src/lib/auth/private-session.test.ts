import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrivateSessionToken,
  privateSessionConfig,
  verifyPrivatePassword,
  verifyPrivateSessionToken,
} from "./private-session";

const env = {
  CHUAN_PRIVATE_MODE_ENABLED: "true",
  CHUAN_SESSION_PASSWORD: "correct-password-long",
  CHUAN_SESSION_SECRET: "test-secret-with-enough-entropy-0123456789",
  CHUAN_SESSION_TTL_SECONDS: "600",
};

test("privateSessionConfig is disabled by default and requires password plus secret when enabled", () => {
  assert.deepEqual(privateSessionConfig({}), {
    configurationIssues: ["password_missing", "secret_missing"],
    configured: false,
    cookieName: "chuan_session",
    enabled: false,
    rotationReady: false,
    ttlSeconds: 604_800,
  });
  assert.equal(privateSessionConfig(env).enabled, true);
  assert.equal(privateSessionConfig(env).configured, true);
  assert.equal(privateSessionConfig(env).ttlSeconds, 600);
});

test("verifyPrivatePassword compares configured private password", () => {
  assert.equal(verifyPrivatePassword("correct-password-long", env), true);
  assert.equal(verifyPrivatePassword("wrong-password", env), false);
  assert.equal(verifyPrivatePassword("anything", {}), false);
});

test("private session token verifies signature and expiry", async () => {
  const now = new Date("2026-06-22T10:00:00.000Z");
  const token = await createPrivateSessionToken("chuan", env, now);

  assert.equal(typeof token, "string");

  const session = await verifyPrivateSessionToken(
    token,
    env,
    new Date("2026-06-22T10:05:00.000Z"),
  );
  const expired = await verifyPrivateSessionToken(
    token,
    env,
    new Date("2026-06-22T10:11:00.000Z"),
  );
  const tampered = await verifyPrivateSessionToken(
    `${token?.slice(0, -2)}aa`,
    env,
    new Date("2026-06-22T10:05:00.000Z"),
  );

  assert.equal(session?.sub, "chuan");
  assert.equal(expired, null);
  assert.equal(tampered, null);
});

test("weak private session configuration fails closed", () => {
  const weak = privateSessionConfig({
    CHUAN_PRIVATE_MODE_ENABLED: "true",
    CHUAN_SESSION_PASSWORD: "short",
    CHUAN_SESSION_SECRET: "short",
  });

  assert.equal(weak.configured, false);
  assert.deepEqual(weak.configurationIssues, [
    "password_too_short",
    "secret_too_short",
    "secret_matches_password",
  ]);
  assert.equal(verifyPrivatePassword("short", {
    CHUAN_SESSION_PASSWORD: "short",
    CHUAN_SESSION_SECRET: "short",
  }), false);
});

test("secret rotation accepts the previous secret but new tokens use the current secret", async () => {
  const previousEnv = {
    ...env,
    CHUAN_SESSION_SECRET: "previous-secret-with-enough-entropy-012345",
  };
  const token = await createPrivateSessionToken("chuan", previousEnv);
  const rotatedEnv = {
    ...env,
    CHUAN_SESSION_SECRET_PREVIOUS: previousEnv.CHUAN_SESSION_SECRET,
  };

  assert.equal(privateSessionConfig(rotatedEnv).rotationReady, true);
  assert.equal((await verifyPrivateSessionToken(token, rotatedEnv))?.sub, "chuan");
  assert.equal(await verifyPrivateSessionToken(token, env), null);
});

test("strict token claims reject future issuance and unexpected payloads", async () => {
  const now = new Date("2026-07-17T00:00:00Z");
  const futureToken = await createPrivateSessionToken(
    "chuan",
    env,
    new Date(now.getTime() + 60_000),
  );

  assert.equal(await verifyPrivateSessionToken(futureToken, env, now), null);
});
