'use client'

/**
 * Foto bukti di layar ponsel: miniatur dekoratif di dalam baris/kartu
 * (bukan tombol — baris itulah tombolnya), slide galeri rincian, dan baris
 * dokumen. Semua gambar memakai URL bertanda tangan (useSignedUrl); tidak
 * ada gambar pengganti berwarna.
 */

import { useState } from 'react'
import { Icon, Skeleton, cx } from '@/components/mk'
import { useSignedUrl } from '../evidence'
import { docActionLabel, photoAlt } from '../detail-logic'
import { docsOf, photosOf, type OverviewEvidence } from '../logic'

/** Miniatur foto pertama laporan; dokumen saja → ikon; tanpa bukti → tidak dirender. */
export function PhotoTile({ evidence, className }: { evidence: OverviewEvidence[] | undefined; className: string }) {
  const photo = photosOf(evidence)[0] ?? null
  const hasDoc = docsOf(evidence).length > 0
  const { url, failed, loading } = useSignedUrl(photo?.id ?? null, Boolean(photo))
  const [broken, setBroken] = useState(false)
  if (!photo && !hasDoc) return null
  return (
    <span aria-hidden className={cx('relative flex flex-none items-center justify-center overflow-hidden bg-fill-1 text-ink-2', className)}>
      {photo && url && !failed && !broken ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : photo && loading ? (
        <Skeleton h="100%" r={0} className="absolute inset-0" />
      ) : (
        <Icon name="dokumen" size={18} />
      )}
    </span>
  )
}

/** Satu slide galeri rincian (lebar penuh, 4:3). Ketuk → lightbox. */
export function GallerySlide({
  item,
  index,
  count,
  kegiatan,
  onOpen,
}: {
  item: OverviewEvidence
  index: number
  count: number
  kegiatan: string
  onOpen: () => void
}) {
  const { url, failed, loading } = useSignedUrl(item.id)
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Perbesar foto ${index + 1} dari ${count}`}
      className="relative aspect-[4/3] w-full flex-none cursor-zoom-in snap-start snap-always overflow-hidden bg-fill-1 text-ink-2 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--focus)]"
    >
      {url && !failed && !broken ? (
        <img
          src={url}
          alt={photoAlt(index, count, kegiatan)}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : loading ? (
        <Skeleton h="100%" r={0} className="absolute inset-0" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="dokumen" size={28} />
          <span className="t-footnote">Foto belum bisa dimuat</span>
        </span>
      )}
    </button>
  )
}

/** Baris dokumen di rincian: tautan bertanda tangan ke berkas/tautan. */
export function DocRow({ item, first }: { item: OverviewEvidence; first: boolean }) {
  const { url, kind, failed, loading } = useSignedUrl(item.id)
  const body = (
    <>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[var(--radius-sm)] bg-fill-1 text-ink-2" aria-hidden>
        <Icon name="dokumen" size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-body truncate text-ink">{item.fileName}</span>
        <span className={cx('t-caption font-normal', failed ? 'text-ink-2' : 'text-accent')}>
          {failed ? 'Belum bisa dibuka' : loading ? 'Menyiapkan tautan' : docActionLabel(kind)}
        </span>
      </span>
      {url && !failed ? <Icon name={kind === 'link' ? 'kanan' : 'unduh'} size={18} className="text-ink-3" /> : null}
    </>
  )
  const base = cx(
    'flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-left',
    !first && 'shadow-[inset_0_1px_0_var(--line)]',
  )
  if (url && !failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(base, 'active:bg-fill-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]')}
      >
        {body}
      </a>
    )
  }
  return <div className={base}>{body}</div>
}
