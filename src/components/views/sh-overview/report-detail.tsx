'use client'

/**
 * Pop-up rincian laporan subholding (kontrak minimalis, 15 Okt 2026).
 *
 * ≥600px: dialog di tengah (lebar maks 1000) dua kolom yang membungkus —
 * kiri foto (besar 4:3 + lencana "Foto 1 dari 3" + deretan pilih foto bila
 * lebih dari satu), kanan info. Tanpa foto → hanya kolom info (maks 560).
 * <600px: lembar dari bawah setinggi layar dikurangi 48px, foto di atas.
 * Info: inisial + nama subholding & tombol Tutup, judul, blok "Catatan
 * supervisor" bila laporan disorot (16 Okt 2026), daftar bergaris
 * (PT pelaksana, Pelapor, Disetujui, Bukti — baris kosong disembunyikan),
 * deskripsi utuh, lalu dokumen yang dibuka di tab baru. Bila `pdfHref` diberikan,
 * baris aksi "Lihat PDF" (tab baru) tampil di bawah judul.
 *
 * Radix Dialog menjaga fokus (terkunci, kembali ke pemicu), Esc, klik latar,
 * dan kunci gulir halaman. Animasi masuk lewat @starting-style, hanya bila
 * pengguna tidak meminta gerak dikurangi.
 */

import { useId, useRef, useState, type RefObject } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Icon, IconButton, Skeleton, cx } from '@/components/mk'
import { EvidenceThumb, useSignedUrl } from './evidence'
import { docsOf, heroLabel, initialOf, photosOf, toneVars, type OverviewEvidence } from './logic'
import { approvedLabel, buktiLabel, clampIndex, docActionLabel, photoAlt } from './detail-logic'
import { PdfButton } from './pdf-link'

export type DetailReport = {
  id: string
  kegiatan: string
  deskripsi: string
  ptName: string
  subholdingName: string
  tone: 1 | 2 | 3 | 4 | 5 | 6
  evidence: OverviewEvidence[]
  /** Nama pelapor; kosong/tidak ada → baris "Pelapor" disembunyikan. */
  reporterName?: string
  /** Label jabatan jadi, mis. "Manajer Proyek" (baris kedua di bawah nama). */
  reporterTitle?: string
  /** Waktu disetujui (ISO); kosong → baris "Disetujui" disembunyikan. */
  decidedAt?: string | null
  /** Ditandai supervisor untuk manajemen → blok "Catatan supervisor" di atas tabel. */
  highlight?: boolean
  highlightNote?: string | null
}

