import { constants as fsConstants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";

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

function nullTerminatedText(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function parseOctalField(buffer, offset, length, reason) {
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
  const expected = parseOctalField(
    header,
    148,
    8,
    "deterministic_ustar_checksum_invalid",
  );
  const checksumHeader = Buffer.from(header);
  checksumHeader.fill(0x20, 148, 156);
  let actual = 0;
  for (const byte of checksumHeader) actual += byte;
  ensure(actual === expected, "deterministic_ustar_checksum_mismatch");
}

export async function readDeterministicUstar({
  archivePath,
  maxArchiveBytes = 128 * 1024 * 1024,
  maxEntries = 10_000,
  sourceDateEpoch = DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
}) {
  ensure(
    Number.isSafeInteger(maxArchiveBytes) && maxArchiveBytes > BLOCK_BYTES * 2,
    "deterministic_ustar_archive_limit_invalid",
  );
  ensure(
    Number.isSafeInteger(maxEntries) && maxEntries > 0,
    "deterministic_ustar_entry_limit_invalid",
  );
  const archive = await readFile(archivePath);
  ensure(
    archive.length >= BLOCK_BYTES * 2 &&
      archive.length <= maxArchiveBytes &&
      archive.length % BLOCK_BYTES === 0,
    "deterministic_ustar_archive_size_invalid",
  );

  const entries = [];
  const observed = new Set();
  let offset = 0;
  while (offset + BLOCK_BYTES * 2 <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_BYTES);
    if (allZero(header)) {
      ensure(
        allZero(archive.subarray(offset)),
        "deterministic_ustar_trailer_invalid",
      );
      ensure(
        archive.length - offset === BLOCK_BYTES * 2,
        "deterministic_ustar_trailer_size_invalid",
      );
      return Object.freeze({
        archiveBytes: archive.length,
        entries: Object.freeze(entries),
        entryCount: entries.length,
        sourceDateEpoch,
      });
    }

    ensure(
      entries.length < maxEntries,
      "deterministic_ustar_entry_limit_exceeded",
    );
    verifyHeaderChecksum(header);
    ensure(
      header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii")) &&
        header.subarray(263, 265).equals(Buffer.from("00", "ascii")),
      "deterministic_ustar_format_invalid",
    );
    ensure(
      header[156] === 0 || header[156] === 0x30,
      "deterministic_ustar_non_regular_entry_rejected",
    );
    const name = nullTerminatedText(header, 0, NAME_BYTES);
    const prefix = nullTerminatedText(header, 345, PREFIX_BYTES);
    const entry = canonicalEntryPath(prefix === "" ? name : `${prefix}/${name}`);
    ensure(!observed.has(entry), "deterministic_ustar_duplicate_entry");
    observed.add(entry);
    const mode = parseOctalField(
      header,
      100,
      8,
      "deterministic_ustar_mode_invalid",
    );
    const uid = parseOctalField(
      header,
      108,
      8,
      "deterministic_ustar_uid_invalid",
    );
    const gid = parseOctalField(
      header,
      116,
      8,
      "deterministic_ustar_gid_invalid",
    );
    const size = parseOctalField(
      header,
      124,
      12,
      "deterministic_ustar_size_invalid",
    );
    const mtime = parseOctalField(
      header,
      136,
      12,
      "deterministic_ustar_mtime_invalid",
    );
    ensure(
      uid === 0 && gid === 0 && mode <= 0o777 && mtime === sourceDateEpoch,
      "deterministic_ustar_metadata_drift",
    );
    const contentStart = offset + BLOCK_BYTES;
    const contentEnd = contentStart + size;
    ensure(
      contentEnd <= archive.length - BLOCK_BYTES * 2,
      "deterministic_ustar_entry_truncated",
    );
    const paddingBytes = (BLOCK_BYTES - (size % BLOCK_BYTES)) % BLOCK_BYTES;
    const nextOffset = contentEnd + paddingBytes;
    ensure(
      nextOffset <= archive.length - BLOCK_BYTES * 2 &&
        allZero(archive.subarray(contentEnd, nextOffset)),
      "deterministic_ustar_padding_invalid",
    );
    entries.push(Object.freeze({
      bytes: Buffer.from(archive.subarray(contentStart, contentEnd)),
      entry,
      mode,
      size,
    }));
    offset = nextOffset;
  }
  throw new Error("deterministic_ustar_trailer_missing");
}

export async function extractDeterministicUstar({
  archivePath,
  destination,
  maxArchiveBytes,
  maxEntries,
  sourceDateEpoch = DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
}) {
  const parsed = await readDeterministicUstar({
    archivePath,
    maxArchiveBytes,
    maxEntries,
    sourceDateEpoch,
  });
  const destinationRoot = resolve(destination);
  await mkdir(destinationRoot, { mode: 0o700, recursive: false });
  for (const item of parsed.entries) {
    const target = resolve(destinationRoot, ...item.entry.split("/"));
    ensure(
      target.startsWith(`${destinationRoot}${sep}`),
      "deterministic_ustar_extract_boundary_rejected",
    );
    await mkdir(dirname(target), { mode: 0o700, recursive: true });
    await writeFile(target, item.bytes, {
      flag: "wx",
      mode: item.mode,
    });
    await chmod(target, item.mode);
  }
  return parsed;
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
    let handle;
    try {
      handle = await open(
        sourcePath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
    } catch {
      ensure(false, "deterministic_ustar_entry_not_regular_file");
    }
    let bytes;
    let metadata;
    try {
      metadata = await handle.stat();
      ensure(metadata.isFile(),
        "deterministic_ustar_entry_not_regular_file");
      bytes = await handle.readFile();
      ensure(bytes.length === metadata.size,
        "deterministic_ustar_entry_size_changed");
    } finally {
      await handle.close();
    }
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
