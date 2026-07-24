#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
  LiveRuntimeAdapterError,
  canonicalJson,
  sha256,
  validateLiveRuntimeAdapterDispatchEnvelope,
  validateLiveRuntimeAdapterRequest,
} from "./m1-runtime-adapter-live-runner.mjs";

const MAX_JSON_BYTES = 512 * 1024;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new LiveRuntimeAdapterError(reason, details);
}

async function readRegularFile(path, reason, maxBytes) {
  const facts = await lstat(path);
  ensure(
    facts.isFile() && !facts.isSymbolicLink() && facts.size <= maxBytes,
    reason,
  );
  return readFile(path);
}

async function readCanonicalJson(path, reason) {
  const raw = await readRegularFile(path, reason, MAX_JSON_BYTES);
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new LiveRuntimeAdapterError(reason);
  }
  ensure(canonicalJson(value) === raw.toString("utf8"), reason);
  return { raw, value };
}

export async function preflightLiveRuntimeAdapterDispatch({
  bundlePath,
  dispatchPath,
  now = new Date(),
  policy = DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
  requestPath,
}) {
  const requestFile = resolve(requestPath);
  const dispatchFile = resolve(dispatchPath);
  const bundleFile = resolve(bundlePath);
  const { raw: requestRaw, value: request } = await readCanonicalJson(
    requestFile,
    "runtime_dispatch_preflight_request_invalid",
  );
  const { value: envelope } = await readCanonicalJson(
    dispatchFile,
    "runtime_dispatch_preflight_envelope_invalid",
  );
  validateLiveRuntimeAdapterRequest(request, { now, policy });
  const bundle = await readRegularFile(
    bundleFile,
    "runtime_dispatch_preflight_bundle_invalid",
    MAX_BUNDLE_BYTES,
  );
  const bundleSha256 = sha256(bundle);
  validateLiveRuntimeAdapterDispatchEnvelope({
    envelope,
    marker: bundleSha256,
    request,
    requestRaw,
  });
  return Object.freeze({
    approvalRequestSha256: sha256(requestRaw),
    bundleSha256,
    dispatchId: request.dispatchId,
    packageId: request.packageId,
    runtimeDeadlineSeconds: request.runtimeDeadlineSeconds,
    runtimeMaxSeconds: envelope.runtimeMaxSeconds,
    sourceCommit: request.sourceCommit,
    sourceRef: request.sourceRef,
    status: "PASS_M1_4B_DISPATCH_CROSS_LAYER_PREFLIGHT",
  });
}

function parseArguments(argv) {
  ensure(argv.length === 6, "runtime_dispatch_preflight_arguments_invalid");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(
      ["--bundle", "--dispatch", "--request"].includes(key) &&
        typeof value === "string" &&
        value.length > 0 &&
        options[key.slice(2)] === undefined,
      "runtime_dispatch_preflight_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  ensure(
    options.bundle && options.dispatch && options.request,
    "runtime_dispatch_preflight_arguments_invalid",
  );
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await preflightLiveRuntimeAdapterDispatch({
    bundlePath: options.bundle,
    dispatchPath: options.dispatch,
    requestPath: options.request,
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${canonicalJson({
      reason:
        error instanceof LiveRuntimeAdapterError
          ? error.reason
          : "unexpected_error",
      status: "BLOCKED",
    })}`);
    process.exitCode = 1;
  });
}
