import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  auditInvarian,
  auditKontras,
  petaAksen,
  petaTema,
  rasioKontras,
  selesaikan,
} from '../../../scripts/qa/audit-warna.mjs'

/**
 * Tes untuk audit warna (T2-B3). Membaca sumber asli dari repo —
 * tanpa basis data, tanpa jaringan, tanpa render.
 */
const baca = (p: string) => readFileSync(p, 'utf8')
const cssTokens = baca('design-system/tokens.css')
const cssBundle = baca('design-system/components/bundle.css')
const core = baca('src/components/mk/core.tsx')
const data = baca('src/components/mk/data.tsx')
const layout = baca('src/components/mk/layout.tsx')

describe('rasioKontras (WCAG 2.1)', () => {
  it('hitungan cocok dengan titik acuan yang dikenal', () => {
    expect(rasioKontras('#ffffff', '#000000')).toBeCloseTo(21, 2)
    // Abu paling terang yang masih lolos AA di atas putih.
    expect(rasioKontras('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('simetris terhadap urutan warna', () => {
    expect(rasioKontras('#1d1d1f', '#ffffff')).toBeCloseTo(rasioKontras('#ffffff', '#1d1d1f'), 10)
  })

  it('menolak nilai non-hex, bukan mengarang', () => {
    expect(() => rasioKontras('rgba(255,255,255,0.72)', '#050506')).toThrow(/bukan hex/)
  })
})

describe('parsing token', () => {
  it('blok terang dan malam terpisah dengan benar (komentar CSS tidak mengganggu)', () => {
    const peta = petaTema(cssTokens)
    expect(peta.light.get('--bg')).toBe('#f5f5f7')
    expect(peta.dark.get('--bg')).toBe('#050506')
    expect(peta.light.get('--merah-fill')).toBe('#d11a2a')
    expect(peta.light.get('--ink')).toBe('#1d1d1f')
  })

  it('alias var(–x) diselesaikan sampai hex di tema terang dan malam', () => {
    const peta = petaTema(cssTokens)
    expect(selesaikan('--accent-fill', peta.light)).toMatchObject({ ok: true, hex: '#d11a2a' })
    expect(selesaikan('--accent-fill', peta.dark)).toMatchObject({ ok: true, hex: '#e0242f' })
    expect(selesaikan('--glass', peta.light).ok).toBe(false) // rgba — bukan hex statis
  })

  it('enam aksen terbaca dari bundle.css; grafit memakai on-grafit', () => {
    const aksen = petaAksen(cssBundle)
    expect([...aksen.keys()].sort()).toEqual(['biru', 'grafit', 'hijau', 'merah', 'oranye', 'ungu'])
    expect(new Map(aksen.get('grafit')).get('--on-accent')).toBe('var(--on-grafit)')
    expect(new Map(aksen.get('merah')).get('--on-accent')).toBe('#FFFFFF')
  })
})

describe('auditKontras terhadap token asli', () => {
  const hasil = auditKontras({ cssTokens, cssBundle })

  it('memeriksa 24 pasangan (2 tema × (6 netral + 6 aksen)) tanpa yang terlewat', () => {
    expect(hasil.pasangan).toHaveLength(24)
    expect(hasil.jumlahTidakTerurai).toBe(0)
  })

  it('semua pasangan lolos 4.5:1 untuk teks kecil', () => {
    expect(hasil.jumlahGagal).toBe(0)
    expect(hasil.terburuk?.rasio).toBeGreaterThanOrEqual(4.5)
  })

  it('angka cocok dengan tabel docs/design/02-warna.md', () => {
    const cari = (id: string) => hasil.pasangan.find((p) => p.id === id)?.rasio
    expect(cari('--ink di atas --bg (light)')).toBeCloseTo(15.5, 1)
    expect(cari('--ink di atas --surface (dark)')).toBeCloseTo(17.0, 1)
    expect(cari('--ink-2 di atas --bg (light)')).toBeCloseTo(4.7, 1)
    expect(cari('--ink-2 di atas --surface-2 (dark)')).toBeCloseTo(7.9, 1)
    expect(cari('--on-accent di atas --accent-fill [aksen merah] (dark)')).toBeCloseTo(4.71, 2)
    expect(cari('--on-accent di atas --accent-fill [aksen grafit] (dark)')).toBeCloseTo(13.4, 1)
  })

  it('aksen grafit di malam memakai teks gelap on-grafit di atas isian terang', () => {
    const grafit = hasil.pasangan.find((p) => p.id.includes('grafit') && p.tema === 'dark')
    expect(grafit?.nilaiTeks.toLowerCase()).toBe('#1d1d1f')
    expect(grafit?.nilaiLatar.toLowerCase()).toBe('#e5e5ea')
  })

  it('benar-benar mendeteksi kegagalan bila token sengaja dilonggarkan', () => {
    const dirusak = cssTokens.replace('--ink-2: #6e6e73;', '--ink-2: #8e8e93;')
    expect(dirusak).not.toBe(cssTokens)
    const gagal = auditKontras({ cssTokens: dirusak, cssBundle })
    expect(gagal.jumlahGagal).toBeGreaterThan(0)
    expect(gagal.pasangan.find((p) => !p.lolosTeksKecil)?.id).toContain('--ink-2 di atas --bg (light)')
  })
})

describe('invarian "warna tidak pernah sendirian"', () => {
  const hasil = auditInvarian({ core, data, layout })

  it('semua invarian lolos pada sumber saat ini', () => {
    expect(hasil.jumlahGagal).toBe(0)
    expect(hasil.daftar.map((d) => d.id)).toEqual([
      'status-badge-ikon-kata',
      'heatmap-angka-caption',
      'areachart-angka-tertulis',
      'emptynote-tersedia',
    ])
  })

  it('pemeriksa ikon+kata gagal bila ikon StatusBadge dihapus dari sumber', () => {
    const dirusak = core.replace('<Icon name={m.icon} size={sm ? 13 : 14} strokeWidth={2.4} />', '')
    expect(dirusak).not.toBe(core)
    const gagal = auditInvarian({ core: dirusak, data, layout })
    expect(gagal.daftar.find((d) => d.id === 'status-badge-ikon-kata')?.lolos).toBe(false)
  })

  it('pemeriksa heatmap gagal bila caption tabel pembaca layar dihapus', () => {
    const dirusak = data.replace("<caption>{label || 'Peta panas'}</caption>", '')
    expect(dirusak).not.toBe(data)
    const gagal = auditInvarian({ core, data: dirusak, layout })
    expect(gagal.daftar.find((d) => d.id === 'heatmap-angka-caption')?.lolos).toBe(false)
  })

  it('pemeriksa AreaChart gagal bila tip angka tertulis dihapus', () => {
    const dirusak = data.replace('{fmt(data[sel].value) + (unit ? \' \' + unit : \'\')}', "''")
    expect(dirusak).not.toBe(data)
    const gagal = auditInvarian({ core, data: dirusak, layout })
    expect(gagal.daftar.find((d) => d.id === 'areachart-angka-tertulis')?.lolos).toBe(false)
  })
})
