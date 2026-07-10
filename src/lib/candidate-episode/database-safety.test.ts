import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRehearsalDatabaseTarget,
  RehearsalDatabaseSafetyError,
} from "./database-safety";

const baseEnv = {
  APP_ENV: "rehearsal",
  NODE_ENV: "test",
  WP_G0_2_REHEARSAL: "true",
  WP_G0_2_REHEARSAL_DATABASE_URL:
    "postgresql://localhost:55432/wp_g0_2_rehearsal_source",
};

test("accepts an explicitly authorized loopback rehearsal database", () => {
  assert.deepEqual(
    assertRehearsalDatabaseTarget({ environment: "rehearsal", env: baseEnv }),
    {
      databaseName: "wp_g0_2_rehearsal_source",
      hostClass: "local",
      transport: "tcp",
    },
  );
});

test("accepts a private rehearsal unix socket target", () => {
  const target = assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: {
      ...baseEnv,
      WP_G0_2_REHEARSAL_DATABASE_URL:
        "postgresql:///wp_g0_2_rehearsal_restore?host=%2Ftmp%2Fwp_g0_2_rehearsal_socket&port=55432",
    },
  });

  assert.deepEqual(target, {
    databaseName: "wp_g0_2_rehearsal_restore",
    hostClass: "local",
    transport: "unix_socket",
  });
});

for (const [name, env, environment, reason] of [
  ["requires the explicit rehearsal CLI environment", baseEnv, "production", "environment"],
  ["rejects NODE_ENV production", { ...baseEnv, NODE_ENV: "production" }, "rehearsal", "node_env"],
  ["requires APP_ENV rehearsal", { ...baseEnv, APP_ENV: "test" }, "rehearsal", "app_env"],
  ["requires the exact rehearsal flag", { ...baseEnv, WP_G0_2_REHEARSAL: "1" }, "rehearsal", "rehearsal_flag"],
  ["rejects a generic DATABASE_URL", { ...baseEnv, DATABASE_URL: "present" }, "rehearsal", "generic_database_env"],
  ["rejects a generic POSTGRES_URL", { ...baseEnv, POSTGRES_URL: "present" }, "rehearsal", "generic_database_env"],
  [
    "rejects remote hosts",
    { ...baseEnv, WP_G0_2_REHEARSAL_DATABASE_URL: "postgresql://db.example.invalid/wp_g0_2_rehearsal_source" },
    "rehearsal",
    "database_host",
  ],
  [
    "rejects the generic docker postgres hostname",
    { ...baseEnv, WP_G0_2_REHEARSAL_DATABASE_URL: "postgresql://postgres/wp_g0_2_rehearsal_source" },
    "rehearsal",
    "database_host",
  ],
  [
    "rejects non-prefixed databases",
    { ...baseEnv, WP_G0_2_REHEARSAL_DATABASE_URL: "postgresql://localhost/chuan_market_radar" },
    "rehearsal",
    "database_name",
  ],
  [
    "rejects production-looking databases even with a rehearsal prefix",
    { ...baseEnv, WP_G0_2_REHEARSAL_DATABASE_URL: "postgresql://localhost/wp_g0_2_rehearsal_prod" },
    "rehearsal",
    "database_name",
  ],
  ["rejects any production override", { ...baseEnv, WP_G0_2_ALLOW_PRODUCTION: "false" }, "rehearsal", "production_override"],
] as const) {
  test(name, () => {
    assert.throws(
      () => assertRehearsalDatabaseTarget({ environment, env }),
      (error: unknown) =>
        error instanceof RehearsalDatabaseSafetyError && error.reason === reason,
    );
  });
}

test("accepts only a dedicated docker rehearsal hostname", () => {
  const target = assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: {
      ...baseEnv,
      WP_G0_2_REHEARSAL_DATABASE_URL:
        "postgresql://wp-g0-2-rehearsal-postgres/wp_g0_2_rehearsal_ci",
    },
  });

  assert.equal(target.hostClass, "docker");
});
