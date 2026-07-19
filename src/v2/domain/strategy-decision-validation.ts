import type { StrategyDecision } from "./contracts";
import { CONSTITUTIONAL_INVARIANTS } from "./product-constitution";

export type ContractIssue = {
  code: string;
  path: string;
  message: string;
};

function requiredText(
  value: string | null | undefined,
  path: string,
  issues: ContractIssue[],
) {
  if (!value?.trim()) {
    issues.push({
      code: "required_text_missing",
      message: `${path} must be a non-empty string`,
      path,
    });
  }
}

export function validateStrategyDecision(
  decision: StrategyDecision,
): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];

  if (decision.actionState !== "TRADE_PLAN_READY") {
    if (decision.executablePlan !== null) {
      issues.push({
        code: "non_ready_plan_forbidden",
        message: "A non-ready decision cannot expose an executable plan",
        path: "executablePlan",
      });
    }
    return issues;
  }

  const plan = decision.executablePlan;
  requiredText(plan.entryTrigger, "executablePlan.entryTrigger", issues);
  requiredText(
    plan.structuralInvalidation,
    "executablePlan.structuralInvalidation",
    issues,
  );
  requiredText(plan.structuralStop, "executablePlan.structuralStop", issues);
  requiredText(plan.expiresAt, "executablePlan.expiresAt", issues);
  requiredText(plan.noChaseCondition, "executablePlan.noChaseCondition", issues);

  if (plan.targets.length === 0) {
    issues.push({
      code: "ready_target_missing",
      message: "A ready plan requires at least one target with provenance",
      path: "executablePlan.targets",
    });
  }

  if (
    !Number.isFinite(plan.structuralRewardRisk) ||
    plan.structuralRewardRisk <
      CONSTITUTIONAL_INVARIANTS.minimumStructuralRewardRisk
  ) {
    issues.push({
      code: "structural_rr_below_minimum",
      message: "Structural reward-risk must be finite and at least 3",
      path: "executablePlan.structuralRewardRisk",
    });
  }

  if (
    !Number.isFinite(plan.estimatedNetRewardRisk) ||
    plan.estimatedNetRewardRisk < CONSTITUTIONAL_INVARIANTS.minimumNetRewardRisk
  ) {
    issues.push({
      code: "net_rr_below_minimum",
      message: "Estimated net reward-risk must be finite and at least 3",
      path: "executablePlan.estimatedNetRewardRisk",
    });
  }

  if (!Number.isFinite(Number(plan.plannedEntryZone.lower))) {
    issues.push({
      code: "entry_zone_lower_invalid",
      message: "Entry-zone lower bound must be a finite decimal string",
      path: "executablePlan.plannedEntryZone.lower",
    });
  }

  if (!Number.isFinite(Number(plan.plannedEntryZone.upper))) {
    issues.push({
      code: "entry_zone_upper_invalid",
      message: "Entry-zone upper bound must be a finite decimal string",
      path: "executablePlan.plannedEntryZone.upper",
    });
  }

  return issues;
}

export function assertValidStrategyDecision(decision: StrategyDecision): void {
  const issues = validateStrategyDecision(decision);

  if (issues.length > 0) {
    throw new Error(
      `Invalid StrategyDecision: ${issues.map((issue) => issue.code).join(", ")}`,
    );
  }
}
