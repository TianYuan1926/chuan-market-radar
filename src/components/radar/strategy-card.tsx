import type { MarketSignal } from "@/lib/analysis/types";

type StrategyCardProps = {
  selected?: MarketSignal;
};

type IndicatorMatrixFrame = {
  ema: string;
  macd: string;
  rsi: string;
  timeframe: string;
};

type VolumeNode = {
  pointOfControl: string;
  timeframe: string;
  valueArea: string;
};

function statusLabel(value?: string) {
  if (!value) {
    return "计划中";
  }

  const statusLabels: Record<string, string> = {
    actionable: "可执行",
    blocked: "已阻断",
    building: "构建中",
    confirmed: "已确认",
    cooldown: "冷却中",
    disabled: "未启用",
    fallback: "回退复核",
    invalidated: "已失效",
    near_trigger: "接近触发",
    observe_only: "只观察",
    pending: "待确认",
    reviewed: "已复核",
    tracking: "跟踪中",
    triggered: "已触发",
    wait: "等待",
    waiting: "等待",
  };

  return statusLabels[value] ?? value.replaceAll("_", " ");
}

function indicatorStateLabel(value: string) {
  const labels: Record<string, string> = {
    bearish: "转弱",
    bullish: "顺势",
    neutral: "中性",
    unavailable: "缺失",
  };

  return labels[value] ?? value;
}

function indicatorTone(value: string) {
  if (value === "bullish") {
    return "supportive";
  }

  if (value === "bearish" || value === "overheated" || value === "oversold") {
    return "conflicting";
  }

  return "neutral";
}

function parseIndicatorMatrix(value: string): IndicatorMatrixFrame[] {
  return value
    .split("。")[0]
    .split("；")
    .map((segment) => {
      const match = segment.match(/^(\S+)\s+EMA\s+(\w+)\/MACD\s+(\w+)\/RSI\s+(\w+)/);

      if (!match) {
        return null;
      }

      return {
        timeframe: match[1],
        ema: match[2],
        macd: match[3],
        rsi: match[4],
      };
    })
    .filter((item): item is IndicatorMatrixFrame => item !== null);
}

function parseVolumeNode(value: string): VolumeNode | null {
  const match = value.match(/^(\S+)\s+POC\s+([\d.]+)，价值区\s+([\d.]+-[\d.]+)/);

  if (!match) {
    return null;
  }

  return {
    timeframe: match[1],
    pointOfControl: match[2],
    valueArea: match[3],
  };
}

