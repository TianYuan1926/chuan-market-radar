#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
ENV_FILE="${ENV_FILE:-.env.production}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_SOCKS_PROXY="${SSH_SOCKS_PROXY:-}"
DEFAULT_SSH_IDENTITY_FILE="${HOME}/.ssh/chuan_radar_tencent_ed25519"
RESTART_AFTER_UPDATE="${RESTART_AFTER_UPDATE:-true}"
RUN_CAPABILITY_PROBE="${RUN_CAPABILITY_PROBE:-true}"

detect_macos_socks_proxy() {
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v scutil >/dev/null 2>&1; then
    return
  fi

  local proxy_output proxy_host proxy_port socks_enabled
  proxy_output="$(scutil --proxy 2>/dev/null || true)"
  socks_enabled="$(awk '/SOCKSEnable/ {print $3; exit}' <<< "${proxy_output}")"
  proxy_host="$(awk '/SOCKSProxy/ {print $3; exit}' <<< "${proxy_output}")"
  proxy_port="$(awk '/SOCKSPort/ {print $3; exit}' <<< "${proxy_output}")"

  if [[ "${socks_enabled}" == "1" && -n "${proxy_host}" && -n "${proxy_port}" ]]; then
    printf '%s:%s' "${proxy_host}" "${proxy_port}"
  fi
}

read_coinglass_key() {
  if [[ -n "${COINGLASS_API_KEY:-}" ]]; then
    printf '%s' "${COINGLASS_API_KEY}"
    return
  fi

  if [[ -n "${COINGLASS_API_KEY_FILE:-}" ]]; then
    tr -d '\r\n' < "${COINGLASS_API_KEY_FILE}"
    return
  fi

  if [[ "${READ_COINGLASS_KEY_FROM_CLIPBOARD:-false}" == "true" ]] && command -v pbpaste >/dev/null 2>&1; then
    pbpaste | tr -d '\r\n'
    return
  fi

  if [[ -t 0 ]]; then
    local key
    printf 'Paste CoinGlass API key, then press Enter. Input is hidden: ' >&2
    read -r -s key
    printf '\n' >&2
    printf '%s' "${key}"
    return
  fi

  echo "ERROR: provide CoinGlass key via hidden prompt, COINGLASS_API_KEY, COINGLASS_API_KEY_FILE, or READ_COINGLASS_KEY_FROM_CLIPBOARD=true." >&2
  return 1
}

validate_key_locally() {
  local key="$1"

  if [[ -z "${key}" || "${key}" == "CHANGE_ME_COINGLASS_API_KEY" ]]; then
    echo "ERROR: CoinGlass key is empty or still a placeholder." >&2
    exit 1
  fi

  if [[ "${#key}" -lt 20 || "${#key}" -gt 256 ]]; then
    echo "ERROR: CoinGlass key length looks invalid." >&2
    exit 1
  fi

  if [[ "${key}" =~ [[:space:]] ]]; then
    echo "ERROR: CoinGlass key contains whitespace." >&2
    exit 1
  fi
}

if [[ -z "${SSH_SOCKS_PROXY}" ]]; then
  SSH_SOCKS_PROXY="$(detect_macos_socks_proxy)"
fi

if [[ -z "${SSH_IDENTITY_FILE}" && -f "${DEFAULT_SSH_IDENTITY_FILE}" ]]; then
  SSH_IDENTITY_FILE="${DEFAULT_SSH_IDENTITY_FILE}"
fi

SSH_OPTS=(
  -p "${SSH_PORT}"
  -o "BatchMode=yes"
  -o "ConnectTimeout=${SSH_CONNECT_TIMEOUT}"
  -o "ServerAliveInterval=15"
  -o "ServerAliveCountMax=2"
  -o "StrictHostKeyChecking=accept-new"
)

