import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CapturedCatalogPage } from "../modules/universe/adapters/forward-catalog-capture-adapter";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  buildM2ForwardInstrumentRawEvidence,
} from "./forward-instrument-capture";
import {
  createM2ForwardInstrumentEvidenceStore,
} from "./forward-instrument-evidence-store";

function capturedPage(body: Uint8Array): CapturedCatalogPage {
  const requestSequence = 0;
  const requestUrl = "https://fapi.binance.com/fapi/v1/exchangeInfo";
  return Object.freeze({
    bodyBytes: body.byteLength,
    bodyDigest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    providerId: "BINANCE_USDS_FUTURES",
    rawBody: body,
    receivedAt: "2026-07-20T17:00:00.000Z",
    requestId: stableContentHash({
      providerId: "BINANCE_USDS_FUTURES",
      requestSequence,
      requestUrl,
    }),
    requestSequence,
    requestUrl,
    status: 200,
  });
}

test("rejects any evidence root inside the repository boundary", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "forward-store-repo-"));
  try {
    await assert.rejects(
      createM2ForwardInstrumentEvidenceStore({
        repositoryRoot,
        root: join(repositoryRoot, "evidence"),
      }),
      /must be separate from the Git worktree/u,
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("stores exact raw bytes outside Git with restrictive permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-store-raw-"));
  try {
    const evidenceRoot = join(root, "evidence");
    const store = await createM2ForwardInstrumentEvidenceStore({
      repositoryRoot: process.cwd(),
      root: evidenceRoot,
    });
    const body = new TextEncoder().encode('{"rows":[1,2,3]}');
    const evidence = buildM2ForwardInstrumentRawEvidence(capturedPage(body));
    await store.putRaw(evidence, body);
    await store.verifyRaw(evidence);
    assert.deepEqual(
      Uint8Array.from(await readFile(join(store.root, evidence.storageKey))),
      body,
    );
    const mode = (await stat(join(store.root, evidence.storageKey))).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw and normalized artifact tampering both fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-store-tamper-"));
  try {
    const store = await createM2ForwardInstrumentEvidenceStore({
      repositoryRoot: process.cwd(),
      root: join(root, "evidence"),
    });
    const body = new TextEncoder().encode('{"rows":[1]}');
    const evidence = buildM2ForwardInstrumentRawEvidence(capturedPage(body));
    await store.putRaw(evidence, body);
    await writeFile(
      join(store.root, evidence.storageKey),
      new TextEncoder().encode('{"rows":[2]}'),
    );
    await assert.rejects(store.verifyRaw(evidence), /failed verification/u);

    const artifactDigest = `sha256:${"3".repeat(64)}`;
    const artifact = {
      snapshotDigest: artifactDigest,
      kind: "test-artifact",
      value: 1,
    };
    const reference = await store.putArtifact({
      artifact,
      artifactDigest,
      artifactKind: "SNAPSHOT",
    });
    await writeFile(
      join(store.root, reference.storageKey),
      `${JSON.stringify({ kind: "test-artifact", value: 2 })}\n`,
    );
    await assert.rejects(store.readArtifact(reference), /failed content verification/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("content-addressed reads reject symbolic-link substitution", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-store-symlink-"));
  try {
    const store = await createM2ForwardInstrumentEvidenceStore({
      repositoryRoot: process.cwd(),
      root: join(root, "evidence"),
    });
    const body = new TextEncoder().encode('{"rows":[1]}');
    const evidence = buildM2ForwardInstrumentRawEvidence(capturedPage(body));
    await store.putRaw(evidence, body);
    const target = join(store.root, evidence.storageKey);
    const substitute = join(root, "substitute.json");
    await writeFile(substitute, body);
    await rm(target);
    await symlink(substitute, target);
    await assert.rejects(
      store.verifyRaw(evidence),
      /must be a regular file/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("journal append compares the immutable head while holding its writer lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-store-journal-"));
  try {
    const store = await createM2ForwardInstrumentEvidenceStore({
      repositoryRoot: process.cwd(),
      root: join(root, "evidence"),
    });
    const firstDigest = `sha256:${"1".repeat(64)}`;
    const secondDigest = `sha256:${"2".repeat(64)}`;
    await store.appendJournalRecord({
      entrySequence: 0,
      previousEntryDigest: null,
      journalEntryDigest: firstDigest,
    }, null);
    assert.deepEqual(await store.readLastJournalRecord(), {
      entrySequence: 0,
      previousEntryDigest: null,
      journalEntryDigest: firstDigest,
    });
    await assert.rejects(
      store.appendJournalRecord({
        entrySequence: 1,
        previousEntryDigest: firstDigest,
        journalEntryDigest: secondDigest,
      }, null),
      /changed during this capture run/u,
    );
    await store.appendJournalRecord(
      {
        entrySequence: 1,
        previousEntryDigest: firstDigest,
        journalEntryDigest: secondDigest,
      },
      firstDigest,
    );
    assert.equal((await store.readJournalRecords()).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
