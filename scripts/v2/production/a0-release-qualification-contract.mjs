import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  readlink,
  readdir,
} from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const A0_RELEASE_QUALIFICATION_POLICY_PATH =
  "docs/governance/v2-a0-release-qualification-policy.v1.json";
export const A0_RELEASE_QUALIFICATION_WORKFLOW_PATH =
  ".github/workflows/v2-a0-release-qualification.yml";
export const A0_RELEASE_QUALIFICATION_SCHEMA =
  "market-radar-v2-a0-release-qualification-policy.v1";
export const A0_RELEASE_QUALIFICATION_EVIDENCE_SCHEMA =
  "market-radar-v2-a0-release-qualification-evidence.v1";
export const A0_PERFORMANCE_EVIDENCE_SCHEMA =
  "market-radar-v2-a0-performance-resource-evidence.v1";
export const A0_SOURCE_DATE_EPOCH = 946_684_800;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9.][A-Za-z0-9._/-]*$/u;
const UNSAFE_CANONICAL_TREE_CHARACTER_PATTERN =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const REQUIRED_SCENARIOS = Object.freeze([
  "TAMPERED_CANDIDATE_BLOCKED_BEFORE_ACTIVATION",
  "VALID_CANDIDATE_HEALTH_FAILURE_AUTO_RESTORES_EXACT_BASELINE",
  "VALID_CANDIDATE_ACTIVATES_THEN_EXPLICIT_ROLLBACK_RESTORES_EXACT_BASELINE",
]);
const REQUIRED_EXTERNAL_DEPENDENCIES = Object.freeze({
  pg: "8.16.3",
  zod: "4.4.3",
});
const REQUIRED_BUDGETS = Object.freeze({
  coldCpuP95Ms: 1500,
  coldLatencyP95Ms: 1800,
  eventLoopDelayP99Ms: 200,
  incrementalCpuP95Ms: 400,
  incrementalLatencyP95Ms: 500,
  maximumHeapUsedMiB: 256,
  maximumRssMiB: 384,
  minimumIncrementalInstrumentThroughputPerSecond: 750,
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  assert.notEqual(value, undefined, "canonical value cannot contain undefined");
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "canonical number must be finite");
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function stableDigest(value) {
  return byteDigest(Buffer.from(canonicalJson(value), "utf8"));
}

export async function readStableRegularFile(path, label) {
  const handle = await open(
    path,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    assert.equal(before.isFile(), true, `${label} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    for (const field of [
      "ctimeNs",
      "dev",
      "ino",
      "mode",
      "mtimeNs",
      "size",
    ]) {
      assert.equal(
        after[field],
        before[field],
        `${label} changed while it was read`,
      );
    }
    assert.equal(
      BigInt(bytes.length),
      after.size,
      `${label} byte count changed while it was read`,
    );
    return Object.freeze({
      bytes,
      mode: Number(after.mode & 0o777n),
    });
  } finally {
    await handle.close();
  }
}

function assertSafeRelativePath(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, SAFE_PATH_PATTERN, `${label} must be a safe relative path`);
  assert.equal(value.startsWith("/"), false, `${label} must be relative`);
  assert.equal(value.includes("//"), false, `${label} must be normalized`);
  assert.equal(
    value.split("/").some((segment) => segment === "." || segment === ".."),
    false,
    `${label} cannot traverse`,
  );
}

export function assertCanonicalTreeRelativePath(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.length > 0, `${label} cannot be empty`);
  assert.equal(value.startsWith("/"), false, `${label} must be relative`);
  assert.equal(value.includes("\\"), false, `${label} cannot contain backslash`);
  assert.equal(value.includes("//"), false, `${label} must be normalized`);
  assert.equal(
    UNSAFE_CANONICAL_TREE_CHARACTER_PATTERN.test(value),
    false,
    `${label} cannot contain control or formatting characters`,
  );
  assert.equal(
    value.normalize("NFC"),
    value,
    `${label} must use canonical Unicode composition`,
  );
  const segments = value.split("/");
  assert.equal(
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    ),
    false,
    `${label} cannot be empty or traverse`,
  );
}

export function validateA0ReleaseQualificationPolicy(policy) {
  assert.equal(policy?.schemaVersion, A0_RELEASE_QUALIFICATION_SCHEMA);
  assert.equal(policy?.status, "FROZEN_PRE_EXECUTION_POLICY");
  assert.equal(
    policy?.qualificationId,
    "A0_REPRODUCIBLE_PROVENANCE_ROLLBACK_AND_RESOURCE_BASELINE",
  );
  assert.deepEqual(policy?.scope, {
    automaticTradingAllowed: false,
    businessAuthority: false,
    liveCapacityClaimAllowed: false,
    productionMutationAllowed: false,
    productionReadAllowed: false,
    runtime: "V2_M1_COLLECTOR_NO_AUTHORITY",
    scopeEpoch: "SCOPE_EPOCH_V1_CRYPTO_3V_ENGINEERING_FIXTURE",
  });
  assert.deepEqual(
    policy?.runtimeArtifact?.externalDependencies,
    REQUIRED_EXTERNAL_DEPENDENCIES,
  );
  assert.equal(policy?.runtimeArtifact?.nodeVersion, "22.23.1");
  assert.equal(policy?.runtimeArtifact?.npmVersion, "10.9.8");
  assert.equal(
    policy?.runtimeArtifact?.nodeBuildImage,
    "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  );
  assert.equal(
    policy?.runtimeArtifact?.nodeRuntimeImage,
    "gcr.io/distroless/nodejs22-debian13@sha256:6eae66c49774276f50ae1818db25bb89735971a909fb833633dd1400dbc450a1",
  );
  assert.equal(
    policy?.runtimeArtifact?.buildxImage,
    "docker/buildx-bin:0.31.1@sha256:49141c168b609ef38f2b11bc231d48e2492ec1f979c2b9aa4ab691790cce115d",
  );
  for (const [field, expected] of Object.entries({
    allowedCompiledTestCount: 1,
    maximumCompiledFileCount: 80,
    minimumCompiledFileCount: 40,
  })) {
    assert.equal(policy?.runtimeArtifact?.[field], expected, `${field} drifted`);
  }
  for (const field of [
    "compileConfig",
    "compiledRoot",
    "dockerfile",
    "entrypoint",
    "requiredDiagnostic",
    "runtimePackageLock",
    "runtimePackageManifest",
  ]) {
    assertSafeRelativePath(
      policy?.runtimeArtifact?.[field],
      `runtimeArtifact.${field}`,
    );
  }

  assert.deepEqual(policy?.reproducibility, {
    applicationCapsuleSerializationCount: 2,
    canonicalRootfsIdentityRequired: true,
    cleanExactSourceRequired: true,
    deterministicApplicationCapsuleRequired: true,
    exactImageConfigRequired: true,
    independentRootfsBuildCount: 2,
    maximumApplicationCapsuleBytes: 33_554_432,
    maximumImageBytes: 268_435_456,
    maximumRootfsFileCount: 15_000,
    sourceDateEpoch: A0_SOURCE_DATE_EPOCH,
  });
  assert.equal(
    policy?.rollbackDrill?.evidenceClass,
    "ISOLATED_RELEASE_MECHANISM_DRILL_NOT_PRODUCTION_RECOVERY",
  );
  assert.deepEqual(policy?.rollbackDrill?.scenarios, REQUIRED_SCENARIOS);
  for (const field of [
    "atomicPointerRequired",
    "automaticRollbackRequired",
    "contentAddressedSlotsRequired",
    "exactBaselineDigestRequired",
    "temporaryRootRequired",
  ]) {
    assert.equal(policy?.rollbackDrill?.[field], true, `${field} must remain true`);
  }
  assert.equal(policy?.rollbackDrill?.productionPathAllowed, false);

  assert.equal(
    policy?.performanceBaseline?.evidenceClass,
    "TEST_ONLY_ENGINEERING_RESOURCE_BASELINE_NOT_LIVE_MARKET_CAPACITY",
  );
  assert.equal(
    policy?.performanceBaseline?.workloadVersion,
    "v2-a0-three-venue-1440-instrument-collector.v1",
  );
  assert.deepEqual(policy?.performanceBaseline?.budgets, REQUIRED_BUDGETS);
  assert.deepEqual(
    {
      assetCountPerVenue: policy?.performanceBaseline?.assetCountPerVenue,
      cycleIntervalMs: policy?.performanceBaseline?.cycleIntervalMs,
      expectedEligibleInstrumentCount:
        policy?.performanceBaseline?.expectedEligibleInstrumentCount,
      expectedObservedInstrumentCount:
        policy?.performanceBaseline?.expectedObservedInstrumentCount,
      measuredColdCycles: policy?.performanceBaseline?.measuredColdCycles,
      measuredIncrementalCycles:
        policy?.performanceBaseline?.measuredIncrementalCycles,
      minimumMeasuredCycles: policy?.performanceBaseline?.minimumMeasuredCycles,
      venueCount: policy?.performanceBaseline?.venueCount,
      warmupIncrementalCycles:
        policy?.performanceBaseline?.warmupIncrementalCycles,
    },
    {
      assetCountPerVenue: 480,
      cycleIntervalMs: 60_000,
      expectedEligibleInstrumentCount: 1440,
      expectedObservedInstrumentCount: 1446,
      measuredColdCycles: 12,
      measuredIncrementalCycles: 60,
      minimumMeasuredCycles: 72,
      venueCount: 3,
      warmupIncrementalCycles: 5,
    },
  );
  assert.equal(
    policy.performanceBaseline.measuredColdCycles +
      policy.performanceBaseline.measuredIncrementalCycles >=
      policy.performanceBaseline.minimumMeasuredCycles,
    true,
    "measured cycle floor cannot be weakened",
  );
  assert.deepEqual(policy?.evidence, {
    absolutePathsAllowed: false,
    environmentValuesAllowed: false,
    productionMutation: false,
    rawSecretsAllowed: false,
    retentionDays: 30,
    workflow: A0_RELEASE_QUALIFICATION_WORKFLOW_PATH,
  });
  return policy;
}

export async function loadA0ReleaseQualificationPolicy(repositoryRoot) {
  const bytes = await readFile(
    resolve(repositoryRoot, A0_RELEASE_QUALIFICATION_POLICY_PATH),
  );
  const policy = validateA0ReleaseQualificationPolicy(
    JSON.parse(bytes.toString("utf8")),
  );
  return Object.freeze({
    bytes,
    digest: byteDigest(bytes),
    policy,
  });
}

function lexicalOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function canonicalTreeIdentity(root, options = {}) {
  const absoluteRoot = resolve(root);
  const maximumEntries = options.maximumEntries ?? 20_000;
  assert.ok(
    Number.isSafeInteger(maximumEntries) && maximumEntries > 0,
    "canonical tree entry limit is invalid",
  );
  const entries = [];

  async function walk(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => lexicalOrder(left.name, right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      const relativePath = relative(absoluteRoot, path).split(sep).join("/");
      assertCanonicalTreeRelativePath(relativePath, "canonical tree path");
      const metadata = await lstat(path);
      const mode = metadata.mode & 0o777;
      if (metadata.isDirectory()) {
        entries.push({ mode, path: relativePath, type: "DIRECTORY" });
        await walk(path);
      } else if (metadata.isFile()) {
        const stableFile = await readStableRegularFile(
          path,
          `canonical tree file ${relativePath}`,
        );
        entries.push({
          bytes: stableFile.bytes.length,
          mode: stableFile.mode,
          path: relativePath,
          sha256: byteDigest(stableFile.bytes),
          type: "FILE",
        });
      } else if (metadata.isSymbolicLink()) {
        const target = await readlink(path);
        assert.equal(target.includes("\0"), false, "symlink target is invalid");
        entries.push({
          mode,
          path: relativePath,
          target,
          type: "SYMLINK",
        });
      } else {
        assert.fail(`canonical tree contains a special file: ${relativePath}`);
      }
      assert.ok(
        entries.length <= maximumEntries,
        "canonical tree entry limit exceeded",
      );
    }
  }

  await walk(absoluteRoot);
  const fileCount = entries.filter((entry) => entry.type === "FILE").length;
  const directoryCount =
    entries.filter((entry) => entry.type === "DIRECTORY").length;
  const symlinkCount =
    entries.filter((entry) => entry.type === "SYMLINK").length;
  const payloadBytes = entries.reduce(
    (total, entry) => total + (entry.type === "FILE" ? entry.bytes : 0),
    0,
  );
  return Object.freeze({
    digest: stableDigest(entries),
    directoryCount,
    entries: Object.freeze(entries),
    entryCount: entries.length,
    fileCount,
    payloadBytes,
    symlinkCount,
  });
}

export function assertSha256(value, label) {
  assert.match(value, SHA256_PATTERN, `${label} must be sha256`);
}

export function assertCommit(value, label = "source commit") {
  assert.match(value, COMMIT_PATTERN, `${label} must be a full lowercase commit`);
}
