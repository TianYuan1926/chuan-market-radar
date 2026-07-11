#!/bin/sh

set -eu
umask 077

OPS_ROOT="${1:-}"
IMAGE="${2:-}"
TOOL="${3:-}"
shift 3 || true

case "$OPS_ROOT/" in
  /var/lib/market-radar-ops/*/) ;;
  *) echo '{"status":"fail","reason":"ops_root_invalid"}' >&2; exit 2 ;;
esac

case "$TOOL" in
  identity-remediation.mjs|migration-runner.mjs|prepare-requests.mjs) ;;
  *) echo '{"status":"fail","reason":"tool_not_allowlisted"}' >&2; exit 2 ;;
esac

if [ -z "$IMAGE" ] || [ ! -d "$OPS_ROOT" ]; then
  echo '{"status":"fail","reason":"image_or_ops_root_missing"}' >&2
  exit 2
fi

exec sudo -n docker run --rm \
  --user "$(id -u):$(id -g)" \
  --network chuan-market-radar_default \
  --workdir /ops \
  --env MARKET_RADAR_APPLICATION_ROOT=/app \
  --volume "$OPS_ROOT:/ops" \
  --volume "/home/ubuntu/apps/chuan-market-radar:/production-worktree:ro" \
  --volume "$OPS_ROOT/artifacts/runner-artifact:/app/runner:ro" \
  --entrypoint node \
  "$IMAGE" \
  "/app/runner/scripts/production/migration-runner/$TOOL" "$@"
