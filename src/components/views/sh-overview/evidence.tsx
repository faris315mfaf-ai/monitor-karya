'use client'

/**
 * Bukti laporan subholding: thumbnail gambar nyata dan lightbox
 * (sebelumnya/berikutnya, Esc/tutup, fokus kembali ke pemicu). Dipakai
 * dashboard Superuser & Manajemen dan layar Persetujuan Supervisor.
 *
 * Berkas disimpan privat; tautannya diminta berkelompok ke
 * POST /api/evidence/signed (cadangan GET /api/evidence/:id; URL bertanda
 * tangan berlaku 5 menit) dan disimpan sebentar di memori supaya thumbnail,
 * pop-up rincian, dan lightbox tidak meminta dua kali. Kotak kecil meminta
 * `size: 'thumb'` (WebP 320px, Fase 1 PWA); lightbox & galeri besar `full`.
 */

import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button, Icon, IconButton, Skeleton, cx } from '@/components/mk'
import { isImageMime, keyDelta, positionLabel, stepIndex, type OverviewEvidence } from './logic'
import { createSignedFetcher, type SignedSize } from './detail-logic'

/* ---------- URL bertanda tangan ---------- */

/**
 * Satu pengambil untuk seluruh aplikasi: permintaan dari banyak thumbnail
 * dalam satu tick digabung ke POST /api/evidence/signed (≤60 id per kiriman),
 * dengan cadangan GET /api/evidence/:id bila endpoint itu belum tersedia.
 * Header JSON cukup — perlindungan CSRF memeriksa Origin di proxy.
 */
const signed = createSignedFetcher({ fetch: (input, init) => fetch(input, init) })

type SignedState = { id: string; size: SignedSize; url: string | null; kind: 'file' | 'link' | null; failed: boolean }

/**
 * URL bertanda tangan satu bukti; `enabled` false = jangan minta (mis. dokumen
 * di thumbnail). `size` 'thumb' untuk kotak kecil (server jatuh ke berkas asli
 * bila thumbnail belum ada), 'full' (bawaan) untuk lightbox/galeri besar/dokumen.
 */
export function useSignedUrl(id: string | null, enabled = true, size: SignedSize = 'full') {
  const [state, setState] = useState<SignedState | null>(null)
  useEffect(() => {
    if (!id || !enabled) return
    let alive = true
    signed.get(id, size).then((s) => {
      if (alive) setState({ id, size, url: s?.url ?? null, kind: s?.kind ?? null, failed: !s })
    })
    return () => {
      alive = false
    }
  }, [id, enabled, size])
  const cur = state && state.id === id && state.size === size ? state : null
  return { url: cur?.url ?? null, kind: cur?.kind ?? null, failed: cur?.failed ?? false, loading: Boolean(id && enabled && !cur) }
}

/* ---------- Thumbnail ---------- */

export type ThumbSize = 'sm' | 'md' | 'stack' | 'strip'

/** Ukuran URL per kotak: md selebar wadah (bisa besar) → berkas asli; lainnya ≤76px → thumbnail. */
const THUMB_SIGNED: Record<ThumbSize, SignedSize> = { sm: 'thumb', md: 'full', stack: 'thumb', strip: 'thumb' }

const THUMB_BOX: Record<ThumbSize, string> = {
  sm: 'h-12 w-16 rounded-[var(--radius-sm)]',
  md: 'aspect-[4/3] w-full rounded-[var(--radius-sm)]',
  stack: 'h-16 w-16 rounded-[var(--radius-md)]',
  strip: 'h-14 w-[76px] rounded-[var(--radius-sm)]',
}

/**
 * Thumbnail bukti. `stack` (64×64) untuk tumpukan di baris laporan — cincin
 * pemisah diberikan pemanggil lewat `className`; `strip` (76×56) untuk deretan
 * pilih foto di pop-up rincian, dengan `pressed` sebagai `aria-pressed`.
 */
export function EvidenceThumb({
  item,
  size = 'md',
  onOpen,
  label,
  className,
  pressed,
}: {
  item: OverviewEvidence
  size?: ThumbSize
  onOpen: () => void
  label: string
  className?: string
  pressed?: boolean
}) {
  const image = isImageMime(item.mime)
  const { url, failed, loading } = useSignedUrl(item.id, image, THUMB_SIGNED[size])
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-pressed={pressed}
      title={item.fileName}
      className={cx(
        'relative shrink-0 overflow-hidden bg-fill-1 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]',
        'flex flex-col items-center justify-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        THUMB_BOX[size],
        className
      )}
    >
      {image && url && !failed && !broken ? (
        <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : image && loading ? (
        <Skeleton h="100%" r={0} className="absolute inset-0" />
      ) : (
        <>
          <Icon name="dokumen" size={size === 'md' ? 24 : size === 'sm' ? 18 : 20} />
          {size === 'md' ? <span className="t-caption max-w-full truncate px-2">{item.fileName}</span> : null}
        </>
      )}
    </button>
  )
}

