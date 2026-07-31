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

test("future historical-duration exceptions fail while excess workarounds remain truthful", () => {
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
  assert.deepEqual(validateRecurrenceRegistry(excessWorkaround), []);
  const summary = summarizeRecurrenceRegistry(
    excessWorkaround,
    ["install_fixed_transport"],
  );
  assert.equal(summary.incidents[0].workaroundLimitBreached, true);
  assert.deepEqual(
    evaluateRecurrenceOperations(
      excessWorkaround,
      ["repeat_old_transport"],
    ),
    [
      "recurrence_operation_retired:REC-2026-07-23-TEST:repeat_old_transport",
    ],
  );
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

test("the real registry exposes both open P0R remediations and retires unsafe operations", async () => {
  const [state, registry] = await Promise.all([
    readFile(new URL("../../../../AUTONOMOUS_ENGINEERING_STATE.json", import.meta.url), "utf8")
      .then(JSON.parse),
    readFile(new URL("../../../../docs/governance/recurrence-root-cause-registry.v1.json", import.meta.url), "utf8")
      .then(JSON.parse),
  ]);
  assert.deepEqual(validateActiveStateDeclaration(state, registry), []);
  const summary = summarizeRecurrenceRegistry(registry, ["fixed_dispatch_first_signed_acceptance"]);
  assert.equal(summary.openIncidentCount, 2);
  assert.deepEqual(
    summary.incidents.filter((incident) => incident.status !== "CLOSED_VERIFIED"),
    [
      {
        id: "REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD",
        recurrenceCount: 5,
        status: "REMEDIATION_IN_PROGRESS",
        workaroundLimitBreached: true,
      },
      {
        id: "REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS",
        recurrenceCount: 7,
        status: "REMEDIATION_IN_PROGRESS",
        workaroundLimitBreached: false,
      },
    ],
  );
  assert.deepEqual(evaluateRecurrenceOperations(registry, ["fixed_dispatch_bootstrap_install"]), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["fixed_dispatch_first_signed_acceptance"],
  ), []);
  assert.deepEqual(evaluateRecurrenceOperations(
    registry,
    ["p0r_fixed_dispatch_transport_stage_delivery"],
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
    "p0r_prearmed_local_tty_bridge",
    "p0r_native_copy_without_browser_read",
    "p0r_fixed_ssh_tty_keychain_handoff",
    "p0r_zero_residue_after_exposed_response",
    "p0r_proxy_compatible_fixed_8022_ssh_route",
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
    evaluateRecurrenceOperations(registry, ["p0r_default_ssh_port_22_transport"]),
    [
      "recurrence_operation_retired:REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS:p0r_default_ssh_port_22_transport",
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
    "p0r_browser_state_recovery_after_sts_response",
    "p0r_orcaterm_secret_session_entry_after_api_response",
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
  assert.deepEqual(
    evaluateRecurrenceOperations(registry, ["p0r_orcaterm_recovery_bundle_transport"]),
    [
      "recurrence_operation_retired:REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD:p0r_orcaterm_recovery_bundle_transport",
    ],
  );
  const openIncident = registry.incidents.find(
    (incident) =>
      incident.id === "REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS",
  );
  assert.ok(
    openIncident.permanentFix.evidence.some(
      (item) =>
        item.includes("eight-file transport-v3 runtime digest set") &&
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
        item.includes("eight-file current P0R runtime set digest") &&
        item.includes("three-file historical supersession proof"),
    ),
  );
  assert.ok(
    openIncident.permanentFix.evidence.some(
      (item) =>
        item.includes("native-copied Tencent response") &&
        item.includes("clears the clipboard") &&
        item.includes("Keychain"),
    ),
  );
  assert.ok(
    openIncident.permanentFix.evidence.some(
      (item) =>
        item.includes("Bridge schema v3") &&
        item.includes("port 8022") &&
        item.includes("HostKeyAlias") &&
        item.includes("port 22") &&
        item.includes("reason codes"),
    ),
  );
  assert.ok(
    openIncident.runtimeGate.evidence.some(
      (item) =>
        item.includes("zero P0R files") &&
        item.includes("containers and volumes"),
    ),
  );
});

test("the P0R runbook retires post-response browser recovery and OrcaTerm secret entry", async () => {
  const runbook = await readFile(new URL(
    "../../../../docs/runbooks/V2_M1_6_P0R_PRODUCTION_RECOVERY_RUNBOOK.md",
    import.meta.url,
  ), "utf8");
  const dispatchRunbook = await readFile(new URL(
    "../../../../docs/runbooks/PRODUCTION_FIXED_DISPATCH_CHANNEL_V1.md",
    import.meta.url,
  ), "utf8");

  assert.match(runbook, /原始 STS response 不落盘/u);
  assert.match(runbook, /裸 `tee` receiver/u);
  assert.match(runbook, /response-after browser state read/u);
  assert.match(runbook, /OrcaTerm secret entry/u);
  assert.match(runbook, /READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE/u);
  assert.match(runbook, /页面原生 Copy/u);
  assert.match(runbook, /bridge 返回 READY 前禁止请求 STS/u);
  assert.match(runbook, /先清空 clipboard/u);
  assert.match(runbook, /Keychain 项内部读取 age identity/u);
  assert.match(runbook, /固定 SSH port 8022/u);
  assert.match(runbook, /HostKeyAlias=43\.161\.202\.227/u);
  assert.match(runbook, /默认 SSH port 22.*永久禁止/u);
  assert.match(runbook, /P0R 110\/110/u);
  assert.match(runbook, /m1-p0r-transport-staging-release\.mjs/u);
  assert.match(runbook, /OrcaTerm 文件管理器.*永久禁止/u);
  assert.match(runbook, /TCP 8022.*当前 SOCKS 出口 \/32/u);
  assert.match(runbook, /systemd 自动超时不能代替云防火墙清理/u);
  assert.match(
    runbook,
    /request schema 必须为 `market-radar-v2-m1-p0r-rebind-request\.v3`/u,
  );
  assert.match(
    runbook,
    /result schema 必须为 `market-radar-v2-m1-p0r-rebind-result\.v2`/u,
  );
  assert.match(runbook, /`dispatchRuntimeMaxSeconds=90`/u);
  assert.match(runbook, /`v2:m1:p0r:rebind-release`/u);
  assert.match(
    dispatchRunbook,
    /P0R 只读重绑定明确禁止使用本节的通用 prepare 命令/u,
  );
  assert.match(
    dispatchRunbook,
    /由 canonical request v3 自动派生并强制 `dispatchRuntimeMaxSeconds=90`/u,
  );
  assert.match(
    dispatchRunbook,
    /任何 P0R 外层 5400 秒配置都必须在 outbox 创建前失败/u,
  );
  assert.match(
    runbook,
    /m1-production-storage-p0r-local-tty-bridge\.exp execute --plan <plan>/u,
  );
  assert.doesNotMatch(runbook, /以下两条是唯一允许的 secret session 入口/u);
});

test("all active authority surfaces identify the B8 fixed-dispatch transport staging remediation", async () => {
  const expectedEntry = "V2-M1.6-P0R-B8-FIXED-DISPATCH-TRANSPORT-STAGING-ROOT-REMEDIATION";
  const runtimeNamespaceEntry =
    "V2-M1.6-P0R-B7-SOURCE-BOUND-NODE-RUNTIME-CAPSULE-ROOT-REMEDIATION";
  const [matrix, context, index, sequence, blueprint] = await Promise.all([
    readFile(new URL(
      "../../../../docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json",
      import.meta.url,
    ), "utf8").then(JSON.parse),
    readFile(new URL("../../../../PROJECT_CONTEXT_FOR_CHATGPT.md", import.meta.url), "utf8"),
    readFile(new URL("../../../../docs/blueprints/README.md", import.meta.url), "utf8"),
    readFile(new URL("../../../../market-radar-v2-build-sequence.md", import.meta.url), "utf8"),
    readFile(new URL(
      "../../../../docs/blueprints/MARKET_RADAR_V2_CONTROLLED_REPLACEMENT_BLUEPRINT_V1.md",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.equal(matrix.currentImplementationEntry.id, expectedEntry);
  assert.equal(matrix.currentP0RTransportStagingRemediation.id, expectedEntry);
  assert.equal(matrix.currentP0RRuntimeNamespaceRemediation.id, runtimeNamespaceEntry);
  assert.equal(matrix.currentP0RTransportStagingRemediation.targetProductionStagingTestsPassed, 10);
  assert.equal(matrix.currentP0RTransportStagingRemediation.p0rTestsPassed, 110);
  assert.equal(matrix.currentP0RLocalTtyBridgeRemediation.currentRecurrenceTestsPassed, 11);
  assert.match(context, new RegExp(`## 18[\\s\\S]*${expectedEntry}`, "u"));
  assert.match(index, new RegExp(`## 6[\\s\\S]*${expectedEntry}`, "u"));
  assert.match(sequence, new RegExp(`Current execution entry: ${expectedEntry}`, "u"));
  assert.ok(blueprint.includes(`**当前执行入口**：\`${expectedEntry}\``));
});
