#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

forbidden_regex='^(audit-[^/]*|audit-round-[^/]*|audit-full-handoff|audit-handoff|audit-core-system-self-check[^/]*|system-convergence-remediation[^/]*|system-convergence-validation[^/]*|phase4-1-evidence-commit-alignment[^/]*|phase4-2-tencent-deploy-readiness[^/]*|phase5-[^/]*)/|\.(zip|tar|tar\.gz|tgz|log|exitcode|raw\.log|jsonl|ndjson|started|finished|status)$|^(raw|api-samples|node_modules|\.next|dist|build|docker|redis|db|logs|evidence|reports)/|(^|/)\.env($|\.)|(^|/)[^/]+\.env($|\.)'

violations="$(
  git ls-files |
    grep -E "${forbidden_regex}" |
    grep -vE '^reports/.+\.md$' |
    grep -vE '(^|/)\.env\.example$' || true
)"

if [[ -n "${violations}" ]]; then
  echo "Forbidden files are tracked by Git. Stop before commit:"
  echo "${violations}"
  exit 1
fi

echo "Forbidden tracked file check passed."
