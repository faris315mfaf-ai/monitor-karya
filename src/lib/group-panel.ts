import { ROLE_CAPABILITIES, type Capability } from '@/lib/rbac'
import type { ReminderKind } from '@/lib/admin-meta'

/**
 * [F2-GRUP] Peran grup (06 SDM & GA, 07 TI, 08 Auditor, Super Admin): aturan
 * murni yang dipakai API /api/system/grup, konsol Sistem & akses, log aktivitas,
 * dan tes. Tidak menyentuh basis data.
 */

/** Kewenangan yang hanya membaca. Peran yang tidak punya kewenangan lain = hanya-baca. */
export const READ_ONLY_CAPABILITIES: readonly Capability[] = ['audit:read', 'group:read']

/** Peran tanpa satu pun kewenangan menulis (Auditor). Peran tak dikenal juga dianggap hanya-baca. */
export function isReadOnlyRole(role: string): boolean {
  const caps = ROLE_CAPABILITIES[role] ?? []
  return caps.every((c) => READ_ONLY_CAPABILITIES.includes(c))
}

export const READ_ONLY_MESSAGE = 'Akun Anda hanya bisa membaca. Perubahan dilakukan oleh pemilik proses.'

/** Panel khusus di Ringkasan untuk tiap peran grup. */
export type GroupPanelKind = 'SDM' | 'TEKNIS' | 'AUDIT'

export function groupPanelKind(role: string): GroupPanelKind | null {
  if (role === 'DIREKTUR_SDM_GA') return 'SDM'
  if (role === 'TI' || role === 'SUPERADMIN') return 'TEKNIS'
  if (role === 'AUDITOR') return 'AUDIT'
  return null
}

// ------------------------------------------------------------------
// Proses otomatis (cron VPS, deploy/app-vps/cron.sh)
// ------------------------------------------------------------------

export type CronJob = 'reminder-rules' | 'remind-divisions' | 'kpi-snapshot'

export type CronJobDef = {
  job: CronJob
  label: string
  schedule: string
  /** Aksi AuditLog yang ditulis saat job berjalan. */
  action: string
  /** Lewat dari ini sejak jalan terakhir = terlambat (memperhitungkan akhir pekan). */
  maxGapHours: number
}

export const CRON_JOBS: readonly CronJobDef[] = [
  {
    job: 'reminder-rules',
    label: 'Pengingat otomatis',
    schedule: 'Tiap 30 menit, 07.00–18.00 WIB hari kerja',
    action: 'AUTO_REMINDER',
    maxGapHours: 74,
  },
  {
    job: 'remind-divisions',
    label: 'Pengingat divisi mingguan',
    schedule: '09.00 WIB hari kerja',
    action: 'CRON_DIVISION_REMINDERS',
    maxGapHours: 74,
  },
  {
    job: 'kpi-snapshot',
    label: 'Cuplikan KPI',
    schedule: '17.30 WIB setiap hari',
    action: 'KPI_SNAPSHOT',
    maxGapHours: 26,
  },
]

export type CronHealth = 'on' | 'late' | 'neutral'

/** Sehat bila jalan terakhir masih dalam jendela job; `neutral` = belum pernah tercatat. */
export function cronHealth(lastAt: Date | string | null, maxGapHours: number, now: Date = new Date()): CronHealth {
  if (!lastAt) return 'neutral'
  const t = typeof lastAt === 'string' ? Date.parse(lastAt) : lastAt.getTime()
  if (!Number.isFinite(t)) return 'neutral'
  return now.getTime() - t > maxGapHours * 3600000 ? 'late' : 'on'
}

// ------------------------------------------------------------------
// Beban kerja PIC (Direksi holding SDM & GA)
// ------------------------------------------------------------------

export type WorkloadLevel = 'on' | 'risk' | 'late'

/** Ambang beban: ≥ 6 proyek aktif atau ≥ 15 tugas terbuka = berlebih; ≥ 4 / ≥ 10 = tinggi. */
export function workloadLevel(activeProjects: number, openTasks: number): WorkloadLevel {
  if (activeProjects >= 6 || openTasks >= 15) return 'late'
  if (activeProjects >= 4 || openTasks >= 10) return 'risk'
  return 'on'
}

export const WORKLOAD_LABEL: Record<WorkloadLevel, string> = {
  on: 'Wajar',
  risk: 'Beban tinggi',
  late: 'Beban berlebih',
}

// ------------------------------------------------------------------
// Jejak audit (Auditor)
// ------------------------------------------------------------------

/** Aksi yang mengubah hak, kunci, atau akun — disorot di panel Auditor. */
export const SENSITIVE_AUDIT_ACTIONS = [
  'UNLOCK_EXECUTE',
  'APPROVE_UNLOCK',
  'RELOCK_REPORT',
  'RESET_PASSWORD',
  'CREATE_ACCOUNT',
  'UPDATE_ACCOUNT',
  'DELETE_ACCOUNT',
  'APPROVE_ACCESS_REQUEST',
  'GRANT_TEMP_ACCESS',
  'UPDATE_REMINDER_RULE',
  'DELETE_PROJECT',
  'DELETE_COMPANY',
] as const

