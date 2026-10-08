'use client'

/**
 * Layar Manajemen dan peran grup lain (docs/design/peran/01-manajemen.md):
 * "Bagaimana keadaan perusahaan? Apa yang harus saya putuskan hari ini?"
 * Dipakai juga oleh Direksi holding, TI, Auditor, dan Super Admin. Keputusan
 * persetujuan dikerjakan di tab Persetujuan/Eskalasi; layar ini memantau lewat
 * laporan per perusahaan (drill-down T3-A3) dan tabel proyek prioritas.
 */

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-provider'
import {
  ActivityRings, Button, Card, DivisionBar, EmptyNote, Hero, StatTile, useIsPhone, type Status,
} from '@/components/mk'
import { CompanyReports } from '@/components/oversight/company-reports'
import { EntityActivityBoard } from '@/components/views/entity-activity-board'
import { GroupRolePanel } from '@/components/group/group-panel' // [F2-GRUP]
import { SuperadminStrip } from '@/components/views/companies-view'
import { DashHeader, ProjectSheet, seriesTone } from '@/components/views/dash-common'
import { divisionTone } from '@/lib/division-tone'
import type { ProgressComparison } from '@/lib/kpi-math'
import { formatNumber, initials } from '@/lib/format'
// [F2-DIREKTUR] pencarian ⌘K dan sheet laporan mingguan
import { WeeklyReportSheet, useWeeklyActions } from './weekly-reports'
import { SearchButton, useSearchSelection } from '@/components/search/command-palette'
import { pct, type DivisionSummary, type OversightProject, type RingkasanData } from './types'

type ManagementData = Omit<RingkasanData, 'projects'> & {
  projects: (Omit<OversightProject, 'pic'> & { pic: string | null })[]
  progressComparison?: ProgressComparison | null
}

