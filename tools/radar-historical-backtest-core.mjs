export const DEFAULT_BACKTEST_OPTIONS = Object.freeze({
  horizonBars: 96,
  minHistoryBars: 96,
  moveThresholdPct: 10,
  stepBars: 4,
  topN: 20,
});

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) {
    return 0;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function standardDeviation(values) {
  const avg = mean(values);
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length < 2) {
    return 0;
  }

  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (clean.length - 1);

  return Math.sqrt(variance);
}

export function percentChange(from, to) {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) {
    return 0;
  }

  return ((to - from) / from) * 100;
}

export function simpleEma(values, period) {
  const clean = values.filter((value) => Number.isFinite(value));

  if (clean.length === 0) {
    return 0;
  }

  const k = 2 / (period + 1);
  let ema = clean[0];

  for (let index = 1; index < clean.length; index += 1) {
    ema = clean[index] * k + ema * (1 - k);
  }

  return ema;
}

function last(values, fallback = 0) {
  return values.length > 0 ? values[values.length - 1] : fallback;
}

function sliceTail(values, count) {
  return values.slice(Math.max(0, values.length - count));
}

function deterministicHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function deterministicRandomScore(symbol, observedAt) {
  return deterministicHash(`${symbol}:${observedAt}`) / 0xffffffff;
}

export function normalizeCandle(raw) {
  const openTime = raw?.openTime ?? raw?.open_time ?? raw?.time;
  const closeTime = raw?.closeTime ?? raw?.close_time ?? raw?.time;
  const candle = {
    openTime: typeof openTime === "string" ? openTime : new Date(Number(openTime)).toISOString(),
    closeTime: typeof closeTime === "string" ? closeTime : new Date(Number(closeTime)).toISOString(),
    open: Number(raw?.open),
    high: Number(raw?.high),
    low: Number(raw?.low),
    close: Number(raw?.close),
    volume: Number(raw?.volume),
  };

  if (
    !Number.isFinite(Date.parse(candle.openTime)) ||
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    !Number.isFinite(candle.volume) ||
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0
  ) {
    return null;
  }

  return candle;
}

export function normalizeCandles(candles) {
  const normalized = candles.map(normalizeCandle).filter(Boolean);
  const byOpenTime = new Map();

  for (const candle of normalized) {
    byOpenTime.set(candle.openTime, candle);
  }

  return [...byOpenTime.values()].sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
}

function rangePercent(candles) {
  if (candles.length === 0) {
    return 0;
  }

  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const close = last(candles).close;

  return close > 0 ? ((high - low) / close) * 100 : 0;
}

function maxHigh(candles) {
  return candles.length > 0 ? Math.max(...candles.map((candle) => candle.high)) : 0;
}

function minLow(candles) {
  return candles.length > 0 ? Math.min(...candles.map((candle) => candle.low)) : 0;
}

function quoteVolume(candles) {
  return candles.reduce((sum, candle) => sum + candle.volume * candle.close, 0);
}

