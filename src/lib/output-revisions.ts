import 'server-only'

import { db } from '@/lib/db'

/**
 * Riwayat catatan revisi output [F1-D, migrasi 0019 → tabel OutputRevision].
 *
 * Setiap "Minta revisi" menambah satu baris. `Output.revisionNote` tetap berisi
 * catatan yang berlaku. Mengurungkan permintaan revisi menandai barisnya
 * `undoneAt` lalu memulihkan catatan putaran sebelumnya (bukan mengosongkannya),
 * sehingga output yang sudah pernah direvisi tetap kembali ke "Perlu revisi"
 * dengan catatan lama bila PIC membatalkan kirim.
 *
 * Bila tabel belum dimigrasi, pencatatan gagal tanpa menggagalkan keputusan,
 * dan pengurungan kembali ke perilaku lama (catatan dikosongkan).
 */

export async function recordRevision(outputId: string, note: string, reviewerId: string, at = new Date()) {
  try {
    await db.outputRevision.create({ data: { outputId, note, reviewerId, createdAt: at } })
  } catch (err) {
    console.error('[output-revisions] riwayat revisi tidak tersimpan:', err instanceof Error ? err.message : err)
  }
}

/**
 * Mengurungkan permintaan revisi terakhir: tandai barisnya diurungkan dan
 * kembalikan catatan putaran sebelumnya (null bila tidak ada).
 */
export async function undoLatestRevision(outputId: string, reviewerId: string): Promise<string | null> {
  try {
    const active = await db.outputRevision.findMany({
      where: { outputId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true, note: true, reviewerId: true },
    })
    const [latest, previous] = active
    if (latest && latest.reviewerId === reviewerId) {
      await db.outputRevision.update({ where: { id: latest.id }, data: { undoneAt: new Date() } })
      return previous?.note ?? null
    }
    // Baris terakhir bukan milik peninjau ini (data lama): pakai yang terakhir berlaku.
    return latest?.note ?? null
  } catch (err) {
    console.error('[output-revisions] riwayat revisi tidak terbaca:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Riwayat catatan revisi yang berlaku, lama → baru. */
export async function revisionHistory(outputId: string) {
  try {
    return await db.outputRevision.findMany({
      where: { outputId, undoneAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, note: true, reviewerId: true, createdAt: true },
      take: 50,
    })
  } catch {
    return []
  }
}
