#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const P0R_NODE_RUNTIME_CAPSULE_SCHEMA_VERSION =
  "v2-m1-production-storage-p0r-node-runtime.v1";
export const P0R_NODE_RUNTIME_PACKAGE_NAME =
  "@market-radar/v2-m1-p0r-runtime";
export const P0R_NODE_RUNTIME_VERSION = "22.23.1";
export const P0R_NPM_RUNTIME_VERSION = "10.9.8";
export const P0R_PG_RUNTIME_VERSION = "8.16.3";
export const P0R_NODE_RUNTIME_SOURCE_DATE_EPOCH = 946_684_800;

const BLOCK_BYTES = 512;
const NAME_BYTES = 100;
const PREFIX_BYTES = 155;
const MAXIMUM_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_ENTRY_BYTES = 4 * 1024 * 1024;
const MAXIMUM_ENTRY_COUNT = 4_096;
const MAXIMUM_UNPACKED_BYTES = 32 * 1024 * 1024;
const ROOT_FILES = Object.freeze(["package-lock.json", "package.json"]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lexicalOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalEntryPath(value) {
  ensure(
    typeof value === "string" &&
      value.length > 0 &&
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      posix.normalize(value) === value &&
      value !== "." &&
      value.split("/").every((segment) =>
        segment !== "" && segment !== "." && segment !== ".."),
    "p0r_runtime_capsule_entry_boundary_rejected",
  );
  return value;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function splitUstarPath(value) {
  if (byteLength(value) <= NAME_BYTES) return { name: value, prefix: "" };
  for (
    let index = value.lastIndexOf("/");
    index > 0;
    index = value.lastIndexOf("/", index - 1)
  ) {
    const prefix = value.slice(0, index);
    const name = value.slice(index + 1);
    if (byteLength(prefix) <= PREFIX_BYTES && byteLength(name) <= NAME_BYTES) {
      return { name, prefix };
    }
  }
  throw new Error("p0r_runtime_capsule_entry_path_too_long");
}

function writeText(header, offset, length, value, reason) {
  const bytes = Buffer.from(value, "utf8");
  ensure(bytes.length <= length, reason);
  bytes.copy(header, offset);
}

function writeOctal(header, offset, length, value, reason) {
  ensure(Number.isSafeInteger(value) && value >= 0, reason);
  const digits = value.toString(8);
  ensure(digits.length <= length - 1, reason);
  writeText(
    header,
    offset,
    length,
    `${digits.padStart(length - 1, "0")}\0`,
    reason,
  );
}

function buildHeader(entry, size) {
  const { name, prefix } = splitUstarPath(entry);
  const header = Buffer.alloc(BLOCK_BYTES);
  writeText(header, 0, NAME_BYTES, name,
    "p0r_runtime_capsule_name_too_long");
  writeOctal(header, 100, 8, 0o600,
    "p0r_runtime_capsule_mode_invalid");
  writeOctal(header, 108, 8, 0,
    "p0r_runtime_capsule_uid_invalid");
  writeOctal(header, 116, 8, 0,
    "p0r_runtime_capsule_gid_invalid");
  writeOctal(header, 124, 12, size,
    "p0r_runtime_capsule_size_invalid");
  writeOctal(
    header,
    136,
    12,
    P0R_NODE_RUNTIME_SOURCE_DATE_EPOCH,
    "p0r_runtime_capsule_mtime_invalid",
  );
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeText(header, 257, 6, "ustar\0",
    "p0r_runtime_capsule_magic_invalid");
  writeText(header, 263, 2, "00",
    "p0r_runtime_capsule_version_invalid");
  writeOctal(header, 329, 8, 0,
    "p0r_runtime_capsule_device_major_invalid");
  writeOctal(header, 337, 8, 0,
    "p0r_runtime_capsule_device_minor_invalid");
  writeText(header, 345, PREFIX_BYTES, prefix,
    "p0r_runtime_capsule_prefix_too_long");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const digits = checksum.toString(8);
  ensure(digits.length <= 6, "p0r_runtime_capsule_checksum_overflow");
  writeText(
    header,
    148,
    6,
    digits.padStart(6, "0"),
    "p0r_runtime_capsule_checksum_invalid",
  );
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function buildArchive(entries) {
  ensure(
    Array.isArray(entries) &&
      entries.length > 0 &&
      entries.length <= MAXIMUM_ENTRY_COUNT,
    "p0r_runtime_capsule_entry_count_invalid",
  );
  const sorted = [...entries].sort((left, right) =>
    lexicalOrder(left.entry, right.entry));
  ensure(
    new Set(sorted.map(({ entry }) => entry)).size === sorted.length,
    "p0r_runtime_capsule_duplicate_entry",
  );
  const chunks = [];
  let archiveBytes = BLOCK_BYTES * 2;
  for (const item of sorted) {
    const entry = canonicalEntryPath(item.entry);
    ensure(
      Buffer.isBuffer(item.bytes) &&
        item.bytes.length <= MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_entry_size_invalid",
    );
    const paddingBytes =
      (BLOCK_BYTES - (item.bytes.length % BLOCK_BYTES)) % BLOCK_BYTES;
    chunks.push(buildHeader(entry, item.bytes.length), item.bytes);
    if (paddingBytes > 0) chunks.push(Buffer.alloc(paddingBytes));
    archiveBytes += BLOCK_BYTES + item.bytes.length + paddingBytes;
  }
  ensure(
    archiveBytes <= MAXIMUM_ARCHIVE_BYTES,
    "p0r_runtime_capsule_archive_size_invalid",
  );
  chunks.push(Buffer.alloc(BLOCK_BYTES * 2));
  return Buffer.concat(chunks, archiveBytes);
}

function nullTerminatedText(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function parseOctal(buffer, offset, length, reason) {
  const value = buffer
    .subarray(offset, offset + length)
    .toString("ascii")
    .replace(/\0.*$/u, "")
    .trim();
  ensure(/^[0-7]+$/u.test(value), reason);
  const parsed = Number.parseInt(value, 8);
  ensure(Number.isSafeInteger(parsed) && parsed >= 0, reason);
  return parsed;
}

function allZero(buffer) {
  return buffer.every((byte) => byte === 0);
}

function verifyHeaderChecksum(header) {
  const expected = parseOctal(
    header,
    148,
    8,
    "p0r_runtime_capsule_checksum_invalid",
  );
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  let actual = 0;
  for (const byte of copy) actual += byte;
  ensure(actual === expected, "p0r_runtime_capsule_checksum_mismatch");
}

function parseArchive(archive) {
  ensure(
    Buffer.isBuffer(archive) &&
      archive.length >= BLOCK_BYTES * 2 &&
      archive.length <= MAXIMUM_ARCHIVE_BYTES &&
      archive.length % BLOCK_BYTES === 0,
    "p0r_runtime_capsule_archive_size_invalid",
  );
  const entries = [];
  const observed = new Set();
  let offset = 0;
  let unpackedBytes = 0;
  while (offset + BLOCK_BYTES * 2 <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_BYTES);
    if (allZero(header)) {
      ensure(
        archive.length - offset === BLOCK_BYTES * 2 &&
          allZero(archive.subarray(offset)),
        "p0r_runtime_capsule_trailer_invalid",
      );
      return entries;
    }
    ensure(
      entries.length < MAXIMUM_ENTRY_COUNT,
      "p0r_runtime_capsule_entry_limit_exceeded",
    );
    verifyHeaderChecksum(header);
    ensure(
      header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii")) &&
        header.subarray(263, 265).equals(Buffer.from("00", "ascii")),
      "p0r_runtime_capsule_format_invalid",
    );
    ensure(
      header[156] === 0 || header[156] === 0x30,
      "p0r_runtime_capsule_non_regular_entry_rejected",
    );
    const name = nullTerminatedText(header, 0, NAME_BYTES);
    const prefix = nullTerminatedText(header, 345, PREFIX_BYTES);
    const entry = canonicalEntryPath(prefix === "" ? name : `${prefix}/${name}`);
    ensure(!observed.has(entry), "p0r_runtime_capsule_duplicate_entry");
    observed.add(entry);
    const mode = parseOctal(
      header,
      100,
      8,
      "p0r_runtime_capsule_mode_invalid",
    );
    const uid = parseOctal(
      header,
      108,
      8,
      "p0r_runtime_capsule_uid_invalid",
    );
    const gid = parseOctal(
      header,
      116,
      8,
      "p0r_runtime_capsule_gid_invalid",
    );
    const size = parseOctal(
      header,
      124,
      12,
      "p0r_runtime_capsule_size_invalid",
    );
    const mtime = parseOctal(
      header,
      136,
      12,
      "p0r_runtime_capsule_mtime_invalid",
    );
    ensure(
      mode === 0o600 &&
        uid === 0 &&
        gid === 0 &&
        mtime === P0R_NODE_RUNTIME_SOURCE_DATE_EPOCH &&
        size <= MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_metadata_drift",
    );
    ensure(
      header.equals(buildHeader(entry, size)),
      "p0r_runtime_capsule_noncanonical_header_rejected",
    );
    unpackedBytes += size;
    ensure(
      unpackedBytes <= MAXIMUM_UNPACKED_BYTES,
      "p0r_runtime_capsule_unpacked_size_exceeded",
    );
    const contentStart = offset + BLOCK_BYTES;
    const contentEnd = contentStart + size;
    ensure(
      contentEnd <= archive.length - BLOCK_BYTES * 2,
      "p0r_runtime_capsule_entry_truncated",
    );
    const paddingBytes = (BLOCK_BYTES - (size % BLOCK_BYTES)) % BLOCK_BYTES;
    const nextOffset = contentEnd + paddingBytes;
    ensure(
      nextOffset <= archive.length - BLOCK_BYTES * 2 &&
        allZero(archive.subarray(contentEnd, nextOffset)),
      "p0r_runtime_capsule_padding_invalid",
    );
    entries.push(Object.freeze({
      bytes: Buffer.from(archive.subarray(contentStart, contentEnd)),
      entry,
      size,
    }));
    offset = nextOffset;
  }
  throw new Error("p0r_runtime_capsule_trailer_missing");
}

function parseJson(bytes, reason) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(reason);
  }
}

function exactPgDependency(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    value.pg === P0R_PG_RUNTIME_VERSION;
}

function validateRuntimeDefinitions(packageManifest, packageLock) {
  ensure(
    packageManifest?.name === P0R_NODE_RUNTIME_PACKAGE_NAME &&
      packageManifest.version === "0.1.0" &&
      packageManifest.private === true &&
      packageManifest.packageManager === `npm@${P0R_NPM_RUNTIME_VERSION}` &&
      packageManifest.engines?.node === P0R_NODE_RUNTIME_VERSION &&
      packageManifest.engines?.npm === P0R_NPM_RUNTIME_VERSION &&
      exactPgDependency(packageManifest.dependencies),
    "p0r_runtime_capsule_package_manifest_invalid",
  );
  const root = packageLock?.packages?.[""];
  ensure(
    packageLock?.name === P0R_NODE_RUNTIME_PACKAGE_NAME &&
      packageLock.version === packageManifest.version &&
      packageLock.lockfileVersion === 3 &&
      packageLock.requires === true &&
      root?.name === packageManifest.name &&
      root.version === packageManifest.version &&
      root.engines?.node === P0R_NODE_RUNTIME_VERSION &&
      root.engines?.npm === P0R_NPM_RUNTIME_VERSION &&
      exactPgDependency(root.dependencies),
    "p0r_runtime_capsule_package_lock_invalid",
  );

  const packages = new Map();
  for (const [key, value] of Object.entries(packageLock.packages)) {
    if (key === "") continue;
    ensure(
      key.startsWith("node_modules/") &&
        !key.slice("node_modules/".length).includes("/node_modules/"),
      "p0r_runtime_capsule_nested_dependency_layout_rejected",
    );
    const relative = key.slice("node_modules/".length);
    const parts = relative.split("/");
    const packageName = relative.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : parts[0];
    ensure(
      packageName.length > 0 &&
        key === `node_modules/${packageName}` &&
        typeof value?.version === "string" &&
        value.version.length > 0 &&
        typeof value.resolved === "string" &&
        value.resolved.startsWith("https://registry.npmjs.org/") &&
        typeof value.integrity === "string" &&
        value.integrity.startsWith("sha512-") &&
        value.link !== true &&
        value.dev !== true &&
        !packages.has(packageName),
      "p0r_runtime_capsule_dependency_lock_invalid",
    );
    packages.set(packageName, value.version);
  }
  ensure(
    packages.size > 0 &&
      packages.get("pg") === P0R_PG_RUNTIME_VERSION,
    "p0r_runtime_capsule_pg_lock_invalid",
  );
  return packages;
}

function packageRootForEntry(entry, expectedPackages) {
  if (!entry.startsWith("node_modules/")) return null;
  const relative = entry.slice("node_modules/".length);
  const parts = relative.split("/");
  const packageName = relative.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  return expectedPackages.has(packageName) ? packageName : null;
}

export function inspectP0RNodeRuntimeCapsuleBytes(archive) {
  const entries = parseArchive(archive);
  const names = entries.map(({ entry }) => entry);
  ensure(
    JSON.stringify(names) ===
      JSON.stringify([...names].sort(lexicalOrder)),
    "p0r_runtime_capsule_entry_order_invalid",
  );
  const byName = new Map(entries.map((entry) => [entry.entry, entry]));
  for (const rootFile of ROOT_FILES) {
    ensure(byName.has(rootFile), "p0r_runtime_capsule_root_file_missing");
  }
  const packageManifest = parseJson(
    byName.get("package.json").bytes,
    "p0r_runtime_capsule_package_manifest_json_invalid",
  );
  const packageLock = parseJson(
    byName.get("package-lock.json").bytes,
    "p0r_runtime_capsule_package_lock_json_invalid",
  );
  const expectedPackages = validateRuntimeDefinitions(
    packageManifest,
    packageLock,
  );
  for (const item of entries) {
    const packageRelative = item.entry.startsWith("node_modules/")
      ? item.entry.slice("node_modules/".length)
      : "";
    ensure(
      !item.entry.includes("/.bin/") &&
        !item.entry.endsWith("/.bin") &&
        !item.entry.endsWith(".node") &&
        !packageRelative.includes("/node_modules/"),
      "p0r_runtime_capsule_executable_surface_rejected",
    );
    if (ROOT_FILES.includes(item.entry)) continue;
    const packageName = packageRootForEntry(item.entry, expectedPackages);
    ensure(
      packageName !== null,
      "p0r_runtime_capsule_unexpected_entry",
    );
  }
  for (const [packageName, expectedVersion] of expectedPackages) {
    const packageJsonPath = `node_modules/${packageName}/package.json`;
    ensure(
      byName.has(packageJsonPath),
      "p0r_runtime_capsule_dependency_manifest_missing",
    );
    const installed = parseJson(
      byName.get(packageJsonPath).bytes,
      "p0r_runtime_capsule_dependency_manifest_json_invalid",
    );
    ensure(
      installed.name === packageName &&
        installed.version === expectedVersion,
      "p0r_runtime_capsule_dependency_version_mismatch",
    );
  }
  return Object.freeze({
    archiveSha256: sha256(archive),
    entryCount: entries.length,
    entries: Object.freeze(entries),
    nodeVersion: P0R_NODE_RUNTIME_VERSION,
    npmVersion: P0R_NPM_RUNTIME_VERSION,
    packageLockSha256: sha256(byName.get("package-lock.json").bytes),
    packageManifestSha256: sha256(byName.get("package.json").bytes),
    packageVersions: Object.freeze({ pg: P0R_PG_RUNTIME_VERSION }),
    schemaVersion: P0R_NODE_RUNTIME_CAPSULE_SCHEMA_VERSION,
    unpackedBytes: entries.reduce((total, item) => total + item.size, 0),
  });
}

async function readRegularNoFollow(path, maximumBytes, reason) {
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch {
    throw new Error(reason);
  }
  try {
    const facts = await handle.stat();
    ensure(
      facts.isFile() &&
        facts.size > 0 &&
        facts.size <= maximumBytes,
      reason,
    );
    const bytes = await handle.readFile();
    ensure(bytes.length === facts.size, reason);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function collectPackageFiles(
  packageDirectory,
  archiveRoot,
  output,
) {
  const entries = await readdir(packageDirectory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    lexicalOrder(left.name, right.name))) {
    const path = join(packageDirectory, entry.name);
    const archivePath = posix.join(archiveRoot, entry.name);
    ensure(
      !entry.isSymbolicLink(),
      "p0r_runtime_capsule_symlink_rejected",
    );
    if (entry.isDirectory()) {
      ensure(
        entry.name !== ".bin",
        "p0r_runtime_capsule_executable_surface_rejected",
      );
      await collectPackageFiles(path, archivePath, output);
      continue;
    }
    ensure(
      entry.isFile() && !archivePath.endsWith(".node"),
      "p0r_runtime_capsule_special_file_rejected",
    );
    output.push({
      bytes: await readRegularNoFollow(
        path,
        MAXIMUM_ENTRY_BYTES,
        "p0r_runtime_capsule_package_file_invalid",
      ),
      entry: archivePath,
    });
  }
}

async function discoverInstalledPackages(nodeModulesDirectory) {
  const packages = new Set();
  const topLevel = await readdir(nodeModulesDirectory, {
    withFileTypes: true,
  });
  for (const entry of topLevel) {
    ensure(
      !entry.isSymbolicLink(),
      "p0r_runtime_capsule_symlink_rejected",
    );
    if (entry.name === ".package-lock.json") {
      ensure(
        entry.isFile(),
        "p0r_runtime_capsule_node_modules_layout_invalid",
      );
      continue;
    }
    ensure(
      entry.isDirectory() && entry.name !== ".bin",
      "p0r_runtime_capsule_node_modules_layout_invalid",
    );
    if (!entry.name.startsWith("@")) {
      packages.add(entry.name);
      continue;
    }
    const scopeEntries = await readdir(
      join(nodeModulesDirectory, entry.name),
      { withFileTypes: true },
    );
    ensure(
      scopeEntries.length > 0,
      "p0r_runtime_capsule_scope_empty",
    );
    for (const child of scopeEntries) {
      ensure(
        child.isDirectory() && !child.isSymbolicLink(),
        "p0r_runtime_capsule_scope_layout_invalid",
      );
      packages.add(`${entry.name}/${child.name}`);
    }
  }
  return packages;
}

export async function createP0RNodeRuntimeCapsuleFromDirectory({
  output,
  runtimeDirectory,
}) {
  const root = resolve(runtimeDirectory);
  const rootEntries = await readdir(root, { withFileTypes: true });
  ensure(
    rootEntries.every((entry) =>
      !entry.isSymbolicLink() &&
      (
        (entry.isFile() && ROOT_FILES.includes(entry.name)) ||
        (entry.isDirectory() && entry.name === "node_modules")
      )) &&
      ROOT_FILES.every((name) =>
        rootEntries.some((entry) => entry.isFile() && entry.name === name)) &&
      rootEntries.some((entry) =>
        entry.isDirectory() && entry.name === "node_modules"),
    "p0r_runtime_capsule_runtime_root_invalid",
  );
  const rootBytes = new Map();
  for (const name of ROOT_FILES) {
    rootBytes.set(name, await readRegularNoFollow(
      join(root, name),
      MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_root_file_invalid",
    ));
  }
  const packageManifest = parseJson(
    rootBytes.get("package.json"),
    "p0r_runtime_capsule_package_manifest_json_invalid",
  );
  const packageLock = parseJson(
    rootBytes.get("package-lock.json"),
    "p0r_runtime_capsule_package_lock_json_invalid",
  );
  const expectedPackages = validateRuntimeDefinitions(
    packageManifest,
    packageLock,
  );
  const nodeModulesDirectory = join(root, "node_modules");
  const installedPackages = await discoverInstalledPackages(
    nodeModulesDirectory,
  );
  ensure(
    JSON.stringify([...installedPackages].sort(lexicalOrder)) ===
      JSON.stringify([...expectedPackages.keys()].sort(lexicalOrder)),
    "p0r_runtime_capsule_installed_package_set_mismatch",
  );

  const entries = ROOT_FILES.map((entry) => ({
    bytes: rootBytes.get(entry),
    entry,
  }));
  for (const packageName of [...expectedPackages.keys()].sort(lexicalOrder)) {
    await collectPackageFiles(
      join(nodeModulesDirectory, ...packageName.split("/")),
      `node_modules/${packageName}`,
      entries,
    );
  }
  const archive = buildArchive(entries);
  const inspection = inspectP0RNodeRuntimeCapsuleBytes(archive);
  await writeFile(resolve(output), archive, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(resolve(output), 0o600);
  return inspection;
}

function exactBuildEnvironment({
  cacheDirectory,
  homeDirectory,
  nodeBinary,
}) {
  const environment = {
    HOME: homeDirectory,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NODE_OPTIONS: "",
    PATH: `${dirname(nodeBinary)}:/usr/bin:/bin`,
    npm_config_audit: "false",
    npm_config_cache: cacheDirectory,
    npm_config_engine_strict: "true",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_loglevel: "error",
    npm_config_package_lock: "true",
    npm_config_progress: "false",
    npm_config_update_notifier: "false",
    npm_config_userconfig: "/dev/null",
  };
  for (const name of [
    "ALL_PROXY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "all_proxy",
    "https_proxy",
    "http_proxy",
    "no_proxy",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

export async function buildP0RNodeRuntimeCapsule({
  nodeBinary,
  npmBinary,
  output,
  sourceDirectory,
}) {
  const exactNode = resolve(nodeBinary);
  const exactNpm = resolve(npmBinary);
  const source = resolve(sourceDirectory);
  const temporary = await mkdtemp(
    join(tmpdir(), "market-radar-v2-p0r-node-runtime-"),
  );
  const installRoot = join(temporary, "install");
  try {
    await mkdir(installRoot, { mode: 0o700 });
    const packageBytes = await readRegularNoFollow(
      join(source, "package.json"),
      MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_source_package_invalid",
    );
    const lockBytes = await readRegularNoFollow(
      join(source, "package-lock.json"),
      MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_source_lock_invalid",
    );
    validateRuntimeDefinitions(
      parseJson(
        packageBytes,
        "p0r_runtime_capsule_package_manifest_json_invalid",
      ),
      parseJson(
        lockBytes,
        "p0r_runtime_capsule_package_lock_json_invalid",
      ),
    );
    await writeFile(join(installRoot, "package.json"), packageBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(join(installRoot, "package-lock.json"), lockBytes, {
      flag: "wx",
      mode: 0o600,
    });
    const environment = exactBuildEnvironment({
      cacheDirectory: join(temporary, "npm-cache"),
      homeDirectory: temporary,
      nodeBinary: exactNode,
    });
    const [{ stdout: nodeVersion }, { stdout: npmVersion }] =
      await Promise.all([
        execFileAsync(exactNode, ["--version"], {
          encoding: "utf8",
          env: environment,
          maxBuffer: 64 * 1024,
          timeout: 30_000,
        }),
        execFileAsync(exactNpm, ["--version"], {
          encoding: "utf8",
          env: environment,
          maxBuffer: 64 * 1024,
          timeout: 30_000,
        }),
      ]);
    ensure(
      nodeVersion.trim() === `v${P0R_NODE_RUNTIME_VERSION}`,
      "p0r_runtime_capsule_node_version_mismatch",
    );
    ensure(
      npmVersion.trim() === P0R_NPM_RUNTIME_VERSION,
      "p0r_runtime_capsule_npm_version_mismatch",
    );
    await execFileAsync(exactNpm, [
      "ci",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ], {
      cwd: installRoot,
      encoding: "utf8",
      env: environment,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180_000,
    });
    return await createP0RNodeRuntimeCapsuleFromDirectory({
      output,
      runtimeDirectory: installRoot,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function inspectP0RNodeRuntimeCapsule(path) {
  const archive = await readRegularNoFollow(
    resolve(path),
    MAXIMUM_ARCHIVE_BYTES,
    "p0r_runtime_capsule_archive_invalid",
  );
  return inspectP0RNodeRuntimeCapsuleBytes(archive);
}

export async function extractP0RNodeRuntimeCapsule({
  archivePath,
  destination,
  expectedSha256,
}) {
  const destinationRoot = resolve(destination);
  ensure(
    destinationRoot === destination,
    "p0r_runtime_capsule_destination_not_absolute",
  );
  const archive = await readRegularNoFollow(
    resolve(archivePath),
    MAXIMUM_ARCHIVE_BYTES,
    "p0r_runtime_capsule_archive_invalid",
  );
  ensure(
    /^[0-9a-f]{64}$/u.test(expectedSha256) &&
      sha256(archive) === expectedSha256,
    "p0r_runtime_capsule_sha256_mismatch",
  );
  const inspection = inspectP0RNodeRuntimeCapsuleBytes(archive);
  await mkdir(destinationRoot, { mode: 0o700, recursive: false });
  const canonicalDestinationRoot = await realpath(destinationRoot);
  for (const item of inspection.entries) {
    const target = resolve(destinationRoot, ...item.entry.split("/"));
    ensure(
      target.startsWith(`${destinationRoot}${sep}`),
      "p0r_runtime_capsule_extract_boundary_rejected",
    );
    await mkdir(dirname(target), { mode: 0o700, recursive: true });
    await writeFile(target, item.bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await chmod(target, 0o600);
  }

  const requireFromRuntime = createRequire(
    join(destinationRoot, "p0r-runtime-check.cjs"),
  );
  let resolvedPg;
  try {
    resolvedPg = await realpath(
      requireFromRuntime.resolve("pg/package.json"),
    );
  } catch {
    throw new Error("p0r_runtime_capsule_pg_resolution_failed");
  }
  ensure(
    resolvedPg.startsWith(
      `${join(canonicalDestinationRoot, "node_modules", "pg")}${sep}`,
    ),
    "p0r_runtime_capsule_pg_resolution_escaped",
  );
  const installedPg = parseJson(
    await readRegularNoFollow(
      resolvedPg,
      MAXIMUM_ENTRY_BYTES,
      "p0r_runtime_capsule_pg_manifest_invalid",
    ),
    "p0r_runtime_capsule_pg_manifest_json_invalid",
  );
  ensure(
    installedPg.name === "pg" &&
      installedPg.version === P0R_PG_RUNTIME_VERSION,
    "p0r_runtime_capsule_pg_runtime_version_mismatch",
  );
  return Object.freeze({
    archiveSha256: inspection.archiveSha256,
    entryCount: inspection.entryCount,
    nodeVersion: inspection.nodeVersion,
    packageVersions: inspection.packageVersions,
    schemaVersion: inspection.schemaVersion,
    status: "PASS_P0R_NODE_RUNTIME_CAPSULE_EXTRACTED",
  });
}

function parseArguments(argv) {
  ensure(
    argv.length >= 1 && argv.length % 2 === 1,
    "p0r_runtime_capsule_arguments_invalid",
  );
  const action = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(argv[index]) &&
        options[argv[index].slice(2)] === undefined,
      "p0r_runtime_capsule_arguments_invalid",
    );
    options[argv[index].slice(2)] = argv[index + 1];
  }
  return { action, options };
}

async function main() {
  const { action, options } = parseArguments(process.argv.slice(2));
  let result;
  if (action === "build") {
    ensure(
      options["source-directory"] &&
        options.output &&
        options["node-binary"] &&
        options["npm-binary"],
      "p0r_runtime_capsule_arguments_invalid",
    );
    result = await buildP0RNodeRuntimeCapsule({
      nodeBinary: options["node-binary"],
      npmBinary: options["npm-binary"],
      output: options.output,
      sourceDirectory: options["source-directory"],
    });
  } else if (action === "inspect") {
    ensure(
      options.archive,
      "p0r_runtime_capsule_arguments_invalid",
    );
    result = await inspectP0RNodeRuntimeCapsule(options.archive);
  } else if (action === "extract") {
    ensure(
      options.archive && options.destination && options["expected-sha256"],
      "p0r_runtime_capsule_arguments_invalid",
    );
    result = await extractP0RNodeRuntimeCapsule({
      archivePath: options.archive,
      destination: options.destination,
      expectedSha256: options["expected-sha256"],
    });
  } else {
    throw new Error("p0r_runtime_capsule_action_invalid");
  }
  process.stdout.write(`${JSON.stringify({
    archiveSha256: result.archiveSha256,
    entryCount: result.entryCount,
    nodeVersion: result.nodeVersion,
    packageVersions: result.packageVersions,
    schemaVersion: result.schemaVersion,
    status: result.status ?? "PASS_P0R_NODE_RUNTIME_CAPSULE",
  })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "";
    const reasonCode = /^p0r_runtime_capsule_[a-z0-9_]+$/u.test(message)
      ? message
      : "p0r_runtime_capsule_unexpected_error";
    process.stderr.write(`${JSON.stringify({
      reasonCode,
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