export function buildHistoricalFeature(symbol, candles, index, options = {}) {
  const minHistoryBars = options.minHistoryBars ?? DEFAULT_BACKTEST_OPTIONS.minHistoryBars;

  if (index < minHistoryBars || index >= candles.length) {
    return null;
  }

  const history = candles.slice(0, index + 1);
  const current = last(history);
  const closes = history.map((candle) => candle.close);
  const volumes = history.map((candle) => candle.volume);
  const recent4 = sliceTail(history, 4);
  const recent24 = sliceTail(history, 24);
  const recent48 = sliceTail(history, 48);
  const recent96 = sliceTail(history, 96);
  const recent192 = sliceTail(history, 192);
  const previousVolumes = volumes.slice(Math.max(0, volumes.length - 100), Math.max(0, volumes.length - 4));
  const recentVolume = mean(recent4.map((candle) => candle.volume));
  const volumeAvg = mean(previousVolumes);
  const volumeStd = standardDeviation(previousVolumes);
  const volumeZScore = volumeStd > 0 ? (recentVolume - volumeAvg) / volumeStd : 0;
  const change1hPct = recent4.length >= 2 ? percentChange(recent4[0].close, current.close) : 0;
  const change6hPct = recent24.length >= 2 ? percentChange(recent24[0].close, current.close) : 0;
  const change24hPct = recent96.length >= 2 ? percentChange(recent96[0].close, current.close) : 0;
  const range32Pct = rangePercent(sliceTail(history, 32));
  const range96Pct = rangePercent(recent96);
  const range192Pct = rangePercent(recent192);
  const high96 = maxHigh(recent96);
  const low96 = minLow(recent96);
  const high48 = maxHigh(recent48);
  const low48 = minLow(recent48);
  const distanceToHighPct = high96 > 0 ? ((high96 - current.close) / current.close) * 100 : 0;
  const distanceFromLowPct = low96 > 0 ? ((current.close - low96) / current.close) * 100 : 0;
  const ema20 = simpleEma(sliceTail(closes, 80), 20);
  const ema60 = simpleEma(sliceTail(closes, 160), 60);
  const trendSlopePct = ema60 > 0 ? ((ema20 - ema60) / ema60) * 100 : 0;
  const closePositionInRange = high96 > low96 ? ((current.close - low96) / (high96 - low96)) * 100 : 50;
  const compressionScore = clamp((range192Pct - range32Pct) * 4 + (10 - range32Pct) * 3, 0, 100);
  const volumeScore = clamp(volumeZScore * 18 + percentChange(volumeAvg, recentVolume) * 0.7, 0, 100);
  const notYetMovedScore = clamp(100 - Math.abs(change24hPct) * 4 - Math.abs(change6hPct) * 2, 0, 100);
  const nearKeyLevelScore = clamp(
    60 - Math.min(Math.abs(distanceToHighPct), Math.abs(distanceFromLowPct)) * 9 + Math.abs(closePositionInRange - 50) * 0.25,
    0,
    100,
  );
  const trendScore = clamp(50 + trendSlopePct * 9 + change6hPct * 2, 0, 100);
  const overextensionRisk = clamp(Math.abs(change24hPct) * 4 + Math.abs(change6hPct) * 3 + Math.max(0, range32Pct - 14) * 4, 0, 100);
  const impulseLong = volumeZScore >= 1 && change1hPct >= 0 && current.close >= low48 + (high48 - low48) * 0.35;
  const impulseShort = volumeZScore >= 1 && change1hPct < 0 && current.close <= low48 + (high48 - low48) * 0.65;
  const direction = impulseLong
    ? "LONG"
    : impulseShort
      ? "SHORT"
      : trendSlopePct >= -0.15 && closePositionInRange >= 42
        ? "LONG"
        : "SHORT";
  const earlyOpportunityScore = clamp(
    compressionScore * 0.32 +
      volumeScore * 0.28 +
      notYetMovedScore * 0.2 +
      nearKeyLevelScore * 0.14 +
      trendScore * 0.06 -
      overextensionRisk * 0.22,
    0,
    100,
  );
  const anomalyScore = clamp(Math.abs(change1hPct) * 6 + Math.abs(change6hPct) * 2 + Math.max(volumeZScore, 0) * 18, 0, 100);
  const opportunityScore = clamp(earlyOpportunityScore * 0.72 + anomalyScore * 0.18 + notYetMovedScore * 0.1, 0, 100);
  const reasons = [];

  if (compressionScore >= 55) {
    reasons.push("波动压缩");
  }
  if (volumeScore >= 45) {
    reasons.push("成交量开始放大");
  }
  if (notYetMovedScore >= 65) {
    reasons.push("尚未大幅启动");
  }
  if (nearKeyLevelScore >= 45) {
    reasons.push("靠近关键区间");
  }
  if (overextensionRisk >= 65) {
    reasons.push("已出现追涨追跌风险");
  }

  return {
    anomalyScore: round(anomalyScore, 2),
    change1hPct: round(change1hPct, 2),
    change6hPct: round(change6hPct, 2),
    change24hPct: round(change24hPct, 2),
    closePositionInRange: round(closePositionInRange, 2),
    compressionScore: round(compressionScore, 2),
    direction,
    distanceFromLowPct: round(distanceFromLowPct, 2),
    distanceToHighPct: round(distanceToHighPct, 2),
    earlyOpportunityScore: round(earlyOpportunityScore, 2),
    entryPrice: current.close,
    observedAt: current.openTime,
    opportunityScore: round(opportunityScore, 2),
    overextensionRisk: round(overextensionRisk, 2),
    quoteVolume24h: round(quoteVolume(recent96), 2),
    range32Pct: round(range32Pct, 2),
    range96Pct: round(range96Pct, 2),
    reasons,
    symbol,
    trendSlopePct: round(trendSlopePct, 3),
    volumeZScore: round(volumeZScore, 2),
  };
}

