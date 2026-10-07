import 'server-only'

import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { accountDesk, applyRoleChange, deskReachError, entityRef, isLastSuperadmin, roleOutOfReachMessage, type Desk, type HeadChange } from '@/lib/account-desk'
import { createAccount, isKnownRole, readPosition, type Tx } from '@/lib/companies'
import { ALL_ROLES, ENTITY_ROLES, can } from '@/lib/rbac'
import { ROLE_LABELS } from '@/lib/constants'
import { ACCESS_REQUEST_LABELS, MAX_TEMP_ACCESS_DAYS, type AccessRequestType } from '@/lib/admin-meta'

/**
 * Permintaan akses (6 Okt 2026, 04-admin-pt.md). Siapa pun yang masuk boleh
 * mengajukan untuk PT-nya; yang memutuskan adalah pemegang meja akun:
 * Admin PT untuk PT-nya sendiri dengan batas posisi meja terbatas, Super Admin
 * untuk seluruh grup, dan Tim TI (users:manage) untuk seluruh grup kecuali
 * mengangkat Super Admin. Tidak ada yang memutuskan permintaannya sendiri.
 */

/** Meja keputusan: meja akun, atau versi TI (seluruh grup tanpa SUPERADMIN). */
export function decisionDesk(user: Pick<SessionUser, 'role' | 'scopeEntityId'>): Desk | null {
  const d = accountDesk(user)
  if (d) return d
  if (can(user.role, 'users:manage')) return { full: true, roles: ALL_ROLES.filter((r) => r !== 'SUPERADMIN'), entityId: null }
  return null
}

/** Boleh memutuskan permintaan pada PT ini (null = tingkat grup). */
export function mayDecideFor(desk: Desk | null, entityId: string | null): boolean {
  if (!desk) return false
  return desk.full || (entityId !== null && entityId === desk.entityId)
}

export type NewAccountPayload = {
  name: string
  username?: string
  email?: string
  role: string
  title?: string
  divisionId?: string
  projectId?: string
}
export type RoleChangePayload = { userId: string; role: string; divisionId?: string; projectId?: string }
export type TempAccessPayload = { userId: string; role?: string; days: number; divisionId?: string; projectId?: string }

const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')

/** Membaca & memeriksa payload sesuai jenis; mengembalikan pesan galat bila tidak lengkap. */
export function readPayload(type: AccessRequestType, raw: unknown): NewAccountPayload | RoleChangePayload | TempAccessPayload | string {
  if (!raw || typeof raw !== 'object') return 'Isi permintaan tidak valid.'
  const o = raw as Record<string, unknown>
  if (type === 'AKUN_BARU') {
    const name = str(o, 'name')
    const role = str(o, 'role')
    if (!name) return 'Nama pemilik akun wajib diisi.'
    if (name.length > 120) return 'Nama terlalu panjang.'
    if (!isKnownRole(role)) return 'Peran tidak dikenali.'
    const out: NewAccountPayload = { name, role }
    for (const k of ['username', 'email', 'title', 'divisionId', 'projectId'] as const) {
      const v = str(o, k)
      if (v) out[k] = v.slice(0, 160)
    }
    return out
  }
  const userId = str(o, 'userId')
  if (!userId) return 'Pilih akun yang dimaksud.'
  if (type === 'PINDAH_PERAN') {
    const role = str(o, 'role')
    if (!isKnownRole(role)) return 'Peran tujuan tidak dikenali.'
    const out: RoleChangePayload = { userId, role }
    if (str(o, 'divisionId')) out.divisionId = str(o, 'divisionId')
    if (str(o, 'projectId')) out.projectId = str(o, 'projectId')
    return out
  }
  const days = typeof o.days === 'number' ? Math.floor(o.days) : parseInt(str(o, 'days'), 10)
  if (!Number.isFinite(days) || days < 1 || days > MAX_TEMP_ACCESS_DAYS) return `Lama akses 1–${MAX_TEMP_ACCESS_DAYS} hari.`
  const role = str(o, 'role')
  if (role && !isKnownRole(role)) return 'Peran sementara tidak dikenali.'
  if (!role) return { userId, days }
  const out: TempAccessPayload = { userId, role, days }
  if (str(o, 'divisionId')) out.divisionId = str(o, 'divisionId').slice(0, 160)
  if (str(o, 'projectId')) out.projectId = str(o, 'projectId').slice(0, 160)
  return out
}

