import assert from "node:assert/strict";
import test from "node:test";
import {
  M3_SCOPE_REBASE_ACCEPTANCE_AXES,
  M3_SCOPE_REBASE_AUTHORITY,
  M3_SCOPE_REBASE_COMMON_REQUIREMENTS,
  M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS,
  M3_SCOPE_REBASE_EQUITY_REQUIREMENTS,
  M3_SCOPE_REBASE_GATE_VERSION,
  M3_SCOPE_REBASE_WARMUP_REQUIREMENT,
  assessM3ScopeRebaseReadiness,
  requiredM3ScopeRebaseRequirements,
  type M3ScopeRebaseRequirementId,
} from "./m3-scope-rebase-gate";
import {
  M1_SCOPE_EPOCH,
  type M1AssetDomain,
  type M1VenueSourceId,
} from "../source-capability/source-capability-contract";
import { M1_LISTING_LIFECYCLE_STATES } from "../multi-asset-universe/multi-asset-identity-contract";

const DIGESTS = Array.from({ length: 40 }, (_, index) =>
  `sha256:${index.toString(16).padStart(64, "0")}`);

type M1ListingLifecycleState =
  (typeof M1_LISTING_LIFECYCLE_STATES)[number];

type FixtureOptions = Readonly<{
  venue?: M1VenueSourceId;
  assetDomain?: M1AssetDomain;
  lifecycleState?: M1ListingLifecycleState;
  requirementIds?: readonly M3ScopeRebaseRequirementId[];
}>;

function fixture(options: FixtureOptions = {}) {
  const venue = options.venue ?? "BINANCE_FUTURES";
  const assetDomain = options.assetDomain ?? "CRYPTO_LINEAR_PERPETUAL";
  const lifecycleState = options.lifecycleState ?? "ESTABLISHED";
  const requirementIds = options.requirementIds ??
    requiredM3ScopeRebaseRequirements(assetDomain, lifecycleState);
  return {
    schemaVersion: M3_SCOPE_REBASE_GATE_VERSION,
    reviewId: "m3-scope-review-fixture",
    assessedAt: "2026-07-24T00:00:00.000Z",
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: "scope-v2-fixture-release",
    venue,
    assetDomain,
    lifecycleState,
    proofs: requirementIds.map((requirementId, index) => ({
      requirementId,
      status: "PASS",
      scopeEpoch: M1_SCOPE_EPOCH,
      venue,
      assetDomain,
      lifecycleState,
      releaseId: "scope-v2-fixture-release",
      evidenceRefs: [{
        evidenceId: `evidence:${requirementId.toLowerCase()}`,
        releaseId: "scope-v2-fixture-release",
        digest: DIGESTS[index],
      }],
      reasonCodes: ["fixture_only_not_runtime_evidence"],
    })),
  };
}

test("scope rebase keeps the four expansion axes independent", () => {
  assert.deepEqual(M3_SCOPE_REBASE_ACCEPTANCE_AXES, [
    "BITGET_VENUE",
    "LISTING_LIFECYCLE",
    "EQUITY_ASSET_DOMAIN",
    "DATA_MAXIMIZATION",
  ]);
  assert.equal(new Set(M3_SCOPE_REBASE_ACCEPTANCE_AXES).size, 4);
});

test("established crypto slice can pass only the full Scope V2 prerequisite set", () => {
  const result = assessM3ScopeRebaseReadiness(fixture());
  assert.equal(
    result.status,
    "READY_FOR_SCOPE_V2_M3_4_CONTRACT_IMPLEMENTATION",
  );
  assert.equal(result.authority, M3_SCOPE_REBASE_AUTHORITY);
  assert.deepEqual(
    result.requiredRequirementIds,
    [...M3_SCOPE_REBASE_COMMON_REQUIREMENTS,
      ...M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS].sort(),
  );
  assert.deepEqual(
    result.passedRequirementIds,
    result.requiredRequirementIds,
  );
  assert.equal(result.blockers.length, 0);
  assert.equal(Object.isFrozen(result), true);
});

