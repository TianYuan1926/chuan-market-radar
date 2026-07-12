#!/bin/sh

set -eu
umask 077

COMMAND="${1:-}"
OPS_ROOT="${2:-}"
SOURCE_OPS_ROOT="${3:-}"
RUNNER_COMMIT="${4:-}"
WORKTREE=/home/ubuntu/apps/chuan-market-radar
APPLICATION_RELEASE=0599f802f261fe8e3c1982a07106f362bd62ac13
POSTGRES_CONTAINER=chuan-market-radar-postgres-1
WEB_CONTAINER=chuan-market-radar-web-1
SOURCE="$OPS_ROOT/source/runner-source"
RUNNER_SOURCE="$SOURCE/scripts/production/migration-runner"
ARTIFACT="$OPS_ROOT/artifacts/runner-artifact"
EVIDENCE="$OPS_ROOT/evidence"
SECRETS="$OPS_ROOT/secrets"
STATE="$OPS_ROOT/runner-state/verify-only"
RUNTIME="$OPS_ROOT/runtime"
ENV_FILE="$WORKTREE/.env.production"

export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0="$WORKTREE"

fail() {
  printf '{"status":"fail","reason":"%s"}\n' "$1" >&2
  exit 1
}

[ "$COMMAND" = verify ] || fail command_must_be_verify
case "$OPS_ROOT/" in
  /var/lib/market-radar-ops/wp-g0-2-verify-only-*/) ;;
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
[ ! -e "$OPS_ROOT" ] || fail ops_root_already_exists
[ "$(git -C "$WORKTREE" rev-parse HEAD)" = "$APPLICATION_RELEASE" ] \
  || fail application_release_mismatch
[ -z "$(git -C "$WORKTREE" status --porcelain=v1 --untracked-files=all)" ] \
  || fail production_worktree_dirty

for secret in application-runtime.url migration-login.url break-glass.url; do
  path="$SOURCE_OPS_ROOT/secrets/$secret"
  [ -f "$path" ] || fail source_secret_missing
  [ -z "$(find "$path" -perm /077 -print -quit)" ] || fail source_secret_permissions_too_open
done

for flag in \
  CANDIDATE_EPISODE_CANONICAL_WRITE \
  CANDIDATE_EPISODE_SHADOW_WRITE \
  CANDIDATE_EPISODE_DUAL_READ \
  CANDIDATE_EPISODE_CANONICAL_READ \
  CANDIDATE_EPISODE_REVIEW_READ
do
  if grep -Eiq "^${flag}=(true|1|yes|on)$" "$ENV_FILE"; then
    fail candidate_feature_flag_enabled_before_verify
  fi
done

git -C "$WORKTREE" cat-file -e "$RUNNER_COMMIT^{commit}" \
  || fail runner_commit_unavailable
install -d -m 700 "$OPS_ROOT" "$OPS_ROOT/source" "$OPS_ROOT/artifacts" \
  "$EVIDENCE" "$SECRETS" "$STATE" "$RUNTIME"
git -c safe.directory="$WORKTREE" clone --quiet --no-hardlinks "$WORKTREE" "$SOURCE"
git -C "$SOURCE" checkout --quiet --detach "$RUNNER_COMMIT"
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$RUNNER_COMMIT" ] \
  || fail runner_source_checkout_mismatch
[ -z "$(git -C "$SOURCE" status --porcelain=v1 --untracked-files=all)" ] \
  || fail runner_source_dirty

