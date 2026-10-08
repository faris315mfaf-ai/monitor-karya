'use client'

/**
 * Pola layar bersama (13 · Pola layar): header halaman, kartu ringkasan (hero aurora),
 * keadaan kosong/semua beres/galat, dan kerangka memuat tanpa spinner.
 */

import * as React from 'react'
import { Button, Icon, cx, type IconName, type Status } from './core'

export function PageHeader({
  context,
  title,
  tools,
  className,
}: {
  context?: React.ReactNode
  title: React.ReactNode
  tools?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cx('mk-pagehead', className)}>
      <div className="min-w-0">
        {context ? <p className="mk-pagehead__ctx">{context}</p> : null}
        <h1 className="mk-pagehead__title">{title}</h1>
      </div>
      {tools ? <div className="mk-pagehead__tools">{tools}</div> : null}
    </header>
  )
}

export function Hero({
  eyebrow,
  answer,
  support,
  actions,
  art,
  kpis,
  className,
}: {
  eyebrow?: React.ReactNode
  answer: React.ReactNode
  support?: React.ReactNode
  actions?: React.ReactNode
  art?: React.ReactNode
  kpis?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cx('mk-hero', className)} aria-label="Ringkasan">
      <div className="mk-hero__text">
        {eyebrow ? <span className="mk-hero__eyebrow">{eyebrow}</span> : null}
        <h2 className="mk-hero__answer">{answer}</h2>
        {support ? <p className="mk-hero__support">{support}</p> : null}
        {actions ? <div className="mk-hero__actions">{actions}</div> : null}
      </div>
      {art ? <div className="mk-hero__art">{art}</div> : null}
      {kpis ? <div className="mk-hero__kpis">{kpis}</div> : null}
    </section>
  )
}

/** Kalimat tenang untuk keadaan kosong; `done` = semua beres (centang sukses). */
export function EmptyNote({
  children,
  done,
  icon,
  action,
  className,
}: {
  children: React.ReactNode
  done?: boolean
  icon?: IconName
  action?: React.ReactNode
  className?: string
}) {
  const ic: IconName | undefined = done ? 'selesai' : icon
  return (
    <div className={cx('mk-empty', className)}>
      {ic ? (
        <span className={cx('mk-empty__icon', done ? 'mk-soft--done' : 'mk-soft--neutral')} aria-hidden>
          <Icon name={ic} size={20} strokeWidth={2.2} />
        </span>
      ) : null}
      <span>{children}</span>
      {action}
    </div>
  )
}

export function ErrorNote({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="mk-empty" role="alert">
      <span className="mk-empty__icon mk-soft--late" aria-hidden>
        <Icon name="peringatan" size={20} strokeWidth={2.2} />
      </span>
      <span>{message || 'Data belum termuat.'}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  )
}

export function Skeleton({ h = 16, w = '100%', r, className }: { h?: number | string; w?: number | string; r?: number; className?: string }) {
  return <div className={cx('mk-skel', className)} style={{ height: h, width: w, borderRadius: r }} aria-hidden />
}

/** Kerangka dashboard: hero + dua baris kartu, blok seukuran isi asli. */
export function DashboardSkeleton() {
  return (
    <div className="mk-app__inner" aria-busy="true" aria-label="Memuat">
      <div>
        <Skeleton h={14} w={220} />
        <div style={{ height: 10 }} />
        <Skeleton h={40} w={320} r={12} />
      </div>
      <div className="mk-hero">
        <div className="mk-hero__text">
          <Skeleton h={26} w={180} r={999} />
          <Skeleton h={40} w="80%" r={12} />
          <Skeleton h={20} w="60%" />
        </div>
        <Skeleton h={176} w={176} r={999} />
        <div className="mk-hero__kpis">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={96} r={14} />
          ))}
        </div>
      </div>
      <div className="mk-row">
        <div className="is-wide mk-card">
          <Skeleton h={220} />
        </div>
        <div className="is-narrow mk-card">
          <Skeleton h={220} />
        </div>
      </div>
    </div>
  )
}

/** Peta status lama → kosakata status desain. */
export function statusFromDaily(s: string | null | undefined): Status {
  switch (s) {
    case 'SELESAI':
      return 'done'
    case 'ON_PROGRESS':
      return 'on'
    case 'TERKENDALA':
      return 'risk'
    case 'MENUNGGU_KEPUTUSAN':
      return 'info'
    default:
      return 'neutral'
  }
}

/** Kotak tanggal 44px untuk daftar tenggat. */
export function DateBox({ date }: { date: Date | string }) {
  const d = typeof date === 'string' ? new Date(date) : date
  const day = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: 'Asia/Jakarta' }).format(d)
  const mon = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' }).format(d).replace('.', '')
  return (
    <span className="mk-datebox" aria-hidden>
      <span className="mk-datebox__mon">{mon}</span>
      <span className="mk-datebox__day">{day}</span>
    </span>
  )
}

const phoneQuery = '(max-width: 599px)'
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(phoneQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True di ponsel (<600px). Server dan render pertama selalu false. */
export function useIsPhone() {
  return React.useSyncExternalStore(subscribePhone, () => window.matchMedia(phoneQuery).matches, () => false)
}

const tabletQuery = '(min-width: 600px) and (max-width: 1023px)'
function subscribeTablet(cb: () => void) {
  const mq = window.matchMedia(tabletQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True di tablet (600–1023px); ponsel dan desktop selalu false. */
export function useIsTablet() {
  return React.useSyncExternalStore(subscribeTablet, () => window.matchMedia(tabletQuery).matches, () => false)
}
