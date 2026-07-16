import type { JournalEvent } from "../analysis/types";
import {
  CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
  CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED,
  executeCandidateReadRoute,
  normalizeCandidateCanonicalReadCursor,
  normalizeCandidateCanonicalReadPolicy,
  type CandidateCanonicalReadCursor,
  type CandidateCanonicalReadPolicy,
  type CandidateCanonicalReadResult,
  type CandidateReadRouteMode,
} from "./canonical-read-model";
import type { CandidateCanonicalOracleComparison } from "./canonical-read-oracle";
import {
  buildCandidateCanonicalApiResource,
  type CandidateCanonicalApiResource,
  type CandidateReadResourceMode,
} from "./canonical-read-resource";
import {
  assertCandidateTrustedReadContext,
  type CandidateTrustedReadContext,
  type CandidateTrustedReadControl,
} from "./canonical-read-trusted-context";
import { buildLegacyCandidateDiagnosticRead } from "./legacy-read-diagnostic";

export const CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION =
  "candidate-canonical-api-route.v1" as const;
export const CANDIDATE_API_ROUTE_DEFAULT_LIMIT = 100;
export const CANDIDATE_API_ROUTE_MAXIMUM_LIMIT = 1_000;
export const CANDIDATE_API_ROUTE_CONTROL_TIMEOUT_MS = 2_000;
export const CANDIDATE_API_ROUTE_DATA_TIMEOUT_MS = 15_000;

const QUERY_ALLOWLIST = new Set([
  "limit",
  "cursorFirstSeenAt",
  "cursorEpisodeId",
]);

export type CandidateReadRouteRequest = Readonly<{
  limit: number;
  cursor: CandidateCanonicalReadCursor | null;
}>;

export type CandidateReadRouteAdapterError =
  | "invalid_candidate_read_request"
  | "candidate_read_control_unavailable"
  | "candidate_read_dependency_unavailable"
  | "candidate_read_unavailable";

type CandidateReadRouteBody =
  | Readonly<{ ok: true; resource: CandidateCanonicalApiResource }>
  | Readonly<{
    ok: false;
    error: CandidateReadRouteAdapterError;
    blockers: readonly string[];
    resource: CandidateCanonicalApiResource | null;
  }>;

export type CandidateReadRouteAdapterResponse = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION;
  statusCode: 200 | 400 | 503;
  headers: Readonly<Record<string, string>>;
  body: CandidateReadRouteBody;
}>;

export type CandidateReadRouteAdapterDependencies = Readonly<{
  readTrustedContext: (
    context: Readonly<{ signal: AbortSignal }>,
  ) => Promise<CandidateTrustedReadContext>;
  readLegacyEvents: (input: Readonly<{
    policy: CandidateCanonicalReadPolicy;
    maximumEvents: number;
    signal: AbortSignal;
  }>) => Promise<readonly JournalEvent[]>;
  readCandidate: (input: Readonly<{
    policy: CandidateCanonicalReadPolicy;
    cursor: CandidateCanonicalReadCursor | null;
    limit: number;
    signal: AbortSignal;
  }>) => Promise<CandidateCanonicalReadResult>;
  compareCandidateReference: (input: Readonly<{
    policy: CandidateCanonicalReadPolicy;
    cursor: CandidateCanonicalReadCursor | null;
    limit: number;
    signal: AbortSignal;
  }>) => Promise<CandidateCanonicalOracleComparison>;
}>;

function unavailableCandidate(): CandidateCanonicalReadResult {
  return {
    schemaVersion: CANDIDATE_CANONICAL_READ_SCHEMA_VERSION,
    status: "unavailable",
    authority: "candidate_authority",
    allowedUse: "candidate_lifecycle_and_review_only",
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    policy: null,
    reason: "candidate_database_read_failed",
    databaseNow: null,
    episodes: null,
    page: null,
    review: null,
    contentHash: null,
  };
}

async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  reason: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(reason));
          controller.abort(reason);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function headers({
  authority,
  source,
  status,
}: {
  authority: string;
  source: string;
  status: string;
}) {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-chuan-authority": authority,
    "x-chuan-contract": CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION,
    "x-chuan-data-status": status,
    "x-chuan-read-source": source,
  } as const;
}

