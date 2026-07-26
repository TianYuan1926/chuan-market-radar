import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFullCiWorkflowPolicy,
  validatePackagePolicy,
  validateWorkflowPolicy,
} from "./a0-engineering-materials-gate.mjs";

function packageFixture() {
  return {
    packageJson: {
      packageManager: "npm@10.9.8",
      engines: { node: "22.23.1", npm: "10.9.8" },
      volta: { node: "22.23.1", npm: "10.9.8" },
      dependencies: {
        next: "16.2.12",
        react: "19.2.7",
      },
      devDependencies: {
        "@next/eslint-plugin-next": "16.2.12",
      },
    },
    packageLock: {
      packages: {
        "": {
          dependencies: {
            next: "16.2.12",
            react: "19.2.7",
          },
          devDependencies: {
            "@next/eslint-plugin-next": "16.2.12",
          },
        },
        "node_modules/next": {
          version: "16.2.12",
          license: "MIT",
        },
        "node_modules/react": {
          version: "19.2.7",
          license: "MIT",
        },
        "node_modules/@next/eslint-plugin-next": {
          version: "16.2.12",
          license: "MIT",
        },
      },
    },
  };
}

test("materials gate accepts exact runtime, package and license truth", () => {
  const fixture = packageFixture();
  assert.deepEqual(
    validatePackagePolicy(fixture.packageJson, fixture.packageLock),
    [],
  );
});

test("materials gate rejects latest, lock drift, vulnerable Next and GPL", () => {
  const fixture = packageFixture();
  fixture.packageJson.dependencies.next = "latest";
  fixture.packageLock.packages["node_modules/react"].license = "GPL-3.0";
  const codes = validatePackagePolicy(
    fixture.packageJson,
    fixture.packageLock,
  ).map((item) => item.code);
  assert.ok(codes.includes("DIRECT_DEPENDENCY_NOT_EXACT"));
  assert.ok(codes.includes("LOCK_ROOT_SPEC_DRIFT"));
  assert.ok(codes.includes("LOCK_RESOLUTION_DRIFT"));
  assert.ok(codes.includes("NEXT_SECURITY_PATCH_BELOW_MINIMUM"));
  assert.ok(codes.includes("NEXT_ESLINT_VERSION_DRIFT"));
  assert.ok(codes.includes("FORBIDDEN_STRONG_COPYLEFT_LICENSE"));
});

test("workflow gate requires full action SHA and exact runner versions", () => {
  assert.deepEqual(
    validateWorkflowPolicy(
      ".github/workflows/pass.yml",
      [
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-24.04",
        "    steps:",
        "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
        "        with:",
        "          node-version: 22.23.1",
      ].join("\n"),
    ),
    [],
  );

  const codes = validateWorkflowPolicy(
    ".github/workflows/fail.yml",
    [
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: 22",
    ].join("\n"),
  ).map((item) => item.code);
  assert.ok(codes.includes("GITHUB_ACTION_NOT_PINNED_TO_FULL_SHA"));
  assert.ok(codes.includes("GITHUB_NODE_RUNTIME_NOT_EXACT"));
  assert.ok(codes.includes("GITHUB_RUNNER_FLOATING_LATEST"));
});

test("full quality workflow retains the Git ancestry required by M0", () => {
  const workflow = [
    "on:",
    "  pull_request:",
    "  push:",
    "jobs:",
    "  test:",
    "    steps:",
    "      - name: Checkout exact source",
    "        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "        with:",
    "          fetch-depth: 0",
    "          persist-credentials: false",
    "      - name: Run complete production CI",
    "        run: npm run ci:production",
  ].join("\n");
  assert.deepEqual(
    validateFullCiWorkflowPolicy(
      ".github/workflows/v2-full-quality.yml",
      workflow,
    ),
    [],
  );

  const issues = validateFullCiWorkflowPolicy(
    ".github/workflows/v2-full-quality.yml",
    workflow.replace("          fetch-depth: 0\n", ""),
  );
  assert.ok(
    issues.some((item) => item.code === "V2_FULL_CI_GIT_HISTORY_SHALLOW"),
  );
});
