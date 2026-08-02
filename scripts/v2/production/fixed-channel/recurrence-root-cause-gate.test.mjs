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

test("the real registry closes accepted package transport and keeps secret recovery open", async () => {
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
    [
      {
        id: "REC-2026-07-28-P0R-SECRET-RECEIVER-FOCUS",
        recurrenceCount: 10,
        status: "REMEDIATION_IN_PROGRESS",
        workaroundLimitBreached: false,
      },
    ],
  );
  const closedTransportIncident = registry.incidents.find(
    (incident) =>
      incident.id === "REC-2026-07-23-ORCATERM-ZERO-BYTE-UPLOAD",
  );
  assert.equal(closedTransportIncident.status, "CLOSED_VERIFIED");
  assert.equal(closedTransportIncident.realTargetAcceptance.status, "PASS");
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
        item.includes("complete nine-file transport-v4 runtime digest set") &&
        item.includes("frozen three-file transport-v1 supersession comparison"),
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
        item.includes("canonical current P0R runtime set digest") &&
        item.includes("frozen historical supersession proof"),
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
        item.includes("Bridge schema v5") &&
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
  assert.match(runbook, /固定目标 IP、ubuntu 用户、SSH port 8022/u);
  assert.match(runbook, /HostKeyAlias=43\.161\.202\.227/u);
  assert.match(runbook, /默认 SSH port 22.*永久禁止/u);
  assert.match(runbook, /P0R 111\/111/u);
  assert.match(runbook, /m1-p0r-transport-staging-release\.mjs/u);
  assert.match(runbook, /OrcaTerm 文件管理器.*永久禁止/u);
  assert.match(runbook, /TCP 8022.*当前 SOCKS 出口 \/32/u);
  assert.match(runbook, /systemd 自动超时不能代替云防火墙清理/u);
  assert.match(
    runbook,
    /exact API Explorer 请求页准备到只差用户 MFA、发起调用和页面原生 Copy/u,
  );
  assert.match(runbook, /用户未明确在线时不得继续/u);
  assert.match(
    runbook,
    /request schema 必须为 `market-radar-v2-m1-p0r-rebind-request\.v4`/u,
  );
  assert.match(
    runbook,
    /result schema 必须为 `market-radar-v2-m1-p0r-rebind-result\.v3`/u,
  );
  assert.match(runbook, /`dispatchRuntimeMaxSeconds=90`/u);
  assert.match(runbook, /`v2:m1:p0r:rebind-release`/u);
  assert.match(
    dispatchRunbook,
    /P0R 只读重绑定明确禁止使用本节的通用 prepare 命令/u,
  );
  assert.match(
    dispatchRunbook,
    /由 canonical request v4 自动派生并强制 `dispatchRuntimeMaxSeconds=90`/u,
  );
  assert.match(runbook, /`forbiddenListenerPort=8022`/u);
  assert.match(runbook, /`forbiddenListenerUnit=market-radar-p0r-8022\.service`/u);
  assert.match(runbook, /TCP 8022 监听数量为 0/u);
  assert.match(runbook, /`LoadState=not-found`、`ActiveState=inactive`/u);
  assert.match(
    dispatchRunbook,
    /任何 P0R 外层 5400 秒配置都必须在 outbox 创建前失败/u,
  );
  assert.match(
    runbook,
    /transaction\.mjs execute --plan <plan> --lease <lease> --route-evidence <route-evidence> --result <result>/u,
  );
  assert.doesNotMatch(
    runbook,
    /m1-production-storage-p0r-local-tty-bridge\.exp execute --plan <plan>/u,
  );
  assert.doesNotMatch(runbook, /以下两条是唯一允许的 secret session 入口/u);
});

