import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeNamedRuntimeArtifact,
  decodeRuntimeArtifact,
  decodeRuntimeJson,
} from "./decoder";

function validReadyDecision() {
  return {
    schemaVersion: "strategy-decision.v1",
    releaseId: "release-fixture-1",
    producerModule: "execution_feasibility_final_decision",
    generatedAt: "2026-01-15T00:01:00.000Z",
    sourceCutoff: "2026-01-15T00:00:00.000Z",
    contentHash: "sha256:decision-fixture",
    decisionId: "decision-fixture-1",
    episodeId: "episode-fixture-1",
    draftId: "draft-fixture-1",
    feasibilityId: "feasibility-fixture-1",
    reasonCodes: ["all_hard_gates_passed"],
    decidedAt: "2026-01-15T00:01:00.000Z",
    actionState: "TRADE_PLAN_READY",
    executablePlan: {
      planId: "plan-fixture-1",
      direction: "LONG",
      entryTrigger: "Close and retest above the structural level",
      plannedEntryZone: {
        lower: "100",
        upper: "101",
        sourceLevelIds: ["support-fixture-1"],
      },
      structuralInvalidation: "Close below reclaimed support",
      structuralStop: "98",
      targets: [
        {
          targetId: "target-fixture-1",
          price: "110",
          allocationPercent: 100,
          source: "PRIOR_EXTREME",
          sourceLevelIds: ["resistance-fixture-1"],
        },
      ],
      structuralRewardRisk: 3.5,
      estimatedNetRewardRisk: 3.2,
      expiresAt: "2026-01-15T00:16:00.000Z",
      noChaseCondition: "Do not enter above the planned zone",
    },
  } as const;
}

test("decodes and freezes a complete READY artifact", () => {
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    validReadyDecision(),
    "PROCESS",
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.actionState, "TRADE_PLAN_READY");
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.executablePlan), true);
  assert.equal(Object.isFrozen(result.value.executablePlan.targets), true);
});

test("rejects incomplete READY and every non-ready executable plan", () => {
  const ready = validReadyDecision();
  const incomplete = {
    ...ready,
    executablePlan: null,
  };
  const readyResult = decodeRuntimeArtifact(
    "StrategyDecision",
    incomplete,
    "API",
  );
  assert.equal(readyResult.ok, false);

  const waitWithPlan = {
    ...ready,
    actionState: "WAIT",
  };
  const waitResult = decodeRuntimeArtifact(
    "StrategyDecision",
    waitWithPlan,
    "API",
  );
  assert.equal(waitResult.ok, false);
});

test("rejects low RR, invalid geometry, allocation drift and unknown fields", () => {
  const ready = validReadyDecision();
  const invalid = {
    ...ready,
    undeclaredRuntimeField: "must fail closed",
    executablePlan: {
      ...ready.executablePlan,
      structuralStop: "102",
      structuralRewardRisk: 2.99,
      targets: [
        {
          ...ready.executablePlan.targets[0],
          allocationPercent: 90,
        },
      ],
    },
  };
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    invalid,
    "STORAGE",
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.errorCode, "SCHEMA_REJECTED");
  assert.ok(result.issues.length >= 4);
});

test("compares decimal price geometry without floating-point precision loss", () => {
  const ready = validReadyDecision();
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    {
      ...ready,
      executablePlan: {
        ...ready.executablePlan,
        plannedEntryZone: {
          lower: "9007199254740992",
          upper: "9007199254740993",
          sourceLevelIds: ["support-fixture-1"],
        },
        structuralStop: "9007199254740991",
        targets: [
          {
            ...ready.executablePlan.targets[0],
            price: "9007199254740994",
          },
        ],
      },
    },
    "PROCESS",
  );

  assert.equal(result.ok, true);
});

test("rejects unbounded decimal strings", () => {
  const ready = validReadyDecision();
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    {
      ...ready,
      executablePlan: {
        ...ready.executablePlan,
        structuralStop: "9".repeat(129),
      },
    },
    "API",
  );

  assert.equal(result.ok, false);
});

test("does not let HTTP liveness masquerade as business readiness", () => {
  const runtimeTruth = {
    schemaVersion: "runtime-truth.v1",
    releaseId: "release-fixture-1",
    producerModule: "runtime_security_release_control",
    generatedAt: "2026-01-15T00:01:00.000Z",
    sourceCutoff: "2026-01-15T00:00:00.000Z",
    contentHash: "sha256:runtime-fixture",
    runtimeTruthId: "runtime-fixture-1",
    liveness: "READY",
    dependencyReadiness: "PARTIAL",
    businessReadiness: "READY",
    dataFreshness: "STALE",
    releaseValidity: "UNKNOWN",
    reasonCodes: [],
  };

  const result = decodeRuntimeArtifact(
    "RuntimeTruthSnapshot",
    runtimeTruth,
    "API",
  );
  assert.equal(result.ok, false);
});

