/**
 * [T2-B2 · backlog D] Alur "Kirim laporan" dan "Hapus laporan" pada Sheet
 * laporan harian (src/components/views/daily-input-view.tsx).
 *
 * Komponen dipanggil sebagai fungsi dengan hook React dimock; Sheet, Button,
 * useConfirm, dan ConfirmDialog adalah modul sungguhan sehingga wiring
 * keyboard/fokus yang diuji adalah kode produksi. fetch dan lapisan data
 * dipalsukan. Interaksi Radix (Esc/fokus) disimulasikan sebagai kontrak
 * pustaka: Esc/scrim → onOpenChange(false).
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, data: null as any, reload: vi.fn(), refreshBadges: vi.fn(),
  fetch: vi.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, json: async () => ({}) })),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ?? (h.slots[i] = { current: initial }) },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
}))
vi.mock('sonner', () => ({ toast: h.toast }))
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: h.data, loading: false, error: null, reload: h.reload }) }))
vi.mock('@/components/app-provider', () => ({ useApp: () => ({ setActiveTab: vi.fn() }) }))
vi.mock('@/components/evidence-panel', () => ({ EvidencePanel: () => null }))
vi.mock('@/components/task-section', () => ({ TaskSection: () => null }))
vi.mock('@/components/progress-report-panel', () => ({ ProgressReportPanel: () => null }))
vi.mock('@/components/pic/nav-badges', () => ({ refreshNavBadges: h.refreshBadges }))
vi.mock('@/components/views/dash-common', () => ({ DashHeader: () => null }))
// Sheet/Button/ConfirmDialog tetap asli; hanya deteksi lebar layar yang
// butuh window.matchMedia sehingga dipatok desktop.
vi.mock('@/components/mk', async (original) => ({
  ...await original<typeof import('@/components/mk')>(),
  useIsPhone: () => false,
  useIsTablet: () => false,
}))
import { DailyInputView } from '@/components/views/daily-input-view'
import { Sheet } from '@/components/mk/sheet'
import { Button } from '@/components/mk/core'
import { ConfirmDialog } from '@/components/mk/confirm-dialog'
import { nodes, flush } from './helpers'

const ISO = '2026-10-08T00:00:00+07:00'
const P1 = {
  id: 'p1', code: 'PRJ-1', name: 'Portal Kinerja', phase: 'PEMBANGUNAN', taskCount: 2, derived: false,
  editable: true, lockReason: null, unlock: null,
  report: {
    id: 'r1', status: 'ON_PROGRESS', progressPct: 40, achievementToday: 'Modul izin diuji', obstacle: null, followUp: null,
    decisionRequestedFrom: null, evidenceCount: 1, submittedAt: null, forwardedAt: null, isLocked: false, evidence: [],
  },
}
const P2 = {
  id: 'p2', code: 'PRJ-2', name: 'Aplikasi Absensi', phase: 'PERENCANAAN', taskCount: 0, derived: false,
  editable: true, lockReason: null, unlock: null,
  report: {
    id: 'r2', status: 'SELESAI', progressPct: 100, achievementToday: 'Selesai', obstacle: null, followUp: null,
    decisionRequestedFrom: null, evidenceCount: 1, submittedAt: '2026-10-08T09:00:00+07:00', forwardedAt: null, isLocked: false, evidence: [],
  },
}

const render = () => { h.cursor = 0; return DailyInputView() }
const findButton = (tree: any, label: string) => nodes(tree, (n) => n.type === Button && n.props.children === label)
const laporanSheet = (tree: any) => nodes(tree, (n) => n.type === Sheet && n.props.title === 'Portal Kinerja')[0]

/**
 * Render penuh: DailyInputView lalu ReportForm di dalam Sheet-nya dipanggil
 * sekali lagi sebagai fungsi (JSX hanya membuat deskriptor elemen) sehingga
 * isi formulir — tombol Kirim/Hapus dan confirmEl — ikut termaterialkan.
 * Kursor hook dilanjutkan (bukan direset) supaya slot ReportForm stabil.
 */
function renderForm() {
  const view = render()
  const rfEl = nodes(view, (n) => n.props?.project?.id === 'p1' && 'onSaved' in (n.props ?? {}))[0]
  return rfEl ? rfEl.type(rfEl.props) : null
}

