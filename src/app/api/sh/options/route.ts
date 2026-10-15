import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { requireShUser } from '@/lib/subholding/http'
import { ptsOfSubholding, requireShAdmin } from '@/lib/subholding/scope'

/**
 * GET /api/sh/options (ADMIN_SUBHOLDING) — pilihan formulir laporan:
 * subholding akun, PT aktif di bawahnya, dan ≤8 pelapor terakhir yang unik.
 *
 * → { subholding: { id, name }, pts: [{ id, code, name }], reporters: [{ name, titleKind, titleField }] }
 */
export async function GET() {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const sub = await requireShAdmin(user)
  if (sub instanceof NextResponse) return sub

  try {
    const [pts, recent] = await Promise.all([
      ptsOfSubholding(sub),
      db.subholdingReport.findMany({
        where: { subholdingId: sub.id },
        select: { reporterName: true, reporterTitleKind: true, reporterTitleField: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])
    const seen = new Set<string>()
    const reporters: { name: string; titleKind: string; titleField: string }[] = []
    for (const r of recent) {
      const key = `${r.reporterName.toLowerCase()}|${r.reporterTitleKind}|${r.reporterTitleField.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      reporters.push({ name: r.reporterName, titleKind: r.reporterTitleKind, titleField: r.reporterTitleField })
      if (reporters.length >= 8) break
    }
    return NextResponse.json({ subholding: { id: sub.id, name: sub.name }, pts, reporters })
  } catch (err) {
    return serverError(err, 'Pilihan laporan belum termuat. Coba lagi.', 'sh/options GET')
  }
}
