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
  score: number // 综合评分 0-100
  confidence: number // 证据完整度 0-100
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
  bullSentiment: number // 看涨情绪 0-100
  volMult: number // 成交量倍数
  // ===== 评判结果（复盘进化引擎据此判定对错） =====
  played: boolean // 策略是否兑现
  outcomePct: number // 实际价格波动 %
  outcomeNote: string // 复盘结论
}

export const sideLabel = (s: SniperSide) => (s === 'long' ? '看涨' : '看空')
