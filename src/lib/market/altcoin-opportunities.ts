import type { JournalEvent, MarketSignal } from "../analysis/types";
import {
  marketStageZh,
  strategyDecisionZh,
} from "../analysis/v2/report/chinese-templates";
import type { MarketDataStatus } from "./types";

export type AltcoinOpportunityGroupKey =
  | "data_watch"
  | "long_warming"
  | "near_trigger"
  | "new_long_tail"
  | "no_chase"
  | "short_warming";

export type AltcoinOpportunityBadge = {
  label: string;
  tone: "bad" | "good" | "neutral" | "warn";
  value: string;
};

export type AltcoinOpportunityItem = {
  actionLabel: string;
  allowedUse: "research_only" | "scan_signal";
  dailyMoverContext?: string;
  direction: MarketSignal["direction"] | "gainer" | "loser";
  evidenceBadges: AltcoinOpportunityBadge[];
  exchange?: string;
  groupKey: AltcoinOpportunityGroupKey;
  id: string;
  journalCount: number;
  noFomoLabel?: string;
  score: number;
  source: "daily_mover" | "signal";
  staleLabel?: string;
  stateLabel: string;
  strategyV2DecisionLabel?: string;
  strategyV2StageLabel?: string;
  strategyHint: string;
  summary: string;
  symbol: string;
  timeframe?: MarketSignal["timeframe"];
};

export type AltcoinOpportunityGroup = {
  description: string;
  items: AltcoinOpportunityItem[];
  key: AltcoinOpportunityGroupKey;
  title: string;
};

export type DailyMoverOpportunityDetail = {
  allowedUse: "research_only";
  correlationStatus: string;
  direction: "gainer" | "loser";
  evidenceStrength: "medium" | "strong" | "weak";
  linkedSignalCount: number;
  primaryDrivers: string[];
  symbol: string;
  whyMissed: string;
};

export type AltcoinOpportunityBoard = {
  groups: Record<AltcoinOpportunityGroupKey, AltcoinOpportunityGroup>;
  summary: {
    actionableCount: number;
    dailyMoverContextCount: number;
    requestPolicy: "no_extra_requests";
    scanStatus: MarketDataStatus;
    watchOnlyCount: number;
  };
};

export type BuildAltcoinOpportunityBoardInput = {
  dailyMoverDetails: DailyMoverOpportunityDetail[];
  journalEvents: JournalEvent[];
  scanStatus: MarketDataStatus;
  signals: MarketSignal[];
};

const groupDefinitions: Record<AltcoinOpportunityGroupKey, Omit<AltcoinOpportunityGroup, "items">> = {
  data_watch: {
    description: "数据不足、扫描延迟或质量阻断，只能继续观察。",
    key: "data_watch",
    title: "数据观察",
  },
  long_warming: {
    description: "多头证据正在升温，但还没到追入位置。",
    key: "long_warming",
    title: "多头升温",
  },
  near_trigger: {
    description: "接近策略触发位，优先看确认和失效条件。",
    key: "near_trigger",
    title: "接近触发",
  },
  new_long_tail: {
    description: "来自每日异动和长尾样本，只作为覆盖率与复盘线索。",
    key: "new_long_tail",
    title: "新币/长尾",
  },
  no_chase: {
    description: "赔率或位置变差，明确禁止追单。",
    key: "no_chase",
    title: "过热勿追",
  },
  short_warming: {
    description: "空头证据正在升温，等待结构确认。",
    key: "short_warming",
    title: "空头升温",
  },
};

const stateLabels: Record<MarketSignal["state"], string> = {
  abnormal_watch: "异常观察",
  insufficient_data: "数据不足",
  invalidated: "已失效",
  near_trigger: "接近触发",
  no_trade: "不参与",
  normal_watch: "普通观察",
  reviewed: "已复盘",
  triggered: "已触发",
  waiting_confirmation: "等待确认",
};

const driverLabels: Record<string, string> = {
  funding_pressure: "资金",
  liquidation_pressure: "清算",
  low_liquidity_or_one_off: "低流动",
  open_interest_expansion: "OI",
  pre_move_drift: "提前漂移",
  volume_expansion: "量能",
};

