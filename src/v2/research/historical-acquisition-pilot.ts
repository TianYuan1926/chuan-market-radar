import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../runtime-schema/primitives";
import {
  M2HistoricalAcquisitionPlanSchema,
  M2HistoricalAcquisitionPreflightSchema,
  type M2HistoricalAcquisitionPlan,
  type M2HistoricalAcquisitionPreflight,
} from "./historical-acquisition-contract";

export const M2_HISTORICAL_TECHNICAL_PILOT_RESULT_VERSION =
  "v2-m2-historical-technical-pilot-result.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const SafeByteCountSchema = z.number().int().nonnegative().max(
  Number.MAX_SAFE_INTEGER,
);

const TechnicalPilotResultCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_TECHNICAL_PILOT_RESULT_VERSION),
  planId: NonEmptyStringSchema,
  planDigest: DigestSchema,
  preflightDigest: DigestSchema,
  executedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  status: z.literal("VERIFIED_AND_RAW_DELETED"),
  objectId: NonEmptyStringSchema,
  dataUrl: z.string().url(),
  checksumUrl: z.string().url(),
  expectedSha256: DigestSchema,
  actualSha256: DigestSchema,
  expectedBytes: SafeByteCountSchema,
  actualBytes: SafeByteCountSchema,
  checksumSidecarDigest: DigestSchema,
  resumedFromBytes: NonNegativeIntegerSchema,
  rawPresentAfterCompletion: z.literal(false),
  retainedMaterial: z.literal("DIGEST_AND_TECHNICAL_METADATA_ONLY"),
});

export const M2HistoricalTechnicalPilotResultSchema =
  TechnicalPilotResultCoreSchema.extend({
    resultDigest: DigestSchema,
  }).superRefine((result, context) => {
    if (
      result.actualSha256 !== result.expectedSha256 ||
      result.actualBytes !== result.expectedBytes
    ) {
      context.addIssue({
        code: "custom",
        message: "technical pilot result cannot verify mismatched raw bytes",
        path: ["status"],
      });
    }
    if (Date.parse(result.executedAt) > Date.parse(result.completedAt)) {
      context.addIssue({
        code: "custom",
        message: "technical pilot completion cannot precede execution",
        path: ["completedAt"],
      });
    }
    const { resultDigest, ...core } = result;
    if (resultDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "technical pilot result digest mismatch",
        path: ["resultDigest"],
      });
    }
  });

export type M2HistoricalTechnicalPilotResult = z.infer<
  typeof M2HistoricalTechnicalPilotResultSchema
>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function contentRangeStart(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value);
  return match === null ? null : Number(match[1]);
}

