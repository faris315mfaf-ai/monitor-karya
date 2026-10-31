import { describe, expect, it } from 'vitest'
import { pdfText } from './pdf-helpers'
import { Flow, PdfDocument, pdfSafe, textWidth, wrapText } from '@/lib/pdf/writer'

describe('pdfSafe / textWidth / wrapText', () => {
  it('mengubah karakter di luar WinAnsi menjadi ? dan menjaga yang valid', () => {
    expect(pdfSafe('Rapat – “siap” é')).toBe('Rapat \x96 \x93siap\x94 \xe9')
    expect(pdfSafe('emoji 😀')).toBe('emoji ?')
    expect(pdfSafe(pdfSafe('“a”'))).toBe(pdfSafe('“a”'))
  })

  it('menghitung lebar Helvetica (spasi 278, A 667 per 1000 em)', () => {
    expect(textWidth('A', 10)).toBeCloseTo(6.67, 2)
    expect(textWidth(' ', 10)).toBeCloseTo(2.78, 2)
    expect(textWidth('A', 10, true)).toBeCloseTo(7.22, 2)
  })

  it('membungkus kata, memotong kata terlalu panjang, dan menjaga baris kosong', () => {
    const lines = wrapText('satu dua tiga empat lima enam tujuh', 60, 10)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(60)
    expect(lines.join(' ')).toBe('satu dua tiga empat lima enam tujuh')
    const long = wrapText('x'.repeat(200), 50, 10)
    expect(long.length).toBeGreaterThan(1)
    expect(long.join('')).toBe('x'.repeat(200))
    expect(wrapText('a\n\nb', 100, 10)).toEqual(['a', '', 'b'])
  })
})

describe('PdfDocument', () => {
  it('menghasilkan PDF valid: kepala, xref menunjuk objek yang benar, jumlah halaman', () => {
    const doc = new PdfDocument()
    const flow = new Flow(doc, { footer: 'kaki' })
    for (let i = 0; i < 120; i++) flow.paragraph(`Baris nomor ${i} dengan sedikit teks tambahan supaya panjang`, { size: 10 })
    flow.finish()
    const pdf = doc.build({ title: 'Uji “judul” é' })
    const s = pdf.toString('latin1')
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(doc.pages.length).toBeGreaterThan(1)
    expect(s).toContain(`/Count ${doc.pages.length}`)

    const start = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(start, start + 4)).toBe('xref')
    const entries = s.slice(start).split('\n').filter((l) => /^\d{10} 00000 n $/.test(l))
    expect(entries.length).toBeGreaterThan(5)
    entries.forEach((line, i) => {
      const off = Number(line.slice(0, 10))
      expect(s.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`))
    })
    const text = pdfText(pdf)
    expect(text).toContain('Baris nomor 0')
    expect(text).toContain('Baris nomor 119')
    expect(text).toContain(`Hal. 1 / ${doc.pages.length}`)
  })

  it('menyisipkan gambar JPEG sebagai XObject dan tanda air di tiap halaman', () => {
    const doc = new PdfDocument()
    const flow = new Flow(doc, { footer: 'kaki', watermark: 'DRAF' })
    const idx = doc.addJpeg({ jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), width: 4, height: 3 })
    flow.imageGrid([{ index: idx, width: 4, height: 3 }])
    flow.newPage()
    flow.finish()
    const pdf = doc.build({ title: 'x' })
    const s = pdf.toString('latin1')
    expect(s).toContain('/Subtype /Image')
    expect(s).toContain('/Filter /DCTDecode')
    expect(s).toContain('/XObject << /Im0 6 0 R >>')
    expect(pdfText(pdf).match(/DRAF/g)?.length).toBe(2)
  })
})