export function evaluateHistoricalOutcome(candles, index, feature, options = {}) {
  const horizonBars = options.horizonBars ?? DEFAULT_BACKTEST_OPTIONS.horizonBars;
  const moveThresholdPct = options.moveThresholdPct ?? DEFAULT_BACKTEST_OPTIONS.moveThresholdPct;
  const future = candles.slice(index + 1, index + 1 + horizonBars);

  if (!feature || future.length === 0) {
    return null;
  }

  const entry = feature.entryPrice;
  const futureHigh = maxHigh(future);
  const futureLow = minLow(future);
  const futureClose = last(future).close;
  const longMfePct = percentChange(entry, futureHigh);
  const longMaePct = Math.max(0, -percentChange(entry, futureLow));
  const shortMfePct = percentChange(futureLow, entry);
  const shortMaePct = Math.max(0, percentChange(entry, futureHigh));
  const mfePct = feature.direction === "SHORT" ? shortMfePct : longMfePct;
  const maePct = feature.direction === "SHORT" ? shortMaePct : longMaePct;
  const returnPct = feature.direction === "SHORT"
    ? percentChange(futureClose, entry)
    : percentChange(entry, futureClose);
  const hit = mfePct >= moveThresholdPct;
  const lateAtSelection = Math.abs(feature.change24hPct) >= moveThresholdPct || feature.overextensionRisk >= 75;

  return {
    endedAt: last(future).openTime,
    hit,
    lateAtSelection,
    maePct: round(maePct, 2),
    mfePct: round(mfePct, 2),
    moveThresholdPct,
    returnPct: round(returnPct, 2),
  };
}

function summarizeLane(name, selections) {
  const count = selections.length;
  const hitCount = selections.filter((selection) => selection.outcome?.hit).length;
  const lateCount = selections.filter((selection) => selection.outcome?.lateAtSelection).length;
  const avgMfePct = mean(selections.map((selection) => selection.outcome?.mfePct ?? 0));
  const avgMaePct = mean(selections.map((selection) => selection.outcome?.maePct ?? 0));
  const avgOpportunityScore = mean(selections.map((selection) => selection.feature.opportunityScore));

  return {
    avgMaePct: round(avgMaePct, 2),
    avgMfePct: round(avgMfePct, 2),
    avgOpportunityScore: round(avgOpportunityScore, 2),
    count,
    falsePositiveRatePct: count > 0 ? round(((count - hitCount) / count) * 100, 2) : 0,
    hitCount,
    hitRatePct: count > 0 ? round((hitCount / count) * 100, 2) : 0,
    lane: name,
    lateCount,
    lateRatePct: count > 0 ? round((lateCount / count) * 100, 2) : 0,
  };
}

function findCommonReplayTimes(candlesBySymbol, options) {
  const minHistoryBars = options.minHistoryBars ?? DEFAULT_BACKTEST_OPTIONS.minHistoryBars;
  const horizonBars = options.horizonBars ?? DEFAULT_BACKTEST_OPTIONS.horizonBars;
  const stepBars = options.stepBars ?? DEFAULT_BACKTEST_OPTIONS.stepBars;
  const timeCounts = new Map();

  for (const candles of candlesBySymbol.values()) {
    const normalized = normalizeCandles(candles);

    for (let index = minHistoryBars; index < normalized.length - horizonBars; index += stepBars) {
      const openTime = normalized[index]?.openTime;

      if (openTime) {
        timeCounts.set(openTime, (timeCounts.get(openTime) ?? 0) + 1);
      }
    }
  }

  const minSymbols = Math.max(2, Math.floor(candlesBySymbol.size * 0.4));

  return [...timeCounts.entries()]
    .filter(([, count]) => count >= minSymbols)
    .map(([time]) => time)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
}

function selectionRecord(lane, feature, outcome) {
  return {
    feature,
    lane,
    outcome,
  };
}

