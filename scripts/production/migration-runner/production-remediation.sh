#!/bin/sh

set -eu
umask 077

COMMAND="${1:-}"
OPS_ROOT="${2:-}"
IMAGE="${3:-}"
RUNNER_COMMIT="${4:-}"
WORKTREE=/home/ubuntu/apps/chuan-market-radar
APPLICATION_RELEASE=0599f802f261fe8e3c1982a07106f362bd62ac13
POSTGRES_CONTAINER=chuan-market-radar-postgres-1
SOURCE="$OPS_ROOT/source/runner-source"
RUNNER_SOURCE="$SOURCE/scripts/production/migration-runner"
ARTIFACT="$OPS_ROOT/artifacts/runner-artifact"
RUNNER="$ARTIFACT/scripts/production/migration-runner"
EVIDENCE="$OPS_ROOT/evidence"
SECRETS="$OPS_ROOT/secrets"
STATE="$OPS_ROOT/runner-state"
BACKUPS="$OPS_ROOT/backups"
RUNTIME="$OPS_ROOT/runtime"
ENV_FILE="$WORKTREE/.env.production"

fail() {
  printf '{"status":"fail","reason":"%s"}\n' "$1" >&2
  exit 1
}

require_boundary() {
  case "$OPS_ROOT/" in
    /var/lib/market-radar-ops/wp-g0-2-identity-runner-*/) ;;
    *) fail ops_root_invalid ;;
  esac
  [ -n "$IMAGE" ] || fail image_missing
  [ "$RUNNER_COMMIT" = "$(git -C "$SOURCE" rev-parse HEAD)" ] || fail runner_commit_mismatch
  [ "$(git -C "$WORKTREE" rev-parse HEAD)" = "$APPLICATION_RELEASE" ] || fail application_head_mismatch
  [ -z "$(git -C "$WORKTREE" status --porcelain=v1 --untracked-files=all)" ] || fail production_worktree_dirty
  mkdir -p "$EVIDENCE" "$SECRETS" "$STATE" "$BACKUPS" "$RUNTIME" "$OPS_ROOT/logs-redacted"
  chmod 700 "$OPS_ROOT" "$EVIDENCE" "$SECRETS" "$STATE" "$BACKUPS" "$RUNTIME" "$OPS_ROOT/logs-redacted"
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
  "$RUNNER/container-runner.sh" "$OPS_ROOT" "$IMAGE" "$@"
}

prepare() {
  require_boundary
  guard "$EVIDENCE/production-worktree-guard-before.json"

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

  docker exec "$POSTGRES_CONTAINER" sh -c \
    'exec pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$BACKUPS/globals.sql"
  docker exec "$POSTGRES_CONTAINER" sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-privileges' \
    > "$BACKUPS/schema.sql"
  cp --preserve=mode,ownership,timestamps "$ENV_FILE" "$BACKUPS/env.production.before"
  cp --preserve=mode,ownership,timestamps "$ENV_FILE" "$BACKUPS/env.production.rollback"
  chmod 600 "$BACKUPS/globals.sql" "$BACKUPS/schema.sql" \
    "$BACKUPS/env.production.before" "$BACKUPS/env.production.rollback"

  container_runner identity-remediation.mjs prepare-secrets \
    --source-env /production-worktree/.env.production \
    --secret-dir /ops/secrets \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/prepare-secrets.json
  cp "$SECRETS/postgres-admin-current.env" "$SECRETS/postgres-admin.env"
  chmod 600 "$SECRETS/postgres-admin.env"

  container_runner identity-remediation.mjs audit \
    --break-glass-connection-file /ops/secrets/break-glass-current.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-audit-before.json

  curl -fsS localhost/api/health > "$EVIDENCE/health-before.json"
  df -Pk / > "$EVIDENCE/disk-before.txt"
  docker system df > "$EVIDENCE/docker-disk-before.txt"
  docker inspect chuan-market-radar-web-1 \
    --format '{{json .Id}} {{json .Image}}' > "$EVIDENCE/web-container-before.txt"
  sha256sum "$BACKUPS/globals.sql" "$BACKUPS/schema.sql" "$BACKUPS/env.production.before" \
    > "$BACKUPS/sha256sums.txt"
  chmod 600 "$BACKUPS/sha256sums.txt"
  guard "$EVIDENCE/production-worktree-guard-prepared.json" \
    "$EVIDENCE/production-worktree-guard-before.json"
  printf '%s\n' 'Retention: keep through Add Schema rerun and verified rollback window; never include backup files in evidence ZIP.' \
    > "$BACKUPS/RETENTION.txt"
  chmod 600 "$BACKUPS/RETENTION.txt"
  printf '{"status":"pass","phase":"prepare"}\n' > "$EVIDENCE/prepare-result.json"
  printf '{"status":"pass","phase":"prepare"}\n'
}

