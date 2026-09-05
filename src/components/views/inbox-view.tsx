'use client'

import { useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DailyStatusBadge, WeeklyHeaderBadge } from '@/components/status-badges'
import { formatDateLong, formatTime } from '@/lib/format'
import {
  ArrowUpRight, CheckCircle2, Clock, FolderKanban, Inbox, Loader2, Lock, Users,
} from 'lucide-react'

type DailyRow = {
  projectId: string
  code: string
  name: string
  picName: string | null
  reportId: string | null
  status: string | null
  progressPct: number | null
  evidenceCount: number
  submittedAt: string | null
  submittedBy: string | null
  forwardedAt: string | null
  readyToForward: boolean
}

type WeeklyRow = {
  divisionId: string
  name: string
  headName: string | null
  reportId: string | null
  statusHeader: string | null
  itemCount: number
  submittedAt: string | null
  approvedAt: string | null
  forwardedAt: string | null
  readyToForward: boolean
}

type Data = {
  reportDate: string
  dailyCountdown: { hours: number; minutes: number; passed: boolean }
  dailyLocked: boolean
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string }
  daily: DailyRow[]
  weekly: WeeklyRow[]
}

export function InboxView() {
  const { data, loading, error, reload } = useResource<Data>('/api/inbox')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function forward(kind: 'daily' | 'weekly', id: string) {
    setBusy(id)
    setMsg(null)
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      })
      const json = await res.json().catch(() => ({}))
      setMsg(res.ok ? 'Diteruskan ke tingkat berikutnya.' : json.error || 'Gagal meneruskan')
      if (res.ok) reload()
    } catch {
      setMsg('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingSpinner className="py-10" />
  if (error || !data) return <EmptyState title="Gagal memuat penerimaan" description={error ?? undefined} />

  const dailyPending = data.daily.filter((d) => d.readyToForward).length
  const dailyMissing = data.daily.filter((d) => !d.submittedAt).length
  const weeklyPending = data.weekly.filter((w) => w.readyToForward).length

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Penerimaan &amp; Penerusan
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
            {formatDateLong(new Date(data.reportDate))} · Minggu {data.week.isoWeek}/{data.week.isoYear}
          </p>
        </div>
        <div
          className={`glass rounded-xl px-3 py-2 flex items-center gap-2 ${
            data.dailyLocked ? 'text-rose-600' : 'text-amber-600'
          }`}
        >
          {data.dailyLocked ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Kunci harian</div>
            <div className="text-base font-semibold tabular-nums">
              {data.dailyLocked
                ? 'Sudah 17.00 WIB'
                : `${data.dailyCountdown.hours}j ${data.dailyCountdown.minutes}m lagi`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Siap diteruskan" value={dailyPending + weeklyPending} tone="blue" />
        <Tile label="Belum masuk" value={dailyMissing} tone={dailyMissing > 0 ? 'amber' : 'slate'} />
        <Tile label="Divisi disetujui" value={weeklyPending} tone="violet" />
      </div>

      {msg && (
        <div className="glass rounded-lg p-2.5 text-[13px] text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {msg}
        </div>
      )}

      {/* Daily stream from the PICs */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <FolderKanban className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Laporan Harian dari PIC Proyek
              </CardTitle>
              <CardDescription className="text-sm">
                Teruskan sebelum pukul 17.00 WIB
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.daily.length === 0 ? (
            <EmptyState icon={<Inbox className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada proyek aktif" />
          ) : (
            data.daily.map((d) => (
              <div key={d.projectId} className="glass rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-slate-800 dark:text-slate-100 truncate">{d.name}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono">{d.code}</span>
                    {d.picName && <span>· PIC {d.picName}</span>}
                    {d.submittedAt && <span>· dikirim {formatTime(new Date(d.submittedAt))}</span>}
                    <span className={d.evidenceCount > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                      · {d.evidenceCount} bukti
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.status ? <DailyStatusBadge status={d.status} /> : null}
                  {d.forwardedAt ? (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] h-5">Diteruskan</Badge>
                  ) : d.readyToForward ? (
                    <Button
                      size="sm"
                      className="h-7 text-[13px] bg-gradient-to-r from-blue-600 to-blue-500 text-white"
                      disabled={busy === d.reportId}
                      onClick={() => d.reportId && forward('daily', d.reportId)}
                    >
                      {busy === d.reportId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                      Teruskan
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[11px] h-5 text-amber-700 dark:text-amber-300 border-amber-500/40">
                      {d.reportId ? 'Draft PIC' : 'Belum masuk'}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Weekly stream from the heads of division */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Users className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Capaian Mingguan dari Kepala Divisi
              </CardTitle>
              <CardDescription className="text-sm">
                Diserahkan paling lambat Kamis, dikunci Jumat 17.00 WIB
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.weekly.length === 0 ? (
            <EmptyState icon={<Inbox className="h-5 w-5 text-slate-400 dark:text-slate-500" />} title="Tidak ada divisi" />
          ) : (
            data.weekly.map((w) => (
              <div key={w.divisionId} className="glass rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-slate-800 dark:text-slate-100 truncate">{w.name}</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    {w.headName && <span>Kadiv {w.headName}</span>}
                    <span>· {w.itemCount} item</span>
                    {w.approvedAt && <span>· disetujui</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {w.statusHeader ? <WeeklyHeaderBadge status={w.statusHeader} /> : null}
                  {w.forwardedAt ? (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] h-5">Diteruskan</Badge>
                  ) : w.readyToForward ? (
                    <Button
                      size="sm"
                      className="h-7 text-[13px] bg-gradient-to-r from-violet-600 to-violet-500 text-white"
                      disabled={busy === w.reportId}
                      onClick={() => w.reportId && forward('weekly', w.reportId)}
                    >
                      {busy === w.reportId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                      Teruskan
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[11px] h-5 text-amber-700 dark:text-amber-300 border-amber-500/40">
                      Menunggu kadiv
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    violet: 'text-violet-600',
    slate: 'text-slate-400 dark:text-slate-500',
  }
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-tight">{label}</div>
      <div className={`text-2xl font-bold ${colors[tone] ?? 'text-slate-700 dark:text-slate-200'}`}>{value}</div>
    </div>
  )
}
