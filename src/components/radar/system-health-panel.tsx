"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Activity, Archive, Clock3, Database, RadioTower, TimerReset } from "lucide-react";
import type { SystemHealthLevel, SystemHealthReport } from "@/lib/api/system-health";
import type { StrategyWeightChangeExecutionJournalInput } from "@/lib/journal/journal-entry";

type SystemHealthPanelProps = {
  health: SystemHealthReport;
  onRecordStrategyWeightExecution?: (
    execution: StrategyWeightChangeExecutionJournalInput,
    adminToken: string,
  ) => Promise<void>;
};

type StrategyWeightExecutionFormStatus = "error" | "idle" | "saved" | "saving";

type StrategyWeightExecutionFormState = {
  adminToken: string;
  approvalStatus: StrategyWeightChangeExecutionJournalInput["approvalStatus"];
  approvedBy: string;
  rollbackTrigger: string;
  rollbackWindowDays: string;
  tag: string;
  versionLabel: string;
};

function levelLabel(level: SystemHealthLevel) {
  return {
    ready: "就绪",
    preview: "预览",
    degraded: "检查",
    blocked: "阻断",
  }[level];
}

function sourceLabel(value: SystemHealthReport["dataSource"]["activeSource"]) {
  return {
    coingecko: "CoinGecko",
    coinglass: "CoinGlass",
    composite: "聚合源",
    exchange_public: "交易所公开源",
    mock: "演示源",
  }[value];
}

function modeLabel(value: SystemHealthReport["dataSource"]["mode"]) {
  return value === "live" ? "实时" : "演示";
}

function dataSourceStatusLabel(value: SystemHealthReport["dataSource"]["status"]) {
  return {
    fallback: "回退",
    missing_key: "缺密钥",
    preview: "预览",
    ready: "就绪",
  }[value];
}

function freshnessLabel(value: SystemHealthReport["scan"]["freshness"]) {
  return {
    aging: "接近过期",
    expired: "已过期",
    fresh: "新鲜",
    unknown: "未知",
  }[value];
}

function operationsVerdictLabel(value: SystemHealthReport["operations"]["verdict"]) {
  return {
    attention: "注意",
    blocked: "阻断",
    healthy: "健康",
    watch: "观察",
  }[value];
}

function outcomeStatusLabel(value: SystemHealthReport["outcomes"]["status"]) {
  return {
    collecting: "收集",
    covered: "覆盖",
    idle: "待样本",
    reviewing: "待写回",
  }[value];
}

function outcomeQualityLabel(value: SystemHealthReport["outcomes"]["sampleQuality"]["status"]) {
  return {
    collecting: "收集中",
    counterevidence_watch: "看反证",
    empty: "待样本",
    manual_review_ready: "可人工校准",
  }[value];
}

function outcomeAdmissionLabel(value: SystemHealthReport["outcomes"]["calibrationAdmission"]["status"]) {
  return {
    blocked: "阻断",
    collecting: "收集",
    ready: "可人工校准",
  }[value];
}

function outcomeFlowLabel(value: SystemHealthReport["outcomes"]["calibrationFlow"]["status"]) {
  return {
    awaiting_manual_confirmation: "待确认",
    blocked: "阻断",
    collecting_samples: "待校准",
    confirmed_observation: "观察",
    rollback_watch: "回滚观察",
  }[value];
}

function outcomeThresholdStatusLabel(
  value: SystemHealthReport["outcomes"]["calibrationFlow"]["thresholdLayers"][number]["status"],
) {
  return {
    blocked: "阻断",
    collecting: "收集",
    ready: "达标",
    watch: "观察",
  }[value];
}

function outcomeRollbackStageLabel(
  value: SystemHealthReport["outcomes"]["calibrationFlow"]["rollbackPlan"]["stage"],
) {
  return {
    awaiting_manual_confirmation: "待人工确认",
    collect_samples: "收集样本",
    freeze_weight_discussion: "冻结讨论",
    manual_review: "人工复核",
    observe_confirmed_version: "确认后观察",
  }[value];
}

function strategyWeightStatusLabel(value: SystemHealthReport["outcomes"]["strategyWeightCalibration"]["status"]) {
  return {
    blocked: "阻断",
    collecting: "收集",
    manual_review_ready: "人工候选",
    rollback_watch: "回滚观察",
  }[value];
}

function strategyWeightRecommendationLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightCalibration"]["candidates"][number]["recommendation"],
) {
  return {
    decrease_candidate: "降权候选",
    hold_observation: "继续观察",
    increase_candidate: "升权候选",
    quarantine_candidate: "隔离候选",
  }[value];
}

function strategyWeightBandLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightCalibration"]["candidates"][number]["manualAdjustmentBand"],
) {
  return {
    decrease_small: "小幅降权",
    increase_small: "小幅升权",
    no_change: "不调整",
    quarantine: "隔离",
  }[value];
}

function strategyWeightAuditStatusLabel(value: SystemHealthReport["outcomes"]["strategyWeightChangeAudit"]["status"]) {
  return {
    blocked: "阻断审计",
    collecting: "收集",
    manual_audit_ready: "可审计",
    rollback_verification_required: "需回滚",
  }[value];
}

function strategyWeightAuditDirectionLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightChangeAudit"]["items"][number]["proposedDirection"],
) {
  return {
    decrease: "降权审计",
    increase: "升权审计",
    none: "观察",
    quarantine: "隔离审计",
  }[value];
}

function strategyWeightAuditItemStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightChangeAudit"]["items"][number]["auditStatus"],
) {
  return {
    blocked_by_quarantine: "阻断审计",
    ready_for_manual_audit: "可审计",
    requires_confirmation: "待确认",
    requires_more_samples: "样本不足",
    rollback_verification_required: "需回滚",
  }[value];
}

function strategyWeightExecutionStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightChangeExecution"]["status"],
) {
  return {
    awaiting_manual_approval: "待审批",
    blocked: "阻断",
    collecting: "收集",
    recorded_observation: "已记录",
    rollback_watch: "回滚观察",
  }[value];
}

function strategyWeightExecutionItemStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightChangeExecution"]["items"][number]["executionStatus"],
) {
  return {
    approval_rejected: "审批拒绝",
    approved_recorded: "已记录",
    awaiting_manual_approval: "待审批",
    blocked_by_audit: "审计阻断",
    record_needs_review: "需复核",
    rollback_watch: "回滚观察",
  }[value];
}

function strategyWeightShadowStatusLabel(value: SystemHealthReport["outcomes"]["strategyWeightShadow"]["status"]) {
  return {
    blocked: "隔离观察",
    collecting: "收集",
    rollback_watch: "回滚观察",
    shadow_ready: "可观察",
  }[value];
}

function strategyWeightShadowDirectionLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightShadow"]["diffs"][number]["direction"],
) {
  return {
    decrease: "降权影子",
    increase: "升权影子",
    quarantine: "隔离影子",
  }[value];
}

function strategyWeightShadowEvaluationStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightShadowEvaluation"]["status"],
) {
  return {
    blocked: "阻断",
    improving: "表现改善",
    insufficient_samples: "样本不足",
    mixed: "表现分歧",
    rollback_watch: "回滚压力",
  }[value];
}

function strategyWeightShadowEvaluationItemStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightShadowEvaluation"]["items"][number]["status"],
) {
  return {
    blocked: "阻断",
    improving: "改善",
    insufficient_samples: "样本不足",
    mixed: "分歧",
    rollback_watch: "回滚",
  }[value];
}

function strategyWeightShadowRollbackPressureLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightShadowEvaluation"]["items"][number]["rollbackPressure"],
) {
  return {
    blocking: "阻断",
    high: "高",
    low: "低",
    medium: "中",
  }[value];
}

function strategyWeightActivationStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightActivationGate"]["status"],
) {
  return {
    active_disabled_by_config: "配置关闭",
    blocked: "阻断",
    eligible_for_manual_activation: "人工候选",
  }[value];
}

function strategyWeightActivationModeLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightActivationGate"]["activationMode"],
) {
  return {
    disabled: "关闭",
    manual: "人工",
    shadow: "影子",
  }[value];
}

function strategyWeightActivationCheckStatusLabel(
  value: SystemHealthReport["outcomes"]["strategyWeightActivationGate"]["checks"][number]["status"],
) {
  return {
    blocked: "阻断",
    disabled: "关闭",
    passed: "通过",
  }[value];
}

function scanEconomyStatusLabel(value: SystemHealthReport["scanEconomy"]["budget"]["status"]) {
  return {
    near_budget: "接近上限",
    over_budget: "超预算",
    unbudgeted: "未配置",
    within_budget: "预算安全",
  }[value];
}

function scanEconomyNextTierLabel(value: SystemHealthReport["scanEconomy"]["nextTier"]) {
  return {
    active: "热门资产",
    anchor: "锚定",
    complete: "本轮完成",
    core: "核心山寨",
    long_tail: "长尾轮转",
  }[value];
}

function databaseStatusLabel(value: SystemHealthReport["persistence"]["databaseStatus"]) {
  return {
    configured: "已配置",
    fallback: "回退",
    ready: "就绪",
    unconfigured: "未配置",
  }[value] ?? value;
}

function operationNoteLabel(value: string) {
  return value
    .replace(/^batch /, "批次 ")
    .replace(/^requests /, "请求 ")
    .replace(/^scan runtime:/, "扫描耗时：");
}

function formatAge(value: number | null) {
  return value === null ? "--" : `${value}m`;
}

function healthTone(level: SystemHealthLevel) {
  return `health-${level}`;
}

