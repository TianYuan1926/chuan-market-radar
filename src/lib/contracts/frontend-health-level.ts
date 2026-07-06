import type { Resource } from "../data-status";

export type FrontendHealthLevel = "ready" | "degraded" | "blocked";

export function dataStatusToHealthLevel(status: Resource<unknown>["status"]): FrontendHealthLevel {
  if (status === "failed" || status === "error") {
    return "blocked";
  }

  if (status === "live") {
    return "ready";
  }

  return "degraded";
}
