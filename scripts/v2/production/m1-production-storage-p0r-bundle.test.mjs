import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  assertLinuxAMD64ELF,
  buildP0RTransportBundle,
  P0R_AGE_LINUX_AMD64_ARCHIVE_SHA256,
  P0R_AGE_LINUX_AMD64_ARCHIVE_URL,
  P0R_BUNDLE_SCHEMA_VERSION,
} from "./m1-production-storage-p0r-bundle.mjs";

const execFileAsync = promisify(execFile);

function fakeELF(fill) {
  const bytes = Buffer.alloc(128, fill);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
  bytes.writeUInt16LE(62, 18);
  return bytes;
}

async function build(directory, name) {
  return buildP0RTransportBundle({
    ageBinary: fakeELF(1),
    ageLicense: Buffer.from("BSD 3-Clause test fixture\n"),
    ageProvenance: {
      archiveDigest: "test-only",
      sourceUrl: "test-only",
      version: "test-only",
    },
    ageRecipient: `age1${"q".repeat(58)}\n`,
    approvalEligible: false,
    cosArchiveBinary: fakeELF(2),
    output: join(directory, name),
    root: process.cwd(),
    sourceCommit: null,
  });
}

test("builds a byte-reproducible, secret-free local template", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-bundle-test-"));
  try {
    const first = await build(directory, "first.tar.gz");
    const second = await build(directory, "second.tar.gz");
    assert.equal(first.bundleSha256, second.bundleSha256);
    assert.deepEqual(await readFile(first.output), await readFile(second.output));
    assert.equal(first.schemaVersion, P0R_BUNDLE_SCHEMA_VERSION);
    assert.equal(first.approvalEligible, false);
    assert.equal(first.containsSecrets, false);
    const { stdout } = await execFileAsync("tar", ["-tzf", first.output], { encoding: "utf8" });
    for (const expected of [
      "age",
      "AGE-LICENSE",
      "age-recipient.txt",
      "p0r-cos-archive",
      "p0r-bindings.env",
      "transport-manifest.json",
      "m1-production-storage-p0r-runner.sh",
    ]) assert.ok(stdout.split("\n").includes(expected), `missing ${expected}`);
    assert.doesNotMatch(stdout, /identity|credentials|\.env\.production|private-key/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("approval package requires exact official age provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-bundle-approval-"));
  await assert.rejects(() => buildP0RTransportBundle({
    ageBinary: fakeELF(1),
    ageLicense: Buffer.from("license"),
    ageProvenance: {
      archiveDigest: "wrong",
      sourceUrl: P0R_AGE_LINUX_AMD64_ARCHIVE_URL,
      version: "v1.3.1",
    },
    ageRecipient: `age1${"q".repeat(58)}\n`,
    approvalEligible: true,
    cosArchiveBinary: fakeELF(2),
    output: join(directory, "invalid.tar.gz"),
    root: process.cwd(),
    sourceCommit: "a".repeat(40),
  }), /official age archive/u);
  assert.match(P0R_AGE_LINUX_AMD64_ARCHIVE_SHA256, /^[0-9a-f]{64}$/u);
});

test("rejects non-linux-amd64 executable substitution", () => {
  const wrong = fakeELF(3);
  wrong.writeUInt16LE(183, 18);
  assert.throws(() => assertLinuxAMD64ELF(wrong), /linux\/amd64/u);
  assert.throws(() => assertLinuxAMD64ELF(Buffer.from("not-elf")));
});
