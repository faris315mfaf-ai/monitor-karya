'use client'

/**
 * Monitor Karya — komponen dasar, port TSX dari design-system/components/bundle.js.
 * Nama, props, kelas mk-… dan perilaku sama dengan index.d.ts; gaya ada di bundle.css.
 */

import * as React from 'react'

export type Status = 'on' | 'risk' | 'late' | 'done' | 'info' | 'neutral'
export type Tone = 'accent' | 'data-1' | 'data-2' | 'data-3' | 'data-4' | 'data-5' | 'data-6'
export type ChartTone =
  | Tone
  | Status
  | 'merah'
  | 'biru'
  | 'hijau'
  | 'ungu'
  | 'oranye'
  | 'grafit'
  | 'putih'
export type Accent = 'merah' | 'biru' | 'hijau' | 'ungu' | 'oranye' | 'grafit'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function useCtl<T>(value: T | undefined, initial: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [st, setSt] = React.useState<T>(initial)
  const ctl = value !== undefined
  return [
    ctl ? (value as T) : st,
    (v: T) => {
      if (!ctl) setSt(v)
      onChange?.(v)
    },
  ]
}

export function useUid() {
  return 'mkg' + React.useId().replace(/[^a-zA-Z0-9]/g, '')
}

export const fmtID = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('id-ID') : v)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Nada warna: [awal gradien, isian, teks]. */
const TONES: Record<string, [string, string, string]> = {
  accent: ['var(--accent-cerah)', 'var(--accent-fill)', 'var(--accent)'],
  on: ['var(--hijau-cerah)', 'var(--sukses)', 'var(--sukses)'],
  done: ['var(--hijau-cerah)', 'var(--sukses)', 'var(--sukses)'],
  risk: ['var(--oranye-cerah)', 'var(--waspada)', 'var(--waspada)'],
  late: ['var(--merah-cerah)', 'var(--bahaya)', 'var(--bahaya)'],
  info: ['var(--biru-cerah)', 'var(--info)', 'var(--info)'],
  neutral: ['var(--chart-idle)', 'var(--chart-idle)', 'var(--ink-2)'],
  merah: ['var(--merah-cerah)', 'var(--merah-fill)', 'var(--merah)'],
  biru: ['var(--biru-cerah)', 'var(--biru-fill)', 'var(--biru)'],
  hijau: ['var(--hijau-cerah)', 'var(--hijau-fill)', 'var(--hijau)'],
  ungu: ['var(--ungu-cerah)', 'var(--ungu-fill)', 'var(--ungu)'],
  oranye: ['var(--oranye-cerah)', 'var(--oranye-fill)', 'var(--oranye)'],
  grafit: ['var(--grafit-cerah)', 'var(--grafit-fill)', 'var(--grafit)'],
  'data-1': ['var(--biru-cerah)', 'var(--data-1)', 'var(--data-1)'],
  'data-2': ['var(--hijau-cerah)', 'var(--data-2)', 'var(--data-2)'],
  'data-3': ['var(--data-3)', 'var(--data-3)', 'var(--data-3)'],
  'data-4': ['var(--ungu-cerah)', 'var(--data-4)', 'var(--data-4)'],
  'data-5': ['var(--oranye-cerah)', 'var(--data-5)', 'var(--data-5)'],
  'data-6': ['var(--data-6)', 'var(--data-6)', 'var(--data-6)'],
  putih: ['color-mix(in srgb, var(--putih) 75%, transparent)', 'var(--putih)', 'var(--putih)'],
}
export function tone(t?: string): [string, string, string] {
  return TONES[t ?? 'accent'] ?? TONES.accent
}
export function GradStops({ t, a1 = 1, a2 = 1 }: { t?: string; a1?: number; a2?: number }) {
  const c = tone(t)
  return (
    <>
      <stop offset="0%" style={{ stopColor: c[0], stopOpacity: a1 }} />
      <stop offset="100%" style={{ stopColor: c[1], stopOpacity: a2 }} />
    </>
  )
}
export function smoothPath(pts: [number, number][]) {
  if (!pts.length) return ''
  let d = 'M' + pts[0][0] + ' ' + pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const t = 0.16
    d +=
      ' C' + (p1[0] + (p2[0] - p0[0]) * t) + ' ' + (p1[1] + (p2[1] - p0[1]) * t) +
      ' ' + (p2[0] - (p3[0] - p1[0]) * t) + ' ' + (p2[1] - (p3[1] - p1[1]) * t) +
      ' ' + p2[0] + ' ' + p2[1]
  }
  return d
}

