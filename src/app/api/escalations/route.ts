import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { ageDays } from '@/lib/wib'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error' // [F3-D]
import { intParam, MAX_PAGE } from '@/app/api/_paging'
import { guardProjectAccess, performerDivisionScope, performerProjectScope, READ_RELATIONS } from '@/lib/pic-access'
import { escalationPerms } from '@/lib/escalation-perms'

/** [B3] Batas pindai baris saat saringan lewat-SLA dihitung sebelum paginasi. */
const OVERDUE_SCAN_MAX = 5000

// GET /api/escalations - list escalations with filters
//
// Query: page, pageSize (≤200), status, needed, entityId, overdue=true|false,
// projectId. [B3] Tiap item membawa `perms {mayReview, mayDecide, mayClose}`
// untuk akun ini (src/lib/escalation-perms.ts, sumber yang sama dengan layar
// web) agar klien (Android) tidak menebak izin tombol. `projectId` menyaring
// eskalasi yang bersumber dari laporan harian atau task proyek itu; akses
// proyek dicek guardProjectAccess (404/403) dan irisan peran pelaksana tetap
// berlaku.
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = intParam(sp.get('page'), 1, 1, MAX_PAGE)
    const pageSize = intParam(sp.get('pageSize'), 50, 1, 200)
    // [T11, R-4] Parameter teks dipangkas agar tidak jadi beban kueri.
    const status = sp.get('status')?.slice(0, 32) || undefined
    const needed = sp.get('needed')?.slice(0, 32) || undefined
    const entityId = sp.get('entityId')?.slice(0, 64) || undefined
    const projectId = sp.get('projectId')?.slice(0, 64) || undefined
    const overdueStr = sp.get('overdue')
    const overdueFilter = overdueStr === 'true' ? true : overdueStr === 'false' ? false : null

    // [B3] Saringan per proyek: cek hubungan akun dengan proyek lebih dulu
    // (404 proyek tidak ada, 403 di luar tanggung jawab — PIC proyek lain,
    // kepala divisi lain, Admin/Direktur PT lain).
    let projectWhere: Prisma.EscalationWhereInput | null = null
    if (projectId) {
      const guard = await guardProjectAccess(user, projectId, READ_RELATIONS)
      if (!guard.ok) return guard.res
      const [reports, tasks] = await Promise.all([
        db.dailyProjectReport.findMany({ where: { projectId }, select: { id: true } }),
        db.task.findMany({ where: { projectId }, select: { id: true, escalationId: true } }),
      ])
      projectWhere = {
        OR: [
          { sourceType: 'DAILY_REPORT', sourceId: { in: reports.map((r) => r.id) } },
          { sourceType: 'TASK', sourceId: { in: tasks.map((t) => t.id) } },
          { id: { in: tasks.map((t) => t.escalationId).filter((x): x is string => Boolean(x)) } },
        ],
      }
    }

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    // [T10-FIX2, T-1] Peran pelaksana hanya melihat eskalasi dari cakupannya:
    // laporan harian/task proyeknya (PIC) atau proyek divisinya (kepala divisi),
    // plus butir mingguan divisinya — bukan seluruh PT. Eskalasi hanya menyimpan
    // sumber (sourceType/sourceId), jadi id sumber dalam cakupan dikumpulkan
    // dulu agar saringan tetap bekerja di tingkat kueri (paginasi/total benar).
    const projectScope = await performerProjectScope(user)
    let performerWhere: Prisma.EscalationWhereInput | null = null
    if (projectScope) {
      const divisionScope = await performerDivisionScope(user)
      const [reportIds, itemIds, taskEscalationIds] = await Promise.all([
        db.dailyProjectReport.findMany({ where: { project: projectScope }, select: { id: true } }),
        db.weeklyReportItem.findMany({
          where: { weeklyReport: { division: divisionScope ?? { id: '__none__' } } },
          select: { id: true },
        }),
        db.task.findMany({ where: { project: projectScope, escalationId: { not: null } }, select: { escalationId: true } }),
      ])
      performerWhere = {
        OR: [
          { sourceType: 'DAILY_REPORT', sourceId: { in: reportIds.map((r) => r.id) } },
          { sourceType: 'WEEKLY_ITEM', sourceId: { in: itemIds.map((i) => i.id) } },
          { id: { in: taskEscalationIds.map((t) => t.escalationId).filter((x): x is string => Boolean(x)) } },
        ],
      }
    }

    const where: Prisma.EscalationWhereInput = {
      ...(status ? { status } : {}),
      ...(needed ? { needed } : {}),
      ...(entityId ? { entityId } : {}),
      ...(scopeIds || performerWhere || projectWhere
        ? {
            AND: [
              ...(scopeIds ? [{ entityId: { in: scopeIds } }] : []),
              ...(performerWhere ? [performerWhere] : []),
              ...(projectWhere ? [projectWhere] : []),
            ],
          }
        : {}),
    }

    const include = {
      entity: { select: { id: true, name: true, code: true, region: true } },
      raisedBy: { select: { id: true, name: true, email: true } },
      decidedBy: { select: { id: true, name: true, email: true } },
    } as const
    const orderBy = [{ raisedAt: 'desc' as const }, { id: 'desc' as const }]
    const skip = (page - 1) * pageSize

    let rows: Prisma.EscalationGetPayload<{ include: typeof include }>[]
    let total: number
    if (overdueFilter === null) {
      ;[rows, total] = await Promise.all([
        db.escalation.findMany({ where, skip, take: pageSize, orderBy, include }),
        db.escalation.count({ where }),
      ])
    } else {
      // [B3] Lewat SLA bergantung pada slaDays per baris (umur hari WIB), jadi
      // tidak bisa dinyatakan di kueri. Dulu saringan diterapkan sesudah
      // paginasi: halaman bisa kosong padahal ada yang lewat SLA, dan `total`
      // tetap hitungan tanpa saringan. Kini id yang cocok dipilih dulu (kolom
      // ringan), lalu halaman diambil — total dan paginasi benar.
      const light = await db.escalation.findMany({
        where,
        orderBy,
        take: OVERDUE_SCAN_MAX,
        select: { id: true, raisedAt: true, slaDays: true },
      })
      const ids = light.filter((e) => ageDays(e.raisedAt) > e.slaDays === overdueFilter).map((e) => e.id)
      total = ids.length
      const pageIds = ids.slice(skip, skip + pageSize)
      rows = pageIds.length
        ? await db.escalation.findMany({ where: { id: { in: pageIds } }, orderBy, include })
        : []
    }

    const items = rows.map((e) => {
      const ad = ageDays(e.raisedAt)
      return {
        ...e,
        ageDays: ad,
        isOverdue: ad > e.slaDays,
        perms: escalationPerms(user, e),
      }
    })

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Eskalasi belum termuat. Coba lagi.', 'escalations GET')
  }
}