test("Bitget is a first-class venue binding and cannot borrow another venue proof", () => {
  const input = fixture({ venue: "BITGET_FUTURES" });
  const passed = assessM3ScopeRebaseReadiness(input);
  assert.equal(
    passed.status,
    "READY_FOR_SCOPE_V2_M3_4_CONTRACT_IMPLEMENTATION",
  );
  assert.equal(passed.venue, "BITGET_FUTURES");

  const borrowed = structuredClone(input);
  borrowed.proofs[0]!.venue = "BINANCE_FUTURES";
  const blocked = assessM3ScopeRebaseReadiness(borrowed);
  assert.equal(blocked.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    blocked.blockers.some((reason) =>
      reason.startsWith("scope_rebase_binding_mismatch:")),
  );
});

test("proofs cannot be borrowed across lifecycle or release boundaries", () => {
  const lifecycleBorrowed = fixture({ lifecycleState: "TRADING_WARMUP" });
  lifecycleBorrowed.proofs[0]!.lifecycleState = "ESTABLISHED";
  const lifecycleResult = assessM3ScopeRebaseReadiness(lifecycleBorrowed);
  assert.equal(lifecycleResult.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    lifecycleResult.blockers.some((reason) =>
      reason.startsWith("scope_rebase_binding_mismatch:")),
  );

  const releaseBorrowed = fixture();
  releaseBorrowed.proofs[0]!.releaseId = "different-release";
  releaseBorrowed.proofs[0]!.evidenceRefs[0]!.releaseId = "different-release";
  const releaseResult = assessM3ScopeRebaseReadiness(releaseBorrowed);
  assert.equal(releaseResult.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    releaseResult.blockers.some((reason) =>
      reason.startsWith("scope_rebase_binding_mismatch:")),
  );
});

test("equity domains require session, reference, corporate action, FX and basis evidence", () => {
  for (const assetDomain of [
    "EQUITY_SINGLE_NAME_PERPETUAL",
    "EQUITY_INDEX_ETF_PERPETUAL",
  ] as const) {
    const result = assessM3ScopeRebaseReadiness(fixture({ assetDomain }));
    assert.equal(
      result.status,
      "READY_FOR_SCOPE_V2_M3_4_CONTRACT_IMPLEMENTATION",
    );
    for (const requirement of M3_SCOPE_REBASE_EQUITY_REQUIREMENTS) {
      assert.ok(result.requiredRequirementIds.includes(requirement));
    }
    assert.equal(
      result.requiredRequirementIds.includes("FUNDING_FEE_SCHEDULE"),
      false,
    );
  }
});

test("crypto evidence cannot substitute for equity evidence", () => {
  const result = assessM3ScopeRebaseReadiness(fixture({
    assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    requirementIds: [
      ...M3_SCOPE_REBASE_COMMON_REQUIREMENTS,
      ...M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS,
    ],
  }));
  assert.equal(result.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    result.blockers.includes(
      "missing_scope_rebase_requirement:corporate_action",
    ),
  );
  assert.ok(
    result.blockers.includes(
      "unexpected_scope_rebase_requirement:funding_fee_schedule",
    ),
  );
});

test("listing warmup adds an independent calibration requirement", () => {
  const requirements = requiredM3ScopeRebaseRequirements(
    "CRYPTO_LINEAR_PERPETUAL",
    "TRADING_WARMUP",
  );
  assert.ok(requirements.includes(M3_SCOPE_REBASE_WARMUP_REQUIREMENT));

  const missingWarmup = requirements.filter((requirement) =>
    requirement !== M3_SCOPE_REBASE_WARMUP_REQUIREMENT);
  const result = assessM3ScopeRebaseReadiness(fixture({
    lifecycleState: "TRADING_WARMUP",
    requirementIds: missingWarmup,
  }));
  assert.equal(result.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    result.blockers.includes(
      "missing_scope_rebase_requirement:listing_warmup_execution_calibration",
    ),
  );
});

