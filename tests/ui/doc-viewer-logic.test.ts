import { describe, expect, it } from 'vitest'
import { DOCX_MIME, docKindLabel, evidenceDocKind, inlineDisposition } from '@/lib/evidence-doc'
import { DOC_ZOOMS, docContentHref, pdfRenderScale, stepZoom, viewerKind } from '@/components/views/sh-overview/logic'

/** Penampil dokumen di pop-up (13 Nov 2026): pilihan penampil, perbesaran, skala kanvas. */

describe('evidenceDocKind', () => {
  it('MIME PDF dan .docx dikenali; MIME menang atas ekstensi', () => {
    expect(evidenceDocKind('application/pdf', 'a.pdf')).toBe('pdf')
    expect(evidenceDocKind('Application/PDF; charset=binary', 'a')).toBe('pdf')
    expect(evidenceDocKind(DOCX_MIME, 'a.docx')).toBe('docx')
    expect(evidenceDocKind('image/jpeg', 'foto.pdf')).toBeNull()
  })

  it('MIME kosong/generik jatuh ke ekstensi', () => {
    expect(evidenceDocKind('application/octet-stream', 'Rekap.PDF')).toBe('pdf')
    expect(evidenceDocKind(null, 'notulen.docx')).toBe('docx')
    expect(evidenceDocKind('', 'tanpa-ekstensi')).toBeNull()
  })

  it('Word lama, Excel, CSV, teks tidak punya penampil', () => {
    expect(evidenceDocKind('application/msword', 'lama.doc')).toBeNull()
    expect(evidenceDocKind('application/octet-stream', 'lama.doc')).toBeNull()
    expect(evidenceDocKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx')).toBeNull()
    expect(evidenceDocKind('text/csv', 'a.csv')).toBeNull()
  })

  it('label jenis', () => {
    expect(docKindLabel('pdf')).toBe('PDF')
    expect(docKindLabel('docx')).toBe('Word')
  })
})

describe('inlineDisposition', () => {
  it('nama ASCII aman (tanpa kutip/CRLF) + filename* UTF-8', () => {
    expect(inlineDisposition('Laporan "final"\r\n.pdf')).toBe(
      `inline; filename="Laporan _final___.pdf"; filename*=UTF-8''${encodeURIComponent('Laporan "final"\r\n.pdf')}`
    )
    expect(inlineDisposition('Berita acara é.docx')).toContain('filename="Berita acara _.docx"')
    expect(inlineDisposition('')).toBe(`inline; filename="berkas"; filename*=UTF-8''berkas`)
  })
})

describe('viewerKind & docContentHref', () => {
  it('tautan lama tidak pernah dibuka di penampil', () => {
    expect(viewerKind({ id: 'a', fileName: 'a.pdf', mime: 'application/pdf', kind: 'link' })).toBeNull()
    expect(viewerKind({ id: 'a', fileName: 'a.pdf', mime: 'application/pdf', kind: 'file' })).toBe('pdf')
    expect(viewerKind({ id: 'a', fileName: 'a.docx', mime: null })).toBe('docx')
  })

  it('alamat isi di-encode', () => {
    expect(docContentHref('ab/c?d')).toBe('/api/evidence/ab%2Fc%3Fd/isi')
  })
})

describe('stepZoom', () => {
  it('naik/turun satu tingkat dan dijepit di ujung', () => {
    expect(stepZoom(1, 1)).toBe(1.5)
    expect(stepZoom(1.5, 1)).toBe(2)
    expect(stepZoom(3, 1)).toBe(3)
    expect(stepZoom(1, -1)).toBe(1)
    expect(stepZoom(2, -1)).toBe(1.5)
    expect(DOC_ZOOMS[0]).toBe(1)
  })

  it('nilai di antara tingkat dibulatkan ke tingkat berikutnya', () => {
    expect(stepZoom(1.2, -1)).toBe(1)
    expect(stepZoom(1.2, 1)).toBe(2)
    expect(stepZoom(9, -1)).toBe(2)
  })
})

describe('pdfRenderScale', () => {
  it('skala CSS = lebar wadah / lebar halaman; rasio piksel dijepit 1–2', () => {
    expect(pdfRenderScale(612, 612, 792, 1)).toEqual({ css: 1, output: 1 })
    expect(pdfRenderScale(306, 612, 792, 3)).toEqual({ css: 0.5, output: 2 })
    expect(pdfRenderScale(612, 612, 792, 0)).toEqual({ css: 1, output: 1 })
  })

  it('kanvas raksasa diturunkan ke batas piksel', () => {
    const s = pdfRenderScale(3000, 612, 792, 2, 12_000_000)
    const w = 612 * s.css * s.output
    const h = 792 * s.css * s.output
    expect(w * h).toBeLessThanOrEqual(12_000_000 + 1)
    expect(s.output).toBeLessThan(2)
  })

  it('ukuran tidak sah → skala aman', () => {
    expect(pdfRenderScale(0, 612, 792, 2)).toEqual({ css: 1, output: 1 })
    expect(pdfRenderScale(500, 0, 792, 2)).toEqual({ css: 1, output: 1 })
  })
})
