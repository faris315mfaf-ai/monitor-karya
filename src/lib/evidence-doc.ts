/**
 * Dokumen bukti yang bisa dibaca langsung di pop-up aplikasi (13 Nov 2026):
 * PDF (pdf.js) dan Word .docx (docx-preview). Word lama (.doc), Excel, CSV,
 * dan teks tetap lewat tombol unduh — tidak ada penampil yang andal untuknya.
 *
 * Dipakai dua sisi: klien memilih penampil, server (GET /api/evidence/:id/isi)
 * hanya mengalirkan berkas berjenis ini dengan Content-Type yang ia tetapkan
 * sendiri, bukan MIME tersimpan.
 */

export type EvidenceDocKind = 'pdf' | 'docx'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const DOC_CONTENT_TYPE: Record<EvidenceDocKind, string> = {
  pdf: 'application/pdf',
  docx: DOCX_MIME,
}

function extOf(fileName: string | null | undefined): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec((fileName ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * Jenis penampil untuk satu bukti, atau null bila harus diunduh. MIME menang;
 * ekstensi hanya cadangan untuk MIME kosong/generik (application/octet-stream)
 * yang kadang dikirim peramban HP.
 */
export function evidenceDocKind(mime: string | null | undefined, fileName?: string | null): EvidenceDocKind | null {
  const m = (mime ?? '').toLowerCase().split(';')[0].trim()
  if (m === 'application/pdf') return 'pdf'
  if (m === DOCX_MIME) return 'docx'
  if (m && m !== 'application/octet-stream') return null
  const ext = extOf(fileName)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  return null
}

/** Label singkat jenis dokumen untuk teks bantu. */
export function docKindLabel(kind: EvidenceDocKind): string {
  return kind === 'pdf' ? 'PDF' : 'Word'
}

/** Header Content-Disposition inline dengan nama aman (tanpa kutip/CRLF). */
export function inlineDisposition(fileName: string): string {
  const plain = fileName.replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7e]/g, '_') || 'berkas'
  return `inline; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName || 'berkas')}`
}
