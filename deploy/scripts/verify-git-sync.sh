#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_NAME="${REMOTE_NAME:-origin}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"
ALLOW_UNTRACKED="${ALLOW_UNTRACKED:-.env.production}"

cd "${ROOT_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not installed or not in PATH." >&2
  exit 1
fi

local_head="$(git rev-parse HEAD)"
remote_head=""
last_remote_error=""
remote_attempts="${GIT_REMOTE_ATTEMPTS:-2}"
remote_timeout_seconds="${GIT_REMOTE_TIMEOUT_SECONDS:-15}"

run_git_ls_remote() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${remote_timeout_seconds}" "${REMOTE_NAME}" "${REMOTE_BRANCH}" <<'PY'
import os
import subprocess
import sys

timeout = int(sys.argv[1])
remote = sys.argv[2]
branch = sys.argv[3]
env = os.environ.copy()
env["GIT_TERMINAL_PROMPT"] = "0"
cmd = [
    "git",
    "-c",
    f"http.version={env.get('GIT_HTTP_VERSION', 'HTTP/1.1')}",
    "-c",
    "http.lowSpeedLimit=1",
    "-c",
    f"http.lowSpeedTime={env.get('GIT_LOW_SPEED_TIME', '20')}",
    "ls-remote",
    remote,
    f"refs/heads/{branch}",
]

try:
    result = subprocess.run(
        cmd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
except subprocess.TimeoutExpired:
    print(f"git ls-remote timed out after {timeout}s", file=sys.stderr)
    raise SystemExit(124)

sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
raise SystemExit(result.returncode)
PY
    return "$?"
  fi

  GIT_TERMINAL_PROMPT=0 git \
    -c http.version="${GIT_HTTP_VERSION:-HTTP/1.1}" \
    -c http.lowSpeedLimit=1 \
    -c http.lowSpeedTime="${GIT_LOW_SPEED_TIME:-20}" \
    ls-remote "${REMOTE_NAME}" "refs/heads/${REMOTE_BRANCH}"
}

for (( attempt = 1; attempt <= remote_attempts; attempt++ )); do
  if remote_output="$(run_git_ls_remote)"; then
    remote_head="$(awk '{print $1}' <<< "${remote_output}")"
    break
  fi
  last_remote_error="${remote_output}"
  sleep "${attempt}"
done

if [[ -z "${remote_head}" ]]; then
  echo "ERROR: cannot read ${REMOTE_NAME}/${REMOTE_BRANCH}." >&2
  if [[ -n "${last_remote_error}" ]]; then
    echo "${last_remote_error}" >&2
  fi
  exit 1
fi

if [[ "${local_head}" != "${remote_head}" ]]; then
  echo "ERROR: local HEAD does not match ${REMOTE_NAME}/${REMOTE_BRANCH}." >&2
  echo "local=${local_head}" >&2
  echo "remote=${remote_head}" >&2
  exit 1
fi

status_lines="$(git status --porcelain)"
if [[ -n "${status_lines}" ]]; then
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    path="${line:3}"
    if [[ "${line:0:2}" == "??" && "${path}" == "${ALLOW_UNTRACKED}" ]]; then
      continue
    fi
    echo "ERROR: unexpected git working tree change: ${line}" >&2
    exit 1
  done <<< "${status_lines}"
fi

echo "git sync ok: ${REMOTE_NAME}/${REMOTE_BRANCH} ${local_head:0:12}"
