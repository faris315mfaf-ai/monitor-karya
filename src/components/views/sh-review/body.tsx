'use client'

/**
 * Isi rincian laporan Supervisor yang dipakai panel tablet dan layar ponsel
 * (papan S-Tablet-* & S-Ponsel-Rincian): galeri bukti, catatan sorotan,
 * data pelapor, deskripsi, percakapan, dan status keputusan. Foto memakai
 * URL bertanda tangan bersama (evidence.tsx) dan dibuka di lightbox.
 */

import { useState } from 'react'
import { Icon, Skeleton, cx } from '@/components/mk'
import { useSignedUrl } from '../sh-overview/evidence'
import { CommentBody } from './comment-edit'
import { isImageMime, photosOf, toneOf, toneVars, type OverviewEvidence } from '../sh-overview/logic'
import { slideIndex } from '../sh-overview/mobile/mobile-logic'
import { Star } from './decision'
import { commentWho, isHighlighted, reportDateLabel, type ShReport } from './logic'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const PRESS = 'motion-safe:transition-transform motion-safe:duration-[var(--dur-fast)] motion-safe:ease-[var(--ease-standard)] motion-safe:active:scale-[0.98]'

export function evidenceOf(r: ShReport): OverviewEvidence[] {
  return (r.evidence ?? []).map((e) => ({ id: e.id, fileName: e.fileName, mime: e.mime ?? null }))
}

/** Lingkaran inisial bernada subholding. */
export function SubMono({ id, name, size, text }: { id: string | null; name: string; size: number; text?: string }) {
  const t = id ? toneVars(toneOf(id)) : { fg: 'var(--ink-2)', bg: 'var(--fill-2)' }
  return (
    <span
      aria-hidden
      className={cx('flex shrink-0 items-center justify-center rounded-full font-bold', size >= 28 ? 't-footnote' : 't-caption')}
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
    >
      {text ?? (name.replace(/^(sub-?holding|pt\.?)\s+/i, '').trim().charAt(0).toUpperCase() || '?')}
    </span>
  )
}

/* ---------- Gambar bukti ---------- */

/** Isi kotak bukti: foto asli (memudar masuk saat termuat) atau ikon dokumen + nama. */
export function EvidenceFill({ item, showName, iconSize = 22, size = 'full' }: { item: OverviewEvidence; showName?: boolean; iconSize?: number; size?: 'thumb' | 'full' }) {
  const image = isImageMime(item.mime)
  const { url, failed, loading } = useSignedUrl(item.id, image, size)
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const show = image && Boolean(url) && !failed && !broken
  return (
    <>
      {show ? (
        <img
          src={url ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cx(
            'absolute inset-0 h-full w-full object-cover',
            loaded ? 'opacity-100' : 'opacity-0',
            'motion-safe:transition-opacity motion-safe:duration-[var(--dur-base)] motion-safe:ease-[var(--ease-standard)]'
          )}
        />
      ) : null}
      {image && (loading || (show && !loaded)) ? <Skeleton h="100%" r={0} className="absolute inset-0" /> : null}
      {!show && !(image && loading) ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-ink-2">
          <Icon name="dokumen" size={iconSize} />
          {showName ? <span className="t-footnote max-w-full truncate font-semibold text-ink">{item.fileName}</span> : null}
        </span>
      ) : null}
    </>
  )
}

/** Gambar kecil di baris antrean: foto pertama, atau ikon dokumen. */
export function QueueThumb({ r, size }: { r: ShReport; size: number }) {
  const all = evidenceOf(r)
  const first = photosOf(all)[0] ?? all[0] ?? null
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden bg-fill-1 shadow-[inset_0_0_0_1px_var(--line)]"
      style={{ width: size, height: size, borderRadius: size >= 48 ? 10 : 9 }}
    >
      {first ? <EvidenceFill item={first} iconSize={18} size="thumb" /> : (
        <span className="absolute inset-0 flex items-center justify-center text-ink-3">
          <Icon name="dokumen" size={18} />
        </span>
      )}
    </span>
  )
}

/** Deretan bukti panel tablet: foto pertama lebih lebar, geser horizontal. */
export function EvidenceStrip({ r, onOpen }: { r: ShReport; onOpen: (index: number) => void }) {
  const items = evidenceOf(r)
  if (!items.length) return <NoEvidence />
  return (
    <section aria-label={`Bukti, ${items.length} berkas`} className="-mx-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 pb-0.5 [scroll-padding-inline:24px] [scrollbar-width:none]">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`Perbesar bukti ${i + 1} dari ${items.length}: ${it.fileName}`}
          className={cx(
            'relative h-[168px] shrink-0 snap-start cursor-zoom-in overflow-hidden rounded-[var(--radius-md)] bg-fill-1 shadow-[inset_0_0_0_1px_var(--line)]',
            i === 0 ? 'w-[300px]' : 'w-[200px]',
            PRESS,
            FOCUS
          )}
        >
          <EvidenceFill item={it} showName />
          {i === 0 && items.length > 1 ? (
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex min-h-6 items-center rounded-full bg-[rgba(0,0,0,0.55)] px-2.5 t-caption font-semibold text-[var(--putih)] backdrop-blur-[12px]">
              {items.length} berkas
            </span>
          ) : null}
        </button>
      ))}
    </section>
  )
}

