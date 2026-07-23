import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
} from "../source-conformance/source-conformance-contract";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  buildM1RuntimeAdapterProfileSet,
  type M1RuntimeAdapterProfile,
} from "../collector/runtime-adapter-profile";
import {
  M1ListingHistoryCheckpointSchema,
  M1ListingHistoryGapSchema,
  advanceM1ListingHistory,
  buildM1ListingHistoryRequest,
  parseM1ListingHistoryPage,
  type M1ListingHistoryCheckpoint,
  type M1ListingHistoryPage,
} from "./listing-history-runtime";
import { stableContentHash } from "../universe/stable-artifact";

const CONFORMANCE_RELEASE = "a".repeat(40);
const RUNTIME_RELEASE = "b".repeat(40);
const PROFILE_GENERATED_AT = "2026-07-24T02:00:00.000Z";
const CUTOFF_1 = "2026-07-24T02:10:00.000Z";
const CUTOFF_2 = "2026-07-24T02:20:00.000Z";

function liveArtifact() {
  const probes = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS.map(
    (definition, index) =>
      M1SourceConformanceProbeObservationSchema.parse({
        probeId: definition.probeId,
        sourceId: definition.sourceId,
        capabilityId: definition.capabilityId,
        gate: definition.gate,
        definitionDigest: definition.definitionDigest,
        evidenceClass: "LIVE_READ_ONLY",
        outcome: "PASS",
        attemptStartedAt: "2026-07-24T01:59:58.000Z",
        receivedAt: "2026-07-24T01:59:59.000Z",
        latencyMs: 1_000,
        httpStatus: 200,
        responseBodyDigest:
          `sha256:${(index + 1).toString(16).padStart(64, "0")}`,
        responseBytes: 1_000,
        topLevelKeys: ["data"],
        recordKeys: ["id"],
        observedRecordCount: 1,
        providerServerTime: null,
        absoluteClockSkewMs: null,
        paginationStatus:
          definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
            ? "BOUNDED_COMPLETE"
            : definition.paginationExpectation === "MUST_TERMINATE"
              ? "COMPLETE"
              : "NOT_APPLICABLE",
        credentialDisposition: definition.requiresReadOnlyApiKey
          ? "READ_ONLY_KEY_USED_NOT_RETAINED"
          : "PUBLIC_NO_CREDENTIAL",
        failure: null,
        reasonCodes: [],
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }),
  );
  return buildM1SourceConformanceArtifact({
    releaseId: CONFORMANCE_RELEASE,
    generatedAt: "2026-07-24T01:59:59.000Z",
    sourceCutoff: "2026-07-24T01:59:59.000Z",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    probes,
  });
}

function listingProfile(
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
): M1RuntimeAdapterProfile {
  const set = buildM1RuntimeAdapterProfileSet({
    runtimeReleaseId: RUNTIME_RELEASE,
    generatedAt: PROFILE_GENERATED_AT,
    conformanceArtifact: liveArtifact(),
  });
  const profile = set.profiles.find((candidate) =>
    candidate.sourceId === sourceId &&
    candidate.capabilityId === "LISTING_ANNOUNCEMENT"
  );
  assert.ok(profile);
  return profile;
}

type BybitRecord = Readonly<{
  key?: string;
  publishedAt: number;
  title?: string;
  url?: string;
}>;

function bybitPayload(
  records: readonly BybitRecord[],
  total: number,
) {
  return {
    retCode: 0,
    result: {
      total,
      list: records.map((record, index) => ({
        title: record.title ?? `Listing ${record.key ?? index}`,
        type: { key: "new_crypto" },
        tags: ["Spot", "Spot Listings"],
        url: record.url ??
          `https://announcements.bybit.com/en-US/article/${
            record.key ?? index
          }`,
        publishTime: record.publishedAt,
      })),
    },
    time: 1_753_323_000_000,
  };
}