export function runHistoricalReplay(input) {
  const options = {
    ...DEFAULT_BACKTEST_OPTIONS,
    ...(input.options ?? {}),
  };
  const normalizedBySymbol = new Map();
  const indexBySymbolTime = new Map();

  for (const [symbol, candles] of input.candlesBySymbol.entries()) {
    const normalized = normalizeCandles(candles);

    if (normalized.length < options.minHistoryBars + options.horizonBars + 2) {
      continue;
    }

    normalizedBySymbol.set(symbol, normalized);
    indexBySymbolTime.set(
      symbol,
      new Map(normalized.map((candle, index) => [candle.openTime, index])),
    );
  }

  const replayTimes = findCommonReplayTimes(normalizedBySymbol, options);
  const selections = {
    momentum: [],
    random: [],
    radar: [],
    volume: [],
  };
  const replaySamples = [];

  for (const observedAt of replayTimes) {
    const features = [];

    for (const [symbol, candles] of normalizedBySymbol.entries()) {
      const index = indexBySymbolTime.get(symbol)?.get(observedAt);

      if (typeof index !== "number") {
        continue;
      }

      const feature = buildHistoricalFeature(symbol, candles, index, options);

      if (feature) {
        features.push({ feature, index, candles });
      }
    }

    if (features.length === 0) {
      continue;
    }

    const topRadar = [...features]
      .sort((left, right) => right.feature.opportunityScore - left.feature.opportunityScore)
      .slice(0, options.topN);
    const topMomentum = [...features]
      .sort((left, right) => Math.abs(right.feature.change24hPct) - Math.abs(left.feature.change24hPct))
      .slice(0, options.topN);
    const topVolume = [...features]
      .sort((left, right) => right.feature.quoteVolume24h - left.feature.quoteVolume24h)
      .slice(0, options.topN);
    const topRandom = [...features]
      .sort((left, right) => deterministicRandomScore(right.feature.symbol, observedAt) - deterministicRandomScore(left.feature.symbol, observedAt))
      .slice(0, options.topN);

    const lanes = [
      ["radar", topRadar],
      ["momentum", topMomentum],
      ["volume", topVolume],
      ["random", topRandom],
    ];

    for (const [lane, laneFeatures] of lanes) {
      for (const item of laneFeatures) {
        const outcome = evaluateHistoricalOutcome(item.candles, item.index, item.feature, options);

        if (outcome) {
          selections[lane].push(selectionRecord(lane, item.feature, outcome));
        }
      }
    }

    replaySamples.push({
      observedAt,
      radarTop: topRadar.slice(0, 5).map((item) => ({
        score: item.feature.opportunityScore,
        symbol: item.feature.symbol,
      })),
      scannedSymbols: features.length,
    });
  }

  const laneMetrics = Object.fromEntries(
    Object.entries(selections).map(([lane, laneSelections]) => [lane, summarizeLane(lane, laneSelections)]),
  );
  const radar = laneMetrics.radar;
  const momentum = laneMetrics.momentum;
  const random = laneMetrics.random;
  const findings = [];

  if (replayTimes.length === 0) {
    findings.push({
      id: "HBT-DATA-001",
      severity: "high",
      title: "历史 K 线不足，无法完成时间点回放",
      detail: "请增加 days、降低 minHistoryBars，或检查交易所历史数据是否成功下载。",
    });
  }

  if (radar?.count > 0 && momentum?.count > 0 && radar.hitRatePct <= momentum.hitRatePct) {
    findings.push({
      id: "HBT-SIGNAL-001",
      severity: "medium",
      title: "雷达候选命中率没有跑赢追涨榜基线",
      detail: `radar=${radar.hitRatePct}% momentum=${momentum.hitRatePct}%。这说明当前提前发现评分还需要继续调整。`,
    });
  }

  if (radar?.count > 0 && random?.count > 0 && radar.hitRatePct <= random.hitRatePct) {
    findings.push({
      id: "HBT-SIGNAL-002",
      severity: "high",
      title: "雷达候选没有跑赢随机基线",
      detail: `radar=${radar.hitRatePct}% random=${random.hitRatePct}%。系统暂时不能证明有筛选优势。`,
    });
  }

  if (radar?.lateRatePct >= 35) {
    findings.push({
      id: "HBT-TIMING-001",
      severity: "medium",
      title: "雷达选中的标的偏晚",
      detail: `lateRate=${radar.lateRatePct}%。如果过高，说明系统仍然在追已经涨跌很多的币。`,
    });
  }

  return {
    findings,
    generatedAt: new Date().toISOString(),
    laneMetrics,
    options,
    replaySamples,
    replayTimes: replayTimes.length,
    selections,
    symbolsUsed: [...normalizedBySymbol.keys()],
  };
}

