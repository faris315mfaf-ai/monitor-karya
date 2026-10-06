import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { auditScopeWhere } from '@/lib/audit-scope'
import { ALL_ROLES, can } from '@/lib/rbac'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error'
import { parseWibDateKey } from '@/lib/lock'
import { shortParam } from '@/lib/group-panel'

/**
 * GET /api/audit-logs — log aktivitas berhalaman.
 *
 * Saringan: actorId, action, targetType, role (peran pelaku), dateFrom, dateTo.
 * Tanggal boleh "YYYY-MM-DD" (hari WIB; dateTo mencakup seluruh hari itu) atau
 * ISO lengkap.
 *
 * [F2-GRUP] Saringan `role` dan tanggal WIB ditambahkan untuk Auditor;
 * galat 500 tidak lagi membawa pesan mentah. Unduhan CSV ada di
 * /api/audit-logs/export (milik [F2-ADMIN]) dengan saringan yang sama.
 */

const DAY = 86400000

type Range = { gte?: Date; lt?: Date; lte?: Date }

function parseDate(raw: string | null, end: boolean): Date | null | 'invalid' {
  if (!raw) return null
  if (raw.length > 40) return 'invalid'
  const day = parseWibDateKey(raw)
  if (day) return end ? new Date(day.getTime() + DAY) : day
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'invalid'
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? 'invalid' : d
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.min(10000, Math.max(1, parseInt(sp.get('page') || '1', 10) || 1))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10) || 50))
    const actorId = shortParam(sp.get('actorId'), 64)
    const action = shortParam(sp.get('action'), 64)
    const targetType = shortParam(sp.get('targetType'), 64)
    const roleRaw = shortParam(sp.get('role'), 32)
    const role = roleRaw && (ALL_ROLES as readonly string[]).includes(roleRaw) ? roleRaw : undefined
    if (roleRaw && !role) return NextResponse.json({ error: 'Peran tidak dikenali' }, { status: 400 })

    const from = parseDate(sp.get('dateFrom'), false)
    const to = parseDate(sp.get('dateTo'), true)
    if (from === 'invalid' || to === 'invalid') {
      return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
    }
    const at: Range = {}
    if (from) at.gte = from
    // Tanggal saja = sampai akhir hari itu (eksklusif hari berikutnya); ISO lengkap = sampai detik itu.
    if (to) {
      if (parseWibDateKey(sp.get('dateTo'))) at.lt = to
      else at.lte = to
    }
    if (from && to && from > to) return NextResponse.json({ error: 'Tanggal awal setelah tanggal akhir' }, { status: 400 })

    // Pemegang `audit:read` membaca cakupannya (src/lib/audit-scope.ts, sama
    // dengan unduhan CSV: akun dalam cakupan + pekerjaan terjadwal PT-nya).
    // Peran lain hanya jejaknya sendiri (6 Okt 2026): log memuat IP,
    // user-agent dan isi sebelum/sesudah perubahan akun orang lain.
    const scope = can(user.role, 'audit:read') ? await auditScopeWhere(user) : null
    const scopeWhere: Prisma.AuditLogWhereInput = scope ? scope.where : { actorId: user.id }

    const where: Prisma.AuditLogWhereInput = {
      AND: [
        scopeWhere,
        actorId ? { actorId } : {},
        action ? { action } : {},
        targetType ? { targetType } : {},
        role ? { actor: { role } } : {},
        Object.keys(at).length ? { at } : {},
      ],
    }

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { at: 'desc' },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      db.auditLog.count({ where }),
    ])

    const items = rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      beforeData: parseJson(r.beforeData),
      afterData: parseJson(r.afterData),
      ip: r.ip,
      userAgent: r.userAgent,
      at: r.at,
    }))

    return NextResponse.json({ items, total, page, pageSize, canExport: can(user.role, 'audit:read') })
  } catch (err) {
    return serverError(err, 'Log aktivitas belum termuat. Coba lagi.', 'audit-logs GET')
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
