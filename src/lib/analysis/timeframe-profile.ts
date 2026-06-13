import type { SignalDirection, Timeframe } from "./types";

export type TimeframeRole = "execution" | "anomaly" | "structure" | "regime";

export type TimeframeAlignment = "support" | "conflict" | "neutral" | "missing";

export type TimeframeProfileFrame = {
  timeframe: Timeframe;
  alignment: TimeframeAlignment;
  weight: number;
  note: string;
  direction?: SignalDirection;
};

export type TimeframeProfile = {
  frames: TimeframeProfileFrame[];
  supportTimeframes: Timeframe[];
  conflictTimeframes: Timeframe[];
  missingRoles: TimeframeRole[];
  dominantRole: TimeframeRole | "none";
  supportScore: number;
  conflictScore: number;
  missingDataPenalty: number;
};

export const timeframeRoleMap: Record<Timeframe, TimeframeRole> = {
  "1m": "execution",
  "5m": "execution",
  "15m": "anomaly",
  "30m": "anomaly",
  "1h": "structure",
  "4h": "structure",
  "1d": "regime",
  "1w": "regime",
};

const roleImpact: Record<TimeframeRole, { support: number; conflict: number }> = {
  execution: { support: 0.04, conflict: 0.12 },
  anomaly: { support: 0.08, conflict: 0.14 },
  structure: { support: 0.12, conflict: 0.36 },
  regime: { support: 0.08, conflict: 0.16 },
};

const allRoles: TimeframeRole[] = ["execution", "anomaly", "structure", "regime"];

function clampFrameWeight(value: number) {
  return Math.min(100, Math.max(0, value));
}

function roleFor(timeframe: Timeframe) {
  return timeframeRoleMap[timeframe];
}

function strongestSupportRole(frames: TimeframeProfileFrame[]): TimeframeRole | "none" {
  let strongest: { role: TimeframeRole; weight: number } | null = null;

  for (const frame of frames) {
    if (frame.alignment !== "support") {
      continue;
    }

    const weight = clampFrameWeight(frame.weight);
    const role = roleFor(frame.timeframe);

    if (!strongest || weight > strongest.weight) {
      strongest = { role, weight };
    }
  }

  return strongest?.role ?? "none";
}

export function buildTimeframeProfile(frames: TimeframeProfileFrame[]): TimeframeProfile {
  const normalizedFrames = frames.map((frame) => ({
    ...frame,
    weight: clampFrameWeight(frame.weight),
  }));
  const supportTimeframes = normalizedFrames
    .filter((frame) => frame.alignment === "support")
    .map((frame) => frame.timeframe);
  const conflictTimeframes = normalizedFrames
    .filter((frame) => frame.alignment === "conflict")
    .map((frame) => frame.timeframe);
  const presentRoles = new Set(normalizedFrames.map((frame) => roleFor(frame.timeframe)));
  const missingRoles = allRoles.filter((role) => !presentRoles.has(role));
  let supportScore = 0;
  let conflictScore = 0;

  for (const frame of normalizedFrames) {
    const role = roleFor(frame.timeframe);
    const impact = roleImpact[role];

    if (frame.alignment === "support") {
      supportScore += frame.weight * impact.support;
    }

    if (frame.alignment === "conflict") {
      conflictScore += frame.weight * impact.conflict;
    }
  }

  return {
    frames: normalizedFrames,
    supportTimeframes,
    conflictTimeframes,
    missingRoles,
    dominantRole: strongestSupportRole(normalizedFrames),
    supportScore,
    conflictScore,
    missingDataPenalty: missingRoles.length * 3,
  };
}

export function summarizeTimeframeAgreement(profile: TimeframeProfile) {
  const missing = profile.missingRoles.length
    ? profile.missingRoles.join("/")
    : "none";

  return `多周期支持 ${profile.supportTimeframes.length} 个，冲突 ${profile.conflictTimeframes.length} 个，缺失 ${missing}；主导证据来自 ${profile.dominantRole}。`;
}
