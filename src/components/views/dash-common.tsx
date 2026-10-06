'use client'

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '@/components/app-provider'
import { NotificationButton } from '@/components/shell'
import {
  Button, FlowDiagram, PageHeader, ProgressRing, Sheet, StatusBadge,
  type FlowStep, type Status, type Tone,
} from '@/components/mk'
import { PROJECT_PHASE_LABELS } from '@/lib/constants'
import { isProjectOverseer } from '@/lib/oversight-shared'
import {
  ProjectNoteComposer, ProjectStages, ReviewLine, useProjectReview, type NoteComposerHandle,
} from '@/components/oversight/project-sheet-parts'
import { startOfDayWIB } from '@/lib/wib'
import { firstName, formatDateLong, formatDateShort, formatRelative, greeting, isoWeekNumber } from '@/lib/format'

/** Warna seri per urutan (perusahaan/divisi), selalu dengan label langsung. */
export const SERIES: Tone[] = ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6']
export const seriesTone = (i: number): Tone => SERIES[i % SERIES.length]

/*
 * Jam & tanggal per menit sebagai "store" luar. Server (dan lintasan hidrasi) tidak tahu
 * jam pengguna sehingga mendapat null; komponen yang dipasang di klien — mis. saat
 * berpindah tab — langsung membaca waktu sekarang tanpa render perantara.
 */
const MINUTE = 60000
function subscribeMinute(onChange: () => void) {
  let t = 0
  const arm = () => {
    t = window.setTimeout(() => {
      onChange()
      arm()
    }, MINUTE - (Date.now() % MINUTE) + 50)
  }
  arm()
  return () => window.clearTimeout(t)
}
const minuteNow = () => Math.floor(Date.now() / MINUTE)
const noMinute = () => null

function useNow() {
  const minute = useSyncExternalStore<number | null>(subscribeMinute, minuteNow, noMinute)
  return useMemo(() => (minute === null ? null : new Date(minute * MINUTE)), [minute])
}

/**
 * Header dashboard: konteks (tanggal · minggu · cakupan) + sapaan large title.
 * Sebelum jam diketahui (render server & hidrasi), judul dan konteks dirender tak
 * terlihat dengan tinggi sama — tidak ada teks pengganti yang berkedip ke sapaan.
 */
export function DashHeader({ context, tools }: { context?: string; tools?: React.ReactNode }) {
  const { user } = useApp()
  const now = useNow()
  const name = firstName(user.name)
  const ctx = now ? [formatDateLong(now), `Minggu ke-${isoWeekNumber(now)}`, context].filter(Boolean).join(' · ') : null
  return (
    <PageHeader
      context={ctx ?? <span className="invisible" aria-hidden>{context ?? 'Memuat tanggal'}</span>}
      title={now ? `${greeting(now)}, ${name}` : <span className="invisible">{`Selamat datang, ${name}`}</span>}
      tools={
        <>
          {tools}
          {/* Disembunyikan saat mode Dock: Dock desktop punya lonceng sendiri (css/utang-teknis.css). */}
          <span className="mk-desktop-only mk-headbell">
            <NotificationButton />
          </span>
        </>
      }
    />
  )
}

const PHASES = ['INISIASI', 'PERENCANAAN', 'PELAKSANAAN', 'PENYELESAIAN'] as const

/** Tahapan proyek sebagai alur: tahap berjalan `current`, atau `blocked` bila tidak sesuai jadwal. */
export function phaseSteps(phase: string, status: Status, reason?: string | null): FlowStep[] {
  const idx = Math.max(0, PHASES.indexOf(phase as (typeof PHASES)[number]))
  return PHASES.map((p, i) => ({
    title: PROJECT_PHASE_LABELS[p] ?? p,
    status:
      status === 'done' || i < idx
        ? 'done'
        : i === idx
          ? status === 'risk' || status === 'late'
            ? 'blocked'
            : 'current'
          : 'todo',
    meta:
      i === idx && status !== 'done'
        ? status === 'late'
          ? 'Lewat tenggat'
          : status === 'risk'
            ? (reason ?? 'Tertahan')
            : undefined
        : undefined,
  }))
}

export type ProjectLite = {
  id: string
  name: string
  code: string
  phase: string
  entityName: string
  pic: string
  status: Status
  reason: string | null
  progress: number
  targetEndDate: string | null
  lastReportAt?: string | null
  lastNote?: string | null
  /** [F2-DIREKTUR] opsional: "x dari y output" dan divisi di subjudul Sheet. */
  outputsDone?: number
  outputsTotal?: number
  divisionName?: string | null
}

/**
 * Detail proyek di Sheet: cincin, status, x dari y output, tenggat, tahapan, catatan terakhir PIC.
 * [F2-DIREKTUR] Untuk pengawas (Manajemen, Direktur, Direksi holding, Super Admin, TI):
 * tahapan bertanggal dari ProjectStage, "Kirim catatan ke PIC", dan "Tandai sudah ditinjau"
 * (src/components/oversight/project-sheet-parts.tsx).
 */