/* ---------- Ikon ---------- */
type Part = string | [string, Record<string, number>]
const ICONS: Record<string, Part[]> = {
  ringkasan: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 2 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 2 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 2 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 2 }]],
  proyek: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  tim: [['circle', { cx: 9, cy: 8, r: 3.5 }], 'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.8c1.9.7 3.1 2.5 3.5 5.2'],
  persetujuan: [['circle', { cx: 12, cy: 12, r: 9 }], 'm8 12.5 2.8 2.8L16 10'],
  aktivitas: ['M3 12h4l3-8 4 16 3-8h4'],
  kehadiran: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 7v5l3 2'],
  waktu: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 7v5l3 2'],
  kalender: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 3 }], 'M3 10h18M8 3v4M16 3v4'],
  laporan: ['M5 20V11', 'M12 20V5', 'M19 20v-6'],
  cari: [['circle', { cx: 11, cy: 11, r: 7 }], 'm20 20-3.5-3.5'],
  notifikasi: ['M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20a2 2 0 0 0 4 0'],
  gelap: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  terang: [['circle', { cx: 12, cy: 12, r: 4 }], 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  kanan: ['m9 6 6 6-6 6'],
  kiri: ['m15 6-6 6 6 6'],
  bawah: ['m6 9 6 6 6-6'],
  tutup: ['M6 6l12 12M18 6 6 18'],
  peringatan: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17v.01'],
  selesai: ['m5 12.5 4.5 4.5L19 7'],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], 'M12 11v5', 'M12 8v.01'],
  titik: [['circle', { cx: 12, cy: 12, r: 9 }]],
  tambah: ['M12 5v14M5 12h14'],
  naik: ['M4 16l6-6 4 4 6-6', 'M14 8h6v6'],
  turun: ['M4 8l6 6 4-4 6 6', 'M14 16h6v-6'],
  unduh: ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14'],
  unggah: ['M12 20V9', 'm7 14 5-5 5 5', 'M5 4h14'],
  catatan: ['M4 5h16v11H9l-5 4z'],
  pengaturan: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', ['circle', { cx: 15, cy: 6, r: 2 }], ['circle', { cx: 9, cy: 12, r: 2 }], ['circle', { cx: 17, cy: 18, r: 2 }]],
  lainnya: [['circle', { cx: 5, cy: 12, r: 1.2 }], ['circle', { cx: 12, cy: 12, r: 1.2 }], ['circle', { cx: 19, cy: 12, r: 1.2 }]],
  dokumen: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6M10 17h6'],
  target: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 5 }], ['circle', { cx: 12, cy: 12, r: 1 }]],
  pengguna: [['circle', { cx: 12, cy: 8, r: 4 }], 'M4 21c1-4 4.3-6 8-6s7 2 8 6'],
  kunci: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], 'M8 11V8a4 4 0 0 1 8 0v3'],
  gedung: ['M4 21V5l8-2v18', 'M12 8h8v13', 'M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2', 'M3 21h18'],
  kirim: ['M21 3 10 14', 'm21 3-7 18-4-7-7-4z'],
  alur: [['circle', { cx: 6, cy: 6, r: 2.5 }], ['circle', { cx: 18, cy: 18, r: 2.5 }], 'M8.5 6H14a4 4 0 0 1 4 4v5.5'],
  keluar: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5', 'M5 12h11'],
  lihat: ['M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z', ['circle', { cx: 12, cy: 12, r: 3 }]],
  sembunyi: ['M10.6 5.1A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a16.7 16.7 0 0 1-2.4 3.3', 'M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9.3 9.3 0 0 0 5.4-1.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2', 'M3 3l18 18'],
  hapus: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  ubah: ['M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z', 'm13.5 6.5 4 4'],
}
export type IconName = keyof typeof ICONS

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  label,
  className,
  style,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
  style?: React.CSSProperties
}) {
  const parts = ICONS[name] ?? ICONS.titik
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('mk-icon', className)}
      style={style}
    >
      {parts.map((d, i) =>
        typeof d === 'string' ? <path key={i} d={d} /> : React.createElement(d[0], { key: i, ...d[1] })
      )}
    </svg>
  )
}

