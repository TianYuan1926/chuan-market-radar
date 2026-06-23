#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"

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

echo "== 1. Git sync =="
bash "${ROOT_DIR}/deploy/scripts/verify-git-sync.sh"

echo "== 2. Compose config =="
"${COMPOSE[@]}" config >/tmp/chuan-compose-config.txt
echo "compose config ok"

echo "== 3. Service status =="
"${COMPOSE[@]}" ps

echo "== 4. Database migration =="
run_web_node -e "const secret=process.env.CRON_SECRET||''; fetch('http://127.0.0.1:3000/api/admin/persistence/migrate',{method:'POST',headers:{authorization:'Bearer '+secret,'cache-control':'no-store'}}).then(async r=>{const text=await r.text(); console.log('migration',r.status); console.log(text.slice(0,1200)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== 5. Core health =="
run_web_node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'cache-control':'no-store'}}).then(async r=>{const body=await r.json(); const h=body.health||{}; console.log(JSON.stringify({status:r.status,ok:body.ok,level:h.level,scan:h.scan,scanStability:h.scanStability,reviewStatistics:h.reviewStatistics,runtimeProbes:h.runtimeProbes&&{redis:h.runtimeProbes.redis,workers:h.runtimeProbes.workers?.map(w=>({key:w.key,status:w.status,ageSec:w.ageSec}))}},null,2)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== 6. Frontend contracts =="
for path in \
  /api/radar/backend-contract \
  /api/frontend/radar-contract \
  /api/frontend/leaderboard?kind=volume \
  /api/frontend/review-contract \
  /api/frontend/live-events \
  /api/frontend/ui-state?kind=ui_preferences
do
  run_web_node -e "fetch('http://127.0.0.1:3000${path}',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('${path}',r.status); const text=await r.text(); console.log(text.slice(0,800)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"
done

echo "== 7. Scan trigger =="
run_web_node -e "const secret=process.env.CRON_SECRET||''; fetch('http://127.0.0.1:3000/api/scan',{method:'POST',headers:{authorization:'Bearer '+secret,'cache-control':'no-store'}}).then(async r=>{console.log('scan',r.status); console.log((await r.text()).slice(0,1200)); process.exit(r.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

echo "== 8. Public smoke =="
curl --fail --show-error --silent "${BASE_URL}/api/health" >/tmp/chuan-public-health.json
curl --fail --show-error --silent "${BASE_URL}/api/frontend/radar-contract" >/tmp/chuan-public-radar-contract.json
echo "public health and radar contract ok"

echo "== 9. Worker logs tail =="
"${COMPOSE[@]}" logs --tail=60 scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker

echo "== 10. Backup dry run =="
bash "${ROOT_DIR}/deploy/scripts/backup-postgres.sh" >/tmp/chuan-last-backup-path.txt
cat /tmp/chuan-last-backup-path.txt

echo "Full production verification completed. No secrets were printed."
