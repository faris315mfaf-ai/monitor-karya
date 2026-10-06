'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import {
  Button, Card, Chip, EmptyNote, ErrorNote, FlowDiagram, Hero, Icon, ProgressBar, ProgressRing, SegmentedControl,
  Sheet, Skeleton, StatTile, StatusBadge, statusFromDaily, useIsPhone, type FlowStep, type Status,
} from '@/components/mk'
import { DashHeader } from '@/components/views/dash-common'
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel, type EvidencePanelHandle } from '@/components/evidence-panel'
import { TaskSection } from '@/components/task-section'
import { ProgressReportPanel } from '@/components/progress-report-panel'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { Field, selectCls, useConfirm } from '@/components/companies/parts'
import { DAILY_STATUS_META, PROJECT_PHASE_LABELS } from '@/lib/constants'
import { formatDateLong, formatDateShort, formatDateTime, formatTime } from '@/lib/format'

type Evidence = { id: string; fileName: string; url: string | null; mime?: string | null; size?: number | null; createdAt: string }

type Report = {
  id: string
  status: string
  progressPct: number
  achievementToday: string
  obstacle: string | null
  followUp: string | null
  decisionRequestedFrom: string | null
  evidenceCount: number
  submittedAt: string | null
  forwardedAt: string | null
  isLocked: boolean
  evidence: Evidence[]
}

type LockReason = 'FORWARDED' | 'LOCKED' | 'TIME'

/** Buka kunci yang masih diproses (DIAJUKAN/DISETUJUI) atau sedang berlaku (DIEKSEKUSI). */
type UnlockInfo = { id: string; status: 'DIAJUKAN' | 'DISETUJUI' | 'DIEKSEKUSI' | string; unlockUntil: string | null }

type ProjectItem = {
  id: string
  code: string
  name: string
  phase: string
  taskCount: number
  derived: boolean
  /** Dihitung server: boleh ditulis (tidak beku, tidak lewat tenggat, atau sedang dibuka). */
  editable?: boolean
  lockReason?: LockReason | null
  unlock?: UnlockInfo | null
  report: Report | null
}

type OpenDay = { reportId: string; projectId: string; projectName: string; date: string; unlockUntil: string | null }

type Data = {
  reportDate: string
  /** "YYYY-MM-DD" WIB dari tanggal yang sedang dibuka. */
  reportDateKey?: string
  /** false bila sedang membuka tanggal lampau. */
  today?: boolean
  lockAt: string
  /** Lewat tenggat 17.00 tanggal itu. */
  locked: boolean
  countdown: { hours: number; minutes: number; passed: boolean }
  todayKey?: string
  canRequestUnlock?: boolean
  /** Laporan tanggal lain yang sedang dibuka lewat buka kunci. */
  openDays?: OpenDay[]
  projects: ProjectItem[]
}

type Cadence = 'HARIAN' | 'MINGGUAN' | 'BULANAN'

const STATUS_OPTIONS = ['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN', 'TIDAK_ADA_PERUBAHAN']

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'HARIAN', label: 'Harian' },
  { value: 'MINGGUAN', label: 'Mingguan' },
  { value: 'BULANAN', label: 'Bulanan' },
]

/** Tidak bisa ditulis? Pakai jawaban server; tanpa itu (data lama) simpulkan dari laporan. */
function isLockedFor(p: ProjectItem, dayLocked: boolean): boolean {
  if (typeof p.editable === 'boolean') return !p.editable
  return dayLocked || Boolean(p.report?.forwardedAt) || Boolean(p.report?.isLocked)
}

const isUnlocked = (p: ProjectItem) => p.unlock?.status === 'DIEKSEKUSI'

/** Keadaan laporan harian satu proyek dalam kosakata status desain. */
function reportState(p: ProjectItem, locked: boolean): { status: Status; label: string } {
  const r = p.report
  if (isUnlocked(p)) return { status: 'info', label: `Dibuka sampai ${formatDateTime(p.unlock!.unlockUntil)}` }
  if (r?.forwardedAt) return { status: 'done', label: 'Diteruskan ke holding' }
  if (r?.submittedAt) return { status: 'done', label: `Terkirim ${formatTime(r.submittedAt)}` }
  if (r) return { status: locked ? 'late' : 'risk', label: locked ? 'Draf terkunci' : 'Draf belum dikirim' }
  return { status: locked ? 'late' : 'neutral', label: locked ? 'Tidak dikirim' : 'Belum diisi' }
}

