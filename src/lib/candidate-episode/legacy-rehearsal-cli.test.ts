import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateSyntheticFixture } from "../../scripts/candidate-episode/legacy-rehearsal";

const ROOT = process.cwd();
const COMPILED_CLI = resolve(
  ROOT,
  ".tmp/market-tests/scripts/candidate-episode/legacy-rehearsal.js",
);
const SOURCE_CLI = resolve(ROOT, "src/scripts/candidate-episode/legacy-rehearsal.ts");
const MODES = ["inventory", "classify", "backfill-dry-run", "reconcile"] as const;

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface DistributionEntry {
  count: number;
  value: string;
}

interface LegacyRehearsalOutput {
  mode: string;
  ok: boolean;
  schemaVersion: string;
  details: { kind: string };
  safety: {
    syntheticOnly: boolean;
    containsProductionData: boolean;
    externalReads: unknown[];
    authoritativeImportedCount: number;
  };
  distributions: {
    source: DistributionEntry[];
    classification: DistributionEntry[];
    target: DistributionEntry[];
    hash: DistributionEntry[];
    reason: DistributionEntry[];
  };
  hashes: {
    fixture: string;
    source: string;
    target: string;
  };
  reconciliation: {
    pass: boolean;
    countIdentity: boolean;
    deterministicIdentity: boolean;
    counts: {
      authoritativeImports: number;
      targetPromotions: number;
    };
  };
}

interface FixtureJson {
  fixtureId: string;
  schemaVersion: string;
  provenance: Record<string, unknown>;
  rows: Array<Record<string, unknown> & { facts: Record<string, unknown> }>;
}

function runCli(...args: string[]): CliRun {
  const result = spawnSync(process.execPath, [COMPILED_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseOutput(run: CliRun): LegacyRehearsalOutput {
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, "");
  return JSON.parse(run.stdout) as LegacyRehearsalOutput;
}

test("supports exactly the four frozen modes with byte-stable JSON", () => {
  for (const mode of MODES) {
    const first = runCli(mode);
    const second = runCli(mode);
    const output = parseOutput(first);

    assert.equal(first.stdout, second.stdout, mode);
    assert.equal(output.mode, mode);
    assert.equal(output.ok, true);
    assert.equal(output.schemaVersion, "wp-g0.2-legacy-rehearsal-output.v1");
    assert.equal(output.details.kind, mode);
    assert.equal(output.safety.syntheticOnly, true);
    assert.equal(output.safety.containsProductionData, false);
    assert.deepEqual(output.safety.externalReads, []);
    assert.equal(output.safety.authoritativeImportedCount, 0);
    assert.equal(output.reconciliation.counts.authoritativeImports, 0);
    assert.equal(output.reconciliation.counts.targetPromotions, 0);
  }
});

test("reports deterministic source, classification, target, hash, and reason distributions", () => {
  const output = parseOutput(runCli("reconcile"));

  assert.deepEqual(output.distributions.source, [
    { count: 1, value: "immutable_scan_archive" },
    { count: 1, value: "journal_events" },
    { count: 1, value: "scan_asset_states" },
    { count: 1, value: "unsupported_synthetic_legacy_feed" },
  ]);
  assert.deepEqual(output.distributions.classification, [
    { count: 1, value: "deterministic_importable" },
    { count: 1, value: "excluded" },
    { count: 1, value: "legacy_unclassified" },
    { count: 1, value: "partially_classifiable" },
  ]);
  assert.deepEqual(output.distributions.target, [
    { count: 0, value: "authoritative_import" },
    { count: 3, value: "not_planned" },
    { count: 1, value: "planned_dry_run_only" },
  ]);
  assert.deepEqual(output.distributions.hash, [
    { count: 4, value: "source_identity_unique" },
    { count: 4, value: "source_row_hash_unique" },
    { count: 1, value: "target_identity_unique" },
    { count: 1, value: "target_row_hash_unique" },
  ]);
  assert.deepEqual(output.distributions.reason, [
    { count: 1, value: "missing_direction" },
    { count: 1, value: "missing_first_seen_at" },
    { count: 1, value: "missing_observation_price" },
    { count: 1, value: "missing_observation_price_fact_id" },
    { count: 1, value: "missing_release_id" },
    { count: 1, value: "missing_status" },
    { count: 1, value: "source_policy_excluded" },
    { count: 1, value: "source_semantics_partial" },
    { count: 1, value: "unsupported_source" },
  ]);
  assert.match(output.hashes.fixture, /^[a-f0-9]{64}$/);
  assert.match(output.hashes.source, /^[a-f0-9]{64}$/);
  assert.match(output.hashes.target, /^[a-f0-9]{64}$/);
  assert.equal(output.reconciliation.pass, true);
  assert.equal(output.reconciliation.countIdentity, true);
  assert.equal(output.reconciliation.deterministicIdentity, true);
});

test("validates frozen synthetic provenance and every row before reconciliation", () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(
        ROOT,
        "src/lib/candidate-episode/fixtures/legacy-synthetic.v1.json",
      ),
      "utf8",
    ),
  ) as FixtureJson;

  assert.doesNotThrow(() => validateSyntheticFixture(fixture));
  assert.throws(
    () =>
      validateSyntheticFixture({
        ...fixture,
        provenance: { ...fixture.provenance, containsProductionData: true },
      }),
    /fixture_contains_production_data/,
  );
  assert.throws(
    () =>
      validateSyntheticFixture({
        ...fixture,
        provenance: { ...fixture.provenance, authoritativeImportedCount: 1 },
      }),
    /fixture_authoritative_imports_forbidden/,
  );
  assert.throws(
    () =>
      validateSyntheticFixture({
        ...fixture,
        rows: [
          {
            ...fixture.rows[0],
            facts: {
              ...fixture.rows[0].facts,
              canonicalInstrumentId: "external:REALUSD",
            },
          },
          ...fixture.rows.slice(1),
        ],
      }),
    /fixture_row_identity_not_synthetic/,
  );
});

test("rejects path injection and imports only the frozen fixture plus pure reconciliation module", () => {
  const missingMode = runCli();
  const injectedPath = runCli("inventory", "--fixture", "/tmp/external.json");
  const source = readFileSync(SOURCE_CLI, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );

  assert.equal(missingMode.status, 1);
  assert.equal(injectedPath.status, 1);
  assert.equal(missingMode.stdout, "");
  assert.equal(injectedPath.stdout, "");
  assert.match(missingMode.stderr, /cli_requires_exactly_one_mode/);
  assert.match(injectedPath.stderr, /cli_requires_exactly_one_mode/);
  assert.deepEqual(imports, [
    "../../lib/candidate-episode/fixtures/legacy-synthetic.v1.json",
    "../../lib/candidate-episode/legacy-reconciliation",
  ]);
  assert.doesNotMatch(source, /process\.env|dotenv|DATABASE_URL|POSTGRES|REDIS|node:fs|\brequire\s*\(/);
});
