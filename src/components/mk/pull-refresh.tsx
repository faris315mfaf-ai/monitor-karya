'use client'

/**
 * Tarik-muat-ulang untuk layar ponsel (KONTRAK-FASE1-PWA.md bagian C.4).
 *
 * Gerak mengikuti "Designing Fluid Interfaces": isi dilacak 1:1 dengan jari
 * melalui hambatan karet, keputusan memicu memakai ambang 72px ditambah
 * proyeksi momentum ringan, lalu kembali dengan pegas kritis yang menerima
 * kecepatan jari. Saat memuat, indikator diam di 48px sampai `onRefresh`
 * selesai.
 *
 * Batas aman:
 *  - hanya peristiwa sentuh (touch*), jadi tetikus/pena tidak terpengaruh;
 *  - hanya saat halaman di puncak (`window.scrollY <= 0`) dan tidak ada wadah
 *    gulir bersarang yang sedang tergulir;
 *  - gerakan baru "diklaim" setelah histeresis ~10px dan hanya bila dominan
 *    vertikal ke bawah. Gerakan lain (gulir biasa, karusel horizontal)
 *    dilepas tanpa preventDefault;
 *  - pendengar dipasang pada DOM asli, sehingga sentuhan di portal (lembar,
 *    dialog) tidak ikut menarik layar di belakangnya.
 *
 * Gerak dikurangi: isi tidak bergeser dan tanpa karet; indikator hanya
 * memudar. Tarik-muat-ulang adalah tambahan: tombol "Coba lagi" dan muat ulang
 * otomatis milik layar tetap berlaku. Status dibacakan lewat aria-live.
 */

import * as React from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { cx } from './core'

/** Jarak tampak (px) yang memicu muat ulang. */
export const PULL_THRESHOLD = 72
/** Posisi indikator (px) selama memuat. */
export const PULL_HOLD = 48
/** Histeresis (px) sebelum arah gerakan diputuskan. */
export const PULL_SLOP = 10
/** Konstanta karet ala UIScrollView. */
export const RUBBER_C = 0.55
/** Laju perlambatan proyeksi ringan (lebih pendek dari gulir 0,998). */
export const PULL_DECELERATION = 0.99
/** Kecepatan ke atas (px/s) yang dianggap membatalkan tarikan. */
export const PULL_CANCEL_SPEED = 100
/** Tahanan minimum (ms) indikator memuat agar tidak berkedip. */
export const PULL_MIN_SPIN = 450

/** Pegas kritis untuk kembali/menahan. */
const SPRING = { type: 'spring', bounce: 0, duration: 0.45 } as const
const FADE = { duration: 0.2, ease: 'linear' } as const
const INDICATOR = 32

/**
 * Hambatan karet: `(1 − 1/(x·c/d + 1))·d`. Mendekati `d` secara asimtotik,
 * kira-kira 1:1 untuk tarikan kecil. Tanda dipertahankan.
 */
export function rubberband(overshoot: number, dimension: number, c = RUBBER_C): number {
  if (!Number.isFinite(overshoot) || !Number.isFinite(dimension) || dimension <= 0 || !(c > 0)) return 0
  const x = Math.abs(overshoot)
  const y = (1 - 1 / ((x * c) / dimension + 1)) * dimension
  return overshoot < 0 ? -y : y
}

/** Kebalikan `rubberband` (untuk melanjutkan gerakan yang disela). */
export function rubberbandInverse(offset: number, dimension: number, c = RUBBER_C): number {
  if (!Number.isFinite(offset) || !Number.isFinite(dimension) || dimension <= 0 || !(c > 0)) return 0
  const y = Math.min(Math.abs(offset), dimension * 0.999)
  const x = (y * dimension) / (c * (dimension - y))
  return offset < 0 ? -x : x
}

/** Jarak lanjutan dari kecepatan lepas (px/s), proyeksi ringan. */
export function projectPull(velocity: number, rate = PULL_DECELERATION): number {
  if (!Number.isFinite(velocity) || !(rate > 0 && rate < 1)) return 0
  return ((velocity / 1000) * rate) / (1 - rate)
}

/**
 * Keputusan memicu saat jari dilepas. `offset` = jarak tampak (px),
 * `velocity` = kecepatan tampak (px/s, positif = ke bawah).
 *  - lepas sambil bergerak ke atas → batal;
 *  - melewati ambang → picu;
 *  - setidaknya setengah ambang dan proyeksi momentum melewati ambang → picu.
 */
