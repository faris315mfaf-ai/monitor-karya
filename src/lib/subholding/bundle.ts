import 'server-only'

import type { Prisma } from '@prisma/client'
import { parseWibDateKey } from '@/lib/lock'
import { activeSubholdings, type ShSubholding } from '@/lib/subholding/scope'

/** Bagian server unduhan PDF Supervisor (GET /api/sh/pdf/ringkasan, /berkas). */

/** Saringan tanggal laporan untuk rentang kunci WIB yang sudah divalidasi (rangeError). */
export function periodWhere(from: string, to: string): Prisma.SubholdingReportWhereInput {
  return { reportDate: { gte: parseWibDateKey(from)!, lte: parseWibDateKey(to)! } }
}

/** Status yang ikut: disetujui, ditambah menunggu bila DRAF diminta. */
export function bundleStatuses(drafts: boolean): string[] {
  return drafts ? ['DISETUJUI', 'MENUNGGU'] : ['DISETUJUI']
}

/**
 * Subholding aktif terpilih (urut nama). `subs` null = semua. Id yang tidak
 * dikenal/nonaktif → null supaya rute menjawab 422 alih-alih diam-diam membuangnya.
 */
export async function pickSubholdings(subs: string[] | null): Promise<ShSubholding[] | null> {
  const all = await activeSubholdings()
  if (!subs) return all
  const picked = all.filter((s) => subs.includes(s.id))
  return picked.length === subs.length ? picked : null
}
