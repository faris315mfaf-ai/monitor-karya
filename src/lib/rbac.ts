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
  | 'project:propose' // mengajukan proyek baru (rantai penyetuju mengikuti peran pengaju)
  | 'project:approve' // menandatangani slot persetujuan proyek
  | 'project:manage' // ubah/hapus/arsipkan proyek (Super Admin, TI, Admin PT di PT-nya)
  | 'notify:remind' // kirim pengingat ke divisi yang belum melapor (8 Sep 2026)
  | 'unlock:request'
  | 'unlock:approve'
  | 'unlock:execute'
  | 'users:manage'
  | 'companies:manage' // Super Admin: tambah/ubah perusahaan, posisi, akun (10 Sep 2026)
  | 'accounts:manage' // Admin PT: meja akun terbatas PT-nya sendiri (5 Okt 2026)
  | 'audit:read'
  | 'group:read' // may read beyond their own entity
  // Model laporan subholding (16 Okt 2026) — docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md
  | 'shreport:write' // Admin subholding: tambah/ubah/tarik laporan subholding-nya
  | 'shreport:review' // Supervisor (+ Super Admin): setujui / minta perbaikan / komentar
  | 'shreport:view-approved' // dashboard laporan DISETUJUI seluruh subholding

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
  'project:manage',
  'notify:remind',
  'unlock:request',
  'unlock:approve',
  'unlock:execute',
  'users:manage',
  'companies:manage',
  'accounts:manage',
  'audit:read',
  'group:read',
]

export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  // Reports project progress every working day, with obstacles and evidence;
  // may propose a project of their own (approved by Admin PT, then Direktur).
  PIC_PROYEK: [
    'daily:input',
    'escalation:raise',
    'project:propose',
    'unlock:request', // [F1-A] hanya laporan harian proyeknya sendiri (dicek di /api/unlock-requests)
  ],

  // Hands the division's weekly achievement to Admin PT by Thursday and signs
  // it off before it locks. May also propose a project (owner decision
  // 9 Okt 2026: anyone can create a project), approved by Admin PT, then Direktur.
  KEPALA_DIVISI: ['weekly:input', 'weekly:approve', 'escalation:raise', 'project:propose'],

  // Enters everything on schedule, checks each item passes validation, and
  // forwards both streams upward.
  ADMIN_PT: [
    'accounts:manage',
    'daily:input',
    'daily:forward',
    'weekly:input',
    'weekly:forward',
    'escalation:raise',
    'project:propose',
    'project:approve', // slot pertama untuk pengajuan PIC
    'project:manage', // ubah/hapus proyek di PT-nya
    'notify:remind',
    'unlock:request',
  ],

  // Answers for reporting compliance in their entity and chases blocked items.
  DIREKTUR_ENTITAS: [
    'escalation:raise',
    'escalation:followup',
    'project:propose',
    'project:approve',
    'notify:remind',
    'audit:read',
  ],

  // Process owner at the holding: reviews the dashboard, keeps notes and the
  // escalation list, and reports to Management.
  DIREKTUR_SDM_GA: [
    'escalation:raise',
    'escalation:followup',
    'project:propose',
    'project:approve',
    'notify:remind',
    'unlock:approve',
    'audit:read',
    'group:read',
  ],

  // Keeps the system available, manages access, and owns the locking and
  // notification machinery. Everything except the company/account desk,
  // which belongs to the Super Admin.
  TI: ALL_CAPABILITIES.filter((c) => c !== 'companies:manage' && c !== 'accounts:manage'),

  // Super Admin (10 Sep 2026): the owner's account. Adds companies, positions
  // and accounts, resets passwords — and may open every other module.
  // Subholding (16 Okt 2026): meninjau dan melihat laporan, tetapi tidak menulis
  // laporan (itu milik Admin subholding). Kapabilitas shreport:* sengaja tidak
  // masuk ALL_CAPABILITIES supaya TI tidak ikut mendapatkannya.
  SUPERADMIN: [...ALL_CAPABILITIES, 'shreport:review', 'shreport:view-approved'],

  // Receives reports, decides escalated issues, watches compliance.
  // Kontrak subholding 16 Okt 2026: tab Manajemen hanya dashboard laporan
  // DISETUJUI (sh-overview); kapabilitas lama dibiarkan agar data lama tetap
  // terbaca bila dibutuhkan.
  MANAJEMEN: [
    'escalation:decide',
    'escalation:followup',
    'project:propose',
    'project:approve',
    'audit:read',
    'group:read',
    'shreport:view-approved',
  ],

  // Telaah data & jejak audit (baca). Boleh mengajukan proyek sejak keputusan
  // pemilik 9 Okt 2026 — rantainya ADMIN_PT lalu DIREKTUR_ENTITAS, sama seperti PIC.
  AUDITOR: ['audit:read', 'group:read', 'project:propose'],

  // Model laporan subholding (16 Okt 2026). Peran ini TIDAK memegang
  // kapabilitas lama apa pun, dan requireApiUser menolaknya di rute lama
  // (lihat SUBHOLDING_ONLY_ROLES di bawah).
  // Satu akun per subholding, dipakai bersama banyak pelapor.
  ADMIN_SUBHOLDING: ['shreport:write'],
  // Direksi di luar subholding: meninjau laporan semua subholding.
  SUPERVISOR: ['shreport:review', 'shreport:view-approved'],
  // Hanya dashboard laporan yang sudah disetujui.
  KETUA_UMUM: ['shreport:view-approved'],
}

