import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";

const REPOSITORY_ROOT = process.cwd();
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, "src");
const V2_ROOT = resolve(SOURCE_ROOT, "v2");

function sourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx)$/u.test(name)) {
      files.push(path);
    }
  }

  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }

  return specifiers;
}

function resolvesWithin(importer: string, specifier: string, root: string) {
  if (!specifier.startsWith(".")) {
    return false;
  }
  const importedPath = resolve(dirname(importer), specifier);
  return importedPath === root || importedPath.startsWith(`${root}${sep}`);
}

test("keeps production V2 source physically isolated from Legacy", () => {
  const productionFiles = sourceFiles(V2_ROOT).filter(
    (file) =>
      !file.endsWith(".test.ts") &&
      !file.includes(`${sep}fixtures${sep}`) &&
      !file.includes(`${sep}testing${sep}`),
  );

  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(
      /\btotalScore\b/u.test(source),
      false,
      `${relative(REPOSITORY_ROOT, file)} cannot introduce a universal totalScore`,
    );

    for (const specifier of importSpecifiers(source)) {
      assert.equal(
        specifier.startsWith("@/lib") ||
          specifier.startsWith("@/app") ||
          specifier.startsWith("@/components") ||
          specifier.includes("/src/lib/"),
        false,
        `${relative(REPOSITORY_ROOT, file)} cannot import Legacy ${specifier}`,
      );

      if (specifier.startsWith(".")) {
        assert.equal(
          resolvesWithin(file, specifier, V2_ROOT),
          true,
          `${relative(REPOSITORY_ROOT, file)} cannot escape src/v2 via ${specifier}`,
        );
      }
    }
  }
});

test("keeps Legacy source from importing V2 before an approved adapter ADR", () => {
  const legacyFiles = sourceFiles(SOURCE_ROOT).filter(
    (file) => !file.startsWith(`${V2_ROOT}${sep}`),
  );

  for (const file of legacyFiles) {
    const source = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const importsV2 =
        specifier.startsWith("@/v2") ||
        resolvesWithin(file, specifier, V2_ROOT);
      assert.equal(
        importsV2,
        false,
        `${relative(REPOSITORY_ROOT, file)} cannot import V2 before cutover`,
      );
    }
  }
});

test("keeps explicit synthetic fixtures and test support out of production imports", () => {
  const productionFiles = sourceFiles(V2_ROOT).filter(
    (file) =>
      !file.endsWith(".test.ts") &&
      !file.includes(`${sep}fixtures${sep}`) &&
      !file.includes(`${sep}testing${sep}`),
  );

  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(
      importSpecifiers(source).some((specifier) =>
        specifier.includes("fixtures") ||
        specifier.includes("testing") ||
        resolvesWithin(
          file,
          specifier,
          resolve(V2_ROOT, "fixtures"),
        ) ||
        resolvesWithin(file, specifier, resolve(V2_ROOT, "testing"))),
      false,
      `${relative(REPOSITORY_ROOT, file)} cannot import test-only support`,
    );
  }

  const fixture = JSON.parse(
    readFileSync(
      resolve(V2_ROOT, "fixtures/m1-foundation-slice.v1.json"),
      "utf8",
    ),
  ) as {
    fixtureKind?: unknown;
    mustNeverEnterRuntime?: unknown;
    synthetic?: unknown;
  };
  assert.equal(fixture.fixtureKind, "TEST_ONLY_POINT_IN_TIME");
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.mustNeverEnterRuntime, true);
});

test("keeps provider hosts and public transport behind V2 adapters", () => {
  const productionFiles = sourceFiles(V2_ROOT).filter(
    (file) =>
      !file.endsWith(".test.ts") &&
      !file.includes(`${sep}fixtures${sep}`) &&
      !file.includes(`${sep}testing${sep}`),
  );
  const providerHosts = /(?:fapi\.binance\.com|www\.okx\.com|api\.bybit\.com)/u;

  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    if (providerHosts.test(source)) {
      assert.equal(
        file.includes(`${sep}adapters${sep}`),
        true,
        `${relative(REPOSITORY_ROOT, file)} cannot own a provider endpoint`,
      );
    }
    for (const specifier of importSpecifiers(source)) {
      if (specifier.includes("public-json-transport")) {
        assert.equal(
          file.includes(`${sep}adapters${sep}`),
          true,
          `${relative(REPOSITORY_ROOT, file)} cannot call provider transport directly`,
        );
      }
    }
  }
});

test("covers every Legacy src capability directory in the reviewed atlas", () => {
  const atlas = JSON.parse(
    readFileSync(
      resolve(
        REPOSITORY_ROOT,
        "docs/architecture/v2/legacy-capability-atlas.v1.json",
      ),
      "utf8",
    ),
  ) as {
    allowedClassifications: unknown;
    capabilities: Array<{ classification: string }>;
    coveragePrefixes: unknown;
    legacyDeletionAllowed: unknown;
  };
  assert.equal(atlas.legacyDeletionAllowed, false);
  assert.ok(Array.isArray(atlas.allowedClassifications));
  assert.ok(Array.isArray(atlas.coveragePrefixes));
  assert.ok(Array.isArray(atlas.capabilities));

  const allowed = new Set(atlas.allowedClassifications as string[]);
  const coverage = new Set(atlas.coveragePrefixes as string[]);
  const libraryDirectories = readdirSync(resolve(SOURCE_ROOT, "lib"))
    .filter((name) => statSync(resolve(SOURCE_ROOT, "lib", name)).isDirectory())
    .map((name) => `src/lib/${name}`);
  const requiredRoots = [
    "src/app",
    "src/components",
    "src/data",
    "src/scripts",
    ...libraryDirectories,
  ];

  for (const prefix of requiredRoots) {
    assert.equal(coverage.has(prefix), true, `${prefix} must be classified`);
  }
  for (const capability of atlas.capabilities) {
    assert.equal(
      allowed.has(capability.classification),
      true,
      `Unknown Legacy classification ${capability.classification}`,
    );
  }
});
