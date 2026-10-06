/**
 * Data contoh untuk /pratinjau (hanya mode pengembangan): memperlihatkan dashboard
 * tiap peran tanpa basis data. Bentuknya sama dengan respons API sungguhan.
 */

const DAY = 86400000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()
const wib0 = (offsetDays: number) => {
  const d = new Date(now + offsetDays * DAY)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 7 * 3600000).toISOString()
}
/** Pukul 17.00 WIB pada hari ISO `isoDay` (1 = Senin) minggu berjalan — tenggat
 *  mingguan: serah Kamis (4), kunci Jumat (5), seperti src/lib/lock.ts. */
const weekAt17 = (isoDay: number) => {
  const t0 = Date.parse(wib0(0))
  const dow = (new Date(t0 + 7 * 3600000).getUTCDay() + 6) % 7
  return new Date(t0 + (isoDay - 1 - dow) * DAY + 17 * 3600000).toISOString()
}
const weeklyHandoverHoursLeft = Math.max(0, Math.round((Date.parse(weekAt17(4)) - now) / 3600000))

const ENT = [
  { id: 'e1', name: 'PT Ratu Karya', code: 'RTK' },
  { id: 'e2', name: 'PT Sigma Daya', code: 'SGD' },
  { id: 'e3', name: 'PT Bumi Lestari', code: 'BML' },
]

const P = (
  id: string, name: string, ent: number, pic: string, status: string, progress: number, start: number, end: number,
  reason: string | null, phase = 'PELAKSANAAN', today = true
) => ({
  id, code: `PRJ-${id.toUpperCase()}`, name, phase, entityId: ENT[ent].id, entityName: ENT[ent].name, entityCode: ENT[ent].code,
  pic, startDate: iso(start), targetEndDate: iso(end), status, reason, progress, lastReportAt: iso(-0.2),
  lastNote: 'Integrasi modul absensi dengan sistem penggajian selesai, uji coba gelombang 2 menunggu perangkat.', reportedToday: today,
})

