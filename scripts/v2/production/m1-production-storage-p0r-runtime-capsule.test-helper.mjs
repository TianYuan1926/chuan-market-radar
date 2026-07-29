import {
  cp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createP0RNodeRuntimeCapsuleFromDirectory,
} from "./m1-production-storage-p0r-runtime-capsule.mjs";

const RUNTIME_SOURCE =
  "scripts/v2/production/p0r-node-runtime";

function lockedPackageNames(packageLock) {
  return Object.keys(packageLock.packages)
    .filter((key) => key !== "")
    .map((key) => {
      const relative = key.slice("node_modules/".length);
      const parts = relative.split("/");
      return relative.startsWith("@")
        ? parts.slice(0, 2).join("/")
        : parts[0];
    })
    .sort();
}

export async function stageP0RNodeRuntimeFixture(directory) {
  const root = resolve(directory);
  const source = resolve(RUNTIME_SOURCE);
  await mkdir(join(root, "node_modules"), {
    mode: 0o700,
    recursive: true,
  });
  const packageBytes = await readFile(join(source, "package.json"));
  const lockBytes = await readFile(join(source, "package-lock.json"));
  await writeFile(join(root, "package.json"), packageBytes, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(join(root, "package-lock.json"), lockBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const packageLock = JSON.parse(lockBytes.toString("utf8"));
  for (const packageName of lockedPackageNames(packageLock)) {
    await cp(
      resolve("node_modules", ...packageName.split("/")),
      join(root, "node_modules", ...packageName.split("/")),
      {
        errorOnExist: true,
        force: false,
        recursive: true,
        verbatimSymlinks: true,
      },
    );
  }
  return root;
}

export async function buildP0RNodeRuntimeFixtureCapsule(
  directory,
  filename = "p0r-node-runtime.tar",
) {
  const runtimeDirectory = join(directory, "runtime");
  await stageP0RNodeRuntimeFixture(runtimeDirectory);
  const output = join(directory, filename);
  const inspection = await createP0RNodeRuntimeCapsuleFromDirectory({
    output,
    runtimeDirectory,
  });
  return { inspection, output, runtimeDirectory };
}
