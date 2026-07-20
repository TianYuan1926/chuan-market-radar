import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  M2_DRAFT_DETECTORS,
} from "../modules/detection/draft-replay-contract";
import { stableSha256 } from "../modules/universe/stable-artifact";
import {
  M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
  buildM2HistoricalAcquisitionPlan,
  evaluateM2HistoricalAcquisitionPreflight,
} from "./historical-acquisition-contract";
import {
  executeM2HistoricalTechnicalPilot,
} from "./historical-acquisition-pilot";
import {
  M2_BINANCE_VISION_SOURCE_ASSESSMENT,
  M2_BINANCE_VISION_SOURCE_QUALIFICATION,
} from "./historical-source-registry";

const EXECUTED_AT = "2026-07-20T08:00:00.000Z";
const COMPLETED_AT = "2026-07-20T08:00:01.000Z";
const FILE_NAME = "TESTUSDT-1m-2026-06.zip";

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function responseBody(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function pilotPlan(bytes: Uint8Array) {
  const expectedSha256 = sha256(bytes);
  return buildM2HistoricalAcquisitionPlan({
    schemaVersion: M2_HISTORICAL_ACQUISITION_PLAN_VERSION,
    planName: "test-technical-pilot",
    generatedAt: EXECUTED_AT,
    sourceQualificationId:
      M2_BINANCE_VISION_SOURCE_QUALIFICATION.qualificationId,
    sourceQualificationDigest:
      M2_BINANCE_VISION_SOURCE_QUALIFICATION.qualificationDigest,
    sourceAssessmentDigest:
      M2_BINANCE_VISION_SOURCE_ASSESSMENT.assessmentDigest,
    mode: "TECHNICAL_PILOT_ONLY",
    providerId: "BINANCE_USDS_FUTURES",
    archiveHostAllowlist: ["data.binance.vision"],
    coverage: {
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    selectedDetectorIds: [
      M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
    ],
    objects: [{
      objectId: "test-object",
      canonicalInstrumentId: "TEST:LINEAR_PERPETUAL:TEST:USDT:TESTUSDT",
      providerSymbol: "TESTUSDT",
      datasetKind: "KLINE_1M",
      period: "2026-06",
      dataUrl: `https://data.binance.vision/${FILE_NAME}`,
      checksumUrl: `https://data.binance.vision/${FILE_NAME}.CHECKSUM`,
      expectedFileName: FILE_NAME,
      expectedSha256,
      measuredCompressedBytes: bytes.byteLength,
      measurementObservedAt: EXECUTED_AT,
    }],
    budget: {
      objectCountMaximum: 1,
      compressedBytesMaximum: bytes.byteLength,
      extractedBytesMaximum: bytes.byteLength * 4,
      temporaryBytesMaximum: bytes.byteLength,
      minimumFreeBytesAfterCompletion: 1_000_000,
      requiredFreeBytes: 1_000_000 + bytes.byteLength * 6,
    },
    rawDataGitPolicy: "RAW_BYTES_OUTSIDE_WORKTREE_ONLY",
    postVerificationDisposition: "DELETE_RAW_AFTER_TECHNICAL_VERIFICATION",
    redirectPolicy: "REJECT_REDIRECT_OUTSIDE_ALLOWLIST",
    resumePolicy: "ATOMIC_PARTIAL_WITH_RANGE_VALIDATION",
    checksumPolicy: "VERIFY_PROVIDER_SHA256_BEFORE_PROMOTION",
  });
}

function allowedPreflight(
  plan: ReturnType<typeof pilotPlan>,
  outputRoot: string,
) {
  return evaluateM2HistoricalAcquisitionPreflight({
    plan,
    qualification: M2_BINANCE_VISION_SOURCE_QUALIFICATION,
    assessment: M2_BINANCE_VISION_SOURCE_ASSESSMENT,
    evaluatedAt: EXECUTED_AT,
    outputRoot,
    worktreeRoot: "/workspace/market-radar",
    availableBytes: 200_000_000_000,
  });
}

function archiveFetch(bytes: Uint8Array) {
  const expectedHex = sha256(bytes).slice("sha256:".length);
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(".CHECKSUM")) {
      return new Response(`${expectedHex}  ${FILE_NAME}\n`, { status: 200 });
    }
    const range = new Headers(init?.headers).get("range");
    if (range !== null) {
      const match = /^bytes=(\d+)-$/u.exec(range);
      assert.ok(match);
      const start = Number(match[1]);
      return new Response(responseBody(bytes.slice(start)), {
        status: 206,
        headers: {
          "content-length": String(bytes.byteLength - start),
          "content-range":
            `bytes ${start}-${bytes.byteLength - 1}/${bytes.byteLength}`,
        },
      });
    }
    return new Response(responseBody(bytes), {
      status: 200,
      headers: { "content-length": String(bytes.byteLength) },
    });
  };
}

