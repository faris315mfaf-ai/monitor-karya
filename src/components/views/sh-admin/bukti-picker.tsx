'use client'

/**
 * Pemilih bukti laporan subholding: foto, dokumen, atau tautan dipilih SEBELUM
 * laporan disimpan, lalu diunggah otomatis setelah laporan dibuat (logic.ts).
 * Dipakai di form Tambah laporan dan di Sheet "Lampirkan bukti" (unggah ulang).
 *
 * Foto dikompres di peramban segera setelah dipilih (src/lib/image-compress.ts):
 * baris bukti menampilkan "Mengompres…" sampai berkas diganti hasilnya lewat
 * `onUpdate`. Kompres dijalankan satu per satu agar memori ponsel tidak penuh.
 */

import { useRef, useState } from 'react'
import { Button, Icon, IconButton, Input, cx } from '@/components/mk'
import { formatFileSize } from '@/lib/format'
import { compressImage, isCompressible, type CompressResult } from '@/lib/image-compress'
import {
  ACCEPT_DOCS,
  buktiStatusView,
  fileBukti,
  linkBukti,
  validateFile,
  validateLink,
  validatePick,
  TOUCH_TEXT,
  type BuktiState,
  type PendingBukti,
} from './logic'

/** Antrean kompres bersama (satu per satu) untuk semua pemilih di halaman. */
let compressTail: Promise<unknown> = Promise.resolve()
function enqueueCompress(file: File): Promise<CompressResult> {
  const run = compressTail.then(() => compressImage(file))
  compressTail = run.catch(() => undefined)
  return run
}

export function BuktiPicker({
  items,
  onAdd,
  onUpdate,
  onRemove,
  onRetry,
  disabled,
  retryDisabled,
  error,
  idPrefix = 'sh-bukti',
  status,
}: {
  items: PendingBukti[]
  onAdd: (items: PendingBukti[]) => void
  /** Ganti satu bukti (kunci sama), mis. foto asli → hasil kompres. Kunci yang sudah dibuang diabaikan pemanggil. */
  onUpdate: (key: string, next: PendingBukti) => void
  onRemove: (key: string) => void
  /** Bila ada: tombol "Coba lagi" pada bukti berstatus gagal. */
  onRetry?: (key: string) => void
  disabled?: boolean
  retryDisabled?: boolean
  error?: string
  idPrefix?: string
  /** Status unggah per bukti (menunggu / mengunggah / terkirim / gagal). */
  status?: Record<string, BuktiState>
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [pickErr, setPickErr] = useState<string | null>(null)

  function take(list: FileList | File[] | null) {
    if (!list) return
    const ok: PendingBukti[] = []
    const errs: string[] = []
    const toCompress: { key: string; file: File }[] = []
    for (const f of Array.from(list)) {
      const will = isCompressible(f.type)
      const e = validatePick(f, will)
      if (e) {
        errs.push(e)
        continue
      }
      const b = fileBukti(f)
      if (will) {
        b.compressing = true
        toCompress.push({ key: b.key, file: f })
      }
      ok.push(b)
    }
    if (ok.length) onAdd(ok)
    setPickErr(errs.length ? errs.join(' ') : null)
    for (const c of toCompress) {
      void enqueueCompress(c.file).then((res) => {
        // Hasil kompres tetap wajib ≤ 20 MB; nama asli dipakai di pesan agar mudah dikenali.
        const e = validateFile({ name: c.file.name, size: res.file.size, type: res.file.type })
        if (e) {
          onRemove(c.key)
          setPickErr((prev) => (prev ? `${prev} ${e}` : e))
        } else {
          onUpdate(c.key, fileBukti(res.file, c.key))
        }
      })
    }
  }

  function addLink() {
    const e = validateLink(linkName, linkUrl)
    if (e) {
      setPickErr(e)
      return
    }
    onAdd([linkBukti(linkName, linkUrl)])
    setLinkName('')
    setLinkUrl('')
    setLinkOpen(false)
    setPickErr(null)
  }

  const shownErr = pickErr || error
  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    take(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="mk-lap-evi">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
      <input ref={docRef} type="file" accept={ACCEPT_DOCS} multiple hidden onChange={pickFiles} />
      <div
        className={cx('mk-lap-drop', over && 'is-over')}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) take(e.dataTransfer.files)
        }}
      >
        <Button icon="tambah" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          Ambil foto
        </Button>
        <Button icon="unggah" disabled={disabled} onClick={() => galleryRef.current?.click()}>
          Galeri
        </Button>
        <Button icon="dokumen" disabled={disabled} onClick={() => docRef.current?.click()}>
          Dokumen
        </Button>
        <Button icon="alur" disabled={disabled} aria-expanded={linkOpen} onClick={() => setLinkOpen((v) => !v)}>
          Tautan
        </Button>
        <span className="mk-lap-drop__text">Foto dikecilkan otomatis sebelum diunggah · maks. 20 MB per berkas</span>
      </div>

      {linkOpen ? (
        <div className="mk-lap-linkform">
          <label className="mk-sr" htmlFor={`${idPrefix}-lname`}>
            Nama tautan
          </label>
          <Input
            id={`${idPrefix}-lname`}
            className={TOUCH_TEXT}
            placeholder="Nama tautan (opsional)"
            value={linkName}
            maxLength={200}
            onChange={(e) => setLinkName(e.target.value)}
          />
          <label className="mk-sr" htmlFor={`${idPrefix}-lurl`}>
            Alamat tautan
          </label>
          <Input
            id={`${idPrefix}-lurl`}
            className={TOUCH_TEXT}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={linkUrl}
            maxLength={2000}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLink()
              }
            }}
          />
          <Button variant="primary" onClick={addLink} disabled={disabled}>
            Tambahkan
          </Button>
        </div>
      ) : null}

      {items.length ? (
        <ul className="mk-list" aria-label="Bukti dipilih">
          {items.map((b) => {
            const compressing = b.kind === 'file' && !!b.compressing
            const st: BuktiState | undefined = compressing ? { status: 'mengompres' } : status?.[b.key]
            const view = st ? buktiStatusView(st) : null
            const failed = st?.status === 'gagal'
            const locked = st?.status === 'mengunggah' || st?.status === 'terkirim'
            return (
              <li key={b.key} className="mk-lap-file">
                <Icon name={b.kind === 'link' ? 'alur' : b.isImage ? 'lihat' : 'dokumen'} size={18} className="text-ink-2 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="mk-lap-file__name" title={b.kind === 'link' ? b.url : b.name}>
                    {b.name}
                  </span>
                  {view ? <span className={cx('t-caption', 'mk-text--' + view.tone)}>{view.text}</span> : null}
                </div>
                <span className="mk-lap-file__size">{b.kind === 'link' ? 'Tautan' : formatFileSize(b.size)}</span>
                {failed && onRetry ? (
                  <Button size="sm" icon="unggah" disabled={disabled || retryDisabled} onClick={() => onRetry(b.key)}>
                    Coba lagi
                  </Button>
                ) : null}
                <IconButton icon="tutup" label={`Buang ${b.name}`} disabled={disabled || locked} onClick={() => onRemove(b.key)} />
              </li>
            )
          })}
        </ul>
      ) : null}

      {shownErr ? (
        <p className="mk-field__error" role="alert">
          {shownErr}
        </p>
      ) : null}
    </div>
  )
}
