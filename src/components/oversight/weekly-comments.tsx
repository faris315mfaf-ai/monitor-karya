'use client'

/**
 * [F2-DIREKTUR] Tanggapan laporan mingguan ("Beri tanggapan", 02-direktur.md).
 *
 *  - `WeeklyCommentThread`: percakapan satu laporan + kolom tulis. Dipakai di
 *    Sheet laporan terkirim (Direktur/Manajemen) dan di kartu kepala divisi.
 *  - `WeeklyFeedbackCard`: kartu untuk meja kerja kepala divisi — tanggapan
 *    direktur atas laporan mingguan 8 minggu terakhir, bisa dibalas. Membuka
 *    kartu menandai tanggapan sudah dibaca.
 *
 * Mengirim memberi toast "Urungkan" (menarik tanggapan, 15 menit).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, EmptyNote, ErrorNote, Skeleton, cx } from '@/components/mk'
import { Textarea } from '@/components/mk/forms'
import { useResource } from '@/hooks/use-resource'
import { formatDateShort, formatTime } from '@/lib/format'
import { COMMENT_MAX } from '@/lib/oversight-shared'

export type WeeklyComment = {
  id: string
  weeklyReportId: string
  body: string
  createdAt: string
  readAt: string | null
  authorId: string
  authorName: string
  authorRole: string | null
  mine: boolean
}

type ThreadData = { weeklyReportId: string; canComment: boolean; unread: number; items: WeeklyComment[]; pendingMigration?: boolean }

async function send(method: 'POST' | 'DELETE' | 'PATCH', body: unknown) {
  const res = await fetch('/api/weekly-comments', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Belum tersimpan. Coba lagi.')
  return j
}

function when(iso: string) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? formatTime(d) : `${formatDateShort(d)} · ${formatTime(d)}`
}

function Bubbles({ items }: { items: WeeklyComment[] }) {
  return (
    <div className="mk-thread" role="log" aria-label="Tanggapan">
      {items.map((c) => (
        <div key={c.id} className={cx('mk-thread__item', c.mine && 'is-mine')}>
          <div className="mk-thread__meta">
            {c.mine ? 'Anda' : c.authorName} · {when(c.createdAt)}
            {c.mine && c.readAt ? ' · Dibaca' : ''}
          </div>
          <div className="mk-thread__body">{c.body}</div>
        </div>
      ))}
    </div>
  )
}

function Composer({
  weeklyReportId,
  placeholder,
  onSent,
  inputRef,
  sentText = 'Tanggapan terkirim ke kepala divisi.',
}: {
  weeklyReportId: string
  placeholder: string
  onSent: () => void
  inputRef?: React.Ref<HTMLTextAreaElement>
  sentText?: string
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    const text = draft.trim()
    if (text.length < 2 || busy) return
    setBusy(true)
    try {
      const j = (await send('POST', { weeklyReportId, body: text })) as { item: WeeklyComment }
      setDraft('')
      onSent()
      toast.success(sentText, {
        action: {
          label: 'Urungkan',
          onClick: () => {
            send('DELETE', { id: j.item.id })
              .then(() => {
                setDraft(text)
                onSent()
              })
              .catch((e: Error) => toast.error(e.message))
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tanggapan belum terkirim. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }
  const id = `mk-wc-${weeklyReportId}`
  return (
    <form
      className="mk-field"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={id} className="mk-field__label">
        Tanggapan Anda
      </label>
      <Textarea id={id} ref={inputRef} rows={3} maxLength={COMMENT_MAX} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
      <div>
        <Button type="submit" size="sm" variant="secondary" icon="kirim" disabled={draft.trim().length < 2 || busy}>
          {busy ? 'Mengirim…' : 'Kirim tanggapan'}
        </Button>
      </div>
    </form>
  )
}

export type WeeklyCommentThreadHandle = { focus: () => void }

/** Percakapan satu laporan. `ref.focus()` memfokuskan kolom tulis ("Beri tanggapan"). */
export const WeeklyCommentThread = forwardRef<WeeklyCommentThreadHandle, { weeklyReportId: string; headName?: string | null }>(
  function WeeklyCommentThread({ weeklyReportId, headName }, ref) {
    const { data, loading, error, reload } = useResource<ThreadData>(`/api/weekly-comments?weeklyReportId=${encodeURIComponent(weeklyReportId)}`)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const boxRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => ({
      focus: () => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        boxRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
        window.setTimeout(() => inputRef.current?.focus(), 50)
      },
    }))
    const items = data?.items ?? []
    return (
      <div ref={boxRef} className="flex flex-col gap-3">
        <h3 className="t-headline">Tanggapan</h3>
        {loading && !data ? (
          <Skeleton h={56} />
        ) : error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : data?.pendingMigration ? (
          <p className="t-footnote text-ink-2">Tanggapan menunggu pembaruan basis data.</p>
        ) : (
          <>
            {items.length ? <Bubbles items={items} /> : <p className="t-footnote text-ink-2">Belum ada tanggapan untuk laporan ini.</p>}
            {data?.canComment ? (
              <Composer
                weeklyReportId={weeklyReportId}
                inputRef={inputRef}
                onSent={reload}
                placeholder={headName ? `Tulis tanggapan untuk ${headName.split(/\s+/)[0]}…` : 'Tulis tanggapan untuk kepala divisi…'}
              />
            ) : null}
          </>
        )}
      </div>
    )
  }
)

