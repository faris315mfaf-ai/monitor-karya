import { startOfWibDay, isoWeekOf, weekPeriodOf } from '@/lib/lock'
import { divisions as catalogDivisions } from './mock-catalog'
/**
 * Data contoh untuk /pratinjau (hanya mode pengembangan): memperlihatkan dashboard
 * tiap peran tanpa basis data. Bentuknya sama dengan respons API sungguhan.
 */

const DAY = 86400000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()
const wib0 = (offsetDays: number) => startOfWibDay(new Date(now + offsetDays * DAY)).toISOString()
export const ringkasan = {
  kind: 'RINGKASAN',
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
  p4: [
    T('t5', 'Wawancara kebutuhan tim layanan', [10, 0], [11, 0], 'SELESAI', { projectId: 'p4' }),
    T('t6', 'Sketsa alur pendaftaran', null, null, 'SELESAI', { projectId: 'p4' }),
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
      id: 'dv-tek', name: 'Teknologi', type: 'TEKNOLOGI', headName: 'Andi Wijaya',
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
      id: 'dv-tek', name: 'Teknologi', entityName: 'PT Ratu Karya',
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
    AP('p3', 'Google Workspace', 'Dewi Lestari', 2, 2, { submittedAt: at(9, 40), progressPct: 91 }),
    AP('p4', 'Portal Pelanggan', 'Sari Wulandari', 3, 1, null),
    AP('p5', 'Renovasi Gudang Cikarang', 'Bayu Prakoso', 5, 4, { submittedAt: at(14, 12), progressPct: 47, needsEscalation: true, evidenceCount: 3 }),
    AP('p6', 'Audit Pajak 2026', null, 0, 0, null),
    AP('p7', 'Kampanye Media Q4', 'Bagas Prakoso', 2, 1, { submittedAt: at(16, 58), isLate: false, progressPct: 30 }),
  ],
  divisions: [
    { id: 'dv-tek', name: 'Teknologi', head: { id: 'u1', name: 'Andi Wijaya' }, report: { id: 'w1', statusHeader: 'DRAFT', submittedAt: null, approvedAt: null, forwardedAt: null, items: 6, done: 2, blocked: 1, missingEvidence: 2 } },
    { id: 'dv-keu', name: 'Keuangan', head: { id: 'u2', name: 'Sinta Dewi' }, report: { id: 'w2', statusHeader: 'DISETUJUI', submittedAt: iso(-1), approvedAt: iso(-0.8), forwardedAt: iso(-0.5), items: 8, done: 8, blocked: 0, missingEvidence: 0 } },
    { id: 'dv-med', name: 'Media', head: { id: 'u3', name: 'Lina Marlina' }, report: { id: 'w3', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: iso(-0.2), approvedAt: null, forwardedAt: null, items: 5, done: 3, blocked: 0, missingEvidence: 0 } },
    { id: 'dv-huk', name: 'Hukum', head: null, report: null },
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

// Objek laporan yang sama dibaca PIC, Admin, dan seluruh endpoint laporan.
for (const p of deskPic.projects) {
  const holder = deskAdmin.projects.find((x) => x.id === p.id)!
  Object.defineProperty(p, 'report', { enumerable: true, get: () => holder.report, set: (value) => { holder.report = value } })
}
for (const d of catalogDivisions.filter((d) => d.entityId === 'e1')) {
  if (!deskAdmin.divisions.some((x) => x.id === d.id)) deskAdmin.divisions.push({ id: d.id, name: d.name, head: null, report: null })
  const row = deskAdmin.divisions.find((x) => x.id === d.id)!
  row.head = { id: d.headId, name: d.head }
}
Object.assign(weeklyInput.week, isoWeekOf(new Date()), { key: weekPeriodOf(new Date()).key })
weeklyInput.weeks[0].key = weeklyInput.week.key
for (const d of weeklyInput.divisions) {
  const row = deskAdmin.divisions.find((x) => x.id === d.id)!
  const report = row.report!
  const counts = {
    items: () => d.report.items.length,
    done: () => d.report.items.filter((i) => i.status === 'SELESAI').length,
    blocked: () => d.report.items.filter((i) => i.status === 'TERKENDALA').length,
    missingEvidence: () => d.report.items.filter((i) => i.evidenceCount === 0).length,
  }
  for (const [key, get] of Object.entries(counts)) Object.defineProperty(report, key, { enumerable: true, get })
  for (const key of ['statusHeader', 'submittedAt', 'approvedAt', 'forwardedAt', 'isLocked'] as const) {
    Object.defineProperty(report, key, { enumerable: true, get: () => d.report[key], set: (v) => { Object.assign(d.report, { [key]: v }) } })
  }
}

// Progres turunan = rata-rata aritmetika task, seperti computeRollup produksi.
for (const [id, tasks] of Object.entries(deskTasks)) {
  const row = deskAdmin.projects.find((p) => p.id === id)?.report
  if (row && tasks.length) row.progressPct = Math.round(tasks.reduce((n, t) => n + t.progressPct, 0) / tasks.length)
}
