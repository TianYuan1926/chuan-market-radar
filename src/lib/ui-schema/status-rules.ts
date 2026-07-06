import {
  uiStatusCanEnterSniper,
  uiStatusCanTrade,
  type UiCanonicalStatus,
} from "./status-dictionary";

export const NON_TRADABLE_STATUSES: UiCanonicalStatus[] = [
  "WAIT",
  "OBSERVE",
  "BLOCKED",
  "CANDIDATE",
  "EVIDENCE_SIGNAL",
  "EVIDENCE_OBSERVE",
  "STALE",
  "PARTIAL",
  "FAILED",
  "SERVED_CACHE",
  "RATE_LIMITED",
  "TIMEOUT",
  "DEGRADED",
  "EMPTY",
  "UNKNOWN",
  "NOT_CONFIGURED",
];

export function assertCanEnterSniper(status: UiCanonicalStatus): void {
  if (!uiStatusCanEnterSniper(status)) {
    throw new Error(`status_cannot_enter_sniper:${status}`);
  }
}

export function assertCanShowTradePlan(status: UiCanonicalStatus): void {
  if (!uiStatusCanTrade(status)) {
    throw new Error(`status_cannot_show_trade_plan:${status}`);
  }
}

export function isSafeObservationStatus(status: UiCanonicalStatus): boolean {
  return !uiStatusCanTrade(status) && !uiStatusCanEnterSniper(status);
}