function normalizeSymbol(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function compactSymbol(symbol: string) {
  return normalizeSymbol(symbol);
}

function badgeTone(polarity?: string): AltcoinOpportunityBadge["tone"] {
  if (polarity === "supportive") {
    return "good";
  }

  if (polarity === "conflicting" || polarity === "blocking") {
    return "bad";
  }

  return "neutral";
}

function findEvidenceBadge(
  signal: MarketSignal,
  label: string,
  matcher: RegExp,
): AltcoinOpportunityBadge | null {
  const point = signal.evidence.find((item) => matcher.test(`${item.label} ${item.value}`));

  if (!point) {
    return null;
  }

  return {
    label,
    tone: badgeTone(point.polarity),
    value: point.value,
  };
}

function signalEvidenceBadges(signal: MarketSignal): AltcoinOpportunityBadge[] {
  const badges = [
    findEvidenceBadge(signal, "OI", /OI|持仓|open interest/iu),
    findEvidenceBadge(signal, "资金", /资金|funding/iu),
    findEvidenceBadge(signal, "量能", /量|volume|成交/iu),
    findEvidenceBadge(signal, "波动", /波动|volatility|ATR/iu),
    findEvidenceBadge(signal, "价格", /价格|price|涨跌|change/iu),
    findEvidenceBadge(signal, "BTC/ETH", /BTC|ETH|大盘|环境/iu),
  ].filter((item): item is AltcoinOpportunityBadge => item !== null);

  if (badges.length > 0) {
    return badges.slice(0, 6);
  }

  return [
    {
      label: "证据",
      tone: "neutral",
      value: signal.evidence[0]?.value ?? signal.summary,
    },
  ];
}

function dailyMoverBadges(detail: DailyMoverOpportunityDetail): AltcoinOpportunityBadge[] {
  return detail.primaryDrivers.slice(0, 4).map((driver) => ({
    label: driverLabels[driver] ?? driver.replaceAll("_", " "),
    tone: detail.evidenceStrength === "strong" ? "warn" : "neutral",
    value: detail.evidenceStrength === "strong" ? "强证据" : detail.evidenceStrength === "medium" ? "中证据" : "弱证据",
  }));
}

function journalCountFor(symbol: string, journalEvents: JournalEvent[]) {
  const normalized = normalizeSymbol(symbol);

  return journalEvents.filter((event) => normalizeSymbol(event.symbol) === normalized).length;
}

function groupForSignal(signal: MarketSignal, scanStatus: MarketDataStatus): AltcoinOpportunityGroupKey {
  if (scanStatus === "failed" || scanStatus === "stale" || signal.state === "insufficient_data" || signal.risk === "blocked") {
    return "data_watch";
  }

  if (signal.strategy.noChase || signal.risk === "high") {
    return "no_chase";
  }

  if (signal.state === "near_trigger" || signal.state === "triggered") {
    return "near_trigger";
  }

  if (signal.direction === "short") {
    return "short_warming";
  }

  if (signal.direction === "long") {
    return "long_warming";
  }

  return "data_watch";
}

function signalActionLabel(groupKey: AltcoinOpportunityGroupKey, signal: MarketSignal) {
  if (groupKey === "no_chase") {
    return "等回踩，不追";
  }

  if (groupKey === "data_watch") {
    return "只观察";
  }

  if (groupKey === "near_trigger") {
    return signal.strategy.status === "actionable" ? "等确认执行" : "盯触发";
  }

  return "加入观察";
}

function buildSignalItem({
  dailyMoverContext,
  groupKey,
  journalCount,
  scanStatus,
  signal,
}: {
  dailyMoverContext?: string;
  groupKey: AltcoinOpportunityGroupKey;
  journalCount: number;
  scanStatus: MarketDataStatus;
  signal: MarketSignal;
}): AltcoinOpportunityItem {
  return {
    actionLabel: signalActionLabel(groupKey, signal),
    allowedUse: "scan_signal",
    dailyMoverContext,
    direction: signal.direction,
    evidenceBadges: signalEvidenceBadges(signal),
    exchange: signal.exchange,
    groupKey,
    id: signal.id,
    journalCount,
    noFomoLabel: groupKey === "no_chase" ? "禁止追单" : undefined,
    score: signal.confidence,
    source: "signal",
    staleLabel: scanStatus === "stale" || scanStatus === "failed" ? "数据延迟，只观察不执行" : undefined,
    stateLabel: stateLabels[signal.state],
    strategyV2DecisionLabel: signal.strategyV2 ? strategyDecisionZh[signal.strategyV2.decision] : undefined,
    strategyV2StageLabel: signal.strategyV2 ? marketStageZh[signal.strategyV2.stage] : undefined,
    strategyHint: `${signal.strategy.entry} / 失效 ${signal.strategy.invalidation}`,
    summary: signal.summary,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
  };
}

function buildDailyMoverItem(detail: DailyMoverOpportunityDetail): AltcoinOpportunityItem {
  return {
    actionLabel: "加入覆盖复盘",
    allowedUse: "research_only",
    dailyMoverContext: `每日异动仅作为复盘上下文：${detail.whyMissed}`,
    direction: detail.direction,
    evidenceBadges: dailyMoverBadges(detail),
    groupKey: "new_long_tail",
    id: `daily-mover-${normalizeSymbol(detail.symbol)}-${detail.correlationStatus}`,
    journalCount: 0,
    noFomoLabel: "不追涨杀跌",
    score: detail.evidenceStrength === "strong" ? 62 : detail.evidenceStrength === "medium" ? 54 : 42,
    source: "daily_mover",
    stateLabel: "覆盖线索",
    strategyHint: "先补扫描覆盖和复盘样本，不直接生成交易信号",
    summary: detail.whyMissed,
    symbol: detail.symbol,
  };
}

function emptyGroups(): Record<AltcoinOpportunityGroupKey, AltcoinOpportunityGroup> {
  return {
    data_watch: { ...groupDefinitions.data_watch, items: [] },
    long_warming: { ...groupDefinitions.long_warming, items: [] },
    near_trigger: { ...groupDefinitions.near_trigger, items: [] },
    new_long_tail: { ...groupDefinitions.new_long_tail, items: [] },
    no_chase: { ...groupDefinitions.no_chase, items: [] },
    short_warming: { ...groupDefinitions.short_warming, items: [] },
  };
}

export function buildAltcoinOpportunityBoard({
  dailyMoverDetails,
  journalEvents,
  scanStatus,
  signals,
}: BuildAltcoinOpportunityBoardInput): AltcoinOpportunityBoard {
  const groups = emptyGroups();
  const dailyMoverBySymbol = new Map(
    dailyMoverDetails.map((detail) => [normalizeSymbol(detail.symbol), detail]),
  );

  for (const signal of signals) {
    const groupKey = groupForSignal(signal, scanStatus);
    const mover = dailyMoverBySymbol.get(normalizeSymbol(signal.symbol));
    const dailyMoverContext = mover
      ? `每日异动复盘上下文：${mover.whyMissed}`
      : undefined;

    groups[groupKey].items.push(buildSignalItem({
      dailyMoverContext,
      groupKey,
      journalCount: journalCountFor(signal.symbol, journalEvents),
      scanStatus,
      signal,
    }));
  }

  for (const detail of dailyMoverDetails) {
    if (detail.linkedSignalCount > 0) {
      continue;
    }

    groups.new_long_tail.items.push(buildDailyMoverItem(detail));
  }

  for (const group of Object.values(groups)) {
    group.items.sort((first, second) => second.score - first.score || compactSymbol(first.symbol).localeCompare(compactSymbol(second.symbol)));
  }

  const allItems = Object.values(groups).flatMap((group) => group.items);

  return {
    groups,
    summary: {
      actionableCount: groups.long_warming.items.length + groups.short_warming.items.length + groups.near_trigger.items.length,
      dailyMoverContextCount: allItems.filter((item) => item.dailyMoverContext).length,
      requestPolicy: "no_extra_requests",
      scanStatus,
      watchOnlyCount: groups.no_chase.items.length + groups.data_watch.items.length + groups.new_long_tail.items.length,
    },
  };
}
