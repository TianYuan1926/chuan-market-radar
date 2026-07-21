import assert from "node:assert/strict";
import test from "node:test";
import {
  collectP0RDatabaseFingerprint,
  P0R_DATABASE_FINGERPRINT_SCHEMA_VERSION,
  quoteIdentifier,
} from "./m1-production-storage-database-fingerprint.mjs";

function fakeClient(overrides = {}) {
  const rowsByMarker = {
    columns: [{ schema_name: "public", relation_name: "events", ordinal: 1 }],
    constraints: [{ constraint_name: "events_pkey", validated: true }],
    extensions: [{ extension_name: "plpgsql", extension_version: "1.0", schema_name: "pg_catalog" }],
    indexes: [{ index_name: "events_pkey", is_valid: true, is_ready: true }],
    "large-objects": [{ count: "0" }],
    policies: [],
    relations: [{ schema_name: "public", object_name: "events", object_kind: "r" }],
    routines: [],
    schemas: [{ schema_name: "public" }],
    server: [{
      captured_at: new Date("2026-07-21T12:00:00.000Z"),
      database_name: "market_radar",
      server_address: "local-socket",
      server_port: 0,
      server_version_num: 160009,
      transaction_id_unassigned: true,
      transaction_isolation: "repeatable read",
      transaction_read_only: "on",
    }],
    "table-targets": [{ relation_name: "events", schema_name: "public" }],
    triggers: [],
    types: [],
    ...overrides,
  };
  return {
    async query(sql) {
      if (sql.includes("p0r:row-count")) return { rows: [{ count: "42" }] };
      const marker = /\/\* p0r:([a-z-]+) \*\//u.exec(sql)?.[1];
      assert.ok(marker, `missing SQL marker in ${sql}`);
      assert.ok(Object.hasOwn(rowsByMarker, marker), `unknown SQL marker ${marker}`);
      return { rows: structuredClone(rowsByMarker[marker]) };
    },
  };
}

test("builds deterministic, business-row-free structural and verification digests", async () => {
  const first = await collectP0RDatabaseFingerprint(fakeClient());
  const second = await collectP0RDatabaseFingerprint(fakeClient());
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, P0R_DATABASE_FINGERPRINT_SCHEMA_VERSION);
  assert.match(first.databaseIdentityDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(first.structuralDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(first.verificationDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(first).includes("42"), false);
  assert.equal(first.transactionIdUnassigned, true);
});

test("verification digest changes when a table row count changes", async () => {
  const baseline = await collectP0RDatabaseFingerprint(fakeClient());
  const changedClient = fakeClient();
  const original = changedClient.query;
  changedClient.query = async (sql) => sql.includes("p0r:row-count")
    ? { rows: [{ count: "43" }] }
    : original(sql);
  const changed = await collectP0RDatabaseFingerprint(changedClient);
  assert.notEqual(changed.verificationDigest, baseline.verificationDigest);
  assert.equal(changed.structuralDigest, baseline.structuralDigest);
});

test("fails closed outside read-only repeatable-read PostgreSQL 16", async () => {
  for (const server of [
    { transaction_read_only: "off" },
    { transaction_isolation: "read committed" },
    { transaction_id_unassigned: false },
    { server_version_num: 170000 },
  ]) {
    const baseline = fakeClient().query;
    const client = {
      async query(sql) {
        const result = await baseline(sql);
        if (sql.includes("p0r:server")) Object.assign(result.rows[0], server);
        return result;
      },
    };
    await assert.rejects(() => collectP0RDatabaseFingerprint(client));
  }
});

test("quotes arbitrary PostgreSQL identifiers without SQL interpolation escape", () => {
  assert.equal(quoteIdentifier("normal_name"), '"normal_name"');
  assert.equal(quoteIdentifier('odd"name'), '"odd""name"');
  assert.throws(() => quoteIdentifier(""));
  assert.throws(() => quoteIdentifier("bad\0name"));
});
