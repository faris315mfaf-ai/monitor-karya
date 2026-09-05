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
  | 'unlock:request'
  | 'unlock:approve'
  | 'unlock:execute'
  | 'users:manage'
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
  'unlock:request',
  'unlock:approve',
  'unlock:execute',
  'users:manage',
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
    'unlock:request',
  ],

  // Answers for reporting compliance in their entity and chases blocked items.
  DIREKTUR_ENTITAS: ['escalation:raise', 'escalation:followup', 'audit:read'],

  // Process owner: reviews the dashboard, keeps notes and the escalation list,
  // and reports to Management.
  DIREKTUR_SDM_GA: [
    'escalation:raise',
    'escalation:followup',
    'unlock:approve',
    'audit:read',
    'group:read',
  ],

  // Keeps the system available, manages access, and owns the locking and
  // notification machinery. Master account — everything is open.
  TI: ALL_CAPABILITIES,

  // Receives reports, decides escalated issues, watches compliance.
  MANAJEMEN: ['escalation:decide', 'escalation:followup', 'audit:read', 'group:read'],

  AUDITOR: ['audit:read', 'group:read'],
}

/**
 * Tabs each role sees, in order. The first entry is that role's landing tab.
 */
export const ROLE_TABS: Record<string, NavTabId[]> = {
  PIC_PROYEK: ['dashboard', 'daily-input', 'projects'],
  KEPALA_DIVISI: ['dashboard', 'weekly-input', 'divisions'],
  ADMIN_PT: ['dashboard', 'work-desk', 'inbox', 'daily-input', 'weekly-input', 'projects', 'divisions', 'escalations'],
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
  MANAJEMEN: ['dashboard', 'escalations', 'projects', 'divisions', 'entities', 'audit'],
  AUDITOR: ['dashboard', 'projects', 'divisions', 'entities', 'audit'],
}

const FALLBACK_TABS: NavTabId[] = ['dashboard']

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
    'Pemilik proses: tinjau dashboard, susun catatan dan daftar eskalasi, lalu sampaikan laporan kepada Manajemen.',
  TI: 'Jaga ketersediaan sistem, kelola hak akses, pencadangan data, serta mekanisme penguncian dan notifikasi.',
  MANAJEMEN:
    'Terima laporan, putuskan isu yang dieskalasi, dan pantau indikator kepatuhan seluruh grup.',
  AUDITOR: 'Telaah data dan jejak audit seluruh grup secara baca-saja.',
}