export function ProjectSheet({
  project,
  onClose,
  onReviewed,
}: {
  project: ProjectLite | null
  onClose: () => void
  /** Dipanggil setelah tanda tinjauan berubah (mis. untuk memuat ulang ringkasan). */
  onReviewed?: () => void
}) {
  const { user, setActiveTab } = useApp()
  // Isi tetap tampil selama animasi menutup, jadi sheet tidak berkedip kosong.
  const [last, setLast] = useState<ProjectLite | null>(project)
  const [noteOpen, setNoteOpen] = useState(false)
  const composer = useRef<NoteComposerHandle>(null)
  if (project && project !== last) {
    setLast(project)
    setNoteOpen(false)
  }
  const p = project ?? last
  const overseer = isProjectOverseer(user.role)
  const review = useProjectReview(overseer && project ? project.id : null, onReviewed)
  const outputs = p && typeof p.outputsTotal === 'number' && p.outputsTotal > 0 ? `${p.outputsDone ?? 0} dari ${p.outputsTotal} output` : null

  const openModule = () => {
    onClose()
    setActiveTab('projects')
  }

  const footer = overseer ? (
    // Dua label panjang di Sheet 440: turun ke baris kedua bila tidak muat (oversight.css).
    <div className="mk-ovfoot">
      <Button
        variant="secondary"
        icon="catatan"
        onClick={() => {
          setNoteOpen(true)
          window.setTimeout(() => composer.current?.focus(), 0)
        }}
      >
        Kirim catatan ke PIC
      </Button>
      {review.available ? (
        <Button variant="primary" icon="selesai" disabled={review.busy} onClick={review.mark}>
          {review.reviewedToday ? 'Tandai ditinjau lagi' : 'Tandai sudah ditinjau'}
        </Button>
      ) : null}
    </div>
  ) : (
    <Button variant="primary" onClick={openModule}>
      Buka modul proyek
    </Button>
  )

  return (
    <Sheet
      open={!!project}
      onOpenChange={(o) => !o && onClose()}
      title={p?.name ?? ''}
      subtitle={p ? `${p.divisionName ?? p.entityName} · ${p.pic}` : undefined}
      eyebrow={p ? <StatusBadge status={p.status} size="sm" /> : undefined}
      backLabel="Proyek"
      footer={footer}
    >
      {p && (
        <>
          <div className="flex items-center gap-5">
            <ProgressRing value={p.progress} size={112} status={p.status === 'neutral' ? 'accent' : p.status} sublabel="selesai" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="t-headline">{outputs ?? `${p.progress}% selesai`}</span>
              <span className="t-footnote text-ink-2">
                {p.targetEndDate ? `Tenggat ${formatDateShort(p.targetEndDate)}` : 'Tenggat belum ditetapkan'}
              </span>
              <span className="t-footnote text-ink-2">
                {p.lastReportAt ? `Laporan harian terakhir ${formatRelative(p.lastReportAt).toLowerCase()}` : 'Belum ada laporan harian'}
              </span>
              <span className="t-caption text-ink-3 font-mono">{p.code}</span>
            </div>
          </div>
          {overseer ? <ReviewLine ctl={review} /> : null}
          {p.reason && (
            <div className={`mk-note-box ${p.status === 'late' ? 'mk-soft--late' : 'mk-soft--risk'}`}>{p.reason}</div>
          )}
          <div>
            <h3 className="t-headline mb-3">Tahapan</h3>
            {overseer ? (
              <ProjectStages key={p.id} projectId={p.id} fallback={phaseSteps(p.phase, p.status, p.reason)} />
            ) : (
              <FlowDiagram orientation="vertical" steps={phaseSteps(p.phase, p.status, p.reason)} label="Tahapan proyek" />
            )}
          </div>
          {p.lastNote && (
            <div>
              <h3 className="t-headline mb-2">Catatan terakhir PIC</h3>
              <p className="mk-inset t-body text-ink">{p.lastNote}</p>
            </div>
          )}
          {overseer && noteOpen ? <ProjectNoteComposer key={p.id} ref={composer} projectId={p.id} pic={p.pic} /> : null}
          {overseer ? (
            <div>
              <Button variant="plain" size="sm" iconAfter="kanan" onClick={openModule}>
                Buka modul proyek
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  )
}

/** Rentang timeline: mulai minggu ini dikurangi 2 minggu, sampai tenggat terjauh (maks. ±16 minggu). */
export function timelineFrame(rows: { startDate: string | null; targetEndDate: string | null }[]) {
  const DAY = 86400000
  // "Hari ini" menurut WIB (00.00 WIB), bukan zona waktu peramban [F1-D] — sama
  // dengan tanggal laporan dan tenggat di server (src/lib/lock.ts).
  const today = startOfDayWIB(new Date()).getTime()
  const starts = rows.map((r) => (r.startDate ? Date.parse(r.startDate) : NaN)).filter((n) => !isNaN(n))
  const ends = rows.map((r) => (r.targetEndDate ? Date.parse(r.targetEndDate) : NaN)).filter((n) => !isNaN(n))
  let from = Math.min(today - 14 * DAY, ...starts)
  from = Math.max(from, today - 56 * DAY)
  let to = Math.max(today + 21 * DAY, ...ends)
  to = Math.min(to, today + 112 * DAY)
  const span = Math.max(14, Math.round((to - from) / DAY))
  const step = span > 70 ? 28 : 7
  const ticks: { label: string; at: number }[] = []
  for (let d = 0; d <= span; d += step) ticks.push({ label: formatDateShort(new Date(from + d * DAY)), at: d })
  const at = (iso: string | null, fallback: number) => (iso ? Math.round((Date.parse(iso) - from) / DAY) : fallback)
  return { span, ticks, today: Math.round((today - from) / DAY), at, from }
}
