#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- Production image artifacts are CommonJS. */

const { createHash } = require("node:crypto");

const SCHEMA_VERSION = "candidate-full-snapshot-parity.v1";
const PAGE_LIMIT = 1000;
const MAXIMUM_PAGES = 10000;

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function hash(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function evaluatePageSequence(pages) {
  ensure(Array.isArray(pages) && pages.length >= 1, "full_snapshot_pages_missing");
  ensure(pages.length <= MAXIMUM_PAGES, "full_snapshot_page_limit_exceeded");
  const episodeIds = [];
  const comparisonHashes = [];
  let expectedTotal = null;
  let expectedReviewHash = null;
  for (const [index, page] of pages.entries()) {
    ensure(page.candidateStatus === "ready" && page.referenceStatus === "ready"
        && page.parityStatus === "pass" && page.differenceCount === 0
        && /^sha256:[0-9a-f]{64}$/.test(page.comparisonHash ?? ""),
    `full_snapshot_page_parity_invalid:${index + 1}`);
    ensure(Number.isSafeInteger(page.returned) && page.returned >= 0
        && Number.isSafeInteger(page.totalEpisodes) && page.totalEpisodes >= 0,
    `full_snapshot_page_count_invalid:${index + 1}`);
    ensure(Array.isArray(page.episodeIds) && page.episodeIds.length === page.returned,
      `full_snapshot_page_episode_count_invalid:${index + 1}`);
    if (expectedTotal === null) expectedTotal = page.totalEpisodes;
    if (expectedReviewHash === null) expectedReviewHash = page.reviewHash;
    ensure(page.totalEpisodes === expectedTotal, `full_snapshot_total_drift:${index + 1}`);
    ensure(page.reviewHash === expectedReviewHash, `full_snapshot_review_drift:${index + 1}`);
    const last = index === pages.length - 1;
    ensure(last ? page.hasMore === false && page.nextCursor === null
      : page.hasMore === true && page.nextCursor !== null,
    `full_snapshot_pagination_chain_invalid:${index + 1}`);
    episodeIds.push(...page.episodeIds);
    comparisonHashes.push(page.comparisonHash);
  }
  const duplicateEpisodeIds = episodeIds.length - new Set(episodeIds).size;
  ensure(duplicateEpisodeIds === 0, "full_snapshot_duplicate_episode_ids");
  ensure(episodeIds.length === expectedTotal, "full_snapshot_episode_total_mismatch");
  return {
    pageCount: pages.length,
    totalEpisodes: expectedTotal,
    returnedEpisodes: episodeIds.length,
    duplicateEpisodeIds,
    allPagesVisited: true,
    comparisonHashes,
    reviewHash: expectedReviewHash,
  };
}

async function readRawSnapshot(tx, policy) {
  const clock = await tx.query("SELECT clock_timestamp() AS database_now");
  const episodes = await tx.query(`SELECT
    schema_version, scope, episode_id, canonical_instrument_id, venue_context,
    first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
    discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
    expires_at, closed_at, closed_reason, parent_episode_id, release_id,
    source_scan_cycle_id, row_version
    FROM candidate_authority.candidate_episodes
    WHERE scope=$1 AND first_seen_at >= $2::timestamptz
      AND first_seen_at < $3::timestamptz AND first_seen_at <= $4::timestamptz`, [
    policy.scope,
    policy.observationCohort.from,
    policy.observationCohort.toExclusive,
    policy.asOf,
  ]);
  const checkpoints = await tx.query(`SELECT
    checkpoint_id, scope, episode_id, checkpoint_kind, due_at, status, release_id
    FROM candidate_authority.candidate_episode_checkpoints
    WHERE scope=$1 AND due_at >= $2::timestamptz
      AND due_at < $3::timestamptz AND due_at <= $4::timestamptz`, [
    policy.scope,
    policy.dueCohort.from,
    policy.dueCohort.toExclusive,
    policy.asOf,
  ]);
  const outcomes = await tx.query(`SELECT
    outcome.outcome_id, outcome.scope, outcome.checkpoint_id, outcome.episode_id,
    outcome.status, outcome.evidence_grade, outcome.evidence_grade_version,
    outcome.mfe, outcome.mae, outcome.recorded_at, outcome.release_id
    FROM candidate_authority.candidate_episode_outcomes outcome
    WHERE outcome.scope=$1 AND outcome.recorded_at <= $4::timestamptz
      AND EXISTS (
        SELECT 1 FROM candidate_authority.candidate_episode_checkpoints checkpoint
        WHERE checkpoint.scope=outcome.scope AND checkpoint.checkpoint_id=outcome.checkpoint_id
          AND checkpoint.due_at >= $2::timestamptz AND checkpoint.due_at < $3::timestamptz
          AND checkpoint.due_at <= $4::timestamptz
      )`, [
    policy.scope,
    policy.dueCohort.from,
    policy.dueCohort.toExclusive,
    policy.asOf,
  ]);
  const databaseNow = clock.rows[0]?.database_now;
  ensure(databaseNow, "full_snapshot_database_clock_missing");
  return {
    databaseNow,
    episodes: episodes.rows,
    checkpoints: checkpoints.rows,
    outcomes: outcomes.rows,
  };
}

async function compareEveryPage({
  buildCandidateCanonicalOracleFromRaw,
  compareCandidateCanonicalReferenceReads,
  model,
  policy,
  raw,
  tx,
}) {
  const pages = [];
  let cursor = null;
  for (let index = 0; index < MAXIMUM_PAGES; index += 1) {
    const candidate = await model.readInTransaction(tx, {
      cursor,
      limit: PAGE_LIMIT,
      policy,
    });
    const reference = buildCandidateCanonicalOracleFromRaw({
      cursor,
      limit: PAGE_LIMIT,
      policy,
      raw,
    });
    const parity = compareCandidateCanonicalReferenceReads(reference, candidate);
    ensure(candidate.status === "ready" && reference.status === "ready",
      `full_snapshot_page_unavailable:${index + 1}`);
    const nextCursor = candidate.page.nextCursor;
    pages.push({
      candidateStatus: candidate.status,
      referenceStatus: reference.status,
      parityStatus: parity.status,
      differenceCount: parity.differenceCount,
      comparisonHash: parity.comparisonHash,
      returned: candidate.page.returned,
      totalEpisodes: candidate.review.counts.totalEpisodes,
      reviewHash: hash(candidate.review),
      hasMore: candidate.page.hasMore,
      nextCursor,
      episodeIds: candidate.episodes.map((episode) => episode.episodeId),
    });
    if (!candidate.page.hasMore) break;
    ensure(nextCursor, `full_snapshot_cursor_missing:${index + 1}`);
    cursor = nextCursor;
  }
  return evaluatePageSequence(pages);
}

async function run({ compiledRoot = process.env.CANDIDATE_COMPILED_ROOT
  || "/app/.tmp/market-tests/lib/candidate-episode" } = {}) {
  const {
    CandidateCanonicalReadModel,
    compareCandidateCanonicalReferenceReads,
  } = require(`${compiledRoot}/canonical-read-model.js`);
  const {
    buildCandidateCanonicalOracleFromRaw,
  } = require(`${compiledRoot}/canonical-read-oracle.js`);
  const {
    CandidateTrustedReadContextProvider,
  } = require(`${compiledRoot}/canonical-read-trusted-context.js`);
  const {
    createCandidateRuntimeDatabase,
  } = require(`${compiledRoot}/candidate-runtime-database.js`);

  const runtime = createCandidateRuntimeDatabase({ purpose: "monitor" });
  ensure(runtime.configured === true && runtime.transactions,
    "full_snapshot_monitor_database_unavailable");
  const contextProvider = new CandidateTrustedReadContextProvider({
    env: process.env,
    transactions: runtime.transactions,
  });
  const before = await contextProvider.read({});
  ensure(before.phase === "shadow_verify", "full_snapshot_phase_invalid");
  if (process.env.EXPECTED_CANDIDATE_MIGRATION_ID) {
    ensure(before.migrationId === process.env.EXPECTED_CANDIDATE_MIGRATION_ID,
      "full_snapshot_migration_mismatch");
  }
  if (process.env.EXPECTED_CANDIDATE_RELEASE_ID) {
    ensure(before.approvedReleaseId === process.env.EXPECTED_CANDIDATE_RELEASE_ID,
      "full_snapshot_release_mismatch");
  }
  if (process.env.EXPECTED_CANDIDATE_AUTHORITY_EPOCH) {
    ensure(before.authorityEpoch === Number(process.env.EXPECTED_CANDIDATE_AUTHORITY_EPOCH),
      "full_snapshot_epoch_mismatch");
  }

  const started = Date.now();
  const model = new CandidateCanonicalReadModel(runtime.transactions);
  const snapshot = await runtime.transactions.withTransaction({
    deferrable: true,
    idleInTransactionTimeoutMs: 120000,
    isolation: "serializable",
    lockTimeoutMs: 1000,
    maxRetries: 1,
    readOnly: true,
    statementTimeoutMs: 90000,
  }, async (tx) => {
    const roleResult = await tx.query(
      "SELECT current_user, current_setting('transaction_read_only') AS read_only",
    );
    const role = roleResult.rows[0];
    ensure(role?.current_user === "candidate_audit_role" && role.read_only === "on",
      "full_snapshot_database_identity_invalid");
    const raw = await readRawSnapshot(tx, before.policy);
    const sequence = await compareEveryPage({
      buildCandidateCanonicalOracleFromRaw,
      compareCandidateCanonicalReferenceReads,
      model,
      policy: before.policy,
      raw,
      tx,
    });
    return {
      ...sequence,
      databaseNow: raw.databaseNow,
      databaseRole: role.current_user,
      transactionReadOnly: true,
    };
  });
  const after = await contextProvider.read({});
  ensure(after.authorityFingerprint === before.authorityFingerprint,
    "full_snapshot_authority_changed_during_read");

  const body = {
    schemaVersion: SCHEMA_VERSION,
    status: "pass",
    sameDatabaseSnapshot: true,
    transactionIsolation: "serializable_read_only_deferrable",
    migrationId: before.migrationId,
    releaseId: before.approvedReleaseId,
    authorityEpoch: before.authorityEpoch,
    authorityFingerprint: before.authorityFingerprint,
    databaseNow: new Date(snapshot.databaseNow).toISOString(),
    phase: before.phase,
    pageCount: snapshot.pageCount,
    totalEpisodes: snapshot.totalEpisodes,
    returnedEpisodes: snapshot.returnedEpisodes,
    duplicateEpisodeIds: snapshot.duplicateEpisodeIds,
    allPagesVisited: snapshot.allPagesVisited,
    referenceStatus: "ready",
    candidateStatus: "ready",
    differenceCount: 0,
    databaseRole: snapshot.databaseRole,
    transactionReadOnly: snapshot.transactionReadOnly,
    canAuthorizeCutover: false,
    automaticPhaseAdvance: false,
    durationMs: Date.now() - started,
    comparisonHash: hash({
      authorityFingerprint: before.authorityFingerprint,
      comparisonHashes: snapshot.comparisonHashes,
      pageCount: snapshot.pageCount,
      reviewHash: snapshot.reviewHash,
      totalEpisodes: snapshot.totalEpisodes,
    }),
  };
  return body;
}

module.exports = {
  compareEveryPage,
  evaluatePageSequence,
  hash,
  readRawSnapshot,
  run,
};

if (require.main === module) {
  run().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      status: "fail",
      reason: error.message,
    })}\n`);
    process.exitCode = 1;
  });
}
