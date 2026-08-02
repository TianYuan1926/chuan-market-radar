import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  REMOTE_LISTENER_OBSERVATION_SCHEMA,
  ROUTE_EVIDENCE_SCHEMA,
  ROUTE_TARGET_SCHEMA,
  TENCENT_FIREWALL_CAPTURE_SCHEMA,
  TENCENT_LIGHTHOUSE_API_ACTION,
  TENCENT_LIGHTHOUSE_API_ENDPOINT,
  TENCENT_LIGHTHOUSE_API_VERSION,
  TENCENT_LIGHTHOUSE_PROVIDER,
  routeTargetDigest,
} from "./m1-production-storage-p0r-route-authority.mjs";
import {
  buildListenerSshArguments,
  parseCanonicalJsonSource,
  parseCanonicalRemoteObservation,
  readStableOwnedPublicFile,
  writeExclusiveCanonicalJson,
} from "./m1-production-storage-p0r-route-evidence.mjs";
import {
  buildTransactionLease,
} from "./m1-production-storage-p0r-transaction.mjs";
import {
  canonicalJson,
} from "./fixed-channel/production-dispatch.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const RUN_ID = "p0r-20990101t000000z-0123456789abcdef0123456789abcdef";

function target() {
  return {
    schemaVersion: ROUTE_TARGET_SCHEMA,
    provider: TENCENT_LIGHTHOUSE_PROVIDER,
    apiEndpoint: TENCENT_LIGHTHOUSE_API_ENDPOINT,
    apiAction: TENCENT_LIGHTHOUSE_API_ACTION,
    apiVersion: TENCENT_LIGHTHOUSE_API_VERSION,
    region: "ap-hongkong",
    instanceId: "lhins-abcdefgh",
    sshHost: "43.161.202.227",
    sshHostAlias: "43.161.202.227",
    sshUser: "ubuntu",
    listenerPort: 8022,
    listenerUnit: "market-radar-p0r-8022.service",
    containsSecret: false,
  };
}

function lease() {
  const routeTarget = target();
  return buildTransactionLease({
    egressA: "156.248.15.36",
    egressB: "156.248.15.36",
    listenerObserverScriptSha256: "e".repeat(64),
    now: "2099-01-01T00:00:00.000Z",
    plan: {
      credentialGrant: { runId: RUN_ID },
      sourceCommit: SOURCE_COMMIT,
    },
    planSha256: "b".repeat(64),
    routeTarget,
    routeTargetSha256: routeTargetDigest(routeTarget),
    sourceFacts: { clean: true, head: SOURCE_COMMIT },
  });
}

function remoteObservation() {
  return {
    activeState: "active",
    checkedAt: "2099-01-01T00:01:00.000Z",
    containsSecret: false,
    hostname: "VM-0-9-ubuntu",
    ipv4ListenerCount: 1,
    ipv6ListenerCount: 0,
    listenerLocalAddress: "0.0.0.0:8022",
    listenerPort: 8022,
    listenerProcessName: "sshd",
    listenerProcessPid: 4242,
    listenerUnit: "market-radar-p0r-8022.service",
    loadState: "loaded",
    mainPid: 4242,
    schemaVersion: REMOTE_LISTENER_OBSERVATION_SCHEMA,
    subState: "running",
  };
}

test("producer plan declares authoritative inputs and no-clobber output", () => {
  const plan = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/v2/production/m1-production-storage-p0r-route-evidence.mjs", "plan"],
    { encoding: "utf8" },
  ));
  assert.equal(plan.routeTargetSchema, ROUTE_TARGET_SCHEMA);
  assert.equal(plan.firewallCaptureSchema, TENCENT_FIREWALL_CAPTURE_SCHEMA);
  assert.equal(plan.routeEvidenceSchema, ROUTE_EVIDENCE_SCHEMA);
  assert.equal(plan.canonicalRouteControlInputsRequired, true);
  assert.equal(plan.exactTencentFirewallPaginationRequired, true);
  assert.equal(plan.firewallRuleIdentityRecomputed, true);
  assert.equal(plan.listenerStrictHostIdentityRequired, true);
  assert.equal(plan.noClobberCanonicalMode600OutputRequired, true);
  assert.equal(plan.containsSecret, false);
});

