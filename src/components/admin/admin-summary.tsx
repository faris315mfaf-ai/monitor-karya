'use client'

/**
 * Ringkasan Admin PT [F2-ADMIN] (04-admin-pt.md, urutan desktop):
 *  3. Hero — "x% laporan harian sudah masuk hari ini", tombol "Kirim pengingat
 *     ke semua", cincin harian/mingguan/akun aktif, 4 KPI.
 *  4. Kepatuhan laporan per divisi (Harian/Mingguan) → Sheet divisi.
 *  5. Riwayat kepatuhan harian (peta panas) + Pengguna per peran.
 *  6. Permintaan akses + Pengingat otomatis.
 *  7. Perlu perhatian (penerusan & eskalasi) + Kepatuhan perusahaan, Data induk.
 *  8. Log aktivitas + "Unduh log".
 *
 * Angka per orang dari /api/admin/compliance; angka per proyek (penerusan,
 * eskalasi, skor bulanan) dari /api/my-dashboard (`AdminData`).
 * Dipanggil oleh AdminDashboard di src/components/views/role-dashboards.tsx.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import { ActivityRings, AttentionItem, Button, Card, DivisionBar, EmptyNote, Hero, StatTile } from '@/components/mk'
import { DashHeader } from '@/components/views/dash-common'
import type { AdminData } from '@/components/views/role-dashboards'
import { DAILY_CUTOFF_LABEL } from '@/lib/lock'
import { formatPercent } from '@/lib/format'
import { pctOf } from '@/lib/admin-compliance'
import { AccessRequestsCard } from './access-requests-card'
import { ReminderRulesCard } from './reminder-rules-card'
import { MasterDataCard, UsersByRoleCard, useAdminOverview } from './master-data'
import { ActivityLogCard } from './activity-log'
import { ComplianceCard, ComplianceHeatmapCard, sendReminder, useCompliance } from './compliance'

function scrollToCard(title: string) {
  const el = document.querySelector(`section[aria-label="${title}"]`)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export function AdminSummary({ data }: { data: AdminData }) {
  const { setActiveTab } = useApp()
  const s = data.summary
  const compliance = useCompliance()
  const overview = useAdminOverview()
  const [accessPending, setAccessPending] = useState(0)
  const [logTick, setLogTick] = useState(0)
  const [sending, setSending] = useState(false)
  const bumpLog = useCallback(() => setLogTick((t) => t + 1), [])

  const c = compliance.data
  const people = !!c && c.totals.expected + c.totals.onLeave > 0
  const toForward = s.dailyAwaitingForward + s.weeklyAwaitingForward
  // Per orang bila data keanggotaan/PIC tersedia; selain itu per proyek seperti sebelumnya.
  const inCount = people ? c!.totals.reported : s.dailyReceived
  const allCount = people ? c!.totals.expected : s.projects
  const missing = people ? c!.totals.expected - c!.totals.reported : s.dailyMissing
  const reminded = people ? c!.totals.reminded : 0
  const unit = people ? 'orang' : 'proyek'
  const dailyPct = pctOf(inCount, allCount)
  const locked = c?.locked ?? data.countdown.passed

  const divisionsAll = c?.divisions.length ?? s.divisions
  const weeklyIn = c ? c.divisions.filter((d) => d.weekly.state !== 'BELUM').length : data.divisionsWeekly.filter((d) => d.submittedAt).length
  const weeklyMissing = Math.max(0, divisionsAll - weeklyIn)

  // Rata-rata 10 hari: rerata persen per hari dari semua divisi.
  const daily = c ? c.days.map((_, i) => {
    const vals = c.divisions.map((d) => d.history[i]).filter((v): v is number => v !== null && v !== undefined)
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }) : []
  const dailyVals = daily.filter((v): v is number => v !== null)
  const avg10 = dailyVals.length
    ? Math.round(dailyVals.reduce((a, b) => a + b, 0) / dailyVals.length)
    : data.days.length
      ? Math.round(data.days.reduce((a, d) => a + pctOf(d.submitted, s.projects), 0) / data.days.length)
      : 0

  const m = overview.data?.masterData
  const inactive = m ? m.users - m.activeUsers : 0
  const canRemindAll = !!c?.canRemind && !locked && people && missing > 0
  const remindable = people ? missing - reminded : 0

  async function remindAll() {
    setSending(true)
    const r = await sendReminder(compliance, { all: true })
    setSending(false)
    if (!r.ok) toast.error(r.error ?? 'Pengingat belum terkirim')
    else toast.success(r.people.length ? `${r.people.length} orang diingatkan. Tercatat di log aktivitas.` : 'Tidak ada yang perlu diingatkan.')
    bumpLog()
  }

  const primary = canRemindAll ? (
    <Button variant="primary" icon="notifikasi" disabled={sending || remindable <= 0} onClick={remindAll}>
      {sending ? 'Mengirim…' : remindable > 0 ? 'Kirim pengingat ke semua' : 'Semua sudah diingatkan'}
    </Button>
  ) : toForward > 0 ? (
    <Button variant="primary" icon="kirim" onClick={() => setActiveTab('inbox')}>
      Teruskan {toForward} laporan
    </Button>
  ) : (
    <Button variant="primary" onClick={() => setActiveTab('work-desk')}>
      Buka meja kerja
    </Button>
  )
  const secondary = accessPending ? (
    <Button variant="plain" onClick={() => scrollToCard('Permintaan akses')}>
      Tinjau {accessPending} permintaan akses
    </Button>
  ) : canRemindAll && toForward > 0 ? (
    <Button variant="plain" onClick={() => setActiveTab('inbox')}>
      Teruskan {toForward} laporan
    </Button>
  ) : (
    <Button variant="plain" onClick={() => setActiveTab('daily-input')}>
      Isi laporan kemajuan
    </Button>
  )

  const tail = [weeklyMissing ? `${weeklyMissing} laporan mingguan belum masuk` : null, accessPending ? `${accessPending} permintaan akses menunggu Anda` : null].filter(Boolean)

  return (
    <>
      <DashHeader context={data.entity?.name ?? 'Entitas Anda'} />

      <Hero
        eyebrow="Kepatuhan pelaporan · hari ini"
        answer={allCount === 0 ? 'Belum ada proyek aktif di perusahaan Anda.' : `${dailyPct}% laporan harian sudah masuk hari ini.`}
        support={[
          allCount === 0 ? null : missing ? `${missing} ${unit} belum lapor${people ? `, ${reminded} sudah diingatkan` : ''}.` : `Semua ${unit} sudah lapor.`,
          tail.length ? `${tail.join(' dan ')}.` : null,
          toForward ? `${toForward} laporan siap diteruskan ke holding.` : null,
          locked && missing ? `Tenggat ${DAILY_CUTOFF_LABEL} sudah lewat.` : null,
        ]
          .filter(Boolean)
          .join(' ')}
        actions={
          <>
            {primary}
            {secondary}
          </>
        }
        art={
          <ActivityRings
            size={176}
            rings={[
              { label: 'Laporan harian', value: dailyPct, tone: 'accent', display: `${inCount} dari ${allCount}`, sub: unit },
              { label: 'Laporan mingguan', value: pctOf(weeklyIn, divisionsAll), tone: 'hijau', display: `${weeklyIn} dari ${divisionsAll}`, sub: 'divisi menyerahkan' },
              m
                ? { label: 'Akun aktif', value: pctOf(m.activeUsers, m.users), tone: 'biru', display: `${m.activeUsers} dari ${m.users}` }
                : { label: 'Kepatuhan bulan ini', value: s.complianceScore, tone: 'biru', display: formatPercent(s.complianceScore, 0) },
            ]}
          />
        }
        kpis={
          <>
            <StatTile
              variant="gradient"
              label="Laporan harian masuk"
              value={`${inCount} dari ${allCount}`}
              delta={`Rata-rata 10 hari ${avg10}%`}
              spark={dailyVals.length ? dailyVals : data.days.map((d) => d.submitted)}
            />
            <StatTile
              label="Belum lapor"
              value={missing}
              delta={missing ? (people ? `${reminded} sudah diingatkan` : `dari ${s.projects} proyek`) : 'Lengkap'}
              tone={missing ? (locked ? 'late' : 'risk') : 'on'}
              onClick={() => scrollToCard('Kepatuhan laporan per divisi')}
            />
            <StatTile
              label="Permintaan akses"
              value={accessPending}
              delta={accessPending ? 'menunggu keputusan Anda' : 'Semua sudah diproses'}
              tone={accessPending ? 'info' : 'neutral'}
              onClick={() => scrollToCard('Permintaan akses')}
            />
            <StatTile
              label="Akun tidak aktif"
              value={m ? inactive : '—'}
              delta={m ? `dari ${m.users} akun` : 'Memuat…'}
              tone={inactive ? 'risk' : 'neutral'}
            />
          </>
        }
      />

      <ComplianceCard state={compliance} onChanged={bumpLog} />

      <div className="mk-row">
        <ComplianceHeatmapCard className="is-wide" state={compliance} />
        <UsersByRoleCard className="is-narrow" state={overview} />
      </div>

      <div className="mk-row">
        <AccessRequestsCard className="is-half" onPendingChange={setAccessPending} onChanged={bumpLog} />
        <ReminderRulesCard className="is-half" onChanged={bumpLog} />
      </div>

      <div className="mk-row">
        <Card className="is-half" title="Perlu perhatian" subtitle="Penerusan dan eskalasi">
          {toForward === 0 && s.openEscalations === 0 && s.lateThisMonth === 0 ? (
            <EmptyNote done>Tidak ada yang mendesak hari ini.</EmptyNote>
          ) : (
            <div>
              {toForward > 0 && (
                <AttentionItem title={`${toForward} laporan siap diteruskan`} reason={`${s.dailyAwaitingForward} harian · ${s.weeklyAwaitingForward} mingguan`} status="info" meta="Penerimaan" onClick={() => setActiveTab('inbox')} />
              )}
              {s.openEscalations > 0 && (
                <AttentionItem title={`${s.openEscalations} eskalasi terbuka`} reason="Menunggu tinjauan atau keputusan" status="risk" onClick={() => setActiveTab('escalations')} />
              )}
              {s.lateThisMonth > 0 && (
                <AttentionItem title={`${s.lateThisMonth} keterlambatan bulan ini`} reason="Tercatat sebagai insiden terlambat" status="late" onClick={() => setActiveTab('work-desk')} />
              )}
            </div>
          )}
        </Card>
        <Card className="is-half" title="Kepatuhan perusahaan" subtitle="Bulan berjalan · target 85%">
          <div className="flex flex-col gap-5">
            <DivisionBar name="Skor kepatuhan" value={s.complianceScore} tone="accent" target={85} />
            <DivisionBar name="Laporan harian tepat waktu" value={s.onTimeDailyPct} tone="hijau" target={85} />
            <DivisionBar name="Mingguan disetujui" value={pctOf(s.weeklyApproved, s.divisions)} tone="biru" target={85} meta={`${s.weeklyApproved} dari ${s.divisions} divisi`} />
          </div>
        </Card>
      </div>

      <MasterDataCard state={overview} />

      <ActivityLogCard reloadKey={logTick} />
    </>
  )
}
