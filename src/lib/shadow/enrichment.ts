import type {
  ShadowDecision,
  ShadowEnrichmentSource,
  ShadowEnrichmentStatus,
  ShadowScanSignalInput,
  ShadowWaitPlan,
} from "./storage";

export type ShadowEnrichmentGateReport = {
  coverageRequired: number;
  errors: string[];
  gate: "pass" | "partial" | "fail";
  missingSymbols: string[];
  nonObserveCoverage: number;
  nonObserveMissingSymbols: string[];
  overallCoverage: number;
  readyCount: number;
  signalCount: number;
  sourceCounts: Record<ShadowEnrichmentSource, number>;
  statusCounts: Record<ShadowEnrichmentStatus, number>;
  waitBlockedReadyCount: number;
  warnings: string[];
};

export type ProductionContractBundle = {
  backendContract?: unknown;
  radarContract?: unknown;
  tokenDossiers?: Record<string, unknown>;
};

type DecisionRecord = {
  blockers?: string[];
  evidence?: unknown[];
  maturity?: unknown;
  reasons?: string[];
  readyPlan?: unknown;
  sourceContract: string;
  unifiedDecision?: unknown;
  waitPlan?: ShadowWaitPlan | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSymbol(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-_/]/g, "")
    .replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "USDT");
}

function normalizeBase(value: string | undefined) {
  return normalizeSymbol(value).replace(/USDT$/u, "");
}

function decisionValue(unifiedDecision: unknown): ShadowDecision {
  const record = asRecord(unifiedDecision);
  const raw = asString(record?.decision) || asString(record?.state);
  if (raw === "TRADE_PLAN_READY" || raw === "TRADE") return "TRADE_PLAN_READY";
  if (raw === "WAIT") return "WAIT";
  if (raw === "BLOCKED") return "BLOCKED";
  if (raw === "OBSERVE") return "OBSERVE";
  return "UNKNOWN";
}

