'use client'

import { useState } from 'react'
import { useApp } from '@/components/app-provider'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel } from '@/components/evidence-panel'
import { TaskSection } from '@/components/task-section'
import { ProgressReportPanel } from '@/components/progress-report-panel'
import { DAILY_STATUS_META, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDateLong, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, CalendarDays, CalendarRange, CheckCircle2, ClipboardCheck, Clock,
  ListChecks, Loader2, Lock, Send, Trash2,
} from 'lucide-react'

type Evidence = { id: string; fileName: string; url: string | null; mime?: string | null; size?: number | null; createdAt: string }

type Report = {
  id: string
  status: string
  progressPct: number
  achievementToday: string
  obstacle: string | null
  followUp: string | null
  decisionRequestedFrom: string | null
  evidenceCount: number
  submittedAt: string | null
  forwardedAt: string | null
  isLocked: boolean
  evidence: Evidence[]
}

type ProjectRow = {
  id: string
  code: string
  name: string
  phase: string
  taskCount: number
  derived: boolean
  report: Report | null
}

type Data = {
  reportDate: string
  lockAt: string
  locked: boolean
  countdown: { hours: number; minutes: number; passed: boolean }
  projects: ProjectRow[]
}

const STATUS_OPTIONS = ['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN', 'TIDAK_ADA_PERUBAHAN']

/**
 * Laporan Kemajuan (7 Sep 2026) — satu tempat untuk tiga kadens laporan
 * proyek: HARIAN (progress per task hari ini), MINGGUAN, dan BULANAN.
 * Seorang PIC lazimnya memegang satu proyek, jadi proyek itu langsung
 * terbuka dengan tombol "Tambah Progress" yang besar; bila memegang lebih
 * dari satu, tiap proyek jadi kartu yang bisa dibuka.
 */
