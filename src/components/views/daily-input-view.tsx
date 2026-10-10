'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import {
  Avatar, Button, Card, EmptyNote, ErrorNote, FlowDiagram, Hero, Icon, ProgressBar, ProgressRing, SegmentedControl,
  Sheet, Skeleton, StatTile, StatusBadge, cx, statusFromDaily, useIsPhone, type FlowStep, type Status,
} from '@/components/mk'
import { DashHeader } from '@/components/views/dash-common'
import { DailyStatusBadge } from '@/components/status-badges'
import { EvidencePanel } from '@/components/evidence-panel'
import { ProgressReportPanel } from '@/components/progress-report-panel'
import { refreshNavBadges } from '@/components/pic/nav-badges'
import { Field, SectionTitle, SwitchRow, selectCls, useConfirm } from '@/components/companies/parts'
import { TASK_STATUS_META } from '@/components/task-dialog'
import { initialsOf } from '@/lib/accounts'
import { PROJECT_PHASE_LABELS } from '@/lib/constants'
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

/**
 * Satu entri laporan (task HARIAN hari itu). Kolom achievementToday, followUp,
 * dan needsEscalation adalah narasi per entri (10 Okt 2026, D1) yang digabung
 * roll-up ke laporan harian.
 */
type Entry = {
  id: string
  projectId?: string
  title: string
  description: string | null
  tags: string[]
  picName: string | null
  picUserId?: string | null
  startAt: string | null
  endAt: string | null
  status: string
  progressPct: number
  urgency: string
  obstacle: string | null
  decisionNeeded: string | null
  achievementToday?: string | null
  followUp?: string | null
  needsEscalation?: boolean
  escalationId: string | null
  subtasks: { id?: string; title: string; isDone: boolean }[]
}

type DeskData = {
  workDate: string
  /** Lewat tenggat atau laporan harinya dibekukan, kecuali sedang dibuka. */
  locked: boolean
  frozen?: 'FORWARDED' | 'LOCKED' | null
  reportId?: string | null
  unlockUntil?: string | null
  tasks: Entry[]
}

type Cadence = 'HARIAN' | 'MINGGUAN' | 'BULANAN'

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'HARIAN', label: 'Harian' },
  { value: 'MINGGUAN', label: 'Mingguan' },
  { value: 'BULANAN', label: 'Bulanan' },
]

/** Pilihan status entri (keputusan pemilik 10 Okt 2026); status lama tetap terwakili saat mengubah. */
const ENTRY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'BERJALAN', label: 'Berjalan' },
  { value: 'SELESAI', label: 'Selesai' },
  { value: 'TERKENDALA', label: 'Terkendala' },
]

/** Tidak bisa ditulis? Pakai jawaban server; tanpa itu (data lama) simpulkan dari laporan. */
function isLockedFor(p: ProjectItem, dayLocked: boolean): boolean {
  if (typeof p.editable === 'boolean') return !p.editable
  return dayLocked || Boolean(p.report?.forwardedAt) || Boolean(p.report?.isLocked)
}

const isUnlocked = (p: ProjectItem) => p.unlock?.status === 'DIEKSEKUSI'

/** Warna batang progres entri: aksen untuk yang berjalan, warna status untuk sisanya. */
function barTone(s: Status): Status | 'accent' {
  return s === 'on' || s === 'neutral' ? 'accent' : s
}

