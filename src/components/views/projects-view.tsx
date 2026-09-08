'use client'

import { useEffect, useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DailyStatusBadge } from '@/components/status-badges'
import { PROJECT_PHASE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_APPROVER_LABELS } from '@/lib/constants'
import { PROJECT_APPROVER_ROLES, can } from '@/lib/rbac'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, Building2, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, FolderKanban,
  Filter, Loader2, Plus, Search, ThumbsDown, ThumbsUp, User, X, XCircle,
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
  proposedBy: { id: string; name: string } | null
  proposedAt: string | null
  approvals: Approval[]
  startDate: string | null
  targetEndDate: string | null
  approvedByName: string | null
  entity: { id: string; name: string; code: string; region: string | null }
  latestReport: { status: string; progressPct: number; reportDate: string; isLate: boolean } | null
}

type ProjectListData = { items: ProjectItem[]; total: number; page: number; pageSize: number }

const LIFECYCLES = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'DIUSULKAN', label: 'Diusulkan' },
  { value: 'DITOLAK', label: 'Ditolak' },
  { value: 'DITUTUP', label: 'Ditutup' },
  { value: 'ALL', label: 'Semua status' },
]

export function ProjectsView() {
  const { user } = useApp()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState<string>('ALL')
  const [lifecycle, setLifecycle] = useState<string>('AKTIF')
  const [proposing, setProposing] = useState(false)

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
          <Button onClick={() => setProposing(true)} className="h-11 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-glow-blue">
            <Plus className="h-5 w-5" /> Ajukan Proyek
          </Button>
        )}
      </div>

      {/* Filters */}
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
                <SelectItem value="INISIASI">Inisiasi</SelectItem>
                <SelectItem value="PERENCANAAN">Perencanaan</SelectItem>
                <SelectItem value="PELAKSANAAN">Pelaksanaan</SelectItem>
                <SelectItem value="PENYELESAIAN">Penyelesaian</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data?.items?.length ? (
        <EmptyState icon={<FolderKanban className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada proyek" description={lifecycle === 'DIUSULKAN' ? 'Belum ada pengajuan yang menunggu.' : 'Coba ubah filter pencarian'} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.items.map((p) => (
              <ProjectCard key={p.id} project={p} onChanged={reload} />
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

      {proposing && (
        <ProposeDialog
          onClose={() => setProposing(false)}
          onDone={() => {
            setProposing(false)
            setLifecycle('DIUSULKAN')
            setPage(1)
            reload()
          }}
        />
      )}
    </div>
  )
}

