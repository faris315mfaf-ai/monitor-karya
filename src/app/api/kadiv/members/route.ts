import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { auditPic, readJson, str } from '@/lib/pic-access'
import { canManageDivision } from '@/lib/kadiv'
import { isMasterRole } from '@/lib/rbac'

/**
 * Keanggotaan divisi (lihat keputusan di prisma/schema.prisma [P2-B]).
 * Hanya kepala divisi itu, Admin PT di PT divisi itu, atau Super Admin/TI.
 *
 *   GET ?divisionId=                                 — anggota, calon anggota (akun aktif
 *                                                      di PT yang sama), dan proyek PT beserta divisinya
 *   PUT { divisionId, userId, member: boolean }      — tambah/keluarkan anggota (User.divisionId)
 *   PUT { divisionId, projectId, assign: boolean }   — tautkan/lepas proyek (Project.divisionId)
 *
 * Akun dan proyek harus berada di PT yang sama dengan divisinya.
 */

/** Anggota divisi = staf pelaksana (PIC proyek). Kepala divisi lewat Division.headUserId. */
const MEMBER_ROLES = ['PIC_PROYEK']

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const divisionId = req.nextUrl.searchParams.get('divisionId') || ''
  try {
    const div = divisionId ? await canManageDivision(user, divisionId) : null
    if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const divisions = await db.division.findMany({ where: { entityId: div.entityId }, select: { id: true, name: true } })
    const [people, projects] = await Promise.all([
      db.user.findMany({
        where: { scopeEntityId: div.entityId, isActive: true, role: { in: MEMBER_ROLES }, ...(div.headUserId ? { id: { not: div.headUserId } } : {}) },
        select: { id: true, name: true, title: true, role: true, divisionId: true },
        orderBy: { name: 'asc' },
      }),
      db.project.findMany({
        where: { entityId: div.entityId, lifecycle: 'AKTIF' },
        select: { id: true, code: true, name: true, divisionId: true, picUser: { select: { name: true } } },
        orderBy: { code: 'asc' },
      }),
    ])
    const divName = new Map(divisions.map((d) => [d.id, d.name]))
    return NextResponse.json({
      division: div,
      people: people.map((p) => ({ ...p, divisionName: p.divisionId ? (divName.get(p.divisionId) ?? null) : null, isMember: p.divisionId === div.id })),
      projects: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        picName: p.picUser?.name ?? null,
        divisionId: p.divisionId,
        divisionName: p.divisionId ? (divName.get(p.divisionId) ?? null) : null,
      })),
    })
  } catch (err) {
    console.error('[kadiv/members] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Anggota divisi belum termuat' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const divisionId = str(body, 'divisionId', 64)
  try {
    const div = divisionId ? await canManageDivision(user, divisionId) : null
    if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })

    // Kepala divisi tidak boleh menarik orang/proyek dari divisi lain; itu wewenang Admin PT.
    const canMove = isMasterRole(user.role) || user.role === 'ADMIN_PT'
    const MOVE_DENIED = 'Sudah tercatat di divisi lain. Minta Admin PT memindahkannya.'

    const userId = str(body, 'userId', 64)
    if (userId) {
      if (typeof body.member !== 'boolean') return NextResponse.json({ error: 'Nilai member wajib true/false' }, { status: 400 })
      const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isActive: true, scopeEntityId: true, divisionId: true, role: true } })
      if (!target || !target.isActive || target.scopeEntityId !== div.entityId || !MEMBER_ROLES.includes(target.role)) {
        return NextResponse.json({ error: 'Akun ini tidak bisa menjadi anggota divisi ini' }, { status: 422 })
      }
      if (!body.member && target.divisionId !== div.id) return NextResponse.json({ ok: true, unchanged: true })
      if (body.member && target.divisionId && target.divisionId !== div.id && !canMove) return NextResponse.json({ error: MOVE_DENIED }, { status: 409 })
      const next = body.member ? div.id : null
      await db.user.update({ where: { id: target.id }, data: { divisionId: next } })
      await auditPic(req, user, 'SET_DIVISION_MEMBER', 'USER', target.id, { name: target.name, divisionId: next, division: div.name }, { divisionId: target.divisionId })
      return NextResponse.json({ ok: true, previousDivisionId: target.divisionId })
    }

    const projectId = str(body, 'projectId', 64)
    if (projectId) {
      if (typeof body.assign !== 'boolean') return NextResponse.json({ error: 'Nilai assign wajib true/false' }, { status: 400 })
      const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, entityId: true, divisionId: true } })
      if (!project || project.entityId !== div.entityId) return NextResponse.json({ error: 'Proyek ini di luar PT divisi' }, { status: 422 })
      const before = { divisionId: project.divisionId }
      if (!body.assign && project.divisionId !== div.id) return NextResponse.json({ ok: true, unchanged: true })
      if (body.assign && project.divisionId && project.divisionId !== div.id && !canMove) return NextResponse.json({ error: MOVE_DENIED }, { status: 409 })
      await db.project.update({ where: { id: projectId }, data: { divisionId: body.assign ? div.id : null } })
      await auditPic(req, user, 'SET_PROJECT_DIVISION', 'PROJECT', projectId, { name: project.name, divisionId: body.assign ? div.id : null, division: div.name }, before)
      return NextResponse.json({ ok: true, previousDivisionId: before.divisionId })
    }

    return NextResponse.json({ error: 'Pilih akun atau proyek' }, { status: 400 })
  } catch (err) {
    console.error('[kadiv/members] PUT:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Perubahan anggota belum tersimpan' }, { status: 500 })
  }
}
