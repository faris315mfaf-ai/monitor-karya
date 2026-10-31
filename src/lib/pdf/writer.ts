import { deflateSync } from 'node:zlib'

/**
 * Penulis PDF minimal tanpa pustaka luar: halaman A4, teks Helvetica
 * (WinAnsi), kotak/garis berwarna, gambar JPEG, teks miring (tanda air).
 * Cukup untuk laporan teks + foto; bukan pengganti pustaka PDF umum.
 *
 * Koordinat publik memakai titik PDF dengan asal di KIRI-ATAS halaman
 * (y bertambah ke bawah); konversi ke asal kiri-bawah dilakukan di sini.
 */

export const PAGE_W = 595.28
export const PAGE_H = 841.89

/** Lebar glif Helvetica untuk karakter ASCII 32–126, per 1000 satuan em. */
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** Karakter di luar ASCII yang ada di WinAnsi (kode byte). */
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

/** Satu karakter → kode byte WinAnsi; '?' bila tidak ada padanannya. */
function winAnsiByte(ch: string): number {
  const code = ch.codePointAt(0) ?? 63
  if (code >= 32 && code <= 126) return code
  if (code < 32 || code === 127 || code === 160) return 32 // kendali (tab, baris baru) → spasi
  // 0x80–0xFF: Latin-1 (sama dengan WinAnsi di 0xA1–0xFF); 0x80–0x9F dibiarkan
  // supaya hasil pdfSafe yang sudah berisi byte WinAnsi tidak rusak bila dibersihkan lagi.
  if (code >= 0x80 && code <= 0xff) return code
  return WIN_ANSI_EXTRA[ch] ?? 63
}

/** Bersihkan teks: karakter kendali → spasi, hanya yang bisa dikodekan WinAnsi. */
export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) out += String.fromCharCode(winAnsiByte(ch))
  return out
}

function glyphWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REG)[code - 32]
  return 556
}

/** Lebar teks dalam titik. `text` harus hasil `pdfSafe`. */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0
  for (let i = 0; i < text.length; i++) w += glyphWidth(text.charCodeAt(i), bold)
  return (w * size) / 1000
}

/** Pecah teks ke baris selebar `maxWidth`; baris kosong dipertahankan, kata panjang dipotong. */
export function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = []
  for (const para of text.split(/\r?\n/)) {
    const words = pdfSafe(para).split(/ +/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let cur = ''
    const flush = () => {
      if (cur) lines.push(cur)
      cur = ''
    }
    for (const word of words) {
      let w = word
      while (textWidth(w, size, bold) > maxWidth) {
        // Kata lebih lebar dari baris: potong per karakter.
        let n = 1
        while (n < w.length && textWidth(w.slice(0, n + 1), size, bold) <= maxWidth) n++
        flush()
        lines.push(w.slice(0, n))
        w = w.slice(n)
      }
      const next = cur ? `${cur} ${w}` : w
      if (cur && textWidth(next, size, bold) > maxWidth) {
        flush()
        cur = w
      } else cur = next
    }
    flush()
  }
  return lines
}

function hex(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'latin1') : buf
  return `<${b.toString('hex')}>`
}

/** '#rrggbb' → "r g b" (0–1). */
function rgb(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color)
  if (!m) return '0 0 0'
  const n = parseInt(m[1], 16)
  const f = (v: number) => (v / 255).toFixed(3).replace(/\.?0+$/, '') || '0'
  return `${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)}`
}

const n2 = (v: number) => (Math.round(v * 100) / 100).toString()

export type PdfImage = { jpeg: Buffer; width: number; height: number }

export class PdfPage {
  readonly ops: string[] = []
  readonly images = new Set<number>()
  constructor(readonly index: number) {}

  /** Teks satu baris; (x, y) = garis dasar dari kiri-atas. `text` otomatis dibersihkan. */
  text(x: number, y: number, text: string, size: number, opts: { bold?: boolean; color?: string } = {}): void {
    const t = pdfSafe(text)
    if (!t) return
    this.ops.push(`BT /${opts.bold ? 'F2' : 'F1'} ${n2(size)} Tf ${rgb(opts.color ?? '#000000')} rg ${n2(x)} ${n2(PAGE_H - y)} Td ${hex(t)} Tj ET`)
  }

