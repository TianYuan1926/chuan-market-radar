#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://43.161.202.227}}"
STRICT_PROD_SMOKE="${STRICT_PROD_SMOKE:-false}"

python3 - "${BASE_URL}" "${STRICT_PROD_SMOKE}" <<'PY'
import json
import re
import sys
import time
import urllib.error
import urllib.request

base_url = sys.argv[1].rstrip("/")
strict = sys.argv[2].lower() in {"1", "true", "yes", "on"}

errors: list[str] = []
warnings: list[str] = []

BASE_ASSET_RE = re.compile(r"^[A-Z0-9]{1,30}$")
USDT_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,30}USDT(?:\.P)?$")
OKX_SWAP_RE = re.compile(r"^[A-Z0-9]{1,30}-USDT-SWAP$")
TV_SYMBOL_RE = re.compile(r"^[A-Z]+:[A-Z0-9]{1,30}USDT(?:\.P)?$")
CJK_RE = re.compile(r"[\u3400-\u9fff]")
SYMBOL_KEY_RE = re.compile(
    r"(?:^|\.|_)(symbol|symbols|baseAsset|base_asset|asset|assets|selectedAssets|"
    r"pendingAssets|scannedAssets|boostedAssets|topAssets|emptyResultAssets|tokens|"
    r"currentBatch|nextBatch|highPriority|coldExploration|longUnscanned)(?:$|\.|_|\[)",
    re.IGNORECASE,
)


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


def walk(value, path="root"):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{path}[{index}]")
    else:
        yield path, value


def is_symbol_like_path(path: str) -> bool:
    return bool(SYMBOL_KEY_RE.search(path))


def is_valid_symbolish(value: str) -> bool:
    normalized = value.strip().upper()
    if not normalized:
        return True
    if BASE_ASSET_RE.fullmatch(normalized):
        return True
    if USDT_SYMBOL_RE.fullmatch(normalized):
        return True
    if OKX_SWAP_RE.fullmatch(normalized):
        return True
    if TV_SYMBOL_RE.fullmatch(normalized):
        return True
    return False


def validate_no_polluted_symbols(label: str, payload):
    samples = []
    for path, value in walk(payload, label):
        if not isinstance(value, str) or not is_symbol_like_path(path):
            continue
        if CJK_RE.search(value) or not is_valid_symbolish(value):
            samples.append(f"{path}={value}")
    if samples:
        errors.append(f"{label}: polluted or invalid symbol fields: {samples[:12]}")


def positive_number(value) -> bool:
    return isinstance(value, (int, float)) and value > 0


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
validate_no_polluted_symbols("radar-contract", contract)
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
if scan_proof.get("scannable", 0) >= 100 and scan_proof.get("lightScanned", 0) >= scan_proof.get("scannable", 0) and scan_proof.get("coverage", 0) < 95:
    errors.append("/api/frontend/radar-contract: light scan coverage is inconsistent with scannable/lightScanned counts")

for kind in ["volume", "gainers", "losers"]:
    leaderboard_status, leaderboard_ms, leaderboard_body = fetch(f"/api/frontend/leaderboard?kind={kind}", expect_json=True)
    print(f"api /api/frontend/leaderboard?kind={kind}: {leaderboard_status} {leaderboard_ms}ms")
    leaderboard = leaderboard_body.get("leaderboard") or {}
    leaderboard_rows = leaderboard.get("data") or []
    validate_no_polluted_symbols(f"leaderboard-{kind}", leaderboard)
    print(
        f"leaderboard-{kind}",
        json.dumps(
            {
                "status": leaderboard.get("status"),
                "rows": len(leaderboard_rows),
                "sample": [
                    {
                        "symbol": row.get("symbol"),
                        "price": row.get("price"),
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
        warnings.append(f"/api/frontend/leaderboard?kind={kind}: leaderboard is empty")
    zero_or_missing_prices = [
        row.get("symbol")
        for row in leaderboard_rows
        if not positive_number(row.get("price"))
    ]
    if zero_or_missing_prices:
        errors.append(f"/api/frontend/leaderboard?kind={kind}: missing or zero prices for {zero_or_missing_prices[:12]}")

review_status, review_ms, review_body = fetch("/api/frontend/review-contract", expect_json=True)
print(f"api /api/frontend/review-contract: {review_status} {review_ms}ms")
if not review_body.get("ok"):
    errors.append("/api/frontend/review-contract: ok is not true")

backend_status, backend_ms, backend_body = fetch("/api/radar/backend-contract", expect_json=True)
print(f"api /api/radar/backend-contract: {backend_status} {backend_ms}ms")
if not backend_body.get("ok", True) and "source" not in backend_body and "contract" not in backend_body:
    errors.append("/api/radar/backend-contract: unexpected body")
backend_contract = backend_body.get("contract") or backend_body
validate_no_polluted_symbols("backend-contract", backend_contract)
backend_scan = backend_contract.get("scanProof") or {}
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
