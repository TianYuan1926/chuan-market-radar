import {
  MATURITY_DISPLAY_META,
  canEnterSniper,
  type DisplaySignalMaturity,
} from './signal-state-semantics'

export type UiDecisionState = 'TRADE' | 'WAIT' | 'BLOCKED' | 'OBSERVE'

export type UiEvidenceKey = 'OFI' | 'OI' | 'Funding' | 'Whale' | 'Volume' | 'Price'

export type UiEvidenceValue = number | string | null

export type UiTechnicalMetric = {
  label: string
  value: string | number | null
}

export type UiInformationLayers = {
  schemaVersion: 'ui-information-layers.v1'
  l1: {
    decision: UiDecisionState
  }
  l2: {
    reason: string
  }
  l3: {
    evidence: Record<UiEvidenceKey, UiEvidenceValue>
  }
  l4: {
    collapsedByDefault: true
    metrics: UiTechnicalMetric[]
  }
}

export type UiSchemaGuardResult = {
  ok: boolean
  errors: string[]
}

const DECISIONS = new Set<UiDecisionState>(['TRADE', 'WAIT', 'BLOCKED', 'OBSERVE'])
const EVIDENCE_KEYS: UiEvidenceKey[] = ['OFI', 'OI', 'Funding', 'Whale', 'Volume', 'Price']

const TECHNICAL_IN_L2_PATTERNS = [
  /\bRSI\b/i,
  /\bEMA\b/i,
  /\bMACD\b/i,
  /\bATR\b/i,
  /\bZ[-\s]?score\b/i,
  /\bOI\b/i,
  /\bOFI\b/i,
  /\bFunding\b/i,
  /\bWhale\b/i,
  /\bVolume\b/i,
  /\bPrice\b/i,
  /\bRR\b/i,
  /\bCVD\b/i,
  /\bMFE\b/i,
  /\bMAE\b/i,
  /Risk Gate/i,
  /Evidence/i,
]

const LATIN_WORD_PATTERN = /[A-Za-z]{2,}/
const CJK_PATTERN = /[\u3400-\u9fff]/

