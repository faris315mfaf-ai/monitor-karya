import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regresi drill-down "Dashboard Manajemen per perusahaan" (T3-A3, keputusan
 * pemilik 8 Okt 2026):
 *  - groupCompanies mengelompokkan proyek per {entityId, entityName, entityCode}
 *    dengan jumlah reportedToday;
 *  - companyBadge memetakan kepatuhan hari ini (semua lapor / sebagian / belum
 *    ada yang wajib) ke StatusBadge;
 *  - reportBadge memetakan status laporan harian → label manusiawi;
 *  - escalationBadge memetakan status eskalasi → StatusBadge;
 *  - pohon kartu CompanyReports: satu tombol aksesabel per perusahaan, kelas
 *    grid responsif, kalimat jawaban di atas grid, dua Sheet terpasang bersama.
 *
 * Pola account-sheet-presence.test.ts / compliance-responsive.test.ts: komponen
 * dipanggil sebagai fungsi, React (useState/useMemo) dan useFetch dimock, pohon
 * elemen ditelusuri tanpa DOM. Sheet tidak dibuka — render isinya tidak diuji.
 */

const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useMemo: (fn: () => unknown) => fn(),
}))
vi.mock('@/hooks/use-fetch', () => ({
  useFetch: () => ({ data: null, loading: false, error: null, reload: vi.fn() }),
}))

import { CompanyReports, companyBadge, escalationBadge, groupCompanies, oneLine, reportBadge } from '@/components/oversight/company-reports'
import { EmptyNote, StatusBadge } from '@/components/mk'
import type { OversightProject } from '@/components/oversight/types'

