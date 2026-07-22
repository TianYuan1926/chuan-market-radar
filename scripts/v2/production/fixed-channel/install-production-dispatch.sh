#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-plan}"
CONFIRM_INSTALL="${CONFIRM_PRODUCTION_DISPATCH_INSTALL:-false}"
EXPECTED_SOURCE_SET_SHA256="${EXPECTED_DISPATCH_SOURCE_SET_SHA256:-}"
PUBLIC_KEY_SOURCE="${DISPATCH_PUBLIC_KEY_SOURCE:-}"
EXPECTED_PUBLIC_KEY_SHA256="${EXPECTED_DISPATCH_PUBLIC_KEY_SHA256:-}"
EXPECTED_NODE_ARCHIVE_SHA256="${EXPECTED_DISPATCH_NODE_ARCHIVE_SHA256:-}"
EXPECTED_NODE_SHA256="${EXPECTED_DISPATCH_NODE_SHA256:-}"
EXPECTED_NODE_LICENSE_SHA256="${EXPECTED_DISPATCH_NODE_LICENSE_SHA256:-}"
EXPECTED_DEPLOY_PUBLIC_KEY_SHA256="${EXPECTED_DISPATCH_DEPLOY_PUBLIC_KEY_SHA256:-}"
EXPECTED_KNOWN_HOSTS_SHA256="${EXPECTED_DISPATCH_KNOWN_HOSTS_SHA256:-}"
DEPLOY_KEY_SOURCE="${DISPATCH_DEPLOY_KEY_SOURCE:-}"
DISPATCH_REMOTE_URL="${DISPATCH_REMOTE_URL:-}"
PRODUCTION_REPO="${PRODUCTION_REPO:-/home/ubuntu/apps/chuan-market-radar}"
RUN_AS_USER="${DISPATCH_RUN_AS_USER:-ubuntu}"
RUN_AS_GROUP="${DISPATCH_RUN_AS_GROUP:-ubuntu}"
INSTALL_ROOT="/opt/market-radar-production-dispatch"
STATE_ROOT="/var/lib/market-radar-production-dispatch"
TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
CONFIG_PATH="/etc/market-radar-production-dispatch.json"
PUBLIC_KEY_PATH="${INSTALL_ROOT}/dispatch-public.pem"
NODE_BINARY_PATH="${INSTALL_ROOT}/runtime/node"
NODE_LICENSE_PATH="${INSTALL_ROOT}/runtime/LICENSE"
DEPLOY_KEY_PATH="${INSTALL_ROOT}/github-deploy-key"
KNOWN_HOSTS_PATH="${INSTALL_ROOT}/github-known-hosts"
GIT_SSH_WRAPPER_PATH="${INSTALL_ROOT}/git-ssh-dispatch.sh"
PINNED_NODE_VERSION="v24.18.0"
PINNED_NODE_ARCHIVE_SHA256="55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742"
PINNED_NODE_BINARY_SHA256="41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c"
PINNED_NODE_LICENSE_SHA256="148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5"
NODE_ARCHIVE_NAME="node-v24.18.0-linux-x64.tar.xz"
NODE_ARCHIVE_DIRECTORY="node-v24.18.0-linux-x64"
NODE_ARCHIVE_URL="https://nodejs.org/dist/v24.18.0/${NODE_ARCHIVE_NAME}"
PINNED_DISPATCH_REMOTE_URL="git@github.com:TianYuan1926/chuan-market-radar.git"
PINNED_PRODUCTION_ORIGIN_HTTPS="https://github.com/TianYuan1926/chuan-market-radar.git"
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
LAUNCHER_SOURCE="${SOURCE_ROOT}/install-production-dispatch-launcher.sh"
KNOWN_HOSTS_SOURCE="${SOURCE_ROOT}/github-known-hosts"
GIT_SSH_WRAPPER_SOURCE="${SOURCE_ROOT}/git-ssh-dispatch.sh"
INSTALL_STARTED=false
INSTALL_SUCCEEDED=false
temporary_config=""
runtime_download_root=""