type FeedbackData = {
  divisionId: string
  divisionName: string
  canReply: boolean
  unread: number
  reports: { weeklyReportId: string; label: string; isoYear: number; isoWeek: number; comments: WeeklyComment[] }[]
  pendingMigration?: boolean
}

/** Kartu kepala divisi: tanggapan direktur atas laporan mingguan divisinya. */
export function WeeklyFeedbackCard({ divisionId, className }: { divisionId: string; className?: string }) {
  const { data, loading, error, reload } = useResource<FeedbackData>(`/api/weekly-comments?divisionId=${encodeURIComponent(divisionId)}`)
  const marked = useRef<string | null>(null)
  const reports = data?.reports ?? []
  const latest = reports[0]

  // Kartu terlihat = tanggapan dibaca (sekali per muatan yang masih punya tanggapan baru).
  useEffect(() => {
    if (!data || !data.canReply || data.unread === 0) return
    const key = reports.map((r) => r.comments.length).join(':')
    if (marked.current === key) return
    marked.current = key
    for (const r of reports) {
      if (r.comments.some((c) => !c.mine && !c.readAt)) send('PATCH', { weeklyReportId: r.weeklyReportId }).catch(() => {})
    }
  }, [data, reports])

  return (
    <div className={cx('flex', className)}>
      <Card
        className="flex-1"
        title="Tanggapan direktur"
        subtitle={data?.unread ? `${data.unread} tanggapan baru` : 'Atas laporan mingguan divisi Anda'}
      >
        {loading && !data ? (
          <Skeleton h={64} />
        ) : error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : data?.pendingMigration ? (
          <EmptyNote icon="kunci">Tanggapan menunggu pembaruan basis data.</EmptyNote>
        ) : !latest ? (
          <EmptyNote icon="catatan">Belum ada tanggapan. Tanggapan direktur atas laporan mingguan muncul di sini.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-4">
            {reports.slice(0, 3).map((r) => (
              <div key={r.weeklyReportId} className="flex flex-col gap-2">
                <div className="t-callout text-ink-2">Laporan {r.label}</div>
                <Bubbles items={r.comments} />
                {data?.canReply && r === latest ? (
                  <Composer weeklyReportId={r.weeklyReportId} onSent={reload} placeholder="Balas tanggapan direktur…" sentText="Balasan terkirim ke direktur." />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