test("all active authority surfaces identify the evidence gateway and retain route authority only as qualified upstream", async () => {
  const expectedEntry = "V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY";
  const routeAuthorityEntry =
    "V2-M1.6-P0R-B9-R2-ROUTE-AUTHORITY-PRODUCER-ROOT-REMEDIATION";
  const remediationEntry =
    "V2-M1.6-P0R-B8-FIXED-DISPATCH-TRANSPORT-STAGING-ROOT-REMEDIATION";
  const runtimeNamespaceEntry =
    "V2-M1.6-P0R-B7-SOURCE-BOUND-NODE-RUNTIME-CAPSULE-ROOT-REMEDIATION";
  const [matrix, context, index, sequence, blueprint, healthContractReport] = await Promise.all([
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
    readFile(new URL(
      "../../../../docs/blueprints/V2_PRODUCTION_EVIDENCE_GATEWAY_HEALTH_CONTRACT_REMEDIATION_REPORT.md",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.equal(matrix.currentImplementationEntry.id, expectedEntry);
  assert.equal(
    matrix.currentImplementationEntry.rootCause,
    "fixed_dispatch_was_pull_only_and_left_sanitized_results_on_the_server_forcing_repeated_browser_or_manual_result_extraction",
  );
  assert.equal(
    matrix.currentImplementationEntry.qualifiedUpstreamRouteAuthorityEntry,
    routeAuthorityEntry,
  );
  assert.deepEqual(matrix.currentImplementationEntry.supersededResultPaths, [
    "EDGE_API_EXPLORER_RESPONSE_READING",
    "AX_OR_BROWSER_STATE_RECOVERY",
    "ORCATERM_RESULT_UPLOAD_OR_DOWNLOAD",
    "MANUAL_PLAINTEXT_COPY",
  ]);
  assert.deepEqual(matrix.currentImplementationEntry.architecture, {
    productionSigner: "PINNED_PRODUCTION_SSH_ED25519_HOST_KEY_NAMESPACE_SIGNATURE",
    recipient: "LOCAL_X25519_PUBLIC_RECIPIENT",
    encryption: "X25519_HKDF_SHA256_AES_256_GCM",
    transport: "EXISTING_CADDY_HTTP_HIGH_ENTROPY_EXACT_CIPHERTEXT_ROUTE",
    retrieval: "LOCAL_FIXED_SOCKS_POLLER_STRICT_NO_REDIRECT",
    persistence: "MODE_0600_ATOMIC_NO_CLOBBER_PAYLOAD_SEALED_AND_RECEIPT",
    retentionSeconds: 7_200,
    cleanup: "PER_DISPATCH_HARDENED_TRANSIENT_SYSTEMD_TIMER_PLUS_PRUNE",
  });
  assert.equal(
    matrix.currentImplementationEntry.productionMutationScope,
    "CADDY_ONLY_FORCE_RECREATE_WITH_CURRENT_IMAGE",
  );
  assert.equal(matrix.currentImplementationEntry.automaticBaselineCaddyRollbackRequired, true);
  assert.equal(matrix.currentImplementationEntry.productionRepositoryMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.databaseMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.redisMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.workerMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.envMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.migrationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.featureFlagMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.otherContainerMutationAllowed, false);
  assert.equal(matrix.currentImplementationEntry.controlFileNoFollowMode600StableDescriptorRequired, true);
  assert.equal(matrix.currentImplementationEntry.localProductionDispatchTestsPassed, 37);
  assert.equal(matrix.currentImplementationEntry.localGatewayTestsPassed, 8);
  assert.equal(matrix.currentImplementationEntry.localP0RRebindTestsPassed, 14);
  assert.equal(matrix.currentImplementationEntry.localV2OpsTestsPassed, 275);
  assert.equal(matrix.currentImplementationEntry.localFaultInjectionPassed, true);
  assert.equal(matrix.currentImplementationEntry.localDockerOrCaddyCliAvailable, false);
  assert.equal(matrix.currentImplementationEntry.realCaddyValidationRequiredBeforeMutation, true);
  assert.equal(matrix.currentImplementationEntry.realCaddyValidationPassed, false);
  assert.equal(matrix.currentImplementationEntry.firstLatestBytesFullCiAttemptPassed, false);
  assert.equal(
    matrix.currentImplementationEntry.firstLatestBytesFullCiFailure,
    "RECURRENCE_AUTHORITY_SURFACES_STALE",
  );
  assert.equal(matrix.currentImplementationEntry.authoritySurfaceSyncRemediationApplied, true);
  assert.equal(matrix.currentImplementationEntry.cleanExactImplementationCommitCreated, true);
  assert.equal(
    matrix.currentImplementationEntry.implementationCommit,
    "1ddc0fdc9408c697fcb73c42fe2b4c6e98b34e3e",
  );
  assert.equal(
    matrix.currentImplementationEntry.authoritySyncRemediationCommit,
    "35d7b63a40f9a21a07a44a974c0a1250b1c6c9be",
  );
  assert.equal(
    matrix.currentImplementationEntry.healthContractRemediationCommit,
    "51886b038b6dfa5e1bf0169abc518810de7eb2d5",
  );
  assert.equal(matrix.currentImplementationEntry.healthContractRemediationCleanCommitCreated, true);
  assert.equal(matrix.currentImplementationEntry.authoritySyncFinalBytesFullLocalCiPassed, true);
  assert.equal(matrix.currentImplementationEntry.latestFullLocalCiPassed, true);
  assert.equal(matrix.currentImplementationEntry.latestRemediationDirectedGatewayTestsPassed, 8);
  assert.equal(matrix.currentImplementationEntry.latestRemediationTargetedEslintPassed, true);
  assert.equal(matrix.currentImplementationEntry.latestRemediationFullLocalCiPending, false);
  assert.equal(matrix.currentImplementationEntry.latestRemediationFullLocalCiPassed, true);
  assert.equal(
    matrix.currentImplementationEntry.latestRemediationFullLocalCiRecurrenceTestsPassed,
    11,
  );
  assert.equal(
    matrix.currentImplementationEntry.latestRemediationFullLocalCiV2FoundationPassed,
    638,
  );
  assert.equal(matrix.currentImplementationEntry.latestRemediationFullLocalCiV2OpsPassed, 275);
  assert.equal(matrix.currentImplementationEntry.latestRemediationFullLocalCiM0ChecksPassed, 12);
  assert.equal(matrix.currentImplementationEntry.lastQualifiedFullLocalCiPassed, true);
  assert.equal(matrix.currentImplementationEntry.lastQualifiedFullLocalCiV2FoundationTotal, 644);
  assert.equal(matrix.currentImplementationEntry.lastQualifiedFullLocalCiV2FoundationPassed, 638);
  assert.equal(
    matrix.currentImplementationEntry.lastQualifiedFullLocalCiV2FoundationExplicitSkipped,
    6,
  );
  assert.equal(matrix.currentImplementationEntry.lastQualifiedFullLocalCiV2OpsPassed, 274);
  assert.equal(matrix.currentImplementationEntry.lastQualifiedFullLocalCiM0ChecksPassed, 12);
  assert.equal(matrix.currentImplementationEntry.latestRemoteFourGatesPassed, false);
  assert.equal(matrix.currentImplementationEntry.lastQualifiedRemoteFourGatesPassed, true);
  assert.equal(
    matrix.currentImplementationEntry.lastQualifiedSourceCommit,
    "dd67d81910f5696049d4271d527c264f2e42115f",
  );
  assert.equal(matrix.currentImplementationEntry.lastAttemptExactProductionApprovalGranted, true);
  assert.equal(matrix.currentImplementationEntry.lastAttemptApprovalExpiredAndForbiddenForReuse, true);
  assert.equal(matrix.currentImplementationEntry.productionMutationAuthorized, false);
  assert.equal(matrix.currentImplementationEntry.productionIntentionalMutationPerformed, false);
  assert.equal(matrix.currentImplementationEntry.freshProductionZeroDriftPassed, true);
  assert.equal(
    matrix.currentImplementationEntry.freshProductionZeroDriftScope,
    "FAILED_GATEWAY_ATTEMPT_ONLY",
  );
  assert.equal(matrix.currentImplementationEntry.p0rFreshProductionZeroDriftPassed, false);
  assert.equal(matrix.currentImplementationEntry.sensitiveEdgeResponseTabMustNotBeInspected, true);
  assert.equal(matrix.currentImplementationEntry.sensitiveEdgeResponseTabClosureConfirmed, true);
  assert.equal(
    matrix.currentImplementationEntry.lastExactProductionAttempt.signedDispatchCommit,
    "a52aa6acfbe2f4f5d26cb15a82701195ca2f32df",
  );
  assert.equal(
    matrix.currentImplementationEntry.lastExactProductionAttempt.decodedFailureReason,
    "evidence_gateway_health_not_ready",
  );
  assert.equal(
    matrix.currentImplementationEntry.lastExactProductionAttempt.stderrSha256,
    "d41cd1e0993f4f20b1024ac7e1c9ba17ea70cd9a1f0f5ec61fd96523bde9701f",
  );
  assert.equal(
    matrix.currentImplementationEntry.lastExactProductionAttempt.productionMutationPerformed,
    false,
  );
  assert.equal(matrix.currentImplementationEntry.lastExactProductionAttempt.reusable, false);
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.id,
    remediationEntry,
  );
  assert.equal(matrix.currentP0RRuntimeNamespaceRemediation.id, runtimeNamespaceEntry);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.id,
    routeAuthorityEntry,
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.id,
    "V2-M1.6-P0R-B9-R1-COS-OBJECT-LOCK-CAM-ACTION-AND-DIAGNOSTIC-REMEDIATION",
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.officialCamAction,
    "cos:GetBucketObjectLock",
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.failedRequestedCamAction,
    "cos:GetBucketObjectLockConfiguration",
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.replacementPlanSchema,
    "v2-m1-production-storage-cos-provisioning-plan.v4",
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.replacementCredentialSchema,
    "v2-m1-production-storage-cos-temporary-credentials.v3",
  );
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.replacementBridgeSchema,
    "v2-m1-production-storage-p0r-local-tty-bridge.v4",
  );
  assert.equal(matrix.currentP0RB9CosAuthorizationRemediation.fullLocalCiPassed, true);
  assert.equal(matrix.currentP0RB9CosAuthorizationRemediation.fullLocalCiPending, false);
  assert.equal(matrix.currentP0RB9CosAuthorizationRemediation.fullLocalCiV2OpsPassed, 235);
  assert.equal(
    matrix.currentP0RB9CosAuthorizationRemediation.productionZeroDriftPassed,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementBridgeSchema,
    "v2-m1-production-storage-p0r-local-tty-bridge.v5",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementSessionSchema,
    "v2-m1-production-storage-p0r-session.v5",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementTransactionSchema,
    "market-radar-v2-m1-p0r-external-transaction.v1",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementRouteEvidenceSchema,
    "market-radar-v2-m1-p0r-external-route-evidence.v2",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementRouteTargetSchema,
    "market-radar-v2-m1-p0r-route-target.v1",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementTencentFirewallCaptureSchema,
    "market-radar-v2-m1-p0r-tencent-firewall-capture.v1",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementListenerObservationSchema,
    "market-radar-v2-m1-p0r-listener-observation.v1",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.replacementTransportSchema,
    "v2-m1-production-storage-p0r-transport.v4",
  );
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.replacementTransportMemberCount, 17);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.replacementCurrentRuntimeFileCount, 9);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.authoritativeRouteProducerRequired, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.canonicalRouteControlInputsRequired, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.provisioningPlanExactShaBound, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.firewallIdentityRecomputedFromProviderResponse, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.listenerObservationDigestRecomputed, true);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.routeEvidenceMaxAgeSeconds,
    120,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.cleanupEvidenceMaxAgeSeconds,
    120,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.detachedAuthorizeCommandAllowed,
    false,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.bridgeOutputExactAllowlistRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.bridgeExactTerminalSequenceRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.bridgeSafeOutputMaxBytes,
    65_536,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.bridgeSafeStatusMaxCount,
    64,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .secureControlFileNoFollowStableReadRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.secureControlFileMaxBytes,
    1_048_576,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.leaseContractExactValidationRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.clipboardCleanupCoversPreflightFailure,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .operatorReadyForwardedOnlyAfterRouteAndDualTtyAuthorization,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.postIssuanceNetworkReconnectRequired,
    false,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.targetedP0RTestsPassed,
    139,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.freshRebindRequestSchema,
    "market-radar-v2-m1-p0r-rebind-request.v4",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.freshRebindResultSchema,
    "market-radar-v2-m1-p0r-rebind-result.v3",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .freshRebindForbiddenListenerPort,
    8022,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .freshRebindForbiddenListenerUnit,
    "market-radar-p0r-8022.service",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .freshRebindForbiddenListenerAndUnitAbsenceRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .tencentFirewallMultiPagePaginationRegressionPassed,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .tencentFirewallProtocolPortSemanticsValidated,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation
      .tencentFirewallRequestIdUniquenessRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.sshIdentityNoFollowStableReadRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.sshIdentityPrePostDriftCheckRequired,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.exactToolchainAutoDispatchRequired,
    true,
  );
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.exactToolchainLauncherTestsPassed, 3);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.isolatedV2OpsTestsPassed, 266);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.wrongDefaultToolchainAttemptCount, 1);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.wrongDefaultToolchainAttemptCountedAsPass,
    false,
  );
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.routeAuthorityProducerTransactionTestsPassed, 24);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiPassed, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiPending, false);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiBranch,
    "codex/market-radar-v2-implementation",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.historicalCandidateCiBlocker,
    "REQUIRED_UNIQUE_V2_IMPLEMENTATION_BRANCH_IDENTITY",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiV2FoundationPassed,
    637,
  );
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiV2OpsPassed, 266);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fullLocalCiM0ChecksPassed, 12);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.routeAuthorityImplementationCommit,
    "157e9a79a635d8f31857481fbd6a51d10df51160",
  );
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.cleanExactSourcePassed, true);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fourRemoteGatesPending, false);
  assert.equal(matrix.currentP0RB9ExternalTransactionRemediation.fourRemoteGatesPassed, true);
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.routeIdentityRaceRemediationCommit,
    "913bae3a2db4d8f172d0de9be87305ad21b53884",
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.externalCloudCleanupPending,
    true,
  );
  assert.equal(
    matrix.currentP0RB9ExternalTransactionRemediation.productionZeroDriftPassed,
    false,
  );
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.id, routeAuthorityEntry);
  assert.equal(
    matrix.currentP0RRouteAuthorityRemediation.routeEvidenceSchema,
    "market-radar-v2-m1-p0r-external-route-evidence.v2",
  );
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.transportMemberCount, 17);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.currentRuntimeSourceFileCount, 9);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.routeAuthorityProducerTransactionTestsPassed, 24);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.targetedP0RTestsPassed, 139);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.exactToolchainAutoDispatchRequired, true);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.exactToolchainLauncherTestsPassed, 3);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.isolatedV2OpsTestsPassed, 266);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fullLocalCiPassed, true);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fullLocalCiPending, false);
  assert.equal(
    matrix.currentP0RRouteAuthorityRemediation.fullLocalCiBranch,
    "codex/market-radar-v2-implementation",
  );
  assert.equal(
    matrix.currentP0RRouteAuthorityRemediation.historicalCandidateCiBlocker,
    "REQUIRED_UNIQUE_V2_IMPLEMENTATION_BRANCH_IDENTITY",
  );
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fullLocalCiV2FoundationPassed, 637);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fullLocalCiV2OpsPassed, 266);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fullLocalCiM0ChecksPassed, 12);
  assert.equal(
    matrix.currentP0RRouteAuthorityRemediation.routeAuthorityImplementationCommit,
    "157e9a79a635d8f31857481fbd6a51d10df51160",
  );
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.cleanCommitPassed, true);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fourRemoteGatesPending, false);
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.fourRemoteGatesPassed, true);
  assert.equal(
    matrix.currentP0RRouteAuthorityRemediation.routeIdentityRaceRemediationCommit,
    "913bae3a2db4d8f172d0de9be87305ad21b53884",
  );
  assert.equal(matrix.currentP0RRouteAuthorityRemediation.executionAuthority, false);
  assert.equal(matrix.currentP0RTransportStagingRemediation.targetProductionStagingTestsPassed, 11);
  assert.equal(matrix.currentP0RTransportStagingRemediation.p0rTestsPassed, 111);
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.qualifiedOuterSourceCommit,
    "15d7cb3899b5f8c4763390fa0baba8e51aa29d56",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.initialUnsafeAncestorMode,
    "0755",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.deliveryParentRemediatedMode,
    "0700",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.freshAcceptedDispatchCommit,
    "d5ea6e44797cd88239a474961bfa91cf4bf6ca6d",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.productionTargetRegularFileCount,
    16,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.productionTargetStagingAccepted,
    true,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.productionBusinessMutationPerformed,
    false,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.postAcceptanceProductionDispatchTestsPassed,
    25,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.fullLocalCiV2OpsPassed,
    233,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.postAcceptanceGuardrailFullCiPassed,
    true,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.postAcceptanceGuardrailFullCiPending,
    false,
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.postAcceptanceGuardrailNodeVersion,
    "22.23.1",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.postAcceptanceGuardrailGoVersion,
    "1.26.3",
  );
  assert.equal(
    matrix.currentP0RTransportStagingRemediation.realRecoveryPending,
    true,
  );
  assert.equal(matrix.currentP0RLocalTtyBridgeRemediation.currentRecurrenceTestsPassed, 11);
  const contextCurrentEntry = context.split("## 18. 当前执行入口与关键外部门")[1]
    ?.split("## 19.")[0];
  const indexCurrentEntry = index.split("## 6. 当前实施入口")[1]
    ?.split("## 7.")[0];
  assert.match(contextCurrentEntry ?? "", new RegExp(expectedEntry, "u"));
  assert.doesNotMatch(
    contextCurrentEntry ?? "",
    new RegExp(`^${routeAuthorityEntry}$`, "mu"),
  );
  assert.match(indexCurrentEntry ?? "", new RegExp(expectedEntry, "u"));
  assert.doesNotMatch(
    indexCurrentEntry ?? "",
    new RegExp(`^${routeAuthorityEntry}$`, "mu"),
  );
  assert.match(sequence, new RegExp(`Current execution entry: ${expectedEntry}`, "u"));
  assert.ok(blueprint.includes(`**当前执行入口**：\`${expectedEntry}\``));
  assert.equal(
    matrix.authority.m1ProductionEvidenceGatewayHealthContractRemediationReport,
    "docs/blueprints/V2_PRODUCTION_EVIDENCE_GATEWAY_HEALTH_CONTRACT_REMEDIATION_REPORT.md",
  );
  assert.match(healthContractReport, /dd67d81910f5696049d4271d527c264f2e42115f/u);
  assert.match(healthContractReport, /evidence_gateway_health_not_ready/u);
  assert.match(healthContractReport, /FULL_CI_PASS/u);
});
