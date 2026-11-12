import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence } from '@/lib/evidence-access'
import { DOC_CONTENT_TYPE, evidenceDocKind, inlineDisposition } from '@/lib/evidence-doc'
import { hit, tooManyRequests } from '@/lib/security'
import { MAX_EVIDENCE_BYTES, signedEvidenceUrl, storageConfigured } from '@/lib/storage'
import { serverError } from '@/lib/api-error'

export const runtime = 'nodejs'

const FETCH_TIMEOUT_MS = 20_000
const RATE = { limit: 60, windowMs: 60_000 }

/**
 * GET /api/evidence/[id]/isi — isi dokumen bukti (PDF/.docx) untuk penampil
 * di pop-up aplikasi (13 Nov 2026).
 *
 * Berkas diambil server dari penyimpanan lalu dialirkan dari origin aplikasi
 * sendiri, supaya penampil di peramban tidak bergantung pada CORS bucket dan
 * CSP tidak perlu dilonggarkan. Akses diperiksa sama dengan GET
 * /api/evidence/:id. Hanya jenis yang punya penampil yang dilayani; jenis
 * lain (gambar, Excel, .doc) tetap memakai URL bertanda tangan.
 *
 * Content-Type ditetapkan dari jenis dokumen, bukan MIME tersimpan; respons
 * diberi CSP sandbox agar berkas yang dibuka langsung tidak bisa menjalankan
 * skrip di origin aplikasi.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  const { id } = await params
  const evidence = await db.evidence.findUnique({ where: { id } })
  if (!evidence) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })

  const guard = await canReadEvidence(user, evidence.targetType, evidence.targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const kind = evidence.url ? null : evidenceDocKind(evidence.mime, evidence.fileName)
  if (!kind) {
    return NextResponse.json({ error: 'Berkas ini tidak bisa ditampilkan di aplikasi. Unduh untuk membukanya.' }, { status: 415 })
  }
  if (evidence.size > MAX_EVIDENCE_BYTES) {
    return NextResponse.json({ error: 'Berkas terlalu besar untuk ditampilkan. Unduh untuk membukanya.' }, { status: 413 })
  }
  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Penyimpanan berkas belum aktif di server ini', needsConfig: true }, { status: 503 })
  }

  const rate = hit(`evidence-isi:${user.id}`, RATE.limit, RATE.windowMs)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak berkas dibuka. Coba lagi sebentar lagi.')

  try {
    const res = await fetch(await signedEvidenceUrl(evidence.storageKey), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Berkas belum bisa diambil. Coba lagi.' }, { status: 502 })
    }
    const declared = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: 'Berkas terlalu besar untuk ditampilkan. Unduh untuk membukanya.' }, { status: 413 })
    }
    const body = new Uint8Array(await res.arrayBuffer())
    if (body.length > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: 'Berkas terlalu besar untuk ditampilkan. Unduh untuk membukanya.' }, { status: 413 })
    }
    return new NextResponse(body, {
      headers: {
        'Content-Type': DOC_CONTENT_TYPE[kind],
        'Content-Disposition': inlineDisposition(evidence.fileName),
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    })
  } catch (err) {
    return serverError(err, 'Berkas belum bisa diambil. Coba lagi.', 'evidence isi GET', 502)
  }
}
