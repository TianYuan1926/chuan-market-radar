import type {
  StrategyEngineResult,
} from "../strategy/decision-engine";
import {
  marketStageZh,
  riskGateZh,
  strategyDecisionZh,
} from "./chinese-templates";
import type {
  ChineseStrategyReport,
} from "./report-schema";

function evidenceText(ids: string[], emptyText: string) {
  return ids.length > 0 ? ids.join(", ") : emptyText;
}

function riskText(result: StrategyEngineResult) {
  if (result.decision === "CONFLICT") {
    return `保留冲突状态：${evidenceText(result.counterEvidenceIds, "无反证 id")}。`;
  }

  if (result.decision === "INVALIDATED") {
    return "保留失效状态：结构失效后不再展示为可执行机会。";
  }

  if (result.riskGate.blockedBy.length > 0) {
    return `风险门控未通过：${result.riskGate.blockedBy.map((blocker) => riskGateZh[blocker]).join("、")}。`;
  }

  return "风险门控未发现硬阻断。";
}

function planText(result: StrategyEngineResult) {
  if (result.decision === "WATCH_ONLY") {
    return `只观察，等待条件：${result.entryPlan.waitFor}。`;
  }

  if (result.entryPlan.mode === "conditional") {
    return `条件计划：${result.entryPlan.waitFor}；触发：${result.entryPlan.trigger ?? "等待结构确认"}；失效：${result.entryPlan.invalidation ?? "等待结构失效信号"}。`;
  }

  if (result.exitPlan.actions.length > 0) {
    return `管理动作：${result.exitPlan.actions.join("、")}。`;
  }

  return result.decision === "NO_SETUP" ? "无有效机会，等待下一轮扫描。" : "等待更多证据。";
}

export function generateChineseStrategyReport(result: StrategyEngineResult): ChineseStrategyReport {
  const stageLabel = marketStageZh[result.stage];
  const decisionLabel = strategyDecisionZh[result.decision];

  return {
    stage: result.stage,
    decision: result.decision,
    title: `${stageLabel} / ${decisionLabel}`,
    summary: `阶段：${stageLabel}；决策：${decisionLabel}。`,
    sections: {
      state: `市场阶段保持为 ${result.stage}，报告层不重新判断行情。`,
      evidence: `支持证据 id：${evidenceText(result.supportEvidenceIds, "无")}；反证 id：${evidenceText(result.counterEvidenceIds, "无")}。`,
      risk: riskText(result),
      plan: planText(result),
    },
    evidenceTrace: {
      supportEvidenceIds: [...result.supportEvidenceIds],
      counterEvidenceIds: [...result.counterEvidenceIds],
    },
    riskGate: {
      allowed: result.riskGate.allowed,
      blockedBy: [...result.riskGate.blockedBy],
    },
  };
}
