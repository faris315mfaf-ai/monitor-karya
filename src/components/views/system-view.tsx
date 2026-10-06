'use client'

/**
 * Konsol Sistem & akses — Tim TI dan Super Admin (docs/design/peran/07-ti.md).
 * "Ada permintaan buka kunci atau masalah akses yang harus saya eksekusi?
 *  Proses otomatis (kunci 17.00, pengingat) berjalan?"
 *
 * [F2-GRUP] Urutan: kalimat kesehatan + 4 KPI → antrean (buka kunci, permintaan
 * akses) → proses otomatis & penguncian → pengingat per perusahaan → akun &
 * hak akses → volume data & aktivitas. Di ponsel cukup terbaca: tanpa tabel,
 * tanpa aksi massal.
 */

import { useFetch } from '@/hooks/use-fetch'
import { Card, DashboardSkeleton, EmptyNote, ErrorNote, Hero, PageHeader, StatTile, StatusBadge, type Status } from '@/components/mk'
import { ActionTag } from '@/components/views/audit-view'
import { UnlockCard } from '@/components/admin/unlock-card'
import { AccessRequestsCard } from '@/components/admin/access-requests-card'
import { ReminderMatrixCard } from '@/components/group/reminder-matrix'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import type { CronHealth, ReminderMatrixRow, TechnicalStatus } from '@/lib/group-panel'

