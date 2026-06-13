import type { RiskGrade, SignalState } from "./types";

export function getConfidenceLabel(confidence: number) {
  if (confidence >= 82) return "高可信";
  if (confidence >= 68) return "待确认";
  if (confidence >= 52) return "观察";
  return "弱信号";
}

export function isActionableState(state: SignalState) {
  return state === "near_trigger" || state === "triggered";
}

export function getRiskTone(risk: RiskGrade) {
  if (risk === "low") return "calm";
  if (risk === "medium") return "watch";
  if (risk === "high") return "hot";
  return "blocked";
}
