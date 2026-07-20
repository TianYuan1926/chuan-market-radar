import { mkdir, statfs, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  evaluateM2HistoricalAcquisitionPreflight,
} from "../research/historical-acquisition-contract";
import {
  executeM2HistoricalTechnicalPilot,
} from "../research/historical-acquisition-pilot";
import {
  M2_BINANCE_VISION_SOURCE_ASSESSMENT,
  M2_BINANCE_VISION_SOURCE_QUALIFICATION,
  M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
} from "../research/historical-source-registry";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing required ${name} argument`);
  }
  return value;
}

function safeByteCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("filesystem free-byte count exceeds the safe integer range");
  }
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "preflight" && command !== "verify") {
    throw new Error("usage: m2-historical-source-pilot <preflight|verify> --output-root <absolute-path>");
  }
  const outputRootArgument = argument("--output-root");
  if (!isAbsolute(outputRootArgument)) {
    throw new Error("historical pilot output root must be absolute");
  }
  const outputRoot = resolve(outputRootArgument);
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const filesystem = await statfs(outputRoot);
  const availableBytes = safeByteCount(filesystem.bavail * filesystem.bsize);
  const evaluatedAt = new Date().toISOString();
  const preflight = evaluateM2HistoricalAcquisitionPreflight({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt,
    outputRoot,
    worktreeRoot: process.cwd(),
    availableBytes,
  });
  await writeFile(
    join(
      outputRoot,
      `technical-pilot-preflight.${preflight.preflightDigest.slice("sha256:".length)}.json`,
    ),
    `${JSON.stringify(preflight, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  if (command === "preflight") {
    process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
    if (preflight.decision !== "ALLOW") {
      process.exitCode = 2;
    }
    return;
  }
  if (preflight.decision !== "ALLOW") {
    throw new Error(
      `technical pilot preflight blocked: ${preflight.reasonCodes.join(",")}`,
    );
  }
  const result = await executeM2HistoricalTechnicalPilot({
    plan: M2_BINANCE_VISION_TECHNICAL_PILOT_PLAN,
    preflight,
    executedAt: evaluatedAt,
  });
  process.stdout.write(`${JSON.stringify({ preflight, result }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`m2 historical source pilot failed: ${message}\n`);
  process.exitCode = 1;
});
