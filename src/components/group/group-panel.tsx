'use client'

/**
 * [F2-GRUP] Bagian khusus peran grup di Ringkasan (di bawah layar Manajemen):
 *
 *  - Direksi holding SDM & GA (06): kepatuhan lintas PT, beban kerja PIC,
 *    izin/cuti hari ini & keputusan cuti, laporan mingguan menunggu dibaca,
 *    buka kunci yang menunggu persetujuannya.
 *  - Tim TI & Super Admin (07): satu kartu ringkas status teknis yang membuka
 *    tab Sistem & akses — kalimat jawaban di atas tetap jawaban bisnis.
 *  - Auditor (08): laporan terlambat, ringkasan jejak audit, buka kunci yang
 *    dijalankan, unduh log — tanpa satu pun tombol yang mengubah data.
 *
 * Data dari /api/system/grup; setiap kartu gagal sendiri tanpa menjatuhkan layar.
 */

import { useApp } from '@/components/app-provider'
import { Button, Card, ErrorNote, Skeleton, StatusBadge, type Status } from '@/components/mk'
import { useFetch } from '@/components/admin/use-fetch'
import type { RingkasanData } from '@/components/oversight/types'
import { formatNumber, formatRelative } from '@/lib/format'
import { groupPanelKind, type GroupPanelData, type TeknisPanel } from '@/lib/group-panel'
import { SdmPanel } from './sdm-panel'
import { AuditPanel } from './audit-panel'

export function GroupRolePanel({ data }: { data: RingkasanData }) {
  const { user } = useApp()
  const kind = groupPanelKind(user.role)
  const panel = useFetch<GroupPanelData>(kind ? '/api/system/grup' : null)
  if (!kind) return null

  if (panel.loading && !panel.data) {
    return (
      <div className="mk-row" aria-busy="true" aria-label="Memuat panel peran">
        <Card className="is-wide">
          <Skeleton h={180} />
        </Card>
        <Card className="is-narrow">
          <Skeleton h={180} />
        </Card>
      </div>
    )
  }
  if (panel.error || !panel.data) {
    return (
      <Card title={kind === 'SDM' ? 'Kepatuhan lintas perusahaan' : kind === 'AUDIT' ? 'Jejak audit' : 'Sistem & akses'}>
        <ErrorNote message={panel.error ?? undefined} onRetry={panel.reload} />
      </Card>
    )
  }

  const d = panel.data
  if (d.kind === 'SDM') return <SdmPanel panel={d} ringkasan={data} />
  if (d.kind === 'AUDIT') return <AuditPanel panel={d} />
  return <TechnicalStrip panel={d} />
}

/** Ringkas status teknis untuk TI & Super Admin; rinciannya di tab Sistem & akses. */
function TechnicalStrip({ panel }: { panel: TeknisPanel }) {
  const { setActiveTab } = useApp()
  const lateJobs = panel.cron.filter((c) => c.health === 'late')
  const neverRan = panel.cron.filter((c) => c.health === 'neutral')
  const unlockWaiting = panel.unlocks.waitingApproval + panel.unlocks.waitingExecution
  const rows: { label: string; text: string; status: Status; badge: string }[] = [
    {
      label: 'Buka kunci',
      text: unlockWaiting
        ? `${formatNumber(panel.unlocks.waitingApproval)} menunggu persetujuan, ${formatNumber(panel.unlocks.waitingExecution)} menunggu dibuka`
        : panel.unlocks.activeNow
          ? `${formatNumber(panel.unlocks.activeNow)} laporan sedang terbuka`
          : 'Tidak ada pengajuan',
      status: panel.unlocks.waitingExecution ? 'risk' : unlockWaiting ? 'info' : 'on',
      badge: unlockWaiting ? `${formatNumber(unlockWaiting)} menunggu` : 'Beres',
    },
    {
      label: 'Proses otomatis',
      text: lateJobs.length
        ? `${lateJobs.map((c) => c.label).join(', ')} terakhir berjalan ${formatRelative(lateJobs[0].lastAt).toLowerCase()}`
        : neverRan.length === panel.cron.length
          ? 'Belum ada catatan proses otomatis'
          : `Terakhir ${formatRelative(latest(panel.cron.map((c) => c.lastAt))).toLowerCase()}`,
      status: lateJobs.length ? 'late' : neverRan.length ? 'neutral' : 'on',
      badge: lateJobs.length ? `${lateJobs.length} terlambat` : neverRan.length === panel.cron.length ? 'Belum tercatat' : 'Berjalan',
    },
    {
      label: 'Akun',
      text: [
        panel.accounts.mustChange !== null ? `${formatNumber(panel.accounts.mustChange)} wajib ganti kata sandi` : null,
        `${formatNumber(panel.accounts.neverLoggedIn)} belum pernah masuk`,
        panel.accounts.noPassword ? `${formatNumber(panel.accounts.noPassword)} tanpa kata sandi` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      status: panel.accounts.noPassword ? 'risk' : 'on',
      badge: `${formatNumber(panel.accounts.active)} aktif`,
    },
    {
      label: 'Permintaan akses',
      text: panel.accessPending === null ? 'Tabel permintaan akses belum dimigrasi' : panel.accessPending ? 'Menunggu keputusan Anda' : 'Tidak ada yang menunggu',
      status: panel.accessPending ? 'info' : panel.accessPending === null ? 'neutral' : 'on',
      badge: panel.accessPending ? `${formatNumber(panel.accessPending)} menunggu` : panel.accessPending === null ? 'Belum tersedia' : 'Beres',
    },
  ]
  const attention = rows.filter((r) => r.status === 'late' || r.status === 'risk').length

  return (
    <Card
      title="Sistem & akses"
      subtitle={attention ? `${attention} hal teknis perlu ditangani` : 'Kunci, pengingat, dan akun berjalan normal'}
      action={
        <Button size="sm" variant="primary" iconAfter="kanan" onClick={() => setActiveTab('system')}>
          Buka Sistem & akses
        </Button>
      }
    >
      <div className="mk-list">
        {rows.map((r) => (
          <div key={r.label} className="mk-listrow flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="t-body-strong">{r.label}</div>
              <div className="t-footnote text-ink-2">{r.text}</div>
            </div>
            <StatusBadge status={r.status} size="sm">
              {r.badge}
            </StatusBadge>
          </div>
        ))}
      </div>
      {panel.notifications.failed7d > 0 ? (
        <p className="t-footnote text-ink-2 mt-3">{formatNumber(panel.notifications.failed7d)} notifikasi gagal terkirim dalam 7 hari terakhir.</p>
      ) : null}
    </Card>
  )
}

function latest(dates: (string | null)[]): string | null {
  return dates.filter((d): d is string => !!d).sort().at(-1) ?? null
}
