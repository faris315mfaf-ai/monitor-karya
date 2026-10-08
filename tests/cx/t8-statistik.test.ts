import { describe, expect, it } from 'vitest'

/**
 * [T8-W3] Kunci keputusan pemilik 9 Okt 2026 tentang tab Admin PT:
 *  - 'inbox' (Penerimaan) dihapus — fungsinya diserap Meja Kerja + tombol di
 *    Ringkasan;
 *  - 'statistik' baru, tepat setelah 'work-desk', berisi kartu kepatuhan yang
 *    dipindah dari Ringkasan.
 * Otorisasi tidak melemah: hanya Admin PT yang mendapat tab Statistik, dan
 * tab Penerimaan tidak lagi terlihat Admin PT (TI & Super Admin tetap).
 */

import { ROLE_TABS, canSeeTab, tabsForRole } from '@/lib/rbac'
import { NAV_TABS } from '@/lib/constants'

describe('T8-W3 tab Admin PT: statistik masuk, penerimaan keluar', () => {
  it('urutan tab Admin PT: statistik tepat setelah meja kerja, tanpa inbox', () => {
    expect(tabsForRole('ADMIN_PT')).toEqual(['dashboard', 'work-desk', 'statistik', 'daily-input', 'projects', 'divisions', 'escalations'])
    expect(canSeeTab('ADMIN_PT', 'inbox')).toBe(false)
    expect(canSeeTab('ADMIN_PT', 'statistik')).toBe(true)
  })

  it('hanya Admin PT yang mendapat tab statistik', () => {
    for (const [role, tabs] of Object.entries(ROLE_TABS)) {
      expect(tabs.includes('statistik'), role).toBe(role === 'ADMIN_PT')
    }
    // Tab Penerimaan tetap milik peran induk yang menerima laporan lintas PT.
    expect(canSeeTab('TI', 'inbox')).toBe(true)
    expect(canSeeTab('SUPERADMIN', 'inbox')).toBe(true)
  })

  it('label nav Statistik terdaftar dan berlabel manusiawi', () => {
    const tab = NAV_TABS.find((t) => t.id === 'statistik')
    expect(tab).toMatchObject({ label: 'Statistik', short: 'Statistik' })
  })
})
