import { describe, expect, it } from 'vitest'

/**
 * Layar ponsel dashboard Manajemen & Superuser (KONTRAK-MANAJEMEN-MOBILE.md D3):
 * fisika gestur (proyeksi momentum, ambang tutup lembar/geser-kembali), label
 * tanggal, pengelompokan daftar, isi lembar pemilih, pola 7 hari, dan galeri.
 */

import {
  DECELERATION, DISMISS_RATIO, GROUP_LIMIT, REVERSE_SPEED,
  addDays, backLabel, buildGroups, cellAlpha, counterLabel, dayHeading, dayWord, highlightCards, joinNames,
  missingSentence, monoOf, progressPct, project, ptSections, ptShort, rowMeta, screenHeading, shortDay, shortRange,
  shouldDismiss, slideIndex, subSections, subShort, weekAria, weekCell, weekHighlights, weekRangeLabel, weekRows,
} from '@/components/views/sh-overview/mobile/mobile-logic'
import type { V2Data, V2Report, WeekData } from '@/components/views/sh-overview/model'

const rep = (id: string, extra: Partial<V2Report> = {}): V2Report => ({
  id, kegiatan: `Kegiatan ${id}`, deskripsi: '', evidence: [], decidedAt: '2026-10-15T03:15:00.000Z', reporterName: 'Hendra Wijaya', ...extra,
})

const DATA: V2Data = {
  date: '2026-10-15',
  subholdings: [
    {
      id: 'sigma', name: 'Sigma Internasional Indonesia', count: 4, ptCount: 2,
      pts: [
        { id: 'p1', name: 'PT LINTAS INDONESIA KATULISTIWA', reports: [rep('a1'), rep('a2'), rep('a3', { highlight: true, highlightNote: 'Perlu keputusan jalur darat.' })] },
        { id: 'p2', name: 'PT Sigma Logistik Nusantara', reports: [rep('a4')] },
      ],
      allPts: [
        { id: 'p1', name: 'PT LINTAS INDONESIA KATULISTIWA' },
        { id: 'p2', name: 'PT Sigma Logistik Nusantara' },
        { id: 'p3', name: 'PT Sigma Bahari' },
      ],
    },
    {
      id: 'sentra', name: 'Sentra Multikarya Infrastruktur', count: 1, ptCount: 1,
      pts: [{ id: 'q1', name: 'PT Sentra Beton Perkasa', reports: [rep('b1')] }],
      allPts: [{ id: 'q1', name: 'PT Sentra Beton Perkasa' }, { id: 'q2', name: 'PT Karya Jembatan Utama' }],
    },
    { id: 'tunas', name: 'Tunas Baru Group', count: 0, ptCount: 0, pts: [], allPts: [{ id: 't1', name: 'PT Tunas Agro Sejahtera' }] },
  ],
}

