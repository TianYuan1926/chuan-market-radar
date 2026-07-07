import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  enrichShadowScanSignals,
  type ProductionContractBundle,
  type ShadowEnrichmentGateReport,
} from "../../lib/shadow/enrichment";
import {
  applyDedupeAndTransitions,
  buildCheckpointPlan,
  buildEventsManifest,
  buildShadowLatest,
  buildShadowLatestMarkdown,
  buildShadowObservationEvent,
  buildShadowRunManifest,
  extractScanSignals,
  validateShadowStoragePayload,
  type ShadowCheckpointPlan,
  type ShadowEventsManifest,
  type ShadowObservationEvent,
  type ShadowProductionStatus,
  type ShadowRunManifest,
  type ShadowScanInput,
  type ShadowScanSignalInput,
  type ShadowStatusTransition,
} from "../../lib/shadow/storage";

type Command =
  | "baseline"
  | "capture"
  | "checkpoint"
  | "daily-summary"
  | "pause"
  | "report"
  | "resume"
  | "run-loop"
  | "start"
  | "status"
  | "stop"
  | "validate";

type CliOptions = {
  args: string[];
  baseUrl: string;
  command: Command;
  commit: string;
  evidenceValidate: ShadowProductionStatus["evidenceValidate"];
  health: ShadowProductionStatus["health"];
  input?: string;
  noBackground: boolean;
  outDir: string;
  reason: string;
  runId?: string;
  timeoutMs: number;
};

type JsonRecord = Record<string, unknown>;

type CaptureOnceResult = {
  checkpointPlan: ShadowCheckpointPlan;
  duplicateEvents: number;
  enrichmentReport: ShadowEnrichmentGateReport;
  events: ShadowObservationEvent[];
  eventsManifest: ShadowEventsManifest;
  latest: ReturnType<typeof buildShadowLatest>;
  manifest: ShadowRunManifest;
  transitions: ShadowStatusTransition[];
  warnings: string[];
};

const defaultOutDir = "reports/shadow-tracking";
const fallbackPhase51Dir = "phase5-1-shadow-storage-run-manifest";
const currentRunFileName = "current-run.json";
const runStateFileName = "runner-state.json";
const lockFileName = "runner.lock";
const runnerLogFileName = "runner.log";

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nowIso() {
  return new Date().toISOString();
}

