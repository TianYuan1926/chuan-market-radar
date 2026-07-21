import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDarwinArm64MachO,
  buildP0RAgeVaultAttestation,
  normalizeAgeIdentity,
  normalizeAgeRecipient,
  parseAgeKeygenOutput,
  provisionP0RAgeIdentityVault,
  validateP0RAgeVaultAttestation,
} from "./m1-production-storage-p0r-age-vault.mjs";

const SECRET_PREFIX = ["AGE", "SECRET", "KEY", "1"].join("-");
const IDENTITY = `${SECRET_PREFIX}${"Q".repeat(58)}\n`;
const RECIPIENT = `age1${"q".repeat(58)}\n`;
const OTHER_RECIPIENT = `age1${"p".repeat(58)}\n`;
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function attestation() {
  return buildP0RAgeVaultAttestation({
    archiveDigest: DIGEST_A,
    binaryDigest: DIGEST_B,
    generatedAt: "2026-07-21T15:30:00.000Z",
    identityDigest: `sha256:${"c".repeat(64)}`,
    keychainAccount: "market-radar-v2-p0r-recovery",
    keychainService: "com.chuan.market-radar.v2.p0r.age",
    recipient: RECIPIENT,
  });
}

test("normalizes exactly one X25519 identity and recipient", () => {
  assert.equal(normalizeAgeIdentity(`# local only\n${IDENTITY}`), IDENTITY);
  assert.equal(normalizeAgeRecipient(`# public\n${RECIPIENT}`), RECIPIENT);
  assert.throws(() => normalizeAgeIdentity(`${IDENTITY}${IDENTITY}`), /exactly one/u);
  assert.throws(() => normalizeAgeRecipient(`age1${"b".repeat(58)}\n`), /invalid/u);
});

test("parses official age-keygen style output without logging the secret", () => {
  const value = parseAgeKeygenOutput(
    `# created: 2026-07-21T15:30:00+08:00\n# public key: ${RECIPIENT.trim()}\n${IDENTITY}`,
    `Public key: ${RECIPIENT.trim()}\n`,
  );
  assert.deepEqual(value, { identity: IDENTITY, recipient: RECIPIENT });
  assert.throws(() => parseAgeKeygenOutput(`${IDENTITY}${IDENTITY}`, RECIPIENT), /exactly one private/u);
  assert.throws(() => parseAgeKeygenOutput(
    `# public key: ${RECIPIENT.trim()}\n${IDENTITY}`,
    `Public key: ${OTHER_RECIPIENT.trim()}\n`,
  ), /exactly one distinct public/u);
});

test("builds a secret-free, tamper-evident vault attestation", () => {
  const value = attestation();
  assert.deepEqual(validateP0RAgeVaultAttestation(value), value);
  assert.equal(value.containsPrivateKey, false);
  assert.equal(value.secretMaterialOutput, false);
  assert.equal(value.vault.provider, "MACOS_LOGIN_KEYCHAIN");
  assert.equal(JSON.stringify(value).includes(IDENTITY.trim()), false);

  const changed = structuredClone(value);
  changed.vault.durableCopyCount = 2;
  assert.throws(() => validateP0RAgeVaultAttestation(changed));
});

test("rejects non-arm64 Mach-O toolchain bytes", () => {
  const valid = Buffer.alloc(32);
  valid.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  valid.writeUInt32LE(0x0100000c, 4);
  assert.doesNotThrow(() => assertDarwinArm64MachO(valid));
  const wrongArchitecture = Buffer.from(valid);
  wrongArchitecture.writeUInt32LE(0x01000007, 4);
  assert.throws(() => assertDarwinArm64MachO(wrongArchitecture), /not arm64/u);
});

test("provisions once, verifies readback, and writes only public evidence", async () => {
  const calls = [];
  let stored = null;
  let written = null;
  const value = await provisionP0RAgeIdentityVault({
    ageKeygenBinary: "/private/tmp/age-keygen",
    archiveDigest: DIGEST_A,
    attestationOutput: "/private/tmp/p0r/attestation.json",
    binaryDigest: DIGEST_B,
    generatedAt: "2026-07-21T15:30:00.000Z",
    keychainAccount: "market-radar-v2-p0r-recovery",
    keychainService: "com.chuan.market-radar.v2.p0r.age",
    recipientOutput: "/private/tmp/p0r/recipient.txt",
  }, {
    addKeychainItem: async (_account, _service, identity) => {
      calls.push("add");
      stored = Buffer.from(identity);
    },
    deleteKeychainItem: async () => calls.push("delete"),
    deriveRecipient: async (_binary, identity) => {
      assert.equal(normalizeAgeIdentity(identity.toString("utf8")), IDENTITY);
      calls.push("derive");
      return RECIPIENT;
    },
    generateIdentity: async () => ({ identity: IDENTITY, recipient: RECIPIENT }),
    keychainItemExists: async () => false,
    readKeychainItem: async () => Buffer.from(stored),
    writeProtectedPair: async (_recipientPath, _attestationPath, recipient, evidence) => {
      written = { evidence, recipient };
    },
  });
  assert.deepEqual(calls, ["derive", "add", "derive"]);
  assert.equal(written.recipient, RECIPIENT);
  assert.equal(written.evidence.attestationDigest, value.attestationDigest);
  assert.equal(JSON.stringify(written).includes(IDENTITY.trim()), false);
});

test("rolls back a newly created Keychain item when readback fails", async () => {
  const calls = [];
  await assert.rejects(() => provisionP0RAgeIdentityVault({
    ageKeygenBinary: "/private/tmp/age-keygen",
    archiveDigest: DIGEST_A,
    attestationOutput: "/private/tmp/p0r/attestation.json",
    binaryDigest: DIGEST_B,
    generatedAt: "2026-07-21T15:30:00.000Z",
    keychainAccount: "market-radar-v2-p0r-recovery",
    keychainService: "com.chuan.market-radar.v2.p0r.age",
    recipientOutput: "/private/tmp/p0r/recipient.txt",
  }, {
    addKeychainItem: async () => calls.push("add"),
    deleteKeychainItem: async () => calls.push("delete"),
    deriveRecipient: async () => RECIPIENT,
    generateIdentity: async () => ({ identity: IDENTITY, recipient: RECIPIENT }),
    keychainItemExists: async () => false,
    readKeychainItem: async () => Buffer.from(`${SECRET_PREFIX}${"P".repeat(58)}\n`),
    writeProtectedPair: async () => calls.push("write"),
  }), /readback changed/u);
  assert.deepEqual(calls, ["add", "delete"]);
});
