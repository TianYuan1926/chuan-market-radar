#!/bin/sh

set -eu
umask 077

COMMAND="${1:-}"
OPS_ROOT="${2:-}"
SOURCE_OPS_ROOT="${3:-}"
RUNNER_COMMIT="${4:-}"
APPROVAL_ISSUED_AT="${5:-}"
APPROVAL_EXPIRES_AT="${6:-}"
WORKTREE=/home/ubuntu/apps/chuan-market-radar
AUTHORIZED_SOURCE_COMMIT=b86f3282fa0d9cedab60b8a5bcb9166011fb7926
POSTGRES_CONTAINER=chuan-market-radar-postgres-1
WEB_CONTAINER=chuan-market-radar-web-1
SOURCE="$OPS_ROOT/source/runner-source"
RUNNER_SOURCE="$SOURCE/scripts/production/migration-runner"
ARTIFACT="$OPS_ROOT/artifacts/runner-artifact"
EVIDENCE="$OPS_ROOT/evidence"
SECRETS="$OPS_ROOT/secrets"
STATE="$OPS_ROOT/runner-state"
RUNTIME="$OPS_ROOT/runtime"
ENV_FILE="$WORKTREE/.env.production"

export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0="$WORKTREE"

fail() {
  printf '{"status":"fail","reason":"%s"}\n' "$1" >&2
  exit 1
}

require_static_boundary() {
  case "$OPS_ROOT/" in
    /var/lib/market-radar-ops/wp-g0-2-shadow-safety-schema-*/) ;;
    *) fail ops_root_invalid ;;
  esac
  case "$SOURCE_OPS_ROOT/" in
    /var/lib/market-radar-ops/wp-g0-2-identity-runner-*/) ;;
    *) fail source_ops_root_invalid ;;
  esac
  case "$RUNNER_COMMIT" in
    *[!0-9a-f]*|'') fail runner_commit_invalid ;;
  esac
  [ "${#RUNNER_COMMIT}" -eq 40 ] || fail runner_commit_invalid
  [ "$(git -C "$WORKTREE" rev-parse origin/main)" = "$AUTHORIZED_SOURCE_COMMIT" ] \
    || fail reviewed_github_main_mismatch
  [ -z "$(git -C "$WORKTREE" status --porcelain=v1 --untracked-files=all)" ] \
    || fail production_worktree_dirty
}

require_feature_flags_off() {
  for flag in \
    CANDIDATE_EPISODE_CANONICAL_WRITE \
    CANDIDATE_EPISODE_SHADOW_WRITE \
    CANDIDATE_EPISODE_DUAL_READ \
    CANDIDATE_EPISODE_CANONICAL_READ \
    CANDIDATE_EPISODE_REVIEW_READ
  do
    if grep -Eiq "^${flag}=(true|1|yes|on)$" "$ENV_FILE"; then
      fail candidate_feature_flag_enabled
    fi
  done
}

guard() {
  output="$1"
  baseline="${2:-}"
  if [ -n "$baseline" ]; then
    "$RUNNER_SOURCE/worktree-guard.sh" "$WORKTREE" "$output" "$baseline"
  else
    "$RUNNER_SOURCE/worktree-guard.sh" "$WORKTREE" "$output"
  fi
}

container_runner() {
  "$RUNNER_SOURCE/container-runner.sh" "$OPS_ROOT" "$(cat "$EVIDENCE/web-image-before.txt")" "$@"
}

