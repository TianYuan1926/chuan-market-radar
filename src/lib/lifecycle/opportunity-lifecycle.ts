import type {
  OpportunityLifecycle,
  OpportunityLifecycleEvent,
  OpportunityLifecycleStatus,
} from "./types";

export const OPPORTUNITY_LIFECYCLE_STATUSES: readonly OpportunityLifecycleStatus[] = [
  "DISCOVERED",
  "CANDIDATE_OBSERVE",
  "DEEP_SCAN_PENDING",
  "EVIDENCE_OBSERVE",
  "WAIT_CONDITION",
  "BLOCKED",
  "TRADE_PLAN_READY",
  "INVALIDATED",
  "EXPIRED",
  "OUTCOME_REVIEWED",
] as const;

const terminalStatuses = new Set<OpportunityLifecycleStatus>([
  "BLOCKED",
  "INVALIDATED",
  "EXPIRED",
  "OUTCOME_REVIEWED",
]);

const allowedTransitions: Record<OpportunityLifecycleStatus, readonly OpportunityLifecycleStatus[]> = {
  DISCOVERED: ["CANDIDATE_OBSERVE", "DEEP_SCAN_PENDING", "EXPIRED", "INVALIDATED"],
  CANDIDATE_OBSERVE: ["DEEP_SCAN_PENDING", "EVIDENCE_OBSERVE", "EXPIRED", "INVALIDATED"],
  DEEP_SCAN_PENDING: ["EVIDENCE_OBSERVE", "BLOCKED", "EXPIRED", "INVALIDATED"],
  EVIDENCE_OBSERVE: ["WAIT_CONDITION", "BLOCKED", "TRADE_PLAN_READY", "EXPIRED", "INVALIDATED"],
  WAIT_CONDITION: ["TRADE_PLAN_READY", "BLOCKED", "EXPIRED", "INVALIDATED"],
  BLOCKED: ["OUTCOME_REVIEWED"],
  TRADE_PLAN_READY: ["OUTCOME_REVIEWED", "INVALIDATED", "EXPIRED"],
  INVALIDATED: ["OUTCOME_REVIEWED"],
  EXPIRED: ["OUTCOME_REVIEWED"],
  OUTCOME_REVIEWED: [],
};

function sortableTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function assertLifecycleResearchOnly(record: OpportunityLifecycle): void {
  if (record.allowedUse !== "research_only") {
    throw new Error("opportunity_lifecycle_boundary_violation:allowed_use");
  }
  if (record.canAutoExecute !== false) {
    throw new Error("opportunity_lifecycle_boundary_violation:auto_execute");
  }
  if (record.canAutoAdjustWeights !== false) {
    throw new Error("opportunity_lifecycle_boundary_violation:auto_adjust_weights");
  }
  if (record.canMutateLiveRanking !== false || record.canMutateProductionRanking !== false) {
    throw new Error("opportunity_lifecycle_boundary_violation:ranking_mutation");
  }
}

export function validateOpportunityLifecycle(events: OpportunityLifecycleEvent[]): void {
  if (events.length === 0) {
    throw new Error("opportunity_lifecycle_requires_events");
  }

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];

    if (!previous || !current) {
      continue;
    }

    if (sortableTime(current.observedAt) < sortableTime(previous.observedAt)) {
      throw new Error("opportunity_lifecycle_time_order_violation");
    }

    if (!allowedTransitions[previous.status].includes(current.status)) {
      throw new Error(`opportunity_lifecycle_transition_violation:${previous.status}->${current.status}`);
    }
  }

  for (const event of events) {
    if (event.status === "OUTCOME_REVIEWED" && event.sourceLayer !== "review") {
      throw new Error("opportunity_lifecycle_outcome_must_be_review_layer");
    }
  }
}

export function buildOpportunityLifecycle({
  id,
  symbol,
  events,
}: {
  id: string;
  symbol: string;
  events: OpportunityLifecycleEvent[];
}): OpportunityLifecycle {
  const timeline = [...events]
    .sort((left, right) => sortableTime(left.observedAt) - sortableTime(right.observedAt));

  validateOpportunityLifecycle(timeline);

  const currentStatus = timeline[timeline.length - 1]?.status ?? "DISCOVERED";
  const lifecycle: OpportunityLifecycle = {
    id,
    symbol: symbol.toUpperCase(),
    allowedUse: "research_only",
    canAutoExecute: false,
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    canMutateProductionRanking: false,
    currentStatus,
    isTerminal: terminalStatuses.has(currentStatus),
    timeline: timeline.map((event, index) => ({
      ...event,
      evidenceIds: event.evidenceIds ?? [],
      sequence: index + 1,
    })),
    guardrail: "机会生命周期只用于研究复盘、状态追踪和人工审计，不能回写 production ranking 或自动放宽策略门禁。",
  };

  assertLifecycleResearchOnly(lifecycle);
  return lifecycle;
}
