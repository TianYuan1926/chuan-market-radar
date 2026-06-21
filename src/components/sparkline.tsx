type Props = {
  data: number[]
  up: boolean
  width?: number
  height?: number
}

export function Sparkline({ data, up, width = 96, height = 32 }: Props) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const pts = data.map((d, i) => {
    const x = i * step
    const y = height - ((d - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const color = up ? 'var(--up)' : 'var(--down)'
  const id = `sl-${up ? 'u' : 'd'}-${data[0]}`
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${height} ${pts.join(' ')} ${width},${height}`}
        fill={`url(#${id})`}
      />
    </svg>
  )
}
