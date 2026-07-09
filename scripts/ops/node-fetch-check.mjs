#!/usr/bin/env node
import {
  DEFAULT_TARGETS,
  curlTarget,
  nativeFetchTarget,
  parseArgs,
  proxyMode,
  summarizeResults,
} from "./ops-fetch.mjs";

const args = parseArgs();
const generatedAt = new Date().toISOString();
const directTargets = [];
const proxyTargets = [];

for (const target of DEFAULT_TARGETS) {
  directTargets.push(await nativeFetchTarget(target, { timeoutMs: args.timeoutMs }));
}

if (args.proxy) {
  for (const target of DEFAULT_TARGETS) {
    proxyTargets.push(await curlTarget(target, {
      timeoutMs: args.timeoutMs,
      proxy: args.proxy,
    }));
  }
}

const directSummary = summarizeResults(directTargets);
const proxySummary = args.proxy
  ? summarizeResults(proxyTargets)
  : { total: 0, reachable: 0, failed: 0, status: "unknown" };

const report = {
  task: "ops_node_fetch_check",
  generatedAt,
  proxy: {
    env: args.proxy ? "set" : "unset",
    enabled: Boolean(args.proxy),
    mode: args.proxy ? `${proxyMode(args.proxy)}_curlFallback` : "none",
    source: args.proxy ? "OPS_PROXY_URL_or_--proxy" : "none",
    value: args.proxy ? "[REDACTED_PROXY_URL]" : null,
    limitation:
      "Node native fetch in this project has no checked-in proxy agent dependency; proxy mode is intentionally implemented as curlFallback for ops-only diagnostics.",
  },
  direct: {
    runner: "node_native_fetch",
    targets: directTargets,
    summary: directSummary,
  },
  proxyResults: {
    runner: args.proxy ? "curlFallback" : "not_run",
    targets: proxyTargets,
    summary: proxySummary,
  },
  summary: {
    direct: directSummary.status,
    proxy: args.proxy ? proxySummary.status : "unknown",
    nodeFetch: directSummary.status,
    safeToRunMarketRadarOps: args.proxy
      ? ["pass", "partial"].includes(proxySummary.status)
      : ["pass", "partial"].includes(directSummary.status),
  },
};

console.log(JSON.stringify(report, null, 2));
