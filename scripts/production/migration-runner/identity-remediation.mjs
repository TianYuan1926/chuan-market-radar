#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "./pg-client.mjs";
import {
  APPLICATION_RUNTIME_ROLE,
  MIGRATION_LOGIN_ROLE,
  MIGRATION_OWNER_ROLE,
  RunnerPolicyError,
  assertOutsideProductionWorktree,
  assertSecureFile,
  hashIdentity,
  redact,
  sha256,
  validateIdentityConfirmation,
  validateIdentityRequest,
  validateRoleIdentity,
} from "./runner-core.mjs";

const expectedPublicTables = Object.freeze([
  "daily_mover_assets",
  "daily_mover_snapshots",
  "frontend_ui_states",
  "journal_events",
  "macro_market_snapshots",
  "mover_attribution_reviews",
  "ohlcv_candle_cache",
  "radar_miss_reviews",
  "rank_profiles",
  "scan_archives",
  "scan_asset_states",
  "v3_forward_map_snapshots",
]);

const mutatingCommands = new Set([
  "bootstrap",
  "render-runtime-env",
  "rotate-break-glass",
]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      throw new RunnerPolicyError("argument_invalid");
    }
    const key = value.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

function replaceEnv(text, replacements, removals = []) {
  const seen = new Set();
  const removalSet = new Set(removals);
  const output = [];

  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }
    const key = match[1];
    if (removalSet.has(key)) {
      continue;
    }
    if (replacements.has(key)) {
      output.push(`${key}=${replacements.get(key)}`);
      seen.add(key);
    } else {
      output.push(line);
    }
  }

  for (const [key, value] of replacements) {
    if (!seen.has(key)) {
      output.push(`${key}=${value}`);
    }
  }

  return `${output.filter((line, index, lines) => line || index < lines.length - 1).join("\n")}\n`;
}

function safeIdentifier(value, reason = "identifier_invalid") {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new RunnerPolicyError(reason);
  }
  return `"${value}"`;
}

async function writeSecret(filePath, value) {
  await writeFile(filePath, value, { mode: 0o600 });
  await assertSecureFile(filePath);
}

