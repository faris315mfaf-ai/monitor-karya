'use client'

/**
 * Bagian bersama Meja kerja: jam hidup, cincin hitung mundur tenggat, angka
 * beranimasi, pita riwayat hari kerja, dan agenda dengan penanda "sekarang".
 * Semua gerak tunduk pada prefers-reduced-motion (lihat .mk-desk* di mk-modules.css).
 */

import { useEffect, useRef, useState } from 'react'
import { Icon, cx, type Status } from '@/components/mk'
import { formatTime } from '@/lib/format'

const WIB = 'Asia/Jakarta'

/** Waktu yang berdetak di browser saja, supaya markup server dan klien sama. */
export function useTicker(ms = 1000) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0)
    const t = window.setInterval(() => setNow(new Date()), ms)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [ms])
  return now
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Sisa waktu sebagai teks pendek: "2 j 14 m", "14 m 05 d", "lewat 4 menit". */
export function remainText(ms: number) {
  if (ms <= 0) {
    const late = Math.round(-ms / 60000)
    if (late < 1) return 'baru saja lewat'
    return late < 60 ? `lewat ${late} menit` : `lewat ${Math.floor(late / 60)} jam ${late % 60} menit`
  }
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h >= 24) return `${Math.floor(h / 24)} hari ${h % 24} jam`
  if (h > 0) return `${h} j ${String(m).padStart(2, '0')} m`
  return `${m} m ${String(s).padStart(2, '0')} d`
}

/** Sisa waktu untuk kalimat: "2 jam 14 menit", "14 menit", "kurang dari 1 menit". */
export function remainLong(ms: number) {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'kurang dari 1 menit'
  const h = Math.floor(mins / 60)
  if (h >= 24) return `${Math.floor(h / 24)} hari ${h % 24} jam`
  return h > 0 ? `${h} jam ${mins % 60} menit` : `${mins} menit`
}

/** Status tenggat menurut sisa waktu: longgar, mepet (≤ 2 jam), genting (≤ 30 menit), lewat. */
export function deadlineStatus(ms: number, done = false): Status | 'accent' {
  if (done) return 'done'
  if (ms <= 0) return 'late'
  if (ms <= 30 * 60000) return 'late'
  if (ms <= 2 * 3600000) return 'risk'
  return 'accent'
}

const RING_COLOR: Record<string, string> = {
  accent: 'var(--accent)',
  done: 'var(--sukses)',
  risk: 'var(--waspada)',
  late: 'var(--bahaya)',
}

/**
 * Cincin hitung mundur. Busur = sisa jendela kerja (dari `from` sampai `to`),
 * menyusut detik demi detik. Selesai → cincin penuh hijau dengan centang.
 */