const roleName = (r: string) => ROLE_LABELS[r] ?? r

/** Judul & rincian yang tampil di ApprovalItem. */
export function describe(
  type: AccessRequestType,
  payload: Record<string, unknown>,
  names: { target?: string | null; division?: string | null }
): { title: string; detail: string } {
  const label = ACCESS_REQUEST_LABELS[type]
  const role = typeof payload.role === 'string' ? payload.role : ''
  if (type === 'AKUN_BARU') {
    return {
      title: `${label} ${String(payload.name ?? '')}`.trim(),
      detail: [names.division, role ? `peran ${roleName(role)}` : null].filter(Boolean).join(' · '),
    }
  }
  if (type === 'PINDAH_PERAN') {
    return { title: `${label} ${names.target ?? 'akun'} jadi ${roleName(role)}`, detail: names.division ?? '' }
  }
  const days = Number(payload.days ?? 0)
  return {
    title: role ? `${label} ${roleName(role)} untuk ${names.target ?? 'akun'}` : `${label} untuk ${names.target ?? 'akun'}`,
    detail: `${days} hari`,
  }
}

type Decider = Pick<SessionUser, 'id' | 'name' | 'role' | 'scopeEntityId'>

type Row = {
  id: string
  type: string
  payload: string
  entityId: string | null
  status: string
  requestedById: string | null
}

export class AccessRefusal extends Error {
  constructor(
    message: string,
    public status = 403
  ) {
    super(message)
  }
}

/** appliedData.heads dari baris lama boleh tidak ada atau rusak: hanya entri yang utuh dipakai. */
export function readHeads(raw: unknown): HeadChange[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (h): h is HeadChange =>
      !!h &&
      typeof h === 'object' &&
      typeof (h as HeadChange).divisionId === 'string' &&
      ((h as HeadChange).from === null || typeof (h as HeadChange).from === 'string') &&
      ((h as HeadChange).to === null || typeof (h as HeadChange).to === 'string')
  )
}

type PicChange = {
  projectId: string
  entityId: string
  from: string | null
  fromName: string | null
  to: string
  toName: string
}

/** null means absent/incomplete historical evidence, never an empty change list. */
function readPics(raw: unknown): PicChange[] | null {
  if (!Array.isArray(raw)) return null
  const valid = raw.every((p): p is PicChange => !!p && typeof p === 'object' &&
    typeof p.projectId === 'string' && typeof p.entityId === 'string' &&
    (p.from === null || typeof p.from === 'string') && (p.fromName === null || typeof p.fromName === 'string') &&
    typeof p.to === 'string' && typeof p.toName === 'string')
  return valid ? raw : null
}

