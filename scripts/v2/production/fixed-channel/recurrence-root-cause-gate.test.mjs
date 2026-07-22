import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateRecurrenceOperations,
  summarizeRecurrenceRegistry,
  validateActiveStateDeclaration,
  validateRecurrenceRegistry,
} from "./recurrence-root-cause-gate.mjs";

function incidentFixture(overrides = {}) {
  return {
    id: "REC-2026-07-23-TEST",
    faultClass: "test.transport.failure",
    affectedChannel: "test_channel",
    status: "REMEDIATION_IN_PROGRESS",
    recurrenceCount: 2,
    firstObservedDate: "2026-07-22",
    lastObservedDate: "2026-07-23",
    affectedOperations: ["repeat_old_transport", "dependent_release"],
    prohibitedOperations: ["repeat_old_transport"],
    remediationOperations: ["install_fixed_transport"],
    fingerprint: {
      signature: "The same deterministic transport failure occurred twice.",
      stableConditions: ["The old transport path is used."],
      observedEvidence: ["Both attempts share the same failure fingerprint."],
    },
    rootCause: {
      boundary: "external_transport",
      conclusion: "The old transport is not reliable.",
      confidence: "CONTROLLED_A_B",
      evidence: ["The fixed path succeeds with identical bytes."],
    },
    permanentFix: {
      status: "PARTIAL",
      authorityPaths: ["scripts/v2/production/fixed-channel/fixed.mjs"],
      workaroundDisposition: "RETIRED_AFTER_BOOTSTRAP",
      evidence: ["The replacement is implemented."],
    },
    regression: {
      status: "PASS",
      redCase: "The old path fails deterministically.",
      greenCommand: "npm run test:recurrence-gate",
      evidence: ["The old path is rejected."],
    },
    runtimeGate: {
      status: "PARTIAL",
      evidence: ["Verify-only passed."],
    },
    realTargetAcceptance: {
      status: "PENDING",
      evidence: ["Production installation is pending."],
    },
    workaroundAccounting: {
      attemptCount: 2,
      postTriggerEmergencyWorkaroundCount: 0,
      durationMeasurement: "HISTORICAL_NOT_INSTRUMENTED",
      durationSeconds: null,
      unknownReason: "Instrumentation was added after the incidents.",
    },
    remainingRisks: ["The external implementation is not observable."],
    ...overrides,
  };
}

function registryFixture(incident = incidentFixture()) {
  return {
    schemaVersion: "market-radar-recurrence-root-cause-registry.v1",
    policy: {
      triggerOccurrence: 2,
      repeatedWorkaroundForbidden: true,
      emergencyWorkaroundLimitAfterTrigger: 1,
      historicalUnmeasuredCutoffDate: "2026-07-23",
      requiredClosureEvidence: [
        "fingerprint",
        "rootCause",
        "permanentFix",
        "regression",
        "runtimeGate",
        "realTargetAcceptance",
        "workaroundAccounting",
        "remainingRisks",
      ],
    },
    incidents: [incident],
  };
}

test("an evidenced remediation remains open without being falsely closed", () => {
  const summary = summarizeRecurrenceRegistry(registryFixture(), ["install_fixed_transport"]);
  assert.equal(summary.status, "PASS");
  assert.equal(summary.openIncidentCount, 1);
  assert.equal(summary.incidents[0].status, "REMEDIATION_IN_PROGRESS");
});

test("the second occurrence permanently retires the repeated workaround", () => {
  assert.deepEqual(
    evaluateRecurrenceOperations(registryFixture(), ["repeat_old_transport"]),
    ["recurrence_operation_retired:REC-2026-07-23-TEST:repeat_old_transport"],
  );
});

test("the registered root-cause remediation is allowed", () => {
  assert.deepEqual(
    evaluateRecurrenceOperations(registryFixture(), ["install_fixed_transport"]),
    [],
  );
});

test("unresolved affected work is blocked until the root cause closes", () => {
  assert.deepEqual(
    evaluateRecurrenceOperations(registryFixture(), ["dependent_release"]),
    ["recurrence_root_cause_gate_open:REC-2026-07-23-TEST:dependent_release"],
  );
});

test("closure is rejected without permanent, runtime and target PASS evidence", () => {
  const violations = validateRecurrenceRegistry(registryFixture(
    incidentFixture({ status: "CLOSED_VERIFIED" }),
  ));
  assert.ok(violations.includes("incident_closed_without_permanent_fix_pass:REC-2026-07-23-TEST"));
  assert.ok(violations.includes("incident_closed_without_runtime_gate_pass:REC-2026-07-23-TEST"));
  assert.ok(violations.includes("incident_closed_without_real_target_acceptance_pass:REC-2026-07-23-TEST"));
});

test("verified closure unblocks dependent work but never revives a retired workaround", () => {
  const base = incidentFixture();
  const closed = incidentFixture({
    status: "CLOSED_VERIFIED",
    permanentFix: { ...base.permanentFix, status: "PASS" },
    runtimeGate: { ...base.runtimeGate, status: "PASS" },
    realTargetAcceptance: { ...base.realTargetAcceptance, status: "PASS" },
  });
  const registry = registryFixture(closed);
  assert.deepEqual(validateRecurrenceRegistry(registry), []);
  assert.deepEqual(evaluateRecurrenceOperations(registry, ["dependent_release"]), []);
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["repeat_old_transport"]),
    ["recurrence_operation_retired:REC-2026-07-23-TEST:repeat_old_transport"],
  );
});

test("future historical-duration exceptions and excess emergency workarounds are rejected", () => {
  const violations = validateRecurrenceRegistry(registryFixture(
    incidentFixture({ lastObservedDate: "2026-07-24" }),
  ));
  assert.ok(violations.includes(
    "incident_historical_duration_exception_invalid:REC-2026-07-23-TEST",
  ));

  const base = incidentFixture();
  const excessWorkaround = registryFixture(incidentFixture({
    workaroundAccounting: {
      ...base.workaroundAccounting,
      postTriggerEmergencyWorkaroundCount: 2,
    },
  }));
  assert.ok(validateRecurrenceRegistry(excessWorkaround).includes(
    "incident_workaround_accounting_invalid:REC-2026-07-23-TEST",
  ));
});

test("duplicate open fault classes and duplicate operations are rejected", () => {
  const duplicateFault = registryFixture();
  duplicateFault.incidents.push({ ...incidentFixture(), id: "REC-2026-07-23-TEST-2" });
  assert.ok(validateRecurrenceRegistry(duplicateFault).includes("recurrence_open_fault_class_duplicate"));

  const duplicateOperation = registryFixture();
  duplicateOperation.incidents[0].affectedOperations.push("dependent_release");
  assert.ok(validateRecurrenceRegistry(duplicateOperation).includes(
    "incident_affectedOperations_invalid:REC-2026-07-23-TEST",
  ));
});

test("the real registry rejects retired transport and allows only the active remediation", async () => {
  const [state, registry] = await Promise.all([
    readFile(new URL("../../../../AUTONOMOUS_ENGINEERING_STATE.json", import.meta.url), "utf8")
      .then(JSON.parse),
    readFile(new URL("../../../../docs/governance/recurrence-root-cause-registry.v1.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);
  assert.deepEqual(validateActiveStateDeclaration(state, registry), []);
  assert.deepEqual(evaluateRecurrenceOperations(registry, ["fixed_dispatch_bootstrap_install"]), []);
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["ordinary_orcaterm_bundle_transport"]),
    [
      "recurrence_operation_retired:REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD:ordinary_orcaterm_bundle_transport",
    ],
  );
});
