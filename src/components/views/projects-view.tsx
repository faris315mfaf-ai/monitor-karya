'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import { NotificationButton } from '@/components/shell'
import {
  ApprovalItem, Button, Card, Chip, EmptyNote, ErrorNote, FlowDiagram, Hero, IconButton, PageHeader, ProgressRing,
  ProjectRow, SearchField, SegmentedControl, Sheet, Skeleton, StatusBadge, Timeline,
  type FlowStep, type Status,
} from '@/components/mk'
import { Field, InfoLine, SectionTitle, SwitchRow, selectCls, useConfirm } from '@/components/companies/parts'
import { seriesTone, timelineFrame } from '@/components/views/dash-common'
import { PROJECT_PHASE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_APPROVER_LABELS } from '@/lib/constants'
import { deriveProjectStatus } from '@/lib/project-status'
import { can } from '@/lib/rbac'
import { formatDate, formatDateShort, formatDateTime, formatNumber, formatRelative, initials } from '@/lib/format'
import { toastWithUndo } from '@/lib/undo-client' // [F2-URUNGKAN]

type Approval = { role: string; decision: 'DISETUJUI' | 'DITOLAK' | null; note: string | null; decidedAt: string | null; decidedByName: string | null }

type ProjectItem = {
  id: string
  code: string
  name: string
  phase: string
  lifecycle: string
  picName: string | null
  picUserId: string | null
  /** [F2-ADMIN] divisi pelaksana (Project.divisionId). */
  divisionId?: string | null
  division?: { id: string; name: string } | null
  description: string | null
  purpose: string | null
  proposedBy: { id: string; name: string; role: string } | null
  proposedAt: string | null
  approvalChain: string[]
  pendingRole: string | null
  approvals: Approval[]
  relatedEntities: { id: string; name: string; code: string }[]
  startDate: string | null
  targetEndDate: string | null
  approvedByName: string | null
  noApproval: boolean
  entity: { id: string; name: string; code: string; region: string | null }
  latestReport: { status: string; progressPct: number; reportDate: string; isLate: boolean } | null
  permissions: { manage: boolean; setLifecycle: boolean; approve: boolean; resubmit: boolean }
}

type ProjectListData = { items: ProjectItem[]; total: number; page: number; pageSize: number }

type Options = {
  entity: { id: string; code: string; name: string } | null
  entityPinned: boolean
  entities: { id: string; code: string; name: string }[]
  candidates: { id: string; name: string; activeProjects: number }[]
  /** [F2-ADMIN] divisi aktif di PT pemilik. */
  divisions?: { id: string; name: string }[]
  chain: string[]
  picIsSelf: boolean
}

type Decision = 'DISETUJUI' | 'DITOLAK'

const LIFECYCLES = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'DIUSULKAN', label: 'Diusulkan' },
  { value: 'DITOLAK', label: 'Ditolak' },
  { value: 'DITUTUP', label: 'Ditutup' },
  { value: 'DIARSIPKAN', label: 'Diarsipkan' },
  { value: 'ALL', label: 'Semua status' },
]

/** Kolom isian bertoken (pengganti Input/Textarea lama). */
const inputCls =
  'h-11 w-full min-w-0 rounded-sm border-0 bg-fill-1 px-3.5 t-body text-ink placeholder:text-ink-3 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'
const areaCls =
  'w-full min-h-20 rounded-md border-0 bg-fill-1 px-3.5 py-3 t-body text-ink placeholder:text-ink-3 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'

/** "2026-09-10T17:00:00Z" (tengah malam WIB) -> "2026-09-11" untuk <input type=date>. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

async function call(url: string, method: string, body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json, error: res.ok ? null : ((json.error as string) || 'Gagal') }
  } catch {
    return { ok: false, status: 0, json: {} as Record<string, unknown>, error: 'Tidak dapat menghubungi server.' }
  }
}

const approverLabel = (role: string | null | undefined) => PROJECT_APPROVER_LABELS[role ?? ''] ?? role ?? 'persetujuan'
const rejectionNote = (p: ProjectItem) => p.approvals.find((a) => a.decision === 'DITOLAK')?.note ?? null

/**
 * Status tampilan satu proyek. Proyek berjalan memakai satu sumber
 * (lib/project-status); pengajuan & arsip memakai status siklus hidupnya.
 */
function projectState(p: ProjectItem): { status: Status; label?: string; reason: string | null; progress: number } {
  if (p.lifecycle === 'DIUSULKAN') return { status: 'info', label: `Menunggu ${approverLabel(p.pendingRole)}`, reason: null, progress: 0 }
  if (p.lifecycle === 'DITOLAK') return { status: 'late', label: 'Ditolak', reason: rejectionNote(p), progress: 0 }
  const r = p.latestReport
  const d = deriveProjectStatus(
    { lifecycle: p.lifecycle, targetEndDate: p.targetEndDate ? new Date(p.targetEndDate) : null },
    r ? { status: r.status, progressPct: r.progressPct, obstacle: null, needsEscalation: false, reportDate: new Date(r.reportDate) } : null
  )
  if (p.lifecycle === 'DIARSIPKAN') return { status: 'neutral', label: 'Diarsipkan', reason: null, progress: d.progress }
  if (p.lifecycle === 'DITUTUP') return { status: 'done', label: 'Ditutup', reason: null, progress: d.progress }
  return { status: d.status, reason: d.reason, progress: d.progress }
}

