import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence } from '@/lib/evidence-access'
import { safeEvidenceUrl } from '@/lib/security'
import { SIGNED_URL_TTL_SECONDS, signedEvidenceUrl, storageConfigured } from '@/lib/storage'
import { serverError } from '@/lib/api-error'

export const runtime = 'nodejs'

/** Batas id per permintaan (kontrak Opsi A, 15 Okt 2026). */
const MAX_SIGNED_IDS = 60

type Item = { id: string; url: string; kind: 'file' | 'link' }
/** Ukuran yang diminta: `thumb` = WebP 320px bila ada (Fase 1 PWA), `full` = berkas asli. */
type Size = 'thumb' | 'full'

/**
 * POST /api/evidence/signed — banyak URL bukti sekaligus (dashboard Superuser/
 * Manajemen memuat puluhan thumbnail; satu permintaan menggantikan N GET).
 *
 * Body `{ ids: string[], size?: 'thumb' | 'full' }` (1–60 id unik; size bawaan
 * `full`, kompatibel mundur) → `{ items: [{ id, url, kind }] }` dalam urutan
 * `ids`. `thumb` menandatangani `thumbKey` bila ada, selain itu `storageKey`
 * (bukti lama/dokumen/thumbnail gagal); tautan (`url`) tidak terpengaruh. Aturan baca sama dengan GET /api/evidence/:id
 * (`canReadEvidence`), tetapi id yang tidak ada, ditolak, tautannya tidak aman,
 * atau gagal ditandatangani DILEWATI tanpa alasan — supaya keberadaan bukti di
 * luar cakupan tidak bocor dan satu kegagalan tidak menggagalkan sisanya.
 * Penyimpanan belum aktif sementara ada berkas yang boleh dibaca → 503.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const ids = parseIds((body as Record<string, unknown>).ids)
  if (!ids) {
    return NextResponse.json(
      { error: `Daftar bukti harus berisi 1–${MAX_SIGNED_IDS} id yang berbeda` },
      { status: 422 }
    )
  }
  const size = parseSize((body as Record<string, unknown>).size)
  if (!size) {
    return NextResponse.json({ error: "Ukuran bukti harus 'thumb' atau 'full'" }, { status: 422 })
  }

  try {
    const rows = await db.evidence.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetType: true, targetId: true, storageKey: true, thumbKey: true, url: true },
    })

    // Satu pemeriksaan akses per induk (banyak bukti biasanya berbagi laporan).
    const targets = new Map<string, { targetType: string; targetId: string }>()
    for (const r of rows) targets.set(`${r.targetType}:${r.targetId}`, { targetType: r.targetType, targetId: r.targetId })
    const allowed = new Set<string>()
    await Promise.all(
      Array.from(targets.entries()).map(async ([key, t]) => {
        const guard = await canReadEvidence(user, t.targetType, t.targetId)
        if (guard.ok) allowed.add(key)
      })
    )
    const readable = new Map(
      rows.filter((r) => allowed.has(`${r.targetType}:${r.targetId}`)).map((r) => [r.id, r])
    )

    const hasFile = Array.from(readable.values()).some((r) => !r.url)
    if (hasFile && !storageConfigured()) {
      return NextResponse.json(
        { error: 'Penyimpanan berkas belum aktif di server ini', needsConfig: true },
        { status: 503 }
      )
    }

    const resolved = await Promise.all(
      ids.map(async (id): Promise<Item | null> => {
        const r = readable.get(id)
        if (!r) return null
        if (r.url) {
          // [T12] Baris warisan bisa memuat skema berbahaya atau kredensial tertanam.
          const safe = safeEvidenceUrl(r.url)
          return safe ? { id, url: safe, kind: 'link' } : null
        }
        // Thumbnail yang gagal ditandatangani (mis. objeknya hilang di Supabase)
        // jatuh ke berkas asli, supaya kotak kecil tetap menampilkan foto.
        const keys = size === 'thumb' && r.thumbKey ? [r.thumbKey, r.storageKey] : [r.storageKey]
        for (const key of keys) {
          try {
            return { id, url: await signedEvidenceUrl(key), kind: 'file' }
          } catch (err) {
            console.error('[evidence/signed] gagal menandatangani', id, key === r.storageKey ? 'asli' : 'thumb', err)
          }
        }
        return null
      })
    )
    const items = resolved.filter((x): x is Item => x !== null)
    return NextResponse.json({ items, expiresInSeconds: SIGNED_URL_TTL_SECONDS })
  } catch (err) {
    return serverError(err, 'Bukti belum termuat. Coba lagi.', 'evidence/signed POST')
  }
}

/** `size` tidak diisi → full; selain 'thumb'/'full' → null (422). */
function parseSize(raw: unknown): Size | null {
  if (raw === undefined || raw === null) return 'full'
  return raw === 'thumb' || raw === 'full' ? raw : null
}

/** 1–60 string tak kosong yang berbeda (≤128 karakter), atau null. */
function parseIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SIGNED_IDS) return null
  if (!raw.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 128)) return null
  const ids = raw as string[]
  return new Set(ids).size === ids.length ? ids : null
}
