'use client'

import { useFetch } from '@/hooks/use-fetch'
import { LoadingSpinner, EmptyState } from '@/components/loading-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import {
  Activity, AlertTriangle, Bell, Database, KeyRound, Lock, ServerCog, ShieldCheck, Users,
} from 'lucide-react'

type Data = {
  access: {
    byRole: { role: string; count: number; capabilities: number }[]
    inactiveUsers: number
    noPassword: number
    users: {
      id: string
      name: string
      email: string
      role: string
      lastLoginAt: string | null
      hasPassword: boolean
      scopeEntityId: string | null
    }[]
  }
  locking: {
    dailyCutoff: string
    dailyLocked: boolean
    dailyCountdown: { hours: number; minutes: number; passed: boolean }
    lockedToday: number
    weeklyHandoverBy: string
    weeklyLockAt: string
    pendingUnlocks: number
  }
  notifications: { sent: number; failed: number }
  data: {
    entities: number
    projects: number
    divisions: number
    dailyReports: number
    weeklyReports: number
    evidence: number
    auditLogs: number
  }
  recentAudit: {
    id: string
    action: string
    at: string
    actorName: string
    actorRole: string | null
    targetType: string
  }[]
}

export function SystemView() {
  const { data, loading, error } = useFetch<Data>('/api/system')

  if (loading) return <LoadingSpinner className="py-10" />
  if (error || !data) return <EmptyState title="Gagal memuat konsol sistem" description={error ?? undefined} />

  const health = data.notifications.failed === 0 && data.access.noPassword === 0

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sistem &amp; Akses</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-0.5">
          Ketersediaan sistem, hak akses, penguncian, dan notifikasi
        </p>
      </div>

      <div
        className={`glass rounded-xl p-3 flex items-center gap-3 ${
          health ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
        }`}
      >
        {health ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        <div>
          <div className="text-base font-semibold">
            {health ? 'Sistem sehat' : 'Perlu perhatian'}
          </div>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">
            {data.notifications.failed} notifikasi gagal · {data.access.noPassword} akun tanpa kata sandi ·{' '}
            {data.locking.pendingUnlocks} permohonan buka kunci tertunda
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Users} label="Akun aktif" value={data.access.byRole.reduce((s, r) => s + r.count, 0)} sub={`${data.access.inactiveUsers} nonaktif`} />
        <Stat icon={Lock} label="Terkunci hari ini" value={data.locking.lockedToday} sub={data.locking.dailyCutoff} />
        <Stat icon={Bell} label="Notifikasi terkirim" value={data.notifications.sent} sub={`${data.notifications.failed} gagal`} />
        <Stat icon={Database} label="Jejak audit" value={data.data.auditLogs} sub="baris tercatat" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-600" />
              <div>
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Hak Akses per Peran</CardTitle>
                <CardDescription className="text-sm">Jumlah akun dan kewenangan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.access.byRole.map((r) => (
              <div key={r.role} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{ROLE_LABELS[r.role] ?? r.role}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] h-4 px-1.5">
                    {r.capabilities} kewenangan
                  </Badge>
                  <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100 w-8 text-right">{r.count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-rose-600" />
              <div>
                <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Mekanisme Penguncian</CardTitle>
                <CardDescription className="text-sm">Jadwal kunci harian dan mingguan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Kunci harian" value={`${data.locking.dailyCutoff} — ${data.locking.dailyLocked ? 'sudah terkunci' : `${data.locking.dailyCountdown.hours}j ${data.locking.dailyCountdown.minutes}m lagi`}`} />
            <Row label="Serah terima mingguan" value={formatDateTime(new Date(data.locking.weeklyHandoverBy))} />
            <Row label="Kunci mingguan" value={formatDateTime(new Date(data.locking.weeklyLockAt))} />
            <Row label="Buka kunci tertunda" value={String(data.locking.pendingUnlocks)} />
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Volume Data</CardTitle>
              <CardDescription className="text-sm">Isi basis data saat ini</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
            {[
              ['Entitas', data.data.entities],
              ['Divisi', data.data.divisions],
              ['Proyek', data.data.projects],
              ['Lap. harian', data.data.dailyReports],
              ['Lap. mingguan', data.data.weeklyReports],
              ['Bukti', data.data.evidence],
              ['Audit', data.data.auditLogs],
            ].map(([label, value]) => (
              <div key={label as string} className="glass rounded-lg p-2">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value as number}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label as string}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Aktivitas Terakhir</CardTitle>
              <CardDescription className="text-sm">10 entri audit terbaru</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {data.recentAudit.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-[13px] glass rounded-lg px-2.5 py-1.5">
              <Badge variant="outline" className="text-[11px] h-4 px-1 font-mono">{a.action}</Badge>
              <span className="text-slate-700 dark:text-slate-200">{a.actorName}</span>
              {a.actorRole && <span className="text-slate-500 dark:text-slate-400">({ROLE_LABELS[a.actorRole] ?? a.actorRole})</span>}
              <span className="ml-auto text-slate-500 dark:text-slate-400 tabular-nums">{formatDateTime(new Date(a.at))}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <div>
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">Akun</CardTitle>
              <CardDescription className="text-sm">25 akun terakhir aktif</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-[13px] min-w-[520px]">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 text-left">
                  <th className="py-1.5 font-medium">Nama</th>
                  <th className="py-1.5 font-medium">Peran</th>
                  <th className="py-1.5 font-medium">Kata sandi</th>
                  <th className="py-1.5 font-medium">Login terakhir</th>
                </tr>
              </thead>
              <tbody>
                {data.access.users.map((u) => (
                  <tr key={u.id} className="border-t border-white/40 dark:border-white/10">
                    <td className="py-1.5">
                      <div className="text-slate-800 dark:text-slate-100">{u.name}</div>
                      <div className="text-slate-500 dark:text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">{ROLE_LABELS[u.role] ?? u.role}</td>
                    <td className="py-1.5">
                      {u.hasPassword ? (
                        <span className="text-emerald-600">aktif</span>
                      ) : (
                        <span className="text-rose-600">belum diset</span>
                      )}
                    </td>
                    <td className="py-1.5 text-slate-500 dark:text-slate-400 tabular-nums">
                      {u.lastLoginAt ? formatDateTime(new Date(u.lastLoginAt)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users
  label: string
  value: number
  sub: string
}) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-tight">{label}</div>
        <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
      </div>
      <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">{value}</div>
      <div className="text-[13px] text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-medium text-right">{value}</span>
    </div>
  )
}