export function shouldTrigger(offset: number, velocity: number, threshold = PULL_THRESHOLD): boolean {
  const pos = Number.isFinite(offset) ? offset : 0
  const v = Number.isFinite(velocity) ? velocity : 0
  if (!(threshold > 0) || pos <= 0) return false
  if (v < -PULL_CANCEL_SPEED) return false
  if (pos >= threshold) return true
  return pos >= threshold / 2 && pos + projectPull(v) >= threshold
}

export type PullIntent = 'pending' | 'pull' | 'ignore'

/**
 * Arah gerakan pertama dari titik sentuh (dx, dy; dy positif = ke bawah).
 * Belum melewati histeresis → `pending`; dominan vertikal ke bawah → `pull`;
 * selain itu (ke atas, menyamping) → `ignore` dan gerakan dibiarkan.
 */
export function pullIntent(dx: number, dy: number, slop = PULL_SLOP): PullIntent {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'ignore'
  if (Math.hypot(dx, dy) < slop) return 'pending'
  return dy > 0 && dy > Math.abs(dx) ? 'pull' : 'ignore'
}

/** Kecepatan (px/s) dari sampel terakhir dalam jendela 100 ms. */
export function pullVelocity(samples: readonly { t: number; y: number }[], windowMs = 100): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break
    first = samples[i]
  }
  const dt = last.t - first.t
  if (!(dt > 0)) return 0
  return ((last.y - first.y) / dt) * 1000
}

