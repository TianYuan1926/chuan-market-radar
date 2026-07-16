#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const releasePattern = /^[a-z0-9][a-z0-9._-]{7,127}$/u;
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
const maximumEvidenceAgeMs = 24 * 60 * 60 * 1000;

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isPublicHostname(host) {
  if (typeof host !== "string" || !host.includes(".")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return false;
  if (host === "localhost" || host.endsWith(".local")) return false;
  return /^[A-Za-z0-9.-]+$/u.test(host);
}

export function validateHttpsSessionEvidence(evidence, now = new Date()) {
  const violations = [];
  const requiredTop = [
    "access", "generatedAt", "identity", "privateSession", "schemaVersion",
    "status", "tlsBurnIn", "validUntil",
  ];
  if (!exactKeys(evidence, requiredTop)) violations.push("top_level_keys_invalid");
  if (evidence?.schemaVersion !== "market-radar-g0-https-session-evidence.v1") {
    violations.push("schema_version_invalid");
  }
  if (evidence?.status !== "pass") violations.push("status_not_pass");

  const generatedAt = parseDate(evidence?.generatedAt);
  const validUntil = parseDate(evidence?.validUntil);
  if (!generatedAt || !validUntil || generatedAt > now || validUntil <= now ||
    validUntil.getTime() - generatedAt.getTime() > maximumEvidenceAgeMs) {
    violations.push("evidence_window_invalid");
  }

  if (!exactKeys(evidence?.identity, ["commit", "releaseId", "sourceArtifactSha256"]) ||
    !commitPattern.test(evidence?.identity?.commit ?? "") ||
    !releasePattern.test(evidence?.identity?.releaseId ?? "") ||
    !sha256Pattern.test(evidence?.identity?.sourceArtifactSha256 ?? "")) {
    violations.push("identity_invalid");
  }

  const access = evidence?.access;
  if (!exactKeys(access, [
    "accessMode", "certificateVerified", "contentSecurityPolicy", "hstsMaxAge",
    "host", "httpRedirectStatus", "httpsReachable", "mixedContentCount",
    "permissionsPolicy", "publicListenerCount", "trustedNetworkEnforced",
  ])) violations.push("access_keys_invalid");

  if (access?.accessMode === "public_tls") {
    if (!isPublicHostname(access.host) || access.httpsReachable !== true ||
      access.certificateVerified !== true || ![301, 308].includes(access.httpRedirectStatus) ||
      access.mixedContentCount !== 0 || access.publicListenerCount < 1 ||
      access.trustedNetworkEnforced !== false) {
      violations.push("public_tls_not_proven");
    }
    if (!Number.isSafeInteger(access.hstsMaxAge) || access.hstsMaxAge < 31_536_000) {
      violations.push("hsts_not_enabled_after_burn_in");
    }
  } else if (access?.accessMode === "trusted_private") {
    if (access.publicListenerCount !== 0 || access.trustedNetworkEnforced !== true) {
      violations.push("trusted_private_boundary_not_proven");
    }
  } else {
    violations.push("access_mode_invalid");
  }
  if (access?.contentSecurityPolicy !== true || access?.permissionsPolicy !== true) {
    violations.push("security_headers_incomplete");
  }

  const burnIn = evidence?.tlsBurnIn;
  if (!exactKeys(burnIn, [
    "endedAt", "failureCount", "maxGapSeconds", "releaseId", "sampleCount", "startedAt",
  ])) violations.push("burn_in_keys_invalid");
  const startedAt = parseDate(burnIn?.startedAt);
  const endedAt = parseDate(burnIn?.endedAt);
  if (!startedAt || !endedAt || endedAt.getTime() - startedAt.getTime() < sevenDaysMs ||
    burnIn?.sampleCount < 2017 || burnIn?.maxGapSeconds > 600 || burnIn?.failureCount !== 0 ||
    burnIn?.releaseId !== evidence?.identity?.releaseId) {
    violations.push("seven_day_burn_in_not_proven");
  }

  const session = evidence?.privateSession;
  if (!exactKeys(session, [
    "configured", "cookieHttpOnly", "cookieSameSite", "cookieSecure", "enabled",
    "loginRateLimited", "logoutInvalidated", "noStore", "rotationProcedureReady",
    "securityLogRedacted", "unauthenticatedApiRejected", "unauthenticatedPageRejected",
  ])) violations.push("private_session_keys_invalid");
  if (session?.enabled !== true || session?.configured !== true ||
    session?.cookieHttpOnly !== true || session?.cookieSecure !== true ||
    !["lax", "strict"].includes(session?.cookieSameSite) ||
    session?.loginRateLimited !== true || session?.logoutInvalidated !== true ||
    session?.noStore !== true || session?.rotationProcedureReady !== true ||
    session?.securityLogRedacted !== true || session?.unauthenticatedApiRejected !== true ||
    session?.unauthenticatedPageRejected !== true) {
    violations.push("private_session_not_proven");
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    productionReady: violations.length === 0,
    violations,
  };
}

export function validateLocalHttpsSessionPreparation(baseDir = rootDir) {
  const files = {
    caddy: readFileSync(resolve(baseDir, "deploy/caddy/Caddyfile"), "utf8"),
    compose: readFileSync(resolve(baseDir, "docker-compose.yml"), "utf8"),
    middleware: readFileSync(resolve(baseDir, "middleware.ts"), "utf8"),
    route: readFileSync(resolve(baseDir, "src/app/api/auth/session/route.ts"), "utf8"),
    session: readFileSync(resolve(baseDir, "src/lib/auth/private-session.ts"), "utf8"),
  };
  const required = [
    [files.caddy, "{$CHUAN_PUBLIC_HOST}"],
    [files.caddy, "Strict-Transport-Security \"max-age={$CHUAN_HSTS_MAX_AGE:0}\""],
    [files.caddy, "Content-Security-Policy"],
    [files.caddy, "Permissions-Policy"],
    [files.compose, '"443:443"'],
    [files.compose, "CHUAN_SESSION_SECRET_PREVIOUS"],
    [files.compose, "CHUAN_TRUSTED_PRIVATE_NETWORK"],
    [files.middleware, "verifyPrivateSessionToken"],
    [files.route, "validateSessionMutationOrigin"],
    [files.route, "sessionResponseHeaders"],
    [files.route, "sessionAuditLine"],
    [files.session, 'v: "private-session.v1"'],
    [files.session, "previous_secret_matches_current"],
  ];
  const violations = required.flatMap(([source, token]) => source.includes(token)
    ? []
    : [`required_guard_missing:${token}`]);
  const sharedEnvironment = files.compose.split("\nservices:")[0] ?? "";
  if (sharedEnvironment.includes("CHUAN_SESSION_PASSWORD") ||
    sharedEnvironment.includes("CHUAN_SESSION_SECRET")) {
    violations.push("session_credentials_exposed_to_shared_worker_environment");
  }
  const webEnvironment = files.compose.match(/\n  web:\n[\s\S]*?\n  caddy:\n/u)?.[0] ?? "";
  if (!webEnvironment.includes("CHUAN_SESSION_PASSWORD") ||
    !webEnvironment.includes("CHUAN_SESSION_SECRET") ||
    !webEnvironment.includes("CHUAN_SESSION_SECRET_PREVIOUS")) {
    violations.push("web_session_credentials_missing");
  }
  if (!files.compose.includes("CHUAN_PUBLIC_HOST: ${CHUAN_PUBLIC_HOST:-:80}")) {
    violations.push("legacy_http_default_truth_not_explicit");
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    productionDecision: "BLOCKED_PENDING_EXACT_PUBLIC_TLS_OR_TRUSTED_PRIVATE_EVIDENCE_AND_7_DAY_BURN_IN",
    productionMutationAllowed: false,
    currentDefaultPublicHostIsPlainHttp: true,
    violations,
  };
}

function main() {
  const command = process.argv[2] ?? "local";
  if (command === "local") {
    const result = validateLocalHttpsSessionPreparation();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "pass" ? 0 : 1;
    return;
  }
  if (command === "evaluate" && process.argv[3]) {
    const evidence = JSON.parse(readFileSync(resolve(process.argv[3]), "utf8"));
    const nowIndex = process.argv.indexOf("--now");
    const now = nowIndex >= 0 ? new Date(process.argv[nowIndex + 1]) : new Date();
    const result = validateHttpsSessionEvidence(evidence, now);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "pass" ? 0 : 1;
    return;
  }
  throw new Error("usage: g0-https-session-gate.mjs local | evaluate <evidence.json> [--now ISO]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