export const ringkasan = {
  kind: 'RINGKASAN',
  week: 41,
  scope: { entities: 3, divisions: 6, global: true },
  projects: [
    P('p1', 'Kampanye Media Oktober', 2, 'Bagas Prakoso', 'late', 48, -30, -5, 'Lewat tenggat 5 hari', 'PELAKSANAAN', false),
    P('p2', 'Peluncuran Aplikasi Absensi', 0, 'Rina Kartika', 'risk', 64, -40, 19, 'Uji coba gelombang 2 mundur 4 hari.'),
    P('p3', 'Renovasi Ruang IT', 1, 'Dimas Saputra', 'risk', 35, -20, 30, 'Vendor belum konfirmasi jadwal.', 'PERENCANAAN'),
    P('p4', 'Migrasi Server Data', 0, 'Yoga Saputra', 'on', 72, -50, 12, null),
    P('p5', 'Portal Pelanggan', 1, 'Sari Wulandari', 'on', 55, -25, 35, null),
    P('p6', 'Audit Kontrak Vendor', 2, 'Lina Marlina', 'on', 81, -45, 6, null, 'PENYELESAIAN'),
    P('p7', 'Pelatihan K3 Gudang', 1, 'Wahyu Hidayat', 'on', 40, -10, 40, null, 'PELAKSANAAN', false),
    P('p8', 'Google Workspace', 0, 'Andi Wijaya', 'done', 100, -60, -2, null, 'PENYELESAIAN'),
    P('p9', 'Digitalisasi Arsip', 2, 'Maya Lestari', 'on', 22, -5, 60, null, 'PERENCANAAN'),
  ],
  counts: { on: 5, risk: 2, late: 1, done: 1, neutral: 0 },
  daily: { expected: 9, submitted: 7, onTime30Pct: 88, onTime30: 158, total30: 180 },
  weekly: { expected: 6, submitted: 5, approved: 4 },
  trend: [
    { label: 'M34', submitted: 38, onTimePct: 84 }, { label: 'M35', submitted: 41, onTimePct: 86 },
    { label: 'M36', submitted: 40, onTimePct: 83 }, { label: 'M37', submitted: 43, onTimePct: 88 },
    { label: 'M38', submitted: 39, onTimePct: 85 }, { label: 'M39', submitted: 44, onTimePct: 90 },
    { label: 'M40', submitted: 42, onTimePct: 87 }, { label: 'M41', submitted: 46, onTimePct: 91 },
  ],
  byEntity: [
    { id: 'e2', name: 'PT Sigma Daya', code: 'SGD', onTimePct: 94, onTime: 62, total: 66, projects: 3, reportedToday: 2 },
    { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', onTimePct: 86, onTime: 55, total: 64, projects: 3, reportedToday: 3 },
    { id: 'e3', name: 'PT Bumi Lestari', code: 'BML', onTimePct: 66, onTime: 33, total: 50, projects: 3, reportedToday: 2 },
  ],
  decisions: [
    { id: 'd1', name: 'Sistem Antrean Klinik', entityName: 'PT Ratu Karya', proposer: 'Rina Kartika', proposedAt: iso(-1), slot: 'MANAJEMEN' },
    { id: 'd2', name: 'Pengadaan Armada Listrik', entityName: 'PT Sigma Daya', proposer: 'Wahyu Hidayat', proposedAt: iso(-0.1), slot: 'MANAJEMEN' },
  ],
  escalations: [
    { id: 'x1', summary: 'Materi video Kampanye Oktober belum disetujui', needed: 'KEPUTUSAN', status: 'DIAJUKAN', raisedAt: iso(-9), raisedBy: 'Lina Marlina', entityName: 'PT Bumi Lestari', entityCode: 'BML', ageDays: 9, overdue: true },
    { id: 'x2', summary: 'Revisi anggaran Renovasi Ruang IT Rp 48,5 jt', needed: 'ANGGARAN', status: 'DITINJAU', raisedAt: iso(-2), raisedBy: 'Dimas Saputra', entityName: 'PT Sigma Daya', entityCode: 'SGD', ageDays: 2, overdue: false },
  ],
  activity: [
    { id: 'a1', who: 'Rina Kartika', role: 'PIC_PROYEK', text: 'mengirim laporan harian', at: iso(-0.02) },
    { id: 'a2', who: 'Andi Wijaya', role: 'KEPALA_DIVISI', text: 'menyetujui laporan mingguan', at: iso(-0.1) },
    { id: 'a3', who: 'Maya Lestari', role: 'ADMIN_PT', text: 'meneruskan laporan harian ke holding', at: iso(-0.3) },
    { id: 'a4', who: 'Hadi Santoso', role: 'DIREKTUR_ENTITAS', text: 'meninjau eskalasi', at: iso(-0.8) },
    { id: 'a5', who: 'Wahyu Hidayat', role: 'PIC_PROYEK', text: 'mengajukan proyek baru', at: iso(-1.2) },
  ],
}

const hist = [12, 20, 28, 35, 41, 47, 52, 58, 61, 64]
export const pic = {
  kind: 'PIC',
  countdown: { hours: 2, minutes: 40, passed: false },
  lockAt: iso(0.1),
  summary: { projects: 1, submitted: 0, outstanding: 1, blocked: 1, onTimePct: 86 },
  projects: [
    {
      id: 'p2', code: 'PRJ-P2', name: 'Aplikasi Absensi', phase: 'PELAKSANAAN', startDate: iso(-40), targetEndDate: iso(19),
      entityName: 'PT Ratu Karya', status: null, progressPct: null, evidenceCount: 0, submitted: false, forwarded: false,
      needsEscalation: true, derivedStatus: 'risk', reason: 'Uji coba gelombang 2 tertahan karena perangkat uji terlambat 4 hari', latestProgress: 64,
      latest: {
        reportDate: wib0(-1),
        achievementToday: 'Perbaikan sinkronisasi data cuti dan izin selesai; 3 dari 4 skenario uji gelombang 1 lulus.',
        obstacle: 'Perangkat uji gelombang 2 belum tiba dari vendor.',
        followUp: 'Konfirmasi jadwal pengiriman perangkat, siapkan panduan pengguna versi iPhone.',
      },
      history: hist.map((v, i) => ({
        reportDate: wib0(-(hist.length - i) * 2), status: i === hist.length - 1 ? 'TERKENDALA' : 'ON_PROGRESS', progressPct: v,
        submitted: true, forwarded: i < hist.length - 1, isLate: i === 4,
      })),
    },
  ],
}

export const kadiv = {
  kind: 'KADIV',
  week: { isoYear: 2026, isoWeek: 41, handoverBy: weekAt17(4), lockAt: weekAt17(5) },
  handoverHoursLeft: weeklyHandoverHoursLeft,
  handoverPassed: weeklyHandoverHoursLeft === 0,
  summary: { divisions: 1, items: 38, done: 31, blocked: 2, missingEvidence: 3, needsEscalation: 1 },
  byStatus: { SELESAI: 31, ON_PROGRESS: 4, TERKENDALA: 2, BELUM_MULAI: 1 },
  history: [18, 22, 25, 21, 27, 29, 28, 31].map((d, i) => ({ label: `M${34 + i}`, done: d, total: d + 6 })),
  items: [
    { id: 'i1', workItem: 'Uji beban server cadangan', picName: 'Yoga Saputra', targetDate: iso(1), progressPct: 70, status: 'ON_PROGRESS', priority: 'TINGGI', needsEscalation: false, evidenceCount: 1 },
    { id: 'i2', workItem: 'Uji coba gelombang 2 Aplikasi Absensi', picName: 'Rina Kartika', targetDate: iso(-1), progressPct: 30, status: 'TERKENDALA', priority: 'TINGGI', needsEscalation: true, evidenceCount: 0 },
    { id: 'i3', workItem: 'Migrasi akun Google Workspace', picName: 'Andi Wijaya', targetDate: iso(-2), progressPct: 100, status: 'SELESAI', priority: 'SEDANG', needsEscalation: false, evidenceCount: 2 },
    { id: 'i4', workItem: 'Desain halaman portal pelanggan', picName: 'Sari Wulandari', targetDate: iso(2), progressPct: 55, status: 'ON_PROGRESS', priority: 'SEDANG', needsEscalation: false, evidenceCount: 1 },
    { id: 'i5', workItem: 'Dokumentasi SOP pencadangan', picName: 'Fajar Nugroho', targetDate: iso(4), progressPct: 0, status: 'BELUM_MULAI', priority: 'RENDAH', needsEscalation: false, evidenceCount: 0 },
  ],
  divisions: [{ id: 'dv1', name: 'Teknologi', statusHeader: 'DRAFT', itemCount: 38, submitted: false, approved: false, forwarded: false }],
}

export const admin = {
  kind: 'ADMIN',
  entity: { name: 'PT Ratu Karya', code: 'RTK', region: 'Jakarta' },
  countdown: { hours: 1, minutes: 12, passed: false },
  summary: {
    projects: 12, divisions: 6, dailyReceived: 11, dailyAwaitingForward: 4, dailyMissing: 1, weeklyApproved: 4,
    weeklyAwaitingForward: 1, weeklyDraft: 1, lateThisMonth: 2, openEscalations: 1, complianceScore: 91, onTimeDailyPct: 93,
  },
  missing: [{ id: 'p2', name: 'Aplikasi Absensi', pic: 'Rina Kartika' }],
  divisionsWeekly: [
    { id: 'a', name: 'Teknologi', head: 'Andi Wijaya', statusHeader: 'DISETUJUI', submittedAt: iso(-1), forwardedAt: null },
    { id: 'b', name: 'Keuangan', head: 'Sinta Dewi', statusHeader: 'DISETUJUI', submittedAt: iso(-1), forwardedAt: iso(-0.5) },
    { id: 'c', name: 'Media', head: 'Lina Marlina', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: iso(-0.2), forwardedAt: null },
    { id: 'd', name: 'SDM', head: 'Rudi Hartono', statusHeader: 'DISETUJUI', submittedAt: iso(-2), forwardedAt: iso(-1) },
    { id: 'e', name: 'Operasional', head: 'Wahyu Hidayat', statusHeader: 'DRAFT', submittedAt: null, forwardedAt: null },
    { id: 'f', name: 'Hukum', head: null, statusHeader: null, submittedAt: null, forwardedAt: null },
  ],
  days: [10, 12, 11, 12, 9, 12, 11, 12, 12, 11].map((v, i) => ({ date: wib0(-(13 - i - Math.floor(i / 5) * 2)), submitted: v, onTime: v - (i % 3 === 0 ? 1 : 0) })),
}

export const notifications = {
  unread: 2,
  items: [
    { id: 'n1', template: 'X', title: 'Laporan mingguan Divisi Operasional belum diserahkan', body: 'Tenggat Kamis pukul 17.00.', tab: 'divisions', createdAt: iso(-0.1), readAt: null },
    { id: 'n2', template: 'X', title: 'Pengajuan proyek baru menunggu persetujuan', body: 'Sistem Antrean Klinik · PT Ratu Karya', tab: 'projects', createdAt: iso(-1), readAt: null },
  ],
}

export const entityActivity = {
  cadence: 'HARIAN', priority: 'ALL', date: iso(0).slice(0, 10),
  period: { key: '2026-10-05', start: iso(0), end: iso(0), isoWeek: 41, isoYear: 2026 },
  prev: iso(-1).slice(0, 10), next: iso(1).slice(0, 10), today: iso(0).slice(0, 10),
  entities: [],
}

// ------------------------------------------------------------------
// Perusahaan & akun
// ------------------------------------------------------------------

type MU = {
  id: string; name: string; username: string; email: string; role: string; title: string | null; phone: string | null
  isActive: boolean; lastLoginAt: string | null; avatarColor: string | null; hasPassword: boolean; scopeEntityId: string | null
  divisionId: string | null; divisionName: string | null; projectId: string | null; projectName: string | null
}
let uid = 0
const U = (name: string, role: string, scope: string | null, o: Partial<MU> = {}): MU => {
  const username = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 14)
  uid++
  return {
    id: `u${uid}`, name, username, email: `${username}@bike.co.id`, role, title: null, phone: null, isActive: true,
    lastLoginAt: iso(-(uid % 9) - 0.2), avatarColor: null, hasPassword: true, scopeEntityId: scope,
    divisionId: null, divisionName: null, projectId: null, projectName: null, ...o,
  }
}