async function writeJson(filePath, value) {
  const temporary = `${filePath}.tmp-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(redact(value), null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

async function readRequest(filePath) {
  return validateIdentityRequest(JSON.parse(await readFile(filePath, "utf8")));
}

async function readConnection(filePath) {
  await assertSecureFile(filePath);
  const value = (await readFile(filePath, "utf8")).trim();
  if (!value) {
    throw new RunnerPolicyError("connection_file_empty");
  }
  return value;
}

async function withClient(connectionFile, applicationName, operation) {
  const connectionString = await readConnection(connectionFile);
  const client = new pg.Client({ application_name: applicationName, connectionString });
  try {
    await client.connect();
    return await operation(client, new URL(connectionString));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function roleRow(client, roleName) {
  const result = await client.query(
    `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
      rolreplication, rolbypassrls, rolinherit
     FROM pg_roles WHERE rolname = $1`,
    [roleName],
  );
  return result.rows[0] ?? null;
}

function redactedRole(row) {
  return row
    ? {
        roleHash: hashIdentity(row.rolname),
        rolbypassrls: row.rolbypassrls,
        rolcanlogin: row.rolcanlogin,
        rolcreatedb: row.rolcreatedb,
        rolcreaterole: row.rolcreaterole,
        rolinherit: row.rolinherit,
        rolreplication: row.rolreplication,
        rolsuper: row.rolsuper,
      }
    : null;
}

async function passwordSql(client, roleName, password) {
  const result = await client.query(
    "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
    [roleName, password],
  );
  return result.rows[0]?.sql;
}

async function createOrAlterLogin(client, roleName, password) {
  const identifier = safeIdentifier(roleName);
  const existing = await roleRow(client, roleName);
  if (!existing) {
    await client.query(
      `CREATE ROLE ${identifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
  } else {
    await client.query(
      `ALTER ROLE ${identifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
  }
  await client.query(await passwordSql(client, roleName, password));
}

async function createOrAlterOwner(client) {
  const identifier = safeIdentifier(MIGRATION_OWNER_ROLE);
  const existing = await roleRow(client, MIGRATION_OWNER_ROLE);
  if (!existing) {
    await client.query(
      `CREATE ROLE ${identifier} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
  } else {
    await client.query(
      `ALTER ROLE ${identifier} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
  }
}

async function publicTableSet(client) {
  const result = await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return result.rows.map((row) => row.tablename);
}

async function grantApplicationPrivileges(client, databaseName) {
  const actualTables = await publicTableSet(client);
  const missing = expectedPublicTables.filter((table) => !actualTables.includes(table));
  if (missing.length > 0) {
    throw new RunnerPolicyError("application_table_allowlist_incomplete");
  }

  const app = safeIdentifier(APPLICATION_RUNTIME_ROLE);
  const database = safeIdentifier(databaseName, "database_name_invalid");
  await client.query(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${app}`);
  await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${app}`);
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await client.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${app}`);
  await client.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC");
  await client.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
  );

  for (const tableName of expectedPublicTables) {
    const table = `public.${safeIdentifier(tableName)}`;
    await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE ${table} TO ${app}`);
    await client.query(`REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ${table} FROM ${app}`);
  }

  const sequences = await client.query(
    "SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename",
  );
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${app}`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${app}`);

  return {
    customFunctionExecuteGranted: 0,
    grantedTableCount: expectedPublicTables.length,
    sequenceCountObserved: sequences.rowCount,
    sequencePrivilegesGranted: 0,
    temporaryPrivilegeGranted: false,
  };
}

async function grantMigrationPrivileges(client, databaseName) {
  const database = safeIdentifier(databaseName, "database_name_invalid");
  const migration = safeIdentifier(MIGRATION_LOGIN_ROLE);
  const owner = safeIdentifier(MIGRATION_OWNER_ROLE);
  await client.query(`GRANT CONNECT, CREATE ON DATABASE ${database} TO ${migration}`);
  await client.query(`REVOKE ALL ON SCHEMA public FROM ${migration}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${migration}`);
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${migration}`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${migration}`);
  await client.query(`GRANT ${owner} TO ${migration}`);
}

function generatePassword() {
  return randomBytes(32).toString("base64url");
}

async function prepareSecrets(options) {
  const sourceEnv = await readFile(resolve(options["source-env"]), "utf8");
  const values = parseEnv(sourceEnv);
  const user = values.get("POSTGRES_USER");
  const password = values.get("POSTGRES_PASSWORD");
  const database = values.get("POSTGRES_DB");
  if (!user || !password || !database) {
    throw new RunnerPolicyError("source_postgres_credentials_missing");
  }
  safeIdentifier(user, "source_postgres_user_invalid");
  safeIdentifier(database, "database_name_invalid");

  const secretDirectory = resolve(options["secret-dir"]);
  await mkdir(secretDirectory, { mode: 0o700, recursive: true });
  const url = new URL(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@postgres:5432/${database}`);
  await writeSecret(join(secretDirectory, "break-glass-current.url"), `${url.toString()}\n`);
  await writeSecret(
    join(secretDirectory, "postgres-admin-current.env"),
    `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\n`,
  );

  return {
    breakGlassRoleHash: hashIdentity(user),
    databaseHash: hashIdentity(database),
    prepared: true,
    sourceEnvHash: sha256(sourceEnv),
  };
}

