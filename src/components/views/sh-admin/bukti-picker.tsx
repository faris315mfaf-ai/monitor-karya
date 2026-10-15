'use client'

/**
 * Pemilih bukti laporan subholding: foto, dokumen, atau tautan dipilih SEBELUM
 * laporan disimpan, lalu diunggah otomatis setelah laporan dibuat (logic.ts).
 * Dipakai di form Tambah laporan dan di Sheet "Lampirkan bukti" (unggah ulang).
 */

import { useRef, useState } from 'react'
import { Button, Icon, IconButton, Input, cx } from '@/components/mk'
import { formatFileSize } from '@/lib/format'
import {
  ACCEPT_DOCS,
  fileBukti,
  linkBukti,
  validateFile,
  validateLink,
  type PendingBukti,
} from './logic'

export function BuktiPicker({
  items,
  onAdd,
  onRemove,
  disabled,
  error,
  idPrefix = 'sh-bukti',
  status,
}: {
  items: PendingBukti[]
  onAdd: (items: PendingBukti[]) => void
  onRemove: (key: string) => void
  disabled?: boolean
  error?: string
  idPrefix?: string
  /** Status per bukti saat/selesai unggah, mis. { key: 'Gagal: …' }. */
  status?: Record<string, { tone: 'late' | 'done' | 'info'; text: string }>
}) {
  const photoRef = useRef<HTMLInputElement>(null)
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
    for (const f of Array.from(list)) {
      const e = validateFile(f)
      if (e) errs.push(e)
      else ok.push(fileBukti(f))
    }
    if (ok.length) onAdd(ok)
    setPickErr(errs.length ? errs.join(' ') : null)
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

  return (
    <div className="mk-lap-evi">
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={docRef}
        type="file"
        accept={ACCEPT_DOCS}
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
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
        <Button size="sm" icon="unggah" disabled={disabled} onClick={() => photoRef.current?.click()}>
          Ambil / pilih foto
        </Button>
        <Button size="sm" icon="dokumen" disabled={disabled} onClick={() => docRef.current?.click()}>
          Dokumen
        </Button>
        <Button size="sm" icon="tambah" disabled={disabled} aria-expanded={linkOpen} onClick={() => setLinkOpen((v) => !v)}>
          Tautan
        </Button>
        <span className="mk-lap-drop__text">atau seret berkas ke sini · maks. 20 MB per berkas</span>
      </div>

      {linkOpen ? (
        <div className="mk-lap-linkform">
          <label className="mk-sr" htmlFor={`${idPrefix}-lname`}>
            Nama tautan
          </label>
          <Input
            id={`${idPrefix}-lname`}
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
          <Button size="sm" variant="primary" onClick={addLink} disabled={disabled}>
            Tambahkan
          </Button>
        </div>
      ) : null}

      {items.length ? (
        <ul className="mk-list" aria-label="Bukti dipilih">
          {items.map((b) => {
            const st = status?.[b.key]
            return (
              <li key={b.key} className="mk-lap-file">
                <Icon name={b.kind === 'link' ? 'alur' : b.isImage ? 'lihat' : 'dokumen'} size={18} className="text-ink-2 shrink-0" />
                <span className="mk-lap-file__name" title={b.kind === 'link' ? b.url : b.name}>
                  {b.name}
                </span>
                {st ? (
                  <span className={cx('t-caption shrink-0', 'mk-text--' + st.tone)}>{st.text}</span>
                ) : (
                  <span className="mk-lap-file__size">{b.kind === 'link' ? 'Tautan' : formatFileSize(b.size)}</span>
                )}
                <IconButton icon="tutup" label={`Buang ${b.name}`} disabled={disabled} onClick={() => onRemove(b.key)} />
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
