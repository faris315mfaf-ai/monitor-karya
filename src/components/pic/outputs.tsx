'use client'

/**
 * Output saya (05-pic-proyek.md): saringan Chip, baris dengan "Unggah bukti"
 * (unggah lalu langsung dikirim untuk review), dan Sheet detail output dengan
 * catatan revisi, daftar bukti, area unggah, dan aksi kirim.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/mk/forms'
import { Textarea } from '@/components/mk/forms'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, Icon, IconButton, Sheet, Skeleton, StatusBadge, cx,
} from '@/components/mk'
import { Field, useConfirm } from '@/components/companies/parts'
import { useResource } from '@/hooks/use-resource'
import { formatDateShort, formatRelative } from '@/lib/format'
import {
  OUTPUT_FILTERS, OUTPUT_META, call, daysUntil, notesChanged, uploadOutputEvidence,
  type EvidenceItem, type OutputItem, type OutputStatus, type useOutputs,
} from './api'

type OutputsRes = ReturnType<typeof useOutputs>
const NEAREST = 7
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'

/** "kemarin", "2 hari lalu" — tanggal lengkap tetap berhuruf besar. */
const rel = (iso: string | null) => {
  const r = formatRelative(iso)
  return /^\d/.test(r) ? r : r.toLowerCase()
}

const editable = (o: OutputItem) => o.status === 'DIKERJAKAN' || o.status === 'PERLU_REVISI'

function metaLine(o: OutputItem): string {
  if (o.status === 'DITERIMA') return `Diterima ${formatDateShort(o.reviewedAt)}${o.reviewerName ? ` · ${o.reviewerName}` : ''}`
  if (o.status === 'MENUNGGU_REVIEW') return `Dikirim ${rel(o.submittedAt)}`
  const left = daysUntil(o.dueDate)
  const due =
    left === null ? 'Tanpa target' : left < 0 ? `Lewat ${-left} hari · ${formatDateShort(o.dueDate)}` : left === 0 ? 'Target hari ini' : `Target ${formatDateShort(o.dueDate)}`
  return o.evidenceCount ? `${due} · ${o.evidenceCount} bukti` : due
}

/** Mengirim output untuk review, dengan toast "Urungkan" yang menarik kiriman. */
async function submitWithUndo(o: OutputItem, reload: () => void, isActive: () => boolean = () => true) {
  await call('/api/outputs', 'PATCH', { id: o.id, action: 'submit' })
  if (!isActive()) return
  reload()
  toast.success(`${o.title} dikirim untuk review`, {
    action: {
      label: 'Urungkan',
      onClick: () => {
        // Toast tetap hidup setelah Sheet ditutup; tindakan eksplisit ini
        // tetap menargetkan output asal. Reload milik induk membaca kunci terbaru.
        call('/api/outputs', 'PATCH', { id: o.id, action: 'withdraw' })
          .then(() => {
            reload()
            toast('Pengiriman dibatalkan')
          })
          .catch((e: Error) => toast.error(e.message))
      },
    },
  })
}

export function OutputsCard(props: { projectId: string; projectName?: string; res: OutputsRes; className?: string }) {
  return <ProjectOutputsCard key={props.projectId} {...props} />
}

