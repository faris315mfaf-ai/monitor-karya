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
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel } from '@/components/evidence-panel'
import { TaskSection } from '@/components/task-section'
import { DAILY_STATUS_META, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDateLong } from '@/lib/format'
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Clock, ExternalLink,
  Loader2, Lock, Paperclip, Plus, Send, Trash2, ListChecks,
} from 'lucide-react'

type Evidence = { id: string; fileName: string; url: string | null; createdAt: string }

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

export function DailyInputView() {
  const { user } = useApp()
  const { data, loading, error, reload } = useResource<Data>('/api/daily-input')
  const [openId, setOpenId] = useState<string | null>(null)

  if (loading) return <LoadingSpinner className="py-10" />
  if (error || !data) return <EmptyState title="Gagal memuat lapor harian" description={error ?? undefined} />

  const submitted = data.projects.filter((p) => p.report?.submittedAt).length
  const outstanding = data.projects.length - submitted

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Lapor Harian</h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            {formatDateLong(new Date(data.reportDate))} · {user.name}
          </p>
        </div>
        <div
          className={`glass rounded-xl px-3 py-2 flex items-center gap-2 ${
            data.locked ? 'text-rose-600' : 'text-amber-600'
          }`}
        >
          {data.locked ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {data.locked ? 'Terkunci' : 'Batas kirim'}
            </div>
            <div className="text-base font-semibold tabular-nums">
              {data.locked
                ? 'Lewat 17.00 WIB'
                : `${data.countdown.hours}j ${data.countdown.minutes}m lagi`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Sudah dikirim</div>
          <div className="text-2xl font-bold text-emerald-600">{submitted}</div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">dari {data.projects.length} proyek</div>
        </div>
        <div className="glass rounded-xl p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Belum dikirim</div>
          <div className={`text-2xl font-bold ${outstanding > 0 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'}`}>
            {outstanding}
          </div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">butuh tindakan</div>
        </div>
      </div>

      {data.projects.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />}
          title="Belum ada proyek yang ditugaskan"
          description="Hubungi Admin PT untuk penugasan proyek."
        />
      ) : (
        <div className="space-y-3">
          {data.projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              locked={data.locked}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              onSaved={reload}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  locked,
  open,
  onToggle,
  onSaved,
}: {
  project: ProjectRow
  locked: boolean
  open: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const r = project.report
  const [status, setStatus] = useState(r?.status ?? '')
  const [progressPct, setProgressPct] = useState(r?.progressPct ?? 0)
  const [achievementToday, setAchievement] = useState(r?.achievementToday ?? '')
  const [obstacle, setObstacle] = useState(r?.obstacle ?? '')
  const [followUp, setFollowUp] = useState(r?.followUp ?? '')
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const needsObstacle = status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN'
  const needsEvidence = status !== '' && status !== 'TIDAK_ADA_PERUBAHAN'
  const evidenceCount = r?.evidence.length ?? 0

  async function send(action: 'save' | 'submit') {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch('/api/daily-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          action,
          status,
          progressPct,
          achievementToday,
          obstacle: obstacle || null,
          followUp: followUp || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: json.error || 'Gagal menyimpan' })
      } else {
        setMsg({
          kind: 'ok',
          text: action === 'submit' ? 'Terkirim ke Admin PT.' : 'Draft tersimpan.',
        })
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

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <button onClick={onToggle} className="w-full text-left" aria-expanded={open}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">
                {project.name}
              </CardTitle>
              <CardDescription className="text-[13px] flex flex-wrap items-center gap-1.5 mt-1">
                <span className="font-mono">{project.code}</span>
                <Badge variant="outline" className="text-[11px] h-4 px-1">
                  {PROJECT_PHASE_LABELS[project.phase] ?? project.phase}
                </Badge>
              </CardDescription>
            </div>
            <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${state.tone}`}>
              {state.label}
            </span>
          </div>
          {r && (
            <div className="mt-2 flex items-center gap-2">
              <DailyStatusBadge status={r.status} />
              <Progress value={r.progressPct} className="h-1.5 flex-1" />
              <span className="text-[13px] tabular-nums text-slate-500 dark:text-slate-400">{r.progressPct}%</span>
            </div>
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 border-t border-white/40 dark:border-white/10 pt-4">
          {locked && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[13px] text-rose-700 dark:text-rose-300">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Laporan hari ini sudah melewati pukul 17.00 WIB dan terkunci. Ajukan permohonan buka
              kunci melalui Admin PT.
            </div>
          )}

          {project.derived ? (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <ListChecks className="h-4 w-4" />
                Diringkas dari {project.taskCount} task
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DailyStatusBadge status={status} />
                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                  <Progress value={progressPct} className="h-2 flex-1" />
                  <span className="text-sm font-semibold tabular-nums">{progressPct}%</span>
                </div>
              </div>
              <p className="text-[13px] text-blue-800/80 dark:text-blue-200/80">
                Status dan progres dihitung dari daftar task di bawah, jadi tidak perlu
                diisi ulang di sini. Ubah task untuk mengubah keduanya.
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
                    className={`text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      status === s
                        ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 dark:hover:bg-slate-400/15'
                    }`}
                  >
                    {DAILY_STATUS_META[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`pct-${project.id}`} className="text-sm">
                Progres ({progressPct}%)
              </Label>
              <Input
                id={`pct-${project.id}`}
                type="range"
                min={0}
                max={100}
                value={progressPct}
                disabled={locked}
                onChange={(e) => setProgressPct(Number(e.target.value))}
                className="h-9 cursor-pointer"
              />
            </div>
          </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`ach-${project.id}`} className="text-sm">
              Capaian hari ini <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id={`ach-${project.id}`}
              rows={2}
              disabled={locked}
              value={achievementToday}
              onChange={(e) => setAchievement(e.target.value)}
              placeholder="Apa yang selesai hari ini?"
              className="bg-white/70 dark:bg-slate-900/50 text-base"
            />
          </div>

          {needsObstacle && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`obs-${project.id}`} className="text-sm">
                  Kendala <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id={`obs-${project.id}`}
                  rows={2}
                  disabled={locked}
                  value={obstacle}
                  onChange={(e) => setObstacle(e.target.value)}
                  placeholder="Apa yang menghambat?"
                  className="bg-white/70 dark:bg-slate-900/50 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`fu-${project.id}`} className="text-sm">
                  Rencana tindak lanjut {status === 'TERKENDALA' && <span className="text-rose-500">*</span>}
                </Label>
                <Textarea
                  id={`fu-${project.id}`}
                  rows={2}
                  disabled={locked}
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  className="bg-white/70 dark:bg-slate-900/50 text-base"
                />
              </div>
            </>
          )}

          <TaskSection projectId={project.id} projectName={project.name} locked={locked} />

          <EvidencePanel
            targetType="DAILY_REPORT"
            targetId={r?.id ?? null}
            items={r?.evidence ?? []}
            required={needsEvidence}
            disabled={locked}
            onChanged={onSaved}
          />

          {msg && (
            <div
              className={`flex items-start gap-2 rounded-lg p-2.5 text-[13px] ${
                msg.kind === 'ok'
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300'
              }`}
            >
              {msg.kind === 'ok' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={locked || busy !== null}
              onClick={() => send('save')}
              className="text-sm"
            >
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Simpan draft
            </Button>
            <Button
              size="sm"
              disabled={locked || busy !== null || (needsEvidence && evidenceCount < 1)}
              onClick={() => send('submit')}
              className="text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white"
            >
              {busy === 'submit' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Kirim ke Admin PT
            </Button>
            {needsEvidence && evidenceCount < 1 && (
              <span className="text-[13px] text-amber-700 dark:text-amber-300 self-center">
                Lampirkan bukti dulu sebelum mengirim.
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
