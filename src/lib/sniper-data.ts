import { getSignalCards, type SignalType } from './mock-data'

// ============================================================
// 狙击目标模型 —— 复盘进化系统与狙击榜共用的单一数据源
// ------------------------------------------------------------
// 从「候选信号池」中通过 AI 最终筛选（category==='sniper'）的
// 币种，进一步派生出完整的交易策略与逻辑信息：
//   · 明确的多空方向（看涨 / 看空）
//   · 核心策略逻辑（thesis）
//   · 交易计划：建仓区间 / 止损位 / 目标位 / 盈亏比
//   · 多维信号清单（命中情况）
//   · 置信度与风险等级
//   · 评判结果（played）——供复盘进化引擎判定对错、结算经验
// 狙击榜与复盘进化引擎读取的是同一个池、同一套顺序，因此二者
// 天然联动：引擎正在评判的目标即榜单中的某一项。
// ============================================================

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
  confidence: number // 置信度 0-100
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
  signals: SniperSignal[] // 多维信号清单
  bullSentiment: number // 看涨情绪 0-100
  volMult: number // 成交量倍数
  // ===== 评判结果（复盘进化引擎据此判定对错） =====
  played: boolean // 策略是否兑现
  outcomePct: number // 实际价格波动 %
  outcomeNote: string // 复盘结论
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function decimals(ref: number) {
  return ref < 0.01 ? 6 : ref < 1 ? 4 : 2
}
function px(n: number, ref: number) {
  return +n.toFixed(decimals(ref))
}

// 核心策略逻辑文案：按方向 + 信号类型组合
function buildThesis(side: SniperSide, type: SignalType): string {
  if (side === 'long') {
    switch (type) {
      case 'PUMP':
        return '买盘异常涌入推动放量拉升，主力建仓迹象明确，顺势做多博弈主升浪'
      case 'WHALE':
        return '巨鲸大额建仓且筹码持续集中，跟随聪明钱在低位布局多头'
      case 'BREAK':
        return '放量突破关键阻力，日线结构转多，回踩不破支撑即可进场'
      case 'FLOW':
        return '链上净流入持续放大、资金活跃度抬升，趋势性做多机会'
      default:
        return '多维信号共振、结构偏多，逢低分批做多'
    }
  }
  switch (type) {
    case 'LIQ':
      return '多头集中爆仓后多空比急剧逆转，反弹乏力，顺势做空'
    case 'CRASH':
      return '大额转入交易所叠加买盘撤离，抛压释放在即，做空博弈下行'
    case 'WHALE':
      return '巨鲸派发出货、筹码松动，跟随主力做空规避接盘'
    default:
      return '趋势走弱叠加资金净流出，结构偏空，逢高做空'
  }
}

function buildSignals(
  side: SniperSide,
  volMult: number,
  bullSentiment: number,
  anomalyScore: number,
  rng: () => number,
): SniperSignal[] {
  return [
    { label: `成交量异动 ${volMult.toFixed(1)}×`, hit: volMult >= 3 },
    {
      label: side === 'long' ? '主力资金净流入' : '主力资金净流出',
      hit: side === 'long' ? bullSentiment >= 55 : bullSentiment <= 45,
    },
    {
      label: side === 'long' ? '突破关键阻力位' : '跌破关键支撑位',
      hit: rng() > 0.3,
    },
    {
      label: side === 'long' ? '合约多空比偏多' : '合约多空比偏空',
      hit: rng() > 0.38,
    },
    { label: '链上换手率放大', hit: anomalyScore >= 85 },
  ]
}

let cache: SniperTarget[] | null = null

/** 构建狙击目标池（确定性、可缓存，SSR 一致） */
export function getSniperTargets(): SniperTarget[] {
  if (cache) return cache
  const cards = getSignalCards().filter((c) => c.category === 'sniper')

  const targets = cards.map((c) => {
    const t = c.token
    const rng = mulberry32(t.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7) * 131)

    // 方向：
    //   · 空头候选 / 高风险 / 空头趋势 → 看空（做空走弱或过热标的）
    //   · 震荡趋势按 24h 实际涨跌方向判定（走弱即看空）
    //   · 其余（多头趋势 / 多头候选）→ 看涨
    const side: SniperSide =
      c.poolStatus === 'short' || c.poolStatus === 'high_risk' || t.trend === 'bear'
        ? 'short'
        : t.trend === 'shock'
          ? t.change24h < 0
            ? 'short'
            : 'long'
          : 'long'

    const ref = c.pushPrice
    // 建仓区间：当前推送价附近 ±1.5%
    const entryLow = px(ref * 0.985, ref)
    const entryHigh = px(ref * 1.015, ref)
    // 止损：做多在区间下方约 6%，做空在区间上方约 6%
    const stop = side === 'long' ? px(ref * 0.94, ref) : px(ref * 1.06, ref)
    // 目标位：按盈亏比展开
    const move1 = 0.06 + rng() * 0.06 // 6%~12%
    const move2 = move1 + 0.08 + rng() * 0.1 // 再 +8%~18%
    const target1 = side === 'long' ? px(ref * (1 + move1), ref) : px(ref * (1 - move1), ref)
    const target2 = side === 'long' ? px(ref * (1 + move2), ref) : px(ref * (1 - move2), ref)

    // 方向感知狙击评分：看涨看重看涨情绪，看空看重看跌强度（100-看涨情绪），
    // 使强势看空标的也能进入榜单前列，而非被看涨情绪权重埋没。
    const setupScore = Math.round(
      t.anomalyScore * 0.6 + (side === 'long' ? c.bullSentiment : 100 - c.bullSentiment) * 0.4,
    )
    const confidence = Math.min(99, Math.round(setupScore * 0.7 + t.anomalyScore * 0.3))

    // 评判结果：约 68% 策略兑现，其余被止损 / 逻辑证伪
    const played = rng() > 0.32
    const mag = +(5 + rng() * 22).toFixed(1) // 兑现幅度 5%~27%
    const fail = +(2 + rng() * 6).toFixed(1) // 失败回撤 2%~8%
    let outcomePct: number
    let outcomeNote: string
    if (side === 'long') {
      outcomePct = played ? mag : -fail
      outcomeNote = played
        ? '策略兑现，价格如期上行并触及目标位'
        : '信号衰减，价格回落触及止损，多头逻辑未兑现'
    } else {
      outcomePct = played ? -mag : fail
      outcomeNote = played
        ? '策略兑现，抛压释放价格如期下行'
        : '空头逻辑证伪，价格反弹触发止损'
    }

    return {
      id: c.id,
      tokenId: t.id,
      symbol: t.symbol,
      name: t.name,
      hue: t.hue,
      side,
      type: c.type,
      score: setupScore,
      confidence,
      odds: c.odds,
      riskLevel: c.riskLevel,
      exchange: c.exchange,
      market: c.market,
      pushPrice: c.pushPrice,
      entryLow,
      entryHigh,
      stop,
      target1,
      target2,
      thesis: buildThesis(side, c.type),
      signals: buildSignals(side, c.volMult, c.bullSentiment, t.anomalyScore, rng),
      bullSentiment: c.bullSentiment,
      volMult: c.volMult,
      played,
      outcomePct,
      outcomeNote,
    }
  })

  // 按方向感知狙击评分从高到低排序，使多空强势标的都能进入前列
  cache = targets.sort((a, b) => b.score - a.score)
  return cache
}

export const sideLabel = (s: SniperSide) => (s === 'long' ? '看涨' : '看空')
