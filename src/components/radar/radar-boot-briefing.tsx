"use client";

import { useState } from "react";

type RadarBootBriefingProps = {
  coverageLabel: string;
  healthLabel: string;
  providerLabel: string;
  statusLabel: string;
};

export function RadarBootBriefing({
  coverageLabel,
  healthLabel,
  providerLabel,
  statusLabel,
}: RadarBootBriefingProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  return (
    <section className="radar-boot-briefing alert" aria-label="启动介绍">
      <div className="radar-boot-briefing__mark">川</div>
      <div className="radar-boot-briefing__copy">
        <span className="mono">Boot Briefing</span>
        <strong>合约机会雷达已接入 {providerLabel}</strong>
        <p>
          当前状态 {statusLabel}，覆盖 {coverageLabel}，系统健康 {healthLabel}。这里只给条件化策略和失效路径，不做喊单。
        </p>
      </div>
      <button className="btn btn-sm radar-boot-briefing__skip" onClick={() => setIsDismissed(true)} type="button">
        跳过
      </button>
    </section>
  );
}
