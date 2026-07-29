import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const BRIDGE =
  "scripts/v2/production/m1-production-storage-p0r-local-tty-bridge.exp";
const CLIPBOARD_CLEAR = "MARKET_RADAR_P0R_CLIPBOARD_CLEAR";
const FAKE_AGE_IDENTITY = `AGE-SECRET-KEY-1${"Q".repeat(58)}`;
const FAKE_STS_RESPONSE = {
  Response: {
    Credentials: {
      TmpSecretId: "FAKE_TMP_SECRET_ID_123456789",
      TmpSecretKey: "FAKE_TMP_SECRET_KEY_123456789",
      Token: "FAKE_SESSION_TOKEN_123456789",
    },
    Expiration: "2099-01-01T02:00:00Z",
    ExpiredTime: 4_070_908_800,
    RequestId: "01234567-89ab-cdef-0123-456789abcdef",
  },
};

async function executable(path, source) {
  await writeFile(path, source, { mode: 0o700 });
  await chmod(path, 0o700);
}

async function fixture(testCase) {
  const root = await mkdtemp(join(tmpdir(), "market-radar-p0r-bridge-"));
  await writeFile(join(root, "case.txt"), testCase, { mode: 0o600 });
  await writeFile(
    join(root, "response.json"),
    JSON.stringify(FAKE_STS_RESPONSE),
    { mode: 0o600 },
  );
  await writeFile(join(root, "identity.txt"), FAKE_AGE_IDENTITY, { mode: 0o600 });
  await writeFile(join(root, "clipboard.txt"), "initial", { mode: 0o600 });

  await executable(join(root, "pbcopy"), `#!/usr/bin/env bash
set -euo pipefail
umask 077
cat > "\${P0R_BRIDGE_FIXTURE_ROOT}/clipboard.txt"
`);
  await executable(join(root, "pbpaste"), `#!/usr/bin/env bash
set -euo pipefail
case "$(cat "\${P0R_BRIDGE_FIXTURE_ROOT}/case.txt")" in
  malformed)
    printf 'not-json'
    ;;
  timeout)
    cat "\${P0R_BRIDGE_FIXTURE_ROOT}/clipboard.txt"
    ;;
  *)
    cat "\${P0R_BRIDGE_FIXTURE_ROOT}/response.json"
    ;;
esac
`);
  await executable(join(root, "security"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "\${P0R_BRIDGE_FIXTURE_ROOT}/security-args.txt"
cat "\${P0R_BRIDGE_FIXTURE_ROOT}/identity.txt"
`);
  await executable(join(root, "ssh"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${P0R_BRIDGE_FIXTURE_ROOT}/ssh-args.txt"
test_case="$(cat "\${P0R_BRIDGE_FIXTURE_ROOT}/case.txt")"
if [[ "$test_case" == "ssh-failure" ]]; then
  exit 42
fi
remote_command="\${!#}"
if [[ "$remote_command" == *"receive-credentials-and-run" ]]; then
  if [[ "$test_case" == "marker-mismatch" ]]; then
    printf '{"status":"WRONG_P0R_STS_MARKER"}\\n'
    sleep 4
    exit 43
  fi
  printf '{"status":"READY_P0R_STS_RESPONSE_INPUT_NO_ECHO"}\\n'
  payload="$(cat)"
  [[ "$payload" == "$(cat "\${P0R_BRIDGE_FIXTURE_ROOT}/response.json")" ]]
  printf '{"status":"PASS_P0R_EPHEMERAL_CREDENTIAL_COMPILED"}\\n'
  printf '{"status":"WAITING_P0R_AGE_IDENTITY"}\\n'
  touch "\${P0R_BRIDGE_FIXTURE_ROOT}/primary-waiting"
  for _ in {1..80}; do
    [[ -e "\${P0R_BRIDGE_FIXTURE_ROOT}/age-done" ]] && break
    sleep 0.1
  done
	  [[ -e "\${P0R_BRIDGE_FIXTURE_ROOT}/age-done" ]]
	  case "$test_case" in
	    remote-blocked-safe)
	      printf '{"reasonCode":"p0r_runner_line_341","status":"BLOCKED"}\\n'
	      exit 45
	      ;;
	    remote-blocked-malformed)
	      printf '{"reasonCode":"p0r_runner_line_341-extra","status":"BLOCKED"}\\n'
	      exit 46
	      ;;
	    remote-blocked-secret)
	      printf '{"reasonCode":"FAKE_TMP_SECRET_ID_123456789","status":"BLOCKED"}\\n'
	      exit 47
	      ;;
	  esac
	  printf '{"status":"PASS_P0R_RECOVERY_DRILL"}\\n'
	  exit 0
	fi
if [[ "$remote_command" == *"receive-age-identity" ]]; then
  [[ -e "\${P0R_BRIDGE_FIXTURE_ROOT}/primary-waiting" ]]
  printf '{"status":"READY_P0R_AGE_IDENTITY_INPUT_NO_ECHO"}\\n'
  payload="$(cat)"
  [[ "$payload" == "$(cat "\${P0R_BRIDGE_FIXTURE_ROOT}/identity.txt")" ]]
  touch "\${P0R_BRIDGE_FIXTURE_ROOT}/age-done"
  printf '{"status":"PASS_P0R_AGE_IDENTITY_HANDOFF"}\\n'
  exit 0
fi
exit 44
`);
  return root;
}

function runSelfTest(root) {
  return spawnSync(
    "/usr/bin/expect",
    [BRIDGE, "self-test", "--fixture-root", root],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, P0R_BRIDGE_SELF_TEST: "1" },
      timeout: 15_000,
    },
  );
}

