#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();
const compiledScript = path.join(cwd, ".tmp", "market-tests", "scripts", "professional-backtest-audit.js");
const tscBin = path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.signal) {
    console.error(`Command terminated by signal ${result.signal}`);
    process.exit(1);
  }
}

if (!existsSync(compiledScript)) {
  if (!existsSync(tscBin)) {
    console.error("Professional backtest runtime is missing.");
    console.error("Expected compiled script at .tmp/market-tests/scripts/professional-backtest-audit.js.");
    console.error("Production Docker images must run `npm run build:market-cli` and copy .tmp/market-tests.");
    process.exit(1);
  }

  run(tscBin, ["-p", "tsconfig.market-test.json"]);
}

run(process.execPath, [compiledScript, ...process.argv.slice(2)]);