/** Alur laporan harian: isi → terkirim ke Admin PT → diteruskan ke holding → bahan laporan mingguan. */
function reportFlow(p: ProjectItem, locked: boolean, lockAt: string): FlowStep[] {
  const r = p.report
  const sent = Boolean(r?.submittedAt)
  return [
    {
      title: 'Isi laporan',
      sub: `${p.taskCount} progress tercatat`,
      icon: 'catatan',
      status: sent ? 'done' : locked ? 'blocked' : 'current',
      meta: sent ? undefined : locked ? 'Terkunci' : r ? 'Draf tersimpan' : 'Sedang diisi',
    },
    {
      title: 'Terkirim ke Admin PT',
      status: sent ? 'done' : 'todo',
      meta: sent ? `Pukul ${formatTime(r!.submittedAt)}` : `Tenggat ${formatTime(lockAt)}`,
    },
    {
      title: 'Diteruskan ke holding',
      status: r?.forwardedAt ? 'done' : sent ? 'current' : 'todo',
      meta: r?.forwardedAt
        ? `Pukul ${formatTime(r.forwardedAt)} · ${isUnlocked(p) ? 'dibuka' : 'dibekukan'}`
        : sent
          ? 'Menunggu Admin PT'
          : undefined,
    },
    { title: 'Laporan mingguan', icon: 'laporan', status: 'todo', meta: 'Bahan rekap minggu ini' },
  ]
}

/**
 * Laporan Kemajuan (7 Sep 2026) — satu tempat untuk tiga kadens laporan
 * proyek: HARIAN (progress per task hari ini), MINGGUAN, dan BULANAN.
 * Layar kerja PIC (05-pic-proyek.md · Laporan harian): kalimat jawaban di
 * atas, alur laporan, centang progress, kendala, bukti, lalu kirim. Seorang
 * PIC lazimnya memegang satu proyek, jadi formnya langsung terbuka; bila
 * memegang lebih dari satu, tiap proyek dibuka di Sheet.
 */
