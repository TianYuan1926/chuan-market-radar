import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { evaluatePageSequence } = require("./full-snapshot-observer.cjs");

const comparisonHash = `sha256:${"a".repeat(64)}`;
const reviewHash = `sha256:${"b".repeat(64)}`;

function page({
  episodeIds,
  hasMore,
  nextCursor,
  totalEpisodes = 3,
  overrides = {},
}) {
  return {
    candidateStatus: "ready",
    referenceStatus: "ready",
    parityStatus: "pass",
    differenceCount: 0,
    comparisonHash,
    returned: episodeIds.length,
    totalEpisodes,
    reviewHash,
    hasMore,
    nextCursor,
    episodeIds,
    ...overrides,
  };
}

test("accepts a complete multi-page chain with no duplicate episodes", () => {
  const result = evaluatePageSequence([
    page({ episodeIds: ["a", "b"], hasMore: true, nextCursor: { episodeId: "b" } }),
    page({ episodeIds: ["c"], hasMore: false, nextCursor: null }),
  ]);
  assert.deepEqual({
    pageCount: result.pageCount,
    totalEpisodes: result.totalEpisodes,
    returnedEpisodes: result.returnedEpisodes,
    duplicateEpisodeIds: result.duplicateEpisodeIds,
    allPagesVisited: result.allPagesVisited,
  }, {
    pageCount: 2,
    totalEpisodes: 3,
    returnedEpisodes: 3,
    duplicateEpisodeIds: 0,
    allPagesVisited: true,
  });
});

test("accepts an empty cohort as one terminal page", () => {
  const result = evaluatePageSequence([
    page({ episodeIds: [], hasMore: false, nextCursor: null, totalEpisodes: 0 }),
  ]);
  assert.equal(result.pageCount, 1);
  assert.equal(result.totalEpisodes, 0);
});

test("rejects first-page-only, duplicate, review drift, and parity failures", () => {
  assert.throws(() => evaluatePageSequence([
    page({ episodeIds: ["a", "b"], hasMore: true, nextCursor: { episodeId: "b" } }),
  ]), /full_snapshot_pagination_chain_invalid/u);

  assert.throws(() => evaluatePageSequence([
    page({ episodeIds: ["a", "b"], hasMore: true, nextCursor: { episodeId: "b" } }),
    page({ episodeIds: ["b"], hasMore: false, nextCursor: null }),
  ]), /full_snapshot_duplicate_episode_ids/u);

  assert.throws(() => evaluatePageSequence([
    page({ episodeIds: ["a", "b"], hasMore: true, nextCursor: { episodeId: "b" } }),
    page({
      episodeIds: ["c"],
      hasMore: false,
      nextCursor: null,
      overrides: { reviewHash: `sha256:${"c".repeat(64)}` },
    }),
  ]), /full_snapshot_review_drift/u);

  assert.throws(() => evaluatePageSequence([
    page({
      episodeIds: ["a", "b", "c"],
      hasMore: false,
      nextCursor: null,
      overrides: { parityStatus: "fail", differenceCount: 1 },
    }),
  ]), /full_snapshot_page_parity_invalid/u);
});
