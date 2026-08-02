#!/usr/bin/env bash

# Keep local qualification on the same toolchain used by remote V2 gates.
set -euo pipefail

readonly REQUIRED_NODE_VERSION="v22.23.1"
readonly REQUIRED_NPM_VERSION="10.9.8"

if [[ "$#" -ne 1 ]]; then
  printf '%s\n' 'exact_toolchain_target_required' >&2
  exit 64
fi

readonly TARGET_SCRIPT="$1"

case "${TARGET_SCRIPT}" in
  ci:production:exact | test:v2-m1-p0r:exact | test:v2-ops:exact) ;;
  *)
    printf '%s\n' 'exact_toolchain_target_not_allowed' >&2
    exit 64
    ;;
esac

is_exact_toolchain() {
  local node_path="$1"
  local npm_path="$2"
  local tool_dir
  local node_version
  local npm_version

  [[ -x "${node_path}" && -x "${npm_path}" ]] || return 1
  tool_dir="$(dirname "${node_path}")"
  node_version="$("${node_path}" --version 2>/dev/null || true)"
  npm_version="$(PATH="${tool_dir}:/usr/bin:/bin" "${npm_path}" --version 2>/dev/null || true)"

  [[ "${node_version}" == "${REQUIRED_NODE_VERSION}" && "${npm_version}" == "${REQUIRED_NPM_VERSION}" ]]
}

declare -a candidate_pairs=()

current_node="$(command -v node 2>/dev/null || true)"
current_npm="$(command -v npm 2>/dev/null || true)"
if [[ -n "${current_node}" && -n "${current_npm}" ]]; then
  candidate_pairs+=("${current_node}|${current_npm}")
fi

candidate_pairs+=(
  "${HOME}/.nvm/versions/node/v22.23.1/bin/node|${HOME}/.nvm/versions/node/v22.23.1/bin/npm"
  "${HOME}/.volta/bin/node|${HOME}/.volta/bin/npm"
)

for pair in "${candidate_pairs[@]}"; do
  node_path="${pair%%|*}"
  npm_path="${pair#*|}"
  if ! is_exact_toolchain "${node_path}" "${npm_path}"; then
    continue
  fi

  tool_dir="$(dirname "${node_path}")"
  printf 'market_radar_exact_toolchain_selected node=%s npm=%s target=%s\n' \
    "${REQUIRED_NODE_VERSION}" \
    "${REQUIRED_NPM_VERSION}" \
    "${TARGET_SCRIPT}"
  exec /usr/bin/env \
    PATH="${tool_dir}:${PATH}" \
    GOTOOLCHAIN="${GOTOOLCHAIN:-local}" \
    "${npm_path}" run "${TARGET_SCRIPT}"
done

printf 'exact_toolchain_unavailable required_node=%s required_npm=%s\n' \
  "${REQUIRED_NODE_VERSION}" \
  "${REQUIRED_NPM_VERSION}" >&2
exit 69
