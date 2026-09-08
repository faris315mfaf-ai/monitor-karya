import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { PROJECT_APPROVER_ROLES, can } from '@/lib/rbac'
import { Prisma } from '@prisma/client'

const PHASES = ['INISIASI', 'PERENCANAAN', 'PELAKSANAAN', 'PENYELESAIAN']

/** Kandidat PIC untuk dropdown pengajuan: akun PIC_PROYEK aktif di satu PT. */
async function picCandidates(entityId: string) {
  return db.user.findMany({
    where: { role: 'PIC_PROYEK', isActive: true, scopeEntityId: entityId },
    select: { id: true, name: true, email: true, projectsAsPic: { where: { lifecycle: 'AKTIF' }, select: { id: true } } },
    orderBy: { name: 'asc' },
  })
}

// GET /api/projects - paginated projects list with filters
// ?lifecycle=AKTIF (bawaan) | DIUSULKAN | DITOLAK | DITUTUP | ALL
// ?picCandidates=1 — daftar PIC untuk form pengajuan (Admin PT / TI)
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams

    if (sp.get('picCandidates') === '1') {
      if (!can(user.role, 'project:propose')) {
        return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 403 })
      }
      const entityId = user.scopeEntityId ?? sp.get('entityId') ?? ''
      if (!entityId) return NextResponse.json({ error: 'Entitas wajib dipilih' }, { status: 400 })
      const users = await picCandidates(entityId)
      return NextResponse.json({
        items: users.map((u) => ({ id: u.id, name: u.name, email: u.email, activeProjects: u.projectsAsPic.length })),
      })
    }

    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10)))
    const entityId = sp.get('entityId') || undefined
    const phase = sp.get('phase') || undefined
    const lifecycle = sp.get('lifecycle') || 'AKTIF'
    const search = sp.get('search') || undefined

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.ProjectWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(phase ? { phase } : {}),
      ...(lifecycle === 'ALL' ? {} : { lifecycle }),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' } }
        : {}),
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
    }

    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ lifecycle: 'asc' }, { code: 'asc' }],
        include: {
          entity: { select: { id: true, name: true, code: true, region: true } },
          picUser: { select: { id: true, name: true } },
          proposedBy: { select: { id: true, name: true } },
          approvals: { select: { role: true, decision: true, note: true, decidedAt: true, decidedBy: { select: { name: true } } } },
          dailyReports: {
            select: {
              status: true,
              progressPct: true,
              reportDate: true,
              isLate: true,
            },
            orderBy: { reportDate: 'desc' },
            take: 1,
          },
        },
      }),
      db.project.count({ where }),
    ])

    const formatted = items.map((p) => {
      const r = p.dailyReports[0]
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        phase: p.phase,
        lifecycle: p.lifecycle,
        picName: p.picName,
        picUserId: p.picUserId,
        description: p.description,
        proposedBy: p.proposedBy,
        proposedAt: p.proposedAt,
        // Slot tiap penyetuju selalu ada, terisi atau belum, agar UI bisa
        // menggambar tiga tanda tangan tanpa menebak.
        approvals: PROJECT_APPROVER_ROLES.map((role) => {
          const a = p.approvals.find((x) => x.role === role)
          return a
            ? { role, decision: a.decision, note: a.note, decidedAt: a.decidedAt, decidedByName: a.decidedBy?.name ?? null }
            : { role, decision: null, note: null, decidedAt: null, decidedByName: null }
        }),
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        approvedByName: p.approvedByName,
        approvedAt: p.approvedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        entity: p.entity,
        latestReport: r
          ? {
              status: r.status,
              progressPct: r.progressPct,
              reportDate: r.reportDate,
              isLate: r.isLate,
            }
          : null,
      }
    })

    return NextResponse.json({ items: formatted, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/projects — Admin PT mengajukan proyek baru (7 Sep 2026).
 *
 * Proyek lahir sebagai DIUSULKAN dan baru AKTIF setelah tiga persetujuan
 * lewat /api/projects/approve. Kodenya diturunkan dari kode PT.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'project:propose')) {
    return NextResponse.json({ error: 'Hanya Admin PT yang mengajukan proyek' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')

  // Admin PT selalu mengajukan untuk PT-nya sendiri; TI menyebutkan PT-nya.
  const entityId = user.scopeEntityId ?? str('entityId')
  const entity = entityId
    ? await db.entity.findUnique({ where: { id: entityId }, select: { id: true, code: true, type: true } })
    : null
  if (!entity || entity.type !== 'PT') {
    return NextResponse.json({ error: 'Proyek harus diajukan untuk sebuah PT' }, { status: 400 })
  }

  const name = str('name')
  const description = str('description')
  const phase = PHASES.includes(str('phase')) ? str('phase') : 'INISIASI'
  const picUserId = str('picUserId')
  const parseDate = (v: string) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const startDate = parseDate(str('startDate'))
  const targetEndDate = parseDate(str('targetEndDate'))

  const errors: string[] = []
  if (name.length < 5) errors.push('Nama proyek minimal 5 karakter.')
  if (description.length < 20) errors.push('Jelaskan proyeknya minimal 20 karakter agar penyetuju paham tujuannya.')
  if (startDate === undefined || targetEndDate === undefined) errors.push('Format tanggal tidak valid.')
  if (startDate && targetEndDate && targetEndDate <= startDate) errors.push('Target selesai harus setelah tanggal mulai.')
  let pic: { id: string; name: string } | null = null
  if (picUserId) {
    pic = await db.user.findFirst({
      where: { id: picUserId, role: 'PIC_PROYEK', isActive: true, scopeEntityId: entity.id },
      select: { id: true, name: true },
    })
    if (!pic) errors.push('PIC yang dipilih bukan PIC Proyek aktif di PT ini.')
  }
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  // Kode berurutan per PT: PT-SIGMA-PRJ-03.
  const count = await db.project.count({ where: { entityId: entity.id } })
  let code = `${entity.code}-PRJ-${String(count + 1).padStart(2, '0')}`
  for (let n = count + 2; await db.project.findUnique({ where: { code }, select: { id: true } }); n++) {
    code = `${entity.code}-PRJ-${String(n).padStart(2, '0')}`
  }

  const project = await db.project.create({
    data: {
      entityId: entity.id,
      code,
      name,
      description,
      phase,
      lifecycle: 'DIUSULKAN',
      picUserId: pic?.id ?? null,
      picName: pic?.name ?? null,
      startDate: startDate ?? null,
      targetEndDate: targetEndDate ?? null,
      proposedById: user.id,
      proposedAt: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'PROPOSE_PROJECT',
      targetType: 'PROJECT',
      targetId: project.id,
      afterData: JSON.stringify({ code, name, phase, picUserId: pic?.id ?? null }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, project: { id: project.id, code, name, lifecycle: project.lifecycle } })
}