function nodes(tree: any, accept: (n: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [...(accept(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((c) => nodes(c, accept))]
}
/** Teks host element di dalam pohon (elemen komponen tidak dieksekusi). */
function textOf(tree: any): string {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return ''
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (tree && typeof tree === 'object' && typeof tree.type === 'string') return textOf(tree.props?.children)
  return ''
}

function project(
  over: Partial<OversightProject> & Pick<OversightProject, 'id' | 'name' | 'entityId' | 'entityName' | 'entityCode'>
): OversightProject {
  return {
    code: 'PRJ-01',
    phase: 'Pelaksanaan',
    pic: 'Rina Kusuma',
    status: 'on',
    reason: null,
    progress: 40,
    targetEndDate: '2026-11-20T00:00:00+07:00',
    startDate: null,
    reportedToday: false,
    ...over,
  }
}

const P1 = project({ id: 'p-1', name: 'Kampanye Media Oktober', entityId: 'e-1', entityName: 'PT Sigma Daya', entityCode: 'SGD', reportedToday: true })
const P2 = project({ id: 'p-2', name: 'Peluncuran Aplikasi Absensi', entityId: 'e-1', entityName: 'PT Sigma Daya', entityCode: 'SGD', reportedToday: false, status: 'risk', divisionName: 'Teknologi' })
const P3 = project({ id: 'p-3', name: 'Renovasi Ruang IT', entityId: 'e-2', entityName: 'PT Nusa Karya', entityCode: 'NSK', reportedToday: true })

beforeEach(() => {
  h.slots = []
  h.cursor = 0
})

describe('groupCompanies: pengelompokan per perusahaan', () => {
  it('mengelompokkan per entityId dengan urutan kemunculan pertama', () => {
    const groups = groupCompanies([P1, P3, P2])
    expect(groups.map((g) => g.entityId)).toEqual(['e-1', 'e-2'])
    expect(groups[0]).toMatchObject({ entityName: 'PT Sigma Daya', entityCode: 'SGD' })
    expect(groups[0].projects.map((p) => p.id)).toEqual(['p-1', 'p-2'])
    expect(groups[1].projects.map((p) => p.id)).toEqual(['p-3'])
  })

  it('menghitung proyek yang lapor hari ini per perusahaan', () => {
    const groups = groupCompanies([P1, P2, P3])
    expect(groups[0].reportedToday).toBe(1)
    expect(groups[0].projects).toHaveLength(2)
    expect(groups[1].reportedToday).toBe(1)
  })

  it('entitas berbeda dengan nama sama tetap terpisah (kunci entityId)', () => {
    const a = project({ id: 'x-1', name: 'Proyek A', entityId: 'e-9', entityName: 'PT Sama', entityCode: 'SMA' })
    const b = project({ id: 'x-2', name: 'Proyek B', entityId: 'e-10', entityName: 'PT Sama', entityCode: 'SMA' })
    expect(groupCompanies([a, b])).toHaveLength(2)
  })

  it('daftar kosong menghasilkan tanpa kelompok', () => {
    expect(groupCompanies([])).toEqual([])
  })
})

describe('companyBadge: kepatuhan hari ini kartu perusahaan', () => {
  it('semua lapor → done', () => {
    expect(companyBadge(3, 3)).toEqual({ status: 'done', label: 'Semua lapor' })
  })
  it('sebagian lapor → risk dengan sisa belum lapor', () => {
    expect(companyBadge(1, 3)).toEqual({ status: 'risk', label: '2 belum lapor' })
  })
  it('belum ada yang lapor → risk', () => {
    expect(companyBadge(0, 3)).toEqual({ status: 'risk', label: 'Belum ada yang lapor' })
  })
  it('belum ada yang wajib → neutral', () => {
    expect(companyBadge(0, 0)).toEqual({ status: 'neutral', label: 'Belum ada yang wajib' })
  })
})

describe('reportBadge: peta status laporan harian → StatusBadge', () => {
  it('lima status baku terpetakan ke label manusiawi', () => {
    expect(reportBadge('SELESAI')).toEqual({ status: 'done', label: 'Selesai' })
    expect(reportBadge('ON_PROGRESS')).toEqual({ status: 'on', label: 'Dikerjakan' })
    expect(reportBadge('TERKENDALA')).toEqual({ status: 'risk', label: 'Terkendala' })
    expect(reportBadge('MENUNGGU_KEPUTUSAN')).toEqual({ status: 'risk', label: 'Menunggu keputusan' })
    expect(reportBadge('TIDAK_ADA_PERUBAHAN')).toEqual({ status: 'neutral', label: 'Tanpa perubahan' })
  })
  it('status tak dikenal dan kosong jatuh ke neutral', () => {
    expect(reportBadge('BARU')).toEqual({ status: 'neutral', label: 'BARU' })
    expect(reportBadge(null)).toEqual({ status: 'neutral', label: 'Tanpa status' })
  })
})

describe('escalationBadge: peta status eskalasi → StatusBadge', () => {
  it('empat status eskalasi terpetakan', () => {
    expect(escalationBadge('DIAJUKAN')).toEqual({ status: 'risk', label: 'Diajukan' })
    expect(escalationBadge('DITINJAU')).toEqual({ status: 'info', label: 'Ditinjau' })
    expect(escalationBadge('DIPUTUSKAN')).toEqual({ status: 'done', label: 'Diputuskan' })
    expect(escalationBadge('DITUTUP')).toEqual({ status: 'done', label: 'Ditutup' })
  })
  it('status tak dikenal jatuh ke neutral dengan nilai asli', () => {
    expect(escalationBadge('ANEH')).toEqual({ status: 'neutral', label: 'ANEH' })
  })
})

describe('oneLine: capaian dipangkas satu baris', () => {
  it('meratakan spasi dan memangkas dengan elipsis', () => {
    expect(oneLine('a\n\n  b   c')).toBe('a b c')
    const panjang = 'kata '.repeat(40).trim()
    const hasil = oneLine(panjang)
    expect(hasil.length).toBeLessThanOrEqual(110)
    expect(hasil.endsWith('…')).toBe(true)
    expect(oneLine(panjang, 20).length).toBeLessThanOrEqual(20)
  })
  it('teks kosong menghasilkan string kosong', () => {
    expect(oneLine(null)).toBe('')
    expect(oneLine('   ')).toBe('')
  })
})

describe('CompanyReports: pohon kartu perusahaan', () => {
  const render = (projects: OversightProject[]) => {
    h.cursor = 0
    return CompanyReports({ projects })
  }
  const companyButtons = (tree: any) =>
    nodes(tree, (n) => n.type === 'button' && typeof n.props?.['aria-label'] === 'string' && n.props['aria-label'].startsWith('Lihat laporan perusahaan '))

  it('kalimat jawaban di atas grid menyebut jumlah perusahaan', () => {
    const tree = render([P1, P2, P3])
    expect(textOf(tree)).toContain('2 perusahaan · ketuk untuk membaca laporan hariannya')
  })

  it('grid responsif: ponsel 1, tablet 2, desktop 3 kolom', () => {
    const tree = render([P1, P2, P3])
    expect(nodes(tree, (n) => n.props?.className === 'grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 lg:grid-cols-3')).toHaveLength(1)
  })

  it('satu kartu tombol aksesabel per perusahaan dengan isi dan lencana', () => {
    const tree = render([P1, P2, P3])
    const buttons = companyButtons(tree)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].props['aria-label']).toBe('Lihat laporan perusahaan PT Sigma Daya')
    expect(buttons[1].props['aria-label']).toBe('Lihat laporan perusahaan PT Nusa Karya')
    expect(textOf(buttons[0])).toContain('PT Sigma Daya')
    expect(textOf(buttons[0])).toContain('2 proyek')
    expect(textOf(buttons[0])).toContain('1 dari 2 proyek lapor hari ini')
    const badge = nodes(buttons[0], (n) => n.type === StatusBadge)[0]
    expect(badge.props.status).toBe('risk')
    expect(badge.props.children).toBe('1 belum lapor')
  })

  it('perusahaan yang semua proyeknya lapor mendapat lencana done', () => {
    const tree = render([P3, project({ id: 'p-4', name: 'Audit Internal', entityId: 'e-2', entityName: 'PT Nusa Karya', entityCode: 'NSK', reportedToday: true })])
    const badge = nodes(companyButtons(tree)[0], (n) => n.type === StatusBadge)[0]
    expect(badge.props.status).toBe('done')
    expect(badge.props.children).toBe('Semua lapor')
  })

  it('kedua Sheet (perusahaan dan proyek) terpasang bersama sejak awal', () => {
    const tree = render([P1])
    // Elemen komponen Sheet tidak dieksekusi tanpa DOM — cukup dipastikan
    // kedua pembungkus Sheet terpasang sejak render pertama (pola DivisionSheet).
    const names = nodes(tree, (n) => typeof n.type === 'function').map((n: any) => n.type.name)
    expect(names).toContain('CompanySheet')
    expect(names).toContain('ProjectReportsSheet')
  })

  it('tanpa proyek: EmptyNote, tanpa kartu dan tanpa kalimat jumlah', () => {
    const tree = render([])
    expect(companyButtons(tree)).toHaveLength(0)
    expect(nodes(tree, (n) => n.type === EmptyNote)).toHaveLength(1)
    expect(textOf(tree)).not.toContain('perusahaan · ketuk')
  })
})
