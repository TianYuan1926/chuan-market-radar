#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE=(docker compose --env-file "${ENV_FILE}")

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

cd "${ROOT_DIR}"

echo "== Compose services =="
"${COMPOSE[@]}" ps

run_web_node() {
  "${COMPOSE[@]}" exec -T web node "$@"
}

echo "== Internal health =="
run_web_node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('health',r.status); const body=await r.json().catch(async()=>({raw:await r.text()})); console.log(JSON.stringify({ok:body.ok,level:body.health?.level,source:body.health?.dataSource,macroMarket:body.health?.macroMarket,scan:body.health?.scan,coverage:body.health?.fullMarketCoverage?.coverage},null,2)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Persistence migration =="
run_web_node -e "const secret=process.env.CRON_SECRET||''; fetch('http://127.0.0.1:3000/api/admin/persistence/migrate',{method:'POST',headers:{authorization:'Bearer '+secret,'cache-control':'no-store'}}).then(async r=>{console.log('migration',r.status); console.log((await r.text()).slice(0,1200)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Macro ingest =="
run_web_node -e "const secret=process.env.CRON_SECRET||''; fetch('http://127.0.0.1:3000/api/admin/macro/ingest',{method:'POST',headers:{authorization:'Bearer '+secret,'cache-control':'no-store'}}).then(async r=>{console.log('macro-ingest',r.status); const text=await r.text(); console.log(text.slice(0,1200)); if(!r.ok) console.warn('macro ingest warning: external macro source unavailable; continuing because macro context is not required for core scan liveness'); process.exit(0);}).catch(e=>{console.error(e);process.exit(0);})"

echo "== Scheduled scan =="
run_web_node -e "const secret=process.env.CRON_SECRET||''; fetch('http://127.0.0.1:3000/api/scan',{method:'POST',headers:{authorization:'Bearer '+secret,'cache-control':'no-store'}}).then(async r=>{console.log('scan',r.status); console.log((await r.text()).slice(0,1600)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Backend contract =="
run_web_node -e "fetch('http://127.0.0.1:3000/api/radar/backend-contract',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('backend-contract',r.status); const body=await r.json().catch(async()=>({raw:await r.text()})); console.log(JSON.stringify({source:body.source,macroMarket:body.sourceAudit?.macroMarket,scanProof:body.scanProof?.fullMarket,presentation:body.presentation?.counts},null,2)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Worker logs tail =="
"${COMPOSE[@]}" logs --tail=40 scanner-worker websocket-light-worker coinglass-worker macro-worker signal-worker dynamic-scan-scheduler

echo "Production verification completed without printing secrets."
