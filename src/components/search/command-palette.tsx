'use client'

/**
 * [F2-DIREKTUR] Pencarian header ⌘K / Ctrl+K (01-manajemen.md, 02-direktur.md):
 * palet perintah yang mencari proyek, divisi, orang, dan laporan mingguan dalam
 * cakupan akun lewat /api/search.
 *
 * - `CommandPalette` dipasang sekali di kerangka (src/components/shell.tsx);
 *   pintasan keyboard berlaku di semua layar.
 * - `SearchButton` = pemicu di header (SearchField bergaya tombol).
 * - Memilih hasil berpindah ke modulnya lalu mengirim event SEARCH_SELECT_EVENT;
 *   layar yang tahu cara membuka detailnya (mis. Sheet proyek di Ringkasan
 *   pengawas) memakai `useSearchSelection`. Orang membuka panel kontak di palet.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { Button, Icon, StatusBadge, cx, type IconName } from '@/components/mk'
import { SEARCH_OPEN_EVENT, SEARCH_SELECT_EVENT, type SearchHit, type SearchKind, type SearchResult } from '@/lib/oversight-shared'
import type { NavTabId } from '@/lib/constants'

const KIND_META: Record<SearchKind, { group: string; icon: IconName }> = {
  project: { group: 'Proyek', icon: 'proyek' },
  division: { group: 'Divisi', icon: 'tim' },
  user: { group: 'Orang', icon: 'pengguna' },
  weekly: { group: 'Laporan mingguan', icon: 'laporan' },
}
const ORDER: SearchKind[] = ['project', 'division', 'weekly', 'user']

/** Buka palet dari mana saja (tombol header, tab bar, menu). */
export function openSearch() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SEARCH_OPEN_EVENT))
}

/** Pilihan yang belum ditangani: dipakai layar yang baru terpasang setelah pindah tab. */
let pending: SearchHit | null = null
let pendingAt = 0
/** Pilihan dianggap basi setelah 3 detik (layar tujuan tidak menanganinya). */
const PENDING_MS = 3000

/**
 * Untuk layar yang bisa membuka detail hasil pencarian. `handle` mengembalikan
 * true bila pilihan sudah ditangani (mis. Sheet proyek dibuka).
 */
export function useSearchSelection(handle: (hit: SearchHit) => boolean) {
  const ref = useRef(handle)
  useEffect(() => {
    ref.current = handle
  })
  useEffect(() => {
    if (pending && Date.now() - pendingAt < PENDING_MS && ref.current(pending)) pending = null
    const on = (e: Event) => {
      const hit = (e as CustomEvent<SearchHit>).detail
      if (hit && ref.current(hit)) pending = null
    }
    window.addEventListener(SEARCH_SELECT_EVENT, on)
    return () => window.removeEventListener(SEARCH_SELECT_EVENT, on)
  }, [])
}

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** Pemicu di header: tampil seperti SearchField, membuka palet. */
export function SearchButton({ className }: { className?: string }) {
  const [mac, setMac] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setMac(isMac()), 0)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <button type="button" className={cx('mk-searchbtn', className)} onClick={openSearch} aria-label="Cari proyek, orang, laporan" aria-keyshortcuts="Meta+K Control+K">
      <Icon name="cari" size={18} />
      <span className="mk-searchbtn__label">Cari</span>
      <span className="mk-search__kbd" aria-hidden>
        {mac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  )
}

