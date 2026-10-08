import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regresi log aktivitas ponsel (08-auditor.md §Ponsel, Tahap 1, commit
 * 5198411): cabang ponsel AuditView memakai ActivityItem di dalam tombol
 * mk-audit-act ber-aria-label aksi+pelaku+waktu; di luar ponsel kartu
 * AuditCardRow dan tabel lebar (xl) tetap dipakai.
 *
 * Pola account-sheet-presence.test.ts: komponen dipanggil sebagai fungsi,
 * React (useState/useMemo/useSyncExternalStore) dan useFetch dimock, pohon
 * elemen ditelusuri tanpa DOM.
 */

const h = vi.hoisted(() => ({
  phone: false,
  slots: [] as any[],
  cursor: 0,
  list: null as any,
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useMemo: (fn: () => unknown) => fn(),
  // useIsPhone: sesuaikan viewport sesuai kebutuhan tes.
  useSyncExternalStore: () => h.phone,
}))
vi.mock('@/hooks/use-fetch', () => ({
  useFetch: () => ({ data: h.list, setData: vi.fn(), loading: false, error: null, reload: vi.fn() }),
}))

import { AuditView, AUDIT_ACTION_LABELS, ActionTag } from '@/components/views/audit-view'
import { ActivityItem } from '@/components/mk'
import { initialsOf } from '@/lib/accounts'
import { formatDateTime } from '@/lib/format'

function nodes(tree: any, accept: (n: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [...(accept(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((c) => nodes(c, accept))]
}
const auditActs = (tree: any) => nodes(tree, (n) => n.type === 'button' && n.props.className === 'mk-audit-act')
const cardRows = (tree: any) => nodes(tree, (n) => typeof n.type === 'function' && n.type.name === 'AuditCardRow')
const cardOf = (tree: any, teks: string) =>
  nodes(tree, (n) => typeof n.props?.children === 'string' && n.props.children === teks).length > 0

const AT = '2026-10-08T09:30:00+07:00'
const LOG_AKTOR = {
  id: 'log-1', action: 'SUBMIT_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'rep-1',
  beforeData: null, afterData: { status: 'TERKIRIM' }, ip: '10.0.0.8', userAgent: null,
  at: AT, actorId: 'u-1', actor: { id: 'u-1', name: 'Rina Kartika', email: 'rina@contoh.invalid', role: 'PIC_PROYEK' },
}
const LOG_SISTEM = {
  id: 'log-2', action: 'CRON_DIVISION_REMINDERS', targetType: 'REMINDER_RULE', targetId: 'cron',
  beforeData: null, afterData: null, ip: null, userAgent: null,
  at: AT, actorId: null, actor: null,
}

beforeEach(() => {
  h.phone = false
  h.slots = []
  h.cursor = 0
  h.list = { items: [LOG_AKTOR, LOG_SISTEM], total: 2, page: 1, pageSize: 20, canExport: false }
})
const render = () => {
  h.cursor = 0
  return AuditView()
}

describe('AuditView di ponsel', () => {
  beforeEach(() => { h.phone = true })

  it('setiap log menjadi tombol mk-audit-act yang memuat ActivityItem', () => {
    const tree = render()
    const acts = auditActs(tree)
    expect(acts).toHaveLength(2)
    for (const act of acts) {
      expect(nodes(act, (n) => n.type === ActivityItem)).toHaveLength(1)
    }
  })

  it('aria-label memuat aksi, pelaku, dan waktu lengkap dengan pemanggil rincian', () => {
    const acts = auditActs(render())
    expect(acts[0].props['aria-label']).toBe(
      `${AUDIT_ACTION_LABELS[LOG_AKTOR.action]} oleh ${LOG_AKTOR.actor.name}, ${formatDateTime(AT)}. Buka rincian`
    )
    expect(acts[1].props['aria-label']).toBe(
      `${AUDIT_ACTION_LABELS[LOG_SISTEM.action]} oleh sistem, ${formatDateTime(AT)}. Buka rincian`
    )
  })

  it('ActivityItem membawa nama, inisial, aksi, target, dan waktu yang benar', () => {
    const acts = auditActs(render())
    const items = acts.map((a: any) => nodes(a, (n) => n.type === ActivityItem)[0])
    // Log pertama: pelaku bernama.
    expect(items[0].props.who).toBe('Rina Kartika')
    expect(items[0].props.initials).toBe(initialsOf('Rina Kartika'))
    expect(items[0].props.time).toBe(formatDateTime(AT))
    expect(items[0].props.last).toBeFalsy()
    // Lencana aksi dan label target hadir di dalam slot action.
    expect(nodes(items[0].props.action, (n) => n.type === ActionTag)).toHaveLength(1)
    expect(cardOf({ props: { children: items[0].props.action } }, 'Laporan harian')).toBe(true)
    // Log terakhir: pelaku sistem dan penanda akhir daftar.
    expect(items[1].props.who).toBe('Sistem')
    expect(items[1].props.initials).toBe('S')
    expect(items[1].props.last).toBe(true)
    expect(cardOf({ props: { children: items[1].props.action } }, 'Aturan pengingat')).toBe(true)
  })

  it('kartu AuditCardRow tidak dipakai di ponsel, tabel lebar tetap dirender tersembunyi', () => {
    const tree = render()
    expect(cardRows(tree)).toHaveLength(0)
    const wrap = nodes(tree, (n) => typeof n.type === 'string' && n.props.className?.startsWith('hidden xl:block'))
    expect(wrap).toHaveLength(1)
    expect(nodes(wrap[0], (n) => n.type === 'table')).toHaveLength(1)
  })
})

describe('AuditView di luar ponsel (tablet dan desktop)', () => {
  it('log memakai kartu AuditCardRow di wadah xl:hidden, tanpa tombol mk-audit-act', () => {
    const tree = render()
    expect(auditActs(tree)).toHaveLength(0)
    const rows = cardRows(tree)
    expect(rows).toHaveLength(2)
    expect(nodes(tree, (n) => n.props?.className === 'xl:hidden mk-list')).toHaveLength(1)
  })

  it('tabel lebar (kolom lengkap) tetap tersedia untuk layar ≥1280', () => {
    const tree = render()
    const wrap = nodes(tree, (n) => typeof n.type === 'string' && n.props.className?.startsWith('hidden xl:block'))
    expect(wrap).toHaveLength(1)
    const table = nodes(wrap[0], (n) => n.type === 'table')[0]
    expect(table).toBeDefined()
    expect(nodes(table, (n) => n.type === 'th')).toHaveLength(6)
    // Baris tabel dibuat AuditTableRow untuk setiap log.
    expect(nodes(wrap[0], (n) => typeof n.type === 'function' && n.type.name === 'AuditTableRow')).toHaveLength(2)
  })
})
