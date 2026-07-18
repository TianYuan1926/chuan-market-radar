#!/usr/bin/env node

import { createRequire } from "node:module";
import { lstat, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildCandidateLineageEvidence,
  collectCandidateLineageDatabaseSnapshotWithEvidence,
  sha256,
} from "./runner.mjs";

export const PACKAGE_ID =
  "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET";
export const CAPTURE_SPEC_SCHEMA = "candidate-lineage-capture-specification.v3";
export const CAPTURE_RESULT_SCHEMA = "candidate-lineage-capture-result.v3";

const CYCLE_PATTERN = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;
const RELEASE_PATTERN = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const GROUP_KEYS = Object.freeze([
  "authorityEpoch", "closeoutPath", "closeoutSha256", "commit", "finalPath",
  "finalSha256", "migrationId", "releaseId", "samplesPath", "samplesSha256",
]);
const SPEC_KEYS = Object.freeze([
  "outputSchemaVersion", "packageId", "productionMutationAllowed", "schemaVersion", "unified",
]);

export class CandidateLineageCaptureError extends Error {
  constructor(reason) {
    super(`candidate lineage capture rejected: ${reason}`);
    this.name = "CandidateLineageCaptureError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new CandidateLineageCaptureError(reason);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  ensure(Object.keys(value).sort().join("\n") === [...expected].sort().join("\n"), reason);
}

function parseCycle(value) {
  const match = CYCLE_PATTERN.exec(value ?? "");
  ensure(match, "capture_migration_id_invalid");
  const cycle = match[1] ? Number(match[1]) : 1;
  ensure(cycle !== 1 || value === "candidate-episode-v1", "capture_cycle_one_alias_forbidden");
  return cycle;
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function validateGroup(group, label) {
  exactKeys(group, GROUP_KEYS, `${label}_capture_group_shape_invalid`);
  ensure(/^[0-9a-f]{40}$/u.test(group.commit ?? ""), `${label}_capture_commit_invalid`);
  ensure(RELEASE_PATTERN.test(group.releaseId ?? ""), `${label}_capture_release_invalid`);
  ensure(Number.isSafeInteger(group.authorityEpoch) && group.authorityEpoch >= 1
      && group.authorityEpoch % 2 === 1, `${label}_capture_epoch_invalid`);
  parseCycle(group.migrationId);
  for (const key of ["closeoutSha256", "finalSha256", "samplesSha256"]) {
    ensure(HASH_PATTERN.test(group[key] ?? ""), `${label}_capture_hash_invalid:${key}`);
  }
  for (const key of ["closeoutPath", "finalPath", "samplesPath"]) {
    ensure(typeof group[key] === "string" && group[key].startsWith("/"),
      `${label}_capture_path_invalid:${key}`);
  }
  return group;
}

export function validateCaptureSpecification(specification) {
  exactKeys(specification, SPEC_KEYS, "capture_specification_shape_invalid");
  ensure(specification.schemaVersion === CAPTURE_SPEC_SCHEMA
      && specification.packageId === PACKAGE_ID
      && specification.outputSchemaVersion === "candidate-multi-cycle-lineage-evidence.v3"
      && specification.productionMutationAllowed === false,
  "capture_specification_identity_invalid");
  const unified = validateGroup(specification.unified, "unified");
  ensure(parseCycle(unified.migrationId) >= 2, "unified_capture_not_multi_cycle");
  return specification;
}

async function assertPrivateRegularFile(path, label, maximumBytes) {
  const [metadata, linkMetadata] = await Promise.all([stat(path), lstat(path)]);
  ensure(metadata.isFile() && linkMetadata.isFile() && !linkMetadata.isSymbolicLink()
      && metadata.nlink === 1, `${label}_not_private_regular_file`);
  ensure((metadata.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(metadata.size > 0 && metadata.size <= maximumBytes, `${label}_size_invalid`);
}

function parseJsonLines(bytes, label) {
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  ensure(lines.length > 0, `${label}_samples_empty`);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new CandidateLineageCaptureError(`${label}_sample_json_invalid:${index}`);
    }
  });
}

async function readGroup(group, label) {
  await Promise.all([
    assertPrivateRegularFile(group.finalPath, `${label}_final`, 128 * 1024),
    assertPrivateRegularFile(group.samplesPath, `${label}_samples`, 64 * 1024 * 1024),
    assertPrivateRegularFile(group.closeoutPath, `${label}_closeout`, 128 * 1024),
  ]);
  const [finalBytes, samplesBytes, closeoutBytes] = await Promise.all([
    readFile(group.finalPath), readFile(group.samplesPath), readFile(group.closeoutPath),
  ]);
  for (const [actual, expected, reason] of [
    [sha256(finalBytes), group.finalSha256, `${label}_final_hash_mismatch`],
    [sha256(samplesBytes), group.samplesSha256, `${label}_samples_hash_mismatch`],
    [sha256(closeoutBytes), group.closeoutSha256, `${label}_closeout_hash_mismatch`],
  ]) ensure(actual === expected, reason);
  const final = JSON.parse(finalBytes);
  const closeout = JSON.parse(closeoutBytes);
  exactKeys(closeout, ["closedAt", "outcome", "schemaVersion", "secretsPrinted"],
    `${label}_closeout_shape_invalid`);
  timestamp(closeout.closedAt, `${label}_closeout_time_invalid`);
  ensure(closeout.schemaVersion === "candidate-cycle-observation-closeout.v1",
    `${label}_closeout_schema_invalid`);
  ensure(closeout.outcome === "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
      && closeout.secretsPrinted === false, `${label}_closeout_not_pass`);
  return {
    expected: {
      authorityEpoch: group.authorityEpoch,
      commit: group.commit,
      migrationId: group.migrationId,
      releaseId: group.releaseId,
    },
    final,
    samples: parseJsonLines(samplesBytes, label),
    sourceSha256: {
      closeout: group.closeoutSha256,
      final: group.finalSha256,
      samples: group.samplesSha256,
    },
  };
}

export async function loadLineageCaptureInputs(specification) {
  validateCaptureSpecification(specification);
  return { unified: await readGroup(specification.unified, "unified") };
}

export async function captureCandidateLineageEvidence(client, specification) {
  const inputs = await loadLineageCaptureInputs(specification);
  const database = await collectCandidateLineageDatabaseSnapshotWithEvidence(client);
  const lineageInput = ({ expected, final, samples }) => ({ expected, final, samples });
  const lineage = buildCandidateLineageEvidence({
    database: database.snapshot,
    unified: lineageInput(inputs.unified),
  });
  return {
    databaseIdentity: database.databaseIdentity,
    lineage,
    sourceEvidenceSha256: {
      unified: inputs.unified.sourceSha256,
    },
  };
}

export function loadPgRuntime({
  applicationRoot = process.env.MARKET_RADAR_APPLICATION_ROOT,
  moduleUrl = import.meta.url,
  requireFactory = createRequire,
} = {}) {
  const candidates = [requireFactory(moduleUrl)];
  if (applicationRoot) candidates.push(requireFactory(resolve(applicationRoot, "package.json")));
  for (const requireCandidate of candidates) {
    try {
      return requireCandidate("pg");
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new CandidateLineageCaptureError("approved_pg_runtime_unavailable");
}

async function secureText(path, label, maximumBytes = 64 * 1024) {
  ensure(path, `${label}_path_required`);
  await assertPrivateRegularFile(path, label, maximumBytes);
  return readFile(path, "utf8");
}

async function main() {
  const mode = process.argv[2] ?? "describe";
  if (mode === "describe") {
    process.stdout.write(`${JSON.stringify({
      packageId: PACKAGE_ID,
      mode: "local_packet_preparation",
      productionMutationAllowed: false,
      status: "READY_FOR_LOCAL_REHEARSAL_ONLY",
    }, null, 2)}\n`);
    return;
  }
  ensure(mode === "collect", "capture_mode_not_supported");
  const specificationPath = process.env.CANDIDATE_LINEAGE_CAPTURE_SPECIFICATION_FILE;
  const databaseUrlPath = process.env.CANDIDATE_LINEAGE_CAPTURE_DATABASE_URL_FILE;
  const lineageOutputPath = process.env.CANDIDATE_LINEAGE_CAPTURE_OUTPUT_FILE;
  const metadataOutputPath = process.env.CANDIDATE_LINEAGE_CAPTURE_METADATA_FILE;
  for (const [value, reason] of [
    [specificationPath, "capture_specification_file_required"],
    [databaseUrlPath, "capture_database_url_file_required"],
    [lineageOutputPath, "capture_output_file_required"],
    [metadataOutputPath, "capture_metadata_file_required"],
  ]) ensure(value, reason);
  const specification = JSON.parse(await secureText(specificationPath, "capture_specification"));
  const pg = loadPgRuntime();
  const { Client } = pg.default ?? pg;
  const client = new Client({
    application_name: "market-radar-candidate-lineage-read-only",
    connectionString: (await secureText(databaseUrlPath, "capture_database_url")).trim(),
  });
  await client.connect();
  try {
    const captured = await captureCandidateLineageEvidence(client, specification);
    const lineageBytes = Buffer.from(`${JSON.stringify(captured.lineage, null, 2)}\n`);
    const metadata = {
      schemaVersion: CAPTURE_RESULT_SCHEMA,
      status: captured.lineage.status,
      databaseIdentity: captured.databaseIdentity,
      lineageFileSha256: sha256(lineageBytes),
      sourceEvidenceSha256: captured.sourceEvidenceSha256,
      servicesMutated: [],
      databaseMutationExecuted: false,
      phaseTransitionExecuted: false,
      canonicalAuthorityChanged: false,
      productionReconciliationExecuted: false,
      secretsPrinted: false,
    };
    await writeFile(lineageOutputPath, lineageBytes, { flag: "wx", mode: 0o600 });
    await writeFile(metadataOutputPath, `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      reason: error?.reason ?? error?.message ?? "unexpected_error",
      secretsPrinted: false,
    })}\n`);
    process.exitCode = 1;
  });
}
