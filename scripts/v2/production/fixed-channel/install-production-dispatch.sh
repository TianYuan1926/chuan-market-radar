#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-plan}"
CONFIRM_INSTALL="${CONFIRM_PRODUCTION_DISPATCH_INSTALL:-false}"
EXPECTED_SOURCE_SET_SHA256="${EXPECTED_DISPATCH_SOURCE_SET_SHA256:-}"
PUBLIC_KEY_SOURCE="${DISPATCH_PUBLIC_KEY_SOURCE:-}"
EXPECTED_PUBLIC_KEY_SHA256="${EXPECTED_DISPATCH_PUBLIC_KEY_SHA256:-}"
PRODUCTION_REPO="${PRODUCTION_REPO:-/home/ubuntu/apps/chuan-market-radar}"
RUN_AS_USER="${DISPATCH_RUN_AS_USER:-ubuntu}"
RUN_AS_GROUP="${DISPATCH_RUN_AS_GROUP:-ubuntu}"
INSTALL_ROOT="/opt/market-radar-production-dispatch"
STATE_ROOT="/var/lib/market-radar-ops/production-dispatch"
TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
CONFIG_PATH="/etc/market-radar-production-dispatch.json"
PUBLIC_KEY_PATH="${INSTALL_ROOT}/dispatch-public.pem"
DISPATCH_REF="refs/heads/production-dispatch"
DISPATCH_TRACKING_REF="refs/market-radar-dispatch/incoming"
SOURCE_REFS_CSV="${DISPATCH_SOURCE_REFS_CSV:-refs/heads/main,refs/heads/codex/market-radar-v2-implementation}"
STAGING_ROOTS_CSV="/home/ubuntu/.cache/market-radar-ops,/home/ubuntu/.cache/market-radar-v2"
SERVICE_NAME="market-radar-production-dispatch.service"
TIMER_NAME="market-radar-production-dispatch.timer"
AGENT_SOURCE="${SOURCE_ROOT}/production-dispatch.mjs"
SERVICE_SOURCE="${SOURCE_ROOT}/${SERVICE_NAME}"
TIMER_SOURCE="${SOURCE_ROOT}/${TIMER_NAME}"
README_SOURCE="${SOURCE_ROOT}/README.md"
INSTALLER_SOURCE="${SOURCE_ROOT}/install-production-dispatch.sh"
INSTALL_STARTED=false
INSTALL_SUCCEEDED=false

fail() {
  printf 'BLOCKED_PRODUCTION_DISPATCH_INSTALL %s\n' "$1" >&2
  exit 1
}

for path in \
  "${AGENT_SOURCE}" \
  "${SERVICE_SOURCE}" \
  "${TIMER_SOURCE}" \
  "${README_SOURCE}" \
  "${INSTALLER_SOURCE}"; do
  [[ -f "${path}" && ! -L "${path}" ]] || fail "source file is missing or unsafe"
done

source_set_sha256="$({
  sha256sum \
    "${AGENT_SOURCE}" \
    "${SERVICE_SOURCE}" \
    "${TIMER_SOURCE}" \
    "${README_SOURCE}" \
    "${INSTALLER_SOURCE}" \
    | awk '{print $1 "  " $2}' \
    | sed "s#${SOURCE_ROOT}/##"
} | sha256sum | awk '{print $1}')"

if [[ "${MODE}" == "plan" ]]; then
  jq -n \
    --arg configPath "${CONFIG_PATH}" \
    --arg dispatchRef "${DISPATCH_REF}" \
    --arg installRoot "${INSTALL_ROOT}" \
    --arg sourceSetSha256 "${source_set_sha256}" \
    --arg stateRoot "${STATE_ROOT}" \
    --arg timer "${TIMER_NAME}" \
    '{
      schemaVersion: "market-radar-production-dispatch-install-plan.v1",
      mode: "plan",
      productionMutation: false,
      opensInboundPort: false,
      transportsSecret: false,
      arbitraryCommandAllowed: false,
      configPath: $configPath,
      dispatchRef: $dispatchRef,
      installRoot: $installRoot,
      sourceSetSha256: $sourceSetSha256,
      stateRoot: $stateRoot,
      timer: $timer,
      pollSeconds: 20,
      nextStep: "bind exact source-set and public-key hashes before install"
    }'
  exit 0
fi

[[ "${MODE}" == "install" ]] || fail "mode must be plan or install"
[[ "${CONFIRM_INSTALL}" == "INSTALL_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH" ]] \
  || fail "exact install confirmation is required"
