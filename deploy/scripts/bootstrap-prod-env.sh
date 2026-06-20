#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
    return
  fi

  LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c "$(( $1 * 2 ))"
}

read_coinglass_key() {
  if [[ -n "${COINGLASS_API_KEY:-}" ]]; then
    printf '%s' "${COINGLASS_API_KEY}"
    return
  fi

  if [[ -t 0 ]]; then
    printf 'Paste CoinGlass API key, then press Enter. Input is hidden: ' >&2
    read -r -s key
    printf '\n' >&2
    printf '%s' "${key}"
    return
  fi

  printf 'CHANGE_ME_COINGLASS_API_KEY'
}

cd "${ROOT_DIR}"

if [[ ! -f "docker-compose.yml" ]]; then
  echo "ERROR: run this script from the project deployed by this repository." >&2
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  backup="${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
  cp "${ENV_FILE}" "${backup}"
  chmod 600 "${backup}"
  echo "Existing .env.production backed up."
fi

POSTGRES_PASSWORD="$(random_hex 24)"
CRON_SECRET="$(random_hex 32)"
COINGLASS_KEY="$(read_coinglass_key)"

cat > "${ENV_FILE}" <<EOF
# Site
NEXT_PUBLIC_SITE_NAME=川
CHUAN_PUBLIC_HOST=:80

# Runtime
NODE_ENV=production
MARKET_DATA_PROVIDER=coinglass
PERSISTENCE_SCOPE=chuan-prod
SCAN_API_RATE_LIMIT=120
JOURNAL_API_RATE_LIMIT=60
RADAR_API_RATE_LIMIT=120
RADAR_CONTRACT_API_RATE_LIMIT=120
RADAR_DOSSIER_API_RATE_LIMIT=180

# Local PostgreSQL for single-server deployment
POSTGRES_DB=chuan_market_radar
POSTGRES_USER=chuan_radar
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_DRIVER=postgres

# Protected admin API
CRON_SECRET=${CRON_SECRET}

# CoinGlass
COINGLASS_API_KEY=${COINGLASS_KEY}
COINGLASS_BASE_ASSETS=BTC,ETH,SOL,ENA,SUI,ONDO,TIA
COINGLASS_BATCH_SIZE=24
COINGLASS_DAILY_REQUEST_BUDGET=3000
COINGLASS_MAX_CONCURRENCY=6
COINGLASS_DAILY_MOVER_MAX_ASSETS=30
COINGLASS_DAILY_MOVER_LIMIT_PER_SIDE=10

# Worker cadence
SCANNER_INTERVAL_SECONDS=900
DAILY_MOVER_INTERVAL_SECONDS=86400
KLINE_CACHE_INTERVAL_SECONDS=21600
OUTCOME_INTERVAL_SECONDS=3600
V3_FORWARD_MAP_INTERVAL_SECONDS=21600
HEALTH_WATCH_INTERVAL_SECONDS=300

# Review and calibration budgets
KLINE_BACKTEST_DAILY_REQUEST_BUDGET=12
KLINE_BACKTEST_MAX_SYMBOLS_PER_RUN=2
OUTCOME_EXECUTOR_EVENT_LIMIT=80
V3_FORWARD_MAP_REVIEW_LIMIT=80
STRATEGY_WEIGHT_ACTIVATION_MODE=disabled

# AI analysis provider, default disabled
AI_REVIEW_ENABLED=false
AI_PROVIDER=
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
AI_REVIEW_MAX_SIGNALS=3
AI_REVIEW_MAX_PROMPT_CHARS=12000

# Legacy/rollback adapters. Keep empty unless intentionally using them again.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EOF

chmod 600 "${ENV_FILE}"

echo ".env.production created."
echo "Safe summary:"
echo "  MARKET_DATA_PROVIDER=coinglass"
echo "  DATABASE_DRIVER=postgres"
echo "  POSTGRES_DB=chuan_market_radar"
echo "  POSTGRES_USER=chuan_radar"
echo "  CHUAN_PUBLIC_HOST=:80"
echo "  COINGLASS_BATCH_SIZE=24"
echo "  COINGLASS_DAILY_REQUEST_BUDGET=3000"
echo "Secrets were written only to .env.production and were not printed."
