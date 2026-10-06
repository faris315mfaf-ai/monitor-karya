'use client'

/**
 * Layar Direktur (docs/design/peran/02-direktur.md): "Bagaimana divisi saya minggu
 * ini? Laporan siapa yang belum masuk? Keputusan apa yang dinaikkan ke saya?"
 * Ciri khas: saringan divisi di header — semua isi halaman ikut tersaring.
 */

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-provider'
import {
  ActivityRings, AreaChart, AttentionItem, Button, Card, Chip, DateBox, DivisionBar, DonutChart, EmptyNote, Hero,
  ProjectRow, SegmentedControl, StatTile, StatusBadge, Timeline, useIsPhone, type Status,
} from '@/components/mk'
import { DashHeader, ProjectSheet, seriesTone, timelineFrame } from '@/components/views/dash-common'
import { ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { divisionTone } from '@/lib/division-tone'
import { formatDateShort, formatNumber, initials } from '@/lib/format'
import { DeadlineProposalItems, RejectDeadlineSheet, useDeadlineDecisions } from './deadline-decisions'
import { WeeklyReportSheet, WeeklyReportsCard, useWeeklyActions } from './weekly-reports'
import { pct, type DivisionSummary, type OversightProject, type RingkasanData } from './types'
// [F2-DIREKTUR] persetujuan materi/anggaran/cuti & pencarian ⌘K
import { ApprovalRequestItems, RejectApprovalSheet, useApprovalDecisions } from './approval-requests'
import { SearchButton, useSearchSelection } from '@/components/search/command-palette'

const DAY = 86400000
const STATUS_FILTERS: { value: 'all' | Status; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'on', label: 'Sesuai jadwal' },
  { value: 'risk', label: 'Perlu perhatian' },
  { value: 'late', label: 'Terlambat' },
]

/** Gulir ke kartu di halaman yang sama; tanpa animasi bila pengguna meminta gerak dikurangi. */
function scrollToCard(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
}

