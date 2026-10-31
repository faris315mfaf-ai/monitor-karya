'use client'

/**
 * Persetujuan Supervisor — ponsel (papan S-Ponsel-Antrean, S-Ponsel-Rincian,
 * S-Ponsel-Selesai, 16 Okt 2026).
 *
 * Antrean: judul besar, pemilih subholding (lembar dari bawah, seret untuk
 * menutup), segmen status, peringatan antrean lama, lalu daftar berkelompok
 * "Lebih dari sehari" / "Masuk hari ini". Antrean habis → "Semua sudah
 * ditinjau" + rekap keputusan hari ini.
 *
 * Rincian: layar penuh didorong dari kanan (pegas kritis), geser dari tepi
 * kiri untuk kembali (dilacak 1:1, proyeksi momentum memilih selesai/batal,
 * kecepatan jari diteruskan ke pegas). Tombol keputusan menempel di bawah.
 * Setelah memutuskan, laporan berikutnya bergeser masuk dari kanan; antrean
 * habis → layar kembali sendiri. Gerak dikurangi → pudar.
 */

import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  AnimatePresence, MotionConfig, animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo,
} from 'framer-motion'
import { ErrorNote, Icon, Skeleton, cx } from '@/components/mk'
import { PullToRefresh } from '@/components/mk/pull-refresh'
import { EvidenceLightbox, type LightboxState } from '../sh-overview/evidence'
import { subholdingLabel, toneOf } from '../sh-overview/logic'
import { EDGE_WIDTH, FADE, NAV_SPRING, dayHeading, monoOf, shouldDismiss, type PickSection } from '../sh-overview/mobile/mobile-logic'
import { PickerSheet } from '../sh-overview/mobile/picker-sheet'
import { wibDateKey } from '../sh-overview/logic'
import { PdfLink } from './pdf-link'
import { Description, DecidedNote, EvidenceGallery, Facts, HighlightNote, SubMono, Thread, evidenceOf } from './body'
import { ApproveButton, CommentField, DecisionHint, HighlightCard, ReviseButton, useDecision } from './decision'
import {
  ageLabel, longWaitCount, longWaitLine, neighborId, positionText, queueGroups, sentLine, subLine, todayRecap, waitDays,
  waitingHeadline, LONG_WAIT_DAYS, type ShReport,
} from './logic'
import { QueueRowContent, StatusTabs } from './queue'
import { Recap } from './split'
import { useReview, type ReviewState } from './use-review'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const FOCUS_IN = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'

