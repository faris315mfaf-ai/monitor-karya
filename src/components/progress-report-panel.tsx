'use client'

import { useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, ErrorState } from '@/components/loading-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel, type EvidenceItem } from '@/components/evidence-panel'
import { DAILY_STATUS_META } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertTriangle, CalendarRange, Check, CheckCircle2, ChevronDown, Loader2, Lock, Pencil, Send, Trash2, X,
} from 'lucide-react'

type Report = {
  id: string
  status: string
  progressPct: number
  summary: string
  obstacle: string | null
  followUp: string | null
  evidenceCount: number
  submittedAt: string | null
  isLocked: boolean
  updatedAt: string
  evidence: EvidenceItem[]
}

type PeriodRow = {
  key: string
  start: string
  end: string
  lockAt: string
  locked: boolean
  current: boolean
  report: Report | null
}

type Data = {
  project: { id: string; name: string; code: string }
  cadence: 'MINGGUAN' | 'BULANAN'
  periods: PeriodRow[]
}

const STATUS_OPTIONS = ['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN', 'TIDAK_ADA_PERUBAHAN']

function periodLabel(cadence: Data['cadence'], p: PeriodRow) {
  if (cadence === 'MINGGUAN') {
    const w = p.key.split('-W')[1]
    return `Minggu ${Number(w)} · ${formatDate(p.start)} – ${formatDate(p.end)}`
  }
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(p.start))
}

/**
 * Laporan kemajuan per MINGGU atau per BULAN untuk satu proyek. Periode
 * berjalan tampil terbuka; periode lampau terlipat. Laporan yang belum
 * terkunci bisa diubah atau dihapus; yang terkunci hanya dibaca.
 */
export function ProgressReportPanel({
  projectId,
  cadence,
}: {
  projectId: string
  cadence: 'MINGGUAN' | 'BULANAN'
}) {
  const { data, loading, error, reload } = useResource<Data>(
    `/api/progress-reports?projectId=${projectId}&cadence=${cadence}`
  )

  if (loading) return <LoadingSpinner className="py-8" />
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} />

  const done = data.periods.filter((p) => p.report?.submittedAt).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 px-1">
        <CalendarRange className="h-4 w-4" />
        {done} dari {data.periods.length} periode terakhir sudah dikirim
      </div>
      {data.periods.map((p) => (
        <PeriodCard key={p.key} period={p} cadence={data.cadence} projectId={projectId} onChanged={reload} />
      ))}
    </div>
  )
}

