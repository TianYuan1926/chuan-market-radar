import type { RankProfile } from "@/lib/journal/rank-engine";

type PixelS680Props = {
  mood: "calm" | "alert" | "serious";
  rankProfile?: RankProfile;
};

export function PixelS680({ mood, rankProfile }: PixelS680Props) {
  const moodLabel = mood === "serious" ? "BRAKE" : mood === "alert" ? "ALERT" : "CALM";
  const discipline = rankProfile?.disciplineScore ?? (mood === "serious" ? 42 : mood === "alert" ? 68 : 76);
  const momentum = rankProfile?.recentMomentum ?? (mood === "alert" ? 8 : mood === "serious" ? -6 : 2);
  const heat = mood === "serious" ? 91 : mood === "alert" ? 74 : 36;
  const line = rankProfile?.petMood === mood
    ? rankProfile.petLine
    : mood === "serious"
      ? "数据不干净时，我会先踩刹车。能解释失效点，再谈入场。"
      : mood === "alert"
        ? "有波动，但先别上头。真正的机会会把止损位置一起带过来。"
        : "巡航中，等真正有赔率的机会。没有低风险区，就不强行开工。";

  return (
    <section className={`module pet-module pet-module--${mood}`}>
      <div className="module-head module-head--flush">
        <h2>S680 副驾驶</h2>
        <span className="tag">PERSONALITY</span>
      </div>

      <div className="pet-plate">
        <div className="copilot-top">
          <div className="pet-say">
            {line}
          </div>
          <div className="pet-state">
            <span>{moodLabel}</span>
            <span>{rankProfile ? `${rankProfile.totalXp} XP` : "+1 XP"}</span>
            <span>{rankProfile?.tier.label ?? "RANK"}</span>
          </div>
        </div>

        <div className="s680-dashboard" aria-label="S680 copilot telemetry">
          <div className="s680-vital">
            <span>DISC</span>
            <b>{discipline}%</b>
            <i style={{ width: `${discipline}%` }} />
          </div>
          <div className="s680-vital">
            <span>MOM</span>
            <b>{momentum > 0 ? `+${momentum}` : momentum}</b>
            <i style={{ width: `${Math.min(100, Math.abs(momentum) * 6 + 28)}%` }} />
          </div>
          <div className="s680-vital">
            <span>HEAT</span>
            <b>{heat}%</b>
            <i style={{ width: `${heat}%` }} />
          </div>
        </div>

        <div className="s680-stage" aria-label="S680 copilot visual">
          <div className="s680-car">
            <div className="s680-roof" />
            <div className="s680-body" />
            <div className="s680-grille" />
            <div className="s680-light s680-light--left" />
            <div className="s680-light s680-light--right" />
            <div className="s680-wheel s680-wheel--left" />
            <div className="s680-wheel s680-wheel--right" />
            <div className="s680-badge">S680 MODE</div>
          </div>
        </div>
      </div>
    </section>
  );
}