export function CommandPalette() {
  const { user, activeTab, setActiveTab } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [contact, setContact] = useState<SearchHit | null>(null)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setQ('')
    setHits([])
    setError(null)
    setActive(0)
    setContact(null)
  }, [])

  // Pintasan ⌘K / Ctrl+K dan event pembuka.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(SEARCH_OPEN_EVENT, onOpen)
    }
  }, [])

  // Cari dengan jeda 200 ms; permintaan lama dibatalkan.
  useEffect(() => {
    const term = q.trim()
    if (!open || term.length < 2) return
    const ctl = new AbortController()
    const t = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as Partial<SearchResult> & { error?: string }
          if (!r.ok) throw new Error(j.error || 'Pencarian belum berhasil. Coba lagi.')
          setHits(j.hits ?? [])
          setError(null)
          setActive(0)
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message)
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [q, open])

  const term = q.trim()
  const shown = useMemo(
    () => (term.length < 2 ? [] : [...hits].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))),
    [hits, term]
  )

  function choose(hit: SearchHit) {
    if (hit.kind === 'user') {
      setContact(hit)
      return
    }
    // Layar yang sedang terbuka boleh menangani langsung (mis. Ringkasan pengawas
    // membuka Sheet proyek/laporan) tanpa pindah modul.
    pending = hit
    pendingAt = Date.now()
    window.dispatchEvent(new CustomEvent(SEARCH_SELECT_EVENT, { detail: hit }))
    if (!pending) {
      setOpen(false)
      reset()
      return
    }
    if (!hit.tab) {
      pending = null
      toast('Modul untuk hasil ini tidak tersedia bagi peran Anda.')
      return
    }
    setOpen(false)
    reset()
    if (hit.tab !== activeTab) {
      setActiveTab(hit.tab as NavTabId)
      window.scrollTo({ top: 0 })
    }
    // Layar tujuan yang baru terpasang mengambil `pending` lewat useSearchSelection.
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' && shown.length) {
      e.preventDefault()
      setActive((i) => (i + 1) % shown.length)
    } else if (e.key === 'ArrowUp' && shown.length) {
      e.preventDefault()
      setActive((i) => (i - 1 + shown.length) % shown.length)
    } else if (e.key === 'Enter' && shown[active]) {
      e.preventDefault()
      choose(shown[active])
    }
  }

  // Gulirkan pilihan aktif ke pandangan.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  const placeholder =
    user.role === 'PIC_PROYEK' ? 'Cari proyek atau laporan' : user.role === 'KEPALA_DIVISI' ? 'Cari proyek, anggota tim, laporan' : 'Cari proyek, divisi, orang, laporan'

  let lastGroup: SearchKind | null = null
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mk-cmdk__scrim" />
        <Dialog.Content
          className="mk-cmdk"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <Dialog.Title className="mk-sr">Cari</Dialog.Title>
          {contact ? (
            <ContactPanel hit={contact} onBack={() => setContact(null)} />
          ) : (
            <>
              <div className="mk-cmdk__field">
                <Icon name="cari" size={20} />
                <input
                  ref={inputRef}
                  type="search"
                  value={q}
                  maxLength={80}
                  placeholder={placeholder}
                  onChange={(e) => {
                    setQ(e.target.value)
                    if (e.target.value.trim().length < 2) {
                      setHits([])
                      setError(null)
                    }
                  }}
                  onKeyDown={onKeyDown}
                  role="combobox"
                  aria-expanded={shown.length > 0}
                  aria-controls={listId}
                  aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                  aria-autocomplete="list"
                  aria-label="Kata kunci pencarian"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="mk-cmdk__list" id={listId} role="listbox" aria-label="Hasil pencarian">
                {term.length < 2 ? (
                  <p className="mk-cmdk__note">Ketik paling sedikit 2 huruf. Untuk laporan mingguan, ketik nomor minggu, mis. M41.</p>
                ) : error ? (
                  <p className="mk-cmdk__note" role="alert">{error}</p>
                ) : shown.length === 0 ? (
                  <p className="mk-cmdk__note" aria-live="polite">{loading ? 'Mencari…' : `Tidak ada hasil untuk "${term}".`}</p>
                ) : (
                  shown.map((h, i) => {
                    const head = h.kind !== lastGroup ? KIND_META[h.kind].group : null
                    lastGroup = h.kind
                    return (
                      <div key={`${h.kind}-${h.id}`} role="presentation">
                        {head ? <div className="mk-cmdk__group" role="presentation">{head}</div> : null}
                        <button
                          type="button"
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === active}
                          tabIndex={-1}
                          className="mk-cmdk__item"
                          onMouseMove={() => setActive(i)}
                          onClick={() => choose(h)}
                        >
                          <span className="mk-cmdk__icon" aria-hidden>
                            <Icon name={KIND_META[h.kind].icon} size={18} />
                          </span>
                          <span className="mk-cmdk__text">
                            <span className="mk-cmdk__title">{h.title}</span>
                            <span className="mk-cmdk__sub">{h.sub}</span>
                          </span>
                          {h.kind === 'user' ? <Icon name="kanan" size={16} /> : null}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="mk-cmdk__foot" aria-hidden>
                <span>↑↓ pilih</span>
                <span>Enter buka</span>
                <span>Esc tutup</span>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ContactPanel({ hit, onBack }: { hit: SearchHit; onBack: () => void }) {
  const hasContact = Boolean(hit.email || hit.phone)
  return (
    <div className="mk-cmdk__contact">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="t-headline truncate">{hit.title}</div>
          <div className="t-footnote text-ink-2 truncate">{hit.sub}</div>
        </div>
        <StatusBadge status="info" size="sm">
          Orang
        </StatusBadge>
      </div>
      {hasContact ? (
        <>
          {hit.phone ? (
            <a className="mk-contact" href={`tel:${hit.phone.replace(/[^\d+]/g, '')}`}>
              <Icon name="pengguna" size={18} />
              <span className="min-w-0">
                <span className="mk-contact__label block">Telepon</span>
                <span className="mk-contact__value block">{hit.phone}</span>
              </span>
            </a>
          ) : null}
          {hit.email ? (
            <a className="mk-contact" href={`mailto:${hit.email}`}>
              <Icon name="kirim" size={18} />
              <span className="min-w-0">
                <span className="mk-contact__label block">Email</span>
                <span className="mk-contact__value block">{hit.email}</span>
              </span>
            </a>
          ) : null}
        </>
      ) : (
        <p className="t-footnote text-ink-2">Kontak orang ini hanya terlihat oleh atasan dan Admin PT-nya.</p>
      )}
      <div>
        <Button variant="secondary" icon="kiri" onClick={onBack}>
          Kembali ke hasil
        </Button>
      </div>
    </div>
  )
}
