/**
 * [T2-B2 · backlog D] Alur keputusan "Setujui/Tolak" pada Sheet dan kartu
 * antrean: ApprovalItem (baris), RejectApprovalSheet (alasan penolakan),
 * useApprovalDecisions (approve/reject/undo), dan UnlockCard Admin PT
 * (Setujui/Tolak pengajuan buka kunci + Sheet "Ajukan buka kunci").
 *
 * Pola sama dengan alur-kirim-hapus: hook dimock, komponen sungguhan,
 * kontrak Radix (Esc → onOpenChange(false)) disimulasikan.
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0,
  unlockData: null as any, dailyData: null as any, setData: vi.fn(), reload: vi.fn(),
  send: vi.fn(async () => ({ ok: true, status: 200, error: null, json: { item: { id: 'u1', status: 'DITOLAK' } } })),
  fetch: vi.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, json: async () => ({}) })),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  refreshBadges: vi.fn(),
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
vi.mock('@/components/pic/nav-badges', () => ({ refreshNavBadges: h.refreshBadges }))
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: null, loading: false, error: null, reload: h.reload }) }))
vi.mock('@/components/admin/use-fetch', () => ({
  send: h.send,
  // data berbeda per endpoint; url null (sheet tertutup) = tanpa data,
  // meniru useFetch asli yang tidak mengambil saat url null.
  useFetch: (url: string | null) => ({
    data: url === null ? null : url.includes('daily-reports') ? h.dailyData : url.includes('weekly-reports') ? null : h.unlockData,
    setData: h.setData, error: null, loading: false, reload: h.reload,
  }),
}))
vi.mock('@/components/mk', async (original) => ({
  ...await original<typeof import('@/components/mk')>(),
  useIsPhone: () => false,
  useIsTablet: () => false,
}))
import { ApprovalItem } from '@/components/mk'
import { RejectApprovalSheet, useApprovalDecisions } from '@/components/oversight/approval-requests'
import { UnlockCard } from '@/components/admin/unlock-card'
import { Sheet } from '@/components/mk/sheet'
import { Button } from '@/components/mk/core'
import { nodes, flush } from './helpers'

const render = (fn: () => any) => { h.cursor = 0; return fn() }
const findButton = (tree: any, label: string) => nodes(tree, (n) => n.type === Button && n.props.children === label)

const ITEM = {
  id: 'ap1', type: 'ANGGARAN', title: 'Revisi anggaran Renovasi', requester: 'Rina', divisionName: 'Teknologi',
  entityCode: 'MK', entityName: 'PT MK', createdAt: '2026-10-08T08:00:00+07:00', amount: 48500000,
  status: 'DIAJUKAN', file: null, description: 'Perlu keputusan cepat', projectName: null, decidedBy: null, decisionNote: null,
  startDate: null, endDate: null,
}

beforeEach(() => {
  h.slots = []
  h.cursor = 0
  h.toast.success.mockClear()
  h.toast.error.mockClear()
  h.refreshBadges.mockClear()
  h.send.mockClear()
  h.fetch.mockClear()
  h.unlockData = {
    items: [{
      id: 'u1', status: 'DIAJUKAN', targetType: 'DAILY_REPORT', targetLabel: 'Laporan Portal Kinerja · 7 Okt',
      reason: 'salah ketik', requestedBy: { id: 'ux', name: 'Rina' }, createdAt: '2026-10-08T07:00:00+07:00',
      unlockUntil: null, reLockedAt: null,
    }],
    total: 1, can: { request: true, approve: true, execute: false }, me: 'admin',
  }
  h.dailyData = { items: [{ id: 'r9', reportDate: '2026-10-07', project: { name: 'Portal Kinerja' } }] }
  vi.stubGlobal('fetch', h.fetch)
})
afterEach(() => vi.unstubAllGlobals())

/* ---------- ApprovalItem: baris Setujui/Tolak ---------- */

it('ApprovalItem: Tolak (sekunder) mendahului Setujui; keduanya ber-aria-label per baris', () => {
  const onApprove = vi.fn()
  const onReject = vi.fn()
  const tree = ApprovalItem({
    title: 'Cuti Rina', requester: 'Rina', initials: 'R', time: '2 jam lalu',
    state: 'pending', onApprove, onReject, approveVariant: 'secondary',
  })
  const aksi = nodes(tree, (n) => String(n.props?.className ?? '').includes('mk-appr__actions'))[0]
  const [tolak, setujui] = aksi.props.children
  expect(tolak.props['aria-label']).toBe('Tolak: Cuti Rina')
  expect(setujui.props['aria-label']).toBe('Setujui: Cuti Rina')
  expect(tolak.props.variant).toBe('secondary')
  expect(setujui.props.variant).toBe('secondary')
  expect(tolak.props.disabled).toBeFalsy()
  expect(setujui.props.disabled).toBeFalsy()
  tolak.props.onClick()
  expect(onReject).toHaveBeenCalledTimes(1)
  setujui.props.onClick()
  expect(onApprove).toHaveBeenCalledTimes(1)
})

