'use client'

import { useSyncExternalStore } from 'react'

// ============================================================
// 彩蛋系统 store
//   - 目录（EGGS）：所有可解锁彩蛋的定义
//   - 成就（ACHIEVEMENTS）：按累计解锁数达成的里程碑
//   - 解锁进度持久化（localStorage，接入后端时仅替换 load/save）
//   单一数据源，供全局控制器、收集册、川宝共享。
// ============================================================

// 全屏粒子特效类型
export type EffectKind =
  | 'coins' // 金币雨
  | 'money' // 美元雨
  | 'fireworks' // 烟花
  | 'diamonds' // 钻石（HODL）
  | 'stars' // 星空
  | 'crash' // 暴跌（红色向下）
  | 'hearts' // 爱心（川宝挚友）

export type EggTrigger = 'keyboard' | 'command' | 'time' | 'hotzone' | 'click'
export type EggRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export type EggDef = {
  id: string
  name: string
  flavor: string // 趣味描述（解锁后展示）
  hint: string // 解锁提示（未解锁时展示，含手法暗示）
  rarity: EggRarity
  trigger: EggTrigger
  effect: EffectKind
  line: string // 解锁瞬间川宝台词
}

// ------------------------------------------------------------
// 彩蛋目录
// ------------------------------------------------------------
export const EGGS: EggDef[] = [
  {
    id: 'konami',
    name: '经典秘籍',
    flavor: '上上下下左右左右 BA —— 来自街机时代的古老咒语，被你唤醒。',
    hint: '一段刻在游戏玩家 DNA 里的方向键序列……',
    rarity: 'legendary',
    trigger: 'keyboard',
    effect: 'fireworks',
    line: '哇！你居然知道这个老秘籍！骨灰级玩家实锤了。',
  },
  {
    id: 'moon',
    name: 'To The Moon',
    flavor: '所有人的终极梦想：一飞冲天，直奔月球。',
    hint: '打字打出那个谁都想去的目的地（英文）。',
    rarity: 'rare',
    trigger: 'command',
    effect: 'coins',
    line: '🚀 起飞！下一站，月球！（其实是金币雨啦）',
  },
  {
    id: 'hodl',
    name: '钻石手',
    flavor: '握住，别撒手。穿越牛熊的信仰之握。',
    hint: '输入那个著名的拼错单词——拿住别卖。',
    rarity: 'rare',
    trigger: 'command',
    effect: 'diamonds',
    line: '钻石手认证！这手感，套牢都套出信仰了。',
  },
  {
    id: 'chuan',
    name: '川流不息',
    flavor: '资金如川，奔流不息。你念出了本命之名。',
    hint: '输入本站的名字（拼音）。',
    rarity: 'uncommon',
    trigger: 'command',
    effect: 'money',
    line: '叫我？川流不息，财源滚滚来！',
  },
  {
    id: 'rekt',
    name: '归零的勇士',
    flavor: '每个老玩家都有一段不愿提起的爆仓往事。',
    hint: '输入那个形容"爆仓惨败"的黑话（英文）。',
    rarity: 'common',
    trigger: 'command',
    effect: 'crash',
    line: '别哭，谁还没归零过几次……抗住，会回来的！',
  },
  {
    id: 'night-owl',
    name: '深夜猎手',
    flavor: '凌晨的链上世界，只属于最执着的猎手。',
    hint: '在深夜某个时段还醒着的人，自会遇见。',
    rarity: 'uncommon',
    trigger: 'time',
    effect: 'stars',
    line: '都这个点了还盯盘？真·猎手作息，佩服。',
  },
  {
    id: 'lucky-time',
    name: '幸运时刻',
    flavor: '某些对称又吉利的时刻，藏着小小的奖励。',
    hint: '在某个对称吉利的整点分钟刷新看看（如 08:08）。',
    rarity: 'rare',
    trigger: 'time',
    effect: 'fireworks',
    line: '幸运时刻到！沾沾喜气，今天必赚（不构成投资建议）。',
  },
  {
    id: 'treasure-corner',
    name: '藏宝角',
    flavor: '页面的角落，藏着一个谁也没注意的开关。',
    hint: '屏幕的某个角落，似乎能戳出东西来……',
    rarity: 'uncommon',
    trigger: 'hotzone',
    effect: 'coins',
    line: '被你摸到了！这个犄角旮旯都不放过，可以的。',
  },
  {
    id: 'pet-whisperer',
    name: '川宝挚友',
    flavor: '反复逗弄川宝，它把你当成了最好的朋友。',
    hint: '试着连续、快速地戳很多次川宝。',
    rarity: 'uncommon',
    trigger: 'click',
    effect: 'hearts',
    line: '别戳啦别戳啦——好吧，就你了，挚友！',
  },
]