export function ReviewPhone() {
  const s = useReview()
  const [now] = useState(() => new Date())
  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [query, setQuery] = useState('')
  const [lightbox, setLightbox] = useState<LightboxState>(null)

  const sub = s.subholdings.find((x) => x.id === s.sub) ?? null
  const groups = queueGroups(s.items, s.tab, now)
  const longLine = s.tab === 'MENUNGGU' ? longWaitLine(longWaitCount(s.items, now)) : null
  const done = Boolean(s.data) && s.tab === 'MENUNGGU' && s.items.length === 0

  const sections: PickSection[] = [
    {
      key: 'sub',
      title: 'Subholding',
      warn: false,
      items: [
        {
          key: 'semua', filter: { sub: null, pt: null }, name: 'Semua subholding',
          detail: s.totalWaiting ? `${s.totalWaiting} menunggu` : 'Tidak ada antrean', warn: false, selected: !s.sub, mono: null,
        },
        ...s.subholdings.map((x) => {
          const l = subLine(x, now)
          return {
            key: x.id, filter: { sub: x.id, pt: null }, name: subholdingLabel(x.name),
            detail: x.waiting ? `${x.waiting} menunggu · ${l.text.toLowerCase()}` : l.text,
            warn: l.warn, selected: s.sub === x.id, mono: { letter: monoOf(x.name), tone: toneOf(x.id) },
          }
        }),
      ].filter((it) => !query.trim() || it.name.toLowerCase().includes(query.trim().toLowerCase())),
    },
  ]

  const openPhoto = (r: ShReport, index: number) => {
    const items = evidenceOf(r)
    if (items.length) setLightbox({ items, index: Math.min(index, items.length - 1), title: r.kegiatan })
  }

  return (
    <MotionConfig reducedMotion="user">
      <PullToRefresh onRefresh={s.reload} loading={s.loading}>
        <div className="-mx-1 flex flex-col gap-4 pb-4">
          <header className="flex flex-col gap-3 px-1">
            <div className="flex flex-col gap-0.5">
              <span className="t-footnote font-semibold text-ink-2">
                {s.data ? `${waitingHeadline(s.totalWaiting)} · ${dayHeading(wibDateKey(now))}` : dayHeading(wibDateKey(now))}
              </span>
              <h1 className="m-0 t-title-1 text-ink">Persetujuan</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={sub ? `Subholding ${subholdingLabel(sub.name)}. Ganti subholding` : 'Semua subholding. Pilih subholding'}
                onClick={() => {
                  setQuery('')
                  setSheet(true)
                }}
                className={cx(
                  't-callout inline-flex min-h-11 max-w-full items-center gap-2 rounded-full pr-3 pl-2.5 font-semibold',
                  sub ? 'bg-grafit-fill text-on-grafit' : 'bg-surface text-ink shadow-[var(--shadow-card)]',
                  'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.97]',
                  FOCUS
                )}
              >
                {sub ? (
                  <SubMono id={sub.id} name={sub.name} size={24} />
                ) : (
                  <span aria-hidden className="t-caption flex h-6 w-6 flex-none items-center justify-center rounded-full bg-fill-1 font-bold text-ink">
                    ∑
                  </span>
                )}
                <span className="min-w-0 truncate">{sub ? subholdingLabel(sub.name) : 'Semua subholding'}</span>
                <Icon name="bawah" size={12} strokeWidth={2.6} className="flex-none" />
              </button>
              {sub ? (
                <button type="button" onClick={() => s.pickSub(null)} className={cx('t-callout min-h-11 rounded-full px-1.5 font-semibold text-accent', FOCUS)}>
                  Reset
                </button>
              ) : null}
            </div>
            <StatusTabs value={s.tab} counts={s.counts} onChange={s.pickTab} />
          </header>

          {!s.data ? (
            s.error ? (
              <ErrorNote message={s.error} onRetry={s.reload} />
            ) : (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat antrean">
                <Skeleton h={14} w={140} />
                <Skeleton h={232} r={16} />
              </div>
            )
          ) : done ? (
            <Done s={s} />
          ) : (
            <>
              {longLine ? (
                <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3 t-footnote font-semibold text-waspada">
                  <Icon name="peringatan" size={16} strokeWidth={2.2} className="mt-px shrink-0" />
                  {longLine}
                </p>
              ) : null}
              {groups.length === 0 ? (
                <p className="m-0 rounded-[var(--radius-md)] bg-surface p-4 t-callout font-normal text-ink-2">Belum ada laporan dengan status ini.</p>
              ) : (
                groups.map((g) => (
                  <section key={g.key} aria-label={g.title} className="flex flex-col gap-1.5">
                    <h2 className={cx('m-0 px-1 t-footnote font-semibold', g.warn ? 'text-waspada' : 'text-ink-2')}>{g.title}</h2>
                    <ul className="m-0 list-none overflow-hidden rounded-[var(--radius-md)] bg-surface p-0">
                      <AnimatePresence initial={false}>
                        {g.items.map((r, i) => {
                          const days = waitDays(r.submittedAt, now)
                          return (
                            <motion.li
                              key={r.id}
                              layout="position"
                              exit={{ opacity: 0, transition: { duration: 0.18 } }}
                              className={cx(i > 0 && 'shadow-[inset_72px_1px_0_-72px_var(--line)]')}
                            >
                              <button
                                type="button"
                                onClick={() => setOpen(r.id)}
                                className={cx(
                                  'flex w-full items-start gap-3 py-3 pr-3 pl-3.5 text-left active:bg-fill-1',
                                  'motion-safe:transition-colors motion-safe:duration-[var(--dur-fast)]',
                                  FOCUS_IN
                                )}
                              >
                                <QueueRowContent
                                  r={r}
                                  subLabel={!s.sub ? s.shortOf(r.subholdingId) : null}
                                  thumb={46}
                                  now={now}
                                  trailing={
                                    <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                      {r.status === 'MENUNGGU' ? (
                                        <span className={cx('t-caption tabular-nums', days >= LONG_WAIT_DAYS ? 'font-bold text-waspada' : 'text-ink-2')}>
                                          {ageLabel(days)}
                                        </span>
                                      ) : null}
                                      <Icon name="kanan" size={14} strokeWidth={2.4} className="text-ink-3" />
                                    </span>
                                  }
                                />
                              </button>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      {sheet ? (
        <PickerSheet
          title="Pilih subholding"
          searchLabel="Cari subholding"
          sections={sections}
          query={query}
          onQuery={setQuery}
          onPick={(f) => s.pickSub(f.sub)}
          onClosed={() => setSheet(false)}
        />
      ) : null}

      {open ? (
        <ReviewScreen
          s={s}
          startId={open}
          now={now}
          onPhoto={openPhoto}
          onClosed={() => {
            setLightbox(null)
            setOpen(null)
          }}
        />
      ) : null}

      <EvidenceLightbox state={lightbox} onChange={setLightbox} />
    </MotionConfig>
  )
}

function Done({ s }: { s: ReviewState }) {
  const recap = todayRecap(s.today)
  return (
    <motion.section
      aria-label="Antrean habis"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={NAV_SPRING}
      className="mt-6 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center"
    >
      <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-sukses-soft text-sukses">
        <Icon name="selesai" size={30} strokeWidth={2.6} />
      </span>
      <h2 className="m-0 t-title-3 font-bold text-ink">Semua sudah ditinjau</h2>
      <p className="m-0 t-body font-normal text-ink-2">
        {recap?.line ?? 'Tidak ada laporan yang menunggu. Laporan baru dari admin subholding muncul di sini otomatis.'}
      </p>
      {recap && s.today ? <Recap t={s.today} /> : null}
      {s.counts.PERLU_PERBAIKAN > 0 ? (
        <button
          type="button"
          onClick={() => s.pickTab('PERLU_PERBAIKAN')}
          className={cx('mt-1 min-h-11 rounded-full px-4 t-body-strong text-accent', FOCUS)}
        >
          Lihat yang diminta perbaikan
        </button>
      ) : null}
    </motion.section>
  )
}

/* ---------- Rincian layar penuh ---------- */

function ReviewScreen({
  s,
  startId,
  now,
  onPhoto,
  onClosed,
}: {
  s: ReviewState
  startId: string
  now: Date
  onPhoto: (r: ShReport, index: number) => void
  onClosed: () => void
}) {
  const reduce = useReducedMotion()
  const [width] = useState(() => (typeof window === 'undefined' ? 390 : window.innerWidth))
  const x = useMotionValue(reduce ? 0 : width)
  const fade = useMotionValue(reduce ? 0 : 1)
  const closing = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const controls = useDragControls()
  const scrim = useTransform(() => Math.min(Math.max(1 - x.get() / width, 0), 1) * fade.get() * 0.6)
  const [cur, setCur] = useState(startId)
  const [dir, setDir] = useState<1 | -1>(1)
  // Laporan terakhir yang tampil: tetap dirender selama animasi tutup walau sudah keluar dari antrean.
  const found = s.items.find((r) => r.id === cur) ?? null
  const [last, setLast] = useState<ShReport | null>(found)
  if (found && found !== last) setLast(found)
  const r = found ?? last

  useEffect(() => {
    const c = reduce ? animate(fade, 1, FADE) : animate(x, 0, NAV_SPRING)
    return () => c.stop()
  }, [])

  function close(velocity = 0) {
    closing.current = true
    const done = () => {
      if (closing.current) onClosed()
    }
    if (reduce) animate(fade, 0, { ...FADE, onComplete: done })
    else animate(x, width, { ...NAV_SPRING, velocity: Math.max(velocity, 0), onComplete: done })
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const v = info.velocity.x
    if (shouldDismiss(x.get(), v, width)) close(v)
    else animate(x, 0, reduce ? FADE : { ...NAV_SPRING, velocity: v })
  }

  function go(id: string | null, d: 1 | -1) {
    if (!id) return
    setDir(d)
    setCur(id)
  }

  function onDecided(id: string) {
    const next = s.decided(id)
    if (next) go(next, 1)
    else close()
  }

  if (!r) return null
  const idx = s.items.findIndex((x) => x.id === r.id)
  const prev = neighborId(s.items, r.id, -1)
  const next = neighborId(s.items, r.id, 1)

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div className="fixed inset-0 z-[var(--z-scrim)] bg-scrim" style={{ opacity: scrim }} />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            titleRef.current?.focus({ preventScroll: true })
          }}
        >
          <motion.div
            drag="x"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ left: 0 }}
            dragElastic={{ left: 0, right: 0 }}
            dragMomentum={false}
            onDragStart={() => {
              closing.current = false
            }}
            onDragEnd={onDragEnd}
            style={{ x, opacity: fade }}
            className="fixed inset-0 z-[var(--z-scrim)] flex flex-col overflow-hidden bg-bg shadow-[var(--shadow-sheet)] outline-none"
          >
            <div className="relative z-[2] flex flex-none items-center gap-1 bg-glass px-2 pb-1.5 pt-[calc(6px+env(safe-area-inset-top))] shadow-[inset_0_-1px_0_var(--line)] backdrop-blur-[20px] backdrop-saturate-[1.8]">
              <button
                type="button"
                onClick={() => close()}
                className={cx('t-body-lg inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-[var(--radius-sm)] pl-1 pr-2 text-accent', FOCUS)}
              >
                <Icon name="kiri" size={22} strokeWidth={2.4} />
                Antrean
              </button>
              <span className="min-w-0 flex-1 text-center t-footnote font-semibold tabular-nums text-ink-2" aria-live="polite">
                {positionText(idx, s.items.length)}
              </span>
              <ScreenNav label="Laporan sebelumnya" icon="naik" disabled={!prev} onClick={() => go(prev, -1)} />
              <ScreenNav label="Laporan berikutnya" icon="bawah" disabled={!next} onClick={() => go(next, 1)} />
            </div>

            <div className="relative min-h-0 flex-1">
              <AnimatePresence initial={false} custom={dir}>
                <motion.div
                  key={r.id}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({ x: reduce ? 0 : d * 48, opacity: 0 }),
                    center: { x: 0, opacity: 1 },
                    exit: (d: number) => ({ x: reduce ? 0 : -d * 48, opacity: 0 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ x: NAV_SPRING, opacity: { duration: 0.2 } }}
                  className="absolute inset-0"
                >
                  <ScreenBody
                    r={r}
                    s={s}
                    now={now}
                    titleRef={r.id === startId ? titleRef : undefined}
                    onPhoto={(i) => onPhoto(r, i)}
                    onDecided={onDecided}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Zona tepi kiri: mulai geser-kembali. Di bawah bilah atas supaya tombol kembali tetap bisa diketuk. */}
            <div
              aria-hidden
              className="absolute bottom-0 left-0 top-14 z-[3] touch-pan-y"
              style={{ width: EDGE_WIDTH }}
              onPointerDown={(e) => controls.start(e)}
            />
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ScreenNav({ label, icon, disabled, onClick }: { label: string; icon: 'naik' | 'bawah'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent disabled:text-ink-3',
        'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:active:scale-[0.9]',
        FOCUS
      )}
    >
      <Icon name="bawah" size={18} strokeWidth={2.6} className={icon === 'naik' ? 'rotate-180' : undefined} />
    </button>
  )
}

function ScreenBody({
  r,
  s,
  now,
  titleRef,
  onPhoto,
  onDecided,
}: {
  r: ShReport
  s: ReviewState
  now: Date
  titleRef?: React.RefObject<HTMLHeadingElement | null>
  onPhoto: (i: number) => void
  onDecided: (id: string) => void
}) {
  const d = useDecision(r, { onDecided: (id) => onDecided(id), onCommented: s.reload, onStale: s.reload })
  const sent = sentLine(r, now)
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3.5 pt-3.5 pb-8">
          <div className="flex flex-col gap-2 px-4">
            <span className="inline-flex min-w-0 items-center gap-2 t-footnote text-ink-2">
              <SubMono id={r.subholdingId} name={r.subholdingName} size={22} />
              <span className="min-w-0 truncate">
                <strong className="font-semibold text-ink">{subholdingLabel(r.subholdingName)}</strong> · {r.ptName.replace(/^PT\.?\s+/i, '')}
              </span>
            </span>
            <DialogPrimitive.Title asChild>
              <h2 ref={titleRef} tabIndex={-1} className="m-0 t-title-3 font-bold text-ink outline-none">
                {r.kegiatan}
              </h2>
            </DialogPrimitive.Title>
            <span className="t-footnote text-ink-2">
              {sent.text}
              {sent.wait ? <span className={sent.warn ? 'font-semibold text-waspada' : undefined}>{sent.wait}</span> : null}
            </span>
            <PdfLink reportId={r.id} title={r.kegiatan} className="mt-1 min-h-11 self-start" />
          </div>
          <div className="px-4">
            <HighlightNote r={r} />
          </div>
          <EvidenceGallery r={r} onOpen={onPhoto} />
          <div className="flex flex-col gap-3.5 px-4">
            <Facts r={r} stacked />
            <Description r={r} />
            <Thread r={r} onEdited={s.reload} />
            <HighlightCard d={d} compact />
            <CommentField d={d} inlineSend />
            <DecidedNote r={r} />
          </div>
        </div>
      </div>
      {d.gate.decidable ? (
        <div
          role="group"
          aria-label="Keputusan"
          className="flex flex-none flex-col gap-2 bg-glass px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[inset_0_1px_0_var(--line)] backdrop-blur-[20px] backdrop-saturate-[1.8]"
        >
          <div className="flex gap-2">
            <ReviseButton d={d} className="min-h-[50px] min-w-0 flex-1 px-3 t-body-strong" />
            <ApproveButton d={d} className="min-h-[50px] min-w-0 flex-1 px-3 t-body-strong" />
          </div>
          <DecisionHint d={d} className="text-center" />
        </div>
      ) : null}
    </div>
  )
}
