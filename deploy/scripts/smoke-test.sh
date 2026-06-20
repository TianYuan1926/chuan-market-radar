#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1}"

curl --fail --show-error --silent "${BASE_URL}/api/health" > /tmp/chuan-health.json
curl --fail --show-error --silent "${BASE_URL}/api/radar" > /tmp/chuan-radar.json
curl --fail --show-error --silent "${BASE_URL}/api/archive" > /tmp/chuan-archive.json

echo "health ok: /tmp/chuan-health.json"
echo "radar ok: /tmp/chuan-radar.json"
echo "archive ok: /tmp/chuan-archive.json"
