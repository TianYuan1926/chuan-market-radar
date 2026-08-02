#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  prepareDispatch,
  publishDispatch,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";
import {
  DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY,
  PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
  ProductionEvidenceGatewayError,
  readBoundedProductionEvidenceGatewayFile,
  validateProductionEvidenceGatewayRequest,
} from "./production-evidence-gateway.mjs";
import { canonicalJson } from "./fixed-channel/production-dispatch.mjs";

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
  if (!condition) throw new ProductionEvidenceGatewayError(reason);
}

async function readCanonicalRequest(path) {
  const bytes = await readBoundedProductionEvidenceGatewayFile(
    resolve(path),
    MAXIMUM_REQUEST_BYTES,
    "evidence_gateway_release_request_unsafe",
    0o600,
  );
  let request;
  try {
    request = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ProductionEvidenceGatewayError(
      "evidence_gateway_release_request_invalid",
    );
  }
  ensure(canonicalJson(request) === bytes.toString("utf8"),
    "evidence_gateway_release_request_not_canonical");
  return request;
}

export function deriveProductionEvidenceGatewayDispatch(request, {
  now = new Date(),
} = {}) {
  validateProductionEvidenceGatewayRequest(request, { now });
  return Object.freeze({
    dispatchId: request.dispatchId,
    entrypointPath: PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
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

export async function prepareProductionEvidenceGatewayRelease({
  approvalRequestPath,
  bundlePath,
  now = new Date(),
  outbox,
  privateKeyPath,
  publicKeyPath,
}) {
  const request = await readCanonicalRequest(approvalRequestPath);
  const dispatch = deriveProductionEvidenceGatewayDispatch(request, { now });
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
    stagingRoots: [DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY.stagingRoot],
  });
  return Object.freeze({
    approvalRequestSha256: prepared.envelope.approvalRequestSha256,
    bundleSha256: prepared.envelope.bundleSha256,
    dispatchId: request.dispatchId,
    outbox: resolve(outbox),
    packageId: request.packageId,
    sourceCommit: request.sourceCommit,
    status: validated.status === "PASS_SIGNED_DISPATCH_OUTBOX"
      ? "PASS_PRODUCTION_EVIDENCE_GATEWAY_RELEASE_PREPARED"
      : "BLOCKED_PRODUCTION_EVIDENCE_GATEWAY_RELEASE",
  });
}

export async function publishProductionEvidenceGatewayRelease({
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
  ensure(["prepare", "publish", "prepare-publish"].includes(command),
    "evidence_gateway_release_command_invalid");
  ensure(rest.length % 2 === 0, "evidence_gateway_release_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(key ?? "")
        && typeof value === "string"
        && !value.startsWith("--")
        && options[key.slice(2)] === undefined,
      "evidence_gateway_release_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  ensure(Object.keys(options).every((key) => COMMAND_OPTION_KEYS[command].has(key)),
    "evidence_gateway_release_arguments_invalid");
  return { command, options };
}

function requiredOption(options, key) {
  ensure(typeof options[key] === "string" && options[key].length > 0,
    `evidence_gateway_release_option_missing:${key}`);
  return options[key];
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  let prepared;
  if (command === "prepare" || command === "prepare-publish") {
    prepared = await prepareProductionEvidenceGatewayRelease({
      approvalRequestPath: requiredOption(options, "approval-request"),
      bundlePath: requiredOption(options, "bundle"),
      outbox: requiredOption(options, "outbox"),
      privateKeyPath: requiredOption(options, "private-key"),
      publicKeyPath: requiredOption(options, "public-key"),
    });
  }
  let published;
  if (command === "publish" || command === "prepare-publish") {
    published = await publishProductionEvidenceGatewayRelease({
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
    status: command === "prepare"
      ? prepared.status
      : command === "publish"
        ? published.status
        : "PASS_PRODUCTION_EVIDENCE_GATEWAY_RELEASE_PUBLISHED",
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