function formatClock(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatCountdown(value: number | null) {
  return value === null ? "--" : `${value}m`;
}

function formatPercent(value: number) {
  return `${value}%`;
}

function formatBudgetValue(value: number | null) {
  return value === null ? "--" : `${value}`;
}

function formatSignedValue(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function defaultStrategyWeightExecutionForm(): StrategyWeightExecutionFormState {
  return {
    adminToken: "",
    approvalStatus: "pending_approval",
    approvedBy: "chuan",
    rollbackTrigger: "",
    rollbackWindowDays: "14",
    tag: "",
    versionLabel: "",
  };
}

function strategyWeightExecutionFormStatusLabel(status: StrategyWeightExecutionFormStatus) {
  return {
    error: "记录失败",
    idle: "待记录",
    saved: "已保存",
    saving: "保存中",
  }[status];
}

export function SystemHealthPanel({ health, onRecordStrategyWeightExecution }: SystemHealthPanelProps) {
  const [strategyWeightExecutionForm, setStrategyWeightExecutionForm] = useState<StrategyWeightExecutionFormState>(
    defaultStrategyWeightExecutionForm,
  );
  const [strategyWeightExecutionFormStatus, setStrategyWeightExecutionFormStatus] =
    useState<StrategyWeightExecutionFormStatus>("idle");
  const notes = [
    health.operations.batchDetail,
    health.operations.requestDetail,
    health.operations.runtimeDetail,
  ].filter((note): note is string => Boolean(note));
  const outcomeRun = health.outcomes.lastRun;
  const outcomeFailureReasons = outcomeRun?.failureReasons ?? [];
  const outcomeAdmission = health.outcomes.calibrationAdmission;
  const outcomeFlow = health.outcomes.calibrationFlow;
  const outcomeBlockers = outcomeFlow.blockerDetails.slice(0, 2);
  const outcomeSampleDrilldown = outcomeFlow.sampleDrilldown.slice(0, 3);
  const outcomeThresholdLayers = outcomeFlow.thresholdLayers.slice(0, 5);
  const outcomeRollbackPlan = outcomeFlow.rollbackPlan;
  const strategyWeightCalibration = health.outcomes.strategyWeightCalibration;
  const strategyWeightCandidates = strategyWeightCalibration.candidates.slice(0, 3);
  const strategyWeightChangeAudit = health.outcomes.strategyWeightChangeAudit;
  const strategyWeightAuditItems = strategyWeightChangeAudit.items.slice(0, 3);
  const strategyWeightChangeExecution = health.outcomes.strategyWeightChangeExecution;
  const strategyWeightExecutionItems = strategyWeightChangeExecution.items.slice(0, 3);
  const strategyWeightShadow = health.outcomes.strategyWeightShadow;
  const strategyWeightShadowDiffs = strategyWeightShadow.diffs.slice(0, 3);
  const strategyWeightShadowEvaluation = health.outcomes.strategyWeightShadowEvaluation;
  const strategyWeightShadowEvaluationItems = strategyWeightShadowEvaluation.items.slice(0, 3);
  const strategyWeightActivationGate = health.outcomes.strategyWeightActivationGate;
  const strategyWeightActivationChecks = strategyWeightActivationGate.checks.slice(0, 4);
  const strategyWeightActivationPassedCount = strategyWeightActivationGate.checks
    .filter((check) => check.status === "passed").length;
  const scanEconomy = health.scanEconomy;
  const scanEconomyTierRows = [
    {
      key: "anchor",
      label: "锚定",
      note: "BTC/ETH 每轮优先",
      tier: scanEconomy.tiers.anchor,
    },
    {
      key: "core",
      label: "核心山寨",
      note: "高频主池",
      tier: scanEconomy.tiers.core,
    },
    {
      key: "active",
      label: "热门资产",
      note: "中频轮转",
      tier: scanEconomy.tiers.active,
    },
    {
      key: "long-tail",
      label: "长尾轮转",
      note: "低频巡检",
      tier: scanEconomy.tiers.longTail,
    },
  ];
  const strategyWeightExecutionFormItems = useMemo(
    () => strategyWeightChangeExecution.items
      .filter((item) => item.proposedDirection !== "none")
      .slice(0, 5),
    [strategyWeightChangeExecution.items],
  );
  const selectedStrategyWeightExecutionItem = strategyWeightExecutionFormItems.find(
    (item) => item.tag === strategyWeightExecutionForm.tag,
  ) ?? strategyWeightExecutionFormItems[0];
  const canRecordStrategyWeightExecution = Boolean(
    onRecordStrategyWeightExecution && selectedStrategyWeightExecutionItem,
  );

  async function submitStrategyWeightExecutionRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onRecordStrategyWeightExecution || !selectedStrategyWeightExecutionItem) {
      return;
    }

    if (!strategyWeightExecutionForm.adminToken.trim()) {
      setStrategyWeightExecutionFormStatus("error");
      return;
    }

    if (selectedStrategyWeightExecutionItem.proposedDirection === "none") {
      setStrategyWeightExecutionFormStatus("error");
      return;
    }

    const rollbackWindowDays = Number(strategyWeightExecutionForm.rollbackWindowDays);
    const execution: StrategyWeightChangeExecutionJournalInput = {
      approvalStatus: strategyWeightExecutionForm.approvalStatus,
      approvedAt: new Date().toISOString(),
      approvedBy: strategyWeightExecutionForm.approvedBy.trim() || "chuan",
      direction: selectedStrategyWeightExecutionItem.proposedDirection,
      label: selectedStrategyWeightExecutionItem.label,
      rollbackTrigger: strategyWeightExecutionForm.rollbackTrigger.trim() ||
        selectedStrategyWeightExecutionItem.rollbackTrigger ||
        "后续样本反证率超过人工阈值",
      rollbackWindowDays: Number.isFinite(rollbackWindowDays) && rollbackWindowDays > 0
        ? Math.floor(rollbackWindowDays)
        : 14,
      tag: selectedStrategyWeightExecutionItem.tag,
      versionLabel: strategyWeightExecutionForm.versionLabel.trim() ||
        selectedStrategyWeightExecutionItem.latestVersionLabel ||
        `manual-${selectedStrategyWeightExecutionItem.tag}-v1`,
    };

    setStrategyWeightExecutionFormStatus("saving");

    try {
      await onRecordStrategyWeightExecution(execution, strategyWeightExecutionForm.adminToken.trim());
      setStrategyWeightExecutionForm((current) => ({
        ...current,
        adminToken: "",
        rollbackTrigger: "",
        versionLabel: "",
      }));
      setStrategyWeightExecutionFormStatus("saved");
    } catch {
      setStrategyWeightExecutionFormStatus("error");
    }
  }

  return (
    <section className={`module health-module ${healthTone(health.level)}`}>
      <div className="module-head">
        <h2>系统状态</h2>
        <span className={`tag tag--${health.level}`}>{levelLabel(health.level)}</span>
      </div>

      <div className="health-readout">
        <div className="health-core">
          <div className="health-core__glyph" aria-hidden="true">
            <Activity size={21} strokeWidth={2.3} />
          </div>
          <div>
            <span className="mono">系统检查</span>
            <strong>{health.summary}</strong>
          </div>
        </div>

        <div className="health-grid" aria-label="系统健康摘要">
          <span>
            <RadioTower size={14} strokeWidth={2.2} />
            <b>{sourceLabel(health.dataSource.activeSource)}</b>
            {modeLabel(health.dataSource.mode)}
          </span>
          <span>
            <Database size={14} strokeWidth={2.2} />
            <b>{databaseStatusLabel(health.persistence.databaseStatus)}</b>
            {health.persistence.databaseDriver}
          </span>
          <span>
            <Activity size={14} strokeWidth={2.2} />
            <b>{freshnessLabel(health.scan.freshness)}</b>
            延迟 {formatAge(health.scan.ageMinutes)}
          </span>
          <span>
            <Archive size={14} strokeWidth={2.2} />
            <b>{health.archive.entries}</b>
            帧
          </span>
        </div>

        <div className={`health-ops health-ops--${health.operations.verdict}`}>
          <div className="health-ops__head">
            <div>
              <span className="mono">扫描运维</span>
              <strong>{health.operations.operatorHint}</strong>
            </div>
            <b>{operationsVerdictLabel(health.operations.verdict)}</b>
          </div>

          <div className="health-op-matrix" aria-label="扫描运维摘要">
            <span>
              <Clock3 size={14} strokeWidth={2.2} />
              <b>{formatClock(health.operations.lastSuccessfulScanAt)}</b>
              最近成功
            </span>
            <span>
              <TimerReset size={14} strokeWidth={2.2} />
              <b>{formatCountdown(health.operations.minutesUntilNextScan)}</b>
              下次扫描
            </span>
            <span>
              <Activity size={14} strokeWidth={2.2} />
              <b>{formatCountdown(health.operations.minutesUntilStale)}</b>
              失效窗口
            </span>
            <span>
              <Archive size={14} strokeWidth={2.2} />
              <b>{health.operations.recentProblemCount}</b>
              异常帧
            </span>
          </div>

          <div className="health-op-matrix" aria-label="扫描覆盖摘要">
            <span>
              <RadioTower size={14} strokeWidth={2.2} />
              <b>{health.coverage.scanned}/{health.coverage.eligible}</b>
              已扫
            </span>
            <span>
              <Archive size={14} strokeWidth={2.2} />
              <b>{health.coverage.pending}</b>
              待扫
            </span>
            <span>
              <TimerReset size={14} strokeWidth={2.2} />
              <b>{health.coverage.batchIndex + 1}/{health.coverage.totalBatches}</b>
              批次
            </span>
            <span>
              <Activity size={14} strokeWidth={2.2} />
              <b>{dataSourceStatusLabel(health.dataSource.status)}</b>
              数据源
            </span>
          </div>

          <div className={`health-scan-economy health-scan-economy--${scanEconomy.budget.status}`}>
            <div className="health-ops__head">
              <div>
                <span className="mono">扫描经济</span>
                <strong>{scanEconomy.operatorHint}</strong>
              </div>
              <b>{scanEconomyStatusLabel(scanEconomy.budget.status)}</b>
            </div>

            <div className="health-scan-economy__grid" aria-label="CoinGlass 请求预算">
              <span>
                <b>{formatBudgetValue(scanEconomy.budget.configuredDailyRequestBudget)}</b>
                今日预算
              </span>
              <span>
                <b>{formatBudgetValue(scanEconomy.budget.estimatedRemainingDailyRequests)}</b>
                剩余额度
              </span>
              <span>
                <b>{scanEconomy.budget.estimatedRequestsPerScan}</b>
                请求/轮
              </span>
              <span>
                <b>{scanEconomy.budget.effectiveBatchSize}/{scanEconomy.budget.requestedBatchSize}</b>
                批次上限
              </span>
            </div>

            <div className="health-scan-economy__subhead">
              <span>层级覆盖</span>
              <b>下轮重点 {scanEconomyNextTierLabel(scanEconomy.nextTier)}</b>
            </div>

            <div className="health-scan-economy__tiers" aria-label="层级覆盖">
              {scanEconomyTierRows.map((row) => (
                <span className="health-scan-economy__tier" key={row.key}>
                  <b>{row.tier.selected}/{row.tier.total}</b>
                  <strong>{row.label}</strong>
                  <small>{row.note}</small>
                </span>
              ))}
              <span className="health-scan-economy__tier health-scan-economy__tier--skipped">
                <b>{scanEconomy.tiers.skipped}</b>
                <strong>跳过</strong>
                <small>非 USDT/停牌/过期</small>
              </span>
            </div>

            <p>
              <span>覆盖 {formatPercent(scanEconomy.coverage.coveragePercent)} · 待扫 {scanEconomy.coverage.pending} · 不新增请求</span>
            </p>
          </div>

          <div className="health-outcomes" aria-label="自动复盘摘要">
            <div className="health-ops__head">
              <div>
                <span className="mono">自动复盘</span>
                <strong>{health.outcomes.operatorHint}</strong>
              </div>
              <b>{outcomeStatusLabel(health.outcomes.status)}</b>
            </div>

            <div className="health-op-matrix">
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{formatPercent(health.outcomes.coveragePercent)}</b>
                覆盖率
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{health.outcomes.pendingEvents}</b>
                待复查
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{health.outcomes.dueEvents}</b>
                到期
              </span>
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{formatClock(health.outcomes.latestOutcomeAt)}</b>
                最近写回
              </span>
            </div>

            <div className="health-op-matrix health-outcome-quality" aria-label="自动复盘样本质量">
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{outcomeQualityLabel(health.outcomes.sampleQuality.status)}</b>
                样本质量
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{health.outcomes.sampleQuality.validatedEvents}</b>
                有效
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{health.outcomes.sampleQuality.failedEvents}</b>
                反证
              </span>
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{health.outcomes.sampleQuality.expiredEvents}</b>
                过期
              </span>
            </div>

            <div className="health-op-matrix health-outcome-admission" aria-label="自动复盘准入门槛">
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{outcomeAdmissionLabel(outcomeAdmission.status)}</b>
                准入门槛
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{outcomeAdmission.readinessScore}</b>
                准入分
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{outcomeAdmission.blockers.length}</b>
                阻断项
              </span>
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{outcomeAdmission.canAutoAdjustWeights ? "待确认" : "不改权重"}</b>
                人工校准
              </span>
            </div>

            <div className="health-op-matrix health-outcome-flow" aria-label="自动复盘校准流">
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{outcomeFlowLabel(outcomeFlow.status)}</b>
                校准流
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{outcomeFlow.manualConfirmationEvents}</b>
                人工确认
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{outcomeFlow.rollbackWatchVersions}</b>
                回滚观察
              </span>
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{outcomeFlow.pendingCalibrationReviews}</b>
                待校准
              </span>
            </div>

            <div className="health-outcome-thresholds" aria-label="自动复盘阈值层">
              <div className="health-outcome-thresholds__head">
                <span className="mono">阈值层</span>
                <strong>{outcomeThresholdLayers.length} 层 / {outcomeRollbackStageLabel(outcomeRollbackPlan.stage)}</strong>
              </div>
              <div className="health-outcome-thresholds__list">
                {outcomeThresholdLayers.map((layer) => (
                  <span className={`health-outcome-thresholds__item health-outcome-thresholds__item--${layer.status}`} key={layer.id}>
                    <b>{layer.label}</b>
                    <em>{outcomeThresholdStatusLabel(layer.status)} · {layer.current}</em>
                    <small>{layer.target}</small>
                  </span>
                ))}
              </div>
            </div>

            <div className={`health-outcome-rollback health-outcome-rollback--${outcomeRollbackPlan.severity}`} aria-label="自动复盘回滚计划">
              <div>
                <span className="mono">回滚计划</span>
                <strong>{outcomeRollbackStageLabel(outcomeRollbackPlan.stage)}</strong>
              </div>
              <p>{outcomeRollbackPlan.trigger}</p>
              <small>{outcomeRollbackPlan.nextStep}</small>
            </div>

            <div
              className={`health-outcome-weight health-outcome-weight--${strategyWeightCalibration.status}`}
              aria-label="策略权重回测校准"
            >
              <div className="health-outcome-weight__head">
                <div>
                  <span className="mono">权重回测</span>
                  <strong>{strategyWeightStatusLabel(strategyWeightCalibration.status)}</strong>
                </div>
                <b>{strategyWeightCalibration.candidateCount} 候选</b>
              </div>

              <div className="health-outcome-weight__grid" aria-label="策略权重候选分布">
                <span>
                  <b>{strategyWeightCalibration.increaseCandidates}</b>
                  升权候选
                </span>
                <span>
                  <b>{strategyWeightCalibration.decreaseCandidates}</b>
                  降权候选
                </span>
                <span>
                  <b>{strategyWeightCalibration.quarantineCandidates}</b>
                  隔离候选
                </span>
                <span>
                  <b>{strategyWeightCalibration.pendingCandidates}</b>
                  继续观察
                </span>
              </div>

              {strategyWeightCandidates.length > 0 ? (
                <div className="health-outcome-weight__candidates" aria-label="策略权重候选明细">
                  <span className="health-outcome-weight__title">候选明细</span>
                  {strategyWeightCandidates.map((candidate) => (
                    <span
                      className={`health-outcome-weight__item health-outcome-weight__item--${candidate.recommendation}`}
                      key={candidate.tag}
                    >
                      <b>{candidate.label}</b>
                      <em>
                        {strategyWeightRecommendationLabel(candidate.recommendation)} · {strategyWeightBandLabel(candidate.manualAdjustmentBand)}
                      </em>
                      <small>{candidate.reason}</small>
                    </span>
                  ))}
                </div>
              ) : null}

              <p>{strategyWeightCalibration.nextStep}</p>
            </div>

            <div
              className={`health-outcome-audit health-outcome-audit--${strategyWeightChangeAudit.status}`}
              aria-label="策略权重变更审计"
            >
              <div className="health-outcome-audit__head">
                <div>
                  <span className="mono">变更审计</span>
                  <strong>{strategyWeightAuditStatusLabel(strategyWeightChangeAudit.status)}</strong>
                </div>
                <b>{strategyWeightChangeAudit.canExecuteWeightChange ? "可执行" : "不可执行"}</b>
              </div>

              <div className="health-outcome-audit__grid" aria-label="策略权重审计候选分布">
                <span>
                  <b>{strategyWeightChangeAudit.auditCandidateCount}</b>
                  审计候选
                </span>
                <span>
                  <b>{strategyWeightChangeAudit.readyAuditCount}</b>
                  可审计
                </span>
                <span>
                  <b>{strategyWeightChangeAudit.rollbackVerificationCount}</b>
                  需回滚
                </span>
                <span>
                  <b>{strategyWeightChangeAudit.blockedAuditCount}</b>
                  阻断审计
                </span>
              </div>

              {strategyWeightAuditItems.length > 0 ? (
                <div className="health-outcome-audit__items" aria-label="策略权重审计明细">
                  {strategyWeightAuditItems.map((item) => (
                    <span
                      className={`health-outcome-audit__item health-outcome-audit__item--${item.auditStatus}`}
                      key={item.tag}
                    >
                      <b>{item.label}</b>
                      <em>
                        {strategyWeightAuditItemStatusLabel(item.auditStatus)} · {strategyWeightAuditDirectionLabel(item.proposedDirection)}
                      </em>
                      <small>{item.reason}</small>
                    </span>
                  ))}
                </div>
              ) : null}

              <p>{strategyWeightChangeAudit.nextStep}</p>
            </div>

            <div
              className={`health-outcome-execution health-outcome-execution--${strategyWeightChangeExecution.status}`}
              aria-label="策略权重人工执行记录"
            >
              <div className="health-outcome-execution__head">
                <div>
                  <span className="mono">执行记录</span>
                  <strong>{strategyWeightExecutionStatusLabel(strategyWeightChangeExecution.status)}</strong>
                </div>
                <b>{strategyWeightChangeExecution.canWriteRuleWeights ? "可写权重" : "不可写权重"}</b>
              </div>

              <div className="health-outcome-execution__grid" aria-label="策略权重执行记录分布">
                <span>
                  <b>{strategyWeightChangeExecution.executionRecordCount}</b>
                  执行记录
                </span>
                <span>
                  <b>{strategyWeightChangeExecution.approvedRecordCount}</b>
                  已记录
                </span>
                <span>
                  <b>{strategyWeightChangeExecution.pendingApprovalCount}</b>
                  待审批
                </span>
                <span>
                  <b>{strategyWeightChangeExecution.rollbackWatchCount + strategyWeightChangeExecution.blockedRecordCount}</b>
                  回滚/阻断
                </span>
              </div>

              {strategyWeightExecutionItems.length > 0 ? (
                <div className="health-outcome-execution__items" aria-label="策略权重执行记录明细">
                  {strategyWeightExecutionItems.map((item) => (
                    <span
                      className={`health-outcome-execution__item health-outcome-execution__item--${item.executionStatus}`}
                      key={item.tag}
                    >
                      <b>{item.label}</b>
                      <em>{strategyWeightExecutionItemStatusLabel(item.executionStatus)}</em>
                      <small>
                        {item.latestRecordAt ? `${formatClock(item.latestRecordAt)} · ` : ""}
                        {item.rollbackTrigger ?? "审批记录必须包含人工确认、版本和回滚触发器。"}
                      </small>
                    </span>
                  ))}
                </div>
              ) : null}

              <form
                className="health-outcome-execution__form"
                onSubmit={submitStrategyWeightExecutionRecord}
                aria-label="策略权重人工记录审批表单"
              >
                <div className="health-outcome-execution__form-head">
                  <span>
                    <b>记录审批账本</b>
                    <small>只保存记录，不写入规则权重。</small>
                  </span>
                  <em>{strategyWeightExecutionFormStatusLabel(strategyWeightExecutionFormStatus)}</em>
                </div>
                <label>
                  候选
                  <select
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    value={selectedStrategyWeightExecutionItem?.tag ?? ""}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      tag: event.target.value,
                    }))}
                  >
                    {strategyWeightExecutionFormItems.length > 0 ? strategyWeightExecutionFormItems.map((item) => (
                      <option key={item.tag} value={item.tag}>
                        {item.label} · {strategyWeightAuditDirectionLabel(item.proposedDirection)}
                      </option>
                    )) : (
                      <option value="">暂无可记录候选</option>
                    )}
                  </select>
                </label>
                <label>
                  审批状态
                  <select
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    value={strategyWeightExecutionForm.approvalStatus}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      approvalStatus: event.target.value as StrategyWeightChangeExecutionJournalInput["approvalStatus"],
                    }))}
                  >
                    <option value="pending_approval">待审批</option>
                    <option value="approved">批准记录</option>
                    <option value="rejected">拒绝记录</option>
                    <option value="rollback_watch">回滚观察</option>
                  </select>
                </label>
                <label>
                  管理密钥
                  <input
                    autoComplete="off"
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      adminToken: event.target.value,
                    }))}
                    placeholder="CRON_SECRET"
                    type="password"
                    value={strategyWeightExecutionForm.adminToken}
                  />
                </label>
                <label>
                  版本标签
                  <input
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      versionLabel: event.target.value,
                    }))}
                    placeholder={selectedStrategyWeightExecutionItem?.latestVersionLabel ?? "manual-weight-v1"}
                    value={strategyWeightExecutionForm.versionLabel}
                  />
                </label>
                <label>
                  回滚窗口
                  <input
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    min={1}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      rollbackWindowDays: event.target.value,
                    }))}
                    type="number"
                    value={strategyWeightExecutionForm.rollbackWindowDays}
                  />
                </label>
                <label className="health-outcome-execution__form-wide">
                  回滚触发器
                  <input
                    disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                    onChange={(event) => setStrategyWeightExecutionForm((current) => ({
                      ...current,
                      rollbackTrigger: event.target.value,
                    }))}
                    placeholder={selectedStrategyWeightExecutionItem?.rollbackTrigger ?? "后续样本反证率超过人工阈值"}
                    value={strategyWeightExecutionForm.rollbackTrigger}
                  />
                </label>
                <button
                  className="health-outcome-execution__button"
                  disabled={!canRecordStrategyWeightExecution || strategyWeightExecutionFormStatus === "saving"}
                  type="submit"
                >
                  {strategyWeightExecutionFormStatus === "saving" ? "保存中" : "记录审批账本"}
                </button>
              </form>

              <p>{strategyWeightChangeExecution.nextStep}</p>
            </div>

            <div
              className={`health-outcome-shadow health-outcome-shadow--${strategyWeightShadow.status}`}
              aria-label="策略权重影子层"
            >
              <div className="health-outcome-shadow__head">
                <div>
                  <span className="mono">影子权重</span>
                  <strong>{strategyWeightShadowStatusLabel(strategyWeightShadow.status)}</strong>
                </div>
                <b>不影响实盘判断</b>
              </div>

              <div className="health-outcome-shadow__grid" aria-label="策略权重影子摘要">
                <span>
                  <b>{strategyWeightShadow.approvedRecordCount}</b>
                  已审批
                </span>
                <span>
                  <b>{strategyWeightShadow.ignoredRecordCount}</b>
                  忽略记录
                </span>
                <span>
                  <b>{strategyWeightShadow.baseWeights.length}</b>
                  当前权重
                </span>
                <span>
                  <b>{strategyWeightShadow.shadowWeights.length}</b>
                  建议权重
                </span>
              </div>

              {strategyWeightShadowDiffs.length > 0 ? (
                <div className="health-outcome-shadow__diffs" aria-label="策略权重影子差异">
                  {strategyWeightShadowDiffs.map((diff) => (
                    <span
                      className={`health-outcome-shadow__diff health-outcome-shadow__diff--${diff.direction}`}
                      key={diff.tag}
                    >
                      <b>{diff.label}</b>
                      <em>{strategyWeightShadowDirectionLabel(diff.direction)}</em>
                      <small>
                        当前权重 {diff.baseWeight} / 建议权重 {diff.shadowWeight} / 差异 {formatSignedValue(diff.delta)}
                      </small>
                    </span>
                  ))}
                </div>
              ) : null}

              <p>{strategyWeightShadow.nextStep}</p>
            </div>

            <div
              className={`health-outcome-shadow-eval health-outcome-shadow-eval--${strategyWeightShadowEvaluation.status}`}
              aria-label="策略权重影子表现"
            >
              <div className="health-outcome-shadow__head">
                <div>
                  <span className="mono">影子表现</span>
                  <strong>{strategyWeightShadowEvaluationStatusLabel(strategyWeightShadowEvaluation.status)}</strong>
                </div>
                <b>不执行真实权重</b>
              </div>

              <div className="health-outcome-shadow-eval__grid" aria-label="策略权重影子表现摘要">
                <span>
                  <b>{strategyWeightShadowEvaluation.evaluatedShadowCount}</b>
                  已评估
                </span>
                <span>
                  <b>{strategyWeightShadowEvaluation.totalPostApprovalSamples}</b>
                  样本数
                </span>
                <span>
                  <b>{strategyWeightShadowEvaluation.improvingCount}</b>
                  改善
                </span>
                <span>
                  <b>{strategyWeightShadowEvaluation.rollbackWatchCount + strategyWeightShadowEvaluation.blockedCount}</b>
                  回滚压力
                </span>
              </div>

              {strategyWeightShadowEvaluationItems.length > 0 ? (
                <div className="health-outcome-shadow-eval__items" aria-label="策略权重影子表现明细">
                  {strategyWeightShadowEvaluationItems.map((item) => (
                    <span
                      className={`health-outcome-shadow-eval__item health-outcome-shadow-eval__item--${item.status}`}
                      key={item.tag}
                    >
                      <b>{item.label}</b>
                      <em>{strategyWeightShadowEvaluationItemStatusLabel(item.status)}</em>
                      <small>
                        有效/反证 {item.validatedSamples}/{item.rejectedSamples} · 样本数 {item.postApprovalSamples} · 回滚压力 {strategyWeightShadowRollbackPressureLabel(item.rollbackPressure)}
                      </small>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="health-outcome-shadow-eval__items" aria-label="策略权重影子表现明细">
                  <span className="health-outcome-shadow-eval__item health-outcome-shadow-eval__item--empty">
                    <b>等待影子样本</b>
                    <em>只读观察</em>
                    <small>有效/反证 0/0 · 样本数 0 · 回滚压力 低</small>
                  </span>
                </div>
              )}

              <p>{strategyWeightShadowEvaluation.nextStep}</p>
            </div>

            <div
              className={`health-outcome-activation health-outcome-activation--${strategyWeightActivationGate.status}`}
              aria-label="真实权重启用门禁"
            >
              <div className="health-outcome-shadow__head">
                <div>
                  <span className="mono">真实权重门禁</span>
                  <strong>{strategyWeightActivationStatusLabel(strategyWeightActivationGate.status)}</strong>
                </div>
                <b>不接入扫描</b>
              </div>

              <div className="health-outcome-activation__grid" aria-label="真实权重门禁摘要">
                <span>
                  <b>{strategyWeightActivationModeLabel(strategyWeightActivationGate.activationMode)}</b>
                  启用模式
                </span>
                <span>
                  <b>{strategyWeightActivationPassedCount}</b>
                  通过项
                </span>
                <span>
                  <b>{strategyWeightActivationGate.blockerCount}</b>
                  阻断项
                </span>
                <span>
                  <b>{strategyWeightActivationGate.requiredPostApprovalSamples}</b>
                  样本门槛
                </span>
              </div>

              <div className="health-outcome-activation__checks" aria-label="真实权重门禁检查项">
                {strategyWeightActivationChecks.map((check) => (
                  <span className={`health-outcome-activation__check health-outcome-activation__check--${check.status}`} key={check.id}>
                    <b>{check.label}</b>
                    <em>{strategyWeightActivationCheckStatusLabel(check.status)}</em>
                    <small>{check.detail}</small>
                  </span>
                ))}
              </div>

              <p>{strategyWeightActivationGate.nextStep}</p>
            </div>

            {outcomeBlockers.length > 0 ? (
              <div className="health-op-notes health-outcome-detail" aria-label="自动复盘阻断解释">
                <span className="health-outcome-detail__title">阻断解释</span>
                {outcomeBlockers.map((blocker) => (
                  <span key={blocker.code}>
                    <b>{blocker.label}</b>
                    {blocker.detail} {blocker.nextStep}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="health-outcome-samples" aria-label="自动复盘样本明细">
              <div className="health-outcome-samples__head">
                <span className="mono">样本分布</span>
                <strong>
                  有效 {outcomeFlow.sampleBreakdown.validated} / 反证 {outcomeFlow.sampleBreakdown.rejected} / 待复查 {outcomeFlow.sampleBreakdown.pending} / 过期 {outcomeFlow.sampleBreakdown.expired}
                </strong>
              </div>
              {outcomeSampleDrilldown.length > 0 ? (
                <div className="health-outcome-samples__list" aria-label="样本明细">
                  {outcomeSampleDrilldown.map((sample) => (
                    <span className={`health-outcome-samples__item health-outcome-samples__item--${sample.bucket}`} key={sample.id}>
                      <b>{sample.symbol}</b>
                      <em>{sample.label}</em>
                      <small>{formatClock(sample.createdAt)} · {sample.reason}</small>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="health-op-matrix health-outcome-run" aria-label="自动复盘执行批次">
              <span>
                <Clock3 size={14} strokeWidth={2.2} />
                <b>{formatClock(health.outcomes.latestRunAt)}</b>
                最近执行
              </span>
              <span>
                <Archive size={14} strokeWidth={2.2} />
                <b>{outcomeRun?.writtenEvents ?? 0}</b>
                写回
              </span>
              <span>
                <TimerReset size={14} strokeWidth={2.2} />
                <b>{outcomeRun?.skippedEvents ?? 0}</b>
                跳过
              </span>
              <span>
                <Activity size={14} strokeWidth={2.2} />
                <b>{outcomeRun?.failedFetches ?? 0}</b>
                失败
              </span>
            </div>

            {outcomeFailureReasons.length > 0 ? (
              <div className="health-op-notes health-outcome-run__notes" aria-label="自动复盘失败原因">
                <span>失败原因 {outcomeFailureReasons.join(" / ")}</span>
              </div>
            ) : null}
          </div>

          {notes.length > 0 ? (
            <div className="health-op-notes" aria-label="扫描运行备注">
              {notes.map((note) => (
                <span key={note}>{operationNoteLabel(note)}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="health-guards">
          {health.guards.map((guard) => (
            <article className={`health-guard health-guard--${guard.state}`} key={guard.id}>
              <span>{guard.label}</span>
              <strong>{levelLabel(guard.state)}</strong>
              <small>{guard.detail}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
