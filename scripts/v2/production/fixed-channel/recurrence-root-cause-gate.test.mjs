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

test("the real registry exposes the open P0R receiver remediation and retires unsafe operations", async () => {
  const [state, registry] = await Promise.all([
    readFile(new URL("../../../../AUTONOMOUS_ENGINEERING_STATE.json", import.meta.url), "utf8")
      .then(JSON.parse),
    readFile(new URL("../../../../docs/governance/recurrence-root-cause-registry.v1.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);
  assert.deepEqual(validateActiveStateDeclaration(state, registry), []);
  const summary = summarizeRecurrenceRegistry(registry, ["fixed_dispatch_first_signed_acceptance"]);
  assert.equal(summary.openIncidentCount, 1);
  assert.deepEqual(
    summary.incidents.filter((incident) => incident.status !== "CLOSED_VERIFIED"),
    [{
      id: "REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS",
      status: "REMEDIATION_IN_PROGRESS",
      recurrenceCount: 5,
    }],
  );
  assert.deepEqual(evaluateRecurrenceOperations(registry, ["fixed_dispatch_bootstrap_install"]), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["fixed_dispatch_first_signed_acceptance"],
  ), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["p0r_dual_session_exact_receiver_qualification"],
  ), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["p0r_bounded_short_command_segmented_receiver"],
  ), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["p0r_clear_settle_exact_preview_each_command"],
  ), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["p0r_safe_sts_reissue_compile_and_recovery"],
  ), []);
  for (const operation of [
    "p0r_noecho_memory_ingress_and_immediate_compile",
    "p0r_exact_compose_label_runtime_identity",
    "p0r_atomic_credential_age_runner_session",
  ]) {
    assert.deepEqual(evaluateRecurrenceOperations(registry, [operation]), []);
  }
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["p0r_unverified_orcaterm_receiver_paste"]),
    [
      "recurrence_operation_retired:REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS:p0r_unverified_orcaterm_receiver_paste",
    ],
  );
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["p0r_orcaterm_overlength_composite_command"]),
    [
      "recurrence_operation_retired:REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS:p0r_orcaterm_overlength_composite_command",
    ],
  );
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["p0r_orcaterm_unsettled_rapid_editor_write"]),
    [
      "recurrence_operation_retired:REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS:p0r_orcaterm_unsettled_rapid_editor_write",
    ],
  );
  for (const operation of [
    "p0r_persisted_raw_sts_and_manual_compile_sequence",
    "p0r_ax_response_reconstruction",
    "p0r_compose_env_reinterpolation_for_runtime_identity",
  ]) {
    assert.deepEqual(
      evaluateRecurrenceOperations(registry, [operation]),
      [
        `recurrence_operation_retired:REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS:${operation}`,
      ],
    );
  }
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["ordinary_orcaterm_bundle_transport"]),
    [
      "recurrence_operation_retired:REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD:ordinary_orcaterm_bundle_transport",
    ],
  );
  const openIncident = registry.incidents.find(
    (incident) =>
      incident.id === "REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS",
  );
  assert.ok(
    openIncident.permanentFix.evidence.some(
      (item) =>
        item.includes("seven-file transport-v2 runtime digest set") &&
        item.includes("three-file transport-v1 supersession comparison"),
    ),
  );
  assert.ok(
    openIncident.permanentFix.evidence.some(
      (item) =>
        item.includes("mode-700 private /dev/shm directory") &&
        item.includes("mode-600 non-symlink file") &&
        item.includes("forbids internal tee"),
    ),
  );
  assert.ok(
    openIncident.regression.evidence.some(
      (item) =>
        item.includes("private mode-700 /dev/shm directory") &&
        item.includes("prohibition of internal tee") &&
        item.includes("verified directory cleanup"),
    ),
  );
  assert.ok(
    openIncident.realTargetAcceptance.evidence.some(
      (item) =>
        item.includes("seven-file current P0R runtime set digest") &&
        item.includes("three-file historical supersession proof"),
    ),
  );
});

test("the P0R runbook keeps atomic no-echo session commands below the OrcaTerm ceiling", async () => {
  const runbook = await readFile(new URL(
    "../../../../docs/runbooks/V2_M1_6_P0R_PRODUCTION_RECOVERY_RUNBOOK.md",
    import.meta.url,
  ), "utf8");
  const runId = "p0r-20260727t142908z-03d9dbeef09a8b47290dd5638115449f";
  const source = `/home/ubuntu/.cache/market-radar-v2/p0r/staging/${runId}`;
  const commands = [
    `cd ${source} && ./m1-production-storage-p0r-session.sh receive-credentials-and-run`,
    `cd ${source} && ./m1-production-storage-p0r-session.sh receive-age-identity`,
  ];

  assert.match(runbook, /UTF-8 `<=200` 字节/u);
  assert.match(runbook, /clear -> settle >=1000ms -> set -> settle >=1000ms -> exact visible preview -> execute/u);
  assert.match(runbook, /原始 STS response 不落盘/u);
  assert.match(runbook, /裸 `tee` receiver/u);
  assert.match(runbook, /按一次 Enter 保证最后一行进入 stdin，再按一次 Ctrl-D 发送 EOF/u);
  assert.match(runbook, /同样按一次 Enter，再按一次 Ctrl-D 完成 stdin/u);
  assert.match(runbook, /CLEAR_SETTLE_EXACT_PREVIEW_SHORT_COMMAND_GATE_ACTIVE/u);
  for (const command of commands) {
    assert.ok(Buffer.byteLength(command, "utf8") <= 200, command);
  }
});
