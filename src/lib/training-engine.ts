'use client'

import { useSyncExternalStore } from 'react'
import { getSniperTargets, type SniperTarget } from './sniper-data'
import { submitJudgement } from './pet-store'

/**
 * 全局常驻「判断训练」引擎
 * ---------------------------------------------------------------
 * 单一模块级单例驱动 分析中 → 揭晓 → 下一题 的自动评判循环，
 * 独立于任何 React 组件运行，因此：
 *   1. 切换到其它页面（组件卸载）后仍持续运行；
 *   2. 切换到其它浏览器标签/窗口（定时器被节流）后，借助
 *      「时间戳追赶」机制，在标签重新可见时立刻补结算这段时间
 *      内本应发生的所有评判，做到真正的「全时在线」。
 *
 * 经验/段位结算仍走 pet-store.submitJudgement，因此全局挂载的
 * 川宝在任意页面都会对结果做出表情/音效反应。
 *
 * 【对接后端】：若改为服务端推送评判结果，把 advance() 内的
 * submitJudgement 调用替换为对后端的写入即可，视图层无需改动。
 */

export type TrainMode = 'direction' | 'radar'
export type TrainPhase = 'analyzing' | 'revealed'
export type TrainResult = {
  correct: boolean
  delta: number
  combo?: string
  streak: number
  wrongStreak: number
} | null

export type TrainState = {
  idx: number
  phase: TrainPhase
  paused: boolean
  mode: TrainMode
  result: TrainResult
}

const ANALYZE_MS = 1500
const REVEAL_MS = 2800
// 后台节流/长时间离开后，单次最多补结算的评判数，避免经验暴涨
const MAX_CATCHUP = 12

let pool: SniperTarget[] = []
let state: TrainState = {
  idx: 0,
  phase: 'analyzing',
  paused: false,
  mode: 'direction',
  result: null,
}

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let dueAt = 0 // 当前阶段应当结束的时间戳
let started = false

function ensurePool() {
  if (pool.length) return
  // 复盘进化只评判「狙击榜」目标，与榜单共用同一数据源 → 二者天然联动
  pool = getSniperTargets()
}

function emit() {
  listeners.forEach((l) => l())
}

// 推进一个阶段（分析中→揭晓 或 揭晓→下一题），并按固定步长前移 dueAt，
// 使追赶时仍保持时间精度。
function advance() {
  if (pool.length === 0) return
  if (state.phase === 'analyzing') {
    const target = pool[state.idx % pool.length]
    // 对错依据：该狙击目标的策略是否兑现
    const correct = target.played
    const res = submitJudgement(correct)
    state = {
      ...state,
      phase: 'revealed',
      result: {
        correct,
        delta: res.delta,
        combo: res.combo,
        streak: res.streak,
        wrongStreak: res.wrongStreak,
      },
    }
    dueAt += REVEAL_MS
  } else {
    state = {
      ...state,
      phase: 'analyzing',
      result: null,
      idx: state.idx + 1,
    }
    dueAt += ANALYZE_MS
  }
}

// 处理所有到期的阶段切换（含后台节流后的批量追赶）
function processDue() {
  if (state.paused) return
  let count = 0
  while (Date.now() >= dueAt && count < MAX_CATCHUP) {
    advance()
    count++
  }
  // 若仍严重落后（离开过久），直接把时间轴拉回当下，避免无意义的长串补算
  if (Date.now() >= dueAt) {
    dueAt = Date.now() + (state.phase === 'analyzing' ? ANALYZE_MS : REVEAL_MS)
  }
  emit()
  scheduleTick()
}

// 自校正定时器：始终按「距离下次到期的真实时间」来设定 setTimeout
function scheduleTick() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (state.paused) return
  const delay = Math.max(0, dueAt - Date.now())
  timer = setTimeout(processDue, delay)
}

function onVisible() {
  // 标签重新可见：立即补结算后台节流期间错过的评判
  if (document.visibilityState === 'visible') processDue()
}

/** 启动全局引擎（幂等）。在全局挂载的组件中调用一次即可全时运行。 */
export function startTrainingEngine() {
  if (started || typeof window === 'undefined') return
  started = true
  ensurePool()
  dueAt = Date.now() + ANALYZE_MS
  document.addEventListener('visibilitychange', onVisible)
  scheduleTick()
}

/** 暂停 / 继续自动评判 */
export function setTrainingPaused(paused: boolean) {
  if (state.paused === paused) return
  state = { ...state, paused }
  if (!paused) {
    // 继续：从当前阶段重新计时
    dueAt = Date.now() + (state.phase === 'analyzing' ? ANALYZE_MS : REVEAL_MS)
    scheduleTick()
  } else if (timer) {
    clearTimeout(timer)
    timer = null
  }
  emit()
}

/** 切换预判模式（不打断正在运行的评判循环） */
export function setTrainingMode(mode: TrainMode) {
  if (state.mode === mode) return
  state = { ...state, mode }
  emit()
}

function subscribe(cb: () => void) {
  startTrainingEngine()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    // 注意：不在监听者清零时停止引擎 —— 这正是「全时在线」的关键，
    // 切换页面卸载视图后引擎仍继续运行。
  }
}

const SERVER_SNAPSHOT: TrainState = {
  idx: 0,
  phase: 'analyzing',
  paused: false,
  mode: 'direction',
  result: null,
}

/** 订阅全局训练引擎状态 */
export function useTrainingEngine(): TrainState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  )
}

/** 读取当前狙击目标（供视图渲染题面） */
export function getTrainingRow(idx: number): SniperTarget | null {
  ensurePool()
  if (pool.length === 0) return null
  return pool[idx % pool.length]
}

/** 当前正在评判的狙击目标 id（供狙击榜高亮联动） */
export function getCurrentTargetId(): string | null {
  ensurePool()
  if (pool.length === 0) return null
  return pool[state.idx % pool.length].id
}
