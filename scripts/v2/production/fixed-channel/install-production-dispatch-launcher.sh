#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-verify}"
FACTS_PATH="${SOURCE_ROOT}/INSTALL_FACTS.json"
MANIFEST_PATH="${SOURCE_ROOT}/SHA256SUMS"
PUBLIC_KEY_SOURCE="${SOURCE_ROOT}/ed25519-public.pem"
INSTALLER_SOURCE="${SOURCE_ROOT}/install-production-dispatch.sh"

fail() {
  printf 'BLOCKED_PRODUCTION_DISPATCH_LAUNCHER %s\n' "$1" >&2
  exit 1
}

[[ "${MODE}" == "verify" || "${MODE}" == "install" ]] \
  || fail "mode must be verify or install"

for command_name in awk bash env jq sha256sum sort; do
  command -v "${command_name}" >/dev/null 2>&1 \
    || fail "required command is unavailable: ${command_name}"
done

for path in \
  "${FACTS_PATH}" \
  "${MANIFEST_PATH}" \
  "${PUBLIC_KEY_SOURCE}" \
  "${INSTALLER_SOURCE}"; do
  [[ -f "${path}" && ! -L "${path}" ]] \
    || fail "required package file is missing or unsafe"
done

expected_manifest_names="$(printf '%s\n' \
  INSTALL_FACTS.json \
  README.md \
  ed25519-public.pem \
  install-production-dispatch-launcher.sh \
  install-production-dispatch.sh \
  market-radar-production-dispatch.service \
  market-radar-production-dispatch.timer \
  production-dispatch.mjs \
  | LC_ALL=C sort)"
actual_manifest_names="$(awk '
  NF == 2 && $1 ~ /^[a-f0-9]{64}$/ { print $2; next }
  { exit 2 }
' "${MANIFEST_PATH}" | LC_ALL=C sort)" \
  || fail "package checksum manifest is malformed"
[[ "${actual_manifest_names}" == "${expected_manifest_names}" ]] \
  || fail "package checksum manifest file set mismatch"

(
  cd "${SOURCE_ROOT}"
  sha256sum -c SHA256SUMS >/dev/null
) || fail "package checksum verification failed"

jq -e '
  (keys | sort) == [
    "generatedAt",
    "hostNodeRequired",
    "nodeRuntime",
    "productionMutationPrepared",
    "publicKeySha256",
    "schemaVersion",
    "sourceCommit",
    "sourceRef",
    "sourceSetSha256",
    "transportContainsSecrets"
  ]
  and .schemaVersion == "market-radar-production-dispatch-install-facts.v2"
  and (.generatedAt | type == "string")
  and (.sourceCommit | type == "string" and test("^[a-f0-9]{40}$"))
  and (.sourceRef == "refs/heads/main"
    or .sourceRef == "refs/heads/codex/market-radar-v2-implementation")
  and (.sourceSetSha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and (.publicKeySha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and .transportContainsSecrets == false
  and .productionMutationPrepared == false
  and .hostNodeRequired == false
  and (.nodeRuntime | keys | sort) == [
    "archiveSha256",
    "binarySha256",
    "distribution",
    "globalInstallAllowed",
    "licenseSha256",
    "provisioning",
    "version"
  ]
  and .nodeRuntime.provisioning == "pinned_official_https_download"
  and .nodeRuntime.distribution == "official_nodejs_linux_x64"
  and .nodeRuntime.version == "v24.18.0"
  and (.nodeRuntime.archiveSha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and (.nodeRuntime.binarySha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and (.nodeRuntime.licenseSha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and .nodeRuntime.globalInstallAllowed == false
' "${FACTS_PATH}" >/dev/null || fail "install facts contract is invalid"

source_set_sha256="$(jq -er '.sourceSetSha256' "${FACTS_PATH}")"
public_key_sha256="$(jq -er '.publicKeySha256' "${FACTS_PATH}")"
node_archive_sha256="$(jq -er '.nodeRuntime.archiveSha256' "${FACTS_PATH}")"
node_binary_sha256="$(jq -er '.nodeRuntime.binarySha256' "${FACTS_PATH}")"
node_license_sha256="$(jq -er '.nodeRuntime.licenseSha256' "${FACTS_PATH}")"
[[ "$(sha256sum "${PUBLIC_KEY_SOURCE}" | awk '{print $1}')" == "${public_key_sha256}" ]] \
  || fail "public key checksum does not match install facts"
grep -q '^-----BEGIN PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"
grep -q '^-----END PUBLIC KEY-----$' "${PUBLIC_KEY_SOURCE}" \
  || fail "public key format is invalid"

install_plan="$(bash "${INSTALLER_SOURCE}" plan)" \
  || fail "installer plan could not be generated"
jq -e \
  --arg sourceSetSha256 "${source_set_sha256}" \
  --arg publicKeySha256 "${public_key_sha256}" \
  --arg nodeArchiveSha256 "${node_archive_sha256}" \
  --arg nodeBinarySha256 "${node_binary_sha256}" \
  --arg nodeLicenseSha256 "${node_license_sha256}" \
  '
    .schemaVersion == "market-radar-production-dispatch-install-plan.v1"
    and .mode == "plan"
    and .productionMutation == false
    and .opensInboundPort == false
    and .transportsSecret == false
    and .arbitraryCommandAllowed == false
    and .hostNodeRequired == false
    and .sourceSetSha256 == $sourceSetSha256
    and .nodeRuntime.archiveSha256 == $nodeArchiveSha256
    and .nodeRuntime.binarySha256 == $nodeBinarySha256
    and .nodeRuntime.licenseSha256 == $nodeLicenseSha256
    and .nodeRuntime.globalInstallAllowed == false
    and ($publicKeySha256 | test("^[a-f0-9]{64}$"))
  ' <<< "${install_plan}" >/dev/null \
  || fail "install plan does not match approved package facts"

if [[ "${MODE}" == "verify" ]]; then
  jq -n \
    --arg publicKeySha256 "${public_key_sha256}" \
    --arg sourceSetSha256 "${source_set_sha256}" \
    '{
      schemaVersion: "market-radar-production-dispatch-launcher-result.v1",
      status: "PASS_EXACT_INSTALL_PACKAGE_VERIFIED_NO_MUTATION",
      mode: "verify",
      productionMutation: false,
      publicKeySha256: $publicKeySha256,
      sourceSetSha256: $sourceSetSha256
    }'
  exit 0
fi

exec env \
  DISPATCH_PUBLIC_KEY_SOURCE="${PUBLIC_KEY_SOURCE}" \
  EXPECTED_DISPATCH_PUBLIC_KEY_SHA256="${public_key_sha256}" \
  EXPECTED_DISPATCH_SOURCE_SET_SHA256="${source_set_sha256}" \
  EXPECTED_DISPATCH_NODE_ARCHIVE_SHA256="${node_archive_sha256}" \
  EXPECTED_DISPATCH_NODE_SHA256="${node_binary_sha256}" \
  EXPECTED_DISPATCH_NODE_LICENSE_SHA256="${node_license_sha256}" \
  CONFIRM_PRODUCTION_DISPATCH_INSTALL=INSTALL_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH \
  bash "${INSTALLER_SOURCE}" install
