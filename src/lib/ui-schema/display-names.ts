export const PRODUCT_DISPLAY_NAMES = {
  marketRadar: '市场雷达',
  chuanScan: '川 CHUANSCAN',
  altcoinRadar: '山寨异动雷达',
} as const

export const PAGE_DISPLAY_NAMES = {
  dashboard: '雷达驾驶舱',
  signals: '机会观察池',
  leaderboard: '强弱观察榜',
  market: '全市场扫描',
  tokenDossier: '单币档案',
  review: '复盘中心',
  system: '系统健康中心',
  login: '登录',
} as const

export const MODULE_DISPLAY_NAMES = {
  scanSystem: '全市场发现系统',
  lightScan: '快速轻扫',
  deepScan: '深度确认',
  analysisSystem: '结构分析系统',
  strategySystem: '策略守门系统',
  reviewSystem: '复盘系统',
  evolutionSystem: '复盘进化系统',
  lifecycle: '生命周期追踪',
  outcome: '结果追踪',
  researchOnly: '研究隔离',
  candidatePool: '候选观察池',
  planReadyBoard: '计划就绪区',
  planReviewArea: '计划就绪区',
  evidenceArchive: '证据档案',
  observationDetail: '观察详情',
} as const

export const STATUS_DISPLAY_NAMES = {
  CANDIDATE: '候选观察',
  LIGHT_SCAN_MARK: '快速轻扫',
  DEEP_SCAN_CANDIDATE: '深度确认',
  EVIDENCE_SIGNAL: '证据观察',
  EVIDENCE_OBSERVE: '证据观察',
  WAIT: '等待条件',
  WATCH: '仅观察',
  OBSERVE: '仅观察',
  BLOCKED: '风控阻断',
  INVALIDATED: '结构失效',
  COOLDOWN: '冷却观察',
  REVIEW_ONLY: '仅研究模式',
  TRADE_PLAN_READY: '交易计划就绪',
  TRADE: '交易计划就绪',
} as const

export const DATA_STATUS_DISPLAY_NAMES = {
  served_cache: '缓存快照',
  cached: '缓存快照',
  stale: '数据过期',
  partial: '部分可用',
  degraded: '降级运行',
  failed: '数据失败',
  error: '数据失败',
  rate_limited: '接口限流',
  timeout: '请求超时',
  empty: '暂无数据',
  unknown: '状态未知',
  not_configured: '未配置',
  live: '实时',
  loading: '加载中',
} as const

export const CONTRACT_DISPLAY_NAMES = {
  frontendContract: '前端展示合同',
  backendContract: '后端事实合同',
  radarContract: '雷达事实合同',
  singleSourceOfTruth: '单一事实源',
  stateDictionary: '状态词典',
  uiLayerGuard: '展示层守卫',
  riskGate: '风控闸门',
  businessCapability: '业务能力边界',
} as const

export const USER_VISIBLE_FORBIDDEN_TERMS = [
  '新信号',
  '证据信号',
  '信号详情',
  '高置信信号',
  '交易信号',
  '推荐榜',
  '狙击榜',
  '狙击席',
  '可交易候选',
  '立即入场',
  '直接交易',
  '高胜率信号',
  '强推荐',
] as const

export const USER_VISIBLE_REPLACEMENT_TERMS = {
  新信号: '新候选观察',
  证据信号: '证据观察',
  信号详情: '观察详情',
  高置信信号: '高质量观察',
  交易信号: '交易计划就绪',
  推荐榜: '强弱观察榜',
  狙击榜: '计划就绪区',
  狙击席: '计划就绪区',
  可交易候选: '候选观察',
  立即入场: '等待人工复核',
  直接交易: '人工复核后再决定',
  高胜率信号: '高质量观察样本',
  强推荐: '重点观察',
} as const

export type DisplayMaturityKey = keyof typeof STATUS_DISPLAY_NAMES
export type DataStatusDisplayKey = keyof typeof DATA_STATUS_DISPLAY_NAMES

export function displayMaturityName(status: string | null | undefined): string {
  if (!status) return STATUS_DISPLAY_NAMES.OBSERVE
  return STATUS_DISPLAY_NAMES[status as DisplayMaturityKey] ?? '状态未知'
}

export function displayDataStatusName(status: string | null | undefined): string {
  if (!status) return DATA_STATUS_DISPLAY_NAMES.unknown
  return DATA_STATUS_DISPLAY_NAMES[status as DataStatusDisplayKey] ?? DATA_STATUS_DISPLAY_NAMES.unknown
}

export function forbiddenUserVisibleTerms(text: string): string[] {
  return USER_VISIBLE_FORBIDDEN_TERMS.filter((term) => text.includes(term))
}

export function assertNoForbiddenUserVisibleTerms(text: string): void {
  const matches = forbiddenUserVisibleTerms(text)
  if (matches.length > 0) {
    throw new Error(`user_visible_copy_forbidden:${matches.join(',')}`)
  }
}