export function DailyInputView() {
  const { user } = useApp()
  const { data, loading, error, reload } = useResource<Data>('/api/daily-input')
  const [openId, setOpenId] = useState<string | null>(null)
  const [cadence, setCadence] = useState<'HARIAN' | 'MINGGUAN' | 'BULANAN'>('HARIAN')
  const [projectForCadence, setProjectForCadence] = useState<string>('')

  if (loading) return <LoadingSpinner className="py-10" />
  if (error || !data) return <EmptyState title="Gagal memuat laporan kemajuan" description={error ?? undefined} />

  const single = data.projects.length === 1 ? data.projects[0] : null
  const submitted = data.projects.filter((p) => p.report?.submittedAt).length
  const outstanding = data.projects.length - submitted
  const options = data.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))
  const cadenceProject = single?.id ?? projectForCadence ?? data.projects[0]?.id ?? ''

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* Kepala */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Laporan Kemajuan</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            {single ? (
              <>
                <span className="font-medium text-slate-700 dark:text-slate-200">{single.name}</span> · {single.code} · {user.name}
              </>
            ) : (
              <>{formatDateLong(new Date(data.reportDate))} · {user.name}</>
            )}
          </p>
        </div>
        <div className={cn('glass rounded-xl px-3 py-2 flex items-center gap-2', data.locked ? 'text-rose-600' : 'text-amber-600')}>
          {data.locked ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{data.locked ? 'Harian terkunci' : 'Batas harian'}</div>
            <div className="text-base font-semibold tabular-nums">
              {data.locked ? `Lewat ${formatTime(data.lockAt)} WIB` : `${data.countdown.hours}j ${data.countdown.minutes}m lagi`}
            </div>
          </div>
        </div>
      </div>

      {/* Tiga kadens */}
      <Tabs value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
        <TabsList className="glass h-12 w-full grid grid-cols-3 p-1">
          <TabsTrigger value="HARIAN" className="h-10 text-sm sm:text-base gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
            <CalendarDays className="h-4 w-4" /> Harian
          </TabsTrigger>
          <TabsTrigger value="MINGGUAN" className="h-10 text-sm sm:text-base gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
            <CalendarRange className="h-4 w-4" /> Mingguan
          </TabsTrigger>
          <TabsTrigger value="BULANAN" className="h-10 text-sm sm:text-base gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white">
            <ClipboardCheck className="h-4 w-4" /> Bulanan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="HARIAN" className="mt-4 space-y-3">
          {!single && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Sudah dikirim</div>
                <div className="text-2xl font-bold text-emerald-600">{submitted}</div>
                <div className="text-[13px] text-slate-500 dark:text-slate-400">dari {data.projects.length} proyek</div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Belum dikirim</div>
                <div className={cn('text-2xl font-bold', outstanding > 0 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500')}>{outstanding}</div>
                <div className="text-[13px] text-slate-500 dark:text-slate-400">butuh tindakan</div>
              </div>
            </div>
          )}

          {data.projects.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
              title="Belum ada proyek yang ditugaskan"
              description="Hubungi Admin PT untuk penugasan proyek."
            />
          ) : single ? (
            <ProjectCard
              project={single}
              projects={options}
              locked={data.locked}
              lockAt={data.lockAt}
              reportDate={data.reportDate}
              open
              single
              onToggle={() => {}}
              onSaved={reload}
            />
          ) : (
            <div className="space-y-3">
              {data.projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  projects={options}
                  locked={data.locked}
                  lockAt={data.lockAt}
                  reportDate={data.reportDate}
                  open={openId === p.id}
                  onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                  onSaved={reload}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {(['MINGGUAN', 'BULANAN'] as const).map((c) => (
          <TabsContent key={c} value={c} className="mt-4 space-y-3">
            {data.projects.length === 0 ? (
              <EmptyState title="Belum ada proyek yang ditugaskan" />
            ) : (
              <>
                {!single && (
                  <div className="glass rounded-xl p-3 flex items-center gap-3">
                    <Label htmlFor={`proj-${c}`} className="text-sm shrink-0">Proyek</Label>
                    <select
                      id={`proj-${c}`}
                      value={cadenceProject}
                      onChange={(e) => setProjectForCadence(e.target.value)}
                      className="h-10 flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 px-3 text-base"
                    >
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {cadenceProject && <ProgressReportPanel projectId={cadenceProject} cadence={c} />}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function ProjectCard({
  project,
  projects,
  locked,
  lockAt,
  reportDate,
  open,
  single = false,
  onToggle,
  onSaved,
}: {
  project: ProjectRow
  projects: { id: string; code: string; name: string }[]
  locked: boolean
  lockAt: string
  reportDate: string
  open: boolean
  single?: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const r = project.report
  const [status, setStatus] = useState(r?.status ?? '')
  const [progressPct, setProgressPct] = useState(r?.progressPct ?? 0)
  const [achievementToday, setAchievement] = useState(r?.achievementToday ?? '')
  const [obstacle, setObstacle] = useState(r?.obstacle ?? '')
  const [followUp, setFollowUp] = useState(r?.followUp ?? '')
  const [busy, setBusy] = useState<'save' | 'submit' | 'delete' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Once the day has tasks the report is derived from them, so the values the
  // server just computed are the truth — the local form state would be stale
  // after every task edit. The evidence total likewise includes task files.
  const derived = project.derived && r !== null
  const shownStatus = derived ? r.status : status
  const shownProgress = derived ? r.progressPct : progressPct
  const needsObstacle = shownStatus === 'TERKENDALA' || shownStatus === 'MENUNGGU_KEPUTUSAN'
  const needsEvidence = shownStatus !== '' && shownStatus !== 'TIDAK_ADA_PERUBAHAN'
  const evidenceCount = r?.evidenceCount ?? 0
  const canDelete = !!r && !locked && !r.isLocked && !r.forwardedAt

  async function send(action: 'save' | 'submit') {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch('/api/daily-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, action, status, progressPct, achievementToday, obstacle: obstacle || null, followUp: followUp || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal menyimpan' })
      else {
        setMsg({ kind: 'ok', text: action === 'submit' ? 'Terkirim ke Admin PT.' : 'Draft tersimpan.' })
        onSaved()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  async function removeReport() {
    if (!window.confirm('Hapus laporan hari ini beserta lampiran di levelnya? Progress (task) tidak ikut terhapus.')) return
    setBusy('delete')
    setMsg(null)
    try {
      const res = await fetch(`/api/daily-input?projectId=${project.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal menghapus' })
      else {
        setStatus('')
        setProgressPct(0)
        setAchievement('')
        setObstacle('')
        setFollowUp('')
        onSaved()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  const state = r?.forwardedAt
    ? { label: 'Diteruskan', tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
    : r?.submittedAt
      ? { label: 'Terkirim', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
      : r
        ? { label: 'Draft', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
        : { label: 'Belum diisi', tone: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <CardTitle className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">
          {single ? formatDateLong(new Date(reportDate)) : project.name}
        </CardTitle>
        <CardDescription className="text-[13px] flex flex-wrap items-center gap-1.5 mt-1">
          <span className="font-mono">{project.code}</span>
          <Badge variant="outline" className="text-[11px] h-4 px-1">{PROJECT_PHASE_LABELS[project.phase] ?? project.phase}</Badge>
          {project.taskCount > 0 && <span>· {project.taskCount} progress</span>}
        </CardDescription>
      </div>
      <span className={cn('shrink-0 text-xs font-semibold px-2 py-1 rounded-full', state.tone)}>{state.label}</span>
    </div>
  )

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        {single ? (
          <div>{header}</div>
        ) : (
          <button onClick={onToggle} className="w-full text-left" aria-expanded={open}>{header}</button>
        )}
        {r && (
          <div className="mt-2 flex items-center gap-2">
            <DailyStatusBadge status={r.status} />
            <Progress value={r.progressPct} className="h-1.5 flex-1" />
            <span className="text-[13px] tabular-nums text-slate-500 dark:text-slate-400">{r.progressPct}%</span>
          </div>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 border-t border-white/40 dark:border-white/10 pt-4">
          {locked && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[13px] text-rose-700 dark:text-rose-300">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Laporan hari ini sudah melewati pukul {formatTime(lockAt)} WIB dan terkunci. Ajukan permohonan buka kunci melalui Admin PT.
            </div>
          )}

          {/* Progress (task) — tindakan utama */}
          <TaskSection projectId={project.id} projectName={project.name} projects={projects} locked={locked} prominent={single} />

          {/* Ringkasan hari */}
          {project.derived ? (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <ListChecks className="h-4 w-4" /> Diringkas dari {project.taskCount} progress
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DailyStatusBadge status={shownStatus} />
                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                  <Progress value={shownProgress} className="h-2 flex-1" />
                  <span className="text-sm font-semibold tabular-nums">{shownProgress}%</span>
                </div>
              </div>
              <p className="text-[13px] text-blue-800/80 dark:text-blue-200/80">
                Status dan progres dihitung dari daftar progress di atas, jadi tidak perlu diisi ulang di sini.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Status <span className="text-rose-500">*</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={locked}
                      onClick={() => setStatus(s)}
                      className={cn(
                        'min-h-10 text-[13px] px-3 rounded-lg border transition-colors disabled:opacity-50',
                        status === s ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                      )}
                    >
                      {DAILY_STATUS_META[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pct-${project.id}`} className="text-sm">Progres ({progressPct}%)</Label>
                <Input id={`pct-${project.id}`} type="range" min={0} max={100} value={progressPct} disabled={locked} onChange={(e) => setProgressPct(Number(e.target.value))} className="h-9 cursor-pointer" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`ach-${project.id}`} className="text-sm">Capaian hari ini <span className="text-rose-500">*</span></Label>
            <Textarea id={`ach-${project.id}`} rows={2} disabled={locked} value={achievementToday} onChange={(e) => setAchievement(e.target.value)} placeholder="Apa yang selesai hari ini?" className="bg-white/70 dark:bg-slate-900/50 text-base" />
          </div>

          {needsObstacle && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`obs-${project.id}`} className="text-sm">Kendala <span className="text-rose-500">*</span></Label>
                <Textarea id={`obs-${project.id}`} rows={2} disabled={locked} value={obstacle} onChange={(e) => setObstacle(e.target.value)} placeholder="Apa yang menghambat?" className="bg-white/70 dark:bg-slate-900/50 text-base" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`fu-${project.id}`} className="text-sm">Rencana tindak lanjut {shownStatus === 'TERKENDALA' && <span className="text-rose-500">*</span>}</Label>
                <Textarea id={`fu-${project.id}`} rows={2} disabled={locked} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="bg-white/70 dark:bg-slate-900/50 text-base" />
              </div>
            </>
          )}

          <EvidencePanel targetType="DAILY_REPORT" targetId={r?.id ?? null} items={r?.evidence ?? []} required={needsEvidence} disabled={locked} onChanged={onSaved} />

          {msg && (
            <div className={cn('flex items-start gap-2 rounded-lg p-2.5 text-[13px]', msg.kind === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300')}>
              {msg.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={locked || busy !== null} onClick={() => send('save')} className="text-sm">
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Simpan draft
            </Button>
            <Button
              size="sm"
              disabled={locked || busy !== null || shownStatus === '' || (needsEvidence && evidenceCount < 1)}
              onClick={() => send('submit')}
              className="text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white"
            >
              {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Kirim ke Admin PT
            </Button>
            {canDelete && (
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={removeReport} className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-500/10">
                {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus laporan
              </Button>
            )}
            {needsEvidence && evidenceCount < 1 && (
              <span className="text-[13px] text-amber-700 dark:text-amber-300 self-center">Lampirkan bukti dulu sebelum mengirim.</span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