export const EGG_TOTAL = EGGS.length

export function getEgg(id: string): EggDef | undefined {
  return EGGS.find((e) => e.id === id)
}

export const RARITY_LABEL: Record<EggRarity, string> = {
  common: '普通',
  uncommon: '稀有',
  rare: '史诗',
  legendary: '传说',
}

export const RARITY_COLOR: Record<EggRarity, string> = {
  common: 'var(--muted-foreground)',
  uncommon: 'var(--up)',
  rare: 'var(--neon)',
  legendary: 'oklch(0.8 0.16 300)',
}

// ------------------------------------------------------------
// 成就：按累计解锁数达成
// ------------------------------------------------------------
export type Achievement = {
  id: string
  name: string
  desc: string
  need: number
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: '初遇彩蛋', desc: '解锁你的第 1 个彩蛋', need: 1 },
  { id: 'three', name: '渐入佳境', desc: '累计解锁 3 个彩蛋', need: 3 },
  { id: 'five', name: '寻宝行家', desc: '累计解锁 5 个彩蛋', need: 5 },
  { id: 'all', name: '集邮大师', desc: `解锁全部 ${EGG_TOTAL} 个彩蛋`, need: EGG_TOTAL },
]

// ------------------------------------------------------------
// 持久化层（接入后端时仅替换以下两个函数体）
// ------------------------------------------------------------
const STORAGE_KEY = 'chuanscan_eggs_v1'

type EggState = {
  unlocked: Record<string, number> // id -> 解锁时间戳
  lastUnlock: { id: string; ts: number } | null
}

const DEFAULT_STATE: EggState = { unlocked: {}, lastUnlock: null }

function loadProgress(): EggState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as { unlocked?: Record<string, number> }
    return { unlocked: parsed.unlocked ?? {}, lastUnlock: null }
  } catch {
    return DEFAULT_STATE
  }
}

function saveProgress(s: EggState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: s.unlocked }))
  } catch {
    /* 忽略写入失败 */
  }
}

// ------------------------------------------------------------
// store 实现
// ------------------------------------------------------------
let state: EggState = DEFAULT_STATE
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  state = loadProgress()
  hydrated = true
}

function subscribe(cb: () => void) {
  ensureHydrated()
  cb()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): EggState {
  return state
}
function getServerSnapshot(): EggState {
  return DEFAULT_STATE
}

/**
 * 解锁一个彩蛋。
 * @returns 是否为「首次解锁」（已解锁过则返回 false，不再重复触发特效）
 */
export function unlockEgg(id: string): boolean {
  ensureHydrated()
  if (!getEgg(id)) return false
  if (state.unlocked[id]) {
    // 已解锁：仅刷新 lastUnlock 以便重放特效（同一彩蛋可重复欣赏），但不计新解锁
    state = { ...state, lastUnlock: { id, ts: Date.now() } }
    emit()
    return false
  }
  const unlocked = { ...state.unlocked, [id]: Date.now() }
  state = { unlocked, lastUnlock: { id, ts: Date.now() } }
  saveProgress(state)
  emit()
  return true
}

/** 重置所有彩蛋（测试用） */
export function resetEggs() {
  state = { unlocked: {}, lastUnlock: null }
  saveProgress(state)
  emit()
}

export function isUnlocked(id: string): boolean {
  ensureHydrated()
  return Boolean(state.unlocked[id])
}

// ------------------------------------------------------------
// React hooks
// ------------------------------------------------------------
export function useEggState(): EggState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useEggProgress() {
  const s = useEggState()
  const count = Object.keys(s.unlocked).length
  const unlockedAchievements = ACHIEVEMENTS.filter((a) => count >= a.need)
  return {
    unlocked: s.unlocked,
    lastUnlock: s.lastUnlock,
    count,
    total: EGG_TOTAL,
    achievements: ACHIEVEMENTS,
    unlockedAchievements,
  }
}
