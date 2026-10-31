import 'server-only'

import sharp from 'sharp'
import { db } from '@/lib/db'
import { formatFileSize } from '@/lib/format'
import { safeEvidenceUrl } from '@/lib/security'
import { signedEvidenceUrl, storageConfigured } from '@/lib/storage'
import { Flow, PAGE_W, PdfDocument, PdfPage, textWidth, type PdfImage } from '@/lib/pdf/writer'
import type { ShReport } from '@/lib/subholding/report'

/**
 * Menyusun PDF laporan subholding dari ShReport[] (GET /api/sh/pdf).
 * Foto bukti diambil dari storage lewat URL bertanda tangan, dikecilkan dan
 * dijadikan JPEG; berkas lain dan tautan hanya dicantumkan namanya.
 */

const MAX_PHOTOS = 30
const PHOTO_EDGE = 1200
const PHOTO_QUALITY = 72
const FETCH_TIMEOUT_MS = 8000
const FETCH_CONCURRENCY = 4
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])

const RED = '#d11a2a'
const INK = '#1d1d1f'
const INK2 = '#6e6e73'

const STATUS_LABEL: Record<string, string> = {
  MENUNGGU: 'Menunggu tinjauan',
  PERLU_PERBAIKAN: 'Perlu perbaikan',
  DISETUJUI: 'Disetujui',
}

const ROLE_LABEL: Record<string, string> = {
  SUPERVISOR: 'Supervisor',
  SUPERADMIN: 'Super Admin',
  ADMIN_SUBHOLDING: 'Admin subholding',
  SUPERUSER: 'Superuser',
  MANAJEMEN: 'Manajemen',
}

const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })

/** 'YYYY-MM-DD' → "Jumat, 30 Oktober 2026". */
export function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateFmt.format(new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)))
}

/** ISO → "30 Okt 2026, 15.42 WIB". */
export function stamp(iso: string): string {
  const d = new Date(iso)
  return `${dayFmt.format(d)}, ${timeFmt.format(d).replace(':', '.')} WIB`
}

export type ShPdfInput = {
  /** Laporan yang dicetak, sudah dalam cakupan akun pembaca. */
  reports: ShReport[]
  /** Cakupan untuk judul: nama PT, nama subholding, atau kegiatan satu laporan. */
  scopeTitle: string
  /** 'YYYY-MM-DD' bila seluruh laporan satu tanggal, selain itu null. */
  dateKey: string | null
  /** Pembaca punya `shreport:review`: komentar dan sorotan ikut dicetak. */
  includeReview: boolean
  generatedAt: Date
  /** Sumber foto: id bukti → JPEG siap sisip (null = tidak tersedia). */
  photos: Map<string, PdfPhoto | null>
}

export type PdfPhoto = PdfImage

/* ---------- foto ---------- */

async function fetchPhoto(storageKey: string): Promise<PdfPhoto | null> {
  try {
    const url = await signedEvidenceUrl(storageKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_PHOTO_BYTES) return null
    const input = Buffer.from(await res.arrayBuffer())
    if (input.length > MAX_PHOTO_BYTES) return null
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: PHOTO_EDGE, height: PHOTO_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .jpeg({ quality: PHOTO_QUALITY })
      .toBuffer({ resolveWithObject: true })
    if (info.channels !== 3) return null
    return { jpeg: data, width: info.width, height: info.height }
  } catch {
    return null
  }
}

/**
 * Ambil foto bukti untuk laporan-laporan ini (maksimum MAX_PHOTOS, urut
 * laporan lalu waktu unggah). Foto yang gagal diambil bernilai null.
 */
export async function loadReportPhotos(reports: ShReport[]): Promise<Map<string, PdfPhoto | null>> {
  const out = new Map<string, PdfPhoto | null>()
  const wanted = reports
    .flatMap((r) => r.evidence)
    .filter((e) => !e.url && IMAGE_MIMES.has(e.mime))
    .slice(0, MAX_PHOTOS)
  if (!wanted.length || !storageConfigured()) return out
  const rows = await db.evidence.findMany({
    where: { id: { in: wanted.map((e) => e.id) } },
    select: { id: true, storageKey: true },
  })
  const keyOf = new Map(rows.map((r) => [r.id, r.storageKey]))
  let next = 0
  const worker = async () => {
    while (next < wanted.length) {
      const e = wanted[next++]
      const key = keyOf.get(e.id)
      out.set(e.id, key ? await fetchPhoto(key) : null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, wanted.length) }, worker))
  return out
}

