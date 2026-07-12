#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
STRICT_SCAN_FRESHNESS="${STRICT_SCAN_FRESHNESS:-true}"
STRICT_HEALTH_LEVEL="${STRICT_HEALTH_LEVEL:-${STRICT_SCAN_FRESHNESS}}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-600}"
READY_POLL_INTERVAL_SECONDS="${READY_POLL_INTERVAL_SECONDS:-5}"
SHADOW_READY_TIMEOUT_SECONDS="${SHADOW_READY_TIMEOUT_SECONDS:-660}"

cd "${ROOT_DIR}"

compose_cmd=()
node_runner=()
api_base_url="${BASE_URL%/}"
if command -v docker >/dev/null 2>&1; then
  if docker ps >/dev/null 2>&1; then
    compose_cmd=(docker compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  elif sudo -n docker ps >/dev/null 2>&1; then
    compose_cmd=(sudo docker compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  fi
fi

if command -v node >/dev/null 2>&1; then
  node_runner=(node)
elif [[ ${#compose_cmd[@]} -gt 0 && -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]]; then
  node_runner=("${compose_cmd[@]}" exec -T web node)
  if [[ "${api_base_url}" == "http://127.0.0.1" || "${api_base_url}" == "http://localhost" ]]; then
    api_base_url="http://127.0.0.1:3000"
  fi
fi

run_node() {
  if [[ ${#node_runner[@]} -gt 0 ]]; then
    "${node_runner[@]}" "$@"
  else
    echo "ERROR: node is unavailable on host and web container is unavailable." >&2
    return 127
  fi
}

echo "== Production API contract check: ${api_base_url} =="
run_node - "${api_base_url}" "${STRICT_SCAN_FRESHNESS}" "${READY_TIMEOUT_SECONDS}" "${READY_POLL_INTERVAL_SECONDS}" "${STRICT_HEALTH_LEVEL}" <<'NODE'
const baseUrl = process.argv[2].replace(/\/$/, "");
const strictScanFreshness = ["1", "true", "yes", "on"].includes(String(process.argv[3]).toLowerCase());
const readyTimeoutMs = Math.max(0, Number(process.argv[4] || "600")) * 1000;
const pollIntervalMs = Math.max(1000, Number(process.argv[5] || "5") * 1000);
const strictHealthLevel = ["1", "true", "yes", "on"].includes(String(process.argv[6] ?? process.argv[3]).toLowerCase());

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

const deadline = Date.now() + readyTimeoutMs;
let healthBody;
let health;
let scan;
let persistence;
let runtimeProbes;
let lastReadinessError;

while (true) {
  try {
    healthBody = await fetchJson("/api/health");
    health = healthBody.health || {};
    scan = health.scan || {};
    persistence = health.persistence || {};
    runtimeProbes = health.runtimeProbes || {};

    assert(healthBody.ok === true, "health.ok is not true");
    if (strictHealthLevel) {
      assert(health.level === "ready", `health.level is ${health.level}`);
    } else {
      assert(["ready", "degraded"].includes(health.level), `health.level is ${health.level}`);
    }
    assert(persistence.databaseStatus === "ready", `databaseStatus is ${persistence.databaseStatus}`);
    if (strictScanFreshness) {
      assert(scan.freshness === "fresh", `scan.freshness is ${scan.freshness}`);
    }
    break;
  } catch (error) {
    lastReadinessError = error;
    if (Date.now() >= deadline) {
      throw error;
    }
    console.error(`waiting for ready: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void lastReadinessError;

const radarBody = await fetchJson("/api/frontend/radar-contract");
assert(radarBody.ok === true, "radar-contract ok is not true");
assert(radarBody.contract?.scanProof, "radar-contract missing scanProof");
assert(radarBody.contract?.radarSignals, "radar-contract missing radarSignals");
assert(radarBody.contract?.coreChainGovernance, "radar-contract missing coreChainGovernance");

const backendBody = await fetchJson("/api/radar/backend-contract");
assert(backendBody.ok !== false, "backend-contract ok is false");
assert(backendBody.contract?.scanProof, "backend-contract missing contract.scanProof");

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

if [[ ${#compose_cmd[@]} -gt 0 && -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]]; then
  echo "== Docker service status =="
  "${compose_cmd[@]}" ps

  echo "== Postgres readiness =="
  "${compose_cmd[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

  echo "== Redis readiness =="
  "${compose_cmd[@]}" exec -T redis redis-cli ping

  echo "== Shadow runner readiness =="
  shadow_deadline=$((SECONDS + SHADOW_READY_TIMEOUT_SECONDS))
  while true; do
    if shadow_health_output="$("${compose_cmd[@]}" exec -T shadow-runner sh -lc 'node .tmp/market-tests/scripts/shadow/shadow-tracking.js health --out-dir "$SHADOW_REPORTS_DIR" --run-id "$SHADOW_RUN_ID"' 2>&1)"; then
      printf '%s\n' "${shadow_health_output}"
      break
    fi
    if (( SECONDS >= shadow_deadline )); then
      echo "ERROR: shadow runner is not ready after ${SHADOW_READY_TIMEOUT_SECONDS}s." >&2
      printf '%s\n' "${shadow_health_output}" >&2
      exit 1
    fi
    echo "waiting for ready: shadow runner is not ready"
    sleep "${READY_POLL_INTERVAL_SECONDS}"
  done

  echo "== Worker status =="
  "${compose_cmd[@]}" ps scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker shadow-runner
else
  echo "WARN: Docker compose check skipped; docker unavailable or base/override env file missing."
fi

echo "production check ok"
