"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, BrainCircuit, ListPlus, Microscope } from "lucide-react";
import type { DailyMoverReview } from "@/lib/market/daily-movers";
import type {
  DailyMoverPreview,
  DailyMoverReadArchiveResult,
  DailyMoverSnapshotSummary,
} from "@/lib/api/daily-mover-readonly";

type DailyMoverArchive = DailyMoverReadArchiveResult["body"];
type DailyMoverCorrelation = NonNullable<DailyMoverArchive["selectedCorrelation"]>;
type DailyMoverCorrelationLink = DailyMoverCorrelation["links"][number];
type DailyMoverSelectedDetail = DailyMoverArchive["selectedDetails"][number];
type DailyMoverCalibrationSuggestion = DailyMoverArchive["calibrationSuggestions"][number];
type DailyMoverCalibrationFeedback = DailyMoverArchive["calibrationFeedback"][number];
type DailyMoverBacktestCandidate = DailyMoverArchive["backtestCandidates"][number];
type DailyMoverBacktestValidation = DailyMoverArchive["backtestValidations"][number];
type DailyMoverStrategyDraft = DailyMoverArchive["strategyDrafts"][number];
type DailyMoverCalibrationReviewStatus = "idle" | "saving" | "saved" | "error";

type DailyMoverPanelProps = {
  archive: DailyMoverArchive;
  calibrationReviewStatus?: DailyMoverCalibrationReviewStatus;
  onCreateCalibrationReview?: (
    suggestion: DailyMoverCalibrationSuggestion,
    context: { observedAt: string; snapshotId: string },
  ) => void;
};

const fallbackGuardrail = "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。";
const historicalValidationBoundary = "不是完整 K 线回测";

function formatTime(value: string | undefined) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatVolume(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }

  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function compactSymbol(symbol: string) {
  return symbol.replace(/USDT$/, "");
}

function sourceLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    coingecko: "CoinGecko",
    coinglass: "CoinGlass",
    composite: "聚合源",
    exchange_public: "交易所公开源",
    mock: "演示源",
  };

  return value ? labels[value] ?? value : "等待";
}

function reviewStatusLabel(value: DailyMoverReview["radarReview"]["status"]) {
  return {
    caught: "抓到",
    missed: "漏判",
    not_learnable: "不可学",
  }[value];
}

function learnabilityLabel(value: DailyMoverReview["attribution"]["learnability"]) {
  return {
    learnable: "可学",
    not_learnable: "不可学",
    watchlist: "观察",
  }[value];
}

function driverLabel(value: DailyMoverReview["attribution"]["primaryDrivers"][number]) {
  return {
    funding_pressure: "资金费率",
    liquidation_pressure: "爆仓压力",
    low_liquidity_or_one_off: "低流动性/一次性",
    open_interest_expansion: "OI 扩张",
    pre_move_drift: "提前漂移",
    volume_expansion: "放量扩张",
  }[value];
}

function evidenceLabel(value: DailyMoverSelectedDetail["evidenceStrength"]) {
  return {
    medium: "中等证据",
    strong: "强证据",
    weak: "弱证据",
  }[value];
}

function correlationStatusLabel(value: DailyMoverCorrelationLink["status"]) {
  return {
    caught_unreviewed: "命中待复盘",
    caught_with_journal: "命中已复盘",
    missed_with_evidence: "漏判有证据",
    not_learnable: "不可学习",
    unlinked: "未关联",
  }[value];
}

function correlationTone(value: DailyMoverCorrelationLink["status"]) {
  if (value === "caught_with_journal") {
    return "good";
  }

  if (value === "caught_unreviewed") {
    return "amber";
  }

  if (value === "missed_with_evidence") {
    return "bad";
  }

  return "quiet";
}

function renderMoverRow(mover: DailyMoverPreview) {
  return (
    <li key={mover.id}>
      <span className="mono">#{mover.rank}</span>
      <b>{compactSymbol(mover.symbol)}</b>
      <strong className={mover.direction === "gainer" ? "tone-good" : "tone-bad"}>
        {formatPercent(mover.priceChangePercent)}
      </strong>
      <small>{formatVolume(mover.volume24hUsd)}</small>
    </li>
  );
}

