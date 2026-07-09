#!/usr/bin/env node
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_TARGETS = [
  {
    name: "github",
    url: "https://github.com",
    method: "HEAD",
  },
  {
    name: "github_raw",
    url: "https://raw.githubusercontent.com",
    method: "HEAD",
  },
  {
    name: "github_api",
    url: "https://api.github.com",
    method: "GET",
  },
  {
    name: "binance_futures_time",
    url: "https://fapi.binance.com/fapi/v1/time",
    method: "GET",
  },
  {
    name: "okx",
    url: "https://www.okx.com",
    method: "HEAD",
  },
  {
    name: "bybit",
    url: "https://api.bybit.com",
    method: "GET",
  },
  {
    name: "tencent_production_health",
    url: "http://43.161.202.227/api/health",
    method: "GET",
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    proxy: process.env.OPS_PROXY_URL || "",
    timeoutMs: 10000,
    json: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--proxy") {
      parsed.proxy = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--proxy=")) {
      parsed.proxy = arg.slice("--proxy=".length);
    } else if (arg === "--timeout-ms") {
      parsed.timeoutMs = Number(argv[index + 1] || parsed.timeoutMs);
      index += 1;
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    }
  }

  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    parsed.timeoutMs = 10000;
  }

  return parsed;
}

export function proxyMode(proxyUrl) {
  if (!proxyUrl) return "none";
  if (proxyUrl.startsWith("http://") || proxyUrl.startsWith("https://")) return "http";
  if (proxyUrl.startsWith("socks5://") || proxyUrl.startsWith("socks5h://")) return "socks5";
  return "unsupported";
}

export function curlProxyArg(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks5://")) {
    return proxyUrl.replace(/^socks5:\/\//, "socks5h://");
  }
  return proxyUrl;
}

export function isNetworkReachableStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599;
}

export function classifyResult(result) {
  if (result.networkReachable) return "pass";
  if (result.error) return "fail";
  return "unknown";
}

export function summarizeResults(results) {
  const total = results.length;
  const reachable = results.filter((item) => item.networkReachable).length;
  const failed = results.filter((item) => !item.networkReachable).length;
  let status = "unknown";
  if (total > 0 && reachable === total) status = "pass";
  else if (reachable > 0 && failed > 0) status = "partial";
  else if (total > 0 && reachable === 0) status = "fail";

  return {
    total,
    reachable,
    failed,
    status,
  };
}

export async function nativeFetchTarget(target, options = {}) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const response = await fetch(target.url, {
      method: target.method || "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "market-radar-ops-network-check/1.0",
      },
    });

    return {
      name: target.name,
      url: target.url,
      method: target.method || "GET",
      status: response.status,
      ok: response.ok,
      networkReachable: isNetworkReachableStatus(response.status),
      elapsedMs: Math.round(performance.now() - startedAt),
      error: null,
    };
  } catch (error) {
    return {
      name: target.name,
      url: target.url,
      method: target.method || "GET",
      status: null,
      ok: false,
      networkReachable: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: normalizeError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function curlTarget(target, options = {}) {
  const startedAt = performance.now();
  const timeoutSeconds = Math.max(1, Math.ceil((options.timeoutMs || 10000) / 1000));
  const args = [
    "-sS",
    "-L",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "--connect-timeout",
    String(timeoutSeconds),
    "--max-time",
    String(timeoutSeconds + 5),
  ];

  const proxy = options.proxy ? curlProxyArg(options.proxy) : null;
  if (proxy) {
    args.push("-x", proxy);
  }

  if ((target.method || "GET").toUpperCase() === "HEAD") {
    args.push("-I");
  }

  args.push(target.url);

  try {
    const { stdout } = await execFileAsync("curl", args, {
      timeout: (timeoutSeconds + 8) * 1000,
      maxBuffer: 1024 * 1024,
    });
    const rawStatus = String(stdout || "").trim().split(/\s+/).pop();
    const status = Number.parseInt(rawStatus, 10);
    return {
      name: target.name,
      url: target.url,
      method: target.method || "GET",
      status: Number.isInteger(status) ? status : null,
      ok: Number.isInteger(status) && status >= 200 && status < 400,
      networkReachable: isNetworkReachableStatus(status),
      elapsedMs: Math.round(performance.now() - startedAt),
      error: null,
    };
  } catch (error) {
    const status = parseCurlStatus(error.stdout);
    return {
      name: target.name,
      url: target.url,
      method: target.method || "GET",
      status,
      ok: Number.isInteger(status) && status >= 200 && status < 400,
      networkReachable: isNetworkReachableStatus(status),
      elapsedMs: Math.round(performance.now() - startedAt),
      error: status ? null : normalizeError(error),
    };
  }
}

export function normalizeError(error) {
  if (!error) return null;
  const message = String(error.message || error.code || error.name || "unknown_error");
  const code = error.code ? String(error.code) : null;
  const name = error.name ? String(error.name) : null;
  return {
    name,
    code,
    message: message.slice(0, 500),
  };
}

function parseCurlStatus(stdout) {
  const value = String(stdout || "").trim().split(/\s+/).pop();
  const status = Number.parseInt(value, 10);
  return Number.isInteger(status) ? status : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const target = DEFAULT_TARGETS[0];
  const result = await nativeFetchTarget(target, args);
  console.log(JSON.stringify(result, null, 2));
}
