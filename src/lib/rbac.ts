import type { NavTabId } from '@/lib/constants'

/**
 * Who may do what. Kept as plain data so the same table drives the navigation
 * a browser renders and the checks every write endpoint performs — the UI hides
 * what a role cannot do, the API refuses it.
 */
export type Capability =
  | 'daily:input' // fill in a project's daily report
  | 'daily:forward' // pass daily reports up to the holding
  | 'weekly:input' // fill in a division's weekly achievement
  | 'weekly:approve' // head of division signs off before locking
  | 'weekly:forward' // Admin PT passes the division bundle up
  | 'escalation:raise'
  | 'escalation:followup'
  | 'escalation:decide'
  | 'project:propose' // Admin PT mengajukan proyek baru
  | 'project:approve' // Direktur Entitas, Direktur SDM&GA, Manajemen menyetujui
  | 'notify:remind' // kirim pengingat ke divisi yang belum melapor (8 Sep 2026)
  | 'unlock:request'
  | 'unlock:approve'
  | 'unlock:execute'
  | 'users:manage'
  | 'companies:manage' // Super Admin: tambah/ubah perusahaan, posisi, akun (10 Sep 2026)
  | 'audit:read'
  | 'group:read' // may read beyond their own entity

const ALL_CAPABILITIES: Capability[] = [
  'daily:input',
  'daily:forward',
  'weekly:input',
  'weekly:approve',
  'weekly:forward',
  'escalation:raise',
  'escalation:followup',
  'escalation:decide',
  'project:propose',
  'project:approve',
  'notify:remind',
  'unlock:request',
  'unlock:approve',
  'unlock:execute',
  'users:manage',
  'companies:manage',
  'audit:read',
  'group:read',
]

export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  // Reports project progress every working day, with obstacles and evidence.
  PIC_PROYEK: ['daily:input', 'escalation:raise'],

  // Hands the division's weekly achievement to Admin PT by Thursday and signs
  // it off before it locks.
  KEPALA_DIVISI: ['weekly:input', 'weekly:approve', 'escalation:raise'],

  // Enters everything on schedule, checks each item passes validation, and
  // forwards both streams upward.
  ADMIN_PT: [
    'daily:input',
    'daily:forward',
    'weekly:input',
    'weekly:forward',
    'escalation:raise',
    'project:propose',
    'notify:remind',
    'unlock:request',
  ],

  // Answers for reporting compliance in their entity and chases blocked items.
  DIREKTUR_ENTITAS: ['escalation:raise', 'escalation:followup', 'project:approve', 'notify:remind', 'audit:read'],

  // Process owner at the holding: reviews the dashboard, keeps notes and the
  // escalation list, and reports to Management.
  DIREKTUR_SDM_GA: [
    'escalation:raise',
    'escalation:followup',
    'project:approve',
    'notify:remind',
    'unlock:approve',
    'audit:read',
    'group:read',
  ],

  // Keeps the system available, manages access, and owns the locking and
  // notification machinery. Everything except the company/account desk,
  // which belongs to the Super Admin.
  TI: ALL_CAPABILITIES.filter((c) => c !== 'companies:manage'),

  // Super Admin (10 Sep 2026): the owner's account. Adds companies, positions
  // and accounts, resets passwords — and may open every other module.
  SUPERADMIN: ALL_CAPABILITIES,

  // Receives reports, decides escalated issues, watches compliance.
  MANAJEMEN: ['escalation:decide', 'escalation:followup', 'project:approve', 'audit:read', 'group:read'],

  AUDITOR: ['audit:read', 'group:read'],
}

/**
 * Tabs each role sees, in order. The first entry is that role's landing tab.
 */
