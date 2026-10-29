'use client'

/**
 * Isi satu komentar laporan subholding + sunting di tempat untuk penulisnya.
 * Dipakai percakapan Supervisor (body.tsx) dan Kotak masuk Admin subholding
 * (sh-admin/inbox-view.tsx), jadi tampilan gelembungnya tetap milik pemanggil.
 *
 * Komentar milik sendiri mendapat tombol "Ubah" → kolom isian dengan Simpan /
 * Batal (Ctrl/Cmd+Enter simpan). Setelah tersimpan isi baru langsung tampil
 * sampai data pemanggil dimuat ulang lewat `onSaved`.
 *
 * Data: PATCH /api/sh/reports/:id/comments/:commentId { body }.
 */

import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button, cx } from '@/components/mk'
import { Textarea } from '@/components/mk/forms'
import { callJson, TOUCH_TEXT } from '../sh-admin/logic'
import type { ShComment } from './logic'

const COMMENT_MAX = 2000

export function CommentBody({
  reportId,
  comment,
  onSaved,
  className,
}: {
  reportId: string
  comment: Pick<ShComment, 'id' | 'body' | 'mine'>
  /** Dipanggil setelah tersimpan supaya pemanggil memuat ulang percakapan. */
  onSaved?: () => void
  /** Kelas teks isi komentar (mengikuti gaya gelembung pemanggil). */
  className?: string
}) {
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // Isi yang baru disimpan, dipakai sampai prop `comment.body` ikut berubah.
  const [saved, setSaved] = useState<{ from: string; body: string } | null>(null)
  if (saved && saved.from !== comment.body) setSaved(null)
  const shown = saved?.body ?? comment.body

  const text = draft.trim()
  const canSave = !busy && text.length > 0 && text !== shown

  function start() {
    setDraft(shown)
    setEditing(true)
  }

  async function save() {
    if (!canSave) return
    setBusy(true)
    const res = await callJson(
      fetch,
      `/api/sh/reports/${encodeURIComponent(reportId)}/comments/${encodeURIComponent(comment.id)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) }
    )
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setSaved({ from: comment.body, body: text })
    setEditing(false)
    toast.success('Komentar diubah.')
    onSaved?.()
  }

  if (!editing) {
    return (
      <>
        <span className={className}>{shown}</span>
        {comment.mine ? (
          <span className="flex justify-end">
            <Button size="sm" variant="plain" icon="ubah" onClick={start} aria-label="Ubah komentar">
              Ubah
            </Button>
          </span>
        ) : null}
      </>
    )
  }

  return (
    <span className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="mk-sr">
        Ubah komentar
      </label>
      <Textarea
        id={fieldId}
        className={cx(TOUCH_TEXT, 'min-w-[min(260px,70vw)]')}
        rows={3}
        maxLength={COMMENT_MAX}
        value={draft}
        autoFocus
        // Kursor di akhir teks supaya menambah kalimat tidak perlu klik lagi.
        onFocus={(e) => {
          const end = e.currentTarget.value.length
          e.currentTarget.setSelectionRange(end, end)
        }}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void save()
          }
        }}
      />
      <span className="flex justify-end gap-2">
        <Button size="sm" variant="plain" disabled={busy} onClick={() => setEditing(false)}>
          Batal
        </Button>
        <Button size="sm" variant="primary" disabled={!canSave} onClick={() => void save()}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </span>
    </span>
  )
}
