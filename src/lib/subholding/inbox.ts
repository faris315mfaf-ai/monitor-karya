import 'server-only'

import type { Prisma } from '@prisma/client'

/**
 * Kotak masuk Admin subholding: pesan pihak peninjau (KOMENTAR, PERBAIKAN,
 * SETUJU) di laporan subholding ini — bukan BALASAN admin sendiri.
 */
export function inboxWhere(subholdingId: string): Prisma.SubholdingReportCommentWhereInput {
  return { kind: { in: ['KOMENTAR', 'PERBAIKAN', 'SETUJU'] }, report: { subholdingId } }
}