const CO = (
  id: string, name: string, code: string, type: 'HOLDING' | 'PT', o: Record<string, unknown>,
  users: MU[], divisions: { id: string; name: string; headUserId: string | null; headName: string | null }[],
  projects: { id: string; code: string; name: string; lifecycle: string; picUserId: string | null; picName: string | null }[],
  reports: [number, number]
) => ({
  id, code, name, type, parentId: type === 'HOLDING' ? null : 'c-bike', parentName: type === 'HOLDING' ? null : 'PT. BIKE Tbk',
  logoData: null, address: null, phone: null, email: null, website: null, isActive: true, ...o,
  users, divisions, projects,
  counts: { users: users.length, divisions: divisions.length, projects: projects.length, dailyReports: reports[0], weeklyReports: reports[1] },
})

const ratuAdmin = U('Maya Lestari', 'ADMIN_PT', 'c-ratu', { title: 'Admin PT' })
const ratuDir = U('Hadi Santoso', 'DIREKTUR_ENTITAS', 'c-ratu', { title: 'Direktur Utama' })
const ratuKadiv = U('Andi Wijaya', 'KEPALA_DIVISI', 'c-ratu', { divisionId: 'dv-tek', divisionName: 'Teknologi' })
const ratuKadiv2 = U('Sinta Dewi', 'KEPALA_DIVISI', 'c-ratu', { divisionId: 'dv-keu', divisionName: 'Keuangan', lastLoginAt: null })
const ratuPic = U('Rina Kartika', 'PIC_PROYEK', 'c-ratu', { projectId: 'pr-abs', projectName: 'Aplikasi Absensi' })
const ratuPic2 = U('Yoga Saputra', 'PIC_PROYEK', 'c-ratu', { projectId: 'pr-srv', projectName: 'Migrasi Server Data', isActive: false })