cp "$SOURCE_OPS_ROOT/secrets/application-runtime.url" "$SECRETS/application-runtime.url"
cp "$SOURCE_OPS_ROOT/secrets/migration-login.url" "$SECRETS/migration-login.url"
cp "$SOURCE_OPS_ROOT/secrets/break-glass.url" "$SECRETS/break-glass.url"
chmod 600 "$SECRETS"/*.url

IMAGE="$(docker inspect "$WEB_CONTAINER" --format '{{.Image}}')"
[ -n "$IMAGE" ] || fail web_image_missing
printf '%s\n' "$IMAGE" > "$EVIDENCE/web-image-before.txt"
curl -fsS localhost/api/health > "$EVIDENCE/health-before.json"
jq -e '.ok == true and .health.scan.status == "ready" and .health.scan.freshness == "fresh"' \
  "$EVIDENCE/health-before.json" >/dev/null || fail health_before_not_ready_fresh
"$RUNNER_SOURCE/worktree-guard.sh" "$WORKTREE" "$EVIDENCE/worktree-before.json"

docker run --rm \
  --volume "$OPS_ROOT:/ops" \
  --volume "$SOURCE:/src:ro" \
  --entrypoint node \
  "$IMAGE" \
  /src/scripts/production/migration-runner/build-artifact.mjs \
  --output-dir /ops/artifacts \
  --runner-source-commit "$RUNNER_COMMIT" \
  > "$EVIDENCE/artifact-build.json"
chmod -R a-w "$ARTIFACT"

container_runner() {
  "$RUNNER_SOURCE/container-runner.sh" "$OPS_ROOT" "$IMAGE" "$@"
}

container_runner prepare-requests.mjs migration-dry-run \
  --output-dir /ops/runner-state/verify-only \
  --application-release "$APPLICATION_RELEASE" \
  --approval-ref user-approved-wp-g0-2-production-verify-only-20260712 \
  --operator codex-single-agent \
  --migration-release-id wp-g0-2-production-verify-only-20260712 \
  --cwd /ops \
  --worktree /production-worktree \
  > "$EVIDENCE/request-build.json"

REQUEST=/ops/runner-state/verify-only/migration-dry-run-request.json
COMMON="--request $REQUEST --artifact-root /app/runner --state-dir /ops/runner-state/verify-only/state --worktree $WORKTREE --worktree-guard-file /ops/evidence/worktree-before.json --cwd /ops"
container_runner migration-runner.mjs plan $COMMON > "$EVIDENCE/runner-plan.json"
container_runner migration-runner.mjs verify $COMMON \
  --application-connection-file /ops/secrets/application-runtime.url \
  --migration-connection-file /ops/secrets/migration-login.url \
  --break-glass-connection-file /ops/secrets/break-glass.url \
  > "$EVIDENCE/runner-verify.json"

jq -e '
  .status == "pass" and
  .command == "verify" and
  .execute == false and
  .roleBootstrapEnabled == false and
  .schemaMigrationEnabled == false and
  .result.candidateMigrationExecuted == false and
  .result.schemaChanged == false and
  .result.identities.migration.ownerMembership == true and
  .result.identities.migration.candidateSchemaPresent == true and
  .result.identities.migration.migrationRegistryRows == 8
' "$EVIDENCE/runner-verify.json" >/dev/null || fail runner_verify_contract_failed

cat > "$RUNTIME/catalog.sql" <<'SQL'
SELECT json_build_object(
  'schemas', (SELECT count(*) FROM pg_namespace WHERE nspname = 'candidate_authority'),
  'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'candidate_authority' AND table_type = 'BASE TABLE'),
  'columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'candidate_authority'),
  'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'candidate_authority'),
  'triggerObjects', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'candidate_authority' AND NOT t.tgisinternal),
  'triggerEventRows', (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'candidate_authority'),
  'roles', (SELECT count(*) FROM pg_roles WHERE rolname = ANY (ARRAY['candidate_migration_role','candidate_application_writer_role','candidate_application_reader_role','candidate_shadow_executor_role','candidate_review_reader_role','candidate_backup_restore_role','candidate_audit_role'])),
  'appliedLedgerRows', (SELECT count(*) FROM candidate_authority.schema_migrations WHERE status = 'applied')
)::text;
SQL
docker exec -i "$POSTGRES_CONTAINER" sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' \
  < "$RUNTIME/catalog.sql" > "$EVIDENCE/catalog.json"
jq -e '
  .schemas == 1 and .tables == 8 and .columns == 151 and .functions == 20 and
  .triggerObjects == 10 and .triggerEventRows == 14 and .roles == 7 and
  .appliedLedgerRows == 8
' "$EVIDENCE/catalog.json" >/dev/null || fail catalog_contract_failed

cat > "$RUNTIME/runtime.sql" <<'SQL'
SELECT json_build_object(
  'longTransactions', (SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND xact_start IS NOT NULL AND clock_timestamp() - xact_start > interval '5 minutes'),
  'idleInTransaction', (SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state = 'idle in transaction'),
  'lockWaiters', (SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'),
  'ungrantedLocks', (SELECT count(*) FROM pg_locks WHERE NOT granted),
  'migrationLoginSessions', (SELECT count(*) FROM pg_stat_activity WHERE usename = 'market_radar_migration_login'),
  'breakGlassSessions', (SELECT count(*) FROM pg_stat_activity WHERE usename = 'market_radar_break_glass')
)::text;
SQL
docker exec -i "$POSTGRES_CONTAINER" sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' \
  < "$RUNTIME/runtime.sql" > "$EVIDENCE/runtime-boundary.json"
jq -e 'all(.[]; . == 0)' "$EVIDENCE/runtime-boundary.json" >/dev/null \
  || fail runtime_boundary_not_clean

flags='{}'
for flag in \
  CANDIDATE_EPISODE_CANONICAL_WRITE \
  CANDIDATE_EPISODE_SHADOW_WRITE \
  CANDIDATE_EPISODE_DUAL_READ \
  CANDIDATE_EPISODE_CANONICAL_READ \
  CANDIDATE_EPISODE_REVIEW_READ
do
  enabled=false
  if grep -Eiq "^${flag}=(true|1|yes|on)$" "$ENV_FILE"; then enabled=true; fi
  flags=$(printf '%s' "$flags" | jq --arg flag "$flag" --argjson enabled "$enabled" \
    '. + {($flag): $enabled}')
done
printf '%s\n' "$flags" > "$EVIDENCE/candidate-feature-flags.json"
jq -e 'all(.[]; . == false)' "$EVIDENCE/candidate-feature-flags.json" >/dev/null \
  || fail candidate_feature_flag_enabled_after_verify

curl -fsS localhost/api/health > "$EVIDENCE/health-after.json"
jq -e '.ok == true and .health.scan.status == "ready" and .health.scan.freshness == "fresh"' \
  "$EVIDENCE/health-after.json" >/dev/null || fail health_after_not_ready_fresh
"$RUNNER_SOURCE/worktree-guard.sh" "$WORKTREE" "$EVIDENCE/worktree-after.json" \
  "$EVIDENCE/worktree-before.json"
docker inspect "$WEB_CONTAINER" --format '{{.Image}}' > "$EVIDENCE/web-image-after.txt"
cmp -s "$EVIDENCE/web-image-before.txt" "$EVIDENCE/web-image-after.txt" \
  || fail web_image_changed

jq -n \
  --arg applicationRelease "$APPLICATION_RELEASE" \
  --arg runnerCommit "$RUNNER_COMMIT" \
  --slurpfile catalog "$EVIDENCE/catalog.json" \
  --slurpfile flags "$EVIDENCE/candidate-feature-flags.json" \
  --slurpfile healthBefore "$EVIDENCE/health-before.json" \
  --slurpfile healthAfter "$EVIDENCE/health-after.json" \
  --slurpfile runtime "$EVIDENCE/runtime-boundary.json" \
  --slurpfile verify "$EVIDENCE/runner-verify.json" \
  --slurpfile worktreeBefore "$EVIDENCE/worktree-before.json" \
  --slurpfile worktreeAfter "$EVIDENCE/worktree-after.json" \
  '{
    applicationRelease: $applicationRelease,
    candidateFeatureFlags: $flags[0],
    catalog: $catalog[0],
    healthAfter: {ok: $healthAfter[0].ok, scanStatus: $healthAfter[0].health.scan.status, scanFreshness: $healthAfter[0].health.scan.freshness},
    healthBefore: {ok: $healthBefore[0].ok, scanStatus: $healthBefore[0].health.scan.status, scanFreshness: $healthBefore[0].health.scan.freshness},
    migrationExecuteRun: false,
    runnerCommit: $runnerCommit,
    runnerVerify: {
      candidateSchemaPresent: $verify[0].result.identities.migration.candidateSchemaPresent,
      execute: $verify[0].execute,
      migrationRegistryRows: $verify[0].result.identities.migration.migrationRegistryRows,
      ownerMembership: $verify[0].result.identities.migration.ownerMembership,
      schemaChanged: $verify[0].result.schemaChanged,
      status: $verify[0].status
    },
    runtimeBoundary: $runtime[0],
    status: "PASS_PRODUCTION_VERIFY_ONLY",
    worktreeAfter: {clean: $worktreeAfter[0].clean, head: $worktreeAfter[0].head},
    worktreeBefore: {clean: $worktreeBefore[0].clean, head: $worktreeBefore[0].head}
  }' > "$EVIDENCE/verify-only-summary.json"

if grep -ERIq 'postgres(ql)?://|DATABASE_URL=|PASSWORD=|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' \
  "$EVIDENCE"; then
  fail evidence_secret_pattern_detected
fi
tar -czf "$OPS_ROOT/verify-only-redacted-evidence.tar.gz" -C "$OPS_ROOT" evidence \
  artifacts/runner-artifact/RUNNER_ARTIFACT_MANIFEST.json
EXPORT_DIR=/home/ubuntu/market-radar-offhost-transfer/$(basename "$OPS_ROOT")
install -d -m 700 -o ubuntu -g ubuntu "$EXPORT_DIR"
cp "$OPS_ROOT/verify-only-redacted-evidence.tar.gz" "$EXPORT_DIR/"
chown ubuntu:ubuntu "$EXPORT_DIR/verify-only-redacted-evidence.tar.gz"
chmod 600 "$EXPORT_DIR/verify-only-redacted-evidence.tar.gz"
cat "$EVIDENCE/verify-only-summary.json"
