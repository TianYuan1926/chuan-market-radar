#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  AUTHORIZED_ARTIFACT_HASH,
  AUTHORIZED_MANIFEST_HASH,
  AUTHORIZED_SOURCE_COMMIT,
  EXPECTED_MIGRATION_CHECKSUMS,
  loadAndValidateArtifact,
  sha256,
} from "./runner-core.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) {
      throw new Error("Invalid artifact builder argument");
    }
    options[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

async function fileHash(filePath) {
  return sha256(await readFile(filePath));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options["output-dir"]) {
    throw new Error("--output-dir is required");
  }

  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  await loadAndValidateArtifact(repositoryRoot);
  const outputDirectory = resolve(options["output-dir"]);
  const artifactDirectory = join(outputDirectory, "runner-artifact");
  const runnerDirectory = join(artifactDirectory, "scripts", "production", "migration-runner");
  const migrationDirectory = join(artifactDirectory, "migrations", "candidate-episode");
  await rm(artifactDirectory, { force: true, recursive: true });
  await mkdir(runnerDirectory, { recursive: true });
  await mkdir(migrationDirectory, { recursive: true });

  const runnerFiles = (await readdir(import.meta.dirname))
    .filter((filename) =>
      (filename.endsWith(".mjs") && !filename.endsWith(".test.mjs")) || filename.endsWith(".sh"))
    .sort();
  for (const filename of runnerFiles) {
    await copyFile(join(import.meta.dirname, filename), join(runnerDirectory, filename));
  }
  for (const filename of Object.keys(EXPECTED_MIGRATION_CHECKSUMS)) {
    await copyFile(
      join(repositoryRoot, "migrations", "candidate-episode", filename),
      join(migrationDirectory, filename),
    );
  }

  const artifactFiles = [];
  for (const filename of runnerFiles) {
    const relativePath = join("scripts", "production", "migration-runner", filename);
    artifactFiles.push({ path: relativePath, sha256: await fileHash(join(artifactDirectory, relativePath)) });
  }
  for (const filename of Object.keys(EXPECTED_MIGRATION_CHECKSUMS)) {
    const relativePath = join("migrations", "candidate-episode", filename);
    artifactFiles.push({ path: relativePath, sha256: await fileHash(join(artifactDirectory, relativePath)) });
  }
  artifactFiles.sort((left, right) => left.path.localeCompare(right.path));

  let runnerSourceCommit = options["runner-source-commit"];
  if (runnerSourceCommit && !/^[a-f0-9]{40}$/.test(runnerSourceCommit)) {
    throw new Error("Invalid runner source commit");
  }
  if (!runnerSourceCommit) {
    const git = await execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]);
    runnerSourceCommit = git.stdout.trim();
  }
  const manifest = {
    artifactFiles,
    artifactFormat: "market-radar-production-migration-runner.v1",
    candidateMigrationArtifactHash: AUTHORIZED_ARTIFACT_HASH,
    candidateMigrationManifestHash: AUTHORIZED_MANIFEST_HASH,
    candidateMigrationSourceCommit: AUTHORIZED_SOURCE_COMMIT,
    generatedAt: new Date().toISOString(),
    runnerSourceCommit,
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(artifactDirectory, "RUNNER_ARTIFACT_MANIFEST.json"), manifestJson, {
    mode: 0o600,
  });

  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  const tarball = join(outputDirectory, "market-radar-migration-runner.tar.gz");
  await execFileAsync("tar", ["-czf", tarball, "-C", outputDirectory, basename(artifactDirectory)]);
  const tarballHash = await fileHash(tarball);

  process.stdout.write(`${JSON.stringify({
    candidateMigrationArtifactHash: AUTHORIZED_ARTIFACT_HASH,
    manifestHash,
    runnerFileCount: runnerFiles.length,
    status: "pass",
    tarball,
    tarballHash,
  })}\n`);
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ reason: "artifact_build_failed", status: "fail" })}\n`);
  process.exitCode = 1;
});