export function DailyInputView() {
  // Tanggal lampau yang sedang dibuka lewat buka kunci ("YYYY-MM-DD"); null = hari ini.
  const [day, setDay] = useState<string | null>(null)
  const { data, loading, error, reload } = useResource<Data>(`/api/daily-input${day ? `?date=${day}` : ''}`)
  const [openId, setOpenId] = useState<string | null>(null)
  const [cadence, setCadence] = useState<Cadence>('HARIAN')
  const [projectForCadence, setProjectForCadence] = useState<string>('')
  const isPhone = useIsPhone()

  if (loading && !data) {
    return (
      <>
        <DashHeader context="Laporan kemajuan" />
        <div className="mk-lap-stack" aria-busy="true" aria-label="Memuat laporan kemajuan">
          <Skeleton h={36} w={320} r={12} />
          <Skeleton h={200} r={32} />
          <Skeleton h={420} r={22} />
        </div>
      </>
    )
  }
  if (!data) {
    return (
      <>
        <DashHeader context="Laporan kemajuan" />
        <Card>
          <ErrorNote message={error ?? 'Laporan kemajuan belum termuat.'} onRetry={reload} />
        </Card>
      </>
    )
  }

  const isToday = data.today !== false
  const dateKey = isToday ? undefined : (data.reportDateKey ?? day ?? undefined)
  const dayWord = isToday ? 'hari ini' : `tanggal ${formatDateShort(data.reportDate)}`
  const single = data.projects.length === 1 ? data.projects[0] : null
  const submitted = data.projects.filter((p) => p.report?.submittedAt).length
  const outstanding = data.projects.length - submitted
  const options = data.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))
  const cadenceProject = single?.id ?? (projectForCadence || data.projects[0]?.id) ?? ''
  const opened = data.projects.find((p) => p.id === openId) ?? null
  const nextOutstanding = data.projects.find((p) => !p.report?.submittedAt && !isLockedFor(p, data.locked)) ?? null
  const singleLocked = single ? isLockedFor(single, data.locked) : data.locked
  const openDays = (data.openDays ?? []).filter((o) => o.date !== data.reportDateKey)

  const headBadge = single ? (
    <StatusBadge status={reportState(single, singleLocked).status}>
      Laporan {dayWord} · {reportState(single, singleLocked).label}
    </StatusBadge>
  ) : data.projects.length > 1 ? (
    <StatusBadge status={outstanding === 0 ? 'done' : data.locked ? 'late' : 'risk'}>
      {outstanding === 0 ? 'Semua laporan terkirim' : `${outstanding} laporan belum dikirim`}
    </StatusBadge>
  ) : null

  const answer = single
    ? isUnlocked(single)
      ? `Laporan ${single.name} ${dayWord} sedang dibuka untuk diperbaiki.`
      : single.report?.forwardedAt
        ? `Laporan ${single.name} ${dayWord} sudah diteruskan ke holding.`
        : single.report?.submittedAt
          ? `Laporan ${single.name} ${dayWord} sudah terkirim ke Admin PT.`
          : singleLocked
            ? `Laporan ${single.name} ${dayWord} tidak terkirim sebelum tenggat.`
            : `Laporan ${single.name} ${dayWord} belum dikirim.`
    : outstanding === 0
      ? `Semua ${data.projects.length} laporan ${dayWord} sudah terkirim.`
      : `${outstanding} dari ${data.projects.length} laporan ${dayWord} belum dikirim.`

  const deadline =
    single && isUnlocked(single)
      ? `Dibuka sampai ${formatDateTime(single.unlock!.unlockUntil)} WIB. Perbaiki lalu kirim ulang; setelah itu laporan dikunci kembali.`
      : single?.report?.forwardedAt
        ? 'Laporan yang sudah diteruskan dibekukan. Ajukan buka kunci bila perlu mengubahnya.'
        : data.locked
          ? outstanding > 0
            ? `Tenggat ${formatTime(data.lockAt)} WIB sudah lewat, jadi laporan ${dayWord} terkunci. Ajukan buka kunci bila perlu mengubahnya.`
            : `Tenggat ${formatTime(data.lockAt)} WIB sudah lewat; laporan ${dayWord} terkunci.`
          : `Tenggat ${formatTime(data.lockAt)} WIB · ${data.countdown.hours} jam ${data.countdown.minutes} menit lagi.${
              outstanding > 0 ? ' Catat progress, lampirkan bukti, lalu kirim.' : ''
            }`

  const ringValue = single ? (single.report?.progressPct ?? 0) : data.projects.length ? (submitted / data.projects.length) * 100 : 0
  const ringStatus: Status | 'accent' = single
    ? single.report
      ? statusFromDaily(single.report.status)
      : 'accent'
    : outstanding === 0
      ? 'done'
      : 'accent'

  return (
    <>
      <DashHeader context={single ? single.name : 'Laporan kemajuan'} tools={headBadge} />

      <div>
        <SegmentedControl
          label="Jenis laporan"
          options={CADENCE_OPTIONS}
          value={cadence}
          onChange={(v) => setCadence(v as Cadence)}
          full={isPhone}
        />
      </div>

      {cadence === 'HARIAN' && !isToday && (
        <p className="mk-note-box mk-soft--info flex flex-wrap items-center gap-3">
          <Icon name="kalender" size={18} className="shrink-0" />
          <span className="flex-1 min-w-48">Anda membuka laporan {formatDateLong(data.reportDate)}.</span>
          <Button size="sm" icon="kiri" onClick={() => setDay(null)}>
            Kembali ke hari ini
          </Button>
        </p>
      )}
      {cadence === 'HARIAN' &&
        openDays.map((o) => (
          <p key={o.reportId} className="mk-note-box mk-soft--info flex flex-wrap items-center gap-3">
            <Icon name="kunci" size={18} className="shrink-0" />
            <span className="flex-1 min-w-48">
              Laporan {o.projectName} · {formatDateShort(`${o.date}T00:00:00+07:00`)} dibuka sampai {formatDateTime(o.unlockUntil)} WIB.
            </span>
            <Button size="sm" icon="ubah" onClick={() => setDay(o.date === data.todayKey ? null : o.date)}>
              Ubah laporan {formatDateShort(`${o.date}T00:00:00+07:00`)}
            </Button>
          </p>
        ))}

      {data.projects.length === 0 ? (
        <Card>
          <EmptyNote icon="proyek">Belum ada proyek yang ditugaskan kepada Anda. Hubungi Admin PT untuk penugasan proyek.</EmptyNote>
        </Card>
      ) : cadence === 'HARIAN' ? (
        <>
          <Hero
            eyebrow="Laporan harian"
            answer={answer}
            support={deadline}
            actions={
              single ? (
                single.report ? <DailyStatusBadge status={single.report.status} /> : undefined
              ) : nextOutstanding && !data.locked ? (
                <Button variant="primary" size="lg" icon="catatan" onClick={() => setOpenId(nextOutstanding.id)}>
                  Isi laporan berikutnya
                </Button>
              ) : undefined
            }
            art={
              <ProgressRing
                value={ringValue}
                size={isPhone ? 96 : 160}
                status={ringStatus}
                sublabel={single ? 'progres' : 'terkirim'}
                ariaLabel={single ? `Progres hari ini ${Math.round(ringValue)}%` : `${submitted} dari ${data.projects.length} laporan terkirim`}
              />
            }
            kpis={
              single ? undefined : (
                <>
                  <StatTile label="Sudah dikirim" value={submitted} delta={`dari ${data.projects.length} proyek`} tone="done" />
                  <StatTile label="Belum dikirim" value={outstanding} delta={outstanding > 0 ? 'butuh tindakan' : 'semua beres'} tone={outstanding > 0 ? (data.locked ? 'late' : 'risk') : 'done'} />
                  <StatTile label="Progress tercatat" value={data.projects.reduce((a, p) => a + p.taskCount, 0)} delta="semua proyek hari ini" />
                </>
              )
            }
          />

          {single ? (
            <Card
              title={`Laporan harian · ${formatDateLong(new Date(data.reportDate))}`}
              subtitle={
                single.report?.submittedAt
                  ? `Terkirim ke Admin PT pukul ${formatTime(single.report.submittedAt)}`
                  : singleLocked
                    ? `Tenggat ${formatTime(data.lockAt)} · terkunci`
                    : `Tenggat ${formatTime(data.lockAt)} · isi lalu kirim`
              }
              action={<StatusBadge status={reportState(single, singleLocked).status}>{reportState(single, singleLocked).label}</StatusBadge>}
            >
              <ReportForm
                key={`${single.id}-${data.reportDateKey ?? 'hari-ini'}`}
                project={single}
                projects={options}
                locked={singleLocked}
                dayLocked={data.locked}
                lockAt={data.lockAt}
                dateKey={dateKey}
                canRequestUnlock={Boolean(data.canRequestUnlock)}
                single
                onSaved={reload}
              />
            </Card>
          ) : (
            <Card title="Proyek Anda hari ini" subtitle={`${data.projects.length} proyek · pilih untuk mengisi atau membaca laporannya`}>
              <ul className="mk-lap-rows">
                {data.projects.map((p) => {
                  const st = reportState(p, isLockedFor(p, data.locked))
                  return (
                    <li key={p.id}>
                      <button type="button" className="mk-lap-row" onClick={() => setOpenId(p.id)} aria-label={`Buka laporan ${p.name}`}>
                        <span className="mk-lap-row__main">
                          <span className="mk-lap-row__title">{p.name}</span>
                          <span className="mk-lap-row__meta">
                            <span className="font-mono">{p.code}</span> · {PROJECT_PHASE_LABELS[p.phase] ?? p.phase}
                            {p.taskCount > 0 ? ` · ${p.taskCount} progress` : ''}
                          </span>
                        </span>
                        {p.report ? (
                          <span className="mk-lap-row__prog">
                            <ProgressBar value={p.report.progressPct} status={statusFromDaily(p.report.status)} label={`Progres ${p.name}`} />
                          </span>
                        ) : null}
                        <StatusBadge status={st.status} size="sm">
                          {st.label}
                        </StatusBadge>
                        <Icon name="kanan" size={18} className="mk-lap-row__chev" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <Sheet
            open={!!opened}
            onOpenChange={(o) => !o && setOpenId(null)}
            size="wide"
            eyebrow={opened ? `${opened.code} · ${PROJECT_PHASE_LABELS[opened.phase] ?? opened.phase}` : undefined}
            title={opened?.name ?? 'Laporan harian'}
            subtitle={`Laporan harian · ${formatDateLong(new Date(data.reportDate))}`}
            backLabel="Laporan"
          >
            {opened ? (
              <>
                <div>
                  <StatusBadge status={reportState(opened, isLockedFor(opened, data.locked)).status}>
                    {reportState(opened, isLockedFor(opened, data.locked)).label}
                  </StatusBadge>
                </div>
                <ReportForm
                  key={`${opened.id}-${data.reportDateKey ?? 'hari-ini'}`}
                  project={opened}
                  projects={options}
                  locked={isLockedFor(opened, data.locked)}
                  dayLocked={data.locked}
                  lockAt={data.lockAt}
                  dateKey={dateKey}
                  canRequestUnlock={Boolean(data.canRequestUnlock)}
                  onSaved={reload}
                />
              </>
            ) : null}
          </Sheet>
        </>
      ) : (
        <>
          {!single && (
            <Field label="Proyek" htmlFor={`proj-${cadence}`} className="max-w-md">
              <select id={`proj-${cadence}`} className={selectCls} value={cadenceProject} onChange={(e) => setProjectForCadence(e.target.value)}>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {cadenceProject && (
            <ProgressReportPanel
              key={cadence}
              projectId={cadenceProject}
              projectName={options.find((p) => p.id === cadenceProject)?.name}
              projects={options}
              cadence={cadence}
            />
          )}
        </>
      )}
    </>
  )
}

/**
 * Formulir laporan harian satu proyek sebagai kartu, untuk layar "Hari ini"
 * PIC (05-pic-proyek.md · Desktop 4, Tablet "Hari ini", Ponsel "Hari ini").
 * Memakai ReportForm yang sama dengan tab Laporan harian, jadi aturan kunci,
 * pembekuan, dan buka kunci tetap satu. [F2-PIC]
 */
export function DailyReportCard({
  projectId,
  className,
  onChanged,
}: {
  projectId: string
  className?: string
  /** Dipanggil setelah laporan disimpan/dikirim, mis. untuk memuat ulang lencana header. */
  onChanged?: () => void
}) {
  const { setActiveTab } = useApp()
  const { data, loading, error, reload } = useResource<Data>('/api/daily-input')
  const project = data?.projects.find((p) => p.id === projectId) ?? null
  const title = `Laporan harian · ${formatDateLong(data ? new Date(data.reportDate) : new Date())}`

  if (loading && !data) {
    return (
      <Card className={className} title={title}>
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton h={88} r={16} />
          <Skeleton h={120} r={16} />
          <Skeleton h={44} w={200} />
        </div>
      </Card>
    )
  }
  if (!data || !project) {
    return (
      <Card className={className} title={title}>
        <ErrorNote message={error ?? 'Laporan harian proyek ini belum termuat.'} onRetry={reload} />
      </Card>
    )
  }

  const locked = isLockedFor(project, data.locked)
  const st = reportState(project, locked)
  const options = data.projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))
  const openDays = (data.openDays ?? []).filter((o) => o.projectId === projectId && o.date !== data.reportDateKey)
  const r = project.report

  return (
    <Card
      className={className}
      title={title}
      subtitle={
        r?.forwardedAt
          ? `Diteruskan ke holding pukul ${formatTime(r.forwardedAt)}`
          : r?.submittedAt
            ? `Terkirim ke Admin PT pukul ${formatTime(r.submittedAt)}`
            : locked
              ? `Tenggat ${formatTime(data.lockAt)} · terkunci`
              : `Tenggat ${formatTime(data.lockAt)} · isi lalu kirim`
      }
      action={<StatusBadge status={st.status}>{st.label}</StatusBadge>}
    >
      {openDays.map((o) => (
        <p key={o.reportId} className="mk-note-box mk-soft--info mb-4 flex flex-wrap items-center gap-3">
          <Icon name="kunci" size={18} className="shrink-0" />
          <span className="flex-1 min-w-48">
            Laporan {formatDateShort(`${o.date}T00:00:00+07:00`)} dibuka sampai {formatDateTime(o.unlockUntil)} WIB.
          </span>
          <Button size="sm" variant="plain" onClick={() => setActiveTab('daily-input')}>
            Buka tab Laporan harian
          </Button>
        </p>
      ))}
      <ReportForm
        key={`${project.id}-${data.reportDateKey ?? 'hari-ini'}`}
        project={project}
        projects={options}
        locked={locked}
        dayLocked={data.locked}
        lockAt={data.lockAt}
        canRequestUnlock={Boolean(data.canRequestUnlock)}
        single
        onSaved={() => {
          reload()
          onChanged?.()
        }}
      />
    </Card>
  )
}

function ReportForm({
  project,
  projects,
  locked,
  dayLocked,
  lockAt,
  dateKey,
  canRequestUnlock,
  single = false,
  onSaved,
}: {
  project: ProjectItem
  projects: { id: string; code: string; name: string }[]
  /** Formulir ini tidak bisa ditulis (beku, terkunci, atau lewat tenggat tanpa buka kunci). */
  locked: boolean
  /** Tanggal ini sudah lewat tenggat 17.00. */
  dayLocked: boolean
  lockAt: string
  /** "YYYY-MM-DD" bila bukan hari ini (hanya terisi saat laporan lampau dibuka). */
  dateKey?: string
  canRequestUnlock: boolean
  single?: boolean
  onSaved: () => void
}) {
  const r = project.report
  const [status, setStatus] = useState(r?.status ?? '')
  const [progressPct, setProgressPct] = useState(r?.progressPct ?? 0)
  const [achievementToday, setAchievement] = useState(r?.achievementToday ?? '')
  const [obstacle, setObstacle] = useState(r?.obstacle ?? '')
  const [followUp, setFollowUp] = useState(r?.followUp ?? '')
  const [busy, setBusy] = useState<'save' | 'submit' | 'delete' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [confirmEl, confirm] = useConfirm()
  const evidenceRef = useRef<EvidencePanelHandle>(null)
  const isPhone = useIsPhone()

  // Once the day has tasks the report is derived from them, so the values the
  // server just computed are the truth — the local form state would be stale
  // after every task edit. The evidence total likewise includes task files.
  const derived = project.derived && r !== null
  const shownStatus = derived ? r.status : status
  const shownProgress = derived ? r.progressPct : progressPct
  const needsObstacle = shownStatus === 'TERKENDALA' || shownStatus === 'MENUNGGU_KEPUTUSAN'
  const needsFollowUp = shownStatus === 'TERKENDALA'
  const needsEvidence = shownStatus !== '' && shownStatus !== 'TIDAK_ADA_PERUBAHAN'
  const evidenceCount = r?.evidenceCount ?? 0
  const canDelete = !!r && !locked && !r.forwardedAt
  const missingEvidence = needsEvidence && evidenceCount < 1
  const dayWord = dateKey ? 'hari itu' : 'hari ini'

  async function send(action: 'save' | 'submit') {
    setBusy(action)
    setErr(null)
    try {
      const res = await fetch('/api/daily-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          action,
          status,
          progressPct,
          achievementToday,
          obstacle: obstacle || null,
          followUp: followUp || null,
          ...(dateKey ? { reportDate: dateKey } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Laporan belum tersimpan')
        // Laporan baru saja diteruskan/dikunci: muat ulang agar formulir ikut terkunci.
        if (res.status === 409) onSaved()
      } else {
        toast.success(action === 'submit' ? 'Laporan terkirim ke Admin PT' : 'Draf tersimpan')
        if (action === 'submit') refreshNavBadges()
        onSaved()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  async function removeReport() {
    const ok = await confirm({
      title: `Hapus laporan ${dayWord}?`,
      description: 'Laporan beserta lampiran di tingkat laporan dihapus dan tidak bisa dikembalikan. Daftar progress (task) tidak ikut terhapus.',
      confirmLabel: 'Hapus laporan',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    setErr(null)
    try {
      const qs = new URLSearchParams({ projectId: project.id, ...(dateKey ? { date: dateKey } : {}) })
      const res = await fetch(`/api/daily-input?${qs.toString()}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setErr(json.error || 'Laporan belum terhapus')
      else {
        setStatus('')
        setProgressPct(0)
        setAchievement('')
        setObstacle('')
        setFollowUp('')
        refreshNavBadges()
        onSaved()
      }
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mk-lap-stack">
      <LockNotice
        project={project}
        locked={locked}
        dayLocked={dayLocked}
        lockAt={lockAt}
        dayWord={dayWord}
        canRequestUnlock={canRequestUnlock}
        onRequestUnlock={() => setUnlockOpen(true)}
      />

      {/* Ponsel: alur (vertikal) baru tampil setelah terkirim; sebelumnya kartu langsung ke isian. [F2-PIC] */}
      {!isPhone || r?.submittedAt ? (
        <div className="mk-lap-inset">
          <FlowDiagram steps={reportFlow(project, locked, lockAt)} orientation={isPhone ? 'vertical' : 'horizontal'} label="Alur laporan harian" />
        </div>
      ) : null}

      {/* Progress (task) — tindakan utama */}
      <TaskSection projectId={project.id} projectName={project.name} projects={projects} locked={locked} prominent={single && !locked} date={dateKey} />

      {/* Ringkasan hari */}
      {project.derived ? (
        <div className="mk-lap-inset">
          <span className="t-body-strong text-ink flex items-center gap-2">
            <Icon name="persetujuan" size={18} className="text-ink-2" />
            Diringkas dari {project.taskCount} progress
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <DailyStatusBadge status={shownStatus} />
            <ProgressBar value={shownProgress} size="lg" status={shownStatus ? statusFromDaily(shownStatus) : 'accent'} label={`Progres ${dayWord}`} className="flex-1 basis-40" />
          </div>
          <p className="t-footnote text-ink-2">Status dan progres dihitung dari daftar progress di atas, jadi tidak perlu diisi ulang di sini.</p>
        </div>
      ) : (
        <div className="mk-formgrid">
          <Field label="Status" required className="is-full">
            <div className="mk-lap-chips" role="group" aria-label="Status laporan">
              {STATUS_OPTIONS.map((s) => (
                <Chip key={s} selected={status === s} status={statusFromDaily(s)} disabled={locked} onClick={() => setStatus(s)}>
                  {DAILY_STATUS_META[s]?.label ?? s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={`Progres ${progressPct}%`} htmlFor={`pct-${project.id}`} className="is-full">
            <input
              id={`pct-${project.id}`}
              className="mk-lap-range"
              type="range"
              min={0}
              max={100}
              value={progressPct}
              disabled={locked}
              onChange={(e) => setProgressPct(Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      <Field label={dateKey ? 'Capaian hari itu' : 'Capaian hari ini'} htmlFor={`ach-${project.id}`} required>
        <textarea
          id={`ach-${project.id}`}
          className="mk-lap-input"
          rows={3}
          maxLength={4000}
          disabled={locked}
          value={achievementToday}
          onChange={(e) => setAchievement(e.target.value)}
          placeholder="Apa yang selesai hari ini? Mis. modul izin dan cuti selesai diuji"
        />
      </Field>

      {/* Kendala & Rencana besok selalu tampil; wajib hanya untuk status yang menghambat. */}
      <div className="mk-formgrid">
        <Field
          label="Kendala"
          htmlFor={`obs-${project.id}`}
          required={needsObstacle}
          hint={needsObstacle ? undefined : 'Opsional · wajib bila Terkendala atau Menunggu keputusan'}
        >
          <textarea
            id={`obs-${project.id}`}
            className="mk-lap-input"
            rows={3}
            maxLength={2000}
            disabled={locked}
            value={obstacle}
            onChange={(e) => setObstacle(e.target.value)}
            placeholder="Apa yang menghambat? Mis. perangkat uji belum tiba"
          />
        </Field>
        <Field
          label="Rencana besok"
          htmlFor={`fu-${project.id}`}
          required={needsFollowUp}
          hint={needsFollowUp ? undefined : 'Opsional · wajib bila Terkendala'}
        >
          <textarea
            id={`fu-${project.id}`}
            className="mk-lap-input"
            rows={3}
            maxLength={2000}
            disabled={locked}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Langkah berikutnya, mis. uji ulang setelah perangkat tiba"
          />
        </Field>
      </div>

      <EvidencePanel
        targetType="DAILY_REPORT"
        targetId={r?.id ?? null}
        items={r?.evidence ?? []}
        required={needsEvidence}
        disabled={locked}
        onChanged={onSaved}
        handleRef={evidenceRef}
      />

      {err && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{err}</span>
        </p>
      )}

      {!locked && (
        <div className="mk-lap-actions">
          <Button
            variant="primary"
            size={isPhone ? 'lg' : 'md'}
            icon="kirim"
            full={isPhone}
            disabled={busy !== null || shownStatus === '' || missingEvidence}
            onClick={() => send('submit')}
          >
            {busy === 'submit' ? 'Mengirim…' : r?.submittedAt ? 'Kirim ulang laporan' : 'Kirim laporan'}
          </Button>
          <Button disabled={busy !== null} onClick={() => send('save')}>
            {busy === 'save' ? 'Menyimpan…' : 'Simpan draf'}
          </Button>
          <Button variant="plain" icon="unggah" disabled={busy !== null || !r} onClick={() => evidenceRef.current?.openPicker('photo')}>
            Lampirkan foto
          </Button>
          {canDelete && (
            <Button variant="destructive" size="sm" disabled={busy !== null} onClick={removeReport}>
              {busy === 'delete' ? 'Menghapus…' : 'Hapus laporan'}
            </Button>
          )}
        </div>
      )}
      {!locked && (shownStatus === '' || missingEvidence || !r) && (
        <p className="t-footnote text-ink-2">
          {shownStatus === ''
            ? 'Pilih status laporan dulu sebelum mengirim.'
            : !r
              ? 'Simpan draf dulu agar foto dan bukti bisa dilampirkan.'
              : 'Lampirkan minimal 1 bukti sebelum mengirim.'}{' '}
          Laporan dikirim ke Admin PT, lalu diteruskan ke holding.
        </p>
      )}
      {r && (
        <UnlockRequestSheet
          open={unlockOpen}
          onOpenChange={setUnlockOpen}
          reportId={r.id}
          projectName={project.name}
          dayWord={dayWord}
          onDone={onSaved}
        />
      )}
      {confirmEl}
    </div>
  )
}

/**
 * Keadaan terkunci di atas formulir: kenapa laporan tidak bisa diubah, status
 * buka kunci bila sudah diajukan, dan tombol "Ajukan buka kunci".
 */
function LockNotice({
  project,
  locked,
  dayLocked,
  lockAt,
  dayWord,
  canRequestUnlock,
  onRequestUnlock,
}: {
  project: ProjectItem
  locked: boolean
  dayLocked: boolean
  lockAt: string
  dayWord: string
  canRequestUnlock: boolean
  onRequestUnlock: () => void
}) {
  const r = project.report
  const unlock = project.unlock ?? null

  if (unlock?.status === 'DIEKSEKUSI') {
    return (
      <div className="mk-note-box mk-soft--info flex flex-wrap items-center gap-3">
        <StatusBadge status="info">Dibuka sampai {formatDateTime(unlock.unlockUntil)}</StatusBadge>
        <span className="flex-1 min-w-48">
          Buka kunci disetujui. Perbaiki laporan lalu kirim ulang; setiap perubahan tercatat di log aktivitas dan laporan dikunci kembali otomatis.
        </span>
      </div>
    )
  }
  if (!locked) return null

  const reason: LockReason = project.lockReason ?? (r?.forwardedAt ? 'FORWARDED' : r?.isLocked ? 'LOCKED' : 'TIME')
  const message =
    reason === 'FORWARDED'
      ? `Laporan ini sudah diteruskan ke holding${r?.forwardedAt ? ` pukul ${formatTime(r.forwardedAt)}` : ''} dan dibekukan. Perubahan hanya lewat buka kunci yang disetujui.`
      : reason === 'LOCKED'
        ? 'Laporan ini dikunci. Perubahan hanya lewat buka kunci yang disetujui.'
        : `Laporan ${dayWord} sudah melewati pukul ${formatTime(lockAt)} WIB dan terkunci.`
  const badge: { status: Status; label: string } =
    reason === 'FORWARDED'
      ? { status: 'done', label: 'Diteruskan · dibekukan' }
      : reason === 'LOCKED' || r?.submittedAt
        ? { status: 'neutral', label: 'Terkunci' }
        : { status: dayLocked ? 'late' : 'neutral', label: 'Terkunci setelah tenggat' }

  return (
    <div className="mk-note-box mk-soft--neutral flex flex-col gap-3">
      <span className="flex flex-wrap items-center gap-2">
        <Icon name="kunci" size={18} className="shrink-0" />
        <StatusBadge status={badge.status}>{badge.label}</StatusBadge>
        {unlock?.status === 'DIAJUKAN' && <StatusBadge status="info">Buka kunci diajukan · menunggu persetujuan</StatusBadge>}
        {unlock?.status === 'DISETUJUI' && <StatusBadge status="info">Buka kunci disetujui · menunggu dijalankan Tim TI</StatusBadge>}
      </span>
      <span>{message}</span>
      {!unlock &&
        (r ? (
          canRequestUnlock ? (
            <span>
              <Button size="sm" icon="kunci" onClick={onRequestUnlock}>
                Ajukan buka kunci
              </Button>
            </span>
          ) : (
            <span className="t-footnote text-ink-2">Minta Admin PT mengajukan buka kunci bila laporan ini perlu diubah.</span>
          )
        ) : (
          <span className="t-footnote text-ink-2">Belum ada laporan tersimpan untuk {dayWord}, jadi tidak ada yang bisa dibuka.</span>
        ))}
    </div>
  )
}

/** Mengajukan buka kunci satu laporan harian lewat POST /api/unlock-requests. */
function UnlockRequestSheet({
  open,
  onOpenChange,
  reportId,
  projectName,
  dayWord,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportId: string
  projectName: string
  dayWord: string
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tooShort = reason.trim().length < 10

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/unlock-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'DAILY_REPORT', targetId: reportId, reason: reason.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Buka kunci belum diajukan')
        return
      }
      toast.success('Buka kunci diajukan. Anda diberi tahu setelah diputuskan.')
      setReason('')
      onOpenChange(false)
      onDone()
    } catch {
      setErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Buka kunci"
      title="Ajukan buka kunci"
      subtitle={`Laporan ${projectName} · ${dayWord}`}
      backLabel="Laporan"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon="kirim" onClick={submit} disabled={busy || tooShort}>
            {busy ? 'Mengajukan…' : 'Ajukan buka kunci'}
          </Button>
        </>
      }
    >
      <section className="mk-formsec">
        <p className="t-footnote text-ink-2">
          Direksi holding atau Tim TI memutuskan. Bila disetujui, laporan dibuka paling lama 24 jam lalu dikunci kembali otomatis.
        </p>
        <Field label="Alasan" htmlFor={`unlock-reason-${reportId}`} required hint="Minimal 10 karakter. Sebutkan apa yang perlu diperbaiki.">
          <textarea
            id={`unlock-reason-${reportId}`}
            className="mk-lap-input"
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mis. progres uji coba salah ketik, seharusnya 64%"
          />
        </Field>
        {err && (
          <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
            <Icon name="peringatan" size={18} className="shrink-0" />
            <span>{err}</span>
          </p>
        )}
      </section>
    </Sheet>
  )
}
