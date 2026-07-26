import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  extractDeterministicUstar,
  readDeterministicUstar,
  writeDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;

function octalField(header, offset, length) {
  return Number.parseInt(
    header.subarray(offset, offset + length).toString("ascii")
      .replaceAll("\0", "").trim(),
    8,
  );
}

test("deterministic USTAR is byte-stable, portable and metadata-normalized", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "deterministic-ustar-"));
  const payload = join(temporary, "payload");
  const first = join(temporary, "first.tar");
  const second = join(temporary, "second.tar");
  const extract = join(temporary, "extract");
  const longEntry =
    `${"qualified-segment-".repeat(5)}/${"evidence-".repeat(9)}.json`;
  const entries = ["scripts/run.sh", "manifest.json", longEntry];
  try {
    for (const [path, bytes, mode] of [
      ["scripts/run.sh", Buffer.from("#!/bin/sh\nexit 0\n"), 0o700],
      ["manifest.json", Buffer.from('{"containsSecrets":false}\n'), 0o600],
      [longEntry, Buffer.from("point-in-time-evidence\n"), 0o600],
    ]) {
      const target = join(payload, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      await chmod(target, mode);
    }
    await writeDeterministicUstar({
      archivePath: first,
      entries: [...entries].reverse(),
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    await writeDeterministicUstar({
      archivePath: second,
      entries,
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    const firstBytes = await readFile(first);
    assert.deepEqual(firstBytes, await readFile(second));
    assert.equal(firstBytes.length % 512, 0);
    assert.deepEqual(
      firstBytes.subarray(-1_024),
      Buffer.alloc(1_024),
    );
    assert.equal(firstBytes.subarray(257, 263).toString("ascii"), "ustar\0");
    assert.equal(octalField(firstBytes, 108, 8), 0);
    assert.equal(octalField(firstBytes, 116, 8), 0);
    assert.equal(octalField(firstBytes, 136, 12), SOURCE_DATE_EPOCH);

    const { stdout } = await execFileAsync("tar", ["-tf", first], {
      encoding: "utf8",
    });
    assert.deepEqual(
      stdout.trim().split(/\r?\n/u),
      [...entries].sort(),
    );
    await mkdir(extract);
    await execFileAsync("tar", ["-xf", first, "-C", extract]);
    assert.equal(
      await readFile(join(extract, "manifest.json"), "utf8"),
      '{"containsSecrets":false}\n',
    );
    assert.equal(
      (await lstat(join(extract, "scripts/run.sh"))).mode & 0o777,
      0o700,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("deterministic USTAR rejects traversal, duplicates and special files", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "deterministic-ustar-reject-"));
  const payload = join(temporary, "payload");
  try {
    await mkdir(payload);
    await writeFile(join(payload, "safe.txt"), "safe\n");
    await symlink(join(payload, "safe.txt"), join(payload, "linked.txt"));
    await assert.rejects(
      writeDeterministicUstar({
        archivePath: join(temporary, "traversal.tar"),
        entries: ["../safe.txt"],
        root: payload,
      }),
      /deterministic_ustar_entry_boundary_rejected/u,
    );
    await assert.rejects(
      writeDeterministicUstar({
        archivePath: join(temporary, "duplicate.tar"),
        entries: ["safe.txt", "safe.txt"],
        root: payload,
      }),
      /deterministic_ustar_duplicate_entry/u,
    );
    await assert.rejects(
      writeDeterministicUstar({
        archivePath: join(temporary, "symlink.tar"),
        entries: ["linked.txt"],
        root: payload,
      }),
      /deterministic_ustar_entry_not_regular_file/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("deterministic USTAR reader verifies and extracts the exact regular-file archive", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "deterministic-ustar-read-"));
  const payload = join(temporary, "payload");
  const archive = join(temporary, "payload.tar");
  const extracted = join(temporary, "extracted");
  try {
    await mkdir(join(payload, "nested"), { recursive: true });
    await writeFile(join(payload, "alpha.txt"), "alpha\n");
    await chmod(join(payload, "alpha.txt"), 0o444);
    await writeFile(
      join(payload, "nested", "run.js"),
      "module.exports=1;\n",
    );
    await chmod(join(payload, "nested", "run.js"), 0o555);
    await writeDeterministicUstar({
      archivePath: archive,
      entries: ["nested/run.js", "alpha.txt"],
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });

    const parsed = await readDeterministicUstar({
      archivePath: archive,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    assert.equal(parsed.entryCount, 2);
    assert.deepEqual(parsed.entries.map((entry) => entry.entry), [
      "alpha.txt",
      "nested/run.js",
    ]);
    assert.deepEqual(parsed.entries.map((entry) => entry.mode), [
      0o444,
      0o555,
    ]);

    await extractDeterministicUstar({
      archivePath: archive,
      destination: extracted,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    assert.equal(
      await readFile(join(extracted, "alpha.txt"), "utf8"),
      "alpha\n",
    );
    assert.equal(
      await readFile(join(extracted, "nested", "run.js"), "utf8"),
      "module.exports=1;\n",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("deterministic USTAR reader fails closed on header, padding and trailer tampering", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "deterministic-ustar-tamper-"));
  const payload = join(temporary, "payload");
  const archive = join(temporary, "payload.tar");
  try {
    await mkdir(payload);
    await writeFile(join(payload, "payload.txt"), "trusted\n");
    await writeDeterministicUstar({
      archivePath: archive,
      entries: ["payload.txt"],
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    const original = await readFile(archive);

    const headerTampered = Buffer.from(original);
    headerTampered[100] = 0x37;
    const headerPath = join(temporary, "header-tampered.tar");
    await writeFile(headerPath, headerTampered);
    await assert.rejects(
      () => readDeterministicUstar({ archivePath: headerPath }),
      /deterministic_ustar_checksum_mismatch/u,
    );

    const paddingTampered = Buffer.from(original);
    paddingTampered[512 + Buffer.byteLength("trusted\n")] = 1;
    const paddingPath = join(temporary, "padding-tampered.tar");
    await writeFile(paddingPath, paddingTampered);
    await assert.rejects(
      () => readDeterministicUstar({ archivePath: paddingPath }),
      /deterministic_ustar_padding_invalid/u,
    );

    const trailerTampered = Buffer.concat([original, Buffer.alloc(512)]);
    const trailerPath = join(temporary, "trailer-tampered.tar");
    await writeFile(trailerPath, trailerTampered);
    await assert.rejects(
      () => readDeterministicUstar({ archivePath: trailerPath }),
      /deterministic_ustar_trailer_size_invalid/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