write_catalog_sql() {
  cat > "$RUNTIME/catalog.sql" <<'SQL'
SELECT json_build_object(
  'schemas', (SELECT count(*) FROM pg_namespace WHERE nspname = 'candidate_authority'),
  'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'candidate_authority' AND table_type = 'BASE TABLE'),
  'columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'candidate_authority'),
  'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'candidate_authority'),
  'triggerObjects', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'candidate_authority' AND NOT t.tgisinternal),
  'triggerEventRows', (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'candidate_authority'),
  'roles', (SELECT count(*) FROM pg_roles WHERE rolname = ANY (ARRAY['candidate_migration_role','candidate_application_writer_role','candidate_application_reader_role','candidate_shadow_executor_role','candidate_review_reader_role','candidate_backup_restore_role','candidate_audit_role'])),
  'appliedLedgerRows', (SELECT count(*) FROM candidate_authority.schema_migrations WHERE status = 'applied'),
  'controlRows', (SELECT count(*) FROM candidate_authority.candidate_migration_control),
  'resolutionTableExists', (to_regclass('candidate_authority.candidate_outbox_quarantine_resolutions') IS NOT NULL)
)::text;
SQL
}

read_catalog() {
  output="$1"
  docker exec -i "$POSTGRES_CONTAINER" sh -c \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' \
    < "$RUNTIME/catalog.sql" > "$output"
}