function answerFor(lifecycle: string, total: number, filtered: boolean): string {
  const n = formatNumber(total)
  if (total === 0) {
    if (filtered) return 'Tidak ada proyek yang cocok dengan saringan ini.'
    switch (lifecycle) {
      case 'DIUSULKAN':
        return 'Tidak ada pengajuan yang menunggu persetujuan.'
      case 'DITOLAK':
        return 'Tidak ada pengajuan yang ditolak.'
      case 'DITUTUP':
        return 'Belum ada proyek yang ditutup.'
      case 'DIARSIPKAN':
        return 'Belum ada proyek yang diarsipkan.'
      case 'AKTIF':
        return 'Belum ada proyek aktif.'
      default:
        return 'Belum ada proyek.'
    }
  }
  const suffix = filtered ? ' yang cocok dengan saringan' : ''
  switch (lifecycle) {
    case 'DIUSULKAN':
      return `${n} pengajuan menunggu persetujuan${suffix}.`
    case 'DITOLAK':
      return `${n} pengajuan ditolak${suffix}.`
    case 'DITUTUP':
      return `${n} proyek ditutup${suffix}.`
    case 'DIARSIPKAN':
      return `${n} proyek diarsipkan${suffix}.`
    case 'AKTIF':
      return `${n} proyek aktif${suffix}.`
    default:
      return `${n} proyek di semua status${suffix}.`
  }
}

function supportFor(items: ProjectItem[]): string | undefined {
  if (!items.length) return undefined
  const waiting = items.filter((p) => p.lifecycle === 'DIUSULKAN' && p.permissions.approve).length
  const resubmit = items.filter((p) => p.permissions.resubmit).length
  const running = items.filter((p) => p.lifecycle === 'AKTIF')
  const states = running.map(projectState)
  const late = states.filter((s) => s.status === 'late').length
  const risk = states.filter((s) => s.status === 'risk').length
  const silent = running.filter((p) => !p.latestReport).length
  const parts: string[] = []
  if (waiting) parts.push(`${waiting} pengajuan menunggu keputusan Anda`)
  if (resubmit) parts.push(`${resubmit} pengajuan bisa Anda ajukan ulang`)
  if (late) parts.push(`${late} terlambat`)
  if (risk) parts.push(`${risk} perlu perhatian`)
  if (silent) parts.push(`${silent} belum punya laporan harian`)
  if (parts.length) return `Di halaman ini: ${parts.join(', ')}.`
  if (running.length) return 'Semua proyek aktif di halaman ini sesuai jadwal.'
  return undefined
}

/**
 * Modul Proyek (11 Sep 2026): siapa pun di rantai boleh mengajukan proyek —
 * rantai penyetujunya mengikuti peran pengaju — dengan PT-PT terkait; Super
 * Admin dan Admin PT mengubah, mengarsipkan, atau menghapus proyek.
 */
