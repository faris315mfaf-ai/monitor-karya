'use client'

/**
 * Dashboard peran yang mengisi data: PIC proyek (05-pic-proyek.md), Kepala divisi
 * (03-kepala-divisi.md), Admin PT (04-admin-pt.md). Layar PIC adalah layar kerja:
 * tombol dan isian lebih menonjol daripada grafik.
 */

import { useMemo, useRef, useState } from 'react'
import { useApp } from '@/components/app-provider'
import {
  ActivityRings, AreaChart, AttentionItem, BarChart, Button, Card, Chip, DateBox, DivisionBar,
  EmptyNote, FlowDiagram, Hero, useIsPhone, ProgressBar, ProgressRing, SegmentedControl, StatTile, StatusBadge,
  type Status,
} from '@/components/mk'
import { DailyStatusBadge, WeeklyHeaderBadge, weeklyHeaderStatus, weeklyItemStatus } from '@/components/status-badges'
import { DashHeader, phaseSteps } from '@/components/views/dash-common'
import { WEEKLY_STATUS_META } from '@/lib/constants'
import { DAILY_CUTOFF_LABEL } from '@/lib/lock'
import { formatDateShort, formatNumber, formatPercent, formatTime } from '@/lib/format'
import { AdminSummary } from '@/components/admin/admin-summary' // [F2-ADMIN]
import { useOutputs, useProjectProgress, useProposals } from '@/components/pic/api'
import { OutputsCard } from '@/components/pic/outputs'
import { NotesCard } from '@/components/pic/notes'
import { StagesCard } from '@/components/pic/stages'
import { DeadlinesCard, ProgressPlanCard, ReportHistoryCard, useIsCompact } from '@/components/pic/dashboard-parts'
import { DailyReportCard } from '@/components/views/daily-input-view'
import {
  ATTENDANCE_LABELS, DivisionProjectsCard, OutputHeatmapCard, ReviewOutputCard, TeamActivityCard, TeamDailyCard, WeeklySummaryCard, WorkloadCard,
  useKadivData, useTeamSheets,
} from '@/components/kadiv'

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const DAY = 86400000

// ------------------------------------------------------------------
// PIC proyek — apa yang harus saya laporkan hari ini?
// ------------------------------------------------------------------

type PicProject = {
  id: string
  code: string
  name: string
  phase: string
  startDate: string | null
  targetEndDate: string | null
  entityName: string
  status: string | null
  progressPct: number | null
  evidenceCount: number
  submitted: boolean
  forwarded: boolean
  needsEscalation: boolean
  derivedStatus: Status
  reason: string | null
  latestProgress: number
  latest: { reportDate: string; achievementToday: string; obstacle: string | null; followUp: string | null } | null
  history: { reportDate: string; status: string; progressPct: number; submitted: boolean; forwarded: boolean; isLate: boolean }[]
}

export type PicData = {
  kind: 'PIC'
  countdown: { hours: number; minutes: number; passed: boolean }
  lockAt: string
  summary: { projects: number; submitted: number; outstanding: number; blocked: number; onTimePct: number }
  projects: PicProject[]
}

/** "Tenggat 17.00 · 2 jam 40 menit lagi" / "Tenggat 17.00 · lewat 4 menit" (tanpa menyalahkan). */
function deadlineText(c: PicData['countdown'], lockAt: string) {
  if (c.passed) {
    const mins = Math.max(0, Math.floor((Date.now() - Date.parse(lockAt)) / 60000))
    const late = mins < 60 ? `${mins} menit` : mins < 24 * 60 ? `${Math.floor(mins / 60)} jam ${mins % 60} menit` : null
    return late ? `Tenggat ${DAILY_CUTOFF_LABEL} · lewat ${late}` : `Tenggat ${DAILY_CUTOFF_LABEL} sudah lewat`
  }
  return c.hours > 0 ? `Tenggat ${DAILY_CUTOFF_LABEL} · ${c.hours} jam ${c.minutes} menit lagi` : `Tenggat ${DAILY_CUTOFF_LABEL} · ${c.minutes} menit lagi`
}

function daysLeft(iso: string | null) {
  if (!iso) return null
  return Math.ceil((Date.parse(iso) - Date.now()) / DAY)
}

