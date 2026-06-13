import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type VercelConfig = {
  crons?: Array<{
    path: string;
    schedule: string;
  }>;
};

test("vercel.json stays deployable on a free Hobby preview account", () => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as VercelConfig;

  assert.deepEqual(
    config.crons ?? [],
    [],
    "free Vercel previews cannot include high-frequency cron jobs; use an external cron or Pro later",
  );
});
