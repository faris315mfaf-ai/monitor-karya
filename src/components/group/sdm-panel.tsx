'use client'

/**
 * [F2-GRUP] Direksi holding SDM & GA (06-direktur-sdm-ga.md): "Apakah semua PT
 * dan divisi melapor tepat waktu? Pengajuan apa yang menunggu saya?"
 *
 * Kartu: kepatuhan per perusahaan (Sheet detail + Ingatkan divisi), beban kerja
 * PIC, laporan mingguan menunggu dibaca (Sheet laporan + Tandai sudah dibaca),
 * izin/cuti hari ini (keputusan cuti ada di kartu "Persetujuan menunggu" milik
 * [F2-DIREKTUR]; di sini hanya jumlah dan pintasannya), lalu buka kunci
 * (hak unlock:approve).
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { Avatar, Button, Card, EmptyNote, Sheet, StatusBadge, useIsPhone, type Status } from '@/components/mk'
import { UnlockCard } from '@/components/admin/unlock-card'
import { WeeklyReportSheet, useWeeklyActions } from '@/components/oversight/weekly-reports'
import { WEEKLY_BADGE, pct, type DivisionSummary, type RingkasanData } from '@/components/oversight/types'
import { can } from '@/lib/rbac'
import { formatDateShort, formatNumber, formatRelative, initials } from '@/lib/format'
import { WORKLOAD_LABEL, entityCompliance, type SdmPanel as SdmData } from '@/lib/group-panel'

type EntityRow = SdmData['entities'][number]

const AWAY_LABEL: Record<string, string> = { CUTI: 'Cuti', SAKIT: 'Sakit', IZIN: 'Izin' }

export function SdmPanel({ panel, ringkasan }: { panel: SdmData; ringkasan: RingkasanData }) {
  const { user, setActiveTab } = useApp()
  const phone = useIsPhone()
  const [open, setOpen] = useState<EntityRow | null>(null)
  const [report, setReport] = useState<DivisionSummary | null>(null)
  const weekKey = `${panel.week.isoYear}-W${String(panel.week.isoWeek).padStart(2, '0')}`
  const weekly = useWeeklyActions((d) => d.entityId, ringkasan.reportWeek ? `${ringkasan.reportWeek.isoYear}-W${String(ringkasan.reportWeek.isoWeek).padStart(2, '0')}` : undefined)
  const viewer = ringkasan.viewer ?? { canRemind: false, canMarkRead: false, canDecideDeadline: false }
  const weekLabel = ringkasan.reportWeek?.label ?? panel.week.label

  const rows = useMemo(
    () =>
      panel.entities
        .map((e) => ({ e, v: entityCompliance(e) }))
        .sort((a, b) => rank(a.v.status) - rank(b.v.status) || a.e.name.localeCompare(b.e.name, 'id')),
    [panel.entities]
  )
  const lagging = rows.filter((r) => r.v.status === 'late' || r.v.status === 'risk').length

  // Laporan mingguan: yang sudah masuk tapi belum saya baca dulu, lalu yang belum masuk.
  const divisions = ringkasan.divisions ?? []
  const unread = divisions.filter((d) => weekly.stateOf(d) === 'sent' || weekly.stateOf(d) === 'late')
  const missing = divisions.filter((d) => weekly.stateOf(d) === 'missing')
  // Keputusan cuti: ApprovalRequest CUTI di /api/ringkasan ([F2-DIREKTUR]), diputuskan di kartu Persetujuan menunggu.
  const pendingLeave = (ringkasan.approvalRequests ?? []).filter((r) => r.type === 'CUTI')

  return (
    <>
      <div className="mk-row">
        <Card
          className="is-wide"
          title="Kepatuhan pelaporan per perusahaan"
          subtitle={
            rows.length === 0
              ? 'Belum ada perusahaan yang melapor'
              : lagging
                ? `${lagging} dari ${rows.length} perusahaan perlu dikejar · laporan mingguan ${panel.week.label}`
                : `Semua ${rows.length} perusahaan patuh · laporan mingguan ${panel.week.label}`
          }
        >
          {rows.length === 0 ? (
            <EmptyNote icon="gedung">Belum ada perusahaan dengan proyek atau divisi aktif.</EmptyNote>
          ) : phone ? (
            <div className="mk-list">
              {rows.map(({ e, v }) => (
                <button key={e.id} type="button" className="mk-listrow w-full text-left min-h-11 cursor-pointer" onClick={() => setOpen(e)}>
                  <span className="min-w-0 flex-1">
                    <span className="block t-body-strong truncate">{e.name}</span>
                    <span className="block t-footnote text-ink-2">
                      Harian {formatNumber(e.reportedToday)}/{formatNumber(e.activeProjects)} · mingguan {formatNumber(e.weeklyIn)}/{formatNumber(e.divisions)}
                    </span>
                  </span>
                  <StatusBadge status={v.status} size="sm">
                    {v.status === 'on' ? 'Patuh' : v.status === 'neutral' ? 'Belum ada data' : v.status === 'late' ? 'Terlambat' : 'Perlu perhatian'}
                  </StatusBadge>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="mk-adm-table mk-grup-compliance">
                <thead>
                  <tr>
                    <th scope="col">Perusahaan</th>
                    <th scope="col">Harian hari ini</th>
                    <th scope="col">Tepat waktu 30 hari</th>
                    <th scope="col">Mingguan {panel.week.label}</th>
                    <th scope="col">Hadir</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ e, v }) => (
                    <tr key={e.id}>
                      <td>
                        <button type="button" className="text-left min-h-11 cursor-pointer" onClick={() => setOpen(e)} aria-label={`Buka rincian ${e.name}`}>
                          <span className="block t-body-strong">{e.name}</span>
                          <span className="block t-footnote text-ink-2">{e.code}</span>
                        </button>
                      </td>
                      <td className="mk-adm-num">
                        {formatNumber(e.reportedToday)} dari {formatNumber(e.activeProjects)}
                      </td>
                      <td className="mk-adm-num">{e.total30 ? `${pct(e.onTime30, e.total30)}%` : '—'}</td>
                      <td className="mk-adm-num">
                        {formatNumber(e.weeklyIn)} dari {formatNumber(e.divisions)}
                      </td>
                      <td className="mk-adm-num">{e.away === null ? '—' : `${pct(e.people - e.away, e.people)}%`}</td>
                      <td>
                        <StatusBadge status={v.status} size="sm">
                          {v.label}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          className="is-narrow"
          title="Beban kerja PIC"
          subtitle={
            panel.workloadSummary.pics
              ? `${formatNumber(panel.workloadSummary.pics)} PIC · rata-rata ${String(panel.workloadSummary.avgProjects).replace('.', ',')} proyek · ${formatNumber(panel.workloadSummary.overloaded)} beban tinggi`
              : 'Belum ada PIC dengan proyek aktif'
          }
        >
          {panel.workload.length === 0 ? (
            <EmptyNote icon="pengguna">Belum ada proyek aktif yang punya PIC.</EmptyNote>
          ) : (
            <div className="mk-list">
              {panel.workload.map((w) => (
                <div key={w.id} className="mk-listrow">
                  <Avatar initials={initials(w.name)} size={32} name={w.name} />
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate">{w.name}</div>
                    <div className="t-footnote text-ink-2">
                      {formatNumber(w.activeProjects)} proyek · {formatNumber(w.openTasks)} tugas terbuka
                      {w.blockedTasks ? ` · ${formatNumber(w.blockedTasks)} terkendala` : ''}
                      {w.entityCode ? ` · ${w.entityCode}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={w.level} size="sm">
                    {WORKLOAD_LABEL[w.level]}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mk-row">
        <Card
          className="is-half"
          title={`Laporan mingguan menunggu dibaca · ${weekLabel}`}
          subtitle={
            divisions.length === 0
              ? 'Belum ada divisi aktif'
              : `${formatNumber(unread.length)} belum Anda baca · ${formatNumber(missing.length)} belum masuk`
          }
          action={
            missing.length > 0 && viewer.canRemind ? (
              <Button size="sm" variant="secondary" onClick={() => setActiveTab('divisions')}>
                Lihat divisi
              </Button>
            ) : undefined
          }
        >
          {unread.length === 0 ? (
            <EmptyNote done>{divisions.length ? 'Semua laporan yang masuk sudah Anda baca.' : 'Belum ada laporan mingguan.'}</EmptyNote>
          ) : (
            <div className="mk-list">
              {unread.slice(0, 6).map((d) => {
                const badge = WEEKLY_BADGE[weekly.stateOf(d)]
                return (
                  <div key={d.id} className="mk-listrow flex-wrap">
                    <button type="button" className="min-w-0 flex-1 text-left min-h-11 cursor-pointer" onClick={() => setReport(d)}>
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="t-body-strong">Divisi {d.name}</span>
                        <StatusBadge status={badge.status} size="sm">
                          {badge.label}
                        </StatusBadge>
                      </span>
                      <span className="block t-footnote text-ink-2 truncate">
                        {d.entityCode} · {d.weekly.submittedBy ?? d.head?.name ?? 'Kepala divisi'} · {formatRelative(d.weekly.submittedAt).toLowerCase()}
                      </span>
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => setReport(d)}>
                      Baca laporan
                    </Button>
                  </div>
                )
              })}
              {unread.length > 6 ? (
                <p className="t-footnote text-ink-2 pt-2">{formatNumber(unread.length - 6)} laporan lain menunggu di modul Divisi.</p>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          className="is-half"
          title="Izin, sakit, dan cuti hari ini"
          subtitle={
            panel.awayToday === null
              ? 'Data kehadiran belum tersedia'
              : panel.awayToday.length
                ? `${formatNumber(panel.awayToday.length)} orang tidak hadir`
                : 'Semua orang hadir'
          }
        >
          {panel.awayToday === null ? (
            <EmptyNote icon="kehadiran">Data kehadiran belum tersedia. Migrasi kehadiran perlu diterapkan.</EmptyNote>
          ) : panel.awayToday.length === 0 ? (
            <EmptyNote done>Tidak ada yang izin, sakit, atau cuti hari ini.</EmptyNote>
          ) : (
            <div className="mk-list">
              {panel.awayToday.slice(0, 6).map((a) => (
                <div key={a.id} className="mk-listrow">
                  <Avatar initials={initials(a.name)} size={32} name={a.name} />
                  <div className="min-w-0 flex-1">
                    <div className="t-body-strong truncate">{a.name}</div>
                    <div className="t-footnote text-ink-2 truncate">{[a.entityCode, a.note].filter(Boolean).join(' · ') || 'Tanpa catatan'}</div>
                  </div>
                  <StatusBadge status="info" size="sm">
                    {AWAY_LABEL[a.status] ?? a.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
          {pendingLeave.length > 0 ? (
            <div className="mk-inset mt-4 flex items-center justify-between gap-3 flex-wrap">
              <span className="t-callout text-ink">{formatNumber(pendingLeave.length)} pengajuan cuti menunggu keputusan Anda</span>
              <Button size="sm" variant="secondary" onClick={() => document.getElementById('mk-persetujuan')?.scrollIntoView({ block: 'start' })}>
                Tinjau pengajuan cuti
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      {can(user.role, 'unlock:approve') ? <UnlockCard limit={5} /> : null}

      <EntitySheet
        row={open}
        weekKey={weekKey}
        weekLabel={panel.week.label}
        canRemind={can(user.role, 'notify:remind')}
        onClose={() => setOpen(null)}
        onOpenModule={() => {
          setOpen(null)
          setActiveTab('entities')
        }}
      />
      <WeeklyReportSheet division={report} weekLabel={weekLabel} viewer={viewer} actions={weekly} onClose={() => setReport(null)} />
    </>
  )
}

function rank(s: Status): number {
  return s === 'late' ? 0 : s === 'risk' ? 1 : s === 'on' ? 2 : 3
}

/** Rincian satu perusahaan: angka kepatuhan, lalu tagih divisi yang belum menyerahkan. */
function EntitySheet({
  row,
  weekKey,
  weekLabel,
  canRemind,
  onClose,
  onOpenModule,
}: {
  row: EntityRow | null
  weekKey: string
  weekLabel: string
  canRemind: boolean
  onClose: () => void
  onOpenModule: () => void
}) {
  const [last, setLast] = useState<EntityRow | null>(row)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  if (row && row !== last) setLast(row)
  const e = row ?? last
  const v = e ? entityCompliance(e) : null
  const missing = e ? Math.max(0, e.divisions - e.weeklyIn) : 0

  async function remind() {
    if (!e) return
    setBusy(true)
    try {
      const res = await fetch('/api/notifications/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: e.id, week: weekKey }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; sent?: number }
      if (!res.ok) {
        toast.error(j.error ?? 'Pengingat belum terkirim. Coba lagi.')
        return
      }
      setSent((s) => ({ ...s, [e.id]: true }))
      toast.success(
        j.sent ? `Pengingat terkirim ke ${formatNumber(j.sent)} kepala divisi di ${e.name}.` : `Semua kepala divisi ${e.name} sudah diingatkan hari ini.`
      )
    } catch {
      toast.error('Server tidak terjangkau. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  const facts: [string, string][] = e
    ? [
        ['Proyek aktif', formatNumber(e.activeProjects)],
        ['Laporan harian hari ini', `${formatNumber(e.reportedToday)} dari ${formatNumber(e.activeProjects)} proyek`],
        ['Tepat waktu 30 hari', e.total30 ? `${pct(e.onTime30, e.total30)}% · ${formatNumber(e.onTime30)} dari ${formatNumber(e.total30)}` : 'Belum ada laporan'],
        [`Laporan mingguan ${weekLabel}`, `${formatNumber(e.weeklyIn)} dari ${formatNumber(e.divisions)} divisi${e.weeklyLate ? ` · ${formatNumber(e.weeklyLate)} terlambat` : ''}`],
        ['Kehadiran hari ini', e.away === null ? 'Belum tersedia' : `${formatNumber(e.people - e.away)} dari ${formatNumber(e.people)} orang`],
        ['Eskalasi terbuka', formatNumber(e.openEscalations)],
        ['Keterlambatan tercatat 30 hari', formatNumber(e.lateIncidents30)],
      ]
    : []

  return (
    <Sheet
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title={e?.name ?? 'Perusahaan'}
      subtitle={e ? `${e.code} · per ${formatDateShort(new Date())}` : undefined}
      backLabel="Ringkasan"
      footer={
        e ? (
          <>
            <Button variant="secondary" onClick={onOpenModule}>
              Buka modul entitas
            </Button>
            {canRemind && missing > 0 ? (
              <Button variant="primary" icon="notifikasi" disabled={busy || sent[e.id]} onClick={remind}>
                {sent[e.id] ? 'Pengingat terkirim' : `Ingatkan ${missing} divisi`}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {e && v ? (
        <div className="flex flex-col gap-4">
          <StatusBadge status={v.status}>{v.label}</StatusBadge>
          <div className="mk-list">
            {facts.map(([k, val]) => (
              <div key={k} className="mk-listrow justify-between">
                <span className="t-body text-ink-2">{k}</span>
                <span className="t-body-strong text-ink text-right mk-adm-num">{val}</span>
              </div>
            ))}
          </div>
          {missing > 0 ? (
            <p className="t-footnote text-ink-2">
              Pengingat dikirim ke kepala divisi yang belum menyerahkan laporan {weekLabel}, paling banyak sekali sehari per divisi.
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}
