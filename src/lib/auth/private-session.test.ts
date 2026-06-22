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
  CHUAN_SESSION_PASSWORD: "correct-password",
  CHUAN_SESSION_SECRET: "test-secret-with-enough-entropy",
  CHUAN_SESSION_TTL_SECONDS: "600",
};

test("privateSessionConfig is disabled by default and requires password plus secret when enabled", () => {
  assert.deepEqual(privateSessionConfig({}), {
    configured: false,
    cookieName: "chuan_session",
    enabled: false,
    ttlSeconds: 604_800,
  });
  assert.equal(privateSessionConfig(env).enabled, true);
  assert.equal(privateSessionConfig(env).configured, true);
  assert.equal(privateSessionConfig(env).ttlSeconds, 600);
});

test("verifyPrivatePassword compares configured private password", () => {
  assert.equal(verifyPrivatePassword("correct-password", env), true);
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
