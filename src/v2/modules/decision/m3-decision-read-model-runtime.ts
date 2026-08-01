import type {
  DecisionSnapshot,
  PersonalRiskView,
  PortfolioRiskView,
  QualityAssessment,
} from "../../domain/contracts";
import type { DataQualityState, UserFit } from "../../domain/states";
import {
  DecisionSnapshotSchema,
  PersonalRiskViewSchema,
  PortfolioRiskViewSchema,
} from "../../runtime-schema/decision-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  M3_FINAL_DECISION_CONTRACT_VERSION,
  M3FinalDecisionBundleSchema,
  assessM3FinalDecisionBundle,
} from "./m3-final-decision-contract";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

const QUALITY_SEVERITY: Readonly<Record<DataQualityState, number>> =
  Object.freeze({
    FRESH: 0,
    PARTIAL: 1,
    STALE: 2,
    RATE_LIMITED: 3,
    TRANSPORT_ERROR: 4,
    AUTH_ERROR: 5,
    UNAVAILABLE: 6,
    INVALID: 7,
  });

const USER_FIT_SEVERITY: Readonly<Record<UserFit, number>> = Object.freeze({
  SUITABLE: 0,
  CONDITIONAL: 1,
  UNSUITABLE: 2,
  UNAVAILABLE: 3,
});

export const M3_DECISION_READ_MODEL_RUNTIME_VERSION =
  "m3-decision-read-model-runtime.v1" as const;

export type M3DecisionReadModelBuildInput = Readonly<{
  finalDecisionBundle: unknown;
  personalRiskView: unknown | null;
  portfolioRiskView: unknown | null;
  generatedAt: string;
  factVersion: string;
  featureVersion: string;
  ruleVersions: Readonly<Record<string, string>>;
  previousSnapshot?: unknown | null;
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function assertIsoDateTime(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }
  return parsed;
}

function latestTimestamp(values: readonly string[]): string {
  if (values.length === 0) {
    throw new Error("at least one timestamp is required");
  }
  return values.reduce((latest, value) =>
    assertIsoDateTime(value, "artifact timestamp") >
        assertIsoDateTime(latest, "artifact timestamp")
      ? value
      : latest
  );
}

function worstQuality(
  qualities: readonly QualityAssessment[],
  runtimeStatus: "READY" | "PARTIAL" | "STALE" | "UNAVAILABLE",
  runtimeReasons: readonly string[],
): QualityAssessment {
  const runtimeQuality: QualityAssessment = runtimeStatus === "READY"
    ? { status: "FRESH", ageMs: 0, reasonCodes: [] }
    : {
      status: runtimeStatus,
      ageMs: runtimeStatus === "UNAVAILABLE" ? null : 0,
      reasonCodes: runtimeReasons.length > 0
        ? runtimeReasons
        : [`runtime_${runtimeStatus.toLowerCase()}`],
    };
  const allQualities = [...qualities, runtimeQuality];
  const status = allQualities.reduce<DataQualityState>((worst, quality) =>
    QUALITY_SEVERITY[quality.status] > QUALITY_SEVERITY[worst]
      ? quality.status
      : worst, "FRESH");
  const ageValues = allQualities
    .map((quality) => quality.ageMs)
    .filter((age): age is number => age !== null);
  return {
    status,
    ageMs: status === "UNAVAILABLE"
      ? null
      : ageValues.length === 0
      ? null
      : Math.max(...ageValues),
    reasonCodes: uniqueSorted(
      allQualities.flatMap((quality) => quality.reasonCodes),
    ),
  };
}

function validateRiskView(
  view: PersonalRiskView | PortfolioRiskView,
  decisionId: string,
  releaseId: string,
  generatedAt: string,
  kind: "personal" | "portfolio",
): void {
  if (view.decisionId !== decisionId) {
    throw new Error(`${kind} risk view does not reference the authoritative decision`);
  }
  if (view.releaseId !== releaseId) {
    throw new Error(`${kind} risk view crosses the final-decision release boundary`);
  }
  if (
    assertIsoDateTime(view.sourceCutoff, `${kind} risk sourceCutoff`) >
      assertIsoDateTime(view.generatedAt, `${kind} risk generatedAt`) ||
    assertIsoDateTime(view.generatedAt, `${kind} risk generatedAt`) >
      assertIsoDateTime(generatedAt, "read-model generatedAt")
  ) {
    throw new Error(`${kind} risk chronology is invalid for the read model`);
  }
}