function errorResponse(
  statusCode: 400 | 503,
  error: Exclude<CandidateReadRouteAdapterError, "candidate_read_unavailable">,
  blockers: readonly string[],
): CandidateReadRouteAdapterResponse {
  return {
    schemaVersion: CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION,
    statusCode,
    headers: headers({
      authority: "resource_contract_unavailable",
      source: "none",
      status: "unavailable",
    }),
    body: {
      ok: false,
      error,
      blockers: [...new Set(blockers)].sort(),
      resource: null,
    },
  };
}

export function buildCandidateReadHttpResponse(
  resource: CandidateCanonicalApiResource,
): CandidateReadRouteAdapterResponse {
  const responseHeaders = headers({
    authority: resource.authority,
    source: resource.readSource,
    status: resource.status,
  });
  if (resource.status === "unavailable") {
    return {
      schemaVersion: CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION,
      statusCode: 503,
      headers: responseHeaders,
      body: {
        ok: false,
        error: "candidate_read_unavailable",
        blockers: resource.blockers,
        resource,
      },
    };
  }
  return {
    schemaVersion: CANDIDATE_CANONICAL_API_ROUTE_SCHEMA_VERSION,
    statusCode: 200,
    headers: responseHeaders,
    body: { ok: true, resource },
  };
}

export function parseCandidateReadRouteRequest(
  query: URLSearchParams,
): Readonly<
  | { status: "valid"; request: CandidateReadRouteRequest }
  | { status: "invalid"; blockers: readonly string[] }
> {
  const blockers: string[] = [];
  for (const key of new Set(query.keys())) {
    if (!QUERY_ALLOWLIST.has(key)) blockers.push(`candidate_read_query_unknown:${key}`);
    if (query.getAll(key).length !== 1) blockers.push(`candidate_read_query_duplicate:${key}`);
  }

  const limitValue = query.get("limit");
  const limit = limitValue === null ? CANDIDATE_API_ROUTE_DEFAULT_LIMIT : Number(limitValue);
  if (limitValue !== null && !/^[1-9][0-9]{0,3}$/.test(limitValue)) {
    blockers.push("candidate_read_limit_invalid");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CANDIDATE_API_ROUTE_MAXIMUM_LIMIT) {
    blockers.push("candidate_read_limit_out_of_range");
  }

  const cursorFirstSeenAt = query.get("cursorFirstSeenAt");
  const cursorEpisodeId = query.get("cursorEpisodeId");
  if ((cursorFirstSeenAt === null) !== (cursorEpisodeId === null)) {
    blockers.push("candidate_read_cursor_pair_required");
  }
  let cursor: CandidateCanonicalReadCursor | null = null;
  if (cursorFirstSeenAt !== null && cursorEpisodeId !== null) {
    try {
      cursor = normalizeCandidateCanonicalReadCursor({
        firstSeenAt: cursorFirstSeenAt,
        episodeId: cursorEpisodeId,
      });
    } catch {
      blockers.push("candidate_read_cursor_invalid");
    }
  }
  if (blockers.length > 0) {
    return { status: "invalid", blockers: [...new Set(blockers)].sort() };
  }
  return { status: "valid", request: { limit, cursor } };
}

function validTrustedControl(value: CandidateTrustedReadControl) {
  const phases = new Set(["legacy", "shadow_capture", "shadow_verify", "canonical_compat", "canonical"]);
  return phases.has(value.phase)
    && typeof value.dualReadRequested === "boolean"
    && typeof value.canonicalReadRequested === "boolean"
    && typeof value.reviewReadRequested === "boolean"
    && ["PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL", "missing"]
      .includes(value.reconciliationEvidenceStatus)
    && ["PASS_DUAL_READ_OBSERVATION", "missing"].includes(value.dualReadEvidenceStatus)
    && ["PASS_CANONICAL_COMPAT_OBSERVATION", "missing"].includes(value.canonicalCompatEvidenceStatus);
}