/* ---------- Lightbox ---------- */

export type LightboxState = { items: OverviewEvidence[]; index: number; title: string } | null

/**
 * Lightbox bukti. Radix Dialog menjaga fokus (terkunci di dalam, kembali ke
 * thumbnail pemicu saat ditutup) dan Esc. Panah kiri/kanan berpindah foto
 * hanya saat fokus di dalam lightbox — bukan pendengar global.
 */
export function EvidenceLightbox({ state, onChange }: { state: LightboxState; onChange: (s: LightboxState) => void }) {
  const open = Boolean(state && state.items.length)
  const items = state?.items ?? []
  const index = state ? stepIndex(state.index, 0, items.length) : 0
  const item = items[index] ?? null
  const go = (delta: number) => {
    if (state && items.length > 1) onChange({ ...state, index: stepIndex(index, delta, items.length) })
  }
  // Pemicu bisa berada di dialog lain (pop-up rincian). Radix tidak mengembalikan
  // fokus ke sana karena kedua dialog bersaudara, jadi pemicu dicatat sendiri.
  const returnTo = useRef<HTMLElement | null>(null)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mk-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          }}
          onCloseAutoFocus={(e) => {
            const el = returnTo.current
            returnTo.current = null
            if (el && el.isConnected) {
              e.preventDefault()
              el.focus()
            }
          }}
          onKeyDown={(e) => {
            const d = keyDelta(e.key)
            if (d) {
              e.preventDefault()
              go(d)
            }
          }}
          className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center p-4 outline-none"
        >
          <div className="flex max-h-full w-full max-w-[960px] flex-col gap-3 rounded-[var(--radius-xl)] bg-surface p-4 shadow-[var(--shadow-sheet)]">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="t-headline text-ink truncate">{state?.title ?? 'Bukti'}</DialogPrimitive.Title>
                <p className="t-footnote text-ink-2 truncate">
                  {item?.fileName}
                  {items.length > 1 ? ` · ${positionLabel(index, items.length)}` : ''}
                </p>
              </div>
              <DialogPrimitive.Close asChild>
                <IconButton icon="tutup" label="Tutup" variant="filled" />
              </DialogPrimitive.Close>
            </div>
            {item ? <LightboxStage key={item.id} item={item} /> : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button icon="kiri" onClick={() => go(-1)} disabled={items.length < 2} aria-label="Foto sebelumnya">
                Sebelumnya
              </Button>
              <span className="t-callout text-ink-2 min-w-[72px] text-center" aria-live="polite">
                {positionLabel(index, items.length)}
              </span>
              <Button iconAfter="kanan" onClick={() => go(1)} disabled={items.length < 2} aria-label="Foto berikutnya">
                Berikutnya
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function LightboxStage({ item }: { item: OverviewEvidence }) {
  const image = isImageMime(item.mime)
  const { url, kind, failed, loading } = useSignedUrl(item.id)
  const [broken, setBroken] = useState(false)
  const frame = 'flex min-h-[240px] items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-fill-1'

  if (loading) return <Skeleton h="min(60vh, 520px)" r={14} />
  if (image && url && !broken) {
    return (
      <div className={frame}>
        <img src={url} alt={item.fileName} className="block max-h-[min(70vh,720px)] w-auto max-w-full object-contain" onError={() => setBroken(true)} />
      </div>
    )
  }
  return (
    <div className={cx(frame, 'flex-col gap-3 p-6 text-center')}>
      <span className="mk-empty__icon mk-soft--neutral" aria-hidden>
        <Icon name="dokumen" size={24} />
      </span>
      <span className="t-body-strong text-ink break-all">{item.fileName}</span>
      {failed || broken || !url ? (
        <span className="t-footnote text-ink-2">Berkas belum bisa dibuka. Coba lagi beberapa saat lagi.</span>
      ) : (
        <a className="mk-btn mk-btn--secondary mk-btn--md" href={url} target="_blank" rel="noopener noreferrer">
          <Icon name={kind === 'link' ? 'kanan' : 'unduh'} size={18} strokeWidth={2} />
          <span>{kind === 'link' ? 'Buka tautan' : 'Buka berkas'}</span>
        </a>
      )}
    </div>
  )
}
