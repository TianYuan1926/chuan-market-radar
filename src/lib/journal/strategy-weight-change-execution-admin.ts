import type {
  JournalEvent,
  StrategyWeightChangeApprovalStatus,
} from "@/lib/analysis/types";
import type { RankProfile } from "./rank-engine";
import type { PersistenceEnv, PersistenceRepository } from "../persistence/persistence-store";
import {
  buildJournalEntryFromStrategyWeightChangeExecution,
  type StrategyWeightChangeExecutionJournalInput,
} from "./journal-entry";

export type AdminStrategyWeightExecutionError =
  | "invalid_strategy_weight_execution_request"
  | "strategy_weight_execution_failed"
  | "strategy_weight_execution_secret_missing"
  | "unauthorized";

export type AdminStrategyWeightExecutionResponse = {
  body: AdminStrategyWeightExecutionResponseBody;
  status: number;
};

export type AdminStrategyWeightExecutionResponseBody =
  | {
      ok: true;
      entry: JournalEvent;
      entries: JournalEvent[];
      rankProfile: RankProfile;
      scope: string;
      storage: PersistenceRepository["mode"];
    }
  | {
      ok: false;
      detail: string;
      error: AdminStrategyWeightExecutionError;
    };

export type RunAdminStrategyWeightChangeExecutionRecordOptions = {
  authorization?: string | null;
  body: unknown;
  env?: PersistenceEnv;
  repository: PersistenceRepository;
};

const approvalStatuses: StrategyWeightChangeApprovalStatus[] = [
  "approved",
  "pending_approval",
  "rejected",
  "rollback_watch",
];

const directions: StrategyWeightChangeExecutionJournalInput["direction"][] = [
  "decrease",
  "increase",
  "quarantine",
];

function expectedAuthorization(env: PersistenceEnv) {
  const secret = env.CRON_SECRET?.trim();

  return secret ? `Bearer ${secret}` : null;
}

function errorResponse(
  status: number,
  body: Extract<AdminStrategyWeightExecutionResponseBody, { ok: false }>,
): AdminStrategyWeightExecutionResponse {
  return {
    body,
    status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isApprovalStatus(value: unknown): value is StrategyWeightChangeApprovalStatus {
  return typeof value === "string" && approvalStatuses.includes(value as StrategyWeightChangeApprovalStatus);
}

function isDirection(value: unknown): value is StrategyWeightChangeExecutionJournalInput["direction"] {
  return typeof value === "string" && directions.includes(value as StrategyWeightChangeExecutionJournalInput["direction"]);
}

function isStrategyWeightExecutionInput(value: unknown): value is StrategyWeightChangeExecutionJournalInput {
  if (!isRecord(value)) {
    return false;
  }

  return isApprovalStatus(value.approvalStatus) &&
    (value.approvedAt === undefined || typeof value.approvedAt === "string") &&
    (value.approvedBy === undefined || typeof value.approvedBy === "string") &&
    isDirection(value.direction) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.rollbackTrigger) &&
    typeof value.rollbackWindowDays === "number" &&
    Number.isFinite(value.rollbackWindowDays) &&
    value.rollbackWindowDays > 0 &&
    isNonEmptyString(value.tag) &&
    isNonEmptyString(value.versionLabel);
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown strategy weight execution error";
}

export async function runAdminStrategyWeightChangeExecutionRecord({
  authorization,
  body,
  env = {},
  repository,
}: RunAdminStrategyWeightChangeExecutionRecordOptions): Promise<AdminStrategyWeightExecutionResponse> {
  const expected = expectedAuthorization(env);

  if (!expected) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling manual strategy weight execution records.",
      error: "strategy_weight_execution_secret_missing",
    });
  }

  if (authorization !== expected) {
    return errorResponse(401, {
      ok: false,
      detail: "The manual strategy weight execution request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  const execution = isRecord(body) && "execution" in body ? body.execution : undefined;

  if (!isStrategyWeightExecutionInput(execution)) {
    return errorResponse(400, {
      ok: false,
      detail: "The execution payload must include approval, direction, tag, version label, rollback trigger, and rollback window.",
      error: "invalid_strategy_weight_execution_request",
    });
  }

  try {
    const entry = buildJournalEntryFromStrategyWeightChangeExecution(execution);

    await repository.addJournalEvent(entry);

    return {
      body: {
        ok: true,
        entry,
        entries: await repository.listJournalEvents(),
        rankProfile: await repository.getRankProfile(),
        scope: repository.scope,
        storage: repository.mode,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: failureMessage(error),
      error: "strategy_weight_execution_failed",
    });
  }
}
