#!/bin/sh

set -eu
umask 077

WORKTREE="${1:-}"
OUTPUT="${2:-}"
BASELINE="${3:-}"

if [ -z "$WORKTREE" ] || [ -z "$OUTPUT" ]; then
  echo '{"status":"fail","reason":"worktree_or_output_missing"}' >&2
  exit 2
fi

case "$(pwd -P)/" in
  "$(cd "$WORKTREE" && pwd -P)/"*)
    echo '{"status":"fail","reason":"cwd_inside_production_worktree"}' >&2
    exit 2
    ;;
esac

OUTPUT_DIR=$(dirname "$OUTPUT")
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

HEAD=$(git -C "$WORKTREE" rev-parse HEAD)
STATUS=$(git -C "$WORKTREE" status --porcelain=v1 --untracked-files=all)
FILE_COUNT=$(find "$WORKTREE" -path "$WORKTREE/.git" -prune -o -type f -print | wc -l | tr -d ' ')
PATH_HASH=$(find "$WORKTREE" -path "$WORKTREE/.git" -prune -o -type f -printf '%P\0' | sort -z | sha256sum | cut -d' ' -f1)
METADATA_HASH=$(find "$WORKTREE" -path "$WORKTREE/.git" -prune -o -path "$WORKTREE/.env.production" -prune -o -type f -printf '%P|%s|%T@\0' | sort -z | sha256sum | cut -d' ' -f1)
ENV_METADATA=$(stat -c '%a|%s' "$WORKTREE/.env.production" 2>/dev/null || printf 'absent')
ENV_METADATA_HASH=$(printf '%s' "$ENV_METADATA" | sha256sum | cut -d' ' -f1)
STATUS_COUNT=$(printf '%s\n' "$STATUS" | awk 'NF {count += 1} END {print count + 0}')
CLEAN=false
if [ "$STATUS_COUNT" -eq 0 ]; then
  CLEAN=true
fi

COMPARE_STATUS=not_requested
COMPARE_REASON=null
if [ -n "$BASELINE" ]; then
  COMPARE_STATUS=pass
  if [ ! -f "$BASELINE" ]; then
    COMPARE_STATUS=fail
    COMPARE_REASON=baseline_missing
  elif [ "$(jq -r '.head' "$BASELINE")" != "$HEAD" ]; then
    COMPARE_STATUS=fail
    COMPARE_REASON=head_changed
  elif [ "$(jq -r '.pathHash' "$BASELINE")" != "$PATH_HASH" ]; then
    COMPARE_STATUS=fail
    COMPARE_REASON=path_set_changed
  elif [ "$(jq -r '.metadataHash' "$BASELINE")" != "$METADATA_HASH" ]; then
    COMPARE_STATUS=fail
    COMPARE_REASON=non_secret_metadata_changed
  fi
fi

TEMPORARY="$OUTPUT_DIR/.worktree-guard-$$.tmp"
jq -n \
  --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg head "$HEAD" \
  --arg pathHash "$PATH_HASH" \
  --arg metadataHash "$METADATA_HASH" \
  --arg envMetadataHash "$ENV_METADATA_HASH" \
  --arg compareStatus "$COMPARE_STATUS" \
  --arg compareReason "$COMPARE_REASON" \
  --argjson clean "$CLEAN" \
  --argjson fileCount "$FILE_COUNT" \
  --argjson statusEntryCount "$STATUS_COUNT" \
  '{
    capturedAt: $capturedAt,
    clean: $clean,
    compareReason: (if $compareReason == "null" then null else $compareReason end),
    compareStatus: $compareStatus,
    envMetadataHash: $envMetadataHash,
    fileCount: $fileCount,
    head: $head,
    metadataHash: $metadataHash,
    pathHash: $pathHash,
    statusEntryCount: $statusEntryCount,
    worktree: "/home/ubuntu/apps/chuan-market-radar"
  }' > "$TEMPORARY"
chmod 600 "$TEMPORARY"
mv "$TEMPORARY" "$OUTPUT"

if [ "$CLEAN" != true ] || [ "$COMPARE_STATUS" = fail ]; then
  echo '{"status":"fail","reason":"worktree_guard_failed"}' >&2
  exit 3
fi

echo '{"status":"pass"}'
