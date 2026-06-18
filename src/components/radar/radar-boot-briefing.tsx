"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

type RadarBootBriefingProps = {
  cadenceLabel: string;
  coverageLabel: string;
  healthLabel: string;
  marketSessionLabel: string;
  nextScanLabel: string;
  onOpenReview: () => void;
  onOpenSignals: () => void;
  providerLabel: string;
  requestBudgetLabel?: string;
  signalCount: number;
  statusLabel: string;
};

const bootBriefingStorageKey = "chuan-market-radar.boot-briefing.dismissed.v1";
const bootBriefingStoreEvent = "chuan-market-radar.boot-briefing.updated";

function getBootBriefingSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(bootBriefingStorageKey) === "true";
}

function getBootBriefingServerSnapshot() {
  return false;
}

function subscribeBootBriefing(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("storage", callback);
  window.addEventListener(bootBriefingStoreEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(bootBriefingStoreEvent, callback);
  };
}

export function RadarBootBriefing({
  cadenceLabel,
  coverageLabel,
  healthLabel,
  marketSessionLabel,
  nextScanLabel,
  onOpenReview,
  onOpenSignals,
  providerLabel,
  requestBudgetLabel,
  signalCount,
  statusLabel,
}: RadarBootBriefingProps) {
  const isDismissed = useSyncExternalStore(
    subscribeBootBriefing,
    getBootBriefingSnapshot,
    getBootBriefingServerSnapshot,
  );

  function dismissBootBriefing() {
    window.localStorage.setItem(bootBriefingStorageKey, "true");
    window.dispatchEvent(new Event(bootBriefingStoreEvent));
  }

  function openSignals() {
    dismissBootBriefing();
    onOpenSignals();
  }

  function openReview() {
    dismissBootBriefing();
    onOpenReview();
  }

  if (isDismissed) {
    return null;
  }

  return (
    <section className="radar-boot-briefing" aria-label="川 Market Radar 启动介绍">
      <div className="radar-boot-briefing__lens" aria-hidden="true">
        <Image
          alt=""
          fill
          priority
          sizes="(max-width: 720px) 100vw, 620px"
          src="/assets/radar-crystal-lens.png"
        />
        <span className="radar-boot-briefing__scanline" />
      </div>

      <div className="radar-boot-briefing__content">
        <div className="radar-boot-briefing__brand">
          <span className="radar-boot-briefing__mark">川</span>
          <div>
            <span className="mono">Boot Briefing</span>
            <strong>全市场山寨趋势切换雷达</strong>
          </div>
        </div>

        <p>
          这里扫描合约市场的压缩、吸筹、突破确认、趋势加速和衰竭风险；输出的是条件化交易计划、证据链和失效路径，不做喊单，不自动下单。
        </p>

        <div className="radar-boot-briefing__status" aria-label="当前启动状态">
          <span>
            <b>{providerLabel}</b>
            数据源
          </span>
          <span>
            <b>{statusLabel}</b>
            扫描状态
          </span>
          <span>
            <b>{coverageLabel}</b>
            市场覆盖
          </span>
          <span>
            <b>{signalCount}</b>
            当前候选
          </span>
        </div>

        <div className="radar-boot-briefing__rules">
          <span>节拍 {cadenceLabel}</span>
          <span>下轮 {nextScanLabel}</span>
          <span>{marketSessionLabel}</span>
          <span>{requestBudgetLabel ?? "请求预算按免费/业余套餐护栏运行"}</span>
          <span>系统健康 {healthLabel}</span>
        </div>

        <div className="radar-boot-briefing__actions" aria-label="启动操作">
          <button className="action-button" onClick={dismissBootBriefing} type="button">
            进入雷达
          </button>
          <button className="action-button action-button--ghost" onClick={openSignals} type="button">
            查看信号池
          </button>
          <button className="action-button action-button--ghost" onClick={openReview} type="button">
            看复盘链路
          </button>
        </div>
      </div>

      <button className="radar-boot-briefing__skip" onClick={dismissBootBriefing} type="button">
        跳过
      </button>
    </section>
  );
}
