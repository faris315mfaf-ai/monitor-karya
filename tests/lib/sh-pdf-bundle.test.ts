import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import {
  bundleFileName, bundleSearch, daySpan, estimateBytes, isDateKey, parseBundleQuery, periodRange, quickRange,
  rangeError, shiftDateKey, sizeLabel, type BundleQuery,
} from '@/lib/subholding/pdf-bundle'
import { buildZip } from '@/lib/zip'

/** Bagian murni unduhan PDF Supervisor (src/lib/subholding/pdf-bundle.ts) + penulis ZIP. */

const Q: BundleQuery = {
  from: '2026-11-02', to: '2026-11-09', subs: ['sh-a', 'sh-b'], drafts: true, format: 'zip', photos: false, highlights: true, comments: false,
}

describe('tanggal & periode', () => {
  it('isDateKey menolak tanggal yang tidak ada', () => {
    expect(isDateKey('2026-11-09')).toBe(true)
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('9-11-2026')).toBe(false)
    expect(isDateKey(null)).toBe(false)
  })

  it('shiftDateKey melintasi bulan & tahun; daySpan inklusif', () => {
    expect(shiftDateKey('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(daySpan('2026-11-09', '2026-11-09')).toBe(1)
    expect(daySpan('2026-11-02', '2026-11-09')).toBe(8)
    expect(daySpan('2026-11-09', '2026-11-02')).toBe(0)
  })

  it('periodRange: hari ini, kemarin, rentang', () => {
    const custom = { from: '2026-11-01', to: '2026-11-05' }
    expect(periodRange('hari', '2026-11-09', custom)).toEqual({ from: '2026-11-09', to: '2026-11-09' })
    expect(periodRange('kemarin', '2026-11-01', custom)).toEqual({ from: '2026-10-31', to: '2026-10-31' })
    expect(periodRange('rentang', '2026-11-09', custom)).toBe(custom)
  })

  it('quickRange: 7 hari, minggu ini mulai Senin, bulan ini', () => {
    // 9 Nov 2026 = Senin; 15 Nov 2026 = Minggu.
    expect(quickRange('7hari', '2026-11-09')).toEqual({ from: '2026-11-03', to: '2026-11-09' })
    expect(quickRange('minggu', '2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-09' })
    expect(quickRange('minggu', '2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(quickRange('bulan', '2026-11-09')).toEqual({ from: '2026-11-01', to: '2026-11-09' })
  })

  it('rangeError: format, urutan, maks. 31 hari', () => {
    expect(rangeError('2026-11-01', '2026-12-02')).toBe('Rentang paling lama 31 hari')
    expect(rangeError('2026-11-01', '2026-12-01')).toBeNull()
    expect(rangeError('2026-10-10', '2026-11-09')).toBeNull()
    expect(rangeError('2026-11-09', '2026-11-08')).toBe('Tanggal awal harus sebelum tanggal akhir')
    expect(rangeError('', '2026-11-08')).toBe('Tanggal harus berformat YYYY-MM-DD')
  })
})

describe('parameter kueri', () => {
  it('bundleSearch ↔ parseBundleQuery bolak-balik', () => {
    expect(parseBundleQuery(new URLSearchParams(bundleSearch(Q)), '2026-11-09')).toEqual(Q)
    const all = { ...Q, subs: null, format: 'pdf' as const }
    expect(new URLSearchParams(bundleSearch(all)).has('subs')).toBe(false)
    expect(parseBundleQuery(new URLSearchParams(bundleSearch(all)), '2026-11-09')).toEqual(all)
  })

  it('bawaan: from = hari ini, to = from, semua subholding, PDF, foto/sorotan/komentar ya, DRAF tidak', () => {
    expect(parseBundleQuery(new URLSearchParams(''), '2026-11-09')).toMatchObject({ from: '2026-11-09', to: '2026-11-09' })
    expect(parseBundleQuery(new URLSearchParams('from=2026-11-08'), '2026-11-09')).toEqual({
      from: '2026-11-08', to: '2026-11-08', subs: null, drafts: false, format: 'pdf', photos: true, highlights: true, comments: true,
    })
  })

  it('menolak masukan tidak sah', () => {
    const bad = (qs: string) => 'error' in parseBundleQuery(new URLSearchParams(qs), '2026-11-09')
    expect(bad('from=2026-11-09&format=rar')).toBe(true)
    expect(bad('from=2026-11-09&drafts=ya')).toBe(true)
    expect(bad('from=2026-11-09&subs=,,')).toBe(true)
    expect(bad(`from=2026-11-09&subs=${'x'.repeat(65)}`)).toBe(true)
    expect(bad(`from=2026-11-09&subs=${Array.from({ length: 51 }, (_, i) => `s${i}`).join(',')}`)).toBe(true)
    expect(bad('from=2026-10-01&to=2026-11-09')).toBe(true)
    expect(bad('from=bukan')).toBe(true)
    // Id ganda dirapatkan.
    expect(parseBundleQuery(new URLSearchParams('from=2026-11-09&subs=a,a,b'), '2026-11-09')).toMatchObject({ subs: ['a', 'b'] })
  })
})

describe('ukuran & nama berkas', () => {
  it('estimateBytes membatasi foto di 120; sizeLabel', () => {
    expect(estimateBytes(0, 10)).toBe(0)
    expect(estimateBytes(10, 500)).toBe(estimateBytes(10, 120))
    expect(sizeLabel(estimateBytes(1, 0))).toBe('<1 MB')
    expect(sizeLabel(estimateBytes(15, 30))).toBe('±6 MB')
  })

  it('bundleFileName: satu hari / rentang, nama aman', () => {
    expect(bundleFileName({ from: '2026-11-09', to: '2026-11-09', format: 'pdf' })).toBe('Laporan-Subholding-2026-11-09.pdf')
    expect(bundleFileName({ from: '2026-11-02', to: '2026-11-09', format: 'zip' })).toBe('Laporan-Subholding-2026-11-02_sd_2026-11-09.zip')
    expect(bundleFileName({ from: '2026-11-09', to: '2026-11-09', format: 'pdf' }, 'Karya Énergi / Nusantara')).toBe(
      'Laporan-Karya-Energi-Nusantara-2026-11-09.pdf'
    )
  })
})

describe('buildZip', () => {
  const entries = [
    { name: 'Laporan-Alfa-2026-11-09.pdf', data: Buffer.from('%PDF-alfa'), modified: new Date('2026-11-09T09:20:30Z') },
    { name: 'Laporan-Béta.pdf', data: Buffer.from('%PDF-beta isi lebih panjang') },
  ]

  it('struktur STORE: tanda tangan, CRC, ukuran, direktori pusat', () => {
    const zip = buildZip(entries)
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(zip.readUInt32LE(end)).toBe(0x06054b50)
    expect(zip.readUInt16LE(end + 10)).toBe(2)
    let p = zip.readUInt32LE(end + 16)
    for (const e of entries) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50)
      expect(zip.readUInt16LE(p + 8) & 0x0800).toBe(0x0800)
      expect(zip.readUInt32LE(p + 16)).toBe(crc32(e.data) >>> 0)
      const nameLen = zip.readUInt16LE(p + 28)
      expect(zip.subarray(p + 46, p + 46 + nameLen).toString('utf8')).toBe(e.name)
      const local = zip.readUInt32LE(p + 42)
      const localName = zip.readUInt16LE(local + 26)
      expect(zip.subarray(local + 30 + localName, local + 30 + localName + e.data.length).equals(e.data)).toBe(true)
      p += 46 + nameLen
    }
    // Jam DOS menurut WIB: 16.20.30.
    const time = zip.readUInt16LE(10)
    expect([time >> 11, (time >> 5) & 63, (time & 31) * 2]).toEqual([16, 20, 30])
  })

  it('dibaca alat unzip sistem bila tersedia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-zip-'))
    const file = join(dir, 'uji.zip')
    writeFileSync(file, buildZip(entries))
    let out: string
    try {
      out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    expect(out).toContain('No errors detected')
  })
})
