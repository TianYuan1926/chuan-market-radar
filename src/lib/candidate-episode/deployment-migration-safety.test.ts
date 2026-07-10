import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROUTINE_DEPLOYMENT_SCRIPTS = [
  "deploy/scripts/tencent-prod-deploy.sh",
  "deploy/scripts/production-verify.sh",
  "deploy/scripts/production-full-verify.sh",
] as const;

const IMPLICIT_MIGRATION_ENDPOINT = /\/api\/admin\/persistence\/migrate/;
const SEPARATELY_APPROVED_RUNBOOK_NOTICE =
  /Migrations require a separately approved runbook\./;

for (const scriptPath of ROUTINE_DEPLOYMENT_SCRIPTS) {
  test(`${scriptPath} does not execute persistence migrations implicitly`, () => {
    const source = readFileSync(resolve(process.cwd(), scriptPath), "utf8");

    assert.doesNotMatch(source, IMPLICIT_MIGRATION_ENDPOINT);
    assert.match(source, SEPARATELY_APPROVED_RUNBOOK_NOTICE);
  });
}
