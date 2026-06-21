'use client'

import { useSyncExternalStore } from 'react'

// ============================================================
// 提示音引擎 —— 纯 Web Audio 实时合成，无音频文件。
// 单例：全站共享同一 AudioContext 与开关状态。
// 开关偏好持久化（接入后端时只需替换 load/save 两处）。
// ============================================================

export type SoundName =
  | 'right' // 判断正确
  | 'wrong' // 判断错误
  | 'levelup' // 升段
  | 'leveldown' // 掉段
  | 'combo' // 连对档位
  | 'slump' // 连错档位
  | 'signal' // 新信号通知
  | 'sniper' // 狙击榜新币种锁定
  | 'holdAlert' // 持仓币种异动告警（最高优先级）
  | 'poke' // 宠物互动
  | 'toggle' // 开关切换

const STORAGE_KEY = 'chuanscan_sound_v1'

let enabled = true // 默认开启
let ctx: AudioContext | null = null
let master: GainNode | null = null // 常规音效（川宝对/错、连击等）
let priority: GainNode | null = null // 优先音效（信号通知），不被压低
let hydrated = false

const MASTER_VOL = 0.32
const PRIORITY_VOL = 0.5

const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

// ---- 持久化（接入腾讯云后端时替换以下两处） ----
function loadEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}
function saveEnabled(v: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function ensureHydrated() {
  if (hydrated) return
  hydrated = true
  enabled = loadEnabled()
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as WebAudioWindow).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = MASTER_VOL
    master.connect(ctx.destination)
    // 优先声道：直连输出，音量更高，信号通知专用
    priority = ctx.createGain()
    priority.gain.value = PRIORITY_VOL
    priority.connect(ctx.destination)
  }
  // 浏览器自动暂停策略：用户手势后恢复
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// 单个音符：振荡器 + 包络
function tone(
  c: AudioContext,
  dest: GainNode,
  opts: {
    freq: number
    start: number
    dur: number
    type?: OscillatorType
    peak?: number
    glideTo?: number
  },
) {
  const { freq, start, dur, type = 'triangle', peak = 0.6, glideTo } = opts
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur)
  // 快速起音 + 指数衰减，干净利落
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(dest)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

