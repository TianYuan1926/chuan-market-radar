#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RECURRENCE_REGISTRY_SCHEMA = "market-radar-recurrence-root-cause-registry.v1";
export const RECURRENCE_REGISTRY_PATH = "docs/governance/recurrence-root-cause-registry.v1.json";
export const AUTONOMY_STATE_SCHEMA = "market-radar-autonomous-engineering-state.v1";
export const RECURRENCE_TRIGGER_OCCURRENCE = 2;

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const STATE_PATH = resolve(REPO_ROOT, "AUTONOMOUS_ENGINEERING_STATE.json");
const REGISTRY_PATH = resolve(REPO_ROOT, RECURRENCE_REGISTRY_PATH);
const INCIDENT_STATUSES = new Set([
  "ROOT_CAUSE_REQUIRED",
  "REMEDIATION_IN_PROGRESS",
  "CLOSED_VERIFIED",
]);
const CONFIDENCE_LEVELS = new Set([
  "DIRECT",
  "CONTROLLED_A_B",
  "STRONG_BOUNDARY_INFERENCE",
]);
const EVIDENCE_STATUSES = new Set(["PENDING", "PARTIAL", "PASS"]);
const REQUIRED_CLOSURE_EVIDENCE = [
  "fingerprint",
  "rootCause",
  "permanentFix",
  "regression",
  "runtimeGate",
  "realTargetAcceptance",
  "workaroundAccounting",
  "remainingRisks",
];
const INCIDENT_KEYS = [
  "affectedChannel",
  "affectedOperations",
  "faultClass",
  "fingerprint",
  "firstObservedDate",
  "id",
  "lastObservedDate",
  "permanentFix",
  "prohibitedOperations",
  "realTargetAcceptance",
  "recurrenceCount",
  "regression",
  "remainingRisks",
  "remediationOperations",
  "rootCause",
  "runtimeGate",
  "status",
  "workaroundAccounting",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values)];
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function validStringArray(value, { allowEmpty = false } = {}) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(nonEmptyString)
    && unique(value).length === value.length;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateEvidenceBlock(block, keys, incidentId, label) {
  const violations = [];
  if (!exactKeys(block, keys) || !EVIDENCE_STATUSES.has(block?.status)) {
    return [`incident_${label}_invalid:${incidentId}`];
  }
  if (!validStringArray(block.evidence)) {
    violations.push(`incident_${label}_evidence_invalid:${incidentId}`);
  }
  return violations;
}