export function ManagementDashboard({ data }: { data: ManagementData; reload: () => void }) {
  const { user, setActiveTab } = useApp()
  const phone = useIsPhone()
  const [open, setOpen] = useState<OversightProject | null>(null)
  const [report, setReport] = useState<DivisionSummary | null>(null)
  const reportWeekKey = data.reportWeek ? `${data.reportWeek.isoYear}-W${String(data.reportWeek.isoWeek).padStart(2, '0')}` : undefined
  const weekly = useWeeklyActions((d) => d.entityId, reportWeekKey)
  const projects = useMemo(() => data.projects.map((p) => ({
    ...p, pic: p.pic?.trim() || 'PIC belum ditentukan', picInitials: p.pic?.trim() ? initials(p.pic) : '—',
  })), [data.projects])
  useSearchSelection((hit) => {
    if (hit.kind === 'project') {
      const p = projects.find((x) => x.id === hit.id)
      if (p) setOpen(p)
      return Boolean(p)
    }
    if (hit.kind === 'weekly' || hit.kind === 'division') {
      const d = (data.divisions ?? []).find((x) => x.id === hit.divisionId)
      if (d && hit.kind === 'weekly' && d.weekly.id === hit.id) setReport(d)
      return Boolean(d && hit.kind === 'weekly' && d.weekly.id === hit.id)
    }
    return false
  })

  const counts = { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }
  for (const p of projects) counts[p.status]++
  const total = projects.length
  const onPlan = counts.on + counts.done
  const submittedToday = projects.filter((p) => p.reportedToday).length
  const urgent = projects.filter((p) => p.status === 'late' || p.status === 'risk')
  const avgProgress = total ? Math.round(projects.reduce((a, p) => a + p.progress, 0) / total) : 0

  // ---- Cincin hero: total output bila tersedia, jika tidak jatuh ke laporan.
  const outputs = data.outputs
  const hasOutputs = Boolean(outputs && outputs.total > 0)
  const outputPct = outputs ? pct(outputs.done, outputs.total) : 0
  const onTimePct = outputs && outputs.withDue ? pct(outputs.onTime, outputs.withDue) : data.daily.onTime30Pct

  // ---- Keputusan terbuka dihitung mentah; aksinya ada di tab Persetujuan/Eskalasi.
  const approvals = data.decisions.length + (data.deadlineProposals ?? []).length + (data.approvalRequests ?? []).length

  // ---- Kinerja divisi: divisi bernama sama di semua PT digabung (Keuangan, Hukum, …).
  const divisionPerf = useMemo(() => {
    const m = new Map<string, { name: string; ok: number; total: number; basis: 'output' | 'laporan' }>()
    for (const d of data.divisions ?? []) {
      if (!d.onTime) continue
      const k = d.typeName
      const e = m.get(k) ?? { name: k, ok: 0, total: 0, basis: d.onTime.basis }
      e.ok += d.onTime.ok
      e.total += d.onTime.total
      if (d.onTime.basis === 'output') e.basis = 'output'
      m.set(k, e)
    }
    return [...m.values()].map((e) => ({ ...e, pct: pct(e.ok, e.total) })).sort((a, b) => b.pct - a.pct)
  }, [data.divisions])

  const supporting = [
    counts.risk || counts.late ? `${counts.risk} perlu perhatian, ${counts.late} terlambat.` : 'Tidak ada proyek yang tertahan.',
    approvals > 0
      ? `${approvals} persetujuan menunggu Anda.`
      : data.escalations.length > 0
        ? `${data.escalations.length} eskalasi masih terbuka.`
        : 'Tidak ada keputusan yang menunggu.',
  ].join(' ')

  const scopeLabel = data.scope.global ? 'seluruh grup' : data.byEntity.length === 1 ? data.byEntity[0].name : `${data.byEntity.length} perusahaan`

  return (
    <>
      <DashHeader context={scopeLabel} tools={!phone ? <SearchButton /> : undefined} />

      {user.role === 'SUPERADMIN' && <SuperadminStrip />}

      <Hero
        eyebrow="Status hari ini"
        answer={
          total === 0
            ? 'Belum ada proyek aktif di cakupan Anda.'
            : `${formatNumber(onPlan)} dari ${formatNumber(total)} proyek berjalan sesuai rencana.`
        }
        support={supporting}
        actions={
          <>
            {urgent.length > 0 ? (
              <Button variant="primary" iconAfter="kanan" full={phone} onClick={() => setOpen(urgent[0])}>
                Tinjau yang mendesak
              </Button>
            ) : (
              <Button variant="primary" full={phone} onClick={() => setActiveTab('projects')}>
                Lihat semua proyek
              </Button>
            )}
            {urgent.length > 0 && !phone ? (
              <Button variant="plain" onClick={() => setActiveTab('projects')}>
                Lihat semua proyek
              </Button>
            ) : null}
          </>
        }
        art={
          <ActivityRings
            size={phone ? 96 : 176}
            rings={[
              hasOutputs && outputs
                ? { label: 'Output', value: outputPct, tone: 'accent', display: `${outputPct}%`, sub: `${formatNumber(outputs.done)} dari ${formatNumber(outputs.total)} output` }
                : {
                    label: 'Laporan mingguan',
                    value: pct(data.weekly.approved, data.weekly.expected),
                    tone: 'accent',
                    display: `${data.weekly.approved} dari ${data.weekly.expected}`,
                    sub: `divisi disetujui · M${data.week}`,
                  },
              { label: 'Laporan harian', value: pct(submittedToday, total), tone: 'hijau', display: `${pct(submittedToday, total)}%`, sub: `${submittedToday} dari ${total} masuk hari ini` },
              { label: 'Tepat waktu', value: onTimePct, tone: 'biru', display: `${onTimePct}%`, sub: hasOutputs ? 'output sesuai tenggat' : 'laporan 30 hari' },
            ]}
          />
        }
        kpis={
          <>
            <StatTile label="Rata-rata progres" value={`${avgProgress}%`} delta={data.progressComparison ? `${data.progressComparison.delta > 0 ? '+' : ''}${data.progressComparison.delta} poin vs akhir minggu lalu` : `${counts.done} proyek selesai`} tone="neutral" />
            {data.attendance ? (
              <StatTile
                label="Kehadiran"
                value={`${pct(data.attendance.present, data.attendance.people)}%`}
                delta={`${formatNumber(data.attendance.present)} dari ${formatNumber(data.attendance.people)} orang`}
                tone={pct(data.attendance.present, data.attendance.people) >= 85 ? 'on' : 'risk'}
              />
            ) : (
              <StatTile
                label="Tepat waktu 30 hari"
                value={`${data.daily.onTime30Pct}%`}
                delta={`${formatNumber(data.daily.onTime30)} dari ${formatNumber(data.daily.total30)} laporan`}
                tone={data.daily.onTime30Pct >= 85 ? 'on' : 'risk'}
              />
            )}
          </>
        }
      />

      {/* Bagian utama (8 Okt 2026): laporan per perusahaan menggantikan kartu
          output/linimasa/donat/tabel prioritas/perhatian/persetujuan/aktivitas;
          ketuk kartu PT membuka Sheet drill-down milik CompanyReports (T3-A3).
          `projects` sudah ber-PIC ternormalisasi, jadi lolos tipe CompanyProject. */}
      <section className="flex flex-col gap-3" aria-labelledby="mk-laporan-perusahaan">
        <h2 id="mk-laporan-perusahaan" className="t-title-3 text-ink">Laporan per perusahaan</h2>
        <CompanyReports projects={projects} />
      </section>

      <div className="mk-row">
        {divisionPerf.length > 0 ? (
          <Card className="is-narrow" title="Kinerja divisi" subtitle="Tepat waktu per divisi · target 85%">
            <div className="flex flex-col gap-4">
              {divisionPerf.slice(0, 8).map((d) => (
                <DivisionBar
                  key={d.name}
                  name={d.name}
                  value={d.pct}
                  tone={divisionTone(d.name)}
                  target={85}
                  meta={`${formatNumber(d.ok)} dari ${formatNumber(d.total)} ${d.basis === 'output' ? 'output tepat waktu' : 'proyek lapor hari ini'}`}
                />
              ))}
            </div>
          </Card>
        ) : (
          <Card className="is-narrow" title="Tepat waktu per perusahaan" subtitle="Laporan harian 30 hari · target 85%">
            {data.byEntity.length === 0 ? (
              <EmptyNote>Belum ada laporan dalam 30 hari terakhir.</EmptyNote>
            ) : (
              <div className="flex flex-col gap-4">
                {data.byEntity.slice(0, 8).map((e, i) => (
                  <DivisionBar
                    key={e.id}
                    name={e.name}
                    value={e.onTimePct ?? 0}
                    tone={seriesTone(i)}
                    target={85}
                    meta={`${formatNumber(e.onTime)} dari ${formatNumber(e.total)} laporan tepat waktu`}
                  />
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {data.attendance ? (
        <div className="mk-row">
          <AttendanceCard {...data.attendance} late={data.attendance.late ?? 0} />
        </div>
      ) : null}

      {/* [F2-GRUP] panel khusus SDM GA / TI / Super Admin / Auditor */}
      <GroupRolePanel data={{ ...data, projects }} />

      <EntityActivityBoard />

      <ProjectSheet project={open} onClose={() => setOpen(null)} />
      <WeeklyReportSheet
        division={report}
        weekLabel={data.reportWeek?.label ?? `M${data.week}`}
        viewer={data.viewer ?? { canRemind: false, canMarkRead: false, canDecideDeadline: false }}
        actions={weekly}
        onClose={() => setReport(null)}
      />
    </>
  )
}

/** Kehadiran hari ini: angka besar + batang bertumpuk Hadir / Terlambat / Izin-cuti [F2-DIREKTUR]. */
function AttendanceCard({ people, present, leave, late }: { people: number; present: number; leave: number; late: number }) {
  const p = pct(present, people)
  const onTime = Math.max(0, present - late)
  return (
    <Card className="is-narrow" title="Kehadiran hari ini" subtitle={`${formatNumber(people)} orang di cakupan Anda`}>
      <div className="t-large-title tabular-nums">{p}%</div>
      <div className="mt-3 mk-attbar" role="img" aria-label={`Hadir ${onTime}, terlambat ${late}, izin atau cuti ${leave}`}>
        <span className="mk-bg--on" style={{ width: `${pct(onTime, people)}%` }} />
        <span className="mk-bg--risk" style={{ width: `${pct(late, people)}%` }} />
        <span className="mk-bg--info" style={{ width: `${pct(leave, people)}%` }} />
      </div>
      <div className="mt-3 flex flex-col gap-1 t-footnote text-ink-2">
        <span className="flex items-center gap-2">
          <span className="mk-dot mk-bg--on" aria-hidden /> Hadir {formatNumber(onTime)}
        </span>
        <span className="flex items-center gap-2">
          <span className="mk-dot mk-bg--risk" aria-hidden /> Terlambat {formatNumber(late)}
        </span>
        <span className="flex items-center gap-2">
          <span className="mk-dot mk-bg--info" aria-hidden /> Izin, sakit, atau cuti {formatNumber(leave)}
        </span>
      </div>
    </Card>
  )
}
