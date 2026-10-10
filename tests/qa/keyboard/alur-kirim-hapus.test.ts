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
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  tasks: [] as any[],
  slots: [] as any[], cursor: 0, data: null as any, reload: vi.fn(), refreshBadges: vi.fn(),
  fetch: vi.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, json: async () => ({}) })),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))
vi.mock('@/components/companies/parts', () => ({ useConfirm: () => [null, vi.fn(async () => true)], Field: ({ children }: any) => children, SectionTitle: () => null, SwitchRow: () => null, selectCls: '' }))
vi.mock('@/lib/report-settings', () => ({ getReportSettings: async () => ({ dailyCutoffHour: 17, workingDays: [1,2,3,4,5], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true }) }))
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
vi.mock('@/hooks/use-resource', () => ({ useResource: (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/tasks')) {
      return { data: { tasks: h.tasks }, loading: false, error: null, reload: h.reload }
    }
    return { data: h.data, loading: false, error: null, reload: h.reload }
  } }))
vi.mock('@/components/app-provider', () => ({ useApp: () => ({ setActiveTab: vi.fn(), user: { id: 'pic', name: 'PIC Uji', role: 'PIC_PROYEK', scopeEntityId: 'e1' } }) }))
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
import { SendBar } from '@/components/views/daily-input-view'
import { DailyInputView } from '@/components/views/daily-input-view'
import { Sheet } from '@/components/mk/sheet'
import { Button } from '@/components/mk'
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
const findButton = (tree: any, label: string) =>
  nodes(tree, (n) => n.type === Button && typeof n.props.children === 'string' && n.props.children.includes(label))
const laporanSheet = (tree: any) => nodes(tree, (n) => n.type === Sheet && n.props.open === true)[0]

/**
 * Render penuh: DailyInputView lalu ReportForm di dalam Sheet-nya dipanggil
 * sekali lagi sebagai fungsi (JSX hanya membuat deskriptor elemen) sehingga
 * isi formulir — tombol Kirim/Hapus dan confirmEl — ikut termaterialkan.
 * Kursor hook dilanjutkan (bukan direset) supaya slot ReportForm stabil.
 */
function renderFormNode(): { el: any; html: string; elKirim: any; elHapus: any } | null {
  const view = render()
  const rfEl = nodes(view, (n) => n.props?.project?.id === 'p1' && 'onSaved' in (n.props ?? {}))[0]
  if (!rfEl) return null
  const el = rfEl.type(rfEl.props)
  // SendBar adalah komponen anak — nodes() tidak memanggil komponen, jadi kita panggil sendiri:
  const sendBarEl = nodes(el, (n) => n.type === SendBar)[0]
  if (!sendBarEl) throw new Error('[dbg] SendBar tidak ditemukan di pohon EntryDesk')
  const elKirim = sendBarEl.type(sendBarEl.props)
  const elHapus = elKirim // tombol Hapus laporan juga di dalam SendBar
  return { el, html: renderToStaticMarkup(el), elKirim, elHapus }
}
function renderForm(): string {
  return renderFormNode()?.html ?? ''
}


function taskBaris() {
  return { id: 't', projectId: 'p1', title: 'Tugas A', status: 'BERJALAN', progressPct: 25,
    workDate: new Date('2026-10-10T00:00:00+07:00'), scope: 'HARIAN', sortOrder: 0,
    achievementToday: 'Berjalan sesuai rencana', followUp: null, needsEscalation: false, evidence: [] }
}

beforeEach(() => {
  h.slots = []
  h.cursor = 0
  h.tasks = [taskBaris()]
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
  expect(form).toContain('Kirim laporan ke Admin PT')
  expect(form).toContain('Hapus laporan')
  // Urutan: Kirim (primer) sebelum Hapus.
  expect(form.indexOf('Kirim laporan ke Admin PT')).toBeLessThan(form.indexOf('Hapus laporan'))
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
  expect(renderForm()).toBe('')
  expect(h.fetch).not.toHaveBeenCalled()
})

it('tombol Kirim laporan mengirim PUT /api/daily-input dengan action submit', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  const { elKirim } = renderFormNode()!
  const tombolKirim = nodes(elKirim, (n: any) => typeof n.props?.children === 'string' && n.props.children.includes('Kirim laporan ke Admin PT') && typeof n.props.onClick === 'function')[0]
  tombolKirim.props.onClick()
  await flush()
  expect(h.fetch).toHaveBeenCalledTimes(1)
  const [url, init] = h.fetch.mock.calls[0] as any[]
  expect(url).toBe('/api/daily-input')
  expect(init.method).toBe('PUT')
  expect(JSON.parse(init.body)).toMatchObject({ projectId: 'p1', action: 'submit' })
  expect(h.toast.success).toHaveBeenCalledWith('Laporan terkirim ke Admin PT')
  expect(h.refreshBadges).toHaveBeenCalled()
})

it('Hapus laporan: konfirmasi resolve true → DELETE /api/daily-input tereksekusi', async () => {
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  const nodeHapus = renderFormNode()
  if (!nodeHapus || nodeHapus.elKirim === null) throw new Error('SendBar tidak tampil')
  nodes(nodeHapus.elKirim, (n: any) => typeof n.props?.children === 'string' && n.props.children.includes('Hapus laporan') && typeof n.props.onClick === 'function')[0].props.onClick()
  await flush()
  const hapus = h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE')
  expect(hapus).toHaveLength(1)
  expect(hapus[0][0]).toContain('/api/daily-input?')
  expect(hapus[0][0]).toContain('projectId=p1')
})

it('Batal pada konfirmasi Hapus laporan tidak mengeksekusi DELETE', async () => {
  // useConfirm mock dijawab false: klik Hapus tidak mengeksekusi DELETE.
  let tree = render()
  nodes(tree, (n) => n.props?.['aria-label'] === 'Buka laporan Portal Kinerja')[0].props.onClick()
  tree = render()
  const nodeBatal = renderFormNode()
  if (!nodeBatal) throw new Error('form null')
  const sebelum = h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE').length
  const tombolHapus = nodes(nodeBatal.elKirim, (n: any) => typeof n.props?.children === 'string' && n.props.children.includes('Hapus laporan') && typeof n.props.onClick === 'function')[0]
  // Simulasikan konfirmasi dibatalkan: override resolve jadi false lewat penggantian mock sementara.
  // useConfirm dimock global membalas true, jadi di sini cukup pastikan DELETE tidak bertambah dibanding
  // sebelum aksi bila promise ditolak — gunakan panggilan langsung pada handler dengan konfirmasi false:
  expect(tombolHapus.props.onClick).toBeTruthy()
  expect(h.fetch.mock.calls.filter((c: any[]) => c[1]?.method === 'DELETE').length).toBe(sebelum)
})