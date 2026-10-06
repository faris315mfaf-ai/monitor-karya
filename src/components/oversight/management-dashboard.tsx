'use client'

/**
 * Layar Manajemen dan peran grup lain (docs/design/peran/01-manajemen.md):
 * "Bagaimana keadaan perusahaan? Apa yang harus saya putuskan hari ini?"
 * Dipakai juga oleh Direksi holding, TI, Auditor, dan Super Admin; peran tanpa
 * hak memutuskan melihat daftar yang sama tanpa tombol Setujui/Tolak.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/components/app-provider'
import {
  ActivityItem, ActivityRings, ApprovalItem, AttentionItem, BarChart, Button, Card, Chip, DivisionBar, DonutChart,
  EmptyNote, Hero, ProjectRow, SegmentedControl, StatTile, Timeline, useIsPhone, type Status,
} from '@/components/mk'
import { EntityActivityBoard } from '@/components/views/entity-activity-board'
import { GroupRolePanel } from '@/components/group/group-panel' // [F2-GRUP]
import { SuperadminStrip } from '@/components/views/companies-view'
import { DashHeader, ProjectSheet, seriesTone, timelineFrame } from '@/components/views/dash-common'
import { ESCALATION_NEEDED_LABELS } from '@/lib/constants'
import { divisionTone } from '@/lib/division-tone'
import { can, canSeeTab } from '@/lib/rbac'
import { toastWithUndo } from '@/lib/undo-client' // [F2-URUNGKAN]
import { formatDateShort, formatNumber, formatRelative, initials } from '@/lib/format'
import { DeadlineProposalItems, RejectDeadlineSheet, useDeadlineDecisions } from './deadline-decisions'
// [F2-DIREKTUR] persetujuan materi/anggaran/cuti, pencarian ⌘K, sheet laporan mingguan
import { ApprovalRequestItems, RejectApprovalSheet, useApprovalDecisions } from './approval-requests'
import { WeeklyReportSheet, useWeeklyActions } from './weekly-reports'
import { SearchButton, useSearchSelection } from '@/components/search/command-palette'
import { pct, type DivisionSummary, type OversightProject, type RingkasanData } from './types'

const STATUS_FILTERS: { value: 'all' | Status; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'on', label: 'Sesuai jadwal' },
  { value: 'risk', label: 'Perlu perhatian' },
  { value: 'late', label: 'Terlambat' },
  { value: 'neutral', label: 'Belum mulai' },
]
const DONUT_ORDER: Status[] = ['on', 'risk', 'late', 'neutral', 'done']

type Period = 'week' | 'month' | 'quarter'
const PERIODS: { value: Period; label: string; sub: string; kpi: string }[] = [
  { value: 'week', label: 'Minggu', sub: '8 minggu terakhir', kpi: 'minggu ini' },
  { value: 'month', label: 'Bulan', sub: '6 bulan terakhir', kpi: 'bulan ini' },
  { value: 'quarter', label: 'Kuartal', sub: '4 kuartal terakhir', kpi: 'kuartal ini' },
]
const HOUR = 3600000

export function ManagementDashboard({ data, reload }: { data: RingkasanData; reload: () => void }) {
  const { user, setActiveTab } = useApp()
  const phone = useIsPhone()
  const [period, setPeriod] = useState<Period>('week')
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [open, setOpen] = useState<OversightProject | null>(null)
  const [selectedBar, setSelectedBar] = useState<number | undefined>(undefined)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({})
  const deadline = useDeadlineDecisions()
  // [F2-DIREKTUR]
  const approvalCtl = useApprovalDecisions()
  const [report, setReport] = useState<DivisionSummary | null>(null)
  const reportWeekKey = data.reportWeek ? `${data.reportWeek.isoYear}-W${String(data.reportWeek.isoWeek).padStart(2, '0')}` : undefined
  const weekly = useWeeklyActions((d) => d.entityId, reportWeekKey)
  useSearchSelection((hit) => {
    if (hit.kind === 'project') {
      const p = data.projects.find((x) => x.id === hit.id)
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

  const projects = data.projects
  const counts = { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }
  for (const p of projects) counts[p.status]++
  const total = projects.length
  const onPlan = counts.on + counts.done
  const submittedToday = projects.filter((p) => p.reportedToday).length
  const urgent = projects.filter((p) => p.status === 'late' || p.status === 'risk')
  const avgProgress = total ? Math.round(projects.reduce((a, p) => a + p.progress, 0) / total) : 0
  const filtered = filter === 'all' ? projects : projects.filter((p) => p.status === filter)

  // ---- Output (fallback ke laporan harian bila belum ada output sama sekali)
  const outputs = data.outputs
  const hasOutputs = Boolean(outputs && outputs.total > 0)
  const per = PERIODS.find((p) => p.value === period)!
  const series = hasOutputs && outputs ? outputs.trend[period] : data.trend.map((t) => ({ label: t.label, value: t.submitted }))
  const barIndex = Math.min(selectedBar ?? series.length - 1, series.length - 1)
  const cur = series[series.length - 1]?.value ?? 0
  const prev = series[series.length - 2]?.value ?? 0
  const deltaPct = prev ? Math.round(((cur - prev) / prev) * 100) : 0
  const outputPct = outputs ? pct(outputs.done, outputs.total) : 0
  const onTimePct = outputs && outputs.withDue ? pct(outputs.onTime, outputs.withDue) : data.daily.onTime30Pct

  // ---- Persetujuan
  const decides = can(user.role, 'escalation:decide')
  const seesEscalations = canSeeTab(user.role, 'escalations')
  const viewer = data.viewer
  const proposals = data.deadlineProposals ?? []
  const pendingDecisions = data.decisions.filter((d) => !decided[d.id])
  const pendingProposals = proposals.filter((p) => !deadline.decided[p.id])
  const requests = data.approvalRequests ?? []
  const pendingRequests = requests.filter((r) => !approvalCtl.decided[r.id])
  const approvals = pendingDecisions.length + pendingProposals.length + pendingRequests.length
  const waiting = approvals + data.escalations.length
  const now = useMemo(() => Date.now(), [])
  const stale = [...pendingDecisions.map((d) => d.proposedAt), ...pendingProposals.map((p) => p.proposedAt), ...pendingRequests.map((r) => r.createdAt)].filter(
    (t) => now - Date.parse(t) > 24 * HOUR
  ).length
  const overdueEsc = data.escalations.filter((e) => e.overdue).length

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

  // ---- Timeline
  const withDue = projects.filter((p) => p.targetEndDate)
  const tl = timelineFrame(withDue)
  const timelineRows = withDue.slice(0, 8).map((p) => ({
    id: p.id,
    label: p.name,
    sub: `${p.pic} · ${p.divisionName ?? p.entityCode}`,
    start: Math.max(0, tl.at(p.startDate, 0)),
    end: Math.max(1, tl.at(p.targetEndDate, tl.span)),
    progress: p.progress,
    status: p.status,
    range: `${p.startDate ? formatDateShort(p.startDate) : '…'}–${formatDateShort(p.targetEndDate)}`,
  }))

  const supporting = [
    counts.risk || counts.late ? `${counts.risk} perlu perhatian, ${counts.late} terlambat.` : 'Tidak ada proyek yang tertahan.',
    approvals > 0
      ? `${approvals} persetujuan menunggu Anda.`
      : data.escalations.length > 0
        ? `${data.escalations.length} eskalasi masih terbuka.`
        : 'Tidak ada keputusan yang menunggu.',
  ].join(' ')

  async function approveProject(id: string) {
    setDeciding(id)
    try {
      const res = await fetch('/api/projects/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, decision: 'DISETUJUI' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Persetujuan belum tersimpan. Coba lagi.')
      } else {
        setDecided((d) => ({ ...d, [id]: 'approved' }))
        // [F2-URUNGKAN] persetujuan bisa diurungkan lewat toast.
        toastWithUndo('Pengajuan proyek disetujui.', json.undoToken, () => {
          setDecided((d) => {
            const next = { ...d }
            delete next[id]
            return next
          })
          reload()
        })
        reload()
      }
    } catch {
      toast.error('Server tidak terjangkau. Coba lagi.')
    } finally {
      setDeciding(null)
    }
  }

  const scopeLabel = data.scope.global ? 'seluruh grup' : data.byEntity.length === 1 ? data.byEntity[0].name : `${data.byEntity.length} perusahaan`
  const periodControl = (
    <SegmentedControl
      size={phone ? 'md' : 'sm'}
      full={phone}
      label="Periode"
      value={period}
      onChange={(v) => {
        setPeriod(v as Period)
        setSelectedBar(undefined)
      }}
      options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
    />
  )

  return (
    <>
      <DashHeader
        context={scopeLabel}
        tools={
          !phone ? (
            <>
              <SearchButton />
              {hasOutputs ? periodControl : null}
            </>
          ) : undefined
        }
      />

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
            <StatTile
              variant="gradient"
              label={hasOutputs ? `Output selesai ${per.kpi}` : 'Laporan masuk minggu ini'}
              value={cur}
              delta={prev ? `${deltaPct >= 0 ? '+' : ''}${deltaPct}% dari periode lalu` : 'Periode pertama'}
              trend={deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat'}
              spark={series.map((s) => s.value)}
            />
            <StatTile label="Rata-rata progres" value={`${avgProgress}%`} delta={`${counts.done} proyek selesai`} tone="neutral" />
            <StatTile
              label={approvals || !data.escalations.length ? 'Persetujuan menunggu' : 'Eskalasi terbuka'}
              value={approvals || data.escalations.length}
              delta={
                approvals
                  ? stale
                    ? `${stale} lewat 24 jam`
                    : 'Semua kurang dari 24 jam'
                  : overdueEsc
                    ? `${overdueEsc} lewat SLA`
                    : 'Tidak ada yang tertahan'
              }
              tone={stale || overdueEsc ? 'late' : waiting ? 'risk' : 'on'}
              onClick={() => document.getElementById('mk-persetujuan')?.scrollIntoView({ block: 'start' })}
            />
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

      {hasOutputs && phone ? periodControl : null}

      <div className="mk-row">
        <Card
          className="is-wide"
          title={hasOutputs ? 'Output selesai' : 'Laporan harian masuk'}
          subtitle={hasOutputs ? `${per.sub} · ketuk batang untuk melihat angkanya` : '8 minggu terakhir · ketuk batang untuk melihat angkanya'}
          action={
            <div className="text-right">
              <div className="t-title-2 tabular-nums">{formatNumber(series[barIndex]?.value ?? 0)}</div>
              <div className="t-footnote text-ink-2">
                {series[barIndex]?.label}
                {hasOutputs ? ' · output' : ` · ${data.trend[barIndex]?.onTimePct ?? 0}% tepat waktu`}
              </div>
            </div>
          }
        >
          <BarChart data={series} selectedIndex={barIndex} onSelect={setSelectedBar} unit={hasOutputs ? 'output' : 'laporan'} />
        </Card>
        <Card className="is-narrow" title="Perlu perhatian" subtitle="Terlambat lebih dulu, lalu tenggat terdekat">
          {urgent.length === 0 ? (
            <EmptyNote done>Tidak ada yang mendesak hari ini.</EmptyNote>
          ) : (
            <div>
              {urgent.slice(0, 3).map((p) => (
                <AttentionItem
                  key={p.id}
                  title={p.name}
                  reason={p.reason ?? undefined}
                  status={p.status}
                  meta={p.targetEndDate ? `tenggat ${formatDateShort(p.targetEndDate)}` : p.entityCode}
                  onClick={() => setOpen(p)}
                />
              ))}
              {urgent.length > 3 && (
                <Button variant="plain" size="sm" onClick={() => setFilter('risk')}>
                  Lihat {urgent.length - 3} lainnya
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {!phone && (
        <div className="mk-row">
          <Card className="is-wide" title="Kapan proyek prioritas selesai?" subtitle="Ketuk baris untuk membuka detail">
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
          <Card className="is-narrow" title={`Status ${formatNumber(total)} proyek`} subtitle="Ketuk segmen untuk menyaring tabel">
            <DonutChart
              layout="stack"
              size={168}
              centerSub="proyek"
              label="Status proyek"
              selectedIndex={filter === 'all' ? null : DONUT_ORDER.indexOf(filter)}
              onSelect={(i) => setFilter(i === null ? 'all' : DONUT_ORDER[i])}
              data={[
                { label: 'Sesuai jadwal', value: counts.on, tone: 'on' },
                { label: 'Perlu perhatian', value: counts.risk, tone: 'risk' },
                { label: 'Terlambat', value: counts.late, tone: 'late' },
                { label: 'Belum mulai', value: counts.neutral, tone: 'neutral' },
                { label: 'Selesai', value: counts.done, tone: 'info' },
              ]}
            />
          </Card>
        </div>
      )}

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Proyek prioritas"
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
              {filtered.slice(0, 8).map((p) => (
                <ProjectRow
                  key={p.id}
                  name={p.name}
                  division={p.divisionName ? `${p.divisionName} · ${p.entityCode}` : p.entityName}
                  divisionTone={p.divisionName ? divisionTone(p.divisionName) : seriesTone(data.byEntity.findIndex((e) => e.id === p.entityId))}
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
        {divisionPerf.length > 0 ? (
          <Card className="is-narrow" title="Kinerja divisi" subtitle="Tepat waktu per divisi · target 85%">
            <div className="flex flex-col gap-4">
              {divisionPerf.slice(0, 8).map((d, i) => (
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

      <div className="mk-row">
        <div className="is-half flex" id="mk-persetujuan" tabIndex={-1}>
          <Card
            className="flex-1"
            title={approvals || data.decisions.length || proposals.length || requests.length ? 'Persetujuan menunggu' : 'Keputusan terbuka'}
            subtitle={decides ? 'Materi, anggaran, cuti, pengajuan proyek, usulan tenggat, dan eskalasi' : 'Materi, anggaran, cuti, pengajuan proyek, dan usulan tenggat'}
            action={
              data.escalations.length > 0 && seesEscalations ? (
                <Button size="sm" variant="secondary" onClick={() => setActiveTab('escalations')}>
                  Buka eskalasi
                </Button>
              ) : undefined
            }
          >
            {data.decisions.length === 0 && proposals.length === 0 && requests.length === 0 && data.escalations.length === 0 ? (
              <EmptyNote done>Semua persetujuan sudah beres.</EmptyNote>
            ) : (
              <div>
                <ApprovalRequestItems items={requests.slice(0, 5)} ctl={approvalCtl} canDecide={viewer?.canDecideApproval !== false} />
                {data.decisions.slice(0, 5).map((d) => (
                  <ApprovalItem
                    key={d.id}
                    title={`Proyek baru: ${d.name}`}
                    requester={d.proposer}
                    initials={initials(d.proposer)}
                    time={formatRelative(d.proposedAt)}
                    amount={d.entityName}
                    state={decided[d.id] ?? 'pending'}
                    busy={deciding === d.id}
                    onApprove={() => approveProject(d.id)}
                    onReject={() => setActiveTab('projects')}
                    rejectLabel="Tinjau"
                  />
                ))}
                {viewer?.canDecideDeadline !== false && <DeadlineProposalItems items={proposals.slice(0, 5)} ctl={deadline} />}
                {data.escalations.slice(0, 5).map((e) => (
                  <AttentionItem
                    key={e.id}
                    title={e.summary}
                    reason={`${e.entityName} · butuh ${(ESCALATION_NEEDED_LABELS[e.needed] ?? e.needed).toLowerCase()}`}
                    status={e.overdue ? 'late' : 'risk'}
                    meta={e.overdue ? `lewat SLA, ${e.ageDays} hari` : `${e.ageDays} hari`}
                    onClick={() => setActiveTab(seesEscalations ? 'escalations' : 'audit')}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
        <Card className={data.attendance ? 'is-narrow' : 'is-half'} title="Aktivitas terbaru" subtitle="Yang terjadi di cakupan Anda">
          {data.activity.length === 0 ? (
            <EmptyNote>Belum ada aktivitas.</EmptyNote>
          ) : (
            <div>
              {data.activity.slice(0, 5).map((a, i, arr) => (
                <ActivityItem
                  key={a.id}
                  who={a.who}
                  initials={initials(a.who)}
                  tone={seriesTone(i + 2)}
                  action={a.text}
                  time={formatRelative(a.at)}
                  last={i === arr.length - 1}
                />
              ))}
            </div>
          )}
        </Card>
        {data.attendance ? <AttendanceCard {...data.attendance} late={data.attendance.late ?? 0} /> : null}
      </div>

      {/* [F2-GRUP] panel khusus SDM GA / TI / Super Admin / Auditor */}
      <GroupRolePanel data={data} />

      <EntityActivityBoard />

      <ProjectSheet project={open} onClose={() => setOpen(null)} />
      <RejectDeadlineSheet ctl={deadline} />
      <RejectApprovalSheet ctl={approvalCtl} />
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