function utcStamp(iso = nowIso()) {
  return iso.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path: string, value: string) {
  ensureDir(dirname(path));
  writeFileSync(path, value, "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfExists(path: string): unknown | null {
  return existsSync(path) ? readJson(path) : null;
}

function appendJsonl(path: string, rows: unknown[]) {
  if (rows.length === 0) return;
  ensureDir(dirname(path));
  appendFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function readJsonlIfExists<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function normalizeBaseUrl(raw: string) {
  return raw.replace(/\/+$/u, "");
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function parseEvidence(value: string): ShadowProductionStatus["evidenceValidate"] {
  return value === "pass" || value === "partial" || value === "fail" ? value : "unknown";
}

function parseHealth(value: string): ShadowProductionStatus["health"] {
  return value === "pass" || value === "partial" || value === "fail" ? value : "unknown";
}

function parseArgs(argv: string[]): CliOptions {
  const command = (argv[0] || "status") as Command;
  const options: CliOptions = {
    args: argv.slice(1),
    baseUrl: normalizeBaseUrl(process.env.SHADOW_PRODUCTION_BASE_URL || process.env.PRODUCTION_BASE_URL || "http://43.161.202.227"),
    command,
    commit: process.env.SHADOW_PRODUCTION_COMMIT || currentCommit(),
    evidenceValidate: parseEvidence(process.env.SHADOW_PRODUCTION_EVIDENCE_VALIDATE || ""),
    health: parseHealth(process.env.SHADOW_PRODUCTION_HEALTH || ""),
    noBackground: process.env.SHADOW_DISABLE_BACKGROUND === "true",
    outDir: process.env.SHADOW_REPORTS_DIR || defaultOutDir,
    reason: "",
    timeoutMs: Number(process.env.SHADOW_FETCH_TIMEOUT_MS || 12_000),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--base-url" && next) {
      options.baseUrl = normalizeBaseUrl(next);
      index += 1;
    } else if (item === "--commit" && next) {
      options.commit = next;
      index += 1;
    } else if (item === "--evidence-validate" && next) {
      options.evidenceValidate = parseEvidence(next);
      index += 1;
    } else if (item === "--health" && next) {
      options.health = parseHealth(next);
      index += 1;
    } else if (item === "--input" && next) {
      options.input = next;
      index += 1;
    } else if (item === "--no-background") {
      options.noBackground = true;
    } else if (item === "--out-dir" && next) {
      options.outDir = next;
      index += 1;
    } else if (item === "--reason" && next) {
      options.reason = next;
      index += 1;
    } else if (item === "--run-id" && next) {
      options.runId = next;
      index += 1;
    } else if (item === "--timeout-ms" && next) {
      const parsed = Number(next);
      options.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : options.timeoutMs;
      index += 1;
    }
  }

  return options;
}

function currentRunPath(options: CliOptions) {
  return join(options.outDir, currentRunFileName);
}

function lockPath(options: CliOptions) {
  return join(options.outDir, lockFileName);
}

function runStatePath(options: CliOptions) {
  return join(options.outDir, runStateFileName);
}

function runnerLogPath(options: CliOptions) {
  return join(options.outDir, runnerLogFileName);
}

function runDir(options: CliOptions, runId: string) {
  return join(options.outDir, "runs", runId);
}

function eventsPath(options: CliOptions, runId: string) {
  return join(options.outDir, "events", runId, "events.jsonl");
}

function getCurrentRunId(options: CliOptions) {
  if (options.runId) return options.runId;
  const currentRun = asRecord(readJsonIfExists(currentRunPath(options)));
  return asString(currentRun?.runId);
}

function manifestPath(options: CliOptions, runId: string) {
  return join(runDir(options, runId), "shadow-run-manifest.json");
}

function readManifest(options: CliOptions, runId?: string): ShadowRunManifest | null {
  const id = runId || getCurrentRunId(options);
  if (!id) return null;
  const value = readJsonIfExists(manifestPath(options, id));
  return value ? value as ShadowRunManifest : null;
}

function writeCurrentRun(options: CliOptions, manifest: ShadowRunManifest) {
  writeJson(currentRunPath(options), {
    runId: manifest.runId,
    status: manifest.status,
    updatedAt: manifest.updatedAt,
  });
}

function productionStatus(options: CliOptions): ShadowProductionStatus {
  const evidenceFromFile = readProductionEvidenceStatus(options);
  return {
    commit: options.commit,
    evidenceValidate: options.evidenceValidate !== "unknown" ? options.evidenceValidate : evidenceFromFile,
    health: options.health,
    targetUrl: options.baseUrl,
  };
}

function readProductionEvidenceStatus(options: CliOptions): ShadowProductionStatus["evidenceValidate"] {
  if (options.evidenceValidate !== "unknown") return options.evidenceValidate;
  const candidates = [
    join(options.outDir, "production-evidence-validate-result.json"),
    join(fallbackPhase51Dir, "production-evidence-validate-result.json"),
  ];

  for (const candidate of candidates) {
    const record = asRecord(readJsonIfExists(candidate));
    const status = asString(record?.status) || asString(asRecord(record?.validation)?.status);
    if (status === "pass" || status === "partial" || status === "fail") return status;
  }

  return "unknown";
}

async function fetchJson(options: CliOptions, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const url = `${options.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 2_000) };
    }

    if (!response.ok) {
      throw new Error(`fetch_failed:${path}:${response.status}:${JSON.stringify(body).slice(0, 500)}`);
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHealth(options: CliOptions) {
  const value = await fetchJson(options, "/api/health");
  const record = asRecord(value);
  const health = asRecord(record?.health);
  const level = asString(health?.level);
  const scan = asRecord(health?.scan);
  const freshness = asString(scan?.freshness);
  const database = asRecord(health?.persistence);
  const databaseStatus = asString(database?.databaseStatus);

  return {
    raw: value,
    ok: record?.ok === true && level === "ready" && databaseStatus === "ready" && freshness !== "stale",
    level,
    freshness,
    databaseStatus,
  };
}

async function fetchScan(options: CliOptions): Promise<ShadowScanInput> {
  if (options.input) {
    return readJson(options.input) as ShadowScanInput;
  }
  return await fetchJson(options, "/api/scan") as ShadowScanInput;
}

async function fetchContracts(options: CliOptions, signals: ShadowScanSignalInput[]): Promise<ProductionContractBundle> {
  const radarContract = await fetchJson(options, "/api/frontend/radar-contract");
  const backendContract = await fetchJson(options, "/api/radar/backend-contract");
  const symbols = [...new Set(signals.map((signal) => asString(signal.symbol)).filter(Boolean))].slice(0, 24);
  const tokenDossiers: Record<string, unknown> = {};

  await Promise.all(symbols.map(async (symbol) => {
    try {
      tokenDossiers[symbol] = await fetchJson(options, `/api/frontend/token-dossier?symbol=${encodeURIComponent(symbol)}`);
    } catch (error) {
      tokenDossiers[symbol] = {
        error: error instanceof Error ? error.message : "unknown_error",
        ok: false,
      };
    }
  }));

  return { backendContract, radarContract, tokenDossiers };
}

function phase51BaselineFallback(): CaptureOnceResult | null {
  const rawManifest = readJsonIfExists(join(fallbackPhase51Dir, "shadow-run-manifest.json")) as ShadowRunManifest | null;
  const rawLatest = readJsonIfExists(join(fallbackPhase51Dir, "shadow-latest.json")) as CaptureOnceResult["latest"] | null;
  const checkpointPlan = readJsonIfExists(join(fallbackPhase51Dir, "shadow-checkpoint-plan.json")) as ShadowCheckpointPlan | null;
  const eventsManifest = readJsonIfExists(join(fallbackPhase51Dir, "shadow-events-manifest.json")) as ShadowEventsManifest | null;
  if (!rawManifest || !rawLatest || !checkpointPlan || !eventsManifest) return null;
  const manifest: ShadowRunManifest = {
    ...rawManifest,
    canEnterLiveTrading: false,
    mode: rawManifest.mode ?? "baseline_readiness",
    phase: rawManifest.phase ?? "5.1",
    shadowTrackingStarted: false,
  };
  const latest = {
    ...rawLatest,
    mode: rawLatest.mode ?? "baseline_readiness",
    shadowTrackingStarted: false,
    stillNotReadyForLiveTrading: true as const,
  };
  const events = readJsonlIfExists<ShadowObservationEvent>(join(fallbackPhase51Dir, "shadow-events.jsonl"))
    .map((event) => ({
      ...event,
      enrichmentSource: event.enrichmentSource ?? "scan_embedded_unified_decision",
      enrichmentStatus: event.enrichmentStatus ?? "complete",
      enrichmentWarnings: event.enrichmentWarnings ?? ["legacy_phase_5_1_event_normalized_for_validation"],
    } satisfies ShadowObservationEvent));
  const transitions = readJsonlIfExists<ShadowStatusTransition>(join(fallbackPhase51Dir, "shadow-transitions.jsonl"));
  return {
    checkpointPlan,
    duplicateEvents: latest.stats.duplicatesSkipped,
    enrichmentReport: {
      coverageRequired: 0.8,
      errors: [],
      gate: "pass",
      missingSymbols: [],
      nonObserveCoverage: 1,
      nonObserveMissingSymbols: [],
      overallCoverage: 1,
      readyCount: latest.stats.readyCount,
      signalCount: latest.stats.eventsTotal,
      sourceCounts: {
        partial_contract_enrichment: 0,
        production_contract_enrichment: 0,
        scan_embedded_unified_decision: latest.stats.eventsTotal,
        scan_summary_fallback: 0,
      },
      statusCounts: {
        complete: latest.stats.eventsTotal,
        missing: 0,
        partial: 0,
      },
      waitBlockedReadyCount: latest.stats.waitCount + latest.stats.blockedCount + latest.stats.readyCount,
      warnings: ["phase_5_1_baseline_fallback_used_for_validation_only"],
    },
    events,
    eventsManifest,
    latest,
    manifest,
    transitions,
    warnings: ["phase_5_1_baseline_fallback_used_for_validation_only"],
  };
}

async function captureOnce(options: CliOptions, manifest: ShadowRunManifest): Promise<CaptureOnceResult> {
  const scan = await fetchScan(options);
  const rawSignals = extractScanSignals(scan);
  const contracts = await fetchContracts(options, rawSignals);
  const { report: enrichmentReport, signals } = enrichShadowScanSignals(rawSignals, contracts);
  const captureTime = nowIso();
  const incoming: ShadowObservationEvent[] = [];
  const warnings = [...enrichmentReport.warnings];

  for (const signal of signals) {
    const result = buildShadowObservationEvent({
      nowIso: captureTime,
      runId: manifest.runId,
      scan,
      signal,
    });
    incoming.push(result.event);
    warnings.push(...result.warnings.map((warning) => `${result.event.symbol}:${warning}`));
  }

  const existingEvents = readJsonlIfExists<ShadowObservationEvent>(eventsPath(options, manifest.runId));
  const dedupe = applyDedupeAndTransitions({
    existingEvents,
    incomingEvents: incoming,
    nowIso: captureTime,
    runId: manifest.runId,
  });
  const allEvents = [...existingEvents, ...dedupe.primaryEvents];
  const checkpointPlan = buildCheckpointPlan(manifest.runId, captureTime, allEvents);
  const updatedManifest: ShadowRunManifest = {
    ...manifest,
    enrichment: {
      enabled: true,
      coverageRequired: enrichmentReport.coverageRequired,
      nonObserveCoverage: enrichmentReport.nonObserveCoverage,
      overallCoverage: enrichmentReport.overallCoverage,
      sourcePriority: [
        "scan_embedded_unified_decision",
        "production_contract_enrichment",
        "partial_contract_enrichment",
        "scan_summary_fallback",
      ],
    },
    updatedAt: captureTime,
  };
  const latest = buildShadowLatest({
    checkpointPlan,
    duplicateEvents: dedupe.duplicateEvents,
    events: allEvents,
    manifest: updatedManifest,
    scan,
    transitions: dedupe.transitions,
    warnings,
  });
  const eventsManifest = buildEventsManifest({
    duplicateEvents: dedupe.duplicateEvents,
    events: allEvents,
    eventsPath: updatedManifest.storage.eventsPath,
    generatedAt: captureTime,
    runId: manifest.runId,
    transitions: dedupe.transitions,
  });

  appendJsonl(eventsPath(options, manifest.runId), dedupe.primaryEvents);
  appendJsonl(join(runDir(options, manifest.runId), "observations.jsonl"), dedupe.primaryEvents);
  appendJsonl(join(runDir(options, manifest.runId), "transitions.jsonl"), dedupe.transitions);
  writeJson(manifestPath(options, manifest.runId), updatedManifest);
  writeJson(join(runDir(options, manifest.runId), "checkpoint-plan.json"), checkpointPlan);
  writeJson(join(runDir(options, manifest.runId), "shadow-events-manifest.json"), eventsManifest);
  writeJson(join(runDir(options, manifest.runId), "shadow-latest.json"), latest);
  writeText(join(runDir(options, manifest.runId), "shadow-latest.md"), buildShadowLatestMarkdown(latest));
  writeJson(join(runDir(options, manifest.runId), "enrichment-report.json"), enrichmentReport);
  writeJson(join(runDir(options, manifest.runId), "last-capture.json"), {
    capturedAt: captureTime,
    duplicateEvents: dedupe.duplicateEvents,
    enrichmentGate: enrichmentReport.gate,
    eventCount: allEvents.length,
    primaryEvents: dedupe.primaryEvents.length,
    transitionCount: dedupe.transitions.length,
  });
  writeCurrentRun(options, updatedManifest);

  return {
    checkpointPlan,
    duplicateEvents: dedupe.duplicateEvents,
    enrichmentReport,
    events: allEvents,
    eventsManifest,
    latest,
    manifest: updatedManifest,
    transitions: dedupe.transitions,
    warnings,
  };
}

function validateCapture(result: CaptureOnceResult) {
  const validation = validateShadowStoragePayload({
    checkpointPlan: result.checkpointPlan,
    events: result.events,
    eventsManifest: result.eventsManifest,
    latest: result.latest,
    manifest: result.manifest,
  });
  return {
    ...validation,
    enrichmentGate: result.enrichmentReport.gate,
    enrichmentErrors: result.enrichmentReport.errors,
  };
}

async function commandBaseline(options: CliOptions) {
  const runId = options.runId || `shadow-${utcStamp()}`;
  const scan = await fetchScan(options);
  const manifest = buildShadowRunManifest({
    nowIso: nowIso(),
    phase: "5.1",
    production: productionStatus(options),
    reportsRoot: options.outDir,
    runId,
    shadowTrackingStarted: false,
    status: "ready_to_start",
  });
  ensureDir(runDir(options, manifest.runId));
  writeJson(manifestPath(options, manifest.runId), manifest);
  writeCurrentRun(options, manifest);

  const signals = extractScanSignals(scan).map((signal) => ({
    ...signal,
    shadowEnrichment: signal.shadowEnrichment ?? {
      source: signal.unifiedDecision ? "scan_embedded_unified_decision" : "scan_summary_fallback",
      sourceContract: signal.unifiedDecision ? "/api/scan" : "/api/scan",
      status: signal.unifiedDecision ? "complete" : "missing",
      warnings: signal.unifiedDecision ? [] : ["baseline_scan_contract_missing_unified_decision"],
    },
  } satisfies ShadowScanSignalInput));
  const syntheticScan = { ...scan, signals } as ShadowScanInput;
  const incoming = signals.map((signal) => buildShadowObservationEvent({
    nowIso: manifest.createdAt,
    runId: manifest.runId,
    scan: syntheticScan,
    signal,
  }).event);
  const checkpointPlan = buildCheckpointPlan(manifest.runId, manifest.createdAt, incoming);
  const latest = buildShadowLatest({
    checkpointPlan,
    duplicateEvents: 0,
    events: incoming,
    manifest,
    scan: syntheticScan,
    transitions: [],
    warnings: [],
  });
  const eventsManifest = buildEventsManifest({
    duplicateEvents: 0,
    events: incoming,
    eventsPath: manifest.storage.eventsPath,
    generatedAt: manifest.createdAt,
    runId: manifest.runId,
    transitions: [],
  });
  const validation = validateShadowStoragePayload({ checkpointPlan, events: incoming, eventsManifest, latest, manifest });
  appendJsonl(eventsPath(options, manifest.runId), incoming);
  appendJsonl(join(runDir(options, manifest.runId), "observations.jsonl"), incoming);
  writeJson(join(runDir(options, manifest.runId), "checkpoint-plan.json"), checkpointPlan);
  writeJson(join(runDir(options, manifest.runId), "shadow-events-manifest.json"), eventsManifest);
  writeJson(join(runDir(options, manifest.runId), "shadow-latest.json"), latest);
  writeText(join(runDir(options, manifest.runId), "shadow-latest.md"), buildShadowLatestMarkdown(latest));
  writeJson(join(runDir(options, manifest.runId), "validation.json"), validation);
  console.log(JSON.stringify({ ok: validation.ok, runId: manifest.runId, validation }, null, 2));
  if (!validation.ok) process.exitCode = 1;
}

async function preflight(options: CliOptions) {
  const generatedAt = nowIso();
  const production = productionStatus(options);
  const failures: string[] = [];
  let healthPayload: Awaited<ReturnType<typeof fetchHealth>> | null = null;
  let enrichmentReport: ShadowEnrichmentGateReport | null = null;

  try {
    healthPayload = await fetchHealth(options);
    if (!healthPayload.ok) failures.push(`production_health_not_ready:${healthPayload.level}:${healthPayload.freshness}:${healthPayload.databaseStatus}`);
  } catch (error) {
    failures.push(`production_health_fetch_failed:${error instanceof Error ? error.message : "unknown_error"}`);
  }

  if (production.evidenceValidate !== "pass") {
    failures.push(`production_evidence_validate_not_pass:${production.evidenceValidate}`);
  }

  try {
    const scan = await fetchScan(options);
    const signals = extractScanSignals(scan);
    const contracts = await fetchContracts(options, signals);
    enrichmentReport = enrichShadowScanSignals(signals, contracts).report;
    if (enrichmentReport.gate !== "pass") {
      failures.push(`enrichment_gate_not_pass:${enrichmentReport.gate}`);
    }
  } catch (error) {
    failures.push(`enrichment_preflight_failed:${error instanceof Error ? error.message : "unknown_error"}`);
  }

  const result = {
    baseUrl: options.baseUrl,
    canStart: failures.length === 0,
    evidenceValidate: production.evidenceValidate,
    failures,
    generatedAt,
    health: healthPayload,
    productionCommit: production.commit,
    enrichmentReport,
  };
  writeJson(join(options.outDir, "start-preflight.json"), result);
  return result;
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(options: CliOptions) {
  const record = asRecord(readJsonIfExists(lockPath(options)));
  const pid = asNumber(record?.pid);
  return {
    pid,
    runId: asString(record?.runId),
    startedAt: asString(record?.startedAt),
  };
}

async function commandStart(options: CliOptions) {
  const lock = readLock(options);
  if (lock.pid && isPidAlive(lock.pid)) {
    throw new Error(`shadow_runner_lock_exists:${lock.pid}:${lock.runId}`);
  }

  const preflightResult = await preflight(options);
  if (!preflightResult.canStart) {
    console.log(JSON.stringify({
      ok: false,
      reason: "shadow_start_preflight_failed",
      preflight: preflightResult,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const startTime = nowIso();
  const runId = options.runId || `shadow-v1-${utcStamp(startTime)}`;
  const manifest = buildShadowRunManifest({
    mode: "shadow_v1_live_observation",
    nowIso: startTime,
    phase: "5.1-R",
    production: productionStatus(options),
    reportsRoot: options.outDir,
    runId,
    shadowTrackingStarted: true,
    status: "running",
  });
  ensureDir(runDir(options, runId));
  writeJson(manifestPath(options, runId), manifest);
  writeCurrentRun(options, manifest);

  const capture = await captureOnce(options, manifest);
  const validation = validateCapture(capture);
  writeJson(join(runDir(options, runId), "first-capture.json"), {
    capturedAt: capture.latest.generatedAt,
    enrichmentGate: capture.enrichmentReport.gate,
    validation,
  });
  if (!validation.ok || capture.enrichmentReport.gate !== "pass") {
    writeJson(runStatePath(options), {
      lastError: "first_capture_validation_failed",
      runId,
      status: "aborted",
      updatedAt: nowIso(),
      validation,
    });
    process.exitCode = 1;
    return;
  }

  const state = {
    heartbeatAt: nowIso(),
    pid: process.pid,
    runId,
    status: options.noBackground ? "running_no_background" : "running",
    updatedAt: nowIso(),
  };
  writeJson(lockPath(options), {
    pid: process.pid,
    runId,
    startedAt: startTime,
  });
  writeJson(runStatePath(options), state);

  if (!options.noBackground) {
    const args = [
      ".tmp/market-tests/scripts/shadow/shadow-tracking.js",
      "run-loop",
      "--run-id",
      runId,
      "--out-dir",
      options.outDir,
      "--base-url",
      options.baseUrl,
      "--commit",
      options.commit,
      "--evidence-validate",
      productionStatus(options).evidenceValidate,
    ];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    writeJson(lockPath(options), {
      pid: child.pid,
      runId,
      startedAt: startTime,
    });
    child.unref();
  }

  console.log(JSON.stringify({
    ok: true,
    runId,
    shadowTrackingStarted: true,
    validation,
  }, null, 2));
}

async function commandCapture(options: CliOptions) {
  const manifest = readManifest(options);
  if (!manifest) throw new Error("shadow_manifest_missing");
  const result = await captureOnce(options, manifest);
  const validation = validateCapture(result);
  writeJson(join(runDir(options, manifest.runId), "capture-validation.json"), validation);
  console.log(JSON.stringify({
    ok: validation.ok,
    enrichmentGate: result.enrichmentReport.gate,
    runId: manifest.runId,
    validation,
  }, null, 2));
  if (!validation.ok || result.enrichmentReport.gate !== "pass") process.exitCode = 1;
}

function commandStatus(options: CliOptions) {
  const manifest = readManifest(options);
  const lock = readLock(options);
  const state = asRecord(readJsonIfExists(runStatePath(options)));
  const status = {
    currentRun: getCurrentRunId(options) || "",
    lock: {
      ...lock,
      alive: lock.pid ? isPidAlive(lock.pid) : false,
    },
    manifest,
    runnerState: state,
  };
  console.log(JSON.stringify(status, null, 2));
  writeJson(join(options.outDir, "shadow-status.json"), status);
}

function updateManifestStatus(options: CliOptions, status: ShadowRunManifest["status"], reason: string) {
  const manifest = readManifest(options);
  if (!manifest) throw new Error("shadow_manifest_missing");
  const updated: ShadowRunManifest = {
    ...manifest,
    status,
    updatedAt: nowIso(),
  };
  writeJson(manifestPath(options, updated.runId), updated);
  writeCurrentRun(options, updated);
  writeJson(runStatePath(options), {
    reason,
    runId: updated.runId,
    status,
    updatedAt: updated.updatedAt,
  });
  return updated;
}

function commandStop(options: CliOptions) {
  const lock = readLock(options);
  if (lock.pid && isPidAlive(lock.pid)) {
    try {
      process.kill(lock.pid, "SIGTERM");
    } catch {
      // If the runner has already exited, removing the lock is still safe.
    }
  }
  if (existsSync(lockPath(options))) unlinkSync(lockPath(options));
  const manifest = updateManifestStatus(options, "completed", options.reason || "manual_stop");
  console.log(JSON.stringify({ ok: true, runId: manifest.runId, status: manifest.status }, null, 2));
}

function commandPause(options: CliOptions) {
  const manifest = updateManifestStatus(options, "paused", options.reason || "manual_pause");
  console.log(JSON.stringify({ ok: true, runId: manifest.runId, status: manifest.status }, null, 2));
}

function commandResume(options: CliOptions) {
  const manifest = updateManifestStatus(options, "running", options.reason || "manual_resume");
  console.log(JSON.stringify({ ok: true, runId: manifest.runId, status: manifest.status }, null, 2));
}

async function commandRunLoop(options: CliOptions) {
  const intervalMs = Math.max(60_000, Number(process.env.SHADOW_CAPTURE_INTERVAL_MS || 5 * 60_000));
  const manifest = readManifest(options);
  if (!manifest) throw new Error("shadow_manifest_missing");

  while (true) {
    try {
      const current = readManifest(options, manifest.runId);
      if (!current || current.status === "completed" || current.status === "aborted") break;
      if (current.status !== "paused") {
        await captureOnce(options, current);
        writeJson(runStatePath(options), {
          heartbeatAt: nowIso(),
          pid: process.pid,
          runId: current.runId,
          status: "running",
          updatedAt: nowIso(),
        });
      }
    } catch (error) {
      appendFileSync(runnerLogPath(options), `${nowIso()} ${error instanceof Error ? error.stack || error.message : String(error)}\n`, "utf8");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
}

function commandCheckpoint(options: CliOptions) {
  const manifest = readManifest(options);
  if (!manifest) throw new Error("shadow_manifest_missing");
  const checkpointPlan = readJsonIfExists(join(runDir(options, manifest.runId), "checkpoint-plan.json")) as ShadowCheckpointPlan | null;
  if (!checkpointPlan) throw new Error("checkpoint_plan_missing");
  const now = Date.now();
  const due = checkpointPlan.checkpoints.filter((checkpoint) => checkpoint.status === "pending" && new Date(checkpoint.dueAt).getTime() <= now);
  const status = {
    generatedAt: nowIso(),
    note: "第 5.1-R checkpoint 命令只报告到期项，不回填未来价格；价格归因必须走后续正式复盘规则。",
    pending: checkpointPlan.checkpoints.filter((checkpoint) => checkpoint.status === "pending").length,
    dueCount: due.length,
    due: due.slice(0, 50),
    researchOnly: true,
  };
  writeJson(join(runDir(options, manifest.runId), "checkpoint-status.json"), status);
  console.log(JSON.stringify(status, null, 2));
}

function commandDailySummary(options: CliOptions) {
  const manifest = readManifest(options);
  if (!manifest) throw new Error("shadow_manifest_missing");
  const latest = readJsonIfExists(join(runDir(options, manifest.runId), "shadow-latest.json")) as CaptureOnceResult["latest"] | null;
  const checkpointStatus = asRecord(readJsonIfExists(join(runDir(options, manifest.runId), "checkpoint-status.json")));
  const generatedAt = nowIso();
  const markdown = `# Shadow Tracking v1 daily summary

生成时间：${generatedAt}

## 状态

- runId：${manifest.runId}
- status：${manifest.status}
- phase：${manifest.phase}
- mode：${manifest.mode}
- researchOnly：是
- canEnterLiveTrading：否

## 最新捕获

- events：${latest?.stats.eventsTotal ?? 0}
- OBSERVE：${latest?.stats.observeCount ?? 0}
- WAIT：${latest?.stats.waitCount ?? 0}
- BLOCKED：${latest?.stats.blockedCount ?? 0}
- READY：${latest?.stats.readyCount ?? 0}
- checkpoints pending：${checkpointStatus?.pending ?? latest?.stats.checkpointsPlanned ?? 0}

## 边界

本摘要只用于 Shadow Tracking 研究观察，不生成交易建议，不调整生产排序，不证明系统可实战。
`;
  const path = join(runDir(options, manifest.runId), `daily-summary-${generatedAt.slice(0, 10)}.md`);
  writeText(path, markdown);
  writeText(join(runDir(options, manifest.runId), "daily-summary.md"), markdown);
  console.log(JSON.stringify({ ok: true, path, runId: manifest.runId }, null, 2));
}

function commandReport(options: CliOptions) {
  const manifest = readManifest(options);
  if (!manifest) {
    console.log("Shadow Tracking 尚未生成当前 run。");
    return;
  }
  const latestPath = join(runDir(options, manifest.runId), "shadow-latest.md");
  const latest = existsSync(latestPath) ? readFileSync(latestPath, "utf8") : "Shadow latest report missing.\n";
  console.log(latest);
}

function commandValidate(options: CliOptions) {
  const manifest = readManifest(options);
  let result: CaptureOnceResult | null = null;

  if (manifest) {
    const latest = readJsonIfExists(join(runDir(options, manifest.runId), "shadow-latest.json")) as CaptureOnceResult["latest"] | null;
    const checkpointPlan = readJsonIfExists(join(runDir(options, manifest.runId), "checkpoint-plan.json")) as ShadowCheckpointPlan | null;
    const eventsManifest = readJsonIfExists(join(runDir(options, manifest.runId), "shadow-events-manifest.json")) as ShadowEventsManifest | null;
    if (latest && checkpointPlan && eventsManifest) {
      result = {
        checkpointPlan,
        duplicateEvents: latest.stats.duplicatesSkipped,
        enrichmentReport: readJsonIfExists(join(runDir(options, manifest.runId), "enrichment-report.json")) as ShadowEnrichmentGateReport ?? {
          coverageRequired: 0.8,
          errors: [],
          gate: "pass",
          missingSymbols: [],
          nonObserveCoverage: 1,
          nonObserveMissingSymbols: [],
          overallCoverage: 1,
          readyCount: latest.stats.readyCount,
          signalCount: latest.stats.eventsTotal,
          sourceCounts: {
            partial_contract_enrichment: 0,
            production_contract_enrichment: 0,
            scan_embedded_unified_decision: latest.stats.eventsTotal,
            scan_summary_fallback: 0,
          },
          statusCounts: { complete: latest.stats.eventsTotal, missing: 0, partial: 0 },
          waitBlockedReadyCount: latest.stats.waitCount + latest.stats.blockedCount + latest.stats.readyCount,
          warnings: [],
        },
        events: readJsonlIfExists<ShadowObservationEvent>(eventsPath(options, manifest.runId)),
        eventsManifest,
        latest,
        manifest,
        transitions: readJsonlIfExists<ShadowStatusTransition>(join(runDir(options, manifest.runId), "transitions.jsonl")),
        warnings: latest.warnings,
      };
    }
  }

  if (!result) result = phase51BaselineFallback();
  if (!result) throw new Error("shadow_validation_artifacts_missing");
  const validation = validateCapture(result);
  writeJson(join(options.outDir, "shadow-validation.json"), validation);
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.ok) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outDir);

  switch (options.command) {
    case "baseline":
      await commandBaseline(options);
      break;
    case "capture":
      await commandCapture(options);
      break;
    case "checkpoint":
      commandCheckpoint(options);
      break;
    case "daily-summary":
      commandDailySummary(options);
      break;
    case "pause":
      commandPause(options);
      break;
    case "report":
      commandReport(options);
      break;
    case "resume":
      commandResume(options);
      break;
    case "run-loop":
      await commandRunLoop(options);
      break;
    case "start":
      await commandStart(options);
      break;
    case "status":
      commandStatus(options);
      break;
    case "stop":
      commandStop(options);
      break;
    case "validate":
      commandValidate(options);
      break;
    default:
      throw new Error(`unsupported_shadow_command:${options.command satisfies never}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
