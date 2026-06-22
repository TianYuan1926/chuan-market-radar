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
remote_head="$(git ls-remote "${REMOTE_NAME}" "refs/heads/${REMOTE_BRANCH}" | awk '{print $1}')"

if [[ -z "${remote_head}" ]]; then
  echo "ERROR: cannot read ${REMOTE_NAME}/${REMOTE_BRANCH}." >&2
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
