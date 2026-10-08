import { describe, expect, it } from 'vitest'
import { ROLE_CAPABILITIES } from '@/lib/rbac'
import { cronHealth, entityCompliance, groupPanelKind, isReadOnlyRole, workloadLevel } from '@/lib/group-panel'

/* [F2-GRUP] Aturan murni panel peran grup (src/lib/group-panel.ts). */

describe('isReadOnlyRole', () => {
  it('hanya Auditor yang hanya-baca di antara peran yang dikenal', () => {
    const readOnly = Object.keys(ROLE_CAPABILITIES).filter(isReadOnlyRole)
    expect(readOnly).toEqual(['AUDITOR'])
  })
  it('peran tak dikenal dianggap hanya-baca', () => {
    expect(isReadOnlyRole('PERAN_BARU')).toBe(true)
  })
})

describe('groupPanelKind', () => {
  it('memetakan peran grup ke panelnya', () => {
    expect(groupPanelKind('DIREKTUR_SDM_GA')).toBe('SDM')
    expect(groupPanelKind('TI')).toBe('TEKNIS')
    expect(groupPanelKind('SUPERADMIN')).toBe('TEKNIS')
    expect(groupPanelKind('AUDITOR')).toBe('AUDIT')
    expect(groupPanelKind('MANAJEMEN')).toBeNull()
    expect(groupPanelKind('ADMIN_PT')).toBeNull()
  })
})

describe('cronHealth', () => {
  const now = new Date('2026-10-06T10:00:00Z')
  it('belum pernah tercatat = neutral', () => {
    expect(cronHealth(null, 26, now)).toBe('neutral')
    expect(cronHealth('bukan tanggal', 26, now)).toBe('neutral')
  })
  it('dalam jendela = on, lewat jendela = late', () => {
    expect(cronHealth(new Date('2026-10-05T10:30:00Z'), 26, now)).toBe('on')
    expect(cronHealth('2026-10-05T07:00:00Z', 26, now)).toBe('late')
  })
})

describe('workloadLevel', () => {
  it('ambang beban tinggi dan berlebih', () => {
    expect(workloadLevel(2, 5)).toBe('on')
    expect(workloadLevel(4, 0)).toBe('risk')
    expect(workloadLevel(1, 10)).toBe('risk')
    expect(workloadLevel(6, 0)).toBe('late')
    expect(workloadLevel(0, 15)).toBe('late')
  })
})

describe('entityCompliance', () => {
  const base = { activeProjects: 5, onTime30: 95, total30: 100, divisions: 4, weeklyIn: 4, openEscalations: 0 }
  it('patuh bila tepat waktu ≥ 85% dan semua mingguan masuk', () => {
    expect(entityCompliance(base)).toEqual({ status: 'on', label: 'Patuh' })
  })
  it('tanpa proyek dan divisi = neutral', () => {
    expect(entityCompliance({ ...base, activeProjects: 0, divisions: 0 }).status).toBe('neutral')
  })
  it('satu mingguan belum masuk = perlu perhatian', () => {
    expect(entityCompliance({ ...base, weeklyIn: 3 })).toEqual({ status: 'risk', label: '1 mingguan belum masuk' })
  })
  it('separuh divisi belum menyerahkan = terlambat', () => {
    expect(entityCompliance({ ...base, weeklyIn: 2 }).status).toBe('late')
  })
  it('tepat waktu di bawah 70% = terlambat, di bawah 85% = perlu perhatian', () => {
    expect(entityCompliance({ ...base, onTime30: 60 })).toEqual({ status: 'late', label: 'Tepat waktu 60%' })
    expect(entityCompliance({ ...base, onTime30: 80 })).toEqual({ status: 'risk', label: 'Tepat waktu 80%' })
  })
  it('eskalasi terbuka menjadikannya perlu perhatian', () => {
    expect(entityCompliance({ ...base, openEscalations: 2 })).toEqual({ status: 'risk', label: '2 eskalasi terbuka' })
  })
})
