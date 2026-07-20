import { readFile } from "node:fs/promises";
import {
  buildM1CollectorEarlyShadowEvidence,
} from "../modules/market-fact/collector/collector-early-shadow-evidence";

type TextReader = (path: string, encoding: "utf8") => Promise<string>;

function parseOptions(args: readonly string[]): Readonly<{
  inputPath: string;
  releaseId: string;
}> {
  if (
    args.length !== 4 ||
    args[0] !== "--input" ||
    args[2] !== "--release-id" ||
    args[1]?.trim() === "" ||
    args[3]?.trim() === ""
  ) {
    throw new Error("collector_early_shadow_report_options_rejected");
  }
  return Object.freeze({ inputPath: args[1]!, releaseId: args[3]! });
}

export async function runM1CollectorEarlyShadowReport(input: {
  args: readonly string[];
  evaluatedAt?: string;
  readText?: TextReader;
}): Promise<Readonly<{
  exitCode: 0;
  output: string;
}>> {
  const options = parseOptions(input.args);
  const report = buildM1CollectorEarlyShadowEvidence({
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    processOutput: await (input.readText ?? readFile)(
      options.inputPath,
      "utf8",
    ),
    releaseId: options.releaseId,
  });
  return Object.freeze({ exitCode: 0 as const, output: JSON.stringify(report) });
}

if (require.main === module) {
  void runM1CollectorEarlyShadowReport({ args: process.argv.slice(2) })
    .then((result) => {
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    })
    .catch(() => {
      process.stderr.write("collector_early_shadow_report_failed\n");
      process.exitCode = 1;
    });
}