[[ "${EXPECTED_SOURCE_SET_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "${EXPECTED_SOURCE_SET_SHA256}" == "${source_set_sha256}" ]] \
  || fail "source-set checksum binding mismatch"
[[ "${PUBLIC_KEY_SOURCE}" == /* && -f "${PUBLIC_KEY_SOURCE}" && ! -L "${PUBLIC_KEY_SOURCE}" ]] \
  || fail "public key source must be an absolute regular file"
[[ "${EXPECTED_PUBLIC_KEY_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "$(sha256sum "${PUBLIC_KEY_SOURCE}" | awk '{print $1}')" == "${EXPECTED_PUBLIC_KEY_SHA256}" ]] \
  || fail "public key checksum binding mismatch"
grep -q '^-----BEGIN PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"
grep -q '^-----END PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"
[[ -d "${PRODUCTION_REPO}/.git" && ! -L "${PRODUCTION_REPO}" ]] \
  || fail "production repository is unavailable"

for command_name in git gzip id install jq node sha256sum sudo systemctl tar; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required command is unavailable: ${command_name}"
done
id "${RUN_AS_USER}" >/dev/null 2>&1 || fail "dispatch service user is unavailable"
sudo -n true >/dev/null 2>&1 || fail "passwordless sudo is unavailable"

remote_url="$(git -C "${PRODUCTION_REPO}" remote get-url origin)"
[[ -n "${remote_url}" && "${remote_url}" != http://*:*@* && "${remote_url}" != https://*:*@* ]] \
  || fail "repository remote is missing or embeds credentials"

IFS=',' read -r -a source_refs <<< "${SOURCE_REFS_CSV}"
IFS=',' read -r -a staging_roots <<< "${STAGING_ROOTS_CSV}"
(( ${#source_refs[@]} > 0 )) || fail "source ref allowlist is empty"
source_refs_json="$(printf '%s\n' "${source_refs[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')"
staging_roots_json="$(printf '%s\n' "${staging_roots[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')"

temporary_config="$(mktemp)"
cleanup() {
  local exit_status=$?
  rm -f "${temporary_config}"
  if [[ "${INSTALL_STARTED}" == "true" && "${INSTALL_SUCCEEDED}" != "true" ]]; then
    printf 'ROLLBACK_PRODUCTION_DISPATCH_PARTIAL_INSTALL\n' >&2
    sudo -n systemctl disable --now "${TIMER_NAME}" >/dev/null 2>&1 || true
    sudo -n rm -f \
      "/etc/systemd/system/${SERVICE_NAME}" \
      "/etc/systemd/system/${TIMER_NAME}" \
      "${CONFIG_PATH}" || true
    sudo -n rm -rf -- "${INSTALL_ROOT}" "${STATE_ROOT}" || true
    sudo -n systemctl daemon-reload >/dev/null 2>&1 || true
  fi
  trap - EXIT
  exit "${exit_status}"
}
trap cleanup EXIT
jq -n \
  --arg dispatchRef "${DISPATCH_REF}" \
  --arg dispatchTrackingRef "${DISPATCH_TRACKING_REF}" \
  --arg mirrorPath "${STATE_ROOT}/mirror.git" \
  --arg publicKeyPath "${PUBLIC_KEY_PATH}" \
  --arg remoteUrl "${remote_url}" \
  --arg stateRoot "${STATE_ROOT}" \
  --arg trustRoot "${TRUST_ROOT}" \
  --argjson sourceRefs "${source_refs_json}" \
  --argjson stagingRoots "${staging_roots_json}" \
  '{
    schemaVersion: "market-radar-production-dispatch-agent-config.v1",
    dispatchRef: $dispatchRef,
    dispatchTrackingRef: $dispatchTrackingRef,
    mirrorPath: $mirrorPath,
    publicKeyPath: $publicKeyPath,
    remoteUrl: $remoteUrl,
    sourceRefs: $sourceRefs,
    stagingRoots: $stagingRoots,
    stateRoot: $stateRoot,
    trustRoot: $trustRoot
  }' > "${temporary_config}"

node "${AGENT_SOURCE}" config-validate --config "${temporary_config}" >/dev/null \
  || fail "generated agent config failed policy validation"

for path in "${INSTALL_ROOT}" "${STATE_ROOT}"; do
  [[ ! -e "${path}" ]] || fail "install target already exists; upgrades require a separate exact package"
done
[[ ! -e "${CONFIG_PATH}" ]] || fail "agent config already exists"
[[ ! -e "/etc/systemd/system/${SERVICE_NAME}" \
  && ! -e "/etc/systemd/system/${TIMER_NAME}" ]] \
  || fail "systemd unit already exists"

INSTALL_STARTED=true
sudo -n install -d -m 0755 -o root -g root "${INSTALL_ROOT}"
sudo -n install -d -m 0700 -o "${RUN_AS_USER}" -g "${RUN_AS_GROUP}" "${STATE_ROOT}"
for path in "${staging_roots[@]}"; do
  sudo -n install -d -m 0700 -o "${RUN_AS_USER}" -g "${RUN_AS_GROUP}" "${path}"
done
sudo -n install -m 0755 -o root -g root "${AGENT_SOURCE}" "${INSTALL_ROOT}/production-dispatch.mjs"
sudo -n install -m 0644 -o root -g root "${PUBLIC_KEY_SOURCE}" "${PUBLIC_KEY_PATH}"
sudo -n install -m 0644 -o root -g root "${README_SOURCE}" "${INSTALL_ROOT}/README.md"
sudo -n install -m 0640 -o root -g "${RUN_AS_GROUP}" "${temporary_config}" "${CONFIG_PATH}"
sudo -n install -m 0644 -o root -g root "${SERVICE_SOURCE}" "/etc/systemd/system/${SERVICE_NAME}"
sudo -n install -m 0644 -o root -g root "${TIMER_SOURCE}" "/etc/systemd/system/${TIMER_NAME}"

sudo -n -u "${RUN_AS_USER}" /usr/bin/node "${INSTALL_ROOT}/production-dispatch.mjs" \
  agent-initialize --config "${CONFIG_PATH}"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "${TIMER_NAME}"
sudo -n systemctl is-enabled "${TIMER_NAME}" >/dev/null
sudo -n systemctl is-active "${TIMER_NAME}" >/dev/null

install_result="$(jq -n \
  --arg publicKeySha256 "${EXPECTED_PUBLIC_KEY_SHA256}" \
  --arg sourceSetSha256 "${source_set_sha256}" \
  --arg timer "${TIMER_NAME}" \
  '{
    schemaVersion: "market-radar-production-dispatch-install-result.v1",
    status: "PASS_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH_INSTALLED",
    publicKeySha256: $publicKeySha256,
    sourceSetSha256: $sourceSetSha256,
    timer: $timer,
    pollSeconds: 20,
    opensInboundPort: false,
    transportsSecret: false,
    arbitraryCommandAllowed: false
  }')"
INSTALL_SUCCEEDED=true
printf '%s\n' "${install_result}"
