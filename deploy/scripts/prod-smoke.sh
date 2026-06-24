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
SYMBOL_LEAF_RE = re.compile(r"\.(?:symbol|baseAsset|base_asset|asset)$", re.IGNORECASE)
SYMBOL_ARRAY_ITEM_RE = re.compile(
    r"\.(?:selectedAssets|pendingAssets|scannedAssets|boostedAssets|emptyResultAssets|"
    r"currentBatch|nextBatch|highPriority|coldExploration|longUnscanned)\[\d+\]$",
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
    return bool(SYMBOL_LEAF_RE.search(path) or SYMBOL_ARRAY_ITEM_RE.search(path))


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

required_contract_keys = ["scanProof", "deepScanQueue", "radarSignals", "serviceNodes", "dataSources", "realtimeCapability"]
for key in required_contract_keys:
    if key not in contract:
        errors.append(f"/api/frontend/radar-contract: missing contract.{key}")
if scan_proof.get("scannable", 0) >= 100 and scan_proof.get("lightScanned", 0) >= scan_proof.get("scannable", 0) and scan_proof.get("coverage", 0) < 95:
    errors.append("/api/frontend/radar-contract: light scan coverage is inconsistent with scannable/lightScanned counts")

realtime_capability = contract.get("realtimeCapability") or {}
realtime_data = realtime_capability.get("data") or {}
realtime_lanes = realtime_data.get("lanes") or []
print(
    "realtime-capability",
    json.dumps(
        {
            "status": realtime_capability.get("status"),
            "secondLevelOnline": realtime_data.get("secondLevelOnline"),
            "lanes": len(realtime_lanes),
            "failedLanes": [lane.get("key") for lane in realtime_lanes if lane.get("status") in {"failed", "error"}],
        },
        ensure_ascii=False,
    ),
)
if realtime_data.get("schemaVersion") != "realtime-capability.v1":
    errors.append("/api/frontend/radar-contract: realtimeCapability schemaVersion is missing")
if not realtime_lanes:
    errors.append("/api/frontend/radar-contract: realtimeCapability has no lanes")
if any(lane.get("canCreateTradeSignal") is not False for lane in realtime_lanes):
    errors.append("/api/frontend/radar-contract: realtimeCapability lanes must not create trade signals")
if not any("秒级数据只负责发现异常" in str(rule) for rule in realtime_data.get("boundaries", [])):
    errors.append("/api/frontend/radar-contract: realtimeCapability missing second-level boundary")

sample_token_for_dossier = None
for kind in ["volume", "gainers", "losers"]:
    leaderboard_status, leaderboard_ms, leaderboard_body = fetch(f"/api/frontend/leaderboard?kind={kind}", expect_json=True)
    print(f"api /api/frontend/leaderboard?kind={kind}: {leaderboard_status} {leaderboard_ms}ms")
    leaderboard = leaderboard_body.get("leaderboard") or {}
    leaderboard_rows = leaderboard.get("data") or []
    if kind == "volume" and leaderboard_rows:
        sample_token_for_dossier = leaderboard_rows[0]
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

if sample_token_for_dossier:
    symbol = sample_token_for_dossier.get("symbol")
    price = sample_token_for_dossier.get("price")
    token_status, token_ms, token_body = fetch(f"/api/frontend/token-dossier?symbol={symbol}&basePrice={price}", expect_json=True)
    print(f"api /api/frontend/token-dossier?symbol={symbol}: {token_status} {token_ms}ms")
    if not token_body.get("ok"):
        errors.append("/api/frontend/token-dossier: ok is not true")
    token_dossier = (token_body.get("dossier") or {}).get("data") or {}
    chart = token_dossier.get("chart") or {}
    print(
        "token-chart",
        json.dumps(
            {
                "symbol": token_dossier.get("symbol"),
                "chartStatus": chart.get("status"),
                "tradingViewSymbol": chart.get("tradingViewSymbol"),
                "overlaySource": chart.get("overlaySource"),
                "canUseMockCandles": chart.get("canUseMockCandles"),
            },
            ensure_ascii=False,
        ),
    )
    if chart.get("canUseMockCandles") is not False:
        errors.append("/api/frontend/token-dossier: chart.canUseMockCandles must be false")
    if chart.get("tradingViewSymbol") and not TV_SYMBOL_RE.fullmatch(str(chart.get("tradingViewSymbol"))):
        errors.append(f"/api/frontend/token-dossier: invalid TradingView symbol {chart.get('tradingViewSymbol')}")

review_status, review_ms, review_body = fetch("/api/frontend/review-contract", expect_json=True)
print(f"api /api/frontend/review-contract: {review_status} {review_ms}ms")
if not review_body.get("ok"):
    errors.append("/api/frontend/review-contract: ok is not true")

external_status, external_ms, external_body = fetch("/api/frontend/external-intel", expect_json=True)
print(f"api /api/frontend/external-intel: {external_status} {external_ms}ms")
if not external_body.get("ok"):
    errors.append("/api/frontend/external-intel: ok is not true")
external_contract = external_body.get("contract") or {}
external_data = external_contract.get("data") or {}
external_sources = external_data.get("sourcePlan") or []
external_guardrails = external_data.get("guardrails") or []
print(
    "external-intel",
    json.dumps(
        {
            "status": external_contract.get("status"),
            "sources": len(external_sources),
            "events": len(external_data.get("events") or []),
        },
        ensure_ascii=False,
    ),
)
if not external_sources:
    errors.append("/api/frontend/external-intel: missing source plan")
if not any("不绕过" in str(item) for item in external_guardrails):
    errors.append("/api/frontend/external-intel: missing legal crawl guardrail")

backend_status, backend_ms, backend_body = fetch("/api/radar/backend-contract", expect_json=True)
print(f"api /api/radar/backend-contract: {backend_status} {backend_ms}ms")
if not backend_body.get("ok", True) and "source" not in backend_body and "contract" not in backend_body:
    errors.append("/api/radar/backend-contract: unexpected body")
backend_contract = backend_body.get("contract") or backend_body
validate_no_polluted_symbols("backend-contract", backend_contract)
backend_scan = backend_contract.get("scanProof") or {}
deep_scan = backend_scan.get("deepScan") or {}
planned_deep_scan_requests = deep_scan.get("coinGlassRequestsPlanned", deep_scan.get("plannedRequests", 0))
coin_glass_failures = ((backend_contract.get("sourceAudit") or {}).get("coinGlassDeepScan") or {}).get("requestFailures") or []
print(
    "backend-deep-scan",
    json.dumps(
        {
            "planned": planned_deep_scan_requests,
            "rawRows": deep_scan.get("rawRows"),
            "cleanRows": deep_scan.get("cleanRows"),
            "emptyResultAssets": (deep_scan.get("emptyResultAssets") or [])[:12],
            "failureSample": coin_glass_failures[:3],
        },
        ensure_ascii=False,
    ),
)
if planned_deep_scan_requests and not deep_scan.get("cleanRows", 0):
    if any("upgrade plan" in str(item.get("error", "")).lower() for item in coin_glass_failures if isinstance(item, dict)):
        warnings.append("/api/radar/backend-contract: CoinGlass futures endpoint requires an upgraded plan for this key")
    else:
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
