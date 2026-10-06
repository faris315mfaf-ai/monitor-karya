import { NextRequest, NextResponse } from 'next/server'
import { isGlobalRole, refuseUnscoped, requireApiUser, scopeEntityIds } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { serverError } from '@/lib/api-error'
import { COMPLIANCE_ROLES, loadCompliance, resolveEntityScope } from '@/lib/admin-compliance-server'

/**
 * Kepatuhan laporan per divisi untuk Admin PT [F2-ADMIN] (04-admin-pt.md §4–5,
 * Sheet divisi): orang yang wajib lapor, yang belum lapor beserta pengingat
 * hari ini, peta panas 10 hari kerja per divisi, status mingguan
 * Masuk/Terlambat/Belum masuk, dan kontak kepala divisi.
 *
 *   GET ?entityId= — Admin PT / Direktur entitas: PT-nya; peran grup: seluruh
 *                    grup atau PT pilihan.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!COMPLIANCE_ROLES.has(user.role) && !isGlobalRole(user.role)) {
    return NextResponse.json({ error: 'Peran Anda tidak membuka kepatuhan laporan' }, { status: 403 })
  }
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped
  try {
    const requested = (req.nextUrl.searchParams.get('entityId') || '').slice(0, 64) || null
    const entityIds = await resolveEntityScope(await scopeEntityIds(user), requested)
    if (entityIds === 'NOT_FOUND') return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
    // Pengingat bekerja per PT pemilik akun (src/lib/reminders-pic.ts), jadi
    // tombolnya hanya untuk akun yang terikat pada satu PT.
    const canRemind = !!user.scopeEntityId && (can(user.role, 'notify:remind') || can(user.role, 'daily:forward'))
    return NextResponse.json(await loadCompliance(entityIds, { canRemind }))
  } catch (err) {
    return serverError(err, 'Kepatuhan laporan belum termuat. Coba lagi.', 'admin/compliance GET')
  }
}
