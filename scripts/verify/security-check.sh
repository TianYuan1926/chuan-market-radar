#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

echo "== Security check: tracked env files =="
if git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '^\.env\.example$'; then
  echo "ERROR: tracked real env file detected." >&2
  exit 1
fi

echo "== Security check: high-risk tracked artifacts =="
if git ls-files | grep -E '(^|/)(audit-round-|audit-full-handoff|audit-handoff|api-samples|raw|logs|node_modules|\.next|dist|build)(/|$)|\.zip$|\.raw\.log$|\.exitcode$'; then
  echo "ERROR: tracked audit/log/build artifact detected." >&2
  exit 1
fi

echo "== Security check: obvious secret values =="
secret_hits="$(
  git grep -nE \
    'sk-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|DATABASE_URL=postgres|CRON_SECRET=[^[:space:]'\''"]{8,}|COINGLASS_API_KEY=[^[:space:]'\''"]{8,}|PASSWORD=[^[:space:]'\''"]{8,}|COOKIE=[^[:space:]'\''"]{8,}|TOKEN=[^[:space:]'\''"]{20,}' \
    -- ':!*.md' ':!.env.example' ':!package-lock.json' \
    | grep -vF '=$' \
    | grep -vF '=[' \
    | grep -vF '=.*' \
    | grep -vF 'assert.' \
    | grep -vF 'doesNotMatch' \
    | grep -vF 'match(' \
    | grep -vE 'regex: .*(BEGIN|PRIVATE KEY)' \
    | grep -vE 'SECRET_RE|SECRET_VALUE_RE|secret_hits|git grep -nE' || true
)"

if [[ -n "${secret_hits}" ]]; then
  echo "${secret_hits}" >&2
  echo "ERROR: potential real secret value detected in tracked source." >&2
  exit 1
fi

echo "security check ok"
