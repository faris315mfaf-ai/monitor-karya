import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { scopeEntityIds, type SessionUser } from '@/lib/auth'
import { can, canSignSlot, isMasterRole, type Capability } from '@/lib/rbac'

/**
 * [F2-URUNGKAN] Urungkan di sisi server (6 Okt 2026).
 *
 * Tindakan yang bisa dibalik — keputusan pengajuan proyek, tinjau/putuskan/
 * tutup eskalasi, ajukan ulang & arsip proyek, penerusan laporan harian dan
 * mingguan di Penerimaan — menerbitkan satu UndoToken. Toast "Urungkan" di UI
 * mengirim tiket itu ke POST /api/undo.
 *
 * Aturan:
 *  - jendela 15 menit (UNDO_MINUTES), sekali pakai;
 *  - hanya pelaku yang sama, dan PT sasaran masih dalam cakupannya;
 *  - keadaan dipulihkan PERSIS dari `snapshot` (keadaan sebelum tindakan);
 *  - ditolak (409) bila keadaan sekarang tidak sama dengan `stamp` (sidik
 *    keadaan sesudah tindakan) — artinya orang lain sudah mengubahnya;
 *  - setiap urungkan dicatat di AuditLog sebagai `UNDO_<aksi asal>`.
 *
 * Penerbitan tiket tidak boleh menggagalkan tindakan asal: bila tabel belum
 * ada (migrasi 0025 belum diterapkan) atau galat lain, tiket = null dan UI
 * tidak menawarkan Urungkan.
 */

export const UNDO_MINUTES = 15
export const UNDO_WINDOW_MS = UNDO_MINUTES * 60_000

export type UndoAction =
  | 'APPROVE_PROJECT'
  | 'REJECT_PROJECT'
  | 'RESUBMIT_PROJECT'
  | 'ARCHIVE_PROJECT'
  | 'REVIEW_ESCALATION'
  | 'DECIDE_ESCALATION'
  | 'CLOSE_ESCALATION'
  | 'FORWARD_DAILY_REPORT'
  | 'FORWARD_WEEKLY_REPORT'

export const UNDO_ACTIONS: readonly UndoAction[] = [
  'APPROVE_PROJECT',
  'REJECT_PROJECT',
  'RESUBMIT_PROJECT',
  'ARCHIVE_PROJECT',
  'REVIEW_ESCALATION',
  'DECIDE_ESCALATION',
  'CLOSE_ESCALATION',
  'FORWARD_DAILY_REPORT',
  'FORWARD_WEEKLY_REPORT',
]

type Tx = Prisma.TransactionClient
type Iso = string | null

const iso = (d: Date | null | undefined): Iso => (d ? d.toISOString() : null)
const date = (s: Iso | undefined): Date | null => (s ? new Date(s) : null)

// ------------------------------------------------------------ bentuk snapshot

export type ApprovalSnap = {
  role: string
  decision: string
  note: string | null
  decidedById: string | null
  decidedAt: string
}

export type ProjectSnapshot = {
  project: { lifecycle: string; approvedAt: Iso; approvedByName: string | null; proposedAt?: Iso }
  /** Keputusan satu slot: baris slot itu sebelum tindakan (null = belum ada). */
  slot?: { role: string; before: ApprovalSnap | null } | null
  /** Ajukan ulang: seluruh baris persetujuan sebelum dikosongkan. */
  approvals?: ApprovalSnap[]
}

export type ProjectStamp = { lifecycle: string; updatedAt: string; approvals: string[] }

export type EscalationSnapshot = {
  status: string
  decidedById: string | null
  decidedAt: Iso
  decisionText: string | null
}

export type ForwardSnapshot = {
  forwardedById: string | null
  forwardedAt: Iso
  isLocked?: boolean
  lockedAt?: Iso
}

export type RowStamp = { status?: string; forwardedAt?: Iso; updatedAt: string }

export const approvalSnap = (a: {
  role: string
  decision: string
  note: string | null
  decidedById: string | null
  decidedAt: Date
}): ApprovalSnap => ({
  role: a.role,
  decision: a.decision,
  note: a.note,
  decidedById: a.decidedById,
  decidedAt: a.decidedAt.toISOString(),
})

const approvalSig = (a: { role: string; decision: string; decidedAt: Date | string }) =>
  `${a.role}:${a.decision}:${typeof a.decidedAt === 'string' ? a.decidedAt : a.decidedAt.toISOString()}`