  /** Teks miring `angle` derajat berpusat di (cx, cy). */
  rotatedText(cx: number, cy: number, text: string, size: number, angle: number, opts: { bold?: boolean; color?: string } = {}): void {
    const t = pdfSafe(text)
    const w = textWidth(t, size, opts.bold)
    const a = (angle * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    // Titik awal agar tengah teks jatuh di (cx, cy).
    const x0 = cx - (w / 2) * cos + (size / 3) * sin
    const y0 = PAGE_H - cy - (w / 2) * sin - (size / 3) * cos
    this.ops.push(`BT /${opts.bold ? 'F2' : 'F1'} ${n2(size)} Tf ${rgb(opts.color ?? '#000000')} rg ${n2(cos)} ${n2(sin)} ${n2(-sin)} ${n2(cos)} ${n2(x0)} ${n2(y0)} Tm ${hex(t)} Tj ET`)
  }

  rect(x: number, y: number, w: number, h: number, fill: string): void {
    this.ops.push(`${rgb(fill)} rg ${n2(x)} ${n2(PAGE_H - y - h)} ${n2(w)} ${n2(h)} re f`)
  }

  line(x1: number, y1: number, x2: number, y2: number, color = '#cccccc', width = 0.5): void {
    this.ops.push(`${rgb(color)} RG ${n2(width)} w ${n2(x1)} ${n2(PAGE_H - y1)} m ${n2(x2)} ${n2(PAGE_H - y2)} l S`)
  }

  /** Gambar yang sudah didaftarkan lewat `PdfDocument.addJpeg`. */
  image(imageIndex: number, x: number, y: number, w: number, h: number): void {
    this.images.add(imageIndex)
    this.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(PAGE_H - y - h)} cm /Im${imageIndex} Do Q`)
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = []
  private readonly images: PdfImage[] = []

  addPage(): PdfPage {
    const page = new PdfPage(this.pages.length)
    this.pages.push(page)
    return page
  }

  addJpeg(img: PdfImage): number {
    this.images.push(img)
    return this.images.length - 1
  }

  build(info: { title: string; author?: string; subject?: string }): Buffer {
    if (!this.pages.length) this.addPage()
    const chunks: Buffer[] = []
    const offsets: number[] = []
    let length = 0
    const push = (b: Buffer | string) => {
      const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b
      chunks.push(buf)
      length += buf.length
    }
    const object = (id: number, body: Buffer | string) => {
      offsets[id] = length
      push(`${id} 0 obj\n`)
      push(body)
      push('\nendobj\n')
    }
    const stream = (dict: string, data: Buffer) => {
      const head = Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1')
      return Buffer.concat([head, data, Buffer.from('\nendstream', 'latin1')])
    }
    const utf16 = (s: string) => hex(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, 'utf16le').swap16()]))

    // Nomor objek: 1 katalog, 2 daftar halaman, 3-4 huruf, 5 info, lalu gambar, lalu pasangan halaman+isi.
    const IMG0 = 6
    const PAGE0 = IMG0 + this.images.length
    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    object(1, '<< /Type /Catalog /Pages 2 0 R >>')
    object(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${PAGE0 + i * 2} 0 R`).join(' ')}] >>`)
    object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    object(5, `<< /Title ${utf16(info.title)} ${info.author ? `/Author ${utf16(info.author)} ` : ''}${info.subject ? `/Subject ${utf16(info.subject)} ` : ''}/Producer (Monitor Karya) >>`)
    this.images.forEach((img, i) => {
      object(IMG0 + i, stream(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, img.jpeg))
    })
    this.pages.forEach((page, i) => {
      const pageId = PAGE0 + i * 2
      const xobj = [...page.images].map((k) => `/Im${k} ${IMG0 + k} 0 R`).join(' ')
      object(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ''} >> >>`
      )
      object(pageId + 1, stream('/Filter /FlateDecode', deflateSync(Buffer.from(page.ops.join('\n'), 'latin1'))))
    })

    const count = PAGE0 + this.pages.length * 2
    const xrefAt = length
    push(`xref\n0 ${count}\n0000000000 65535 f \n`)
    for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
    push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)
    return Buffer.concat(chunks)
  }
}

/* ---------- Penata letak mengalir ---------- */

export type FlowOptions = {
  marginX?: number
  marginTop?: number
  marginBottom?: number
  /** Tanda air diagonal di setiap halaman (mis. "DRAF"). */
  watermark?: string
  /** Teks kaki kiri (judul dokumen). */
  footer: string
  /** Dipanggil di awal setiap halaman, mengembalikan y awal isi. */
  header?: (page: PdfPage, pageNumber: number) => number
}