fail() {
  printf 'BLOCKED_PRODUCTION_DISPATCH_INSTALL %s\n' "$1" >&2
  exit 1
}

cleanup() {
  local exit_status=$?
  [[ -z "${temporary_config}" ]] || rm -f "${temporary_config}"
  [[ -z "${runtime_download_root}" ]] || rm -rf -- "${runtime_download_root}"
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

for path in \
  "${AGENT_SOURCE}" \
  "${SERVICE_SOURCE}" \
  "${TIMER_SOURCE}" \
  "${README_SOURCE}" \
  "${INSTALLER_SOURCE}" \
  "${LAUNCHER_SOURCE}" \
  "${KNOWN_HOSTS_SOURCE}" \
  "${GIT_SSH_WRAPPER_SOURCE}"; do
  [[ -f "${path}" && ! -L "${path}" ]] || fail "source file is missing or unsafe"
done

source_set_sha256="$({
  sha256sum \
    "${AGENT_SOURCE}" \
    "${SERVICE_SOURCE}" \
    "${TIMER_SOURCE}" \
    "${README_SOURCE}" \
    "${INSTALLER_SOURCE}" \
    "${LAUNCHER_SOURCE}" \
    "${KNOWN_HOSTS_SOURCE}" \
    "${GIT_SSH_WRAPPER_SOURCE}" \
    | awk '{print $1 "  " $2}' \
    | sed "s#${SOURCE_ROOT}/##"
} | sha256sum | awk '{print $1}')"

if [[ "${MODE}" == "plan" ]]; then
  jq -n \
    --arg configPath "${CONFIG_PATH}" \
    --arg dispatchRef "${DISPATCH_REF}" \
    --arg installRoot "${INSTALL_ROOT}" \
    --arg nodeArchiveSha256 "${PINNED_NODE_ARCHIVE_SHA256}" \
    --arg nodeBinaryPath "${NODE_BINARY_PATH}" \
    --arg nodeBinarySha256 "${PINNED_NODE_BINARY_SHA256}" \
    --arg nodeLicenseSha256 "${PINNED_NODE_LICENSE_SHA256}" \
    --arg nodeVersion "${PINNED_NODE_VERSION}" \
    --arg sourceSetSha256 "${source_set_sha256}" \
    --arg stateRoot "${STATE_ROOT}" \
    --arg timer "${TIMER_NAME}" \
    '{
      schemaVersion: "market-radar-production-dispatch-install-plan.v1",
      mode: "plan",
      productionMutation: false,
      opensInboundPort: false,
      transportsSecret: false,
      credentialBootstrapRequired: true,
      credentialIncludedInArchive: false,
      credentialScope: "single_repository_read_only_deploy_key",
      dispatchRemoteUrl: "git@github.com:TianYuan1926/chuan-market-radar.git",
      arbitraryCommandAllowed: false,
      configPath: $configPath,
      dispatchRef: $dispatchRef,
      installRoot: $installRoot,
      hostNodeRequired: false,
      nodeRuntime: {
        distribution: "official_nodejs_linux_x64",
        version: $nodeVersion,
        archiveSha256: $nodeArchiveSha256,
        binaryPath: $nodeBinaryPath,
        binarySha256: $nodeBinarySha256,
        licenseSha256: $nodeLicenseSha256,
        globalInstallAllowed: false
      },
      sourceSetSha256: $sourceSetSha256,
      stateRoot: $stateRoot,
      timer: $timer,
      pollSeconds: 20,
      nextStep: "bind exact source-set, public-key, and pinned Node runtime hashes before install"
    }'
  exit 0
fi

[[ "${MODE}" == "install" ]] || fail "mode must be plan or install"
[[ "${CONFIRM_INSTALL}" == "INSTALL_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH" ]] \
  || fail "exact install confirmation is required"
