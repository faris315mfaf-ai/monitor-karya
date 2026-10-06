'use client'

/**
 * [F2-DIREKTUR] Isi tambahan Sheet proyek pengawas (01-manajemen.md "Detail
 * proyek", 02-direktur.md "Sheet · Proyek"), dipakai ProjectSheet di
 * src/components/views/dash-common.tsx:
 *  - tahapan bertanggal dari ProjectStage (FlowDiagram vertikal dengan meta
 *    Selesai / Berjalan / Tertahan / Berikutnya); bila PIC belum menyusun
 *    tahapan, jatuh ke 4 fase baku;
 *  - "Kirim catatan ke PIC" lewat /api/project-notes (percakapan yang sama
 *    dengan PIC & kepala divisi);
 *  - "Tandai sudah ditinjau" lewat /api/project-reviews dengan toast Urungkan.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, FlowDiagram, Skeleton, cx, type FlowStep } from '@/components/mk'
import { Textarea } from '@/components/ui/textarea'
import { useResource } from '@/hooks/use-resource'
import { formatDateShort, formatRelative, formatTime } from '@/lib/format'
import type { NotesData, StagesData, StageItem } from '@/components/pic/api'

const STAGE_META: Record<StageItem['status'], { status: FlowStep['status']; label: string }> = {
  SELESAI: { status: 'done', label: 'Selesai' },
  BERJALAN: { status: 'current', label: 'Berjalan' },
  TERTAHAN: { status: 'blocked', label: 'Tertahan' },
  BELUM_MULAI: { status: 'todo', label: 'Belum mulai' },
}

function range(s: StageItem) {
  if (s.startDate && s.dueDate) return `${formatDateShort(s.startDate)}–${formatDateShort(s.dueDate)}`
  if (s.dueDate) return `sampai ${formatDateShort(s.dueDate)}`
  if (s.startDate) return `mulai ${formatDateShort(s.startDate)}`
  return undefined
}

/** Tahapan bertanggal; `fallback` dipakai bila belum ada tahapan tersimpan. */
export function ProjectStages({ projectId, fallback }: { projectId: string; fallback: FlowStep[] }) {
  const { data, loading } = useResource<StagesData>(`/api/project-stages?projectId=${encodeURIComponent(projectId)}`)
  const items = data?.items ?? []
  if (loading && !data) return <Skeleton h={160} />
  if (items.length === 0) {
    return (
      <>
        <FlowDiagram orientation="vertical" steps={fallback} label="Tahapan proyek" />
        <p className="t-footnote text-ink-2 mt-2">PIC belum menyusun tahapan bertanggal; yang tampil adalah fase proyek.</p>
      </>
    )
  }
  const firstTodo = items.findIndex((s) => s.status === 'BELUM_MULAI')
  const steps: FlowStep[] = items.map((s, i) => {
    const m = STAGE_META[s.status] ?? STAGE_META.BELUM_MULAI
    const label = s.status === 'BELUM_MULAI' && i === firstTodo ? 'Berikutnya' : m.label
    return {
      title: s.name,
      sub: range(s),
      status: m.status,
      meta: s.status === 'TERTAHAN' && s.note ? `${label} · ${s.note}` : label,
    }
  })
  return (
    <>
      <FlowDiagram orientation="vertical" steps={steps} label="Tahapan proyek" />
      <p className="t-footnote text-ink-2 mt-2">
        {data?.done ?? 0} dari {data?.total ?? items.length} tahap selesai
      </p>
    </>
  )
}

type ReviewData = {
  canReview: boolean
  undoMinutes?: number
  mine: { id: string; reviewedAt: string } | null
  items: { id: string; reviewedAt: string; reviewer: string; mine: boolean }[]
  pendingMigration?: boolean
}