rollback_runtime() {
  if [ -f "$BACKUPS/env.production.rollback" ]; then
    chown --reference="$ENV_FILE" "$BACKUPS/env.production.rollback"
    chmod --reference="$ENV_FILE" "$BACKUPS/env.production.rollback"
    mv -f "$BACKUPS/env.production.rollback" "$ENV_FILE"
    docker compose \
      --project-directory "$WORKTREE" \
      --env-file "$ENV_FILE" \
      -f "$WORKTREE/docker-compose.yml" \
      up -d --no-deps --no-build --force-recreate \
      web scanner-worker websocket-light-worker coinglass-worker signal-worker \
      shadow-runner dynamic-scan-scheduler macro-worker
  fi
}

cutover() {
  require_boundary
  [ -f "$EVIDENCE/prepare-result.json" ] || fail prepare_not_complete
  cp --preserve=mode,ownership,timestamps "$ENV_FILE" "$BACKUPS/env.production.rollback"
  chmod 600 "$BACKUPS/env.production.rollback"
  guard "$EVIDENCE/production-worktree-guard-before-cutover.json" \
    "$EVIDENCE/production-worktree-guard-before.json"

  container_runner prepare-requests.mjs identity \
    --output-dir /ops/runner-state/identity-request \
    --application-release "$APPLICATION_RELEASE" \
    --approval-ref user-confirmed-production-identity-cutover-20260711 \
    --operator codex-single-agent \
    --cwd /ops \
    --worktree /production-worktree

  container_runner identity-remediation.mjs bootstrap \
    --request /ops/runner-state/identity-request/identity-request.json \
    --confirmation-file /ops/runner-state/identity-request/identity-confirmation \
    --break-glass-connection-file /ops/secrets/break-glass-current.url \
    --secret-dir /ops/secrets \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-bootstrap.json

  container_runner identity-remediation.mjs verify \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass-current.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-verification-before-cutover.json

  container_runner identity-remediation.mjs render-runtime-env \
    --request /ops/runner-state/identity-request/identity-request.json \
    --confirmation-file /ops/runner-state/identity-request/identity-confirmation \
    --source-env /production-worktree/.env.production \
    --application-runtime-env-file /ops/secrets/application-runtime.env \
    --postgres-admin-env-file "$SECRETS/postgres-admin.env" \
    --output-dir /ops/runtime \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/runtime-env-render.json

  [ "$(stat -c %d "$ENV_FILE")" = "$(stat -c %d "$RUNTIME/rendered.env.production")" ] \
    || fail atomic_env_filesystem_mismatch
  chown --reference="$ENV_FILE" "$RUNTIME/rendered.env.production"
  chmod --reference="$ENV_FILE" "$RUNTIME/rendered.env.production"
  mv -f "$RUNTIME/rendered.env.production" "$ENV_FILE"

  set +e
  "$RUNTIME/compose-identity-safe" up -d --no-deps --no-build --force-recreate \
    web scanner-worker websocket-light-worker coinglass-worker signal-worker \
    shadow-runner dynamic-scan-scheduler macro-worker
  compose_status=$?
  set -e
  if [ "$compose_status" -ne 0 ]; then
    rollback_runtime
    fail runtime_recreate_failed_rolled_back
  fi

  healthy=false
  attempt=0
  while [ "$attempt" -lt 18 ]; do
    if curl -fsS localhost/api/health > "$EVIDENCE/health-cutover-attempt.json"; then
      if jq -e '.status == "ready" and .scan.status == "ready"' \
        "$EVIDENCE/health-cutover-attempt.json" >/dev/null; then
        healthy=true
        break
      fi
    fi
    attempt=$((attempt + 1))
    sleep 10
  done
  if [ "$healthy" != true ]; then
    rollback_runtime
    fail runtime_health_failed_rolled_back
  fi

  container_runner identity-remediation.mjs verify \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass-current.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-verification-after-cutover.json

  container_runner identity-remediation.mjs rotate-break-glass \
    --request /ops/runner-state/identity-request/identity-request.json \
    --confirmation-file /ops/runner-state/identity-request/identity-confirmation \
    --break-glass-connection-file /ops/secrets/break-glass-current.url \
    --secret-dir /ops/secrets \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/break-glass-rotation.json

  container_runner identity-remediation.mjs verify \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-verification-final.json
  container_runner identity-remediation.mjs audit \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-audit-after.json

  docker inspect chuan-market-radar-web-1 \
    --format '{{json .Id}} {{json .Image}}' > "$EVIDENCE/web-container-after.txt"
  guard "$EVIDENCE/production-worktree-guard-after-cutover.json" \
    "$EVIDENCE/production-worktree-guard-before.json"
  printf '{"status":"pass","phase":"cutover"}\n' > "$EVIDENCE/cutover-result.json"
  printf '{"status":"pass","phase":"cutover"}\n'
}

