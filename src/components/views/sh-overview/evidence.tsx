'use client'

/**
 * Bukti laporan subholding: thumbnail gambar nyata dan lightbox
 * (sebelumnya/berikutnya, Esc/tutup, fokus kembali ke pemicu). Dipakai
 * dashboard Superuser & Manajemen dan layar Persetujuan Supervisor.
 *
 * Berkas disimpan privat; tautannya diminta ke GET /api/evidence/:id (URL
 * bertanda tangan, berlaku 5 menit) dan disimpan sebentar di memori supaya
 * thumbnail dan lightbox tidak meminta dua kali.
 */

import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button, Icon, IconButton, Skeleton, cx } from '@/components/mk'
import { isImageMime, keyDelta, positionLabel, stepIndex, type OverviewEvidence } from './logic'

/* ---------- URL bertanda tangan ---------- */

type Signed = { url: string; kind: 'file' | 'link'; until: number }
const cache = new Map<string, Signed>()
const pending = new Map<string, Promise<Signed | null>>()
/** Sisakan 30 detik sebelum kedaluwarsa agar gambar tidak gagal di tengah jalan. */
const TTL_MS = 270_000

function fetchSigned(id: string): Promise<Signed | null> {
  const hit = cache.get(id)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit)
  const inflight = pending.get(id)
  if (inflight) return inflight
  const p = fetch(`/api/evidence/${encodeURIComponent(id)}`)
    .then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as { url?: string; kind?: 'file' | 'link' }
      if (!r.ok || !j.url) return null
      const s: Signed = { url: j.url, kind: j.kind === 'link' ? 'link' : 'file', until: Date.now() + TTL_MS }
      cache.set(id, s)
      return s
    })
    .catch(() => null)
    .finally(() => pending.delete(id))
  pending.set(id, p)
  return p
}

type SignedState = { id: string; url: string | null; kind: 'file' | 'link' | null; failed: boolean }

/** URL bertanda tangan satu bukti; `enabled` false = jangan minta (mis. dokumen di thumbnail). */
export function useSignedUrl(id: string | null, enabled = true) {
  const [state, setState] = useState<SignedState | null>(null)
  useEffect(() => {
    if (!id || !enabled) return
    let alive = true
    fetchSigned(id).then((s) => {
      if (alive) setState({ id, url: s?.url ?? null, kind: s?.kind ?? null, failed: !s })
    })
    return () => {
      alive = false
    }
  }, [id, enabled])
  const cur = state && state.id === id ? state : null
  return { url: cur?.url ?? null, kind: cur?.kind ?? null, failed: cur?.failed ?? false, loading: Boolean(id && enabled && !cur) }
}

/* ---------- Thumbnail ---------- */

export function EvidenceThumb({
  item,
  size = 'md',
  onOpen,
  label,
}: {
  item: OverviewEvidence
  size?: 'sm' | 'md'
  onOpen: () => void
  label: string
}) {
  const image = isImageMime(item.mime)
  const { url, failed, loading } = useSignedUrl(item.id, image)
  const [broken, setBroken] = useState(false)
  const box = size === 'sm' ? 'h-12 w-16' : 'aspect-[4/3] w-full'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={item.fileName}
      className={cx(
        'relative shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-fill-1 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]',
        'flex flex-col items-center justify-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        box
      )}
    >
      {image && url && !failed && !broken ? (
        <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : image && loading ? (
        <Skeleton h="100%" r={0} className="absolute inset-0" />
      ) : (
        <>
          <Icon name="dokumen" size={size === 'sm' ? 18 : 24} />
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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mk-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
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