function parse(json: string | null): Record<string, unknown> {
  try {
    return json ? (JSON.parse(json) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Menerapkan permintaan yang disetujui di dalam transaksi. Melempar
 * `AccessRefusal` bila di luar wewenang meja pemutus; transaksi batal dan
 * status permintaan tetap DIAJUKAN.
 */
export async function applyAccessRequest(
  tx: Tx,
  decider: Decider,
  desk: Desk,
  row: Row,
  ip: string | null
): Promise<{ targetUserId: string | null; expiresAt: Date | null; appliedData: string | null; effect: Record<string, unknown> }> {
  const payload = parse(row.payload)
  const type = row.type as AccessRequestType

  if (type === 'AKUN_BARU') {
    const entity = await entityRef(row.entityId, tx)
    const holding = entity === null || (await tx.entity.count({ where: { id: entity.id, type: 'HOLDING' } })) > 0
    // Kata sandi tidak pernah disimpan di permintaan; akun memakai sandi awal.
    const p = readPosition({ ...payload, password: '' }, { holding })
    if (typeof p === 'string') throw new AccessRefusal(p, 422)
    if (!entity && (ENTITY_ROLES as readonly string[]).includes(p.role)) throw new AccessRefusal('Posisi ini harus ditempatkan di sebuah perusahaan.', 422)
    if (!desk.roles.includes(p.role)) throw new AccessRefusal(roleOutOfReachMessage(p.role))
    if (!desk.full && entity?.id !== desk.entityId) throw new AccessRefusal('Anda hanya dapat menambah akun di perusahaan Anda sendiri.')
    const created = await createAccount(tx, entity, p)
    await tx.auditLog.create({
      data: {
        actorId: decider.id,
        action: 'CREATE_ACCOUNT',
        targetType: 'USER',
        targetId: created.id,
        afterData: JSON.stringify({ username: created.username, role: created.role, entity: entity?.code ?? null, accessRequestId: row.id }),
        ip,
      },
    })
    return { targetUserId: created.id, expiresAt: null, appliedData: null, effect: { created: created.username, role: created.role } }
  }

  const userId = typeof payload.userId === 'string' ? payload.userId : ''
  // Serialisasi pemberian dan pemulihan hak untuk akun yang sama.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, scopeEntityId: true, isActive: true } })
  if (!existing) throw new AccessRefusal('Akun yang dimaksud sudah tidak ada.', 404)
  if (!desk.full && existing.scopeEntityId !== desk.entityId) throw new AccessRefusal('Akun ini bukan di perusahaan Anda.')
  // Meja TI tidak menyentuh akun Super Admin; meja terbatas hanya posisinya sendiri.
  if (!desk.roles.includes(existing.role)) throw new AccessRefusal(roleOutOfReachMessage(existing.role))

  if (type === 'PINDAH_PERAN') {
    const role = String(payload.role ?? '')
    const refusal = deskReachError(desk, decider.id, existing, { role })
    if (refusal) throw new AccessRefusal(refusal.error, refusal.status)
    if (!desk.roles.includes(role)) throw new AccessRefusal(roleOutOfReachMessage(role))
    const { headChanges, ...result } = await applyRoleChange(tx, existing, {
      role,
      divisionId: typeof payload.divisionId === 'string' ? payload.divisionId : null,
      projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
    })
    await tx.auditLog.create({
      data: {
        actorId: decider.id,
        action: 'UPDATE_ACCOUNT',
        targetType: 'USER',
        targetId: existing.id,
        beforeData: JSON.stringify({ role: existing.role }),
        afterData: JSON.stringify({ role, accessRequestId: row.id }),
        ip,
      },
    })
    return { targetUserId: existing.id, expiresAt: null, appliedData: JSON.stringify({ role: existing.role, heads: headChanges }), effect: result }
  }

  // AKSES_SEMENTARA: peran sementara dan/atau mengaktifkan akun sampai tanggal tertentu.
  if (await tx.accessRequest.count({ where: { id: { not: row.id }, targetUserId: userId, type: 'AKSES_SEMENTARA', status: 'DISETUJUI', revertedAt: null } })) {
    throw new AccessRefusal('Akun masih memiliki akses sementara. Selesaikan akses tersebut sebelum memberi akses baru.', 409)
  }
  const days = Math.min(MAX_TEMP_ACCESS_DAYS, Math.max(1, Number(payload.days ?? 0) || 1))
  const role = typeof payload.role === 'string' && payload.role ? payload.role : null
  const refusal = deskReachError(desk, decider.id, existing, role ? { role } : {})
  if (refusal) throw new AccessRefusal(refusal.error, refusal.status)
  if (role && !desk.roles.includes(role)) throw new AccessRefusal(roleOutOfReachMessage(role))
  if (existing.id === decider.id) throw new AccessRefusal('Anda tidak dapat memberi akses sementara untuk akun sendiri.')
  const expiresAt = new Date(Date.now() + days * 86400000)
  const before = { role: existing.role, isActive: existing.isActive }
  let heads: HeadChange[] = []
  const pics: PicChange[] = []
  if (role && role !== existing.role) {
    if (role === 'PIC_PROYEK' && typeof payload.projectId === 'string' && payload.projectId && existing.scopeEntityId) {
      // Lock before reading the former PIC so snapshot and assignment are atomic.
      const projectId = payload.projectId
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
      const project = await tx.project.findFirst({
        where: { id: projectId, entityId: existing.scopeEntityId },
        select: { id: true, entityId: true, picUserId: true, picName: true },
      })
      if (!project) throw new AccessRefusal('Proyek tidak ditemukan di perusahaan ini.', 422)
      pics.push({ projectId: project.id, entityId: project.entityId, from: project.picUserId, fromName: project.picName, to: existing.id, toName: existing.name })
    }
    // F1-C: tautan kepala divisi yang ikut berubah disimpan supaya bisa dikembalikan saat kedaluwarsa.
    const applied = await applyRoleChange(tx, existing, {
      role,
      isActive: true,
      divisionId: typeof payload.divisionId === 'string' ? payload.divisionId : null,
      projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
    })
    heads = applied.headChanges
  } else {
    await tx.user.update({ where: { id: existing.id }, data: { isActive: true } })
  }
  await tx.auditLog.create({
    data: {
      actorId: decider.id,
      action: 'GRANT_TEMP_ACCESS',
      targetType: 'USER',
      targetId: existing.id,
      beforeData: JSON.stringify(before),
      afterData: JSON.stringify({ role: role ?? existing.role, isActive: true, expiresAt, accessRequestId: row.id }),
      ip,
    },
  })
  return { targetUserId: existing.id, expiresAt, appliedData: JSON.stringify({ ...before, grantedRole: role, heads, pics }), effect: { role: role ?? existing.role, days } }
}

/**
 * Mencabut akses sementara yang sudah lewat masanya: peran & status aktif
 * dikembalikan seperti sebelum disetujui — kecuali bila akun itu sudah diubah
 * orang lain sejak itu (perubahan terbaru yang dipertahankan). Dipanggil cron
 * pengingat dan saat daftar permintaan dibuka pemutus.
 *
 * F1-C (6 Okt 2026): Division.headUserId yang diubah applyRoleChange
 * (appliedData.heads) juga dikembalikan — hanya bila divisi itu masih
 * menunjuk nilai yang dipasang akses sementara; kepala lama harus aktif,
 * masih berperan KEPALA_DIVISI, dan berada di PT divisi tersebut.
 * PIC proyek dipulihkan dari appliedData.pics; PIC lama harus aktif, berperan
 * PIC_PROYEK, dan masih di PT proyek. Tanpa bukti historis, residu PIC menahan
 * pemulihan agar ensureTemporaryAccessCurrent menolak sesi sampai rekonsiliasi.
 */
export async function revertExpiredAccess(now = new Date(), userId?: string): Promise<number> {
  const due = await db.accessRequest.findMany({
    where: { type: 'AKSES_SEMENTARA', status: 'DISETUJUI', revertedAt: null, expiresAt: { lte: now }, ...(userId ? { targetUserId: userId } : {}) },
    select: { id: true, targetUserId: true, appliedData: true },
    take: 100,
  })
  let n = 0
  for (const r of due) {
    const before = parse(r.appliedData) as { role?: string; isActive?: boolean; grantedRole?: string | null; heads?: unknown; pics?: unknown }
    const heads = readHeads(before.heads)
    const pics = readPics(before.pics)
    try {
      const changed = await db.$transaction(async (tx) => {
        if (r.targetUserId) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${r.targetUserId} FOR UPDATE`
        // Klaim atomik: cron dan autentikasi dapat tiba bersamaan.
        // Seluruh klaim ikut rollback bila pemulihan atau audit gagal.
        const claimed = await tx.accessRequest.updateMany({
          where: { id: r.id, revertedAt: null, status: 'DISETUJUI', expiresAt: { lte: now } },
          data: { revertedAt: now },
        })
        if (claimed.count !== 1) return false
        const u = r.targetUserId
          ? await tx.user.findUnique({ where: { id: r.targetUserId }, select: { id: true, name: true, role: true, scopeEntityId: true, isActive: true } })
          : null
        const changes: Record<string, unknown> = {}
        // Historical PIC grants have no trustworthy former owner. Do not mark
        // them reverted while a residual assignment remains: request-time auth
        // must fail closed until an admin explicitly reconciles the project.
        if (!pics && r.targetUserId && before.grantedRole === 'PIC_PROYEK' && before.role !== 'PIC_PROYEK') {
          const residual = await tx.project.findFirst({ where: { picUserId: r.targetUserId }, select: { id: true } })
          if (residual) throw new AccessRefusal('PIC sementara lama belum dapat dipulihkan: snapshot PIC tidak lengkap. Admin perlu merekonsiliasi penugasan proyek.', 503)
        }
        if (u) {
          const stillGranted = before.grantedRole ? u.role === before.grantedRole : true
          if (stillGranted && before.role && before.role !== u.role) {
            if (u.role === 'SUPERADMIN' && (await isLastSuperadmin(u.id, tx))) throw new Error('last superadmin')
            await tx.user.update({ where: { id: u.id }, data: { role: before.role } })
            changes.role = before.role
          }
          if (before.isActive === false && u.isActive) {
            await tx.user.update({ where: { id: u.id }, data: { isActive: false } })
            changes.isActive = false
          }
        }
        const restored: HeadChange[] = []
        for (const h of heads) {
          const d = await tx.division.findUnique({ where: { id: h.divisionId }, select: { headUserId: true, entityId: true } })
          // Sudah diubah orang lain sejak itu: perubahan terbaru dipertahankan.
          if (!d || d.headUserId !== h.to) continue
          let headUserId: string | null = null
          if (h.from) {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${h.from} FOR UPDATE`
            const prev = await tx.user.findUnique({ where: { id: h.from }, select: { isActive: true, role: true, scopeEntityId: true } })
            if (prev?.isActive && prev.role === 'KEPALA_DIVISI' && prev.scopeEntityId === d.entityId) headUserId = h.from
          }
          // Clear an ineligible former head, and do not overwrite an assignment
          // that changed between the read and this conditional write.
          const applied = await tx.division.updateMany({
            where: { id: h.divisionId, entityId: d.entityId, headUserId: h.to },
            data: { headUserId },
          })
          if (applied.count === 1) restored.push({ divisionId: h.divisionId, from: h.to, to: headUserId })
        }
        if (restored.length) changes.heads = restored
        const restoredPics: Record<string, unknown>[] = []
        for (const p of pics ?? []) {
          const project = await tx.project.findUnique({ where: { id: p.projectId }, select: { entityId: true, picUserId: true, picName: true } })
          if (!project || project.picUserId !== p.to || project.picName !== p.toName) continue
          let previousIsEligible = false
          if (p.from && project.entityId === p.entityId) {
            // Prevent role/company/deactivation changes racing this eligibility check.
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${p.from} FOR UPDATE`
            const previous = await tx.user.findUnique({ where: { id: p.from }, select: { isActive: true, role: true, scopeEntityId: true } })
            previousIsEligible = !!previous?.isActive && previous.role === 'PIC_PROYEK' && previous.scopeEntityId === project.entityId
          }
          const picUserId = previousIsEligible ? p.from : null
          const picName = previousIsEligible || (p.from === null && project.entityId === p.entityId) ? p.fromName : null
          // Preserve a manual reassignment even when it arrives after our read.
          const applied = await tx.project.updateMany({
            where: { id: p.projectId, entityId: project.entityId, picUserId: p.to, picName: p.toName },
            data: { picUserId, picName },
          })
          if (applied.count === 1) restoredPics.push({ projectId: p.projectId, from: p.to, to: picUserId, picName })
        }
        if (restoredPics.length) changes.pics = restoredPics
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: 'TEMP_ACCESS_EXPIRED',
            targetType: 'USER',
            targetId: r.targetUserId ?? r.id,
            afterData: JSON.stringify({ accessRequestId: r.id, ...changes }),
            userAgent: 'sistem',
          },
        })
        return true
      })
      if (changed) n += 1
    } catch (err) {
      console.error('[access-requests] gagal mencabut akses sementara', r.id, err instanceof Error ? err.message : err)
    }
  }
  return n
}

/** Periksa tenggat pada setiap permintaan, termasuk ketika cron tidak berjalan. */
export async function ensureTemporaryAccessCurrent(userId: string, now = new Date()): Promise<void> {
  const where = { targetUserId: userId, type: 'AKSES_SEMENTARA', status: 'DISETUJUI', revertedAt: null, expiresAt: { lte: now } }
  if (!(await db.accessRequest.count({ where }))) return
  await revertExpiredAccess(now, userId)
  // Gagal memulihkan tidak boleh membuat peran kedaluwarsa tetap berwenang.
  if (await db.accessRequest.count({ where })) throw new AccessRefusal('Akses sementara telah berakhir. Coba lagi atau hubungi admin.', 503)
}
