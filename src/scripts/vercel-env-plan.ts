import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVercelEnvCliSummary,
  buildVercelEnvPlan,
  type VercelDeployTarget,
} from "../lib/api/vercel-env-plan";

function parseEnvFile(contents: string) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");

        return [key, value];
      }),
  );
}

function readLocalEnv() {
  try {
    return parseEnvFile(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
  } catch {
    return {};
  }
}

function targetFromArg(value?: string): VercelDeployTarget {
  if (value === "development" || value === "preview" || value === "production") {
    return value;
  }

  return "preview";
}

const target = targetFromArg(process.argv[2]);
const env = {
  ...readLocalEnv(),
  ...process.env,
};
const plan = buildVercelEnvPlan({ env, target });

process.stdout.write(buildVercelEnvCliSummary(plan));
process.exitCode = plan.ready ? 0 : 1;
