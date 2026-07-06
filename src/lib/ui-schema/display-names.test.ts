import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DATA_STATUS_DISPLAY_NAMES,
  MODULE_DISPLAY_NAMES,
  PAGE_DISPLAY_NAMES,
  STATUS_DISPLAY_NAMES,
  assertNoForbiddenUserVisibleTerms,
  displayDataStatusName,
  displayMaturityName,
  forbiddenUserVisibleTerms,
} from './display-names'

test('page and module names use safe Chinese labels', () => {
  assert.equal(PAGE_DISPLAY_NAMES.signals, '机会观察池')
  assert.equal(PAGE_DISPLAY_NAMES.leaderboard, '强弱观察榜')
  assert.equal(PAGE_DISPLAY_NAMES.dashboard, '雷达驾驶舱')
  assert.equal(MODULE_DISPLAY_NAMES.planReadyBoard, '计划就绪区')
  assert.equal(MODULE_DISPLAY_NAMES.candidatePool, '候选观察池')
  assert.doesNotThrow(() => assertNoForbiddenUserVisibleTerms(PAGE_DISPLAY_NAMES.signals))
  assert.doesNotThrow(() => assertNoForbiddenUserVisibleTerms(PAGE_DISPLAY_NAMES.leaderboard))
  assert.doesNotThrow(() => assertNoForbiddenUserVisibleTerms(MODULE_DISPLAY_NAMES.planReadyBoard))
})

test('state and maturity names do not expose misleading signal terms', () => {
  assert.equal(STATUS_DISPLAY_NAMES.EVIDENCE_SIGNAL, '证据观察')
  assert.equal(STATUS_DISPLAY_NAMES.CANDIDATE, '候选观察')
  assert.equal(STATUS_DISPLAY_NAMES.TRADE_PLAN_READY, '交易计划就绪')
  assert.equal(displayMaturityName('EVIDENCE_SIGNAL'), '证据观察')
  assert.equal(displayMaturityName('DEEP_SCAN_CANDIDATE'), '深度确认')
  assert.equal(displayMaturityName('LIGHT_SCAN_MARK'), '快速轻扫')

  for (const label of Object.values(STATUS_DISPLAY_NAMES)) {
    assert.deepEqual(forbiddenUserVisibleTerms(label), [])
  }
})

test('data status labels expose freshness honestly', () => {
  assert.equal(DATA_STATUS_DISPLAY_NAMES.served_cache, '缓存快照')
  assert.equal(DATA_STATUS_DISPLAY_NAMES.stale, '数据过期')
  assert.equal(DATA_STATUS_DISPLAY_NAMES.partial, '部分可用')
  assert.equal(DATA_STATUS_DISPLAY_NAMES.failed, '数据失败')
  assert.equal(displayDataStatusName('served_cache'), '缓存快照')
  assert.equal(displayDataStatusName('stale'), '数据过期')
  assert.equal(displayDataStatusName('partial'), '部分可用')
  assert.equal(displayDataStatusName('failed'), '数据失败')
})

test('known misleading user-visible names are blocked', () => {
  assert.throws(
    () => assertNoForbiddenUserVisibleTerms('这是证据信号，可以进入狙击榜'),
    /user_visible_copy_forbidden/u,
  )
  assert.throws(
    () => assertNoForbiddenUserVisibleTerms('推荐榜发现高置信信号'),
    /user_visible_copy_forbidden/u,
  )
})