dry_run() {
  require_boundary
  [ -f "$EVIDENCE/cutover-result.json" ] || fail cutover_not_complete
  guard "$EVIDENCE/production-worktree-guard-before-dry-run.json" \
    "$EVIDENCE/production-worktree-guard-before.json"
  container_runner prepare-requests.mjs migration-dry-run \
    --output-dir /ops/runner-state/production-dry-run \
    --application-release "$APPLICATION_RELEASE" \
    --approval-ref user-confirmed-production-runner-dry-run-20260711 \
    --operator codex-single-agent \
    --migration-release-id wp-g0-2-production-dry-run-20260711 \
    --cwd /ops \
    --worktree /production-worktree

  request=/ops/runner-state/production-dry-run/migration-dry-run-request.json
  common="--request $request --artifact-root /app/runner --state-dir /ops/runner-state/production-dry-run/state --worktree $WORKTREE --worktree-guard-file /ops/evidence/production-worktree-guard-before-dry-run.json --cwd /ops"
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
  container_runner migration-runner.mjs verify $common \
    --application-connection-file /ops/secrets/application-runtime.url \
    --migration-connection-file /ops/secrets/migration-login.url \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    > "$EVIDENCE/runner-verify.json"

  set +e
  container_runner migration-runner.mjs preflight $common \
    --migration-connection-file /ops/secrets/application-runtime.url \
    > "$EVIDENCE/application-role-runner-rejection.json" 2>&1
  rejection_status=$?
  set -e
  [ "$rejection_status" -ne 0 ] || fail application_role_runner_not_rejected

  container_runner identity-remediation.mjs audit \
    --break-glass-connection-file /ops/secrets/break-glass.url \
    --cwd /ops \
    --worktree /production-worktree \
    --output /ops/evidence/production-role-audit-after-dry-run.json
  guard "$EVIDENCE/production-worktree-guard-after-dry-run.json" \
    "$EVIDENCE/production-worktree-guard-before.json"
  printf '{"status":"pass","phase":"dry-run"}\n' > "$EVIDENCE/dry-run-result.json"
  printf '{"status":"pass","phase":"dry-run"}\n'
}

case "$COMMAND" in
  prepare) prepare ;;
  cutover) cutover ;;
  dry-run) dry_run ;;
  *) fail command_invalid ;;
esac
