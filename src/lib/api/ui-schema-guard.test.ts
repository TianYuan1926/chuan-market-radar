import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSignalUiLayers,
  buildUiInformationLayers,
  validateUiInformationLayers,
} from '../ui-schema-guard'

test('UI schema guard accepts the four-layer structure', () => {
  const layers = buildUiInformationLayers({
    decision: 'WAIT',
    reason: '当前值得观察，但还需要触发确认。',
    evidence: {
      OFI: 0.12,
      OI: 'n/a',
      Funding: 'n/a',
      Whale: 100000,
      Volume: 2500000,
      Price: 2.5,
    },
    technical: [{ label: '结构盈亏比', value: '2.4:1' }],
  })

  assert.deepEqual(validateUiInformationLayers(layers), { ok: true, errors: [] })
})

test('UI schema guard blocks technical terms and English in L2', () => {
  const layers = buildUiInformationLayers({
    decision: 'WAIT',
    reason: 'RSI 和 Funding 偏高，WAIT_PULLBACK。',
  })

  assert.equal(layers.l2.reason, '当前值得继续观察，但还缺少触发或风控确认。')
  assert.equal(validateUiInformationLayers(layers).ok, true)
})

test('UI schema guard blocks Chinese explanation inside L3 evidence values', () => {
  const layers = buildUiInformationLayers({
    decision: 'OBSERVE',
    reason: '当前只用于观察，不构成交易计划。',
    evidence: { OI: '资金增加' },
  })

  const result = validateUiInformationLayers(layers)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('l3_OI_must_not_contain_chinese_explanation'))
})

test('signal layer builder never promotes non-ready evidence to TRADE', () => {
  const evidence = buildSignalUiLayers({
    maturity: 'EVIDENCE_SIGNAL',
    rr: 5,
    whyBlocked: null,
    operatorRead: { headline: '已有结构和数据支撑，但还需要确认。' },
    evidenceCount: 4,
    counterCount: 1,
    risk: '中',
    freshness: 'live',
  })

  assert.equal(evidence.l1.decision, 'WAIT')
  assert.equal(validateUiInformationLayers(evidence).ok, true)

  const ready = buildSignalUiLayers({
    maturity: 'TRADE_PLAN_READY',
    rr: 3.2,
    whyBlocked: null,
    operatorRead: { headline: '交易计划已经通过风控，仍需人工复核。' },
    evidenceCount: 5,
    counterCount: 0,
    risk: '低',
    freshness: 'live',
  })

  assert.equal(ready.l1.decision, 'TRADE')
  assert.equal(validateUiInformationLayers(ready).ok, true)
})