function renderDetail(detail: DailyMoverSelectedDetail) {
  return (
    <article className={`daily-mover-detail__item daily-mover-detail__item--${detail.radarStatus}`} key={detail.id}>
      <div>
        <strong>{compactSymbol(detail.symbol)}</strong>
        <span>{correlationStatusLabel(detail.correlationStatus)}</span>
      </div>
      <p>{detail.whyMissed}</p>
      <small>
        {detail.primaryDrivers.map(driverLabel).slice(0, 2).join(" · ")} / {evidenceLabel(detail.evidenceStrength)}
      </small>
      <ul>
        <li>扫描 {detail.matchedScanIds.length}</li>
        <li>信号 {detail.matchedSignalIds.length}</li>
        <li>日记 {detail.journalEventIds.length}</li>
      </ul>
      <em>{detail.nextReviewAction}</em>
    </article>
  );
}

function calibrationReviewStatusLabel(value: DailyMoverCalibrationReviewStatus) {
  return {
    error: "写入失败",
    idle: "不自动改权重",
    saved: "已入队",
    saving: "写入中",
  }[value];
}

function renderCalibrationSuggestion(
  suggestion: DailyMoverCalibrationSuggestion,
  options: {
    disabled: boolean;
    onCreate?: () => void;
    status: DailyMoverCalibrationReviewStatus;
  },
) {
  return (
    <article className="daily-mover-calibration__item" key={suggestion.id}>
      <div>
        <strong>{suggestion.label}</strong>
        <span>{suggestion.sampleCount} 样本</span>
      </div>
      <p>{suggestion.recommendation}</p>
      <small>{suggestion.symbols.map(compactSymbol).join(" / ")} · {suggestion.guardrail}</small>
      {options.onCreate ? (
        <div className="daily-mover-calibration__actions">
          <button
            className="daily-mover-calibration__button"
            disabled={options.disabled}
            onClick={options.onCreate}
            type="button"
          >
            <ListPlus aria-hidden="true" size={14} strokeWidth={2.3} />
            <span>{options.status === "saving" ? "写入中" : "加入复盘队列"}</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

function renderCalibrationFeedback(feedback: DailyMoverCalibrationFeedback) {
  return (
    <article className="daily-mover-feedback__item" key={feedback.tag}>
      <div>
        <strong>{feedback.label}</strong>
        <span>{feedback.total} 样本</span>
      </div>
      <div className="daily-mover-feedback__stats" aria-label={`${feedback.label} 校准反馈统计`}>
        <span><b>{feedback.pending}</b>待复查</span>
        <span><b>{feedback.validated}</b>有效</span>
        <span><b>{feedback.rejected}</b>反证</span>
        <span><b>{feedback.expired}</b>过期</span>
      </div>
      <p>{feedback.nextStep}</p>
      <small>{feedback.symbols.map(compactSymbol).join(" / ")} · {feedback.guardrail}</small>
    </article>
  );
}

function backtestReadinessLabel(value: DailyMoverBacktestCandidate["readiness"]) {
  return {
    blocked: "反证优先",
    collecting: "积累样本",
    ready: "可回测",
  }[value];
}

function renderBacktestCandidate(candidate: DailyMoverBacktestCandidate) {
  return (
    <article className={`daily-mover-backtest__item daily-mover-backtest__item--${candidate.readiness}`} key={candidate.tag}>
      <div>
        <strong>{candidate.label}</strong>
        <span>{backtestReadinessLabel(candidate.readiness)}</span>
      </div>
      <div className="daily-mover-backtest__stats" aria-label={`${candidate.label} 回测候选统计`}>
        <span><b>{candidate.sampleCount}</b>样本</span>
        <span><b>{candidate.validated}</b>有效</span>
        <span><b>{candidate.rejected}</b>反证</span>
        <span><b>{candidate.readinessScore}</b>分</span>
      </div>
      <p>{candidate.nextStep}</p>
      <small>
        {candidate.evidenceSummary} · {candidate.symbols.map(compactSymbol).join(" / ")} · {candidate.guardrail}
      </small>
    </article>
  );
}

function backtestValidationVerdictLabel(value: DailyMoverBacktestValidation["verdict"]) {
  return {
    blocked: "反证优先",
    insufficient_data: "样本不足",
    needs_more_samples: "继续观察",
    review_ready: "可草拟",
  }[value];
}

function renderBacktestValidation(validation: DailyMoverBacktestValidation) {
  return (
    <article className={`daily-mover-validation__item daily-mover-validation__item--${validation.verdict}`} key={validation.tag}>
      <div>
        <strong>{validation.label}</strong>
        <span>{backtestValidationVerdictLabel(validation.verdict)}</span>
      </div>
      <div className="daily-mover-validation__stats" aria-label={`${validation.label} 历史样本验证统计`}>
        <span><b>{validation.validatedJournalSamples + validation.rejectedJournalSamples}</b>日记验证</span>
        <span><b>{validation.historicalSampleCount}</b>历史样本</span>
        <span><b>{validation.validationRatePercent}%</b>有效率</span>
        <span><b>{validation.caughtRatePercent}%</b>抓到率</span>
      </div>
      <p>{validation.nextStep}</p>
      <small>{validation.evidenceSummary} · {validation.limitation || historicalValidationBoundary}</small>
    </article>
  );
}

function strategyDraftStatusLabel(value: DailyMoverStrategyDraft["status"]) {
  return {
    blocked: "暂缓",
    manual_review_required: "待确认",
    needs_more_evidence: "补样本",
  }[value];
}

function renderStrategyDraft(draft: DailyMoverStrategyDraft) {
  return (
    <article className={`daily-mover-strategy__item daily-mover-strategy__item--${draft.status}`} key={draft.id}>
      <div>
        <strong>{draft.label}</strong>
        <span>{strategyDraftStatusLabel(draft.status)}</span>
      </div>
      <div className="daily-mover-strategy__stats" aria-label={`${draft.label} 策略草案统计`}>
        <span><b>{backtestValidationVerdictLabel(draft.validationVerdict)}</b>验证</span>
        <span><b>人工</b>确认</span>
        <span><b>禁止</b>调权</span>
        <span><b>只读</b>草案</span>
      </div>
      <p>{draft.nextStep}</p>
      <small>{draft.versionLabel} · {draft.evidenceSummary} · {draft.limitation || historicalValidationBoundary}</small>
    </article>
  );
}

function selectedSummary(
  archive: DailyMoverArchive,
  snapshotId: string | undefined,
): DailyMoverSnapshotSummary | undefined {
  return archive.snapshots.find((snapshot) => snapshot.id === snapshotId) ?? archive.snapshots[0];
}

export function DailyMoverPanel({
  archive,
  calibrationReviewStatus = "idle",
  onCreateCalibrationReview,
}: DailyMoverPanelProps) {
  const [activeArchive, setActiveArchive] = useState(archive);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const selectedSnapshot = activeArchive.selectedSnapshot ?? activeArchive.latestSnapshot;
  const summary = selectedSummary(activeArchive, selectedSnapshot?.id);
  const selectedCorrelation = activeArchive.selectedCorrelation;
  const correlationLinks = selectedCorrelation?.links.slice(0, 3) ?? [];
  const topGainers = summary?.topGainers.slice(0, 3) ?? [];
  const topLosers = summary?.topLosers.slice(0, 3) ?? [];
  const reviews = selectedSnapshot?.reviews.slice(0, 3) ?? [];
  const selectedDetails = activeArchive.selectedDetails.slice(0, 4);
  const calibrationFeedback = activeArchive.calibrationFeedback.slice(0, 3);
  const calibrationSuggestions = activeArchive.calibrationSuggestions.slice(0, 3);
  const backtestCandidates = activeArchive.backtestCandidates.slice(0, 3);
  const backtestValidations = activeArchive.backtestValidations.slice(0, 3);
  const strategyDrafts = activeArchive.strategyDrafts.slice(0, 3);
  const history = activeArchive.snapshots.slice(0, 6);
  const allowedUse = activeArchive.allowedUse === "research_only" ? "research_only" : activeArchive.allowedUse;
  const guardrail = activeArchive.guardrail || fallbackGuardrail;
  const calibrationContext = selectedSnapshot
    ? {
        observedAt: selectedSnapshot.observedAt,
        snapshotId: selectedSnapshot.id,
      }
    : undefined;

  async function selectSnapshot(id: string) {
    if (id === selectedSnapshot?.id || historyStatus === "loading") {
      return;
    }

    setHistoryStatus("loading");

    try {
      const params = new URLSearchParams({
        id,
        limit: String(activeArchive.retention.limit),
      });
      const response = await fetch(`/api/daily-movers?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json() as DailyMoverArchive;

      if (!response.ok || !payload.selectedSnapshot) {
        throw new Error("daily_mover_snapshot_load_failed");
      }

      setActiveArchive(payload);
      setHistoryStatus("ready");
    } catch {
      setHistoryStatus("error");
    }
  }

  return (
    <section className="module daily-mover-module">
      <div className="module-head">
        <h2>每日异动复盘</h2>
        <span className="tag">研究样本</span>
      </div>

      {summary ? (
        <>
          <div className="daily-mover-ledger">
            <div className="daily-mover-ledger__stamp">
              <Microscope size={18} strokeWidth={2.3} />
              <span className="mono">{allowedUse}</span>
              <strong>{formatTime(summary.observedAt)}</strong>
              <small>{sourceLabel(summary.source)} / {activeArchive.retention.storage} / {activeArchive.retention.returned} 帧</small>
            </div>
            <div className="daily-mover-ledger__counts" aria-label="每日异动归因统计">
              <span><b>{summary.radarReview.caught}</b>抓到</span>
              <span><b>{summary.radarReview.missed}</b>漏判</span>
              <span><b>{summary.attribution.learnable}</b>可学</span>
              <span><b>{summary.attribution.watchlist}</b>观察</span>
            </div>
          </div>

          <div className="daily-mover-guard">
            <BrainCircuit size={15} strokeWidth={2.3} />
            <p>{guardrail}</p>
          </div>

          {selectedCorrelation ? (
            <div className="daily-mover-correlation" aria-label="每日异动关联摘要">
              <div className="daily-mover-correlation__head">
                <h3>关联摘要</h3>
                <span className="mono">{selectedCorrelation.links.length} 样本链</span>
              </div>
              <div className="daily-mover-correlation__stats">
                <span><b>{selectedCorrelation.summary.scanLinked}</b>扫描关联</span>
                <span><b>{selectedCorrelation.summary.journalLinked}</b>日记关联</span>
                <span><b>{selectedCorrelation.summary.calibrationCandidates}</b>校准候选</span>
              </div>
              {correlationLinks.length > 0 ? (
                <div className="daily-mover-correlation__links">
                  {correlationLinks.map((link) => (
                    <article
                      className={`daily-mover-correlation__link daily-mover-correlation__link--${correlationTone(link.status)}`}
                      key={link.moverId}
                    >
                      <div>
                        <strong>{compactSymbol(link.symbol)}</strong>
                        <span>{correlationStatusLabel(link.status)}</span>
                      </div>
                      <small>
                        扫描 {link.matchedScanIds.length} / 日记 {link.journalEventIds.length} /
                        {link.calibrationCandidate ? " 规则校准候选" : " 样本复核"}
                      </small>
                      <p>{link.suggestedNextStep}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="daily-mover-board" aria-label="每日涨跌幅样本预览">
            <div>
              <h3>
                <ArrowUpRight size={14} strokeWidth={2.4} />
                涨幅榜
              </h3>
              <ul>{topGainers.map(renderMoverRow)}</ul>
            </div>
            <div>
              <h3>
                <ArrowDownRight size={14} strokeWidth={2.4} />
                跌幅榜
              </h3>
              <ul>{topLosers.map(renderMoverRow)}</ul>
            </div>
          </div>

          {reviews.length > 0 ? (
            <div className="daily-mover-review" aria-label="归因复盘样本">
              {reviews.map((review) => (
                <article className={`daily-mover-review__item daily-mover-review__item--${review.radarReview.status}`} key={review.id}>
                  <div>
                    <strong>{compactSymbol(review.symbol)}</strong>
                    <span>{reviewStatusLabel(review.radarReview.status)} / {learnabilityLabel(review.attribution.learnability)}</span>
                  </div>
                  <p>
                    {review.attribution.primaryDrivers.map(driverLabel).slice(0, 2).join(" · ")}
                  </p>
                  <small>
                    {review.radarReview.improvementTags.length > 0
                      ? review.radarReview.improvementTags.join(" / ")
                      : "前兆证据进入样本库"}
                  </small>
                </article>
              ))}
            </div>
          ) : null}

          {selectedDetails.length > 0 ? (
            <div className="daily-mover-detail" aria-label="每日异动单样本详情">
              <div className="daily-mover-detail__head">
                <h3>单样本详情</h3>
                <span>{historyStatus === "loading" ? "读取中" : "只读复盘"}</span>
              </div>
              {selectedDetails.map(renderDetail)}
            </div>
          ) : null}

          {calibrationSuggestions.length > 0 ? (
            <div className="daily-mover-calibration" aria-label="规则校准候选建议">
              <div className="daily-mover-calibration__head">
                <h3>规则校准候选</h3>
                <span>{calibrationReviewStatusLabel(calibrationReviewStatus)}</span>
              </div>
              {calibrationSuggestions.map((suggestion) => renderCalibrationSuggestion(suggestion, {
                disabled: calibrationReviewStatus === "saving" || !calibrationContext,
                onCreate: onCreateCalibrationReview && calibrationContext
                  ? () => onCreateCalibrationReview(suggestion, calibrationContext)
                  : undefined,
                status: calibrationReviewStatus,
              }))}
            </div>
          ) : null}

          {calibrationFeedback.length > 0 ? (
            <div className="daily-mover-feedback" aria-label="规则校准反馈趋势">
              <div className="daily-mover-feedback__head">
                <h3>校准反馈</h3>
                <span>只读趋势</span>
              </div>
              {calibrationFeedback.map(renderCalibrationFeedback)}
            </div>
          ) : null}

          {backtestCandidates.length > 0 ? (
            <div className="daily-mover-backtest" aria-label="回测候选链路">
              <div className="daily-mover-backtest__head">
                <h3>回测候选</h3>
                <span>人工确认</span>
              </div>
              {backtestCandidates.map(renderBacktestCandidate)}
            </div>
          ) : null}

          {backtestValidations.length > 0 ? (
            <div className="daily-mover-validation" aria-label="历史样本验证结果">
              <div className="daily-mover-validation__head">
                <h3>样本验证</h3>
                <span>只读验证</span>
              </div>
              {backtestValidations.map(renderBacktestValidation)}
            </div>
          ) : null}

          {strategyDrafts.length > 0 ? (
            <div className="daily-mover-strategy" aria-label="策略版本草案">
              <div className="daily-mover-strategy__head">
                <h3>策略草案</h3>
                <span>人工确认</span>
              </div>
              {strategyDrafts.map(renderStrategyDraft)}
            </div>
          ) : null}

          <div className="daily-mover-history" aria-label="每日异动历史样本">
            {history.map((item) => (
              <button
                className={item.id === selectedSnapshot?.id ? "is-active" : ""}
                disabled={historyStatus === "loading"}
                key={item.id}
                onClick={() => void selectSnapshot(item.id)}
                type="button"
              >
                <b>{formatTime(item.observedAt)}</b>
                {item.reviewCount} 复盘 / {item.gainerCount + item.loserCount} 样本
              </button>
            ))}
            {historyStatus === "error" ? (
              <small>历史样本读取失败，保留当前样本。</small>
            ) : null}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>等待每日异动样本进入归因复盘。</p>
          <small>{guardrail}</small>
        </div>
      )}
    </section>
  );
}
