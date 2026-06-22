#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"

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

echo "== TCP check ${PROD_HOST}:${SSH_PORT} =="
python3 - "${PROD_HOST}" "${SSH_PORT}" "${SSH_CONNECT_TIMEOUT}" <<'PY'
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

echo "== SSH auth check ${PROD_USER}@${PROD_HOST} =="
ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "printf 'ssh-ok host='; hostname; printf 'user='; whoami; printf 'app_dir='; test -d '${APP_DIR}' && echo '${APP_DIR}' || echo 'missing:${APP_DIR}'; cd '${APP_DIR}' 2>/dev/null && printf 'git_head=' && git rev-parse --short HEAD || true"

