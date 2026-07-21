#!/usr/bin/env node

import assert from "node:assert/strict";
import { link, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stableDigest } from "./m1-production-storage-read-only-preflight.mjs";

export const P0R_DATABASE_FINGERPRINT_SCHEMA_VERSION =
  "v2-m1-production-storage-database-fingerprint.v1";

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const USER_NAMESPACE_FILTER = `n.nspname <> 'information_schema'
  AND n.nspname !~ '^pg_(catalog|toast|temp_)'`;
const NOT_EXTENSION_OWNED_CLASS = `NOT EXISTS (
  SELECT 1
  FROM pg_depend dependency
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = c.oid
    AND dependency.deptype = 'e'
)`;
const NOT_EXTENSION_OWNED_ROUTINE = `NOT EXISTS (
  SELECT 1
  FROM pg_depend dependency
  WHERE dependency.classid = 'pg_proc'::regclass
    AND dependency.objid = p.oid
    AND dependency.deptype = 'e'
)`;
const NOT_EXTENSION_OWNED_TYPE = `NOT EXISTS (
  SELECT 1
  FROM pg_depend dependency
  WHERE dependency.classid = 'pg_type'::regclass
    AND dependency.objid = t.oid
    AND dependency.deptype = 'e'
)`;

export const P0R_FINGERPRINT_SQL = Object.freeze({
  columns: `/* p0r:columns */
    SELECT n.nspname AS schema_name,
      c.relname AS relation_name,
      a.attnum::int AS ordinal,
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      a.attidentity AS identity_kind,
      a.attgenerated AS generated_kind,
      COALESCE(pg_get_expr(d.adbin, d.adrelid, true), '') AS default_expression
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE ${USER_NAMESPACE_FILTER}
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND ${NOT_EXTENSION_OWNED_CLASS}
    ORDER BY n.nspname, c.relname, a.attnum`,
  constraints: `/* p0r:constraints */
    SELECT n.nspname AS schema_name,
      c.relname AS relation_name,
      constraint_entry.conname AS constraint_name,
      constraint_entry.contype AS constraint_type,
      constraint_entry.condeferrable AS deferrable,
      constraint_entry.condeferred AS initially_deferred,
      constraint_entry.convalidated AS validated,
      pg_get_constraintdef(constraint_entry.oid, true) AS definition
    FROM pg_constraint constraint_entry
    JOIN pg_class c ON c.oid = constraint_entry.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND ${NOT_EXTENSION_OWNED_CLASS}
    ORDER BY n.nspname, c.relname, constraint_entry.conname`,
  extensions: `/* p0r:extensions */
    SELECT extension_entry.extname AS extension_name,
      extension_entry.extversion AS extension_version,
      n.nspname AS schema_name
    FROM pg_extension extension_entry
    JOIN pg_namespace n ON n.oid = extension_entry.extnamespace
    ORDER BY extension_entry.extname`,
  indexes: `/* p0r:indexes */
    SELECT n.nspname AS schema_name,
      table_entry.relname AS relation_name,
      index_entry.relname AS index_name,
      relation_index.indisunique AS is_unique,
      relation_index.indisprimary AS is_primary,
      relation_index.indisexclusion AS is_exclusion,
      relation_index.indisvalid AS is_valid,
      relation_index.indisready AS is_ready,
      pg_get_indexdef(index_entry.oid) AS definition
    FROM pg_index relation_index
    JOIN pg_class table_entry ON table_entry.oid = relation_index.indrelid
    JOIN pg_class index_entry ON index_entry.oid = relation_index.indexrelid
    JOIN pg_namespace n ON n.oid = table_entry.relnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = index_entry.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY n.nspname, table_entry.relname, index_entry.relname`,
  largeObjects: `/* p0r:large-objects */
    SELECT count(*)::text AS count FROM pg_largeobject_metadata`,
  policies: `/* p0r:policies */
    SELECT schemaname AS schema_name,
      tablename AS relation_name,
      policyname AS policy_name,
      permissive,
      roles::text AS roles,
      cmd,
      COALESCE(qual, '') AS using_expression,
      COALESCE(with_check, '') AS check_expression
    FROM pg_policies
    WHERE schemaname <> 'information_schema'
      AND schemaname !~ '^pg_(catalog|toast|temp_)'
    ORDER BY schemaname, tablename, policyname`,
  relations: `/* p0r:relations */
    SELECT n.nspname AS schema_name,
      c.relname AS object_name,
      c.relkind AS object_kind,
      c.relpersistence AS persistence,
      c.relrowsecurity AS row_security,
      c.relforcerowsecurity AS force_row_security,
      COALESCE(pg_get_expr(c.relpartbound, c.oid, true), '') AS partition_bound,
      CASE
        WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true)
        ELSE ''
      END AS view_definition
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND ${NOT_EXTENSION_OWNED_CLASS}
    ORDER BY n.nspname, c.relname, c.relkind`,
  routines: `/* p0r:routines */
    SELECT n.nspname AS schema_name,
      p.proname AS routine_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result_type,
      p.prokind AS routine_kind,
      p.provolatile AS volatility,
      p.proisstrict AS strict,
      p.prosecdef AS security_definer,
      p.proparallel AS parallel_safety,
      language_entry.lanname AS language_name,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language language_entry ON language_entry.oid = p.prolang
    WHERE ${USER_NAMESPACE_FILTER}
      AND ${NOT_EXTENSION_OWNED_ROUTINE}
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)`,
  schemas: `/* p0r:schemas */
    SELECT n.nspname AS schema_name
    FROM pg_namespace n
    WHERE ${USER_NAMESPACE_FILTER}
    ORDER BY n.nspname`,
  server: `/* p0r:server */
    SELECT current_database() AS database_name,
      COALESCE(inet_server_addr()::text, 'local-socket') AS server_address,
      COALESCE(inet_server_port(), 0)::int AS server_port,
      current_setting('server_version_num')::int AS server_version_num,
      current_setting('transaction_isolation') AS transaction_isolation,
      current_setting('transaction_read_only') AS transaction_read_only,
      txid_current_if_assigned() IS NULL AS transaction_id_unassigned,
      clock_timestamp() AS captured_at`,
  tableTargets: `/* p0r:table-targets */
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND c.relkind IN ('r', 'p', 'm')
      AND ${NOT_EXTENSION_OWNED_CLASS}
    ORDER BY n.nspname, c.relname`,
  triggers: `/* p0r:triggers */
    SELECT n.nspname AS schema_name,
      c.relname AS relation_name,
      trigger_entry.tgname AS trigger_name,
      trigger_entry.tgenabled AS enabled_mode,
      pg_get_triggerdef(trigger_entry.oid, true) AS definition
    FROM pg_trigger trigger_entry
    JOIN pg_class c ON c.oid = trigger_entry.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND NOT trigger_entry.tgisinternal
      AND ${NOT_EXTENSION_OWNED_CLASS}
    ORDER BY n.nspname, c.relname, trigger_entry.tgname`,
  types: `/* p0r:types */
    SELECT n.nspname AS schema_name,
      t.typname AS type_name,
      t.typtype AS type_kind,
      pg_catalog.format_type(t.oid, NULL) AS formatted_type
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE ${USER_NAMESPACE_FILTER}
      AND t.typtype IN ('e', 'd', 'c', 'r', 'm')
      AND ${NOT_EXTENSION_OWNED_TYPE}
    ORDER BY n.nspname, t.typname`,
});