export function ProjectsView() {
  const { user } = useApp()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState<string>('ALL')
  const [lifecycle, setLifecycle] = useState<string>('AKTIF')
  const [layout, setLayout] = useState<'daftar' | 'linimasa'>('daftar')

  // Formulir & detail tetap terpasang selama animasi menutup; `n` memulai ulang isinya.
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; project?: ProjectItem; n: number } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<{ id: string; snapshot: ProjectItem; decide: Decision | null; n: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)

  const params = new URLSearchParams({ page: String(page), pageSize: '12', lifecycle })
  if (search) params.set('search', search)
  if (phase !== 'ALL') params.set('phase', phase)

  const { data, loading, error, reload } = useResource<ProjectListData>(`/api/projects?${params.toString()}`)
  const mayPropose = can(user.role, 'project:propose')
  const filtered = search.trim() !== '' || phase !== 'ALL'
  const items = useMemo(() => data?.items ?? [], [data])

  // Warna seri per PT, urut kemunculan, supaya titik di baris konsisten.
  const entityTone = useMemo(() => {
    const ids = Array.from(new Set(items.map((p) => p.entity.id)))
    return (id: string) => seriesTone(Math.max(0, ids.indexOf(id)))
  }, [items])

  const queue = items.filter((p) => p.lifecycle === 'DIUSULKAN' && p.permissions.approve)
  const rest = items.filter((p) => !queue.includes(p))
  const timed = rest.filter((p) => p.targetEndDate && (p.lifecycle === 'AKTIF' || p.lifecycle === 'DITUTUP'))
  const showLayout = timed.length > 0
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  function openForm(mode: 'create' | 'edit', project?: ProjectItem) {
    setForm((f) => ({ mode, project, n: (f?.n ?? 0) + 1 }))
    setFormOpen(true)
  }
  function openDetail(p: ProjectItem, decide: Decision | null = null) {
    setDetail((d) => ({ id: p.id, snapshot: p, decide, n: (d?.n ?? 0) + 1 }))
    setDetailOpen(true)
  }
  function resetFilters() {
    setSearch('')
    setPhase('ALL')
    setPage(1)
  }

  async function quickApprove(p: ProjectItem) {
    setApproving(p.id)
    const res = await call('/api/projects/approve', 'POST', { projectId: p.id, decision: 'DISETUJUI', note: '' })
    setApproving(null)
    if (!res.ok) {
      toast.error(res.error ?? 'Persetujuan belum tersimpan.')
      return
    }
    toastWithUndo(`${p.name} disetujui sebagai ${approverLabel(p.pendingRole)}.`, res.json.undoToken, reload) // [F2-URUNGKAN]
    reload()
  }

  const detailProject = detail ? (items.find((p) => p.id === detail.id) ?? detail.snapshot) : null

  return (
    <>
      <PageHeader
        context="Holding · anak perusahaan · proyek · laporan"
        title="Proyek"
        tools={
          <>
            {mayPropose && (
              <Button variant="primary" size="sm" icon="tambah" onClick={() => openForm('create')}>
                Ajukan proyek
              </Button>
            )}
            <span className="mk-desktop-only">
              <NotificationButton />
            </span>
          </>
        }
      />

      {loading && !data ? (
        <div className="mk-hero" aria-busy="true" aria-label="Memuat ringkasan proyek">
          <div className="mk-hero__text">
            <Skeleton h={26} w={160} r={999} />
            <Skeleton h={36} w="70%" r={12} />
            <Skeleton h={20} w="55%" />
          </div>
        </div>
      ) : data ? (
        <Hero
          eyebrow={[LIFECYCLES.find((l) => l.value === lifecycle)?.label, phase !== 'ALL' ? PROJECT_PHASE_LABELS[phase] : null].filter(Boolean).join(' · ')}
          answer={answerFor(lifecycle, data.total, filtered)}
          support={supportFor(items)}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="mk-chips" role="group" aria-label="Status proyek">
          {LIFECYCLES.map((l) => (
            <Chip
              key={l.value}
              selected={lifecycle === l.value}
              onClick={() => {
                setLifecycle(l.value)
                setPage(1)
              }}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <div className="mk-toolbar">
          <label className="mk-sortsel">
            <span className="mk-sr">Tahap proyek</span>
            <select
              className={selectCls}
              value={phase}
              onChange={(e) => {
                setPhase(e.target.value)
                setPage(1)
              }}
            >
              <option value="ALL">Semua tahap</option>
              {Object.entries(PROJECT_PHASE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <SearchField
            id="pj-q"
            label="Cari proyek"
            placeholder="Cari nama proyek"
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            className="mk-toolbar__search"
          />
        </div>
      </div>

      {loading && !data ? (
        <Card ariaLabel="Memuat daftar proyek">
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={56} r={12} />
            ))}
          </div>
        </Card>
      ) : error ? (
        <Card>
          <ErrorNote message={`Daftar proyek belum termuat. ${error}`} onRetry={reload} />
        </Card>
      ) : !items.length ? (
        <Card>
          <EmptyNote
            icon="proyek"
            action={
              filtered ? (
                <Button size="sm" onClick={resetFilters}>
                  Hapus saringan
                </Button>
              ) : mayPropose && lifecycle === 'AKTIF' ? (
                <Button size="sm" icon="tambah" onClick={() => openForm('create')}>
                  Ajukan proyek
                </Button>
              ) : undefined
            }
          >
            {filtered
              ? 'Tidak ada proyek yang cocok dengan saringan ini.'
              : lifecycle === 'DIUSULKAN'
                ? 'Belum ada pengajuan yang menunggu.'
                : 'Belum ada proyek dengan status ini.'}
          </EmptyNote>
        </Card>
      ) : (
        <>
          {queue.length > 0 && (
            <Card title="Menunggu keputusan Anda" subtitle="Setujui di tempat, atau buka detail untuk membaca penjelasan dan menolak dengan alasan.">
              <div className="mk-list">
                {queue.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <ApprovalItem
                      approveVariant="secondary"
                      className="flex-1 min-w-0"
                      title={p.name}
                      requester={p.proposedBy?.name ?? 'Pengaju'}
                      initials={initials(p.proposedBy?.name ?? p.name)}
                      tone={entityTone(p.entity.id)}
                      time={p.proposedAt ? formatRelative(p.proposedAt) : '-'}
                      amount={p.entity.name}
                      approveLabel="Setujui"
                      rejectLabel="Tolak"
                      busy={approving === p.id}
                      onApprove={() => quickApprove(p)}
                      onReject={() => openDetail(p, 'DITOLAK')}
                    />
                    <IconButton icon="info" label={`Lihat detail ${p.name}`} onClick={() => openDetail(p)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {rest.length > 0 && (
            <Card
              title={queue.length ? 'Proyek lainnya' : 'Daftar proyek'}
              subtitle={`Menampilkan ${items.length} dari ${formatNumber(data?.total ?? items.length)} proyek. Ketuk baris untuk membuka detail.`}
              action={
                showLayout ? (
                  <SegmentedControl
                    size="sm"
                    label="Tampilan daftar"
                    value={layout}
                    onChange={(v) => setLayout(v as 'daftar' | 'linimasa')}
                    options={[
                      { value: 'daftar', label: 'Daftar' },
                      { value: 'linimasa', label: 'Linimasa' },
                    ]}
                  />
                ) : undefined
              }
            >
              <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
                {layout === 'linimasa' && showLayout ? (
                  <ProjectTimeline projects={timed} onOpen={openDetail} />
                ) : (
                  <div className="mk-prows mk-list">
                    {rest.map((p) => {
                      const st = projectState(p)
                      return (
                        <ProjectRow
                          key={p.id}
                          name={p.name}
                          division={p.entity.name}
                          divisionTone={entityTone(p.entity.id)}
                          pic={p.picName ?? 'PIC belum ditentukan'}
                          initials={p.picName ? initials(p.picName) : '-'}
                          progress={st.progress}
                          due={p.targetEndDate ? formatDateShort(p.targetEndDate) : 'Tanpa tenggat'}
                          status={st.status}
                          statusLabel={st.label}
                          selected={detailOpen && detail?.id === p.id}
                          onClick={() => openDetail(p)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}

          {data && data.total > data.pageSize && (
            <nav className="flex items-center justify-between gap-2" aria-label="Halaman daftar proyek">
              <Button icon="kiri" disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))}>
                Sebelumnya
              </Button>
              <span className="t-footnote text-ink-2 tabular-nums">
                Halaman {page} dari {pages}
              </span>
              <Button iconAfter="kanan" disabled={page * data.pageSize >= data.total} onClick={() => setPage((x) => x + 1)}>
                Berikutnya
              </Button>
            </nav>
          )}
        </>
      )}

      {detail && (
        <ProjectDetailSheet
          key={`detail-${detail.n}`}
          open={detailOpen}
          project={detailProject!}
          initialDecision={detail.decide}
          onClose={() => setDetailOpen(false)}
          onChanged={reload}
          onEdit={(p) => {
            setDetailOpen(false)
            openForm('edit', p)
          }}
        />
      )}

      {form && (
        <ProjectFormSheet
          key={`form-${form.n}`}
          open={formOpen}
          mode={form.mode}
          project={form.mode === 'edit' ? form.project : undefined}
          onClose={() => setFormOpen(false)}
          onDone={(created) => {
            setFormOpen(false)
            if (created) {
              setLifecycle(created.lifecycle)
              setPage(1)
            }
            reload()
          }}
        />
      )}
    </>
  )
}

/** Linimasa proyek di halaman ini: mulai sampai tenggat, progres, status. */
function ProjectTimeline({ projects, onOpen }: { projects: ProjectItem[]; onOpen: (p: ProjectItem) => void }) {
  const tl = timelineFrame(projects)
  const rows = projects.map((p) => {
    const st = projectState(p)
    return {
      id: p.id,
      label: p.name,
      sub: `${p.picName ?? 'PIC belum ditentukan'} · ${p.entity.code}`,
      start: Math.max(0, tl.at(p.startDate, 0)),
      end: Math.max(1, tl.at(p.targetEndDate, tl.span)),
      progress: st.progress,
      status: st.status,
      range: `${p.startDate ? formatDateShort(p.startDate) : '…'}–${formatDateShort(p.targetEndDate)}`,
    }
  })
  return (
    <div className="mk-scroll-x pt-6">
      <Timeline
        rows={rows}
        span={tl.span}
        ticks={tl.ticks}
        today={tl.today}
        title="Proyek"
        selectedId={null}
        onSelect={(id) => {
          const p = projects.find((x) => x.id === id)
          if (p) onOpen(p)
        }}
      />
    </div>
  )
}

/** Rantai persetujuan sebagai alur: siapa sudah, siapa giliran, siapa menolak. */
function approvalSteps(p: ProjectItem): FlowStep[] {
  return p.approvals.map((a) => {
    const ok = a.decision === 'DISETUJUI'
    const no = a.decision === 'DITOLAK'
    const turn = a.role === p.pendingRole
    const who = a.decidedByName ? `${a.decidedByName}${a.decidedAt ? ` · ${formatDateTime(a.decidedAt)}` : ''}` : undefined
    return {
      title: approverLabel(a.role),
      sub: who,
      status: ok ? 'done' : no ? 'blocked' : turn ? 'current' : 'todo',
      meta: ok
        ? a.note
          ? `Disetujui · ${a.note}`
          : 'Disetujui'
        : no
          ? a.note
            ? `Ditolak · ${a.note}`
            : 'Ditolak'
          : turn
            ? 'Giliran sekarang'
            : 'Menunggu',
    }
  })
}

/** Detail proyek di Sheet: progres, identitas, persetujuan, dan semua tindakan. */
function ProjectDetailSheet({
  open,
  project: p,
  initialDecision,
  onClose,
  onChanged,
  onEdit,
}: {
  open: boolean
  project: ProjectItem
  initialDecision: Decision | null
  onClose: () => void
  onChanged: () => void
  onEdit: (p: ProjectItem) => void
}) {
  const [confirmEl, confirm] = useConfirm()
  const [deciding, setDeciding] = useState<Decision | null>(p.permissions.approve ? initialDecision : null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const st = projectState(p)
  const perm = p.permissions
  const proposed = p.lifecycle === 'DIUSULKAN'
  const rejected = p.lifecycle === 'DITOLAK'
  const r = p.latestReport
  const rejectNote = rejectionNote(p)

  async function decide(decision: Decision) {
    setBusy('decide')
    setErr(null)
    const res = await call('/api/projects/approve', 'POST', { projectId: p.id, decision, note })
    setBusy(null)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    toastWithUndo(decision === 'DISETUJUI' ? `${p.name} disetujui.` : `${p.name} ditolak.`, res.json.undoToken, onChanged) // [F2-URUNGKAN]
    onChanged()
    onClose()
  }

  // [F2-URUNGKAN] Ajukan ulang bisa diurungkan, jadi tanpa dialog konfirmasi.
  async function resubmit() {
    setBusy('resubmit')
    setErr(null)
    const res = await call('/api/projects', 'PATCH', { id: p.id, resubmit: true })
    setBusy(null)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    toastWithUndo(`${p.name} diajukan ulang.`, res.json.undoToken, onChanged, {
      description: 'Slot persetujuan dikosongkan dan rantai dimulai dari awal.',
    })
    onChanged()
    onClose()
  }

  async function remove() {
    const ok = await confirm({
      title: `Hapus ${p.name}?`,
      description: `Proyek ${p.code} akan dihapus. Proyek yang sudah punya data tidak bisa dihapus, hanya diarsipkan. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus proyek',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    setErr(null)
    const res = await call(`/api/projects?id=${p.id}`, 'DELETE')
    if (res.ok) {
      setBusy(null)
      toast.success(`${p.name} dihapus.`)
      onChanged()
      onClose()
      return
    }
    // Proyek yang sudah punya data tidak dihapus; tawarkan pengarsipan.
    if (res.status === 409 && res.json.canArchive === true) {
      const archive = await confirm({
        title: 'Arsipkan proyek ini?',
        description: res.error,
        confirmLabel: 'Arsipkan proyek',
      })
      if (archive) {
        const arch = await call('/api/projects', 'PATCH', { id: p.id, lifecycle: 'DIARSIPKAN' })
        setBusy(null)
        if (!arch.ok) setErr(arch.error)
        else {
          toastWithUndo(`${p.name} diarsipkan.`, arch.json.undoToken, onChanged) // [F2-URUNGKAN]
          onChanged()
          onClose()
        }
        return
      }
    }
    setBusy(null)
    setErr(res.error)
  }

  const working = busy !== null
  let footer: ReactNode = null
  if (perm.approve && deciding) {
    footer = (
      <>
        <Button onClick={() => setDeciding(null)} disabled={working}>
          Batal
        </Button>
        <Button
          variant={deciding === 'DITOLAK' ? 'destructive' : 'primary'}
          onClick={() => decide(deciding)}
          disabled={working || (deciding === 'DITOLAK' && note.trim().length < 5)}
        >
          {busy === 'decide' ? 'Menyimpan…' : deciding === 'DITOLAK' ? 'Tolak pengajuan' : 'Setujui pengajuan'}
        </Button>
      </>
    )
  } else {
    const hasPrimary = perm.approve || perm.resubmit
    footer =
      perm.approve || perm.resubmit || perm.manage ? (
        <>
          {perm.manage && (
            <Button variant={hasPrimary ? 'secondary' : 'primary'} onClick={() => onEdit(p)} disabled={working}>
              Ubah proyek
            </Button>
          )}
          {perm.resubmit && (
            <Button variant="primary" icon="kirim" onClick={resubmit} disabled={working}>
              {busy === 'resubmit' ? 'Mengirim…' : 'Ajukan ulang'}
            </Button>
          )}
          {perm.approve && (
            <>
              <Button onClick={() => setDeciding('DITOLAK')} disabled={working}>
                Tolak
              </Button>
              <Button variant="primary" onClick={() => setDeciding('DISETUJUI')} disabled={working}>
                Setujui
              </Button>
            </>
          )}
        </>
      ) : null
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={p.name}
      subtitle={`${p.code} · ${p.entity.name}`}
      eyebrow={<StatusBadge status={st.status} size="sm">{st.label}</StatusBadge>}
      backLabel="Proyek"
      footer={footer}
    >
      {!proposed && !rejected && (
        <div className="flex items-center gap-5">
          <ProgressRing value={st.progress} size={104} status={st.status === 'neutral' || st.status === 'info' ? 'accent' : st.status} sublabel="selesai" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="t-headline">{st.progress}% selesai</span>
            <span className="t-footnote text-ink-2">
              {p.targetEndDate ? `Tenggat ${formatDate(p.targetEndDate)}` : 'Tenggat belum ditetapkan'}
            </span>
            <span className="t-footnote text-ink-2">
              {r ? `Laporan terakhir ${formatDate(r.reportDate)}` : 'Belum ada laporan harian'}
            </span>
            {r?.isLate && (
              <span>
                <StatusBadge status="late" size="sm">
                  Laporan terlambat
                </StatusBadge>
              </span>
            )}
          </div>
        </div>
      )}

      {st.reason && !rejected && (
        <div className={`mk-note-box ${st.status === 'late' ? 'mk-soft--late' : 'mk-soft--risk'}`}>{st.reason}</div>
      )}

      <section className="flex flex-col gap-2">
        <InfoLine icon="gedung">{p.entity.name}{p.entity.region ? ` · ${p.entity.region}` : ''}</InfoLine>
        <InfoLine icon="pengguna">{p.picName ? `PIC ${p.picName}` : 'PIC belum ditentukan'}</InfoLine>
        {(p.startDate || p.targetEndDate) && (
          <InfoLine icon="kalender">
            {p.startDate ? formatDate(p.startDate) : '-'} sampai {p.targetEndDate ? formatDate(p.targetEndDate) : 'target belum ada'}
          </InfoLine>
        )}
        {p.relatedEntities.length > 0 && (
          <InfoLine icon="alur">Terkait {p.relatedEntities.map((e) => e.name).join(', ')}</InfoLine>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="mk-tag">{PROJECT_PHASE_LABELS[p.phase] ?? p.phase}</span>
          <span className="mk-tag">{PROJECT_LIFECYCLE_LABELS[p.lifecycle] ?? p.lifecycle}</span>
          {p.noApproval && (
            <span className="mk-tag" title="Didaftarkan di tahap awal tanpa melewati rantai persetujuan">
              Tanpa persetujuan
            </span>
          )}
        </div>
      </section>

      {(p.description || p.purpose) && (
        <section className="flex flex-col gap-3">
          {p.description && (
            <div>
              <h3 className="t-headline mb-1">Penjelasan</h3>
              <p className="t-body text-ink">{p.description}</p>
            </div>
          )}
          {p.purpose && (
            <div>
              <h3 className="t-headline mb-1">Tujuan</h3>
              <p className="t-body text-ink-2">{p.purpose}</p>
            </div>
          )}
        </section>
      )}

      {(proposed || rejected || p.noApproval) && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon="persetujuan">Persetujuan</SectionTitle>
          <p className="t-footnote text-ink-2">
            Diajukan {p.proposedBy?.name ?? '-'}
            {p.proposedAt ? ` · ${formatDateTime(p.proposedAt)}` : ''}
          </p>
          {p.noApproval ? (
            <p className="mk-note-box mk-soft--info">
              Tahap awal tanpa persetujuan. Didaftarkan {p.proposedBy?.name ?? 'pengaju'} dan langsung aktif. Persetujuan menyusul saat proyek naik tahap.
            </p>
          ) : p.approvalChain.length === 0 ? (
            <p className="mk-note-box mk-soft--done">
              Langsung aktif. Diajukan {p.proposedBy?.name ?? 'pengaju di puncak rantai'} tanpa perlu persetujuan.
            </p>
          ) : (
            <FlowDiagram orientation="vertical" steps={approvalSteps(p)} label="Rantai persetujuan" />
          )}
          {rejected && rejectNote && (
            <p className="mk-note-box mk-soft--late">
              <strong>Alasan penolakan:</strong> {rejectNote}
            </p>
          )}
        </section>
      )}

      {perm.approve && deciding && (
        <Field
          label={deciding === 'DITOLAK' ? 'Alasan penolakan' : 'Catatan untuk pengaju'}
          htmlFor="pd-note"
          required={deciding === 'DITOLAK'}
          hint={deciding === 'DITOLAK' ? 'Minimal 5 karakter agar pengaju tahu yang perlu diperbaiki.' : 'Opsional.'}
        >
          <textarea
            id="pd-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={deciding === 'DITOLAK' ? 'Tulis alasan penolakan' : 'Tulis catatan bila perlu'}
            className={areaCls}
          />
        </Field>
      )}

      {err && (
        <p className="mk-note-box mk-soft--late" role="alert">
          {err}
        </p>
      )}

      {perm.manage && !deciding && (
        <div className="mk-danger">
          <div className="min-w-0">
            <div className="t-body-strong">Hapus proyek</div>
            <p className="t-footnote text-ink-2">Proyek yang sudah punya laporan hanya bisa diarsipkan.</p>
          </div>
          <Button variant="destructive" size="sm" onClick={remove} disabled={working}>
            {busy === 'delete' ? 'Menghapus…' : 'Hapus proyek'}
          </Button>
        </div>
      )}
      {confirmEl}
    </Sheet>
  )
}

/** Pengajuan / perubahan proyek di Sheet lebar — layar didorong di ponsel. */
function ProjectFormSheet({
  open,
  mode,
  project,
  onClose,
  onDone,
}: {
  open: boolean
  mode: 'create' | 'edit'
  project?: ProjectItem
  onClose: () => void
  onDone: (created: { lifecycle: string } | null) => void
}) {
  const { user: me } = useApp()
  const editing = mode === 'edit' && project
  const [entityId, setEntityId] = useState(project?.entity.id ?? '')
  const optionsUrl = `/api/projects?options=1${entityId ? `&entityId=${entityId}` : ''}`
  const { data: opt, loading: optLoading, error: optError } = useResource<Options>(optionsUrl)

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [purpose, setPurpose] = useState(project?.purpose ?? '')
  const [phase, setPhase] = useState(project?.phase ?? '')
  const [picUserId, setPicUserId] = useState(project?.picUserId ?? '')
  const [divisionId, setDivisionId] = useState(project?.divisionId ?? '') // [F2-ADMIN]
  const [startDate, setStartDate] = useState(toDateInput(project?.startDate ?? null))
  const [targetEndDate, setTargetEndDate] = useState(toDateInput(project?.targetEndDate ?? null))
  const [related, setRelated] = useState<string[]>(project?.relatedEntities.map((e) => e.id) ?? [])
  const [lifecycle, setLifecycle] = useState(project?.lifecycle ?? '')
  // Proyek tahap awal boleh didaftarkan tanpa menunggu rantai persetujuan.
  const [skipApproval, setSkipApproval] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Peran global memilih PT dulu; kandidat PIC mengikuti PT itu.
  const ownerId = opt?.entity?.id ?? entityId
  const relatedChoices = useMemo(() => (opt?.entities ?? []).filter((e) => e.id !== ownerId), [opt, ownerId])
  const chain = opt?.chain ?? []
  const chainText = chain.map((r) => PROJECT_APPROVER_LABELS[r] ?? r).join(' → ')
  const earlyPhase = phase === '' || phase === 'INISIASI'
  const canSkip = !editing && chain.length > 0 && earlyPhase
  const skipping = canSkip && skipApproval

  async function submit() {
    setBusy(true)
    setErrors([])
    const payload: Record<string, unknown> = {
      name,
      description,
      purpose,
      phase,
      picUserId,
      // [F2-ADMIN] kirim hanya bila berubah (divisi lama yang nonaktif tidak ditolak ulang)
      ...(editing && divisionId === (project!.divisionId ?? '') ? {} : { divisionId }),
      startDate,
      targetEndDate,
      relatedEntityIds: related,
    }
    const res = editing
      ? await call('/api/projects', 'PATCH', { id: project!.id, ...payload, ...(lifecycle && lifecycle !== project!.lifecycle ? { lifecycle } : {}) })
      : await call('/api/projects', 'POST', { ...payload, entityId: ownerId || undefined, skipApproval: skipping })
    setBusy(false)
    if (!res.ok) {
      const list = res.json.errors
      setErrors(Array.isArray(list) && list.length ? (list as string[]) : [res.error ?? 'Proyek belum tersimpan. Coba lagi.'])
      return
    }
    const created = res.json.project as { lifecycle: string } | undefined
    const doneMsg = editing ? 'Perubahan proyek tersimpan.' : chain.length > 0 && !skipping ? 'Pengajuan proyek terkirim.' : 'Proyek dibuat dan langsung aktif.'
    // [F2-URUNGKAN] mengarsipkan lewat formulir juga bisa diurungkan (hanya siklus hidupnya).
    if (res.json.undoToken) toastWithUndo('Proyek diarsipkan.', res.json.undoToken, () => onDone(null))
    else toast.success(doneMsg)
    onDone(editing ? null : (created ?? null))
  }

  const needsEntity = !editing && !opt?.entityPinned && !ownerId
  const valid = name.trim().length >= 5 && description.trim().length >= 20 && !needsEntity

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="wide"
      backLabel="Proyek"
      title={editing ? 'Ubah proyek' : 'Ajukan proyek'}
      subtitle={
        editing
          ? `${project!.code} · ${project!.entity.name}`
          : skipping
            ? 'Tahap awal tanpa persetujuan. Proyek langsung aktif.'
            : chain.length > 0
              ? `Perlu persetujuan berurutan: ${chainText}.`
              : 'Peran Anda tidak memerlukan persetujuan. Proyek langsung aktif.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon={editing ? 'selesai' : 'kirim'} onClick={submit} disabled={busy || !valid}>
            {busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : chain.length > 0 && !skipping ? 'Ajukan proyek' : 'Buat proyek'}
          </Button>
        </>
      }
    >
      {optError && <ErrorNote message={`Pilihan PT dan PIC belum termuat. ${optError}`} />}

      <section className="mk-formsec">
        <div className="mk-formgrid">
          {!editing && opt && !opt.entityPinned && (
            <Field label="PT pemilik proyek" htmlFor="pp-entity" required className="is-full">
              <select
                id="pp-entity"
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value)
                  setPicUserId('')
                  setDivisionId('')
                  setRelated((r) => r.filter((x) => x !== e.target.value))
                }}
                className={selectCls}
              >
                <option value="">Pilih PT</option>
                {opt.entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.code}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Nama proyek" htmlFor="pp-name" required className="is-full" hint="Minimal 5 karakter.">
            <input
              id="pp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Pembangunan Gudang Distribusi Timur"
              className={inputCls}
            />
          </Field>
          <Field label="Penjelasan" htmlFor="pp-desc" required className="is-full" hint="Minimal 20 karakter agar penyetuju paham.">
            <textarea
              id="pp-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Apa yang dibangun atau dikerjakan, lingkupnya, dan perkiraan kebutuhan."
              className={areaCls}
            />
          </Field>
          <Field label="Tujuan atau manfaat" htmlFor="pp-purpose" className="is-full">
            <textarea
              id="pp-purpose"
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Manfaat bagi PT, target yang ingin dicapai."
              className={areaCls}
            />
          </Field>

          <Field label="Tahap awal" htmlFor="pp-phase" hint="Opsional.">
            <select
              id="pp-phase"
              value={phase}
              onChange={(e) => {
                setPhase(e.target.value)
                // Jalur tanpa persetujuan hanya untuk tahap awal.
                if (e.target.value !== '' && e.target.value !== 'INISIASI') setSkipApproval(false)
              }}
              className={selectCls}
            >
              <option value="">Belum ditentukan (dianggap Inisiasi)</option>
              {Object.entries(PROJECT_PHASE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="PIC atau manager proyek"
            htmlFor="pp-pic"
            hint={opt && ownerId && opt.candidates.length === 0 ? 'Belum ada akun manager proyek di PT ini.' : 'Opsional. Bisa ditentukan nanti.'}
          >
            <select id="pp-pic" value={picUserId} onChange={(e) => setPicUserId(e.target.value)} disabled={optLoading} className={selectCls}>
              <option value="">Kosongkan, tentukan nanti</option>
              {(opt?.candidates ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === me.id ? ' (Anda)' : ''}
                  {c.activeProjects > 0 ? ` · memegang ${c.activeProjects} proyek` : ' · belum memegang proyek'}
                </option>
              ))}
              {editing && project!.picUserId && !(opt?.candidates ?? []).some((c) => c.id === project!.picUserId) && (
                <option value={project!.picUserId}>{project!.picName}</option>
              )}
            </select>
          </Field>
          <Field
            label="Divisi pelaksana"
            htmlFor="pp-division"
            hint={opt && ownerId && (opt.divisions ?? []).length === 0 ? 'Belum ada divisi aktif di PT ini.' : 'Opsional. Kosong = mengikuti divisi PIC.'}
          >
            <select id="pp-division" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} disabled={optLoading} className={selectCls}>
              <option value="">Ikuti divisi PIC</option>
              {(opt?.divisions ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              {editing && project!.divisionId && project!.division && !(opt?.divisions ?? []).some((d) => d.id === project!.divisionId) && (
                <option value={project!.divisionId}>{project!.division.name}</option>
              )}
            </select>
          </Field>
          <Field label="Rencana mulai" htmlFor="pp-start">
            <input id="pp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Target selesai" htmlFor="pp-end">
            <input id="pp-end" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="alur">PT yang berkaitan</SectionTitle>
        {optLoading && !opt ? (
          <div className="flex gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={36} w={120} r={999} />
            ))}
          </div>
        ) : relatedChoices.length === 0 ? (
          <p className="t-footnote text-ink-2">{ownerId ? 'Tidak ada PT lain.' : 'Pilih PT pemilik dulu.'}</p>
        ) : (
          <div className="mk-filterrow" role="group" aria-label="PT yang berkaitan">
            {relatedChoices.map((e) => {
              const on = related.includes(e.id)
              return (
                <Chip key={e.id} selected={on} onClick={() => setRelated((r) => (on ? r.filter((x) => x !== e.id) : [...r, e.id]))}>
                  {e.name}
                </Chip>
              )
            })}
          </div>
        )}
        <p className="t-footnote text-ink-2">
          {related.length > 0
            ? `Proyek ini akan tampil juga di daftar proyek ${related.length} PT terkait.`
            : 'Boleh lebih dari satu. Proyek ikut tampil di daftar PT yang dipilih.'}
        </p>
      </section>

      {editing && project!.permissions.setLifecycle && (
        <Field label="Status proyek" htmlFor="pp-life">
          <select id="pp-life" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} className={selectCls}>
            {project!.lifecycle === 'DIUSULKAN' && <option value="DIUSULKAN">Diusulkan (menunggu persetujuan)</option>}
            {project!.lifecycle === 'DITOLAK' && <option value="DITOLAK">Ditolak</option>}
            <option value="AKTIF">Aktif</option>
            <option value="DITUTUP">Ditutup</option>
            <option value="DIARSIPKAN">Diarsipkan</option>
          </select>
        </Field>
      )}

      {!editing && chain.length > 0 && (
        <SwitchRow
          id="pp-skip"
          title="Daftarkan tanpa persetujuan (tahap awal)"
          description={
            earlyPhase
              ? `Proyek langsung aktif tanpa menunggu ${chainText}. Tercatat di detail proyek dan jejak audit.`
              : 'Hanya untuk tahap awal (Inisiasi). Ubah tahapnya bila ingin memakai jalur ini.'
          }
          checked={skipping}
          onChange={setSkipApproval}
          disabled={!canSkip}
        />
      )}

      {errors.length > 0 && (
        <div className="mk-note-box mk-soft--late flex flex-col gap-1" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
    </Sheet>
  )
}
