import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SARIF_VERSION = "2.1.0";
const RULE_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,160}$/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:\//u;
const MAX_REPOSITORY_PATH_LENGTH = 512;
const MAX_RESULT_LOCATIONS = 1_000;
const LEVEL_RANK = new Map([
  ["none", 0],
  ["note", 1],
  ["warning", 2],
  ["error", 3],
]);

function normalizedLevel(value) {
  return LEVEL_RANK.has(value) ? value : "warning";
}

function securitySeverity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10
    ? parsed
    : null;
}

function collectRuleDescriptors(run) {
  const descriptors = new Map();
  const components = [
    run?.tool?.driver,
    ...(Array.isArray(run?.tool?.extensions) ? run.tool.extensions : []),
  ];
  for (const component of components) {
    for (const descriptor of component?.rules ?? []) {
      if (
        typeof descriptor?.id === "string"
        && RULE_ID_PATTERN.test(descriptor.id)
      ) {
        descriptors.set(descriptor.id, descriptor);
      }
    }
  }
  return descriptors;
}

function highestLevel(left, right) {
  return LEVEL_RANK.get(left) >= LEVEL_RANK.get(right) ? left : right;
}

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}

function sanitizedRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "<missing-repository-path>";
  }

  let decoded;
  try {
    decoded = decodeURIComponent(value).replaceAll("\\", "/");
  } catch {
    return "<invalid-repository-path>";
  }

  const segments = decoded.split("/");
  if (
    decoded.length === 0
    || decoded.length > MAX_REPOSITORY_PATH_LENGTH
    || hasControlCharacter(decoded)
    || decoded.startsWith("/")
    || WINDOWS_ABSOLUTE_PATH_PATTERN.test(decoded)
    || decoded.includes("://")
    || segments.some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    return "<invalid-repository-path>";
  }

  return decoded;
}

function sanitizedStartLine(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function compareResultLocations(left, right) {
  return left.file.localeCompare(right.file)
    || (left.startLine ?? Number.MAX_SAFE_INTEGER)
      - (right.startLine ?? Number.MAX_SAFE_INTEGER)
    || left.ruleId.localeCompare(right.ruleId)
    || left.level.localeCompare(right.level);
}

export function summarizeCodeqlSarifDocuments(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new TypeError("at least one CodeQL SARIF document is required");
  }

  const byRule = new Map();
  const resultLocations = [];
  let runCount = 0;
  let resultCount = 0;
  for (const document of documents) {
    if (
      document === null
      || typeof document !== "object"
      || document.version !== SARIF_VERSION
      || !Array.isArray(document.runs)
    ) {
      throw new TypeError("invalid CodeQL SARIF document");
    }

    for (const run of document.runs) {
      runCount += 1;
      const descriptors = collectRuleDescriptors(run);
      if (!Array.isArray(run?.results)) {
        continue;
      }
      for (const result of run.results) {
        const ruleId = result?.ruleId;
        if (typeof ruleId !== "string" || !RULE_ID_PATTERN.test(ruleId)) {
          throw new TypeError("CodeQL SARIF result has an invalid rule id");
        }

        resultCount += 1;
        const descriptor = descriptors.get(ruleId);
        const level = normalizedLevel(
          result?.level ?? descriptor?.defaultConfiguration?.level,
        );
        const severity = securitySeverity(
          result?.properties?.["security-severity"]
            ?? descriptor?.properties?.["security-severity"],
        );
        const current = byRule.get(ruleId) ?? {
          count: 0,
          maxLevel: "none",
          maxSecuritySeverity: null,
          ruleId,
        };
        current.count += 1;
        current.maxLevel = highestLevel(current.maxLevel, level);
        current.maxSecuritySeverity = severity === null
          ? current.maxSecuritySeverity
          : Math.max(current.maxSecuritySeverity ?? 0, severity);
        byRule.set(ruleId, current);

        if (resultLocations.length < MAX_RESULT_LOCATIONS) {
          const physicalLocation =
            result?.locations?.[0]?.physicalLocation;
          resultLocations.push({
            file: sanitizedRepositoryPath(
              physicalLocation?.artifactLocation?.uri,
            ),
            level,
            ruleId,
            securitySeverity: severity,
            startLine: sanitizedStartLine(
              physicalLocation?.region?.startLine,
            ),
          });
        }
      }
    }
  }

  return {
    blockingResultCount: resultCount,
    resultCount,
    resultLocationCount: resultLocations.length,
    resultLocations: resultLocations.sort(compareResultLocations),
    resultLocationsTruncated: resultCount > resultLocations.length,
    ruleCounts: [...byRule.values()].sort(
      (left, right) => left.ruleId.localeCompare(right.ruleId),
    ),
    runCount,
    status: resultCount === 0
      ? "PASS_ZERO_UNTRIAGED_RESULTS"
      : "BLOCKED_UNTRIAGED_RESULTS",
  };
}