/** Gulir halus ke elemen (instan bila pengguna memilih gerak dikurangi). */
function scrollToEl(el: HTMLElement | null) {
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

/** Tab layar PIC di tablet & ponsel (05-pic-proyek.md: Hari ini · Output · Laporan · Catatan). */
type PicSection = 'hari-ini' | 'output' | 'laporan' | 'catatan'
const PIC_SECTIONS: { value: PicSection; label: string }[] = [
  { value: 'hari-ini', label: 'Hari ini' },
  { value: 'output', label: 'Output' },
  { value: 'laporan', label: 'Laporan' },
  { value: 'catatan', label: 'Catatan' },
]

export function PicDashboard({ data }: { data: PicData }) {
  const s = data.summary
  const [picked, setPicked] = useState(0)
  const [section, setSection] = useState<PicSection>('hari-ini')
  const p = data.projects[Math.min(picked, Math.max(0, data.projects.length - 1))] ?? null
  const single = data.projects.length === 1
  const phone = useIsPhone()
  // Tablet & ponsel: layar dipecah jadi empat tab; desktop menampilkan semuanya.
  const compact = useIsCompact()
  // Fitur PIC (6 Okt 2026): output, catatan kepala divisi, tahapan & usulan tenggat;
  // [F2-PIC] progres vs rencana, tenggat terdekat, riwayat laporan, jam kirim hari ini.
  const outputs = useOutputs(p?.id ?? null)
  const proposals = useProposals(p?.id ?? null)
  const progress = useProjectProgress(p?.id ?? null)
  const reportRef = useRef<HTMLDivElement>(null)
  const stagesRef = useRef<HTMLDivElement>(null)

  if (!p) {
    return (
      <>
        <DashHeader />
        <Card>
          <EmptyNote icon="proyek">Belum ada proyek yang ditugaskan kepada Anda. Hubungi Admin PT.</EmptyNote>
        </Card>
      </>
    )
  }

  // Lencana header & kalimat hero memakai keadaan laporan terbaru (dimuat ulang setelah kirim).
  const today = progress.data?.projectId === p.id ? progress.data.today : undefined
  const submitted = today === undefined ? p.submitted : Boolean(today?.submittedAt)
  const forwarded = today === undefined ? p.forwarded : Boolean(today?.forwardedAt)
  const sentAt = today?.submittedAt ?? null
  const todayBadge = submitted ? (
    <StatusBadge status="done">
      Laporan hari ini · {forwarded ? 'Diteruskan' : sentAt ? `Terkirim ${formatTime(sentAt)}` : 'Terkirim'}
    </StatusBadge>
  ) : (
    <StatusBadge status={data.countdown.passed ? 'late' : 'risk'}>Laporan hari ini · Belum dikirim</StatusBadge>
  )

  const left = daysLeft(p.targetEndDate)
  const history = p.history
  const proposed = proposals.data?.items.find((x) => x.status === 'DIAJUKAN') ?? null
  const oc = outputs.data && outputs.data.total > 0 ? outputs.data.counts : null
  const oTotal = outputs.data?.total ?? 0
  const firstRevision = outputs.data?.items.find((o) => o.status === 'PERLU_REVISI') ?? null
  const firstWaiting = outputs.data?.items.find((o) => o.status === 'MENUNGGU_REVIEW') ?? null
  // Peninjau output = kepala divisi yang terakhir mereview output proyek ini.
  const reviewer = outputs.data?.items.find((o) => o.reviewerName)?.reviewerName ?? null

  const reportLine = forwarded
    ? 'Laporan hari ini sudah diteruskan ke holding.'
    : submitted
      ? `Laporan hari ini sudah terkirim ke Admin PT${sentAt ? ` pukul ${formatTime(sentAt)}` : ''}.`
      : `Laporan hari ini belum dikirim. ${deadlineText(data.countdown, data.lockAt)}.`
  const support = [
    p.reason ? `${p.reason}.` : null,
    proposed ? `Usulan geser tenggat ke ${formatDateShort(proposed.proposedDate)} sedang ditinjau Direktur.` : null,
    reportLine,
  ]
    .filter(Boolean)
    .join(' ')

  function goReport() {
    if (compact) setSection('hari-ini')
    requestAnimationFrame(() => scrollToEl(reportRef.current))
  }
  function goStages() {
    if (compact) setSection('laporan')
    requestAnimationFrame(() => scrollToEl(stagesRef.current))
  }

  const deadlineDelta =
    (p.targetEndDate ? (left !== null && left < 0 ? `Lewat sejak ${formatDateShort(p.targetEndDate)}` : formatDateShort(p.targetEndDate)) : 'Belum ditetapkan') +
    (proposed ? ` · usul ${formatDateShort(proposed.proposedDate)}` : '')
  const deadlineTile = (
    <StatTile
      label="Menuju tenggat"
      value={left === null ? '—' : left < 0 ? `${-left} hari` : `${left} hari`}
      delta={deadlineDelta}
      tone={left !== null && left < 0 ? 'late' : 'neutral'}
    />
  )
  const kpis = oc ? (
    <>
      <StatTile variant="gradient" label="Output selesai" value={`${oc.DITERIMA} dari ${oTotal}`} delta={`${pct(oc.DITERIMA, oTotal)}% output proyek diterima`} />
      <StatTile
        label="Menunggu review"
        value={oc.MENUNGGU_REVIEW}
        delta={oc.MENUNGGU_REVIEW ? (reviewer ? `oleh ${reviewer}` : (firstWaiting?.title ?? 'oleh kepala divisi')) : 'Tidak ada yang menunggu'}
        tone={oc.MENUNGGU_REVIEW ? 'neutral' : 'on'}
      />
      <StatTile label="Perlu revisi" value={oc.PERLU_REVISI} delta={firstRevision ? firstRevision.title : 'Tidak ada revisi'} tone={oc.PERLU_REVISI ? 'risk' : 'on'} />
      {deadlineTile}
    </>
  ) : (
    <>
      <StatTile
        variant="gradient"
        label="Progres proyek"
        value={`${p.latestProgress}%`}
        delta={history.length > 1 ? `+${Math.max(0, p.latestProgress - history[0].progressPct)} poin dalam ${history.length} laporan` : 'Laporan pertama'}
        trend={history.length > 1 && p.latestProgress > history[0].progressPct ? 'up' : 'flat'}
        spark={history.map((h) => h.progressPct)}
      />
      <StatTile
        label="Tepat waktu 7 hari"
        value={formatPercent(s.onTimePct, 0)}
        delta={s.onTimePct >= 85 ? 'Di atas target 85%' : 'Target 85%'}
        tone={s.onTimePct >= 85 ? 'on' : 'risk'}
      />
      {deadlineTile}
      <StatTile label="Bukti hari ini" value={p.evidenceCount} delta={p.evidenceCount ? 'Terlampir di laporan' : 'Belum ada bukti'} tone={p.evidenceCount ? 'on' : 'risk'} />
    </>
  )

  const show = (sec: PicSection) => !compact || section === sec
  const reportCard = (
    <div ref={reportRef} className="is-wide flex min-w-0 scroll-mt-4">
      <DailyReportCard key={`lap-${p.id}`} className="flex-1 min-w-0" projectId={p.id} onChanged={progress.reload} />
    </div>
  )
  const stagesCard = (
    <div ref={stagesRef} className="is-narrow flex min-w-0 scroll-mt-4">
      <StagesCard key={`tahap-${p.id}`} className="flex-1 min-w-0" projectId={p.id} projectName={p.name} fallback={phaseSteps(p.phase, p.derivedStatus, p.reason)} />
    </div>
  )

  return (
    <>
      <DashHeader context={single ? p.name : `${s.projects} proyek`} tools={todayBadge} />

      {!single && (
        <div className="mk-chips" role="group" aria-label="Pilih proyek">
          {data.projects.map((x, i) => (
            <Chip key={x.id} selected={i === picked} status={x.derivedStatus} onClick={() => setPicked(i)}>
              {x.name}
            </Chip>
          ))}
        </div>
      )}

      {compact && (
        <SegmentedControl
          label="Bagian layar PIC"
          options={PIC_SECTIONS}
          value={section}
          onChange={(v) => setSection(v as PicSection)}
          full={phone}
        />
      )}

      {show('hari-ini') && (
        <Hero
          eyebrow={<StatusBadge status={p.derivedStatus} size="sm" />}
          answer={`${p.name} ${p.latestProgress}% selesai.`}
          support={support}
          actions={
            <>
              <Button variant="primary" icon={submitted ? 'catatan' : 'tambah'} onClick={goReport}>
                {submitted ? 'Lihat laporan harian' : 'Isi laporan harian'}
              </Button>
              <Button variant="plain" onClick={goStages}>
                Lihat tahapan
              </Button>
            </>
          }
          art={
            <ProgressRing
              value={p.latestProgress}
              size={phone ? 96 : 176}
              status={p.derivedStatus === 'neutral' ? 'accent' : p.derivedStatus}
              sublabel="selesai"
              ariaLabel={`${p.name} ${p.latestProgress}% selesai`}
            />
          }
          kpis={compact ? undefined : kpis}
        />
      )}

      {compact ? (
        <>
          {section === 'hari-ini' && <div className="mk-row">{reportCard}</div>}
          {section === 'output' && (
            <>
              <div className="mk-pic-kpis">{kpis}</div>
              <OutputsCard key={`output-${p.id}`} projectId={p.id} projectName={p.name} res={outputs} />
            </>
          )}
          {section === 'laporan' && (
            <>
              <ProgressPlanCard key={`rencana-${p.id}`} res={progress} />
              <div className="mk-row">
                {stagesCard}
                <ReportHistoryCard className="is-narrow" res={progress} />
              </div>
              <DeadlinesCard res={progress} />
            </>
          )}
          {section === 'catatan' && <NotesCard key={`catatan-${p.id}`} projectId={p.id} />}
        </>
      ) : (
        <>
          <div className="mk-row">
            {reportCard}
            {stagesCard}
          </div>
          <div className="mk-row">
            <OutputsCard key={`output-${p.id}`} className="is-wide" projectId={p.id} projectName={p.name} res={outputs} />
            <NotesCard key={`catatan-${p.id}`} className="is-narrow" projectId={p.id} />
          </div>
          <div className="mk-row">
            <ProgressPlanCard key={`rencana-${p.id}`} className="is-wide" res={progress} />
            <DeadlinesCard className="is-narrow" res={progress} />
          </div>
          <ReportHistoryCard res={progress} />
        </>
      )}
    </>
  )
}

// ------------------------------------------------------------------
// Kepala divisi — apakah capaian minggu ini siap diserahkan?
// ------------------------------------------------------------------

export type KadivData = {
  kind: 'KADIV'
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string }
  handoverHoursLeft: number
  handoverPassed: boolean
  summary: { divisions: number; items: number; done: number; blocked: number; missingEvidence: number; needsEscalation: number }
  byStatus: Record<string, number>
  history: { label: string; done: number; total: number }[]
  items: {
    id: string
    workItem: string
    picName: string
    targetDate: string | null
    progressPct: number
    status: string
    priority: string | null
    needsEscalation: boolean
    evidenceCount: number
  }[]
  divisions: { id: string; name: string; statusHeader: string; itemCount: number; submitted: boolean; approved: boolean; forwarded: boolean }[]
}

