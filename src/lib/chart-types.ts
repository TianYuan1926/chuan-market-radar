export type ChartCandle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type KlineOverlayTone = 'support' | 'resistance' | 'target' | 'risk' | 'neutral'
export type KlineOverlaySemanticRole =
  | 'structure_reference'
  | 'wait_condition'
  | 'blocked_context'
  | 'ready_trade_plan'

export type KlineOverlay = {
  id: string
  label: string
  price: number
  tone: KlineOverlayTone
  kind: 'support' | 'resistance' | 'forward' | 'target' | 'stop' | 'invalidation'
  semanticRole?: KlineOverlaySemanticRole
  allowedUse?: 'visual_reference_only' | 'ready_trade_plan_only'
  sourceDecision?: 'strategy_v3_structure_map' | 'unified_decision_engine'
  detail?: string
  sourceId?: string
  zoneLow?: number
  zoneHigh?: number
}

export function isReadyTradePlanOverlay(overlay: KlineOverlay): boolean {
  return overlay.semanticRole === 'ready_trade_plan' &&
    overlay.allowedUse === 'ready_trade_plan_only' &&
    overlay.sourceDecision === 'unified_decision_engine' &&
    (overlay.kind === 'target' || overlay.kind === 'stop')
}

export function isRenderableKlineOverlay(overlay: KlineOverlay, options: { allowReadyTradePlan?: boolean } = {}): boolean {
  const allowReadyTradePlan = options.allowReadyTradePlan ?? false

  if (!Number.isFinite(overlay.price) || overlay.price <= 0) {
    return false
  }

  if (overlay.kind === 'target' || overlay.kind === 'stop') {
    return allowReadyTradePlan && isReadyTradePlanOverlay(overlay)
  }

  if (overlay.semanticRole === 'ready_trade_plan') {
    return allowReadyTradePlan && isReadyTradePlanOverlay(overlay)
  }

  return true
}

export function filterKlineOverlaysForDisplay(
  overlays: KlineOverlay[] | null | undefined,
  options: { allowReadyTradePlan?: boolean } = {},
): KlineOverlay[] {
  return (overlays ?? []).filter((overlay) => isRenderableKlineOverlay(overlay, options))
}
