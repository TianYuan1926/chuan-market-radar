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
capture_base_url="${BASE_URL%/}"
if command -v docker >/dev/null 2>&1; then
  if docker ps >/dev/null 2>&1; then
    compose_cmd=(docker compose --env-file "${ENV_FILE}")
  elif sudo -n docker ps >/dev/null 2>&1; then
    compose_cmd=(sudo docker compose --env-file "${ENV_FILE}")
  fi
fi

write_json() {
  local path="$1"
  local url="$2"
  local out="${OUT_DIR}/${path}"
  local raw="${out}.raw"
  local status

  status="$(
    curl -sS \
      -H "cache-control: no-store" \
      -H "user-agent: chuan-production-facts/1.0" \
      -w "%{http_code}" \
      -o "${raw}" \
      "${url}" || printf "000"
  )"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "${raw}" "${out}" "${status}" <<'PY'
import json
import sys
from datetime import datetime, timezone

raw_path, out_path, status_text = sys.argv[1:4]
try:
    status = int(status_text)
except ValueError:
    status = 0

try:
    with open(raw_path, "r", encoding="utf-8") as handle:
        text = handle.read()
except FileNotFoundError:
    text = ""

try:
    body = json.loads(text) if text else None
except json.JSONDecodeError:
    body = {"raw": text[:4000]}

payload = {
    "status": status,
    "ok": 200 <= status < 300,
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "body": body,
}

with open(out_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
    rm -f "${raw}"
  else
    mv "${raw}" "${out}"
  fi

  [[ "${status}" =~ ^2 ]]
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
  "${compose_cmd[@]}" logs --tail=120 web scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker shadow-runner > "${OUT_DIR}/docker-compose-logs-tail.txt" 2>&1 || true
  "${compose_cmd[@]}" ps shadow-runner > "${OUT_DIR}/shadow-runner-status.txt" 2>&1 || true
  "${compose_cmd[@]}" exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "${OUT_DIR}/postgres-status.txt" 2>&1 || true
  "${compose_cmd[@]}" exec -T redis redis-cli ping > "${OUT_DIR}/redis-status.txt" 2>&1 || true
else
  echo "docker compose unavailable or env file missing" > "${OUT_DIR}/docker-compose-ps.txt"
fi

if command -v python3 >/dev/null 2>&1; then
  python3 - "${OUT_DIR}" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

out_dir = sys.argv[1]

def read_json(name):
    try:
        with open(os.path.join(out_dir, name), "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None

def pick(obj, path):
    current = obj
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current

health = read_json("health.json")
radar = read_json("radar-contract.json")
backend = read_json("backend-contract.json")

summary = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "health": {
        "httpOk": bool(health.get("ok")) if isinstance(health, dict) else False,
        "level": pick(health, ["body", "health", "level"]),
        "scanFreshness": pick(health, ["body", "health", "scan", "freshness"]),
        "activeSource": pick(health, ["body", "health", "dataSource", "activeSource"]),
        "databaseStatus": pick(health, ["body", "health", "persistence", "databaseStatus"]),
    },
    "radar": {
        "httpOk": bool(radar.get("ok")) if isinstance(radar, dict) else False,
        "scanProofStatus": pick(radar, ["body", "contract", "scanProof", "status"]),
        "radarSignalsStatus": pick(radar, ["body", "contract", "radarSignals", "status"]),
        "source": pick(radar, ["body", "contract", "radarSignals", "source"]),
    },
    "backend": {
        "httpOk": bool(backend.get("ok")) if isinstance(backend, dict) else False,
        "fullMarketStatus": pick(backend, ["body", "contract", "scanProof", "fullMarket", "status"]),
        "deepScanStatus": pick(backend, ["body", "contract", "scanProof", "deepScan", "status"]),
    },
}

with open(os.path.join(out_dir, "scan-status-summary.json"), "w", encoding="utf-8") as handle:
    json.dump(summary, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
else
  echo '{"error":"python3 unavailable; summary skipped"}' > "${OUT_DIR}/scan-status-summary.json"
fi

ARCHIVE_PATH="${OUT_ROOT}/production-facts-${STAMP}.tar.gz"
tar -C "${OUT_ROOT}" -czf "${ARCHIVE_PATH}" "${STAMP}"
ln -sfn "${OUT_DIR}" "${OUT_ROOT}/latest"

echo "production facts directory: ${OUT_DIR}"
echo "production facts archive: ${ARCHIVE_PATH}"
