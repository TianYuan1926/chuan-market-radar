import { Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import type { RankProfile } from "@/lib/journal/rank-engine";

type RankPanelProps = {
  profile: RankProfile;
};

function signed(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function tone(value: number) {
  if (value > 0) {
    return "tone-good";
  }

  if (value < 0) {
    return "tone-bad";
  }

  return "tone-amber";
}

export function RankPanel({ profile }: RankPanelProps) {
  const nextLabel = profile.nextTier?.label ?? "满级巡航";

  return (
    <section className="module rank-module">
      <div className="module-head">
        <h2>段位系统</h2>
        <span className="tag">{profile.tier.id.toUpperCase()}</span>
      </div>

      <div className="rank-plate">
        <div className="rank-orb" aria-hidden="true">
          <span>川</span>
        </div>
        <div className="rank-title">
          <span className="mono">CURRENT RANK</span>
          <strong>{profile.tier.label}</strong>
          <small>{profile.totalXp} XP / 下一级 {nextLabel}</small>
        </div>
      </div>

      <div className="rank-progress" aria-label="段位升级进度">
        <div>
          <span>{profile.progressPercent}%</span>
          <span>{profile.xpToNextTier > 0 ? `还差 ${profile.xpToNextTier} XP` : "已到顶级"}</span>
        </div>
        <i style={{ width: `${profile.progressPercent}%` }} />
      </div>

      <div className="rank-metrics">
        <span>
          <TrendingUp size={14} strokeWidth={2.2} />
          <b>{profile.hitRate}%</b>
          hit
        </span>
        <span>
          <ShieldCheck size={14} strokeWidth={2.2} />
          <b>{profile.disciplineScore}%</b>
          discipline
        </span>
        <span>
          <Gauge size={14} strokeWidth={2.2} />
          <b className={tone(profile.recentMomentum)}>{signed(profile.recentMomentum)}</b>
          momentum
        </span>
      </div>

      <div className="rank-ledger">
        <span><b>{profile.wins}</b> win</span>
        <span><b>{profile.losses}</b> loss</span>
        <span><b>{profile.saved}</b> saved</span>
        <span><b>{profile.tracking}</b> tracking</span>
      </div>

      <p className="rank-line">{profile.petLine}</p>
    </section>
  );
}
