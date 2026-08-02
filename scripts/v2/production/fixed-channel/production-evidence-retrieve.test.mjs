import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  evidenceObjectName,
  generateEvidenceRecipientKeyPair,
  sealProductionEvidence,
} from "./production-evidence-channel.mjs";
import {
  PRODUCTION_EVIDENCE_BASE_URL,
  PRODUCTION_EVIDENCE_HOST_ED25519_FINGERPRINT,
  ProductionEvidenceRetrieveError,
  parseKnownHostsEd25519,
  persistProductionEvidenceRetrieval,
  retrieveProductionEvidence,
} from "./production-evidence-retrieve.mjs";
import { canonicalJson } from "./production-dispatch.mjs";

const execFileAsync = promisify(execFile);
const DISPATCH_ID = "market-radar-evidence-retrieve-test-0001";
const PAYLOAD_SCHEMA = "market-radar-test-production-result.v1";
const NOW = new Date("2026-08-02T05:00:00.000Z");

function retrieveReason(reason) {
  return (error) => error instanceof ProductionEvidenceRetrieveError
    && error.reason === reason;
}

async function createHostKey(root, name = "production-host") {
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
  const { stdout: fingerprintOutput } = await execFileAsync("/usr/bin/ssh-keygen", [
    "-lf", `${keyPath}.pub`, "-E", "sha256",
  ]);
  const fingerprint = fingerprintOutput.trim().split(/\s+/u)[1];
  return { fingerprint, keyPath, publicKey };
}

async function createRecipient(root) {
  const privateKeyPath = join(root, "recipient-private.pem");
  const publicKeyPath = join(root, "recipient-public.pem");
  await generateEvidenceRecipientKeyPair({ privateKeyPath, publicKeyPath });
  return {
    privateKey: await readFile(privateKeyPath, "utf8"),
    publicKey: await readFile(publicKeyPath, "utf8"),
  };
}

