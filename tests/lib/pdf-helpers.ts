import { inflateSync } from 'node:zlib'

/** Seluruh teks yang digambar di PDF (isi aliran dibuka lalu heksa Tj didekode). */
export function pdfText(pdf: Buffer): string {
  const s = pdf.toString('latin1')
  const out: string[] = []
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    let body: string
    try {
      body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
    } catch {
      continue // aliran gambar (JPEG), bukan isi halaman
    }
    for (const t of body.matchAll(/<([0-9a-f]*)> Tj/g)) out.push(Buffer.from(t[1], 'hex').toString('latin1'))
  }
  return out.join('\n')
}

