'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState, ErrorState } from '@/components/loading-states'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DailyStatusBadge } from '@/components/status-badges'
import { PROJECT_PHASE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_APPROVER_LABELS } from '@/lib/constants'
import { can } from '@/lib/rbac'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, ArrowRight, Building2, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, FolderKanban,
  Filter, Link2, Loader2, Pencil, Plus, RotateCcw, Search, ShieldOff, Target, ThumbsDown, ThumbsUp, Trash2, User, X, XCircle,
} from 'lucide-react'

type Approval = { role: string; decision: 'DISETUJUI' | 'DITOLAK' | null; note: string | null; decidedAt: string | null; decidedByName: string | null }

type ProjectItem = {
  id: string
  code: string
  name: string
  phase: string
  lifecycle: string
  picName: string | null
  picUserId: string | null
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
  chain: string[]
  picIsSelf: boolean
}

const LIFECYCLES = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'DIUSULKAN', label: 'Diusulkan' },
  { value: 'DITOLAK', label: 'Ditolak' },
  { value: 'DITUTUP', label: 'Ditutup' },
  { value: 'DIARSIPKAN', label: 'Diarsipkan' },
  { value: 'ALL', label: 'Semua status' },
]

const field = 'bg-white/70 dark:bg-slate-900/50 h-11 text-base'
const selectClass =
  'h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base text-slate-800 dark:text-slate-100 disabled:opacity-70'

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
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; project: ProjectItem } | null>(null)

  const params = new URLSearchParams({ page: String(page), pageSize: '12', lifecycle })
  if (search) params.set('search', search)
  if (phase !== 'ALL') params.set('phase', phase)

  const { data, loading, error, reload } = useResource<ProjectListData>(`/api/projects?${params.toString()}`)
  const mayPropose = can(user.role, 'project:propose')

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Modul Proyek</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            Holding → anak perusahaan → proyek → laporan harian, mingguan, bulanan
          </p>
        </div>
        {mayPropose && (
          <Button onClick={() => setForm({ mode: 'create' })} className="icon-rotate-hover h-11 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue">
            <Plus className="h-5 w-5" /> Ajukan Proyek
          </Button>
        )}
      </div>

      <Card className="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <Input placeholder="Cari nama proyek…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="glass pl-9 h-10 text-sm border-slate-200/60" />
            </div>
            <Select value={lifecycle} onValueChange={(v) => { setLifecycle(v); setPage(1) }}>
              <SelectTrigger className="glass h-10 text-sm w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {LIFECYCLES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={phase} onValueChange={(v) => { setPhase(v); setPage(1) }}>
              <SelectTrigger className="glass h-10 text-sm w-full sm:w-44">
                <Filter className="h-3 w-3 mr-1 text-slate-400 dark:text-slate-500" />
                <SelectValue placeholder="Tahap" />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                <SelectItem value="ALL">Semua tahap</SelectItem>
                {Object.entries(PROJECT_PHASE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data?.items?.length ? (
        <EmptyState icon={<FolderKanban className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada proyek" description={lifecycle === 'DIUSULKAN' ? 'Belum ada pengajuan yang menunggu.' : 'Coba ubah filter pencarian'} />
      ) : (
        <>
          <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger', loading && 'opacity-60 transition-opacity')}>
            {data.items.map((p) => (
              <ProjectCard key={p.id} project={p} onChanged={reload} onEdit={() => setForm({ mode: 'edit', project: p })} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm text-slate-500 dark:text-slate-400">Menampilkan {data.items.length} dari {data.total} proyek</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="glass h-8 text-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="text-sm text-slate-600 dark:text-slate-300 px-2">{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
              <Button variant="outline" size="sm" className="glass h-8 text-sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </>
      )}

      {form && (
        <ProjectFormDialog
          mode={form.mode}
          project={form.mode === 'edit' ? form.project : undefined}
          onClose={() => setForm(null)}
          onDone={(created) => {
            setForm(null)
            if (created) {
              setLifecycle(created.lifecycle)
              setPage(1)
            }
            reload()
          }}
        />
      )}
    </div>
  )
}

/** Slot tanda tangan sepanjang rantai: siapa sudah, siapa giliran, siapa menolak. */
function ApprovalTrail({
  approvals,
  pendingRole,
  chainless,
  noApproval,
  proposerName,
}: {
  approvals: Approval[]
  pendingRole: string | null
  chainless: boolean
  noApproval: boolean
  proposerName: string | null
}) {
  if (noApproval) {
    return (
      <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
        <ShieldOff className="h-3.5 w-3.5 shrink-0 mt-px text-amber-600" />
        Tahap awal tanpa persetujuan — didaftarkan {proposerName ?? 'pengaju'} dan langsung aktif. Persetujuan menyusul saat proyek naik tahap.
      </p>
    )
  }
  if (chainless) {
    return (
      <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Langsung aktif — diajukan {proposerName ?? 'pengaju di puncak rantai'} tanpa perlu persetujuan.
      </p>
    )
  }
  return (
    <div className="flex items-stretch gap-1.5">
      {approvals.map((a, i) => {
        const ok = a.decision === 'DISETUJUI'
        const no = a.decision === 'DITOLAK'
        const turn = a.role === pendingRole
        return (
          <div key={a.role} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div
              title={a.note ?? undefined}
              className={cn(
                'flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11px] leading-tight border',
                ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : no
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : turn
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-500/5 border-slate-200/70 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              )}
            >
              <div className="flex items-center gap-1 font-semibold">
                {ok ? <CheckCircle2 className="h-3 w-3" /> : no ? <XCircle className="h-3 w-3" /> : <Clock className={cn('h-3 w-3', turn && 'animate-pulse-soft')} />}
                <span className="truncate">{PROJECT_APPROVER_LABELS[a.role] ?? a.role}</span>
              </div>
              <div className="truncate opacity-80">{a.decidedByName ?? (turn ? 'giliran sekarang' : 'menunggu')}</div>
            </div>
            {i < approvals.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

function ProjectCard({ project, onChanged, onEdit }: { project: ProjectItem; onChanged: () => void; onEdit: () => void }) {
  const r = project.latestReport
  const proposed = project.lifecycle === 'DIUSULKAN'
  const rejected = project.lifecycle === 'DITOLAK'
  const dormant = project.lifecycle === 'DITUTUP' || project.lifecycle === 'DIARSIPKAN'
  const perm = project.permissions

  const [deciding, setDeciding] = useState<'DISETUJUI' | 'DITOLAK' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function decide(decision: 'DISETUJUI' | 'DITOLAK') {
    setBusy('decide')
    setErr(null)
    const res = await call('/api/projects/approve', 'POST', { projectId: project.id, decision, note })
    setBusy(null)
    if (!res.ok) setErr(res.error)
    else {
      setDeciding(null)
      setNote('')
      onChanged()
    }
  }

  async function resubmit() {
    if (!window.confirm('Ajukan ulang proyek ini? Slot persetujuan dikosongkan dan rantai dimulai dari awal.')) return
    setBusy('resubmit')
    setErr(null)
    const res = await call('/api/projects', 'PATCH', { id: project.id, resubmit: true })
    setBusy(null)
    if (!res.ok) setErr(res.error)
    else onChanged()
  }

  async function remove() {
    if (!window.confirm(`Hapus proyek "${project.name}" (${project.code})?`)) return
    setBusy('delete')
    setErr(null)
    const res = await call(`/api/projects?id=${project.id}`, 'DELETE')
    if (res.ok) {
      setBusy(null)
      onChanged()
      return
    }
    // Proyek yang sudah punya data tidak dihapus; tawarkan pengarsipan.
    if (res.status === 409 && res.json.canArchive === true && window.confirm(`${res.error}\n\nArsipkan proyek ini sekarang?`)) {
      const arch = await call('/api/projects', 'PATCH', { id: project.id, lifecycle: 'DIARSIPKAN' })
      setBusy(null)
      if (!arch.ok) setErr(arch.error)
      else onChanged()
      return
    }
    setBusy(null)
    setErr(res.error)
  }

  return (
    <Card className={cn('glass card-hover transition-all group flex flex-col', proposed && 'ring-1 ring-amber-500/40', (rejected || dormant) && 'opacity-80')}>
      <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 group-hover:text-blue-700 transition-colors">{project.name}</h3>
            <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono mt-1">{project.code}</Badge>
          </div>
          {r && !proposed && !rejected && <DailyStatusBadge status={r.status} size="xs" />}
          {proposed && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px]">Menunggu {PROJECT_APPROVER_LABELS[project.pendingRole ?? ''] ?? 'persetujuan'}</Badge>}
          {rejected && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px]">Ditolak</Badge>}
          {dormant && <Badge className="bg-slate-500/15 text-slate-600 dark:text-slate-300 text-[11px]">{PROJECT_LIFECYCLE_LABELS[project.lifecycle]}</Badge>}
        </div>

        <div className="space-y-1 text-[13px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{project.entity.name}</span></div>
          {project.relatedEntities.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Link2 className="h-3 w-3 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {project.relatedEntities.map((e) => (
                  <span key={e.id} className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-[11px] font-medium">{e.name}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5"><User className="h-3 w-3 shrink-0" /><span className="truncate">{project.picName ? `PIC ${project.picName}` : 'PIC belum ditentukan'}</span></div>
          {(project.startDate || project.targetEndDate) && (
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 shrink-0" />
              <span>{project.startDate ? formatDate(project.startDate) : '—'} → {project.targetEndDate ? formatDate(project.targetEndDate) : 'target belum ada'}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/5">{PROJECT_PHASE_LABELS[project.phase] ?? project.phase}</Badge>
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5">{PROJECT_LIFECYCLE_LABELS[project.lifecycle] ?? project.lifecycle}</Badge>
          {project.noApproval && (
            <Badge
              variant="outline"
              title="Didaftarkan di tahap awal tanpa melewati rantai persetujuan"
              className="text-[11px] h-4 px-1 gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5"
            >
              <ShieldOff className="h-3 w-3" /> Tanpa persetujuan
            </Badge>
          )}
        </div>

        {(proposed || rejected) && (
          <div className="space-y-2 pt-2 border-t border-slate-100/60 dark:border-white/10">
            {project.description && <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{project.description}</p>}
            {project.purpose && <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2"><strong className="text-slate-700 dark:text-slate-200">Tujuan:</strong> {project.purpose}</p>}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Diajukan {project.proposedBy?.name ?? '—'}{project.proposedAt ? ` · ${formatDateTime(project.proposedAt)}` : ''}
            </div>
            <ApprovalTrail
              approvals={project.approvals}
              pendingRole={project.pendingRole}
              chainless={project.approvalChain.length === 0}
              noApproval={project.noApproval}
              proposerName={project.proposedBy?.name ?? null}
            />
            {rejected && project.approvals.find((a) => a.decision === 'DITOLAK')?.note && (
              <p className="text-[13px] rounded-lg bg-rose-500/10 border border-rose-500/25 px-2.5 py-1.5 text-rose-700 dark:text-rose-300">
                <strong>Alasan:</strong> {project.approvals.find((a) => a.decision === 'DITOLAK')?.note}
              </p>
            )}
            {perm.approve && (
              deciding ? (
                <div className="space-y-2">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={deciding === 'DITOLAK' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'} className="bg-white/70 dark:bg-slate-900/50 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(deciding)} disabled={busy !== null || (deciding === 'DITOLAK' && note.trim().length < 5)} className={cn('text-white', deciding === 'DISETUJUI' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-rose-600 to-rose-500')}>
                      {busy === 'decide' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {deciding === 'DISETUJUI' ? 'Konfirmasi setuju' : 'Konfirmasi tolak'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeciding(null)} disabled={busy !== null}><X className="h-4 w-4" /> Batal</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => setDeciding('DISETUJUI')} className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">
                    <ThumbsUp className="h-4 w-4" /> Setujui sebagai {PROJECT_APPROVER_LABELS[project.pendingRole ?? ''] ?? '…'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeciding('DITOLAK')} className="border-rose-500/40 text-rose-700 dark:text-rose-300">
                    <ThumbsDown className="h-4 w-4" /> Tolak
                  </Button>
                </div>
              )
            )}
            {perm.resubmit && (
              <Button size="sm" variant="outline" onClick={resubmit} disabled={busy !== null} className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                {busy === 'resubmit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Ajukan ulang
              </Button>
            )}
          </div>
        )}

        {!proposed && !rejected && (
          <>
            {project.description && <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2">{project.description}</p>}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500 dark:text-slate-400">Progress</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{r?.progressPct || 0}%</span>
              </div>
              <Progress value={r?.progressPct || 0} className="h-1.5" />
            </div>
            {r ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100/60 dark:border-white/10">
                <Calendar className="h-3 w-3" /><span>Laporan terakhir: {formatDate(r.reportDate)}</span>
                {r.isLate && <Badge className="text-[8px] h-3.5 px-1 bg-rose-500/15 text-rose-700 dark:text-rose-300">Terlambat</Badge>}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 pt-2 border-t border-slate-100/60 dark:border-white/10">
                <Calendar className="h-3 w-3" /><span>Belum ada laporan</span>
              </div>
            )}
          </>
        )}

        {err && <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}</p>}

        {perm.manage && (
          <div className="flex gap-1.5 pt-2 mt-auto border-t border-slate-100/60 dark:border-white/10">
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={onEdit} disabled={busy !== null}>
              <Pencil className="h-3.5 w-3.5" /> Ubah
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={remove} disabled={busy !== null}>
              {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Pop-up pengajuan / perubahan proyek — layar penuh di ponsel, lembar lebar di desktop. */
function ProjectFormDialog({
  mode,
  project,
  onClose,
  onDone,
}: {
  mode: 'create' | 'edit'
  project?: ProjectItem
  onClose: () => void
  onDone: (created: { lifecycle: string } | null) => void
}) {
  const { user: me } = useApp()
  const editing = mode === 'edit' && project
  const [entityId, setEntityId] = useState(project?.entity.id ?? '')
  const optionsUrl = `/api/projects?options=1${entityId ? `&entityId=${entityId}` : ''}`
  const { data: opt, loading: optLoading } = useResource<Options>(optionsUrl)

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [purpose, setPurpose] = useState(project?.purpose ?? '')
  const [phase, setPhase] = useState(project?.phase ?? '')
  const [picUserId, setPicUserId] = useState(project?.picUserId ?? '')
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
      setErrors(Array.isArray(list) && list.length ? (list as string[]) : [res.error ?? 'Gagal menyimpan'])
      return
    }
    const created = res.json.project as { lifecycle: string } | undefined
    onDone(editing ? null : (created ?? null))
  }

  const needsEntity = !editing && !opt?.entityPinned && !ownerId
  const valid = name.trim().length >= 5 && description.trim().length >= 20 && !needsEntity

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'glass-modal p-0 gap-0 flex flex-col overflow-hidden',
          'w-screen h-dvh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0',
          'sm:w-[min(96vw,44rem)] sm:max-w-none sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2'
        )}
      >
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b border-white/40 dark:border-white/10 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight">{editing ? 'Ubah Proyek' : 'Ajukan Proyek'}</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                {editing
                  ? `${project!.code} · ${project!.entity.name}`
                  : skipping
                    ? 'Tahap awal tanpa persetujuan — proyek langsung aktif.'
                    : chain.length > 0
                      ? `Perlu persetujuan berurutan: ${chain.map((r) => PROJECT_APPROVER_LABELS[r] ?? r).join(' → ')}.`
                      : 'Peran Anda tidak memerlukan persetujuan — proyek langsung aktif.'}
              </DialogDescription>
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup" className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-500/10 dark:hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 sm:px-7 py-5 space-y-4">
          {!editing && opt && !opt.entityPinned && (
            <div className="space-y-1.5">
              <Label htmlFor="pp-entity" className="text-sm">PT pemilik proyek <span className="text-rose-500">*</span></Label>
              <select id="pp-entity" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPicUserId(''); setRelated((r) => r.filter((x) => x !== e.target.value)) }} className={selectClass}>
                <option value="">— pilih PT —</option>
                {opt.entities.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.code}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pp-name" className="text-sm">Nama proyek <span className="text-rose-500">*</span></Label>
            <Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Pembangunan Gudang Distribusi Timur" className={field} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-desc" className="text-sm">Penjelasan <span className="text-rose-500">*</span></Label>
            <Textarea id="pp-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apa yang dibangun / dikerjakan, lingkupnya, dan perkiraan kebutuhan." className="bg-white/70 dark:bg-slate-900/50 text-base" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Minimal 20 karakter agar penyetuju paham.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-purpose" className="text-sm">Tujuan / manfaat</Label>
            <Textarea id="pp-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Manfaat bagi PT, target yang ingin dicapai." className="bg-white/70 dark:bg-slate-900/50 text-base" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-phase" className="text-sm">Tahap awal <span className="text-slate-400 font-normal">(opsional)</span></Label>
              <select
                id="pp-phase"
                value={phase}
                onChange={(e) => {
                  setPhase(e.target.value)
                  // Jalur tanpa persetujuan hanya untuk tahap awal.
                  if (e.target.value !== '' && e.target.value !== 'INISIASI') setSkipApproval(false)
                }}
                className={selectClass}
              >
                <option value="">Belum ditentukan (dianggap Inisiasi)</option>
                {Object.entries(PROJECT_PHASE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-pic" className="text-sm">PIC / Manager proyek <span className="text-slate-400 font-normal">(opsional)</span></Label>
              <select id="pp-pic" value={picUserId} onChange={(e) => setPicUserId(e.target.value)} disabled={optLoading} className={selectClass}>
                <option value="">Kosongkan — tentukan nanti</option>
                {(opt?.candidates ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.id === me.id ? ' (Anda)' : ''}{c.activeProjects > 0 ? ` · memegang ${c.activeProjects} proyek` : ' · belum memegang proyek'}
                  </option>
                ))}
                {editing && project!.picUserId && !(opt?.candidates ?? []).some((c) => c.id === project!.picUserId) && (
                  <option value={project!.picUserId}>{project!.picName}</option>
                )}
              </select>
              {opt && ownerId && opt.candidates.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Belum ada akun Manager Proyek di PT ini.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-start" className="text-sm">Rencana mulai</Label>
              <Input id="pp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-end" className="text-sm">Target selesai</Label>
              <Input id="pp-end" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} className={field} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><Link2 className="h-4 w-4" /> PT yang berkaitan <span className="text-slate-400 font-normal">(boleh lebih dari satu)</span></Label>
            {relatedChoices.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{ownerId ? 'Tidak ada PT lain.' : 'Pilih PT pemilik dulu.'}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {relatedChoices.map((e) => {
                  const on = related.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setRelated((r) => (on ? r.filter((x) => x !== e.id) : [...r, e.id]))}
                      aria-pressed={on}
                      className={cn(
                        'min-h-10 rounded-full border px-3 text-sm font-medium inline-flex items-center gap-1.5',
                        on ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />} {e.name}
                    </button>
                  )
                })}
              </div>
            )}
            {related.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Proyek ini akan tampil juga di daftar proyek {related.length} PT terkait.</p>}
          </div>

          {editing && project!.permissions.setLifecycle && (
            <div className="space-y-1.5">
              <Label htmlFor="pp-life" className="text-sm">Status proyek</Label>
              <select id="pp-life" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} className={selectClass}>
                {project!.lifecycle === 'DIUSULKAN' && <option value="DIUSULKAN">Diusulkan (menunggu persetujuan)</option>}
                {project!.lifecycle === 'DITOLAK' && <option value="DITOLAK">Ditolak</option>}
                <option value="AKTIF">Aktif</option>
                <option value="DITUTUP">Ditutup</option>
                <option value="DIARSIPKAN">Diarsipkan</option>
              </select>
            </div>
          )}

          {!editing && chain.length > 0 && (
            <label
              htmlFor="pp-skip"
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition-colors',
                skipping ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-500/5',
                !earlyPhase && 'opacity-60 cursor-not-allowed'
              )}
            >
              <input
                id="pp-skip"
                type="checkbox"
                checked={skipping}
                disabled={!canSkip}
                onChange={(e) => setSkipApproval(e.target.checked)}
                className="mt-1 h-4 w-4 accent-amber-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Daftarkan tanpa persetujuan (tahap awal)</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {earlyPhase
                    ? `Proyek langsung aktif tanpa menunggu ${chain.map((r) => PROJECT_APPROVER_LABELS[r] ?? r).join(' → ')}. Tercatat di kartu proyek dan jejak audit.`
                    : 'Hanya untuk tahap awal (Inisiasi). Ubah tahapnya bila ingin memakai jalur ini.'}
                </span>
              </span>
            </label>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {e}</p>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-7 py-4 border-t border-white/40 dark:border-white/10 flex gap-2 justify-end bg-white/40 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="h-12 px-5 text-base">Batal</Button>
          <Button onClick={submit} disabled={busy || !valid} className="h-12 px-6 text-base bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : editing ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editing ? 'Simpan perubahan' : chain.length > 0 && !skipping ? 'Ajukan' : 'Buat proyek'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
