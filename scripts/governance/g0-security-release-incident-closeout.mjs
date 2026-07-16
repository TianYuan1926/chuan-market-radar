#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateKnownIssuesRegistry } from "../verify/known-issues-check.mjs";
import { validateReleaseSchemaDocument } from "../verify/release-record-check.mjs";
import { validateLocalHttpsSessionPreparation } from "../verify/g0-https-session-gate.mjs";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPath = "docs/governance/wp-g0-3-g0-5-security-release-incident-local-superpackage.v1.json";

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

export function artifactSha256(baseDir, files) {
  const hash = createHash("sha256");
  for (const path of [...files].sort()) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(resolve(baseDir, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function validateG0CloseoutPreparation(baseDir = rootDir, contractOverride = null) {
  const contract = contractOverride ?? JSON.parse(readFileSync(resolve(baseDir, contractPath), "utf8"));
  const violations = [];
  if (!exactKeys(contract, [
    "artifact", "boundaries", "currentProductionTruth", "httpsSession", "incidentRegistry",
    "nextProductionOrder", "packageId", "releaseEvidence", "schemaVersion", "scope", "status",
  ])) violations.push("top_level_keys_invalid");
  if (contract?.schemaVersion !== "wp-g0.3-g0.5-security-release-incident-local-superpackage.v1" ||
    contract?.packageId !== "WP-G0.3-G0.5-SECURITY-RELEASE-INCIDENT-LOCAL-SUPERPACKAGE" ||
    contract?.status !== "local_preparation_pass_production_g0_not_closed") {
    violations.push("identity_or_status_invalid");
  }

  const truth = contract?.currentProductionTruth;
  for (const key of [
    "activationObservationPass", "productionReconciliationPass", "canonicalReadCutoverPass",
    "productionReleaseRecordPass", "g0ExitPass",
  ]) if (truth?.[key] !== false) violations.push(`false_production_truth_required:${key}`);
  if (truth?.productionTlsStatus !== "unverified_current_production_tls_not_proven") {
    violations.push("production_tls_truth_invalid");
  }

  for (const [key, value] of Object.entries(contract?.scope ?? {})) {
    if (value !== false) violations.push(`scope_must_remain_false:${key}`);
  }
  for (const key of [
    "scanModified", "analysisModified", "strategyModified", "riskRewardModified",
    "backtestModified", "formalBacktestAllowed", "futureOutcomeProductionInputAllowed",
  ]) if (contract?.boundaries?.[key] !== false) violations.push(`boundary_must_remain_false:${key}`);

  const https = contract?.httpsSession;
  if (https?.localPreparationPassed !== true ||
    https?.currentPlainHttpDefaultPreservedAsTruth !== true ||
    https?.publicTlsOrTrustedPrivateEvidenceRequired !== true ||
    https?.privateSessionEvidenceRequired !== true ||
    https?.tlsBurnInSecondsRequired !== 604800 ||
    https?.minimumSamplesRequired !== 2017 ||
    https?.maximumGapSeconds !== 600 ||
    https?.hstsBeforeBurnInAllowed !== false ||
    https?.productionEvidencePassed !== false) violations.push("https_session_boundary_invalid");

  const release = contract?.releaseEvidence;
  for (const key of [
    "localSchemaAndValidatorPassed", "githubMainIsLongTermSource",
    "runtimeHealthSeparateFromReleaseIdentity", "dirtyWorktreeBlocksPass",
    "staleEvidenceBlocksPass", "contentMismatchBlocksPass", "rollbackProofRequired",
  ]) if (release?.[key] !== true) violations.push(`release_guard_missing:${key}`);
  if (release?.productionRecordPassed !== false) violations.push("production_release_record_must_be_false");

  if (contract?.incidentRegistry?.requiredIssueCount !== 10 ||
    contract?.incidentRegistry?.machineCoveredIssueCount !== 10 ||
    contract?.incidentRegistry?.missingOrRenamedRegressionBlocksPass !== true ||
    contract?.incidentRegistry?.localRegistryPassed !== true ||
    contract?.incidentRegistry?.productionG0ExitPassed !== false) {
    violations.push("incident_registry_boundary_invalid");
  }

  const expectedOrder = [
    "PASS_ACTIVATE_AND_OBSERVE",
    "PASS_PRODUCTION_RECONCILIATION_10000_ZERO_DIFFERENCE",
    "PASS_CANONICAL_READ_CUTOVER",
    "PASS_G0_3_HTTPS_SESSION_AND_7_DAY_BURN_IN",
    "PASS_G0_4_CURRENT_RELEASE_RECORD",
    "PASS_G0_5_INCIDENT_REGISTRY_AND_G0_EXIT",
  ];
  if (JSON.stringify(contract?.nextProductionOrder) !== JSON.stringify(expectedOrder)) {
    violations.push("production_order_invalid");
  }

  const artifact = contract?.artifact;
  if (!exactKeys(artifact, ["files", "sha256"]) || !Array.isArray(artifact?.files) ||
    new Set(artifact?.files ?? []).size !== (artifact?.files ?? []).length) {
    violations.push("artifact_manifest_invalid");
  } else {
    const currentSha = artifactSha256(baseDir, artifact.files);
    if (artifact.sha256 !== currentSha) violations.push("artifact_checksum_mismatch");
  }

  const httpsResult = validateLocalHttpsSessionPreparation(baseDir);
  const releaseResult = validateReleaseSchemaDocument(baseDir);
  const incidentResult = validateKnownIssuesRegistry(baseDir);
  if (httpsResult.status !== "pass") violations.push(...httpsResult.violations.map((item) => `https:${item}`));
  if (releaseResult.status !== "pass") violations.push(...releaseResult.violations.map((item) => `release:${item}`));
  if (incidentResult.status !== "pass") violations.push(...incidentResult.violations.map((item) => `incident:${item}`));

  const workflow = readFileSync(resolve(baseDir, ".github/workflows/production.yml"), "utf8");
  const packageJson = readFileSync(resolve(baseDir, "package.json"), "utf8");
  for (const token of [
    "G0 HTTPS and private-session local gate",
    "G0 release-record schema gate",
    "G0 known-incident registry gate",
    "Stop before real deployment",
  ]) if (!workflow.includes(token)) violations.push(`workflow_guard_missing:${token}`);
  for (const token of [
    '"g0:https-session:validate"',
    '"g0:release-record:validate"',
    '"g0:known-issues:validate"',
    '"g0:closeout:validate"',
    '"test:g0-security-closeout-superpackage"',
  ]) if (!packageJson.includes(token)) violations.push(`package_script_missing:${token}`);

  return {
    status: violations.length === 0 ? "pass" : "fail",
    productionDecision: "BLOCKED_UNTIL_CANDIDATE_CHAIN_TLS_RELEASE_AND_G0_EXIT_EVIDENCE_PASS",
    productionMutationAllowed: false,
    g0Completed: false,
    implementationArtifactSha256: artifact?.sha256 ?? null,
    violations,
  };
}

function main() {
  const result = validateG0CloseoutPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "pass" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
