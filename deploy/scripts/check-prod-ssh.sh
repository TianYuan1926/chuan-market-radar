#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_SOCKS_PROXY="${SSH_SOCKS_PROXY:-}"
DEFAULT_SSH_IDENTITY_FILE="${HOME}/.ssh/chuan_radar_tencent_ed25519"

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

echo "== TCP check ${PROD_HOST}:${SSH_PORT} =="
if python3 - "${PROD_HOST}" "${SSH_PORT}" "${SSH_CONNECT_TIMEOUT}" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
timeout = float(sys.argv[3])

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(timeout)
try:
    sock.connect((host, port))
except socket.timeout:
    print(f"tcp-timeout: cannot reach {host}:{port} within {timeout:g}s", file=sys.stderr)
    raise SystemExit(2)
except OSError as exc:
    print(f"tcp-error: cannot reach {host}:{port}: {exc}", file=sys.stderr)
    raise SystemExit(2)
finally:
    sock.close()

print("tcp-ok")
PY
then
  :
elif [[ -n "${SSH_SOCKS_PROXY}" ]]; then
  echo "direct-tcp-unavailable; trying SOCKS proxy ${SSH_SOCKS_PROXY}"
else
  exit 2
fi

if [[ -n "${SSH_SOCKS_PROXY}" ]]; then
  echo "== SOCKS proxy TCP check ${SSH_SOCKS_PROXY} -> ${PROD_HOST}:${SSH_PORT} =="
  nc -vz -w "${SSH_CONNECT_TIMEOUT}" -x "${SSH_SOCKS_PROXY}" -X 5 "${PROD_HOST}" "${SSH_PORT}" >/dev/null
  echo "proxy-tcp-ok"
fi

echo "== SSH auth check ${PROD_USER}@${PROD_HOST} =="
ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "printf 'ssh-ok host='; hostname; printf 'user='; whoami; printf 'app_dir='; test -d '${APP_DIR}' && echo '${APP_DIR}' || echo 'missing:${APP_DIR}'; cd '${APP_DIR}' 2>/dev/null && printf 'git_head=' && git rev-parse --short HEAD || true"
