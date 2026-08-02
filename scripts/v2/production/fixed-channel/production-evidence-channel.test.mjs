import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  PRODUCTION_EVIDENCE_RECEIPT_SCHEMA,
  ProductionEvidenceError,
  evidenceObjectName,
  generateEvidenceRecipientKeyPair,
  openProductionEvidence,
  pruneProductionEvidenceOutbox,
  publishSealedEvidence,
  readSealedEvidenceFile,
  scheduleProductionEvidenceExpiry,
  sealProductionEvidence,
} from "./production-evidence-channel.mjs";

const execFileAsync = promisify(execFile);
const PAYLOAD_SCHEMA = "market-radar-test-production-result.v1";
const DISPATCH_ID = "market-radar-evidence-test-0001";
const NOW = new Date("2026-08-02T03:00:00.000Z");

function evidenceReason(reason) {
  return (error) => error instanceof ProductionEvidenceError && error.reason === reason;
}

function payloadFixture(dispatchId = DISPATCH_ID, overrides = {}) {
  return {
    dispatchId,
    generatedAt: NOW.toISOString(),
    productionChanged: false,
    schemaVersion: PAYLOAD_SCHEMA,
    status: "PASS_TEST_ONLY_SANITIZED_PRODUCTION_RESULT",
    ...overrides,
  };
}

