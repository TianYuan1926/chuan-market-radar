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
  const posture = mood === "serious" ? "brake" : mood === "alert" ? "scan" : "idle";
  const postureLabel = posture === "brake" ? "纪律制动" : posture === "scan" ? "异动侦测" : "低噪巡航";
  const actionLabel = posture === "brake" ? "先看失效" : posture === "scan" ? "盯突破" : "等赔率";
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
  const equipmentSlots = [
    { label: "BTC", state: "active", title: "BTC 项链始终在线" },
    { label: tierFloor >= 60 ? "耳机" : "锁定", state: tierFloor >= 60 ? "active" : "locked", title: "纪律席解锁监听耳机" },
    { label: tierFloor >= 160 ? "镜片" : "锁定", state: tierFloor >= 160 ? "active" : "locked", title: "狙击席解锁屏幕眼镜" },
    { label: tierFloor >= 360 ? "终端" : "锁定", state: tierFloor >= 360 ? "active" : "locked", title: "高阶段位解锁黑卡终端" },
  ];
  const discipline = rankProfile?.disciplineScore ?? (mood === "serious" ? 42 : mood === "alert" ? 68 : 76);
  const momentum = rankProfile?.recentMomentum ?? (mood === "alert" ? 8 : mood === "serious" ? -6 : 2);
  const heat = mood === "serious" ? 91 : mood === "alert" ? 74 : 36;
  const disciplineLabel = discipline >= 80 ? "纪律稳定" : discipline >= 55 ? "纪律观察" : "纪律修复";
  const line = rankProfile?.petMood === mood
    ? rankProfile.petLine
    : mood === "serious"
      ? "数据不干净时，我先踩刹车。能解释失效点，再谈下一步。"
      : mood === "alert"
        ? "别眨眼，但手也别乱点。真正的机会会把风险位置一起带过来。"
        : "巡航中，等真正有赔率的机会。没有低风险区，就不强行开工。";

  return (
    <section className={`module pet-module companion-dock pet-module--${mood} companion-dock--${posture}`} aria-label="助手 dock">
      <div className={`companion-dock__avatar companion-dock__avatar--${posture}`}>
        <div className="copilot-motion-field" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="copilot-signal-pips" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
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
          <span className="copilot-hand copilot-hand--left" />
          <span className="copilot-hand copilot-hand--right" />
        </div>
        <div className="copilot-mini-desk" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="companion-dock__body">
        <div className="module-head module-head--flush">
          <div>
            <h2>像素副驾驶</h2>
            <span>BTC 项链 · 装备 {equipmentLabel}</span>
          </div>
          <span className="tag">{moodLabel}</span>
        </div>

        <p className="companion-dock__line">{line}</p>

        <div className="copilot-status-strip" aria-label="副驾驶动作状态">
          <span>{postureLabel}</span>
          <b>{actionLabel}</b>
          <em>{disciplineLabel}</em>
        </div>

        <div className="copilot-equipment" aria-label="装备槽">
          {equipmentSlots.map((item) => (
            <span className={`copilot-equipment__slot copilot-equipment__slot--${item.state}`} key={item.title} title={item.title}>
              <i />
              <b>{item.label}</b>
            </span>
          ))}
        </div>

        <div className="pet-state">
          <span>{rankProfile ? `${rankProfile.totalXp} XP` : "+1 XP"}</span>
          <span>{rankProfile?.tier.label ?? "段位"}</span>
          <span>{selectedLabel}</span>
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

        {onOpenDossier ? (
          <button className="pet-dossier-button" onClick={onOpenDossier} type="button">
            {selectedLabel} 档案
          </button>
        ) : null}
      </div>
    </section>
  );
}
