#!/usr/bin/env node
import {
  DEFAULT_TARGETS,
  curlTarget,
  parseArgs,
  proxyMode,
  summarizeResults,
} from "./ops-fetch.mjs";

const args = parseArgs();
const generatedAt = new Date().toISOString();
const directTargets = [];
const proxyTargets = [];

for (const target of DEFAULT_TARGETS) {
  directTargets.push(await curlTarget(target, { timeoutMs: args.timeoutMs }));
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
  task: "ops_network_check",
  generatedAt,
  proxy: {
    env: args.proxy ? "set" : "unset",
    enabled: Boolean(args.proxy),
    mode: proxyMode(args.proxy),
    source: args.proxy ? "OPS_PROXY_URL_or_--proxy" : "none",
    value: args.proxy ? "[REDACTED_PROXY_URL]" : null,
  },
  direct: {
    runner: "curl",
    targets: directTargets,
    summary: directSummary,
  },
  proxyResults: {
    runner: args.proxy ? "curl" : "not_run",
    targets: proxyTargets,
    summary: proxySummary,
  },
  summary: {
    direct: directSummary.status,
    proxy: args.proxy ? proxySummary.status : "unknown",
    nodeFetch: "not_checked_by_this_script",
    safeToRunMarketRadarOps: args.proxy
      ? ["pass", "partial"].includes(proxySummary.status)
      : ["pass", "partial"].includes(directSummary.status),
  },
};

console.log(JSON.stringify(report, null, 2));
