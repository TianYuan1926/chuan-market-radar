import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const launcher = path.resolve("scripts/v2/production/run-exact-toolchain.sh");

async function writeExecutable(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o700);
}

async function createFakePair(directory, nodeVersion, npmVersion) {
  await writeExecutable(
    path.join(directory, "node"),
    `#!/bin/sh\nprintf '%s\\n' '${nodeVersion}'\n`,
  );
  await writeExecutable(
    path.join(directory, "npm"),
    `#!/bin/sh\nif [ "\${1:-}" = '--version' ]; then\n  printf '%s\\n' '${npmVersion}'\n  exit 0\nfi\nif [ "\${1:-}" = 'run' ]; then\n  printf 'FAKE_NPM_RUN:%s\\n' "\${2:-}"\n  exit 0\nfi\nexit 70\n`,
  );
}

test("launcher automatically selects the locked local NVM toolchain", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "market-radar-toolchain-"));
  try {
    const wrongBin = path.join(root, "wrong-bin");
    const exactBin = path.join(root, ".nvm", "versions", "node", "v22.23.1", "bin");
    await createFakePair(wrongBin, "v24.15.0", "11.12.1");
    await createFakePair(exactBin, "v22.23.1", "10.9.8");

    const result = await execFileAsync(
      "/bin/bash",
      [launcher, "test:v2-m1-p0r:exact"],
      {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${wrongBin}:/usr/bin:/bin`,
        },
      },
    );

    assert.match(result.stdout, /market_radar_exact_toolchain_selected/u);
    assert.match(result.stdout, /FAKE_NPM_RUN:test:v2-m1-p0r:exact/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("launcher fails before work when no exact toolchain exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "market-radar-toolchain-"));
  try {
    const wrongBin = path.join(root, "wrong-bin");
    await createFakePair(wrongBin, "v24.15.0", "11.12.1");

    await assert.rejects(
      execFileAsync("/bin/bash", [launcher, "test:v2-ops:exact"], {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${wrongBin}:/usr/bin:/bin`,
        },
      }),
      (error) => {
        assert.equal(error.code, 69);
        assert.match(error.stderr, /exact_toolchain_unavailable/u);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("launcher rejects arbitrary npm targets", async () => {
  await assert.rejects(
    execFileAsync("/bin/bash", [launcher, "production:deploy:manual"]),
    (error) => {
      assert.equal(error.code, 64);
      assert.match(error.stderr, /exact_toolchain_target_not_allowed/u);
      return true;
    },
  );
});
