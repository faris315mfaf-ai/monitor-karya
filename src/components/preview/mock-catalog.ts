/** Identitas pratinjau bersama. ID ini dipakai oleh seluruh proyeksi peran. */
export const entities = [
  { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', region: 'Jakarta' },
  { id: 'e2', name: 'PT Sigma Daya', code: 'SGD', region: 'Bandung' },
  { id: 'e3', name: 'PT Bumi Lestari', code: 'BML', region: 'Surabaya' },
]
export const roleNames: Record<string, string> = {
  MANAJEMEN: 'Ris Hartanto', DIREKTUR_ENTITAS: 'Hadi Santoso', KEPALA_DIVISI: 'Andi Wijaya', ADMIN_PT: 'Maya Lestari',
  PIC_PROYEK: 'Rina Kartika', SUPERADMIN: 'Super Admin', DIREKTUR_SDM_GA: 'Dewi Kartika', TI: 'Tim TI', AUDITOR: 'Yusuf Pratama',
}
export const groupRoles = ['MANAJEMEN', 'SUPERADMIN', 'DIREKTUR_SDM_GA', 'TI', 'AUDITOR']
export const actor = (role: string) => ({ id: `pratinjau-${role}`, name: roleNames[role] ?? 'Pratinjau' })
export const divisions = [
  { id: 'dv-tek', name: 'Teknologi', entityId: 'e1', headId: actor('KEPALA_DIVISI').id, head: 'Andi Wijaya' },
  { id: 'dv-keu', name: 'Keuangan', entityId: 'e1', headId: 'u-sinta', head: 'Sinta Dewi' },
  { id: 'dv-med', name: 'Media', entityId: 'e1', headId: 'u-lina', head: 'Lina Marlina' },
  { id: 'dv-ops', name: 'Operasional', entityId: 'e1', headId: 'u-wahyu', head: 'Wahyu Hidayat' },
  { id: 'dv-sdm', name: 'SDM', entityId: 'e1', headId: 'u-rudi', head: 'Rudi Hartono' },
  { id: 'dv-huk', name: 'Hukum', entityId: 'e1', headId: 'u-ratna', head: 'Ratna Sari' },
  { id: 'dv-sg-tek', name: 'Teknik', entityId: 'e2', headId: 'u-hendra', head: 'Hendra Gunawan' },
  { id: 'dv-sg-kom', name: 'Komersial', entityId: 'e2', headId: 'u-sekar', head: 'Sekar Ayu' },
  { id: 'dv-bm-hum', name: 'Humas', entityId: 'e3', headId: 'u-maya3', head: 'Maya Anggraini' },
  { id: 'dv-bm-huk', name: 'Hukum', entityId: 'e3', headId: 'u-lina3', head: 'Lina Pertiwi' },
]
const person = (id: string, name: string, role: string, entityId: string | null, divisionId: string | null = null) => ({
  id, name, role, scopeEntityId: entityId, divisionId, title: null as string | null, username: name.toLowerCase().replace(/\s/g, ''),
  email: `${name.toLowerCase().replace(/\s/g, '.')}@contoh.id`, phone: null as string | null, isActive: true,
})
export const people = [
  ...Object.entries(roleNames).map(([role, name]) => person(actor(role).id, name, role, groupRoles.includes(role) ? null : 'e1', ['PIC_PROYEK', 'KEPALA_DIVISI'].includes(role) ? 'dv-tek' : null)),
  ...divisions.filter((d) => d.headId !== actor('KEPALA_DIVISI').id).map((d) => person(d.headId, d.head, 'KEPALA_DIVISI', d.entityId, d.id)),
  person('u-p1', 'Yoga Saputra', 'PIC_PROYEK', 'e1', 'dv-tek'),
  person('u-p3', 'Dewi Lestari', 'PIC_PROYEK', 'e1', 'dv-tek'),
  person('u-p4', 'Sari Wulandari', 'PIC_PROYEK', 'e1', 'dv-tek'),
  person('u-p5', 'Bayu Prakoso', 'PIC_PROYEK', 'e1', 'dv-ops'),
  person('u-p7', 'Bagas Prakoso', 'PIC_PROYEK', 'e1', 'dv-med'),
  person('u-dimas', 'Dimas Saputra', 'PIC_PROYEK', 'e2', 'dv-sg-tek'),
  person('u-sari2', 'Sekar Wulandari', 'PIC_PROYEK', 'e2', 'dv-sg-kom'),
  person('u-bm-pic', 'Lina Marlina Putri', 'PIC_PROYEK', 'e3', 'dv-bm-huk'),
]
export const visibleDivisions = (role: string) => divisions.filter((d) => role === 'PIC_PROYEK' ? false : role === 'KEPALA_DIVISI' ? d.headId === actor(role).id : groupRoles.includes(role) || d.entityId === 'e1')
export const visiblePeople = (role: string) => people.filter((p) => role === 'PIC_PROYEK' ? false : role === 'KEPALA_DIVISI' ? p.divisionId === 'dv-tek' : groupRoles.includes(role) || p.scopeEntityId === 'e1')
// Cuplikan historis bulanan: identik di pohon, Sheet dan ringkasan PT.
export const entityKpis = Object.fromEntries(entities.map((e, i) => [e.id, {
  complianceScore: [91, 94, 66][i], onTimeDailyPct: [86, 94, 66][i], weeklyCompletenessPct: [83, 100, 50][i],
  evidenceCompletenessPct: [90, 96, 75][i], highPriorityCompletionPct: [95, 86, 68][i], lateToday: [0, 0, 1][i], pendingReports: [2, 0, 2][i],
}]))
