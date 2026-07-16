#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const commitPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const imagePattern = /^sha256:[a-f0-9]{64}$/u;
const releasePattern = /^[a-z0-9][a-z0-9._-]{7,127}$/u;
const servicePattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const maximumRecordWindowMs = 24 * 60 * 60 * 1000;
const sensitiveKeyPattern = /(?:^|_)(?:api_?key|authorization|cookie|database_?url|password|private_?key|secret|token)(?:$|_)/iu;
const sensitiveValuePattern = /(?:postgres(?:ql)?:\/\/|redis:\/\/|bearer\s+|begin\s+(?:rsa\s+)?private\s+key)/iu;

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function validDate(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function validateImages(images, label, violations) {
  if (!images || typeof images !== "object" || Array.isArray(images) ||
    Object.keys(images).length === 0 || !("web" in images)) {
    violations.push(`${label}_images_invalid`);
    return;
  }
  for (const [service, digest] of Object.entries(images)) {
    if (!servicePattern.test(service) || !imagePattern.test(digest)) {
      violations.push(`${label}_image_invalid:${service}`);
    }
  }
}

function scanSensitive(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSensitive(entry, `${path}[${index}]`, violations));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && sensitiveValuePattern.test(value)) {
      violations.push(`sensitive_value_present:${path}`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key)) violations.push(`sensitive_key_present:${path}.${key}`);
    scanSensitive(entry, `${path}.${key}`, violations);
  }
}

export function validateReleaseRecord(record, now = new Date()) {
  const violations = [];
  const topKeys = [
    "alignment", "database", "environment", "evidence", "generatedAt", "health",
    "releaseId", "rollback", "runtime", "schemaVersion", "source", "status", "validUntil",
  ];
  if (!exactKeys(record, topKeys)) violations.push("top_level_keys_invalid");
  if (record?.schemaVersion !== "market-radar-release-record.v1") violations.push("schema_invalid");
  if (record?.status !== "pass") violations.push("status_not_pass");
  if (!releasePattern.test(record?.releaseId ?? "")) violations.push("release_id_invalid");
  if (record?.environment !== "production") violations.push("environment_invalid");

  const generatedAt = validDate(record?.generatedAt);
  const validUntil = validDate(record?.validUntil);
  if (!generatedAt || !validUntil || generatedAt > now || validUntil <= now ||
    validUntil.getTime() - generatedAt.getTime() > maximumRecordWindowMs) {
    violations.push("record_window_invalid");
  }

  const source = record?.source;
  if (!exactKeys(source, ["branch", "commit", "remoteCommit", "tree", "worktreeClean"]) ||
    source?.branch !== "main" || source?.worktreeClean !== true ||
    !commitPattern.test(source?.commit ?? "") || !commitPattern.test(source?.remoteCommit ?? "") ||
    !commitPattern.test(source?.tree ?? "")) {
    violations.push("source_invalid");
  }

  const runtime = record?.runtime;
  if (!exactKeys(runtime, [
    "composeSha256", "contentSha256", "envFingerprintSha256", "gitCommit", "imageDigests",
  ]) || !commitPattern.test(runtime?.gitCommit ?? "") ||
    !sha256Pattern.test(runtime?.composeSha256 ?? "") ||
    !sha256Pattern.test(runtime?.envFingerprintSha256 ?? "") ||
    !sha256Pattern.test(runtime?.contentSha256 ?? "")) {
    violations.push("runtime_invalid");
  }
  validateImages(runtime?.imageDigests, "runtime", violations);

  if (source?.commit !== source?.remoteCommit || source?.commit !== runtime?.gitCommit) {
    violations.push("git_identity_mismatch");
  }

  const database = record?.database;
  if (!exactKeys(database, ["migrationIds", "migrationStatus"]) ||
    !["no_change", "applied_verified"].includes(database?.migrationStatus) ||
    !Array.isArray(database?.migrationIds) ||
    database.migrationIds.some((id) => typeof id !== "string" || !id) ||
    new Set(database?.migrationIds ?? []).size !== (database?.migrationIds ?? []).length ||
    (database?.migrationStatus === "no_change" && database.migrationIds.length !== 0)) {
    violations.push("database_migration_identity_invalid");
  }

  const evidence = record?.evidence;
  const evidenceGenerated = validDate(evidence?.generatedAt);
  const evidenceExpires = validDate(evidence?.expiresAt);
  if (!exactKeys(evidence, ["artifactSha256", "expiresAt", "generatedAt", "status"]) ||
    evidence?.status !== "pass" || !sha256Pattern.test(evidence?.artifactSha256 ?? "") ||
    !evidenceGenerated || !evidenceExpires || evidenceGenerated > now || evidenceExpires <= now) {
    violations.push("evidence_invalid_or_stale");
  }

  const health = record?.health;
  const healthCheckedAt = validDate(health?.checkedAt);
  if (!exactKeys(health, ["artifactSha256", "checkedAt", "status"]) ||
    health?.status !== "pass" || !sha256Pattern.test(health?.artifactSha256 ?? "") ||
    !healthCheckedAt || healthCheckedAt > now ||
    now.getTime() - healthCheckedAt.getTime() > maximumRecordWindowMs) {
    violations.push("health_evidence_invalid_or_stale");
  }

  const rollback = record?.rollback;
  if (!exactKeys(rollback, ["commit", "databaseRollbackAuthorized", "imageDigests", "tested"]) ||
    !commitPattern.test(rollback?.commit ?? "") || rollback?.commit === source?.commit ||
    rollback?.tested !== true || rollback?.databaseRollbackAuthorized !== false) {
    violations.push("rollback_invalid");
  }
  validateImages(rollback?.imageDigests, "rollback", violations);

  const alignmentKeys = [
    "compose", "content", "environment", "evidence", "git", "health", "images",
    "migrations", "rollback",
  ];
  if (!exactKeys(record?.alignment, alignmentKeys) ||
    alignmentKeys.some((key) => record.alignment[key] !== true)) {
    violations.push("alignment_incomplete");
  }

  scanSensitive(record, "record", violations);
  return {
    status: violations.length === 0 ? "pass" : "fail",
    releaseAligned: violations.length === 0,
    violations,
  };
}

