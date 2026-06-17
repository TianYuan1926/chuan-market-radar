"use client";

import {
  Ban,
  Crosshair,
  Eye,
  ListChecks,
  Microscope,
  TrendingDown,
  TrendingUp,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type {
  AltcoinOpportunityBoard as AltcoinOpportunityBoardModel,
  AltcoinOpportunityGroupKey,
  AltcoinOpportunityItem,
} from "@/lib/market/altcoin-opportunities";

type AltcoinOpportunityBoardProps = {
  ariaLabel?: string;
  board: AltcoinOpportunityBoardModel;
  selectedId?: string;
  onOpenDossier?: (id?: string) => void;
  onSelectSignal: (id: string) => void;
};

const groupOrder: AltcoinOpportunityGroupKey[] = [
  "near_trigger",
  "long_warming",
  "short_warming",
  "no_chase",
  "new_long_tail",
  "data_watch",
];

const groupIcons: Record<AltcoinOpportunityGroupKey, LucideIcon> = {
  data_watch: WifiOff,
  long_warming: TrendingUp,
  near_trigger: Crosshair,
  new_long_tail: Microscope,
  no_chase: Ban,
  short_warming: TrendingDown,
};

const cardToneClass: Record<AltcoinOpportunityGroupKey, string> = {
  data_watch: "altcoin-opportunity-card--data_watch",
  long_warming: "altcoin-opportunity-card--long_warming",
  near_trigger: "altcoin-opportunity-card--near_trigger",
  new_long_tail: "altcoin-opportunity-card--new_long_tail",
  no_chase: "altcoin-opportunity-card--no_chase",
  short_warming: "altcoin-opportunity-card--short_warming",
};

const groupDisplay: Record<AltcoinOpportunityGroupKey, { description: string; title: string }> = {
  data_watch: {
    description: "数据不足、扫描延迟或质量阻断，只能继续观察。",
    title: "数据观察",
  },
  long_warming: {
    description: "多头证据正在升温，但还没到追入位置。",
    title: "多头升温",
  },
  near_trigger: {
    description: "接近策略触发位，优先看确认和失效条件。",
    title: "接近触发",
  },
  new_long_tail: {
    description: "来自每日异动和长尾样本，只作为覆盖率与复盘线索。",
    title: "新币/长尾",
  },
  no_chase: {
    description: "赔率或位置变差，明确禁止追单。",
    title: "过热勿追",
  },
  short_warming: {
    description: "空头证据正在升温，等待结构确认。",
    title: "空头升温",
  },
};

function compactSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function requestPolicyLabel(value: AltcoinOpportunityBoardModel["summary"]["requestPolicy"]) {
  return value === "no_extra_requests" ? "不新增请求" : value;
}

function scanStatusLabel(value: AltcoinOpportunityBoardModel["summary"]["scanStatus"]) {
  return {
    failed: "扫描失败",
    partial: "部分扫描",
    ready: "扫描就绪",
    stale: "数据延迟",
  }[value];
}

function renderItemContent(item: AltcoinOpportunityItem) {
  const noFomoLabel = item.noFomoLabel ?? (item.groupKey === "no_chase" ? "禁止追单" : undefined);

  return (
    <>
      <div className="altcoin-opportunity-card__topline">
        <span className="altcoin-opportunity-card__symbol">{compactSymbol(item.symbol)}</span>
        <span className="altcoin-opportunity-card__score">{item.score}</span>
      </div>
      <div className="altcoin-opportunity-card__meta">
        <span>{item.stateLabel}</span>
        {item.timeframe ? <span>{item.timeframe}</span> : null}
        {item.exchange ? <span>{item.exchange}</span> : null}
      </div>
      {item.strategyV2StageLabel ? (
        <div className="altcoin-opportunity-card__v2">
          <span>v2 {item.strategyV2StageLabel}</span>
          {item.strategyV2DecisionLabel ? <b>{item.strategyV2DecisionLabel}</b> : null}
        </div>
      ) : null}
      <p>{item.summary}</p>
      <div className="altcoin-opportunity-card__strategy">
        <ListChecks aria-hidden="true" size={13} />
        <span>{item.strategyHint}</span>
      </div>
      <div className="altcoin-opportunity-card__badges" aria-label="证据标签 OI 资金 量能">
        {item.evidenceBadges.map((badge) => (
          <span
            className={`altcoin-opportunity-badge altcoin-opportunity-badge--${badge.tone}`}
            key={`${item.id}-${badge.label}-${badge.value}`}
          >
            <b>{badge.label}</b>
            <small>{badge.value}</small>
          </span>
        ))}
      </div>
      <div className="altcoin-opportunity-card__footer">
        <span>{item.actionLabel}</span>
        {noFomoLabel ? <strong>{noFomoLabel}</strong> : null}
      </div>
      {item.dailyMoverContext ? (
        <div className="altcoin-opportunity-card__context">
          <Microscope aria-hidden="true" size={13} />
          <span>复盘上下文：{item.dailyMoverContext.replace(/^每日异动复盘上下文：|^每日异动仅作为复盘上下文：/u, "")}</span>
        </div>
      ) : null}
      {item.staleLabel ? (
        <div className="altcoin-opportunity-card__context altcoin-opportunity-card__context--stale">
          <Eye aria-hidden="true" size={13} />
          <span>{item.staleLabel}</span>
        </div>
      ) : null}
    </>
  );
}

function SignalOpportunityCard({
  item,
  isSelected,
  onOpenDossier,
  onSelectSignal,
}: {
  item: AltcoinOpportunityItem;
  isSelected: boolean;
  onOpenDossier?: (id?: string) => void;
  onSelectSignal: (id: string) => void;
}) {
  return (
    <button
      className={[
        "altcoin-opportunity-card",
        cardToneClass[item.groupKey],
        isSelected ? "is-selected" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => {
        onSelectSignal(item.id);
        onOpenDossier?.(item.id);
      }}
      type="button"
    >
      {renderItemContent(item)}
    </button>
  );
}

function ResearchOpportunityCard({ item }: { item: AltcoinOpportunityItem }) {
  return (
    <article className={`altcoin-opportunity-card ${cardToneClass[item.groupKey]}`}>
      {renderItemContent(item)}
    </article>
  );
}

export function AltcoinOpportunityBoard({
  ariaLabel = "Altcoin Opportunity Board 山寨机会板",
  board,
  selectedId,
  onOpenDossier,
  onSelectSignal,
}: AltcoinOpportunityBoardProps) {
  return (
    <section className="module altcoin-opportunity-board" aria-label={ariaLabel}>
      <div className="module-head">
        <div>
          <h2>山寨机会板</h2>
          <span className="altcoin-opportunity-board__legend">OI / 资金 / 量能</span>
        </div>
        <span className="tag">{requestPolicyLabel(board.summary.requestPolicy)}</span>
      </div>

      <div className="altcoin-opportunity-board__summary" aria-label="机会板摘要">
        <span><b>{board.summary.actionableCount}</b> 可关注</span>
        <span><b>{board.summary.watchOnlyCount}</b> 只观察</span>
        <span><b>{board.summary.dailyMoverContextCount}</b> 复盘上下文</span>
        <span><b>{scanStatusLabel(board.summary.scanStatus)}</b> 数据状态</span>
      </div>

      <div className="altcoin-opportunity-board__groups">
        {groupOrder.map((key) => {
          const group = board.groups[key];
          const display = groupDisplay[key];
          const Icon = groupIcons[key];

          return (
            <section className={`altcoin-opportunity-group altcoin-opportunity-group--${key}`} key={key}>
              <div className="altcoin-opportunity-group__head">
                <span>
                  <Icon aria-hidden="true" size={15} />
                  <b>{display.title}</b>
                </span>
                <em>{group.items.length}</em>
              </div>
              <p>{display.description}</p>

              <div className="altcoin-opportunity-group__items">
                {group.items.length === 0 ? (
                  <div className="altcoin-opportunity-card altcoin-opportunity-card--empty">
                    <span>暂无样本</span>
                  </div>
                ) : (
                  group.items.slice(0, 3).map((item) =>
                    item.source === "signal" ? (
                      <SignalOpportunityCard
                        isSelected={selectedId === item.id}
                        item={item}
                        key={item.id}
                        onOpenDossier={onOpenDossier}
                        onSelectSignal={onSelectSignal}
                      />
                    ) : (
                      <ResearchOpportunityCard item={item} key={item.id} />
                    )
                  )
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