async function readStableFileNoFollow(path, {
  maximumBytes = 16 * 1024,
  requiredMode,
} = {}) {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    assert.equal(before.isFile(), true);
    assert.ok(before.size > 0 && before.size <= maximumBytes);
    if (requiredMode !== undefined) {
      assert.equal(before.mode & 0o777, requiredMode);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    assert.equal(before.dev, after.dev);
    assert.equal(before.ino, after.ino);
    assert.equal(before.size, after.size);
    assert.equal(before.mtimeMs, after.mtimeMs);
    assert.equal(bytes.length, after.size);
    return bytes.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function createHostKey(root, name = "host-ed25519") {
  const keyPath = join(root, name);
  await execFileAsync("/usr/bin/ssh-keygen", [
    "-q",
    "-t", "ed25519",
    "-N", "",
    "-f", keyPath,
  ]);
  const publicKey = (await readFile(`${keyPath}.pub`, "utf8"))
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .join(" ");
  return { keyPath, publicKey };
}

async function createRecipient(root, name = "recipient") {
  const privateKeyPath = join(root, name, "private.pem");
  const publicKeyPath = join(root, name, "public.pem");
  await generateEvidenceRecipientKeyPair({ privateKeyPath, publicKeyPath });
  return {
    privateKey: await readStableFileNoFollow(privateKeyPath, { requiredMode: 0o600 }),
    privateKeyPath,
    publicKey: await readFile(publicKeyPath, "utf8"),
    publicKeyPath,
  };
}

async function sealFixture(root, {
  dispatchId = DISPATCH_ID,
  expiresAt = new Date(NOW.getTime() + 60 * 60_000).toISOString(),
  hostName = "host-ed25519",
  now = NOW,
  payload = payloadFixture(dispatchId),
  recipientName = "recipient",
} = {}) {
  const host = await createHostKey(root, hostName);
  const recipient = await createRecipient(root, recipientName);
  const sealed = await sealProductionEvidence({
    dispatchId,
    expectedSchemaVersion: PAYLOAD_SCHEMA,
    expiresAt,
    now,
    payload,
    recipientPublicKey: recipient.publicKey,
    signerOptions: {
      keyPath: host.keyPath,
      sshKeygenPath: "/usr/bin/ssh-keygen",
      useSudo: false,
    },
  });
  return { host, recipient, sealed };
}

test("evidence recipient key generation is X25519, no-clobber and outside the worktree", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-key-"));
  try {
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    const result = await generateEvidenceRecipientKeyPair({ privateKeyPath, publicKeyPath });
    assert.equal(result.status, "PASS_PRODUCTION_EVIDENCE_RECIPIENT_KEY_GENERATED");
    assert.match(result.publicKeySha256, /^[a-f0-9]{64}$/u);
    const originalPrivate = await readStableFileNoFollow(privateKeyPath, { requiredMode: 0o600 });
    assert.equal((await lstat(publicKeyPath)).mode & 0o777, 0o644);
    await assert.rejects(
      generateEvidenceRecipientKeyPair({ privateKeyPath, publicKeyPath }),
      evidenceReason("evidence_key_path_already_exists"),
    );
    assert.equal(
      await readStableFileNoFollow(privateKeyPath, { requiredMode: 0o600 }),
      originalPrivate,
    );
    await assert.rejects(
      generateEvidenceRecipientKeyPair({
        privateKeyPath: join(process.cwd(), ".tmp", "forbidden-evidence-private.pem"),
        publicKeyPath: join(root, "unused-public.pem"),
      }),
      evidenceReason("evidence_private_key_inside_worktree"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("signed encrypted evidence round-trips only for the exact recipient, host, dispatch and schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-roundtrip-"));
  try {
    const { host, recipient, sealed } = await sealFixture(root);
    const receipt = await openProductionEvidence({
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      now: new Date(NOW.getTime() + 1_000),
      recipientPrivateKey: recipient.privateKey,
      sealed,
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
    });
    assert.equal(receipt.schemaVersion, PRODUCTION_EVIDENCE_RECEIPT_SCHEMA);
    assert.equal(receipt.status, "PASS_PRODUCTION_EVIDENCE_DECRYPTED_AND_VERIFIED");
    assert.deepEqual(receipt.payload, payloadFixture());
    assert.match(receipt.payloadSha256, /^[a-f0-9]{64}$/u);
    assert.match(receipt.sealedSha256, /^[a-f0-9]{64}$/u);

    await assert.rejects(
      openProductionEvidence({
        dispatchId: `${DISPATCH_ID}-wrong`,
        expectedSchemaVersion: PAYLOAD_SCHEMA,
        now: new Date(NOW.getTime() + 1_000),
        recipientPrivateKey: recipient.privateKey,
        sealed,
        trustedSignerPublicKey: host.publicKey,
      }),
      evidenceReason("evidence_sealed_dispatch_mismatch"),
    );
    await assert.rejects(
      openProductionEvidence({
        dispatchId: DISPATCH_ID,
        expectedSchemaVersion: `${PAYLOAD_SCHEMA}.wrong`,
        now: new Date(NOW.getTime() + 1_000),
        recipientPrivateKey: recipient.privateKey,
        sealed,
        trustedSignerPublicKey: host.publicKey,
      }),
      evidenceReason("evidence_signed_statement_payload_schema_mismatch"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ciphertext, authenticated metadata, recipient and signer tampering fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-tamper-"));
  try {
    const { host, recipient, sealed } = await sealFixture(root);
    const otherRecipient = await createRecipient(root, "other-recipient");
    const otherHost = await createHostKey(root, "other-host");
    const open = (overrides = {}) => openProductionEvidence({
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      now: new Date(NOW.getTime() + 1_000),
      recipientPrivateKey: recipient.privateKey,
      sealed,
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
      ...overrides,
    });

    const first = sealed.ciphertext[0] === "A" ? "B" : "A";
    await assert.rejects(
      open({ sealed: { ...sealed, ciphertext: `${first}${sealed.ciphertext.slice(1)}` } }),
      evidenceReason("evidence_decryption_or_authentication_failed"),
    );
    await assert.rejects(
      open({
        sealed: {
          ...sealed,
          expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
        },
      }),
      evidenceReason("evidence_decryption_or_authentication_failed"),
    );
    await assert.rejects(
      open({ recipientPrivateKey: otherRecipient.privateKey }),
      evidenceReason("evidence_recipient_key_mismatch"),
    );
    await assert.rejects(
      open({ trustedSignerPublicKey: otherHost.publicKey }),
      evidenceReason("evidence_signer_public_key_mismatch"),
    );
    await assert.rejects(
      open({ now: new Date(NOW.getTime() + 2 * 60 * 60_000) }),
      evidenceReason("evidence_sealed_not_current"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("payload safety rejects credential-shaped keys, credential values and non-finite numbers", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-safety-"));
  try {
    const host = await createHostKey(root);
    const recipient = await createRecipient(root);
    const seal = (payload) => sealProductionEvidence({
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      now: NOW,
      payload,
      recipientPublicKey: recipient.publicKey,
      signerOptions: {
        keyPath: host.keyPath,
        sshKeygenPath: "/usr/bin/ssh-keygen",
        useSudo: false,
      },
    });
    await assert.rejects(
      seal(payloadFixture(DISPATCH_ID, { api_token: "redacted" })),
      evidenceReason("evidence_payload_sensitive_or_invalid_key"),
    );
    await assert.rejects(
      seal(payloadFixture(DISPATCH_ID, { sessionToken: "redacted" })),
      evidenceReason("evidence_payload_sensitive_or_invalid_key"),
    );
    await assert.rejects(
      seal(payloadFixture(DISPATCH_ID, { detail: "TmpSecretKey=must-not-leak" })),
      evidenceReason("evidence_payload_sensitive_value"),
    );
    await assert.rejects(
      seal(payloadFixture(DISPATCH_ID, { detail: "Bearer abcdefghijklmnop" })),
      evidenceReason("evidence_payload_sensitive_value"),
    );
    await assert.rejects(
      seal(payloadFixture(DISPATCH_ID, { measurement: Number.POSITIVE_INFINITY })),
      evidenceReason("evidence_payload_number_invalid"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ciphertext publication is content-bounded, no-clobber and symlink-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-publish-"));
  try {
    const canonicalRoot = await realpath(root);
    const { sealed } = await sealFixture(root);
    const outbox = join(canonicalRoot, "outbox");
    const publication = await publishSealedEvidence({ outboxRoot: outbox, sealed });
    assert.equal(publication.objectName, evidenceObjectName(DISPATCH_ID));
    assert.equal(publication.status, "PASS_PRODUCTION_EVIDENCE_CIPHERTEXT_PUBLISHED");
    const objectPath = join(outbox, publication.objectName);
    assert.equal((await lstat(objectPath)).mode & 0o777, 0o644);
    assert.deepEqual(await readSealedEvidenceFile(objectPath), sealed);
    await assert.rejects(
      publishSealedEvidence({ outboxRoot: outbox, sealed }),
      evidenceReason("evidence_outbox_object_already_exists"),
    );

    const actual = join(canonicalRoot, "actual-outbox");
    const linked = join(canonicalRoot, "linked-outbox");
    await mkdir(actual);
    await chmod(root, 0o700);
    await symlink(actual, linked);
    await assert.rejects(
      publishSealedEvidence({ outboxRoot: linked, sealed }),
      evidenceReason("evidence_outbox_root_unsafe"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("outbox pruning validates the complete directory before deleting only expired ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-prune-"));
  try {
    const canonicalRoot = await realpath(root);
    const oldDispatch = "market-radar-evidence-old-0001";
    const freshDispatch = "market-radar-evidence-fresh-0001";
    const old = await sealFixture(root, {
      dispatchId: oldDispatch,
      expiresAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
      hostName: "old-host",
      payload: payloadFixture(oldDispatch),
      recipientName: "old-recipient",
    });
    const fresh = await sealFixture(root, {
      dispatchId: freshDispatch,
      expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      hostName: "fresh-host",
      payload: payloadFixture(freshDispatch),
      recipientName: "fresh-recipient",
    });
    const outbox = join(canonicalRoot, "outbox");
    await publishSealedEvidence({ outboxRoot: outbox, sealed: old.sealed });
    await publishSealedEvidence({ outboxRoot: outbox, sealed: fresh.sealed });

    await writeFile(join(outbox, "unexpected.txt"), "do not delete around me\n", { mode: 0o600 });
    await assert.rejects(
      pruneProductionEvidenceOutbox({
        graceMs: 0,
        now: new Date(NOW.getTime() + 20 * 60_000),
        outboxRoot: outbox,
      }),
      evidenceReason("evidence_prune_unsafe_entry"),
    );
    assert.ok(await lstat(join(outbox, evidenceObjectName(oldDispatch))));
    await rm(join(outbox, "unexpected.txt"));

    const result = await pruneProductionEvidenceOutbox({
      graceMs: 0,
      now: new Date(NOW.getTime() + 20 * 60_000),
      outboxRoot: outbox,
    });
    assert.deepEqual(result.removed, [evidenceObjectName(oldDispatch)]);
    assert.deepEqual(result.retained, [evidenceObjectName(freshDispatch)]);
    await assert.rejects(lstat(join(outbox, evidenceObjectName(oldDispatch))), { code: "ENOENT" });
    assert.ok(await lstat(join(outbox, evidenceObjectName(freshDispatch))));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expiry scheduling binds one exact object to a hardened transient timer", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "production-evidence-expiry-")));
  try {
    const invocations = [];
    const result = await scheduleProductionEvidenceExpiry({
      dispatchId: DISPATCH_ID,
      expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      now: NOW,
      outboxRoot: join(root, "outbound"),
      scheduler: async (command, args) => invocations.push({ args, command }),
    });
    assert.equal(result.status, "PASS_PRODUCTION_EVIDENCE_EXPIRY_SCHEDULED");
    assert.equal(result.objectName, evidenceObjectName(DISPATCH_ID));
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].command, "/usr/bin/sudo");
    assert.deepEqual(invocations[0].args.slice(0, 3), [
      "-n", "--", "/usr/bin/systemd-run",
    ]);
    assert.ok(invocations[0].args.includes("--property=ProtectSystem=strict"));
    assert.ok(invocations[0].args.includes("--property=NoNewPrivileges=yes"));
    assert.deepEqual(invocations[0].args.slice(-4), [
      "/usr/bin/rm",
      "-f",
      "--",
      join(root, "outbound", evidenceObjectName(DISPATCH_ID)),
    ]);
    assert.equal(invocations[0].args.at(-1),
      join(root, "outbound", evidenceObjectName(DISPATCH_ID)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
