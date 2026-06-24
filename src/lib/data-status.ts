// ============================================================
// 数据状态契约层（前端壳子 ←→ 后端真实数据 的统一约定）
// ------------------------------------------------------------
// 每个真实数据板块都必须携带一个 DataStatus，前端据此渲染
// loading / error / empty / stale / partial / cached / live / failed。
// 后端接入时：读取真实后端合同，返回同样的 Resource<T> 形状即可。
// ============================================================

export type DataStatus =
  | 'loading' // 正在拉取
  | 'live' // 实时数据，最新
  | 'cached' // 来自缓存，可能非最新
  | 'stale' // 数据过期，超过新鲜度阈值
  | 'partial' // 部分数据源缺失，结果不完整
  | 'empty' // 查询成功但无数据
  | 'error' // 请求出错（前端可重试）
  | 'failed' // 后端任务/数据源失败

// 统一的资源包装：所有需要接后端的板块都用它承载
export type Resource<T> = {
  status: DataStatus
  data: T
  // 数据生成/写库时间（ISO 或后端时间戳），用于展示「更新于」
  updatedAt?: string
  // 数据年龄（秒），由后端或前端计算，用于 stale 判断
  ageSec?: number
  // 数据来源标识，如 'coinglass' | 'binance' | 'cache'
  source?: string
  // 失败/部分时的可读原因
  reason?: string
}

export const DATA_STATUS_META: Record<
  DataStatus,
  { label: string; tone: 'live' | 'neon' | 'warn' | 'down' | 'muted'; pulse?: boolean }
> = {
  loading: { label: '加载中', tone: 'muted', pulse: true },
  live: { label: '实时', tone: 'live', pulse: true },
  cached: { label: '缓存', tone: 'neon' },
  stale: { label: '已过期', tone: 'warn' },
  partial: { label: '部分缺失', tone: 'warn' },
  empty: { label: '暂无数据', tone: 'muted' },
  error: { label: '加载失败', tone: 'down' },
  failed: { label: '数据源失败', tone: 'down' },
}

// 便捷构造器：统一包装真实、缓存、partial、empty 和 failed 数据。
export function resource<T>(
  data: T,
  status: DataStatus = 'live',
  extra?: Omit<Resource<T>, 'status' | 'data'>,
): Resource<T> {
  return { status, data, ...extra }
}

// 是否为「可信新鲜」状态（live / cached 视为可用）
export function isFresh(status: DataStatus): boolean {
  return status === 'live' || status === 'cached'
}

// 是否为「需要提示用户」的降级状态
export function isDegraded(status: DataStatus): boolean {
  return status === 'stale' || status === 'partial' || status === 'cached'
}

// 是否为「无法展示数据」的状态
export function isBlocked(status: DataStatus): boolean {
  return status === 'loading' || status === 'empty' || status === 'error' || status === 'failed'
}
