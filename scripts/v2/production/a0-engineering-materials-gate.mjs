import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";
import {
  validateA0ReleaseQualificationPolicy,
} from "./a0-release-qualification-contract.mjs";

const REQUIRED_NODE_VERSION = "22.23.1";
const REQUIRED_NPM_VERSION = "10.9.8";
const MINIMUM_SAFE_NEXT_VERSION = "16.2.12";
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EXACT_SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const FORBIDDEN_LICENSE_PATTERN = /\b(?:AGPL|GPL|SSPL|BUSL)-/u;
const GITLEAKS_FINGERPRINT_PATTERN =
  /^(?<commit>[0-9a-f]{40}):(?<path>[^:\r\n]+):(?<ruleId>[A-Za-z0-9._/-]+):(?<line>[1-9][0-9]*)$/u;
const CODEQL_SUPPRESSION_PATTERN =
  /^\s*\/\/\s*codeql\[(?<ruleId>[A-Za-z0-9._/-]+)\]\s*$/u;
const CODEQL_REVIEW_MARKER_PATTERN =
  /^\s*\/\/\s*(?<id>MR-CODEQL-[0-9]{3}):\s+\S.*$/u;
const REQUIRED_CODEQL_ACTION_VERSION = "4.37.3";
const REQUIRED_CODEQL_BUNDLE_VERSION = "2.26.1";
const REQUIRED_CODEQL_QUERY_PACK = "codeql/javascript-queries";
const REQUIRED_CODEQL_QUERY_PACK_VERSION = "2.4.1";
const REQUIRED_CODEQL_SUPPRESSION_QUERY = "AlertSuppression.ql";
const A0_SECURITY_SOURCE_COMMIT_PARTS = Object.freeze([
  "4f501b0fb8b917ce87e0",
  "687eab8480b5c9595f27",
]);
const A0_SECURITY_REMEDIATION_COMMIT_PARTS = Object.freeze([
  "9f6d4731e6afbf0a68d3",
  "2a98df64da179f20d84a",
]);
const APPROVED_FALSE_POSITIVE_CLASSIFICATIONS = new Set([
  "COMMIT_IDENTITY",
  "CONTENT_DIGEST",
  "PUBLIC_DOCUMENTATION_IDENTIFIER",
  "SYNTHETIC_TEST_CREDENTIAL",
  "SYNTHETIC_TEST_IDENTIFIER",
]);
const APPROVED_V2_ACTION_REVISIONS = new Map([
  ["actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1"],
  ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
  ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
  ["aquasecurity/trivy-action", "ed142fd0673e97e23eac54620cfb913e5ce36c25"],
  ["github/codeql-action", "e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81"],
  ["gitleaks/gitleaks-action", "e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"],
]);

function issue(code, location, detail) {
  return { code, location, detail };
}