export function validateReleaseSchemaDocument(baseDir = rootDir) {
  const schema = JSON.parse(readFileSync(resolve(baseDir, "docs/deployment/RELEASE_RECORD_SCHEMA.json"), "utf8"));
  const standard = readFileSync(resolve(baseDir, "docs/deployment/RELEASE_STANDARD.md"), "utf8");
  const required = [
    "schemaVersion", "status", "releaseId", "generatedAt", "validUntil", "environment",
    "source", "runtime", "database", "evidence", "health", "rollback", "alignment",
  ];
  const violations = [];
  if (schema.$id !== "https://market-radar.local/schemas/release-record.v1.json" ||
    schema.additionalProperties !== false ||
    JSON.stringify([...schema.required].sort()) !== JSON.stringify(required.sort())) {
    violations.push("schema_contract_invalid");
  }
  for (const token of [
    "Runtime health and release identity are separate gates",
    "GitHub `main` commit",
    "must never contain environment values",
    "expires within 24 hours",
    "Database rollback",
  ]) if (!standard.includes(token)) violations.push(`standard_guard_missing:${token}`);
  return {
    status: violations.length === 0 ? "pass" : "fail",
    productionDecision: "BLOCKED_UNTIL_CURRENT_PRODUCTION_RELEASE_RECORD_IS_GENERATED_AND_ALIGNED",
    productionMutationAllowed: false,
    violations,
  };
}

function main() {
  const command = process.argv[2] ?? "schema";
  const result = command === "schema"
    ? validateReleaseSchemaDocument()
    : command === "record" && process.argv[3]
      ? validateReleaseRecord(JSON.parse(readFileSync(resolve(process.argv[3]), "utf8")))
      : null;
  if (!result) throw new Error("usage: release-record-check.mjs schema | record <record.json>");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "pass" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