/** "HH:MM" WIB dari ISO, untuk mengirim kembali jam task yang sudah ada (sama dengan meja kerja). */
function wibHHMM(iso: string | null): string | undefined {
  if (!iso) return undefined
  const d = new Date(Date.parse(iso) + 7 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Gabungan narasi entri menjadi isi laporan harian; pemisah ' | ' sama dengan roll-up (D1). */
function composeReportBody(entries: Entry[]) {
  const join = (values: (string | null | undefined)[]) => {
    const merged = values.map((v) => v?.trim() || '').filter(Boolean)
    return merged.length ? merged.join(' | ') : null
  }
  const achievement = join(entries.map((e) => e.achievementToday)) ?? composeAchievement(entries)
  const obstacle = join(
    entries
      .filter((e) => e.obstacle?.trim() || e.decisionNeeded?.trim())
      .map((e) => `${e.title}: ${e.obstacle?.trim() || e.decisionNeeded?.trim()}`)
  )
  const followUp = join(entries.map((e) => e.followUp))
  return { achievementToday: achievement, obstacle, followUp }
}

/** Ringkasan ringkas bila entri belum punya narasi (rumus sama dengan composeAchievement di roll-up). */
function composeAchievement(entries: Entry[]): string {
  const done = entries.filter((t) => t.status === 'SELESAI')
  const running = entries.filter((t) => t.status === 'BERJALAN')
  const parts: string[] = []
  if (done.length) parts.push(`Selesai: ${done.map((t) => t.title).join('; ')}`)
  if (running.length) parts.push(`Berjalan: ${running.map((t) => `${t.title} (${t.progressPct}%)`).join('; ')}`)
  if (!parts.length) parts.push(`${entries.length} entri tercatat, belum ada yang selesai atau berjalan.`)
  return parts.join('. ')
}

/** Keadaan laporan harian satu proyek dalam kosakata status desain. */
function reportState(p: ProjectItem, locked: boolean): { status: Status; label: string } {
  const r = p.report
  if (isUnlocked(p)) return { status: 'info', label: `Dibuka sampai ${formatDateTime(p.unlock!.unlockUntil)}` }
  if (r?.forwardedAt) return { status: 'done', label: 'Diteruskan ke holding' }
  if (r?.submittedAt) return { status: 'done', label: `Terkirim ${formatTime(r.submittedAt)}` }
  if (r) return { status: locked ? 'late' : 'risk', label: locked ? 'Draf terkunci' : 'Draf belum dikirim' }
  return { status: locked ? 'late' : 'neutral', label: locked ? 'Tidak dikirim' : 'Belum diisi' }
}

/** Alur laporan harian: entri → terkirim ke Admin PT → diteruskan ke holding → bahan laporan mingguan. */
function reportFlow(p: ProjectItem, locked: boolean, lockAt: string): FlowStep[] {
  const r = p.report
  const sent = Boolean(r?.submittedAt)
  return [
    {
      title: 'Catat entri',
      sub: `${p.taskCount} entri tercatat`,
      icon: 'catatan',
      status: sent ? 'done' : locked ? 'blocked' : 'current',
      meta: sent ? undefined : locked ? 'Terkunci' : r ? 'Draf tersimpan' : 'Belum ada entri',
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

/** Daftar bukti satu entri dari /api/evidence (muat ulang setelah unggah/hapus). */
function useEvidence(taskId: string | null, tick = 0) {
  const { data, loading, error, reload } = useResource<{ items: Evidence[]; total: number }>(
    taskId ? `/api/evidence?targetType=TASK&targetId=${encodeURIComponent(taskId)}${tick ? `&_=${tick}` : ''}` : null
  )
  return { items: data?.items ?? [], loading, error, reload }
}

/** Buka satu bukti di tab baru: tautan langsung, berkas lewat URL bertanda tangan. */
async function openEvidence(item: Evidence) {
  if (item.url) {
    window.open(item.url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    const res = await fetch(`/api/evidence/${item.id}`)
    const json = (await res.json().catch(() => ({}))) as { url?: string }
    if (res.ok && json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
  } catch {
    /* Dibiarkan: klik bisa dicoba lagi. */
  }
}

/**
 * Laporan Kemajuan (7 Sep 2026) — satu tempat untuk tiga kadens laporan
 * proyek: HARIAN (entri per hari ini), MINGGUAN, dan BULANAN.
 *
 * Keputusan pemilik 10 Okt 2026: laporan harian = DAFTAR ENTRI. PIC menambah
 * entri (apa, siapa, bagaimana, eskalasi, rencana besok, bukti) satu per satu
 * lewat Sheet, meninjaunya sebagai kartu, lalu mengirim semuanya sebagai SATU
 * laporan ke Admin PT dari footer yang menempel. Seorang PIC lazimnya memegang
 * satu proyek, jadi daftarnya langsung terbuka; bila memegang lebih dari satu,
 * tiap proyek dibuka di Sheet.
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
      ? `Dibuka sampai ${formatDateTime(single.unlock!.unlockUntil)} WIB. Perbaiki laporan lalu kirim ulang; setelah itu laporan dikunci kembali.`
      : single?.report?.forwardedAt
        ? 'Laporan yang sudah diteruskan dibekukan. Ajukan buka kunci bila perlu mengubahnya.'
        : data.locked
          ? outstanding > 0
            ? `Tenggat ${formatTime(data.lockAt)} WIB sudah lewat, jadi laporan ${dayWord} terkunci. Ajukan buka kunci bila perlu mengubahnya.`
            : `Tenggat ${formatTime(data.lockAt)} WIB sudah lewat; laporan ${dayWord} terkunci.`
          : `Tenggat ${formatTime(data.lockAt)} WIB · ${data.countdown.hours} jam ${data.countdown.minutes} menit lagi.${
              outstanding > 0 ? ' Catat entri, lampirkan bukti, lalu kirim.' : ''
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
                  <StatTile label="Entri tercatat" value={data.projects.reduce((a, p) => a + p.taskCount, 0)} delta="semua proyek hari ini" />
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
                    : `Tenggat ${formatTime(data.lockAt)} · catat entri lalu kirim`
              }
              action={<StatusBadge status={reportState(single, singleLocked).status}>{reportState(single, singleLocked).label}</StatusBadge>}
            >
              <EntryDesk
                key={`${single.id}-${data.reportDateKey ?? 'hari-ini'}`}
                project={single}
                locked={singleLocked}
                dayLocked={data.locked}
                lockAt={data.lockAt}
                dateKey={dateKey}
                canRequestUnlock={Boolean(data.canRequestUnlock)}
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
                            {p.taskCount > 0 ? ` · ${p.taskCount} entri` : ''}
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
                <EntryDesk
                  key={`${opened.id}-${data.reportDateKey ?? 'hari-ini'}`}
                  project={opened}
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
 * Kartu laporan harian satu proyek untuk layar "Hari ini" PIC
 * (05-pic-proyek.md · Desktop 4, Tablet "Hari ini", Ponsel "Hari ini").
 * Memakai daftar entri yang sama dengan tab Laporan harian, jadi aturan kunci,
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
              : `Tenggat ${formatTime(data.lockAt)} · catat entri lalu kirim`
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
      <EntryDesk
        key={`${project.id}-${data.reportDateKey ?? 'hari-ini'}`}
        project={project}
        locked={locked}
        dayLocked={data.locked}
        lockAt={data.lockAt}
        canRequestUnlock={Boolean(data.canRequestUnlock)}
        onSaved={() => {
          reload()
          onChanged?.()
        }}
      />
    </Card>
  )
}

/**
 * Meja entri satu proyek: daftar entri hari itu (kartu per entri) + footer
 * kirim yang menempel. Entri disunting satu per satu lewat Sheet "Tambah/Ubah
 * entri"; menambah, mengubah, atau menghapus entri memuat ulang daftar dan
 * ringkasan laporan (status, progres, dan jumlah bukti dihitung server).
 */
function EntryDesk({
  project,
  locked: lockedProp,
  dayLocked,
  lockAt,
  dateKey,
  canRequestUnlock,
  onSaved,
}: {
  project: ProjectItem
  /** Formulir tidak bisa ditulis (beku, terkunci, atau lewat tenggat tanpa buka kunci). */
  locked: boolean
  /** Tanggal ini sudah lewat tenggat 17.00. */
  dayLocked: boolean
  lockAt: string
  /** "YYYY-MM-DD" bila bukan hari ini (laporan lampau yang sedang dibuka). */
  dateKey?: string
  canRequestUnlock: boolean
  onSaved: () => void
}) {
  const isPhone = useIsPhone()
  const { data: desk, loading, error, reload } = useResource<DeskData>(
    `/api/tasks?projectId=${encodeURIComponent(project.id)}${dateKey ? `&date=${dateKey}` : ''}`
  )
  const locked = lockedProp || Boolean(desk?.locked)
  const entries = desk?.tasks ?? []
  const r = project.report

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Naikkan angka ini agar thumbnail bukti di semua kartu entri dimuat ulang. */
  const [evTick, setEvTick] = useState(0)
  const [busy, setBusy] = useState<'save' | 'submit' | 'delete' | null>(null)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [delBusy, setDelBusy] = useState<string | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [confirmEl, confirm] = useConfirm()

  const editing = entries.find((e) => e.id === editingId) ?? null
  const n = entries.length
  const done = entries.filter((e) => e.status === 'SELESAI').length
  const blocked = entries.filter((e) => e.status === 'TERKENDALA' || e.status === 'MENUNGGU_KEPUTUSAN').length
  const dayWord = dateKey ? 'hari itu' : 'hari ini'
  const canDeleteReport = Boolean(r) && !locked && !r?.forwardedAt
  // Jumlah bukti laporan (milik sendiri + semua entri) dirawat roll-up server.
  const missingEvidence = n > 0 && (r?.evidenceCount ?? 0) < 1

  function refresh() {
    reload()
    onSaved()
  }

  function openAdd() {
    setEditingId(null)
    setSheetOpen(true)
  }

  function openEdit(entry: Entry) {
    setEditingId(entry.id)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingId(null)
  }

  async function removeEntry(entry: Entry) {
    const ok = await confirm({
      title: 'Hapus entri ini?',
      description: (
        <>
          <strong className="text-ink">{entry.title}</strong> beserta buktinya dihapus dari laporan {dayWord} dan tidak bisa dikembalikan.
        </>
      ),
      confirmLabel: 'Hapus entri',
      destructive: true,
    })
    if (!ok) return
    setDelBusy(entry.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/tasks?id=${entry.id}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setActionError(json.error || 'Entri belum terhapus')
      else refresh()
    } catch {
      setActionError('Tidak dapat menghubungi server.')
    } finally {
      setDelBusy(null)
    }
  }

  /** Kirim semua entri sebagai satu laporan (submit) atau simpan drafnya (save). */
  async function send(action: 'save' | 'submit') {
    if (action === 'submit') {
      const ok = await confirm({
        title: `Kirim ${n} entri sebagai laporan harian?`,
        description: `Laporan ${project.name} ${dayWord} memuat ${n} entri — ${done} selesai, ${blocked} terkendala. Laporan dikirim ke Admin PT, lalu diteruskan ke holding.`,
        confirmLabel: 'Kirim laporan',
      })
      if (!ok) return
    }
    setBusy(action)
    setSendErr(null)
    try {
      const res = await fetch('/api/daily-input', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          action,
          // Status, progres, dan jumlah bukti dihitung server dari entri (roll-up);
          // yang dikirim hanya gabungan narasi entri.
          ...composeReportBody(entries),
          ...(dateKey ? { reportDate: dateKey } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSendErr(json.error || 'Laporan belum tersimpan')
        // Laporan baru saja diteruskan/dikunci: muat ulang agar tampilan ikut terkunci.
        if (res.status === 409) refresh()
      } else {
        toast.success(action === 'submit' ? 'Laporan terkirim ke Admin PT' : 'Draf tersimpan')
        if (action === 'submit') refreshNavBadges()
        refresh()
      }
    } catch {
      setSendErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  /** Hapus laporan ringkasnya saja; daftar entri tetap ada dengan tombol hapusnya sendiri. */
  async function removeReport() {
    const ok = await confirm({
      title: `Hapus laporan ${dayWord}?`,
      description: 'Laporan beserta lampiran di tingkat laporan dihapus dan tidak bisa dikembalikan. Entri tidak ikut terhapus.',
      confirmLabel: 'Hapus laporan',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    setSendErr(null)
    try {
      const qs = new URLSearchParams({ projectId: project.id, ...(dateKey ? { date: dateKey } : {}) })
      const res = await fetch(`/api/daily-input?${qs.toString()}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setSendErr(json.error || 'Laporan belum terhapus')
      else {
        refreshNavBadges()
        refresh()
      }
    } catch {
      setSendErr('Tidak dapat menghubungi server.')
    } finally {
      setBusy(null)
    }
  }

  const summary = n === 0 ? 'Belum ada entri' : `${n} entri · ${done} selesai · ${blocked} terkendala`
  const hint =
    n === 0
      ? 'Tambahkan minimal satu entri sebelum mengirim laporan.'
      : missingEvidence
        ? 'Lampirkan minimal 1 bukti pada entri sebelum mengirim laporan.'
        : null

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

      {/* Ponsel: alur (vertikal) baru tampil setelah terkirim; sebelumnya daftar langsung ke entri. [F2-PIC] */}
      {!isPhone || r?.submittedAt ? (
        <div className="mk-lap-inset">
          <FlowDiagram steps={reportFlow(project, locked, lockAt)} orientation={isPhone ? 'vertical' : 'horizontal'} label="Alur laporan harian" />
        </div>
      ) : null}

      <section className="mk-lap-stack" aria-label={dateKey ? 'Daftar entri hari itu' : 'Daftar entri hari ini'}>
        <div className="mk-lap-head">
          <h3 className="t-headline text-ink">{dateKey ? 'Entri hari itu' : 'Entri hari ini'}</h3>
          {n > 0 && (
            <span className="t-footnote text-ink-2 tabular-nums">
              {done} dari {n} selesai
            </span>
          )}
          <span className="mk-lap-grow" />
          {!locked && n > 0 && (
            <Button size="sm" icon="tambah" onClick={openAdd}>
              Tambah entri
            </Button>
          )}
        </div>

        {loading && !desk ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat entri">
            <Skeleton h={132} r={14} />
            <Skeleton h={132} r={14} />
          </div>
        ) : error && !desk ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : n === 0 ? (
          locked ? (
            <EmptyNote icon="kalender">
              {dateKey ? 'Tidak ada entri tercatat pada hari itu.' : 'Tidak ada entri tercatat hari ini.'}
            </EmptyNote>
          ) : (
            <>
              <EmptyNote icon="kalender">
                Belum ada entri {dateKey ? 'pada hari itu' : 'hari ini'}. Tambahkan apa yang dikerjakan — judul, hasil, status, dan
                bukti — lalu kirim sebagai satu laporan ke Admin PT.
              </EmptyNote>
              <Button size="lg" icon="tambah" full={isPhone} onClick={openAdd}>
                Tambah entri
              </Button>
            </>
          )
        ) : (
          <ul className="mk-lap-tasks">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} evTick={evTick} locked={locked} busy={delBusy === e.id} onEdit={openEdit} onRemove={removeEntry} />
            ))}
          </ul>
        )}

        {actionError && (
          <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
            <Icon name="peringatan" size={18} className="shrink-0" />
            <span>{actionError}</span>
          </p>
        )}
      </section>

      {!locked && (
        <SendBar
          summary={summary}
          hint={hint}
          error={sendErr}
          submitted={Boolean(r?.submittedAt)}
          canSave={n > 0}
          canSubmit={n > 0 && !missingEvidence}
          canDelete={canDeleteReport}
          busy={busy}
          isPhone={isPhone}
          onSend={send}
          onDeleteReport={removeReport}
        />
      )}

      {sheetOpen && (
        <EntrySheet
          key={editingId ?? 'baru'}
          open={sheetOpen}
          onOpenChange={(o) => !o && closeSheet()}
          project={project}
          entry={editing}
          locked={locked}
          dateKey={dateKey}
          onSaved={refresh}
          onEvidenceChanged={() => setEvTick((t) => t + 1)}
        />
      )}

      {r && (
        <UnlockRequestSheet open={unlockOpen} onOpenChange={setUnlockOpen} reportId={r.id} projectName={project.name} dayWord={dayWord} onDone={refresh} />
      )}
      {confirmEl}
    </div>
  )
}

/**
 * Kartu satu entri laporan (05-pic-proyek.md · Laporan harian): apa (judul +
 * status + tanda eskalasi), siapa (pelaksana), bagaimana (narasi hasil +
 * progres), rencana besok, dan bukti. Mengubah lewat Sheet, menghapus lewat
 * konfirmasi.
 */
function EntryCard({
  entry,
  evTick,
  locked,
  busy,
  onEdit,
  onRemove,
}: {
  entry: Entry
  /** Penanda versi bukti: berubah → thumbnail entri dimuat ulang. */
  evTick: number
  locked: boolean
  busy: boolean
  onEdit: (entry: Entry) => void
  onRemove: (entry: Entry) => void
}) {
  const meta = TASK_STATUS_META[entry.status] ?? TASK_STATUS_META.BELUM_MULAI
  const rail = meta.status === 'risk' ? 'is-risk' : meta.status === 'info' ? 'is-info' : meta.status === 'late' ? 'is-late' : ''
  const who = entry.picName?.trim() || null
  const text = entry.achievementToday?.trim() || null

  return (
    <li className={cx('mk-lap-task', rail, entry.status === 'SELESAI' && 'is-done')}>
      <div className="mk-lap-task__body">
        <div className="mk-lap-task__top">
          <div className="min-w-0">
            <p className="mk-lap-task__title">{entry.title}</p>
            {!text && entry.description && <p className="mk-lap-task__desc">{entry.description}</p>}
          </div>
          <div className="mk-lap-task__badges">
            <StatusBadge status={meta.status} size="sm">
              {meta.label}
            </StatusBadge>
            {entry.needsEscalation && (
              <span className="mk-lap-esc" title="Butuh eskalasi atau keputusan">
                <Icon name="naik" size={14} strokeWidth={2.2} />
                Butuh eskalasi
              </span>
            )}
          </div>
        </div>

        {who && (
          <span className="mk-lap-entry__who">
            <Avatar initials={initialsOf(who)} name={who} size={28} />
            {who}
          </span>
        )}

        {text && <p className="mk-lap-entry__text">{text}</p>}
        {text && entry.description && <p className="mk-lap-task__desc">{entry.description}</p>}

        <ProgressBar value={entry.progressPct} status={barTone(meta.status)} label={`Progres ${entry.title}`} />

        {entry.followUp?.trim() && (
          <p className="mk-lap-entry__fu">
            <strong>Rencana besok:</strong> {entry.followUp}
          </p>
        )}

        <EntryEvidence taskId={entry.id} tick={evTick} />

        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="ubah" onClick={() => onEdit(entry)}>
              Ubah entri
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onRemove(entry)}>
              {busy ? 'Memproses…' : 'Hapus entri'}
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

/** Bukti satu entri di kartu: foto sebagai thumbnail kecil, berkas & tautan sebagai baris teks. */
function EntryEvidence({ taskId, tick }: { taskId: string; tick: number }) {
  const { items, loading } = useEvidence(taskId, tick)
  if (loading && items.length === 0) return null
  if (items.length === 0) return null

  const isPhoto = (e: Evidence) => !e.url && Boolean(e.mime?.startsWith('image/'))
  const photos = items.filter(isPhoto)
  const others = items.filter((e) => !isPhoto(e))

  return (
    <div className="mk-lap-evi">
      {photos.length > 0 && (
        <div className="mk-lap-thumbs mk-lap-thumbs--sm">
          {photos.map((e) => (
            <EvidenceThumb key={e.id} item={e} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="mk-list">
          {others.map((e) => (
            <li key={e.id} className="mk-lap-file">
              <Icon name={e.url ? 'alur' : 'dokumen'} size={16} className="text-ink-3 shrink-0" />
              <button type="button" className="mk-lap-entry__link" onClick={() => void openEvidence(e)}>
                {e.fileName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Thumbnail bukti foto: URL bertanda tangan diminta saat tampil, klik membuka di tab baru. */
function EvidenceThumb({ item }: { item: Evidence }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/evidence/${item.id}`)
      .then((r) => r.json())
      .then((j: { url?: string }) => {
        if (!cancelled) {
          if (j?.url) setSrc(j.url)
          else setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [item.id])

  return (
    <a
      href={src ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Buka bukti ${item.fileName}`}
      className="mk-lap-thumb"
      title={item.fileName}
    >
      {src && !failed ? (
        <img src={src} alt={item.fileName} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="mk-lap-thumb__ph">
          <Icon name="dokumen" size={20} />
        </span>
      )}
      <span className="mk-lap-thumb__name">{item.fileName}</span>
    </a>
  )
}

/**
 * Footer kirim laporan yang menempel di bawah: ringkasan "n entri · x selesai ·
 * y terkendala", tombol primer "Kirim laporan ke Admin PT" (dengan konfirmasi),
 * "Simpan draf", dan "Hapus laporan" bila ada drafnya.
 */
export function SendBar({
  summary,
  hint,
  error,
  submitted,
  canSave,
  canSubmit,
  canDelete,
  busy,
  isPhone,
  onSend,
  onDeleteReport,
}: {
  summary: string
  hint: string | null
  error: string | null
  /** Sudah pernah dikirim (belum diteruskan) → tombol menjadi "Kirim ulang laporan". */
  submitted: boolean
  canSave: boolean
  canSubmit: boolean
  canDelete: boolean
  busy: 'save' | 'submit' | 'delete' | null
  isPhone: boolean
  onSend: (action: 'save' | 'submit') => void
  onDeleteReport: () => void
}) {
  return (
    <div className="mk-lap-send">
      {error && (
        <p className="mk-note-box mk-soft--late flex items-start gap-2" role="alert">
          <Icon name="peringatan" size={18} className="shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {hint && <p className="t-footnote text-ink-2">{hint}</p>}
      <div className="mk-lap-send__bar">
        <span className="mk-lap-send__sum">{summary}</span>
        <span className="mk-lap-grow" />
        <Button disabled={busy !== null || !canSave} onClick={() => onSend('save')}>
          {busy === 'save' ? 'Menyimpan…' : 'Simpan draf'}
        </Button>
        <Button
          variant="primary"
          size={isPhone ? 'lg' : 'md'}
          icon="kirim"
          disabled={busy !== null || !canSubmit}
          onClick={() => onSend('submit')}
        >
          {busy === 'submit' ? 'Mengirim…' : submitted ? 'Kirim ulang laporan' : 'Kirim laporan ke Admin PT'}
        </Button>
        {canDelete && (
          <Button variant="destructive" size="sm" disabled={busy !== null} onClick={onDeleteReport}>
            {busy === 'delete' ? 'Menghapus…' : 'Hapus laporan'}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Sheet "Tambah/Ubah entri" — satu tempat semua yang dicatat tentang satu
 * pekerjaan: apa (judul + deskripsi), siapa (pelaksana, bawaan PIC yang login),
 * bagaimana (narasi hasil, status, progres), eskalasi (tanda + keputusan yang
 * dibutuhkan), rencana besok, dan bukti. Entri baru: setelah disimpan, sheet
 * tetap terbuka dan bagian bukti muncul dengan taskId dari hasil simpan.
 */
function EntrySheet({
  open,
  onOpenChange,
  project,
  entry,
  locked,
  dateKey,
  onSaved,
  onEvidenceChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  project: ProjectItem
  entry: Entry | null
  locked: boolean
  dateKey?: string
  onSaved: () => void
  /** Dipanggil setelah bukti entri berubah, agar thumbnail di kartu ikut segar. */
  onEvidenceChanged?: () => void
}) {
  const { user } = useApp()
  const editing = Boolean(entry)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [picName, setPicName] = useState(entry?.picName ?? user.name)
  const [status, setStatus] = useState(entry?.status ?? 'BERJALAN')
  const [progressPct, setProgressPct] = useState(entry?.progressPct ?? 0)
  const [achievementToday, setAchievement] = useState(entry?.achievementToday ?? '')
  const [obstacle, setObstacle] = useState(entry?.obstacle ?? '')
  const [needsEscalation, setNeedsEscalation] = useState(Boolean(entry?.needsEscalation))
  const [decisionNeeded, setDecision] = useState(entry?.decisionNeeded ?? '')
  const [followUp, setFollowUp] = useState(entry?.followUp ?? '')
  /** Id entri setelah tersimpan — membuka bagian bukti. */
  const [savedId, setSavedId] = useState<string | null>(entry?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const evidence = useEvidence(savedId)

  const needsObstacle = status === 'TERKENDALA'
  const needsDecision = needsEscalation || status === 'MENUNGGU_KEPUTUSAN'
  const needsFollowUp = status === 'TERKENDALA'
  const dayDate = dateKey ? new Date(`${dateKey}T00:00:00+07:00`) : new Date()
  // Status lama di luar tiga pilihan tetap terwakili saat mengubah entri lawas.
  const statusOptions = !status || ENTRY_STATUS_OPTIONS.some((o) => o.value === status)
    ? ENTRY_STATUS_OPTIONS
    : [...ENTRY_STATUS_OPTIONS, { value: status, label: TASK_STATUS_META[status]?.label ?? status }]

  async function save() {
    const problems: string[] = []
    if (!title.trim()) problems.push('Judul entri wajib diisi.')
    if (needsObstacle && !obstacle.trim()) problems.push('Uraian kendala wajib diisi untuk status Terkendala.')
    if (needsDecision && !decisionNeeded.trim()) problems.push('Keputusan yang dibutuhkan wajib diisi bila entri ini butuh eskalasi atau keputusan.')
    if (needsFollowUp && !followUp.trim()) problems.push('Rencana besok wajib diisi untuk status Terkendala.')
    if (problems.length) {
      setErrors(problems)
      return
    }
    setBusy(true)
    setErrors([])
    try {
      const res = await fetch('/api/tasks', {
        method: savedId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(savedId ? { id: savedId } : {}),
          projectId: project.id,
          context: 'HARIAN',
          ...(!savedId && dateKey ? { workDate: dateKey } : {}),
          title,
          description,
          picName,
          // Kolom task yang tidak ada di sheet ini (tag, urgensi, jam, subtask)
          // dikirim utuh saat mengubah agar entri dari meja kerja tidak hilang.
          ...(entry
            ? {
                picUserId: entry.picUserId ?? null,
                tags: entry.tags,
                urgency: entry.urgency,
                startTime: wibHHMM(entry.startAt),
                endTime: wibHHMM(entry.endAt),
                subtasks: entry.subtasks.map((s) => ({ title: s.title, isDone: s.isDone })),
              }
            : { tags: [], subtasks: [] }),
          status,
          progressPct,
          obstacle,
          decisionNeeded,
          achievementToday,
          followUp,
          needsEscalation,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[]; task?: { id?: string } }
      if (!res.ok) {
        setErrors(Array.isArray(json.errors) && json.errors.length ? json.errors : [json.error || 'Entri belum tersimpan'])
        return
      }
      const newId = typeof json.task?.id === 'string' ? json.task.id : savedId
      if (newId) setSavedId(newId)
      if (savedId) {
        toast.success('Perubahan entri tersimpan')
        onOpenChange(false)
      } else {
        // Entri baru tersimpan: sheet tetap terbuka agar bukti bisa langsung dilampirkan.
        toast.success('Entri ditambahkan')
      }
      onSaved()
    } catch {
      setErrors(['Tidak dapat menghubungi server.'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      eyebrow={project.name}
      title={entry ? 'Ubah entri' : savedId ? 'Entri tersimpan' : 'Tambah entri'}
      subtitle={`Laporan harian · ${formatDateLong(dayDate)}`}
      backLabel="Laporan"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {savedId && !entry ? 'Selesai' : 'Batal'}
          </Button>
          <Button variant="primary" icon="selesai" onClick={save} disabled={busy || locked || !title.trim()}>
            {busy ? 'Menyimpan…' : savedId ? 'Simpan perubahan' : 'Simpan entri'}
          </Button>
        </>
      }
    >
      {locked && (
        <p className="mk-note-box mk-soft--neutral flex items-start gap-2">
          <Icon name="kunci" size={18} className="shrink-0" />
          <span>Laporan hari ini sudah terkunci, jadi entri ini hanya bisa dibaca.</span>
        </p>
      )}
      {!entry && savedId && (
        <p className="mk-note-box mk-soft--info flex items-start gap-2">
          <Icon name="selesai" size={18} className="shrink-0" />
          <span>Entri tersimpan. Lampirkan bukti di bawah, ubah isinya bila perlu, lalu tekan Selesai.</span>
        </p>
      )}

      <section className="mk-formsec">
        <SectionTitle icon="catatan">Apa yang dikerjakan</SectionTitle>
        <Field label="Judul entri" htmlFor="entri-title" required>
          <input
            id="entri-title"
            className="mk-lap-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mis. Pemasangan struktur tower segmen 3"
            disabled={locked}
          />
        </Field>
        <Field label="Deskripsi" htmlFor="entri-desc" hint="Opsional · rincian pekerjaan, lokasi, atau catatan penting.">
          <textarea
            id="entri-desc"
            className="mk-lap-input"
            rows={2}
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mis. pengecekan baut dan pengencangan struktur di lokasi A"
            disabled={locked}
          />
        </Field>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="pengguna">Siapa</SectionTitle>
        <Field label="Nama pelaksana" htmlFor="entri-pic" hint="Terisi otomatis dengan nama Anda; ubah bila dikerjakan orang lain.">
          <input
            id="entri-pic"
            className="mk-lap-input"
            value={picName}
            onChange={(e) => setPicName(e.target.value)}
            placeholder="Siapa yang mengerjakan"
            disabled={locked}
          />
        </Field>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="aktivitas">Bagaimana</SectionTitle>
        <Field label="Hasil hari ini" htmlFor="entri-ach" hint="Narasi hasil entri ini; digabung menjadi capaian laporan harian.">
          <textarea
            id="entri-ach"
            className="mk-lap-input"
            rows={2}
            maxLength={4000}
            value={achievementToday}
            onChange={(e) => setAchievement(e.target.value)}
            placeholder="Apa yang selesai atau sedang berjalan? Mis. modul izin selesai diuji"
            disabled={locked}
          />
        </Field>
        <div className="mk-formgrid">
          <Field label="Status" htmlFor="entri-status" required>
            <select
              id="entri-status"
              className={selectCls}
              value={status}
              onChange={(e) => {
                const next = e.target.value
                setStatus(next)
                if (next === 'SELESAI') setProgressPct((p) => (p < 100 ? 100 : p))
              }}
              disabled={locked}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Progres" htmlFor="entri-progress">
            <div className="flex items-center gap-3">
              <input
                id="entri-progress"
                className="mk-lap-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={progressPct}
                onChange={(e) => setProgressPct(Number(e.target.value))}
                disabled={locked}
                aria-label="Progres dalam persen"
              />
              <input
                className="mk-lap-input w-20 text-right tabular-nums"
                type="number"
                min={0}
                max={100}
                value={progressPct}
                onChange={(e) => setProgressPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                disabled={locked}
                aria-label="Progres dalam persen (angka)"
              />
            </div>
          </Field>
        </div>
        {needsObstacle && (
          <Field label="Kendala" htmlFor="entri-obstacle" required hint="Tulis faktanya: apa yang menghambat, sejak kapan, dan dampaknya.">
            <textarea
              id="entri-obstacle"
              className="mk-lap-input"
              rows={2}
              maxLength={2000}
              value={obstacle}
              onChange={(e) => setObstacle(e.target.value)}
              placeholder="Mis. perangkat uji belum tiba sejak Senin"
              disabled={locked}
            />
          </Field>
        )}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="peringatan">Eskalasi</SectionTitle>
        <SwitchRow
          id="entri-esc"
          title="Butuh eskalasi atau keputusan"
          description="Tandai bila entri ini menunggu keputusan atau bantuan tingkat atas."
          checked={needsEscalation}
          onChange={setNeedsEscalation}
          disabled={locked}
        />
        {needsDecision && (
          <Field label="Keputusan yang dibutuhkan" htmlFor="entri-decision" required hint="Keputusan apa yang diminta, dari siapa, dan batas waktunya.">
            <textarea
              id="entri-decision"
              className="mk-lap-input"
              rows={2}
              maxLength={2000}
              value={decisionNeeded}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Mis. persetujuan geser jadwal uji ke 14 Oktober"
              disabled={locked}
            />
          </Field>
        )}
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="kalender">Rencana besok</SectionTitle>
        <Field
          label="Rencana besok"
          htmlFor="entri-followup"
          required={needsFollowUp}
          hint={needsFollowUp ? undefined : 'Opsional · wajib bila Terkendala'}
        >
          <textarea
            id="entri-followup"
            className="mk-lap-input"
            rows={2}
            maxLength={2000}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Langkah berikutnya, mis. konfirmasi jadwal pengiriman perangkat"
            disabled={locked}
          />
        </Field>
      </section>

      <section className="mk-formsec">
        <SectionTitle icon="dokumen">Bukti</SectionTitle>
        {savedId ? (
          <EvidencePanel
            targetType="TASK"
            targetId={savedId}
            items={evidence.items}
            disabled={locked}
            onChanged={() => {
              evidence.reload()
              onEvidenceChanged?.()
              onSaved()
            }}
          />
        ) : (
          <p className="t-footnote text-ink-2">Dokumen dan foto dapat dilampirkan setelah entri disimpan.</p>
        )}
      </section>

      {errors.length > 0 && (
        <div className="mk-note-box mk-soft--late flex flex-col gap-1" role="alert">
          {errors.map((e, i) => (
            <p key={i} className="flex items-start gap-2">
              <Icon name="peringatan" size={18} className="shrink-0" />
              <span>{e}</span>
            </p>
          ))}
        </div>
      )}
    </Sheet>
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
      const json = (await res.json().catch(() => ({}))) as { error?: string }
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