/** Sidik keadaan proyek sesudah tindakan: siklus hidup, updatedAt, dan slot yang terisi. */
export async function projectStamp(projectId: string, client: Pick<Tx, 'project'> = db): Promise<ProjectStamp | null> {
  const p = await client.project.findUnique({
    where: { id: projectId },
    select: { lifecycle: true, updatedAt: true, approvals: { select: { role: true, decision: true, decidedAt: true } } },
  })
  if (!p) return null
  return { lifecycle: p.lifecycle, updatedAt: p.updatedAt.toISOString(), approvals: p.approvals.map(approvalSig).sort() }
}

export const escalationSnap = (e: {
  status: string
  decidedById: string | null
  decidedAt: Date | null
  decisionText: string | null
}): EscalationSnapshot => ({ status: e.status, decidedById: e.decidedById, decidedAt: iso(e.decidedAt), decisionText: e.decisionText })

// ------------------------------------------------------------------- terbit

export type IssueInput = {
  action: UndoAction
  targetType: 'PROJECT' | 'ESCALATION' | 'DAILY_REPORT' | 'WEEKLY_REPORT'
  targetId: string
  entityId: string | null
  actorId: string
  snapshot: ProjectSnapshot | EscalationSnapshot | ForwardSnapshot
  stamp: ProjectStamp | RowStamp | null
}

/** Terbitkan tiket urungkan; null bila gagal (tindakan asal tetap berhasil). */
export async function issueUndo(input: IssueInput, now = new Date()): Promise<string | null> {
  if (!input.stamp) return null
  try {
    const row = await db.undoToken.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        entityId: input.entityId,
        actorId: input.actorId,
        snapshot: JSON.stringify(input.snapshot),
        stamp: JSON.stringify(input.stamp),
        expiresAt: new Date(now.getTime() + UNDO_WINDOW_MS),
      },
      select: { id: true },
    })
    return row.id
  } catch (err) {
    console.error('[undo:issue]', input.action, err)
    return null
  }
}

// ------------------------------------------------------------------ urungkan

/** Penolakan yang disengaja di dalam transaksi; membatalkan klaim tiket. */
export class UndoRefused extends Error {
  constructor(
    message: string,
    readonly status: number = 409
  ) {
    super(message)
  }
}

const CHANGED = 'Keadaan sudah berubah sejak tindakan Anda, jadi tidak bisa diurungkan.'

export type UndoResult =
  | { ok: true; action: string; targetType: string; targetId: string; message: string }
  | { ok: false; status: number; error: string }

/** Pesan toast setelah berhasil diurungkan. */
export const UNDONE_MESSAGES: Record<UndoAction, string> = {
  APPROVE_PROJECT: 'Persetujuan proyek diurungkan.',
  REJECT_PROJECT: 'Penolakan proyek diurungkan.',
  RESUBMIT_PROJECT: 'Pengajuan ulang diurungkan.',
  ARCHIVE_PROJECT: 'Pengarsipan proyek diurungkan.',
  REVIEW_ESCALATION: 'Tanda ditinjau diurungkan.',
  DECIDE_ESCALATION: 'Keputusan eskalasi diurungkan.',
  CLOSE_ESCALATION: 'Penutupan eskalasi diurungkan.',
  FORWARD_DAILY_REPORT: 'Penerusan laporan harian diurungkan.',
  FORWARD_WEEKLY_REPORT: 'Penerusan capaian mingguan diurungkan.',
}

/** Hak aksi diperiksa lagi: tiket bukan izin yang bertahan setelah peran dicabut. */
const UNDO_CAPABILITIES: Record<UndoAction, readonly Capability[]> = {
  APPROVE_PROJECT: ['project:approve'],
  REJECT_PROJECT: ['project:approve'],
  RESUBMIT_PROJECT: ['project:manage', 'project:propose'],
  ARCHIVE_PROJECT: ['project:manage'],
  REVIEW_ESCALATION: ['escalation:followup'],
  DECIDE_ESCALATION: ['escalation:decide'],
  CLOSE_ESCALATION: ['escalation:decide', 'escalation:followup', 'escalation:raise'],
  FORWARD_DAILY_REPORT: ['daily:forward'],
  FORWARD_WEEKLY_REPORT: ['weekly:forward'],
}