function deriveUserFit(
  personal: PersonalRiskView | null,
  portfolio: PortfolioRiskView | null,
): UserFit {
  if (personal === null || portfolio === null) {
    return "UNAVAILABLE";
  }
  if (portfolio.quality.status !== "FRESH") {
    return "UNAVAILABLE";
  }
  if (
    personal.blockerReasonCodes.length > 0 && personal.userFit === "SUITABLE" ||
    portfolio.blockerReasonCodes.length > 0 && portfolio.userFit === "SUITABLE"
  ) {
    throw new Error("a suitable risk view cannot carry unresolved blockers");
  }
  return USER_FIT_SEVERITY[personal.userFit] >=
      USER_FIT_SEVERITY[portfolio.userFit]
    ? personal.userFit
    : portfolio.userFit;
}

function decisionSnapshotContent(
  snapshot: DecisionSnapshot,
): Omit<DecisionSnapshot, "snapshotId" | "contentHash"> {
  return omitArtifactFields(
    snapshot as unknown as Readonly<Record<string, unknown>>,
    ["snapshotId", "contentHash"],
  ) as Omit<DecisionSnapshot, "snapshotId" | "contentHash">;
}

export function assertM3DecisionSnapshotIntegrity(
  input: unknown,
): DecisionSnapshot {
  const snapshot = DecisionSnapshotSchema.parse(input);
  const content = decisionSnapshotContent(snapshot);
  const digest = stableSha256(content);
  if (
    snapshot.contentHash !== stableContentHash(content) ||
    snapshot.snapshotId !== `decision-snapshot:${digest.slice(0, 24)}`
  ) {
    throw new Error("DecisionSnapshot content address does not match its payload");
  }
  return deepFreezeArtifact(snapshot);
}

