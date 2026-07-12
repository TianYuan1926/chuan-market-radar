import type { PostgresTransactionAdapter } from "./transaction-adapter";
import {
  hashShadowCandidatePayload,
  validateShadowCandidateObservation,
  type ShadowCandidateObservationV1,
} from "./shadow-capture-source";
import { generateUuidV7 } from "./uuid-v7";

export type QuarantineResolutionAction =
  | "replay_after_approved_fix"
  | "exclude_invalid_source";

export type ResolveShadowQuarantineCommand = Readonly<{
  scope: "production_radar";
  resolutionId?: string;
  quarantinedOutboxId: string;
  action: QuarantineResolutionAction;
  reasonCode: string;
  approvalRef: string;
  approvalDigest: string;
  replacementPayload?: ShadowCandidateObservationV1;
  replacementOutboxId?: string;
  migrationId: string;
  authorityEpoch: number;
}>;

type ResolutionRow = {
  resolution_id: string;
  scope: string;
  quarantined_outbox_id: string;
  resolution_action: QuarantineResolutionAction;
  reason_code: string;
  approval_ref: string;
  approval_digest: string;
  source_payload_hash: string;
  replacement_outbox_id: string | null;
  resolved_by_role: string;
  resolved_at: Date | string;
};

const transactionOptions = {
  idleInTransactionTimeoutMs: 30_000,
  isolation: "serializable",
  lockTimeoutMs: 1_000,
  maxRetries: 0,
  statementTimeoutMs: 30_000,
} as const;

function required(value: string, field: string) {
  if (!value.trim()) throw new Error(`${field}_must_be_non_empty`);
  return value;
}

function timestamp(value: Date | string) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("resolved_at_invalid");
  return new Date(parsed).toISOString();
}

function validateCommand(command: ResolveShadowQuarantineCommand) {
  required(command.quarantinedOutboxId, "quarantinedOutboxId");
  required(command.migrationId, "migrationId");
  if (!/^[a-z0-9_]{1,64}$/.test(command.reasonCode)) {
    throw new Error("reason_code_invalid");
  }
  if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(command.approvalRef)) {
    throw new Error("approval_ref_invalid");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(command.approvalDigest)) {
    throw new Error("approval_digest_invalid");
  }
  if (!Number.isSafeInteger(command.authorityEpoch) || command.authorityEpoch < 1) {
    throw new Error("authority_epoch_invalid");
  }
  if (command.action === "replay_after_approved_fix") {
    if (!command.replacementPayload) throw new Error("replacement_payload_required");
    validateShadowCandidateObservation(command.replacementPayload);
  } else if (command.replacementPayload || command.replacementOutboxId) {
    throw new Error("exclude_replacement_forbidden");
  }
}

export class CandidateQuarantineResolutionService {
  private readonly generateId: () => string;

  constructor(
    private readonly transactions: PostgresTransactionAdapter,
    dependencies: { generateId?: () => string } = {},
  ) {
    this.generateId = dependencies.generateId ?? generateUuidV7;
  }

  async resolve(command: ResolveShadowQuarantineCommand) {
    validateCommand(command);
    const resolutionId = command.resolutionId ?? this.generateId();
    const replacementOutboxId = command.action === "replay_after_approved_fix"
      ? command.replacementOutboxId ?? this.generateId()
      : null;
    const replacementPayload = command.replacementPayload ?? null;
    const replacementPayloadHash = replacementPayload
      ? hashShadowCandidatePayload(replacementPayload)
      : null;

    const response = await this.transactions.withTransaction(transactionOptions, (tx) =>
      tx.query<ResolutionRow>(`
        SELECT *
        FROM candidate_authority.resolve_shadow_outbox_quarantine_v3(
          $1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,
          $8::uuid,$9::jsonb,$10::text,$11::text,$12::bigint
        )
      `, [
        command.scope,
        resolutionId,
        command.quarantinedOutboxId,
        command.action,
        command.reasonCode,
        command.approvalRef,
        command.approvalDigest,
        replacementOutboxId,
        replacementPayload,
        replacementPayloadHash,
        command.migrationId,
        command.authorityEpoch,
      ]));
    const row = response.rows[0];
    if (!row || row.resolution_id !== resolutionId) {
      throw new Error("quarantine_resolution_result_invalid");
    }

    return {
      resolutionId: row.resolution_id,
      scope: row.scope as "production_radar",
      quarantinedOutboxId: row.quarantined_outbox_id,
      action: row.resolution_action,
      reasonCode: row.reason_code,
      approvalRef: row.approval_ref,
      approvalDigest: row.approval_digest,
      sourcePayloadHash: row.source_payload_hash,
      replacementOutboxId: row.replacement_outbox_id,
      resolvedByRole: row.resolved_by_role,
      resolvedAt: timestamp(row.resolved_at),
    } as const;
  }
}
