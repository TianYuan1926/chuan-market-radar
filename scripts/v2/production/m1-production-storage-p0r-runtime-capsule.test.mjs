import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildP0RNodeRuntimeCapsule,
  createP0RNodeRuntimeCapsuleFromDirectory,
  extractP0RNodeRuntimeCapsule,
  inspectP0RNodeRuntimeCapsuleBytes,
  P0R_NODE_RUNTIME_CAPSULE_SCHEMA_VERSION,
  P0R_NODE_RUNTIME_VERSION,
  P0R_PG_RUNTIME_VERSION,
} from "./m1-production-storage-p0r-runtime-capsule.mjs";
import {
  buildP0RNodeRuntimeFixtureCapsule,
  stageP0RNodeRuntimeFixture,
} from "./m1-production-storage-p0r-runtime-capsule.test-helper.mjs";

test("waits for capsule creation before cleaning the npm install root", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-build-cleanup-"));
  try {
    const repository = process.cwd();
    const fakeNpm = join(root, "fake-npm.mjs");
    await writeFile(
      fakeNpm,
      `#!/usr/bin/env node
import { cp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
if (process.argv[2] === "--version") {
  process.stdout.write("10.9.8\\n");
  process.exit(0);
}
const lock = JSON.parse(await readFile(join(process.cwd(), "package-lock.json"), "utf8"));
await mkdir(join(process.cwd(), "node_modules"), { mode: 0o700 });
for (const key of Object.keys(lock.packages).filter((value) => value !== "")) {
  const relative = key.slice("node_modules/".length);
  const parts = relative.split("/");
  const name = relative.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  await cp(
    join(${JSON.stringify(repository)}, "node_modules", ...name.split("/")),
    join(process.cwd(), "node_modules", ...name.split("/")),
    { errorOnExist: true, force: false, recursive: true, verbatimSymlinks: true },
  );
}
`,
      { flag: "wx", mode: 0o700 },
    );
    await chmod(fakeNpm, 0o700);
    const output = join(root, "built.tar");
    const result = await buildP0RNodeRuntimeCapsule({
      nodeBinary: process.execPath,
      npmBinary: fakeNpm,
      output,
      sourceDirectory: "scripts/v2/production/p0r-node-runtime",
    });
    assert.match(result.archiveSha256, /^[0-9a-f]{64}$/u);
    assert.equal(result.nodeVersion, P0R_NODE_RUNTIME_VERSION);
    assert.equal((await readFile(output)).length > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("builds, validates and extracts a byte-reproducible exact runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-capsule-"));
  try {
    const first = await buildP0RNodeRuntimeFixtureCapsule(root, "first.tar");
    const secondRoot = join(root, "second");
    await mkdir(secondRoot, { mode: 0o700 });
    const second = await buildP0RNodeRuntimeFixtureCapsule(
      secondRoot,
      "second.tar",
    );
    const firstBytes = await readFile(first.output);
    const secondBytes = await readFile(second.output);
    assert.deepEqual(firstBytes, secondBytes);
    assert.equal(
      first.inspection.archiveSha256,
      second.inspection.archiveSha256,
    );
    assert.equal(
      first.inspection.schemaVersion,
      P0R_NODE_RUNTIME_CAPSULE_SCHEMA_VERSION,
    );
    assert.equal(first.inspection.nodeVersion, P0R_NODE_RUNTIME_VERSION);
    assert.deepEqual(
      first.inspection.packageVersions,
      { pg: P0R_PG_RUNTIME_VERSION },
    );

    const destination = join(root, "extracted");
    const extracted = await extractP0RNodeRuntimeCapsule({
      archivePath: first.output,
      destination,
      expectedSha256: first.inspection.archiveSha256,
    });
    assert.equal(
      extracted.status,
      "PASS_P0R_NODE_RUNTIME_CAPSULE_EXTRACTED",
    );
    const requireFromRuntime = createRequire(
      join(destination, "runtime-check.cjs"),
    );
    const pg = requireFromRuntime("pg/package.json");
    assert.equal(pg.version, P0R_PG_RUNTIME_VERSION);
    await assert.rejects(
      extractP0RNodeRuntimeCapsule({
        archivePath: first.output,
        destination,
        expectedSha256: first.inspection.archiveSha256,
      }),
      /destination|exist/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects archive tampering before extraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-tamper-"));
  try {
    const fixture = await buildP0RNodeRuntimeFixtureCapsule(root);
    const bytes = await readFile(fixture.output);
    const tampered = Buffer.from(bytes);
    tampered[512] ^= 0x01;
    const tamperedPath = join(root, "tampered.tar");
    await writeFile(tamperedPath, tampered, {
      flag: "wx",
      mode: 0o600,
    });
    await assert.rejects(
      extractP0RNodeRuntimeCapsule({
        archivePath: tamperedPath,
        destination: join(root, "tampered-extract"),
        expectedSha256: fixture.inspection.archiveSha256,
      }),
      /sha256_mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinks, nested dependencies and extra packages in the staged closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-layout-"));
  try {
    const symlinkRuntime = join(root, "symlink-runtime");
    await stageP0RNodeRuntimeFixture(symlinkRuntime);
    await symlink(
      "package.json",
      join(symlinkRuntime, "node_modules", "pg", "escape-link"),
    );
    await assert.rejects(
      createP0RNodeRuntimeCapsuleFromDirectory({
        output: join(root, "symlink.tar"),
        runtimeDirectory: symlinkRuntime,
      }),
      /symlink_rejected/u,
    );

    const nestedRuntime = join(root, "nested-runtime");
    await stageP0RNodeRuntimeFixture(nestedRuntime);
    await mkdir(
      join(nestedRuntime, "node_modules", "pg", "node_modules", "hidden"),
      { mode: 0o700, recursive: true },
    );
    await writeFile(
      join(
        nestedRuntime,
        "node_modules",
        "pg",
        "node_modules",
        "hidden",
        "package.json",
      ),
      '{"name":"hidden","version":"1.0.0"}\n',
      { flag: "wx", mode: 0o600 },
    );
    await assert.rejects(
      createP0RNodeRuntimeCapsuleFromDirectory({
        output: join(root, "nested.tar"),
        runtimeDirectory: nestedRuntime,
      }),
      /executable_surface_rejected/u,
    );

    const extraRuntime = join(root, "extra-runtime");
    await stageP0RNodeRuntimeFixture(extraRuntime);
    await mkdir(join(extraRuntime, "node_modules", "unexpected"), {
      mode: 0o700,
    });
    await writeFile(
      join(extraRuntime, "node_modules", "unexpected", "package.json"),
      '{"name":"unexpected","version":"1.0.0"}\n',
      { flag: "wx", mode: 0o600 },
    );
    await assert.rejects(
      createP0RNodeRuntimeCapsuleFromDirectory({
        output: join(root, "extra.tar"),
        runtimeDirectory: extraRuntime,
      }),
      /installed_package_set_mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a non-private dependency file mode encoded by a forged archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-mode-"));
  try {
    const fixture = await buildP0RNodeRuntimeFixtureCapsule(root);
    const bytes = await readFile(fixture.output);
    const forged = Buffer.from(bytes);
    forged.write("0000644\0", 100, 8, "ascii");
    forged.fill(0x20, 148, 156);
    let checksum = 0;
    for (const byte of forged.subarray(0, 512)) checksum += byte;
    forged.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
    forged[154] = 0;
    forged[155] = 0x20;
    assert.throws(
      () => inspectP0RNodeRuntimeCapsuleBytes(forged),
      /metadata_drift/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects noncanonical unused USTAR metadata even with a valid checksum", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-runtime-header-"));
  try {
    const fixture = await buildP0RNodeRuntimeFixtureCapsule(root);
    const forged = Buffer.from(await readFile(fixture.output));
    forged.write("unexpected", 265, 10, "ascii");
    forged.fill(0x20, 148, 156);
    let checksum = 0;
    for (const byte of forged.subarray(0, 512)) checksum += byte;
    forged.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
    forged[154] = 0;
    forged[155] = 0x20;
    assert.throws(
      () => inspectP0RNodeRuntimeCapsuleBytes(forged),
      /noncanonical_header_rejected/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