/* ---------- dokumen ---------- */

function letterhead(page: PdfPage, x: number, subtitle: string): number {
  page.rect(x, 40, 26, 26, RED)
  page.text(x + 13 - textWidth('MK', 10.5, true) / 2, 58, 'MK', 10.5, { bold: true, color: '#ffffff' })
  page.text(x + 36, 52, 'Monitor Karya · PT BIKE Tbk', 11.5, { bold: true, color: INK })
  page.text(x + 36, 64, subtitle, 8.5, { color: INK2 })
  page.line(x, 76, PAGE_W - x, 76, RED, 1.4)
  return 92
}

function statusLine(r: ShReport): string {
  if (r.status === 'DISETUJUI') {
    const who = r.decidedByName ? ` oleh ${r.decidedByName}` : ''
    return `Disetujui${r.decidedAt ? ` ${stamp(r.decidedAt)}` : ''}${who}`
  }
  return STATUS_LABEL[r.status] ?? r.status
}

function fileLabel(name: string, mime: string, size: number): string {
  const kind = mime.split('/')[1]?.toUpperCase() ?? mime
  return `${name} (${kind}, ${formatFileSize(size)})`
}

function writeReport(flow: Flow, doc: PdfDocument, r: ShReport, n: number, total: number, input: ShPdfInput, showPt: boolean): void {
  flow.ensure(110)
  flow.paragraph(`Laporan ${n} dari ${total}${showPt ? ` · ${r.ptName}` : ''}`, { size: 8.5, color: INK2, after: 1 })
  flow.paragraph(r.kegiatan, { size: 12.5, bold: true, color: INK, leading: 16, after: 4 })
  flow.keyValue([
    ['Pelapor', `${r.reporterName}${r.reporterTitle ? ` · ${r.reporterTitle}` : ''}`],
    ['Diajukan', stamp(r.submittedAt)],
    ['Status', statusLine(r)],
    ...(input.includeReview && r.highlight ? ([['Sorotan', r.highlightNote ? `Ya · ${r.highlightNote}` : 'Ya, ditandai supervisor untuk manajemen']] as [string, string][]) : []),
  ])
  flow.gap(6)
  flow.paragraph('URAIAN', { size: 7.5, bold: true, color: INK2, after: 1 })
  flow.paragraph(r.deskripsi || '-', { size: 10, color: INK, leading: 14, after: 6 })

  const photos: { index: number; width: number; height: number }[] = []
  const attachments: string[] = []
  for (const e of r.evidence) {
    if (e.url) {
      const safe = safeEvidenceUrl(e.url)
      attachments.push(`Tautan: ${e.fileName}${safe ? ` · ${safe}` : ''}`)
      continue
    }
    const photo = input.photos.get(e.id)
    if (photo) photos.push({ index: doc.addJpeg(photo), width: photo.width, height: photo.height })
    else attachments.push(`Lampiran: ${fileLabel(e.fileName, e.mime, e.size)}${IMAGE_MIMES.has(e.mime) ? ' (foto tidak disertakan)' : ''}`)
  }
  if (photos.length || attachments.length) {
    flow.paragraph('BUKTI', { size: 7.5, bold: true, color: INK2, after: 2 })
    flow.imageGrid(photos)
    for (const a of attachments) flow.paragraph(a, { size: 8.5, color: INK, after: 1 })
    flow.gap(4)
  }

  if (input.includeReview && r.comments.length) {
    flow.paragraph('KOMENTAR', { size: 7.5, bold: true, color: INK2, after: 2 })
    for (const c of r.comments) {
      const role = ROLE_LABEL[c.authorRole] ?? c.authorRole
      flow.paragraph(`${c.authorName}${role ? ` (${role})` : ''} · ${stamp(c.createdAt)}${c.editedAt ? ' · disunting' : ''}`, { size: 8, color: INK2, after: 0 })
      flow.paragraph(c.body, { size: 9.5, color: INK, indent: 8, after: 4 })
    }
  }

  // Kolom tanda tangan: pelapor dan penyetuju (nama dicetak, garis untuk paraf).
  flow.ensure(64)
  flow.gap(18)
  const half = flow.contentWidth / 2
  const y = flow.y + 22
  for (const [i, [role, name]] of ([['Pelapor', r.reporterName], ['Disetujui oleh', r.decidedByName ?? '(belum disetujui)']] as [string, string][]).entries()) {
    const x = flow.marginX + i * half + 8
    flow.page.line(x, y, x + half - 24, y, '#8e8e93', 0.6)
    flow.page.text(x, y + 11, name, 8.5, { bold: true, color: INK })
    flow.page.text(x, y + 21, role, 7.5, { color: INK2 })
  }
  flow.y = y + 34
}