function bitgetPayload(
  records: readonly Readonly<{
    id: string;
    publishedAt: number;
    title?: string;
  }>[],
) {
  return {
    code: "00000",
    requestTime: 1_753_323_000_000,
    data: records.map((record) => ({
      annId: record.id,
      annTitle: record.title ?? `Listing ${record.id}`,
      annUrl: `https://www.bitget.com/support/articles/${record.id}`,
      cTime: String(record.publishedAt),
      annType: "coin_listings",
      annSubType: "spot",
    })),
  };
}

function page(input: {
  profile: M1RuntimeAdapterProfile;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  ordinal: number;
  token: string;
  receivedAt: string;
  payload: unknown;
}): M1ListingHistoryPage {
  return parseM1ListingHistoryPage({
    profile: input.profile,
    mode: input.mode,
    pageOrdinal: input.ordinal,
    requestToken: input.token,
    receivedAt: input.receivedAt,
    responseBodyHash: stableContentHash(input.payload),
    payload: input.payload,
  });
}

function committedCheckpoint(
  result: ReturnType<typeof advanceM1ListingHistory>,
): M1ListingHistoryCheckpoint {
  assert.equal(result.status, "COMMITTED");
  assert.ok(result.checkpoint);
  return result.checkpoint;
}

test("Bybit bootstrap traverses provider history beyond the two-page conformance window", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const firstRecords = Array.from({ length: 20 }, (_, index) => ({
    key: `bybit-${index}`,
    publishedAt: 1_753_322_000_000 - index * 1_000,
  }));
  const secondRecords = [{
    key: "bybit-20",
    publishedAt: 1_753_321_000_000,
  }];
  const first = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 1,
    token: "page:1",
    receivedAt: "2026-07-24T02:05:00.000Z",
    payload: bybitPayload(firstRecords, 21),
  });
  const second = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 2,
    token: "page:2",
    receivedAt: "2026-07-24T02:06:00.000Z",
    payload: bybitPayload(secondRecords, 21),
  });
  const checkpoint = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [first, second],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));

  assert.equal(checkpoint.status, "BOOTSTRAP_COMPLETE");
  assert.equal(checkpoint.announcementCount, 21);
  assert.equal(checkpoint.pageCount, 2);
  assert.equal(checkpoint.providerHistoryComplete, true);
  assert.equal(checkpoint.providerWindowComplete, false);
  assert.equal(checkpoint.candidateEmissionAllowed, false);
  assert.equal(checkpoint.strategyAuthorityGranted, false);
  assert.equal(checkpoint.readyAuthorityGranted, false);
  assert.equal(Object.isFrozen(checkpoint), true);
});

test("bootstrap checkpoint resumes from the exact next page without restarting", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const firstRecords = Array.from({ length: 20 }, (_, index) => ({
    key: `resume-${index}`,
    publishedAt: 1_753_322_000_000 - index * 1_000,
  }));
  const first = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 1,
    token: "page:1",
    receivedAt: "2026-07-24T02:05:00.000Z",
    payload: bybitPayload(firstRecords, 21),
  });
  const partial = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [first],
    segmentStop: "SEGMENT_PAGE_LIMIT",
    generatedAt: "2026-07-24T02:06:00.000Z",
    sourceCutoff: "2026-07-24T02:06:00.000Z",
  }));

  assert.equal(partial.status, "BOOTSTRAP_IN_PROGRESS");
  assert.equal(partial.nextBootstrapRequestToken, "page:2");
  const request = buildM1ListingHistoryRequest({
    profile,
    mode: "BOOTSTRAP",
    checkpoint: partial,
  });
  assert.equal(request.requestToken, "page:2");
  assert.equal(new URL(request.url).searchParams.get("page"), "2");

  const second = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 1,
    token: "page:2",
    receivedAt: "2026-07-24T02:07:00.000Z",
    payload: bybitPayload([{
      key: "resume-20",
      publishedAt: 1_753_321_000_000,
    }], 21),
  });
  const completed = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: partial,
    pages: [second],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));

  assert.equal(completed.status, "BOOTSTRAP_COMPLETE");
  assert.equal(completed.announcementCount, 21);
  assert.equal(completed.pageCount, 2);
});

