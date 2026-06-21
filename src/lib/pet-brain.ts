// ============================================================
// 宠物机器人「川宝」大脑 —— 语言生成层
//
// 当前：基于本地话术库 + 上下文挑选回复（话唠 + 该严肃时严肃）。
// 未来对接 AI 模型：只需替换 `generateReply` 函数体为对你的
//   AI 接口的调用即可（例如 Vercel AI SDK 或你的腾讯云推理端点），
//   组件层与调用方式（async）均无需改动。
//
//   示例（接入后）：
//   export async function generateReply(ctx: PetBrainContext): Promise<string> {
//     const res = await fetch('https://your-domain/api/pet/chat', {
//       method: 'POST',
//       body: JSON.stringify(ctx),
//     })
//     const data = await res.json()
//     return data.reply
//   }
// ============================================================

export type PetMood = 'idle' | 'right' | 'wrong' | 'levelup' | 'leveldown' | 'greet'

export type PetBrainContext = {
  mood: PetMood
  /** 当前段位名 */
  rankName: string
  /** 升/掉段时解锁或失去的装备名 */
  gearName?: string
  exp: number
  streak: number
  /** 连续答错数 */
  wrongStreak?: number
  /** 命中的连击/连错档位名（如「超神连击」「深度套牢」） */
  combo?: string
  /** 当前所在页面路径，便于未来情境化对话 */
  page?: string
}

// 是否处于"该严肃"的情境：答错、掉段属于需要严肃提醒的时刻
export function isSeriousMood(mood: PetMood): boolean {
  return mood === 'wrong' || mood === 'leveldown'
}

// ------------------------------------------------------------
// 本地话术库
// idle 分两类：chatty（话唠日常）与 serious（严肃风险提醒），
// 平时话痨，但会穿插严肃的纪律/风控提醒。
// ------------------------------------------------------------
const CHATTY: string[] = [
  '盯盘中…有异动我第一个喊你',
  '今天行情有点意思，我盯着呢',
  '无聊啊，要不来复盘进化练两把？',
  '我刚又扫了一圈全市场，干净得很',
  '你今天气色不错，是不是昨晚没爆仓？',
  '摸摸我充个电，我能多扫两千个币',
  '别老盯着 K 线，眼睛会瞎的哦',
  '我跟你说，FOMO 是会上瘾的',
  '咱们慢慢来，复利才是朋友',
  '我又学了几个新形态，回头考考你',
  '喝口水，行情不会跑',
  '点我一下，陪你唠两句',
]

const SERIOUS_IDLE: string[] = [
  '提醒一句：仓位永远别超过你能承受的',
  '认真的，止损线设了吗？',
  '行情越热，越要冷静，这是纪律',
  '高风险信号别追，活下来最重要',
  '杠杆是把双刃剑，握紧风控',
  '记住：保住本金，才有下一把',
]

const LINES: Record<PetMood, string[]> = {
  idle: [], // idle 由 chatty / serious 动态合成，见 below
  right: [
    '判断正确！这波节奏你拿捏住了',
    '漂亮，经验到账～',
    '稳！继续保持这个手感',
    '没错，证据链都对上了',
    '可以啊，越来越有交易员的样子了',
  ],
  wrong: [
    '这次看走眼了，认真复盘一下',
    '错了别急，关键是找到偏在哪',
    '严肃点说：连错才是真危险',
    '深呼吸，下一单更冷静',
    '记下来，同样的错别犯第二次',
  ],
  levelup: [
    '恭喜升段！解锁新装备「{gear}」，越来越像样了',
    '段位提升！「{gear}」已穿戴，实力肉眼可见',
    '升级啦！获得「{gear}」，请继续证明这不是运气',
  ],
  leveldown: [
    '掉段了…「{gear}」暂时收回，我们一起爬回去',
    '退步是为了看清问题，重来',
    '稳住心态，段位还能挣回来',
  ],
  greet: [
    '嗨！我是你的交易搭子「川宝」',
    '今天想练判断，还是看异动？',
    '摸摸头充电完毕，继续战斗',
    '我会自己溜达，也能被你拖到顺手的位置',
  ],
}

// 连对到达档位时的专属狂喜台词
const COMBO_HYPE: string[] = [
  '{combo}！{streak}连了，手感烫到发红！',
  '停不下来了，{combo} {streak}连，封神预定！',
  '{streak}连正确，这就是{combo}的实力！',
  '一气呵成！{combo}达成，经验狂飙！',
]

// 连错到达档位时的严肃告警台词
const SLUMP_WARN: string[] = [
  '{combo}！已经错 {streak} 次了，立刻停手冷静',
  '认真的，{streak}连错是危险信号，先离场复盘',
  '{combo}…手感冰凉，今天别硬刚了',
  '连续失误 {streak} 次，纪律比手感更重要',
]

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function fill(tpl: string, ctx: PetBrainContext): string {
  return tpl
    .replace('{gear}', ctx.gearName ?? '新装备')
    .replace('{combo}', ctx.combo ?? '连击')
    .replace('{streak}', String(ctx.mood === 'wrong' ? (ctx.wrongStreak ?? 0) : ctx.streak))
}

/**
 * 生成一句宠物回复。
 * 现为同步本地实现包装成 Promise；接 AI 后改为真实请求即可。
 */
export async function generateReply(ctx: PetBrainContext): Promise<string> {
  return localReply(ctx)
}

/** 本地话术合成（无 AI 时的回退实现） */
export function localReply(ctx: PetBrainContext): string {
  if (ctx.mood === 'idle') {
    // 话唠：约 30% 概率说严肃的风控提醒，其余为日常闲聊
    const serious = Math.random() < 0.3
    return pick(serious ? SERIOUS_IDLE : CHATTY)
  }
  // 命中连击/连错档位时，优先用专属台词（更有节奏感）
  if (ctx.combo) {
    if (ctx.mood === 'right') return fill(pick(COMBO_HYPE), ctx)
    if (ctx.mood === 'wrong') return fill(pick(SLUMP_WARN), ctx)
  }
  return fill(pick(LINES[ctx.mood] ?? CHATTY), ctx)
}
