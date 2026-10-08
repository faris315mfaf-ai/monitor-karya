import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regresi tata letak responsif Admin PT (Tahap 1, commit c9a1c6c):
 *  - ComplianceCard di tablet (600–1023 px) memakai kartu divisi 2 kolom
 *    berisi nama, kepala divisi, StatusBadge, DivisionBar, tombol Detail dan
 *    Ingatkan (Ingatkan hanya pada mode harian yang masih bisa mengingatkan);
 *  - di luar tablet pola lama (daftar mk-desk-queue) tetap dipakai;
 *  - ComplianceHeatmapCard di ponsel memakai label 3 huruf dan membawa nama
 *    lengkap divisi di caption peta panas.
 *
 * Pola account-sheet-presence.test.ts: kartu dipanggil sebagai fungsi dengan
 * React dimock (useState slot, useSyncExternalStore mengikuti viewport tes),
 * state ComplianceData diberikan lewat props sehingga useFetch tidak jalan.
 */

const h = vi.hoisted(() => ({ media: false, slots: [] as any[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useMemo: (fn: () => unknown) => fn(),
  // useIsTablet/useIsPhone: nilai viewport sesuai kebutuhan tes.
  useSyncExternalStore: () => h.media,
}))

import { ComplianceCard, ComplianceHeatmapCard, type ComplianceState } from '@/components/admin/compliance'
import { Button, DivisionBar, Heatmap, StatusBadge } from '@/components/mk'
import { pctOf, type ComplianceData, type DivisionCompliance } from '@/lib/admin-compliance'

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

function division(over: Partial<DivisionCompliance> & Pick<DivisionCompliance, 'id' | 'name'>): DivisionCompliance {
  return {
    entityId: 'pt-1',
    head: { id: 'h-1', name: 'Pak Kepala', email: 'kepala@contoh.invalid', phone: null },
    expected: 0,
    reported: 0,
    onLeave: 0,
    missing: [],
    history: [100, 100, null],
    weekly: { state: 'MASUK', statusHeader: null, submittedAt: '2026-10-08T08:00:00+07:00', approvedAt: null, forwardedAt: null },
    ...over,
  }
}

const DIV_TEK = division({
  id: 'd-tek', name: 'Teknologi', expected: 2, reported: 1,
  missing: [{ id: 'p-1', name: 'Bayu Setiawan', role: 'Manager / PIC proyek', lastReportAt: null, remindedAt: null, projects: ['Jalan Tol Selatan'] }],
})
const DIV_SDM = division({
  id: 'd-sdm', name: 'Sumber Daya Manusia', expected: 2, reported: 2, history: [80, 60, null],
  weekly: { state: 'BELUM', statusHeader: null, submittedAt: null, approvedAt: null, forwardedAt: null },
})

function dataFixture(over: Partial<ComplianceData> = {}): ComplianceData {
  return {
    today: '2026-10-08',
    days: ['2026-10-06', '2026-10-07', '2026-10-08'],
    locked: false,
    week: { isoYear: 2026, isoWeek: 41, handoverBy: '2026-10-08T17:00:00+07:00', lockAt: '2026-10-09T17:00:00+07:00', handoverPassed: false },
    totals: { expected: 4, reported: 3, onLeave: 0, reminded: 0, unassigned: 0 },
    divisions: [DIV_TEK, DIV_SDM],
    canRemind: true,
    ...over,
  }
}
function stateFixture(d: ComplianceData = dataFixture()): ComplianceState {
  return { data: d, setData: vi.fn(), error: null, loading: false, reload: vi.fn() } as unknown as ComplianceState
}

const renderCard = (state: ComplianceState) => {
  h.cursor = 0
  return ComplianceCard({ state })
}
const renderHeatmap = (state: ComplianceState) => {
  h.cursor = 0
  return ComplianceHeatmapCard({ state })
}
const insetCards = (tree: any) =>
  nodes(tree, (n) => typeof n.type === 'string' && typeof n.props?.className === 'string' && n.props.className.includes('mk-card--inset'))
const cardByName = (tree: any, nama: string) => {
  const found = insetCards(tree).filter((c: any) => textOf(c).includes(`Divisi ${nama}`))
  expect(found).toHaveLength(1)
  return found[0]
}

beforeEach(() => {
  h.media = false
  h.slots = []
  h.cursor = 0
})

describe('ComplianceCard di tablet (600–1023 px), mode harian', () => {
  beforeEach(() => { h.media = true })

  it('divisi tersusun kartu 2 kolom, bukan daftar mk-desk-queue', () => {
    const tree = renderCard(stateFixture())
    expect(nodes(tree, (n) => n.props?.className === 'grid grid-cols-2 gap-3')).toHaveLength(1)
    expect(insetCards(tree)).toHaveLength(2)
    expect(nodes(tree, (n) => n.props?.className === 'mk-desk-queue')).toHaveLength(0)
  })

  it('kartu memuat nama divisi, kepala divisi, DivisionBar, StatusBadge, dan tombol Detail', () => {
    const tree = renderCard(stateFixture())
    const tek = cardByName(tree, 'Teknologi')
    expect(textOf(tek)).toContain('Pak Kepala')
    const bar = nodes(tek, (n) => n.type === DivisionBar)[0]
    expect(bar).toBeDefined()
    expect(bar.props.name).toBe('Kepatuhan harian')
    expect(bar.props.value).toBe(pctOf(DIV_TEK.reported, DIV_TEK.expected))
    expect(bar.props.meta).toBe(`${DIV_TEK.reported} dari ${DIV_TEK.expected} orang`)
    const badge = nodes(tek, (n) => n.type === StatusBadge)[0]
    expect(badge.props.status).toBe('risk')
    expect(badge.props.children).toBe('1 belum')
    expect(nodes(tek, (n) => n.type === Button && n.props.children === 'Detail')).toHaveLength(1)
  })

  it('tombol Ingatkan hanya pada divisi dengan yang belum lapor dan bisa diingatkan', () => {
    const tree = renderCard(stateFixture())
    const tek = cardByName(tree, 'Teknologi')
    const sdm = cardByName(tree, 'Sumber Daya Manusia')
    const remindTek = nodes(tek, (n) => n.type === Button && n.props.children === 'Ingatkan')
    expect(remindTek).toHaveLength(1)
    expect(remindTek[0].props['aria-label']).toBe(`Ingatkan ${DIV_TEK.missing.length} orang Divisi Teknologi`)
    // Divisi lengkap tidak menawarkan pengingat.
    expect(nodes(sdm, (n) => n.type === Button && n.props.children === 'Ingatkan')).toHaveLength(0)
    const badgeSdm = nodes(sdm, (n) => n.type === StatusBadge)[0]
    expect(badgeSdm.props.status).toBe('done')
    expect(badgeSdm.props.children).toBe('Lengkap')
  })

  it('laporan terkunci: pengingat disembunyikan dan lencana harian berstatus late', () => {
    const tree = renderCard(stateFixture(dataFixture({ locked: true })))
    expect(nodes(tree, (n) => n.type === Button && n.props.children === 'Ingatkan')).toHaveLength(0)
    const tek = cardByName(tree, 'Teknologi')
    const badge = nodes(tek, (n) => n.type === StatusBadge)[0]
    expect(badge.props.status).toBe('late')
    expect(badge.props.children).toBe('1 belum')
  })
})

describe('ComplianceCard di tablet, mode mingguan', () => {
  beforeEach(() => { h.media = true })

  it('tanpa DivisionBar dan tombol Ingatkan; lencana memakai status mingguan', () => {
    h.slots = ['mingguan'] // slot useState pertama ComplianceCard: mode laporan
    const tree = renderCard(stateFixture())
    expect(nodes(tree, (n) => n.type === DivisionBar)).toHaveLength(0)
    expect(nodes(tree, (n) => n.type === Button && n.props.children === 'Ingatkan')).toHaveLength(0)
    // Kartu dan tombol Detail tetap ada untuk semua divisi.
    expect(insetCards(tree)).toHaveLength(2)
    expect(nodes(tree, (n) => n.type === Button && n.props.children === 'Detail')).toHaveLength(2)
    expect(nodes(tree, (n) => n.props?.children === 'Tenggat Kamis 17.00 WIB')).toHaveLength(2)
    const tek = cardByName(tree, 'Teknologi')
    const badgeTek = nodes(tek, (n) => n.type === StatusBadge)[0]
    expect(badgeTek.props.status).toBe('done')
    expect(badgeTek.props.children).toBe('Masuk')
    const sdm = cardByName(tree, 'Sumber Daya Manusia')
    const badgeSdm = nodes(sdm, (n) => n.type === StatusBadge)[0]
    expect(badgeSdm.props.status).toBe('neutral')
    expect(badgeSdm.props.children).toBe('Belum masuk')
  })
})

describe('ComplianceCard di luar tablet tetap pola lama', () => {
  it('daftar mk-desk-queue dengan DivisionBar per divisi dan tombol Detail di baris', () => {
    const tree = renderCard(stateFixture())
    expect(nodes(tree, (n) => n.props?.className === 'grid grid-cols-2 gap-3')).toHaveLength(0)
    const queue = nodes(tree, (n) => n.props?.className === 'mk-desk-queue')
    expect(queue).toHaveLength(1)
    const rows = nodes(queue[0], (n) => n.props?.className === 'mk-desk-queue__row')
    expect(rows).toHaveLength(2)
    const barTek = nodes(rows[0], (n) => n.type === DivisionBar)[0]
    expect(barTek.props.name).toBe('Divisi Teknologi')
    const hit = nodes(rows[0], (n) => n.props?.className === 'mk-desk-queue__hit')[0]
    expect(hit.props['aria-label']).toBe('Detail Divisi Teknologi')
    // Pengingat harian tetap tersedia di pola lama.
    expect(nodes(rows[0], (n) => n.type === Button && n.props.children === 'Ingatkan')).toHaveLength(1)
  })
})

describe('ComplianceHeatmapCard: label baris di ponsel', () => {
  it('ponsel: baris memakai label 3 huruf dan caption membawa nama lengkap', () => {
    h.media = true
    const heat = nodes(renderHeatmap(stateFixture()), (n) => n.type === Heatmap)[0]
    expect(heat.props.rowLabels).toEqual(['Tek', 'SDM'])
    expect(heat.props.label).toBe('Kepatuhan laporan harian per divisi: Teknologi, Sumber Daya Manusia, 3 hari kerja terakhir')
  })

  it('di luar ponsel: baris memakai nama lengkap dan caption tanpa daftar nama', () => {
    h.media = false
    const heat = nodes(renderHeatmap(stateFixture()), (n) => n.type === Heatmap)[0]
    expect(heat.props.rowLabels).toEqual(['Teknologi', 'Sumber Daya Manusia'])
    expect(heat.props.label).toBe('Kepatuhan laporan harian per divisi, 3 hari kerja terakhir')
  })
})
