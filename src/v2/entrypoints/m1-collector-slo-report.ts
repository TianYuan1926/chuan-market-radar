import { readFile } from "node:fs/promises";
import {
  evaluateM1CollectorShadowEvidence,
  M1_COLLECTOR_SHADOW_SLO_POLICIES,
  type M1CollectorShadowSloProfile,
} from "../modules/market-fact/collector/collector-shadow-evidence";

type TextReader = (path: string, encoding: "utf8") => Promise<string>;

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing_required_option:${name}`);
  }
  return value;
}

export async function runM1CollectorSloReport(input: {
  args: readonly string[];
  evaluatedAt?: string;
  readText?: TextReader;
}): Promise<Readonly<{
  exitCode: 0 | 1;
  output: string;
}>> {
  const allowed = new Set(["--input", "--profile", "--release-id"]);
  if (
    input.args.length !== 6 ||
    input.args.some((value, index) => index % 2 === 0 && !allowed.has(value))
  ) {
    throw new Error("collector_slo_report_options_rejected");
  }
  const profile = option(input.args, "--profile") as
    M1CollectorShadowSloProfile;
  if (!(profile in M1_COLLECTOR_SHADOW_SLO_POLICIES)) {
    throw new Error("collector_slo_report_profile_rejected");
  }
  const readText = input.readText ?? readFile;
  const report = evaluateM1CollectorShadowEvidence({
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    jsonLines: await readText(option(input.args, "--input"), "utf8"),
    profile,
    releaseId: option(input.args, "--release-id"),
  });
  return Object.freeze({
    exitCode: report.conclusion === "PASS" ? 0 : 1,
    output: JSON.stringify(report),
  });
}

if (require.main === module) {
  void runM1CollectorSloReport({ args: process.argv.slice(2) })
    .then((result) => {
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    })
    .catch(() => {
      process.stderr.write("collector_slo_report_failed\n");
      process.exitCode = 1;
    });
}