export function selectionsToCsvRows(selections) {
  const rows = [
    [
      "lane",
      "observedAt",
      "symbol",
      "direction",
      "opportunityScore",
      "change24hPct",
      "volumeZScore",
      "overextensionRisk",
      "mfePct",
      "maePct",
      "hit",
      "lateAtSelection",
      "reasons",
    ],
  ];

  for (const [lane, laneSelections] of Object.entries(selections)) {
    for (const selection of laneSelections) {
      rows.push([
        lane,
        selection.feature.observedAt,
        selection.feature.symbol,
        selection.feature.direction,
        String(selection.feature.opportunityScore),
        String(selection.feature.change24hPct),
        String(selection.feature.volumeZScore),
        String(selection.feature.overextensionRisk),
        String(selection.outcome.mfePct),
        String(selection.outcome.maePct),
        String(selection.outcome.hit),
        String(selection.outcome.lateAtSelection),
        selection.feature.reasons.join("|"),
      ]);
    }
  }

  return rows;
}

export function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function buildHistoricalBacktestMarkdown(result, meta = {}) {
  const radar = result.laneMetrics.radar;
  const momentum = result.laneMetrics.momentum;
  const volume = result.laneMetrics.volume;
  const random = result.laneMetrics.random;
  const lines = [
    "# Chuan Market Radar Historical Backtest",
    "",
    "## 边界",
    "",
    "- 这是历史时间点回放，不是自动下单，不是收益承诺。",
    "- 每个回放点只使用当时之前的 K 线，禁止偷看未来。",
    "- 目标是验证系统能否更早筛出值得关注的山寨币。",
    "- 回测结论只能作为规则审查和复盘优化依据，不能自动改权重。",
    "",
    "## 输入",
    "",
    `- 数据源：${meta.source ?? "binance-public-futures"}`,
    `- 周期：${meta.interval ?? "15m"}`,
    `- 天数：${meta.days ?? "unknown"}`,
    `- 使用币种：${result.symbolsUsed.length}`,
    `- 回放时间点：${result.replayTimes}`,
    `- 每轮候选数：${result.options.topN}`,
    `- 未来验证窗口：${result.options.horizonBars} 根 K 线`,
    `- 命中阈值：${result.options.moveThresholdPct}%`,
    "",
    "## 核心结果",
    "",
    "| 策略 | 样本数 | 命中率 | 平均 MFE | 平均 MAE | 偏晚率 | 误报率 |",
    "|---|---:|---:|---:|---:|---:|---:|",
    `| 雷达提前评分 | ${radar.count} | ${radar.hitRatePct}% | ${radar.avgMfePct}% | ${radar.avgMaePct}% | ${radar.lateRatePct}% | ${radar.falsePositiveRatePct}% |`,
    `| 24h 涨跌幅基线 | ${momentum.count} | ${momentum.hitRatePct}% | ${momentum.avgMfePct}% | ${momentum.avgMaePct}% | ${momentum.lateRatePct}% | ${momentum.falsePositiveRatePct}% |`,
    `| 成交额基线 | ${volume.count} | ${volume.hitRatePct}% | ${volume.avgMfePct}% | ${volume.avgMaePct}% | ${volume.lateRatePct}% | ${volume.falsePositiveRatePct}% |`,
    `| 随机基线 | ${random.count} | ${random.hitRatePct}% | ${random.avgMfePct}% | ${random.avgMaePct}% | ${random.lateRatePct}% | ${random.falsePositiveRatePct}% |`,
    "",
    "## 问题清单",
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("- 本轮没有发现阻断级问题。仍需扩大币种、时间和交易所样本继续验证。");
  } else {
    for (const finding of result.findings) {
      lines.push(`- ${finding.id} [${finding.severity}] ${finding.title}：${finding.detail}`);
    }
  }

  lines.push(
    "",
    "## 雷达选样示例",
    "",
    "| 时间 | 扫描币种数 | 前 5 候选 |",
    "|---|---:|---|",
  );

  for (const sample of result.replaySamples.slice(0, 20)) {
    lines.push(`| ${sample.observedAt} | ${sample.scannedSymbols} | ${sample.radarTop.map((item) => `${item.symbol}(${item.score})`).join(", ")} |`);
  }

  return `${lines.join("\n")}\n`;
}
