import { z } from "zod";
import type {
  ActionState,
  DetectorEmissionScope,
} from "../../domain/states";
import { canDetectorEmit } from "../../domain/states";
import { CONSTITUTIONAL_INVARIANTS } from "../../domain/product-constitution";
import { deepFreezeArtifact, stableContentHash } from "../universe/stable-artifact";
import {
  AnalysisSnapshotSchema,
  CandidateEpisodeSchema,
  EvidencePackageSchema,
  ExecutionFeasibilitySnapshotSchema,
  OpportunityThesisSchema,
  SignalQualificationSchema,
  StrategyDecisionSchema,
  StrategyDraftSchema,
} from "../../runtime-schema/decision-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  QualityAssessmentSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";

export const M3_FINAL_DECISION_CONTRACT_VERSION =
  "m3-final-decision-contract.v1" as const;

const M3DecisionScopeSchema = z.enum([
  "TEST_ONLY",
  "REPLAY",
  "SHADOW",
  "LIMITED",
  "PRODUCTION",
]);

export type M3DecisionScope = z.infer<typeof M3DecisionScopeSchema>;

export const M3DecisionAuthorizationSchema = z.strictObject({
  schemaVersion: z.literal("m3-decision-authorization.v1"),
  releaseId: NonEmptyStringSchema,
  decisionScope: M3DecisionScopeSchema,
  m1EngineeringExitStatus: z.enum(["PASS", "BLOCKED", "NOT_EVALUATED"]),
  m2LifecycleGateStatus: z.enum(["PASS", "FAIL", "INSUFFICIENT", "INVALID"]),
  candidateEmissionAllowed: z.boolean(),
  finalDecisionAuthorityEnabled: z.boolean(),
  productionWriteAuthorityEnabled: z.boolean(),
  authorizedAt: IsoDateTimeSchema.nullable(),
  evidenceIds: z.array(NonEmptyStringSchema),
}).superRefine((authorization, context) => {
  if (
    authorization.finalDecisionAuthorityEnabled &&
    (authorization.authorizedAt === null || authorization.evidenceIds.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "enabled final-decision authority requires dated evidence",
      path: ["evidenceIds"],
    });
  }
  if (
    authorization.productionWriteAuthorityEnabled &&
    authorization.decisionScope !== "PRODUCTION"
  ) {
    context.addIssue({
      code: "custom",
      message: "production write authority is forbidden outside production scope",
      path: ["productionWriteAuthorityEnabled"],
    });
  }
  if (
    authorization.productionWriteAuthorityEnabled &&
    !authorization.finalDecisionAuthorityEnabled
  ) {
    context.addIssue({
      code: "custom",
      message: "production write authority requires final-decision authority",
      path: ["productionWriteAuthorityEnabled"],
    });
  }
  if (
    authorization.finalDecisionAuthorityEnabled &&
    (
      authorization.decisionScope === "TEST_ONLY" ||
      authorization.m1EngineeringExitStatus !== "PASS" ||
      authorization.m2LifecycleGateStatus !== "PASS" ||
      !authorization.candidateEmissionAllowed
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "final-decision authority requires passed upstream gates and candidate emission",
      path: ["finalDecisionAuthorityEnabled"],
    });
  }
});

