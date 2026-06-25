#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_FAIL_ON="${AUDIT_FAIL_ON:-high}"
TMP_JSON="$(mktemp)"

cleanup() {
  rm -f "${TMP_JSON}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

echo "== Dependency audit =="
echo "fail-on=${AUDIT_FAIL_ON}"

set +e
npm audit --omit=dev --json > "${TMP_JSON}" 2>/tmp/chuan-npm-audit-stderr.txt
AUDIT_CODE=$?
set -e

node - "${TMP_JSON}" "${AUDIT_FAIL_ON}" "${AUDIT_CODE}" <<'NODE'
const fs = require("node:fs");

const file = process.argv[2];
const failOn = process.argv[3];
const auditCode = Number(process.argv[4] || 0);
const severityOrder = ["info", "low", "moderate", "high", "critical"];

let payload = {};
try {
  payload = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error("npm audit did not return valid JSON");
  process.exit(auditCode || 1);
}

const counts = payload.metadata?.vulnerabilities || {};
const normalized = {
  info: Number(counts.info || 0),
  low: Number(counts.low || 0),
  moderate: Number(counts.moderate || 0),
  high: Number(counts.high || 0),
  critical: Number(counts.critical || 0),
  total: Number(counts.total || 0),
};
console.log(JSON.stringify(normalized, null, 2));

const failIndex = severityOrder.indexOf(failOn);
const shouldFail = severityOrder
  .slice(Math.max(0, failIndex))
  .some((severity) => normalized[severity] > 0);

if (shouldFail) {
  console.error(`Dependency audit failed at severity >= ${failOn}.`);
  process.exit(1);
}

if (normalized.total > 0) {
  console.warn("Dependency audit has non-blocking findings. Review before major release.");
}
NODE

