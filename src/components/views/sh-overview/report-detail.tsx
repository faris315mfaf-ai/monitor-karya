'use client'

/**
 * Pop-up rincian laporan subholding (kontrak Opsi A "Mosaik", 15 Okt 2026).
 *
 * ≥600px: dialog di tengah (lebar maks 760) di atas latar redup + blur.
 * <600px: lembar dari bawah setinggi layar dikurangi 48px, dengan pegangan.
 * Isi: foto besar + lencana "Foto 1 dari 3" (klik → lightbox pada foto itu),
 * deretan thumbnail pilih foto, chip subholding & PT, judul, deskripsi utuh,
 * lalu daftar "Dokumen" untuk bukti bukan gambar. Tanpa status/komentar/pelapor.
 *
 * Radix Dialog menjaga fokus (terkunci, kembali ke pemicu), Esc, klik latar,
 * dan kunci gulir halaman. Animasi masuk lewat @starting-style, hanya bila
 * pengguna tidak meminta gerak dikurangi.
 */

import { useId, useRef, useState, type RefObject } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Icon, Skeleton, cx } from '@/components/mk'
import { EvidenceThumb, useSignedUrl } from './evidence'
import { docsOf, heroLabel, initialOf, photosOf, toneVars, type OverviewEvidence } from './logic'
import { clampIndex, docActionLabel, photoAlt } from './detail-logic'

export type DetailReport = {
  id: string
  kegiatan: string
  deskripsi: string
  ptName: string
  subholdingName: string
  tone: 1 | 2 | 3 | 4 | 5 | 6
  evidence: OverviewEvidence[]
}

