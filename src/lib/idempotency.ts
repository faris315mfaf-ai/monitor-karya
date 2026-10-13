import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Idempotensi tulis klien (gelombang E, 13 Okt 2026) — kontrak Android di
 * android/docs/fase3/E-IDEMPOTENSI.md.
 *
 * Outbox Android mengulang permintaan yang belum tercatat sukses; bila proses
 * mati tepat setelah server sukses, ulangannya dulu membuat entri/bukti ganda.
 * Klien kini mengirim header `Idempotency-Key`; server menyimpan respons 2xx
 * pertama per (userId, kunci) dan membalas ulangan dengan respons itu.
 *
 * - Tanpa header: perilaku lama persis (web tidak berubah, tabel tidak disentuh).
 * - Lingkup per pengguna: kunci yang sama dari pengguna lain tidak bentrok dan
 *   tidak pernah membaca respons pengguna lain.
 * - Balapan: baris kunci di-INSERT di dalam transaksi yang sama dengan
 *   tulisannya. INSERT kedua menunggu transaksi pertama (indeks unik), lalu gagal
 *   P2002 → transaksinya batal (tanpa duplikat) → respons pertama dibaca ulang.
 * - Respons non-2xx tidak disimpan: klien boleh mengulang dengan kunci sama
 *   setelah keadaan berubah (mis. buka kunci disetujui).
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'
export const IDEMPOTENCY_REPLAY_HEADER = 'Idempotency-Replayed'
export const IDEMPOTENCY_TTL_DAYS = 7
/** Batas badan respons yang disimpan (byte UTF-8 JSON). */
export const IDEMPOTENCY_MAX_BODY_BYTES = 64 * 1024

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,63}$/

type Client = Prisma.TransactionClient | typeof db

export type ParsedKey = { ok: true; key: string | null } | { ok: false; res: NextResponse }

/** Membaca header. Kosong/absen → `key: null` (perilaku lama); bentuk tidak sah → 400. */
export function readIdempotencyKey(req: NextRequest): ParsedKey {
  const raw = req.headers.get(IDEMPOTENCY_HEADER)
  if (raw === null || raw.trim() === '') return { ok: true, key: null }
  const key = raw.trim()
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `Header ${IDEMPOTENCY_HEADER} tidak sah: 8–64 karakter huruf, angka, atau - _ . : (disarankan UUID v4).` },
        { status: 400 }
      ),
    }
  }
  return { ok: true, key }
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002'
}

/**
 * Respons tersimpan untuk (userId, key), atau null bila kunci belum pernah
 * dipakai pengguna ini (atau sudah kedaluwarsa). Kunci yang sama untuk rute
 * lain → 422; baris tanpa respons (seharusnya tidak pernah ter-commit) → 409
 * sementara supaya klien mengulang.
 */
export async function findIdempotentReplay(client: Client, userId: string, key: string, route: string, now = new Date()): Promise<NextResponse | null> {
  const row = await client.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } })
  if (!row || row.userId !== userId) return null
  if (row.createdAt.getTime() < now.getTime() - IDEMPOTENCY_TTL_DAYS * 86_400_000) {
    // Kedaluwarsa tapi belum tersapu cron: buang supaya kunci bisa dipakai lagi.
    await client.idempotencyKey.deleteMany({ where: { id: row.id, createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_DAYS * 86_400_000) } } })
    return null
  }
  if (row.route !== route) {
    return NextResponse.json(
      { error: `${IDEMPOTENCY_HEADER} ini sudah dipakai untuk permintaan lain. Buat kunci baru untuk setiap aksi.` },
      { status: 422 }
    )
  }
  if (row.responseStatus === null || row.responseStatus === undefined) {
    return NextResponse.json({ error: 'Permintaan dengan kunci ini sedang diproses. Coba lagi sebentar.', locked: false }, { status: 409 })
  }
  return NextResponse.json(row.responseBody ?? { ok: true }, {
    status: row.responseStatus,
    headers: { [IDEMPOTENCY_REPLAY_HEADER]: 'true' },
  })
}

