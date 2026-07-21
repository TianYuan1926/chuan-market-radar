#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  validateP0RCosProvisioningPlan,
} from "./m1-production-storage-p0r-cos-provisioning.mjs";

const execFileAsync = promisify(execFile);

export const P0R_AGE_VERSION = "v1.3.1";
export const P0R_AGE_LINUX_AMD64_ARCHIVE_URL =
  "https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-linux-amd64.tar.gz";
export const P0R_AGE_LINUX_AMD64_ARCHIVE_SHA256 =
  "bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377";
export const P0R_BUNDLE_SCHEMA_VERSION =
  "v2-m1-production-storage-p0r-transport.v1";

const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const AGE_RECIPIENT_PATTERN = /^age1[0-9a-z]{58}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const MAXIMUM_BINARY_BYTES = 64 * 1024 * 1024;
const MAXIMUM_ARCHIVE_BYTES = 128 * 1024 * 1024;
const TRANSPORT_SOURCES = Object.freeze([
  "scripts/v2/production/m1-production-storage-backup-capture.mjs",
  "scripts/v2/production/m1-production-storage-database-fingerprint.mjs",
  "scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs",
  "scripts/v2/production/m1-production-storage-p0r-runner.sh",
  "scripts/v2/production/m1-production-storage-read-only-preflight.mjs",
  "scripts/v2/production/m1-production-storage-recovery-evidence.mjs",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function requireRegular(path, label, maximumBytes = MAXIMUM_ARCHIVE_BYTES) {
  const facts = await lstat(path);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.ok(facts.size > 0 && facts.size <= maximumBytes, `${label} size is invalid`);
  return facts;
}

export function assertLinuxAMD64ELF(bytes, label = "binary") {
  assert.ok(Buffer.isBuffer(bytes), `${label} must be bytes`);
  assert.ok(bytes.length >= 64 && bytes.length <= MAXIMUM_BINARY_BYTES, `${label} size is invalid`);
  assert.deepEqual([...bytes.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], `${label} is not ELF`);
  assert.equal(bytes[4], 2, `${label} is not ELF64`);
  assert.equal(bytes[5], 1, `${label} is not little-endian`);
  assert.equal(bytes.readUInt16LE(18), 62, `${label} is not linux/amd64 machine code`);
}

export async function loadOfficialAgeArchive(path) {
  await requireRegular(path, "age archive");
  const archive = await readFile(path);
  assert.equal(
    sha256(archive),
    P0R_AGE_LINUX_AMD64_ARCHIVE_SHA256,
    "official age archive checksum mismatch",
  );
  const [{ stdout: binary }, { stdout: license }] = await Promise.all([
    execFileAsync("tar", ["-xOzf", path, "age/age"], {
      encoding: null,
      maxBuffer: MAXIMUM_BINARY_BYTES,
    }),
    execFileAsync("tar", ["-xOzf", path, "age/LICENSE"], {
      encoding: null,
      maxBuffer: 1024 * 1024,
    }),
  ]);
  assertLinuxAMD64ELF(binary, "official age binary");
  assert.ok(Buffer.isBuffer(license) && license.length > 0, "age license is absent");
  return {
    archiveDigest: sha256(archive),
    binary,
    license,
    sourceUrl: P0R_AGE_LINUX_AMD64_ARCHIVE_URL,
    version: P0R_AGE_VERSION,
  };
}

export function buildP0RGoEnvironments(environment = process.env) {
  const hostEnvironment = { ...environment };
  delete hostEnvironment.GOARCH;
  delete hostEnvironment.GOOS;
  return Object.freeze({
    hostTest: Object.freeze({ ...hostEnvironment, CGO_ENABLED: "0" }),
    linuxBuild: Object.freeze({
      ...hostEnvironment,
      CGO_ENABLED: "0",
      GOARCH: "amd64",
      GOOS: "linux",
    }),
  });
}

export async function buildCosArchiveBinary(root, output) {
  const directory = resolve(root, "scripts/v2/production/p0r-cos-archive");
  const goEnvironments = buildP0RGoEnvironments();
  await execFileAsync("go", ["test", "./..."], {
    cwd: directory,
    env: goEnvironments.hostTest,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  await execFileAsync("go", [
    "build",
    "-trimpath",
    "-ldflags=-buildid=",
    "-o", output,
    ".",
  ], {
    cwd: directory,
    env: goEnvironments.linuxBuild,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  const bytes = await readFile(output);
  assertLinuxAMD64ELF(bytes, "COS archive binary");
  return bytes;
}

async function readRecipient(path) {
  await requireRegular(path, "age recipient", 8 * 1024);
  const lines = (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  assert.equal(lines.length, 1, "exactly one age X25519 recipient is required");
  assert.match(lines[0], AGE_RECIPIENT_PATTERN, "age recipient is invalid");
  return `${lines[0]}\n`;
}

async function readSource(root, path) {
  const absolute = resolve(root, path);
  await requireRegular(absolute, path, 4 * 1024 * 1024);
  return readFile(absolute);
}

function bindings(sourceCommit, files) {
  const byName = Object.fromEntries(files.map((file) => [file.name, file.sha256]));
  return [
    `P0R_SOURCE_COMMIT=${sourceCommit ?? ""}`,
    `P0R_AGE_SHA256=${byName.age}`,
    `P0R_AGE_RECIPIENT_SHA256=${byName["age-recipient.txt"]}`,
    `P0R_COS_ARCHIVE_SHA256=${byName["p0r-cos-archive"]}`,
    `P0R_COS_PROVISIONING_PLAN_SHA256=${byName["cos-provisioning-plan.json"] ?? ""}`,
    `P0R_COS_PROVISIONING_TOOL_SHA256=${byName["m1-production-storage-p0r-cos-provisioning.mjs"]}`,
    `P0R_BACKUP_CAPTURE_SHA256=${byName["m1-production-storage-backup-capture.mjs"]}`,
    `P0R_FINGERPRINT_SHA256=${byName["m1-production-storage-database-fingerprint.mjs"]}`,
    `P0R_PREFLIGHT_LIBRARY_SHA256=${byName["m1-production-storage-read-only-preflight.mjs"]}`,
    `P0R_RECOVERY_EVIDENCE_SHA256=${byName["m1-production-storage-recovery-evidence.mjs"]}`,
    `P0R_RUNNER_SHA256=${byName["m1-production-storage-p0r-runner.sh"]}`,
    "",
  ].join("\n");
}

export async function buildP0RTransportBundle(input) {
  const root = resolve(input.root);
  const output = resolve(input.output);
  assert.equal(typeof input.approvalEligible, "boolean");
  if (input.approvalEligible) {
    assert.match(input.sourceCommit, COMMIT_PATTERN, "source commit is invalid");
    assert.equal(
      input.ageProvenance.archiveDigest,
      P0R_AGE_LINUX_AMD64_ARCHIVE_SHA256,
      "approval package must use the locked official age archive",
    );
    assert.equal(input.ageProvenance.sourceUrl, P0R_AGE_LINUX_AMD64_ARCHIVE_URL);
    assert.equal(input.ageProvenance.version, P0R_AGE_VERSION);
    validateP0RCosProvisioningPlan(input.cosProvisioningPlan);
    assert.equal(
      input.cosProvisioningPlan.sourceCommit,
      input.sourceCommit,
      "COS provisioning plan source commit mismatch",
    );
  } else {
    assert.equal(input.sourceCommit, null, "ineligible template must not claim a source commit");
    assert.equal(
      input.cosProvisioningPlan ?? null,
      null,
      "ineligible template must not carry an execution plan",
    );
  }
  assertLinuxAMD64ELF(input.ageBinary, "age binary");
  assertLinuxAMD64ELF(input.cosArchiveBinary, "COS archive binary");
  assert.ok(Buffer.isBuffer(input.ageLicense) && input.ageLicense.length > 0, "age license is absent");
  assert.match(input.ageRecipient.trim(), AGE_RECIPIENT_PATTERN, "age recipient is invalid");
  assert.equal(input.ageRecipient.trim().split(/\s+/u).length, 1, "age recipient must be singular");

  const temporaryRoot = await mkdtemp(join(tmpdir(), "market-radar-v2-p0r-bundle-"));
  const payload = join(temporaryRoot, "payload");
  try {
    await mkdir(payload, { recursive: true, mode: 0o700 });
    const fileBytes = [];
    for (const sourcePath of TRANSPORT_SOURCES) {
      fileBytes.push({
        bytes: await readSource(root, sourcePath),
        mode: sourcePath.endsWith(".sh") ? 0o700 : 0o600,
        name: sourcePath.split("/").at(-1),
        sourcePath,
      });
    }
    fileBytes.push(
      { bytes: input.ageBinary, mode: 0o700, name: "age", sourcePath: null },
      { bytes: Buffer.from(input.ageRecipient), mode: 0o400, name: "age-recipient.txt", sourcePath: null },
      { bytes: input.ageLicense, mode: 0o400, name: "AGE-LICENSE", sourcePath: null },
      { bytes: input.cosArchiveBinary, mode: 0o700, name: "p0r-cos-archive", sourcePath: "scripts/v2/production/p0r-cos-archive" },
    );
    if (input.cosProvisioningPlan) {
      fileBytes.push({
        bytes: Buffer.from(`${JSON.stringify(input.cosProvisioningPlan, null, 2)}\n`),
        mode: 0o600,
        name: "cos-provisioning-plan.json",
        sourcePath: null,
      });
    }
    fileBytes.sort((left, right) => left.name.localeCompare(right.name));
    const fileManifest = fileBytes.map((file) => ({
      name: file.name,
      sha256: sha256(file.bytes),
      sizeBytes: file.bytes.length,
      sourcePath: file.sourcePath,
    }));
    const bindingBytes = Buffer.from(bindings(input.sourceCommit, fileManifest));
    fileBytes.push({
      bytes: bindingBytes,
      mode: 0o600,
      name: "p0r-bindings.env",
      sourcePath: null,
    });
    fileManifest.push({
      name: "p0r-bindings.env",
      sha256: sha256(bindingBytes),
      sizeBytes: bindingBytes.length,
      sourcePath: null,
    });
    fileManifest.sort((left, right) => left.name.localeCompare(right.name));
    const manifest = {
      age: {
        archiveSha256: input.ageProvenance.archiveDigest,
        binarySha256: sha256(input.ageBinary),
        licenseIncluded: true,
        sourceUrl: input.ageProvenance.sourceUrl,
        version: input.ageProvenance.version,
      },
      approvalEligible: input.approvalEligible,
      automaticTradingAllowed: false,
      containsPersistentCredentials: false,
      containsPrivateKey: false,
      containsSecrets: false,
      containsSensitiveDestinationMetadata: Boolean(input.cosProvisioningPlan),
      cosProvisioningPlan: input.cosProvisioningPlan ? {
        planDigest: input.cosProvisioningPlan.planDigest,
        runId: input.cosProvisioningPlan.credentialGrant.runId,
      } : null,
      files: fileManifest,
      migrationAllowed: false,
      productionDatabaseMutationAllowed: false,
      productionRepositoryMutationAllowed: false,
      productionServiceMutationAllowed: false,
      reproducibleArchive: true,
      schemaVersion: P0R_BUNDLE_SCHEMA_VERSION,
      sourceCommit: input.sourceCommit,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    fileBytes.push({ bytes: manifestBytes, mode: 0o600, name: "transport-manifest.json" });

    for (const file of fileBytes) {
      const target = join(payload, file.name);
      await writeFile(target, file.bytes, { flag: "wx", mode: file.mode });
      await chmod(target, file.mode);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    await mkdir(dirname(output), { recursive: true });
    const tarPath = join(temporaryRoot, "payload.tar");
    const names = fileBytes.map((file) => file.name).sort();
    await execFileAsync("tar", [
      "-cf", tarPath,
      "--format=ustar",
      "--uid=0",
      "--gid=0",
      "--numeric-owner",
      "-C", payload,
      ...names,
    ], {
      env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" },
      maxBuffer: 4 * 1024 * 1024,
    });
    const { stdout: compressed } = await execFileAsync(
      "gzip",
      ["-n", "-9", "-c", tarPath],
      { encoding: null, maxBuffer: MAXIMUM_ARCHIVE_BYTES },
    );
    assert.ok(Buffer.isBuffer(compressed));
    await writeFile(output, compressed, { flag: "wx", mode: 0o600 });
    return Object.freeze({
      approvalEligible: input.approvalEligible,
      bundleSha256: sha256(compressed),
      containsSecrets: false,
      manifestDigest: `sha256:${sha256(Buffer.from(canonicalJson(manifest)))}`,
      output,
      schemaVersion: P0R_BUNDLE_SCHEMA_VERSION,
      sizeBytes: compressed.length,
      sourceCommit: input.sourceCommit,
      status: input.approvalEligible
        ? "PASS_P0R_PRODUCTION_TRANSPORT_BUNDLE"
        : "PASS_P0R_LOCAL_TEMPLATE_ONLY",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  assert.equal(argv.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    assert.match(argv[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = argv[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${argv[index]}`);
    options[name] = argv[index + 1];
  }
  return options;
}

async function git(root, arguments_) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...arguments_], { encoding: "utf8" });
  return stdout.trim();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  assert.ok(options["age-archive"], "--age-archive is required");
  assert.ok(options["age-recipient"], "--age-recipient is required");
  const head = await git(root, ["rev-parse", "HEAD"]);
  const clean = (await git(root, ["status", "--porcelain=v1"])).length === 0;
  const age = await loadOfficialAgeArchive(resolve(options["age-archive"]));
  const recipient = await readRecipient(resolve(options["age-recipient"]));
  const temporary = await mkdtemp(join(tmpdir(), "market-radar-v2-p0r-cos-build-"));
  try {
    const cosPath = join(temporary, "p0r-cos-archive");
    const cosArchiveBinary = await buildCosArchiveBinary(root, cosPath);
    const sourceCommit = clean ? head : null;
    const cosProvisioningPlan = clean
      ? validateP0RCosProvisioningPlan(await (async () => {
        assert.ok(
          options["cos-provisioning-plan"],
          "--cos-provisioning-plan is required for a clean production bundle",
        );
        const planPath = resolve(options["cos-provisioning-plan"]);
        await requireRegular(planPath, "COS provisioning plan", 256 * 1024);
        return JSON.parse(await readFile(planPath, "utf8"));
      })())
      : null;
    const output = resolve(options.output ?? join(
      root,
      "reports/v2-m1-6-p0r",
      `p0r-transport-${sourceCommit?.slice(0, 12) ?? "precommit-template"}.tar.gz`,
    ));
    const result = await buildP0RTransportBundle({
      ageBinary: age.binary,
      ageLicense: age.license,
      ageProvenance: age,
      ageRecipient: recipient,
      approvalEligible: clean,
      cosArchiveBinary,
      cosProvisioningPlan,
      output,
      root,
      sourceCommit,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