if [[ -n "${SSH_IDENTITY_FILE}" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY_FILE}")
fi

if [[ -n "${SSH_SOCKS_PROXY}" ]]; then
  SSH_OPTS+=(-o "ProxyCommand=nc -x ${SSH_SOCKS_PROXY} -X 5 %h %p")
fi

COINGLASS_KEY="$(read_coinglass_key)"
validate_key_locally "${COINGLASS_KEY}"

REMOTE_SCRIPT="/tmp/chuan-update-coinglass-key-$$.sh"

cleanup_remote_script() {
  ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" "rm -f '${REMOTE_SCRIPT}'" >/dev/null 2>&1 || true
}
trap cleanup_remote_script EXIT

ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" "cat > '${REMOTE_SCRIPT}' && chmod 700 '${REMOTE_SCRIPT}'" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail

cd "${APP_DIR}"

COINGLASS_KEY_FROM_STDIN="$(cat)"
export COINGLASS_KEY_FROM_STDIN

python3 - "${ENV_FILE}" <<'PY'
import os
import pathlib
import re
import stat
import sys
from datetime import datetime, timezone

env_file = pathlib.Path(sys.argv[1])
key = os.environ.pop("COINGLASS_KEY_FROM_STDIN", "").strip()

if not key or key == "CHANGE_ME_COINGLASS_API_KEY":
    raise SystemExit("ERROR: CoinGlass key is empty or placeholder.")
if len(key) < 20 or len(key) > 256:
    raise SystemExit("ERROR: CoinGlass key length looks invalid.")
if re.search(r"\s", key):
    raise SystemExit("ERROR: CoinGlass key contains whitespace.")
if not env_file.exists():
    raise SystemExit(f"ERROR: missing {env_file}")

backup = env_file.with_name(f"{env_file.name}.backup.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
backup.write_bytes(env_file.read_bytes())
os.chmod(backup, stat.S_IRUSR | stat.S_IWUSR)

lines = env_file.read_text().splitlines()
updated = False
next_lines = []
for line in lines:
    if line.startswith("COINGLASS_API_KEY="):
        next_lines.append(f"COINGLASS_API_KEY={key}")
        updated = True
    else:
        next_lines.append(line)

if not updated:
    next_lines.append(f"COINGLASS_API_KEY={key}")

tmp = env_file.with_suffix(env_file.suffix + ".tmp")
tmp.write_text("\n".join(next_lines) + "\n")
os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
tmp.replace(env_file)

print("coinglass key updated safely; value not printed")
print(f"backup={backup.name}")
PY

if [[ "${RESTART_AFTER_UPDATE}" == "true" ]]; then
  sudo docker compose --env-file "${ENV_FILE}" up -d --force-recreate \
    web scanner-worker websocket-light-worker coinglass-worker signal-worker dynamic-scan-scheduler macro-worker >/tmp/chuan-coinglass-key-recreate.log
  echo "containers recreated with updated env"
fi

if [[ "${RUN_CAPABILITY_PROBE}" == "true" ]]; then
  sudo docker compose --env-file "${ENV_FILE}" exec -T web node - <<'NODE'
const secret = process.env.CRON_SECRET || "";
fetch("http://127.0.0.1:3000/api/admin/coinglass/capability", {
  method: "POST",
  headers: { authorization: "Bearer " + secret, "cache-control": "no-store" },
}).then(async (response) => {
  const body = await response.json();
  const capability = body.capability || {};
  console.log(JSON.stringify({
    status: response.status,
    ok: body.ok,
    deepScanStatus: capability.deepScanStatus,
    providerCanFetchPairMarkets: capability.providerCanFetchPairMarkets,
    availableDeepEndpointIds: capability.availableDeepEndpointIds,
    blockedDeepEndpointIds: capability.blockedDeepEndpointIds,
    operatorHint: capability.operatorHint,
  }, null, 2));
  process.exit(response.ok && body.ok ? 0 : 1);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
fi
REMOTE

printf '%s' "${COINGLASS_KEY}" | ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "APP_DIR='${APP_DIR}' ENV_FILE='${ENV_FILE}' RESTART_AFTER_UPDATE='${RESTART_AFTER_UPDATE}' RUN_CAPABILITY_PROBE='${RUN_CAPABILITY_PROBE}' '${REMOTE_SCRIPT}'"

echo "Production CoinGlass key update finished."
