import type {
  StrategyEngineResult,
} from "../strategy/decision-engine";

export type ChineseStrategyReportSections = {
  state: string;
  evidence: string;
  risk: string;
  plan: string;
};

export type ChineseStrategyReport = {
  stage: StrategyEngineResult["stage"];
  decision: StrategyEngineResult["decision"];
  title: string;
  summary: string;
  sections: ChineseStrategyReportSections;
  evidenceTrace: {
    supportEvidenceIds: string[];
    counterEvidenceIds: string[];
  };
  riskGate: StrategyEngineResult["riskGate"];
};
