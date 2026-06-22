#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://43.161.202.227}}"
STRICT_PROD_SMOKE="${STRICT_PROD_SMOKE:-false}"

python3 - "${BASE_URL}" "${STRICT_PROD_SMOKE}" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

base_url = sys.argv[1].rstrip("/")
strict = sys.argv[2].lower() in {"1", "true", "yes", "on"}

errors: list[str] = []
warnings: list[str] = []


def fetch(path: str, *, expect_json: bool = False, timeout: int = 25):
    url = f"{base_url}{path}"
    req = urllib.request.Request(url, headers={"cache-control": "no-store", "user-agent": "chuan-prod-smoke/1.0"})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
            elapsed_ms = round((time.time() - started) * 1000)
            if response.status < 200 or response.status >= 300:
                errors.append(f"{path}: HTTP {response.status}")
            if expect_json:
                try:
                    return response.status, elapsed_ms, json.loads(body)
                except json.JSONDecodeError as exc:
                    errors.append(f"{path}: invalid JSON: {exc}")
                    return response.status, elapsed_ms, {}
            return response.status, elapsed_ms, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        errors.append(f"{path}: HTTP {exc.code} {body[:240]}")
    except Exception as exc:
        errors.append(f"{path}: {type(exc).__name__}: {exc}")
    return 0, 0, {} if expect_json else ""


print(f"== Public smoke: {base_url} ==")

for page in ["/", "/dashboard", "/signals", "/leaderboard", "/market", "/review", "/system"]:
    status, elapsed_ms, _ = fetch(page)
    print(f"page {page}: {status} {elapsed_ms}ms")

health_status, health_ms, health_body = fetch("/api/health", expect_json=True)
print(f"api /api/health: {health_status} {health_ms}ms")
if not health_body.get("ok"):
    errors.append("/api/health: ok is not true")
health = health_body.get("health") or {}
print(
    "health-summary",
    json.dumps(
        {
            "level": health.get("level"),
            "source": (health.get("dataSource") or {}).get("activeSource"),
            "database": (health.get("persistence") or {}).get("databaseStatus"),
            "scan": health.get("scan"),
        },
        ensure_ascii=False,
    ),
)

radar_status, radar_ms, radar_body = fetch("/api/frontend/radar-contract", expect_json=True)
print(f"api /api/frontend/radar-contract: {radar_status} {radar_ms}ms")
if not radar_body.get("ok"):
    errors.append("/api/frontend/radar-contract: ok is not true")
contract = radar_body.get("contract") or {}
scan_proof = ((contract.get("scanProof") or {}).get("data") or {})
scan_stability = contract.get("scanStability") or {}
scan_stability_data = scan_stability.get("data") or {}
print(
    "scan-proof",
    json.dumps(
        {
            "totalMonitored": scan_proof.get("totalMonitored"),
            "scannable": scan_proof.get("scannable"),
            "lightScanned": scan_proof.get("lightScanned"),
            "deepScanned": scan_proof.get("deepScanned"),
            "awaitingDeepScan": scan_proof.get("awaitingDeepScan"),
            "coverage": scan_proof.get("coverage"),
            "lastScanAt": scan_proof.get("lastScanAt"),
        },
        ensure_ascii=False,
    ),
)
print(
    "scan-stability",
    json.dumps(
        {
            "status": scan_stability.get("status"),
            "summary": scan_stability_data.get("summary"),
            "issues": [issue.get("code") for issue in scan_stability_data.get("issues", [])],
        },
        ensure_ascii=False,
    ),
)

required_contract_keys = ["scanProof", "deepScanQueue", "radarSignals", "serviceNodes", "dataSources"]
for key in required_contract_keys:
    if key not in contract:
        errors.append(f"/api/frontend/radar-contract: missing contract.{key}")

leaderboard_status, leaderboard_ms, leaderboard_body = fetch("/api/frontend/leaderboard?kind=volume", expect_json=True)
print(f"api /api/frontend/leaderboard?kind=volume: {leaderboard_status} {leaderboard_ms}ms")
leaderboard = leaderboard_body.get("leaderboard") or {}
leaderboard_rows = leaderboard.get("data") or []
print(
    "leaderboard",
    json.dumps(
        {
            "status": leaderboard.get("status"),
            "rows": len(leaderboard_rows),
            "sample": [
                {
                    "symbol": row.get("symbol"),
                    "value": row.get("value"),
                    "deepScanned": row.get("deepScanned"),
                    "awaitingScan": row.get("awaitingScan"),
                }
                for row in leaderboard_rows[:5]
            ],
        },
        ensure_ascii=False,
    ),
)
if leaderboard.get("status") == "empty" or not leaderboard_rows:
    warnings.append("/api/frontend/leaderboard?kind=volume: leaderboard is empty")

review_status, review_ms, review_body = fetch("/api/frontend/review-contract", expect_json=True)
print(f"api /api/frontend/review-contract: {review_status} {review_ms}ms")
if not review_body.get("ok"):
    errors.append("/api/frontend/review-contract: ok is not true")

backend_status, backend_ms, backend_body = fetch("/api/radar/backend-contract", expect_json=True)
print(f"api /api/radar/backend-contract: {backend_status} {backend_ms}ms")
if not backend_body.get("ok", True) and "source" not in backend_body:
    errors.append("/api/radar/backend-contract: unexpected body")
backend_scan = backend_body.get("scanProof") or {}
deep_scan = backend_scan.get("deepScan") or {}
print(
    "backend-deep-scan",
    json.dumps(
        {
            "planned": deep_scan.get("plannedRequests"),
            "rawRows": deep_scan.get("rawRows"),
            "cleanRows": deep_scan.get("cleanRows"),
            "emptyResultAssets": (deep_scan.get("emptyResultAssets") or [])[:12],
        },
        ensure_ascii=False,
    ),
)
if deep_scan.get("plannedRequests", 0) and not deep_scan.get("cleanRows", 0):
    warnings.append("/api/radar/backend-contract: CoinGlass planned requests but returned 0 clean rows")

if errors:
    print("== HARD FAILURES ==", file=sys.stderr)
    for item in errors:
        print(f"- {item}", file=sys.stderr)

if warnings:
    print("== WARNINGS ==", file=sys.stderr)
    for item in warnings:
        print(f"- {item}", file=sys.stderr)

if errors or (strict and warnings):
    raise SystemExit(1)

print("prod-smoke ok")
PY