const ciptaAdmin = U('Ahmad Prasetyo', 'ADMIN_PT', 'c-cipta')
const ciptaKadiv = U('Wahyu Hidayat', 'KEPALA_DIVISI', 'c-cipta', { divisionId: 'dv-ops', divisionName: 'Operasional' })

const fahDir = U('Dimas Saputra', 'DIREKTUR_ENTITAS', 'c-fah', { hasPassword: false, lastLoginAt: null })

export const companies = {
  companies: [
    CO('c-bike', 'PT. BIKE Tbk', 'HOLDING-BIKE', 'HOLDING',
      { address: 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan', phone: '+62 21 5150 000', email: 'corporate@bike.co.id', website: 'https://bike.co.id' },
      [U('Arif Pratama', 'ADMIN_PT', 'c-bike'), U('Dewi Puspita', 'DIREKTUR_ENTITAS', 'c-bike', { title: 'Direktur Keuangan' })], [], [], [0, 0]),
    CO('c-cipta', 'PT Cipta', 'PT-CIPTA', 'PT',
      { address: 'Jl. Raya Bekasi Km 18, Bekasi', phone: '+62 21 8890 202', email: 'info@cipta.co.id' },
      [ciptaAdmin, ciptaKadiv],
      [{ id: 'dv-ops', name: 'Operasional', headUserId: ciptaKadiv.id, headName: ciptaKadiv.name }, { id: 'dv-gud', name: 'Gudang', headUserId: null, headName: null }, { id: 'dv-hr', name: 'SDM', headUserId: null, headName: null }],
      [{ id: 'pr-k3', code: 'PT-CIPTA-PRJ-01', name: 'Pelatihan K3 Gudang', lifecycle: 'AKTIF', picUserId: null, picName: null }], [42, 6]),
    CO('c-fah', 'PT Fahreza', 'PT-FAHREZA', 'PT',
      { address: 'Jl. Ahmad Yani No. 88, Surabaya', phone: '+62 31 5310 303', email: 'info@fahreza.co.id' },
      [fahDir],
      [{ id: 'dv-f1', name: 'Komersial', headUserId: null, headName: null }, { id: 'dv-f2', name: 'Teknik', headUserId: null, headName: null }, { id: 'dv-f3', name: 'Keuangan', headUserId: null, headName: null }],
      [], [0, 0]),
    CO('c-kbi', 'PT KBI', 'PT-KBI', 'PT', { address: 'Jl. Gatot Subroto 12, Bandung' }, [], [], [], [0, 0]),
    CO('c-pram', 'PT Prambanan', 'PT-PRAMBANAN', 'PT', { isActive: false, address: 'Jl. Solo Km 7, Yogyakarta', email: 'halo@prambanan.co.id', phone: '+62 274 889 100' }, [U('Bagas Prakoso', 'ADMIN_PT', 'c-pram', { isActive: false })], [], [], [12, 2]),
    CO('c-ratu', 'PT Ratu Karya', 'PT-RATUKARYA', 'PT',
      { address: 'Jl. MH Thamrin No. 9, Jakarta Pusat', phone: '+62 21 3190 777', email: 'info@ratukarya.co.id', website: 'https://ratukarya.co.id' },
      [ratuAdmin, ratuDir, ratuKadiv, ratuKadiv2, ratuPic, ratuPic2],
      [{ id: 'dv-tek', name: 'Teknologi', headUserId: ratuKadiv.id, headName: ratuKadiv.name }, { id: 'dv-keu', name: 'Keuangan', headUserId: ratuKadiv2.id, headName: ratuKadiv2.name }],
      [{ id: 'pr-abs', code: 'PT-RATUKARYA-PRJ-01', name: 'Aplikasi Absensi', lifecycle: 'AKTIF', picUserId: ratuPic.id, picName: ratuPic.name }, { id: 'pr-srv', code: 'PT-RATUKARYA-PRJ-02', name: 'Migrasi Server Data', lifecycle: 'AKTIF', picUserId: ratuPic2.id, picName: ratuPic2.name }, { id: 'pr-kln', code: 'PT-RATUKARYA-PRJ-03', name: 'Sistem Antrean Klinik', lifecycle: 'DIUSULKAN', picUserId: null, picName: null }],
      [212, 18]),
  ],
  holdingUsers: [
    U('Manajemen Holding', 'MANAJEMEN', null, { username: 'manajemen', email: 'manajemen@bike.co.id', title: 'Manajemen Holding' }),
    U('Owner PT. BIKE Tbk', 'MANAJEMEN', null, { username: 'owner', email: 'owner@bike.co.id', title: 'Pemilik', lastLoginAt: null }),
    U('Super Admin', 'SUPERADMIN', null, { id: 'me', username: 'superadmin', email: 'superadmin@bike.co.id', lastLoginAt: iso(-0.01) }),
    U('Tim TI', 'TI', null, { username: 'ti', email: 'ti@bike.co.id' }),
  ],
  totals: { companies: 6, users: 16, divisions: 8, projects: 4 },
  me: 'me',
  scope: 'ALL',
  canManageCompanies: true,
  manageableRoles: ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK', 'DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI', 'AUDITOR'],
}

// ------------------------------------------------------------------
// Meja kerja (/api/work-desk, /api/tasks, /api/weekly-input)
// ------------------------------------------------------------------

const today0 = wib0(0)
const at = (h: number, m = 0) => new Date(Date.parse(today0) + (h * 60 + m) * 60000).toISOString()
/** 10 hari kerja terakhir (Senin–Jumat), termasuk hari ini, lama → baru. */
const workDays = (() => {
  const out: string[] = []
  for (let k = 0; out.length < 10 && k < 30; k++) {
    const d = new Date(Date.parse(today0) - k * DAY)
    const dow = new Date(d.getTime() + 7 * 3600000).getUTCDay()
    if (dow !== 0 && dow !== 6) out.unshift(d.toISOString())
  }
  return out
})()
const lockAt = at(17)
const left = Math.max(0, Date.parse(lockAt) - now)
const countdown = { hours: Math.floor(left / 3600000), minutes: Math.floor((left % 3600000) / 60000), totalMs: left, passed: left <= 0 }

const picHistory = (late: number[], missing: number[], todaySubmitted: boolean, base: number) =>
  workDays.map((d, i) => {
    const last = i === workDays.length - 1
    const submitted = last ? todaySubmitted : !missing.includes(i)
    return { date: d, submitted, isLate: !last && late.includes(i), status: submitted ? 'ON_PROGRESS' : null, progressPct: submitted ? base + i * 3 : null }
  })

export const deskPic = {
  kind: 'PIC',
  today: today0,
  lockAt,
  locked: countdown.passed,
  countdown,
  cutoffLabel: '17.00',
  days: workDays,
  projects: [
    {
      id: 'p2', code: 'PRJ-P2', name: 'Aplikasi Absensi', phase: 'PELAKSANAAN', startDate: iso(-40), targetEndDate: iso(19), entityName: 'PT Ratu Karya',
      tasks: { total: 4, done: 2, blocked: 1 },
      report: { status: 'TERKENDALA', progressPct: 64, submittedAt: null, forwardedAt: null, isLate: false, evidenceCount: 1 },
      history: picHistory([4], [], false, 37),
      remindedAt: at(15, 10) as string | null,
      remindedBy: 'Maya Lestari',
    },
    {
      id: 'p7', code: 'PRJ-P7', name: 'Portal Pelanggan', phase: 'PERENCANAAN', startDate: iso(-12), targetEndDate: iso(60), entityName: 'PT Ratu Karya',
      tasks: { total: 2, done: 2, blocked: 0 },
      report: { status: 'ON_PROGRESS', progressPct: 22, submittedAt: at(11, 20), forwardedAt: null, isLate: false, evidenceCount: 2 },
      history: picHistory([], [2], true, 4),
      remindedAt: null as string | null,
      remindedBy: null as string | null,
    },
  ],
}

const T = (id: string, title: string, s: [number, number] | null, e: [number, number] | null, status: string, o: Record<string, unknown> = {}) => ({
  id, projectId: 'p2', title, description: null, tags: [], picName: 'Rina Kartika', picUserId: null,
  startAt: s ? at(...s) : null, endAt: e ? at(...e) : null, durationMin: null, status, progressPct: status === 'SELESAI' ? 100 : 40,
  urgency: 'SEDANG', obstacle: null, decisionNeeded: null, escalationId: null, subtasks: [], evidence: [], ...o,
})
export const deskTasks: Record<string, ReturnType<typeof T>[]> = {
  p2: [
    T('t1', 'Rapat harian tim pengembang', [8, 30], [9, 0], 'SELESAI'),
    T('t2', 'Perbaiki sinkronisasi data cuti', [9, 30], [12, 0], 'SELESAI', { subtasks: [{ title: 'Uji izin setengah hari', isDone: true }, { title: 'Uji cuti bersama', isDone: true }] }),
    T('t3', 'Uji coba gelombang 2', [13, 0], [15, 30], 'TERKENDALA', { obstacle: 'Perangkat uji belum tiba dari vendor' }),
    T('t4', 'Susun panduan pengguna versi iPhone', [15, 30], [16, 45], 'BERJALAN'),
  ],
  p7: [
    T('t5', 'Wawancara kebutuhan tim layanan', [10, 0], [11, 0], 'SELESAI', { projectId: 'p7' }),
    T('t6', 'Sketsa alur pendaftaran', null, null, 'SELESAI', { projectId: 'p7' }),
  ],
}

const weekStart = (() => {
  const d = new Date(Date.parse(today0) + 7 * 3600000)
  const dow = (d.getUTCDay() + 6) % 7
  return new Date(Date.parse(today0) - dow * DAY).toISOString()
})()
const weekDays = Array.from({ length: 5 }, (_, i) => new Date(Date.parse(weekStart) + i * DAY).toISOString())
// Tenggat mingguan: serah Kamis 17.00 WIB, kunci Jumat 17.00 WIB (src/lib/lock.ts).
const handoverBy = new Date(Date.parse(weekStart) + 3 * DAY + 17 * 3600000).toISOString()
const weeklyLockAt = new Date(Date.parse(weekStart) + 4 * DAY + 17 * 3600000).toISOString()
const ref = (id: string, name: string) => ({ id, code: id.toUpperCase(), name })
const WI = (id: string, workItem: string, picName: string, status: string, progressPct: number, evidenceCount: number, day: number | null, o: Record<string, unknown> = {}) => ({
  id, workItem, targetOutput: 'Hasil terdokumentasi', picName, picTitle: 'Staf', status, progressPct, achievementThisWeek: 'Dikerjakan sesuai rencana.',
  obstacleFollowUp: null, followUp: null, workDate: day === null ? null : weekDays[Math.min(day, 4)], position: 0, evidenceCount, tags: [], subtasks: [],
  evidence: [], aspectCategory: ref('a1', 'Operasional'), priority: ref('pr1', 'Sedang'), ...o,
})
const todayIdx = Math.max(0, Math.min(4, Math.round((Date.parse(today0) - Date.parse(weekStart)) / DAY)))

export const weeklyInput = {
  week: { key: '2026-W41', isoYear: 2026, isoWeek: 41, start: weekStart, end: weekDays[4], handoverBy, lockAt: weeklyLockAt, current: true },
  locked: false,
  days: weekDays,
  weeks: [{ key: '2026-W41', start: weekStart, end: weekDays[4], current: true }],
  entities: [ref('e1', 'PT Ratu Karya')],
  entityId: 'e1',
  entityPinned: true,
  aspects: [ref('a1', 'Operasional'), ref('a2', 'Keuangan')],
  priorities: [ref('pr1', 'Sedang'), ref('pr2', 'Tinggi')],
  canApprove: true,
  canRemind: false,
  divisions: [
    {
      id: 'dv1', name: 'Teknologi', type: 'TEKNOLOGI', headName: 'Andi Wijaya',
      report: {
        id: 'w1', statusHeader: 'DRAFT', submittedAt: null as string | null, approvedAt: null as string | null, forwardedAt: null, isLocked: false,
        items: [
          WI('i1', 'Uji beban server cadangan', 'Yoga Saputra', 'ON_PROGRESS', 70, 1, todayIdx),
          WI('i2', 'Uji coba gelombang 2 Aplikasi Absensi', 'Rina Kartika', 'TERKENDALA', 30, 0, todayIdx, { obstacleFollowUp: null }),
          WI('i3', 'Migrasi akun Google Workspace', 'Andi Wijaya', 'SELESAI', 100, 2, 0),
          WI('i4', 'Desain halaman portal pelanggan', 'Sari Wulandari', 'ON_PROGRESS', 55, 0, todayIdx),
          WI('i5', 'Dokumentasi SOP pencadangan', 'Fajar Nugroho', 'BELUM_MULAI', 0, 0, null),
          WI('i6', 'Pembaruan lisensi antivirus', 'Yoga Saputra', 'SELESAI', 100, 1, 1),
        ],
      },
    },
  ],
}

export const deskKadiv = {
  kind: 'KADIV',
  today: today0,
  divisions: [
    {
      id: 'dv1', name: 'Teknologi', entityName: 'PT Ratu Karya',
      history: [[22, 28, true], [25, 30, true], [21, 29, false], [27, 33, true], [29, 34, true], [2, 5, false]].map(([d, t, ok], i) => ({
        label: `M${36 + i}`, done: d as number, total: t as number, status: i === 5 ? 'DRAFT' : 'DISETUJUI', onTime: ok as boolean,
      })),
    },
  ],
}

const AP = (id: string, name: string, pic: string | null, total: number, done: number, rep: Record<string, unknown> | null, remindedAt: string | null = null) => ({
  id, code: `PRJ-${id.toUpperCase()}`, name, phase: 'PELAKSANAAN', pic: pic ? { id: `u-${id}`, name: pic } : null, picName: pic,
  tasks: { total, done },
  report: rep ? { id: `r-${id}`, status: 'ON_PROGRESS', progressPct: 50, evidenceCount: 1, submittedAt: null, submittedBy: pic, forwardedAt: null, isLate: false, needsEscalation: false, achievement: 'Pekerjaan berjalan sesuai rencana hari ini.', ...rep } : null,
  remindedAt,
})

export const deskAdmin = {
  kind: 'ADMIN',
  entity: { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', region: 'Jakarta' },
  today: today0,
  lockAt,
  locked: countdown.passed,
  countdown,
  cutoffLabel: '17.00',
  week: { isoYear: 2026, isoWeek: 41, handoverBy, lockAt: weeklyInput.week.lockAt, locked: false },
  canForward: true,
  canRemind: true,
  projects: [
    AP('p1', 'Migrasi Server Data', 'Yoga Saputra', 3, 3, { submittedAt: at(10, 5), forwardedAt: at(13, 0), progressPct: 72 }),
    AP('p2', 'Aplikasi Absensi', 'Rina Kartika', 4, 2, { submittedAt: null, status: 'TERKENDALA', progressPct: 64 }, at(15, 10)),
    AP('p3', 'Google Workspace', 'Andi Wijaya', 2, 2, { submittedAt: at(9, 40), progressPct: 91 }),
    AP('p4', 'Portal Pelanggan', 'Sari Wulandari', 3, 1, null),
    AP('p5', 'Renovasi Gudang Cikarang', 'Bayu Prakoso', 5, 4, { submittedAt: at(14, 12), progressPct: 47, needsEscalation: true, evidenceCount: 3 }),
    AP('p6', 'Audit Pajak 2026', null, 0, 0, null),
    AP('p7', 'Kampanye Media Q4', 'Lina Marlina', 2, 1, { submittedAt: at(16, 58), isLate: false, progressPct: 30 }),
  ],
  divisions: [
    { id: 'a', name: 'Teknologi', head: { id: 'u1', name: 'Andi Wijaya' }, report: { id: 'w1', statusHeader: 'DRAFT', submittedAt: null, approvedAt: null, forwardedAt: null, items: 6, done: 2, blocked: 1, missingEvidence: 2 } },
    { id: 'b', name: 'Keuangan', head: { id: 'u2', name: 'Sinta Dewi' }, report: { id: 'w2', statusHeader: 'DISETUJUI', submittedAt: iso(-1), approvedAt: iso(-0.8), forwardedAt: iso(-0.5), items: 8, done: 8, blocked: 0, missingEvidence: 0 } },
    { id: 'c', name: 'Media', head: { id: 'u3', name: 'Lina Marlina' }, report: { id: 'w3', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: iso(-0.2), approvedAt: null, forwardedAt: null, items: 5, done: 3, blocked: 0, missingEvidence: 0 } },
    { id: 'd', name: 'Hukum', head: null, report: null },
  ],
  approvals: [{ id: 'pp1', name: 'Digitalisasi Arsip Kontrak', description: null, proposer: 'Sinta Dewi', proposedAt: iso(-2), slot: 'ADMIN_PT' }],
  escalations: [
    { id: 'es1', summary: 'Perangkat uji gelombang 2 terlambat dari vendor', status: 'DIAJUKAN', needed: 'KEPUTUSAN', raisedAt: iso(-4), raisedBy: 'Rina Kartika', ageDays: 4, overdue: true },
  ],
  unlocks: [{ id: 'ul1', targetType: 'DAILY', reason: 'Salah memilih status pada laporan Senin', status: 'DIAJUKAN', createdAt: iso(-1) }],
  lateThisMonth: 2,
  history: workDays.map((d, i) => {
    const last = i === workDays.length - 1
    const s = last ? 5 : [7, 6, 7, 5, 7, 6, 7, 7, 6][i]
    return { date: d, submitted: s, onTime: last ? 5 : s - (i % 3 === 0 ? 1 : 0), forwarded: last ? 1 : s - (i % 4 === 0 ? 1 : 0) }
  }),
}