async function bootstrap(options, request) {
  await validateIdentityConfirmation({
    confirmationFile: options["confirmation-file"],
    request,
  });
  const secretDirectory = resolve(options["secret-dir"]);
  await mkdir(secretDirectory, { mode: 0o700, recursive: true });
  const appPassword = generatePassword();
  const migrationPassword = generatePassword();

  return withClient(
    resolve(options["break-glass-connection-file"]),
    "market-radar-identity-bootstrap",
    async (client, adminUrl) => {
      const current = await roleRow(client, adminUrl.username);
      validateRoleIdentity(redactedRole(current), "break_glass");
      const databaseName = decodeURIComponent(adminUrl.pathname.replace(/^\/+/, ""));
      safeIdentifier(databaseName, "database_name_invalid");

      await client.query("BEGIN");
      try {
        await createOrAlterOwner(client);
        await createOrAlterLogin(client, APPLICATION_RUNTIME_ROLE, appPassword);
        await createOrAlterLogin(client, MIGRATION_LOGIN_ROLE, migrationPassword);
        const applicationGrants = await grantApplicationPrivileges(client, databaseName);
        await grantMigrationPrivileges(client, databaseName);
        await client.query("COMMIT");

        const appUrl = new URL(adminUrl);
        appUrl.username = APPLICATION_RUNTIME_ROLE;
        appUrl.password = appPassword;
        const migrationUrl = new URL(adminUrl);
        migrationUrl.username = MIGRATION_LOGIN_ROLE;
        migrationUrl.password = migrationPassword;

        await writeSecret(join(secretDirectory, "application-runtime.url"), `${appUrl.toString()}\n`);
        await writeSecret(join(secretDirectory, "migration-login.url"), `${migrationUrl.toString()}\n`);
        await writeSecret(
          join(secretDirectory, "application-runtime.env"),
          `APP_DATABASE_USER=${APPLICATION_RUNTIME_ROLE}\nAPP_DATABASE_PASSWORD=${appPassword}\n`,
        );

        return {
          applicationGrants,
          applicationRole: redactedRole(await roleRow(client, APPLICATION_RUNTIME_ROLE)),
          databaseHash: hashIdentity(databaseName),
          migrationRole: redactedRole(await roleRow(client, MIGRATION_LOGIN_ROLE)),
          ownerRole: redactedRole(await roleRow(client, MIGRATION_OWNER_ROLE)),
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    },
  );
}

async function expectDenied(operation, reason) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === "42501") {
      return true;
    }
    throw error;
  }
  throw new RunnerPolicyError(reason);
}