function validateIncident(incident, policy) {
  const id = nonEmptyString(incident?.id) ? incident.id : "unknown";
  const violations = [];
  if (!exactKeys(incident, INCIDENT_KEYS)) violations.push(`incident_keys_invalid:${id}`);
  if (!/^REC-\d{4}-\d{2}-\d{2}-[A-Z0-9-]+$/u.test(incident?.id ?? "")) {
    violations.push(`incident_id_invalid:${id}`);
  }
  if (!nonEmptyString(incident?.faultClass)) violations.push(`incident_fault_class_invalid:${id}`);
  if (!nonEmptyString(incident?.affectedChannel)) violations.push(`incident_channel_invalid:${id}`);
  if (!INCIDENT_STATUSES.has(incident?.status)) violations.push(`incident_status_invalid:${id}`);
  if (!Number.isSafeInteger(incident?.recurrenceCount)
      || incident.recurrenceCount < policy.triggerOccurrence) {
    violations.push(`incident_recurrence_count_invalid:${id}`);
  }
  if (!validDate(incident?.firstObservedDate) || !validDate(incident?.lastObservedDate)
      || incident.firstObservedDate > incident.lastObservedDate) {
    violations.push(`incident_observed_dates_invalid:${id}`);
  }

  for (const key of ["affectedOperations", "prohibitedOperations", "remediationOperations"]) {
    if (!validStringArray(incident?.[key])) violations.push(`incident_${key}_invalid:${id}`);
  }
  if (validStringArray(incident?.affectedOperations)
      && validStringArray(incident?.prohibitedOperations)
      && !incident.prohibitedOperations.every((operation) => incident.affectedOperations.includes(operation))) {
    violations.push(`incident_prohibited_operation_not_affected:${id}`);
  }
  if (validStringArray(incident?.prohibitedOperations)
      && validStringArray(incident?.remediationOperations)
      && incident.remediationOperations.some((operation) => incident.prohibitedOperations.includes(operation))) {
    violations.push(`incident_remediation_operation_retired:${id}`);
  }

  if (!exactKeys(incident?.fingerprint, ["observedEvidence", "signature", "stableConditions"])
      || !nonEmptyString(incident?.fingerprint?.signature)
      || !validStringArray(incident?.fingerprint?.stableConditions)
      || !validStringArray(incident?.fingerprint?.observedEvidence)) {
    violations.push(`incident_fingerprint_invalid:${id}`);
  }
  if (!exactKeys(incident?.rootCause, ["boundary", "conclusion", "confidence", "evidence"])
      || !nonEmptyString(incident?.rootCause?.boundary)
      || !nonEmptyString(incident?.rootCause?.conclusion)
      || !CONFIDENCE_LEVELS.has(incident?.rootCause?.confidence)
      || !validStringArray(incident?.rootCause?.evidence)) {
    violations.push(`incident_root_cause_invalid:${id}`);
  }

  const permanentFix = incident?.permanentFix;
  if (!exactKeys(permanentFix, ["authorityPaths", "evidence", "status", "workaroundDisposition"])
      || !EVIDENCE_STATUSES.has(permanentFix?.status)
      || !validStringArray(permanentFix?.authorityPaths)
      || !permanentFix.authorityPaths.every((path) => !path.startsWith("/") && !path.includes(".."))
      || permanentFix?.workaroundDisposition !== "RETIRED_AFTER_BOOTSTRAP"
      || !validStringArray(permanentFix?.evidence)) {
    violations.push(`incident_permanent_fix_invalid:${id}`);
  }

  const regression = incident?.regression;
  if (!exactKeys(regression, ["evidence", "greenCommand", "redCase", "status"])
      || !EVIDENCE_STATUSES.has(regression?.status)
      || !nonEmptyString(regression?.redCase)
      || !nonEmptyString(regression?.greenCommand)
      || !validStringArray(regression?.evidence)) {
    violations.push(`incident_regression_invalid:${id}`);
  }
  violations.push(...validateEvidenceBlock(
    incident?.runtimeGate,
    ["evidence", "status"],
    id,
    "runtime_gate",
  ));
  violations.push(...validateEvidenceBlock(
    incident?.realTargetAcceptance,
    ["evidence", "status"],
    id,
    "real_target_acceptance",
  ));

  const accounting = incident?.workaroundAccounting;
  if (!exactKeys(accounting, [
    "attemptCount",
    "durationMeasurement",
    "durationSeconds",
    "postTriggerEmergencyWorkaroundCount",
    "unknownReason",
  ])
      || !Number.isSafeInteger(accounting?.attemptCount)
      || accounting.attemptCount < incident.recurrenceCount
      || !Number.isSafeInteger(accounting?.postTriggerEmergencyWorkaroundCount)
      || accounting.postTriggerEmergencyWorkaroundCount < 0
      || accounting.postTriggerEmergencyWorkaroundCount > policy.emergencyWorkaroundLimitAfterTrigger) {
    violations.push(`incident_workaround_accounting_invalid:${id}`);
  } else if (accounting.durationMeasurement === "MEASURED") {
    if (!Number.isSafeInteger(accounting.durationSeconds)
        || accounting.durationSeconds < 0
        || accounting.unknownReason !== null) {
      violations.push(`incident_workaround_duration_invalid:${id}`);
    }
  } else if (accounting.durationMeasurement === "HISTORICAL_NOT_INSTRUMENTED") {
    if (accounting.durationSeconds !== null
        || !nonEmptyString(accounting.unknownReason)
        || !validDate(policy.historicalUnmeasuredCutoffDate)
        || incident.lastObservedDate > policy.historicalUnmeasuredCutoffDate) {
      violations.push(`incident_historical_duration_exception_invalid:${id}`);
    }
  } else {
    violations.push(`incident_workaround_duration_mode_invalid:${id}`);
  }

  if (!validStringArray(incident?.remainingRisks)) {
    violations.push(`incident_remaining_risks_invalid:${id}`);
  }
  if (incident?.status === "CLOSED_VERIFIED") {
    for (const [label, status] of [
      ["permanent_fix", permanentFix?.status],
      ["regression", regression?.status],
      ["runtime_gate", incident?.runtimeGate?.status],
      ["real_target_acceptance", incident?.realTargetAcceptance?.status],
    ]) {
      if (status !== "PASS") violations.push(`incident_closed_without_${label}_pass:${id}`);
    }
  }
  return unique(violations);
}

