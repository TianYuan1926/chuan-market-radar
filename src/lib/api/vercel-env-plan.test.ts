import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVercelEnvCliSummary,
  buildVercelEnvPlan,
  type VercelEnvPlan,
} from "./vercel-env-plan";

const previewEnv = {
  CRON_SECRET: "b".repeat(64),
  DATABASE_DRIVER: "neon",
  DATABASE_URL: "postgresql://neondb_owner:secret@example.neon.tech/neondb",
  JOURNAL_API_RATE_LIMIT: "30",
  MARKET_DATA_PROVIDER: "mock",
  NEXT_PUBLIC_SITE_NAME: "川",
  PERSISTENCE_SCOPE: "public-demo",
  SCAN_API_RATE_LIMIT: "60",
};

function envVar(plan: VercelEnvPlan, key: string) {
  const item = plan.variables.find((variable) => variable.key === key);

  assert.ok(item, `missing env variable ${key}`);

  return item;
}

test("buildVercelEnvPlan marks the current Neon mock setup as preview deployable", () => {
  const plan = buildVercelEnvPlan({
    env: previewEnv,
    target: "preview",
  });

  assert.equal(plan.target, "preview");
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.missingRequired, []);
  assert.equal(envVar(plan, "DATABASE_URL").present, true);
  assert.equal(envVar(plan, "DATABASE_URL").sensitivity, "secret");
  assert.equal(envVar(plan, "DATABASE_URL").safeValue, undefined);
  assert.equal(envVar(plan, "MARKET_DATA_PROVIDER").safeValue, "mock");
  assert.equal(envVar(plan, "COINGLASS_DAILY_REQUEST_BUDGET").safeValue, "300");
});

test("buildVercelEnvPlan blocks preview deployment when Neon persistence variables are missing", () => {
  const plan = buildVercelEnvPlan({
    env: {
      ...previewEnv,
      DATABASE_URL: "",
    },
    target: "preview",
  });

  assert.equal(plan.ready, false);
  assert.deepEqual(plan.missingRequired, ["DATABASE_URL"]);
  assert.equal(envVar(plan, "DATABASE_URL").present, false);
});

test("buildVercelEnvPlan blocks production when it is still configured for mock data", () => {
  const plan = buildVercelEnvPlan({
    env: previewEnv,
    target: "production",
  });

  assert.equal(plan.ready, false);
  assert.deepEqual(plan.missingRequired, ["COINGLASS_API_KEY", "MARKET_DATA_PROVIDER=coinglass"]);
  assert.ok(plan.warnings.some((warning) => warning.includes("mock")));
});

test("buildVercelEnvCliSummary prints safe commands without leaking secret values", () => {
  const plan = buildVercelEnvPlan({
    env: previewEnv,
    target: "preview",
  });
  const summary = buildVercelEnvCliSummary(plan);

  assert.match(summary, /vercel env add DATABASE_URL preview/);
  assert.match(summary, /vercel env add CRON_SECRET preview/);
  assert.doesNotMatch(summary, /neondb_owner/);
  assert.doesNotMatch(summary, new RegExp(previewEnv.CRON_SECRET));
  assert.match(summary, /MARKET_DATA_PROVIDER=mock/);
});