describe('proyeksi momentum', () => {
  it('memakai rumus (v/1000)·d/(1−d) dengan d = 0,998', () => {
    expect(DECELERATION).toBe(0.998)
    expect(project(1000)).toBeCloseTo(499, 5)
    expect(project(500)).toBeCloseTo(249.5, 5)
    expect(project(-1000)).toBeCloseTo(-499, 5)
    expect(project(0)).toBe(0)
    expect(project(1000, 0.99)).toBeCloseTo(99, 5)
  })

  it('kecepatan tidak sah → 0', () => {
    expect(project(Number.NaN)).toBe(0)
    expect(project(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('ambang tutup lembar & geser-kembali', () => {
  const H = 600

  it('seret pelan melewati separuh → tutup; kurang dari separuh → kembali', () => {
    expect(DISMISS_RATIO).toBe(0.5)
    expect(shouldDismiss(320, 0, H)).toBe(true)
    expect(shouldDismiss(280, 0, H)).toBe(false)
  })

  it('lemparan pendek tetap menutup karena titik proyeksi melewati ambang', () => {
    // 40 + project(800) ≈ 40 + 399 = 439 > 300
    expect(shouldDismiss(40, 800, H)).toBe(true)
    // 40 + project(400) ≈ 240 < 300
    expect(shouldDismiss(40, 400, H)).toBe(false)
  })

  it('jari bergerak balik dengan jelas → batal walau posisi sudah jauh', () => {
    expect(shouldDismiss(500, -(REVERSE_SPEED + 1), H)).toBe(false)
    // Gerak balik sangat pelan tidak dianggap pembatalan.
    expect(shouldDismiss(500, -50, H)).toBe(true)
  })

  it('ukuran tidak sah tidak pernah menutup', () => {
    expect(shouldDismiss(500, 2000, 0)).toBe(false)
    expect(shouldDismiss(500, 2000, Number.NaN)).toBe(false)
  })

  it('rasio bisa diatur', () => {
    expect(shouldDismiss(200, 0, H, 0.3)).toBe(true)
  })
})

describe('tanggal', () => {
  it('kepala hari dan hari pendek', () => {
    expect(dayHeading('2026-10-15')).toBe('Kamis, 15 Oktober')
    expect(shortDay('2026-10-12')).toBe('Sen 12 Okt')
    expect(dayHeading('bukan-tanggal')).toBe('')
  })

  it('geser hari melintasi bulan dan tahun', () => {
    expect(addDays('2026-10-15', -6)).toBe('2026-10-09')
    expect(addDays('2026-10-02', -6)).toBe('2026-09-26')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('rentang 7 hari panjang dan ringkas', () => {
    expect(weekRangeLabel('2026-10-09', '2026-10-15')).toBe('9–15 Oktober 2026')
    expect(weekRangeLabel('2026-09-28', '2026-10-04')).toBe('28 September – 4 Oktober 2026')
    expect(weekRangeLabel('2026-12-29', '2027-01-04')).toBe('29 Desember 2026 – 4 Januari 2027')
    expect(shortRange('2026-10-09', '2026-10-15')).toBe('9–15 Okt')
    expect(shortRange('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Okt')
  })

  it('kata hari', () => {
    expect(dayWord('today')).toBe('hari ini')
    expect(dayWord('yesterday')).toBe('kemarin')
  })
})

describe('teks', () => {
  it('nama ringkas', () => {
    expect(ptShort('PT LINTAS INDONESIA KATULISTIWA')).toBe('Lintas Indonesia Katulistiwa')
    expect(ptShort('PT. Sigma Bahari')).toBe('Sigma Bahari')
    expect(subShort('Subholding Sentra Multikarya')).toBe('Sentra')
    expect(monoOf('Sigma Internasional')).toBe('S')
  })

  it('gabung nama dan kalimat belum melapor', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A dan B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B, dan C')
    expect(missingSentence([], 'today')).toBe('')
    expect(missingSentence(['Fahreza Bumi Mega'], 'today')).toBe('Fahreza Bumi Mega belum melapor hari ini')
    expect(missingSentence(['Fahreza'], 'yesterday')).toBe('Fahreza belum melapor kemarin')
    expect(missingSentence(['A', 'B'], 'today')).toBe('A dan B belum melapor')
    expect(missingSentence(['A', 'B', 'C', 'D', 'E'], 'today')).toBe('A, B, dan 3 lainnya belum melapor')
  })

  it('persentase progres dan label kembali', () => {
    expect(progressPct(9, 25)).toBe(36)
    expect(progressPct(3, 0)).toBe(0)
    expect(progressPct(5, 4)).toBe(100)
    expect(backLabel('Ringkasan')).toBe('Ringkasan')
    expect(backLabel('Sentra Multikarya Infrastruktur')).toBe('Kembali')
    expect(backLabel('')).toBe('Kembali')
  })

  it('judul layar mengikuti penyaring', () => {
    expect(screenHeading(DATA, { sub: null, pt: null })).toBe('Ringkasan')
    expect(screenHeading(DATA, { sub: 'sentra', pt: null })).toBe('Sentra Multikarya Infrastruktur')
    expect(screenHeading(DATA, { sub: 'sigma', pt: 'p1' })).toBe('PT Lintas Indonesia Katulistiwa')
    expect(screenHeading(DATA, { sub: 'sigma', pt: 'p3' })).toBe('PT Sigma Bahari')
  })

  it('meta baris: jam WIB · PT (semua) atau · pelapor (tersaring)', () => {
    const r = { ...rep('x'), subId: 'sigma', subName: 'Sigma', ptId: 'p2', ptName: 'PT Sigma Logistik Nusantara' }
    expect(rowMeta(r, 'sub')).toBe('10.15 · Sigma Logistik Nusantara')
    expect(rowMeta(r, 'pt')).toBe('10.15 · Hendra Wijaya')
    expect(rowMeta({ ...r, decidedAt: null, reporterName: undefined }, 'one')).toBe('')
  })
})

describe('daftar berkelompok', () => {
  it('tanpa penyaring: per subholding, maks 3 baris, sorotan dulu, kosong di akhir', () => {
    const { title, level, groups } = buildGroups(DATA, { sub: null, pt: null }, 'today')
    expect(title).toBe('Semua laporan')
    expect(level).toBe('sub')
    expect(groups.map((g) => g.key)).toEqual(['sigma', 'sentra', 'tunas'])
    const sigma = groups[0]
    expect(GROUP_LIMIT).toBe(3)
    expect(sigma.rows.map((r) => r.id)).toEqual(['a3', 'a1', 'a2'])
    expect(sigma.more).toBe(1)
    expect(sigma.moreLabel).toBe('Lihat semua 4 laporan Sigma')
    expect(sigma.countLabel).toBe('4 laporan')
    expect(sigma.drill).toEqual({ sub: 'sigma', pt: null })
    expect(groups[2].rows).toEqual([])
    expect(groups[2].countLabel).toBe('')
  })

  it('subholding kosong pindah ke akhir walau urutan API di depan', () => {
    const data: V2Data = { ...DATA, subholdings: [DATA.subholdings[2], DATA.subholdings[0]] }
    expect(buildGroups(data, { sub: null, pt: null }, 'today').groups.map((g) => g.key)).toEqual(['sigma', 'tunas'])
  })

  it('subholding dipilih: per PT yang melapor (terbanyak dulu), semua baris, telusur ke PT', () => {
    const { title, level, groups } = buildGroups(DATA, { sub: 'sigma', pt: null }, 'today')
    expect(title).toBe('Laporan per PT')
    expect(level).toBe('pt')
    expect(groups.map((g) => g.key)).toEqual(['p1', 'p2'])
    expect(groups[0].rows).toHaveLength(3)
    expect(groups[0].more).toBe(0)
    expect(groups[0].drill).toEqual({ sub: 'sigma', pt: 'p1' })
    expect(groups[0].name).toBe('PT Lintas Indonesia Katulistiwa')
  })

  it('satu PT: satu kelompok tanpa telusur; judul ikut rentang', () => {
    const a = buildGroups(DATA, { sub: 'sigma', pt: 'p2' }, 'yesterday')
    expect(a.title).toBe('Laporan kemarin')
    expect(a.level).toBe('one')
    expect(a.groups).toHaveLength(1)
    expect(a.groups[0].drill).toBeNull()
    expect(a.groups[0].rows.map((r) => r.id)).toEqual(['a4'])
    const b = buildGroups(DATA, { sub: 'sigma', pt: 'p3' }, 'today')
    expect(b.groups[0].rows).toEqual([])
  })

  it('sorotan dalam cakupan penyaring dengan asal laporan', () => {
    expect(highlightCards(DATA, { sub: null, pt: null }).map((r) => [r.id, r.where])).toEqual([
      ['a3', 'Sigma Internasional Indonesia · Lintas Indonesia Katulistiwa'],
    ])
    expect(highlightCards(DATA, { sub: 'sigma', pt: null })[0].where).toBe('PT Lintas Indonesia Katulistiwa')
    expect(highlightCards(DATA, { sub: 'sentra', pt: null })).toEqual([])
    expect(highlightCards(null, { sub: null, pt: null })).toEqual([])
  })
})

describe('lembar pemilih', () => {
  it('subholding: "Semua subholding" di atas, detail PT & laporan, centang pada pilihan', () => {
    const [sec] = subSections(DATA, { sub: 'sentra', pt: null }, '')
    expect(sec.items.map((i) => i.key)).toEqual(['semua', 'sigma', 'sentra', 'tunas'])
    expect(sec.items[0].detail).toBe('5 laporan')
    expect(sec.items[1].detail).toBe('3 PT · 4 laporan')
    expect(sec.items[3]).toMatchObject({ detail: '1 PT · belum melapor', warn: true })
    expect(sec.items.filter((i) => i.selected).map((i) => i.key)).toEqual(['sentra'])
    expect(sec.items[0].mono).toBeNull()
    expect(sec.items[1].mono?.letter).toBe('S')
  })

  it('subholding: cari tanpa beda huruf besar/kecil', () => {
    const [sec] = subSections(DATA, { sub: null, pt: null }, 'TUNAS')
    expect(sec.items.map((i) => i.key)).toEqual(['tunas'])
    expect(subSections(DATA, { sub: null, pt: null }, 'zzz')[0].items).toEqual([])
  })

  it('PT: bagian Melapor (dengan Semua PT) dan Belum melapor', () => {
    const sub = DATA.subholdings[0]
    const [lapor, diam] = ptSections(sub, { sub: 'sigma', pt: null }, '', 'today')
    expect(lapor.title).toBe('Melapor hari ini · 2')
    expect(lapor.items.map((i) => i.key)).toEqual(['semua', 'p1', 'p2'])
    expect(lapor.items[0]).toMatchObject({ detail: '3 PT', selected: true })
    expect(lapor.items[1].detail).toBe('3 laporan hari ini')
    expect(diam).toMatchObject({ title: 'Belum melapor · 1', warn: true })
    expect(diam.items[0]).toMatchObject({ key: 'p3', detail: 'Belum ada laporan', warn: true, filter: { sub: 'sigma', pt: 'p3' } })
  })

  it('PT: cari mengabaikan awalan "PT" dan menyembunyikan "Semua PT" bila tak cocok', () => {
    const sub = DATA.subholdings[0]
    const [lapor, diam] = ptSections(sub, { sub: 'sigma', pt: 'p2' }, 'bahari', 'yesterday')
    expect(lapor.title).toBe('Melapor kemarin · 0')
    expect(lapor.items).toEqual([])
    expect(diam.items.map((i) => i.key)).toEqual(['p3'])
    expect(ptSections(null, { sub: null, pt: null }, '', 'today')).toEqual([])
  })
})

const WEEK: WeekData = {
  start: '2026-10-09',
  end: '2026-10-15',
  days: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'],
  subholdings: [
    { id: 'sigma', name: 'Sigma Internasional Indonesia', counts: [3, 0, 0, 4, 3, 2, 3], pts: [
      { id: 'p1', name: 'PT Lintas Indonesia Katulistiwa', counts: [2, 0, 0, 3, 2, 1, 2] },
      { id: 'p2', name: 'PT Sigma Logistik Nusantara', counts: [1, 0, 0, 1, 1, 1, 1] },
    ] },
    { id: 'fahreza', name: 'Fahreza Bumi Mega', counts: [2, 0, 0, 1, 0, 0, 0] },
  ],
  highlights: [
    { id: 'h1', date: '2026-10-15', kegiatan: 'Kapal tertunda', subholdingId: 'sigma', subholdingName: 'Sigma Internasional Indonesia', ptName: 'PT Lintas Indonesia Katulistiwa', highlightNote: 'Catatan' },
    { id: 'h2', date: '2026-10-14', kegiatan: 'Retak rambut', subholdingId: 'sentra', subholdingName: 'Sentra', ptName: 'PT Sentra Beton Perkasa', highlightNote: null },
  ],
}

describe('pola 7 hari', () => {
  it('intensitas kotak naik 0,15 per laporan dari 0,2, maks 0,85', () => {
    expect(cellAlpha(0)).toBe(0)
    expect(cellAlpha(1)).toBeCloseTo(0.35)
    expect(cellAlpha(3)).toBeCloseTo(0.65)
    expect(cellAlpha(10)).toBe(0.85)
  })

  it('kotak: terisi, akhir pekan kosong pudar, hari kerja kosong bergaris', () => {
    expect(weekCell(3, '2026-10-15')).toEqual({ kind: 'filled', count: 3, alpha: 0.65, strong: true })
    expect(weekCell(1, '2026-10-15').strong).toBe(false)
    expect(weekCell(0, '2026-10-10').kind).toBe('rest')
    expect(weekCell(0, '2026-10-14').kind).toBe('gap')
    expect(weekCell(-2, '2026-10-14').kind).toBe('gap')
  })

  it('baris: subholding tanpa penyaring, PT bila subholding dipilih', () => {
    expect(weekRows(WEEK, { sub: null, pt: null }).map((r) => r.id)).toEqual(['sigma', 'fahreza'])
    expect(weekRows(WEEK, { sub: 'sigma', pt: null }).map((r) => r.id)).toEqual(['p1', 'p2'])
    expect(weekRows(WEEK, { sub: 'sigma', pt: 'p2' }).map((r) => r.id)).toEqual(['p2'])
    // Tanpa rincian PT dari API → satu baris subholding.
    expect(weekRows(WEEK, { sub: 'fahreza', pt: null }).map((r) => r.id)).toEqual(['fahreza'])
    expect(weekRows(WEEK, { sub: 'hilang', pt: null })).toEqual([])
    expect(weekRows(null, { sub: null, pt: null })).toEqual([])
  })

  it('jumlah dirapikan sepanjang hari (kurang → 0, negatif → 0)', () => {
    const w: WeekData = { ...WEEK, subholdings: [{ id: 'x', name: 'X', counts: [1, -1] }] }
    expect(weekRows(w, { sub: null, pt: null })[0].counts).toEqual([1, 0, 0, 0, 0, 0, 0])
  })

  it('label pembaca layar menyebut total dan per hari', () => {
    expect(weekAria('Fahreza', WEEK.days, [2, 0, 0, 1, 0, 0, 0])).toBe(
      'Fahreza: 3 laporan dalam 7 hari. Jum 9 Okt 2, Sab 10 Okt 0, Min 11 Okt 0, Sen 12 Okt 1, Sel 13 Okt 0, Rab 14 Okt 0, Kam 15 Okt 0',
    )
  })

  it('sorotan 7 hari mengikuti subholding dan nama PT', () => {
    expect(weekHighlights(WEEK, { sub: null, pt: null }, null).map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(weekHighlights(WEEK, { sub: 'sigma', pt: null }, null).map((h) => h.id)).toEqual(['h1'])
    expect(weekHighlights(WEEK, { sub: 'sigma', pt: 'p1' }, 'PT LINTAS INDONESIA KATULISTIWA').map((h) => h.id)).toEqual(['h1'])
    expect(weekHighlights(WEEK, { sub: 'sigma', pt: 'p2' }, 'PT Sigma Logistik Nusantara')).toEqual([])
  })
})

describe('galeri', () => {
  it('indeks slide dari posisi gulir, dijepit ke rentang', () => {
    expect(slideIndex(0, 390, 3)).toBe(0)
    expect(slideIndex(380, 390, 3)).toBe(1)
    expect(slideIndex(5000, 390, 3)).toBe(2)
    expect(slideIndex(-20, 390, 3)).toBe(0)
    expect(slideIndex(100, 0, 3)).toBe(0)
    expect(slideIndex(100, 390, 0)).toBe(0)
  })

  it('penanda n / N', () => {
    expect(counterLabel(0, 3)).toBe('1 / 3')
    expect(counterLabel(9, 3)).toBe('3 / 3')
    expect(counterLabel(0, 0)).toBe('')
  })
})

describe('label pendek subholding yang saling berbeda', () => {
  it('menambah kata hanya untuk yang kembar', async () => {
    const { subShorts } = await import('@/components/views/sh-overview/mobile/mobile-logic')
    expect(subShorts(['Karya Agro Lestari', 'Karya Energi Nusantara', 'Sigma Internasional Indonesia'])).toEqual(['Karya Agro', 'Karya Energi', 'Sigma'])
    expect(subShorts(['SUBHOLDING CIPTA NIAGA ALKESINDO', 'SUBHOLDING TUNAS BARU GROUP'])).toEqual(['Cipta', 'Tunas'])
    expect(subShorts(['Uji 1', 'Uji 2', 'Uji'])).toEqual(['Uji 1', 'Uji 2', 'Uji'])
    expect(subShorts([])).toEqual([])
  })
})