/** Bangun berkas PDF. */
export function buildShReportsPdf(input: ShPdfInput): Buffer {
  const { reports } = input
  const draft = reports.some((r) => r.status !== 'DISETUJUI')
  const doc = new PdfDocument()
  const title = `Laporan ${input.scopeTitle}${input.dateKey ? ` ${input.dateKey}` : ''}`
  const flow = new Flow(doc, {
    watermark: draft ? 'DRAF' : undefined,
    footer: `Dibuat otomatis oleh Monitor Karya · ${stamp(input.generatedAt.toISOString())}`,
    header: (page, no) => {
      if (no === 1) return letterhead(page, 48, `Laporan harian PT${draft ? ' · DRAF belum disetujui' : ''}`)
      page.text(48, 40, `Monitor Karya · ${input.scopeTitle}`, 8.5, { color: INK2 })
      page.line(48, 48, PAGE_W - 48, 48, '#e3e3e8', 0.6)
      return 64
    },
  })

  flow.paragraph(input.scopeTitle, { size: 18, bold: true, color: INK, leading: 22, after: 4 })
  const subholdings = [...new Set(reports.map((r) => r.subholdingName).filter(Boolean))]
  const pts = [...new Set(reports.map((r) => r.ptName).filter(Boolean))]
  flow.keyValue([
    ...(input.dateKey ? ([['Tanggal', longDate(input.dateKey)]] as [string, string][]) : []),
    ['Subholding', subholdings.join(', ') || '-'],
    ['Jumlah PT', pts.length > 1 ? `${pts.length} PT` : pts[0] ?? '-'],
    ['Jumlah laporan', `${reports.length} laporan`],
  ])
  flow.gap(8)
  flow.rule()

  // Kelompok per PT (urut nama), laporan menurut waktu setuju lalu ajuan.
  const groups = new Map<string, ShReport[]>()
  for (const r of reports) groups.set(r.ptId, [...(groups.get(r.ptId) ?? []), r])
  const ordered = [...groups.values()].sort((a, b) => a[0].ptName.localeCompare(b[0].ptName, 'id'))
  const showPt = ordered.length > 1
  for (const list of ordered) {
    if (showPt) {
      flow.ensure(50)
      flow.paragraph(`${list[0].ptName}`, { size: 14, bold: true, color: RED, leading: 18, after: 0 })
      flow.paragraph(list[0].subholdingName, { size: 8.5, color: INK2, after: 6 })
    }
    list.forEach((r, i) => {
      writeReport(flow, doc, r, i + 1, list.length, input, false)
      if (i < list.length - 1) flow.rule()
    })
    flow.gap(10)
  }
  flow.finish()
  return doc.build({ title, author: 'Monitor Karya', subject: 'Laporan subholding' })
}

/** Nama berkas aman untuk header Content-Disposition. */
export function pdfFileName(scopeTitle: string, dateKey: string | null): string {
  const base = scopeTitle
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `Laporan-${base || 'subholding'}${dateKey ? `-${dateKey}` : ''}.pdf`
}