export function ReportDetail({
  report,
  onClose,
  onOpenPhoto,
  pdfHref,
}: {
  report: DetailReport | null
  onClose: () => void
  onOpenPhoto: (photoIndex: number) => void
  /** Alamat PDF laporan (shPdfHref); diisi → baris aksi "Lihat PDF" di bawah judul. */
  pdfHref?: (report: DetailReport) => string
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Judul baris pemicu dicatat sendiri: konten dirender bersyarat di dalam
  // overlay, sehingga pengembalian fokus bawaan Radix tidak sampai ke pemicu.
  const returnTo = useRef<HTMLElement | null>(null)
  const descId = useId()
  const hasPhoto = report ? photosOf(report.evidence).length > 0 : false

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
                'relative flex w-full flex-wrap content-start overflow-y-auto overscroll-contain bg-surface text-ink shadow-[var(--shadow-sheet)] outline-none',
                'h-[calc(100dvh-48px)] rounded-t-[var(--radius-xl)]',
                'min-[600px]:h-auto min-[600px]:max-h-full min-[600px]:rounded-[var(--radius-xl)] min-[600px]:border min-[600px]:border-line',
                hasPhoto ? 'min-[600px]:max-w-[1000px]' : 'min-[600px]:max-w-[560px]',
                'motion-safe:transition-[opacity,translate] motion-safe:duration-[var(--dur-slow)] motion-safe:ease-[var(--ease-standard)]',
                'motion-safe:starting:translate-y-full min-[600px]:motion-safe:starting:translate-y-4 min-[600px]:motion-safe:starting:opacity-0'
              )}
            >
              <DetailBody key={report.id} report={report} titleRef={titleRef} descId={descId} onOpenPhoto={onOpenPhoto} pdfHref={pdfHref} />
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
  pdfHref,
}: {
  report: DetailReport
  titleRef: RefObject<HTMLHeadingElement | null>
  descId: string
  onOpenPhoto: (photoIndex: number) => void
  pdfHref?: (report: DetailReport) => string
}) {
  const photos = photosOf(report.evidence)
  const docs = docsOf(report.evidence)
  const [picked, setPicked] = useState(0)
  const index = clampIndex(picked, photos.length)
  const hero = photos[index] ?? null
  const tone = toneVars(report.tone)

  const reporter = report.reporterName?.trim() ?? ''
  const reporterTitle = report.reporterTitle?.trim() ?? ''
  const rows: Array<{ key: string; label: string; value: string; sub?: string }> = [
    { key: 'pt', label: 'PT pelaksana', value: report.ptName.trim() },
    { key: 'pelapor', label: 'Pelapor', value: reporter, sub: reporterTitle || undefined },
    { key: 'disetujui', label: 'Disetujui', value: approvedLabel(report.decidedAt) },
    { key: 'bukti', label: 'Bukti', value: buktiLabel(photos.length, docs.length) },
  ].filter((r) => r.value)

  return (
    <>
      {hero ? (
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5 p-2.5 min-[600px]:p-3">
          <HeroPhoto
            key={hero.id}
            item={hero}
            index={index}
            length={photos.length}
            kegiatan={report.kegiatan}
            onOpen={() => onOpenPhoto(index)}
          />
          {photos.length > 1 ? (
            <div role="group" aria-label="Foto bukti" className="scrollbar-thin flex gap-2 overflow-x-auto px-1 py-1">
              {photos.map((p, i) => (
                <EvidenceThumb
                  key={p.id}
                  item={p}
                  size="strip"
                  pressed={i === index}
                  onOpen={() => setPicked(i)}
                  label={`Tampilkan foto ${i + 1} dari ${photos.length}`}
                  className={cx(
                    'my-0.5',
                    i === index ? 'outline-2 outline-offset-2 outline-[var(--ink)]' : 'opacity-50 hover:opacity-100'
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cx(
          'flex min-w-0 flex-[1_1_340px] flex-col gap-4 px-5 pt-5 pb-[calc(var(--space-8)+env(safe-area-inset-bottom))]',
          'min-[600px]:gap-[18px] min-[600px]:px-[30px] min-[600px]:pt-7 min-[600px]:pb-[30px]'
        )}
      >
        <div className="-my-1.5 flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 t-callout text-ink-2">
            <span
              aria-hidden
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full t-caption font-bold!"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {initialOf(report.subholdingName)}
            </span>
            <span className="min-w-0 truncate">{report.subholdingName}</span>
          </span>
          <DialogPrimitive.Close asChild>
            <IconButton icon="tutup" label="Tutup" variant="filled" className="-mr-2 shrink-0" />
          </DialogPrimitive.Close>
        </div>

        <DialogPrimitive.Title
          ref={titleRef}
          tabIndex={-1}
          className="m-0 break-words text-ink outline-none [font:var(--text-title-3)] tracking-[-0.01em] min-[600px]:[font:var(--text-title-2)] min-[600px]:tracking-[-0.02em]"
        >
          {report.kegiatan}
        </DialogPrimitive.Title>

        {pdfHref ? (
          <div className="flex flex-wrap items-center gap-2">
            <PdfButton href={pdfHref(report)}>Lihat PDF</PdfButton>
          </div>
        ) : null}

        {report.highlight ? <SupervisorNote note={report.highlightNote} /> : null}

        {rows.length ? (
          <dl className="m-0 flex flex-col border-t border-line">
            {rows.map((r) => (
              <div key={r.key} className="flex items-start justify-between gap-4 border-b border-line py-[11px] t-callout">
                <dt className="shrink-0 text-ink-2 font-normal!">{r.label}</dt>
                <dd className="m-0 min-w-0 break-words text-right text-ink">
                  {r.value}
                  {r.sub ? <span className="block text-ink-2 font-normal!">{r.sub}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {report.deskripsi.trim() ? (
          <DialogPrimitive.Description id={descId} className="m-0 whitespace-pre-line break-words t-body-lg text-ink">
            {report.deskripsi}
          </DialogPrimitive.Description>
        ) : null}

        {docs.length ? (
          <ul aria-label="Dokumen" className="m-0 flex list-none flex-col gap-2 p-0">
            {docs.map((d) => (
              <DocRow key={d.id} item={d} />
            ))}
          </ul>
        ) : null}
      </div>
    </>
  )
}

/** Blok sorotan: catatan supervisor untuk manajemen, berwarna waspada (bintang + kata, bukan warna saja). */
function SupervisorNote({ note }: { note?: string | null }) {
  const text = note?.trim() ?? ''
  return (
    <section
      aria-label="Catatan supervisor"
      className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3"
    >
      <span className="inline-flex items-center gap-1.5 t-caption font-bold text-waspada">
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor" className="shrink-0">
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.5l1.3-6.6L2.5 9.4l6.6-.8z" />
        </svg>
        Catatan supervisor
      </span>
      <p className="m-0 whitespace-pre-line break-words t-callout font-normal leading-[1.5] text-ink">
        {text || 'Ditandai penting oleh supervisor untuk manajemen.'}
      </p>
    </section>
  )
}

/** Foto besar 4:3: gambar asli lewat URL bertanda tangan, kerangka saat dimuat, ikon bila gagal. */
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
        'relative block aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] bg-fill-1 p-0 cursor-zoom-in',
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
        className="absolute bottom-3 left-3 inline-flex min-h-[26px] items-center rounded-full bg-glass px-2.5 t-caption font-semibold! text-ink backdrop-blur-[12px]"
      >
        {heroLabel(index, length)}
      </span>
    </button>
  )
}

/** Baris dokumen: membuka URL bertanda tangan di tab baru (tautan disiapkan saat pop-up dibuka). */
function DocRow({ item }: { item: OverviewEvidence }) {
  const { url, kind, failed, loading } = useSignedUrl(item.id)
  const k = item.kind ?? kind
  const row = 'flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] bg-fill-1 px-3.5 py-2 t-callout'
  const icon = <Icon name="dokumen" size={18} className="shrink-0 text-ink-2" />

  return (
    <li>
      {url && !failed ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${docActionLabel(k)}: ${item.fileName} (tab baru)`}
          className={cx(
            row,
            'text-ink no-underline hover:bg-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
          <span className="shrink-0 t-footnote text-ink-2">Buka</span>
        </a>
      ) : (
        <div className={cx(row, 'text-ink')}>
          {icon}
          <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
          <span className="shrink-0 t-footnote text-ink-2" aria-live="polite">
            {loading ? 'Menyiapkan tautan' : 'Belum bisa dibuka'}
          </span>
        </div>
      )}
    </li>
  )
}