test("technical pilot verifies provider checksum and deletes every raw byte", async () => {
  const bytes = new TextEncoder().encode("test historical archive bytes");
  const outputRoot = await mkdtemp(join(tmpdir(), "m2-pilot-test-"));
  try {
    const plan = pilotPlan(bytes);
    const preflight = allowedPreflight(plan, outputRoot);
    assert.equal(preflight.decision, "ALLOW");
    const result = await executeM2HistoricalTechnicalPilot({
      plan,
      preflight,
      executedAt: EXECUTED_AT,
      fetchImpl: archiveFetch(bytes),
      now: () => COMPLETED_AT,
    });
    assert.equal(result.status, "VERIFIED_AND_RAW_DELETED");
    assert.equal(result.actualSha256, sha256(bytes));
    assert.equal(result.actualBytes, bytes.byteLength);
    assert.equal(result.rawPresentAfterCompletion, false);
    const objectDirectory = join(
      outputRoot,
      "technical-pilot",
      stableSha256({ objectId: "test-object" }),
    );
    await assert.rejects(stat(join(objectDirectory, FILE_NAME)));
    await assert.rejects(stat(join(objectDirectory, `${FILE_NAME}.partial`)));
    await assert.rejects(stat(join(objectDirectory, `${FILE_NAME}.verified`)));
    const retainedResult = JSON.parse(await readFile(
      join(
        objectDirectory,
        `technical-verification-result.${result.resultDigest.slice("sha256:".length)}.json`,
      ),
      "utf8",
    )) as { resultDigest: string };
    assert.equal(retainedResult.resultDigest, result.resultDigest);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("technical pilot resumes only from a validated byte range", async () => {
  const bytes = new TextEncoder().encode("0123456789-archive-body");
  const outputRoot = await mkdtemp(join(tmpdir(), "m2-pilot-resume-"));
  try {
    const plan = pilotPlan(bytes);
    const objectDirectory = join(
      outputRoot,
      "technical-pilot",
      stableSha256({ objectId: "test-object" }),
    );
    await mkdir(objectDirectory, { recursive: true });
    await writeFile(
      join(objectDirectory, `${FILE_NAME}.partial`),
      bytes.slice(0, 10),
    );
    const result = await executeM2HistoricalTechnicalPilot({
      plan,
      preflight: allowedPreflight(plan, outputRoot),
      executedAt: EXECUTED_AT,
      fetchImpl: archiveFetch(bytes),
      now: () => COMPLETED_AT,
    });
    assert.equal(result.resumedFromBytes, 10);
    assert.equal(result.actualSha256, sha256(bytes));
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("checksum mismatch fails closed and removes partial raw bytes", async () => {
  const expected = new TextEncoder().encode("expected archive");
  const corrupted = new TextEncoder().encode("corrupt! archive");
  assert.equal(corrupted.byteLength, expected.byteLength);
  const outputRoot = await mkdtemp(join(tmpdir(), "m2-pilot-corrupt-"));
  try {
    const plan = pilotPlan(expected);
    const expectedHex = sha256(expected).slice("sha256:".length);
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      return url.endsWith(".CHECKSUM")
        ? new Response(`${expectedHex}  ${FILE_NAME}\n`, { status: 200 })
        : new Response(responseBody(corrupted), {
          status: 200,
          headers: { "content-length": String(corrupted.byteLength) },
        });
    };
    await assert.rejects(
      executeM2HistoricalTechnicalPilot({
        plan,
        preflight: allowedPreflight(plan, outputRoot),
        executedAt: EXECUTED_AT,
        fetchImpl,
        now: () => COMPLETED_AT,
      }),
      /downloaded archive checksum disagrees with the provider/u,
    );
    const partialPath = join(
      outputRoot,
      "technical-pilot",
      stableSha256({ objectId: "test-object" }),
      `${FILE_NAME}.partial`,
    );
    await assert.rejects(stat(partialPath));
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("redirects outside the frozen host allowlist are rejected", async () => {
  const bytes = new TextEncoder().encode("archive");
  const outputRoot = await mkdtemp(join(tmpdir(), "m2-pilot-redirect-"));
  try {
    const plan = pilotPlan(bytes);
    await assert.rejects(
      executeM2HistoricalTechnicalPilot({
        plan,
        preflight: allowedPreflight(plan, outputRoot),
        executedAt: EXECUTED_AT,
        fetchImpl: async () => new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/object.zip" },
        }),
        now: () => COMPLETED_AT,
      }),
      /escaped the HTTPS allowlist/u,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