preflight() {
  require_static_boundary
  [ ! -e "$OPS_ROOT" ] || fail ops_root_already_exists
  for secret in application-runtime.url migration-login.url break-glass.url; do
    path="$SOURCE_OPS_ROOT/secrets/$secret"
    [ -f "$path" ] || fail source_secret_missing
    [ -z "$(find "$path" -perm /077 -print -quit)" ] || fail source_secret_permissions_too_open
  done

  install -d -m 700 "$OPS_ROOT" "$OPS_ROOT/source" "$OPS_ROOT/artifacts" \
    "$EVIDENCE" "$SECRETS" "$STATE/preflight" "$RUNTIME"
  install -d -m 700 "$SOURCE"
  git -C "$WORKTREE" cat-file -e "$RUNNER_COMMIT^{commit}" || fail runner_commit_unavailable
  git -C "$WORKTREE" archive "$RUNNER_COMMIT" | tar -x -C "$SOURCE"
  [ -f "$RUNNER_SOURCE/migration-runner.mjs" ] || fail runner_source_archive_incomplete

  cp "$SOURCE_OPS_ROOT/secrets/application-runtime.url" "$SECRETS/application-runtime.url"
  cp "$SOURCE_OPS_ROOT/secrets/migration-login.url" "$SECRETS/migration-login.url"
  cp "$SOURCE_OPS_ROOT/secrets/break-glass.url" "$SECRETS/break-glass.url"
  chmod 600 "$SECRETS"/*.url

  docker inspect "$WEB_CONTAINER" --format '{{.Image}}' > "$EVIDENCE/web-image-before.txt"
  [ -s "$EVIDENCE/web-image-before.txt" ] || fail web_image_missing
  git -C "$WORKTREE" rev-parse HEAD > "$EVIDENCE/application-release.txt"
  curl -fsS localhost/api/health > "$EVIDENCE/health-before.json"
  jq -e '.ok == true and .health.scan.status == "ready" and .health.scan.freshness == "fresh"' \
    "$EVIDENCE/health-before.json" >/dev/null || fail health_before_not_ready_fresh
  require_feature_flags_off
  guard "$EVIDENCE/worktree-before.json"

  docker run --rm \
    --volume "$OPS_ROOT:/ops" \
    --volume "$SOURCE:/src:ro" \
    --entrypoint node \
    "$(cat "$EVIDENCE/web-image-before.txt")" \
    /src/scripts/production/migration-runner/build-artifact.mjs \
    --output-dir /ops/artifacts \
    --runner-source-commit "$RUNNER_COMMIT" \
    > "$EVIDENCE/artifact-build.json"
  chmod -R a-w "$ARTIFACT"

  container_runner prepare-requests.mjs migration-dry-run \
    --output-dir /ops/runner-state/preflight \
    --application-release "$(cat "$EVIDENCE/application-release.txt")" \
    --approval-ref user-approved-shadow-safety-schema-preflight-20260712 \
    --operator codex-single-agent \
    --migration-release-id wp-g0-2-shadow-safety-schema-preflight-20260712 \
    --cwd /ops \
    --worktree /production-worktree \
    > "$EVIDENCE/request-preflight.json"
  request=/ops/runner-state/preflight/migration-dry-run-request.json
  common="--request $request --artifact-root /app/runner --state-dir /ops/runner-state/preflight/state --worktree $WORKTREE --worktree-guard-file /ops/evidence/worktree-before.json --cwd /ops"
  container_runner migration-runner.mjs plan $common > "$EVIDENCE/runner-plan.json"
  container_runner migration-runner.mjs preflight $common \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    > "$EVIDENCE/runner-preflight.json"
  container_runner migration-runner.mjs dry-run $common \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    > "$EVIDENCE/runner-dry-run.json"

  jq -e '.status == "pass" and .result.identities.migration.migrationRegistryRows == 8' \
    "$EVIDENCE/runner-preflight.json" >/dev/null || fail runner_preflight_contract_failed
  write_catalog_sql
  read_catalog "$EVIDENCE/catalog-before.json"
  jq -e '.schemas == 1 and .tables == 8 and .columns == 151 and .functions == 20 and
    .triggerObjects == 10 and .triggerEventRows == 14 and .roles == 7 and
    .appliedLedgerRows == 8 and .controlRows == 0 and .resolutionTableExists == false' \
    "$EVIDENCE/catalog-before.json" >/dev/null || fail catalog_baseline_mismatch
  printf '{"status":"pass","phase":"preflight","productionMutationAllowed":false}\n' \
    > "$EVIDENCE/preflight-result.json"
  cat "$EVIDENCE/preflight-result.json"
}

execute() {
  require_static_boundary
  [ -f "$EVIDENCE/preflight-result.json" ] || fail preflight_not_complete
  jq -e '.status == "pass"' "$EVIDENCE/capacity-gate-result.json" >/dev/null \
    || fail capacity_gate_not_passed
  jq -e '.status == "pass" and .offHost == true and .checksumVerified == true and .archiveVerified == true' \
    "$EVIDENCE/offhost-backup-verification.json" >/dev/null \
    || fail offhost_backup_not_verified
  require_feature_flags_off
  guard "$EVIDENCE/worktree-before-execute.json" "$EVIDENCE/worktree-before.json"
  [ "$(docker inspect "$WEB_CONTAINER" --format '{{.Image}}')" = "$(cat "$EVIDENCE/web-image-before.txt")" ] \
    || fail web_image_changed_before_execute
  curl -fsS localhost/api/health > "$EVIDENCE/health-before-execute.json"
  jq -e '.ok == true and .health.scan.status == "ready" and .health.scan.freshness == "fresh"' \
    "$EVIDENCE/health-before-execute.json" >/dev/null || fail health_before_execute_not_ready_fresh

  install -d -m 700 "$STATE/execute"
  container_runner prepare-requests.mjs migration-schema-only \
    --output-dir /ops/runner-state/execute \
    --application-release "$(cat "$EVIDENCE/application-release.txt")" \
    --approval-ref user-approved-wp-g0-2-shadow-capture-production-add-safety-schema-20260712 \
    --approval-issued-at "$APPROVAL_ISSUED_AT" \
    --approval-expires-at "$APPROVAL_EXPIRES_AT" \
    --operator codex-single-agent \
    --migration-release-id wp-g0-2-shadow-safety-schema-production-20260712 \
    --cwd /ops \
    --worktree /production-worktree \
    > "$EVIDENCE/request-execute.json"
  request=/ops/runner-state/execute/migration-schema-only-request.json
  common="--request $request --artifact-root /app/runner --state-dir /ops/runner-state/execute/state --worktree $WORKTREE --worktree-guard-file /ops/evidence/worktree-before-execute.json --cwd /ops"
  container_runner migration-runner.mjs plan $common > "$EVIDENCE/runner-execute-plan.json"
  container_runner migration-runner.mjs preflight $common \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    > "$EVIDENCE/runner-execute-preflight.json"
  container_runner migration-runner.mjs execute $common \
    --confirmation-file /ops/runner-state/execute/migration-schema-only-confirmation \
    --migration-connection-file /ops/secrets/migration-login.url \
    > "$EVIDENCE/runner-execute.json"
  jq -e '.status == "pass" and
    .result.schemaMigration.applied == ["009_candidate_shadow_capture_safety"] and
    (.result.schemaMigration.skipped | length) == 8 and
    .result.roleBootstrap.executed == false' \
    "$EVIDENCE/runner-execute.json" >/dev/null || fail runner_execute_contract_failed

  guard "$EVIDENCE/worktree-after-execute.json" "$EVIDENCE/worktree-before.json"
  container_runner migration-runner.mjs verify $common \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    > "$EVIDENCE/runner-verify.json"
  jq -e '.status == "pass" and .result.identities.migration.migrationRegistryRows == 9 and
    .result.candidateMigrationExecuted == false and .result.schemaChanged == false' \
    "$EVIDENCE/runner-verify.json" >/dev/null || fail runner_verify_contract_failed

  read_catalog "$EVIDENCE/catalog-after.json"
  docker exec "$POSTGRES_CONTAINER" sh -c \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM candidate_authority.candidate_outbox_quarantine_resolutions"' \
    > "$EVIDENCE/resolution-rows-after.txt"
  [ "$(cat "$EVIDENCE/resolution-rows-after.txt")" = 0 ] || fail resolution_ledger_not_empty
  jq -e '.schemas == 1 and .tables == 9 and .columns == 166 and .functions == 26 and
    .triggerObjects == 11 and .triggerEventRows == 16 and .roles == 7 and
    .appliedLedgerRows == 9 and .controlRows == 0 and .resolutionTableExists == true' \
    "$EVIDENCE/catalog-after.json" >/dev/null || fail catalog_completion_mismatch
  require_feature_flags_off
  curl -fsS localhost/api/health > "$EVIDENCE/health-after.json"
  jq -e '.ok == true and .health.scan.status == "ready" and
    (.health.scan.freshness == "fresh" or .health.scan.freshness == "aging")' \
    "$EVIDENCE/health-after.json" >/dev/null || fail health_after_not_ready
  guard "$EVIDENCE/worktree-final.json" "$EVIDENCE/worktree-before.json"
  [ "$(docker inspect "$WEB_CONTAINER" --format '{{.Image}}')" = "$(cat "$EVIDENCE/web-image-before.txt")" ] \
    || fail web_image_changed_after_execute
  if grep -ERIq 'postgres(ql)?://|DATABASE_URL=|PASSWORD=|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' \
    "$EVIDENCE"; then
    fail evidence_secret_pattern_detected
  fi
  jq -n \
    --arg sourceCommit "$AUTHORIZED_SOURCE_COMMIT" \
    --arg runnerCommit "$RUNNER_COMMIT" \
    --slurpfile before "$EVIDENCE/catalog-before.json" \
    --slurpfile after "$EVIDENCE/catalog-after.json" \
    --slurpfile execute "$EVIDENCE/runner-execute.json" \
    '{status:"PASS_PRODUCTION_ADD_SAFETY_SCHEMA", sourceCommit:$sourceCommit,
      runnerCommit:$runnerCommit, productionMutation:"migration_009_only",
      runtimeDeployment:false, featureFlagsEnabled:0, controlLifecycleStarted:false,
      catalogBefore:$before[0], catalogAfter:$after[0], runnerExecute:$execute[0].result.schemaMigration}' \
    > "$EVIDENCE/final-summary.json"
  tar -czf "$OPS_ROOT/shadow-safety-schema-redacted-evidence.tar.gz" -C "$OPS_ROOT" \
    evidence artifacts/runner-artifact/RUNNER_ARTIFACT_MANIFEST.json
  cat "$EVIDENCE/final-summary.json"
}

case "$COMMAND" in
  preflight) preflight ;;
  execute) execute ;;
  *) fail command_invalid ;;
esac
