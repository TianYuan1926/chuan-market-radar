#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
STRICT_SCAN_FRESHNESS="${STRICT_SCAN_FRESHNESS:-true}"

cd "${ROOT_DIR}"

compose_cmd=()
if command -v docker >/dev/null 2>&1; then
  if docker ps >/dev/null 2>&1; then
    compose_cmd=(docker compose --env-file "${ENV_FILE}")
  elif sudo -n docker ps >/dev/null 2>&1; then
    compose_cmd=(sudo docker compose --env-file "${ENV_FILE}")
  fi
fi

run_node() {
  if command -v node >/dev/null 2>&1; then
    node "$@"
  elif [[ ${#compose_cmd[@]} -gt 0 && -f "${ENV_FILE}" ]]; then
    "${compose_cmd[@]}" exec -T web node "$@"
  else
    echo "ERROR: node is unavailable on host and web container is unavailable." >&2
    return 127
  fi
}

echo "== Production API contract check: ${BASE_URL} =="
run_node - "${BASE_URL}" "${STRICT_SCAN_FRESHNESS}" <<'NODE'
const baseUrl = process.argv[2].replace(/\/$/, "");
const strictScanFreshness = ["1", "true", "yes", "on"].includes(String(process.argv[3]).toLowerCase());

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "cache-control": "no-store",
      "user-agent": "chuan-production-check/1.0",
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`${path} returned non-json body: ${text.slice(0, 240)}`);
  }
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const healthBody = await fetchJson("/api/health");
const health = healthBody.health || {};
const scan = health.scan || {};
const persistence = health.persistence || {};
const runtimeProbes = health.runtimeProbes || {};

assert(healthBody.ok === true, "health.ok is not true");
assert(health.level === "ready", `health.level is ${health.level}`);
assert(persistence.databaseStatus === "ready", `databaseStatus is ${persistence.databaseStatus}`);
if (strictScanFreshness) {
  assert(scan.freshness === "fresh", `scan.freshness is ${scan.freshness}`);
}

const radarBody = await fetchJson("/api/frontend/radar-contract");
assert(radarBody.ok === true, "radar-contract ok is not true");
assert(radarBody.contract?.scanProof, "radar-contract missing scanProof");
assert(radarBody.contract?.radarSignals, "radar-contract missing radarSignals");
assert(radarBody.contract?.coreChainGovernance, "radar-contract missing coreChainGovernance");

const backendBody = await fetchJson("/api/radar/backend-contract");
assert(backendBody.ok !== false, "backend-contract ok is false");
assert(backendBody.scanProof, "backend-contract missing scanProof");

const businessBody = await fetchJson("/api/radar/business-capability");
assert(businessBody.ok !== false, "business-capability ok is false");

console.log(JSON.stringify({
  ok: true,
  health: {
    level: health.level,
    scanFreshness: scan.freshness,
    activeSource: health.dataSource?.activeSource,
    databaseStatus: persistence.databaseStatus,
    redis: runtimeProbes.redis?.status ?? null,
    workers: Array.isArray(runtimeProbes.workers)
      ? runtimeProbes.workers.map((worker) => ({ key: worker.key, status: worker.status, ageSec: worker.ageSec }))
      : [],
  },
  radar: {
    scanProofStatus: radarBody.contract.scanProof.status,
    radarSignalsStatus: radarBody.contract.radarSignals.status,
    coreGovernanceStatus: radarBody.contract.coreChainGovernance.status,
  },
}, null, 2));
NODE

if [[ ${#compose_cmd[@]} -gt 0 && -f "${ENV_FILE}" ]]; then
  echo "== Docker service status =="
  "${compose_cmd[@]}" ps

  echo "== Postgres readiness =="
  "${compose_cmd[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

  echo "== Redis readiness =="
  "${compose_cmd[@]}" exec -T redis redis-cli ping

  echo "== Worker status =="
  "${compose_cmd[@]}" ps scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker
else
  echo "WARN: Docker compose check skipped; docker unavailable or env file missing."
fi

echo "production check ok"