export function DirectorDashboard({ data }: { data: RingkasanData }) {
  const { setActiveTab } = useApp()
  const phone = useIsPhone()
  const divisions = useMemo(() => data.divisions ?? [], [data.divisions])
  const [div, setDiv] = useState<string>('all')
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [open, setOpen] = useState<OversightProject | null>(null)
  const [report, setReport] = useState<DivisionSummary | null>(null)
  const [point, setPoint] = useState<number | undefined>(undefined)
  // [F1-B] Pengingat menagih minggu laporan yang tampil.
  const reportWeekKey = data.reportWeek ? `${data.reportWeek.isoYear}-W${String(data.reportWeek.isoWeek).padStart(2, '0')}` : undefined
  const weekly = useWeeklyActions((d) => d.entityId, reportWeekKey)
  const deadline = useDeadlineDecisions()
  const approvalCtl = useApprovalDecisions()
  const viewer = data.viewer ?? { canRemind: false, canMarkRead: false, canDecideDeadline: false }
  const weekLabel = data.reportWeek?.label ?? `M${data.week}`

  const one = divisions.find((d) => d.id === div) ?? null
  const divs = one ? [one] : divisions
  const inDiv = <T extends { divisionId?: string | null }>(x: T) => !one || x.divisionId === one.id
  const projects = data.projects.filter(inDiv)
  const escalations = data.escalations.filter(inDiv)
  // Usulan yang baru diputuskan tetap tampil meredup dengan lencana; hitungan hanya yang menunggu.
  const proposals = (data.deadlineProposals ?? []).filter(inDiv)
  const pendingProposals = proposals.filter((p) => !deadline.decided[p.id])
  // [F2-DIREKTUR] Materi/anggaran/cuti dari kepala divisi & PIC, ikut saringan divisi.
  const requests = (data.approvalRequests ?? []).filter(inDiv)
  const pendingRequests = requests.filter((r) => !approvalCtl.decided[r.id])

  // ---- Angka
  const counts = { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }
  for (const p of projects) counts[p.status]++
  const total = projects.length
  const onPlan = counts.on + counts.done
  const out = divs.reduce(
    (a, d) => ({ done: a.done + d.outputs.done, total: a.total + d.outputs.total, onTime: a.onTime + d.outputs.onTime, withDue: a.withDue + d.outputs.withDue }),
    { done: 0, total: 0, onTime: 0, withDue: 0 }
  )
  const missing = divs.filter((d) => weekly.stateOf(d) === 'missing')
  const received = divs.length - missing.length
  const waiting = escalations.length + pendingProposals.length + pendingRequests.length
  const onTimePct = out.withDue ? pct(out.onTime, out.withDue) : data.daily.onTime30Pct
  const weeks = (data.outputs?.trend.week ?? data.trend.map((t) => ({ label: t.label, value: 0 }))).map((t) => t.label)
  const trendValues = weeks.map((_, i) => divs.reduce((a, d) => a + (d.outputs.trend[i] ?? 0), 0))
  const thisWeek = trendValues[trendValues.length - 1] ?? 0
  const lastWeek = trendValues[trendValues.length - 2] ?? 0
  const delta = thisWeek - lastWeek
  const today = Date.now()
  const milestones = projects
    .filter((p) => p.targetEndDate && p.status !== 'done')
    .filter((p) => {
      const t = Date.parse(p.targetEndDate as string) - today
      return t >= -DAY && t <= 14 * DAY
    })
    .sort((a, b) => Date.parse(a.targetEndDate as string) - Date.parse(b.targetEndDate as string))
  const filtered = filter === 'all' ? projects : projects.filter((p) => p.status === filter)

  // ---- Kalimat
  const missingText = missing.length
    ? `Laporan ${missing.map((d) => d.name).join(', ')} belum masuk`
    : 'Semua laporan mingguan sudah masuk'
  const support = one
    ? `${formatNumber(one.outputs.done)} dari ${formatNumber(one.outputs.total)} output selesai. Laporan mingguan: ${
        { sent: 'terkirim', late: 'terlambat masuk', missing: 'belum masuk', read: 'sudah Anda baca' }[weekly.stateOf(one)]
      }.`
    : `${counts.risk} perlu perhatian, ${counts.late} terlambat. ${missingText}${
        waiting ? ` dan ${waiting} eskalasi menunggu keputusan Anda.` : '.'
      }`

  // ---- Timeline
  const withDue = projects.filter((p) => p.targetEndDate)
  const tl = timelineFrame(withDue)
  const timelineRows = withDue.slice(0, 10).map((p) => ({
    id: p.id,
    label: p.name,
    sub: `${p.pic} · ${p.divisionName ?? p.entityCode}`,
    start: Math.max(0, tl.at(p.startDate, 0)),
    end: Math.max(1, tl.at(p.targetEndDate, tl.span)),
    progress: p.progress,
    status: p.status,
    range: `${p.startDate ? formatDateShort(p.startDate) : '…'}–${formatDateShort(p.targetEndDate)}`,
  }))

  const divIndex = (id: string | null | undefined) => Math.max(0, divisions.findIndex((d) => d.id === id))
  const pointIdx = point ?? trendValues.length - 1
  const segOptions = [{ value: 'all', label: 'Semua' }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]

  // [F2-DIREKTUR] Hasil pencarian ⌘K dibuka di layar ini bila datanya ada di sini.
  useSearchSelection((hit) => {
    if (hit.kind === 'project') {
      const p = data.projects.find((x) => x.id === hit.id)
      if (p) setOpen(p)
      return Boolean(p)
    }
    const d = divisions.find((x) => x.id === hit.divisionId)
    if (!d) return false
    if (hit.kind === 'division') {
      setDiv(d.id)
      return true
    }
    if (hit.kind === 'weekly' && d.weekly.id === hit.id) {
      setReport(d)
      return true
    }
    return false
  })

  return (
    <>
      <DashHeader
        context={one ? `Divisi ${one.name}` : `${divisions.length} divisi`}
        tools={
          !phone ? (
            <>
              {divisions.length > 1 ? (
                <div className="max-w-full overflow-x-auto">
                  <SegmentedControl size="sm" label="Saring divisi" value={div} onChange={setDiv} options={segOptions} />
                </div>
              ) : null}
              <SearchButton />
            </>
          ) : undefined
        }
      />
      {divisions.length > 1 && phone ? (
        <div className="overflow-x-auto">
          <SegmentedControl full label="Saring divisi" value={div} onChange={setDiv} options={segOptions} />
        </div>
      ) : null}

      <Hero
        eyebrow={
          one
            ? `Divisi ${one.name} · ${one.head?.name ?? 'kepala divisi belum ditetapkan'}`
            : `${divisions.length} divisi · ${formatNumber(total)} proyek di bawah Anda`
        }
        answer={
          total === 0
            ? one
              ? `Divisi ${one.name} belum punya proyek aktif.`
              : 'Belum ada proyek aktif di bawah Anda.'
            : `${formatNumber(onPlan)} dari ${formatNumber(total)} proyek berjalan sesuai rencana.`
        }
        support={support}
        actions={
          <>
            {waiting > 0 ? (
              <Button variant="primary" iconAfter="kanan" onClick={() => scrollToCard('mk-eskalasi')}>
                Tinjau {waiting} eskalasi
              </Button>
            ) : (
              <Button variant="primary" onClick={() => scrollToCard('mk-laporan-mingguan')}>
                Baca laporan mingguan
              </Button>
            )}
            {waiting > 0 ? (
              <Button variant="plain" onClick={() => scrollToCard('mk-laporan-mingguan')}>
                Baca laporan mingguan
              </Button>
            ) : null}
          </>
        }
        art={
          <ActivityRings
            size={phone ? 96 : 176}
            rings={[
              { label: 'Output', value: pct(out.done, out.total), tone: 'accent', display: `${out.done} dari ${out.total}`, sub: 'output selesai' },
              { label: 'Laporan mingguan', value: pct(received, divs.length), tone: 'hijau', display: `${received} dari ${divs.length}`, sub: `masuk · ${weekLabel}` },
              { label: 'Tepat waktu', value: onTimePct, tone: 'biru', display: `${onTimePct}%`, sub: out.withDue ? 'output sesuai tenggat' : 'laporan harian 30 hari' },
            ]}
          />
        }
        kpis={
          <>
            <StatTile
              variant="gradient"
              label="Output selesai minggu ini"
              value={thisWeek}
              delta={`${delta >= 0 ? '+' : ''}${delta} dari minggu lalu`}
              trend={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
              spark={trendValues}
            />
            <StatTile
              label={`Laporan mingguan ${weekLabel}`}
              value={`${received} dari ${divs.length}`}
              delta={missing.length ? `${missing.length} belum masuk` : 'Semua sudah masuk'}
              tone={missing.length ? 'late' : 'on'}
              onClick={() => scrollToCard('mk-laporan-mingguan')}
            />
            {/* Ponsel: 2 KPI (Output & Laporan mingguan); eskalasi & milestone punya kartunya sendiri. */}
            {!phone && <StatTile
              label="Eskalasi menunggu"
              value={waiting}
              delta={escalations.some((e) => e.overdue) ? `${escalations.filter((e) => e.overdue).length} lewat SLA` : waiting ? 'Semua dalam SLA' : 'Tidak ada'}
              tone={escalations.some((e) => e.overdue) ? 'late' : waiting ? 'risk' : 'on'}
              onClick={() => scrollToCard('mk-eskalasi')}
            />}
            {!phone && (
              <StatTile
                label="Milestone 14 hari"
                value={milestones.length}
                delta={milestones[0] ? `Terdekat ${formatDateShort(milestones[0].targetEndDate)}` : 'Tidak ada tenggat dekat'}
                tone={milestones.some((m) => m.status === 'late' || m.status === 'risk') ? 'risk' : 'neutral'}
                onClick={() => scrollToCard('mk-milestone')}
              />
            )}
          </>
        }
      />

      <div className="mk-row">
        <div className="is-wide flex" id="mk-laporan-mingguan" tabIndex={-1}>
          <WeeklyReportsCard className="flex-1" divisions={divs} weekLabel={weekLabel} viewer={viewer} actions={weekly} onOpen={setReport} />
        </div>
        <Card className="is-narrow" title="Output yang sedang dikerjakan" subtitle="Per divisi · ketuk segmen untuk menyaring">
          {divisions.every((d) => d.outputs.active + d.outputs.review === 0) ? (
            <EmptyNote icon="target">Belum ada output aktif. Output muncul setelah PIC menambahkannya.</EmptyNote>
          ) : (
            <DonutChart
              layout="stack"
              size={168}
              centerSub="output aktif"
              label="Output aktif per divisi"
              selectedIndex={one ? divIndex(one.id) : null}
              onSelect={(i) => setDiv(i === null ? 'all' : divisions[i].id)}
              data={divisions.map((d) => ({ label: d.name, value: d.outputs.active + d.outputs.review, tone: divisionTone(d.name) }))}
            />
          )}
        </Card>
      </div>

      <div id="mk-milestone" tabIndex={-1}>
        {phone ? (
          <Card title="Milestone 14 hari" subtitle="Tenggat proyek terdekat">
            {milestones.length === 0 ? (
              <EmptyNote done>Tidak ada tenggat dalam 14 hari.</EmptyNote>
            ) : (
              <div className="mk-list">
                {milestones.map((p) => (
                  <button key={p.id} type="button" className="mk-listrow w-full text-left" onClick={() => setOpen(p)}>
                    <DateBox date={p.targetEndDate as string} />
                    <span className="min-w-0 flex-1">
                      <span className="block t-body-strong truncate">{p.name}</span>
                      <span className="block t-footnote text-ink-2 truncate">{p.pic}</span>
                    </span>
                    <StatusBadge status={p.status} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card title="Milestone proyek" subtitle="Ketuk baris untuk membuka detail">
            {timelineRows.length === 0 ? (
              <EmptyNote icon="kalender">Belum ada proyek dengan tenggat.</EmptyNote>
            ) : (
              <div className="mk-scroll-x">
                <Timeline
                  rows={timelineRows}
                  span={tl.span}
                  ticks={tl.ticks}
                  today={tl.today}
                  title="Proyek"
                  selectedId={open?.id ?? null}
                  onSelect={(id) => setOpen(projects.find((p) => p.id === id) ?? null)}
                />
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Proyek di bawah Anda"
          subtitle={`${formatNumber(filtered.length)} dari ${formatNumber(total)} proyek`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setActiveTab('projects')}>
              Lihat semua
            </Button>
          }
        >
          <div className="mk-chips mb-3">
            {STATUS_FILTERS.map((f) => (
              <Chip
                key={f.value}
                selected={filter === f.value}
                status={f.value === 'all' ? undefined : f.value}
                count={f.value === 'all' ? total : counts[f.value]}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Chip>
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyNote>Tidak ada proyek dengan status ini.</EmptyNote>
          ) : (
            <div className="mk-prows">
              {filtered.slice(0, 10).map((p) => (
                <ProjectRow
                  key={p.id}
                  name={p.name}
                  division={p.divisionName ?? p.entityName}
                  divisionTone={divisionTone(p.divisionName ?? divisions.find((d) => d.id === p.divisionId)?.name)}
                  pic={p.pic}
                  initials={initials(p.pic)}
                  progress={p.progress}
                  due={p.targetEndDate ? formatDateShort(p.targetEndDate) : '—'}
                  status={p.status}
                  selected={open?.id === p.id}
                  compact={phone}
                  onClick={() => setOpen(p)}
                />
              ))}
            </div>
          )}
        </Card>
        <div className="is-narrow flex" id="mk-eskalasi" tabIndex={-1}>
          <Card
            className="flex-1"
            title="Eskalasi dari kepala divisi"
            subtitle={waiting ? `${waiting} menunggu keputusan Anda` : 'Keputusan yang dinaikkan ke Anda'}
            action={
              escalations.length > 0 ? (
                <Button size="sm" variant="secondary" onClick={() => setActiveTab('escalations')}>
                  Buka eskalasi
                </Button>
              ) : undefined
            }
          >
            {waiting === 0 && proposals.length === 0 && requests.length === 0 ? (
              <EmptyNote done>{one ? 'Tidak ada eskalasi untuk divisi ini.' : 'Tidak ada eskalasi yang menunggu.'}</EmptyNote>
            ) : (
              <div>
                <ApprovalRequestItems items={requests} ctl={approvalCtl} canDecide={viewer.canDecideApproval !== false} />
                <DeadlineProposalItems items={proposals} ctl={deadline} />
                {escalations.slice(0, 5).map((e) => (
                  <AttentionItem
                    key={e.id}
                    title={e.summary}
                    reason={`${e.raisedBy ?? e.entityName} · butuh ${(ESCALATION_NEEDED_LABELS[e.needed] ?? e.needed).toLowerCase()}`}
                    status={e.overdue ? 'late' : 'risk'}
                    meta={e.overdue ? `lewat SLA, ${e.ageDays} hari` : `${e.ageDays} hari`}
                    onClick={() => setActiveTab('escalations')}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Tren output"
          subtitle="Output diterima per minggu · 8 minggu terakhir"
          action={
            <div className="text-right">
              <div className="t-title-2 tabular-nums">{formatNumber(trendValues[pointIdx] ?? 0)}</div>
              <div className="t-footnote text-ink-2">output · {weeks[pointIdx]}</div>
            </div>
          }
        >
          {trendValues.every((v) => v === 0) ? (
            <EmptyNote icon="laporan">Belum ada output yang diterima dalam 8 minggu terakhir.</EmptyNote>
          ) : (
            <AreaChart
              data={weeks.map((label, i) => ({ label, value: trendValues[i] }))}
              selectedIndex={pointIdx}
              onSelect={setPoint}
              seriesLabel="Output diterima"
              unit="output"
              zero
            />
          )}
        </Card>
        <Card className="is-narrow" title="Tepat waktu per divisi" subtitle="Target 85%">
          {divs.every((d) => !d.onTime) ? (
            <EmptyNote>Belum ada output bertenggat yang selesai.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {divs.map((d) => (
                <DivisionBar
                  key={d.id}
                  name={d.name}
                  value={d.onTime?.pct ?? 0}
                  tone={divisionTone(d.name)}
                  target={85}
                  meta={
                    !d.onTime
                      ? 'Belum ada data'
                      : d.onTime.basis === 'output'
                        ? `${formatNumber(d.onTime.ok)} dari ${formatNumber(d.onTime.total)} output tepat waktu`
                        : `${formatNumber(d.onTime.ok)} dari ${formatNumber(d.onTime.total)} proyek lapor hari ini`
                  }
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <ProjectSheet project={open} onClose={() => setOpen(null)} />
      <WeeklyReportSheet division={report} weekLabel={weekLabel} viewer={viewer} actions={weekly} onClose={() => setReport(null)} />
      <RejectDeadlineSheet ctl={deadline} />
      <RejectApprovalSheet ctl={approvalCtl} />
    </>
  )
}