test("bridge plan fixes the browser-free post-response and no-output secret boundary", () => {
  const plan = JSON.parse(execFileSync(
    "/usr/bin/expect",
    [BRIDGE, "plan"],
    { encoding: "utf8" },
  ));
  assert.equal(
    plan.schemaVersion,
    "v2-m1-production-storage-p0r-local-tty-bridge.v3",
  );
  assert.equal(plan.fixedSshHostAlias, "43.161.202.227");
  assert.equal(plan.fixedSshPort, 8022);
  assert.equal(plan.nativeApiResponseCopyOnly, true);
  assert.equal(plan.remoteReadyMarkerRequired, true);
  assert.equal(plan.ageIdentityFromKeychainOnly, true);
  assert.equal(plan.browserAccessibilityReadAfterResponseAllowed, false);
  assert.equal(plan.browserOcrAfterResponseAllowed, false);
  assert.equal(plan.browserScreenshotAfterResponseAllowed, false);
  assert.equal(plan.clipboardClearedBeforeAndAfterHandoff, true);
  assert.equal(plan.secretOutputAllowed, false);
  assert.equal(plan.exactRemoteCommandsOnly, true);
  assert.equal(plan.containsSecret, false);
});

test("bridge transfers fake secrets through exact TTY sessions without output or residue", async () => {
  const root = await fixture("success");
  try {
    const result = runSelfTest(root);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE/u);
    assert.match(result.stdout, /PASS_P0R_EPHEMERAL_CREDENTIAL_HANDOFF/u);
    assert.match(result.stdout, /PASS_P0R_AGE_IDENTITY_HANDOFF/u);
    assert.match(result.stdout, /PASS_P0R_LOCAL_TTY_BRIDGE/u);
    const combined = `${result.stdout}\n${result.stderr}`;
    for (const secret of [
      FAKE_STS_RESPONSE.Response.Credentials.TmpSecretId,
      FAKE_STS_RESPONSE.Response.Credentials.TmpSecretKey,
      FAKE_STS_RESPONSE.Response.Credentials.Token,
      FAKE_AGE_IDENTITY,
    ]) assert.doesNotMatch(combined, new RegExp(secret, "u"));

    assert.equal(await readFile(join(root, "clipboard.txt"), "utf8"), CLIPBOARD_CLEAR);
    const sshInvocations =
      (await readFile(join(root, "ssh-args.txt"), "utf8")).trim().split("\n");
    assert.equal(sshInvocations.length, 2);
    for (const invocation of sshInvocations) {
      assert.match(invocation, /-F \/dev\/null -p 8022/u);
      assert.match(invocation, /-o HostKeyAlias=43\.161\.202\.227/u);
      assert.match(invocation, /-o HostKeyAlgorithms=ssh-ed25519/u);
      assert.match(invocation, /-o StrictHostKeyChecking=yes/u);
      assert.match(invocation, /ubuntu@43\.161\.202\.227/u);
      assert.doesNotMatch(invocation, /(?:^| )-p 22(?: |$)/u);
    }
    assert.match(
      sshInvocations[0],
      /receive-credentials-and-run$/u,
    );
    assert.match(
      sshInvocations[1],
      /receive-age-identity$/u,
    );
    assert.deepEqual(
      (await readFile(join(root, "security-args.txt"), "utf8")).trim().split("\n"),
      [
        "find-generic-password",
        "-a",
        "market-radar-v2-p0r-recovery",
        "-s",
        "com.chuan.market-radar.v2.p0r.age",
        "-w",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

for (const [testCase, reason] of [
  ["malformed", "clipboard_response_invalid"],
  ["marker-mismatch", "credential_receiver_not_ready_timeout"],
  ["ssh-failure", "credential_receiver_not_ready_eof"],
]) {
  test(`bridge fails closed and clears clipboard for ${testCase}`, async () => {
    const root = await fixture(testCase);
    try {
      const result = runSelfTest(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /BLOCKED_P0R_LOCAL_TTY_BRIDGE/u);
      assert.match(result.stderr, new RegExp(reason, "u"));
      const combined = `${result.stdout}\n${result.stderr}`;
      for (const secret of [
        FAKE_STS_RESPONSE.Response.Credentials.TmpSecretId,
        FAKE_STS_RESPONSE.Response.Credentials.TmpSecretKey,
        FAKE_STS_RESPONSE.Response.Credentials.Token,
        FAKE_AGE_IDENTITY,
      ]) assert.doesNotMatch(combined, new RegExp(secret, "u"));
      assert.equal(await readFile(join(root, "clipboard.txt"), "utf8"), CLIPBOARD_CLEAR);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
}

test("bridge returns only an exact sanitized remote failure site", async () => {
  const root = await fixture("remote-blocked-safe");
  try {
    const result = runSelfTest(root);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /recovery_drill_failed_blocked_p0r_runner_line_341/u,
    );
    assert.doesNotMatch(result.stderr, /"reasonCode"/u);
    const combined = `${result.stdout}\n${result.stderr}`;
    for (const secret of [
      FAKE_STS_RESPONSE.Response.Credentials.TmpSecretId,
      FAKE_STS_RESPONSE.Response.Credentials.TmpSecretKey,
      FAKE_STS_RESPONSE.Response.Credentials.Token,
      FAKE_AGE_IDENTITY,
    ]) assert.doesNotMatch(combined, new RegExp(secret, "u"));
    assert.equal(await readFile(join(root, "clipboard.txt"), "utf8"), CLIPBOARD_CLEAR);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

for (const testCase of [
  "remote-blocked-malformed",
  "remote-blocked-secret",
]) {
  test(`bridge does not propagate untrusted remote diagnostics for ${testCase}`, async () => {
    const root = await fixture(testCase);
    try {
      const result = runSelfTest(root);
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /recovery_drill_failed_blocked_unclassified/u,
      );
      const combined = `${result.stdout}\n${result.stderr}`;
      for (const secret of [
        FAKE_STS_RESPONSE.Response.Credentials.TmpSecretId,
        FAKE_STS_RESPONSE.Response.Credentials.TmpSecretKey,
        FAKE_STS_RESPONSE.Response.Credentials.Token,
        FAKE_AGE_IDENTITY,
      ]) assert.doesNotMatch(combined, new RegExp(secret, "u"));
      assert.equal(await readFile(join(root, "clipboard.txt"), "utf8"), CLIPBOARD_CLEAR);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
}

test("bridge source pins the SSH and browser-independent secret boundary", async () => {
  const source = await readFile(BRIDGE, "utf8");
  for (const required of [
    "-F /dev/null",
    "-p $::ssh_port",
    "-o BatchMode=yes",
    "-o ClearAllForwardings=yes",
    "-o HostKeyAlias=$::ssh_host_alias",
    "-o HostKeyAlgorithms=ssh-ed25519",
    "-o StrictHostKeyChecking=yes",
    "-o UserKnownHostsFile=$::ssh_known_hosts",
    "ubuntu@43.161.202.227",
    "MARKET_RADAR_P0R_WAITING_FOR_NATIVE_COPY_",
    "READY_P0R_STS_RESPONSE_INPUT_NO_ECHO",
    "READY_P0R_AGE_IDENTITY_INPUT_NO_ECHO",
    "source_identity_not_clean_exact_plan_commit",
    "clipboard_clear_before_handoff_failed",
    "/Users/chuan/.nvm/versions/node/v22.23.1/bin/node",
    'set LOCKED_NODE_VERSION "v22.23.1"',
    'set LOCKED_SSH_HOST_ALIAS "43.161.202.227"',
    "set LOCKED_SSH_PORT 8022",
    "locked_node_version_invalid",
    "blocked_unclassified",
    "p0r_(session|runner)_line_",
  ]) assert.ok(source.includes(required), `missing bridge invariant: ${required}`);

  for (const forbidden of [
    "/usr/bin/osascript",
    "/usr/sbin/screencapture",
    "AXUIElement",
    "computer-use",
    "playwright",
    "SecretId=",
    "SecretKey=",
    "Token=",
    "-p 22",
    'set ::node_binary "/usr/bin/env"',
  ]) assert.equal(source.includes(forbidden), false, `forbidden bridge path: ${forbidden}`);
});