function exactKeys(value, expected, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields must be exact`);
}

export function quoteIdentifier(value) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0 && value.length <= 63, "database identifier length is invalid");
  assert.equal(value.includes("\0"), false, "database identifier contains NUL");
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ));
}

async function rows(client, sql) {
  const result = await client.query(sql);
  assert.ok(Array.isArray(result.rows), "database result rows are invalid");
  return normalizeRows(result.rows);
}

async function one(client, sql, label) {
  const values = await rows(client, sql);
  assert.equal(values.length, 1, `${label} must return exactly one row`);
  return values[0];
}

export async function collectP0RDatabaseFingerprint(client) {
  assert.equal(typeof client?.query, "function", "database client is invalid");
  const server = await one(client, P0R_FINGERPRINT_SQL.server, "server identity");
  assert.equal(server.transaction_isolation, "repeatable read", "fingerprint transaction isolation drift");
  assert.equal(server.transaction_read_only, "on", "fingerprint transaction is not read-only");
  assert.equal(server.transaction_id_unassigned, true, "fingerprint transaction assigned an ID");
  const serverVersionNum = Number(server.server_version_num);
  assert.ok(serverVersionNum >= 160000 && serverVersionNum < 170000, "fingerprint requires PostgreSQL 16");
  assert.match(new Date(server.captured_at).toISOString(), ISO_PATTERN);

  const structuralInventory = {};
  for (const name of [
    "schemas",
    "extensions",
    "types",
    "relations",
    "columns",
    "constraints",
    "indexes",
    "triggers",
    "routines",
    "policies",
  ]) {
    structuralInventory[name] = await rows(client, P0R_FINGERPRINT_SQL[name]);
  }

  const targets = await rows(client, P0R_FINGERPRINT_SQL.tableTargets);
  const tableCounts = [];
  for (const target of targets) {
    assert.equal(typeof target.schema_name, "string");
    assert.equal(typeof target.relation_name, "string");
    const qualified = `${quoteIdentifier(target.schema_name)}.${quoteIdentifier(target.relation_name)}`;
    const count = await one(
      client,
      `/* p0r:row-count */ SELECT count(*)::text AS count FROM ${qualified}`,
      `row count ${qualified}`,
    );
    assert.match(count.count, /^(0|[1-9][0-9]*)$/u, "row count is invalid");
    tableCounts.push({
      count: count.count,
      relationName: target.relation_name,
      schemaName: target.schema_name,
    });
  }
  const largeObjects = await one(client, P0R_FINGERPRINT_SQL.largeObjects, "large object count");
  assert.match(largeObjects.count, /^(0|[1-9][0-9]*)$/u, "large object count is invalid");

  return Object.freeze({
    capturedAt: new Date(server.captured_at).toISOString(),
    databaseIdentityDigest: stableDigest({
      databaseName: server.database_name,
      serverAddress: server.server_address,
      serverPort: Number(server.server_port),
      serverVersionNum,
    }),
    postgresMajor: 16,
    schemaVersion: P0R_DATABASE_FINGERPRINT_SCHEMA_VERSION,
    structuralDigest: stableDigest(structuralInventory),
    transactionIdUnassigned: true,
    transactionIsolation: "REPEATABLE_READ_READ_ONLY",
    verificationDigest: stableDigest({
      largeObjectCount: largeObjects.count,
      tableCounts,
    }),
  });
}

async function readSecureConnection(path) {
  const target = resolve(path);
  assert.equal(target, path, "database connection path must be absolute");
  const facts = await lstat(target);
  assert.equal(facts.isSymbolicLink(), false, "database connection must not be a symlink");
  assert.equal(facts.isFile(), true, "database connection must be a regular file");
  assert.equal(facts.mode & 0o077, 0, "database connection permissions are too open");
  assert.ok(facts.size > 0 && facts.size <= 8 * 1024, "database connection size is invalid");
  const value = (await readFile(target, "utf8")).trim();
  assert.equal(value.includes("\n"), false, "database connection must be one line");
  const parsed = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(parsed.username && parsed.password && parsed.pathname.length > 1);
  return value;
}

async function loadPgClient() {
  const imported = await import("pg");
  const Client = imported.Client ?? imported.default?.Client;
  assert.equal(typeof Client, "function", "pg Client runtime is unavailable");
  return Client;
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  assert.equal(target, path, "output path must be absolute");
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await link(temporary, target);
    await rm(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const [command = "", ...rest] = argv;
  assert.equal(command, "capture", "command must be capture");
  assert.equal(rest.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    assert.match(rest[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = rest[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${rest[index]}`);
    options[name] = rest[index + 1];
  }
  exactKeys(options, ["database-connection-file", "output", "source-commit"], "options");
  assert.match(options["source-commit"], COMMIT_PATTERN, "source commit is invalid");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const connectionString = await readSecureConnection(options["database-connection-file"]);
  const Client = await loadPgClient();
  const client = new Client({
    application_name: "market-radar-v2-m1-p0r-isolated-restore-fingerprint",
    connectionString,
  });
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15min'");
    const fingerprint = await collectP0RDatabaseFingerprint(client);
    await client.query("ROLLBACK");
    transactionOpen = false;
    await writeAtomic(options.output, {
      ...fingerprint,
      sourceCommit: options["source-commit"],
    });
    process.stdout.write(`${JSON.stringify({
      businessRowsOutput: false,
      databaseIdentityDigest: fingerprint.databaseIdentityDigest,
      status: "PASS_DATABASE_FINGERPRINT",
      structuralDigest: fingerprint.structuralDigest,
      verificationDigest: fingerprint.verificationDigest,
    })}\n`);
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
