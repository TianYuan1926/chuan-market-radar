import type { UiInformationLayers } from '@/lib/ui-schema-guard'
import { validateUiInformationLayers } from '@/lib/ui-schema-guard'
import { cn } from '@/lib/utils'

const DECISION_TONE: Record<UiInformationLayers['l1']['decision'], string> = {
  TRADE: 'border-up/50 bg-up/15 text-up',
  WAIT: 'border-neon/45 bg-neon/12 text-neon',
  BLOCKED: 'border-down/45 bg-down/12 text-down',
  OBSERVE: 'border-border bg-secondary/40 text-muted-foreground',
}

export function UiInformationLayerBlock({
  className,
  layers,
}: {
  className?: string
  layers: UiInformationLayers
}) {
  const validation = validateUiInformationLayers(layers)

  if (!validation.ok) {
    return (
      <div className={cn('border border-down/45 bg-down/5 p-3 text-xs text-down', className)}>
        信息分层被阻断：{validation.errors.join(' / ')}
      </div>
    )
  }

  const evidenceEntries = Object.entries(layers.l3.evidence)

  return (
    <div className={cn('grid gap-2 border border-border bg-secondary/20 p-3 text-xs', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">L1</span>
        <span className={cn('border px-2 py-0.5 font-mono text-[11px] font-bold', DECISION_TONE[layers.l1.decision])}>
          {layers.l1.decision}
        </span>
      </div>

      <div className="border-t border-border pt-2">
        <div className="text-[10px] font-semibold text-muted-foreground">L2</div>
        <p className="mt-1 leading-relaxed text-foreground">{layers.l2.reason}</p>
      </div>

      <div className="border-t border-border pt-2">
        <div className="text-[10px] font-semibold text-muted-foreground">L3</div>
        <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {evidenceEntries.map(([key, value]) => (
            <div key={key} className="border border-border bg-background/40 px-2 py-1">
              <div className="font-mono text-[10px] text-muted-foreground">{key}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-foreground">
                {value === null ? 'n/a' : String(value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <details className="border-t border-border pt-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">
          L4
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {layers.l4.metrics.map((metric) => (
            <div key={metric.label} className="border border-border bg-background/40 px-2 py-1">
              <div className="text-[10px] text-muted-foreground">{metric.label}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-foreground">
                {metric.value === null ? 'n/a' : String(metric.value)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