export function ReportDetail({
  report,
  onClose,
  onOpenPhoto,
}: {
  report: DetailReport | null
  onClose: () => void
  onOpenPhoto: (photoIndex: number) => void
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Judul baris pemicu dicatat sendiri: konten dirender bersyarat di dalam
  // overlay, sehingga pengembalian fokus bawaan Radix tidak sampai ke pemicu.
  const returnTo = useRef<HTMLElement | null>(null)
  const descId = useId()

  return (
    <DialogPrimitive.Root open={report !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        {/* Konten di dalam overlay: klik latar tetap "di luar" konten (menutup), gulir halaman terkunci. */}
        <DialogPrimitive.Overlay className="mk-scrim flex items-end justify-center backdrop-blur-md min-[600px]:items-center min-[600px]:p-8">
          {report ? (
            <DialogPrimitive.Content
              aria-describedby={report.deskripsi.trim() ? descId : undefined}
              onOpenAutoFocus={(e) => {
                returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                // Fokus ke judul: pembaca layar mulai dari nama laporan, bukan tombol foto.
                if (!titleRef.current) return
                e.preventDefault()
                titleRef.current.focus({ preventScroll: true })
              }}
              onCloseAutoFocus={(e) => {
                const el = returnTo.current
                returnTo.current = null
                if (el && el.isConnected) {
                  e.preventDefault()
                  el.focus({ preventScroll: true })
                }
              }}
              className={cx(
                'relative flex w-full flex-col overflow-y-auto overscroll-contain bg-surface text-ink shadow-[var(--shadow-sheet)] outline-none',
                'h-[calc(100dvh-48px)] rounded-t-[var(--radius-xl)]',
                'min-[600px]:h-auto min-[600px]:max-h-full min-[600px]:max-w-[760px] min-[600px]:rounded-[var(--radius-xl)] min-[600px]:border min-[600px]:border-line',
                'motion-safe:transition-[opacity,translate] motion-safe:duration-[var(--dur-slow)] motion-safe:ease-[var(--ease-standard)]',
                'motion-safe:starting:translate-y-full min-[600px]:motion-safe:starting:translate-y-4 min-[600px]:motion-safe:starting:opacity-0'
              )}
            >
              <DetailBody key={report.id} report={report} titleRef={titleRef} descId={descId} onOpenPhoto={onOpenPhoto} />
            </DialogPrimitive.Content>
          ) : null}
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Dipasang ulang per laporan (key = id), jadi pilihan foto kembali ke 0 saat laporan berganti. */
function DetailBody({
  report,
  titleRef,
  descId,
  onOpenPhoto,
}: {
  report: DetailReport
  titleRef: RefObject<HTMLHeadingElement | null>
  descId: string
  onOpenPhoto: (photoIndex: number) => void
}) {
  const photos = photosOf(report.evidence)
  const docs = docsOf(report.evidence)
  const [picked, setPicked] = useState(0)
  const index = clampIndex(picked, photos.length)
  const hero = photos[index] ?? null
  const tone = toneVars(report.tone)
  const docsHeadId = useId()

  const close = (
    <DialogPrimitive.Close asChild>
      <button
        type="button"
        aria-label="Tutup"
        className={cx(
          'absolute right-3 top-3 z-[1] flex h-11 w-11 items-center justify-center rounded-full cursor-pointer',
          'bg-glass text-ink shadow-[var(--shadow-float)] backdrop-blur-[20px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
        )}
      >
        <Icon name="tutup" size={18} strokeWidth={2.4} />
      </button>
    </DialogPrimitive.Close>
  )

  return (
    <>
      <span aria-hidden className="mx-auto mb-1.5 mt-2 h-[5px] w-10 shrink-0 rounded-full bg-fill-2 min-[600px]:hidden" />

      {hero ? (
        <>
          <div className="relative shrink-0 px-2.5 min-[600px]:px-3 min-[600px]:pt-3">
            <div className="relative">
              <HeroPhoto
                key={hero.id}
                item={hero}
                index={index}
                length={photos.length}
                kegiatan={report.kegiatan}
                onOpen={() => onOpenPhoto(index)}
              />
              {close}
            </div>
          </div>
          {photos.length > 1 ? (
            <div role="group" aria-label="Foto bukti" className="scrollbar-thin flex shrink-0 gap-2 overflow-x-auto px-2.5 pb-1 pt-2.5 min-[600px]:px-3 min-[600px]:pt-3">
              {photos.map((p, i) => (
                <EvidenceThumb
                  key={p.id}
                  item={p}
                  size="strip"
                  pressed={i === index}
                  onOpen={() => setPicked(i)}
                  label={`Tampilkan foto ${i + 1} dari ${photos.length}`}
                  className={cx(
                    'my-1',
                    i === index
                      ? 'outline-2 outline-offset-2 outline-[var(--ink)]'
                      : 'opacity-60 hover:opacity-100'
                  )}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        close
      )}

      <div
        className={cx(
          'flex flex-col gap-3.5 px-5 pt-5 pb-[calc(var(--space-8)+env(safe-area-inset-bottom))] min-[600px]:px-8 min-[600px]:pb-8 min-[600px]:pt-[22px]',
          !hero && 'pr-16 min-[600px]:pr-16 min-[600px]:pt-8'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-fill-1 py-1 pl-1 pr-3 t-callout font-semibold text-ink">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full t-caption font-extrabold"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {initialOf(report.subholdingName)}
            </span>
            <span className="min-w-0 truncate">{report.subholdingName}</span>
          </span>
          <span className="inline-flex min-h-8 max-w-full items-center rounded-full bg-fill-1 px-3 py-1 t-callout font-semibold text-ink-2">
            <span className="min-w-0 truncate">{report.ptName}</span>
          </span>
        </div>

        <DialogPrimitive.Title
          ref={titleRef}
          tabIndex={-1}
          className="m-0 break-words text-ink outline-none [font:var(--text-title-3)] tracking-[-0.01em] min-[600px]:[font:var(--text-title-2)] min-[600px]:tracking-[-0.02em]"
        >
          {report.kegiatan}
        </DialogPrimitive.Title>

        {report.deskripsi.trim() ? (
          <DialogPrimitive.Description id={descId} className="m-0 whitespace-pre-line break-words t-body-lg text-ink">
            {report.deskripsi}
          </DialogPrimitive.Description>
        ) : null}

        {docs.length ? (
          <section aria-labelledby={docsHeadId} className="flex flex-col gap-2 pt-2">
            <h3 id={docsHeadId} className="t-headline text-ink">
              Dokumen
            </h3>
            <ul className="m-0 list-none overflow-hidden rounded-[var(--radius-md)] bg-fill-1 p-0">
              {docs.map((d, i) => (
                <DocRow key={d.id} item={d} first={i === 0} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  )
}

/** Foto besar: gambar asli lewat URL bertanda tangan, kerangka saat dimuat, ikon bila gagal. */
function HeroPhoto({
  item,
  index,
  length,
  kegiatan,
  onOpen,
}: {
  item: OverviewEvidence
  index: number
  length: number
  kegiatan: string
  onOpen: () => void
}) {
  const { url, failed, loading } = useSignedUrl(item.id)
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  const alt = photoAlt(index, length, kegiatan)
  const showImg = Boolean(url) && !failed && !broken
  const waiting = loading || (showImg && !loaded)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Perbesar ${alt.charAt(0).toLowerCase()}${alt.slice(1)}`}
      className={cx(
        'relative block w-full overflow-hidden rounded-[var(--radius-lg)] bg-fill-1 p-0 cursor-zoom-in',
        'h-[270px] min-[600px]:h-[400px] min-[1024px]:h-[380px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
      )}
    >
      {showImg ? (
        <img
          src={url ?? undefined}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cx(
            'absolute inset-0 h-full w-full object-cover',
            loaded ? 'opacity-100' : 'opacity-0',
            'motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)] motion-safe:ease-[var(--ease-standard)]'
          )}
        />
      ) : null}
      {waiting ? <Skeleton h="100%" r={0} className="absolute inset-0" /> : null}
      {!waiting && !showImg ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-2">
          <Icon name="dokumen" size={32} />
          <span className="t-footnote">Foto belum bisa dimuat</span>
        </span>
      ) : null}
      <span
        aria-hidden
        className="absolute bottom-3 left-3 inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-glass px-3 t-caption font-semibold text-ink backdrop-blur-[12px]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        {heroLabel(index, length)}
      </span>
    </button>
  )
}

/** Baris dokumen: membuka URL bertanda tangan di tab baru (tautan disiapkan saat pop-up dibuka). */
function DocRow({ item, first }: { item: OverviewEvidence; first: boolean }) {
  const { url, kind, failed, loading } = useSignedUrl(item.id)
  const k = item.kind ?? kind
  const action = docActionLabel(k)
  const row = 'flex min-h-11 items-center gap-3 px-4 py-2.5'
  const icon = (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface text-ink-2">
      <Icon name="dokumen" size={18} />
    </span>
  )

  return (
    <li className={cx(!first && 'border-t border-line')}>
      {url && !failed ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${action}: ${item.fileName} (tab baru)`}
          className={cx(
            row,
            'text-ink no-underline hover:bg-fill-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]'
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate t-body-strong">{item.fileName}</span>
          <span className="inline-flex shrink-0 items-center gap-1 t-callout text-accent">
            {action}
            <Icon name={k === 'link' ? 'kanan' : 'unduh'} size={16} strokeWidth={2} />
          </span>
        </a>
      ) : (
        <div className={cx(row, 'text-ink')}>
          {icon}
          <span className="min-w-0 flex-1 truncate t-body-strong">{item.fileName}</span>
          <span className="shrink-0 t-footnote text-ink-2" aria-live="polite">
            {loading ? 'Menyiapkan tautan' : 'Belum bisa dibuka'}
          </span>
        </div>
      )}
    </li>
  )
}