async function mayUndo(
  user: SessionUser, action: UndoAction, targetId: string, entityId: string | null, snapshot: unknown,
): Promise<boolean> {
  if (!UNDO_CAPABILITIES[action].some((capability) => can(user.role, capability))) return false
  if (isMasterRole(user.role)) return true
  if (action === 'APPROVE_PROJECT' || action === 'REJECT_PROJECT') {
    const savedSlot = (snapshot as ProjectSnapshot).slot
    // Aktivasi data lama dengan rantai kosong tidak memiliki slot penandatangan.
    if (action === 'APPROVE_PROJECT' && savedSlot === null) return true
    const slot = savedSlot?.role
    return Boolean(slot && entityId && canSignSlot(user, slot, entityId))
  }
  if (action === 'RESUBMIT_PROJECT') {
    if (can(user.role, 'project:manage') && user.scopeEntityId === entityId) return true
    if (!can(user.role, 'project:propose')) return false
    const project = await db.project.findUnique({ where: { id: targetId }, select: { proposedById: true } })
    return project?.proposedById === user.id
  }
  if (action === 'ARCHIVE_PROJECT' || action === 'FORWARD_DAILY_REPORT' || action === 'FORWARD_WEEKLY_REPORT') {
    return user.scopeEntityId === entityId
  }
  if (action === 'CLOSE_ESCALATION' && !can(user.role, 'escalation:decide') && !can(user.role, 'escalation:followup')) {
    const escalation = await db.escalation.findUnique({ where: { id: targetId }, select: { raisedById: true } })
    return escalation?.raisedById === user.id
  }
  return true
}

/**
 * Urungkan satu tindakan. Klaim tiket, pemeriksaan keadaan, pemulihan, dan
 * log berada dalam satu transaksi: bila keadaan sudah berubah, klaim ikut
 * dibatalkan dan tiket tetap tercatat belum terpakai.
 */
export async function applyUndo(user: SessionUser, tokenId: string, req?: NextRequest, now = new Date()): Promise<UndoResult> {
  const token = await db.undoToken.findUnique({ where: { id: tokenId } })
  // Tiket pelaku lain diperlakukan seperti tidak ada (anti-IDOR).
  if (!token || token.actorId !== user.id) {
    return { ok: false, status: 404, error: 'Tindakan yang diurungkan tidak ditemukan' }
  }
  if (token.usedAt) return { ok: false, status: 409, error: 'Tindakan ini sudah diurungkan' }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, status: 409, error: `Batas urungkan ${UNDO_MINUTES} menit sudah lewat` }
  }
  if (!(UNDO_ACTIONS as readonly string[]).includes(token.action)) {
    return { ok: false, status: 400, error: 'Tindakan ini tidak bisa diurungkan' }
  }
  if (token.entityId) {
    const reach = await scopeEntityIds(user)
    if (reach !== null && !reach.includes(token.entityId)) {
      return { ok: false, status: 403, error: 'Data ini di luar cakupan Anda' }
    }
  }

  const action = token.action as UndoAction
  const snapshot = JSON.parse(token.snapshot) as unknown
  if (!(await mayUndo(user, action, token.targetId, token.entityId, snapshot))) {
    return { ok: false, status: 403, error: 'Peran Anda sekarang tidak berwenang mengurungkan tindakan ini' }
  }
  const stamp = JSON.parse(token.stamp) as unknown

  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.undoToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: now } })
      if (claimed.count === 0) throw new UndoRefused('Tindakan ini sudah diurungkan')

      let current: unknown
      switch (token.targetType) {
        case 'PROJECT':
          current = await undoProject(tx, token.targetId, snapshot as ProjectSnapshot, stamp as ProjectStamp, token.createdAt)
          break
        case 'ESCALATION':
          current = await undoEscalation(tx, token.targetId, snapshot as EscalationSnapshot, stamp as RowStamp)
          break
        case 'DAILY_REPORT':
          current = await undoDailyForward(tx, token.targetId, snapshot as ForwardSnapshot, stamp as RowStamp, token.createdAt)
          break
        case 'WEEKLY_REPORT':
          current = await undoWeeklyForward(tx, token.targetId, snapshot as ForwardSnapshot, stamp as RowStamp, token.createdAt)
          break
        default:
          throw new UndoRefused('Tindakan ini tidak bisa diurungkan', 400)
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: `UNDO_${action}`,
          targetType: token.targetType,
          targetId: token.targetId,
          beforeData: JSON.stringify(current),
          afterData: JSON.stringify({ restored: snapshot, undoTokenId: token.id }),
          ip: req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          userAgent: req?.headers.get('user-agent') || null,
        },
      })
    })
  } catch (err) {
    if (err instanceof UndoRefused) return { ok: false, status: err.status, error: err.message }
    throw err
  }

  return { ok: true, action, targetType: token.targetType, targetId: token.targetId, message: UNDONE_MESSAGES[action] }
}

// ------------------------------------------------------------ per jenis target

