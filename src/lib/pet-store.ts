'use client'

import { useSyncExternalStore } from 'react'
import { rankForExp, type Rank } from './ranks'

// ============================================================
// 宠物机器人 / 段位进度 store
// 单一数据源，供全站悬浮机器人与复盘段位面板共享。
// ============================================================

export type PetEventKind = 'right' | 'wrong' | 'levelup' | 'leveldown' | 'greet'

export type PetState = {
  exp: number
  totalRight: number
  totalWrong: number
  streak: number // 连续答对数（答错归零）
  wrongStreak: number // 连续答错数（答对归零）
  /** 最近一次反馈事件，机器人据此触发表情/台词；ts 用于触发 React 更新 */
  lastEvent: { kind: PetEventKind; delta: number; ts: number; combo?: string } | null
}

const DEFAULT_STATE: PetState = {
  exp: 0,
  totalRight: 0,
  totalWrong: 0,
  streak: 0,
  wrongStreak: 0,
  lastEvent: null,
}

// ------------------------------------------------------------
// 持久化层
//   服务端 /api/frontend/ui-state 是主同步通道，localStorage 只做离线兜底。
// ------------------------------------------------------------
const STORAGE_KEY = 'chuanscan_pet_v1'
const UI_STATE_ENDPOINT = '/api/frontend/ui-state'

let lastPersistedAt = 0
let serverHydrationStarted = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function petStateFromPayload(payload: unknown): PetState {
  const record = isRecord(payload) ? payload : {}

  return {
    ...DEFAULT_STATE,
    exp: Math.max(0, numberValue(record.exp)),
    totalRight: Math.max(0, numberValue(record.totalRight)),
    totalWrong: Math.max(0, numberValue(record.totalWrong)),
    streak: Math.max(0, numberValue(record.streak)),
    wrongStreak: Math.max(0, numberValue(record.wrongStreak)),
    lastEvent: null,
  }
}

function persistablePetPayload(state: PetState) {
  return {
    exp: state.exp,
    totalRight: state.totalRight,
    totalWrong: state.totalWrong,
    streak: state.streak,
    wrongStreak: state.wrongStreak,
  }
}

function localUpdatedAtFromRecord(record: unknown) {
  if (!isRecord(record) || typeof record.updatedAt !== 'string') return 0
  const time = Date.parse(record.updatedAt)
  return Number.isNaN(time) ? 0 : time
}

function loadProgress(): PetState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    lastPersistedAt = localUpdatedAtFromRecord(parsed)
    return petStateFromPayload(parsed)
  } catch {
    return DEFAULT_STATE
  }
}

function writeLocalProgress(state: PetState, updatedAt: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...persistablePetPayload(state),
        updatedAt,
      }),
    )
    lastPersistedAt = Date.parse(updatedAt)
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}

function saveProgress(state: PetState) {
  const updatedAt = new Date().toISOString()
  writeLocalProgress(state, updatedAt)

  if (typeof window === 'undefined') return
  void fetch(UI_STATE_ENDPOINT, {
    body: JSON.stringify({
      kind: 'pet_progress',
      payload: persistablePetPayload(state),
      updatedAt,
    }),
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => {
    /* 本地缓存已写入，服务器同步失败不阻塞 UI */
  })
}

async function syncProgressFromServer() {
  if (typeof window === 'undefined' || serverHydrationStarted) return
  serverHydrationStarted = true

  try {
    const response = await fetch(`${UI_STATE_ENDPOINT}?kind=pet_progress`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) return
    const body = await response.json()
    const entry = isRecord(body?.uiState?.data) ? body.uiState.data : null
    if (!entry || !isRecord(entry.payload) || typeof entry.updatedAt !== 'string') return

    const serverTime = Date.parse(entry.updatedAt)
    if (Number.isNaN(serverTime) || serverTime < lastPersistedAt) return

    state = petStateFromPayload(entry.payload)
    writeLocalProgress(state, entry.updatedAt)
    emit()
  } catch {
    /* 后端不可用时继续使用本地缓存 */
  }
}

// ------------------------------------------------------------
// store 实现
// ------------------------------------------------------------
let state: PetState = DEFAULT_STATE
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  state = loadProgress()
  hydrated = true
  void syncProgressFromServer()
}

