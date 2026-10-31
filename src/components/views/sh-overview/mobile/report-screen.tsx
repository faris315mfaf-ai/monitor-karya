'use client'

/**
 * Rincian laporan ponsel (papan M-Ponsel-Rincian): layar penuh didorong dari
 * kanan dengan pegas kritis, tombol kembali kiri atas, dan geser dari tepi kiri
 * untuk kembali. Seret dilacak 1:1; saat dilepas, proyeksi momentum memilih
 * selesai/batal dan kecepatan jari diteruskan ke pegas (velocity handoff).
 * Animasi tutup bisa direbut kembali dengan menyeret tepi lagi.
 * Gerak dikurangi → pudar, tanpa dorong.
 *
 * Isi: galeri foto geser (scroll-snap, penanda n/N, ketuk → lightbox), asal
 * laporan, judul, catatan supervisor (sorotan), deskripsi, tabel
 * PT/pelapor/disetujui, dan dokumen.
 */

import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import { Icon, cx } from '@/components/mk'
import { approvedLabel } from '../detail-logic'
import { displayName, docsOf, photosOf, subholdingLabel, toneOf, toneVars } from '../logic'
import type { FlatV2 } from '../model'
import { PdfButton } from '../pdf-link'
import { shPdfHref } from '@/lib/subholding/pdf-href'
import { DocRow, GallerySlide } from './photo'
import { EDGE_WIDTH, FADE, NAV_SPRING, counterLabel, monoOf, shouldDismiss, slideIndex } from './mobile-logic'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