export function buildM3DecisionSnapshot(
  input: M3DecisionReadModelBuildInput,
): DecisionSnapshot {
  const bundleParse = M3FinalDecisionBundleSchema.safeParse(
    input.finalDecisionBundle,
  );
  const assessment = assessM3FinalDecisionBundle(input.finalDecisionBundle);
  if (!bundleParse.success || assessment.validationStatus !== "PASS") {
    const details = assessment.issues
      .map((item) => `${item.code}:${item.path}`)
      .join(",");
    throw new Error(`final-decision bundle is not read-model eligible: ${details}`);
  }
  const bundle = bundleParse.data;
  const personal = input.personalRiskView === null
    ? null
    : PersonalRiskViewSchema.parse(input.personalRiskView);
  const portfolio = input.portfolioRiskView === null
    ? null
    : PortfolioRiskViewSchema.parse(input.portfolioRiskView);
  if (personal !== null) {
    validateRiskView(
      personal,
      bundle.decision.decisionId,
      bundle.decision.releaseId,
      input.generatedAt,
      "personal",
    );
  }
  if (portfolio !== null) {
    validateRiskView(
      portfolio,
      bundle.decision.decisionId,
      bundle.decision.releaseId,
      input.generatedAt,
      "portfolio",
    );
  }

  const upstreamCutoffs = [
    bundle.episode.sourceCutoff,
    bundle.thesis.sourceCutoff,
    bundle.evidence.sourceCutoff,
    bundle.analysis.sourceCutoff,
    bundle.qualification.sourceCutoff,
    bundle.draft.sourceCutoff,
    bundle.feasibility.sourceCutoff,
    bundle.trigger.sourceCutoff,
    bundle.runtime.sourceCutoff,
    bundle.decision.sourceCutoff,
    ...(personal === null ? [] : [personal.sourceCutoff]),
    ...(portfolio === null ? [] : [portfolio.sourceCutoff]),
  ];
  const upstreamGenerated = [
    bundle.episode.generatedAt,
    bundle.thesis.generatedAt,
    bundle.evidence.generatedAt,
    bundle.analysis.generatedAt,
    bundle.qualification.generatedAt,
    bundle.draft.generatedAt,
    bundle.feasibility.generatedAt,
    bundle.trigger.observedAt,
    bundle.runtime.checkedAt,
    bundle.decision.generatedAt,
    bundle.decision.decidedAt,
    ...(personal === null ? [] : [personal.generatedAt]),
    ...(portfolio === null ? [] : [portfolio.generatedAt]),
  ];
  const sourceCutoff = latestTimestamp(upstreamCutoffs);
  if (
    assertIsoDateTime(input.generatedAt, "read-model generatedAt") <
      assertIsoDateTime(
        latestTimestamp([...upstreamCutoffs, ...upstreamGenerated]),
        "latest upstream timestamp",
      )
  ) {
    throw new Error("DecisionSnapshot cannot precede an upstream artifact or cutoff");
  }

  const freshness = worstQuality(
    [
      bundle.evidence.quality,
      bundle.feasibility.quality,
      bundle.trigger.quality,
      ...(portfolio === null ? [] : [portfolio.quality]),
    ],
    bundle.runtime.status,
    bundle.runtime.reasonCodes,
  );
  const userFit = deriveUserFit(personal, portfolio);
  if (
    bundle.decision.actionState === "TRADE_PLAN_READY" &&
    (
      assessment.authorityStatus !== "AUTHORIZED" ||
      !assessment.executablePlanExposureAllowed ||
      freshness.status !== "FRESH" ||
      userFit !== "SUITABLE" ||
      personal === null ||
      portfolio === null
    )
  ) {
    throw new Error(
      "TRADE_PLAN_READY cannot enter the read model without authority, freshness and suitable risk evidence",
    );
  }

  const previous = input.previousSnapshot === undefined ||
      input.previousSnapshot === null
    ? null
    : assertM3DecisionSnapshotIntegrity(input.previousSnapshot);
  if (previous !== null) {
    if (
      previous.episodeId !== bundle.episode.episodeId ||
      previous.canonicalInstrumentId !== bundle.episode.canonicalInstrumentId
    ) {
      throw new Error("DecisionSnapshot supersession cannot cross episode identity");
    }
    if (
      Date.parse(previous.generatedAt) >= Date.parse(input.generatedAt) ||
      Date.parse(previous.sourceCutoff) > Date.parse(sourceCutoff)
    ) {
      throw new Error("DecisionSnapshot supersession chronology is not monotonic");
    }
  }

  const unavailableReasons = uniqueSorted([
    ...(personal === null ? ["personal_risk_view_unavailable"] : []),
    ...(portfolio === null ? ["portfolio_risk_view_unavailable"] : []),
    ...(portfolio !== null && portfolio.quality.status !== "FRESH"
      ? ["portfolio_risk_quality_not_fresh", ...portfolio.quality.reasonCodes]
      : []),
    ...(freshness.status === "FRESH"
      ? []
      : ["decision_snapshot_not_fresh", ...freshness.reasonCodes]),
  ]);
  const content: Omit<DecisionSnapshot, "snapshotId" | "contentHash"> = {
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.DecisionSnapshot,
    releaseId: bundle.decision.releaseId,
    producerModule: "decision_read_model",
    generatedAt: input.generatedAt,
    sourceCutoff,
    episodeId: bundle.episode.episodeId,
    canonicalInstrumentId: bundle.episode.canonicalInstrumentId,
    opportunityFamily: bundle.episode.opportunityFamily,
    thesisId: bundle.thesis.thesisId,
    firstDetectedAt: bundle.thesis.firstDetectedAt,
    candidatePriority: bundle.episode.priority,
    evidenceGrade: bundle.qualification.evidenceGrade,
    setupGrade: bundle.qualification.setupGrade,
    actionState: bundle.decision.actionState,
    userFit,
    evidencePackageId: bundle.evidence.evidencePackageId,
    analysisId: bundle.analysis.analysisId,
    qualificationId: bundle.qualification.qualificationId,
    decision: bundle.decision,
    strategyArchetype: bundle.decision.strategyArchetype,
    strategyContextTags: bundle.decision.strategyContextTags,
    strategyStateLabel: bundle.decision.strategyStateLabel,
    personalRiskViewId: personal?.riskViewId ?? null,
    portfolioRiskViewId: portfolio?.portfolioRiskViewId ?? null,
    factVersion: input.factVersion,
    featureVersion: input.featureVersion,
    ruleVersions: {
      ...input.ruleVersions,
      finalDecisionContract: M3_FINAL_DECISION_CONTRACT_VERSION,
      decisionReadModelRuntime: M3_DECISION_READ_MODEL_RUNTIME_VERSION,
      strategyArchetypeTaxonomy:
        bundle.decision.strategyArchetype.taxonomyVersion,
    },
    uncertainty: bundle.feasibility.uncertainty,
    freshness,
    unavailableReasonCodes: unavailableReasons,
    supersedesSnapshotId: previous?.snapshotId ?? null,
  };
  const digest = stableSha256(content);
  return assertM3DecisionSnapshotIntegrity({
    ...content,
    snapshotId: `decision-snapshot:${digest.slice(0, 24)}`,
    contentHash: stableContentHash(content),
  });
}
