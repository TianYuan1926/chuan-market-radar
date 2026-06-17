import type { RankProfile } from "@/lib/journal/rank-engine";

type PixelCopilotProps = {
  mood: "calm" | "alert" | "serious";
  onOpenDossier?: () => void;
  rankProfile?: RankProfile;
  selectedSymbol?: string;
};

export function PixelCopilot({ mood, onOpenDossier, rankProfile, selectedSymbol }: PixelCopilotProps) {
  const moodLabel = mood === "serious" ? "刹车" : mood === "alert" ? "警戒" : "巡航";
  const selectedLabel = selectedSymbol?.replace("USDT", "") ?? "当前";
  const tierFloor = rankProfile?.tier.minXp ?? 0;
  const equipmentLabel = tierFloor >= 360
    ? "黑卡终端"
    : rankProfile?.tier.id === "operator"
      ? "冠军外套"
      : rankProfile?.tier.id === "sniper"
        ? "屏幕眼镜"
        : rankProfile?.tier.id === "discipline"
          ? "战术背心"
          : rankProfile?.tier.id === "observer"
            ? "监听耳机"
            : "黑色外套";
  const discipline = rankProfile?.disciplineScore ?? (mood === "serious" ? 42 : mood === "alert" ? 68 : 76);
  const momentum = rankProfile?.recentMomentum ?? (mood === "alert" ? 8 : mood === "serious" ? -6 : 2);
  const heat = mood === "serious" ? 91 : mood === "alert" ? 74 : 36;
  const line = rankProfile?.petMood === mood
    ? rankProfile.petLine
    : mood === "serious"
      ? "数据不干净时，我先踩刹车。能解释失效点，再谈下一步。"
      : mood === "alert"
        ? "别眨眼，但手也别乱点。真正的机会会把风险位置一起带过来。"
        : "巡航中，等真正有赔率的机会。没有低风险区，就不强行开工。";

  return (
    <section className={`module pet-module pet-module--${mood}`}>
      <div className="module-head module-head--flush">
        <h2>像素副驾驶</h2>
        <div className="pet-head-actions">
          {onOpenDossier ? (
            <button className="pet-dossier-button" onClick={onOpenDossier} type="button">
              {selectedLabel} 档案
            </button>
          ) : null}
          <span className="tag">BTC 项链</span>
        </div>
      </div>

      <div className="pet-plate">
        <div className="copilot-top">
          <div className="pet-say">
            {line}
          </div>
          <div className="pet-state">
            <span>{moodLabel}</span>
            <span>{rankProfile ? `${rankProfile.totalXp} XP` : "+1 XP"}</span>
            <span>{rankProfile?.tier.label ?? "段位"}</span>
          </div>
        </div>

        <div className="copilot-dashboard" aria-label="像素副驾驶仪表">
          <div className="copilot-vital">
            <span>纪律</span>
            <b>{discipline}%</b>
            <i style={{ width: `${discipline}%` }} />
          </div>
          <div className="copilot-vital">
            <span>动量</span>
            <b>{momentum > 0 ? `+${momentum}` : momentum}</b>
            <i style={{ width: `${Math.min(100, Math.abs(momentum) * 6 + 28)}%` }} />
          </div>
          <div className="copilot-vital">
            <span>热度</span>
            <b>{heat}%</b>
            <i style={{ width: `${heat}%` }} />
          </div>
        </div>

        <div className="copilot-stage" aria-label="像素男性副驾驶">
          <div className="copilot-shadow" />
          <div className={`copilot-avatar copilot-avatar--${mood}`} aria-label="男性像素副驾驶">
            <div className="copilot-gear" />
            <div className="copilot-head">
              <div className="copilot-hair" />
              <div className="copilot-expression">
                <span className="copilot-eye copilot-eye--left" />
                <span className="copilot-eye copilot-eye--right" />
              </div>
            </div>
            <div className="copilot-body">
              <div className="copilot-jacket" />
              <div className="copilot-chain">
                <span className="copilot-medallion">BTC</span>
              </div>
            </div>
          </div>
          <div className="copilot-radar-desk" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="copilot-level-strip" aria-label="副驾驶装备">
            <span>BTC 项链</span>
            <span>装备 {equipmentLabel}</span>
            <span>{moodLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