function PeriodCard({
  period: p,
  cadence,
  projectId,
  onChanged,
}: {
  period: PeriodRow
  cadence: Data['cadence']
  projectId: string
  onChanged: () => void
}) {
  const r = p.report
  const [open, setOpen] = useState(p.current || (!!r && !r.submittedAt))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'save' | 'submit' | 'delete' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [status, setStatus] = useState(r?.status ?? '')
  const [progressPct, setProgressPct] = useState(r?.progressPct ?? 0)
  const [summary, setSummary] = useState(r?.summary ?? '')
  const [obstacle, setObstacle] = useState(r?.obstacle ?? '')
  const [followUp, setFollowUp] = useState(r?.followUp ?? '')

  const editable = !p.locked
  const showForm = editable && (editing || !r)
  const needsObstacle = status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN'
  const needsEvidence = status !== '' && status !== 'TIDAK_ADA_PERUBAHAN'

  async function send(action: 'save' | 'submit') {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch('/api/progress-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cadence, periodKey: p.key, action, status, progressPct, summary, obstacle: obstacle || null, followUp: followUp || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: json.error || 'Gagal menyimpan' })
      } else {
        setMsg({ kind: 'ok', text: action === 'submit' ? 'Laporan terkirim.' : 'Draft tersimpan.' })
        setEditing(false)
        onChanged()
      }
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!r) return
    if (!window.confirm('Hapus laporan periode ini beserta lampirannya?')) return
    setBusy('delete')
    setMsg(null)
    try {
      const res = await fetch(`/api/progress-reports?id=${r.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setMsg({ kind: 'err', text: json.error || 'Gagal menghapus' })
      else onChanged()
    } catch {
      setMsg({ kind: 'err', text: 'Tidak dapat menghubungi server.' })
    } finally {
      setBusy(null)
    }
  }

  const state = p.locked
    ? { label: 'Terkunci', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', icon: Lock }
    : r?.submittedAt
      ? { label: 'Terkirim', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 }
      : r
        ? { label: 'Draft', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: Pencil }
        : { label: 'Belum diisi', tone: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', icon: CalendarRange }

  return (
    <Card className={cn('glass overflow-hidden', p.current && 'ring-1 ring-blue-500/30')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{periodLabel(cadence, p)}</span>
            {p.current && <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5">Berjalan</span>}
          </div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            {p.locked ? `Dikunci ${formatDateTime(p.lockAt)}` : `Batas ${formatDateTime(p.lockAt)}`}
            {r ? ` · ${r.evidenceCount} bukti` : ''}
          </div>
        </div>
        {r && <DailyStatusBadge status={r.status} size="xs" />}
        <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full shrink-0', state.tone)}>
          <state.icon className="h-3 w-3" /> {state.label}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <CardContent className="border-t border-white/40 dark:border-white/10 pt-4 space-y-3">
          {r && !showForm && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress value={r.progressPct} className="h-2 flex-1" />
                <span className="text-sm font-semibold tabular-nums">{r.progressPct}%</span>
              </div>
              <p className="text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{r.summary}</p>
              {r.obstacle && (
                <p className="text-sm rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-rose-700 dark:text-rose-300"><strong>Kendala:</strong> {r.obstacle}</p>
              )}
              {r.followUp && (
                <p className="text-sm rounded-lg bg-blue-500/10 border border-blue-500/25 px-3 py-2 text-blue-700 dark:text-blue-300"><strong>Tindak lanjut:</strong> {r.followUp}</p>
              )}
              <EvidencePanel targetType="PROGRESS_REPORT" targetId={r.id} items={r.evidence} disabled={!editable} onChanged={onChanged} required={needsEvidence} />
              {editable && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Ubah</Button>
                  {!r.submittedAt && (
                    <Button size="sm" onClick={() => send('submit')} disabled={busy !== null || (needsEvidence && r.evidenceCount < 1)} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                      {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Kirim
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={remove} disabled={busy !== null} className="text-rose-600 hover:text-rose-700 hover:bg-rose-500/10">
                    {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus
                  </Button>
                </div>
              )}
            </div>
          )}

          {showForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Status <span className="text-rose-500">*</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={status === s}
                      className={cn(
                        'min-h-10 text-[13px] px-3 rounded-lg border transition-colors',
                        status === s
                          ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                      )}
                    >
                      {DAILY_STATUS_META[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pp-${p.key}`} className="text-sm">Progres kumulatif ({progressPct}%)</Label>
                <Input id={`pp-${p.key}`} type="range" min={0} max={100} value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} className="h-9 cursor-pointer" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sum-${p.key}`} className="text-sm">Ringkasan capaian {cadence === 'MINGGUAN' ? 'minggu' : 'bulan'} ini <span className="text-rose-500">*</span></Label>
                <Textarea id={`sum-${p.key}`} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Apa yang tercapai, angka yang penting, dan hal yang perlu diketahui atasan." className="bg-white/70 dark:bg-slate-900/50 text-base" />
              </div>
              {needsObstacle && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Kendala <span className="text-rose-500">*</span></Label>
                    <Textarea rows={2} value={obstacle} onChange={(e) => setObstacle(e.target.value)} className="bg-white/70 dark:bg-slate-900/50 text-base" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Rencana tindak lanjut {status === 'TERKENDALA' && <span className="text-rose-500">*</span>}</Label>
                    <Textarea rows={2} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="bg-white/70 dark:bg-slate-900/50 text-base" />
                  </div>
                </>
              )}
              {r ? (
                <EvidencePanel targetType="PROGRESS_REPORT" targetId={r.id} items={r.evidence} onChanged={onChanged} required={needsEvidence} />
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Simpan draft dulu, lalu lampirkan foto atau dokumen.</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => send('save')} disabled={busy !== null || !status || !summary.trim()}>
                  {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Simpan draft
                </Button>
                <Button size="sm" onClick={() => send('submit')} disabled={busy !== null || !status || !summary.trim() || (needsEvidence && (r?.evidenceCount ?? 0) < 1)} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                  {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Kirim
                </Button>
                {r && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy !== null}><X className="h-3.5 w-3.5" /> Batal</Button>
                )}
              </div>
            </div>
          )}

          {!r && !editable && (
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2"><Lock className="h-4 w-4" /> Periode ini sudah lewat tanpa laporan.</p>
          )}

          {msg && (
            <div className={cn('flex items-start gap-2 rounded-lg p-2.5 text-[13px]', msg.kind === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300')}>
              {msg.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              {msg.text}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