// 各事件的合成配方
function render(name: SoundName, c: AudioContext, dest: GainNode) {
  const t = c.currentTime
  switch (name) {
    case 'right':
      // 上行双音，明快
      tone(c, dest, { freq: 660, start: t, dur: 0.12, peak: 0.5 })
      tone(c, dest, { freq: 880, start: t + 0.09, dur: 0.16, peak: 0.55 })
      break
    case 'wrong':
      // 低沉下滑，方波带钝感
      tone(c, dest, { freq: 200, start: t, dur: 0.28, type: 'square', peak: 0.4, glideTo: 120 })
      break
    case 'levelup': {
      // 凯旋琶音 C-E-G-高C
      const seq = [523, 659, 784, 1047]
      seq.forEach((f, i) =>
        tone(c, dest, { freq: f, start: t + i * 0.1, dur: 0.26, peak: 0.5, type: 'triangle' }),
      )
      break
    }
    case 'leveldown': {
      // 下行小调，失落
      const seq = [622, 523, 440, 330]
      seq.forEach((f, i) =>
        tone(c, dest, { freq: f, start: t + i * 0.11, dur: 0.26, peak: 0.42, type: 'sawtooth' }),
      )
      break
    }
    case 'combo': {
      // 上行五音闪光，更亢奋
      const seq = [784, 988, 1175, 1397, 1568]
      seq.forEach((f, i) =>
        tone(c, dest, { freq: f, start: t + i * 0.06, dur: 0.14, peak: 0.42, type: 'sine' }),
      )
      break
    }
    case 'slump':
      // 两声低钝，警示
      tone(c, dest, { freq: 160, start: t, dur: 0.2, type: 'square', peak: 0.4 })
      tone(c, dest, { freq: 130, start: t + 0.18, dur: 0.26, type: 'square', peak: 0.42 })
      break
    case 'signal':
      // 三音上行警报，清亮醒目，确保从背景音中穿透
      tone(c, dest, { freq: 1175, start: t, dur: 0.1, peak: 0.55, type: 'sine' })
      tone(c, dest, { freq: 1568, start: t + 0.1, dur: 0.1, peak: 0.6, type: 'sine' })
      tone(c, dest, { freq: 2093, start: t + 0.2, dur: 0.2, peak: 0.62, type: 'sine' })
      break
    case 'sniper': {
      // 狙击锁定音：先三声急促雷达扫描，再一记沉稳锁定确认 —— 独特且有"瞄准命中"质感
      const blips = [988, 1244, 1568]
      blips.forEach((f, i) =>
        tone(c, dest, { freq: f, start: t + i * 0.07, dur: 0.06, peak: 0.42, type: 'square' }),
      )
      // 锁定确认：上滑长音
      tone(c, dest, { freq: 1318, start: t + 0.26, dur: 0.34, peak: 0.6, type: 'triangle', glideTo: 1976 })
      // 低频垫音，增加分量感
      tone(c, dest, { freq: 220, start: t + 0.26, dur: 0.4, peak: 0.3, type: 'sine' })
      break
    }
    case 'holdAlert': {
      // 持仓异动告警：双声急促警笛 + 高频强调，最具紧迫感，提醒用户关注已持仓币种
      tone(c, dest, { freq: 1760, start: t, dur: 0.12, peak: 0.62, type: 'sawtooth', glideTo: 2349 })
      tone(c, dest, { freq: 2349, start: t + 0.14, dur: 0.12, peak: 0.62, type: 'sawtooth', glideTo: 1760 })
      tone(c, dest, { freq: 2093, start: t + 0.3, dur: 0.26, peak: 0.66, type: 'square' })
      tone(c, dest, { freq: 330, start: t, dur: 0.5, peak: 0.3, type: 'sine' })
      break
    }
    case 'poke':
      // 柔和单音，互动感
      tone(c, dest, { freq: 720, start: t, dur: 0.12, peak: 0.34, type: 'sine', glideTo: 920 })
      break
    case 'toggle':
      // 极短点击
      tone(c, dest, { freq: 520, start: t, dur: 0.07, peak: 0.3, type: 'square' })
      break
  }
}

// 信号通知时，短暂压低常规声道，让优先音清晰穿透
function duckMaster(c: AudioContext) {
  if (!master) return
  const now = c.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(master.gain.value, now)
  master.gain.linearRampToValueAtTime(MASTER_VOL * 0.18, now + 0.04) // 迅速压低
  master.gain.linearRampToValueAtTime(MASTER_VOL, now + 0.55) // 0.55s 内恢复
}

export function playSound(name: SoundName) {
  ensureHydrated()
  if (!enabled) return
  const c = ensureCtx()
  if (!c || !master || !priority) return
  try {
    if (name === 'signal' || name === 'sniper' || name === 'holdAlert') {
      // 信号 / 狙击锁定 / 持仓告警：走优先声道，并压低其它音效，确保穿透
      duckMaster(c)
      render(name, c, priority)
    } else {
      render(name, c, master)
    }
  } catch {
    /* 忽略合成异常 */
  }
}

export function isSoundEnabled(): boolean {
  ensureHydrated()
  return enabled
}

export function setSoundEnabled(v: boolean) {
  ensureHydrated()
  enabled = v
  saveEnabled(v)
  if (v) {
    // 开启时给一个轻确认音（同时触发 AudioContext 解锁）
    playSound('toggle')
  }
  emit()
}

export function toggleSound() {
  setSoundEnabled(!isSoundEnabled())
}

// ---- React 绑定 ----
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isSoundEnabled(),
    () => true,
  )
}
