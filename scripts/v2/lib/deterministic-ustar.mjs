import { lstat, readFile, writeFile } from "node:fs/promises";
import { posix, resolve, sep } from "node:path";

const BLOCK_BYTES = 512;
const NAME_BYTES = 100;
const PREFIX_BYTES = 155;
export const DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH = 946_684_800;

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function canonicalEntryPath(value) {
  ensure(typeof value === "string" && value.length > 0,
    "deterministic_ustar_entry_invalid");
  ensure(
    !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      posix.normalize(value) === value &&
      value !== "." &&
      value.split("/").every((segment) => segment !== "" && segment !== ".."),
    "deterministic_ustar_entry_boundary_rejected",
  );
  return value;
}

function splitUstarPath(value) {
  if (byteLength(value) <= NAME_BYTES) {
    return { name: value, prefix: "" };
  }
  for (let index = value.lastIndexOf("/"); index > 0;
    index = value.lastIndexOf("/", index - 1)) {
    const prefix = value.slice(0, index);
    const name = value.slice(index + 1);
    if (byteLength(prefix) <= PREFIX_BYTES && byteLength(name) <= NAME_BYTES) {
      return { name, prefix };
    }
  }
  throw new Error("deterministic_ustar_entry_path_too_long");
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

function buildHeader({ entry, mode, size, sourceDateEpoch }) {
  const { name, prefix } = splitUstarPath(entry);
  const header = Buffer.alloc(BLOCK_BYTES);
  writeText(header, 0, NAME_BYTES, name,
    "deterministic_ustar_name_too_long");
  writeOctal(header, 100, 8, mode,
    "deterministic_ustar_mode_invalid");
  writeOctal(header, 108, 8, 0,
    "deterministic_ustar_uid_invalid");
  writeOctal(header, 116, 8, 0,
    "deterministic_ustar_gid_invalid");
  writeOctal(header, 124, 12, size,
    "deterministic_ustar_size_invalid");
  writeOctal(header, 136, 12, sourceDateEpoch,
    "deterministic_ustar_mtime_invalid");
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeText(header, 257, 6, "ustar\0",
    "deterministic_ustar_magic_invalid");
  writeText(header, 263, 2, "00",
    "deterministic_ustar_version_invalid");
  writeOctal(header, 329, 8, 0,
    "deterministic_ustar_device_major_invalid");
  writeOctal(header, 337, 8, 0,
    "deterministic_ustar_device_minor_invalid");
  writeText(header, 345, PREFIX_BYTES, prefix,
    "deterministic_ustar_prefix_too_long");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumDigits = checksum.toString(8);
  ensure(checksumDigits.length <= 6,
    "deterministic_ustar_checksum_overflow");
  writeText(header, 148, 6, checksumDigits.padStart(6, "0"),
    "deterministic_ustar_checksum_invalid");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function lexicalOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function writeDeterministicUstar({
  archivePath,
  entries,
  root,
  sourceDateEpoch = DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
}) {
  ensure(
    Number.isSafeInteger(sourceDateEpoch) && sourceDateEpoch >= 0,
    "deterministic_ustar_source_date_epoch_invalid",
  );
  ensure(Array.isArray(entries) && entries.length > 0,
    "deterministic_ustar_entries_missing");
  const canonicalEntries = entries.map(canonicalEntryPath).sort(lexicalOrder);
  ensure(
    new Set(canonicalEntries).size === canonicalEntries.length,
    "deterministic_ustar_duplicate_entry",
  );
  const sourceRoot = resolve(root);
  const chunks = [];
  let archiveBytes = BLOCK_BYTES * 2;

  for (const entry of canonicalEntries) {
    const sourcePath = resolve(sourceRoot, ...entry.split("/"));
    ensure(
      sourcePath.startsWith(`${sourceRoot}${sep}`),
      "deterministic_ustar_entry_boundary_rejected",
    );
    const metadata = await lstat(sourcePath);
    ensure(metadata.isFile() && !metadata.isSymbolicLink(),
      "deterministic_ustar_entry_not_regular_file");
    const bytes = await readFile(sourcePath);
    ensure(bytes.length === metadata.size,
      "deterministic_ustar_entry_size_changed");
    const mode = metadata.mode & 0o777;
    const header = buildHeader({
      entry,
      mode,
      size: bytes.length,
      sourceDateEpoch,
    });
    const paddingBytes =
      (BLOCK_BYTES - (bytes.length % BLOCK_BYTES)) % BLOCK_BYTES;
    chunks.push(header, bytes);
    if (paddingBytes > 0) chunks.push(Buffer.alloc(paddingBytes));
    archiveBytes += BLOCK_BYTES + bytes.length + paddingBytes;
  }
  chunks.push(Buffer.alloc(BLOCK_BYTES * 2));
  await writeFile(archivePath, Buffer.concat(chunks, archiveBytes), {
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({
    archiveBytes,
    entryCount: canonicalEntries.length,
    entries: Object.freeze(canonicalEntries),
    sourceDateEpoch,
  });
}