/** Status tinjauan + aksi "Tandai sudah ditinjau" (dipegang Sheet supaya tombolnya di footer). */
export function useProjectReview(projectId: string | null, onChange?: () => void) {
  const { data, reload } = useResource<ReviewData>(projectId ? `/api/project-reviews?projectId=${encodeURIComponent(projectId)}` : null)
  const [busy, setBusy] = useState(false)

  async function mark() {
    if (!projectId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/project-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Tanda tinjauan belum tersimpan.')
      reload()
      onChange?.()
      const id = j.review?.id as string | undefined
      toast.success('Proyek ditandai sudah ditinjau.', {
        action: id
          ? {
              label: 'Urungkan',
              onClick: () => {
                fetch('/api/project-reviews', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
                  .then(async (r) => {
                    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'Belum diurungkan.')
                    reload()
                    onChange?.()
                  })
                  .catch((e: Error) => toast.error(e.message))
              },
            }
          : undefined,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tanda tinjauan belum tersimpan.')
    } finally {
      setBusy(false)
    }
  }

  const today = new Date().toDateString()
  const reviewedToday = Boolean(data?.mine && new Date(data.mine.reviewedAt).toDateString() === today)
  return { data, busy, mark, reviewedToday, available: Boolean(data && !data.pendingMigration && data.canReview) }
}

export type ProjectReviewCtl = ReturnType<typeof useProjectReview>

export function ReviewLine({ ctl }: { ctl: ProjectReviewCtl }) {
  const last = ctl.data?.items[0]
  if (!ctl.data || ctl.data.pendingMigration) return null
  return (
    <p className="t-footnote text-ink-2">
      {last ? `Terakhir ditinjau ${last.mine ? 'Anda' : last.reviewer} ${formatRelative(last.reviewedAt).toLowerCase()}.` : 'Belum pernah ditandai sudah ditinjau.'}
    </p>
  )
}

export type NoteComposerHandle = { focus: () => void }

/** Catatan untuk PIC: 3 catatan terakhir proyek + kolom tulis. */
export const ProjectNoteComposer = forwardRef<NoteComposerHandle, { projectId: string; pic: string }>(function ProjectNoteComposer(
  { projectId, pic },
  ref
) {
  const { data, loading, error, reload } = useResource<NotesData>(`/api/project-notes?projectId=${encodeURIComponent(projectId)}`)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    focus: () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      boxRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      window.setTimeout(() => inputRef.current?.focus(), 50)
    },
  }))
  const first = pic.split(/\s+/)[0]
  const items = (data?.items ?? []).slice(-3)

  async function submit() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/project-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, body: text }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Catatan belum terkirim.')
      setDraft('')
      reload()
      toast.success(`Catatan terkirim ke ${first}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Catatan belum terkirim.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={boxRef} className="flex flex-col gap-3">
      <h3 className="t-headline">Catatan proyek</h3>
      {loading && !data ? (
        <Skeleton h={48} />
      ) : error ? (
        <p className="t-footnote text-ink-2">{error}</p>
      ) : items.length ? (
        <div className="mk-thread" role="log" aria-label="Catatan proyek">
          {items.map((n) => (
            <div key={n.id} className={cx('mk-thread__item', n.mine && 'is-mine')}>
              <div className="mk-thread__meta">
                {n.mine ? 'Anda' : n.authorName} · {formatDateShort(n.createdAt)} {formatTime(n.createdAt)}
              </div>
              <div className="mk-thread__body">{n.body}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="t-footnote text-ink-2">Belum ada catatan di proyek ini.</p>
      )}
      <form
        className="mk-field"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor={`mk-pnote-${projectId}`} className="mk-field__label">
          Catatan untuk {first}
        </label>
        <Textarea
          ref={inputRef}
          id={`mk-pnote-${projectId}`}
          rows={3}
          maxLength={2000}
          value={draft}
          placeholder={`Mis. Tolong kabari bila vendor belum konfirmasi sampai Kamis.`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="mk-field__hint">PIC, kepala divisi, dan Admin PT proyek ini menerima catatan di lonceng notifikasinya.</p>
        <div>
          <Button type="submit" size="sm" variant="secondary" icon="kirim" disabled={!draft.trim() || busy}>
            {busy ? 'Mengirim…' : 'Kirim catatan'}
          </Button>
        </div>
      </form>
    </div>
  )
})