test("incremental history must overlap the committed checkpoint before advancing", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const oldPayload = bybitPayload([
    { key: "known-1", publishedAt: 1_753_320_000_000 },
    { key: "known-2", publishedAt: 1_753_319_000_000 },
  ], 2);
  const bootstrap = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: oldPayload,
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));
  const incrementalPayload = bybitPayload([
    { key: "new-1", publishedAt: 1_753_323_000_000 },
    { key: "known-1", publishedAt: 1_753_320_000_000 },
    { key: "known-2", publishedAt: 1_753_319_000_000 },
  ], 3);
  const current = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "INCREMENTAL",
    priorCheckpoint: bootstrap,
    pages: [page({
      profile,
      mode: "INCREMENTAL",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:15:00.000Z",
      payload: incrementalPayload,
    })],
    segmentStop: "PRIOR_CHECKPOINT_OVERLAP",
    generatedAt: CUTOFF_2,
    sourceCutoff: CUTOFF_2,
  }));

  assert.equal(current.status, "INCREMENTAL_CURRENT");
  assert.equal(current.announcementCount, 3);
  assert.equal(current.lastIncrementalOverlapCount, 2);
  assert.equal(current.providerHistoryComplete, true);
});

test("incremental scan without prior overlap records a gap and preserves the checkpoint", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const bootstrap = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bybitPayload([{
        key: "known",
        publishedAt: 1_753_320_000_000,
      }], 1),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));
  const result = advanceM1ListingHistory({
    profile,
    mode: "INCREMENTAL",
    priorCheckpoint: bootstrap,
    pages: [page({
      profile,
      mode: "INCREMENTAL",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:15:00.000Z",
      payload: bybitPayload([{
        key: "new-without-overlap",
        publishedAt: 1_753_323_000_000,
      }], 1),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_2,
    sourceCutoff: CUTOFF_2,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(result.checkpoint, null);
  assert.equal(result.gap?.reason, "NO_CHECKPOINT_OVERLAP");
  assert.equal(result.gap?.priorCheckpointHash, bootstrap.contentHash);
  assert.equal(result.gap?.checkpointAdvanced, false);
  assert.equal(bootstrap.status, "BOOTSTRAP_COMPLETE");
  assert.equal(M1ListingHistoryGapSchema.safeParse(result.gap).success, true);
});

test("same announcement id with changed content blocks atomic advancement", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const fixedUrl =
    "https://announcements.bybit.com/en-US/article/fixed-identity";
  const publishedAt = 1_753_320_000_000;
  const bootstrap = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bybitPayload([{
        key: "same",
        title: "Original",
        url: fixedUrl,
        publishedAt,
      }], 1),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));
  const result = advanceM1ListingHistory({
    profile,
    mode: "INCREMENTAL",
    priorCheckpoint: bootstrap,
    pages: [page({
      profile,
      mode: "INCREMENTAL",
      ordinal: 1,
      token: "page:1",
      receivedAt: "2026-07-24T02:15:00.000Z",
      payload: bybitPayload([{
        key: "same",
        title: "Changed",
        url: fixedUrl,
        publishedAt,
      }], 1),
    })],
    segmentStop: "PRIOR_CHECKPOINT_OVERLAP",
    generatedAt: CUTOFF_2,
    sourceCutoff: CUTOFF_2,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(
    result.gap?.reason,
    "ANNOUNCEMENT_ID_CONTENT_CONFLICT",
  );
  assert.equal(result.checkpoint, null);
});

test("repeated or discontinuous page tokens fail closed", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const records = Array.from({ length: 20 }, (_, index) => ({
    key: `repeat-${index}`,
    publishedAt: 1_753_322_000_000 - index * 1_000,
  }));
  const first = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 1,
    token: "page:1",
    receivedAt: "2026-07-24T02:05:00.000Z",
    payload: bybitPayload(records, 40),
  });
  const repeated = page({
    profile,
    mode: "BOOTSTRAP",
    ordinal: 2,
    token: "page:1",
    receivedAt: "2026-07-24T02:06:00.000Z",
    payload: bybitPayload(records, 40),
  });
  const result = advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [first, repeated],
    segmentStop: "SEGMENT_PAGE_LIMIT",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(result.gap?.reason, "REPEATED_REQUEST_TOKEN");
});

