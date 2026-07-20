import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { MODULE_REGISTRY } from "../domain/module-registry";
import { RUNTIME_SCHEMA_NAMES } from "../runtime-schema/registry";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../runtime-schema/schema-versions";
import {
  buildLegacyConsumerMap,
  type LegacyCapabilityAtlas,
  type LegacyConsumerMap,
  type LegacyExtractionPolicy,
} from "./legacy-consumer-map";

export type M0ExitCheck = Readonly<{
  id: string;
  passed: boolean;
  evidence: string;
}>;

export type M0ExitReport = Readonly<{
  schemaVersion: "market-radar-v2-m0-exit-report.v1";
  status: "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED" | "FAIL_M0_EXIT";
  branch: string;
  checks: readonly M0ExitCheck[];
  authorityOutputs: number;
  runtimeSchemas: number;
  legacyCapabilities: number;
  legacySourceFiles: number;
  productionMutationPerformed: false;
  productionStatus: "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION";
  nextEntry: "LOCAL_ENGINEERING=V2-M2.2-B0.2-C-LOCAL-PASS OPERATIONAL_NEXT=V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START EXTERNAL_GATE=V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION DETECTORS_DRAFT";
}>;

type CheckRunner = () => string;

function readJson<T>(repositoryRoot: string, path: string): T {
  return JSON.parse(
    readFileSync(resolve(repositoryRoot, path), "utf8"),
  ) as T;
}

function listSourceFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = resolve(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (/\.(?:ts|tsx)$/u.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function importSpecifiers(path: string): string[] {
  return ts
    .preProcessFile(readFileSync(path, "utf8"), true, true)
    .importedFiles.map((entry) => entry.fileName);
}

function gitOutputLines(repositoryRoot: string, args: readonly string[]): string[] {
  return execFileSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isolationViolations(repositoryRoot: string): string[] {
  const sourceRoot = resolve(repositoryRoot, "src");
  const v2Root = resolve(sourceRoot, "v2");
  const violations: string[] = [];

  for (const file of listSourceFiles(v2Root)) {
    const repositoryPath = relative(repositoryRoot, file).split(sep).join("/");
    const productionFile =
      !file.endsWith(".test.ts") &&
      !file.includes(`${sep}fixtures${sep}`) &&
      !file.includes(`${sep}testing${sep}`);
    for (const specifier of importSpecifiers(file)) {
      if (
        productionFile &&
        (specifier.includes("fixtures") || specifier.includes("testing"))
      ) {
        violations.push(`${repositoryPath}:test-support:${specifier}`);
      }
      if (!productionFile) {
        continue;
      }
      if (specifier.startsWith("@/") && !specifier.startsWith("@/v2")) {
        violations.push(`${repositoryPath}:legacy-alias:${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (target !== v2Root && !target.startsWith(`${v2Root}${sep}`)) {
          violations.push(`${repositoryPath}:v2-escape:${specifier}`);
        }
      }
    }
  }

  for (const file of listSourceFiles(sourceRoot)) {
    if (file === v2Root || file.startsWith(`${v2Root}${sep}`)) {
      continue;
    }
    const repositoryPath = relative(repositoryRoot, file).split(sep).join("/");
    for (const specifier of importSpecifiers(file)) {
      if (specifier.startsWith("@/v2")) {
        violations.push(`${repositoryPath}:v2-alias:${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (target === v2Root || target.startsWith(`${v2Root}${sep}`)) {
          violations.push(`${repositoryPath}:legacy-to-v2:${specifier}`);
        }
      }
    }
  }

  return violations.sort();
}

export function buildM0ExitReport(repositoryRoot: string): M0ExitReport {
  const atlas = readJson<LegacyCapabilityAtlas>(
    repositoryRoot,
    "docs/architecture/v2/legacy-capability-atlas.v1.json",
  );
  const policy = readJson<LegacyExtractionPolicy>(
    repositoryRoot,
    "docs/architecture/v2/LEGACY_EXTRACTION_POLICY_V1.json",
  );
  const committedMap = readJson<LegacyConsumerMap>(
    repositoryRoot,
    "docs/architecture/v2/legacy-consumer-map.v1.json",
  );
  const baseManifest = readJson<{
    implementation: { branch: string };
    production: { mutationPerformed: boolean; finalStatus: string };
    authorizations: {
      productionMutation: boolean;
      databaseMigration: boolean;
      legacyDeletion: boolean;
      automaticTrading: boolean;
    };
  }>(repositoryRoot, "docs/architecture/v2/V2_BASE_MANIFEST.v1.json");
  const fixture = readJson<{
    fixtureKind: string;
    synthetic: boolean;
    mustNeverEnterRuntime: boolean;
  }>(repositoryRoot, "src/v2/fixtures/m1-foundation-slice.v1.json");
  const packageJson = readJson<{
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  }>(repositoryRoot, "package.json");
  const currentMap = buildLegacyConsumerMap(repositoryRoot, atlas, policy);
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const authorityOutputs = MODULE_REGISTRY.flatMap(
    (definition) => definition.authorityOutputs,
  ).sort();
  const checks: M0ExitCheck[] = [];

  function check(id: string, runner: CheckRunner): void {
    try {
      checks.push({ id, passed: true, evidence: runner() });
    } catch (error) {
      checks.push({
        id,
        passed: false,
        evidence: error instanceof Error ? error.message : "unknown validation error",
      });
    }
  }

  check("clean_v2_branch_identity", () => {
    if (branch !== baseManifest.implementation.branch) {
      throw new Error(
        `branch ${branch} does not match ${baseManifest.implementation.branch}`,
      );
    }
    return branch;
  });

  check("single_runtime_schema_per_authority_output", () => {
    const objectSchemaVersions = Object.values(RUNTIME_OBJECT_SCHEMA_VERSIONS);
    if (
      authorityOutputs.length !== new Set(authorityOutputs).size ||
      JSON.stringify(authorityOutputs) !== JSON.stringify(RUNTIME_SCHEMA_NAMES) ||
      objectSchemaVersions.length !== authorityOutputs.length - 1 ||
      new Set(objectSchemaVersions).size !== objectSchemaVersions.length
    ) {
      throw new Error(
        "runtime schema registry or exact version registry does not cover authority outputs",
      );
    }
    return `${RUNTIME_SCHEMA_NAMES.length} strict schemas / ${objectSchemaVersions.length} exact envelope versions`;
  });

  check("legacy_consumer_map_current", () => {
    if (JSON.stringify(currentMap) !== JSON.stringify(committedMap)) {
      throw new Error("committed Legacy consumer map differs from current source graph");
    }
    return `${currentMap.totals.sourceFiles} source files / ${currentMap.totals.directRuntimeConsumerEdges} runtime edges`;
  });

  check("legacy_sources_match_reviewed_commit", () => {
    if (!/^[0-9a-f]{40}$/u.test(policy.reviewedAgainstCommit)) {
      throw new Error("Legacy extraction policy must pin a full Git commit");
    }
    execFileSync(
      "git",
      ["cat-file", "-e", `${policy.reviewedAgainstCommit}^{commit}`],
      { cwd: repositoryRoot, stdio: "ignore" },
    );
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", policy.reviewedAgainstCommit, "HEAD"],
      { cwd: repositoryRoot, stdio: "ignore" },
    );

    const protectedSources = new Set(
      [...currentMap.capabilities, ...committedMap.capabilities].flatMap(
        (capability) => capability.sourceFiles,
      ),
    );
    const changedPaths = new Set([
      ...gitOutputLines(repositoryRoot, [
        "diff",
        "--name-only",
        "--diff-filter=ACDMRT",
        policy.reviewedAgainstCommit,
        "--",
      ]),
      ...gitOutputLines(repositoryRoot, [
        "ls-files",
        "--others",
        "--exclude-standard",
      ]),
    ]);
    const changedLegacySources = [...changedPaths]
      .filter((path) => protectedSources.has(path))
      .sort();
    if (changedLegacySources.length > 0) {
      throw new Error(
        `Legacy sources changed after policy review: ${changedLegacySources
          .slice(0, 5)
          .join(", ")}`,
      );
    }
    return `${policy.reviewedAgainstCommit} / zero protected source drift`;
  });

  check("legacy_extraction_policy_closed", () => {
    if (
      currentMap.legacyDeletionAllowed ||
      currentMap.legacyRuntimeImportAllowed ||
      currentMap.copyPasteWithoutBehavioralFixtureAllowed ||
      currentMap.capabilities.some((capability) => capability.deletionAllowedNow)
    ) {
      throw new Error("Legacy extraction or deletion policy is open");
    }
    return `${currentMap.totals.extractionCandidates} reviewed extraction candidates / deletion false`;
  });

  check("v2_legacy_bidirectional_import_fence", () => {
    const violations = isolationViolations(repositoryRoot);
    if (violations.length > 0) {
      throw new Error(violations.slice(0, 5).join(", "));
    }
    return "zero V2/Legacy production import violations";
  });

  check("synthetic_fixture_runtime_forbidden", () => {
    if (
      fixture.fixtureKind !== "TEST_ONLY_POINT_IN_TIME" ||
      !fixture.synthetic ||
      !fixture.mustNeverEnterRuntime
    ) {
      throw new Error("M1 fixture lost its explicit test-only boundary");
    }
    return "test-only / synthetic / runtime-forbidden";
  });

  check("runtime_schema_dependency_pinned", () => {
    if (packageJson.dependencies.zod !== "4.4.3") {
      throw new Error("zod runtime schema dependency is not pinned to 4.4.3");
    }
    return "zod@4.4.3";
  });

  check("m0_gates_in_production_ci", () => {
    const ci = packageJson.scripts["ci:production"] ?? "";
    const verifier = packageJson.scripts["v2:m0:verify"] ?? "";
    if (
      !ci.includes("test:v2-foundation") ||
      !ci.includes("v2:m0:verify") ||
      !verifier.includes("build:market-cli") ||
      !verifier.includes("v2:m0:verify:compiled")
    ) {
      throw new Error(
        "production CI does not execute V2 tests and a self-building M0 verifier",
      );
    }
    return "test:v2-foundation + self-building v2:m0:verify";
  });

  check("production_and_destructive_authority_closed", () => {
    if (
      baseManifest.production.mutationPerformed ||
      baseManifest.authorizations.productionMutation ||
      baseManifest.authorizations.databaseMigration ||
      baseManifest.authorizations.legacyDeletion ||
      baseManifest.authorizations.automaticTrading
    ) {
      throw new Error("M0 baseline contains forbidden production authority");
    }
    if (
      baseManifest.production.finalStatus !==
      "unknown_until_fresh_read_only_verification"
    ) {
      throw new Error("M0 baseline overstates current production truth");
    }
    return "production mutation false / destructive authority false / status unknown";
  });

  const passed = checks.every((item) => item.passed);
  return {
    schemaVersion: "market-radar-v2-m0-exit-report.v1",
    status: passed
      ? "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED"
      : "FAIL_M0_EXIT",
    branch,
    checks,
    authorityOutputs: authorityOutputs.length,
    runtimeSchemas: RUNTIME_SCHEMA_NAMES.length,
    legacyCapabilities: currentMap.totals.capabilities,
    legacySourceFiles: currentMap.totals.sourceFiles,
    productionMutationPerformed: false,
    productionStatus: "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION",
    nextEntry: "LOCAL_ENGINEERING=V2-M2.2-B0.2-C-LOCAL-PASS OPERATIONAL_NEXT=V2-M2.2-B0.2-C1-EGRESS-CAPABLE-FORWARD-CAPTURE-START EXTERNAL_GATE=V2-M2.2-B0.2-B-EXACT-SOURCE-RIGHTS-AND-CAPABILITY-RESOLUTION DETECTORS_DRAFT",
  };
}

if (require.main === module) {
  const report = buildM0ExitReport(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED") {
    process.exitCode = 1;
  }
}