export const M3EntryTriggerObservationSchema = z.strictObject({
  schemaVersion: z.literal("m3-entry-trigger-observation.v1"),
  status: z.enum([
    "NOT_EVALUATED",
    "PENDING",
    "CONFIRMED",
    "INVALIDATED",
    "EXPIRED",
  ]),
  observedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  factIds: z.array(NonEmptyStringSchema),
  quality: QualityAssessmentSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((trigger, context) => {
  if (Date.parse(trigger.sourceCutoff) > Date.parse(trigger.observedAt)) {
    context.addIssue({
      code: "custom",
      message: "trigger observation cannot precede its source cutoff",
      path: ["observedAt"],
    });
  }
  if (trigger.status === "CONFIRMED" && trigger.factIds.length === 0) {
    context.addIssue({
      code: "custom",
      message: "a confirmed trigger requires point-in-time fact references",
      path: ["factIds"],
    });
  }
});

export const M3RuntimeDecisionGateSchema = z.strictObject({
  schemaVersion: z.literal("m3-runtime-decision-gate.v1"),
  releaseId: NonEmptyStringSchema,
  status: z.enum(["READY", "PARTIAL", "STALE", "UNAVAILABLE"]),
  checkedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((runtime, context) => {
  if (Date.parse(runtime.sourceCutoff) > Date.parse(runtime.checkedAt)) {
    context.addIssue({
      code: "custom",
      message: "runtime gate cannot precede its source cutoff",
      path: ["checkedAt"],
    });
  }
  if (runtime.status !== "READY" && runtime.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "a non-ready runtime gate requires a reason code",
      path: ["reasonCodes"],
    });
  }
});

export const M3FinalDecisionBundleSchema = z.strictObject({
  schemaVersion: z.literal(M3_FINAL_DECISION_CONTRACT_VERSION),
  authorization: M3DecisionAuthorizationSchema,
  episode: CandidateEpisodeSchema,
  thesis: OpportunityThesisSchema,
  evidence: EvidencePackageSchema,
  analysis: AnalysisSnapshotSchema,
  qualification: SignalQualificationSchema,
  draft: StrategyDraftSchema,
  feasibility: ExecutionFeasibilitySnapshotSchema,
  trigger: M3EntryTriggerObservationSchema,
  runtime: M3RuntimeDecisionGateSchema,
  decision: StrategyDecisionSchema,
});

export type M3FinalDecisionBundle = z.infer<typeof M3FinalDecisionBundleSchema>;

export type M3DecisionContractIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3FinalDecisionAssessment = Readonly<{
  schemaVersion: typeof M3_FINAL_DECISION_CONTRACT_VERSION;
  validationStatus: "PASS" | "BLOCKED";
  authorityStatus: "AUTHORIZED" | "NOT_AUTHORIZED";
  expectedActionState: ActionState | null;
  executablePlanExposureAllowed: boolean;
  reasonCodes: readonly string[];
  issues: readonly M3DecisionContractIssue[];
  assessmentHash: string;
}>;

type TraceArtifact = Readonly<{
  releaseId: string;
  sourceCutoff: string;
  generatedAt: string;
}>;

function issue(
  issues: M3DecisionContractIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function addChronologyIssue(
  issues: M3DecisionContractIssue[],
  artifact: TraceArtifact,
  path: string,
  inputArtifacts: readonly TraceArtifact[],
): void {
  const sourceCutoff = Date.parse(artifact.sourceCutoff);
  const generatedAt = Date.parse(artifact.generatedAt);
  if (sourceCutoff > generatedAt) {
    issue(
      issues,
      "artifact_generated_before_source_cutoff",
      `${path}.generatedAt`,
      `${path} cannot be generated before its source cutoff`,
    );
  }
  if (
    inputArtifacts.some((inputArtifact) =>
      sourceCutoff < Date.parse(inputArtifact.sourceCutoff) ||
      generatedAt < Date.parse(inputArtifact.generatedAt)
    )
  ) {
    issue(
      issues,
      "downstream_artifact_precedes_input",
      path,
      `${path} must not precede any declared input artifact`,
    );
  }
}

function addReleaseIssues(
  issues: M3DecisionContractIssue[],
  bundle: M3FinalDecisionBundle,
): void {
  const releasePairs = [
    ["authorization.releaseId", bundle.authorization.releaseId],
    ["episode.releaseId", bundle.episode.releaseId],
    ["thesis.releaseId", bundle.thesis.releaseId],
    ["evidence.releaseId", bundle.evidence.releaseId],
    ["analysis.releaseId", bundle.analysis.releaseId],
    ["qualification.releaseId", bundle.qualification.releaseId],
    ["draft.releaseId", bundle.draft.releaseId],
    ["feasibility.releaseId", bundle.feasibility.releaseId],
    ["runtime.releaseId", bundle.runtime.releaseId],
    ["decision.releaseId", bundle.decision.releaseId],
  ] as const;
  const expectedRelease = bundle.authorization.releaseId;
  for (const [path, releaseId] of releasePairs) {
    if (releaseId !== expectedRelease) {
      issue(
        issues,
        "cross_release_composition_forbidden",
        path,
        "every final-decision input must use the authorized release",
      );
    }
  }
}

function addIdentityIssues(
  issues: M3DecisionContractIssue[],
  bundle: M3FinalDecisionBundle,
): void {
  const { episode, thesis, evidence, analysis, qualification, draft, feasibility, decision } =
    bundle;
  const expected = {
    episodeId: episode.episodeId,
    thesisId: episode.thesisId,
    evidencePackageId: evidence.evidencePackageId,
    analysisId: analysis.analysisId,
    qualificationId: qualification.qualificationId,
    draftId: draft.draftId,
    feasibilityId: feasibility.feasibilityId,
  };
  const mismatches = [
    ["thesis.episodeId", thesis.episodeId, expected.episodeId],
    ["thesis.thesisId", thesis.thesisId, expected.thesisId],
    ["evidence.episodeId", evidence.episodeId, expected.episodeId],
    ["evidence.thesisId", evidence.thesisId, expected.thesisId],
    ["analysis.episodeId", analysis.episodeId, expected.episodeId],
    ["analysis.thesisId", analysis.thesisId, expected.thesisId],
    ["analysis.evidencePackageId", analysis.evidencePackageId, expected.evidencePackageId],
    ["qualification.episodeId", qualification.episodeId, expected.episodeId],
    ["qualification.thesisId", qualification.thesisId, expected.thesisId],
    ["qualification.evidencePackageId", qualification.evidencePackageId, expected.evidencePackageId],
    ["qualification.analysisId", qualification.analysisId, expected.analysisId],
    [
      "qualification.marketContextSnapshotId",
      qualification.marketContextSnapshotId,
      analysis.marketContextSnapshotId,
    ],
    ["draft.episodeId", draft.episodeId, expected.episodeId],
    ["draft.analysisId", draft.analysisId, expected.analysisId],
    ["draft.qualificationId", draft.qualificationId, expected.qualificationId],
    ["feasibility.draftId", feasibility.draftId, expected.draftId],
    ["decision.episodeId", decision.episodeId, expected.episodeId],
    ["decision.draftId", decision.draftId, expected.draftId],
    ["decision.feasibilityId", decision.feasibilityId, expected.feasibilityId],
  ] as const;
  for (const [path, actual, expectedValue] of mismatches) {
    if (actual !== expectedValue) {
      issue(
        issues,
        "artifact_identity_lineage_mismatch",
        path,
        `${path} does not match its authoritative upstream artifact`,
      );
    }
  }

  if (
    thesis.opportunityFamily !== episode.opportunityFamily ||
    analysis.opportunityFamily !== episode.opportunityFamily ||
    qualification.opportunityFamily !== episode.opportunityFamily
  ) {
    issue(
      issues,
      "opportunity_family_lineage_mismatch",
      "analysis.opportunityFamily",
      "episode, thesis, analysis and qualification must keep the same opportunity family",
    );
  }
  if (
    analysis.directionBias === "NEUTRAL" ||
    analysis.directionBias === "UNKNOWN" ||
    analysis.directionBias !== draft.direction ||
    qualification.direction !== analysis.directionBias
  ) {
    issue(
      issues,
      "strategy_direction_not_supported_by_analysis",
      "draft.direction",
      "a strategy direction requires the same explicit family-analysis direction",
    );
  }
  const expectedEvidenceItemIds = evidence.items
    .map((item) => item.evidenceId)
    .sort();
  if (
    stableContentHash([...analysis.evidenceItemIds].sort()) !==
      stableContentHash(expectedEvidenceItemIds)
  ) {
    issue(
      issues,
      "analysis_evidence_item_lineage_incomplete",
      "analysis.evidenceItemIds",
      "family analysis must account for every evidence item exactly once",
    );
  }
}

function authorizationReasons(bundle: M3FinalDecisionBundle): string[] {
  const reasons = new Set<string>();
  const { authorization, thesis } = bundle;
  if (authorization.decisionScope === "TEST_ONLY") {
    reasons.add("test_only_scope_has_no_decision_authority");
  }
  if (authorization.m1EngineeringExitStatus !== "PASS") {
    reasons.add("m1_engineering_exit_not_passed");
  }
  if (authorization.m2LifecycleGateStatus !== "PASS") {
    reasons.add("m2_lifecycle_gate_not_passed");
  }
  if (!authorization.candidateEmissionAllowed) {
    reasons.add("candidate_emission_not_authorized");
  }
  if (!authorization.finalDecisionAuthorityEnabled) {
    reasons.add("final_decision_authority_not_enabled");
  }
  if (
    authorization.decisionScope === "PRODUCTION" &&
    !authorization.productionWriteAuthorityEnabled
  ) {
    reasons.add("production_write_authority_not_enabled");
  }
  if (authorization.decisionScope !== "TEST_ONLY") {
    const scope = authorization.decisionScope as DetectorEmissionScope;
    if (
      thesis.detectorSources.some((source) =>
        source.emissionScope !== scope ||
        !canDetectorEmit(source.detectorLifecycle, scope)
      )
    ) {
      reasons.add("detector_lifecycle_or_scope_not_authorized");
    }
  }
  if (bundle.episode.lifecycle !== "PROMOTED") {
    reasons.add("candidate_episode_not_promoted");
  }
  const requiredAnalysisAuthority = {
    REPLAY: "REPLAY_CALIBRATED",
    SHADOW: "SHADOW_CALIBRATED",
    LIMITED: "LIMITED_CALIBRATED",
    PRODUCTION: "PRODUCTION_CALIBRATED",
  } as const;
  if (
    authorization.decisionScope !== "TEST_ONLY" &&
    bundle.analysis.analysisAuthority !==
      requiredAnalysisAuthority[authorization.decisionScope]
  ) {
    reasons.add("family_analysis_authority_not_calibrated_for_scope");
  }
  const requiredQualificationAuthority = {
    REPLAY: "REPLAY_CALIBRATED",
    SHADOW: "SHADOW_CALIBRATED",
    LIMITED: "LIMITED_CALIBRATED",
    PRODUCTION: "PRODUCTION_CALIBRATED",
  } as const;
  if (
    authorization.decisionScope !== "TEST_ONLY" &&
    bundle.qualification.qualificationAuthority !==
      requiredQualificationAuthority[authorization.decisionScope]
  ) {
    reasons.add("signal_qualification_authority_not_calibrated_for_scope");
  }
  return [...reasons].sort();
}

function criticalBlockReasons(bundle: M3FinalDecisionBundle): string[] {
  const reasons = new Set<string>();
  const { evidence, analysis, qualification, draft, feasibility, trigger, runtime } =
    bundle;

  if (evidence.quality.status !== "FRESH") {
    reasons.add("evidence_not_fresh");
  }
  if (evidence.completenessRatio < 1) {
    reasons.add("evidence_incomplete");
  }
  if (qualification.evidenceGrade === "INSUFFICIENT") {
    reasons.add("evidence_grade_insufficient");
  }
  if (qualification.setupGrade === "INVALID") {
    reasons.add("setup_grade_invalid");
  }
  if (qualification.setupGrade === "UNKNOWN") {
    reasons.add("setup_grade_unknown");
  }
  if (
    qualification.evidenceCalibration.abstainReasonCodes.length > 0 ||
    qualification.setupCalibration.abstainReasonCodes.length > 0
  ) {
    reasons.add("signal_qualification_calibration_abstained");
  }
  if (analysis.directionBias === "NEUTRAL" || analysis.directionBias === "UNKNOWN") {
    reasons.add("analysis_direction_unresolved");
  }
  if (draft.blockers.length > 0) {
    reasons.add("strategy_draft_has_blockers");
  }
  if (draft.targets.length === 0) {
    reasons.add("strategy_draft_has_no_target");
  }
  if (
    !Number.isFinite(draft.grossRewardRisk) ||
    draft.grossRewardRisk < CONSTITUTIONAL_INVARIANTS.minimumStructuralRewardRisk
  ) {
    reasons.add("structural_rr_below_minimum");
  }
  if (feasibility.status !== "PASS") {
    reasons.add(`execution_feasibility_${feasibility.status.toLowerCase()}`);
  }
  if (feasibility.quality.status !== "FRESH") {
    reasons.add("execution_facts_not_fresh");
  }
  if (
    feasibility.estimatedNetRewardRisk === null ||
    feasibility.estimatedNetRewardRisk < CONSTITUTIONAL_INVARIANTS.minimumNetRewardRisk
  ) {
    reasons.add("net_rr_below_minimum_or_unavailable");
  }
  if (runtime.status !== "READY") {
    reasons.add(`runtime_${runtime.status.toLowerCase()}`);
  }
  if (trigger.quality.status !== "FRESH") {
    reasons.add("trigger_fact_not_fresh");
  }
  if (trigger.status === "NOT_EVALUATED") {
    reasons.add("entry_trigger_not_evaluated");
  }
  if (trigger.status === "INVALIDATED") {
    reasons.add("entry_trigger_invalidated");
  }
  if (trigger.status === "EXPIRED") {
    reasons.add("entry_trigger_expired");
  }
  if (Date.parse(draft.expiresAt) <= Date.parse(bundle.decision.decidedAt)) {
    reasons.add("strategy_draft_expired");
  }
  return [...reasons].sort();
}

function deriveExpectedActionState(
  bundle: M3FinalDecisionBundle,
  authorityReasons: readonly string[],
  blockers: readonly string[],
): ActionState {
  if (authorityReasons.length > 0 || blockers.length > 0) {
    return "BLOCKED";
  }
  if (
    bundle.qualification.evidenceGrade === "C" ||
    bundle.qualification.setupGrade === "MARGINAL"
  ) {
    return "OBSERVE";
  }
  if (bundle.trigger.status === "PENDING") {
    return "WAIT";
  }
  return "TRADE_PLAN_READY";
}

function expectedPlanPayload(bundle: M3FinalDecisionBundle) {
  const { draft, feasibility } = bundle;
  return {
    direction: draft.direction,
    entryTrigger: draft.entryTrigger,
    plannedEntryZone: draft.plannedEntryZone,
    structuralInvalidation: draft.structuralInvalidation,
    structuralStop: draft.structuralStop,
    targets: draft.targets,
    structuralRewardRisk: draft.grossRewardRisk,
    estimatedNetRewardRisk: feasibility.estimatedNetRewardRisk,
    expiresAt: draft.expiresAt,
    noChaseCondition: draft.noChaseCondition,
  };
}

function planPayloadWithoutId(plan: NonNullable<M3FinalDecisionBundle["decision"]["executablePlan"]>) {
  return {
    direction: plan.direction,
    entryTrigger: plan.entryTrigger,
    plannedEntryZone: plan.plannedEntryZone,
    structuralInvalidation: plan.structuralInvalidation,
    structuralStop: plan.structuralStop,
    targets: plan.targets,
    structuralRewardRisk: plan.structuralRewardRisk,
    estimatedNetRewardRisk: plan.estimatedNetRewardRisk,
    expiresAt: plan.expiresAt,
    noChaseCondition: plan.noChaseCondition,
  };
}

function addDecisionIssues(
  issues: M3DecisionContractIssue[],
  bundle: M3FinalDecisionBundle,
  expectedActionState: ActionState,
  expectedReasonCodes: readonly string[],
): void {
  const { decision } = bundle;
  if (decision.actionState !== expectedActionState) {
    issue(
      issues,
      "decision_state_mismatch",
      "decision.actionState",
      `decision must be ${expectedActionState} for the supplied point-in-time gates`,
    );
  }
  if (
    decision.actionState === "TRADE_PLAN_READY" &&
    stableContentHash(planPayloadWithoutId(decision.executablePlan)) !==
      stableContentHash(expectedPlanPayload(bundle))
  ) {
    issue(
      issues,
      "ready_plan_upstream_parity_mismatch",
      "decision.executablePlan",
      "the executable plan must copy structure from the draft and net RR from feasibility",
    );
  }
  const missingReasonCodes = expectedReasonCodes.filter(
    (reasonCode) => !decision.reasonCodes.includes(reasonCode),
  );
  if (missingReasonCodes.length > 0) {
    issue(
      issues,
      "decision_reason_codes_incomplete",
      "decision.reasonCodes",
      `decision is missing derived reason codes: ${missingReasonCodes.join(",")}`,
    );
  }
}

function expectedDecisionReasonCodes(
  bundle: M3FinalDecisionBundle,
  authorityReasons: readonly string[],
  blockerReasons: readonly string[],
  expectedActionState: ActionState,
): string[] {
  const reasons = new Set([...authorityReasons, ...blockerReasons]);
  if (expectedActionState === "OBSERVE") {
    if (bundle.qualification.evidenceGrade === "C") {
      reasons.add("evidence_grade_c_observe");
    }
    if (bundle.qualification.setupGrade === "MARGINAL") {
      reasons.add("setup_grade_marginal_observe");
    }
  } else if (expectedActionState === "WAIT") {
    reasons.add("entry_trigger_pending");
  } else if (expectedActionState === "TRADE_PLAN_READY") {
    reasons.add("all_final_decision_gates_passed");
  }
  return [...reasons].sort();
}

function schemaFailureAssessment(error: z.ZodError): M3FinalDecisionAssessment {
  const issues = error.issues.map((schemaIssue) => ({
    code: "bundle_schema_rejected",
    path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
    message: schemaIssue.message,
  }));
  const body = {
    schemaVersion: M3_FINAL_DECISION_CONTRACT_VERSION,
    validationStatus: "BLOCKED" as const,
    authorityStatus: "NOT_AUTHORIZED" as const,
    expectedActionState: null,
    executablePlanExposureAllowed: false,
    reasonCodes: ["bundle_schema_rejected"],
    issues,
  };
  return deepFreezeArtifact({
    ...body,
    assessmentHash: stableContentHash(body),
  });
}

export function assessM3FinalDecisionBundle(
  input: unknown,
): M3FinalDecisionAssessment {
  const parsed = M3FinalDecisionBundleSchema.safeParse(input);
  if (!parsed.success) {
    return schemaFailureAssessment(parsed.error);
  }

  const bundle = parsed.data;
  const issues: M3DecisionContractIssue[] = [];
  addReleaseIssues(issues, bundle);
  addIdentityIssues(issues, bundle);

  addChronologyIssue(issues, bundle.episode, "episode", []);
  addChronologyIssue(issues, bundle.thesis, "thesis", [bundle.episode]);
  addChronologyIssue(issues, bundle.evidence, "evidence", [bundle.thesis]);
  addChronologyIssue(issues, bundle.analysis, "analysis", [
    bundle.thesis,
    bundle.evidence,
  ]);
  addChronologyIssue(issues, bundle.qualification, "qualification", [
    bundle.evidence,
    bundle.analysis,
  ]);
  addChronologyIssue(issues, bundle.draft, "draft", [
    bundle.analysis,
    bundle.qualification,
  ]);
  addChronologyIssue(issues, bundle.feasibility, "feasibility", [bundle.draft]);
  addChronologyIssue(issues, bundle.decision, "decision", [
    bundle.draft,
    bundle.feasibility,
  ]);

  if (Date.parse(bundle.trigger.observedAt) > Date.parse(bundle.decision.decidedAt)) {
    issue(
      issues,
      "decision_precedes_trigger_observation",
      "decision.decidedAt",
      "the final decision cannot precede its trigger observation",
    );
  }
  if (Date.parse(bundle.runtime.checkedAt) > Date.parse(bundle.decision.decidedAt)) {
    issue(
      issues,
      "decision_precedes_runtime_gate",
      "decision.decidedAt",
      "the final decision cannot precede its runtime gate",
    );
  }
  if (
    Date.parse(bundle.trigger.sourceCutoff) < Date.parse(bundle.draft.sourceCutoff) ||
    Date.parse(bundle.trigger.observedAt) < Date.parse(bundle.draft.generatedAt)
  ) {
    issue(
      issues,
      "trigger_precedes_strategy_draft",
      "trigger",
      "the entry trigger must be observed from facts available after strategy construction",
    );
  }
  if (
    Date.parse(bundle.runtime.sourceCutoff) < Date.parse(bundle.feasibility.sourceCutoff) ||
    Date.parse(bundle.runtime.checkedAt) < Date.parse(bundle.feasibility.generatedAt)
  ) {
    issue(
      issues,
      "runtime_gate_precedes_feasibility",
      "runtime",
      "the runtime gate must include the execution-feasibility cutoff",
    );
  }
  if (
    bundle.authorization.authorizedAt !== null &&
    Date.parse(bundle.authorization.authorizedAt) > Date.parse(bundle.decision.decidedAt)
  ) {
    issue(
      issues,
      "decision_precedes_authorization",
      "decision.decidedAt",
      "the final decision cannot precede its authority evidence",
    );
  }
  if (
    Date.parse(bundle.decision.sourceCutoff) < Date.parse(bundle.trigger.sourceCutoff) ||
    Date.parse(bundle.decision.sourceCutoff) < Date.parse(bundle.runtime.sourceCutoff)
  ) {
    issue(
      issues,
      "decision_cutoff_omits_latest_gate",
      "decision.sourceCutoff",
      "the final decision cutoff must include trigger and runtime gate cutoffs",
    );
  }

  const authorityReasonCodes = authorizationReasons(bundle);
  const blockerReasonCodes = criticalBlockReasons(bundle);
  const expectedActionState = deriveExpectedActionState(
    bundle,
    authorityReasonCodes,
    blockerReasonCodes,
  );
  const requiredDecisionReasonCodes = expectedDecisionReasonCodes(
    bundle,
    authorityReasonCodes,
    blockerReasonCodes,
    expectedActionState,
  );
  addDecisionIssues(
    issues,
    bundle,
    expectedActionState,
    requiredDecisionReasonCodes,
  );

  const reasonCodes = [...new Set([
    ...authorityReasonCodes,
    ...blockerReasonCodes,
  ])].sort();
  const authorityStatus = authorityReasonCodes.length === 0
    ? "AUTHORIZED" as const
    : "NOT_AUTHORIZED" as const;
  const validationStatus = issues.length === 0 ? "PASS" as const : "BLOCKED" as const;
  const executablePlanExposureAllowed =
    validationStatus === "PASS" &&
    authorityStatus === "AUTHORIZED" &&
    expectedActionState === "TRADE_PLAN_READY" &&
    bundle.decision.actionState === "TRADE_PLAN_READY";
  const body = {
    schemaVersion: M3_FINAL_DECISION_CONTRACT_VERSION,
    validationStatus,
    authorityStatus,
    expectedActionState,
    executablePlanExposureAllowed,
    reasonCodes,
    issues: issues.sort((left, right) =>
      `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
    ),
  };
  return deepFreezeArtifact({
    ...body,
    assessmentHash: stableContentHash(body),
  });
}
