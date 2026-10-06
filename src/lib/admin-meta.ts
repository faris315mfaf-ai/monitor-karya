/**
 * Data & label fitur Admin PT (6 Okt 2026, 04-admin-pt.md) yang aman dipakai
 * dari komponen klien: jenis permintaan akses, jenis pengingat otomatis dan
 * nilai bawaannya, serta bentuk respons API-nya. Logika server ada di
 * src/lib/access-requests.ts dan src/lib/reminder-rules.ts.
 */

export const ACCESS_REQUEST_TYPES = ['AKUN_BARU', 'AKSES_SEMENTARA', 'PINDAH_PERAN'] as const
export type AccessRequestType = (typeof ACCESS_REQUEST_TYPES)[number]

export const ACCESS_REQUEST_LABELS: Record<AccessRequestType, string> = {
  AKUN_BARU: 'Akun baru',
  AKSES_SEMENTARA: 'Akses sementara',
  PINDAH_PERAN: 'Pindah peran',
}

export const ACCESS_STATUS = ['DIAJUKAN', 'DISETUJUI', 'DITOLAK'] as const
export type AccessStatus = (typeof ACCESS_STATUS)[number]

/** Batas hari akses sementara. */
export const MAX_TEMP_ACCESS_DAYS = 90

export type AccessRequestItem = {
  id: string
  type: AccessRequestType
  status: AccessStatus
  /** Kalimat ringkas, mis. "Akun baru Galih Pratama". */
  title: string
  /** Rincian, mis. "Operasional · peran Manager / PIC Proyek". */
  detail: string
  reason: string | null
  entityId: string | null
  entityName: string | null
  requester: { id: string; name: string } | null
  target: { id: string; name: string } | null
  decidedBy: { id: string; name: string } | null
  decidedAt: string | null
  decisionNote: string | null
  expiresAt: string | null
  revertedAt: string | null
  createdAt: string
  /** Boleh diputuskan oleh akun yang sedang masuk. */
  canDecide: boolean
}

export type AccessRequestList = { items: AccessRequestItem[]; pending: number; canDecide: boolean }

// ------------------------------------------------------------------
// Pengingat otomatis
// ------------------------------------------------------------------

export const REMINDER_KINDS = ['HARIAN', 'MINGGUAN', 'ESKALASI_KADIV', 'RINGKASAN_MANAJEMEN'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

export type ReminderRuleView = {
  kind: ReminderKind
  enabled: boolean
  /** "HH:MM" WIB */
  time: string
  /** 1 = Senin … 7 = Minggu; null = setiap hari kerja */
  weekday: number | null
  params: { days?: number }
  lastRunAt: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export const REMINDER_DEFAULTS: Record<ReminderKind, Omit<ReminderRuleView, 'kind' | 'lastRunAt' | 'updatedAt' | 'updatedBy'>> = {
  HARIAN: { enabled: true, time: '16:30', weekday: null, params: {} },
  MINGGUAN: { enabled: true, time: '13:00', weekday: 5, params: {} },
  ESKALASI_KADIV: { enabled: true, time: '09:00', weekday: null, params: { days: 2 } },
  RINGKASAN_MANAJEMEN: { enabled: false, time: '08:00', weekday: 1, params: {} },
}

/** Nama pengingat dalam kalimat log: "<nama> mematikan <label>". */
export const REMINDER_LABELS: Record<ReminderKind, string> = {
  HARIAN: 'pengingat laporan harian',
  MINGGUAN: 'pengingat laporan mingguan',
  ESKALASI_KADIV: 'eskalasi ke kepala divisi',
  RINGKASAN_MANAJEMEN: 'ringkasan untuk manajemen',
}

export const REMINDER_TITLES: Record<ReminderKind, string> = {
  HARIAN: 'Pengingat laporan harian',
  MINGGUAN: 'Pengingat laporan mingguan',
  ESKALASI_KADIV: 'Eskalasi ke kepala divisi',
  RINGKASAN_MANAJEMEN: 'Ringkasan untuk manajemen',
}

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

/** Keterangan jadwal, mis. "Setiap hari kerja 16.30" atau "Jumat 13.00". */
export function reminderSchedule(r: Pick<ReminderRuleView, 'kind' | 'time' | 'weekday' | 'params'>): string {
  const t = r.time.replace(':', '.')
  if (r.kind === 'ESKALASI_KADIV') return `${r.params.days ?? 2} hari tidak lapor · dicek ${t}`
  return r.weekday ? `${DAYS[r.weekday] ?? ''} ${t}` : `Setiap hari kerja ${t}`
}

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// ------------------------------------------------------------------
// Ringkasan Admin (/api/admin/overview)
// ------------------------------------------------------------------

export type AdminOverview = {
  scope: 'ALL' | 'ENTITY'
  entityName: string | null
  masterData: {
    entities: number
    divisions: number
    projects: number
    activeProjects: number
    users: number
    activeUsers: number
    templates: number
  }
  usersByRole: { role: string; label: string; count: number }[]
  /** Kepatuhan harian per orang (keanggotaan divisi, User.divisionId). */
  compliance: {
    hasMembership: boolean
    divisions: {
      id: string
      name: string
      head: string | null
      expected: number
      reported: number
      onLeave: number
      missing: { id: string; name: string; role: string; lastReportAt: string | null }[]
    }[]
  }
  unlocks: { pending: number; approved: number }
  canManageReminders: boolean
}

export type UnlockItem = {
  id: string
  targetType: string
  targetId: string
  targetLabel: string
  reason: string
  status: 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DIEKSEKUSI'
  requestedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
  executedBy: { id: string; name: string } | null
  approvedAt: string | null
  executedAt: string | null
  unlockUntil: string | null
  reLockedAt: string | null
  createdAt: string
}
