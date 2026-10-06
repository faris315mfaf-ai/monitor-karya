import 'server-only'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scopeEntityIds, type SessionUser } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'

/**
 * Hubungan akun dengan satu proyek, untuk fitur PIC (6 Okt 2026): output,
 * catatan kepala divisi, tahapan, dan usulan geser tenggat.
 *
 *   PIC     — PIC proyek itu sendiri.
 *   KADIV   — kepala divisi pelaksana proyek itu [F1-D]: divisi dari
 *             `Project.divisionId`; bila kosong, divisi tempat PIC-nya menjadi
 *             anggota (`User.divisionId`); bila PIC juga tanpa divisi, divisi
 *             yang dipimpin PIC-nya di PT proyek. Urutan sama dengan
 *             src/lib/kadiv.ts → divisionProjects. Kepala divisi lain di PT yang
 *             sama tidak terkait.
 *   ADMIN   — Admin PT dari PT pemilik proyek.
 *   MASTER  — Super Admin / TI.
 *   VIEWER  — peran pantau lain yang cakupan entitasnya memuat proyek ini
 *             (Direktur entitas, Manajemen, auditor, …).
 */
export type ProjectRelation = 'PIC' | 'KADIV' | 'ADMIN' | 'MASTER' | 'VIEWER'

export type AccessProject = {
  id: string
  name: string
  entityId: string
  picUserId: string | null
  targetEndDate: Date | null
  /** Divisi pelaksana (nullable); lihat projectDivisionIds. */
  divisionId?: string | null
}

export type ProjectGuard =
  | { ok: true; project: AccessProject; relation: ProjectRelation }
  | { ok: false; res: NextResponse }

const PROJECT_SELECT = { id: true, name: true, entityId: true, picUserId: true, targetEndDate: true, divisionId: true } as const

/** Akses baca (semua hubungan). */
export const READ_RELATIONS: ProjectRelation[] = ['PIC', 'KADIV', 'ADMIN', 'MASTER', 'VIEWER']
/** Mengelola output, tahapan, dan usulan tenggat atas nama PIC. */
export const PIC_WRITE_RELATIONS: ProjectRelation[] = ['PIC', 'ADMIN', 'MASTER']
/** Percakapan catatan kepala divisi: hanya tiga pihak ini. */
export const NOTE_RELATIONS: ProjectRelation[] = ['PIC', 'KADIV', 'ADMIN']
/** Mereview output (Terima / Minta revisi). */
export const REVIEW_RELATIONS: ProjectRelation[] = ['KADIV', 'MASTER']
/** Peran yang memutuskan usulan geser tenggat. */
export const DEADLINE_DECIDER_ROLES = ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'SUPERADMIN'] as const

export function canDecideDeadline(role: string): boolean {
  return (DEADLINE_DECIDER_ROLES as readonly string[]).includes(role)
}

/** Entitas tempat akun ini menjadi kepala divisi aktif. */
export async function headedEntityIds(userId: string): Promise<string[]> {
  const rows = await db.division.findMany({
    where: { headUserId: userId, isActive: true },
    select: { entityId: true },
  })
  return [...new Set(rows.map((r) => r.entityId))]
}

/**
 * Divisi pelaksana proyek [F1-D]: `Project.divisionId`; bila kosong, divisi
 * PIC-nya (`User.divisionId`); bila PIC juga tanpa divisi, divisi aktif di PT
 * proyek yang dipimpin PIC-nya. Kosong bila tidak satu pun berlaku.
 */
export async function projectDivisionIds(project: AccessProject): Promise<string[]> {
  let divisionId = project.divisionId
  if (divisionId === undefined) {
    const row = await db.project.findUnique({ where: { id: project.id }, select: { divisionId: true } })
    divisionId = row?.divisionId ?? null
  }
  if (divisionId) return [divisionId]
  if (!project.picUserId) return []
  const pic = await db.user.findUnique({ where: { id: project.picUserId }, select: { divisionId: true } })
  if (pic?.divisionId) return [pic.divisionId]
  const led = await db.division.findMany({
    where: { headUserId: project.picUserId, entityId: project.entityId, isActive: true },
    select: { id: true },
  })
  return led.map((d) => d.id)
}

/** Kepala divisi aktif dari divisi pelaksana proyek (biasanya satu orang). */
export async function projectHeads(project: AccessProject): Promise<{ id: string; email: string; name: string }[]> {
  const ids = await projectDivisionIds(project)
  if (ids.length === 0) return []
  const rows = await db.division.findMany({
    where: { id: { in: ids }, isActive: true, headUserId: { not: null } },
    select: { headUser: { select: { id: true, email: true, name: true, isActive: true } } },
  })
  const seen = new Set<string>()
  const out: { id: string; email: string; name: string }[] = []
  for (const r of rows) {
    const h = r.headUser
    if (!h || !h.isActive || seen.has(h.id)) continue
    seen.add(h.id)
    out.push({ id: h.id, email: h.email, name: h.name })
  }
  return out
}