type Data = {
  /** [F2-GRUP] opsional agar respons lama tetap terbaca. */
  technical?: TechnicalStatus
  reminders?: ReminderMatrixRow[] | null
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

const CRON_BADGE: Record<CronHealth, { status: Status; label: string }> = {
  on: { status: 'on', label: 'Berjalan' },
  late: { status: 'late', label: 'Terlambat' },
  neutral: { status: 'neutral', label: 'Belum tercatat' },
}

/** Konsol TI / Super Admin: kesehatan sistem, hak akses, penguncian, notifikasi. */
export function SystemView() {
  const { data, loading, error, reload } = useFetch<Data>('/api/system')

  if (loading && !data) return <DashboardSkeleton />
  if (error || !data) {
    return (
      <>
        <PageHeader context="Ketersediaan, hak akses, penguncian, dan notifikasi" title="Sistem & akses" />
        <Card>
          <ErrorNote message={error ?? 'Konsol sistem belum termuat.'} onRetry={reload} />
        </Card>
      </>
    )
  }

  const t = data.technical
  const lateJobs = t?.cron.filter((c) => c.health === 'late') ?? []
  const failed = t ? t.notifications.failed7d : data.notifications.failed
  const unlockWaiting = t ? t.unlocks.waitingApproval + t.unlocks.waitingExecution : data.locking.pendingUnlocks
  const issues = [
    lateJobs.length ? `${lateJobs.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join(' dan ')} terlambat berjalan` : null,
    failed > 0 ? `${formatNumber(failed)} notifikasi gagal terkirim` : null,
    data.access.noPassword > 0 ? `${formatNumber(data.access.noPassword)} akun belum punya kata sandi` : null,
    t && t.unlocks.waitingExecution > 0 ? `${formatNumber(t.unlocks.waitingExecution)} buka kunci menunggu dibuka` : null,
  ].filter(Boolean) as string[]
  const health = issues.length === 0
  const activeAccounts = data.access.byRole.reduce((s, r) => s + r.count, 0)
  const jobsOk = t ? t.cron.filter((c) => c.health === 'on').length : 0

  return (
    <>
      <PageHeader context="Ketersediaan, hak akses, penguncian, dan notifikasi" title="Sistem & akses" />

      <Hero
        eyebrow="Kesehatan sistem"
        actions={health ? <StatusBadge status="on">Sistem sehat</StatusBadge> : <StatusBadge status="risk">Perlu perhatian</StatusBadge>}
        answer={health ? 'Sistem sehat, tidak ada yang perlu ditangani.' : `${issues.length} hal perlu ditangani: ${issues.join(', ')}.`}
        support={`Kunci harian ${data.locking.dailyCutoff}, ${data.locking.dailyLocked ? 'hari ini sudah terkunci' : `${data.locking.dailyCountdown.hours} jam ${data.locking.dailyCountdown.minutes} menit lagi`}. ${formatNumber(data.locking.lockedToday)} laporan terkunci hari ini.`}
        kpis={
          <>
            <StatTile label="Akun aktif" value={activeAccounts} delta={`${formatNumber(data.access.inactiveUsers)} nonaktif`} variant="surface" />
            <StatTile
              label="Buka kunci menunggu"
              value={unlockWaiting}
              delta={t ? `${formatNumber(t.unlocks.activeNow)} laporan sedang terbuka` : 'Diajukan atau disetujui'}
              tone={t?.unlocks.waitingExecution ? 'risk' : unlockWaiting ? 'info' : 'on'}
              variant="surface"
              onClick={() => document.getElementById('mk-antrean-sistem')?.scrollIntoView({ block: 'start' })}
            />
            <StatTile
              label="Proses otomatis"
              value={t ? `${jobsOk} dari ${t.cron.length}` : '—'}
              delta={lateJobs.length ? `${lateJobs.length} terlambat` : 'Sesuai jadwal'}
              tone={lateJobs.length ? 'late' : 'on'}
              variant="surface"
            />
            <StatTile
              label="Notifikasi gagal"
              value={failed}
              delta={t ? '7 hari terakhir' : `dari ${formatNumber(data.notifications.sent)} terkirim`}
              tone={failed > 0 ? 'late' : 'on'}
              variant="surface"
            />
          </>
        }
      />

      <div className="mk-row" id="mk-antrean-sistem" tabIndex={-1}>
        <UnlockCard className="is-half" limit={6} />
        <AccessRequestsCard className="is-half" limit={6} />
      </div>

      <div className="mk-row">
        <Card className="is-half" title="Proses otomatis" subtitle="Dijadwalkan di VPS lewat deploy/app-vps/cron.sh">
          {!t ? (
            <EmptyNote icon="waktu">Status proses otomatis belum tersedia.</EmptyNote>
          ) : (
            <div className="mk-list">
              {t.cron.map((c) => (
                <div key={c.job} className="mk-listrow flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong">{c.label}</div>
                    <div className="t-footnote text-ink-2">
                      {c.schedule} · {c.lastAt ? `terakhir ${formatRelative(c.lastAt).toLowerCase()}` : 'belum pernah tercatat'}
                    </div>
                  </div>
                  <StatusBadge status={CRON_BADGE[c.health].status} size="sm">
                    {CRON_BADGE[c.health].label}
                  </StatusBadge>
                </div>
              ))}
              <p className="t-footnote text-ink-2 pt-2">
                Pengingat otomatis hanya tercatat saat ada aturan yang berjalan; kunci 17.00 dihitung dari jam, tanpa proses terjadwal.
              </p>
            </div>
          )}
        </Card>

        <Card className="is-half" title="Mekanisme penguncian" subtitle="Jadwal kunci harian dan mingguan">
          <div className="mk-list">
            <KvRow
              label="Kunci harian"
              value={`${data.locking.dailyCutoff} · ${data.locking.dailyLocked ? 'sudah terkunci' : `${data.locking.dailyCountdown.hours} j ${data.locking.dailyCountdown.minutes} m lagi`}`}
            />
            <KvRow label="Serah terima mingguan" value={formatDateTime(new Date(data.locking.weeklyHandoverBy))} />
            <KvRow label="Kunci mingguan" value={formatDateTime(new Date(data.locking.weeklyLockAt))} />
            <KvRow
              label="Laporan sedang dibuka"
              value={
                t && t.unlocks.activeNow > 0 ? (
                  <StatusBadge status="info" size="sm">{formatNumber(t.unlocks.activeNow)} terbuka</StatusBadge>
                ) : (
                  <StatusBadge status="done" size="sm">Tidak ada</StatusBadge>
                )
              }
            />
          </div>
        </Card>
      </div>

      {data.reminders !== undefined ? <ReminderMatrixCard rows={data.reminders} /> : null}

      <div className="mk-row">
        <Card className="is-half" title="Kesehatan akun" subtitle="Akun yang perlu ditindaklanjuti">
          <div className="mk-list">
            <KvRow label="Akun aktif" value={formatNumber(activeAccounts)} />
            <KvRow label="Nonaktif" value={formatNumber(data.access.inactiveUsers)} />
            <KvRow label="Belum pernah masuk" value={t ? formatNumber(t.accounts.neverLoggedIn) : '—'} />
            <KvRow
              label="Wajib ganti kata sandi"
              value={t?.accounts.mustChange === null || !t ? 'Belum tersedia' : formatNumber(t.accounts.mustChange)}
            />
            <KvRow
              label="Tanpa kata sandi"
              value={
                data.access.noPassword > 0 ? (
                  <StatusBadge status="risk" size="sm">{formatNumber(data.access.noPassword)} akun</StatusBadge>
                ) : (
                  <StatusBadge status="on" size="sm">Tidak ada</StatusBadge>
                )
              }
            />
          </div>
        </Card>

        <Card className="is-half" title="Hak akses per peran" subtitle="Jumlah akun dan kewenangan tiap peran">
          {data.access.byRole.length === 0 ? (
            <EmptyNote icon="kunci">Belum ada akun aktif.</EmptyNote>
          ) : (
            <div className="mk-list">
              {data.access.byRole.map((r) => (
                <div key={r.role} className="mk-listrow">
                  <span className="t-body text-ink flex-1 min-w-0 truncate">{ROLE_LABELS[r.role] ?? r.role}</span>
                  <span className="mk-tag mk-adm-num">{r.capabilities} kewenangan</span>
                  <span className="t-body-strong text-ink mk-adm-num w-10 text-right">{formatNumber(r.count)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Volume data" subtitle="Isi basis data saat ini">
        <div className="mk-adm-vol">
          {(
            [
              ['Entitas', data.data.entities],
              ['Divisi', data.data.divisions],
              ['Proyek', data.data.projects],
              ['Laporan harian', data.data.dailyReports],
              ['Laporan mingguan', data.data.weeklyReports],
              ['Bukti', data.data.evidence],
              ['Jejak audit', data.data.auditLogs],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="mk-adm-vol__cell">
              <span className="mk-adm-vol__num">{formatNumber(value)}</span>
              <span className="mk-adm-vol__label">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mk-row">
        <Card className="is-half" title="Aktivitas terakhir" subtitle="10 entri log terbaru">
          {data.recentAudit.length === 0 ? (
            <EmptyNote icon="aktivitas">Belum ada aktivitas tercatat.</EmptyNote>
          ) : (
            <div className="mk-list">
              {data.recentAudit.map((a) => (
                <div key={a.id} className="mk-adm-row">
                  <div className="mk-adm-row__body">
                    <span className="mk-adm-row__title">{a.actorName}</span>
                    <span className="mk-adm-row__meta mk-adm-num">
                      {a.actorRole ? `${ROLE_LABELS[a.actorRole] ?? a.actorRole} · ` : ''}
                      {formatDateTime(new Date(a.at))}
                    </span>
                  </div>
                  <ActionTag action={a.action} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="is-half" title="Akun" subtitle="25 akun terakhir aktif">
          {data.access.users.length === 0 ? (
            <EmptyNote icon="pengguna">Belum ada akun.</EmptyNote>
          ) : (
            <div className="mk-list">
              {data.access.users.map((u) => (
                <div key={u.id} className="mk-adm-row">
                  <div className="mk-adm-row__body">
                    <span className="mk-adm-row__title">{u.name}</span>
                    <span className="mk-adm-row__meta">
                      {ROLE_LABELS[u.role] ?? u.role} · {u.email}
                    </span>
                    <span className="mk-adm-row__meta mk-adm-num">
                      {u.lastLoginAt ? `Masuk terakhir ${formatDateTime(new Date(u.lastLoginAt))}` : 'Belum pernah masuk'}
                    </span>
                  </div>
                  {u.hasPassword ? (
                    <StatusBadge status="on" size="sm">Kata sandi aktif</StatusBadge>
                  ) : (
                    <StatusBadge status="risk" size="sm">Belum ada kata sandi</StatusBadge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mk-listrow justify-between">
      <span className="t-body text-ink-2">{label}</span>
      <span className="t-body-strong text-ink text-right mk-adm-num">{value}</span>
    </div>
  )
}