export function DeadlineRing({
  from,
  to,
  done,
  doneLabel = 'Terkirim',
  doneCaption = 'sebelum tenggat',
  caption,
  size = 176,
}: {
  from: string | Date
  to: string | Date
  done?: boolean
  doneLabel?: string
  doneCaption?: string
  caption: string
  size?: number
}) {
  const now = useTicker(1000)
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  const left = now ? b - now.getTime() : b - a
  const frac = done ? 1 : Math.max(0, Math.min(1, left / Math.max(1, b - a)))
  const st = deadlineStatus(left, done)
  const stroke = Math.round(size * 0.085)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const label = done ? doneLabel : left <= 0 ? 'Terkunci' : remainText(left)
  const sub = done ? doneCaption : left <= 0 ? remainText(left) : caption
  return (
    <div
      className={cx('mk-desk-ring', `is-${st}`, now && left > 0 && left <= 30 * 60000 && !done && 'is-urgent')}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={done ? `${doneLabel}. ${doneCaption}` : `${label}. ${caption}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        <circle
          className="mk-desk-ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RING_COLOR[st]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="mk-desk-ring__text">
        {done ? (
          <span className="mk-desk-ring__icon" style={{ color: RING_COLOR.done }}>
            <Icon name="selesai" size={Math.round(size * 0.16)} strokeWidth={2.4} />
          </span>
        ) : (
          <Icon name="waktu" size={Math.round(size * 0.1)} className="text-ink-3" />
        )}
        <span className={cx('mk-desk-ring__value', label.length > 8 && 'is-long')}>{now || done ? label : ' '}</span>
        <span className="mk-desk-ring__sub">{sub}</span>
      </div>
    </div>
  )
}

/** Angka yang bergulir dari nilai sebelumnya ke nilai baru (600 ms, ease-out). */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value || reducedMotion()) {
      const t = window.setTimeout(() => setShown(value), 0)
      return () => window.clearTimeout(t)
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(start + (value - start) * e))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span className="tabular-nums">
      {shown.toLocaleString('id-ID')}
      {suffix}
    </span>
  )
}

export type DayCell = { date: string; state: 'ontime' | 'late' | 'missing' | 'today' | 'pending'; title?: string }

const DAY_LABEL: Record<DayCell['state'], string> = {
  ontime: 'Tepat waktu',
  late: 'Terlambat masuk',
  missing: 'Tidak dikirim',
  today: 'Hari ini · sudah terkirim',
  pending: 'Hari ini · belum dikirim',
}

/** Pita 10 hari kerja: satu kapsul per hari, warna + ikon + teks di tooltip/aria. */
export function DayStrip({ days, label }: { days: DayCell[]; label: string }) {
  return (
    <ol className="mk-desk-strip" aria-label={label}>
      {days.map((d, i) => {
        const dt = new Date(d.date)
        const wd = new Intl.DateTimeFormat('id-ID', { weekday: 'narrow', timeZone: WIB }).format(dt)
        const dn = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: WIB }).format(dt)
        const full = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: WIB }).format(dt)
        const text = `${full}: ${d.title ?? DAY_LABEL[d.state]}`
        return (
          <li key={d.date} className={cx('mk-desk-strip__day', `is-${d.state}`)} style={{ '--i': i } as React.CSSProperties} title={text}>
            <span className="sr-only">{text}</span>
            <span className="mk-desk-strip__wd" aria-hidden>
              {wd}
            </span>
            <span className="mk-desk-strip__pill" aria-hidden>
              {d.state === 'ontime' || d.state === 'today' ? (
                <Icon name="selesai" size={12} strokeWidth={2.6} />
              ) : d.state === 'late' ? (
                <Icon name="waktu" size={12} strokeWidth={2.4} />
              ) : d.state === 'missing' ? (
                <Icon name="tutup" size={12} strokeWidth={2.6} />
              ) : (
                <span className="mk-desk-strip__dot" />
              )}
            </span>
            <span className="mk-desk-strip__dn" aria-hidden>
              {dn}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Kotak centang dengan centang yang tergambar saat selesai. */
export function DrawnCheck({ checked, busy }: { checked: boolean; busy?: boolean }) {
  return (
    <span className={cx('mk-desk-check', checked && 'is-on', busy && 'is-busy')} aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export type AgendaEntry = {
  id: string
  title: string
  meta?: string
  start: string | null
  end: string | null
  done: boolean
  status?: Status
  badge?: React.ReactNode
}

/**
 * Agenda hari ini: entri berjam diurut menurut jam mulai, entri tanpa jam di
 * bawah. Garis "Sekarang" disisipkan di antara yang sudah lewat dan berikutnya.
 */
export function Agenda({
  entries,
  onToggle,
  onOpen,
  busyId,
  locked,
}: {
  entries: AgendaEntry[]
  onToggle?: (e: AgendaEntry) => void
  onOpen?: (e: AgendaEntry) => void
  busyId?: string | null
  locked?: boolean
}) {
  const now = useTicker(30000)
  const timed = entries.filter((e) => e.start).sort((x, y) => Date.parse(x.start!) - Date.parse(y.start!))
  const untimed = entries.filter((e) => !e.start)
  const nowAt = now?.getTime() ?? 0
  const cut = now ? timed.findIndex((e) => Date.parse(e.end ?? e.start!) > nowAt) : -1
  const nowIdx = cut === -1 ? timed.length : cut
  const rows: (AgendaEntry | 'now')[] = [...timed.slice(0, nowIdx), ...(now && timed.length ? (['now'] as const) : []), ...timed.slice(nowIdx), ...untimed]

  return (
    <ol className="mk-desk-agenda">
      {rows.map((e, i) =>
        e === 'now' ? (
          <li key="now" className="mk-desk-agenda__now" aria-label={`Sekarang pukul ${formatTime(now)}`}>
            <span className="mk-desk-agenda__nowdot" aria-hidden />
            <span className="t-caption">Sekarang · {formatTime(now)}</span>
          </li>
        ) : (
          <li
            key={e.id}
            className={cx('mk-desk-agenda__item', e.done && 'is-done', e.start && now && Date.parse(e.end ?? e.start) <= nowAt && !e.done && 'is-past')}
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="mk-desk-agenda__time t-footnote tabular-nums">
              {e.start ? formatTime(e.start) : '—'}
              {e.end ? <span className="text-ink-2">{formatTime(e.end)}</span> : null}
            </span>
            <span className="mk-desk-agenda__rail" aria-hidden />
            <div className="mk-desk-agenda__body">
              {onToggle ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={e.done}
                  disabled={locked || busyId === e.id}
                  className="mk-desk-agenda__check"
                  onClick={() => onToggle(e)}
                  aria-label={`${e.done ? 'Batalkan selesai' : 'Tandai selesai'}: ${e.title}`}
                >
                  <DrawnCheck checked={e.done} busy={busyId === e.id} />
                </button>
              ) : null}
              <button type="button" className="mk-desk-agenda__main" onClick={() => onOpen?.(e)} disabled={!onOpen}>
                <span className="mk-desk-agenda__title t-body-strong">{e.title}</span>
                {e.meta ? <span className="t-footnote text-ink-2 truncate">{e.meta}</span> : null}
              </button>
              {e.badge}
            </div>
          </li>
        )
      )}
    </ol>
  )
}

/** Satu baris ringkas "label · nilai" dengan angka bergulir, untuk kartu antrean. */
export function TallyPill({ label, value, total, status }: { label: string; value: number; total?: number; status?: Status }) {
  return (
    <span className={cx('mk-desk-tally', status && `is-${status}`)}>
      <strong>
        <CountUp value={value} />
        {total !== undefined ? <span className="text-ink-2">/{total}</span> : null}
      </strong>
      <span>{label}</span>
    </span>
  )
}