export function StrategyCard({ selected }: StrategyCardProps) {
  if (!selected) {
    return (
      <section className="module">
        <div className="module-head">
          <h2>策略路径</h2>
          <span className="tag">等待候选</span>
        </div>
        <div className="empty-state">
          <p>还没有可分析标的。</p>
          <span>等待扫描池返回候选后，这里会显示入场、止损、目标和反证逻辑。</span>
        </div>
      </section>
    );
  }

  const volumeScore = Math.min(95, selected.confidence + 7);
  const fundingScore = selected.risk === "low" ? 42 : selected.risk === "medium" ? 48 : 68;
  const riskScore = selected.risk === "low" ? 24 : selected.risk === "medium" ? 38 : 72;
  const strategyStatus = statusLabel(selected.strategy.status);
  const matrixEvidenceLabels = new Set(["多周期指标矩阵", "成交量分布"]);
  const indicatorEvidence = selected.evidence
    .filter((item) => item.layer === "indicators" && !matrixEvidenceLabels.has(item.label))
    .slice(0, 3);
  const indicatorMatrixEvidence = selected.evidence.find((item) => item.label === "多周期指标矩阵");
  const indicatorMatrix = indicatorMatrixEvidence ? parseIndicatorMatrix(indicatorMatrixEvidence.value).slice(0, 8) : [];
  const volumeNode = parseVolumeNode(
    selected.evidence.find((item) => item.label === "成交量分布")?.value ?? "",
  );
  const visibleEvidence = [
    ...indicatorEvidence,
    ...selected.evidence.filter((item) => !indicatorEvidence.includes(item) && !matrixEvidenceLabels.has(item.label)),
  ].slice(0, 6);
  const aiReview = selected.aiReview;
  const aiBoundary = aiReview?.boundary;
  const aiReviewStatus = statusLabel(aiReview?.status);
  const aiCounterEvidence = aiReview?.counterEvidence.length
    ? aiReview.counterEvidence
    : ["AI 反证复核未返回额外反证，本轮以规则引擎为准"];

  return (
    <>
      <section className="module">
        <div className="module-head">
          <h2>指标权重</h2>
          <span className="tag">策略模型</span>
        </div>
        <div className="factor-list">
          <div className="factor">
            <strong>价格</strong>
            <div className="bar"><span style={{ width: `${selected.confidence}%` }} /></div>
            <span className="mono">{selected.confidence}</span>
          </div>
          <div className="factor">
            <strong>量能</strong>
            <div className="bar"><span className="bar-green" style={{ width: `${volumeScore}%` }} /></div>
            <span className="mono">{volumeScore}</span>
          </div>
          <div className="factor">
            <strong>费率</strong>
            <div className="bar"><span className="bar-amber" style={{ width: `${fundingScore}%` }} /></div>
            <span className="mono">{fundingScore}</span>
          </div>
          <div className="factor">
            <strong>风险</strong>
            <div className="bar"><span className="bar-red" style={{ width: `${riskScore}%` }} /></div>
            <span className="mono">{riskScore}</span>
          </div>
        </div>
      </section>

      {indicatorMatrix.length ? (
        <section className="module">
          <div className="module-head">
            <h2>指标矩阵</h2>
            <span className="tag">多周期</span>
          </div>
          <div className="indicator-matrix" aria-label="多周期指标矩阵">
            <div className="indicator-frame indicator-frame--head">
              <span>周期</span>
              <span>EMA</span>
              <span>MACD</span>
              <span>RSI</span>
            </div>
            {indicatorMatrix.map((frame) => (
              <div className="indicator-frame" key={`indicator-${frame.timeframe}`}>
                <strong className="mono">{frame.timeframe.toUpperCase()}</strong>
                <span className={`indicator-pill indicator-pill--${indicatorTone(frame.ema)}`}>
                  {indicatorStateLabel(frame.ema)}
                </span>
                <span className={`indicator-pill indicator-pill--${indicatorTone(frame.macd)}`}>
                  {indicatorStateLabel(frame.macd)}
                </span>
                <span className={`indicator-pill indicator-pill--${indicatorTone(frame.rsi)}`}>
                  {indicatorStateLabel(frame.rsi)}
                </span>
              </div>
            ))}
            {volumeNode ? (
              <div className="volume-node">
                <span>{volumeNode.timeframe.toUpperCase()} POC</span>
                <strong>{volumeNode.pointOfControl}</strong>
                <span>价值区</span>
                <b>{volumeNode.valueArea}</b>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="module">
        <div className="module-head">
          <h2>策略路径</h2>
          <span className="tag">禁止追单</span>
        </div>
        <div className="route-list">
          <div className="route">
            <div className="route-index">1</div>
            <div><strong>先确认位置</strong><span>{selected.summary}</span></div>
          </div>
          <div className="route">
            <div className="route-index">2</div>
            <div><strong>再确认触发</strong><span>{selected.strategy.entry}</span></div>
          </div>
          <div className="route">
            <div className="route-index">3</div>
            <div><strong>最后确认失效</strong><span>{selected.strategy.invalidation}</span></div>
          </div>
        </div>
      </section>

      <section className="module">
        <div className="module-head">
          <h2>执行计划</h2>
          <span className="tag">{strategyStatus}</span>
        </div>
        <div className="execution-grid">
          <div className="execution-item">
            <span>入场区</span>
            <strong>{selected.strategy.entryZone ?? selected.strategy.entry}</strong>
          </div>
          <div className="execution-item">
            <span>止损</span>
            <strong>{selected.strategy.stopLoss ?? selected.strategy.invalidation}</strong>
          </div>
          <div className="execution-item">
            <span>目标</span>
            <strong>{selected.strategy.takeProfitPlan ?? selected.strategy.targets.join(" / ")}</strong>
          </div>
          <div className="execution-item">
            <span>纪律</span>
            <strong>{selected.strategy.noChase ? "禁止追单" : "等待确认"}</strong>
          </div>
        </div>
      </section>

      <section className="module">
        <div className="module-head">
          <h2>反证检查</h2>
          <span className="tag">反证检查</span>
        </div>
        <div className="check-list">
          {(selected.strategy.confirmation ?? ["等待触发确认"]).slice(0, 3).map((item) => (
            <div className="check check--confirm" key={`confirm-${item}`}>
              <strong>确认</strong>
              <span>{item}</span>
            </div>
          ))}
          {(selected.strategy.counterEvidence?.length
            ? selected.strategy.counterEvidence
            : ["暂无硬阻断反证，仍需等待触发条件兑现"]
          )
            .slice(0, 3)
            .map((item) => (
              <div className="check check--counter" key={`counter-${item}`}>
                <strong>反证</strong>
                <span>{item}</span>
              </div>
            ))}
        </div>
      </section>

      <section className="module">
        <div className="module-head">
          <h2>AI 反证</h2>
          <span className="tag">{aiReviewStatus}</span>
        </div>
        <div className="check-list">
          {aiCounterEvidence.slice(0, 2).map((item) => (
            <div className="check check--counter" key={`ai-counter-${item}`}>
              <strong>反证</strong>
              <span>{item}</span>
            </div>
          ))}
          <div className="check check--confirm">
            <strong>判断</strong>
            <span>{aiReview?.sections.judgment ?? "AI 未启用，本轮只采用规则引擎判断。"}</span>
          </div>
          <div className="check check--counter">
            <strong>失败路径</strong>
            <span>{aiReview?.sections.failurePath ?? selected.strategy.invalidation}</span>
          </div>
          <div className="check check--confirm">
            <strong>边界</strong>
            <span>{aiBoundary?.summary ?? "AI 只做反证复核，不改排序，不生成交易信号。"}</span>
          </div>
          <div className="check check--counter">
            <strong>不确定性</strong>
            <span>{aiReview?.sections.uncertainty ?? "AI 未启用，本轮没有模型不确定性补充。"}</span>
          </div>
          <div className="check check--confirm">
            <strong>复盘标签</strong>
            <span>{aiBoundary?.replayCalibration.tag ?? "ai_counter_evidence_review"}</span>
          </div>
        </div>
      </section>

      <section className="module">
        <div className="module-head">
          <h2>证据链</h2>
          <span className="tag">证据链</span>
        </div>
        <div className="evidence-list">
          {visibleEvidence.map((item) => (
            <div className={`evidence evidence--${item.polarity}`} key={`${item.layer}-${item.label}`}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
