import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'

/**
 * Tanda "Sudah dibaca" laporan mingguan divisi oleh pengawas (02-direktur.md).
 *
 *   POST   { weeklyReportId } — tandai sudah dibaca (idempoten).
 *   DELETE { weeklyReportId } — batalkan tanda (toast "Urungkan").
 *
 * Hanya laporan yang sudah diserahkan dan berada di cakupan entitas pemanggil.
 */

// Sama dengan READERS di ../route.ts (berkas rute tidak boleh mengekspor konstanta).
const READERS = ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN']

async function target(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!READERS.includes(user.role)) {
    return NextResponse.json({ error: 'Peran Anda tidak menandai laporan mingguan' }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.weeklyReportId === 'string' ? body.weeklyReportId : ''
  if (!id || id.length > 64) return NextResponse.json({ error: 'Laporan tidak dikenali' }, { status: 400 })

  const report = await db.weeklyDivisionReport.findUnique({
    where: { id },
    select: { id: true, entityId: true, statusHeader: true, submittedAt: true },
  })
  const scope = await scopeEntityIds(user)
  // Laporan di luar cakupan dijawab sama dengan yang tidak ada, agar keberadaannya tidak bocor.
  if (!report || (scope !== null && !scope.includes(report.entityId))) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
  }
  if (!report.submittedAt && report.statusHeader === 'DRAFT') {
    return NextResponse.json({ error: 'Laporan ini belum diserahkan' }, { status: 409 })
  }
  return { user, report, req }
}

function meta(req: NextRequest) {
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent') || null,
  }
}

export async function POST(req: NextRequest) {
  const t = await target(req)
  if (t instanceof NextResponse) return t
  try {
    const row = await db.weeklyReportRead.upsert({
      where: { weeklyReportId_userId: { weeklyReportId: t.report.id, userId: t.user.id } },
      create: { weeklyReportId: t.report.id, userId: t.user.id },
      update: {},
      select: { readAt: true },
    })
    await db.auditLog.create({
      data: { actorId: t.user.id, action: 'READ_WEEKLY_REPORT', targetType: 'WEEKLY_REPORT', targetId: t.report.id, ...meta(req) },
    })
    return NextResponse.json({ ok: true, readAt: row.readAt })
  } catch {
    return NextResponse.json({ error: 'Tanda dibaca belum tersimpan. Coba lagi.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const t = await target(req)
  if (t instanceof NextResponse) return t
  try {
    await db.weeklyReportRead.deleteMany({ where: { weeklyReportId: t.report.id, userId: t.user.id } })
    await db.auditLog.create({
      data: { actorId: t.user.id, action: 'UNREAD_WEEKLY_REPORT', targetType: 'WEEKLY_REPORT', targetId: t.report.id, ...meta(req) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Tanda dibaca belum dibatalkan. Coba lagi.' }, { status: 500 })
  }
}
