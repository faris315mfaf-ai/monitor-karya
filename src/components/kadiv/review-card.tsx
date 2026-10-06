'use client'

/**
 * Output menunggu review (03-kepala-divisi.md §4): Chip per proyek,
 * ApprovalItem "Terima / Minta revisi → Diterima / Revisi diminta", tombol
 * "Terima semua". Terima bisa diurungkan lewat toast (15 menit, dijaga server);
 * Minta revisi membuka Sheet kecil karena catatan wajib untuk PIC.
 */

import { useMemo, useState, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { ApprovalItem, Button, Card, Chip, EmptyNote, ErrorNote, Sheet, Skeleton, type Tone } from '@/components/mk'
import { Textarea } from '@/components/mk/forms'
import { useResource } from '@/hooks/use-resource'
import { formatRelative } from '@/lib/format'
import { postJson, type KadivDataCtl } from './use-kadiv'
import type { ReviewOutput } from './types'

const TONES: Tone[] = ['data-1', 'data-2', 'data-4', 'data-5', 'data-3', 'data-6']

type ReviewEvidence = { fileName: string; mime: string }

function ReviewOutputItem({ output, ...props }: ComponentProps<typeof ApprovalItem> & { output: ReviewOutput }) {
  // Endpoint lama sudah menjaga akses OUTPUT; hanya baris yang tampak dimuat.
  const { data, loading, error } = useResource<{ items: ReviewEvidence[] }>(output.evidenceCount
    ? `/api/evidence?targetType=OUTPUT&targetId=${encodeURIComponent(output.id)}` : null)
  const type = (mime: string) => mime === 'text/uri-list' ? 'Tautan' : mime === 'application/pdf' ? 'Dokumen PDF' :
    mime.startsWith('image/') ? 'Gambar' : mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'Berkas'
  const evidence = !output.evidenceCount ? 'Tanpa bukti' : loading ? `${output.evidenceCount} bukti · memuat jenis bukti…` :
    error || !data ? `${output.evidenceCount} bukti · jenis bukti belum termuat` :
      data.items.map((e) => `${type(e.mime)}: ${e.fileName}`).join(' · ') || 'Tanpa bukti'
  return <ApprovalItem {...props} amount={`${output.project.name} · ${evidence}`} />
}

export function useReviewActions(ctl: KadivDataCtl) {
  const [busy, setBusy] = useState<string | null>(null)

  async function undo(ids: string[]) {
    try {
      await postJson('/api/outputs/review', { action: 'undo', ids })
      toast.success(ids.length > 1 ? `${ids.length} keputusan diurungkan.` : 'Keputusan diurungkan.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum berhasil diurungkan')
    } finally {
      void ctl.reload()
    }
  }

  async function run(key: string, body: Record<string, unknown>, done: (ids: string[]) => string) {
    setBusy(key)
    try {
      const r = await postJson<{ ids: string[] }>('/api/outputs/review', body)
      const ids = r.ids ?? []
      if (ids.length === 0) toast('Tidak ada output yang perlu diterima.')
      else toast.success(done(ids), { action: { label: 'Urungkan', onClick: () => void undo(ids) } })
      await ctl.reload()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review belum tersimpan')
      await ctl.reload()
      return false
    } finally {
      setBusy(null)
    }
  }

  return {
    busy,
    accept: (o: ReviewOutput) => run(o.id, { action: 'accept', id: o.id }, () => `${o.title} diterima.`),
    revise: (o: ReviewOutput, note: string) => run(o.id, { action: 'revise', id: o.id, note }, () => `Revisi diminta dari ${o.owner.name}.`),
    acceptAll: (ids: string[]) => run('all', { action: 'accept-all', ids }, (d) => `${d.length} output diterima.`),
  }
}

export function ReviewOutputCard({ ctl, className, limit = 8, id }: { ctl: KadivDataCtl; className?: string; limit?: number; id?: string }) {
  const { review, reviewError, loading } = ctl
  const act = useReviewActions(ctl)
  const [project, setProject] = useState<string>('ALL')
  const [revising, setRevising] = useState<ReviewOutput | null>(null)
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)

  const queue = useMemo(() => review?.queue ?? [], [review])
  const projects = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>()
    for (const o of queue) {
      const cur = m.get(o.project.id) ?? { id: o.project.id, name: o.project.name, n: 0 }
      cur.n += 1
      m.set(o.project.id, cur)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [queue])
  const tone = (pid: string) => TONES[Math.max(0, projects.findIndex((p) => p.id === pid)) % TONES.length]
  const activeProject = project !== 'ALL' && !projects.some((p) => p.id === project) ? 'ALL' : project

  const rows = useMemo(() => {
    const all = [...queue, ...(review?.decided ?? [])].filter((o) => activeProject === 'ALL' || o.project.id === activeProject)
    return all.sort((a, b) => Date.parse(a.submittedAt ?? '') - Date.parse(b.submittedAt ?? '') || a.id.localeCompare(b.id))
  }, [queue, review, activeProject])
  const pendingIds = rows.filter((o) => o.status === 'MENUNGGU_REVIEW').map((o) => o.id)
  const visible = showAll ? rows : rows.slice(0, limit)
  const oldest = queue[0]?.submittedAt

  return (
    <Card
      id={id}
      className={className}
      title="Output menunggu review"
      subtitle={
        queue.length
          ? `${queue.length} output · paling lama ${formatRelative(oldest).toLowerCase()} · baru dihitung selesai setelah Anda terima`
          : 'Output baru dihitung selesai setelah Anda terima'
      }
      action={
        pendingIds.length > 1 ? (
          <Button size="sm" variant="primary" icon="persetujuan" disabled={act.busy !== null} onClick={() => void act.acceptAll(pendingIds)}>
            {act.busy === 'all' ? 'Menerima…' : activeProject === 'ALL' ? 'Terima semua' : `Terima ${pendingIds.length} output`}
          </Button>
        ) : null
      }
    >
      {loading && !review ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton h={52} />
          <Skeleton h={52} />
          <Skeleton h={52} />
        </div>
      ) : reviewError && !review ? (
        <ErrorNote message={reviewError} onRetry={() => void ctl.reload()} />
      ) : rows.length === 0 && queue.length === 0 ? (
        <EmptyNote done>Tidak ada output yang menunggu review.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.length > 0 && (
            <div className="mk-chips" role="group" aria-label="Saring menurut proyek">
              <Chip selected={activeProject === 'ALL'} count={queue.length} onClick={() => setProject('ALL')}>
                Semua
              </Chip>
              {projects.map((p) => (
                <Chip key={p.id} selected={activeProject === p.id} count={p.n} onClick={() => setProject(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-col">
            {visible.map((o) => (
              <ReviewOutputItem
                key={`${o.id}:${o.evidenceCount}:${o.submittedAt}`}
                output={o}
                title={o.title}
                requester={o.owner.name}
                initials={o.owner.initials}
                tone={tone(o.project.id)}
                time={formatRelative(o.submittedAt)}
                state={o.status === 'DITERIMA' ? 'approved' : o.status === 'PERLU_REVISI' ? 'rejected' : 'pending'}
                approveLabel="Terima"
                approveVariant="secondary"
                rejectLabel="Minta revisi"
                approvedLabel="Diterima"
                rejectedLabel="Revisi diminta"
                busy={act.busy === o.id || act.busy === 'all'}
                onApprove={() => void act.accept(o)}
                onReject={() => {
                  setNote('')
                  setRevising(o)
                }}
              />
            ))}
          </div>
          {rows.length > limit && (
            <Button variant="plain" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${rows.length} output`}
            </Button>
          )}
        </div>
      )}

      <Sheet
        open={revising !== null}
        onOpenChange={(o) => !o && setRevising(null)}
        eyebrow={revising?.project.name}
        title="Minta revisi"
        subtitle={revising ? `${revising.title} · ${revising.owner.name}` : undefined}
        backLabel="Review"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevising(null)}>
              Batal
            </Button>
            <Button
              variant="primary"
              icon="kirim"
              disabled={note.trim().length < 5 || act.busy !== null}
              onClick={async () => {
                if (!revising) return
                const ok = await act.revise(revising, note.trim())
                if (ok) setRevising(null)
              }}
            >
              {act.busy ? 'Mengirim…' : 'Kirim permintaan revisi'}
            </Button>
          </div>
        }
      >
        <div className="mk-field">
          <label htmlFor="kadiv-revise-note" className="mk-field__label">
            Catatan untuk {revising?.owner.name ?? 'PIC'}
          </label>
          <Textarea
            id="kadiv-revise-note"
            value={note}
            maxLength={2000}
            rows={5}
            placeholder="Tuliskan apa yang perlu diperbaiki, misalnya bagian laporan uji yang belum lengkap."
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="mk-field__hint">Minimal 5 huruf. Output kembali ke PIC dengan status Perlu revisi.</p>
        </div>
      </Sheet>
    </Card>
  )
}
