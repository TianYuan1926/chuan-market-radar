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
  if (
    fullCiSource !== "" &&
    (
      !/^\s*pull_request:\s*$/mu.test(fullCiSource) ||
      !/^\s*push:\s*$/mu.test(fullCiSource) ||
      !fullCiSource.includes("npm run ci:production")
    )
  ) {
    issues.push(issue(
      "V2_FULL_CI_WORKFLOW_INCOMPLETE",
      ".github/workflows/v2-full-quality.yml",
      "pull_request, push and ci:production are all required",
    ));
  }

  return {
    schemaVersion: "v2-a0-engineering-materials-gate.v1",
    status: issues.length === 0 ? "PASS" : "BLOCKED",
    checkedPolicy: {
      directDependenciesExact: true,
      githubActionsFullSha: true,
      githubRuntimeExact: true,
      licenseMetadataAndDenylist: true,
      nextMinimumSecurityPatch: MINIMUM_SAFE_NEXT_VERSION,
      nodeVersion: REQUIRED_NODE_VERSION,
      npmVersion: REQUIRED_NPM_VERSION,
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