function compareSemver(left, right) {
  const parse = (value) => value.split("-", 1)[0].split(".").map(Number);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export function validatePackagePolicy(packageJson, packageLock) {
  const issues = [];
  const expectedPackageManager = `npm@${REQUIRED_NPM_VERSION}`;
  if (packageJson.packageManager !== expectedPackageManager) {
    issues.push(issue(
      "PACKAGE_MANAGER_NOT_EXACT",
      "package.json#packageManager",
      `expected ${expectedPackageManager}`,
    ));
  }
  if (
    packageJson.engines?.node !== REQUIRED_NODE_VERSION ||
    packageJson.volta?.node !== REQUIRED_NODE_VERSION
  ) {
    issues.push(issue(
      "NODE_RUNTIME_NOT_EXACT",
      "package.json",
      `engines.node and volta.node must equal ${REQUIRED_NODE_VERSION}`,
    ));
  }
  if (
    packageJson.engines?.npm !== REQUIRED_NPM_VERSION ||
    packageJson.volta?.npm !== REQUIRED_NPM_VERSION
  ) {
    issues.push(issue(
      "NPM_RUNTIME_NOT_EXACT",
      "package.json",
      `engines.npm and volta.npm must equal ${REQUIRED_NPM_VERSION}`,
    ));
  }

  const rootLock = packageLock.packages?.[""];
  for (const section of ["dependencies", "devDependencies"]) {
    for (
      const [name, version] of Object.entries(packageJson[section] ?? {})
    ) {
      if (!EXACT_SEMVER_PATTERN.test(version)) {
        issues.push(issue(
          "DIRECT_DEPENDENCY_NOT_EXACT",
          `package.json#${section}.${name}`,
          String(version),
        ));
      }
      if (rootLock?.[section]?.[name] !== version) {
        issues.push(issue(
          "LOCK_ROOT_SPEC_DRIFT",
          `package-lock.json#packages[""]/${section}.${name}`,
          `${rootLock?.[section]?.[name] ?? "missing"} != ${version}`,
        ));
      }
      const installedVersion =
        packageLock.packages?.[`node_modules/${name}`]?.version;
      if (installedVersion !== version) {
        issues.push(issue(
          "LOCK_RESOLUTION_DRIFT",
          `package-lock.json#node_modules/${name}`,
          `${installedVersion ?? "missing"} != ${version}`,
        ));
      }
    }
  }

  const nextVersion = packageJson.dependencies?.next;
  if (
    typeof nextVersion !== "string" ||
    !EXACT_SEMVER_PATTERN.test(nextVersion) ||
    compareSemver(nextVersion, MINIMUM_SAFE_NEXT_VERSION) < 0
  ) {
    issues.push(issue(
      "NEXT_SECURITY_PATCH_BELOW_MINIMUM",
      "package.json#dependencies.next",
      `minimum ${MINIMUM_SAFE_NEXT_VERSION}`,
    ));
  }
  if (
    packageJson.devDependencies?.["@next/eslint-plugin-next"] !== nextVersion
  ) {
    issues.push(issue(
      "NEXT_ESLINT_VERSION_DRIFT",
      "package.json#devDependencies.@next/eslint-plugin-next",
      "must equal dependencies.next",
    ));
  }

  for (
    const [packagePath, metadata] of Object.entries(
      packageLock.packages ?? {},
    )
  ) {
    if (packagePath === "") continue;
    if (typeof metadata.license !== "string" || metadata.license.length === 0) {
      issues.push(issue(
        "PACKAGE_LICENSE_MISSING",
        `package-lock.json#${packagePath}`,
        "license metadata is required",
      ));
      continue;
    }
    if (FORBIDDEN_LICENSE_PATTERN.test(metadata.license)) {
      issues.push(issue(
        "FORBIDDEN_STRONG_COPYLEFT_LICENSE",
        `package-lock.json#${packagePath}`,
        metadata.license,
      ));
    }
  }
  return issues;
}

export function validateCollectorRuntimePackagePolicy({
  rootPackageLock,
  runtimePackage,
  runtimePackageLock,
}) {
  const issues = [];
  const expectedDependencies = { pg: "8.16.3", zod: "4.4.3" };
  if (
    runtimePackage?.packageManager !== `npm@${REQUIRED_NPM_VERSION}` ||
    runtimePackage?.engines?.node !== REQUIRED_NODE_VERSION ||
    runtimePackage?.engines?.npm !== REQUIRED_NPM_VERSION ||
    JSON.stringify(runtimePackage?.dependencies) !==
      JSON.stringify(expectedDependencies) ||
    runtimePackage?.devDependencies !== undefined
  ) {
    issues.push(issue(
      "V2_COLLECTOR_RUNTIME_MANIFEST_DRIFT",
      "deploy/v2/m1-collector/runtime/package.json",
      "runtime must remain the exact pg and zod production closure",
    ));
  }
  const runtimeRoot = runtimePackageLock?.packages?.[""];
  const runtimePackages = Object.entries(runtimePackageLock?.packages ?? {});
  if (
    runtimePackageLock?.lockfileVersion !== 3 ||
    JSON.stringify(runtimeRoot?.dependencies) !==
      JSON.stringify(expectedDependencies) ||
    runtimeRoot?.devDependencies !== undefined ||
    runtimePackages.length < 10 ||
    runtimePackages.length > 20
  ) {
    issues.push(issue(
      "V2_COLLECTOR_RUNTIME_LOCK_BOUNDARY_DRIFT",
      "deploy/v2/m1-collector/runtime/package-lock.json",
      "runtime lock must stay exact, production-only and narrowly bounded",
    ));
  }
  for (const [path, metadata] of runtimePackages) {
    if (path === "") continue;
    const rootMetadata = rootPackageLock?.packages?.[path];
    if (
      typeof metadata?.version !== "string" ||
      metadata.version !== rootMetadata?.version ||
      metadata.integrity !== rootMetadata?.integrity
    ) {
      issues.push(issue(
        "V2_COLLECTOR_RUNTIME_LOCK_ROOT_DRIFT",
        `deploy/v2/m1-collector/runtime/package-lock.json#${path}`,
        "runtime dependency must match the authoritative root lock",
      ));
    }
    if (
      typeof metadata?.license !== "string" ||
      metadata.license.length === 0 ||
      FORBIDDEN_LICENSE_PATTERN.test(metadata.license)
    ) {
      issues.push(issue(
        "V2_COLLECTOR_RUNTIME_LICENSE_REJECTED",
        `deploy/v2/m1-collector/runtime/package-lock.json#${path}`,
        String(metadata?.license ?? "missing"),
      ));
    }
  }
  return issues;
}

export function validateWorkflowPolicy(path, source) {
  const issues = [];
  for (
    const match of source.matchAll(
      /^\s*(?:-\s*)?uses:\s*([^\s#]+).*$/gmu,
    )
  ) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const separator = reference.lastIndexOf("@");
    const revision = separator === -1
      ? ""
      : reference.slice(separator + 1);
    if (!FULL_SHA_PATTERN.test(revision)) {
      issues.push(issue(
        "GITHUB_ACTION_NOT_PINNED_TO_FULL_SHA",
        path,
        reference,
      ));
    }
    if (path.startsWith(".github/workflows/v2-")) {
      const actionName = separator === -1
        ? reference
        : reference.slice(0, separator);
      for (
        const [approvedAction, approvedRevision] of
          APPROVED_V2_ACTION_REVISIONS
      ) {
        if (
          actionName === approvedAction ||
          actionName.startsWith(`${approvedAction}/`)
        ) {
          if (revision !== approvedRevision) {
            issues.push(issue(
              "V2_GITHUB_ACTION_REVISION_NOT_APPROVED",
              path,
              `${actionName}@${revision} != ${approvedRevision}`,
            ));
          }
          break;
        }
      }
    }
  }
  for (const match of source.matchAll(/^\s*node-version:\s*([^\s#]+).*$/gmu)) {
    if (match[1] !== REQUIRED_NODE_VERSION) {
      issues.push(issue(
        "GITHUB_NODE_RUNTIME_NOT_EXACT",
        path,
        `${match[1]} != ${REQUIRED_NODE_VERSION}`,
      ));
    }
  }
  if (/^\s*runs-on:\s*[^\n]*-latest\s*$/gmu.test(source)) {
    issues.push(issue(
      "GITHUB_RUNNER_FLOATING_LATEST",
      path,
      "use an explicit supported runner release",
    ));
  }
  return issues;
}

export function validateFullCiWorkflowPolicy(path, source) {
  const issues = [];
  if (
    !/^\s*pull_request:\s*$/mu.test(source) ||
    !/^\s*push:\s*$/mu.test(source) ||
    !source.includes("npm run ci:production")
  ) {
    issues.push(issue(
      "V2_FULL_CI_WORKFLOW_INCOMPLETE",
      path,
      "pull_request, push and ci:production are all required",
    ));
  }

  const checkoutStart = source.search(
    /^\s*uses:\s*actions\/checkout@[0-9a-f]{40}.*$/mu,
  );
  const nextStepStart = checkoutStart === -1
    ? -1
    : source.slice(checkoutStart).search(
      /\n\s{6}-\s+(?:name|uses):/u,
    );
  const checkoutStep = checkoutStart === -1
    ? ""
    : source.slice(
      checkoutStart,
      nextStepStart === -1
        ? source.length
        : checkoutStart + nextStepStart,
    );
  if (!/^\s*fetch-depth:\s*0\s*$/mu.test(checkoutStep)) {
    issues.push(issue(
      "V2_FULL_CI_GIT_HISTORY_SHALLOW",
      path,
      "M0 ancestry proof requires checkout fetch-depth 0",
    ));
  }
  return issues;
}

export function validateSecurityWorkflowPolicy(path, source) {
  const issues = [];
  const requiredJobs = [
    "secret-history-scan",
    "codeql-sast",
    "collector-image-scan",
  ];
  if (
    !/^\s*pull_request:\s*$/mu.test(source) ||
    !/^\s*push:\s*$/mu.test(source) ||
    requiredJobs.some((name) =>
      !new RegExp(`^  ${name}:\\s*$`, "mu").test(source)
    )
  ) {
    issues.push(issue(
      "V2_SECURITY_WORKFLOW_INCOMPLETE",
      path,
      "pull_request, push and three independent security jobs are required",
    ));
  }

  const requiredContracts = [
    "fetch-depth: 0",
    "GITLEAKS_ENABLE_COMMENTS: \"false\"",
    "GITLEAKS_ENABLE_SUMMARY: \"false\"",
    "GITLEAKS_ENABLE_UPLOAD_ARTIFACT: \"false\"",
    "GITLEAKS_VERSION: \"8.30.1\"",
    "gitleaks git",
    "--redact",
    "--log-opts=\"--all\"",
    "node scripts/v2/production/a0-security-evidence.mjs",
    "tools: linked",
    "languages: javascript-typescript",
    "build-mode: none",
    "queries: security-extended",
    "packages: read",
    `packs: ${REQUIRED_CODEQL_QUERY_PACK}@${REQUIRED_CODEQL_QUERY_PACK_VERSION}:${REQUIRED_CODEQL_SUPPRESSION_QUERY}`,
    "output: ${{ runner.temp }}/v2-a0-security/codeql-sarif",
    "upload: always",
    "node scripts/v2/production/a0-codeql-evidence.mjs",
    "Upload sanitized CodeQL evidence",
    "Destroy local CodeQL SARIF",
    "security-events: write",
    "--build-arg \"V2_M1_COLLECTOR_SOURCE_COMMIT=$GITHUB_SHA\"",
    "--file deploy/v2/m1-collector/Dockerfile",
    "version: v0.72.0",
    "scanners: vuln",
    "vuln-type: os,library",
    "severity: HIGH,CRITICAL",
    "ignore-unfixed: \"false\"",
    "exit-code: \"1\"",
    "production_execution=false",
    "production_mutation=false",
    "production_credentials=false",
  ];
  const missingContracts = requiredContracts.filter(
    (contract) => !source.includes(contract),
  );
  if (missingContracts.length > 0) {
    issues.push(issue(
      "V2_SECURITY_TOOL_CONTRACT_INCOMPLETE",
      path,
      missingContracts.join(", "),
    ));
  }

  const packLines = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("packs:"));
  if (
    packLines.length !== 1
    || packLines[0]
      !== `packs: ${REQUIRED_CODEQL_QUERY_PACK}@${REQUIRED_CODEQL_QUERY_PACK_VERSION}:${REQUIRED_CODEQL_SUPPRESSION_QUERY}`
  ) {
    issues.push(issue(
      "V2_CODEQL_SUPPRESSION_QUERY_NOT_EXACT",
      path,
      "the exact linked AlertSuppression query pack must run once",
    ));
  }

  if (
    /runs-on:\s*\[?self-hosted|environment:\s*production|secrets\.|contents:\s*write|id-token:\s*write|packages:\s*write|\bdocker push\b|\bssh\b|\bscp\b|cloud\.tencent\.com/iu
      .test(source)
  ) {
    issues.push(issue(
      "V2_SECURITY_WORKFLOW_HAS_PRODUCTION_AUTHORITY",
      path,
      "security quality jobs must remain GitHub-hosted and production-free",
    ));
  }
  return issues;
}

export function validateA0ReleaseQualificationWorkflowPolicy(path, source) {
  const issues = [];
  const requiredContracts = [
    "V2 A0 Release Qualification",
    "pull_request:",
    "push:",
    "workflow_dispatch:",
    "permissions:\n  contents: read",
    "release-provenance-and-rollback:",
    "performance-and-resource-baseline:",
    "runs-on: ubuntu-24.04",
    "node-version: 22.23.1",
    "fetch-depth: 0",
    "persist-credentials: false",
    "docker/buildx-bin:0.31.1@sha256:49141c168b609ef38f2b11bc231d48e2492ec1f979c2b9aa4ab691790cce115d",
    "npm run build:v2-m1-collector-image",
    "a0-release-qualification.mjs",
    "--output \"type=local,dest=/evidence/rootfs-a\"",
    "--output \"type=local,dest=/evidence/rootfs-b\"",
    "Transfer isolated rootfs evidence ownership without mutating modes",
    "--network none",
    "--read-only",
    "a0-runtime-smoke-evidence.mjs",
    "a0-rootfs-provenance-evidence.mjs",
    "node --expose-gc",
    "a0-performance-resource-baseline.mjs",
    "TEST_ONLY_ENGINEERING_RESOURCE_BASELINE_NOT_LIVE_MARKET_CAPACITY",
    "production_execution=false",
    "production_mutation=false",
    "production_credentials=false",
    "automatic_trading=false",
    "retention-days: 30",
    "case \"$EVIDENCE_ROOT\" in",
    "sudo rm -rf -- \"$EVIDENCE_ROOT\"",
    "EVIDENCE_ROOT=$RUNNER_TEMP/v2-a0-release",
    "EVIDENCE_ROOT=$RUNNER_TEMP/v2-a0-performance",
  ];
  const missing = requiredContracts.filter(
    (contract) => !source.includes(contract),
  );
  if (missing.length > 0) {
    issues.push(issue(
      "V2_A0_RELEASE_QUALIFICATION_WORKFLOW_INCOMPLETE",
      path,
      missing.join(", "),
    ));
  }
  if ((source.match(/--no-cache/gmu) ?? []).length !== 2) {
    issues.push(issue(
      "V2_A0_RELEASE_INDEPENDENT_BUILD_COUNT_DRIFT",
      path,
      "exactly two independent no-cache rootfs builds are required",
    ));
  }
  if ((source.match(/--entrypoint \/buildx/gmu) ?? []).length !== 4) {
    issues.push(issue(
      "V2_A0_BUILDX_ENTRYPOINT_COUNT_DRIFT",
      path,
      "every pinned buildx-bin invocation must execute its exact /buildx binary",
    ));
  }
  if (
    (
      source.match(
        /--volume \/etc\/ssl\/certs:\/etc\/ssl\/certs:ro/gmu,
      ) ?? []
    ).length !== 4
  ) {
    issues.push(issue(
      "V2_A0_BUILDX_CA_BUNDLE_COUNT_DRIFT",
      path,
      "every pinned buildx-bin invocation must receive the runner CA bundle read-only",
    ));
  }
  const ownershipTransfer =
    'sudo -n chown -R "$(id -u):$(id -g)" \\\n'
    + '            "$EVIDENCE_ROOT/rootfs-a" \\\n'
    + '            "$EVIDENCE_ROOT/rootfs-b"';
  const ownershipTransferIndex = source.indexOf(ownershipTransfer);
  if (
    ownershipTransferIndex < 0
    || source.indexOf(ownershipTransfer, ownershipTransferIndex + 1) >= 0
  ) {
    issues.push(issue(
      "V2_A0_ROOTFS_EVIDENCE_OWNERSHIP_TRANSFER_DRIFT",
      path,
      "exactly one ownership-only transfer for the two isolated rootfs exports is required",
    ));
  } else {
    const secondRootfsBuildIndex = source.indexOf(
      '--output "type=local,dest=/evidence/rootfs-b"',
    );
    const provenanceBindingIndex = source.indexOf(
      "a0-rootfs-provenance-evidence.mjs",
    );
    if (
      secondRootfsBuildIndex < 0
      || provenanceBindingIndex < 0
      || ownershipTransferIndex <= secondRootfsBuildIndex
      || ownershipTransferIndex >= provenanceBindingIndex
    ) {
      issues.push(issue(
        "V2_A0_ROOTFS_EVIDENCE_OWNERSHIP_TRANSFER_ORDER_DRIFT",
        path,
        "rootfs ownership must transfer after both exports and before provenance binding",
      ));
    }
  }
  if (/EVIDENCE_ROOT:\s*\$\{\{\s*runner\.temp\s*\}\}/u.test(source)) {
    issues.push(issue(
      "V2_A0_RELEASE_RUNNER_CONTEXT_USED_BEFORE_RUNNER_ALLOCATION",
      path,
      "runner.temp must be bound from RUNNER_TEMP inside a runner step",
    ));
  }
  if (
    /runs-on:\s*\[?self-hosted|environment:\s*production|secrets\.|contents:\s*write|id-token:\s*write|packages:\s*write|\bdocker push\b|\bssh\b|\bscp\b|cloud\.tencent\.com/iu
      .test(source)
  ) {
    issues.push(issue(
      "V2_A0_RELEASE_QUALIFICATION_HAS_PRODUCTION_AUTHORITY",
      path,
      "qualification must remain GitHub-hosted and production-free",
    ));
  }
  return issues;
}

export function validateSecurityEvidencePolicy(path, source) {
  const requiredContracts = [
    'schemaVersion: "v2-a0-secret-scan-evidence.v2"',
    "fullReachableHistory: true",
    "redacted: true",
    "rawFindingArtifactUploaded: false",
    'findingFields: ["commit", "file", "ruleId", "startLine"]',
    "findingLocationsTruncated",
    "reportDigest",
    "productionMutation: false",
  ];
  const missingContracts = requiredContracts.filter(
    (contract) => !source.includes(contract),
  );

  return missingContracts.length === 0
    ? []
    : [issue(
      "V2_SECURITY_EVIDENCE_CONTRACT_INCOMPLETE",
      path,
      missingContracts.join(", "),
    )];
}

export function validateCodeqlEvidencePolicy(path, source) {
  const requiredContracts = [
    'schemaVersion: "v2-a0-codeql-sast-evidence.v3"',
    "blockOnAnyUntriagedResult: true",
    "exactSuppressionRegistryRequired: true",
    "rawSarifArtifactUploaded: false",
    "reviewedInSourceSuppressionRequired: true",
    '"file"',
    '"startLine"',
    '"securitySeverity"',
    "MAX_RESULT_LOCATIONS",
    "resultLocationCount",
    "resultLocationsTruncated",
    '"ruleId"',
    '"count"',
    '"maxLevel"',
    '"maxSecuritySeverity"',
    "blockingResultCount",
    "reviewedSuppressionCount",
    "reviewedSuppressionLocations",
    "reviewedSuppressionLocationsTruncated",
    "loadReviewedCodeqlSuppressions",
    "sarifSetDigest",
    "productionMutation: false",
  ];
  const missingContracts = requiredContracts.filter(
    (contract) => !source.includes(contract),
  );

  return missingContracts.length === 0
    ? []
    : [issue(
      "V2_CODEQL_EVIDENCE_CONTRACT_INCOMPLETE",
      path,
      missingContracts.join(", "),
    )];
}

export function validateCodeqlSuppressionPolicy({
  review,
  reviewPath,
  sources,
}) {
  const issues = [];
  if (
    review?.schemaVersion !== "v2-a0-codeql-reviewed-suppressions.v3"
    || review?.scannerBinding?.workflowPath
      !== ".github/workflows/v2-security-quality.yml"
    || review?.scannerBinding?.codeqlActionVersion
      !== REQUIRED_CODEQL_ACTION_VERSION
    || review?.scannerBinding?.codeqlBundleVersion
      !== REQUIRED_CODEQL_BUNDLE_VERSION
    || review?.scannerBinding?.queryPack !== REQUIRED_CODEQL_QUERY_PACK
    || review?.scannerBinding?.queryPackVersion
      !== REQUIRED_CODEQL_QUERY_PACK_VERSION
    || review?.scannerBinding?.suppressionQuery
      !== REQUIRED_CODEQL_SUPPRESSION_QUERY
    || !Array.isArray(review?.entries)
    || review?.policy?.alertSuppressionQueryRequired !== true
    || review?.policy?.directoryWideSuppression !== false
    || review?.policy?.pathWideSuppression !== false
    || review?.policy?.ruleWideSuppression !== false
    || review?.policy?.unregisteredSuppressionAllowed !== false
  ) {
    issues.push(issue(
      "V2_CODEQL_SUPPRESSION_POLICY_TOO_BROAD",
      reviewPath,
      "only exact registered source suppressions are allowed",
    ));
  }

  const observed = [];
  for (const [path, source] of Object.entries(sources ?? {})) {
    const lines = source.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const suppression = CODEQL_SUPPRESSION_PATTERN.exec(lines[index]);
      if (!suppression?.groups?.ruleId) continue;
      const marker = index > 0
        ? CODEQL_REVIEW_MARKER_PATTERN.exec(lines[index - 1])
        : null;
      if (!marker?.groups?.id) {
        issues.push(issue(
          "V2_CODEQL_SUPPRESSION_MARKER_MISSING",
          `${path}:${index + 1}`,
          suppression.groups.ruleId,
        ));
        continue;
      }
      observed.push({
        id: marker.groups.id,
        line: index + 1,
        path,
        ruleId: suppression.groups.ruleId,
      });
    }
  }

  const entries = Array.isArray(review?.entries) ? review.entries : [];
  const entryIds = new Set();
  for (const entry of entries) {
    const location = typeof entry?.path === "string"
      ? entry.path
      : reviewPath;
    const sourceLines = typeof sources?.[entry?.path] === "string"
      ? sources[entry.path].split(/\r?\n/u)
      : [];
    if (
      typeof entry?.id !== "string"
      || !/^MR-CODEQL-[0-9]{3}$/u.test(entry.id)
      || entryIds.has(entry.id)
      || typeof entry?.path !== "string"
      || entry.path.startsWith("/")
      || entry.path.split("/").some((segment) =>
        segment === "" || segment === "." || segment === ".."
      )
      || typeof entry?.ruleId !== "string"
      || !/^[A-Za-z0-9._/-]+$/u.test(entry.ruleId)
      || entry.ruleId.includes("*")
      || !Number.isSafeInteger(entry?.alertLine)
      || entry.alertLine <= 0
      || typeof sourceLines[entry.alertLine - 1] !== "string"
      || sourceLines[entry.alertLine - 1].trim() === ""
      || entry?.reviewStatus !== "APPROVED_EXACT"
      || typeof entry?.classification !== "string"
      || entry.classification.length < 8
      || typeof entry?.rationale !== "string"
      || entry.rationale.length < 40
      || typeof entry?.invariant !== "string"
      || entry.invariant.length < 40
    ) {
      issues.push(issue(
        "V2_CODEQL_SUPPRESSION_REVIEW_INVALID",
        location,
        String(entry?.id ?? "missing id"),
      ));
    }
    if (typeof entry?.id === "string") entryIds.add(entry.id);
  }

  const observedIds = new Set();
  for (const suppression of observed) {
    if (observedIds.has(suppression.id)) {
      issues.push(issue(
        "V2_CODEQL_SUPPRESSION_ID_REUSED",
        `${suppression.path}:${suppression.line}`,
        suppression.id,
      ));
    }
    observedIds.add(suppression.id);
    const entry = entries.find((item) => item?.id === suppression.id);
    if (
      entry?.path !== suppression.path
      || entry?.ruleId !== suppression.ruleId
    ) {
      issues.push(issue(
        "V2_CODEQL_SUPPRESSION_UNREGISTERED",
        `${suppression.path}:${suppression.line}`,
        `${suppression.id}:${suppression.ruleId}`,
      ));
    }
    if (
      !Number.isSafeInteger(entry?.alertLine)
      || entry.alertLine !== suppression.line + 1
    ) {
      issues.push(issue(
        "V2_CODEQL_SUPPRESSION_ALERT_LINE_DRIFT",
        `${suppression.path}:${suppression.line}`,
        `${suppression.id}:${String(entry?.alertLine ?? "missing")}`,
      ));
    }
  }

  if (
    entries.length !== observed.length
    || entries.some((entry) => !observedIds.has(entry?.id))
  ) {
    issues.push(issue(
      "V2_CODEQL_SUPPRESSION_REVIEW_DRIFT",
      reviewPath,
      "every reviewed suppression must have one exact source marker",
    ));
  }

  return issues;
}

export function validateGitleaksFalsePositivePolicy({
  ignorePath,
  ignoreSource,
  review,
  reviewPath,
}) {
  const issues = [];
  const ignoredFingerprints = ignoreSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const ignoredRecords = ignoredFingerprints.map((fingerprint, index) => {
    const match = fingerprint.match(GITLEAKS_FINGERPRINT_PATTERN);
    return match === null
      ? null
      : {
        commit: match.groups.commit,
        fingerprint,
        ignoreLineNumber: index + 1,
        line: Number(match.groups.line),
        path: match.groups.path,
        ruleId: match.groups.ruleId,
      };
  });
  const entries = Array.isArray(review?.entries) ? review.entries : [];
  const evidenceRuns = Array.isArray(review?.sourceEvidence?.runs)
    ? review.sourceEvidence.runs
    : [];
  const evidenceFindingCount = evidenceRuns.reduce(
    (total, run) => total + (
      Number.isSafeInteger(run?.findingCount) ? run.findingCount : 0
    ),
    0,
  );
  const evidenceRunIds = new Set(
    evidenceRuns.map((run) => run?.workflowRunId),
  );
  const evidenceArtifactIds = new Set(
    evidenceRuns.map((run) => run?.artifactId),
  );
  const evidenceRunsValid = evidenceRuns.length > 0
    && evidenceRuns.every((run) => (
      typeof run?.workflowRunId === "string"
      && /^[1-9][0-9]*$/u.test(run.workflowRunId)
      && typeof run?.sourceCommitPrefix === "string"
      && /^[0-9a-f]{12}$/u.test(run.sourceCommitPrefix)
      && typeof run?.artifactId === "string"
      && /^[1-9][0-9]*$/u.test(run.artifactId)
      && typeof run?.artifactDigest === "string"
      && /^sha256:[0-9a-f]{64}$/u.test(run.artifactDigest)
      && Number.isSafeInteger(run?.findingCount)
      && run.findingCount > 0
      && run.findingLocationsTruncated === false
    ))
    && evidenceRunIds.size === evidenceRuns.length
    && evidenceArtifactIds.size === evidenceRuns.length;
  const remediationValidation = review?.remediationValidation;
  const remediationValidationIsExact =
    Array.isArray(remediationValidation?.sourceCommitParts)
    && remediationValidation.sourceCommitParts.length === 2
    && remediationValidation.sourceCommitParts.every(
      (part) => /^[0-9a-f]{20}$/u.test(part),
    )
    && remediationValidation.sourceCommitParts.join("")
      === A0_SECURITY_REMEDIATION_COMMIT_PARTS.join("")
    && remediationValidation.workflowRunId === "30212437973"
    && remediationValidation.artifactId === "8634842724"
    && remediationValidation.artifactDigest
      === "sha256:17d276663be0eda77c8a8596a59861d733e7640a8eeb9ac79b10f3a046457336"
    && remediationValidation.findingCount === 0
    && remediationValidation.reportDigest
      === "sha256:37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570"
    && remediationValidation.productionMutation === false;

  if (
    review?.schemaVersion
      !== "market-radar-v2-a0-secret-history-false-positive-review.v4"
    || review?.status !== "REVIEWED_FALSE_POSITIVES_ONLY"
    || review?.scanner?.name !== "gitleaks"
    || review?.scanner?.version !== "8.30.1"
    || !evidenceRunsValid
    || review?.sourceEvidence?.totalFindingCount !== entries.length
    || evidenceFindingCount !== entries.length
    || review?.reviewMethod?.sourceStructureReviewed !== true
    || review?.reviewMethod?.literalValuesRedactedDuringHumanReview !== true
    || review?.reviewMethod?.rawFindingArtifactUploaded !== false
    || review?.reviewMethod?.rawCredentialValueRecorded !== false
    || !remediationValidationIsExact
    || review?.productionMutation !== false
  ) {
    issues.push(issue(
      "V2_GITLEAKS_FALSE_POSITIVE_REVIEW_INCOMPLETE",
      reviewPath,
      "review identity, count, redaction and no-production facts must be exact",
    ));
  }

  if (
    review?.policy?.allowlistScope !== "EXACT_FINGERPRINT_ONLY"
    || review?.policy?.pathWideAllowlist !== false
    || review?.policy?.ruleWideAllowlist !== false
    || review?.policy?.commitWideAllowlist !== false
    || review?.policy?.futureCommitIdentityRepresentation
      !== "TWO_VALIDATED_20_HEX_PARTS"
    || review?.policy?.futureFindingsFailClosed !== true
  ) {
    issues.push(issue(
      "V2_GITLEAKS_ALLOWLIST_SCOPE_TOO_BROAD",
      reviewPath,
      "only exact reviewed fingerprints may be ignored",
    ));
  }

  const reviewedIgnoreLines = [];
  const expectedEntryKeys = [
    "classification",
    "credentialRotationRequired",
    "ignoreLineNumber",
    "line",
    "path",
    "rationale",
    "ruleId",
  ];
  for (const entry of entries) {
    const entryKeys = entry !== null && typeof entry === "object"
      ? Object.keys(entry).sort()
      : [];
    const pathIsSafe = typeof entry?.path === "string"
      && !entry.path.startsWith("/")
      && !entry.path.split("/").includes("..")
      && !entry.path.includes(":");
    const ignoredRecord = Number.isInteger(entry?.ignoreLineNumber)
      ? ignoredRecords[entry.ignoreLineNumber - 1]
      : undefined;
    if (
      entryKeys.join("\0") !== expectedEntryKeys.join("\0")
      || ignoredRecord === undefined
      || ignoredRecord === null
      || ignoredRecord.ignoreLineNumber !== entry.ignoreLineNumber
      || ignoredRecord.path !== entry.path
      || ignoredRecord.ruleId !== entry.ruleId
      || ignoredRecord.line !== entry.line
      || !pathIsSafe
      || !APPROVED_FALSE_POSITIVE_CLASSIFICATIONS.has(
        entry?.classification,
      )
      || typeof entry?.rationale !== "string"
      || entry.rationale.length < 20
      || entry?.credentialRotationRequired !== false
    ) {
      issues.push(issue(
        "V2_GITLEAKS_FALSE_POSITIVE_ENTRY_INVALID",
        reviewPath,
        Number.isInteger(entry?.ignoreLineNumber)
          ? `ignore line ${entry.ignoreLineNumber}`
          : "missing ignore line number",
      ));
      continue;
    }
    reviewedIgnoreLines.push(entry.ignoreLineNumber);
  }

  if (ignoredRecords.some((record) => record === null)) {
    issues.push(issue(
      "V2_GITLEAKS_IGNORE_NOT_EXACT_FINGERPRINT",
      ignorePath,
      "wildcards, path-wide, rule-wide and malformed entries are forbidden",
    ));
  }

  const ignoredSet = new Set(ignoredFingerprints);
  const reviewedLineSet = new Set(reviewedIgnoreLines);
  if (
    ignoredSet.size !== ignoredFingerprints.length
    || reviewedLineSet.size !== reviewedIgnoreLines.length
    || ignoredRecords.length !== reviewedIgnoreLines.length
    || ignoredRecords.some(
      (record) => record !== null
        && !reviewedLineSet.has(record.ignoreLineNumber),
    )
  ) {
    issues.push(issue(
      "V2_GITLEAKS_IGNORE_REVIEW_DRIFT",
      ignorePath,
      "every exact ignore fingerprint must have one matching structured review",
    ));
  }

  return issues;
}

export function validateSegmentedSecuritySourceIdentity({
  matrix,
  matrixPath,
  reportPath,
  reportSource,
}) {
  const issues = [];
  const expectedParts = A0_SECURITY_SOURCE_COMMIT_PARTS;
  const expectedRemediationParts = A0_SECURITY_REMEDIATION_COMMIT_PARTS;
  const candidateParts = [
    matrix?.engineeringFoundationGate?.independentSecurityQuality
      ?.sourceCommitParts,
    matrix?.lastCompletedEngineeringControl?.sourceCommitParts,
  ];
  const segmentedIdentityIsExact = candidateParts.every((parts) => (
    Array.isArray(parts)
    && parts.length === 2
    && parts.every((part) => /^[0-9a-f]{20}$/u.test(part))
    && parts.join("") === expectedParts.join("")
  ));
  if (!segmentedIdentityIsExact) {
    issues.push(issue(
      "V2_A0_SECURITY_SOURCE_IDENTITY_NOT_SEGMENTED",
      matrixPath,
      "both A0 security source identities must use the exact two-part binding",
    ));
  }

  const remediation = matrix?.engineeringFoundationGate
    ?.independentSecurityQuality?.postClosureRemediationValidation;
  const remediationIdentityIsExact =
    Array.isArray(remediation?.sourceCommitParts)
    && remediation.sourceCommitParts.length === 2
    && remediation.sourceCommitParts.every(
      (part) => /^[0-9a-f]{20}$/u.test(part),
    )
    && remediation.sourceCommitParts.join("")
      === expectedRemediationParts.join("")
    && remediation.securityWorkflowRunId === 30212437973
    && remediation.fullQualityWorkflowRunId === 30212437974
    && remediation.fullQualityJobId === 89820836431
    && remediation.secretScan?.jobId === 89820836444
    && remediation.secretScan?.findingCount === 0
    && remediation.secretScan?.artifactId === 8634842724
    && remediation.secretScan?.artifactDigest
      === "sha256:17d276663be0eda77c8a8596a59861d733e7640a8eeb9ac79b10f3a046457336"
    && remediation.secretScan?.reportDigest
      === "sha256:37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570"
    && remediation.codeql?.jobId === 89820836452
    && remediation.codeql?.resultCount === 8
    && remediation.codeql?.reviewedSuppressionCount === 8
    && remediation.codeql?.blockingResultCount === 0
    && remediation.codeql?.artifactId === 8634864382
    && remediation.codeql?.artifactDigest
      === "sha256:2b6884927bd07dd72e7442208796fafde58f4c8ad881d7c362c7c1c1d63c20eb"
    && remediation.codeql?.sarifSetDigest
      === "sha256:725ff4f05b33a62b7671da7f6e6f1ed43277953be79be9c04c077a4d36cb3ec6"
    && remediation.collectorImageScan?.jobId === 89820836428
    && remediation.collectorImageScan?.criticalCount === 0
    && remediation.collectorImageScan?.highCount === 0
    && remediation.collectorImageScan?.artifactId === 8634851363
    && remediation.collectorImageScan?.artifactDigest
      === "sha256:d35ab494bde9f2654b9427c6ec14dcdb57db028f86624f54e1ac0bfb0cb58f3b"
    && remediation.collectorImageScan?.reportDigest
      === "sha256:9a150383eb0d926f31c361e3c6bf271bdee868bce37a2470104b91d6a837e19f"
    && remediation.sbomArtifact?.artifactId === 8634884084
    && remediation.sbomArtifact?.artifactDigest
      === "sha256:bfe7e3b05b8fd1f8f46115d0167364cc0a1451f039cbb463af0e60cf9fabb9fb"
    && remediation.productionMutationPerformed === false;
  if (!remediationIdentityIsExact) {
    issues.push(issue(
      "V2_A0_SECURITY_REMEDIATION_EVIDENCE_DRIFT",
      matrixPath,
      "the exact post-closure security remediation receipts must remain bound",
    ));
  }

  const hasTruthMarker = reportSource.includes(
    `Source commit parts: ${expectedParts[0]} / ${expectedParts[1]}`,
  );
  const hasEvidenceMarker = reportSource.includes(
    `source commit parts \`${expectedParts[0]}\` + \`${expectedParts[1]}\``,
  );
  const hasCredentialShapedCommit = /(?:Source commit|sourceCommit)\s*[:=]\s*`?[0-9a-f]{40}(?![0-9a-f])/u
    .test(reportSource);
  const hasRemediationMarker = reportSource.includes(
    `Remediation source parts: ${expectedRemediationParts[0]} / ${expectedRemediationParts[1]}`,
  );
  if (
    !hasTruthMarker
    || !hasEvidenceMarker
    || !hasRemediationMarker
    || hasCredentialShapedCommit
  ) {
    issues.push(issue(
      "V2_A0_SECURITY_REPORT_SOURCE_IDENTITY_DRIFT",
      reportPath,
      "the delivery report must use the exact two-part source identity only",
    ));
  }

  return issues;
}

function filesBelow(root, predicate) {
  const files = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...filesBelow(path, predicate));
    if (stat.isFile() && predicate(path)) files.push(path);
  }
  return files;
}

export function validateV2DockerPolicy(repositoryRoot) {
  const deployRoot = resolve(repositoryRoot, "deploy/v2");
  const dockerfiles = filesBelow(
    deployRoot,
    (path) => path.endsWith("/Dockerfile"),
  );
  const issues = [];
  for (const path of dockerfiles) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/^\s*FROM\s+([^\s]+).*$/gmu)) {
      if (!/@sha256:[0-9a-f]{64}$/u.test(match[1])) {
        issues.push(issue(
          "V2_BASE_IMAGE_NOT_PINNED_TO_DIGEST",
          relative(repositoryRoot, path),
          match[1],
        ));
      }
    }
  }
  return issues;
}

export function validateRepository(repositoryRoot) {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  const workflowRoot = resolve(repositoryRoot, ".github/workflows");
  const workflowFiles = filesBelow(
    workflowRoot,
    (path) => path.endsWith(".yml") || path.endsWith(".yaml"),
  );
  const issues = [
    ...validatePackagePolicy(packageJson, packageLock),
    ...validateCollectorRuntimePackagePolicy({
      rootPackageLock: packageLock,
      runtimePackage: JSON.parse(readFileSync(
        resolve(
          repositoryRoot,
          "deploy/v2/m1-collector/runtime/package.json",
        ),
        "utf8",
      )),
      runtimePackageLock: JSON.parse(readFileSync(
        resolve(
          repositoryRoot,
          "deploy/v2/m1-collector/runtime/package-lock.json",
        ),
        "utf8",
      )),
    }),
    ...workflowFiles.flatMap((path) =>
      validateWorkflowPolicy(
        relative(repositoryRoot, path),
        readFileSync(path, "utf8"),
      )
    ),
    ...validateV2DockerPolicy(repositoryRoot),
  ];

  const fullCiPath = resolve(workflowRoot, "v2-full-quality.yml");
  let fullCiSource = "";
  try {
    fullCiSource = readFileSync(fullCiPath, "utf8");
  } catch {
    issues.push(issue(
      "V2_FULL_CI_WORKFLOW_MISSING",
      ".github/workflows/v2-full-quality.yml",
      "automatic pull_request and push quality gate is required",
    ));
  }
  if (fullCiSource !== "") {
    issues.push(...validateFullCiWorkflowPolicy(
      ".github/workflows/v2-full-quality.yml",
      fullCiSource,
    ));
  }

  const securityWorkflowPath = resolve(
    workflowRoot,
    "v2-security-quality.yml",
  );
  let securityWorkflowSource = "";
  try {
    securityWorkflowSource = readFileSync(securityWorkflowPath, "utf8");
  } catch {
    issues.push(issue(
      "V2_SECURITY_WORKFLOW_MISSING",
      ".github/workflows/v2-security-quality.yml",
      "independent secret, SAST and image scans are required",
    ));
  }
  if (securityWorkflowSource !== "") {
    issues.push(...validateSecurityWorkflowPolicy(
      ".github/workflows/v2-security-quality.yml",
      securityWorkflowSource,
    ));
  }

  const releaseQualificationWorkflowPath = resolve(
    workflowRoot,
    "v2-a0-release-qualification.yml",
  );
  let releaseQualificationWorkflowSource = "";
  try {
    releaseQualificationWorkflowSource = readFileSync(
      releaseQualificationWorkflowPath,
      "utf8",
    );
  } catch {
    issues.push(issue(
      "V2_A0_RELEASE_QUALIFICATION_WORKFLOW_MISSING",
      ".github/workflows/v2-a0-release-qualification.yml",
      "independent provenance, rollback and resource qualification is required",
    ));
  }
  if (releaseQualificationWorkflowSource !== "") {
    issues.push(...validateA0ReleaseQualificationWorkflowPolicy(
      ".github/workflows/v2-a0-release-qualification.yml",
      releaseQualificationWorkflowSource,
    ));
  }

  const releaseQualificationPolicyPath = resolve(
    repositoryRoot,
    "docs/governance/v2-a0-release-qualification-policy.v1.json",
  );
  try {
    validateA0ReleaseQualificationPolicy(JSON.parse(
      readFileSync(releaseQualificationPolicyPath, "utf8"),
    ));
  } catch (error) {
    issues.push(issue(
      "V2_A0_RELEASE_QUALIFICATION_POLICY_INVALID",
      "docs/governance/v2-a0-release-qualification-policy.v1.json",
      error instanceof Error ? error.message : "policy validation failed",
    ));
  }

  const securityEvidencePath = resolve(
    repositoryRoot,
    "scripts/v2/production/a0-security-evidence.mjs",
  );
  let securityEvidenceSource = "";
  try {
    securityEvidenceSource = readFileSync(securityEvidencePath, "utf8");
  } catch {
    issues.push(issue(
      "V2_SECURITY_EVIDENCE_SCRIPT_MISSING",
      "scripts/v2/production/a0-security-evidence.mjs",
      "sanitized secret finding locations are required",
    ));
  }
  if (securityEvidenceSource !== "") {
    issues.push(...validateSecurityEvidencePolicy(
      "scripts/v2/production/a0-security-evidence.mjs",
      securityEvidenceSource,
    ));
  }

  const codeqlEvidencePath = resolve(
    repositoryRoot,
    "scripts/v2/production/a0-codeql-evidence.mjs",
  );
  let codeqlEvidenceSource = "";
  try {
    codeqlEvidenceSource = readFileSync(codeqlEvidencePath, "utf8");
  } catch {
    issues.push(issue(
      "V2_CODEQL_EVIDENCE_SCRIPT_MISSING",
      "scripts/v2/production/a0-codeql-evidence.mjs",
      "sanitized fail-closed CodeQL result accounting is required",
    ));
  }
  if (codeqlEvidenceSource !== "") {
    issues.push(...validateCodeqlEvidencePolicy(
      "scripts/v2/production/a0-codeql-evidence.mjs",
      codeqlEvidenceSource,
    ));
  }

  const codeqlSuppressionReviewPath = resolve(
    repositoryRoot,
    "docs/governance/v2-a0-codeql-reviewed-suppressions.v3.json",
  );
  let codeqlSuppressionReview;
  try {
    codeqlSuppressionReview = JSON.parse(
      readFileSync(codeqlSuppressionReviewPath, "utf8"),
    );
  } catch {
    issues.push(issue(
      "V2_CODEQL_SUPPRESSION_REVIEW_MISSING",
      "docs/governance/v2-a0-codeql-reviewed-suppressions.v3.json",
      "every source suppression requires an exact structured review",
    ));
  }
  if (codeqlSuppressionReview !== undefined) {
    const sourceRoots = ["src", "scripts", "tools", "deploy"];
    const sourceFiles = sourceRoots.flatMap((root) => filesBelow(
      resolve(repositoryRoot, root),
      (path) => /\.(?:cjs|js|mjs|ts|tsx)$/u.test(path),
    ));
    const sources = Object.fromEntries(sourceFiles.map((path) => [
      relative(repositoryRoot, path),
      readFileSync(path, "utf8"),
    ]));
    issues.push(...validateCodeqlSuppressionPolicy({
      review: codeqlSuppressionReview,
      reviewPath:
        "docs/governance/v2-a0-codeql-reviewed-suppressions.v3.json",
      sources,
    }));
  }

  const gitleaksIgnorePath = resolve(repositoryRoot, ".gitleaksignore");
  const gitleaksReviewPath = resolve(
    repositoryRoot,
    "docs/governance/v2-a0-secret-history-false-positive-review.v4.json",
  );
  let gitleaksIgnoreSource = "";
  let gitleaksReview;
  try {
    gitleaksIgnoreSource = readFileSync(gitleaksIgnorePath, "utf8");
  } catch {
    issues.push(issue(
      "V2_GITLEAKS_IGNORE_MISSING",
      ".gitleaksignore",
      "reviewed historical false positives require exact fingerprints",
    ));
  }
  try {
    gitleaksReview = JSON.parse(readFileSync(gitleaksReviewPath, "utf8"));
  } catch {
    issues.push(issue(
      "V2_GITLEAKS_FALSE_POSITIVE_REVIEW_MISSING",
      "docs/governance/v2-a0-secret-history-false-positive-review.v4.json",
      "every ignored fingerprint requires a structured review",
    ));
  }
  if (gitleaksIgnoreSource !== "" && gitleaksReview !== undefined) {
    issues.push(...validateGitleaksFalsePositivePolicy({
      ignorePath: ".gitleaksignore",
      ignoreSource: gitleaksIgnoreSource,
      review: gitleaksReview,
      reviewPath:
        "docs/governance/v2-a0-secret-history-false-positive-review.v4.json",
    }));
  }

  const traceabilityPath =
    "docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json";
  const securityDeliveryReportPath =
    "docs/blueprints/V2_A0_INDEPENDENT_SECURITY_QUALITY_DELIVERY_REPORT.md";
  let traceability;
  let securityDeliveryReportSource = "";
  try {
    traceability = JSON.parse(
      readFileSync(resolve(repositoryRoot, traceabilityPath), "utf8"),
    );
    securityDeliveryReportSource = readFileSync(
      resolve(repositoryRoot, securityDeliveryReportPath),
      "utf8",
    );
  } catch {
    issues.push(issue(
      "V2_A0_SECURITY_SOURCE_IDENTITY_EVIDENCE_MISSING",
      securityDeliveryReportPath,
      "the traceability matrix and security delivery report must both exist",
    ));
  }
  if (traceability !== undefined && securityDeliveryReportSource !== "") {
    issues.push(...validateSegmentedSecuritySourceIdentity({
      matrix: traceability,
      matrixPath: traceabilityPath,
      reportPath: securityDeliveryReportPath,
      reportSource: securityDeliveryReportSource,
    }));
  }

  return {
    schemaVersion: "v2-a0-engineering-materials-gate.v1",
    status: issues.length === 0 ? "PASS" : "BLOCKED",
    checkedPolicy: {
      directDependenciesExact: true,
      collectorRuntimeDependencyClosureExact: true,
      githubActionsFullSha: true,
      codeqlExactReviewedSuppressions: true,
      gitleaksExactReviewedFalsePositiveFingerprints: true,
      securitySourceCommitIdentitySegmented: true,
      independentSecurityWorkflow: true,
      independentReleaseQualificationWorkflow: true,
      githubRuntimeExact: true,
      licenseMetadataAndDenylist: true,
      nextMinimumSecurityPatch: MINIMUM_SAFE_NEXT_VERSION,
      nodeVersion: REQUIRED_NODE_VERSION,
      npmVersion: REQUIRED_NPM_VERSION,
      v2ActionsApprovedNode24Revisions: true,
      v2BaseImagesDigestPinned: true,
      releaseQualificationPolicyFrozen: true,
    },
    issues,
  };
}

const entryPath = process.argv[1] === undefined
  ? ""
  : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = validateRepository(repositoryRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