/**
 * Tabs each role sees, in order. The first entry is that role's landing tab.
 * Keputusan pemilik 10 Okt 2026: 'pesan' (Kotak masuk) ada di semua peran,
 * tepat setelah Ringkasan — pesan adalah hal kedua yang dilihat.
 */
export const ROLE_TABS: Record<string, NavTabId[]> = {
  // Meja kerja (5 Okt 2026): tempat mengerjakan hari ini — tugas & laporan (PIC),
  // capaian minggu berjalan & serah terima (Kepala Divisi).
  PIC_PROYEK: ['dashboard', 'pesan', 'work-desk', 'daily-input', 'projects'],
  // Tab Proyek untuk kepala divisi menyertakan tombol "Ajukan proyek"
  // (keputusan pemilik 9 Okt 2026: semua peran boleh mengajukan).
  KEPALA_DIVISI: ['dashboard', 'pesan', 'work-desk', 'weekly-input', 'divisions', 'projects'],
  // Sejak 8 Sep 2026 isian mingguan divisi untuk Admin PT ada di Modul Divisi
  // (pilih entitas & divisi), jadi tab Capaian Mingguan tidak lagi dobel.
  // Keputusan pemilik 9 Okt 2026: tab Penerimaan dihapus — penerusan laporan
  // diserap Meja Kerja + tombol di Ringkasan; tab Statistik (kepatuhan per
  // divisi + peta panas 10 hari) dipisah dari Ringkasan agar ringkas.
  ADMIN_PT: ['dashboard', 'pesan', 'work-desk', 'statistik', 'daily-input', 'projects', 'divisions', 'escalations'],
  // [F2-DIREKTUR] + Persetujuan (materi/anggaran/cuti, usulan tenggat, pengajuan proyek).
  DIREKTUR_ENTITAS: ['dashboard', 'pesan', 'projects', 'divisions', 'escalations', 'approvals', 'entities'],
  DIREKTUR_SDM_GA: ['dashboard', 'pesan', 'projects', 'divisions', 'escalations', 'entities', 'audit'],
  TI: [
    'dashboard',
    'pesan',
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
    'pesan',
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
  // Kontrak subholding 16 Okt 2026: Manajemen hanya dashboard laporan disetujui.
  MANAJEMEN: ['sh-overview'],
  AUDITOR: ['dashboard', 'pesan', 'projects', 'divisions', 'entities', 'audit'],
  ADMIN_SUBHOLDING: ['sh-dashboard', 'sh-inbox', 'sh-history'],
  SUPERVISOR: ['sh-review'],
  KETUA_UMUM: ['sh-overview'],
}

const FALLBACK_TABS: NavTabId[] = ['dashboard']

/**
 * [F2-DIREKTUR] Tab utama di tablet & ponsel (01-manajemen.md, 02-direktur.md),
 * urut sesuai spesifikasi; tab peran lainnya pindah ke "Lainnya". Peran tanpa
 * entri memakai urutan bawaan kerangka (src/components/shell.tsx).
 */
export const ROLE_COMPACT_TABS: Record<string, NavTabId[]> = {
  DIREKTUR_ENTITAS: ['dashboard', 'projects', 'escalations', 'divisions'],
}

export function compactTabsFor(role: string): NavTabId[] | null {
  const list = ROLE_COMPACT_TABS[role]
  return list ? list.filter((t) => canSeeTab(role, t)) : null
}

/**
 * Rantai persetujuan proyek menurut peran pengaju (11 Sep 2026): tiap pengaju
 * butuh tanda tangan jenjang di atasnya, berurutan. Pengaju di puncak
 * (Manajemen, Direksi Holding, TI, Super Admin) langsung aktif tanpa rantai.
 * Keputusan pemilik 9 Okt 2026: semua peran boleh mengajukan — kepala divisi
 * dan auditor mengikuti pola PIC (ADMIN_PT, lalu DIREKTUR_ENTITAS).
 */
export const PROJECT_APPROVAL_CHAIN: Record<string, string[]> = {
  PIC_PROYEK: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
  KEPALA_DIVISI: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
  ADMIN_PT: ['DIREKTUR_ENTITAS'],
  DIREKTUR_ENTITAS: ['MANAJEMEN'],
  DIREKTUR_SDM_GA: [],
  MANAJEMEN: [],
  AUDITOR: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
  TI: [],
  SUPERADMIN: [],
}

/** Siapa yang boleh menandatangani sebuah slot. Akun induk (TI, Super Admin)
 *  boleh menandatangani slot mana pun atas nama slot itu. */
export const PROJECT_SLOT_SIGNERS: Record<string, string[]> = {
  ADMIN_PT: ['ADMIN_PT'],
  DIREKTUR_ENTITAS: ['DIREKTUR_ENTITAS'],
  MANAJEMEN: ['MANAJEMEN', 'DIREKTUR_SDM_GA'],
}

/** Slot yang terpaku pada PT proyek: penandatangannya harus menjangkau PT itu. */
export const PROJECT_ENTITY_SLOTS = ['ADMIN_PT', 'DIREKTUR_ENTITAS'] as const

/**
 * Slot entitas yang ditandatangani di seluruh cakupan penandatangan, bukan
 * hanya PT yang sama persis (E2E-2 BUG-01, 13 Okt 2026). Direktur entitas
 * membawahi PT-nya dan semua yang di bawahnya (docs/fitur/entitas.md), sama
 * dengan gerbang baca `scopeEntityIds` dan `canDecideApprovalIn`; akun
 * direktur bisa berlingkup SUB_HOLDING. Slot Admin PT tetap PT-nya sendiri.
 */
export const PROJECT_SUBTREE_SLOTS = ['DIREKTUR_ENTITAS'] as const

export function approvalChainFor(role: string): string[] {
  return PROJECT_APPROVAL_CHAIN[role] ?? []
}

/** Slot berikutnya yang belum DISETUJUI, atau null bila rantai tuntas. */
export function pendingSlot(chain: string[], approvedRoles: Iterable<string>): string | null {
  const done = new Set(approvedRoles)
  return chain.find((r) => !done.has(r)) ?? null
}

/**
 * Apakah akun ini boleh menandatangani `slot` untuk proyek milik `entityId`.
 * `reach` = hasil `scopeEntityIds(user)` (entitas yang terjangkau akun). Tanpa
 * `reach` (atau null), slot entitas gagal-tertutup ke PT yang sama persis.
 */
export function canSignSlot(
  user: { role: string; scopeEntityId: string | null },
  slot: string,
  entityId: string,
  reach?: readonly string[] | null
): boolean {
  if (!can(user.role, 'project:approve')) return false
  if (isMasterRole(user.role)) return true
  if (!(PROJECT_SLOT_SIGNERS[slot] ?? []).includes(user.role)) return false
  if ((PROJECT_ENTITY_SLOTS as readonly string[]).includes(slot)) {
    if (user.scopeEntityId === entityId) return true
    return (PROJECT_SUBTREE_SLOTS as readonly string[]).includes(slot) && !!reach && reach.includes(entityId)
  }
  return true
}

/**
 * Akun induk yang tidak terpaku pada satu entitas dan boleh menulis di mana
 * pun: Tim TI dan Super Admin. Endpoint tulis memakai ini, bukan
 * membandingkan peran satu per satu.
 */
export const MASTER_ROLES = ['TI', 'SUPERADMIN'] as const

export function isMasterRole(role: string): boolean {
  return (MASTER_ROLES as readonly string[]).includes(role)
}

/** Peran yang cakupannya satu entitas (dibuat Super Admin lewat "posisi").
 *  ADMIN_SUBHOLDING terpaku pada satu entitas SUB_HOLDING (16 Okt 2026). */
export const ENTITY_ROLES = ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK', 'DIREKTUR_ENTITAS', 'ADMIN_SUBHOLDING'] as const

/** Peran tingkat holding, tanpa entitas tertentu. */
export const HOLDING_ROLES = ['MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI', 'AUDITOR', 'SUPERVISOR', 'KETUA_UMUM'] as const

/**
 * Peran model laporan subholding (16 Okt 2026) yang HANYA memakai modul
 * /api/sh/** (+ bukti, profil, notifikasi sendiri). requireApiUser menolak
 * peran ini (403) di semua rute lain kecuali rute itu ikut serta dengan
 * `allowSubholdingRoles`, dan scopeEntityIds/refuseUnscoped menutup cakupan
 * lama — jadi Admin subholding tidak pernah membaca subpohon entitasnya lewat
 * rute lama. MANAJEMEN tidak termasuk: perannya peran lama (global).
 */
export const SUBHOLDING_ONLY_ROLES = ['ADMIN_SUBHOLDING', 'SUPERVISOR', 'KETUA_UMUM'] as const

export function isSubholdingOnlyRole(role: string): boolean {
  return (SUBHOLDING_ONLY_ROLES as readonly string[]).includes(role)
}

export const ALL_ROLES = [...ENTITY_ROLES, ...HOLDING_ROLES] as const

/**
 * Meja akun (5 Okt 2026). Super Admin memegangnya penuh untuk seluruh grup.
 * Admin PT memegang versi terbatas: hanya akun di PT-nya sendiri, dan hanya
 * posisi di bawah/sejajar dirinya — Direktur Entitas tetap milik Super Admin
 * supaya tidak ada yang bisa membuat penyetujunya sendiri.
 */
export const ADMIN_PT_MANAGED_ROLES = ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK'] as const

/** Boleh membuka meja akun sama sekali — penuh atau terbatas satu PT. */
export function canManageAccounts(role: string): boolean {
  return can(role, 'companies:manage') || can(role, 'accounts:manage')
}

/** Meja akun penuh: seluruh grup, termasuk menambah/mengubah perusahaan. */
export function canManageAllAccounts(role: string): boolean {
  return can(role, 'companies:manage')
}

/** Posisi yang boleh dibuat atau diubah oleh pemegang meja akun. */
export function manageableRoles(role: string): readonly string[] {
  if (canManageAllAccounts(role)) return ALL_ROLES
  return can(role, 'accounts:manage') ? ADMIN_PT_MANAGED_ROLES : []
}

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
  ADMIN_SUBHOLDING:
    'Tambahkan laporan kegiatan harian PT di subholding Anda beserta buktinya, lalu tindak lanjuti permintaan perbaikan.',
  SUPERVISOR: 'Tinjau laporan seluruh subholding: setujui, minta perbaikan, atau beri komentar.',
  KETUA_UMUM: 'Pantau laporan yang sudah disetujui di seluruh subholding.',
}