beforeEach(() => {
  h.slots = []
  h.cursor = 0
  h.data = {
    reportDate: ISO, today: true, lockAt: '2026-10-08T17:00:00+07:00', locked: false,
    countdown: { hours: 3, minutes: 0, passed: false }, canRequestUnlock: true, openDays: [],
    projects: [P1, P2],
  }
  h.fetch.mockClear()
  h.toast.success.mockClear()
  h.refreshBadges.mockClear()
  vi.stubGlobal('fetch', h.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it('baris proyek dibuka lewat tombol berlabel "Buka laporan …" (bisa diketik Tab+Enter)', () => {
  const tree = render()
  const baris = nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0]
  expect(baris).toBeDefined()
  expect(baris.props.type).toBe('button')
})

it('Sheet laporan terbuka berisi tombol Kirim laporan (primer) dan Hapus laporan (destructive)', () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  const sheet = laporanSheet(tree)
  expect(sheet).toBeDefined()
  expect(sheet.props.open).toBe(true)

  const form = renderForm()
  expect(form).not.toBeNull()
  const kirim = findButton(form, 'Kirim laporan')[0]
  expect(kirim).toBeDefined()
  expect(kirim.props.variant).toBe('primary')
  const hapus = findButton(form, 'Hapus laporan')[0]
  expect(hapus).toBeDefined()
  expect(hapus.props.variant).toBe('destructive')

  // Urutan tombol dalam aksi: Kirim (primer) → Simpan draf → Lampirkan foto → Hapus.
  const semua = nodes(form, (n) => n.type === Button)
  const urutan = semua.map((b) => b.props.children)
  expect(urutan.indexOf('Kirim laporan')).toBeLessThan(urutan.indexOf('Hapus laporan'))
})

it('Esc pada Sheet laporan menutup tanpa mengirim apa pun (onOpenChange wiring)', () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  const sheet = laporanSheet(tree)
  expect(sheet.props.open).toBe(true)
  sheet.props.onOpenChange(false)
  tree = render()
  // Judul kembali ke bawaan; tidak ada Sheet terbuka dan formulir dilepas.
  expect(nodes(tree, (n) => n.type === Sheet && n.props.open === true)).toHaveLength(0)
  expect(renderForm()).toBeNull()
  expect(h.fetch).not.toHaveBeenCalled()
})

it('tombol Kirim laporan mengirim PUT /api/daily-input dengan action submit', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  findButton(renderForm(), 'Kirim laporan')[0].props.onClick()
  await flush()
  expect(h.fetch).toHaveBeenCalledTimes(1)
  const [url, init] = h.fetch.mock.calls[0] as any[]
  expect(url).toBe('/api/daily-input')
  expect(init.method).toBe('PUT')
  expect(JSON.parse(init.body)).toMatchObject({ projectId: 'p1', action: 'submit' })
  expect(h.toast.success).toHaveBeenCalledWith('Laporan terkirim ke Admin PT')
  expect(h.refreshBadges).toHaveBeenCalled()
})

it('Hapus laporan membuka konfirmasi destruktif; Esc membatalkan tanpa DELETE', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  findButton(renderForm(), 'Hapus laporan')[0].props.onClick()
  await flush()

  const form = renderForm()
  const dialog = nodes(form, (n) => n.type === ConfirmDialog && n.props.open === true)[0]
  expect(dialog).toBeDefined()
  expect(dialog.props.destructive).toBe(true)
  expect(dialog.props.confirmLabel).toBe('Hapus laporan')
  expect(String(dialog.props.title)).toContain('Hapus laporan')

  // Esc / klik scrim pada dialog konfirmasi → janji false → hapus dibatalkan.
  dialog.props.onOpenChange(false)
  await flush()
  expect(h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE')).toHaveLength(0)
})

it('menyetujui konfirmasi Hapus laporan mengeksekusi DELETE /api/daily-input', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  findButton(renderForm(), 'Hapus laporan')[0].props.onClick()
  await flush()

  const dialog = nodes(renderForm(), (n) => n.type === ConfirmDialog && n.props.open === true)[0]
  dialog.props.onConfirm()
  await flush()
  const hapus = h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE')
  expect(hapus).toHaveLength(1)
  expect(hapus[0][0]).toContain('/api/daily-input?')
  expect(hapus[0][0]).toContain('projectId=p1')
})

it('Batal pada konfirmasi Hapus laporan juga tidak mengeksekusi DELETE', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  findButton(renderForm(), 'Hapus laporan')[0].props.onClick()
  await flush()
  nodes(renderForm(), (n) => n.type === ConfirmDialog && n.props.open === true)[0].props.onCancel()
  await flush()
  expect(h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE')).toHaveLength(0)
})
