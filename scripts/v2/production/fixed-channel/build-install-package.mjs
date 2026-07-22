#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SOURCE_ROOT, "../../../..");
const SOURCE_FILES = Object.freeze([
  "README.md",
  "git-ssh-dispatch.sh",
  "github-known-hosts",
  "install-production-dispatch-launcher.sh",
  "install-production-dispatch.sh",
  "market-radar-production-dispatch.service",
  "market-radar-production-dispatch.timer",
  "production-dispatch.mjs",
]);

function fail(reason) {
  throw new Error(`BLOCKED_PRODUCTION_DISPATCH_PACKAGE_BUILD ${reason}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      fail("arguments must be exact --name value pairs");
    }
    const name = key.slice(2);
    if (Object.hasOwn(options, name)) fail(`duplicate option: ${name}`);
    options[name] = value;
  }
  const expected = ["deploy-public-key", "dispatch-public-key", "output-root"];
  if (Object.keys(options).sort().join("\n") !== expected.sort().join("\n")) {
    fail(`required options: ${expected.join(", ")}`);
  }
  return options;
}

async function regularFile(path, label) {
  const facts = await stat(path).catch(() => null);
  if (!facts?.isFile()) fail(`${label} is not a regular file`);
}

function canonicalDeployPublicKey(raw) {
  const parts = raw.trim().split(/\s+/u);
  if (parts.length < 2 || parts[0] !== "ssh-ed25519" || !/^[A-Za-z0-9+/]+=*$/u.test(parts[1])) {
    fail("deploy public key must be OpenSSH Ed25519 format");
  }
  return `${parts[0]} ${parts[1]}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const deployPublicKeyPath = resolve(options["deploy-public-key"]);
  const dispatchPublicKeyPath = resolve(options["dispatch-public-key"]);
  const outputRoot = resolve(options["output-root"]);
  if (!isAbsolute(outputRoot) || outputRoot.startsWith(`${REPO_ROOT}/`)) {
    fail("output root must be absolute and outside the repository");
  }
  await regularFile(deployPublicKeyPath, "deploy public key");
  await regularFile(dispatchPublicKeyPath, "dispatch public key");

  const { stdout: status } = await execFileAsync("git", ["status", "--short"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (status.trim()) fail("repository must be clean before building an install package");
  const { stdout: sourceCommitRaw } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const { stdout: branchRaw } = await execFileAsync("git", ["branch", "--show-current"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const sourceCommit = sourceCommitRaw.trim();
  const sourceRef = `refs/heads/${branchRaw.trim()}`;
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) fail("source commit is invalid");
  if (!/^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u.test(sourceRef)) {
    fail("source branch is outside the approved allowlist");
  }

  const packageName = `market-radar-production-dispatch-install-${sourceCommit.slice(0, 7)}`;
  const packageRoot = join(outputRoot, packageName);
  const archivePath = join(outputRoot, `${packageName}.tar.gz`);
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await mkdir(packageRoot, { recursive: false, mode: 0o700 });
  for (const name of SOURCE_FILES) {
    await copyFile(join(SOURCE_ROOT, name), join(packageRoot, name));
  }
  await chmod(join(packageRoot, "git-ssh-dispatch.sh"), 0o755);
  await chmod(join(packageRoot, "install-production-dispatch-launcher.sh"), 0o755);
  await chmod(join(packageRoot, "install-production-dispatch.sh"), 0o755);
  await chmod(join(packageRoot, "production-dispatch.mjs"), 0o755);

  const dispatchPublicKey = await readFile(dispatchPublicKeyPath);
  const dispatchPublicKeyText = dispatchPublicKey.toString("utf8");
  if (!/^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----\n$/u.test(dispatchPublicKeyText)) {
    fail("dispatch public key is not a supported PEM public key");
  }
  await writeFile(join(packageRoot, "ed25519-public.pem"), dispatchPublicKey, { mode: 0o644 });

  const deployPublicKey = canonicalDeployPublicKey(await readFile(deployPublicKeyPath, "utf8"));
  const knownHosts = await readFile(join(packageRoot, "github-known-hosts"));
  const { stdout: planRaw } = await execFileAsync("bash", ["install-production-dispatch.sh", "plan"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  const plan = JSON.parse(planRaw);
  const facts = {
    schemaVersion: "market-radar-production-dispatch-install-facts.v3",
    generatedAt: new Date().toISOString(),
    sourceCommit,
    sourceRef,
    sourceSetSha256: plan.sourceSetSha256,
    publicKeySha256: sha256(dispatchPublicKey),
    repositoryAccess: {
      authentication: "github_read_only_deploy_key",
      deployPublicKeySha256: sha256(deployPublicKey),
      dispatchRemoteUrl: "git@github.com:TianYuan1926/chuan-market-radar.git",
      knownHostsSha256: sha256(knownHosts),
      privateKeyIncludedInArchive: false,
      writeAccessAllowed: false,
    },
    transportContainsSecrets: false,
    productionMutationPrepared: false,
    hostNodeRequired: false,
    nodeRuntime: {
      provisioning: "pinned_official_https_download",
      distribution: "official_nodejs_linux_x64",
      version: plan.nodeRuntime.version,
      archiveSha256: plan.nodeRuntime.archiveSha256,
      binarySha256: plan.nodeRuntime.binarySha256,
      licenseSha256: plan.nodeRuntime.licenseSha256,
      globalInstallAllowed: false,
    },
  };
  await writeFile(join(packageRoot, "INSTALL_FACTS.json"), `${JSON.stringify(facts, null, 2)}\n`, {
    mode: 0o644,
  });

  const manifestFiles = ["INSTALL_FACTS.json", "ed25519-public.pem", ...SOURCE_FILES].sort();
  const manifest = [];
  for (const name of manifestFiles) {
    manifest.push(`${sha256(await readFile(join(packageRoot, name)))}  ${name}`);
  }
  await writeFile(join(packageRoot, "SHA256SUMS"), `${manifest.join("\n")}\n`, { mode: 0o644 });
  await execFileAsync("bash", ["install-production-dispatch-launcher.sh", "verify"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  await execFileAsync("tar", ["-czf", archivePath, "-C", outputRoot, packageName], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const archive = await readFile(archivePath);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "market-radar-production-dispatch-install-package-result.v1",
    archivePath,
    archiveSha256: sha256(archive),
    deployPublicKeySha256: facts.repositoryAccess.deployPublicKeySha256,
    packageRoot,
    sourceCommit,
    sourceSetSha256: facts.sourceSetSha256,
    status: "PASS_EXACT_INSTALL_PACKAGE_BUILT",
    transportContainsSecrets: false,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