export function validateRecurrenceRegistry(registry) {
  const violations = [];
  if (!exactKeys(registry, ["incidents", "policy", "schemaVersion"])) {
    violations.push("recurrence_registry_keys_invalid");
  }
  if (registry?.schemaVersion !== RECURRENCE_REGISTRY_SCHEMA) {
    violations.push("recurrence_registry_schema_invalid");
  }
  const policy = registry?.policy;
  if (!exactKeys(policy, [
    "emergencyWorkaroundLimitAfterTrigger",
    "historicalUnmeasuredCutoffDate",
    "repeatedWorkaroundForbidden",
    "requiredClosureEvidence",
    "triggerOccurrence",
  ])
      || policy?.triggerOccurrence !== RECURRENCE_TRIGGER_OCCURRENCE
      || policy?.repeatedWorkaroundForbidden !== true
      || policy?.emergencyWorkaroundLimitAfterTrigger !== 1
      || !validDate(policy?.historicalUnmeasuredCutoffDate)
      || JSON.stringify(policy?.requiredClosureEvidence) !== JSON.stringify(REQUIRED_CLOSURE_EVIDENCE)) {
    violations.push("recurrence_policy_invalid");
  }
  if (!Array.isArray(registry?.incidents) || registry.incidents.length === 0) {
    return unique([...violations, "recurrence_incidents_missing"]);
  }
  const ids = registry.incidents.map((incident) => incident?.id);
  if (unique(ids).length !== ids.length) violations.push("recurrence_incident_id_duplicate");
  const openFaultClasses = registry.incidents
    .filter((incident) => incident?.status !== "CLOSED_VERIFIED")
    .map((incident) => incident?.faultClass);
  if (unique(openFaultClasses).length !== openFaultClasses.length) {
    violations.push("recurrence_open_fault_class_duplicate");
  }
  if (isObject(policy)) {
    for (const incident of registry.incidents) {
      violations.push(...validateIncident(incident, policy));
    }
  }
  return unique(violations);
}

export function evaluateRecurrenceOperations(registry, operations) {
  const violations = validateRecurrenceRegistry(registry);
  if (!validStringArray(operations)) return unique([...violations, "recurrence_operations_invalid"]);
  if (violations.length > 0) return violations;
  for (const operation of operations) {
    for (const incident of registry.incidents) {
      if (incident.prohibitedOperations.includes(operation)) {
        violations.push(`recurrence_operation_retired:${incident.id}:${operation}`);
      } else if (incident.status !== "CLOSED_VERIFIED"
          && incident.affectedOperations.includes(operation)
          && !incident.remediationOperations.includes(operation)) {
        violations.push(`recurrence_root_cause_gate_open:${incident.id}:${operation}`);
      }
    }
  }
  return unique(violations);
}

export function validateActiveStateDeclaration(state, registry) {
  const violations = [];
  if (!isObject(state) || state.schemaVersion !== AUTONOMY_STATE_SCHEMA) {
    violations.push("autonomy_state_schema_invalid");
  }
  const gate = state?.activePackage?.recurrenceRootCauseGate;
  if (!exactKeys(gate, ["operations", "registryPath"])
      || gate?.registryPath !== RECURRENCE_REGISTRY_PATH
      || !validStringArray(gate?.operations)) {
    return unique([...violations, "active_package_recurrence_root_cause_gate_invalid"]);
  }
  return unique([...violations, ...evaluateRecurrenceOperations(registry, gate.operations)]);
}

export function summarizeRecurrenceRegistry(registry, operations = []) {
  const violations = evaluateRecurrenceOperations(registry, operations);
  return {
    schemaVersion: "market-radar-recurrence-root-cause-gate-result.v1",
    status: violations.length === 0 ? "PASS" : "FAIL",
    operations,
    incidentCount: Array.isArray(registry?.incidents) ? registry.incidents.length : 0,
    openIncidentCount: Array.isArray(registry?.incidents)
      ? registry.incidents.filter((incident) => incident?.status !== "CLOSED_VERIFIED").length
      : 0,
    incidents: Array.isArray(registry?.incidents)
      ? registry.incidents.map((incident) => ({
        id: incident.id,
        status: incident.status,
        recurrenceCount: incident.recurrenceCount,
      }))
      : [],
    violations,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function status() {
  const [stateBytes, registryBytes] = await Promise.all([
    readFile(STATE_PATH),
    readFile(REGISTRY_PATH),
  ]);
  const state = JSON.parse(stateBytes.toString("utf8"));
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const operations = state?.activePackage?.recurrenceRootCauseGate?.operations ?? [];
  const summary = summarizeRecurrenceRegistry(registry, operations);
  const violations = validateActiveStateDeclaration(state, registry);
  const response = {
    ...summary,
    status: violations.length === 0 ? "PASS" : "FAIL",
    registryPath: RECURRENCE_REGISTRY_PATH,
    registrySha256: createHash("sha256").update(registryBytes).digest("hex"),
    violations,
  };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (response.status !== "PASS") process.exitCode = 2;
}

async function checkOperation() {
  const operations = process.argv.slice(3);
  const registry = await readJson(REGISTRY_PATH);
  const violations = evaluateRecurrenceOperations(registry, operations);
  const response = {
    schemaVersion: "market-radar-recurrence-operation-gate-result.v1",
    status: violations.length === 0 ? "PASS" : "FAIL",
    operations,
    violations,
  };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (response.status !== "PASS") process.exitCode = 2;
}

async function main() {
  const command = process.argv[2] ?? "status";
  if (command === "status") return status();
  if (command === "check-operation") return checkOperation();
  throw new Error(`unsupported_command:${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
