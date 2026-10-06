/**
 * Kepatuhan laporan harian per orang & per divisi untuk Admin PT [F2-ADMIN]
 * (04-admin-pt.md §4, §5, Sheet divisi). Berkas ini murni (tanpa basis data)
 * supaya aturan hitungnya bisa dites dan bentuk responsnya dipakai klien.
 * Pemuat data ada di src/lib/admin-compliance-server.ts.
 *
 * Aturan (diputuskan F2-ADMIN, 6 Okt 2026; dicatat di docs/fitur/peran-admin.md):
 *  - Proyek → divisi: Project.divisionId; bila kosong, divisi PIC-nya
 *    (User.divisionId) di PT yang sama; bila PIC juga tanpa divisi, divisi yang
 *    ia pimpin di PT yang sama. Urutan sama dengan src/lib/kadiv.ts.
 *  - Orang yang wajib lapor di sebuah divisi = PIC proyek aktif divisi itu ∪
 *    anggota aktif divisi (User.divisionId) yang memegang proyek aktif.
 *  - Seseorang "sudah lapor" pada suatu hari bila SEMUA proyek aktif yang ia
 *    pegang (yang sudah mulai pada hari itu) terkirim hari itu.
 *  - CUTI/SAKIT/IZIN pada hari itu keluar dari penyebut.
 *  - Mingguan: Masuk = diserahkan paling lambat Kamis 17.00 WIB; Terlambat =
 *    diserahkan setelahnya; Belum masuk = belum diserahkan.
 */

export type WeeklyState = 'MASUK' | 'TERLAMBAT' | 'BELUM'

export type CompliancePerson = {
  id: string
  name: string
  /** Label peran, mis. "Manager / PIC proyek". */
  role: string
  /** Kiriman terakhir (mana pun proyeknya), ISO. */
  lastReportAt: string | null
  /** Pengingat harian pertama hari ini, ISO. */
  remindedAt: string | null
  /** Nama proyek yang belum terkirim hari ini. */
  projects: string[]
}

export type DivisionCompliance = {
  id: string
  name: string
  entityId: string
  head: { id: string; name: string; email: string | null; phone: string | null } | null
  /** Wajib lapor hari ini (tanpa yang cuti/izin). */
  expected: number
  reported: number
  onLeave: number
  missing: CompliancePerson[]
  /** Persen lapor per hari kerja (urutan sama dengan `days`); null = tidak ada yang wajib lapor. */
  history: (number | null)[]
  weekly: {
    state: WeeklyState
    statusHeader: string | null
    submittedAt: string | null
    approvedAt: string | null
    forwardedAt: string | null
  }
}

export type ComplianceData = {
  today: string
  /** Hari kerja terakhir (≤10), lama → baru, ISO tengah malam WIB. */
  days: string[]
  locked: boolean
  week: { isoYear: number; isoWeek: number; handoverBy: string; lockAt: string; handoverPassed: boolean }
  /** Total orang berbeda (tidak dihitung dua kali bila ada di dua divisi). */
  totals: { expected: number; reported: number; onLeave: number; reminded: number; unassigned: number }
  divisions: DivisionCompliance[]
  canRemind: boolean
}

// ------------------------------------------------------------------
// Penugasan proyek ke divisi
// ------------------------------------------------------------------

export type DivisionRef = { id: string; entityId: string; headUserId: string | null }
export type ProjectRef = {
  id: string
  entityId: string
  divisionId: string | null
  picUserId: string | null
  picDivisionId: string | null
}

/** Divisi pemilik proyek menurut aturan di atas, atau null. */
export function projectDivisionId(p: ProjectRef, divisions: DivisionRef[]): string | null {
  if (p.divisionId) return divisions.some((d) => d.id === p.divisionId) ? p.divisionId : null
  if (p.picDivisionId) {
    const d = divisions.find((x) => x.id === p.picDivisionId && x.entityId === p.entityId)
    if (d) return d.id
    return null
  }
  if (p.picUserId) {
    const led = divisions.find((x) => x.headUserId === p.picUserId && x.entityId === p.entityId)
    if (led) return led.id
  }
  return null
}

// ------------------------------------------------------------------
// Hitung per hari
// ------------------------------------------------------------------

export type DayInput = {
  /** Proyek aktif yang dipegang tiap orang dan sudah mulai pada hari itu. */
  projectsOf: Map<string, string[]>
  /** projectId yang laporannya terkirim pada hari itu. */
  submitted: Set<string>
  /** userId yang cuti/sakit/izin pada hari itu. */
  onLeave: Set<string>
}

/** Hitung orang di `people` pada satu hari: wajib, sudah, cuti, dan siapa yang belum. */
export function tallyDay(people: Iterable<string>, day: DayInput) {
  let expected = 0
  let reported = 0
  let onLeave = 0
  const missing: string[] = []
  for (const id of people) {
    const projects = day.projectsOf.get(id)
    if (!projects || projects.length === 0) continue
    if (day.onLeave.has(id)) {
      onLeave += 1
      continue
    }
    expected += 1
    if (projects.every((p) => day.submitted.has(p))) reported += 1
    else missing.push(id)
  }
  return { expected, reported, onLeave, missing }
}

export const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

// ------------------------------------------------------------------
// Mingguan
// ------------------------------------------------------------------

export function weeklyState(submittedAt: Date | string | null | undefined, handoverBy: Date | string): WeeklyState {
  if (!submittedAt) return 'BELUM'
  return new Date(submittedAt).getTime() > new Date(handoverBy).getTime() ? 'TERLAMBAT' : 'MASUK'
}

export const WEEKLY_STATE_LABELS: Record<WeeklyState, string> = {
  MASUK: 'Masuk',
  TERLAMBAT: 'Terlambat',
  BELUM: 'Belum masuk',
}

// ------------------------------------------------------------------
// CSV aman (Unduh log)
// ------------------------------------------------------------------

/**
 * Satu sel CSV: selalu dikutip, tanda kutip digandakan, dan sel yang diawali
 * = + - @ tab atau CR diberi awalan ' supaya tidak dijalankan sebagai rumus
 * oleh Excel/Sheets (CSV injection, OWASP).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  s = s.replace(/\r\n?|\n/g, ' ')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',')
}
