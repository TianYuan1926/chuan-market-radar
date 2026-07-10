import type { SignalType } from './frontend-market-types'

// 计划就绪区展示模型。
// 这里只允许放类型和纯显示 helper；目标池必须由后端 RadarContract
// 经 frontend-display-adapters 转换得到，不能在这里生成 mock 目标。

export type SniperSide = 'long' | 'short'
export type SniperSignal = { label: string; hit: boolean }

export type SniperTarget = {
  id: string
  tokenId: string
  symbol: string
  name: string
  hue: number
  side: SniperSide // 看涨 / 看空
  type: SignalType
  score: number | null // 后端评分；缺失时不得前端合成
  confidence: number | null // 后端未提供证据完整度时必须为空
  odds: number // 盈亏比 R:R
  riskLevel: '低' | '中' | '高' | '极高'
  exchange: string
  market: '现货' | '合约'
  pushPrice: number
  entryLow: number // 建仓区间下沿
  entryHigh: number // 建仓区间上沿
  stop: number // 止损位
  target1: number // 第一目标
  target2: number // 第二目标
  thesis: string // 核心策略逻辑
  signals: SniperSignal[] // 多维证据清单
  bullSentiment: number | null // 后端未提供时必须为空
  volMult: number | null // 后端未提供时必须为空
  // ===== 评判结果（复盘进化引擎据此判定对错） =====
  played: boolean // 策略是否兑现
  outcomePct: number // 实际价格波动 %
  outcomeNote: string // 复盘结论
}

export const sideLabel = (s: SniperSide) => (s === 'long' ? '看涨' : '看空')
