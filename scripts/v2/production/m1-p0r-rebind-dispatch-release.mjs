#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  prepareDispatch,
  publishDispatch,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";
import {
  DEFAULT_P0R_REBIND_POLICY,
  P0RRebindError,
  P0R_REBIND_ENTRYPOINT,
  canonicalJson,
  validateP0RRebindRequest,
} from "./m1-p0r-rebind-preflight.mjs";

const MAXIMUM_REQUEST_BYTES = 512 * 1024;
const COMMAND_OPTION_KEYS = Object.freeze({
  prepare: new Set([
    "approval-request",
    "bundle",
    "outbox",
    "private-key",
    "public-key",
  ]),
  publish: new Set([
    "branch",
    "outbox",
    "public-key",
    "remote",
    "repo",
  ]),
  "prepare-publish": new Set([
    "approval-request",
    "branch",
    "bundle",
    "outbox",
    "private-key",
    "public-key",
    "remote",
    "repo",
  ]),
});

function ensure(condition, reason) {
  if (!condition) throw new P0RRebindError(reason);
}

async function readCanonicalRequest(path) {
  const handle = await open(
    resolve(path),
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const facts = await handle.stat();
    ensure(
      facts.isFile() &&
        facts.size > 0 &&
        facts.size <= MAXIMUM_REQUEST_BYTES,
      "p0r_rebind_release_request_unsafe",
    );
    const raw = await handle.readFile();
    ensure(
      raw.length <= MAXIMUM_REQUEST_BYTES,
      "p0r_rebind_release_request_unsafe",
    );
    let request;
    try {
      request = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new P0RRebindError("p0r_rebind_release_request_invalid");
    }
    ensure(
      raw.toString("utf8") === canonicalJson(request),
      "p0r_rebind_release_request_not_canonical",
    );
    return request;
  } finally {
    await handle.close();
  }
}

export function deriveP0RRebindDispatch(request, { now = new Date() } = {}) {
  validateP0RRebindRequest(request, { now });
  return Object.freeze({
    dispatchId: request.dispatchId,
    entrypointPath: P0R_REBIND_ENTRYPOINT,
    expiresAt: request.approvalExpiresAt,
    issuedAt: request.approvalIssuedAt,
    launchSuccessMarker: request.launchSuccessMarker,
    packageId: request.packageId,
    revocationEpoch: request.revocationEpoch,
    runnerUnitName: request.runnerUnitName,
    runtimeMaxSeconds: request.dispatchRuntimeMaxSeconds,
    sourceRef: request.sourceRef,
    stagingDirectory: request.stagingDirectory,
    targetCommit: request.sourceCommit,
  });
}

export async function prepareP0RRebindDispatchRelease({
  approvalRequestPath,
  bundlePath,
  now = new Date(),
  outbox,
  privateKeyPath,
  publicKeyPath,
}) {
  const request = await readCanonicalRequest(approvalRequestPath);
  const dispatch = deriveP0RRebindDispatch(request, { now });
  const prepared = await prepareDispatch({
    approvalRequestPath,
    bundlePath,
    dispatch,
    outbox,
    privateKeyPath,
    now,
  });
  const validated = await validateOutbox(outbox, publicKeyPath, {
    now,
    sourceRefs: [request.sourceRef],
    stagingRoots: [DEFAULT_P0R_REBIND_POLICY.stagingRoot],
  });
  return Object.freeze({
    approvalRequestSha256: prepared.envelope.approvalRequestSha256,
    bundleSha256: prepared.envelope.bundleSha256,
    dispatchId: request.dispatchId,
    outbox: resolve(outbox),
    packageId: request.packageId,
    runtimeMaxSeconds: request.dispatchRuntimeMaxSeconds,
    sourceCommit: request.sourceCommit,
    status:
      validated.status === "PASS_SIGNED_DISPATCH_OUTBOX"
        ? "PASS_P0R_REBIND_BOUND_DISPATCH_RELEASE_PREPARED"
        : "BLOCKED_P0R_REBIND_BOUND_DISPATCH_RELEASE",
  });
}

export async function publishP0RRebindDispatchRelease({
  branch,
  outbox,
  publicKeyPath,
  remote = "origin",
  repo,
}) {
  return publishDispatch({
    branch,
    outbox,
    publicKeyPath,
    remote,
    repo,
  });
}

export function parseP0RRebindReleaseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(
    ["prepare", "publish", "prepare-publish"].includes(command),
    "p0r_rebind_release_command_invalid",
  );
  ensure(rest.length % 2 === 0, "p0r_rebind_release_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "p0r_rebind_release_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  ensure(
    Object.keys(options).every((key) => COMMAND_OPTION_KEYS[command].has(key)),
    "p0r_rebind_release_arguments_invalid",
  );
  return { command, options };
}

function requiredOption(options, key) {
  ensure(
    typeof options[key] === "string" && options[key].length > 0,
    `p0r_rebind_release_option_missing:${key}`,
  );
  return options[key];
}

async function main() {
  const { command, options } =
    parseP0RRebindReleaseArguments(process.argv.slice(2));
  let prepared;
  if (command === "prepare" || command === "prepare-publish") {
    prepared = await prepareP0RRebindDispatchRelease({
      approvalRequestPath: requiredOption(options, "approval-request"),
      bundlePath: requiredOption(options, "bundle"),
      outbox: requiredOption(options, "outbox"),
      privateKeyPath: requiredOption(options, "private-key"),
      publicKeyPath: requiredOption(options, "public-key"),
    });
  }
  let published;
  if (command === "publish" || command === "prepare-publish") {
    published = await publishP0RRebindDispatchRelease({
      branch: requiredOption(options, "branch"),
      outbox: requiredOption(options, "outbox"),
      publicKeyPath: requiredOption(options, "public-key"),
      remote: options.remote ?? "origin",
      repo: requiredOption(options, "repo"),
    });
  }
  process.stdout.write(canonicalJson({
    prepared: prepared ?? null,
    published: published ?? null,
    status:
      command === "prepare"
        ? prepared.status
        : command === "publish"
          ? published.status
          : "PASS_P0R_REBIND_BOUND_DISPATCH_RELEASE_PUBLISHED",
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason:
        error instanceof Error
          ? error.message
          : "p0r_rebind_release_unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