export function ReportScreen({
  report,
  backLabel,
  onOpenPhoto,
  onClosed,
}: {
  report: FlatV2
  backLabel: string
  onOpenPhoto: (index: number) => void
  /** Dipanggil setelah animasi kembali selesai — pemanggil melepas layar. */
  onClosed: () => void
}) {
  const reduce = useReducedMotion()
  const [width] = useState(() => (typeof window === 'undefined' ? 390 : window.innerWidth))
  const x = useMotionValue(reduce ? 0 : width)
  const fade = useMotionValue(reduce ? 0 : 1)
  const closing = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const controls = useDragControls()
  // Layar di belakang meredup seiring layar rincian masuk (0 → 0,6 tirai).
  const scrim = useTransform(() => Math.min(Math.max(1 - x.get() / width, 0), 1) * fade.get() * 0.6)

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

  const photos = photosOf(report.evidence)
  const docs = docsOf(report.evidence)
  const tone = toneVars(toneOf(report.subId))
  const approved = approvedLabel(report.decidedAt ?? null)
  const note = report.highlight ? report.highlightNote?.trim() ?? '' : ''

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
            className="fixed inset-0 z-[var(--z-scrim)] flex flex-col bg-bg shadow-[var(--shadow-sheet)] outline-none"
          >
            <div className="flex flex-none items-center justify-between bg-glass px-2 pb-1.5 pt-[calc(8px+env(safe-area-inset-top))] shadow-[inset_0_-1px_0_var(--line)] backdrop-blur-[20px] backdrop-saturate-[1.8]">
              <button
                type="button"
                onClick={() => close()}
                className={cx('t-body-lg inline-flex min-h-11 items-center gap-0.5 rounded-[var(--radius-sm)] pl-1 pr-2 text-accent', FOCUS)}
              >
                <Icon name="kiri" size={20} strokeWidth={2.4} />
                <span className="max-w-[60vw] truncate">{backLabel}</span>
              </button>
              {report.highlight ? (
                <span className="t-caption mr-3 inline-flex items-center gap-1 font-semibold text-waspada">
                  <Star size={12} />
                  Sorotan
                </span>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
              {photos.length ? <Gallery report={report} onOpen={onOpenPhoto} /> : null}

              <div className="flex flex-col gap-3.5 px-5 pt-4">
                <span className="t-footnote inline-flex items-center gap-2 font-medium text-ink-2">
                  <span
                    aria-hidden
                    className="t-caption flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full font-bold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {monoOf(report.subName)}
                  </span>
                  <span className="min-w-0 truncate">{subholdingLabel(report.subName)}</span>
                </span>
                <DialogPrimitive.Title asChild>
                  <h2 ref={titleRef} tabIndex={-1} className="t-title-3 m-0 font-bold text-ink outline-none">
                    {report.kegiatan}
                  </h2>
                </DialogPrimitive.Title>

                {note ? (
                  <div className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3">
                    <span className="t-caption inline-flex items-center gap-1 font-bold text-waspada">
                      <Star size={11} />
                      Catatan supervisor
                    </span>
                    <span className="t-body whitespace-pre-line text-ink">{note}</span>
                  </div>
                ) : null}

                {report.deskripsi?.trim() ? (
                  <p className="t-body-lg m-0 whitespace-pre-line text-ink">{report.deskripsi}</p>
                ) : null}

                <dl className="t-body m-0 overflow-hidden rounded-[var(--radius-md)] bg-surface">
                  <Field label="PT" first>
                    {displayName(report.ptName)}
                  </Field>
                  {report.reporterName ? (
                    <Field label="Pelapor">
                      {report.reporterName}
                      {report.reporterTitle ? <span className="t-footnote block text-ink-2">{report.reporterTitle}</span> : null}
                    </Field>
                  ) : null}
                  {approved ? <Field label="Disetujui">{approved}</Field> : null}
                </dl>

                {docs.length ? (
                  <section aria-label="Dokumen" className="flex flex-col gap-1.5">
                    <span className="t-caption px-1 font-semibold text-ink-2">Dokumen · {docs.length}</span>
                    <div className="overflow-hidden rounded-[var(--radius-md)] bg-surface">
                      {docs.map((d, i) => (
                        <DocRow key={d.id} item={d} first={i === 0} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            {/* Dock bawah: Lihat PDF selalu terjangkau ibu jari (mockup layar D). */}
            <div className="flex flex-none items-center bg-glass px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[inset_0_1px_0_var(--line)] backdrop-blur-[20px] backdrop-saturate-[1.8]">
              <PdfButton href={shPdfHref({ id: report.id })} size="lg" full>
                Lihat PDF
              </PdfButton>
            </div>

            {/* Zona tepi kiri: mulai geser-kembali. Di bawah bilah atas supaya tombol kembali tetap bisa diketuk. */}
            <div
              aria-hidden
              className="absolute bottom-0 left-0 top-14 touch-pan-y"
              style={{ width: EDGE_WIDTH }}
              onPointerDown={(e) => controls.start(e)}
            />
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({ label, first, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx('flex justify-between gap-3 px-3.5 py-3', !first && 'shadow-[inset_0_1px_0_var(--line)]')}>
      <dt className="flex-none text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-ink">{children}</dd>
    </div>
  )
}

/** Galeri foto lebar penuh: geser (scroll-snap) dengan penanda n/N yang diumumkan. */
function Gallery({ report, onOpen }: { report: FlatV2; onOpen: (index: number) => void }) {
  const photos = photosOf(report.evidence)
  const [index, setIndex] = useState(0)
  return (
    <div className="relative">
      <div
        role="group"
        aria-roledescription="galeri"
        aria-label={`Foto bukti, ${photos.length} foto`}
        onScroll={(e) => {
          const el = e.currentTarget
          const next = slideIndex(el.scrollLeft, el.clientWidth, photos.length)
          if (next !== index) setIndex(next)
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
      >
        {photos.map((p, i) => (
          <GallerySlide key={p.id} item={p} index={i} count={photos.length} kegiatan={report.kegiatan} onOpen={() => onOpen(i)} />
        ))}
      </div>
      {photos.length > 1 ? (
        <span
          aria-live="polite"
          className="t-caption pointer-events-none absolute bottom-3 right-3 inline-flex min-h-6 items-center rounded-full bg-scrim px-2.5 font-semibold text-[var(--putih)] backdrop-blur-[12px]"
        >
          {counterLabel(index, photos.length)}
        </span>
      ) : null}
    </div>
  )
}

/** Bintang sorotan (isi warna peringatan). Dekoratif — kata "Sorotan" menyertainya. */
export function Star({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cx('flex-none', className)} fill="currentColor">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.5l1.3-6.6L2.5 9.4l6.6-.8z" />
    </svg>
  )
}
