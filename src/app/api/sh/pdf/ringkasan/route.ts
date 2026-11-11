import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { wibDateKey } from '@/lib/lock'
import { can } from '@/lib/rbac'
import { bundleStatuses, periodWhere } from '@/lib/subholding/bundle'
import { requireShUser, unprocessable } from '@/lib/subholding/http'
import { IMAGE_MIMES } from '@/lib/subholding/pdf'
import { rangeError } from '@/lib/subholding/pdf-bundle'
import { SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'
import { activeSubholdings, refuseWithoutAnyCap } from '@/lib/subholding/scope'

/** Batas baris laporan yang dihitung (31 hari × puluhan laporan/hari jauh di bawahnya). */
const MAX_ROWS = 20_000

/**
 * GET /api/sh/pdf/ringkasan?from=YYYY-MM-DD&to=YYYY-MM-DD — isi dialog
 * "Unduh laporan PDF" Supervisor: jumlah laporan dan foto per subholding
 * aktif pada periode itu (`from` kosong = hari ini WIB, `to` kosong = `from`;
 * maks. 31 hari).
 * → { from, to, canDrafts, subholdings: [{ id, name, approved, pending,
 *     photosApproved, photosPending }] }
 * `pending` (MENUNGGU) dan `photosPending` hanya dihitung untuk pemegang
 * `shreport:review` (canDrafts); selain itu 0. Akses: `shreport:review` atau
 * `shreport:view-approved`.
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:review', 'shreport:view-approved'])
  if (refused) return refused

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')?.trim() || wibDateKey()
  const to = sp.get('to')?.trim() || from
  const bad = rangeError(from, to)
  if (bad) return unprocessable(bad)
  const canDrafts = can(user.role, 'shreport:review')

  try {
    const [subs, rows] = await Promise.all([
      activeSubholdings(),
      db.subholdingReport.findMany({
        where: { ...periodWhere(from, to), status: { in: bundleStatuses(canDrafts) } },
        select: { id: true, subholdingId: true, status: true },
        take: MAX_ROWS,
      }),
    ])
    const photos = rows.length
      ? await db.evidence.findMany({
          where: { targetType: SH_EVIDENCE_TARGET, targetId: { in: rows.map((r) => r.id) }, url: null, mime: { in: [...IMAGE_MIMES] } },
          select: { targetId: true },
        })
      : []
    const photosOf = new Map<string, number>()
    for (const p of photos) photosOf.set(p.targetId, (photosOf.get(p.targetId) ?? 0) + 1)

    const tally = new Map(subs.map((s) => [s.id, { approved: 0, pending: 0, photosApproved: 0, photosPending: 0 }]))
    for (const r of rows) {
      const t = tally.get(r.subholdingId)
      if (!t) continue
      const n = photosOf.get(r.id) ?? 0
      if (r.status === 'DISETUJUI') {
        t.approved += 1
        t.photosApproved += n
      } else {
        t.pending += 1
        t.photosPending += n
      }
    }
    return NextResponse.json({
      from,
      to,
      canDrafts,
      subholdings: subs.map((s) => ({ id: s.id, name: s.name, ...tally.get(s.id)! })),
    })
  } catch (err) {
    return serverError(err, 'Ringkasan laporan belum bisa dimuat. Coba lagi.', 'sh/pdf/ringkasan GET')
  }
}
