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
  DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  P0R_TRANSPORT_STAGE_ENTRYPOINT,
  canonicalJson,
  validateP0RTransportStageRequest,
} from "./m1-p0r-transport-staging.mjs";

const MAX_REQUEST_BYTES = 512 * 1024;
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
  if (!condition) throw new Error(reason);
}

async function readCanonicalRequest(path) {
  let bytes;
  let handle;
  try {
    handle = await open(
      resolve(path),
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    ensure(
      before.isFile() &&
        before.size > 0n &&
        before.size <= BigInt(MAX_REQUEST_BYTES),
      "p0r_transport_stage_release_request_unsafe",
    );
    bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    ensure(
      bytes.length === Number(before.size) &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      "p0r_transport_stage_release_request_unsafe",
    );
  } catch {
    throw new Error("p0r_transport_stage_release_request_unsafe");
  } finally {
    if (handle) await handle.close();
  }
  let request;
  try {
    request = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("p0r_transport_stage_release_request_invalid");
  }
  ensure(
    bytes.toString("utf8") === canonicalJson(request),
    "p0r_transport_stage_release_request_not_canonical",
  );
  return request;
}

export function deriveP0RTransportStageDispatch(
  request,
  {
    now = new Date(),
    policy = DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  } = {},
) {
  validateP0RTransportStageRequest(request, { now, policy });
  return Object.freeze({
    dispatchId: request.dispatchId,
    entrypointPath: P0R_TRANSPORT_STAGE_ENTRYPOINT,
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

export async function prepareP0RTransportStageRelease({
  approvalRequestPath,
  bundlePath,
  now = new Date(),
  outbox,
  privateKeyPath,
  publicKeyPath,
}) {
  const request = await readCanonicalRequest(approvalRequestPath);
  const prepared = await prepareDispatch({
    approvalRequestPath,
    bundlePath,
    dispatch: deriveP0RTransportStageDispatch(request, { now }),
    outbox,
    privateKeyPath,
    now,
  });
  const validated = await validateOutbox(outbox, publicKeyPath, {
    now,
    sourceRefs: [request.sourceRef],
    stagingRoots: [DEFAULT_P0R_TRANSPORT_STAGE_POLICY.stagingRoot],
  });
  return Object.freeze({
    approvalRequestSha256: prepared.envelope.approvalRequestSha256,
    bundleSha256: prepared.envelope.bundleSha256,
    dispatchId: request.dispatchId,
    innerTransportBundleSha256: request.innerTransportBundleSha256,
    outbox: resolve(outbox),
    packageId: request.packageId,
    sourceCommit: request.sourceCommit,
    status:
      validated.status === "PASS_SIGNED_DISPATCH_OUTBOX"
        ? "PASS_P0R_TRANSPORT_STAGE_RELEASE_PREPARED"
        : "BLOCKED_P0R_TRANSPORT_STAGE_RELEASE",
  });
}

export async function publishP0RTransportStageRelease({
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

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(
    ["prepare", "publish", "prepare-publish"].includes(command),
    "p0r_transport_stage_release_command_invalid",
  );
  ensure(
    rest.length % 2 === 0,
    "p0r_transport_stage_release_arguments_invalid",
  );
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "p0r_transport_stage_release_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  ensure(
    Object.keys(options).every(
      (key) => COMMAND_OPTION_KEYS[command].has(key),
    ),
    "p0r_transport_stage_release_arguments_invalid",
  );
  return { command, options };
}

function required(options, key) {
  ensure(
    typeof options[key] === "string" && options[key].length > 0,
    `p0r_transport_stage_release_option_missing:${key}`,
  );
  return options[key];
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  let prepared;
  if (command === "prepare" || command === "prepare-publish") {
    prepared = await prepareP0RTransportStageRelease({
      approvalRequestPath: required(options, "approval-request"),
      bundlePath: required(options, "bundle"),
      outbox: required(options, "outbox"),
      privateKeyPath: required(options, "private-key"),
      publicKeyPath: required(options, "public-key"),
    });
  }
  let published;
  if (command === "publish" || command === "prepare-publish") {
    published = await publishP0RTransportStageRelease({
      branch: required(options, "branch"),
      outbox: required(options, "outbox"),
      publicKeyPath: required(options, "public-key"),
      remote: options.remote ?? "origin",
      repo: required(options, "repo"),
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
          : "PASS_P0R_TRANSPORT_STAGE_RELEASE_PUBLISHED",
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason:
        error instanceof Error
          ? error.message
          : "p0r_transport_stage_release_unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
