import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const REQUIRED_NODE_VERSION = "22.23.1";
const REQUIRED_NPM_VERSION = "10.9.8";
const MINIMUM_SAFE_NEXT_VERSION = "16.2.12";
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EXACT_SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const FORBIDDEN_LICENSE_PATTERN = /\b(?:AGPL|GPL|SSPL|BUSL)-/u;
const GITLEAKS_FINGERPRINT_PATTERN =
  /^(?<commit>[0-9a-f]{40}):(?<path>[^:\r\n]+):(?<ruleId>[A-Za-z0-9._/-]+):(?<line>[1-9][0-9]*)$/u;
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
    'schemaVersion: "v2-a0-codeql-sast-evidence.v1"',
    "blockOnAnyUntriagedResult: true",
    "rawSarifArtifactUploaded: false",
    '"ruleId"',
    '"count"',
    '"maxLevel"',
    '"maxSecuritySeverity"',
    "blockingResultCount",
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

  if (
    review?.schemaVersion
      !== "market-radar-v2-a0-secret-history-false-positive-review.v1"
    || review?.status !== "REVIEWED_FALSE_POSITIVES_ONLY"
    || review?.scanner?.name !== "gitleaks"
    || review?.scanner?.version !== "8.30.1"
    || typeof review?.sourceEvidence?.sourceCommitPrefix !== "string"
    || !/^[0-9a-f]{12}$/u.test(review.sourceEvidence.sourceCommitPrefix)
    || review?.sourceEvidence?.findingCount !== entries.length
    || review?.sourceEvidence?.findingLocationsTruncated !== false
    || review?.reviewMethod?.sourceStructureReviewed !== true
    || review?.reviewMethod?.literalValuesRedactedDuringHumanReview !== true
    || review?.reviewMethod?.rawFindingArtifactUploaded !== false
    || review?.reviewMethod?.rawCredentialValueRecorded !== false
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

  const gitleaksIgnorePath = resolve(repositoryRoot, ".gitleaksignore");
  const gitleaksReviewPath = resolve(
    repositoryRoot,
    "docs/governance/v2-a0-secret-history-false-positive-review.v1.json",
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
      "docs/governance/v2-a0-secret-history-false-positive-review.v1.json",
      "every ignored fingerprint requires a structured review",
    ));
  }
  if (gitleaksIgnoreSource !== "" && gitleaksReview !== undefined) {
    issues.push(...validateGitleaksFalsePositivePolicy({
      ignorePath: ".gitleaksignore",
      ignoreSource: gitleaksIgnoreSource,
      review: gitleaksReview,
      reviewPath:
        "docs/governance/v2-a0-secret-history-false-positive-review.v1.json",
    }));
  }

  return {
    schemaVersion: "v2-a0-engineering-materials-gate.v1",
    status: issues.length === 0 ? "PASS" : "BLOCKED",
    checkedPolicy: {
      directDependenciesExact: true,
      githubActionsFullSha: true,
      gitleaksExactReviewedFalsePositiveFingerprints: true,
      independentSecurityWorkflow: true,
      githubRuntimeExact: true,
      licenseMetadataAndDenylist: true,
      nextMinimumSecurityPatch: MINIMUM_SAFE_NEXT_VERSION,
      nodeVersion: REQUIRED_NODE_VERSION,
      npmVersion: REQUIRED_NPM_VERSION,
      v2ActionsApprovedNode24Revisions: true,
      v2BaseImagesDigestPinned: true,
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
