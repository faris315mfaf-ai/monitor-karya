'use client'

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Button, Icon, IconButton, Skeleton, cx } from '@/components/mk'
import { useConfirm } from '@/components/companies/parts'

export type EvidenceItem = {
  id: string
  fileName: string
  url: string | null
  mime?: string | null
  size?: number | null
  createdAt: string
}

function humanSize(bytes?: number | null) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Pegangan untuk tombol di luar panel, mis. "Lampirkan foto" di formulir laporan. */
export type EvidencePanelHandle = {
  /** Buka pemilih berkas panel; `photo` membatasi ke gambar (kamera di ponsel). */
  openPicker: (kind?: 'photo' | 'any') => void
  /** Bisa melampirkan sekarang (ada sasaran, tidak terkunci, tidak sibuk). */
  canAdd: boolean
}

const ACCEPT_ANY = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'

const isImage = (e: EvidenceItem) => !e.url && Boolean(e.mime?.startsWith('image/'))

/**
 * Foto yang diunggah tampil sebagai gambar, bukan sekadar nama berkas.
 * Tautan bertanda tangannya diminta ke server saat dipasang (berlaku 5 menit)
 * dan diperbarui otomatis bila sudah kedaluwarsa saat dibuka kembali.
 */
function PhotoThumb({ item }: { item: EvidenceItem }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/evidence/${item.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          if (j?.url) setSrc(j.url)
          else setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  return (
    <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Buka foto ${item.fileName}`} className="mk-lap-thumb">
      {src && !failed ? (
        <img src={src} alt={item.fileName} loading="lazy" onError={() => setFailed(true)} />
      ) : failed ? (
        <span className="mk-lap-thumb__ph">
          <Icon name="dokumen" size={24} />
        </span>
      ) : (
        <Skeleton h="100%" r={0} />
      )}
      <span className="mk-lap-thumb__name">{item.fileName}</span>
    </a>
  )
}

/**
 * Attaching and reviewing supporting evidence for one report line.
 *
 * Two ways in: upload a file (stored privately in Supabase Storage) or record
 * an external link for material that already lives somewhere else. Opening an
 * uploaded file asks the server for a short-lived signed URL rather than
 * holding a permanent one. Photos are shown inline as thumbnails. Berkas juga
 * bisa diseret ke area unggah; menghapus bukti selalu dikonfirmasi.
 */
export function EvidencePanel({
  targetType,
  targetId,
  items,
  required,
  disabled,
  onChanged,
  compact,
  photos = true,
  handleRef,
}: {
  targetType: 'DAILY_REPORT' | 'WEEKLY_ITEM' | 'PROJECT_CLOSING' | 'TASK' | 'PROGRESS_REPORT'
  targetId: string | null
  items: EvidenceItem[]
  required?: boolean
  disabled?: boolean
  onChanged: () => void
  compact?: boolean
  /** Tampilkan foto sebagai galeri kecil (bawaan: ya). */
  photos?: boolean
  /** Pegangan untuk membuka pemilih berkas dari luar panel. */
  handleRef?: Ref<EvidencePanelHandle>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [over, setOver] = useState(false)
  const [confirmEl, confirm] = useConfirm()

  const noTarget = !targetId
  const pictures = photos ? items.filter(isImage) : []
  const others = photos ? items.filter((e) => !isImage(e)) : items
  const canAdd = !disabled && !noTarget && busy === null

  useImperativeHandle(
    handleRef,
    () => ({
      canAdd,
      openPicker: (kind = 'any') => {
        const input = fileRef.current
        if (!input || !canAdd) return
        // Mode foto hanya untuk satu kali buka; kembali ke semua jenis setelah
        // berkas dipilih atau pemilih ditutup.
        input.accept = kind === 'photo' ? 'image/*' : ACCEPT_ANY
        const reset = () => {
          input.accept = ACCEPT_ANY
        }
        input.addEventListener('change', reset, { once: true })
        input.addEventListener('cancel', reset, { once: true })
        input.click()
      },
    }),
    [canAdd]
  )

  async function upload(file: File) {
    if (!targetId) {
      setErr('Simpan draf dulu agar bukti bisa dilampirkan.')
      return
    }
    setBusy('upload')
    setErr(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('targetType', targetType)
      body.append('targetId', targetId)

      const res = await fetch('/api/evidence/upload', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Berkas belum terunggah')
      else onChanged()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function attachLink() {
    if (!targetId) {
      setErr('Simpan draf dulu agar bukti bisa dilampirkan.')
      return
    }
    setBusy('link')
    setErr(null)
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, fileName: linkName, url: linkUrl }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Tautan belum terlampir')
      else {
        setLinkName('')
        setLinkUrl('')
        setShowLink(false)
        onChanged()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function open(id: string) {
    setBusy(id)
    setErr(null)
    try {
      const res = await fetch(`/api/evidence/${id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) {
        setErr(json.error || 'Bukti belum bisa dibuka')
        return
      }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(item: EvidenceItem) {
    const ok = await confirm({
      title: 'Hapus bukti ini?',
      description: (
        <>
          <strong className="text-ink">{item.fileName}</strong> dihapus dari laporan dan tidak bisa dikembalikan.
        </>
      ),
      confirmLabel: 'Hapus bukti',
      destructive: true,
    })
    if (!ok) return
    setBusy(item.id)
    setErr(null)
    try {
      const res = await fetch(`/api/evidence/${item.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Bukti belum terhapus')
      else onChanged()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cx('mk-lap-evi', !compact && 'mk-lap-evi--box')}>
      {!compact && (
        <div className="mk-lap-head">
          <span className="t-body-strong text-ink flex items-center gap-2">
            <Icon name="dokumen" size={18} className="text-ink-2" />
            Bukti pendukung
            {required ? <span className="t-caption text-ink-2 font-medium">wajib</span> : null}
          </span>
          <span className="mk-lap-grow" />
          <span className="t-footnote text-ink-2 tabular-nums">{items.length} lampiran</span>
        </div>
      )}

      {/* Galeri foto */}
      {pictures.length > 0 && (
        <div className="mk-lap-thumbs">
          {pictures.map((e) => (
            <div key={e.id} className="relative">
              <PhotoThumb item={e} />
              {!disabled && (
                <IconButton
                  icon="tutup"
                  label={`Hapus foto ${e.fileName}`}
                  variant="filled"
                  className="mk-lap-thumb__del"
                  disabled={busy === e.id}
                  onClick={() => remove(e)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dokumen & tautan */}
      {others.length > 0 && (
        <ul className="mk-list">
          {others.map((e) => (
            <li key={e.id} className="mk-lap-file">
              <Icon name={e.url ? 'alur' : 'dokumen'} size={18} className="text-ink-3 shrink-0" />
              <span className="mk-lap-file__name" title={e.fileName}>
                {e.fileName}
              </span>
              {humanSize(e.size) ? <span className="mk-lap-file__size">{humanSize(e.size)}</span> : null}
              <IconButton
                icon={e.url ? 'kanan' : 'unduh'}
                label={`Buka ${e.fileName}`}
                disabled={busy === e.id}
                onClick={() => open(e.id)}
              />
              {!disabled && (
                <IconButton icon="tutup" label={`Hapus ${e.fileName}`} disabled={busy === e.id} onClick={() => remove(e)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          <div
            className={cx('mk-lap-drop', over && canAdd && 'is-over')}
            onDragOver={(ev) => {
              if (!canAdd) return
              ev.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(ev) => {
              if (!canAdd) return
              ev.preventDefault()
              setOver(false)
              const f = ev.dataTransfer.files?.[0]
              if (f) upload(f)
            }}
          >
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={ACCEPT_ANY}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
              }}
            />
            <span className="mk-lap-drop__text">
              {noTarget
                ? 'Simpan draf dulu agar bukti dapat dilampirkan.'
                : items.length === 0 && required
                  ? 'Wajib minimal 1 bukti. Seret foto atau dokumen ke sini, atau tekan Unggah bukti.'
                  : 'Seret foto atau dokumen ke sini, atau tekan Unggah bukti.'}
            </span>
            <Button size="sm" icon="unggah" disabled={!canAdd} onClick={() => fileRef.current?.click()}>
              {busy === 'upload' ? 'Mengunggah…' : 'Unggah bukti'}
            </Button>
            <Button size="sm" variant="plain" disabled={!canAdd} onClick={() => setShowLink((v) => !v)} aria-expanded={showLink}>
              {showLink ? 'Tutup tautan' : 'Tambah tautan'}
            </Button>
          </div>

          {showLink && (
            <div className="mk-lap-linkform">
              <label className="mk-sr" htmlFor={`evi-name-${targetId ?? 'baru'}`}>
                Keterangan tautan
              </label>
              <input
                id={`evi-name-${targetId ?? 'baru'}`}
                className="mk-lap-input"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Keterangan, mis. Notulen rapat"
              />
              <label className="mk-sr" htmlFor={`evi-url-${targetId ?? 'baru'}`}>
                Alamat tautan
              </label>
              <input
                id={`evi-url-${targetId ?? 'baru'}`}
                className="mk-lap-input"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
              <Button size="md" onClick={attachLink} disabled={busy !== null}>
                {busy === 'link' ? 'Menyimpan…' : 'Simpan tautan'}
              </Button>
            </div>
          )}
        </>
      )}

      {disabled && items.length === 0 && <p className="t-footnote text-ink-2">Belum ada bukti terlampir.</p>}

      {err && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{err}</span>
        </p>
      )}
      {confirmEl}
    </div>
  )
}
