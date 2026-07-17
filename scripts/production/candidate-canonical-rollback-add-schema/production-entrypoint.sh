#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-canonical-rollback-add-schema/production-runner.sh"

export CANONICAL_ROLLBACK_ADD_SCHEMA_MODE=production_add_schema
export CONFIRM_CANONICAL_ROLLBACK_ADD_SCHEMA=true
export REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
export TRANSPORT_MANIFEST_OVERRIDE="${TRANSPORT_MANIFEST_OVERRIDE:-${SOURCE_ROOT}/transport-manifest.json}"

exec "${RUNNER}"