test("non-trading lifecycle states remain blocked even with all listed proofs", () => {
  for (const lifecycleState of [
    "PRE_LAUNCH_OR_PREOPEN",
    "MAINTENANCE",
    "RESTRICTED",
    "SUSPENDED",
    "DELISTING",
    "OFFLINE",
    "UNRESOLVED",
  ] as const) {
    const result = assessM3ScopeRebaseReadiness(fixture({ lifecycleState }));
    assert.equal(result.status, "BLOCKED_SCOPE_REBASE");
    assert.ok(
      result.blockers.includes(
        `lifecycle_not_execution_eligible:${lifecycleState.toLowerCase()}`,
      ),
    );
  }
});

test("watch, CFD, RWA and cross-market context never enter M3.4 through this gate", () => {
  for (const assetDomain of [
    "EQUITY_CFD",
    "OTHER_RWA_DERIVATIVE",
    "ASSET_LISTING_WATCH",
    "CROSS_MARKET_CONTEXT",
  ] as const) {
    const result = assessM3ScopeRebaseReadiness(fixture({ assetDomain }));
    assert.equal(result.status, "BLOCKED_SCOPE_REBASE");
    assert.ok(
      result.blockers.includes(
        `asset_domain_not_execution_eligible:${assetDomain.toLowerCase()}`,
      ),
    );
  }
});

test("missing, unavailable and blocked requirements fail closed", () => {
  const missing = fixture();
  missing.proofs.pop();
  const missingResult = assessM3ScopeRebaseReadiness(missing);
  assert.equal(missingResult.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    missingResult.blockers.some((reason) =>
      reason.startsWith("missing_scope_rebase_requirement:")),
  );

  const unavailable = fixture();
  unavailable.proofs[0]!.status = "UNAVAILABLE";
  unavailable.proofs[0]!.evidenceRefs = [];
  const unavailableResult = assessM3ScopeRebaseReadiness(unavailable);
  assert.equal(unavailableResult.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    unavailableResult.blockers.some((reason) =>
      reason.startsWith("scope_rebase_requirement_unavailable:")),
  );

  const blocked = fixture();
  blocked.proofs[0]!.status = "BLOCKED";
  blocked.proofs[0]!.evidenceRefs = [];
  const blockedResult = assessM3ScopeRebaseReadiness(blocked);
  assert.equal(blockedResult.status, "BLOCKED_SCOPE_REBASE");
  assert.ok(
    blockedResult.blockers.some((reason) =>
      reason.startsWith("scope_rebase_requirement_blocked:")),
  );
});

test("duplicate or evidence-free PASS proofs are rejected at the schema boundary", () => {
  const duplicate = fixture();
  duplicate.proofs.push(structuredClone(duplicate.proofs[0]!));
  const duplicateResult = assessM3ScopeRebaseReadiness(duplicate);
  assert.equal(duplicateResult.status, "BLOCKED_SCOPE_REBASE");
  assert.equal(duplicateResult.reviewId, null);
  assert.deepEqual(
    duplicateResult.blockers,
    ["m3_scope_rebase_input_schema_rejected"],
  );

  const evidenceFree = fixture();
  evidenceFree.proofs[0]!.evidenceRefs = [];
  const evidenceFreeResult = assessM3ScopeRebaseReadiness(evidenceFree);
  assert.equal(evidenceFreeResult.status, "BLOCKED_SCOPE_REBASE");
  assert.equal(evidenceFreeResult.reviewId, null);
});

test("results are deterministic and never acquire feasibility or READY authority", () => {
  const input = fixture({
    venue: "OKX_SWAP",
    assetDomain: "EQUITY_INDEX_ETF_PERPETUAL",
  });
  const first = assessM3ScopeRebaseReadiness(input);
  const second = assessM3ScopeRebaseReadiness(structuredClone(input));
  assert.equal(first.resultHash, second.resultHash);
  assert.equal(
    first.authority,
    "GOVERNANCE_ONLY_NO_FEASIBILITY_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  );
  assert.equal("snapshot" in first, false);
  assert.equal("actionState" in first, false);
});