function ProjectOutputsCard({
  projectId,
  projectName,
  res,
  className,
}: {
  projectId: string
  projectName?: string
  res: OutputsRes
  className?: string
}) {
  const { data, loading, error, reload } = res
  const [filter, setFilter] = useState<'ALL' | OutputStatus>('ALL')
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<OutputItem | null>(null)

  const items = !loading ? (data?.items ?? []).filter((o) => o.projectId === projectId) : []
  const counts = data?.counts
  const filtered = filter === 'ALL' ? items : items.filter((o) => o.status === filter)
  // "Terdekat": yang perlu disentuh dulu di atas, yang sudah diterima di bawah.
  const rank: Record<OutputStatus, number> = { PERLU_REVISI: 0, DIKERJAKAN: 1, MENUNGGU_REVIEW: 2, DITERIMA: 3 }
  const sorted = filter === 'ALL' ? [...filtered].sort((a, b) => rank[a.status] - rank[b.status]) : filtered
  const shown = showAll ? sorted : sorted.slice(0, NEAREST)
  const open = items.find((o) => o.id === openId) ?? null
  const current = useRef<{ projectId: string; loading: boolean; items: OutputItem[] } | null>(null)
  useLayoutEffect(() => {
    current.current = { projectId, loading, items }
    return () => { current.current = null }
  }, [projectId, loading, items])
  function isCurrent(o: OutputItem, forEdit = true) {
    const live = current.current
    return !!live && !live.loading && o.projectId === live.projectId && live.items.some((item) => item.id === o.id && (!forEdit || editable(item)))
  }

  function pickFor(o: OutputItem) {
    if (!isCurrent(o)) return
    pending.current = o
    fileRef.current?.click()
  }

  async function onFiles(files: FileList | null, target?: OutputItem) {
    const o = target ?? pending.current
    pending.current = null
    if (!o || !files?.length || !isCurrent(o)) return
    setBusyId(o.id)
    try {
      for (const f of Array.from(files)) {
        if (!isCurrent(o)) return
        await uploadOutputEvidence(o.id, f)
      }
      if (!isCurrent(o)) return
      await submitWithUndo(o, reload, () => isCurrent(o, false))
    } catch (e) {
      if (!isCurrent(o)) return
      toast.error(e instanceof Error ? e.message : 'Bukti belum terunggah')
      reload()
    } finally {
      setBusyId(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const subtitle = data
    ? data.total === 0
      ? `Belum ada output${projectName ? ` · ${projectName}` : ''}`
      : `${Math.min(NEAREST, data.total)} output terdekat dari ${data.total} · pilih untuk detail`
    : projectName

  return (
    <Card
      className={className}
      title="Output saya"
      subtitle={subtitle}
      action={
        <Button size="sm" variant="secondary" icon="tambah" disabled={loading} onClick={() => !loading && setCreating(true)}>
          Tambah output
        </Button>
      }
    >
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={36} />
          <Skeleton h={48} />
          <Skeleton h={48} />
        </div>
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : (
        <>
          <div className="mk-chips mb-3" role="group" aria-label="Saring output">
            {OUTPUT_FILTERS.map((f) => (
              <Chip
                key={f.value}
                selected={filter === f.value}
                status={f.status}
                count={f.value === 'ALL' ? data?.total : counts?.[f.value]}
                onClick={() => {
                  setFilter(f.value)
                  setShowAll(false)
                }}
              >
                {f.label}
              </Chip>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyNote
              icon="dokumen"
              done={filter === 'PERLU_REVISI' && items.length > 0}
              action={filter === 'ALL' ? <Button size="sm" variant="plain" onClick={() => setCreating(true)}>Tambah output pertama</Button> : undefined}
            >
              {filter === 'ALL'
                ? 'Belum ada output. Catat hasil kerja yang akan direview kepala divisi.'
                : filter === 'PERLU_REVISI'
                  ? 'Tidak ada output yang perlu direvisi.'
                  : `Tidak ada output berstatus ${OUTPUT_META[filter].label.toLowerCase()}.`}
            </EmptyNote>
          ) : (
            <ul className="mk-pic-outputs">
              {shown.map((o, i) => {
                const m = OUTPUT_META[o.status]
                return (
                  <li
                    key={o.id}
                    className={cx('mk-pic-output', dropId === o.id && 'is-over')}
                    style={{ '--i': i } as React.CSSProperties}
                    // Seret berkas ke baris yang masih dikerjakan = Unggah bukti (lalu dikirim untuk review).
                    onDragOver={
                      editable(o) && busyId === null
                        ? (e) => {
                            if (!e.dataTransfer.types.includes('Files')) return
                            e.preventDefault()
                            setDropId(o.id)
                          }
                        : undefined
                    }
                    onDragLeave={editable(o) ? () => setDropId((cur) => (cur === o.id ? null : cur)) : undefined}
                    onDrop={
                      editable(o) && busyId === null
                        ? (e) => {
                            e.preventDefault()
                            setDropId(null)
                            onFiles(e.dataTransfer.files, o)
                          }
                        : undefined
                    }
                  >
                    <button type="button" className="mk-pic-output__hit" onClick={() => setOpenId(o.id)}>
                      <span className={cx('mk-pic-output__icon', `mk-soft--${m.status}`)} aria-hidden>
                        <Icon name="dokumen" size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-body-strong block truncate">{o.title}</span>
                        <span className="mk-pic-output__sub t-footnote text-ink-2">
                          <span className="mk-pic-output__badge-inline">
                            <StatusBadge status={m.status} size="sm">
                              {m.label}
                            </StatusBadge>
                          </span>
                          <span className="truncate">{metaLine(o)}</span>
                        </span>
                      </span>
                      <span className="mk-pic-output__badge">
                        <StatusBadge status={m.status} size="sm">
                          {m.label}
                        </StatusBadge>
                      </span>
                      <span className="mk-pic-output__chev" aria-hidden>
                        <Icon name="kanan" size={18} />
                      </span>
                    </button>
                    {editable(o) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="unggah"
                        className="mk-pic-output__upload"
                        disabled={busyId === o.id}
                        aria-label={`Unggah bukti ${o.title}`}
                        onClick={() => pickFor(o)}
                      >
                        {busyId === o.id ? 'Mengunggah' : 'Unggah bukti'}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {sorted.length > NEAREST ? (
            <Button size="sm" variant="plain" className="mt-2" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Tampilkan 7 terdekat' : `Tampilkan semua ${sorted.length} output`}
            </Button>
          ) : null}
        </>
      )}

      {open ? (
        <OutputSheet key={open.id} output={open} projectId={projectId} onClose={() => setOpenId(null)} onChanged={reload} />
      ) : null}
      {creating && !loading ? (
        <OutputFormSheet
          projectId={projectId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            if (!current.current || current.current.loading) return
            setCreating(false)
            reload()
          }}
        />
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Sheet output                                                        */
/* ------------------------------------------------------------------ */

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export function OutputSheet(props: { output: OutputItem; projectId: string; onClose: () => void; onChanged: () => void }) {
  if (props.output.projectId !== props.projectId) return null
  return <ProjectOutputSheet key={`${props.projectId}-${props.output.id}`} {...props} />
}

function ProjectOutputSheet({
  output: o,
  projectId,
  onClose,
  onChanged,
}: {
  output: OutputItem
  projectId: string
  onClose: () => void
  onChanged: () => void
}) {
  const ev = useResource<{ items: EvidenceItem[] }>(`/api/evidence?targetType=OUTPUT&targetId=${encodeURIComponent(o.id)}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState({ name: '', url: '' })
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const askRef = useRef<HTMLTextAreaElement>(null)
  const submitAfter = useRef(false)
  const [confirmEl, confirm] = useConfirm()

  // Kolom pertanyaan dibuka: gulir ke sana lalu fokus, kursor di akhir teks awal.
  useEffect(() => {
    if (!asking) return
    const el = askRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [asking])

  const m = OUTPUT_META[o.status]
  const canEdit = editable(o) && !ev.loading
  const evidence = !ev.loading ? ev.data?.items ?? [] : []
  const active = useRef<{ output: OutputItem; loading: boolean; evidence: EvidenceItem[] } | null>(null)
  useLayoutEffect(() => {
    active.current = { output: o, loading: ev.loading, evidence }
    return () => { active.current = null }
  }, [o, ev.loading, evidence])
  const isCurrent = (forEdit = false) => {
    const live = active.current
    return !!live && live.output.id === o.id && live.output.projectId === projectId && !live.loading && (!forEdit || editable(live.output))
  }
  const refresh = () => {
    if (!isCurrent()) return
    ev.reload()
    onChanged()
  }

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : []
    const thenSubmit = submitAfter.current
    submitAfter.current = false
    if (!list.length || !canEdit || !isCurrent(true)) return
    setBusy('upload')
    try {
      for (const f of list) {
        if (!isCurrent(true)) return
        await uploadOutputEvidence(o.id, f)
      }
      if (!isCurrent()) return
      toast.success(list.length === 1 ? 'Bukti terunggah' : `${list.length} bukti terunggah`)
      if (thenSubmit) {
        await submitWithUndo(o, onChanged, () => isCurrent())
        if (isCurrent()) onClose()
        return
      }
      refresh()
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Bukti belum terunggah')
      refresh()
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** "Tanya kepala divisi": pertanyaan masuk ke percakapan catatan proyek ini. */
  async function ask() {
    const text = question.trim()
    if (text.length < 3 || !isCurrent()) return
    setBusy('ask')
    try {
      await call('/api/project-notes', 'POST', { projectId, body: text })
      if (!isCurrent()) return
      setAsking(false)
      setQuestion('')
      notesChanged(projectId)
      toast.success('Pertanyaan terkirim ke kepala divisi', { description: 'Balasannya muncul di Catatan kepala divisi.' })
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Pertanyaan belum terkirim')
    } finally {
      setBusy(null)
    }
  }

  const dropProps = canEdit
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setOver(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          setOver(false)
          if (busy === null) upload(e.dataTransfer.files)
        },
      }
    : {}

  async function addLink() {
    if (!canEdit || !isCurrent(true)) return
    setBusy('link')
    try {
      await call('/api/evidence', 'POST', { targetType: 'OUTPUT', targetId: o.id, fileName: link.name, url: link.url })
      if (!isCurrent()) return
      setLink({ name: '', url: '' })
      setLinkOpen(false)
      toast.success('Tautan bukti ditambahkan')
      refresh()
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Tautan belum tersimpan')
    } finally {
      setBusy(null)
    }
  }

  async function openEvidence(e: EvidenceItem) {
    if (!isCurrent() || ev.loading || !evidence.some((item) => item.id === e.id)) return
    try {
      const j = await call<{ url: string }>(`/api/evidence/${e.id}`, 'GET')
      if (!isCurrent()) return
      window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      if (!isCurrent()) return
      toast.error(err instanceof Error ? err.message : 'Bukti belum bisa dibuka')
    }
  }

  async function removeEvidence(e: EvidenceItem) {
    if (!canEdit || !isCurrent(true) || !active.current?.evidence.some((item) => item.id === e.id)) return
    const ok = await confirm({
      title: 'Hapus bukti ini?',
      description: `${e.fileName} akan dihapus permanen dari output ini.`,
      confirmLabel: 'Hapus bukti',
      destructive: true,
    })
    if (!ok || !isCurrent(true)) return
    setBusy(e.id)
    try {
      await call(`/api/evidence/${e.id}`, 'DELETE')
      if (!isCurrent()) return
      toast.success('Bukti dihapus')
      refresh()
    } catch (err) {
      if (!isCurrent()) return
      toast.error(err instanceof Error ? err.message : 'Bukti belum terhapus')
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    if (!canEdit || !isCurrent(true)) return
    if (!evidence.length) {
      submitAfter.current = true
      fileRef.current?.click()
      return
    }
    setBusy('submit')
    try {
      await submitWithUndo(o, onChanged, () => isCurrent())
      if (isCurrent()) onClose()
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Output belum terkirim')
    } finally {
      setBusy(null)
    }
  }

  async function withdraw() {
    if (!isCurrent() || ev.loading || active.current?.output.status !== 'MENUNGGU_REVIEW') return
    setBusy('withdraw')
    try {
      await call('/api/outputs', 'PATCH', { id: o.id, action: 'withdraw' })
      toast('Pengiriman dibatalkan')
      refresh()
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Pengiriman belum dibatalkan')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!canEdit || !isCurrent(true)) return
    const ok = await confirm({
      title: 'Hapus output ini?',
      description: `${o.title} akan dihapus permanen.`,
      confirmLabel: 'Hapus output',
      destructive: true,
    })
    if (!ok || !isCurrent(true)) return
    try {
      await call(`/api/outputs?id=${encodeURIComponent(o.id)}`, 'DELETE')
      if (!isCurrent()) return
      toast.success('Output dihapus')
      onChanged()
      onClose()
    } catch (e) {
      if (!isCurrent()) return
      toast.error(e instanceof Error ? e.message : 'Output belum terhapus')
    }
  }

  const primary =
    o.status === 'MENUNGGU_REVIEW' ? (
      <Button variant="primary" disabled>
        Menunggu review
      </Button>
    ) : canEdit ? (
      <Button variant="primary" icon={evidence.length ? 'kirim' : 'unggah'} disabled={busy !== null || ev.loading} onClick={submit}>
        {evidence.length ? 'Kirim untuk review' : 'Unggah bukti & kirim'}
      </Button>
    ) : null

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Output"
      eyebrow={o.projectName}
      title={o.title}
      subtitle={metaLine(o)}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button
            variant="plain"
            icon="catatan"
            aria-expanded={asking}
            onClick={() => {
              if (!asking) setQuestion((q) => q || `Tentang output "${o.title}": `)
              setAsking(true)
            }}
          >
            Tanya kepala divisi
          </Button>
          {primary}
        </div>
      }
    >
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={m.status}>{m.label}</StatusBadge>
          {o.status === 'MENUNGGU_REVIEW' ? (
            <Button size="sm" variant="plain" disabled={busy !== null} onClick={withdraw}>
              Batalkan pengiriman
            </Button>
          ) : null}
        </div>

        {o.status === 'PERLU_REVISI' && o.revisionNote ? (
          <section aria-label="Catatan revisi">
            <h3 className="t-headline mb-2">Catatan revisi</h3>
            <p className="mk-pic-revision mk-soft--risk">
              {o.revisionNote}
              {o.reviewerName ? <span className="mk-pic-revision__by">— {o.reviewerName}</span> : null}
            </p>
          </section>
        ) : null}

        {editing && canEdit ? (
          <OutputForm
            output={o}
            projectId={projectId}
            onDone={(saved) => {
              if (!isCurrent()) return
              setEditing(false)
              if (saved) onChanged()
            }}
          />
        ) : (
          <section aria-label="Deskripsi">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="t-headline">Deskripsi</h3>
              {canEdit ? (
                <Button size="sm" variant="plain" onClick={() => setEditing(true)}>
                  Ubah output
                </Button>
              ) : null}
            </div>
            <p className="t-body text-ink whitespace-pre-wrap">{o.description || 'Belum ada deskripsi.'}</p>
            <p className="t-footnote text-ink-2 mt-2">
              {o.dueDate ? `Target ${formatDateShort(o.dueDate)}` : 'Tanpa target'} · dibuat {rel(o.createdAt)}
            </p>
          </section>
        )}

        <section aria-label="Bukti" {...dropProps}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="t-headline">Bukti{evidence.length ? ` · ${evidence.length}` : ''}</h3>
            {canEdit && evidence.length ? (
              <Button size="sm" variant="plain" icon="unggah" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                Tambah bukti
              </Button>
            ) : null}
          </div>
          {ev.loading ? (
            <Skeleton h={44} />
          ) : ev.error ? (
            <ErrorNote message={ev.error} onRetry={ev.reload} />
          ) : evidence.length ? (
            <ul className="mk-pic-evidence">
              {evidence.map((e) => (
                <li key={e.id}>
                  <span className="mk-pic-output__icon mk-soft--neutral" aria-hidden>
                    <Icon name={e.url ? 'alur' : 'dokumen'} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-body-strong block truncate">{e.fileName}</span>
                    <span className="t-footnote text-ink-2">{e.url ? 'Tautan' : fmtSize(e.size)} · {formatRelative(e.createdAt)}</span>
                  </span>
                  <IconButton icon="unduh" label={`Buka ${e.fileName}`} onClick={() => openEvidence(e)} />
                  {canEdit ? (
                    <IconButton icon="tutup" label={`Hapus ${e.fileName}`} disabled={busy === e.id} onClick={() => removeEvidence(e)} />
                  ) : null}
                </li>
              ))}
              {canEdit ? (
                <li className={cx('mk-pic-drop is-compact', over && 'is-over', busy === 'upload' && 'is-disabled')} aria-hidden>
                  <Icon name="unggah" size={18} />
                  <span>{busy === 'upload' ? 'Mengunggah bukti' : 'Seret berkas ke sini untuk menambah bukti'}</span>
                </li>
              ) : null}
            </ul>
          ) : canEdit ? (
            <div className={cx('mk-pic-drop', over && 'is-over', busy === 'upload' && 'is-disabled')}>
              <Icon name="unggah" size={24} />
              <span>{busy === 'upload' ? 'Mengunggah bukti' : 'Seret berkas ke sini atau tekan Unggah bukti'}</span>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                Unggah bukti
              </Button>
            </div>
          ) : (
            <EmptyNote icon="dokumen">Belum ada bukti.</EmptyNote>
          )}

          {canEdit ? (
            linkOpen ? (
              <div className="mk-inset mt-3 flex flex-col gap-3">
                <Field label="Nama bukti" htmlFor={`ol-name-${o.id}`}>
                  <Input id={`ol-name-${o.id}`} value={link.name} onChange={(e) => setLink((l) => ({ ...l, name: e.target.value }))} placeholder="Mis. Panduan pengguna v2" />
                </Field>
                <Field label="Tautan" htmlFor={`ol-url-${o.id}`} hint="Diawali https://">
                  <Input id={`ol-url-${o.id}`} type="url" inputMode="url" value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} placeholder="https://" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="plain" onClick={() => setLinkOpen(false)}>
                    Batal
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy !== null || !link.name.trim() || !link.url.trim()} onClick={addLink}>
                    Tambahkan tautan
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="plain" icon="alur" className="mt-2" onClick={() => setLinkOpen(true)}>
                Tambah tautan bukti
              </Button>
            )
          ) : null}
        </section>

        {asking ? (
          <section aria-label="Tanya kepala divisi" className="mk-inset flex flex-col gap-3">
            <Field label="Pertanyaan untuk kepala divisi" htmlFor={`ask-${o.id}`} hint="Masuk ke percakapan Catatan kepala divisi proyek ini.">
              <Textarea
                ref={askRef}
                id={`ask-${o.id}`}
                rows={3}
                maxLength={2000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Mis. apakah tangkapan layar versi Android juga perlu?"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="plain" onClick={() => setAsking(false)}>
                Batal
              </Button>
              <Button size="sm" variant="secondary" icon="kirim" disabled={busy !== null || question.trim().length < 3} onClick={ask}>
                Kirim pertanyaan
              </Button>
            </div>
          </section>
        ) : null}

        {canEdit && evidence.length === 0 && !ev.loading ? (
          <Button size="sm" variant="plain" className="self-start text-bahaya" onClick={remove}>
            Hapus output
          </Button>
        ) : null}
      </div>
      {confirmEl}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Form output (baru / ubah)                                           */
/* ------------------------------------------------------------------ */

function OutputForm({
  output,
  projectId,
  onDone,
  formId,
}: {
  output?: OutputItem
  projectId: string
  onDone: (saved: boolean) => void
  formId?: string
}) {
  const [title, setTitle] = useState(output?.title ?? '')
  const [description, setDescription] = useState(output?.description ?? '')
  const [due, setDue] = useState(output?.dueDate ? new Date(Date.parse(output.dueDate) + 7 * 3600000).toISOString().slice(0, 10) : '')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const id = output?.id ?? 'baru'
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (title.trim().length < 3) {
      setErr('Judul output minimal 3 huruf')
      return
    }
    setSaving(true)
    try {
      if (output) {
        await call('/api/outputs', 'PATCH', { id: output.id, action: 'update', title, description, dueDate: due || null })
        if (!active.current) return
        toast.success('Output diperbarui')
      } else {
        await call('/api/outputs', 'POST', { projectId, title, description, dueDate: due || null })
        if (!active.current) return
        toast.success('Output ditambahkan')
      }
      onDone(true)
    } catch (e2) {
      if (!active.current) return
      setErr(e2 instanceof Error ? e2.message : 'Output belum tersimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={save}>
      <Field label="Judul" htmlFor={`of-title-${id}`} required error={err}>
        <Input id={`of-title-${id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Mis. Panduan pengguna versi iPhone" />
      </Field>
      <Field label="Deskripsi" htmlFor={`of-desc-${id}`} hint="Apa yang diserahkan dan bagaimana menilainya">
        <Textarea id={`of-desc-${id}`} rows={3} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Target selesai" htmlFor={`of-due-${id}`}>
        <Input id={`of-due-${id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      {output ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="plain" onClick={() => onDone(false)}>
            Batal
          </Button>
          <Button size="sm" variant="secondary" type="submit" disabled={saving}>
            Simpan perubahan
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function OutputFormSheet({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      backLabel="Output"
      title="Output baru"
      subtitle="Hasil kerja yang nanti direview kepala divisi"
      footer={
        <Button variant="primary" type="submit" form="mk-pic-output-new">
          Simpan output
        </Button>
      }
    >
      <OutputForm projectId={projectId} formId="mk-pic-output-new" onDone={(saved) => (saved ? onSaved() : onClose())} />
    </Sheet>
  )
}
