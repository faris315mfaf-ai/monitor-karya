'use client'

/**
 * Monitor Karya — komponen data & daftar, port TSX dari design-system/components/bundle.js.
 * Aturan visual: 11-diagram-dan-data.md (satu sorotan, label langsung, angka selalu tertulis).
 */

import * as React from 'react'
import { useRovingFocus } from './keyboard'
import {
  Avatar, Button, GradStops, Icon, ProgressBar, STATUS, StatusBadge,
  clamp, cx, fmtID, smoothPath, tone, useCtl, useUid,
  type ChartTone, type IconName, type Status, type Tone,
} from './core'

export function Sparkline({
  data,
  height = 36,
  tone: t = 'accent',
  area,
  label,
  className,
}: {
  data: number[]
  height?: number
  tone?: ChartTone
  area?: boolean
  label?: string
  className?: string
}) {
  const H = height
  const W = 200
  const uid = useUid()
  const max = Math.max(...data, 1)
  const min = Math.min(...data, max)
  const range = max - min || 1
  const pts: [number, number][] = data.map((v, i) => [
    data.length < 2 ? W / 2 : (i * W) / (data.length - 1),
    4 + (H - 8) * (1 - (v - min) / range),
  ])
  const line = smoothPath(pts)
  const last = pts[pts.length - 1] || [W, H / 2]
  return (
    <div className={cx('mk-spark', className)} style={{ height: H }} role="img" aria-label={label || 'Tren ' + data.join(', ')}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden>
        <defs>
          <linearGradient id={uid + 'f'} x1={0} y1={0} x2={0} y2={1}>
            <stop offset="0%" style={{ stopColor: tone(t)[1], stopOpacity: 0.28 }} />
            <stop offset="100%" style={{ stopColor: tone(t)[1], stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id={uid + 'l'} x1={0} y1={0} x2={1} y2={0}>
            <GradStops t={t} />
          </linearGradient>
        </defs>
        {area === false ? null : <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${uid}f)`} />}
        <path d={line} fill="none" stroke={`url(#${uid}l)`} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="mk-spark__dot" style={{ top: last[1], background: tone(t)[1] }} />
    </div>
  )
}

export function StatTile({
  label,
  value,
  delta,
  trend = 'flat',
  tone: tn,
  variant = 'default',
  spark,
  sparkTone,
  onClick,
  className,
}: {
  label: string
  value: number | string
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  tone?: Status
  variant?: 'default' | 'surface' | 'gradient'
  spark?: number[]
  sparkTone?: ChartTone
  onClick?: () => void
  className?: string
}) {
  const grad = variant === 'gradient'
  const t = tn || (trend === 'up' ? 'on' : trend === 'down' ? 'late' : 'neutral')
  const body = (
    <>
      <div className="mk-stat__label">{label}</div>
      <div className="mk-stat__value">{fmtID(value)}</div>
      {delta ? (
        <div className={cx('mk-stat__delta', !grad && 'mk-text--' + t)}>
          {trend !== 'flat' ? <Icon name={trend === 'up' ? 'naik' : 'turun'} size={14} strokeWidth={2.2} /> : null}
          <span>{delta}</span>
        </div>
      ) : null}
      {spark && spark.length > 1 ? (
        <div className="mk-stat__spark">
          <Sparkline data={spark} height={34} tone={grad ? 'putih' : sparkTone || 'accent'} label={label + ': tren'} />
        </div>
      ) : null}
    </>
  )
  const cls = cx('mk-stat', grad && 'mk-stat--gradient', variant === 'surface' && 'mk-stat--surface', onClick && 'mk-stat--btn', className)
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function BarChart({
  data,
  selectedIndex,
  defaultSelectedIndex,
  onSelect,
  height = 200,
  unit,
  formatValue,
  label,
  className,
}: {
  data: { label: string; value: number }[]
  selectedIndex?: number
  defaultSelectedIndex?: number
  onSelect?: (index: number) => void
  height?: number
  unit?: string
  formatValue?: (v: number) => string
  /** Nama grafik untuk pembaca layar, mis. "Output per minggu". */
  label?: string
  className?: string
}) {
  const [sel, set] = useCtl(selectedIndex, defaultSelectedIndex ?? data.length - 1, onSelect)
  const keyboard = useRovingFocus(data.length, sel ?? 0)
  const max = Math.max(0, ...data.map((d) => d.value))
  const fmt = formatValue || ((v: number) => String(fmtID(v)))
  const H = height
  return (
    <div className={cx('mk-bars', className)}>
      <div className="mk-chart-scroll"><div className="mk-chart-width" style={{ minWidth: `calc(var(--touch-min) * ${data.length} + var(--space-3) * ${Math.max(0, data.length - 1)})` }}>
      <div className="mk-bars__plot" style={{ height: H }} role="group" aria-label={label || 'Grafik batang'} onKeyDown={keyboard.onKeyDown}>
        {data.map((d, i) => {
          const on = i === sel
          const bh = max ? Math.max(6, Math.round((d.value / max) * (H - 28))) : 6
          return (
            <button
              key={i}
              type="button"
              className={cx('mk-bars__col', on && 'is-on')}
                {...keyboard.item(i)}
              aria-pressed={on}
              aria-label={d.label + ': ' + fmt(d.value) + (unit ? ' ' + unit : '')}
              onClick={() => set(i)}
            >
              <span className="mk-bars__val" aria-hidden>
                {fmt(d.value)}
              </span>
              <span className="mk-bars__bar" style={{ height: bh }} />
            </button>
          )
        })}
      </div>
      <div className="mk-bars__axis" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className={cx('mk-bars__label', i === sel && 'is-on')}>
            {d.label}
          </span>
        ))}
      </div>
      </div></div>
    </div>
  )
}

export function AreaChart({
  data,
  compare,
  compareLabel,
  seriesLabel,
  height = 220,
  tone: t = 'accent',
  unit,
  zero,
  selectedIndex,
  defaultSelectedIndex,
  onSelect,
  formatValue,
  className,
}: {
  data: { label: string; value: number }[]
  compare?: number[]
  compareLabel?: string
  seriesLabel?: string
  height?: number
  tone?: ChartTone
  unit?: string
  zero?: boolean
  selectedIndex?: number
  defaultSelectedIndex?: number
  onSelect?: (index: number) => void
  formatValue?: (v: number) => string
  className?: string
}) {
  const n = data.length
  const H = height
  const W = 1000
  const padT = 34
  const padB = 6
  const uid = useUid()
  const [selRaw, set] = useCtl(selectedIndex, defaultSelectedIndex ?? n - 1, onSelect)
  const fmt = formatValue || ((v: number) => String(fmtID(v)))
  const vals = data.map((d) => d.value).concat(compare ?? [])
  const max = Math.max(...vals, 1)
  const min = zero === false ? Math.min(...vals, max) * 0.9 : 0
  const x = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1))
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min || 1))
  const pts: [number, number][] = data.map((d, i) => [x(i), y(d.value)])
  const cmp: [number, number][] | null = compare ? compare.map((v, i) => [x(i), y(v)]) : null
  const line = smoothPath(pts)
  const sel = clamp(selRaw ?? n - 1, 0, Math.max(0, n - 1))
  const keyboard = useRovingFocus(n, sel)
  const sp = pts[sel] || [W / 2, H / 2]
  const left = n <= 1 ? 50 : (sel / (n - 1)) * 100
  return (
    <div className={cx('mk-area', className)}>
      <div className="mk-chart-scroll"><div className="mk-chart-width" style={{ minWidth: `calc(var(--touch-min) * ${n})` }}>
      <div className="mk-area__plot" style={{ height: H }}>
        <svg className="mk-area__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden>
          <defs>
            <linearGradient id={uid + 'f'} x1={0} y1={0} x2={0} y2={1}>
              <stop offset="0%" style={{ stopColor: tone(t)[1], stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: tone(t)[1], stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={uid + 'l'} x1={0} y1={0} x2={1} y2={0}>
              <GradStops t={t} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => {
            const yy = padT + (H - padT - padB) * f
            return <line key={f} x1={0} x2={W} y1={yy} y2={yy} className="mk-area__grid" vectorEffect="non-scaling-stroke" />
          })}
          {cmp ? <path d={smoothPath(cmp)} fill="none" className="mk-area__cmp" strokeWidth={2} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" /> : null}
          {n ? <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${uid}f)`} /> : null}
          <path d={line} fill="none" stroke={`url(#${uid}l)`} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="mk-area__rule" style={{ left: left + '%', top: sp[1] }} />
        <span className="mk-area__dot" style={{ left: left + '%', top: sp[1], background: tone(t)[1] }} />
        {n ? (
          <span className="mk-area__tip" aria-hidden style={{ left: `clamp(44px, ${left}%, calc(100% - 44px))`, top: Math.max(0, sp[1] - 46) }}>
            {fmt(data[sel].value) + (unit ? ' ' + unit : '')}
          </span>
        ) : null}
        <div className="mk-area__hits" role="group" aria-label={seriesLabel || 'Grafik tren'} onKeyDown={keyboard.onKeyDown}>
          {data.map((d, i) => {
            const u = unit ? ' ' + unit : ''
            const c = compare && compare[i] !== undefined ? `, ${compareLabel || 'pembanding'} ${fmt(compare[i])}${u}` : ''
            return (
              <button
                key={i}
                type="button"
                className="mk-area__hit"
                {...keyboard.item(i)}
                aria-pressed={i === sel}
                aria-label={d.label + ': ' + fmt(d.value) + u + c}
                onClick={() => set(i)}
              />
            )
          })}
        </div>
      </div>
      <div className="mk-area__axis" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className={cx('mk-area__label', i === sel && 'is-on')}>
            {d.label}
          </span>
        ))}
      </div>
      </div></div>
      {compare && compareLabel ? (
        <div className="mk-area__legend">
          <span>
            <i style={{ background: tone(t)[1] }} />
            {seriesLabel || 'Periode ini'}
          </span>
          <span>
            <i className="is-dash" />
            {compareLabel}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function DonutChart({
  data,
  size = 180,
  thickness,
  gap: gapProp,
  centerLabel,
  centerSub,
  label,
  showLegend,
  layout,
  selectedIndex,
  onSelect,
  formatValue,
  className,
}: {
  data: { label: string; value: number; tone?: ChartTone }[]
  size?: number
  thickness?: number
  gap?: number
  centerLabel?: React.ReactNode
  centerSub?: string
  label?: string
  showLegend?: boolean
  layout?: 'row' | 'stack'
  selectedIndex?: number | null
  onSelect?: (index: number | null) => void
  formatValue?: (v: number) => string
  className?: string
}) {
  const th = thickness || Math.round(size / 8)
  const r = (size - th) / 2
  const c = 2 * Math.PI * r
  const half = size / 2
  const total = data.reduce((a, s) => a + s.value, 0) || 1
  const gap = data.filter((d) => d.value > 0).length > 1 ? (gapProp ?? 4) : 0
  const [sel, set] = useCtl<number | null>(selectedIndex, null, onSelect)
  const keyboard = useRovingFocus(data.length, sel ?? 0)
  const uid = useUid()
  const fmt = formatValue || ((v: number) => String(fmtID(v)))
  const offsets = data.reduce<number[]>((acc, s, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (c * data[i - 1].value) / total)
    return acc
  }, [])
  const cur = sel !== null && sel !== undefined ? data[sel] : null
  return (
    <div className={cx('mk-donut', layout === 'stack' && 'mk-donut--stack', className)}>
      <div
        className="mk-donut__art"
        style={{ width: size, height: size }}
        role="img"
        aria-label={(label || 'Komposisi') + ': ' + data.map((s) => s.label + ' ' + fmt(s.value)).join(', ')}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <defs>
            {data.map((s, i) => (
              <linearGradient key={i} id={uid + 'd' + i} x1={0} y1={0} x2={1} y2={1}>
                <GradStops t={s.tone} />
              </linearGradient>
            ))}
          </defs>
          <circle cx={half} cy={half} r={r} fill="none" strokeWidth={th} style={{ stroke: 'var(--fill-1)' }} />
          {data.map((s, i) => {
            const len = (c * s.value) / total
            if (s.value <= 0) return null
            const vis = Math.max(0.5, len - gap)
            return (
              <circle
                key={i}
                cx={half}
                cy={half}
                r={r}
                fill="none"
                strokeWidth={sel === i ? th + 6 : th}
                stroke={`url(#${uid}d${i})`}
                strokeDasharray={`${vis} ${c - vis}`}
                strokeDashoffset={-offsets[i]}
                transform={`rotate(-90 ${half} ${half})`}
                className={cx('mk-donut__seg', sel !== null && sel !== undefined && sel !== i && 'is-dim')}
                onClick={() => set(sel === i ? null : i)}
              />
            )
          })}
        </svg>
        <div className="mk-donut__center" aria-hidden>
          <span className="mk-donut__value" style={{ fontSize: Math.round(size * 0.2) }}>
            {cur ? fmt(cur.value) : centerLabel !== undefined ? centerLabel : fmt(total)}
          </span>
          <span className="mk-donut__sub">{cur ? cur.label : centerSub || 'total'}</span>
        </div>
      </div>
      {showLegend === false ? null : (
        <div className="mk-donut__legend" role="group" aria-label={label || 'Komposisi'} onKeyDown={keyboard.onKeyDown}>
          {data.map((s, i) => {
            const tc = tone(s.tone)
            return (
              <button
                key={i}
                type="button"
                aria-pressed={sel === i}
                aria-label={`${s.label}: ${fmt(s.value)}, ${Math.round((s.value / total) * 100)}%`}
                className={cx('mk-donut__item', sel === i && 'is-on')}
                {...keyboard.item(i)}
                onClick={() => set(sel === i ? null : i)}
              >
                <span className="mk-donut__swatch" aria-hidden style={{ background: `linear-gradient(135deg, ${tc[0]}, ${tc[1]})` }} />
                <span className="mk-donut__label">{s.label}</span>
                <span className="mk-donut__num">{fmt(s.value)}</span>
                <span className="mk-donut__pct">{Math.round((s.value / total) * 100)}%</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ActivityRings({
  rings,
  size = 180,
  thickness,
  gap: gapProp,
  center,
  showLegend,
  layout,
  className,
}: {
  rings: { label: string; value: number; tone?: ChartTone; display?: string; sub?: string }[]
  size?: number
  thickness?: number
  gap?: number
  center?: React.ReactNode
  showLegend?: boolean
  layout?: 'row' | 'stack'
  className?: string
}) {
  const th = thickness || Math.round(size / 9.5)
  const gap = gapProp !== undefined ? gapProp : Math.max(2, Math.round(th * 0.18))
  const half = size / 2
  const uid = useUid()
  return (
    <div className={cx('mk-rings', layout === 'stack' && 'mk-rings--stack', className)}>
      <div
        className="mk-rings__art"
        style={{ width: size, height: size }}
        role="img"
        aria-label={rings.map((rg) => rg.label + ' ' + (rg.display || Math.round(rg.value) + '%') + (rg.sub ? ' ' + rg.sub : '')).join(', ')}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <defs>
            {rings.map((rg, i) => (
              <linearGradient key={i} id={uid + 'r' + i} x1={0} y1={0} x2={1} y2={1}>
                <GradStops t={rg.tone} />
              </linearGradient>
            ))}
          </defs>
          {rings.map((rg, i) => {
            const r = half - th / 2 - i * (th + gap)
            if (r <= th / 2) return null
            const c = 2 * Math.PI * r
            const v = clamp(rg.value || 0, 0, 100)
            return (
              <g key={i}>
                <circle cx={half} cy={half} r={r} fill="none" strokeWidth={th} style={{ stroke: tone(rg.tone)[1], opacity: 0.18 }} />
                <circle
                  className="mk-rings__fill"
                  cx={half}
                  cy={half}
                  r={r}
                  fill="none"
                  strokeWidth={th}
                  strokeLinecap="round"
                  stroke={`url(#${uid}r${i})`}
                  strokeDasharray={`${(c * v) / 100} ${c}`}
                  transform={`rotate(-90 ${half} ${half})`}
                />
              </g>
            )
          })}
        </svg>
        {center ? (
          <div className="mk-rings__center" aria-hidden>
            {center}
          </div>
        ) : null}
      </div>
      {showLegend === false ? null : (
        <div className="mk-rings__legend">
          {rings.map((rg, i) => {
            const c = tone(rg.tone)
            return (
              <div key={i} className="mk-rings__item">
                <span className="mk-rings__swatch" aria-hidden style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} />
                <span className="mk-rings__text">
                  <span className="mk-rings__label">{rg.label}</span>
                  <span className="mk-rings__val" style={{ color: c[2] }}>
                    {rg.display || Math.round(rg.value) + '%'}
                  </span>
                  {rg.sub ? <span className="mk-rings__sub">{rg.sub}</span> : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Heatmap({
  data,
  rowLabels = [],
  colLabels = [],
  max = 4,
  cell = 18,
  tone: t = 'accent',
  label,
  lowLabel,
  highLabel,
  showLegend,
  formatCell,
  className,
}: {
  data: (number | null)[][]
  rowLabels?: string[]
  colLabels?: string[]
  max?: number
  cell?: number
  tone?: ChartTone
  label?: string
  lowLabel?: string
  highLabel?: string
  showLegend?: boolean
  formatCell?: (v: number) => string
  className?: string
}) {
  const cols = data[0] ? data[0].length : 0
  const tc = tone(t)
  const fmt = formatCell || ((v: number) => String(v))
  const mix = (pct: number) => (pct === 0 ? 'var(--fill-1)' : `color-mix(in srgb, ${tc[1]} ${18 + Math.round(pct * 0.82)}%, var(--fill-1))`)
  const cellText = (v: number | null | undefined) => (v === null || v === undefined ? 'libur' : fmt(v))
  return (
    <div className={cx('mk-heat', className)}>
      {/* Angka tertulis untuk pembaca layar; kisi visual di bawahnya disembunyikan dari pohon aksesibilitas. */}
      <div className="mk-sr">
        <table>
          <caption>{label || 'Peta panas'}</caption>
          <thead>
            <tr>
              <td />
              {Array.from({ length: cols }).map((_, j) => (
                <th key={j} scope="col">
                  {colLabels[j] || String(j + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <th scope="row">{rowLabels[i] || String(i + 1)}</th>
                {row.map((v, j) => (
                  <td key={j}>{cellText(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mk-heat__scroll"
        role="region"
        aria-label={`${label || 'Peta panas'} · geser untuk melihat semua kolom`}
        tabIndex={0}
      >
        <div
          className="mk-heat__grid"
          aria-hidden
          style={{ gridTemplateColumns: `max-content repeat(${cols}, ${cell}px)`, gridTemplateRows: 'auto', gridAutoRows: `minmax(${cell}px, auto)` }}
        >
          <span />
          {Array.from({ length: cols }).map((_, j) => (
            <span key={'c' + j} className="mk-heat__col">
              {colLabels[j] || ''}
            </span>
          ))}
          {data.map((row, i) => (
            <React.Fragment key={i}>
              <span className="mk-heat__row">{rowLabels[i] || ''}</span>
              {row.map((v, j) => {
                const pct = v === null || v === undefined ? -1 : Math.round(clamp(v / max, 0, 1) * 100)
                return (
                  <span
                    key={i + '-' + j}
                    className={cx('mk-heat__cell', pct < 0 && 'is-empty')}
                    title={[rowLabels[i], colLabels[j]].filter(Boolean).join(' ') + ': ' + cellText(v)}
                    style={pct < 0 ? undefined : { background: mix(pct) }}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {showLegend === false ? null : (
        <div className="mk-heat__legend" aria-hidden>
          <span>{lowLabel || 'Sedikit'}</span>
          {[0, 25, 50, 75, 100].map((k) => (
            <i key={k} style={{ background: mix(k) }} />
          ))}
          <span>{highLabel || 'Banyak'}</span>
        </div>
      )}
    </div>
  )
}

export function Timeline({
  rows,
  span = 30,
  ticks = [],
  today,
  todayLabel,
  title,
  selectedId,
  onSelect,
  className,
}: {
  rows: { id: string; label: string; sub?: string; start: number; end: number; progress?: number; status?: Status; milestone?: number; range?: string }[]
  span: number
  ticks?: { label: string; at: number }[]
  today?: number
  todayLabel?: string
  title?: string
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  className?: string
}) {
  const [sel, set] = useCtl<string | null>(selectedId, null, onSelect)
  const keyboard = useRovingFocus(rows.length, Math.max(0, rows.findIndex((row) => row.id === sel)))
  const pct = (v: number) => clamp((v / span) * 100, 0, 100)
  return (
    <div className={cx('mk-tl', className)}>
      <div className="mk-tl__head" aria-hidden>
        <span className="mk-tl__corner">{title || ''}</span>
        <div className="mk-tl__scale">
          {ticks.map((tk, i) => (
            <span key={i} className="mk-tl__tick" style={{ left: pct(tk.at) + '%' }}>
              {tk.label}
            </span>
          ))}
          {today !== undefined ? (
            <span className="mk-tl__todaylabel" style={{ left: pct(today) + '%' }}>
              {todayLabel || 'Hari ini'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mk-tl__body" role="group" aria-label={title || 'Linimasa'} onKeyDown={keyboard.onKeyDown}>
        {rows.map((rw, i) => {
          const st = rw.status || 'on'
          const tc = tone(st)
          const on = sel === rw.id
          return (
            <button
              key={rw.id}
              type="button"
              className={cx('mk-tl__row', on && 'is-on')}
              {...keyboard.item(i)}
              aria-pressed={on}
              aria-label={[rw.label, rw.sub, rw.range, `progres ${rw.progress || 0}%`, STATUS[st]?.label].filter(Boolean).join(', ')}
              onClick={() => set(on ? null : rw.id)}
            >
              <span className="mk-tl__label">
                <span className="mk-tl__name">{rw.label}</span>
                {rw.sub ? <span className="mk-tl__sub">{rw.sub}</span> : null}
              </span>
              <span className="mk-tl__track">
                {ticks.map((tk, i) => (
                  <i key={i} className="mk-tl__grid" style={{ left: pct(tk.at) + '%' }} />
                ))}
                <span className={cx('mk-tl__bar', 'mk-soft--' + st)} style={{ left: pct(rw.start) + '%', width: Math.max(2, pct(rw.end) - pct(rw.start)) + '%' }}>
                  <span className="mk-tl__fill" style={{ width: clamp(rw.progress || 0, 0, 100) + '%', background: `linear-gradient(90deg, ${tc[0]}, ${tc[1]})` }} />
                  <span className="mk-tl__pct">{(rw.progress || 0) + '%'}</span>
                </span>
                {rw.milestone !== undefined ? <span className="mk-tl__ms" style={{ left: pct(rw.milestone) + '%', background: tc[1] }} /> : null}
              </span>
            </button>
          )
        })}
        {today !== undefined ? (
          <span className="mk-tl__today" style={{ left: `calc(var(--tl-label) + (100% - var(--tl-label)) * ${pct(today) / 100})` }} />
        ) : null}
      </div>
    </div>
  )
}

const FLOW: Record<string, { icon: IconName; label: string }> = {
  done: { icon: 'selesai', label: 'Selesai' },
  current: { icon: 'waktu', label: 'Sedang berjalan' },
  todo: { icon: 'titik', label: 'Berikutnya' },
  blocked: { icon: 'peringatan', label: 'Tertahan' },
}
export type FlowStep = { title: string; sub?: string; status?: 'done' | 'current' | 'todo' | 'blocked'; icon?: IconName; meta?: string }
export function FlowDiagram({
  steps,
  orientation,
  label,
  className,
}: {
  steps: FlowStep[]
  orientation?: 'horizontal' | 'vertical'
  label?: string
  className?: string
}) {
  return (
    <ol className={cx('mk-flow', orientation === 'vertical' && 'mk-flow--v', className)} aria-label={label || 'Alur'}>
      {steps.map((st, i) => {
        const k = st.status && FLOW[st.status] ? st.status : 'todo'
        const next = steps[i + 1]
        return (
          <li key={i} className={cx('mk-flow__step', 'is-' + k)}>
            <span className="mk-flow__node">
              <Icon name={st.icon || FLOW[k].icon} size={20} strokeWidth={2.1} />
            </span>
            {next ? <span className={cx('mk-flow__line', k === 'done' && 'is-done')} aria-hidden /> : null}
            <span className="mk-flow__text">
              <span className="mk-flow__title">{st.title}</span>
              {st.sub ? <span className="mk-flow__sub">{st.sub}</span> : null}
              <span className="mk-flow__state">{st.meta || FLOW[k].label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function DivisionBar({
  name,
  value,
  tone: t = 'data-1',
  target,
  meta,
  className,
}: {
  name: string
  value: number
  tone?: ChartTone
  target?: number
  meta?: React.ReactNode
  className?: string
}) {
  // Nilai di atas 100% (mis. beban 112%) tidak dipotong [F1-D]: batang penuh
  // berwarna late, angka sebenarnya di label, dan penanda "lebih" ikon + kata.
  const raw = Math.max(0, Math.round(value || 0))
  const over = raw > 100
  const v = clamp(raw, 0, 100)
  const tc = tone(over ? 'late' : t)
  return (
    <div className={cx('mk-divbar', over && 'is-over', className)}>
      <div className="mk-divbar__top">
        <span className="mk-divbar__name">
          <span className={cx('mk-dot')} style={{ background: tc[1] }} aria-hidden />
          {name}
        </span>
        <span className="mk-divbar__val">
          {over ? (
            <span className="mk-divbar__over">
              <Icon name="peringatan" size={14} />
              Lebih {raw - 100}%
            </span>
          ) : null}
          {raw}%
        </span>
      </div>
      <div
        className="mk-divbar__track"
        role="progressbar"
        aria-valuenow={raw}
        aria-valuemin={0}
        aria-valuemax={Math.max(100, raw)}
        aria-valuetext={over ? `${raw}%, lebih ${raw - 100}% dari batas` : `${raw}%`}
        aria-label={`${name}${target ? ', target ' + target + '%' : ''}`}
      >
        <div className="mk-divbar__fill" style={{ width: v + '%', background: `linear-gradient(90deg, ${tc[0]}, ${tc[1]})` }} />
        {over ? <span className="mk-divbar__overmark" aria-hidden /> : null}
        {target ? <span className="mk-divbar__target" style={{ left: target + '%' }} /> : null}
      </div>
      {meta ? <div className="mk-divbar__meta">{meta}</div> : null}
    </div>
  )
}

/* ---------- Daftar ---------- */
export function AttentionItem({
  title,
  reason,
  status = 'risk',
  meta,
  onClick,
  className,
}: {
  title: string
  reason?: string
  status?: Status
  meta?: string
  onClick?: () => void
  className?: string
}) {
  const st: Status = STATUS[status] ? status : 'risk'
  const m = STATUS[st]
  return (
    <button type="button" className={cx('mk-attn', className)} onClick={onClick}>
      <span className={cx('mk-attn__icon', 'mk-soft--' + st)} aria-hidden>
        <Icon name={m.icon} size={18} strokeWidth={2.2} />
      </span>
      <span className="mk-attn__body">
        <span className="mk-attn__title">{title}</span>
        {reason ? <span className="mk-attn__reason">{reason}</span> : null}
        <span className={cx('mk-attn__meta', 'mk-text--' + st)}>{m.label + (meta ? ' · ' + meta : '')}</span>
      </span>
      <Icon name="kanan" size={18} className="mk-attn__chev" />
    </button>
  )
}

export function ProjectRow({
  name,
  division,
  divisionTone = 'data-1',
  pic,
  initials,
  progress,
  due,
  status,
  statusLabel,
  selected,
  compact,
  onClick,
  className,
}: {
  name: string
  division: string
  divisionTone?: Tone
  pic: string
  initials: string
  progress: number
  due: string
  status: Status
  statusLabel?: string
  selected?: boolean
  compact?: boolean
  onClick?: () => void
  className?: string
}) {
  const st: Status = STATUS[status] ? status : 'on'
  return (
    <button
      type="button"
      className={cx('mk-prow', compact && 'mk-prow--compact', selected && 'is-on', className)}
      onClick={onClick}
      aria-label={'Buka detail ' + name}
    >
      <span className="mk-prow__name">
        <span className="mk-prow__title">{name}</span>
        <span className="mk-prow__div">
          <span className={cx('mk-dot', 'mk-tone--' + divisionTone)} />
          {division}
          {compact ? <span>{' · ' + due}</span> : null}
        </span>
      </span>
      <span className="mk-prow__pic">
        <Avatar initials={initials} tone={divisionTone} size={28} />
        <span className="mk-prow__picname">{pic}</span>
      </span>
      <span className="mk-prow__prog">
        <ProgressBar value={progress} status={st} label={'Progres ' + name} />
      </span>
      <span className={cx('mk-prow__due', st === 'late' && 'mk-text--late')}>{due}</span>
      <span className="mk-prow__status">
        <StatusBadge status={st} size="sm">
          {statusLabel}
        </StatusBadge>
      </span>
    </button>
  )
}

export function ApprovalItem({
  title,
  requester,
  initials,
  tone: t,
  time,
  amount,
  state,
  onStateChange,
  onApprove,
  onReject,
  size = 'sm',
  approveLabel,
  rejectLabel,
  approvedLabel,
  rejectedLabel,
  busy,
  approveVariant = 'primary',
  className,
}: {
  title: string
  requester: string
  initials: string
  tone?: Tone
  time: string
  amount?: string
  state?: 'pending' | 'approved' | 'rejected'
  onStateChange?: (s: 'approved' | 'rejected') => void
  onApprove?: () => void
  onReject?: () => void
  size?: 'sm' | 'md'
  approveLabel?: string
  rejectLabel?: string
  approvedLabel?: string
  rejectedLabel?: string
  busy?: boolean
  /** [F4-B] 'secondary' untuk kartu antrean berisi banyak baris: maks. satu tombol primer per kartu. */
  approveVariant?: 'primary' | 'secondary'
  className?: string
}) {
  const [cur, set] = useCtl<'pending' | 'approved' | 'rejected'>(state, 'pending', onStateChange as (s: 'pending' | 'approved' | 'rejected') => void)
  const done = cur !== 'pending'
  return (
    <div className={cx('mk-appr', done && 'is-done', className)}>
      <Avatar initials={initials} tone={t} size={36} name={requester} />
      <div className="mk-appr__body">
        <div className="mk-appr__title">{title}</div>
        <div className="mk-appr__meta">{requester + ' · ' + time + (amount ? ' · ' + amount : '')}</div>
      </div>
      {done ? (
        <StatusBadge status={cur === 'approved' ? 'done' : 'late'} size="sm">
          {cur === 'approved' ? approvedLabel || 'Disetujui' : rejectedLabel || 'Ditolak'}
        </StatusBadge>
      ) : (
        <div className="mk-appr__actions">
          {onReject || !onApprove ? (
            <Button
              size={size}
              variant="secondary"
              disabled={busy}
              aria-label={(rejectLabel || 'Tolak') + ': ' + title}
              onClick={() => {
                if (!onReject) set('rejected')
                onReject?.()
              }}
            >
              {rejectLabel || 'Tolak'}
            </Button>
          ) : null}
          <Button
            size={size}
            variant={approveVariant}
            disabled={busy}
            aria-label={(approveLabel || 'Setujui') + ': ' + title}
            onClick={() => {
              if (!onApprove) set('approved')
              onApprove?.()
            }}
          >
            {approveLabel || 'Setujui'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ActivityItem({
  who,
  initials,
  tone: t,
  action,
  time,
  last,
  className,
}: {
  who: string
  initials: string
  tone?: Tone
  action: React.ReactNode
  time: string
  last?: boolean
  className?: string
}) {
  return (
    <div className={cx('mk-act', last && 'is-last', className)}>
      <div className="mk-act__rail">
        <Avatar initials={initials} tone={t} size={32} />
      </div>
      <div className="mk-act__body">
        <div className="mk-act__text">
          <strong>{who}</strong> {action}
        </div>
        <div className="mk-act__time">{time}</div>
      </div>
    </div>
  )
}