function sarifFiles(root) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) {
    throw new TypeError("CodeQL SARIF path must not be a symbolic link");
  }
  if (stat.isFile()) {
    if (!root.endsWith(".sarif")) {
      throw new TypeError("CodeQL evidence input must be a SARIF file");
    }
    return [root];
  }
  if (!stat.isDirectory()) {
    throw new TypeError("CodeQL evidence input must be a file or directory");
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => sarifFiles(path.join(root, entry.name)));
}

export function buildCodeqlEvidence({
  repository,
  runAttempt,
  runId,
  sarifInputs,
  sourceCommit,
}) {
  if (!Array.isArray(sarifInputs) || sarifInputs.length === 0) {
    throw new TypeError("at least one CodeQL SARIF input is required");
  }
  const documents = sarifInputs.map(({ bytes }) => JSON.parse(bytes));
  const summary = summarizeCodeqlSarifDocuments(documents);
  const sarifDigests = sarifInputs
    .map(({ bytes, name }) => ({
      name,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const digestBytes = Buffer.from(JSON.stringify(sarifDigests));

  return {
    schemaVersion: "v2-a0-codeql-sast-evidence.v2",
    sourceCommit,
    repository,
    runId,
    runAttempt,
    scanner: {
      name: "codeql",
      actionCommit: "e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81",
      querySuite: "security-extended",
    },
    policy: {
      blockOnAnyUntriagedResult: true,
      rawSarifArtifactUploaded: false,
      locationFields: [
        "ruleId",
        "file",
        "startLine",
        "level",
        "securitySeverity",
      ],
      maxResultLocations: MAX_RESULT_LOCATIONS,
      resultFields: [
        "ruleId",
        "count",
        "maxLevel",
        "maxSecuritySeverity",
      ],
    },
    ...summary,
    sarifFileCount: sarifInputs.length,
    sarifSetDigest: `sha256:${crypto
      .createHash("sha256")
      .update(digestBytes)
      .digest("hex")}`,
    productionMutation: false,
  };
}

function runCli() {
  const [sarifPath, outputPath] = process.argv.slice(2);
  if (sarifPath === undefined || outputPath === undefined) {
    throw new Error(
      "Usage: node a0-codeql-evidence.mjs <sarif-path> <summary-output>",
    );
  }

  const files = sarifFiles(sarifPath);
  if (files.length === 0) {
    throw new Error("CodeQL did not produce a SARIF file");
  }
  const root = fs.lstatSync(sarifPath).isDirectory()
    ? sarifPath
    : path.dirname(sarifPath);
  const evidence = buildCodeqlEvidence({
    repository: process.env.GITHUB_REPOSITORY,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    runId: process.env.GITHUB_RUN_ID,
    sarifInputs: files.map((file) => ({
      bytes: fs.readFileSync(file),
      name: path.relative(root, file) || path.basename(file),
    })),
    sourceCommit: process.env.GITHUB_SHA,
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(
    `CodeQL untriaged results=${evidence.blockingResultCount}\n`,
  );
  if (evidence.blockingResultCount > 0) {
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
