#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_ROOT="${PRODUCTION_FACTS_DIR:-${ROOT_DIR}/reports/production-facts}"
OUT_DIR="${OUT_ROOT}/${STAMP}"

cd "${ROOT_DIR}"
mkdir -p "${OUT_DIR}"

compose_cmd=()
node_runner=()
capture_base_url="${BASE_URL%/}"
if command -v docker >/dev/null 2>&1; then
  if docker ps >/dev/null 2>&1; then
    compose_cmd=(docker compose --env-file "${ENV_FILE}")
  elif sudo -n docker ps >/dev/null 2>&1; then
    compose_cmd=(sudo docker compose --env-file "${ENV_FILE}")
  fi
fi

if command -v node >/dev/null 2>&1; then
  node_runner=(node)
elif [[ ${#compose_cmd[@]} -gt 0 && -f "${ENV_FILE}" ]]; then
  node_runner=("${compose_cmd[@]}" exec -T web node)
  if [[ "${capture_base_url}" == "http://127.0.0.1" || "${capture_base_url}" == "http://localhost" ]]; then
    capture_base_url="http://127.0.0.1:3000"
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

write_json() {
  local path="$1"
  local url="$2"
  run_node - "${url}" "${OUT_DIR}/${path}" <<'NODE'
const url = process.argv[2];
const out = process.argv[3];
const fs = require("node:fs");

fetch(url, {
  headers: {
    "cache-control": "no-store",
    "user-agent": "chuan-production-facts/1.0",
  },
}).then(async (response) => {
  const text = await response.text();
  fs.writeFileSync(out, JSON.stringify({
    status: response.status,
    ok: response.ok,
    capturedAt: new Date().toISOString(),
    body: text ? JSON.parse(text) : null,
  }, null, 2));
  process.exit(response.ok ? 0 : 1);
}).catch((error) => {
  fs.writeFileSync(out, JSON.stringify({
    status: 0,
    ok: false,
    capturedAt: new Date().toISOString(),
    error: String(error && error.message ? error.message : error),
  }, null, 2));
  process.exit(1);
});
NODE
}

{
  echo "capturedAt=${STAMP}"
  echo "gitHead=$(git rev-parse HEAD 2>/dev/null || true)"
  echo "gitBranch=$(git branch --show-current 2>/dev/null || true)"
  echo "baseUrl=${BASE_URL}"
  echo "captureBaseUrl=${capture_base_url}"
} > "${OUT_DIR}/deployment-summary.txt"

git status --short > "${OUT_DIR}/git-status.txt" || true
git log -5 --oneline > "${OUT_DIR}/git-log.txt" || true

echo "== API snapshots =="
write_json "health.json" "${capture_base_url}/api/health"
write_json "radar-contract.json" "${capture_base_url}/api/frontend/radar-contract"
write_json "backend-contract.json" "${capture_base_url}/api/radar/backend-contract"
write_json "business-capability.json" "${capture_base_url}/api/radar/business-capability"
write_json "review-contract.json" "${capture_base_url}/api/frontend/review-contract" || true

if [[ ${#compose_cmd[@]} -gt 0 && -f "${ENV_FILE}" ]]; then
  echo "== Compose snapshots =="
  "${compose_cmd[@]}" ps > "${OUT_DIR}/docker-compose-ps.txt"
  "${compose_cmd[@]}" logs --tail=120 web scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker > "${OUT_DIR}/docker-compose-logs-tail.txt" 2>&1 || true
  "${compose_cmd[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "${OUT_DIR}/postgres-status.txt" 2>&1 || true
  "${compose_cmd[@]}" exec -T redis redis-cli ping > "${OUT_DIR}/redis-status.txt" 2>&1 || true
else
  echo "docker compose unavailable or env file missing" > "${OUT_DIR}/docker-compose-ps.txt"
fi

run_node - "${OUT_DIR}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const outDir = process.argv[2];

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, name), "utf8"));
  } catch {
    return null;
  }
}

const health = readJson("health.json");
const radar = readJson("radar-contract.json");
const backend = readJson("backend-contract.json");

const summary = {
  capturedAt: new Date().toISOString(),
  health: {
    httpOk: health?.ok ?? false,
    level: health?.body?.health?.level ?? null,
    scanFreshness: health?.body?.health?.scan?.freshness ?? null,
    activeSource: health?.body?.health?.dataSource?.activeSource ?? null,
    databaseStatus: health?.body?.health?.persistence?.databaseStatus ?? null,
  },
  radar: {
    httpOk: radar?.ok ?? false,
    scanProofStatus: radar?.body?.contract?.scanProof?.status ?? null,
    radarSignalsStatus: radar?.body?.contract?.radarSignals?.status ?? null,
    source: radar?.body?.contract?.radarSignals?.source ?? null,
  },
  backend: {
    httpOk: backend?.ok ?? false,
    fullMarketStatus: backend?.body?.contract?.scanProof?.fullMarket?.status ?? null,
    deepScanStatus: backend?.body?.contract?.scanProof?.deepScan?.status ?? null,
  },
};

fs.writeFileSync(path.join(outDir, "scan-status-summary.json"), JSON.stringify(summary, null, 2));
NODE

ARCHIVE_PATH="${OUT_ROOT}/production-facts-${STAMP}.tar.gz"
tar -C "${OUT_ROOT}" -czf "${ARCHIVE_PATH}" "${STAMP}"
ln -sfn "${OUT_DIR}" "${OUT_ROOT}/latest"

echo "production facts directory: ${OUT_DIR}"
echo "production facts archive: ${ARCHIVE_PATH}"