/** Galeri ponsel: kartu geser selebar layar dengan penanda n/N. */
export function EvidenceGallery({ r, onOpen }: { r: ShReport; onOpen: (index: number) => void }) {
  const items = evidenceOf(r)
  const [index, setIndex] = useState(0)
  if (!items.length) return <div className="px-4"><NoEvidence /></div>
  return (
    <section aria-label={`Bukti, ${items.length} berkas`} className="relative">
      <div
        onScroll={(e) => {
          const el = e.currentTarget
          // Lebar satu kartu + jarak 8px.
          const next = slideIndex(el.scrollLeft, (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth, items.length)
          if (next !== index) setIndex(next)
        }}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 [scroll-padding-inline:16px] [scrollbar-width:none]"
      >
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Perbesar bukti ${i + 1} dari ${items.length}: ${it.fileName}`}
            className={cx(
              'relative aspect-[326/210] shrink-0 snap-start cursor-zoom-in overflow-hidden rounded-[var(--radius-md)] bg-fill-1',
              items.length > 1 ? 'w-[calc(100%-24px)]' : 'w-full',
              FOCUS
            )}
          >
            <EvidenceFill item={it} showName iconSize={28} />
          </button>
        ))}
      </div>
      {items.length > 1 ? (
        <span
          aria-live="polite"
          className="pointer-events-none absolute right-7 top-2.5 inline-flex min-h-6 items-center rounded-full bg-[rgba(0,0,0,0.55)] px-2.5 t-caption font-semibold tabular-nums text-[var(--putih)] backdrop-blur-[12px]"
        >
          {Math.min(index + 1, items.length)}/{items.length}
        </span>
      ) : null}
    </section>
  )
}

function NoEvidence() {
  return (
    <p className="m-0 flex items-center gap-2 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3 t-callout font-semibold text-waspada">
      <Icon name="peringatan" size={16} strokeWidth={2.2} className="shrink-0" />
      Belum ada bukti terlampir. Laporan ini belum bisa disetujui.
    </p>
  )
}

/* ---------- Teks ---------- */

/** Catatan sorotan pada laporan yang sudah disetujui & disorot. */
export function HighlightNote({ r }: { r: ShReport }) {
  if (!isHighlighted(r) || !r.highlightNote) return null
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-waspada-soft px-3.5 py-3">
      <span className="inline-flex items-center gap-1.5 t-caption font-bold text-waspada">
        <Star size={12} />
        Sorotan · catatan untuk manajemen
      </span>
      <p className="m-0 t-body whitespace-pre-line break-words text-ink">{r.highlightNote}</p>
    </div>
  )
}

/** PT, pelapor, tanggal laporan. `stacked`: label kiri, nilai kanan (ponsel). */
export function Facts({ r, stacked }: { r: ShReport; stacked?: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ['PT pelaksana', r.ptName || '—'],
    [
      'Pelapor',
      stacked ? (
        <>
          {r.reporterName || '—'}
          {r.reporterTitle ? <span className="block font-normal text-ink-2">{r.reporterTitle}</span> : null}
        </>
      ) : (
        <>
          {r.reporterName || '—'}
          {r.reporterTitle ? <span className="font-normal text-ink-2"> · {r.reporterTitle}</span> : null}
        </>
      ),
    ],
    ['Tanggal laporan', reportDateLabel(r.reportDate)],
  ]
  if (stacked) {
    return (
      <dl className="m-0 flex flex-col border-t border-line t-callout">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-2.5">
            <dt className="shrink-0 font-normal text-ink-2">{k}</dt>
            <dd className="m-0 min-w-0 text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <dl className="m-0 grid grid-cols-[132px_1fr] border-t border-line t-callout">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="border-b border-line py-2.5 font-normal text-ink-2">{k}</dt>
          <dd className="m-0 min-w-0 border-b border-line py-2.5 font-medium break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Deskripsi laporan. */
export function Description({ r }: { r: ShReport }) {
  if (!r.deskripsi?.trim()) return null
  return <p className="m-0 t-body-lg whitespace-pre-line break-words text-ink">{r.deskripsi}</p>
}

/** Percakapan: milik sendiri di kanan (biru lembut, bisa diubah), lawan bicara di kiri. */
export function Thread({ r, onEdited }: { r: ShReport; onEdited?: () => void }) {
  if (!r.comments?.length) return null
  return (
    <section aria-label="Percakapan" className="flex flex-col gap-2">
      <h3 className="m-0 t-body-strong font-bold text-ink">Percakapan</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.comments.map((c) => (
          <li
            key={c.id}
            className={cx(
              'flex max-w-[86%] flex-col gap-0.5 rounded-[var(--radius-md)] px-3 py-2.5',
              c.mine ? 'self-end bg-info-soft' : 'self-start bg-surface shadow-[var(--shadow-card)]'
            )}
          >
            <span className="t-caption font-normal text-ink-2">{commentWho(c)}</span>
            <CommentBody
              reportId={r.id}
              comment={c}
              onSaved={onEdited}
              className="t-callout font-normal whitespace-pre-line break-words text-ink"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Keterangan status laporan yang sudah diputuskan. */
export function DecidedNote({ r }: { r: ShReport }) {
  if (r.status === 'MENUNGGU') return null
  const ok = r.status === 'DISETUJUI'
  return (
    <p className={cx('m-0 flex items-start gap-2 rounded-[var(--radius-md)] px-3.5 py-3 t-callout font-semibold', ok ? 'bg-sukses-soft text-sukses' : 'bg-waspada-soft text-waspada')}>
      <Icon name={ok ? 'selesai' : 'waktu'} size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
      {ok
        ? isHighlighted(r)
          ? 'Disetujui. Tampil di Sorotan dashboard Manajemen & Superuser.'
          : 'Disetujui. Tampil di dashboard Manajemen & Superuser.'
        : 'Menunggu admin subholding memperbaiki dan mengirim ulang.'}
    </p>
  )
}
