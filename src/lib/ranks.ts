// ============================================================
// 交易员段位系统（8 段）
// 经验值由复盘进化板块的判断训练 / 雷达评判产生：
//   判断正确 → 加经验；判断错误 → 扣经验。
// 经验跨过阈值即升段，跌破即掉段。
// ============================================================

/** 头部装备类型（随段位提升解锁） */
export type Headgear =
  | 'sprout' // 韭菜芽
  | 'cap' // 鸭舌帽
  | 'headset' // 操盘手耳机
  | 'visor' // 护目遮阳帽
  | 'huntcap' // 猎手羽帽
  | 'scope' // 狙击镜
  | 'halo' // 数据光环
  | 'crown' // 王者皇冠

/** 段位徽记（绘制在胸口面板） */
export type Emblem = 'none' | 'bar' | 'chevron' | 'star' | 'star2' | 'diamond' | 'crownMark'

export type Rank = {
  level: number // 1-8
  name: string
  /** 进入该段位所需的最低累计经验 */
  minExp: number
  /** 段位主题色（CSS 变量或色值） */
  color: string
  /** 段位简称/称号气质 */
  tagline: string
  /** 解锁的头部装备 */
  headgear: Headgear
  /** 胸口段位徽记 */
  emblem: Emblem
  /** 是否拥有外发光环（高段位专属） */
  aura: boolean
  /** 装备解锁说明（升段时展示） */
  gearName: string
}

// 从低到高，贴合交易员成长路径
export const RANKS: Rank[] = [
  { level: 1, name: '韭菜新手', minExp: 0, color: 'oklch(0.62 0.02 60)', tagline: '初入市场，凭感觉下单', headgear: 'sprout', emblem: 'none', aura: false, gearName: '韭菜嫩芽' },
  { level: 2, name: '散户玩家', minExp: 200, color: 'oklch(0.7 0.13 200)', tagline: '会看盘了，仍易追涨杀跌', headgear: 'cap', emblem: 'bar', aura: false, gearName: '鸭舌帽' },
  { level: 3, name: '见习操盘手', minExp: 700, color: 'oklch(0.72 0.15 160)', tagline: '开始建立交易纪律', headgear: 'headset', emblem: 'chevron', aura: false, gearName: '操盘手耳机' },
  { level: 4, name: '职业交易员', minExp: 1800, color: 'oklch(0.78 0.16 145)', tagline: '稳定执行，胜率可控', headgear: 'visor', emblem: 'star', aura: false, gearName: '护目遮阳帽' },
  { level: 5, name: '资深猎手', minExp: 4000, color: 'oklch(0.8 0.15 90)', tagline: '善于捕捉异动先机', headgear: 'huntcap', emblem: 'star', aura: true, gearName: '猎手羽帽' },
  { level: 6, name: '狙击手', minExp: 8000, color: 'oklch(0.78 0.17 50)', tagline: '精准出手，一击必中', headgear: 'scope', emblem: 'star2', aura: true, gearName: '狙击瞄准镜' },
  { level: 7, name: '量化大师', minExp: 15000, color: 'oklch(0.7 0.2 25)', tagline: '体系化作战，让数据说话', headgear: 'halo', emblem: 'diamond', aura: true, gearName: '数据光环' },
  { level: 8, name: '传奇交易员', minExp: 28000, color: 'oklch(0.75 0.19 320)', tagline: '市场之巅，知行合一', headgear: 'crown', emblem: 'crownMark', aura: true, gearName: '王者皇冠' },
]

/** 根据累计经验计算当前段位 */
export function rankForExp(exp: number): Rank {
  let cur = RANKS[0]
  for (const r of RANKS) {
    if (exp >= r.minExp) cur = r
    else break
  }
  return cur
}

/** 下一段位（已满级则返回 null） */
export function nextRank(rank: Rank): Rank | null {
  return RANKS.find((r) => r.level === rank.level + 1) ?? null
}

/** 当前段位内的进度（0-1）与距离下一段位所需经验 */
export function rankProgress(exp: number): {
  rank: Rank
  next: Rank | null
  pct: number
  inLevel: number
  span: number
} {
  const rank = rankForExp(exp)
  const next = nextRank(rank)
  if (!next) {
    return { rank, next: null, pct: 1, inLevel: exp - rank.minExp, span: 0 }
  }
  const span = next.minExp - rank.minExp
  const inLevel = exp - rank.minExp
  return { rank, next, pct: Math.min(1, inLevel / span), inLevel, span }
}