export function LogoMark({ size = 32, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <span
      className={cx('mk-logo', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="mk-logo__top" />
      <span className="mk-logo__bottom" />
    </span>
  )
}

export const STATUS: Record<Status, { label: string; icon: IconName }> = {
  on: { label: 'Sesuai jadwal', icon: 'selesai' },
  risk: { label: 'Perlu perhatian', icon: 'peringatan' },
  late: { label: 'Terlambat', icon: 'waktu' },
  done: { label: 'Selesai', icon: 'selesai' },
  info: { label: 'Informasi', icon: 'info' },
  neutral: { label: 'Belum mulai', icon: 'titik' },
}

/* ---------- Aksi ---------- */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'plain' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconAfter?: IconName
  full?: boolean
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconAfter, full, className, children, type = 'button', ...rest },
  ref
) {
  const iconSize = size === 'sm' ? 16 : 18
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={cx('mk-btn', 'mk-btn--' + variant, 'mk-btn--' + size, full && 'mk-btn--full', className)}
    >
      {icon ? <Icon name={icon} size={iconSize} strokeWidth={2} /> : null}
      <span>{children}</span>
      {iconAfter ? <Icon name={iconAfter} size={iconSize} strokeWidth={2} /> : null}
    </button>
  )
})

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  variant?: 'plain' | 'filled'
  badge?: boolean | number | string
}
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'plain', badge, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      className={cx('mk-iconbtn', 'mk-iconbtn--' + variant, className)}
    >
      <Icon name={icon} size={20} />
      {badge === true ? (
        <span className="mk-iconbtn__dot" aria-hidden />
      ) : badge ? (
        <span className="mk-iconbtn__count" aria-hidden>
          {badge}
        </span>
      ) : null}
    </button>
  )
})