function subscribe(cb: () => void) {
  ensureHydrated()
  // 首次注册后通知一次，确保从 localStorage 读到的值同步到组件
  cb()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): PetState {
  return state
}

function getServerSnapshot(): PetState {
  return DEFAULT_STATE
}

// ------------------------------------------------------------
// 连对 / 连错 额外奖惩档位
//   连对越多，额外奖励越高（COMBO）；连错越多，额外惩罚越重（SLUMP）。
//   从高到低排列，便于按"达到的最高档"匹配。
// ------------------------------------------------------------
export type ComboTier = { name: string; minStreak: number; bonus: number }

export const COMBO_TIERS: ComboTier[] = [
  { name: '神之手', minStreak: 12, bonus: 80 },
  { name: '超神连击', minStreak: 8, bonus: 50 },
  { name: '稳健连击', minStreak: 5, bonus: 28 },
  { name: '小连击', minStreak: 3, bonus: 12 },
]

export const SLUMP_TIERS: ComboTier[] = [
  { name: '深度套牢', minStreak: 8, bonus: 30 },
  { name: '连环踏空', minStreak: 5, bonus: 18 },
  { name: '手感冰凉', minStreak: 3, bonus: 8 },
]

export function comboTierFor(streak: number): ComboTier | null {
  return COMBO_TIERS.find((t) => streak >= t.minStreak) ?? null
}
export function slumpTierFor(wrongStreak: number): ComboTier | null {
  return SLUMP_TIERS.find((t) => wrongStreak >= t.minStreak) ?? null
}

/**
 * 提交一次评判结果。
 * @param correct 是否正确
 * @param amount  经验增量基数（默认 30）
 */
export function submitJudgement(correct: boolean, amount = 30) {
  ensureHydrated()
  const prevRank = rankForExp(state.exp)

  const streak = correct ? state.streak + 1 : 0
  const wrongStreak = correct ? 0 : state.wrongStreak + 1

  // 连对额外奖励 / 连错额外惩罚（独立档位）
  let combo: string | undefined
  let rawDelta: number
  if (correct) {
    const tier = comboTierFor(streak)
    combo = tier?.name
    rawDelta = amount + (tier?.bonus ?? 0)
  } else {
    const tier = slumpTierFor(wrongStreak)
    combo = tier?.name
    rawDelta = -(Math.round(amount * 0.85) + (tier?.bonus ?? 0))
  }
  const exp = Math.max(0, state.exp + rawDelta)
  // 返回截断后的真实增减，确保显示与实际一致
  const delta = exp - state.exp

  const nextRank = rankForExp(exp)
  let kind: PetEventKind = correct ? 'right' : 'wrong'
  if (nextRank.level > prevRank.level) kind = 'levelup'
  else if (nextRank.level < prevRank.level) kind = 'leveldown'

  state = {
    exp,
    totalRight: state.totalRight + (correct ? 1 : 0),
    totalWrong: state.totalWrong + (correct ? 0 : 1),
    streak,
    wrongStreak,
    lastEvent: { kind, delta, ts: Date.now(), combo },
  }
  saveProgress(state)
  emit()
  return { delta, kind, rank: nextRank, streak, wrongStreak, combo }
}

/** 机器人主动打招呼（点击互动用），不改变经验 */
export function pokePet() {
  ensureHydrated()
  state = { ...state, lastEvent: { kind: 'greet', delta: 0, ts: Date.now() } }
  emit()
}

/** 重置进度（演示/测试用） */
export function resetPet() {
  state = { ...DEFAULT_STATE }
  saveProgress(state)
  emit()
}

// ------------------------------------------------------------
// React hooks
// ------------------------------------------------------------
export function usePetState(): PetState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function usePetRank(): Rank {
  const s = usePetState()
  return rankForExp(s.exp)
}
