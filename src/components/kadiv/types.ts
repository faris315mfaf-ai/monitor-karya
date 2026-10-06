/**
 * Bentuk data fitur kepala divisi (03-kepala-divisi.md). Dipakai bersama oleh
 * route API (src/app/api/kadiv/*, /api/outputs/review, /api/attendance),
 * komponen di src/components/kadiv/, dan data pratinjau (mock-kadiv.ts).
 */

// [F2-DIREKTUR] TERLAMBAT = hadir tetapi terlambat; tetap dihitung hadir (bukan ABSENT).
export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'CUTI' | 'SAKIT' | 'IZIN'

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  CUTI: 'Cuti',
  SAKIT: 'Sakit',
  IZIN: 'Izin',
}

/**
 * Status laporan harian satu anggota hari ini:
 * - TERKIRIM: semua proyek yang ia pegang sudah mengirim laporan hari ini.
 * - BELUM: masih ada proyek yang laporannya belum masuk.
 * - ABSEN: cuti/sakit/izin — tidak dihitung di penyebut.
 * - TIDAK_WAJIB: tidak memegang proyek aktif — tidak dihitung di penyebut.
 */
export type DailyState = 'TERKIRIM' | 'BELUM' | 'ABSEN' | 'TIDAK_WAJIB'

export type TeamMember = {
  id: string
  name: string
  title: string | null
  role: string
  initials: string
  /** true bila tercatat lewat User.divisionId; false bila masuk tim karena PIC proyek divisi. */
  isMember: boolean
  attendance: AttendanceStatus
  attendanceNote: string | null
  projects: { id: string; code: string; name: string }[]
  report: {
    state: DailyState
    /** Proyek yang wajib lapor hari ini / yang sudah terkirim. */
    required: number
    sent: number
    /** Kiriman terakhir hari ini (ISO). */
    submittedAt: string | null
    remindedAt: string | null
    /** Kapan Anda menandai laporan hari ini sudah dibaca [F2-KADIV]; null = belum. */
    readAt: string | null
  }
  today: {
    tasks: { id: string; title: string; status: string; progressPct: number; projectName: string }[]
    /** Isi "Capaian hari ini" dari laporan harian yang sudah masuk [F2-KADIV]. */
    achievements: string[]
    obstacles: string[]
    plans: string[]
  }
  /** Beban kerja: lihat rumus di src/lib/kadiv.ts (workloadPct). null = tidak ada kapasitas (cuti sepanjang sisa minggu). */
  load: { pct: number | null; openTasks: number; openMinutes: number }
}

export type TeamActivity = {
  id: string
  actorName: string
  initials: string
  text: string
  at: string
}

/** Status proyek dari src/lib/project-status.ts. */
export type KadivProjectStatus = 'on' | 'risk' | 'late' | 'done' | 'neutral'

/**
 * Proyek divisi untuk Timeline dan Sheet proyek [F2-KADIV]
 * (03-kepala-divisi.md §6 dan "Sheet · Proyek": ring, status, output, tenggat, tahapan).
 */
export type KadivProject = {
  id: string
  code: string
  name: string
  picName: string | null
  phase: string
  startDate: string | null
  targetEndDate: string | null
  status: KadivProjectStatus
  reason: string | null
  /** Progres laporan harian terakhir (0–100). */
  progress: number
  outputs: { total: number; accepted: number; pending: number; revise: number; open: number }
  /** Tenggat output terbuka terdekat. */
  nextOutputDue: string | null
  stages: { id: string; name: string; status: string; dueDate: string | null }[]
  lastReport: { date: string; status: string; submittedAt: string | null } | null
}

export type KadivTeam = {
  today: string
  lockAt: string
  locked: boolean
  cutoffLabel: string
  division: { id: string; name: string; entityName: string } | null
  divisions: { id: string; name: string }[]
  projects: KadivProject[]
  members: TeamMember[]
  /** 10 hari kerja terakhir (ISO, tengah malam WIB), urut lama → baru. */
  days: string[]
  /** Baris = members (urutan sama), kolom = days. null = cuti/sakit/izin. */
  heat: (number | null)[][]
  trend: { label: string; accepted: number; target: number }[]
  activity: TeamActivity[]
  /**
   * KPI "Tepat waktu 30 hari" [F2-KADIV]: laporan harian proyek divisi yang
   * terkirim sebelum tenggat ÷ laporan wajib, 30 hari terakhir. Rumus:
   * src/lib/kadiv-math.ts (onTimeDaily). pct null = belum ada laporan wajib.
   */
  onTime30: { pct: number | null; ok: number; total: number; target: number; days: number }
  summary: {
    members: number
    present: number
    absent: number
    absentNames: string[]
    /** Penyebut laporan harian: anggota wajib lapor yang tidak cuti. */
    reporters: number
    reported: number
    outputsAccepted: number
    outputsTarget: number
    pendingReview: number
    avgLoad: number | null
    overloaded: number
  }
}

export type ReviewOutput = {
  id: string
  title: string
  description: string | null
  status: string
  project: { id: string; code: string; name: string }
  owner: { id: string; name: string; initials: string }
  submittedAt: string | null
  dueDate: string | null
  evidenceCount: number
  reviewedAt: string | null
  revisionNote: string | null
}

export type ReviewQueue = {
  queue: ReviewOutput[]
  /** Keputusan Anda dalam 24 jam terakhir — dasar label "Diterima / Revisi diminta" dan tombol Urungkan. */
  decided: ReviewOutput[]
  /** Batas waktu urungkan dalam menit. */
  undoMinutes: number
}

/* ------------------------------------------------------------------ */
/* Ringkasan laporan mingguan untuk Direktur [F2-KADIV]                 */
/* ------------------------------------------------------------------ */

export type WeeklySummaryStats = {
  outputsAccepted: number
  outputsTarget: number
  projectsOnTrack: number
  projectsTotal: number
  openObstacles: number
  pendingReview: number
}

/** Bentuk GET /api/kadiv/weekly-summary (lihat docs/fitur/peran-kadiv.md). */
export type WeeklySummaryView = {
  division: { id: string; name: string }
  week: { key: string; isoYear: number; isoWeek: number; start: string; handoverBy: string; lockAt: string }
  /** Angka dan poin terkini, dihitung ulang setiap kali dibuka. */
  live: WeeklySummaryStats & { points: string[] }
  /** Baris tersimpan (draf yang disunting atau yang sudah dikirim); null = belum pernah disimpan. */
  saved:
    | (WeeklySummaryStats & {
        status: 'DRAF' | 'TERKIRIM'
        points: string[]
        sentAt: string | null
        updatedAt: string
      })
    | null
  /** Laporan harian minggu ini: terkirim / wajib (langkah "Kumpulkan"). */
  daily: { sent: number; required: number }
  report: { id: string; statusHeader: string; submittedAt: string | null; approvedAt: string | null; forwardedAt: string | null } | null
  directors: { id: string; name: string }[]
  /** null = boleh disunting; selain itu alasan terkunci. */
  blocked: { code: string; message: string } | null
  undoMinutes: number
}