async function undoProject(tx: Tx, id: string, snap: ProjectSnapshot, stamp: ProjectStamp, issuedAt: Date) {
  const now = await projectStamp(id, tx)
  if (!now) throw new UndoRefused('Proyek ini sudah tidak ada', 404)
  if (
    now.lifecycle !== stamp.lifecycle ||
    now.updatedAt !== stamp.updatedAt ||
    now.approvals.join('|') !== stamp.approvals.join('|')
  ) {
    throw new UndoRefused(CHANGED)
  }
  // Proyek yang sudah aktif lalu mulai dilaporkan tidak dikembalikan ke pengajuan.
  if (stamp.lifecycle === 'AKTIF' && snap.project.lifecycle !== 'AKTIF') {
    const [daily, tasks] = await Promise.all([
      tx.dailyProjectReport.count({ where: { projectId: id, createdAt: { gte: issuedAt } } }),
      tx.task.count({ where: { projectId: id, createdAt: { gte: issuedAt } } }),
    ])
    if (daily + tasks > 0) {
      throw new UndoRefused('Proyek ini sudah mulai dilaporkan sejak aktif, jadi tidak bisa diurungkan.')
    }
  }

  // Kunci optimistis: hanya bila proyek belum diubah siapa pun sejak sidik diambil.
  const restored = await tx.project.updateMany({
    where: { id, updatedAt: new Date(stamp.updatedAt), lifecycle: stamp.lifecycle },
    data: {
      lifecycle: snap.project.lifecycle,
      approvedAt: date(snap.project.approvedAt),
      approvedByName: snap.project.approvedByName,
      ...(snap.project.proposedAt !== undefined ? { proposedAt: date(snap.project.proposedAt) } : {}),
    },
  })
  if (restored.count === 0) throw new UndoRefused(CHANGED)

  if (snap.approvals) {
    await tx.projectApproval.deleteMany({ where: { projectId: id } })
    if (snap.approvals.length) {
      await tx.projectApproval.createMany({
        data: snap.approvals.map((a) => ({
          projectId: id,
          role: a.role,
          decision: a.decision,
          note: a.note,
          decidedById: a.decidedById,
          decidedAt: new Date(a.decidedAt),
        })),
      })
    }
  } else if (snap.slot) {
    const before = snap.slot.before
    if (before) {
      await tx.projectApproval.update({
        where: { projectId_role: { projectId: id, role: snap.slot.role } },
        data: { decision: before.decision, note: before.note, decidedById: before.decidedById, decidedAt: new Date(before.decidedAt) },
      })
    } else {
      await tx.projectApproval.deleteMany({ where: { projectId: id, role: snap.slot.role } })
    }
  }
  return now
}

async function undoEscalation(tx: Tx, id: string, snap: EscalationSnapshot, stamp: RowStamp) {
  const restored = await tx.escalation.updateMany({
    where: { id, status: stamp.status, updatedAt: new Date(stamp.updatedAt) },
    data: {
      status: snap.status,
      decidedById: snap.decidedById,
      decidedAt: date(snap.decidedAt),
      decisionText: snap.decisionText,
    },
  })
  if (restored.count === 0) throw new UndoRefused(CHANGED)
  return stamp
}

/**
 * Pelapor yang sudah mengajukan buka kunci atas laporan yang diteruskan ini
 * bergantung pada keadaan "diteruskan"; jangan dicabut diam-diam.
 */
async function refuseIfUnlockRequested(tx: Tx, targetType: 'DAILY_REPORT' | 'WEEKLY_REPORT', id: string, issuedAt: Date) {
  const unlocks = await tx.unlockRequest.count({ where: { targetType, targetId: id, createdAt: { gte: issuedAt } } })
  if (unlocks > 0) throw new UndoRefused('Sudah ada permintaan buka kunci untuk laporan ini, jadi penerusan tidak bisa diurungkan.')
}

async function undoDailyForward(tx: Tx, id: string, snap: ForwardSnapshot, stamp: RowStamp, issuedAt: Date) {
  await refuseIfUnlockRequested(tx, 'DAILY_REPORT', id, issuedAt)

  const restored = await tx.dailyProjectReport.updateMany({
    where: { id, forwardedAt: date(stamp.forwardedAt ?? null), updatedAt: new Date(stamp.updatedAt) },
    data: {
      forwardedById: snap.forwardedById,
      forwardedAt: date(snap.forwardedAt),
      isLocked: snap.isLocked ?? false,
      lockedAt: date(snap.lockedAt ?? null),
    },
  })
  if (restored.count === 0) throw new UndoRefused(CHANGED)
  return stamp
}

async function undoWeeklyForward(tx: Tx, id: string, snap: ForwardSnapshot, stamp: RowStamp, issuedAt: Date) {
  await refuseIfUnlockRequested(tx, 'WEEKLY_REPORT', id, issuedAt)
  const restored = await tx.weeklyDivisionReport.updateMany({
    where: { id, forwardedAt: date(stamp.forwardedAt ?? null), updatedAt: new Date(stamp.updatedAt) },
    data: { forwardedById: snap.forwardedById, forwardedAt: date(snap.forwardedAt) },
  })
  if (restored.count === 0) throw new UndoRefused(CHANGED)
  return stamp
}