export async function relationTo(user: SessionUser, project: AccessProject): Promise<ProjectRelation | null> {
  if (user.role === 'PIC_PROYEK') return project.picUserId === user.id ? 'PIC' : null
  if (user.role === 'KEPALA_DIVISI') {
    const ids = await projectDivisionIds(project)
    if (ids.length === 0) return null
    const led = await db.division.count({ where: { id: { in: ids }, headUserId: user.id, isActive: true } })
    return led > 0 ? 'KADIV' : null
  }
  if (user.role === 'ADMIN_PT') return user.scopeEntityId === project.entityId ? 'ADMIN' : null
  if (isMasterRole(user.role)) return 'MASTER'
  const ids = await scopeEntityIds(user)
  return ids === null || ids.includes(project.entityId) ? 'VIEWER' : null
}

/**
 * Memuat proyek dan memastikan akun punya salah satu hubungan yang diizinkan.
 * 404 bila proyek tidak ada, 403 bila di luar tanggung jawab.
 */
export async function guardProjectAccess(
  user: SessionUser,
  projectId: unknown,
  allowed: ProjectRelation[]
): Promise<ProjectGuard> {
  if (typeof projectId !== 'string' || !projectId) {
    return { ok: false, res: NextResponse.json({ error: 'Proyek wajib dipilih' }, { status: 400 }) }
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT })
  if (!project) {
    return { ok: false, res: NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 }) }
  }
  const relation = await relationTo(user, project)
  if (!relation || !allowed.includes(relation)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Proyek ini di luar tanggung jawab Anda' }, { status: 403 }),
    }
  }
  return { ok: true, project, relation }
}

/**
 * Saringan `Project` untuk daftar lintas proyek: proyek yang boleh dibaca akun
 * ini. Dipakai sebagai `{ project: projectScopeWhere(...) }`.
 */
export async function projectScopeWhere(user: SessionUser): Promise<Record<string, unknown>> {
  if (user.role === 'PIC_PROYEK') return { picUserId: user.id }
  if (user.role === 'KEPALA_DIVISI') return kadivProjectWhere(user.id)
  if (user.role === 'ADMIN_PT') return { entityId: user.scopeEntityId ?? '__none__' }
  if (isMasterRole(user.role)) return {}
  const ids = await scopeEntityIds(user)
  return ids === null ? {} : { entityId: { in: ids } }
}

/**
 * Saringan proyek kepala divisi [F1-D], cermin dari projectDivisionIds: proyek
 * divisinya, proyek tanpa divisi yang PIC-nya anggota divisinya, dan proyek
 * tanpa divisi yang PIC-nya ia sendiri (tanpa divisi anggota) di PT yang ia
 * pimpin.
 */
async function kadivProjectWhere(userId: string): Promise<Record<string, unknown>> {
  const divs = await db.division.findMany({
    where: { headUserId: userId, isActive: true },
    select: { id: true, entityId: true },
  })
  if (divs.length === 0) return { id: '__none__' }
  const ids = divs.map((d) => d.id)
  const entityIds = [...new Set(divs.map((d) => d.entityId))]
  return {
    OR: [
      { divisionId: { in: ids } },
      { divisionId: null, picUser: { divisionId: { in: ids } } },
      { divisionId: null, entityId: { in: entityIds }, picUserId: userId, picUser: { divisionId: null } },
    ],
  }
}

/** Akun yang ikut dalam percakapan proyek selain penulis: PIC, kepala divisi pelaksana, Admin PT. */
export async function noteParticipants(project: AccessProject, exceptUserId: string): Promise<{ id: string; email: string }[]> {
  const [heads, admins, pic] = await Promise.all([
    projectHeads(project),
    db.user.findMany({
      where: { role: 'ADMIN_PT', scopeEntityId: project.entityId, isActive: true },
      select: { id: true, email: true },
    }),
    project.picUserId
      ? db.user.findUnique({ where: { id: project.picUserId }, select: { id: true, email: true, isActive: true } })
      : null,
  ])
  const list = [
    ...heads,
    ...admins,
    ...(pic && pic.isActive ? [pic] : []),
  ]
  const seen = new Set<string>([exceptUserId])
  return list.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true))).map((u) => ({ id: u.id, email: u.email }))
}

/** Pesan lonceng aplikasi untuk beberapa akun sekaligus. Gagal kirim tidak menggagalkan aksi. */
export async function notifyInApp(
  recipients: { id: string; email: string }[],
  template: string,
  payload: { title: string; body: string; tab?: string; projectId?: string; actorName?: string }
) {
  if (!recipients.length) return
  try {
    await db.notificationLog.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        channel: 'APLIKASI',
        recipient: r.email,
        template,
        status: 'SENT',
        sentAt: new Date(),
        payload: JSON.stringify(payload),
      })),
    })
  } catch (err) {
    console.error('[pic-access] notifikasi gagal:', err instanceof Error ? err.message : err)
  }
}

/** Jejak audit dengan IP & user-agent, pola yang sama dengan route lain. */
export async function auditPic(
  req: Request,
  user: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  after?: unknown,
  before?: unknown
) {
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action,
      targetType,
      targetId,
      beforeData: before === undefined ? null : JSON.stringify(before),
      afterData: after === undefined ? null : JSON.stringify(after),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })
}

/** Body JSON aman: objek atau null. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = (await req.json()) as unknown
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const str = (b: Record<string, unknown>, k: string, max = 2000) =>
  typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : ''