/** Ada wadah gulir antara `target` dan `root` yang tidak di puncaknya. */
function insideScrolled(target: EventTarget | null, root: HTMLElement): boolean {
  let n = target instanceof Element ? target : null
  while (n && n !== root) {
    if (n.scrollTop > 0) return true
    n = n.parentElement
  }
  return false
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Status = 'idle' | 'pull' | 'armed' | 'loading'

export interface PullToRefreshProps {
  /** Muat ulang. Promise → indikator ditahan sampai selesai. */
  onRefresh: () => Promise<void> | void
  /**
   * Opsional, untuk `onRefresh` yang tidak mengembalikan Promise (mis.
   * `reload()` dari useResource): indikator ditahan selama `loading` benar.
   */
  loading?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function PullToRefresh({ onRefresh, loading, disabled, className, children }: PullToRefreshProps) {
  const reduce = useReducedMotion() ?? false
  const root = React.useRef<HTMLDivElement>(null)
  const pull = useMotionValue(0)
  const busy = useMotionValue(0)
  const [status, setStatus] = React.useState<Status>('idle')

  // Nilai terbaru untuk pendengar DOM asli; ditulis di effect, dibaca di handler.
  const latest = React.useRef({ onRefresh, loading, disabled, reduce })
  React.useEffect(() => {
    latest.current = { onRefresh, loading, disabled, reduce }
  })

  const progress = useTransform(pull, (v) => Math.min(Math.max(v / PULL_THRESHOLD, 0), 1))
  const indicatorY = useTransform(pull, (v) => Math.max(v / 2 - INDICATOR / 2, 4))
  const opacity = useTransform(() => (busy.get() ? 1 : Math.min(Math.max((pull.get() - 8) / 28, 0), 1)))
  const arc = useTransform(() => (busy.get() ? 0.72 : 0.08 + progress.get() * 0.72))
  // Busur mulai dari arah jam 12 lalu berputar mengikuti jarak tarik.
  const turn = useTransform(progress, (p) => p * 270 - 90)

  React.useEffect(() => {
    const el = root.current
    if (!el) return
    let alive = true
    let anim: AnimationPlaybackControls | null = null
    let g: null | {
      id: number
      x0: number
      y0: number
      base: number
      claimed: boolean
      dim: number
      samples: { t: number; y: number }[]
    } = null

    const run = (to: number, velocity = 0, quick = false) => {
      anim?.stop()
      const opts = latest.current.reduce || quick ? FADE : { ...SPRING, velocity }
      anim = animate(pull, to, opts)
      return anim
    }

    const settle = (velocity = 0) => {
      run(0, velocity)
      setStatus('idle')
    }

    async function refresh(velocity: number) {
      busy.set(1)
      setStatus('loading')
      if (latest.current.reduce) pull.set(PULL_THRESHOLD)
      else run(PULL_HOLD, velocity)
      const started = Date.now()
      try {
        const r = latest.current.onRefresh()
        if (r && typeof (r as Promise<void>).then === 'function') {
          await r
        } else {
          // reload() tanpa Promise: beri waktu "loading" naik, lalu tunggu turun (maks 15 dtk).
          await sleep(PULL_MIN_SPIN)
          const limit = Date.now() + 15000
          while (alive && latest.current.loading && Date.now() < limit) await sleep(120)
        }
      } catch {
        /* galat ditangani layar pemanggil (ErrorNote); indikator tetap ditutup */
      }
      const rest = PULL_MIN_SPIN - (Date.now() - started)
      if (rest > 0) await sleep(rest)
      if (!alive) return
      busy.set(0)
      settle()
    }

    const onStart = (e: TouchEvent) => {
      const cur = latest.current
      const prev = g
      g = null
      if (busy.get()) return
      if (e.touches.length !== 1) {
        // Jari kedua mendarat (cubit): lepaskan tarikan yang sedang berjalan.
        if (prev?.claimed) settle()
        return
      }
      if (cur.disabled) return
      if (window.scrollY > 0 || insideScrolled(e.target, el)) return
      const t = e.touches[0]
      // Tangkap gerakan kembali yang sedang berjalan (dapat disela).
      const now = pull.get()
      anim?.stop()
      const dim = window.innerHeight || 800
      const base = now > 0 ? (cur.reduce ? now : rubberbandInverse(now, dim)) : 0
      g = { id: t.identifier, x0: t.clientX, y0: t.clientY, base, claimed: now > 0, dim, samples: [] }
    }

    const onMove = (e: TouchEvent) => {
      if (!g) return
      if (e.touches.length !== 1) {
        const was = g.claimed
        g = null
        if (was) settle()
        return
      }
      const t = e.touches[0]
      if (t.identifier !== g.id) return
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (!g.claimed) {
        const intent = pullIntent(dx, dy)
        if (intent === 'pending') {
          // Tarikan jelas ke bawah di puncak: cegah pantulan halaman iOS sejak awal.
          if (dy > 0 && dy > 2 * Math.abs(dx) && e.cancelable && window.scrollY <= 0) e.preventDefault()
          return
        }
        if (intent === 'ignore' || window.scrollY > 0) {
          g = null
          return
        }
        g.claimed = true
        g.y0 += PULL_SLOP // mulai dari titik klaim agar tidak melompat
        setStatus('pull')
      }
      if (e.cancelable) e.preventDefault()
      const raw = Math.max(0, g.base + t.clientY - g.y0)
      const reduce = latest.current.reduce
      const shown = reduce ? Math.min(raw, PULL_THRESHOLD) : rubberband(raw, g.dim)
      g.samples.push({ t: e.timeStamp, y: shown })
      if (g.samples.length > 12) g.samples.shift()
      pull.set(shown)
      setStatus(shown >= PULL_THRESHOLD ? 'armed' : 'pull')
    }

    const onEnd = (e: TouchEvent) => {
      if (!g) return
      const cur = g
      g = null
      if (!cur.claimed) return
      const v = pullVelocity(cur.samples)
      if (e.type === 'touchend' && shouldTrigger(pull.get(), v)) void refresh(v)
      else settle(v)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      alive = false
      anim?.stop()
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [pull, busy])

  const loadingNow = status === 'loading'

  return (
    <div ref={root} className={cx('relative', className)} aria-busy={loadingNow || undefined}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex justify-center"
        style={{ y: reduce ? 8 : indicatorY, opacity }}
      >
        <span
          className="flex items-center justify-center rounded-full bg-surface text-ink-2 shadow-[var(--shadow-card)]"
          style={{ width: INDICATOR, height: INDICATOR }}
        >
          <motion.span className="flex" style={{ rotate: reduce ? -90 : turn }}>
            <motion.span
              className="flex"
              animate={loadingNow && !reduce ? { rotate: 360 } : { rotate: 0 }}
              transition={loadingNow && !reduce ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : { duration: 0 }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <motion.circle
                  cx={12}
                  cy={12}
                  r={8.5}
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  style={{ pathLength: arc }}
                />
              </svg>
            </motion.span>
          </motion.span>
        </span>
      </motion.div>
      <span className="sr-only" role="status" aria-live="polite">
        {loadingNow ? 'Memuat ulang…' : ''}
      </span>
      <motion.div style={{ y: reduce ? 0 : pull }}>{children}</motion.div>
    </div>
  )
}
