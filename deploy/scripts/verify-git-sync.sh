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
remote_timeout_seconds="${GIT_REMOTE_TIMEOUT_SECONDS:-25}"

run_git_ls_remote() {
  local output_file status_file pid waited status
  output_file="$(mktemp)"
  status_file="$(mktemp)"

  (
    GIT_TERMINAL_PROMPT=0 git \
      -c http.version="${GIT_HTTP_VERSION:-HTTP/1.1}" \
      -c http.lowSpeedLimit=1 \
      -c http.lowSpeedTime="${GIT_LOW_SPEED_TIME:-20}" \
      ls-remote "${REMOTE_NAME}" "refs/heads/${REMOTE_BRANCH}" >"${output_file}" 2>&1
    echo "$?" >"${status_file}"
  ) &
  pid="$!"
  waited=0

  while kill -0 "${pid}" >/dev/null 2>&1; do
    if (( waited >= remote_timeout_seconds )); then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
      echo "git ls-remote timed out after ${remote_timeout_seconds}s"
      cat "${output_file}"
      rm -f "${output_file}" "${status_file}"
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done

  wait "${pid}" >/dev/null 2>&1 || true
  status="$(cat "${status_file}" 2>/dev/null || echo 1)"
  cat "${output_file}"
  rm -f "${output_file}" "${status_file}"
  return "${status}"
}

for attempt in 1 2 3; do
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