function lineCount(value: string) {
  return value.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

function hasTechnicalL2Text(value: string) {
  return TECHNICAL_IN_L2_PATTERNS.some((pattern) => pattern.test(value))
}

function hasNonChineseBusinessText(value: string) {
  return LATIN_WORD_PATTERN.test(value)
}

function isSafeL2Reason(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 &&
    CJK_PATTERN.test(trimmed) &&
    lineCount(trimmed) <= 3 &&
    !hasTechnicalL2Text(trimmed) &&
    !hasNonChineseBusinessText(trimmed)
}

export function sanitizeUiReason(reason: string | null | undefined, fallback: string) {
  const candidate = (reason ?? '').trim()
  if (isSafeL2Reason(candidate)) return candidate
  return fallback
}

export function validateUiInformationLayers(layers: UiInformationLayers): UiSchemaGuardResult {
  const errors: string[] = []

  if (layers.schemaVersion !== 'ui-information-layers.v1') {
    errors.push('schema_version_invalid')
  }

  if (!DECISIONS.has(layers.l1.decision)) {
    errors.push('l1_invalid_decision')
  }

  if (!isSafeL2Reason(layers.l2.reason)) {
    errors.push('l2_must_be_chinese_reason_without_technical_terms')
  }

  const keys = Object.keys(layers.l3.evidence).sort()
  const expected = [...EVIDENCE_KEYS].sort()
  if (keys.join('|') !== expected.join('|')) {
    errors.push('l3_evidence_keys_invalid')
  }

  for (const key of EVIDENCE_KEYS) {
    const value = layers.l3.evidence[key]
    if (
      value !== null &&
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) {
      errors.push(`l3_${key}_value_invalid`)
    }
    if (typeof value === 'string' && CJK_PATTERN.test(value)) {
      errors.push(`l3_${key}_must_not_contain_chinese_explanation`)
    }
  }

  if (layers.l4.collapsedByDefault !== true) {
    errors.push('l4_must_be_collapsed_by_default')
  }

  return { ok: errors.length === 0, errors }
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function valueOrNA(value: unknown): UiEvidenceValue {
  const numeric = numberOrNull(value)
  return numeric === null ? 'n/a' : numeric
}

function decisionForMaturity({
  maturity,
  rr,
  whyBlocked,
}: {
  maturity: DisplaySignalMaturity
  rr?: number | null
  whyBlocked?: string | null
}): UiDecisionState {
  if (canEnterSniper({ maturity, rr, whyBlocked })) return 'TRADE'
  if (
    whyBlocked ||
    maturity === 'BLOCKED' ||
    maturity === 'INVALIDATED' ||
    maturity === 'REVIEW_ONLY'
  ) {
    return 'BLOCKED'
  }
  if (
    maturity === 'DEEP_SCAN_CANDIDATE' ||
    maturity === 'EVIDENCE_SIGNAL' ||
    maturity === 'COOLDOWN'
  ) {
    return 'WAIT'
  }
  return 'OBSERVE'
}

function fallbackReasonForDecision(decision: UiDecisionState) {
  if (decision === 'TRADE') return '交易计划已经通过风控，仍需人工复核后执行。'
  if (decision === 'WAIT') return '当前值得继续观察，但还缺少触发或风控确认。'
  if (decision === 'BLOCKED') return '当前被风控或位置拦截，不能直接执行。'
  return '当前只用于观察和筛选，不构成交易计划。'
}

export function buildUiInformationLayers({
  decision,
  reason,
  evidence,
  technical,
}: {
  decision: UiDecisionState
  reason?: string | null
  evidence?: Partial<Record<UiEvidenceKey, UiEvidenceValue>>
  technical?: UiTechnicalMetric[]
}): UiInformationLayers {
  const fallback = fallbackReasonForDecision(decision)
  const layers: UiInformationLayers = {
    schemaVersion: 'ui-information-layers.v1',
    l1: { decision },
    l2: { reason: sanitizeUiReason(reason, fallback) },
    l3: {
      evidence: {
        OFI: evidence?.OFI ?? 'n/a',
        OI: evidence?.OI ?? 'n/a',
        Funding: evidence?.Funding ?? 'n/a',
        Whale: evidence?.Whale ?? 'n/a',
        Volume: evidence?.Volume ?? 'n/a',
        Price: evidence?.Price ?? 'n/a',
      },
    },
    l4: {
      collapsedByDefault: true,
      metrics: technical ?? [],
    },
  }

  const result = validateUiInformationLayers(layers)
  if (result.ok) return layers

  return {
    ...layers,
    l2: { reason: fallback },
  }
}

export type UiSignalLike = {
  maturity: DisplaySignalMaturity
  rr?: number | null
  whyBlocked?: string | null
  whySelected?: string | null
  evidenceCount?: number
  counterCount?: number
  risk?: string
  freshness?: string
  operatorRead?: {
    headline?: string | null
    nextAction?: string | null
  }
  discovery?: {
    changePercent24h?: number | null
    flowImbalance?: number | null
    largeTakerTradeUsd?: number | null
    volume24hUsd?: number | null
    volumeWindowUsd?: number | null
  } | null
}

export function buildSignalUiLayers(signal: UiSignalLike): UiInformationLayers {
  const decision = decisionForMaturity({
    maturity: signal.maturity,
    rr: signal.rr,
    whyBlocked: signal.whyBlocked,
  })
  const meta = MATURITY_DISPLAY_META[signal.maturity]
  const reason = signal.operatorRead?.headline ?? signal.whyBlocked ?? signal.whySelected ?? meta.boundary

  return buildUiInformationLayers({
    decision,
    reason,
    evidence: {
      OFI: valueOrNA(signal.discovery?.flowImbalance),
      OI: 'n/a',
      Funding: 'n/a',
      Whale: valueOrNA(signal.discovery?.largeTakerTradeUsd),
      Volume: valueOrNA(signal.discovery?.volumeWindowUsd ?? signal.discovery?.volume24hUsd),
      Price: valueOrNA(signal.discovery?.changePercent24h),
    },
    technical: [
      { label: '成熟度', value: meta.label },
      { label: '结构盈亏比', value: signal.rr === null || signal.rr === undefined ? 'n/a' : `${signal.rr}:1` },
      { label: '证据数', value: signal.evidenceCount ?? 'n/a' },
      { label: '反证数', value: signal.counterCount ?? 'n/a' },
      { label: '风险', value: signal.risk ?? 'n/a' },
      { label: '数据新鲜度', value: signal.freshness ?? 'n/a' },
    ],
  })
}