/** Tiga slot tanda tangan: siapa sudah, siapa belum, siapa menolak. */
function ApprovalTrail({ approvals }: { approvals: Approval[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {approvals.map((a) => {
        const ok = a.decision === 'DISETUJUI'
        const no = a.decision === 'DITOLAK'
        return (
          <div
            key={a.role}
            title={a.note ?? undefined}
            className={cn(
              'rounded-lg px-2 py-1.5 text-[11px] leading-tight border',
              ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : no ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300' : 'bg-slate-500/5 border-slate-200/70 dark:border-slate-700 text-slate-500 dark:text-slate-400'
            )}
          >
            <div className="flex items-center gap-1 font-semibold">
              {ok ? <CheckCircle2 className="h-3 w-3" /> : no ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              <span className="truncate">{PROJECT_APPROVER_LABELS[a.role] ?? a.role}</span>
            </div>
            <div className="truncate opacity-80">{a.decidedByName ?? 'menunggu'}</div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectCard({ project, onChanged }: { project: ProjectItem; onChanged: () => void }) {
  const { user } = useApp()
  const r = project.latestReport
  const proposed = project.lifecycle === 'DIUSULKAN'
  const rejected = project.lifecycle === 'DITOLAK'
  const mySlot = project.approvals.find((a) => a.role === user.role)
  const mayApprove =
    proposed &&
    can(user.role, 'project:approve') &&
    (PROJECT_APPROVER_ROLES as readonly string[]).includes(user.role) &&
    (user.role !== 'DIREKTUR_ENTITAS' || user.scopeEntityId === project.entity.id)

  const [deciding, setDeciding] = useState<'DISETUJUI' | 'DITOLAK' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function decide(decision: 'DISETUJUI' | 'DITOLAK') {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/projects/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, decision, note }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Gagal memproses')
      else {
        setDeciding(null)
        setNote('')
        onChanged()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={cn('glass hover:shadow-lg transition-all group', proposed && 'ring-1 ring-amber-500/40', rejected && 'opacity-80')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 group-hover:text-blue-700 transition-colors">{project.name}</h3>
            <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono mt-1">{project.code}</Badge>
          </div>
          {r && !proposed && <DailyStatusBadge status={r.status} size="xs" />}
          {proposed && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px]">Menunggu persetujuan</Badge>}
          {rejected && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px]">Ditolak</Badge>}
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Building2 className="h-3 w-3" /><span className="truncate">{project.entity.name}</span>
        </div>
        {project.picName && (
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            <User className="h-3 w-3" /><span className="truncate">PIC {project.picName}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/5">{PROJECT_PHASE_LABELS[project.phase]}</Badge>
          <Badge variant="outline" className="text-[11px] h-4 px-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5">{PROJECT_LIFECYCLE_LABELS[project.lifecycle] ?? project.lifecycle}</Badge>
        </div>

        {(proposed || rejected) && (
          <div className="space-y-2 pt-1 border-t border-slate-100/60 dark:border-white/10">
            {project.description && <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 pt-2">{project.description}</p>}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Diajukan {project.proposedBy?.name ?? '—'}{project.proposedAt ? ` · ${formatDateTime(project.proposedAt)}` : ''}
            </div>
            <ApprovalTrail approvals={project.approvals} />
            {mayApprove && (
              deciding ? (
                <div className="space-y-2">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={deciding === 'DITOLAK' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'} className="bg-white/70 dark:bg-slate-900/50 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(deciding)} disabled={busy || (deciding === 'DITOLAK' && note.trim().length < 5)} className={cn('text-white', deciding === 'DISETUJUI' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-rose-600 to-rose-500')}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {deciding === 'DISETUJUI' ? 'Konfirmasi setuju' : 'Konfirmasi tolak'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeciding(null)} disabled={busy}><X className="h-4 w-4" /> Batal</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => setDeciding('DISETUJUI')} className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">
                    <ThumbsUp className="h-4 w-4" /> {mySlot?.decision === 'DISETUJUI' ? 'Sudah disetujui' : 'Setujui'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeciding('DITOLAK')} className="border-rose-500/40 text-rose-700 dark:text-rose-300">
                    <ThumbsDown className="h-4 w-4" /> Tolak
                  </Button>
                </div>
              )
            )}
            {err && <p className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {err}</p>}
          </div>
        )}

        {!proposed && !rejected && (
          <>
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
      </CardContent>
    </Card>
  )
}

/** Pop-up pengajuan proyek baru (Admin PT). */
function ProposeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phase, setPhase] = useState('INISIASI')
  const [picUserId, setPicUserId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetEndDate, setTargetEndDate] = useState('')
  const [candidates, setCandidates] = useState<{ id: string; name: string; activeProjects: number }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/projects?picCandidates=1')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setCandidates(Array.isArray(j.items) ? j.items : [])
      })
      .catch(() => {
        if (!cancelled) setCandidates([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    setBusy(true)
    setErrors([])
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, phase, picUserId, startDate, targetEndDate }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(Array.isArray(json.errors) && json.errors.length ? json.errors : [json.error || 'Gagal mengajukan'])
        return
      }
      onDone()
    } catch {
      setErrors(['Tidak dapat menghubungi server.'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-modal sm:max-w-xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">Ajukan Proyek</DialogTitle>
          <DialogDescription className="text-sm">
            Pengajuan disetujui oleh Direktur Entitas, Direktur SDM & GA, dan Manajemen sebelum proyek aktif.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pp-name" className="text-sm">Nama proyek <span className="text-rose-500">*</span></Label>
            <Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Pembangunan Gudang Distribusi Timur" className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-desc" className="text-sm">Penjelasan & tujuan <span className="text-rose-500">*</span></Label>
            <Textarea id="pp-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apa yang dibangun, untuk apa, manfaat bagi PT, dan perkiraan kebutuhan." className="bg-white/70 dark:bg-slate-900/50 text-base" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-phase" className="text-sm">Tahap awal</Label>
              <select id="pp-phase" value={phase} onChange={(e) => setPhase(e.target.value)} className="h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base">
                {Object.entries(PROJECT_PHASE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-pic" className="text-sm">PIC proyek</Label>
              <select id="pp-pic" value={picUserId} onChange={(e) => setPicUserId(e.target.value)} disabled={candidates === null} className="h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base">
                <option value="">Tentukan nanti</option>
                {(candidates ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.activeProjects > 0 ? ` · memegang ${c.activeProjects} proyek` : ' · belum memegang proyek'}</option>
                ))}
              </select>
              {candidates !== null && candidates.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Belum ada akun PIC Proyek di PT ini.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-start" className="text-sm">Rencana mulai</Label>
              <Input id="pp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-end" className="text-sm">Target selesai</Label>
              <Input id="pp-end" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} className="bg-white/70 dark:bg-slate-900/50 h-11 text-base" />
            </div>
          </div>
          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {e}</p>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="h-11">Batal</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 5 || description.trim().length < 20} className="h-11 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