/** Badan respons yang disimpan: utuh bila ≤ 64 KiB, selain itu ringkasan + id. */
export function storableBody(body: unknown, resourceId: string | null): Prisma.InputJsonValue {
  const text = JSON.stringify(body ?? null)
  if (Buffer.byteLength(text, 'utf8') <= IDEMPOTENCY_MAX_BODY_BYTES && body !== null && body !== undefined) {
    // Dinormalisasi lewat JSON (Date → string ISO) supaya sama persis dengan yang diterima klien.
    return JSON.parse(text) as Prisma.InputJsonValue
  }
  return { ok: true, idempotentSummary: true, resourceId }
}

/** Id objek dari bentuk respons yang dikenal: { task }, { evidence }, { report }, { id }. */
export function resourceIdOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  for (const k of ['task', 'evidence', 'report']) {
    const v = b[k]
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id
  }
  return typeof b.id === 'string' ? b.id : null
}

async function bodyOf(res: NextResponse): Promise<unknown> {
  try {
    return await res.clone().json()
  } catch {
    return null
  }
}

export type StoredResponse = { status: number; body: unknown }

/** Respons yang akan disimpan, dibaca dari NextResponse JSON. */
export async function storedResponseOf(res: NextResponse): Promise<StoredResponse> {
  return { status: res.status, body: await bodyOf(res) }
}

function responseData(stored: StoredResponse) {
  const resourceId = resourceIdOf(stored.body)
  return { responseStatus: stored.status, responseBody: storableBody(stored.body, resourceId), resourceId }
}

/**
 * Mencatat kunci + respons sukses SEKALIGUS di dalam transaksi tulisannya
 * (dipakai unggah bukti, yang menulis storage di luar transaksi). Gagal P2002
 * bila kunci sudah ada (ulangan bersamaan): transaksi batal, pemanggil memakai
 * {@link findIdempotentReplay}.
 */
export async function recordIdempotentResponse(tx: Client, userId: string, key: string, route: string, stored: StoredResponse): Promise<void> {
  await tx.idempotencyKey.create({ data: { userId, key, route, ...responseData(stored) } })
}

type TxOptions = { isolationLevel?: Prisma.TransactionIsolationLevel }

/**
 * Menjalankan `run` dalam satu transaksi dengan idempotensi opsional.
 *
 * Tanpa header → `db.$transaction(run, opts)` persis seperti sebelumnya.
 * Dengan header:
 *   1. kunci sudah tercatat untuk pengguna ini → respons pertama (tanpa `run`);
 *   2. klaim kunci (INSERT) di awal transaksi — ulangan bersamaan menunggu di
 *      indeks unik sampai transaksi ini selesai;
 *   3. jalankan `run`; 2xx → respons disimpan pada baris klaim; non-2xx → klaim
 *      dihapus (tidak dicatat, klien boleh mengulang);
 *   4. klaim bentrok (P2002) → transaksi batal tanpa menulis apa pun, respons
 *      pemenang dibaca dan dikirim ulang.
 */
export async function withIdempotency(
  req: NextRequest,
  userId: string,
  route: string,
  run: (tx: Prisma.TransactionClient) => Promise<NextResponse>,
  opts: TxOptions = { isolationLevel: 'ReadCommitted' }
): Promise<NextResponse> {
  const parsed = readIdempotencyKey(req)
  if (!parsed.ok) return parsed.res
  const key = parsed.key
  if (!key) return db.$transaction(run, opts)

  const replay = await findIdempotentReplay(db, userId, key, route)
  if (replay) return replay

  const where = { userId_key: { userId, key } }
  try {
    return await db.$transaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { userId, key, route } })
      const res = await run(tx)
      if (res.status >= 200 && res.status < 300) {
        await tx.idempotencyKey.update({ where, data: responseData(await storedResponseOf(res)) })
      } else {
        await tx.idempotencyKey.delete({ where })
      }
      return res
    }, opts)
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await findIdempotentReplay(db, userId, key, route)
      if (winner) return winner
    }
    throw err
  }
}

/** Menyapu kunci yang lebih tua dari 7 hari (dipanggil cron harian). */
export async function purgeExpiredIdempotencyKeys(now = new Date(), client: Client = db): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_DAYS * 86_400_000)
  const { count } = await client.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return count
}