for command_name in curl git gzip id install jq sha256sum ssh ssh-keygen stat sudo systemctl tar uname xz; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required command is unavailable: ${command_name}"
done
[[ "${EXPECTED_SOURCE_SET_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "${EXPECTED_SOURCE_SET_SHA256}" == "${source_set_sha256}" ]] \
  || fail "source-set checksum binding mismatch"
[[ "${PUBLIC_KEY_SOURCE}" == /* && -f "${PUBLIC_KEY_SOURCE}" && ! -L "${PUBLIC_KEY_SOURCE}" ]] \
  || fail "public key source must be an absolute regular file"
[[ "${EXPECTED_PUBLIC_KEY_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "$(sha256sum "${PUBLIC_KEY_SOURCE}" | awk '{print $1}')" == "${EXPECTED_PUBLIC_KEY_SHA256}" ]] \
  || fail "public key checksum binding mismatch"
[[ "${EXPECTED_NODE_SHA256}" == "${PINNED_NODE_BINARY_SHA256}" \
  && "${EXPECTED_NODE_LICENSE_SHA256}" == "${PINNED_NODE_LICENSE_SHA256}" \
  && "${EXPECTED_NODE_ARCHIVE_SHA256}" == "${PINNED_NODE_ARCHIVE_SHA256}" ]] \
  || fail "Node runtime approval binding mismatch"
[[ "${DISPATCH_REMOTE_URL}" == "${PINNED_DISPATCH_REMOTE_URL}" ]] \
  || fail "dispatch remote binding mismatch"
[[ "${EXPECTED_KNOWN_HOSTS_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "$(sha256sum "${KNOWN_HOSTS_SOURCE}" | awk '{print $1}')" == "${EXPECTED_KNOWN_HOSTS_SHA256}" ]] \
  || fail "GitHub known-hosts checksum binding mismatch"
[[ "${DEPLOY_KEY_SOURCE}" == /* && -f "${DEPLOY_KEY_SOURCE}" && ! -L "${DEPLOY_KEY_SOURCE}" ]] \
  || fail "deploy key source must be an absolute regular file"
[[ "${DEPLOY_KEY_SOURCE}" =~ ^/[A-Za-z0-9._/-]+$ \
  && "${KNOWN_HOSTS_SOURCE}" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || fail "credential source paths contain unsupported characters"
[[ "$(stat -c '%a' "${DEPLOY_KEY_SOURCE}")" == "600" \
  && "$(stat -c '%u' "${DEPLOY_KEY_SOURCE}")" == "$(id -u)" ]] \
  || fail "deploy key source must be mode 600 and owned by the installer user"
deploy_public_key="$(ssh-keygen -y -f "${DEPLOY_KEY_SOURCE}" 2>/dev/null)" \
  || fail "deploy key source is not a valid private key"
read -r deploy_key_type deploy_key_body _ <<< "${deploy_public_key}" \
  || fail "deploy key source is not a valid private key"
[[ "${deploy_key_type}" == "ssh-ed25519" && -n "${deploy_key_body}" ]] \
  || fail "deploy key must be Ed25519"
canonical_deploy_public_key="${deploy_key_type} ${deploy_key_body}"
deploy_public_key_sha256="$(printf '%s\n' "${canonical_deploy_public_key}" | sha256sum | awk '{print $1}')"
[[ "${EXPECTED_DEPLOY_PUBLIC_KEY_SHA256}" =~ ^[a-f0-9]{64}$ \
  && "${deploy_public_key_sha256}" == "${EXPECTED_DEPLOY_PUBLIC_KEY_SHA256}" ]] \
  || fail "deploy public key checksum binding mismatch"
[[ "$(uname -m)" == "x86_64" ]] || fail "pinned Node runtime requires x86_64"
grep -q '^-----BEGIN PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"
grep -q '^-----END PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"
[[ -d "${PRODUCTION_REPO}/.git" && ! -L "${PRODUCTION_REPO}" ]] \
  || fail "production repository is unavailable"

id "${RUN_AS_USER}" >/dev/null 2>&1 || fail "dispatch service user is unavailable"
sudo -n true >/dev/null 2>&1 || fail "passwordless sudo is unavailable"

production_remote_url="$(git -C "${PRODUCTION_REPO}" remote get-url origin)"
[[ "${production_remote_url}" == "${PINNED_PRODUCTION_ORIGIN_HTTPS}" \
  || "${production_remote_url}" == "${PINNED_DISPATCH_REMOTE_URL}" ]] \
  || fail "production repository origin does not match the pinned repository"
source_git_ssh_command="/usr/bin/ssh -F /dev/null -i ${DEPLOY_KEY_SOURCE} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${KNOWN_HOSTS_SOURCE}"
remote_probe="$(env GIT_SSH_COMMAND="${source_git_ssh_command}" \
  git ls-remote --exit-code --heads "${DISPATCH_REMOTE_URL}" refs/heads/main 2>/dev/null)" \
  || fail "read-only deploy key cannot read the pinned private repository"
read -r remote_main_commit remote_main_ref <<< "${remote_probe}"
[[ "${remote_main_commit}" =~ ^[a-f0-9]{40}$ && "${remote_main_ref}" == "refs/heads/main" ]] \
  || fail "pinned private repository main ref is unavailable"

runtime_download_root="$(mktemp -d)"
node_archive_path="${runtime_download_root}/${NODE_ARCHIVE_NAME}"
node_extract_root="${runtime_download_root}/extracted"
mkdir -p "${node_extract_root}"
curl --fail --location --proto '=https' --retry 3 --show-error --silent --tlsv1.2 \
  --output "${node_archive_path}" "${NODE_ARCHIVE_URL}" \
  || fail "official Node runtime download failed"
printf '%s  %s\n' "${PINNED_NODE_ARCHIVE_SHA256}" "${node_archive_path}" \
  | sha256sum -c - >/dev/null \
  || fail "Node runtime archive checksum mismatch"
tar -xJf "${node_archive_path}" -C "${node_extract_root}" --strip-components=1 \
  "${NODE_ARCHIVE_DIRECTORY}/bin/node" \
  "${NODE_ARCHIVE_DIRECTORY}/LICENSE" \
  || fail "Node runtime extraction failed"
NODE_SOURCE="${node_extract_root}/bin/node"
NODE_LICENSE_SOURCE="${node_extract_root}/LICENSE"
[[ -f "${NODE_SOURCE}" && ! -L "${NODE_SOURCE}" && -x "${NODE_SOURCE}" \
  && "$(sha256sum "${NODE_SOURCE}" | awk '{print $1}')" == "${PINNED_NODE_BINARY_SHA256}" ]] \
  || fail "Node runtime binary checksum mismatch"
[[ -f "${NODE_LICENSE_SOURCE}" && ! -L "${NODE_LICENSE_SOURCE}" \
  && "$(sha256sum "${NODE_LICENSE_SOURCE}" | awk '{print $1}')" == "${PINNED_NODE_LICENSE_SHA256}" ]] \
  || fail "Node runtime license checksum mismatch"
[[ "$("${NODE_SOURCE}" --version)" == "${PINNED_NODE_VERSION}" ]] \
  || fail "Node runtime version binding mismatch"

IFS=',' read -r -a source_refs <<< "${SOURCE_REFS_CSV}"
IFS=',' read -r -a staging_roots <<< "${STAGING_ROOTS_CSV}"
(( ${#source_refs[@]} > 0 )) || fail "source ref allowlist is empty"
source_refs_json="$(printf '%s\n' "${source_refs[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')"
staging_roots_json="$(printf '%s\n' "${staging_roots[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')"

temporary_config="$(mktemp)"
jq -n \
  --arg dispatchRef "${DISPATCH_REF}" \
  --arg dispatchTrackingRef "${DISPATCH_TRACKING_REF}" \
  --arg mirrorPath "${STATE_ROOT}/mirror.git" \
  --arg publicKeyPath "${PUBLIC_KEY_PATH}" \
  --arg remoteUrl "${DISPATCH_REMOTE_URL}" \
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

"${NODE_SOURCE}" --jitless "${AGENT_SOURCE}" config-validate --config "${temporary_config}" >/dev/null \
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
sudo -n install -d -m 0755 -o root -g root "${INSTALL_ROOT}/runtime"
sudo -n install -d -m 0700 -o "${RUN_AS_USER}" -g "${RUN_AS_GROUP}" "${STATE_ROOT}"
for path in "${staging_roots[@]}"; do
  sudo -n install -d -m 0700 -o "${RUN_AS_USER}" -g "${RUN_AS_GROUP}" "${path}"
done
sudo -n install -m 0755 -o root -g root "${AGENT_SOURCE}" "${INSTALL_ROOT}/production-dispatch.mjs"
sudo -n install -m 0755 -o root -g root "${GIT_SSH_WRAPPER_SOURCE}" "${GIT_SSH_WRAPPER_PATH}"
sudo -n install -m 0755 -o root -g root "${NODE_SOURCE}" "${NODE_BINARY_PATH}"
sudo -n install -m 0644 -o root -g root "${NODE_LICENSE_SOURCE}" "${NODE_LICENSE_PATH}"
sudo -n install -m 0644 -o root -g root "${PUBLIC_KEY_SOURCE}" "${PUBLIC_KEY_PATH}"
sudo -n install -m 0400 -o "${RUN_AS_USER}" -g "${RUN_AS_GROUP}" "${DEPLOY_KEY_SOURCE}" "${DEPLOY_KEY_PATH}"
sudo -n install -m 0644 -o root -g root "${KNOWN_HOSTS_SOURCE}" "${KNOWN_HOSTS_PATH}"
sudo -n install -m 0644 -o root -g root "${README_SOURCE}" "${INSTALL_ROOT}/README.md"
sudo -n install -m 0640 -o root -g "${RUN_AS_GROUP}" "${temporary_config}" "${CONFIG_PATH}"
sudo -n install -m 0644 -o root -g root "${SERVICE_SOURCE}" "/etc/systemd/system/${SERVICE_NAME}"
sudo -n install -m 0644 -o root -g root "${TIMER_SOURCE}" "/etc/systemd/system/${TIMER_NAME}"

sudo -n -u "${RUN_AS_USER}" env GIT_SSH_COMMAND="${GIT_SSH_WRAPPER_PATH}" \
  "${NODE_BINARY_PATH}" --jitless "${INSTALL_ROOT}/production-dispatch.mjs" \
  agent-initialize --config "${CONFIG_PATH}"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "${TIMER_NAME}"
sudo -n systemctl is-enabled "${TIMER_NAME}" >/dev/null
sudo -n systemctl is-active "${TIMER_NAME}" >/dev/null

install_result="$(jq -n \
  --arg nodeBinarySha256 "${PINNED_NODE_BINARY_SHA256}" \
  --arg nodeVersion "${PINNED_NODE_VERSION}" \
  --arg deployPublicKeySha256 "${deploy_public_key_sha256}" \
  --arg publicKeySha256 "${EXPECTED_PUBLIC_KEY_SHA256}" \
  --arg sourceSetSha256 "${source_set_sha256}" \
  --arg timer "${TIMER_NAME}" \
  '{
    schemaVersion: "market-radar-production-dispatch-install-result.v1",
    status: "PASS_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH_INSTALLED",
    nodeRuntime: {
      version: $nodeVersion,
      binarySha256: $nodeBinarySha256,
      hostNodeRequired: false
    },
    repositoryAccess: {
      authentication: "github_read_only_deploy_key",
      deployPublicKeySha256: $deployPublicKeySha256,
      writeAccessAllowed: false
    },
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