it('ApprovalItem: tombol keputusan nonaktif saat baris sedang diproses', () => {
  const tree = ApprovalItem({
    title: 'Cuti Rina', requester: 'Rina', initials: 'R', time: 't', state: 'pending',
    onApprove: vi.fn(), onReject: vi.fn(), busy: true,
  })
  const aksi = nodes(tree, (n) => String(n.props?.className ?? '').includes('mk-appr__actions'))[0]
  expect(aksi.props.children.every((b: any) => b.props.disabled === true)).toBe(true)
})

/* ---------- RejectApprovalSheet: Sheet alasan penolakan ---------- */

it('RejectApprovalSheet: Esc memanggil cancelReject; footer Batal sebelum Tolak (destructive)', () => {
  const ctl: any = { rejecting: ITEM, busy: null, cancelReject: vi.fn(), reject: vi.fn() }
  const tree = render(() => RejectApprovalSheet({ ctl }))
  const sheet = nodes(tree, (n) => n.type === Sheet)[0]
  expect(sheet.props.open).toBe(true)
  expect(sheet.props.title).toBe('Tolak permintaan')

  // Esc / scrim → onOpenChange(false) → batalkan penolakan.
  sheet.props.onOpenChange(false)
  expect(ctl.cancelReject).toHaveBeenCalledTimes(1)

  const tombolFooter = nodes(sheet.props.footer, (n) => n.type === Button)
  expect(tombolFooter.map((b) => b.props.children)).toEqual(['Batal', 'Tolak permintaan'])
  expect(tombolFooter[0].props.variant).not.toBe('destructive')
  expect(tombolFooter[1].props.variant).toBe('destructive')
  tombolFooter[0].props.onClick()
  expect(ctl.cancelReject).toHaveBeenCalledTimes(2)
})

it('RejectApprovalSheet: kolom alasan berlabel; Tolak aktif mulai 5 huruf dan mengirim alasan terpangkas', () => {
  const ctl: any = { rejecting: ITEM, busy: null, cancelReject: vi.fn(), reject: vi.fn() }
  let tree = render(() => RejectApprovalSheet({ ctl }))
  const sheet = () => nodes(tree, (n) => n.type === Sheet)[0]
  expect(nodes(tree, (n) => n.props?.htmlFor === 'mk-appr-reject')).toHaveLength(1)
  expect(nodes(tree, (n) => n.props?.id === 'mk-appr-reject')).toHaveLength(1)

  // Alasan kosong/pendek: tombol destruktif nonaktif.
  let tombol = nodes(sheet().props.footer, (n) => n.type === Button)
  expect(tombol[1].props.disabled).toBe(true)

  nodes(tree, (n) => n.props?.id === 'mk-appr-reject')[0].props.onChange({ target: { value: '  Anggaran sudah terpakai  ' } })
  tree = render(() => RejectApprovalSheet({ ctl }))
  tombol = nodes(sheet().props.footer, (n) => n.type === Button)
  expect(tombol[1].props.disabled).toBe(false)

  tombol[1].props.onClick()
  expect(ctl.reject).toHaveBeenCalledWith(ITEM, 'Anggaran sudah terpakai')
})

/* ---------- useApprovalDecisions: keputusan + Urungkan ---------- */

it('approve mengirim PATCH approve dan menawarkan Urungkan yang benar-benar memanggil undo', async () => {
  const ctl = render(useApprovalDecisions)
  await ctl.approve(ITEM)
  expect(h.fetch).toHaveBeenCalledTimes(1)
  let [url, init] = h.fetch.mock.calls[0] as any[]
  expect(url).toBe('/api/approval-requests')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(init.body)).toMatchObject({ id: 'ap1', action: 'approve' })
  expect(h.toast.success).toHaveBeenCalledTimes(1)
  const opsi = h.toast.success.mock.calls[0][1]
  expect(opsi.action.label).toBe('Urungkan')

  h.fetch.mockClear()
  opsi.action.onClick()
  await flush()
  expect(h.fetch).toHaveBeenCalledTimes(1)
  ;[url, init] = h.fetch.mock.calls[0] as any[]
  expect(JSON.parse(init.body)).toMatchObject({ id: 'ap1', action: 'undo' })

  const ctl2 = render(useApprovalDecisions)
  expect(ctl2.rejecting).toBeNull()
})