function resourceMode(mode: CandidateReadRouteMode): CandidateReadResourceMode {
  if (mode === "dual_read_legacy_authority") return "dual_read_legacy_authority";
  if (mode === "canonical_compat") return "canonical_compat_candidate";
  if (mode === "canonical_only") return "canonical_authority";
  return "legacy_only";
}

export class CandidateCanonicalApiRouteAdapter {
  constructor(private readonly dependencies: CandidateReadRouteAdapterDependencies) {}

  async execute(query: URLSearchParams): Promise<CandidateReadRouteAdapterResponse> {
    const parsed = parseCandidateReadRouteRequest(query);
    if (parsed.status === "invalid") {
      return errorResponse(400, "invalid_candidate_read_request", parsed.blockers);
    }

    let trustedContext: CandidateTrustedReadContext;
    try {
      trustedContext = await withDeadline(
        (signal) => this.dependencies.readTrustedContext({ signal }),
        CANDIDATE_API_ROUTE_CONTROL_TIMEOUT_MS,
        "candidate_read_control_timeout",
      );
      assertCandidateTrustedReadContext(trustedContext);
      normalizeCandidateCanonicalReadPolicy(trustedContext.policy);
      if (!validTrustedControl(trustedContext.control)) {
        throw new Error("candidate_read_control_invalid");
      }
    } catch {
      return errorResponse(503, "candidate_read_control_unavailable", [
        "candidate_read_trusted_context_invalid",
      ]);
    }
    const { control, policy } = trustedContext;

    const readInput = {
      policy,
      cursor: parsed.request.cursor,
      limit: parsed.request.limit,
    } as const;
    let resource: CandidateCanonicalApiResource;
    try {
      const execution = await withDeadline((signal) => executeCandidateReadRoute({
        input: {
          ...control,
          codeCanonicalReadAllowed: CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED,
        },
        legacyRead: async () => {
          const events = await this.dependencies.readLegacyEvents({
            policy,
            maximumEvents: parsed.request.limit,
            signal,
          });
          return buildLegacyCandidateDiagnosticRead({
            events: events.slice(0, parsed.request.limit),
            policy,
          });
        },
        candidateRead: () => this.dependencies.readCandidate({ ...readInput, signal }),
        referencePairRead: async () => {
          const comparison = await this.dependencies.compareCandidateReference({ ...readInput, signal });
          const unavailable = unavailableCandidate();
          return {
            sameDatabaseSnapshot: true,
            reference: comparison.reference ?? unavailable,
            candidate: comparison.candidate ?? unavailable,
          } as const;
        },
      }), CANDIDATE_API_ROUTE_DATA_TIMEOUT_MS, "candidate_read_dependency_timeout");
      const routeBlockers = [
        ...execution.blockers,
        ...(parsed.request.cursor && execution.source !== "candidate"
          ? ["legacy_diagnostic_cursor_noncanonical"]
          : []),
      ];
      resource = buildCandidateCanonicalApiResource({
        mode: resourceMode(execution.mode),
        source: execution.source,
        result: execution.result,
        parity: execution.parity,
        routeBlockers,
      });
    } catch {
      return errorResponse(503, "candidate_read_dependency_unavailable", [
        "candidate_read_dependency_failed_without_stale_fallback",
      ]);
    }
    let recheckedContext: CandidateTrustedReadContext;
    try {
      recheckedContext = await withDeadline(
        (signal) => this.dependencies.readTrustedContext({ signal }),
        CANDIDATE_API_ROUTE_CONTROL_TIMEOUT_MS,
        "candidate_read_control_recheck_timeout",
      );
      assertCandidateTrustedReadContext(recheckedContext);
    } catch {
      return errorResponse(503, "candidate_read_control_unavailable", [
        "candidate_read_authority_recheck_invalid",
      ]);
    }
    if (recheckedContext.authorityFingerprint !== trustedContext.authorityFingerprint) {
      return errorResponse(503, "candidate_read_control_unavailable", [
        "candidate_read_authority_changed_during_read",
      ]);
    }
    return buildCandidateReadHttpResponse(resource);
  }
}