async function fixture(root) {
  const host = await createHostKey(root);
  const recipient = await createRecipient(root);
  const payload = {
    dispatchId: DISPATCH_ID,
    generatedAt: NOW.toISOString(),
    productionChanged: false,
    schemaVersion: PAYLOAD_SCHEMA,
    status: "PASS_TEST_ONLY_SANITIZED_PRODUCTION_RESULT",
  };
  const sealed = await sealProductionEvidence({
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
  return { host, payload, recipient, sealed };
}

test("known_hosts extraction accepts one exact Ed25519 identity and rejects drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-host-"));
  try {
    const first = await createHostKey(root, "first-host");
    const second = await createHostKey(root, "second-host");
    const encoded = first.publicKey.split(" ")[1];
    const raw = `# Host 43.161.202.227 found: line 1\n43.161.202.227 ssh-ed25519 ${encoded}\n`;
    assert.equal(
      parseKnownHostsEd25519(raw, { expectedFingerprint: first.fingerprint }),
      first.publicKey,
    );
    await assert.rejects(
      async () => parseKnownHostsEd25519(raw, { expectedFingerprint: second.fingerprint }),
      retrieveReason("evidence_retrieve_host_key_fingerprint_mismatch"),
    );
    const secondEncoded = second.publicKey.split(" ")[1];
    await assert.rejects(
      async () => parseKnownHostsEd25519(
        `${raw}43.161.202.227 ssh-ed25519 ${secondEncoded}\n`,
        { expectedFingerprint: first.fingerprint },
      ),
      retrieveReason("evidence_retrieve_host_key_not_unique"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retrieval polls only 404, then decrypts and verifies the exact signed ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-retrieve-"));
  try {
    const { host, payload, recipient, sealed } = await fixture(root);
    const responses = [
      { body: Buffer.alloc(0), statusCode: 404 },
      { body: Buffer.from(canonicalJson(sealed)), statusCode: 200 },
    ];
    const times = [
      NOW,
      new Date(NOW.getTime() + 1_000),
      new Date(NOW.getTime() + 2_000),
    ];
    const requestedUrls = [];
    let sleeps = 0;
    const retrieval = await retrieveProductionEvidence({
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      fetcher: async (url) => {
        requestedUrls.push(url);
        return responses.shift();
      },
      now: () => times.shift(),
      pollMs: 100,
      recipientPrivateKey: recipient.privateKey,
      sleeper: async () => { sleeps += 1; },
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
      waitMs: 5_000,
    });
    assert.equal(retrieval.attempts, 2);
    assert.equal(sleeps, 1);
    assert.deepEqual(retrieval.receipt.payload, payload);
    assert.equal(retrieval.objectName, evidenceObjectName(DISPATCH_ID));
    assert.deepEqual(requestedUrls, [retrieval.url, retrieval.url]);
    assert.equal(
      retrieval.url,
      `${PRODUCTION_EVIDENCE_BASE_URL}/${evidenceObjectName(DISPATCH_ID)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retrieval fails closed on unexpected HTTP status and non-canonical evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "production-evidence-reject-"));
  try {
    const { host, recipient, sealed } = await fixture(root);
    const common = {
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      now: () => NOW,
      pollMs: 100,
      recipientPrivateKey: recipient.privateKey,
      sleeper: async () => {},
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
      waitMs: 0,
    };
    await assert.rejects(
      retrieveProductionEvidence({
        ...common,
        fetcher: async () => ({ body: Buffer.from("denied"), statusCode: 403 }),
      }),
      retrieveReason("evidence_retrieve_http_status_rejected"),
    );
    await assert.rejects(
      retrieveProductionEvidence({
        ...common,
        fetcher: async () => ({
          body: Buffer.from(`${JSON.stringify(sealed, null, 2)}\n`),
          statusCode: 200,
        }),
      }),
      retrieveReason("evidence_retrieve_body_not_canonical"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verified evidence persistence is private, atomic and no-clobber", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "production-evidence-persist-")));
  try {
    const { host, recipient, sealed } = await fixture(root);
    const retrieval = await retrieveProductionEvidence({
      dispatchId: DISPATCH_ID,
      expectedSchemaVersion: PAYLOAD_SCHEMA,
      fetcher: async () => ({ body: Buffer.from(canonicalJson(sealed)), statusCode: 200 }),
      now: (() => {
        const times = [NOW, new Date(NOW.getTime() + 1_000)];
        return () => times.shift();
      })(),
      pollMs: 100,
      recipientPrivateKey: recipient.privateKey,
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
      waitMs: 0,
    });
    const outputRoot = join(root, "output");
    const persisted = await persistProductionEvidenceRetrieval({
      dispatchId: DISPATCH_ID,
      outputRoot,
      retrieval,
    });
    for (const path of Object.values(persisted.paths)) {
      assert.equal((await lstat(path)).mode & 0o777, 0o600);
    }
    assert.deepEqual(
      JSON.parse(await readFile(persisted.paths.payload, "utf8")),
      retrieval.receipt.payload,
    );
    await assert.rejects(
      persistProductionEvidenceRetrieval({
        dispatchId: DISPATCH_ID,
        outputRoot,
        retrieval,
      }),
      retrieveReason("evidence_retrieve_output_already_exists"),
    );
    assert.deepEqual(
      (await readdir(outputRoot)).sort(),
      Object.values(persisted.paths).map((path) => path.split("/").at(-1)).sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixed production route and host fingerprint cannot silently drift", async () => {
  const source = await readFile(
    new URL("./production-evidence-retrieve.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(PRODUCTION_EVIDENCE_HOST_ED25519_FINGERPRINT,
    "SHA256:wxHx/NcT7wmgM6aOJnjgYKK4gOQGGeN44XkHYARbpbc");
  assert.match(source, /--max-redirs", "0"/u);
  assert.match(source, /--socks5-hostname/u);
  assert.doesNotMatch(source, /--location/u);
  assert.doesNotMatch(source, /https?:\/\/[^"\n]*paste/iu);
});