it('askReject membuka Sheet; reject mengirim PATCH reject dengan catatan lalu menutup', async () => {
  let ctl = render(useApprovalDecisions)
  ctl.askReject(ITEM)
  ctl = render(useApprovalDecisions)
  expect(ctl.rejecting).toEqual(ITEM)

  await ctl.reject(ITEM, 'Anggaran terpakai')
  const [url, init] = h.fetch.mock.calls[0] as any[]
  expect(url).toBe('/api/approval-requests')
  expect(JSON.parse(init.body)).toMatchObject({ id: 'ap1', action: 'reject', note: 'Anggaran terpakai' })
  ctl = render(useApprovalDecisions)
  expect(ctl.rejecting).toBeNull()
})

/* ---------- UnlockCard: Setujui/Tolak Admin + Sheet Ajukan buka kunci ---------- */

it('UnlockCard: Tolak dan Setujui memanggil PATCH /api/unlock-requests dengan aksi yang benar', async () => {
  const tree = render(() => UnlockCard({}))
  const semua = nodes(tree, (n) => n.type === Button)
  const tolak = semua.find((b) => b.props.children === 'Tolak')
  const setujui = semua.find((b) => b.props.children === 'Setujui')
  expect(tolak).toBeDefined()
  expect(setujui).toBeDefined()
  // Urutan tab dalam baris: Tolak lalu Setujui.
  expect(semua.indexOf(tolak)).toBeLessThan(semua.indexOf(setujui))

  tolak.props.onClick()
  await flush()
  expect(h.send).toHaveBeenCalledWith('/api/unlock-requests', 'PATCH', { id: 'u1', action: 'reject' })
  h.send.mockClear()
  setujui.props.onClick()
  await flush()
  expect(h.send).toHaveBeenCalledWith('/api/unlock-requests', 'PATCH', { id: 'u1', action: 'approve' })
})

/**
 * Render penuh UnlockCard lalu materialkan UnlockRequestSheet (JSX hanya
 * membuat deskriptor elemen) dengan melanjutkan kursor hook supaya slot
 * state sheet stabil antar-render.
 */
function renderUnlockSheet(): any | null {
  const view = render(() => UnlockCard({}))
  const el = nodes(view, (n) => 'onCreated' in (n.props ?? {}) && 'onOpenChange' in (n.props ?? {}))[0]
  return el ? el.type(el.props) : null
}

it('Sheet Ajukan buka kunci: Esc menutup; Batal sebelum Ajukan; validasi mencegah kirim kosong', async () => {
  let view = render(() => UnlockCard({}))
  findButton(view, 'Ajukan buka kunci')[0].props.onClick()
  let sheet = renderUnlockSheet()
  expect(sheet).not.toBeNull()
  expect(sheet.props.open).toBe(true)
  expect(sheet.props.title).toBe('Ajukan buka kunci')

  // Esc menutup sheet.
  sheet.props.onOpenChange(false)
  view = render(() => UnlockCard({}))
  sheet = renderUnlockSheet()
  expect(sheet.props.open).toBe(false)

  // Buka ulang: Batal mendahului tombol kirim (primer) di urutan tab.
  findButton(view, 'Ajukan buka kunci')[0].props.onClick()
  sheet = renderUnlockSheet()
  const footer = nodes(sheet.props.footer, (n) => n.type === Button)
  expect(footer.map((b) => b.props.children)).toEqual(['Batal', 'Ajukan buka kunci'])
  expect(footer[1].props.variant).toBe('primary')

  // Kirim tanpa memilih laporan → galat, tidak ada POST.
  footer[1].props.onClick()
  await flush()
  expect(h.send.mock.calls.filter((c: any[]) => c[1] === 'POST')).toHaveLength(0)

  // Pilih laporan + alasan ≥10 karakter → POST terkirim.
  nodes(sheet, (n) => n.props?.id === 'ul-target')[0].props.onChange({ target: { value: 'r9' } })
  nodes(sheet, (n) => n.props?.id === 'ul-reason')[0].props.onChange({ target: { value: 'Bukti foto tertukar proyek lain' } })
  sheet = renderUnlockSheet()
  nodes(sheet.props.footer, (n) => n.type === Button)[1].props.onClick()
  await flush()
  const post = h.send.mock.calls.filter((c: any[]) => c[1] === 'POST') as any[][]
  expect(post).toHaveLength(1)
  expect(post[0][0]).toBe('/api/unlock-requests')
  expect(post[0][2]).toMatchObject({ targetType: 'DAILY_REPORT', targetId: 'r9', reason: 'Bukti foto tertukar proyek lain' })
  // Setelah terkirim, sheet tertutup kembali.
  sheet = renderUnlockSheet()
  expect(nodes(sheet, (n) => n.type === Sheet && n.props.title === 'Ajukan buka kunci' && n.props.open)).toHaveLength(0)
  expect(sheet.props.open).toBe(false)
})
