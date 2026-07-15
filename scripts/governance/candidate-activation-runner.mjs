import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateProductionExecutionContract } from "../production/candidate-activation/bundle.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json",
);

export async function loadActivationRunnerContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateActivationRunnerPreparation() {
  const result = await validateProductionExecutionContract(ROOT);
  return {
    status: result.status,
    productionDecision: result.status === "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE"
      ? "READY_FOR_EXACT_EXTERNAL_REQUEST_AFTER_RUNTIME_IDENTITY_FINAL_PASS"
      : "BLOCKED_LOCAL_RELEASE_INVALID",
    productionMutationAllowed: false,
    currentCodeActivationAllowed: true,
    runnerArtifactSha256: result.runnerArtifactSha256,
    runnerArtifactFiles: 5,
    activationReleaseArtifactSha256: result.activationArtifactSha256,
    activationReleaseArtifactFiles: 16,
    contractSha256: result.contractSha256,
    violations: result.violations,
  };
}

async function main() {
  const result = await validateActivationRunnerPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