const ITEM_FILTERS = ['ALL', 'TERKENDALA', 'ON_PROGRESS', 'BELUM_MULAI', 'SELESAI'] as const

export function KadivDashboard({ data }: { data: KadivData }) {
  const { setActiveTab } = useApp()
  const s = data.summary
  const [filter, setFilter] = useState<(typeof ITEM_FILTERS)[number]>('ALL')
  const div = data.divisions[0]
  const divName = data.divisions.length === 1 ? `Divisi ${div.name}` : `${data.divisions.length} divisi Anda`
  const anySubmitted = data.divisions.some((d) => d.submitted)
  const allApproved = data.divisions.length > 0 && data.divisions.every((d) => d.approved)
  const allForwarded = data.divisions.length > 0 && data.divisions.every((d) => d.forwarded)
  const handover = new Date(data.week.handoverBy)
  const handoverLabel = `${new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(handover)} ${formatTime(handover)}`
  const items = useMemo(() => (filter === 'ALL' ? data.items : data.items.filter((i) => i.status === filter)), [data.items, filter])
  const withEvidence = s.items - s.missingEvidence
  const hist = data.history

  // Fitur tim (P2-B, 03-kepala-divisi.md): output, laporan harian tim, kehadiran, beban kerja.
  // Bila datanya belum tersedia (mis. migrasi 0015 belum dijalankan) hero kembali ke capaian mingguan.
  const kadiv = useKadivData(div?.id ?? null)
  const sheets = useTeamSheets(kadiv)
  const team = kadiv.team?.division ? kadiv.team : null
  const t = team?.summary
  const pending = kadiv.review?.queue.length ?? t?.pendingReview ?? 0
  const outputMode = Boolean(t && (t.outputsTarget > 0 || pending > 0))
  const notIn = t ? t.reporters - t.reported : 0
  // [F2-KADIV] Tepat waktu 30 hari & proyek yang perlu perhatian (dari /api/kadiv/team).
  const onTime = team?.onTime30
  const troubled = team?.projects.filter((p) => p.status === 'late' || p.status === 'risk') ?? []
  const away = team?.members.filter((m) => m.attendance !== 'HADIR' && m.attendance !== 'TERLAMBAT') ?? [] // [F2-DIREKTUR] terlambat = hadir
  const absentSub = away.length
    ? away.length === 1
      ? `${away[0].name.split(/\s+/)[0]} ${ATTENDANCE_LABELS[away[0].attendance].toLowerCase()}, tidak dihitung`
      : `${away.length} orang tidak hadir, tidak dihitung`
    : undefined
  const scrollTo = (id: string) => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  const flow = [
    { title: 'Isi capaian', sub: `${s.items} item`, status: s.items > 0 ? 'done' : 'current', icon: 'catatan' },
    { title: 'Serahkan', sub: `paling lambat ${handoverLabel}`, status: anySubmitted ? 'done' : s.missingEvidence > 0 ? 'blocked' : s.items > 0 ? 'current' : 'todo', icon: 'kirim', meta: !anySubmitted && s.missingEvidence > 0 ? `${s.missingEvidence} item tanpa bukti` : undefined },
    { title: 'Setujui', sub: 'oleh Anda', status: allApproved ? 'done' : anySubmitted ? 'current' : 'todo', icon: 'persetujuan' },
    { title: 'Diteruskan', sub: 'Admin PT ke holding', status: allForwarded ? 'done' : allApproved ? 'current' : 'todo', icon: 'dokumen' },
  ] as const

  return (
    <>
      <DashHeader
        context={team ? `${divName} · ${t?.members ?? 0} orang` : divName}
        tools={
          team ? (
            <Button variant="secondary" size="sm" icon="dokumen" onClick={() => scrollTo('kadiv-weekly-summary')}>
              Laporan mingguan M{data.week.isoWeek}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon="kalender" onClick={() => setActiveTab('weekly-input')}>
              Isi capaian M{data.week.isoWeek}
            </Button>
          )
        }
      />

      <Hero
        eyebrow={
          team
            ? `Minggu ke-${data.week.isoWeek} · ${team.projects.length} proyek aktif`
            : `Minggu ke-${data.week.isoWeek} · ${formatNumber(s.items)} item pekerjaan`
        }
        answer={
          outputMode && t
            ? `${divName} menyelesaikan ${formatNumber(t.outputsAccepted)} output minggu ini.`
            : s.items === 0
              ? `${divName} belum mengisi capaian minggu ini.`
              : `${divName} menyelesaikan ${formatNumber(s.done)} dari ${formatNumber(s.items)} item minggu ini.`
        }
        support={[
          pending ? `${pending} output menunggu review Anda.` : null,
          t && t.reporters > 0 ? (notIn ? `${notIn} laporan harian belum masuk.` : 'Semua laporan harian sudah masuk.') : null,
          troubled.length
            ? `${troubled[0].name} ${troubled[0].status === 'late' ? 'terlambat' : 'perlu perhatian'}${troubled.length > 1 ? `, dan ${troubled.length - 1} proyek lain` : ''}.`
            : null,
          s.blocked ? `${s.blocked} item terkendala.` : team ? null : 'Tidak ada item terkendala.',
          s.missingEvidence ? `${s.missingEvidence} item belum punya bukti.` : null,
          data.handoverPassed ? 'Tenggat penyerahan sudah lewat.' : `Serahkan ke Admin PT paling lambat ${handoverLabel}.`,
        ]
          .filter(Boolean)
          .join(' ')}
        actions={
          pending > 0 ? (
            <>
              <Button variant="primary" onClick={() => scrollTo('kadiv-review')}>
                Review {pending} output
              </Button>
              <Button variant="plain" onClick={() => scrollTo('kadiv-daily')}>
                Lihat laporan harian
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={() => setActiveTab('weekly-input')}>
                Isi capaian mingguan
              </Button>
              <Button variant="plain" onClick={() => (team ? scrollTo('kadiv-daily') : setActiveTab('divisions'))}>
                {team ? 'Lihat laporan harian' : 'Buka modul divisi'}
              </Button>
            </>
          )
        }
        art={
          <ActivityRings
            size={176}
            rings={
              t
                ? [
                    { label: 'Laporan harian', value: pct(t.reported, t.reporters), tone: 'accent', display: `${t.reported} dari ${t.reporters}`, sub: absentSub },
                    outputMode
                      ? { label: 'Output', value: pct(t.outputsAccepted, t.outputsTarget), tone: 'hijau', display: `${t.outputsAccepted} dari ${t.outputsTarget}` }
                      : { label: 'Item selesai', value: pct(s.done, s.items), tone: 'hijau', display: `${s.done} dari ${s.items}` },
                    { label: 'Kehadiran', value: pct(t.present, t.members), tone: 'biru', display: `${t.present} dari ${t.members}` },
                  ]
                : [
                    { label: 'Item selesai', value: pct(s.done, s.items), tone: 'accent', display: `${s.done} dari ${s.items}` },
                    { label: 'Bukti lengkap', value: pct(withEvidence, s.items), tone: 'hijau', display: `${withEvidence} dari ${s.items}` },
                    {
                      label: 'Disetujui',
                      value: pct(data.divisions.filter((d) => d.approved).length, data.divisions.length),
                      tone: 'biru',
                      display: `${data.divisions.filter((d) => d.approved).length} dari ${data.divisions.length}`,
                      sub: 'divisi',
                    },
                  ]
            }
          />
        }
        kpis={
          outputMode && t ? (
            <>
              <StatTile
                variant="gradient"
                label="Output selesai"
                value={t.outputsAccepted}
                delta={`${t.outputsAccepted} dari ${t.outputsTarget}`}
                spark={team?.trend.map((w) => w.accepted)}
              />
              <StatTile label="Menunggu review" value={pending} delta={pending ? 'Belum dihitung selesai' : 'Antrean kosong'} tone={pending ? 'risk' : 'on'} />
              <StatTile
                label="Rata-rata beban kerja"
                value={t.avgLoad === null ? '-' : `${t.avgLoad}%`}
                delta={t.overloaded ? `${t.overloaded} orang di atas 100%` : 'Batas sehat 80%'}
                tone={t.overloaded ? 'late' : t.avgLoad !== null && t.avgLoad > 80 ? 'risk' : 'on'}
              />
              <StatTile
                label="Tepat waktu 30 hari"
                value={onTime?.pct === null || onTime?.pct === undefined ? '-' : `${onTime.pct}%`}
                delta={onTime && onTime.total ? `Target ${onTime.target}% · ${onTime.ok} dari ${onTime.total} laporan` : `Target ${onTime?.target ?? 85}%`}
                tone={onTime?.pct === null || onTime?.pct === undefined ? 'neutral' : onTime.pct >= onTime.target ? 'on' : 'risk'}
              />
            </>
          ) : (
            <>
              <StatTile
                variant="gradient"
                label="Item selesai"
                value={s.done}
                delta={`${pct(s.done, s.items)}% dari ${s.items} item`}
                spark={hist.map((h) => h.done)}
              />
              <StatTile label="Terkendala" value={s.blocked} delta={s.needsEscalation ? `${s.needsEscalation} perlu eskalasi` : 'Tidak ada eskalasi'} tone={s.blocked ? 'risk' : 'on'} />
              <StatTile label="Bukti kurang" value={s.missingEvidence} delta={s.missingEvidence ? 'Menahan penyerahan' : 'Semua item berbukti'} tone={s.missingEvidence ? 'late' : 'on'} />
              <StatTile
                label="Sisa waktu serah"
                value={data.handoverPassed ? 'Lewat' : `${data.handoverHoursLeft} jam`}
                delta={handoverLabel}
                tone={data.handoverPassed ? 'late' : data.handoverHoursLeft < 24 ? 'risk' : 'neutral'}
              />
            </>
          )
        }
      />

      <div className="mk-row">
        <ReviewOutputCard id="kadiv-review" ctl={kadiv} className="is-wide" />
        <TeamDailyCard id="kadiv-daily" ctl={kadiv} sheets={sheets} className="is-narrow" />
      </div>

      {team && (
        <div className="mk-row">
          <DivisionProjectsCard id="kadiv-projects" ctl={kadiv} className="is-wide" />
        </div>
      )}

      <div className="mk-row">
        <WorkloadCard ctl={kadiv} className="is-half" />
        <OutputHeatmapCard ctl={kadiv} className="is-half" />
      </div>

      <div className="mk-row">
        {team ? (
          <WeeklySummaryCard
            id="kadiv-weekly-summary"
            divisionId={team.division?.id}
            pendingReview={kadiv.review?.queue.length}
            onReview={() => scrollTo('kadiv-review')}
            className="is-wide"
          />
        ) : null}
        <TeamActivityCard ctl={kadiv} className={team ? 'is-narrow' : 'is-wide'} />
      </div>

      <div className="mk-row">
        <Card
          className="is-wide"
          title="Capaian minggu ini"
          subtitle="Item baru dihitung selesai setelah berstatus Selesai dan berbukti"
          action={
            <Button size="sm" variant="secondary" onClick={() => setActiveTab('weekly-input')}>
              Buka isian
            </Button>
          }
        >
          <div className="mk-chips mb-3">
            {ITEM_FILTERS.map((f) => (
              <Chip
                key={f}
                selected={filter === f}
                status={f === 'ALL' ? undefined : weeklyItemStatus(f)}
                count={f === 'ALL' ? data.items.length : (data.byStatus[f] ?? 0)}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? 'Semua' : WEEKLY_STATUS_META[f]?.label}
              </Chip>
            ))}
          </div>
          {items.length === 0 ? (
            <EmptyNote>{data.items.length === 0 ? 'Belum ada item pekerjaan minggu ini.' : 'Tidak ada item dengan status ini.'}</EmptyNote>
          ) : (
            <div className="mk-list">
              {items.slice(0, 8).map((i) => (
                <div key={i.id} className="mk-listrow flex-wrap">
                  <div className="min-w-0 flex-[2_1_220px]">
                    <div className="t-body-strong truncate">{i.workItem}</div>
                    <div className="t-footnote text-ink-2 truncate">
                      {i.picName}
                      {i.targetDate ? ` · target ${formatDateShort(i.targetDate)}` : ''}
                      {i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status) ? ' · belum ada bukti' : ''}
                    </div>
                  </div>
                  <ProgressBar className="flex-[1_1_140px]" value={i.progressPct} status={weeklyItemStatus(i.status) === 'neutral' ? 'accent' : weeklyItemStatus(i.status)} label={`Progres ${i.workItem}`} />
                  <StatusBadge status={weeklyItemStatus(i.status)} size="sm">
                    {WEEKLY_STATUS_META[i.status]?.label}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="is-narrow" title="Penyerahan minggu ini" subtitle={data.handoverPassed ? 'Tenggat penyerahan sudah lewat' : `Tenggat ${handoverLabel}`}>
          <div className="flex flex-col gap-5">
            <FlowDiagram orientation="vertical" steps={flow.map((f) => ({ ...f }))} label="Alur penyerahan mingguan" />
            {data.divisions.length > 1 && (
              <div className="mk-list">
                {data.divisions.map((d) => (
                  <div key={d.id} className="mk-listrow">
                    <span className="t-body flex-1 truncate">{d.name}</span>
                    <WeeklyHeaderBadge status={d.statusHeader} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {sheets.element}
    </>
  )
}

// ------------------------------------------------------------------
// Admin PT — siapa yang belum lapor, apa yang harus diteruskan?
// ------------------------------------------------------------------

export type AdminData = {
  kind: 'ADMIN'
  entity: { name: string; code: string; region: string | null } | null
  countdown: { hours: number; minutes: number; passed: boolean }
  summary: {
    projects: number
    divisions: number
    dailyReceived: number
    dailyAwaitingForward: number
    dailyMissing: number
    weeklyApproved: number
    weeklyAwaitingForward: number
    weeklyDraft: number
    lateThisMonth: number
    openEscalations: number
    complianceScore: number
    onTimeDailyPct: number
  }
  missing: { id: string; name: string; pic: string | null }[]
  divisionsWeekly: { id: string; name: string; head: string | null; statusHeader: string | null; submittedAt: string | null; forwardedAt: string | null }[]
  days: { date: string; submitted: number; onTime: number }[]
}

export function AdminDashboard({ data }: { data: AdminData }) {
  // [F2-ADMIN] Ringkasan Admin PT lengkap (04-admin-pt.md) ada di src/components/admin/admin-summary.tsx.
  return <AdminSummary data={data} />
}