/* ---------- Kontrol ---------- */
export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  label,
  size,
  full,
  className,
}: {
  options: { value: string; label: string }[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  size?: 'sm' | 'md'
  full?: boolean
  className?: string
}) {
  const [cur, set] = useCtl(value, defaultValue ?? options[0]?.value ?? '', onChange)
  return (
    <div role="group" aria-label={label || 'Pilihan'} className={cx('mk-seg', size === 'sm' && 'mk-seg--sm', full && 'mk-seg--full', className)}>
      {options.map((o) => {
        const on = o.value === cur
        return (
          <button key={o.value} type="button" aria-pressed={on} className={cx('mk-seg__btn', on && 'is-on')} onClick={() => set(o.value)}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  count?: number | string
  status?: Status
}
export function Chip({ selected, count, status, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={!!selected} {...rest} className={cx('mk-chip', selected && 'is-on', className)}>
      {status ? <span className={cx('mk-dot', 'mk-bg--' + status)} aria-hidden /> : null}
      <span>{children}</span>
      {count !== undefined ? <span className="mk-chip__count">{count}</span> : null}
    </button>
  )
}

export function SearchField({
  id = 'mk-cari',
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  shortcut,
  className,
}: {
  id?: string
  label?: string
  placeholder?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  shortcut?: string
  className?: string
}) {
  return (
    <div className={cx('mk-search', className)}>
      <Icon name="cari" size={18} />
      <label htmlFor={id} className="mk-sr">
        {label || 'Cari'}
      </label>
      <input
        id={id}
        type="search"
        placeholder={placeholder || 'Cari proyek, orang, laporan'}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {shortcut ? <kbd className="mk-search__kbd">{shortcut}</kbd> : null}
    </div>
  )
}

export const ACCENTS: [Accent, string][] = [
  ['merah', 'Merah'],
  ['biru', 'Biru'],
  ['hijau', 'Hijau'],
  ['ungu', 'Ungu'],
  ['oranye', 'Oranye'],
  ['grafit', 'Grafit'],
]
export function AccentPicker({
  value,
  defaultValue = 'merah',
  onChange,
  label,
  className,
}: {
  value?: Accent
  defaultValue?: Accent
  onChange?: (a: Accent) => void
  label?: string
  className?: string
}) {
  const [cur, set] = useCtl<Accent>(value, defaultValue, onChange)
  return (
    <div role="group" aria-label={label || 'Warna aksen'} className={cx('mk-accents', className)}>
      {ACCENTS.map(([k, name]) => {
        const on = k === cur
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            aria-label={'Aksen ' + name}
            title={name}
            className={cx('mk-swatch', 'mk-swatch--' + k, on && 'is-on')}
            onClick={() => set(k)}
          />
        )
      })}
    </div>
  )
}

/* ---------- Status & identitas ---------- */
export function StatusBadge({
  status,
  size,
  children,
  className,
}: {
  status: Status
  size?: 'sm' | 'md'
  children?: React.ReactNode
  className?: string
}) {
  const st: Status = STATUS[status] ? status : 'on'
  const m = STATUS[st]
  const sm = size === 'sm'
  return (
    <span className={cx('mk-badge', 'mk-badge--' + st, sm && 'mk-badge--sm', className)}>
      <Icon name={m.icon} size={sm ? 13 : 14} strokeWidth={2.4} />
      <span>{children || m.label}</span>
    </span>
  )
}

export function Avatar({
  initials,
  name,
  tone: t = 'accent',
  size = 32,
  className,
}: {
  initials: string
  name?: string
  tone?: Tone
  size?: number
  className?: string
}) {
  return (
    <span
      className={cx('mk-avatar', 'mk-tone--' + t, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      role={name ? 'img' : undefined}
      aria-label={name}
      title={name}
    >
      <span aria-hidden={name ? true : undefined}>{initials}</span>
    </span>
  )
}

export function ProgressBar({
  value,
  status = 'accent',
  size,
  showValue,
  label,
  className,
}: {
  value: number
  status?: Status | 'accent'
  size?: 'md' | 'lg'
  showValue?: boolean
  label?: string
  className?: string
}) {
  const v = clamp(Math.round(value || 0), 0, 100)
  return (
    <div className={cx('mk-progress', size === 'lg' && 'mk-progress--lg', className)}>
      <div className="mk-progress__track" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progres'}>
        <div className={cx('mk-progress__fill', 'mk-bg--' + status)} style={{ width: v + '%' }} />
      </div>
      {showValue === false ? null : <span className="mk-progress__value">{v}%</span>}
    </div>
  )
}

export function ProgressRing({
  value,
  size = 160,
  stroke,
  label,
  sublabel,
  status = 'accent',
  ariaLabel,
  className,
}: {
  value: number
  size?: number
  stroke?: number
  label?: React.ReactNode
  sublabel?: string
  status?: Status | 'accent'
  ariaLabel?: string
  className?: string
}) {
  const sw = stroke || Math.max(6, Math.round(size / 11))
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const v = clamp(value || 0, 0, 100)
  const half = size / 2
  const uid = useUid()
  return (
    <div
      className={cx('mk-ring', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || (Math.round(v) + '% ' + (sublabel || '')).trim()}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={uid} x1={0} y1={0} x2={1} y2={1}>
            <GradStops t={status} />
          </linearGradient>
        </defs>
        <circle cx={half} cy={half} r={r} fill="none" strokeWidth={sw} style={{ stroke: tone(status)[1], opacity: 0.16 }} />
        <circle
          className="mk-ring__fill"
          cx={half}
          cy={half}
          r={r}
          fill="none"
          stroke={`url(#${uid})`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          transform={`rotate(-90 ${half} ${half})`}
        />
      </svg>
      <div className="mk-ring__center" aria-hidden>
        <span className="mk-ring__value" style={{ fontSize: Math.round(size * 0.24) }}>
          {label !== undefined ? label : Math.round(v) + '%'}
        </span>
        {sublabel ? <span className="mk-ring__sub">{sublabel}</span> : null}
      </div>
    </div>
  )
}

/* ---------- Wadah ---------- */
export function Card({
  title,
  subtitle,
  action,
  variant = 'default',
  id,
  ariaLabel,
  children,
  className,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  variant?: 'default' | 'hero' | 'inset' | 'aurora' | 'gradient' | 'malam' | 'glass'
  id?: string
  ariaLabel?: string
  children?: React.ReactNode
  className?: string
}) {
  const hasHead = title || action
  return (
    <section
      className={cx('mk-card', 'mk-card--' + variant, className)}
      id={id}
      aria-label={typeof title === 'string' ? title : ariaLabel}
    >
      {hasHead ? (
        <header className="mk-card__head">
          <div className="mk-card__titles">
            {title ? <h3 className="mk-card__title">{title}</h3> : null}
            {subtitle ? <p className="mk-card__sub">{subtitle}</p> : null}
          </div>
          {action || null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function NavItem({
  icon,
  label,
  href = '#',
  active,
  count,
  countTone,
  onClick,
  vtName,
  className,
}: {
  icon: IconName
  label: string
  /** Nama view-transition ikon (perpindahan ke Dock). */
  vtName?: string
  href?: string
  active?: boolean
  count?: number | string | null
  countTone?: 'muted' | 'accent'
  onClick?: (e: React.MouseEvent) => void
  className?: string
}) {
  return (
    <a
      href={href}
      className={cx('mk-nav', active && 'is-on', className)}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      style={vtName ? ({ '--vt': vtName } as React.CSSProperties) : undefined}
    >
      <Icon name={icon} size={20} strokeWidth={active ? 2.1 : 1.8} />
      <span className="mk-nav__label">{label}</span>
      {count !== undefined && count !== null && count !== '' ? (
        <span className={cx('mk-nav__count', countTone === 'accent' && 'is-accent')}>{count}</span>
      ) : null}
    </a>
  )
}

export function TabBar({
  items,
  value,
  onChange,
  floating,
  label,
  className,
}: {
  items: { value: string; label: string; icon: IconName; badge?: number | string }[]
  value?: string
  onChange?: (value: string) => void
  floating?: boolean
  label?: string
  className?: string
}) {
  const [cur, set] = useCtl(value, items[0]?.value ?? '', onChange)
  return (
    <nav className={cx('mk-tabbar', floating && 'mk-tabbar--floating', className)} aria-label={label || 'Navigasi utama'}>
      {items.map((it) => {
        const on = it.value === cur
        return (
          <button
            key={it.value}
            type="button"
            className={cx('mk-tab', on && 'is-on')}
            aria-current={on ? 'page' : undefined}
            onClick={() => set(it.value)}
            style={{ '--vt': `nav-${it.value}` } as React.CSSProperties}
          >
            <span className="mk-tab__icon">
              <Icon name={it.icon} size={floating ? 18 : 24} strokeWidth={on ? 2.1 : 1.8} />
              {it.badge ? (
                <span className="mk-tab__badge" aria-hidden>
                  {it.badge}
                </span>
              ) : null}
            </span>
            <span className="mk-tab__label">{it.label}</span>
            {it.badge ? <span className="mk-sr">{`, ${it.badge} baru`}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