test("segment-local page ordinals must be contiguous from one", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const result = advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 2,
      token: "page:1",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bybitPayload([{
        key: "ordinal-gap",
        publishedAt: 1_753_322_000_000,
      }], 1),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(result.gap?.reason, "PAGE_ORDINAL_DISCONTINUITY");
  assert.equal(result.gap?.expectedRequestToken, "1");
  assert.equal(result.gap?.observedRequestToken, "2");
});

test("listing history cannot exceed the profile segment request bound", () => {
  const profile = listingProfile("BYBIT_DERIVATIVES");
  const pages = Array.from({ length: 65 }, (_, index) =>
    page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: index + 1,
      token: `page:${index + 1}`,
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bybitPayload([{
        key: `bounded-${index}`,
        publishedAt: 1_753_322_000_000 - index * 1_000,
      }], 1_300),
    })
  );
  const result = advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages,
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(result.gap?.reason, "INVALID_SEGMENT_STOP");
  assert.equal(result.gap?.checkpointAdvanced, false);
});

test("Bitget checkpoint proves only the official rolling one-month window", () => {
  const profile = listingProfile("BITGET_FUTURES");
  const payload = bitgetPayload([
    { id: "3", publishedAt: 1_753_323_000_000 },
    { id: "2", publishedAt: 1_753_322_000_000 },
    { id: "1", publishedAt: 1_753_321_000_000 },
  ]);
  const checkpoint = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "ROOT",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload,
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));

  assert.equal(
    checkpoint.historyResponsibility,
    "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED",
  );
  assert.equal(checkpoint.providerWindowComplete, true);
  assert.equal(checkpoint.providerHistoryComplete, false);
  assert.equal(checkpoint.announcementCount, 3);
});

test("Bitget cursor resume uses the last provider announcement id exactly", () => {
  const profile = listingProfile("BITGET_FUTURES");
  const records = Array.from({ length: 10 }, (_, index) => ({
    id: String(10 - index),
    publishedAt: 1_753_323_000_000 - index * 1_000,
  }));
  const partial = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "ROOT",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bitgetPayload(records),
    })],
    segmentStop: "SEGMENT_PAGE_LIMIT",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));
  const request = buildM1ListingHistoryRequest({
    profile,
    mode: "BOOTSTRAP",
    checkpoint: partial,
  });

  assert.equal(partial.nextBootstrapRequestToken, "cursor:1");
  assert.equal(request.requestToken, "cursor:1");
  assert.equal(new URL(request.url).searchParams.get("cursor"), "1");
  assert.equal(request.credentialRequired, false);
  assert.equal(request.rawBodyRetentionAllowed, false);
});

test("future page knowledge cannot advance a historical checkpoint", () => {
  const profile = listingProfile("BITGET_FUTURES");
  const result = advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "ROOT",
      receivedAt: "2026-07-24T02:11:00.000Z",
      payload: bitgetPayload([{
        id: "future",
        publishedAt: 1_753_323_000_000,
      }]),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  });

  assert.equal(result.status, "BLOCKED_GAP");
  assert.equal(result.gap?.reason, "FUTURE_KNOWLEDGE");
});

test("checkpoint schema rejects authority and content-hash tampering", () => {
  const profile = listingProfile("BITGET_FUTURES");
  const checkpoint = committedCheckpoint(advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page({
      profile,
      mode: "BOOTSTRAP",
      ordinal: 1,
      token: "ROOT",
      receivedAt: "2026-07-24T02:05:00.000Z",
      payload: bitgetPayload([{
        id: "one",
        publishedAt: 1_753_323_000_000,
      }]),
    })],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: CUTOFF_1,
    sourceCutoff: CUTOFF_1,
  }));
  const tampered = structuredClone(checkpoint);
  tampered.contentHash = `sha256:${"0".repeat(64)}`;

  assert.equal(
    M1ListingHistoryCheckpointSchema.safeParse(tampered).success,
    false,
  );
});