test("rejects invalid and oversized JSON before schema parsing", () => {
  const invalid = decodeRuntimeJson(
    "StrategyDecision",
    "{not-json",
    "API",
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.errorCode, "INVALID_JSON");
  }

  const oversized = decodeRuntimeJson(
    "StrategyDecision",
    JSON.stringify(validReadyDecision()),
    "API",
    10,
  );
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.errorCode, "PAYLOAD_TOO_LARGE");
  }
});

test("rejects cyclic graphs and prototype-mutating keys", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const cyclicResult = decodeRuntimeArtifact(
    "StrategyDecision",
    cyclic,
    "PROCESS",
  );
  assert.equal(cyclicResult.ok, false);
  if (!cyclicResult.ok) {
    assert.equal(cyclicResult.errorCode, "UNSAFE_OBJECT_GRAPH");
  }

  const unsafe = JSON.parse(
    '{"__proto__":{"polluted":true}}',
  ) as unknown;
  const unsafeResult = decodeRuntimeArtifact(
    "StrategyDecision",
    unsafe,
    "PROCESS",
  );
  assert.equal(unsafeResult.ok, false);
  if (!unsafeResult.ok) {
    assert.equal(unsafeResult.errorCode, "UNSAFE_OBJECT_GRAPH");
  }
});

test("rejects hostile accessors, proxies, non-plain objects and sparse arrays", () => {
  const accessor = { ...validReadyDecision() } as Record<string, unknown>;
  Object.defineProperty(accessor, "decisionId", {
    enumerable: true,
    get() {
      throw new Error("decoder must never execute an input accessor");
    },
  });
  const accessorResult = decodeRuntimeArtifact(
    "StrategyDecision",
    accessor,
    "PROCESS",
  );
  assert.equal(accessorResult.ok, false);
  if (!accessorResult.ok) {
    assert.equal(accessorResult.errorCode, "UNSAFE_OBJECT_GRAPH");
    assert.ok(
      accessorResult.issues.some(
        (issue) => issue.code === "accessor_object_property",
      ),
    );
  }

  const hostileProxy = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("hostile proxy trap");
    },
  });
  const proxyResult = decodeRuntimeArtifact(
    "StrategyDecision",
    hostileProxy,
    "PROCESS",
  );
  assert.equal(proxyResult.ok, false);
  if (!proxyResult.ok) {
    assert.equal(proxyResult.errorCode, "UNSAFE_OBJECT_GRAPH");
    assert.equal(proxyResult.issues[0]?.code, "object_inspection_failed");
  }

  const nonPlain = Object.assign(
    Object.create({ inherited: true }) as Record<string, unknown>,
    validReadyDecision(),
  );
  const nonPlainResult = decodeRuntimeArtifact(
    "StrategyDecision",
    nonPlain,
    "PROCESS",
  );
  assert.equal(nonPlainResult.ok, false);

  const sparse = new Array<unknown>(2);
  sparse[0] = "present";
  const sparseResult = decodeRuntimeArtifact(
    "StrategyDecision",
    sparse,
    "PROCESS",
  );
  assert.equal(sparseResult.ok, false);
  if (!sparseResult.ok) {
    assert.ok(sparseResult.issues.some((issue) => issue.code === "sparse_array"));
  }
});

test("rejects artifacts whose source cutoff is later than generation", () => {
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    {
      ...validReadyDecision(),
      sourceCutoff: "2026-01-15T00:02:00.000Z",
      generatedAt: "2026-01-15T00:01:00.000Z",
      decidedAt: "2026-01-15T00:03:00.000Z",
    },
    "REPLAY",
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "SCHEMA_REJECTED");
    assert.equal(result.issues[0]?.code, "trace_cutoff_after_generation");
  }
});

test("does not reflect rejected field names or values in schema errors", () => {
  const marker = "schema-sensitive-marker-must-not-leak";
  const result = decodeRuntimeArtifact(
    "StrategyDecision",
    {
      ...validReadyDecision(),
      [marker]: marker,
    },
    "API",
  );

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test("rejects negative monetary risk values", () => {
  const result = decodeRuntimeArtifact(
    "PersonalRiskView",
    {
      schemaVersion: "personal-risk-view.v1",
      releaseId: "release-fixture-1",
      producerModule: "personal_risk_lens",
      generatedAt: "2026-01-15T00:01:00.000Z",
      sourceCutoff: "2026-01-15T00:00:00.000Z",
      contentHash: "sha256:risk-fixture",
      riskViewId: "risk-fixture-1",
      decisionId: "decision-fixture-1",
      userFit: "BLOCKED",
      maximumPositionNotional: "-1",
      maximumLoss: null,
      requiredMargin: null,
      liquidationDistancePercent: null,
      estimatedFees: null,
      blockerReasonCodes: ["invalid_notional"],
    },
    "API",
  );

  assert.equal(result.ok, false);
});

test("rejects unknown artifact names without reflecting raw payload values", () => {
  const marker = "raw-sensitive-marker-must-not-leak";
  const result = decodeNamedRuntimeArtifact(
    "UnregisteredArtifact",
    { value: marker },
    "API",
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.errorCode, "UNKNOWN_ARTIFACT");
  assert.equal(JSON.stringify(result).includes(marker), false);
});
