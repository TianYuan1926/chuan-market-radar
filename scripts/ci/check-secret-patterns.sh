#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

patterns=(
  'sk-[A-Za-z0-9_-]{20,}'
  'BEGIN (RSA|OPENSSH|PRIVATE) KEY'
  'DATABASE_URL[[:space:]]*=[[:space:]]*(postgres|mysql|redis|http)'
  'CRON_SECRET[[:space:]]*=[[:space:]]*[A-Za-z0-9_./+=-]{12,}'
  'API_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9_./+=-]{16,}'
  'TOKEN[[:space:]]*=[[:space:]]*[A-Za-z0-9_./+=-]{20,}'
  'COOKIE[[:space:]]*=[[:space:]]*[^[][^[:space:]]{20,}'
  'SESSION[[:space:]]*=[[:space:]]*[^[][^[:space:]]{20,}'
  'AGE-SECRET-KEY-1[0-9A-Z]{20,}'
)

raw_file="$(mktemp)"
tmp_file="$(mktemp)"
sensitive_destination_file="$(mktemp)"
trap 'rm -f "${raw_file}" "${tmp_file}" "${sensitive_destination_file}"' EXIT

for pattern in "${patterns[@]}"; do
  git grep -nIE "${pattern}" -- \
    ':!.env.example' \
    ':!scripts/verify/security-check.sh' \
    ':!scripts/ci/check-secret-patterns.sh' \
    ':!package-lock.json' \
    ':!pnpm-lock.yaml' \
    ':!yarn.lock' >> "${raw_file}" || true
done

grep -vEi '\[REDACTED\]|REDACTED|example|placeholder|CHANGE_ME|changeme|dummy|your_|your-|<[^>]+>|示例|占位|禁止|不得|不输出|不要输出|do not|should not|not a real|fake value' "${raw_file}" \
  | grep -vEi 'regex: .*(BEGIN|PRIVATE KEY)|SECRET_VALUE_RE|BEGIN \(RSA\|OPENSSH\|PRIVATE\) KEY' \
  > "${tmp_file}" || true

if [[ -s "${tmp_file}" ]]; then
  echo "Potential secret patterns found in tracked source files:"
  cat "${tmp_file}"
  exit 1
fi

git grep -nIE 'market-radar-v2-p0r-[0-9]{5,20}' -- \
  ':!scripts/ci/check-secret-patterns.sh' > "${sensitive_destination_file}" || true

if [[ -s "${sensitive_destination_file}" ]]; then
  echo "Production COS destination identifiers must remain outside tracked source:"
  cat "${sensitive_destination_file}"
  exit 1
fi

echo "Tracked source secret pattern check passed."