test("all JSON control inputs must already be one canonical object", () => {
  const value = target();
  assert.deepEqual(
    parseCanonicalJsonSource(
      { bytes: Buffer.from(canonicalJson(value), "utf8") },
      "route_target",
    ),
    value,
  );
  assert.throws(() => parseCanonicalJsonSource(
    { bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8") },
    "route_target",
  ), /route_target_not_canonical/u);
  assert.throws(() => parseCanonicalJsonSource(
    { bytes: Buffer.from(`${canonicalJson(value)}${canonicalJson(value)}`, "utf8") },
    "route_target",
  ));
  assert.throws(() => parseCanonicalJsonSource(
    { bytes: "not-a-buffer" },
    "route_target",
  ), /route_target_source_invalid/u);
});

test("listener probe has a fixed target, strict host identity and no port 22 fallback", () => {
  const args = buildListenerSshArguments({ lease: lease(), target: target() });
  assert.deepEqual(args.slice(0, 6), [
    "-F", "/dev/null",
    "-p", "8022",
    "-i", "/Users/chuan/.ssh/chuan_radar_tencent_ed25519",
  ]);
  assert.ok(args.includes("StrictHostKeyChecking=yes"));
  assert.ok(args.includes("HostKeyAlias=43.161.202.227"));
  assert.ok(args.includes("HostKeyAlgorithms=ssh-ed25519"));
  assert.ok(args.includes("UserKnownHostsFile=/Users/chuan/.ssh/known_hosts"));
  assert.ok(args.includes("ubuntu@43.161.202.227"));
  assert.equal(args.includes("22"), false);
  assert.equal(
    args.at(-1),
    `cd /home/ubuntu/.cache/market-radar-v2/p0r/staging/${RUN_ID} && printf '%s  %s\\n' '${"e".repeat(64)}' './m1-production-storage-p0r-route-listener-observer.sh' | /usr/bin/sha256sum --check --status && exec ./m1-production-storage-p0r-route-listener-observer.sh`,
  );
});

test("remote listener output must be one canonical exact JSON object", () => {
  const value = remoteObservation();
  assert.deepEqual(
    parseCanonicalRemoteObservation(
      canonicalJson(value),
      "2099-01-01T00:01:30.000Z",
    ),
    value,
  );
  assert.throws(() => parseCanonicalRemoteObservation(
    `${JSON.stringify(value, null, 2)}\n`,
    "2099-01-01T00:01:30.000Z",
  ), /not_canonical/u);
  assert.throws(() => parseCanonicalRemoteObservation(
    `${canonicalJson(value)}${canonicalJson(value)}`,
    "2099-01-01T00:01:30.000Z",
  ));
  assert.throws(() => parseCanonicalRemoteObservation(
    canonicalJson({ ...value, unexpected: true }),
    "2099-01-01T00:01:30.000Z",
  ), /keys_invalid/u);
});

test("route producer publishes canonical mode-600 output exactly once", async () => {
  const root = await mkdtemp(join(await realpath(process.cwd()), ".tmp-p0r-route-output-"));
  try {
    const output = join(root, "route.json");
    const value = { containsSecret: false, status: "PASS" };
    await writeExclusiveCanonicalJson(output, value);
    assert.equal(await readFile(output, "utf8"), canonicalJson(value));
    assert.equal((await stat(output)).mode & 0o077, 0);
    await assert.rejects(
      writeExclusiveCanonicalJson(output, value),
      /EEXIST/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("public identity evidence uses a bounded stable no-follow read", async () => {
  const root = await mkdtemp(join(await realpath(process.cwd()), ".tmp-p0r-route-public-"));
  try {
    const target = join(root, "identity.pub");
    const link = join(root, "identity-link.pub");
    await writeFile(target, "ssh-ed25519 AAAATEST route-test\n", { mode: 0o644 });
    assert.deepEqual(
      await readStableOwnedPublicFile(target, "public_identity"),
      Buffer.from("ssh-ed25519 AAAATEST route-test\n"),
    );
    await symlink(target, link);
    await assert.rejects(
      readStableOwnedPublicFile(link, "public_identity_link"),
      /path_not_canonical|symlink_forbidden/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
