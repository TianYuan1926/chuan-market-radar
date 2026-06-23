#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
TAIL_LINES="${TAIL_LINES:-80}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH." >&2
  exit 1
fi

if docker ps >/dev/null 2>&1; then
  COMPOSE=(docker compose --env-file "${ENV_FILE}")
elif sudo -n docker ps >/dev/null 2>&1; then
  COMPOSE=(sudo docker compose --env-file "${ENV_FILE}")
else
  echo "ERROR: cannot access Docker daemon. Add this user to docker group or allow passwordless sudo for docker." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

cd "${ROOT_DIR}"

run_web_node() {
  "${COMPOSE[@]}" exec -T web node "$@"
}

echo "== Service status =="
"${COMPOSE[@]}" ps

echo "== Health summary =="
run_web_node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('status',r.status); const body=await r.json().catch(async()=>({raw:await r.text()})); const h=body.health||{}; console.log(JSON.stringify({ok:body.ok,level:h.level,source:h.dataSource,persistence:h.persistence,scan:h.scan,operations:h.operations,macroMarket:h.macroMarket,lightScan:h.lightScan&&{status:h.lightScan.status,candidateCount:h.lightScan.candidateCount,acceptedCount:h.lightScan.acceptedCount,source:h.lightScan.source,topCandidates:h.lightScan.topCandidates?.slice?.(0,8)},fullMarket:h.fullMarketCoverage&&{status:h.fullMarketCoverage.status,coverage:h.fullMarketCoverage.coverage,operatorHint:h.fullMarketCoverage.operatorHint},scanEconomy:h.scanEconomy&&{budget:h.scanEconomy.budget,nextTier:h.scanEconomy.nextTier}},null,2)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Backend contract summary =="
run_web_node -e "fetch('http://127.0.0.1:3000/api/radar/backend-contract',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('status',r.status); const body=await r.json().catch(async()=>({raw:await r.text()})); console.log(JSON.stringify({source:body.source,sourceAudit:body.sourceAudit&&{publicDiscovery:body.sourceAudit.publicDiscovery,publicLightScan:body.sourceAudit.publicLightScan,macroMarket:body.sourceAudit.macroMarket},scanProof:body.scanProof&&{fullMarket:body.scanProof.fullMarket,deepScan:body.scanProof.deepScan,allocation:{capacity:body.scanProof.allocation?.capacity,selectedAssets:body.scanProof.allocation?.selectedAssets,pendingAssets:body.scanProof.allocation?.pendingAssets?.slice?.(0,20),notEliminatedAssets:body.scanProof.allocation?.notEliminatedAssets}},presentation:body.presentation,analysis:body.analysis&&{signalMaturity:body.analysis.signalMaturity,timeframeGate:body.analysis.timeframeGate,v3StrategyLoop:body.analysis.v3StrategyLoop}},null,2)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== Worker logs tail =="
"${COMPOSE[@]}" logs --tail="${TAIL_LINES}" scanner-worker websocket-light-worker coinglass-worker macro-worker signal-worker dynamic-scan-scheduler

echo "Observation completed. No secrets were printed."