async function verify(options) {
  const application = await withClient(
    resolve(options["application-connection-file"]),
    "market-radar-runtime-permission-verify",
    async (client) => {
      const identity = redactedRole(await roleRow(client, APPLICATION_RUNTIME_ROLE));
      validateRoleIdentity(identity, "application");
      for (const tableName of expectedPublicTables) {
        await client.query(`SELECT 1 FROM public.${safeIdentifier(tableName)} LIMIT 0`);
      }
      await client.query("BEGIN");
      try {
        for (const tableName of expectedPublicTables) {
          const table = `public.${safeIdentifier(tableName)}`;
          const columnResult = await client.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
             ORDER BY ordinal_position LIMIT 1`,
            [tableName],
          );
          const firstColumn = safeIdentifier(columnResult.rows[0]?.column_name ?? "", "table_column_missing");
          await client.query(`INSERT INTO ${table} SELECT * FROM ${table} WHERE false`);
          await client.query(`UPDATE ${table} SET ${firstColumn} = ${firstColumn} WHERE false`);
        }
      } finally {
        await client.query("ROLLBACK");
      }
      await expectDenied(
        () => client.query("DELETE FROM public.journal_events WHERE false"),
        "application_delete_unexpectedly_allowed",
      );
      await expectDenied(
        () => client.query("CREATE TABLE public.identity_permission_probe(id int)"),
        "application_ddl_unexpectedly_allowed",
      );
      await expectDenied(
        () => client.query("CREATE TEMP TABLE identity_permission_probe(id int)"),
        "application_temporary_ddl_unexpectedly_allowed",
      );
      await expectDenied(
        () => client.query("CREATE ROLE identity_permission_probe"),
        "application_role_management_unexpectedly_allowed",
      );
      return {
        ddlDenied: true,
        deleteDenied: true,
        identity,
        roleManagementDenied: true,
        tableReadCount: expectedPublicTables.length,
        tableWriteRollbackCount: expectedPublicTables.length,
        temporaryDdlDenied: true,
        transactionWriteRollback: true,
      };
    },
  );

  const migration = await withClient(
    resolve(options["migration-connection-file"]),
    "market-radar-migration-permission-verify",
    async (client) => {
      const identity = redactedRole(await roleRow(client, MIGRATION_LOGIN_ROLE));
      validateRoleIdentity(identity, "migration");
      const membership = await client.query(
        "SELECT pg_has_role(current_user, $1, 'MEMBER') AS owner_member",
        [MIGRATION_OWNER_ROLE],
      );
      if (!membership.rows[0]?.owner_member) {
        throw new RunnerPolicyError("migration_owner_membership_missing");
      }
      await expectDenied(
        () => client.query("SELECT 1 FROM public.journal_events LIMIT 0"),
        "migration_business_read_unexpectedly_allowed",
      );
      return { businessReadDenied: true, identity, ownerMembership: true };
    },
  );

  const breakGlass = await withClient(
    resolve(options["break-glass-connection-file"]),
    "market-radar-break-glass-verify",
    async (client, url) => {
      const identity = redactedRole(await roleRow(client, url.username));
      validateRoleIdentity(identity, "break_glass");
      return { identity };
    },
  );

  return { application, breakGlass, migration };
}

async function renderRuntimeEnv(options, request) {
  await validateIdentityConfirmation({
    confirmationFile: options["confirmation-file"],
    request,
  });
  const sourceEnv = await readFile(resolve(options["source-env"]), "utf8");
  const runtimeEnv = parseEnv(
    await readFile(resolve(options["application-runtime-env-file"]), "utf8"),
  );
  const appUser = runtimeEnv.get("APP_DATABASE_USER");
  const appPassword = runtimeEnv.get("APP_DATABASE_PASSWORD");
  if (!appUser || !appPassword) {
    throw new RunnerPolicyError("application_runtime_secret_missing");
  }

  const outputDirectory = resolve(options["output-dir"]);
  await mkdir(outputDirectory, { mode: 0o700, recursive: true });
  const rendered = replaceEnv(
    sourceEnv,
    new Map([
      ["APP_DATABASE_USER", appUser],
      ["APP_DATABASE_PASSWORD", appPassword],
    ]),
    ["POSTGRES_USER", "POSTGRES_PASSWORD"],
  );
  await writeSecret(join(outputDirectory, "rendered.env.production"), rendered);
  await writeSecret(join(outputDirectory, "env.production.before"), sourceEnv);

  const override = `services:
  web:
    environment:
      DATABASE_URL: postgresql://\${APP_DATABASE_USER:?Set APP_DATABASE_USER}:\${APP_DATABASE_PASSWORD:?Set APP_DATABASE_PASSWORD}@postgres:5432/\${POSTGRES_DB:?Set POSTGRES_DB}
  scanner-worker:
    environment:
      DATABASE_URL: ""
  websocket-light-worker:
    environment:
      DATABASE_URL: ""
  coinglass-worker:
    environment:
      DATABASE_URL: ""
  signal-worker:
    environment:
      DATABASE_URL: ""
  shadow-runner:
    environment:
      DATABASE_URL: ""
  dynamic-scan-scheduler:
    environment:
      DATABASE_URL: ""
  macro-worker:
    environment:
      DATABASE_URL: ""
`;
  await writeFile(join(outputDirectory, "runtime-identity.override.yml"), override, { mode: 0o600 });

  const wrapper = `#!/bin/sh
set -eu
exec sudo -n docker compose \\
  --project-directory /home/ubuntu/apps/chuan-market-radar \\
  --env-file /home/ubuntu/apps/chuan-market-radar/.env.production \\
  --env-file ${resolve(options["postgres-admin-env-file"])} \\
  -f /home/ubuntu/apps/chuan-market-radar/docker-compose.yml \\
  -f ${join(outputDirectory, "runtime-identity.override.yml")} \\
  "$@"
`;
  await writeFile(join(outputDirectory, "compose-identity-safe"), wrapper, { mode: 0o700 });

  return {
    backupHash: sha256(sourceEnv),
    renderedHash: sha256(rendered),
    runtimeOverrideCreated: true,
    wrapperCreated: true,
  };
}

async function rotateBreakGlass(options, request) {
  await validateIdentityConfirmation({
    confirmationFile: options["confirmation-file"],
    request,
  });
  const secretDirectory = resolve(options["secret-dir"]);
  const nextPassword = generatePassword();

  return withClient(
    resolve(options["break-glass-connection-file"]),
    "market-radar-break-glass-rotation",
    async (client, currentUrl) => {
      const roleName = decodeURIComponent(currentUrl.username);
      const row = await roleRow(client, roleName);
      validateRoleIdentity(redactedRole(row), "break_glass");
      await client.query(await passwordSql(client, roleName, nextPassword));

      const nextUrl = new URL(currentUrl);
      nextUrl.password = nextPassword;
      await writeSecret(join(secretDirectory, "break-glass.url"), `${nextUrl.toString()}\n`);
      await writeSecret(
        join(secretDirectory, "postgres-admin.env"),
        `POSTGRES_USER=${roleName}\nPOSTGRES_PASSWORD=${nextPassword}\n`,
      );

      return {
        breakGlassRoleHash: hashIdentity(roleName),
        rotated: true,
      };
    },
  );
}

async function audit(options) {
  return withClient(
    resolve(options["break-glass-connection-file"]),
    "market-radar-role-audit",
    async (client, url) => {
      const roles = await client.query(
        `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
          rolreplication, rolbypassrls, rolinherit
         FROM pg_roles ORDER BY rolname`,
      );
      const roleSummary = roles.rows.map(redactedRole);
      const owners = await client.query(
        `SELECT c.relkind, count(*)::int AS object_count,
          md5(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname)) AS owner_hash
         FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
         WHERE c.relnamespace = 'public'::regnamespace
         GROUP BY c.relkind ORDER BY c.relkind`,
      );
      const memberships = await client.query(
        `SELECT md5(role_role.rolname) AS role_hash,
          md5(member_role.rolname) AS member_hash,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
         FROM pg_auth_members membership
         JOIN pg_roles role_role ON role_role.oid = membership.roleid
         JOIN pg_roles member_role ON member_role.oid = membership.member
         ORDER BY role_hash, member_hash`,
      );
      const databaseBoundary = await client.query(
        `SELECT md5(owner.rolname) AS owner_hash,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba)))
            WHERE grantee = 0 AND privilege_type = 'CONNECT'
          ) AS public_connect,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba)))
            WHERE grantee = 0 AND privilege_type = 'CREATE'
          ) AS public_create,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba)))
            WHERE grantee = 0 AND privilege_type = 'TEMPORARY'
          ) AS public_temporary
         FROM pg_database database
         JOIN pg_roles owner ON owner.oid = database.datdba
         WHERE database.datname = current_database()`,
      );
      const schemas = await client.query(
        `SELECT namespace.nspname AS schema_name,
          md5(owner.rolname) AS owner_hash,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner)))
            WHERE grantee = 0 AND privilege_type = 'USAGE'
          ) AS public_usage,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner)))
            WHERE grantee = 0 AND privilege_type = 'CREATE'
          ) AS public_create
         FROM pg_namespace namespace
         JOIN pg_roles owner ON owner.oid = namespace.nspowner
         WHERE namespace.nspname !~ '^pg_toast'
         ORDER BY namespace.nspname`,
      );
      const tablePrivileges = await client.query(
        `SELECT table_schema, table_name, md5(grantee) AS grantee_hash,
          string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
         FROM information_schema.role_table_grants
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         GROUP BY table_schema, table_name, md5(grantee)
         ORDER BY table_schema, table_name, grantee_hash`,
      );
      const sequencePrivileges = await client.query(
        `SELECT object_schema AS sequence_schema, object_name AS sequence_name,
          md5(grantee) AS grantee_hash,
          string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
         FROM information_schema.role_usage_grants
         WHERE object_type = 'SEQUENCE'
           AND object_schema NOT IN ('pg_catalog', 'information_schema')
         GROUP BY object_schema, object_name, md5(grantee)
         ORDER BY object_schema, object_name, grantee_hash`,
      );
      const routines = await client.query(
        `SELECT namespace.nspname AS schema_name, procedure.proname AS routine_name,
          md5(owner.rolname) AS owner_hash, procedure.prosecdef AS security_definer,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner)))
            WHERE grantee = 0 AND privilege_type = 'EXECUTE'
          ) AS public_execute
         FROM pg_proc procedure
         JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
         JOIN pg_roles owner ON owner.oid = procedure.proowner
         WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         ORDER BY namespace.nspname, procedure.proname`,
      );
      const defaultPrivileges = await client.query(
        `SELECT md5(owner.rolname) AS owner_hash,
          COALESCE(namespace.nspname, '*') AS schema_name,
          defaults.defaclobjtype AS object_type,
          md5(COALESCE(defaults.defaclacl::text, '')) AS acl_hash
         FROM pg_default_acl defaults
         JOIN pg_roles owner ON owner.oid = defaults.defaclrole
         LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
         ORDER BY owner_hash, schema_name, object_type`,
      );
      const extensions = await client.query(
        "SELECT extname, extversion FROM pg_extension ORDER BY extname",
      );
      const active = await client.query(
        `SELECT md5(usename) AS role_hash, count(*)::int AS connection_count
         FROM pg_stat_activity
         WHERE datname = current_database()
         GROUP BY md5(usename) ORDER BY connection_count DESC`,
      );
      const candidate = await client.query(
        "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='candidate_authority') AS present",
      );
      const current = await roleRow(client, decodeURIComponent(url.username));
      return {
        activeRoleCounts: active.rows,
        candidateSchemaPresent: candidate.rows[0]?.present === true,
        currentRole: redactedRole(current),
        databaseBoundary: databaseBoundary.rows[0],
        defaultPrivileges: defaultPrivileges.rows,
        extensions: extensions.rows,
        loginRoleCount: roleSummary.filter((role) => role.rolcanlogin).length,
        memberships: memberships.rows,
        objectOwners: owners.rows,
        roleCount: roleSummary.length,
        roles: roleSummary,
        routines: routines.rows,
        schemas: schemas.rows,
        searchPath: (await client.query("SHOW search_path")).rows[0]?.search_path,
        sequencePrivileges: sequencePrivileges.rows,
        tablePrivileges: tablePrivileges.rows,
      };
    },
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!new Set([
    "prepare-secrets",
    "audit",
    "bootstrap",
    "verify",
    "render-runtime-env",
    "rotate-break-glass",
  ]).has(command)) {
    throw new RunnerPolicyError("command_unsupported");
  }
  if (!options.output) {
    throw new RunnerPolicyError("output_missing");
  }
  await assertOutsideProductionWorktree({
    cwd: options.cwd ? resolve(options.cwd) : process.cwd(),
    productionWorktree: options.worktree,
  });

  let request = null;
  if (command !== "prepare-secrets" && command !== "audit" && command !== "verify") {
    request = await readRequest(resolve(options.request));
  }
  if (mutatingCommands.has(command) && !request?.identityExecute) {
    throw new RunnerPolicyError("identity_execute_not_enabled");
  }

  let result;
  if (command === "prepare-secrets") result = await prepareSecrets(options);
  if (command === "audit") result = await audit(options);
  if (command === "bootstrap") result = await bootstrap(options, request);
  if (command === "verify") result = await verify(options);
  if (command === "render-runtime-env") result = await renderRuntimeEnv(options, request);
  if (command === "rotate-break-glass") result = await rotateBreakGlass(options, request);

  const record = {
    command,
    generatedAt: new Date().toISOString(),
    result,
    status: "pass",
    workPackage:
      "WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION",
  };
  await writeJson(resolve(options.output), record);
  process.stdout.write(`${JSON.stringify({ command, status: "pass" })}\n`);
}

main().catch((error) => {
  const reason = error instanceof RunnerPolicyError ? error.reason : "identity_tool_internal_error";
  const code = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : null;
  const errorType = typeof error?.name === "string" ? error.name : "unknown";
  const location = typeof error?.stack === "string"
    ? error.stack.split("\n").find((line) => line.includes("identity-remediation.mjs"))?.trim() ?? null
    : null;
  process.stderr.write(`${JSON.stringify({ code, errorType, location, reason, status: "fail" })}\n`);
  process.exitCode = 1;
});
