import type { JournalEvent } from "@/lib/analysis/types";

export type RankTier = {
  id: string;
  label: string;
  minXp: number;
};

export type RankPetMood = "calm" | "alert" | "serious";

export type RankProfile = {
  totalXp: number;
  rawScore: number;
  tier: RankTier;
  nextTier?: RankTier;
  xpToNextTier: number;
  progressPercent: number;
  wins: number;
  losses: number;
  saved: number;
  tracking: number;
  hitRate: number;
  disciplineScore: number;
  recentMomentum: number;
  lastDelta: number;
  petMood: RankPetMood;
  petLine: string;
};

export const rankTiers: RankTier[] = [
  { id: "cold-start", label: "冷启动", minXp: 0 },
  { id: "observer", label: "观察席", minXp: 20 },
  { id: "discipline", label: "纪律席", minXp: 60 },
  { id: "sniper", label: "狙击席", minXp: 120 },
  { id: "operator", label: "主理席", minXp: 220 },
  { id: "s680-black", label: "S680 黑卡", minXp: 360 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function countByResult(entries: JournalEvent[], result: JournalEvent["result"]) {
  return entries.filter((entry) => entry.result === result).length;
}

export function rankJournalEvent(entry: JournalEvent) {
  if (entry.action === "calibration_review") {
    return 0;
  }

  const base = {
    win: 14,
    saved: 8,
    watching: 3,
    loss: -12,
  }[entry.result];
  const deltaScore = entry.rankDelta * 4;
  const disciplineBonus = entry.action === "skip" || entry.result === "saved" ? 3 : 0;
  const paperBonus = entry.action === "paper_trade" ? 2 : 0;
  const riskRewardBonus = (entry.result === "win" || entry.result === "watching") &&
    (entry.riskReward ?? 0) >= 3
    ? 2
    : 0;
  const reviewCredit = entry.result === "loss" && (entry.lessons?.length ?? 0) > 0 ? 3 : 0;

  return base + deltaScore + disciplineBonus + paperBonus + riskRewardBonus + reviewCredit;
}

function tierForXp(totalXp: number) {
  return [...rankTiers].reverse().find((tier) => totalXp >= tier.minXp) ?? rankTiers[0];
}

function nextTierFor(currentTier: RankTier) {
  return rankTiers.find((tier) => tier.minXp > currentTier.minXp);
}

function progressWithinTier(totalXp: number, tier: RankTier, nextTier?: RankTier) {
  if (!nextTier) {
    return 100;
  }

  const tierRange = nextTier.minXp - tier.minXp;

  if (tierRange <= 0) {
    return 100;
  }

  return Math.round(clamp(((totalXp - tier.minXp) / tierRange) * 100, 0, 100));
}

function buildPetLine({
  losses,
  nextTier,
  petMood,
  tier,
  xpToNextTier,
}: {
  losses: number;
  nextTier?: RankTier;
  petMood: RankPetMood;
  tier: RankTier;
  xpToNextTier: number;
}) {
  if (petMood === "serious") {
    return "先踩刹车。连续失误不是问题，问题是不把失效原因写清楚。";
  }

  if (petMood === "alert" && nextTier) {
    return `接近 ${nextTier.label}，还差 ${xpToNextTier} XP。别为了升级去追单。`;
  }

  if (losses === 0) {
    return `${tier.label} 状态稳定。继续奖励正确等待，而不是奖励冲动交易。`;
  }

  return `${tier.label} 巡航中。亏损样本要留下，不然系统没法变聪明。`;
}

export function buildRankProfile(entries: JournalEvent[]): RankProfile {
  const scores = entries.map((entry) => rankJournalEvent(entry));
  const rawScore = scores.reduce((sum, value) => sum + value, 0);
  const totalXp = Math.max(0, rawScore);
  const tier = tierForXp(totalXp);
  const nextTier = nextTierFor(tier);
  const wins = countByResult(entries, "win");
  const losses = countByResult(entries, "loss");
  const saved = countByResult(entries, "saved");
  const tracking = entries.filter((entry) => entry.reviewStatus === "tracking" || entry.result === "watching").length;
  const closedOutcomes = wins + losses;
  const hitRate = closedOutcomes > 0 ? Math.round((wins / closedOutcomes) * 100) : 0;
  const disciplineScore = entries.length > 0
    ? Math.round(((saved + tracking) / entries.length) * 100)
    : 0;
  const recentMomentum = scores.slice(0, 5).reduce((sum, value) => sum + value, 0);
  const lastDelta = scores[0] ?? 0;
  const xpToNextTier = nextTier ? Math.max(0, nextTier.minXp - totalXp) : 0;
  const progressPercent = progressWithinTier(totalXp, tier, nextTier);
  const petMood: RankPetMood = rawScore < 0 || losses > wins + saved
    ? "serious"
    : progressPercent >= 80 || tracking >= 3
      ? "alert"
      : "calm";

  return {
    totalXp,
    rawScore,
    tier,
    nextTier,
    xpToNextTier,
    progressPercent,
    wins,
    losses,
    saved,
    tracking,
    hitRate,
    disciplineScore,
    recentMomentum,
    lastDelta,
    petMood,
    petLine: buildPetLine({ losses, nextTier, petMood, tier, xpToNextTier }),
  };
}