function extractBlockers(unifiedDecision: unknown): string[] {
  const record = asRecord(unifiedDecision);
  const direct = Array.isArray(record?.blockerReasons) ? record.blockerReasons : [];
  const detailed = Array.isArray(record?.blockers)
    ? record.blockers.map((item) => {
      const blocker = asRecord(item);
      const reason = asString(blocker?.reason);
      const unblock = asString(blocker?.unblockCondition);
      return unblock ? `${reason}：${unblock}` : reason;
    })
    : [];

  return [...direct, ...detailed].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractReasons(unifiedDecision: unknown): string[] {
  const record = asRecord(unifiedDecision);
  return Array.isArray(record?.reasons)
    ? record.reasons.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function extractWaitPlan(unifiedDecision: unknown): ShadowWaitPlan | null {
  const record = asRecord(asRecord(unifiedDecision)?.waitPlan);
  if (!record) return null;
  return {
    confirmation: asString(record.confirmation),
    invalidation: asString(record.invalidation),
    trigger: asString(record.trigger),
    whyNotNow: asString(record.whyNotNow),
  };
}

function extractReadyPlan(unifiedDecision: unknown) {
  return asRecord(asRecord(unifiedDecision)?.readyPlan);
}

function radarSignalsFromContract(radarContract: unknown): Record<string, DecisionRecord> {
  const output: Record<string, DecisionRecord> = {};
  const root = asRecord(radarContract);
  const contract = asRecord(root?.contract) ?? root;
  const radarSignals = asRecord(contract?.radarSignals);
  const rows = Array.isArray(radarSignals?.data) ? radarSignals.data : [];

  for (const row of rows) {
    const signal = asRecord(row);
    const symbol = normalizeSymbol(asString(signal?.symbol));
    if (!symbol) continue;
    const unifiedDecision = signal?.unifiedDecision;
    output[symbol] = {
      blockers: extractBlockers(unifiedDecision),
      evidence: [],
      maturity: signal?.maturity,
      reasons: extractReasons(unifiedDecision),
      readyPlan: extractReadyPlan(unifiedDecision),
      sourceContract: "/api/frontend/radar-contract",
      unifiedDecision,
      waitPlan: extractWaitPlan(unifiedDecision),
    };
  }

  return output;
}

function tokenDossierRecord(value: unknown): DecisionRecord | null {
  const root = asRecord(value);
  const dossier = asRecord(root?.dossier) ?? root;
  const data = asRecord(dossier?.data) ?? dossier;
  const symbol = asString(data?.symbol);
  const unifiedDecision = data?.unifiedDecision;
  if (!symbol || !unifiedDecision) return null;

  return {
    blockers: extractBlockers(unifiedDecision),
    evidence: Array.isArray(data?.evidence) ? data.evidence : [],
    maturity: data?.maturity,
    reasons: extractReasons(unifiedDecision),
    readyPlan: extractReadyPlan(unifiedDecision),
    sourceContract: "/api/frontend/token-dossier",
    unifiedDecision,
    waitPlan: extractWaitPlan(unifiedDecision),
  };
}

function tokenDossiersFromContracts(tokenDossiers: Record<string, unknown> | undefined): Record<string, DecisionRecord> {
  const output: Record<string, DecisionRecord> = {};
  for (const [symbol, value] of Object.entries(tokenDossiers ?? {})) {
    const record = tokenDossierRecord(value);
    if (!record) continue;
    const normalizedKey = normalizeSymbol(symbol);
    if (normalizedKey) output[normalizedKey] = record;
    const payloadSymbol = normalizeSymbol(asString(asRecord(asRecord(value)?.dossier)?.symbol));
    if (payloadSymbol) output[payloadSymbol] = record;
  }
  return output;
}

function mergeRecordIntoSignal(signal: ShadowScanSignalInput, record: DecisionRecord, source: ShadowEnrichmentSource): ShadowScanSignalInput {
  return {
    ...signal,
    blockers: record.blockers,
    evidence: Array.isArray(signal.evidence) && signal.evidence.length > 0 ? signal.evidence : record.evidence,
    maturity: signal.maturity ?? (record.maturity as never),
    shadowEnrichment: {
      source,
      sourceContract: record.sourceContract,
      status: "complete",
      warnings: [],
    },
    strategy: {
      ...signal.strategy,
      ...(record.readyPlan ? { status: "ready" } : {}),
    },
    summary: signal.summary || record.reasons?.[0] || "",
    unifiedDecision: record.unifiedDecision,
    waitPlan: record.waitPlan,
  };
}

function withMissingEnrichment(signal: ShadowScanSignalInput): ShadowScanSignalInput {
  return {
    ...signal,
    shadowEnrichment: {
      source: "scan_summary_fallback",
      sourceContract: "/api/scan",
      status: "missing",
      warnings: ["production_contract_unified_decision_missing"],
    },
  };
}

export function enrichShadowScanSignals(
  signals: ShadowScanSignalInput[],
  contracts: ProductionContractBundle,
): { report: ShadowEnrichmentGateReport; signals: ShadowScanSignalInput[] } {
  const radarBySymbol = radarSignalsFromContract(contracts.radarContract);
  const dossierBySymbol = tokenDossiersFromContracts(contracts.tokenDossiers);
  const enriched = signals.map((signal) => {
    if (signal.unifiedDecision) {
      return {
        ...signal,
        shadowEnrichment: {
          source: "scan_embedded_unified_decision",
          sourceContract: "/api/scan",
          status: "complete",
          warnings: [],
        },
      } satisfies ShadowScanSignalInput;
    }

    const symbol = normalizeSymbol(signal.symbol);
    const base = normalizeBase(signal.symbol);
    const contractRecord = radarBySymbol[symbol] ?? radarBySymbol[`${base}USDT`] ?? dossierBySymbol[symbol] ?? dossierBySymbol[`${base}USDT`];
    if (contractRecord?.unifiedDecision) {
      return mergeRecordIntoSignal(signal, contractRecord, "production_contract_enrichment");
    }

    return withMissingEnrichment(signal);
  });

  return {
    report: buildEnrichmentGateReport(enriched),
    signals: enriched,
  };
}

export function buildEnrichmentGateReport(
  signals: ShadowScanSignalInput[],
  coverageRequired = 0.8,
): ShadowEnrichmentGateReport {
  const sourceCounts: Record<ShadowEnrichmentSource, number> = {
    partial_contract_enrichment: 0,
    production_contract_enrichment: 0,
    scan_embedded_unified_decision: 0,
    scan_summary_fallback: 0,
  };
  const statusCounts: Record<ShadowEnrichmentStatus, number> = {
    complete: 0,
    missing: 0,
    partial: 0,
  };
  const missingSymbols: string[] = [];
  const nonObserveMissingSymbols: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let covered = 0;
  let nonObserveTotal = 0;
  let nonObserveCovered = 0;
  let readyCount = 0;

  for (const signal of signals) {
    const enrichment = signal.shadowEnrichment ?? withMissingEnrichment(signal).shadowEnrichment!;
    sourceCounts[enrichment.source] += 1;
    statusCounts[enrichment.status] += 1;
    if (enrichment.status !== "missing") covered += 1;
    if (enrichment.warnings.length > 0) warnings.push(...enrichment.warnings.map((warning) => `${signal.symbol ?? "UNKNOWN"}:${warning}`));
    if (enrichment.status === "missing") missingSymbols.push(normalizeSymbol(signal.symbol));

    const decision = decisionValue(signal.unifiedDecision);
    if (decision === "TRADE_PLAN_READY") readyCount += 1;
    if (decision !== "OBSERVE" && decision !== "UNKNOWN") {
      nonObserveTotal += 1;
      const waitPlan = extractWaitPlan(signal.unifiedDecision) ?? signal.waitPlan ?? null;
      const blockers = extractBlockers(signal.unifiedDecision);
      const readyPlan = extractReadyPlan(signal.unifiedDecision);
      const hasExplicitMissingWarning = enrichment.warnings.length > 0;
      const waitOk = decision !== "WAIT" ||
        Boolean(waitPlan?.trigger && waitPlan.confirmation && waitPlan.invalidation && waitPlan.whyNotNow) ||
        hasExplicitMissingWarning;
      const blockedOk = decision !== "BLOCKED" || blockers.length > 0 || hasExplicitMissingWarning;
      const readyOk = decision !== "TRADE_PLAN_READY" || Boolean(readyPlan);
      if (enrichment.status !== "missing" && waitOk && blockedOk && readyOk) {
        nonObserveCovered += 1;
      } else {
        nonObserveMissingSymbols.push(normalizeSymbol(signal.symbol));
      }
    }
  }

  const overallCoverage = signals.length > 0 ? covered / signals.length : 0;
  const nonObserveCoverage = nonObserveTotal > 0 ? nonObserveCovered / nonObserveTotal : 1;
  if (overallCoverage < coverageRequired) {
    errors.push(`overall_enrichment_coverage_below_required:${overallCoverage.toFixed(4)}<${coverageRequired}`);
  }
  if (nonObserveCoverage < 1) {
    errors.push(`non_observe_enrichment_coverage_below_required:${nonObserveCoverage.toFixed(4)}<1`);
  }
  if (signals.length === 0) {
    errors.push("no_shadow_signals_to_enrich");
  }

  return {
    coverageRequired,
    errors,
    gate: errors.length === 0 ? "pass" : overallCoverage > 0 ? "partial" : "fail",
    missingSymbols,
    nonObserveCoverage,
    nonObserveMissingSymbols,
    overallCoverage,
    readyCount,
    signalCount: signals.length,
    sourceCounts,
    statusCounts,
    waitBlockedReadyCount: nonObserveTotal,
    warnings,
  };
}
