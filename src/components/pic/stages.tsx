'use client'

/**
 * Tahapan proyek bertanggal + usulan geser tenggat (05-pic-proyek.md).
 * FlowDiagram vertikal: nama tahap, tanggal, status (tertahan menampilkan
 * alasannya). Di bawahnya tenggat proyek dan usulan geser yang sedang ditinjau
 * Direktur. Tahapan diatur di Sheet; usulan diajukan di Sheet tersendiri.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/mk/forms'
import { Textarea } from '@/components/mk/forms'
import {
  Button, Card, DateBox, EmptyNote, ErrorNote, FlowDiagram, IconButton, Sheet, Skeleton, StatusBadge,
  type FlowStep,
} from '@/components/mk'
import { Field, selectCls, useConfirm } from '@/components/companies/parts'
import { formatDateShort } from '@/lib/format'
import {
  STAGE_META, call, dateKey, daysUntil, useProposals, useStages,
  type ProposalItem, type StageItem, type StageStatus,
} from './api'

function range(s: StageItem): string | undefined {
  if (s.startDate && s.dueDate) return `${formatDateShort(s.startDate)}–${formatDateShort(s.dueDate)}`
  if (s.dueDate) return `Selesai ${formatDateShort(s.dueDate)}`
  if (s.startDate) return `Mulai ${formatDateShort(s.startDate)}`
  return undefined
}

export function StagesCard({
  projectId,
  projectName,
  fallback,
  className,
}: {
  projectId: string
  projectName?: string
  /** Ditampilkan bila proyek belum punya tahapan bertanggal (mis. 4 fase tetap). */
  fallback?: FlowStep[]
  className?: string
}) {
  const { data, loading, error, reload } = useStages(projectId)
  const proposals = useProposals(projectId)
  const [editing, setEditing] = useState(false)
  const [proposing, setProposing] = useState(false)

  const items = data?.items ?? []
  const pending = proposals.data?.items.find((p) => p.status === 'DIAJUKAN') ?? null
  const lastDecided = proposals.data?.items.find((p) => p.status !== 'DIAJUKAN') ?? null

  const steps: FlowStep[] = items.map((s, i) => {
    const last = i === items.length - 1
    const sub = range(s)
    return {
      title: s.name,
      sub: last && pending && s.dueDate ? `${sub} · usul ${formatDateShort(pending.proposedDate)}` : sub,
      status: STAGE_META[s.status].flow,
      meta: s.status === 'TERTAHAN' ? (s.note ?? 'Tertahan') : s.status === 'BERJALAN' && s.note ? s.note : undefined,
    }
  })

  const refreshAll = () => {
    reload()
    proposals.reload()
  }

  return (
    <Card
      className={className}
      title="Tahapan proyek"
      subtitle={data ? (data.total ? `${data.done} dari ${data.total} tahap selesai` : 'Belum ada tahapan bertanggal') : projectName}
      action={
        data?.canEdit ? (
          <Button size="sm" variant="plain" onClick={() => setEditing(true)}>
            {data.total ? 'Atur tahapan' : 'Susun tahapan'}
          </Button>
        ) : undefined
      }
    >
      {loading && !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={40} />
          <Skeleton h={40} />
          <Skeleton h={40} />
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-4">
          {steps.length ? (
            <FlowDiagram orientation="vertical" steps={steps} label="Tahapan proyek" />
          ) : fallback?.length ? (
            <>
              <FlowDiagram orientation="vertical" steps={fallback} label="Fase proyek" />
              <p className="t-footnote text-ink-2">Fase umum proyek. Susun tahapan bertanggal agar kepala divisi melihat jadwal yang sama.</p>
            </>
          ) : (
            <EmptyNote icon="alur">Belum ada tahapan. Susun tahapan bertanggal untuk proyek ini.</EmptyNote>
          )}
          <DeadlineBlock
            targetEndDate={data?.targetEndDate ?? null}
            pending={pending}
            lastDecided={lastDecided}
            canPropose={Boolean(data?.canEdit)}
            onPropose={() => setProposing(true)}
            onChanged={refreshAll}
          />
        </div>
      )}

      {editing && data ? <StagesSheet projectId={projectId} items={items} onClose={() => setEditing(false)} onChanged={reload} /> : null}
      {proposing ? (
        <ProposalSheet
          projectId={projectId}
          targetEndDate={data?.targetEndDate ?? null}
          onClose={() => setProposing(false)}
          onSaved={() => {
            setProposing(false)
            refreshAll()
          }}
        />
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tenggat & usulan geser                                              */
/* ------------------------------------------------------------------ */

function DeadlineBlock({
  targetEndDate,
  pending,
  lastDecided,
  canPropose,
  onPropose,
  onChanged,
}: {
  targetEndDate: string | null
  pending: ProposalItem | null
  lastDecided: ProposalItem | null
  canPropose: boolean
  onPropose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const left = daysUntil(targetEndDate)

  async function withdraw(p: ProposalItem) {
    setBusy(true)
    try {
      await call('/api/deadline-proposals', 'PATCH', { id: p.id, action: 'withdraw' })
      onChanged()
      toast('Usulan tenggat ditarik', {
        action: {
          label: 'Urungkan',
          onClick: () => {
            call('/api/deadline-proposals', 'POST', { projectId: p.projectId, proposedDate: dateKey(p.proposedDate), reason: p.reason })
              .then(() => {
                onChanged()
                toast.success('Usulan diajukan kembali')
              })
              .catch((e: Error) => toast.error(e.message))
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Usulan belum ditarik')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mk-pic-deadline">
        {targetEndDate ? <DateBox date={targetEndDate} /> : null}
        <div className="mk-pic-deadline__text">
          <div className="t-body-strong">
            {targetEndDate ? `Tenggat ${formatDateShort(targetEndDate)}` : 'Tenggat belum ditetapkan'}
          </div>
          <div className="t-footnote text-ink-2">
            {left === null ? 'Hubungi Admin PT untuk menetapkan tenggat' : left < 0 ? `Lewat ${-left} hari` : left === 0 ? 'Hari ini' : `${left} hari lagi`}
          </div>
        </div>
        {canPropose && !pending ? (
          <Button size="sm" variant="secondary" onClick={onPropose}>
            Usulkan tenggat baru
          </Button>
        ) : null}
      </div>
      {pending ? (
        <div className="flex flex-col gap-2">
          <StatusBadge status="neutral">Usul {formatDateShort(pending.proposedDate)} · sedang ditinjau</StatusBadge>
          <p className="t-footnote text-ink-2">
            {pending.reason} — diajukan {pending.proposedByName}
          </p>
          {canPropose ? (
            <Button size="sm" variant="plain" className="self-start" disabled={busy} onClick={() => withdraw(pending)}>
              Tarik usulan
            </Button>
          ) : null}
        </div>
      ) : lastDecided ? (
        <p className="t-footnote text-ink-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={lastDecided.status === 'DISETUJUI' ? 'done' : 'late'} size="sm">
            {lastDecided.status === 'DISETUJUI' ? 'Usulan disetujui' : 'Usulan ditolak'}
          </StatusBadge>
          <span>
            {formatDateShort(lastDecided.proposedDate)}
            {lastDecided.decidedByName ? ` · ${lastDecided.decidedByName}` : ''}
            {lastDecided.decisionNote ? `: ${lastDecided.decisionNote}` : ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}

function ProposalSheet({
  projectId,
  targetEndDate,
  onClose,
  onSaved,
}: {
  projectId: string
  targetEndDate: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const tomorrow = dateKey(new Date(Date.now() + 86400000).toISOString())
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<{ date?: string; reason?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next: typeof err = {}
    if (!date) next.date = 'Pilih tanggal tenggat baru'
    else if (date < tomorrow) next.date = 'Tenggat baru harus setelah hari ini'
    if (reason.trim().length < 10) next.reason = 'Tulis alasannya sebagai fakta, minimal 10 huruf'
    setErr(next)
    if (next.date || next.reason) return
    setSaving(true)
    try {
      await call('/api/deadline-proposals', 'POST', { projectId, proposedDate: date, reason })
      toast.success('Usulan tenggat dikirim ke Direktur')
      onSaved()
    } catch (e2) {
      setErr({ form: e2 instanceof Error ? e2.message : 'Usulan belum terkirim' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Tahapan"
      title="Usulkan tenggat baru"
      subtitle={targetEndDate ? `Tenggat sekarang ${formatDateShort(targetEndDate)} · diputuskan Direktur entitas` : 'Diputuskan Direktur entitas'}
      footer={
        <Button variant="primary" type="submit" form="mk-pic-proposal" disabled={saving}>
          Kirim usulan
        </Button>
      }
    >
      <form id="mk-pic-proposal" className="flex flex-col gap-4" onSubmit={save}>
        <Field label="Tenggat baru" htmlFor="mk-pic-prop-date" required error={err.date}>
          <Input id="mk-pic-prop-date" type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Alasan" htmlFor="mk-pic-prop-reason" required error={err.reason} hint="Tulis faktanya: apa yang menggeser jadwal dan berapa lama.">
          <Textarea
            id="mk-pic-prop-reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mis. perangkat uji gelombang 2 terlambat 4 hari dari vendor"
          />
        </Field>
        {err.form ? (
          <p className="mk-note-box mk-soft--late" role="alert">
            {err.form}
          </p>
        ) : null}
      </form>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Atur tahapan                                                        */
/* ------------------------------------------------------------------ */

type Draft = { id: string | null; name: string; startDate: string; dueDate: string; status: StageStatus; note: string }
const emptyDraft: Draft = { id: null, name: '', startDate: '', dueDate: '', status: 'BELUM_MULAI', note: '' }

function StagesSheet({
  projectId,
  items,
  onClose,
  onChanged,
}: {
  projectId: string
  items: StageItem[]
  onClose: () => void
  onChanged: () => void
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmEl, confirm] = useConfirm()

  function edit(s: StageItem) {
    setErr(null)
    setDraft({ id: s.id, name: s.name, startDate: dateKey(s.startDate), dueDate: dateKey(s.dueDate), status: s.status, note: s.note ?? '' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (draft.name.trim().length < 2) return setErr('Nama tahap minimal 2 huruf')
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) return setErr('Tanggal selesai tidak boleh sebelum tanggal mulai')
    if (draft.status === 'TERTAHAN' && !draft.note.trim()) return setErr('Tulis alasan tahap tertahan')
    setBusy(true)
    setErr(null)
    try {
      const payload = {
        name: draft.name,
        startDate: draft.startDate || null,
        dueDate: draft.dueDate || null,
        status: draft.status,
        note: draft.note,
      }
      if (draft.id) await call('/api/project-stages', 'PUT', { id: draft.id, ...payload })
      else await call('/api/project-stages', 'POST', { projectId, ...payload })
      toast.success(draft.id ? 'Tahap diperbarui' : 'Tahap ditambahkan')
      setDraft(emptyDraft)
      onChanged()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Tahap belum tersimpan')
    } finally {
      setBusy(false)
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const order = items.map((s) => s.id)
    ;[order[i], order[j]] = [order[j], order[i]]
    try {
      await call('/api/project-stages', 'PATCH', { projectId, order })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Urutan belum tersimpan')
    }
  }

  async function remove(s: StageItem) {
    const ok = await confirm({
      title: 'Hapus tahap ini?',
      description: `${s.name} akan dihapus permanen dari tahapan proyek.`,
      confirmLabel: 'Hapus tahap',
      destructive: true,
    })
    if (!ok) return
    try {
      await call(`/api/project-stages?id=${encodeURIComponent(s.id)}`, 'DELETE')
      if (draft.id === s.id) setDraft(emptyDraft)
      toast.success('Tahap dihapus')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tahap belum terhapus')
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Tahapan"
      size="wide"
      title="Atur tahapan"
      subtitle={`${items.length} tahap · urutkan, ubah tanggal, atau tandai tertahan`}
      footer={
        <Button variant="primary" type="submit" form="mk-pic-stage-form" disabled={busy}>
          {draft.id ? 'Simpan tahap' : 'Tambah tahap'}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {items.length ? (
          <ol className="mk-pic-stages-edit">
            {items.map((s, i) => (
              <li key={s.id} className="mk-pic-stage-row">
                <div className="mk-pic-stage-row__main">
                  <div className="t-body-strong truncate">
                    {i + 1}. {s.name}
                  </div>
                  <div className="t-footnote text-ink-2 truncate">{range(s) ?? 'Tanpa tanggal'}</div>
                </div>
                <StatusBadge status={s.status === 'SELESAI' ? 'done' : s.status === 'TERTAHAN' ? 'risk' : s.status === 'BERJALAN' ? 'on' : 'neutral'} size="sm">
                  {STAGE_META[s.status].label}
                </StatusBadge>
                <IconButton icon="bawah" className="mk-pic-up" label={`Naikkan ${s.name}`} disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="bawah" label={`Turunkan ${s.name}`} disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon="catatan" label={`Ubah ${s.name}`} onClick={() => edit(s)} />
                <IconButton icon="tutup" label={`Hapus ${s.name}`} onClick={() => remove(s)} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyNote icon="alur">Belum ada tahap. Mulai dari perencanaan sampai rilis.</EmptyNote>
        )}

        <form id="mk-pic-stage-form" className="mk-inset flex flex-col gap-4" onSubmit={save}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="t-headline">{draft.id ? 'Ubah tahap' : 'Tahap baru'}</h3>
            {draft.id ? (
              <Button size="sm" variant="plain" onClick={() => setDraft(emptyDraft)}>
                Batal ubah
              </Button>
            ) : null}
          </div>
          <Field label="Nama tahap" htmlFor="mk-pic-stage-name" required error={err}>
            <Input id="mk-pic-stage-name" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Mis. Uji coba gelombang 2" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mulai" htmlFor="mk-pic-stage-start">
              <Input id="mk-pic-stage-start" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </Field>
            <Field label="Selesai" htmlFor="mk-pic-stage-due">
              <Input id="mk-pic-stage-due" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Status" htmlFor="mk-pic-stage-status">
            <select id="mk-pic-stage-status" className={selectCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as StageStatus })}>
              {(Object.keys(STAGE_META) as StageStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STAGE_META[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={draft.status === 'TERTAHAN' ? 'Alasan tertahan' : 'Catatan'}
            htmlFor="mk-pic-stage-note"
            required={draft.status === 'TERTAHAN'}
            hint={draft.status === 'TERTAHAN' ? 'Tampil di diagram, mis. "Perangkat terlambat"' : undefined}
          >
            <Input id="mk-pic-stage-note" value={draft.note} maxLength={500} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </Field>
        </form>
      </div>
      {confirmEl}
    </Sheet>
  )
}