async function fetchAllowlisted(input: Readonly<{
  fetchImpl: FetchLike;
  url: string;
  allowedHosts: ReadonlySet<string>;
  init: RequestInit;
  maximumRedirects: number;
}>): Promise<Response> {
  let currentUrl = input.url;
  for (let redirectCount = 0; ; redirectCount += 1) {
    const parsed = new URL(currentUrl);
    if (
      parsed.protocol !== "https:" ||
      !input.allowedHosts.has(parsed.hostname) ||
      parsed.username !== "" || parsed.password !== ""
    ) {
      throw new Error("historical archive request escaped the HTTPS allowlist");
    }
    const response = await input.fetchImpl(currentUrl, {
      ...input.init,
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    if (redirectCount >= input.maximumRedirects) {
      throw new Error("historical archive redirect limit exceeded");
    }
    const location = response.headers.get("location");
    if (location === null) {
      throw new Error("historical archive redirect omitted its location");
    }
    currentUrl = new URL(location, currentUrl).href;
  }
}

async function boundedResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    throw new Error("historical archive response body is missing");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("historical archive response exceeded its byte cap");
      throw new Error("historical archive response exceeded its byte cap");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function appendBoundedResponse(input: Readonly<{
  response: Response;
  path: string;
  append: boolean;
  maximumTotalBytes: number;
  existingBytes: number;
}>): Promise<number> {
  if (input.response.body === null) {
    throw new Error("historical archive data body is missing");
  }
  const handle = await open(input.path, input.append ? "a" : "w", 0o600);
  let total = input.append ? input.existingBytes : 0;
  try {
    const reader = input.response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > input.maximumTotalBytes) {
        await reader.cancel("historical archive object exceeded its byte cap");
        throw new Error("historical archive object exceeded its byte cap");
      }
      await handle.write(value);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return total;
}

async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertTechnicalPilotInput(
  plan: M2HistoricalAcquisitionPlan,
  preflight: M2HistoricalAcquisitionPreflight,
): void {
  if (
    plan.mode !== "TECHNICAL_PILOT_ONLY" || plan.objects.length !== 1 ||
    plan.postVerificationDisposition !==
      "DELETE_RAW_AFTER_TECHNICAL_VERIFICATION"
  ) {
    throw new Error("executor accepts only one-object delete-after-check pilot plans");
  }
  if (
    preflight.decision !== "ALLOW" || preflight.planId !== plan.planId ||
    preflight.planDigest !== plan.planDigest
  ) {
    throw new Error("technical pilot requires a matching allowed preflight");
  }
}

export async function executeM2HistoricalTechnicalPilot(input: Readonly<{
  plan: M2HistoricalAcquisitionPlan;
  preflight: M2HistoricalAcquisitionPreflight;
  executedAt: string;
  fetchImpl?: FetchLike;
  now?: () => string;
}>): Promise<M2HistoricalTechnicalPilotResult> {
  const plan = M2HistoricalAcquisitionPlanSchema.parse(input.plan);
  const preflight = M2HistoricalAcquisitionPreflightSchema.parse(
    input.preflight,
  );
  assertTechnicalPilotInput(plan, preflight);
  const object = plan.objects[0]!;
  if (
    object.expectedSha256 === null ||
    object.measuredCompressedBytes === null
  ) {
    throw new Error("technical pilot object lacks a frozen checksum or size");
  }
  const allowedHosts = new Set(plan.archiveHostAllowlist);
  const fetchImpl = input.fetchImpl ?? fetch;
  const outputRoot = resolve(preflight.outputRoot);
  const objectDirectory = join(
    outputRoot,
    "technical-pilot",
    stableSha256({ objectId: object.objectId }),
  );
  await mkdir(objectDirectory, { recursive: true, mode: 0o700 });
  const partialPath = join(objectDirectory, `${object.expectedFileName}.partial`);
  const verifiedPath = join(objectDirectory, `${object.expectedFileName}.verified`);
  let resumedFromBytes = 0;
  try {
    const checksumResponse = await fetchAllowlisted({
      fetchImpl,
      url: object.checksumUrl,
      allowedHosts,
      init: {
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(30_000),
      },
      maximumRedirects: 3,
    });
    if (!checksumResponse.ok) {
      throw new Error(`provider checksum request failed: ${checksumResponse.status}`);
    }
    const checksumBytes = await boundedResponseBytes(checksumResponse, 1_024);
    const checksumText = new TextDecoder("utf-8", { fatal: true })
      .decode(checksumBytes).trim();
    const checksumMatch = /^([0-9a-f]{64}) {1,2}([^/\\\r\n]+)$/u.exec(
      checksumText,
    );
    if (
      checksumMatch === null ||
      checksumMatch[2] !== object.expectedFileName ||
      `sha256:${checksumMatch[1]}` !== object.expectedSha256
    ) {
      throw new Error("provider checksum sidecar disagrees with the frozen plan");
    }

    const partialStat = await stat(partialPath).catch(() => null);
    resumedFromBytes = partialStat?.size ?? 0;
    if (resumedFromBytes > object.measuredCompressedBytes) {
      await rm(partialPath, { force: true });
      resumedFromBytes = 0;
    }
    const requestHeaders: Record<string, string> = {
      "accept-encoding": "identity",
    };
    if (resumedFromBytes > 0) {
      requestHeaders.range = `bytes=${resumedFromBytes}-`;
    }
    const dataResponse = await fetchAllowlisted({
      fetchImpl,
      url: object.dataUrl,
      allowedHosts,
      init: {
        headers: requestHeaders,
        signal: AbortSignal.timeout(120_000),
      },
      maximumRedirects: 3,
    });
    if (resumedFromBytes > 0 && dataResponse.status === 200) {
      await rm(partialPath, { force: true });
      resumedFromBytes = 0;
    } else if (
      resumedFromBytes > 0 &&
      (dataResponse.status !== 206 ||
        contentRangeStart(dataResponse.headers.get("content-range")) !==
          resumedFromBytes)
    ) {
      throw new Error("provider returned an invalid ranged archive response");
    }
    if (resumedFromBytes === 0 && dataResponse.status !== 200) {
      if (dataResponse.status === 206) {
        throw new Error("provider returned an unsolicited partial response");
      }
      throw new Error(`provider archive request failed: ${dataResponse.status}`);
    }
    const contentLength = dataResponse.headers.get("content-length");
    if (contentLength !== null) {
      const responseBytes = Number(contentLength);
      const expectedResponseBytes =
        object.measuredCompressedBytes - resumedFromBytes;
      if (
        !Number.isSafeInteger(responseBytes) || responseBytes < 0 ||
        responseBytes !== expectedResponseBytes
      ) {
        throw new Error("provider archive content length disagrees with the plan");
      }
    }
    const actualBytes = await appendBoundedResponse({
      response: dataResponse,
      path: partialPath,
      append: resumedFromBytes > 0,
      maximumTotalBytes: object.measuredCompressedBytes,
      existingBytes: resumedFromBytes,
    });
    if (actualBytes !== object.measuredCompressedBytes) {
      throw new Error("downloaded archive byte count disagrees with the plan");
    }
    const actualSha256 = await sha256File(partialPath);
    if (actualSha256 !== object.expectedSha256) {
      throw new Error("downloaded archive checksum disagrees with the provider");
    }
    await rename(partialPath, verifiedPath);
    await rm(verifiedPath, { force: true });
    const completedAt = IsoDateTimeSchema.parse(
      (input.now ?? (() => new Date().toISOString()))(),
    );
    const core = TechnicalPilotResultCoreSchema.parse({
      schemaVersion: M2_HISTORICAL_TECHNICAL_PILOT_RESULT_VERSION,
      planId: plan.planId,
      planDigest: plan.planDigest,
      preflightDigest: preflight.preflightDigest,
      executedAt: IsoDateTimeSchema.parse(input.executedAt),
      completedAt,
      status: "VERIFIED_AND_RAW_DELETED",
      objectId: object.objectId,
      dataUrl: object.dataUrl,
      checksumUrl: object.checksumUrl,
      expectedSha256: object.expectedSha256,
      actualSha256,
      expectedBytes: object.measuredCompressedBytes,
      actualBytes,
      checksumSidecarDigest:
        `sha256:${createHash("sha256").update(checksumBytes).digest("hex")}`,
      resumedFromBytes,
      rawPresentAfterCompletion: false,
      retainedMaterial: "DIGEST_AND_TECHNICAL_METADATA_ONLY",
    });
    const result = M2HistoricalTechnicalPilotResultSchema.parse({
      ...core,
      resultDigest: stableContentHash(core),
    });
    await writeFile(
      join(
        objectDirectory,
        `technical-verification-result.${result.resultDigest.slice("sha256:".length)}.json`,
      ),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    return deepFreezeArtifact(result);
  } finally {
    await rm(partialPath, { force: true });
    await rm(verifiedPath, { force: true });
  }
}
