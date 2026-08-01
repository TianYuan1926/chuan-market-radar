import type { AlertEvent, DecisionSnapshot } from "../../domain/contracts";
import { AlertEventSchema } from "../../runtime-schema/learning-runtime-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import { assertM3DecisionSnapshotIntegrity } from "../decision/m3-decision-read-model-runtime";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

export const M3_DECISION_ALERT_RUNTIME_VERSION =
  "m3-decision-alert-runtime.v1" as const;

export const M3_DECISION_ALERT_POLICY = Object.freeze({
  version: "m3-decision-alert-policy.v1",
  refreshTtlMs: 5 * 60 * 1_000,
  supportedAlertTypes: ["WAIT_NEAR_TRIGGER", "READY", "DEGRADED"],
  prohibitedPreStrategyTypes: ["EARLY_CANDIDATE", "EVIDENCE_READY"],
} as const);

export type M3DecisionAlertBuildResult =
  | Readonly<{
    status: "EMITTED";
    alert: AlertEvent;
    reasonCodes: readonly [];
  }>
  | Readonly<{
    status: "ABSTAINED";
    alert: null;
    reasonCodes: readonly string[];
  }>;

function abstain(...reasonCodes: string[]): M3DecisionAlertBuildResult {
  return deepFreezeArtifact({
    status: "ABSTAINED" as const,
    alert: null,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  });
}

function alertContent(
  alert: AlertEvent,
): Omit<AlertEvent, "alertId" | "contentHash"> {
  return omitArtifactFields(
    alert as unknown as Readonly<Record<string, unknown>>,
    ["alertId", "contentHash"],
  ) as Omit<AlertEvent, "alertId" | "contentHash">;
}

export function assertM3DecisionAlertIntegrity(input: unknown): AlertEvent {
  const alert = AlertEventSchema.parse(input);
  const content = alertContent(alert);
  const digest = stableSha256(content);
  if (
    alert.contentHash !== stableContentHash(content) ||
    alert.alertId !== `decision-alert:${digest.slice(0, 24)}`
  ) {
    throw new Error("AlertEvent content address does not match its payload");
  }
  return deepFreezeArtifact(alert);
}

function alertTypeFor(snapshot: DecisionSnapshot):
  | "WAIT_NEAR_TRIGGER"
  | "READY"
  | "DEGRADED"
  | null {
  if (
    snapshot.freshness.status !== "FRESH" ||
    snapshot.userFit === "UNAVAILABLE" ||
    snapshot.unavailableReasonCodes.length > 0
  ) {
    return "DEGRADED";
  }
  if (snapshot.actionState === "TRADE_PLAN_READY") {
    return "READY";
  }
  if (
    snapshot.actionState === "WAIT" &&
    snapshot.decision.reasonCodes.includes("entry_trigger_pending")
  ) {
    return "WAIT_NEAR_TRIGGER";
  }
  return null;
}

export function buildM3DecisionAlert(input: Readonly<{
  decisionSnapshot: unknown;
  generatedAt: string;
}>): M3DecisionAlertBuildResult {
  const snapshot = assertM3DecisionSnapshotIntegrity(input.decisionSnapshot);
  const generatedMs = Date.parse(input.generatedAt);
  if (
    !Number.isFinite(generatedMs) ||
    generatedMs < Date.parse(snapshot.generatedAt) ||
    generatedMs < Date.parse(snapshot.sourceCutoff)
  ) {
    throw new Error("AlertEvent chronology cannot precede its DecisionSnapshot");
  }
  const alertType = alertTypeFor(snapshot);
  if (alertType === null) {
    return abstain("decision_snapshot_has_no_supported_alert_transition");
  }
  if (
    alertType === "READY" &&
    (
      snapshot.actionState !== "TRADE_PLAN_READY" ||
      snapshot.userFit !== "SUITABLE" ||
      snapshot.freshness.status !== "FRESH"
    )
  ) {
    return abstain("ready_alert_gate_not_satisfied");
  }

  const policyExpiry = generatedMs + M3_DECISION_ALERT_POLICY.refreshTtlMs;
  const planExpiry = snapshot.decision.actionState === "TRADE_PLAN_READY"
    ? Date.parse(snapshot.decision.executablePlan.expiresAt)
    : Number.POSITIVE_INFINITY;
  const expiresMs = Math.min(policyExpiry, planExpiry);
  if (!Number.isFinite(expiresMs) || expiresMs <= generatedMs) {
    return abstain("decision_alert_already_expired");
  }
  const expiresAt = new Date(expiresMs).toISOString();
  const content: Omit<AlertEvent, "alertId" | "contentHash"> = {
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.AlertEvent,
    releaseId: snapshot.releaseId,
    producerModule: "alert_delivery",
    generatedAt: input.generatedAt,
    sourceCutoff: snapshot.sourceCutoff,
    episodeId: snapshot.episodeId,
    decisionSnapshotId: snapshot.snapshotId,
    strategyArchetype: snapshot.strategyArchetype,
    strategyContextTags: snapshot.strategyContextTags,
    strategyStateLabel: snapshot.strategyStateLabel,
    alertType,
    dedupeKey:
      `${M3_DECISION_ALERT_POLICY.version}:${snapshot.snapshotId}:${alertType}`,
    expiresAt,
  };
  const digest = stableSha256(content);
  const alert = assertM3DecisionAlertIntegrity({
    ...content,
    alertId: `decision-alert:${digest.slice(0, 24)}`,
    contentHash: stableContentHash(content),
  });
  return deepFreezeArtifact({
    status: "EMITTED" as const,
    alert,
    reasonCodes: [] as const,
  });
}