/** Penata letak atas-ke-bawah dengan pindah halaman otomatis. */
export class Flow {
  readonly doc: PdfDocument
  page!: PdfPage
  y = 0
  readonly marginX: number
  readonly marginTop: number
  readonly marginBottom: number
  readonly contentWidth: number
  private readonly opts: FlowOptions

  constructor(doc: PdfDocument, opts: FlowOptions) {
    this.doc = doc
    this.opts = opts
    this.marginX = opts.marginX ?? 48
    this.marginTop = opts.marginTop ?? 48
    this.marginBottom = opts.marginBottom ?? 56
    this.contentWidth = PAGE_W - this.marginX * 2
    this.newPage()
  }

  get bottom(): number {
    return PAGE_H - this.marginBottom
  }

  newPage(): void {
    this.page = this.doc.addPage()
    if (this.opts.watermark) {
      this.page.rotatedText(PAGE_W / 2, PAGE_H / 2, this.opts.watermark, 150, 45, { bold: true, color: '#f6dcdf' })
    }
    this.y = this.opts.header ? this.opts.header(this.page, this.doc.pages.length) : this.marginTop
  }

  /** Pastikan ada `height` titik tersisa; bila tidak, pindah halaman. */
  ensure(height: number): void {
    if (this.y + height > this.bottom) this.newPage()
  }

  gap(h: number): void {
    this.y += h
  }

  rule(color = '#e3e3e8'): void {
    this.ensure(8)
    this.page.line(this.marginX, this.y, PAGE_W - this.marginX, this.y, color, 0.6)
    this.y += 8
  }

  /** Paragraf berbungkus; boleh terpotong lintas halaman antarbaris. */
  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: string; indent?: number; leading?: number; after?: number } = {}): void {
    const size = opts.size ?? 10
    const leading = opts.leading ?? size * 1.4
    const indent = opts.indent ?? 0
    const lines = wrapText(text, this.contentWidth - indent, size, opts.bold)
    for (const line of lines) {
      this.ensure(leading)
      if (line) this.page.text(this.marginX + indent, this.y + size, line, size, opts)
      this.y += leading
    }
    this.y += opts.after ?? 0
  }

  /** Baris label + nilai (nilai berbungkus). */
  keyValue(rows: [string, string][], opts: { labelWidth?: number; size?: number } = {}): void {
    const size = opts.size ?? 9.5
    const lw = opts.labelWidth ?? 92
    const leading = size * 1.45
    for (const [k, v] of rows) {
      const lines = wrapText(v || '-', this.contentWidth - lw, size, true)
      this.ensure(leading)
      this.page.text(this.marginX, this.y + size, k, size, { color: '#6e6e73' })
      for (const line of lines) {
        this.ensure(leading)
        this.page.text(this.marginX + lw, this.y + size, line, size, { bold: true })
        this.y += leading
      }
    }
  }

  /** Kisi gambar `cols` kolom; tiap sel `cellH` tinggi, gambar dipusatkan menurut rasio. */
  imageGrid(items: { index: number; width: number; height: number }[], cols = 3, gap = 6): void {
    if (!items.length) return
    const cellW = (this.contentWidth - gap * (cols - 1)) / cols
    const cellH = cellW * 0.75
    for (let i = 0; i < items.length; i += cols) {
      this.ensure(cellH + gap)
      items.slice(i, i + cols).forEach((it, c) => {
        const scale = Math.min(cellW / it.width, cellH / it.height)
        const w = it.width * scale
        const h = it.height * scale
        const x = this.marginX + c * (cellW + gap) + (cellW - w) / 2
        this.page.rect(this.marginX + c * (cellW + gap), this.y, cellW, cellH, '#f2f2f5')
        this.page.image(it.index, x, this.y + (cellH - h) / 2, w, h)
      })
      this.y += cellH + gap
    }
  }

  /** Kaki "judul · Hal. n / N" di semua halaman; panggil sekali di akhir. */
  finish(): void {
    const total = this.doc.pages.length
    this.doc.pages.forEach((page, i) => {
      const y = PAGE_H - 30
      page.line(this.marginX, y - 10, PAGE_W - this.marginX, y - 10, '#e3e3e8', 0.6)
      page.text(this.marginX, y, this.opts.footer, 7.5, { color: '#8e8e93' })
      const label = `Hal. ${i + 1} / ${total}`
      page.text(PAGE_W - this.marginX - textWidth(label, 7.5), y, label, 7.5, { color: '#8e8e93' })
    })
  }
}