export const ROLE_TABS: Record<string, NavTabId[]> = {
  PIC_PROYEK: ['dashboard', 'daily-input', 'projects'],
  KEPALA_DIVISI: ['dashboard', 'weekly-input', 'divisions'],
  // Sejak 8 Sep 2026 isian mingguan divisi untuk Admin PT ada di Modul Divisi
  // (pilih entitas & divisi), jadi tab Capaian Mingguan tidak lagi dobel.
  ADMIN_PT: ['dashboard', 'work-desk', 'inbox', 'daily-input', 'projects', 'divisions', 'escalations'],
  DIREKTUR_ENTITAS: ['dashboard', 'projects', 'divisions', 'escalations', 'entities'],
  DIREKTUR_SDM_GA: ['dashboard', 'projects', 'divisions', 'escalations', 'entities', 'audit'],
  TI: [
    'dashboard',
    'work-desk',
    'inbox',
    'daily-input',
    'weekly-input',
    'projects',
    'divisions',
    'escalations',
    'entities',
    'audit',
    'system',
  ],
  SUPERADMIN: [
    'dashboard',
    'companies',
    'projects',
    'divisions',
    'escalations',
    'entities',
    'work-desk',
    'inbox',
    'daily-input',
    'weekly-input',
    'audit',
    'system',
  ],
  MANAJEMEN: ['dashboard', 'escalations', 'projects', 'divisions', 'entities', 'audit'],
  AUDITOR: ['dashboard', 'projects', 'divisions', 'entities', 'audit'],
}

const FALLBACK_TABS: NavTabId[] = ['dashboard']

/** The three signatures a proposed project needs before it becomes active. */
export const PROJECT_APPROVER_ROLES = ['DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'MANAJEMEN'] as const

/**
 * Akun induk yang tidak terpaku pada satu entitas dan boleh menulis di mana
 * pun: Tim TI dan Super Admin. Endpoint tulis memakai ini, bukan
 * membandingkan peran satu per satu.
 */
export const MASTER_ROLES = ['TI', 'SUPERADMIN'] as const

export function isMasterRole(role: string): boolean {
  return (MASTER_ROLES as readonly string[]).includes(role)
}

/** Peran yang cakupannya satu entitas (dibuat Super Admin lewat "posisi"). */
export const ENTITY_ROLES = ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK', 'DIREKTUR_ENTITAS'] as const

/** Peran tingkat holding, tanpa entitas tertentu. */
export const HOLDING_ROLES = ['MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI', 'AUDITOR'] as const

export const ALL_ROLES = [...ENTITY_ROLES, ...HOLDING_ROLES] as const

export function can(role: string, capability: Capability): boolean {
  return (ROLE_CAPABILITIES[role] ?? []).includes(capability)
}

export function tabsForRole(role: string): NavTabId[] {
  return ROLE_TABS[role] ?? FALLBACK_TABS
}

export function defaultTabForRole(role: string): NavTabId {
  return tabsForRole(role)[0] ?? 'dashboard'
}

export function canSeeTab(role: string, tab: NavTabId): boolean {
  return tabsForRole(role).includes(tab)
}

/** One-line summary of the role's duty, shown on their dashboard. */
export const ROLE_DUTIES: Record<string, string> = {
  PIC_PROYEK:
    'Sampaikan perkembangan proyek kepada Admin PT setiap hari kerja, termasuk kendala dan bukti pendukung.',
  KEPALA_DIVISI:
    'Serahkan capaian mingguan divisi kepada Admin PT paling lambat hari Kamis, lalu setujui isian sebelum dikunci.',
  ADMIN_PT:
    'Input seluruh data sesuai jadwal, pastikan setiap item lolos validasi, dan teruskan ke tingkat berikutnya.',
  DIREKTUR_ENTITAS:
    'Pastikan kepatuhan pelaporan di entitas Anda dan tindak lanjuti item berstatus Terkendala.',
  DIREKTUR_SDM_GA:
    'Pemilik proses di holding: tinjau dashboard, susun catatan dan daftar eskalasi, lalu sampaikan laporan kepada Manajemen.',
  TI: 'Jaga ketersediaan sistem, kelola hak akses, pencadangan data, serta mekanisme penguncian dan notifikasi.',
  SUPERADMIN:
    'Kelola perusahaan, posisi, dan akun seluruh grup: tambah perusahaan, atur jabatan, setel ulang kata sandi.',
  MANAJEMEN:
    'Terima laporan, putuskan isu yang dieskalasi, dan pantau indikator kepatuhan seluruh grup.',
  AUDITOR: 'Telaah data dan jejak audit seluruh grup secara baca-saja.',
}
