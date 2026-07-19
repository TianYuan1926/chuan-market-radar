import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_IDS, MODULE_REGISTRY, moduleDefinition } from "./module-registry";

test("registers exactly eighteen unique authority modules", () => {
  assert.equal(MODULE_REGISTRY.length, 18);
  assert.equal(new Set(MODULE_REGISTRY.map((module) => module.id)).size, 18);
  assert.deepEqual(MODULE_REGISTRY.map((module) => module.id), MODULE_IDS);
});

test("keeps authority outputs unique", () => {
  const outputs = MODULE_REGISTRY.flatMap((module) => module.authorityOutputs);
  assert.equal(new Set(outputs).size, outputs.length);
});

test("keeps pipeline dependencies forward-only except cross-cutting runtime truth", () => {
  const pipelineOrder = new Map(
    MODULE_REGISTRY.map((module) => [module.id, module.pipelineOrder]),
  );

  for (const definition of MODULE_REGISTRY) {
    for (const dependencyId of definition.readsFrom) {
      const dependencyOrder = pipelineOrder.get(dependencyId);
      if (dependencyOrder === null) {
        assert.equal(dependencyId, "runtime_security_release_control");
        continue;
      }
      assert.ok(
        dependencyOrder !== undefined &&
          definition.pipelineOrder !== null &&
          dependencyOrder < definition.pipelineOrder,
        `${definition.id} must only read an earlier pipeline authority`,
      );
    }
  }
});

test("allows only final decision to produce StrategyDecision", () => {
  const producers = MODULE_REGISTRY.filter((module) =>
    module.authorityOutputs.some((output) => output === "StrategyDecision"),
  );
  assert.deepEqual(
    producers.map((module) => module.id),
    ["execution_feasibility_final_decision"],
  );
  assert.equal(
    moduleDefinition("strategy_construction").prohibited.some(
      (prohibited) => prohibited === "ready_state",
    ),
    true,
  );
});

test("prevents live pipeline modules from reading Outcome or Research", () => {
  const forbiddenDependencies = new Set([
    "outcome_evaluation",
    "research_governance",
  ]);
  const liveModules = MODULE_REGISTRY.filter(
    (module) =>
      module.id !== "outcome_evaluation" &&
      module.id !== "research_governance",
  );

  for (const definition of liveModules) {
    assert.equal(
      definition.readsFrom.some((dependency) =>
        forbiddenDependencies.has(dependency)),
      false,
      `${definition.id} cannot read evaluation or research output`,
    );
  }
});