/** Saringan teks bebas dari query string: dipangkas dan dibatasi panjangnya. */
export function shortParam(raw: string | null, max = 64): string | undefined {
  const v = (raw ?? '').trim()
  if (!v) return undefined
  return v.length > max ? undefined : v
}

// ------------------------------------------------------------------
// Bentuk respons /api/system/grup dan bagian `technical` /api/system
// ------------------------------------------------------------------

export type CronStatus = {
  job: CronJob
  label: string
  schedule: string
  lastAt: string | null
  health: CronHealth
}

export type ReminderMatrixRow = {
  entityId: string
  entityName: string
  entityCode: string
  rules: { kind: ReminderKind; enabled: boolean; time: string; weekday: number | null; days: number | null; lastRunAt: string | null }[]
}

export type TechnicalStatus = {
  unlocks: { waitingApproval: number; waitingExecution: number; activeNow: number }
  /** null = tabel AccessRequest belum dimigrasi. */
  accessPending: number | null
  cron: CronStatus[]
  reminders: { enabled: number; total: number; lastRunAt: string | null } | null
  accounts: { active: number; inactive: number; neverLoggedIn: number; noPassword: number; mustChange: number | null }
  notifications: { failed7d: number }
}

export type SdmPanel = {
  kind: 'SDM'
  week: { isoYear: number; isoWeek: number; label: string; handoverBy: string }
  entities: {
    id: string
    name: string
    code: string
    activeProjects: number
    reportedToday: number
    onTime30: number
    total30: number
    divisions: number
    weeklyIn: number
    weeklyLate: number
    people: number
    away: number | null
    openEscalations: number
    lateIncidents30: number
  }[]
  workload: { id: string; name: string; entityCode: string | null; activeProjects: number; openTasks: number; blockedTasks: number; level: WorkloadLevel }[]
  workloadSummary: { pics: number; avgProjects: number; overloaded: number }
  /** null = tabel kehadiran belum dimigrasi (0015). */
  awayToday: { id: string; name: string; entityCode: string | null; status: string; note: string | null }[] | null
}

export type AuditPanel = {
  kind: 'AUDIT'
  late: {
    daily30: number
    dailyTotal30: number
    weeklyLate8w: number
    byEntity: { id: string; name: string; code: string; dailyLate: number; dailyTotal: number; weeklyLate: number }[]
    recent: { id: string; kind: 'HARIAN' | 'MINGGUAN'; label: string; entityCode: string; period: string; submittedAt: string | null }[]
  }
  audit: { last24h: number; last7d: number; total: number; sensitive7d: number; topActions: { action: string; count: number }[] }
  unlocks30: { executed: number; items: { id: string; targetType: string; reason: string; executedAt: string | null; requestedBy: string | null; executedBy: string | null }[] }
}

export type TeknisPanel = { kind: 'TEKNIS' } & TechnicalStatus

export type GroupPanelData = SdmPanel | AuditPanel | TeknisPanel


// ------------------------------------------------------------------
// Kepatuhan per perusahaan (SDM & GA)
// ------------------------------------------------------------------

export type ComplianceInput = {
  activeProjects: number
  onTime30: number
  total30: number
  divisions: number
  weeklyIn: number
  openEscalations: number
}

export type ComplianceVerdict = { status: 'on' | 'risk' | 'late' | 'neutral'; label: string }

/**
 * Status kepatuhan satu PT: tepat waktu 30 hari (target 85%, di bawah 70% =
 * terlambat) dan laporan mingguan minggu laporan yang belum masuk (separuh
 * divisi atau lebih = terlambat). Eskalasi terbuka menjadikannya perlu perhatian.
 */
export function entityCompliance(r: ComplianceInput): ComplianceVerdict {
  if (r.activeProjects === 0 && r.divisions === 0) return { status: 'neutral', label: 'Belum ada yang dilaporkan' }
  const onTime = r.total30 > 0 ? Math.round((r.onTime30 / r.total30) * 100) : null
  const missing = Math.max(0, r.divisions - r.weeklyIn)
  if ((onTime !== null && onTime < 70) || (missing > 0 && missing * 2 >= r.divisions)) {
    return { status: 'late', label: missing > 0 ? `${missing} mingguan belum masuk` : `Tepat waktu ${onTime}%` }
  }
  if ((onTime !== null && onTime < 85) || missing > 0 || r.openEscalations > 0) {
    return {
      status: 'risk',
      label: missing > 0 ? `${missing} mingguan belum masuk` : r.openEscalations > 0 && (onTime === null || onTime >= 85) ? `${r.openEscalations} eskalasi terbuka` : `Tepat waktu ${onTime}%`,
    }
  }
  return { status: 'on', label: 'Patuh' }
}
