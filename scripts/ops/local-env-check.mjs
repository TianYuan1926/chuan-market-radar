#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs, proxyMode } from "./ops-fetch.mjs";

const execFileAsync = promisify(execFile);
const args = parseArgs();

async function run(command, commandArgs = [], options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout: options.timeoutMs || 10000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      stdout: String(stdout || "").trim(),
      stderr: String(stderr || "").trim(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
      error: {
        code: error.code || null,
        message: String(error.message || "command_failed").slice(0, 500),
      },
    };
  }
}

function proxyEnvStatus() {
  const keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];
  return Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
}

function redactProxyOutput(text) {
  return String(text || "")
    .replace(/ProxyUsername\s*:\s*.*/gi, "ProxyUsername : [REDACTED]")
    .replace(/ProxyPassword\s*:\s*.*/gi, "ProxyPassword : [REDACTED]")
    .slice(0, 4000);
}

async function dnsCheck(name) {
  const dscache = await run("dscacheutil", ["-q", "host", "-a", "name", name], { timeoutMs: 8000 });
  if (dscache.ok && dscache.stdout) {
    const suspicious = isSuspiciousDnsOutput(dscache.stdout);
    return {
      name,
      method: "dscacheutil",
      ok: !suspicious,
      suspicious,
      output: dscache.stdout.split("\n").slice(0, 12),
    };
  }

  const nslookup = await run("nslookup", [name], { timeoutMs: 8000 });
  const suspicious = isSuspiciousDnsOutput(nslookup.stdout || nslookup.stderr);
  return {
    name,
    method: "nslookup",
    ok: nslookup.ok && !suspicious,
    suspicious,
    output: String(nslookup.stdout || nslookup.stderr || "").split("\n").slice(0, 20),
    error: nslookup.error,
  };
}

function isSuspiciousDnsOutput(output) {
  const text = String(output || "");
  return /\b0\.0\.0\.0\b|\b169\.254\.|\bipv6_address:\s*::\b/i.test(text);
}

const ncProxy = await run("nc", ["-z", "127.0.0.1", "7892"], { timeoutMs: 3000 });
const scutilProxy = await run("scutil", ["--proxy"], { timeoutMs: 8000 });
const dnsResults = [
  await dnsCheck("raw.githubusercontent.com"),
  await dnsCheck("www.okx.com"),
  await dnsCheck("github.com"),
];

const shellProxyEnv = proxyEnvStatus();
const shellProxyEnvExists = Object.values(shellProxyEnv).some(Boolean);
const systemProxyDetected = /HTTPEnable\s*:\s*1|HTTPSEnable\s*:\s*1|SOCKSEnable\s*:\s*1/i.test(scutilProxy.stdout);
const dnsAnomalyDetected = dnsResults.some((item) => !item.ok);

const report = {
  task: "ops_local_env_check",
  generatedAt: new Date().toISOString(),
  proxy: {
    env: args.proxy ? "set" : "unset",
    enabled: Boolean(args.proxy),
    mode: proxyMode(args.proxy),
    source: args.proxy ? "OPS_PROXY_URL_or_--proxy" : "none",
    value: args.proxy ? "[REDACTED_PROXY_URL]" : null,
  },
  shellProxyEnv,
  shellProxyEnvExists,
  suspectedProxyPort: {
    host: "127.0.0.1",
    port: 7892,
    listening: ncProxy.ok,
  },
  macosSystemProxy: {
    commandAvailable: scutilProxy.ok,
    detected: systemProxyDetected,
    redactedOutput: redactProxyOutput(scutilProxy.stdout || scutilProxy.stderr),
  },
  dns: {
    anomalyDetected: dnsAnomalyDetected,
    results: dnsResults,
  },
  guiCliProxySplitLikely: systemProxyDetected && !shellProxyEnvExists,
  summary: {
    localProxyPortReady: ncProxy.ok,
    shellProxyEnv: shellProxyEnvExists ? "present" : "absent",
    macosSystemProxy: systemProxyDetected ? "present" : "absent_or_unknown",
    dns: dnsAnomalyDetected ? "partial" : "pass",
    safeToRunMarketRadarOpsWithExplicitProxy: Boolean(args.proxy && ncProxy.ok),
  },
};

console.log(JSON.stringify(report, null, 2));
