export type ChartCandle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type KlineOverlayTone = 'support' | 'resistance' | 'target' | 'risk' | 'neutral'

export type KlineOverlay = {
  id: string
  label: string
  price: number
  tone: KlineOverlayTone
  kind: 'support' | 'resistance' | 'forward' | 'target' | 'stop' | 'invalidation'
  detail?: string
  sourceId?: string
  zoneLow?: number
  zoneHigh?: number
}
