import 'server-only'

import { db } from '@/lib/db'
import { scopeEntityIds, type SessionUser } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'
import { isoWeekOf, isoWeekStart, weeklyDeadlines } from '@/lib/lock'
import { isApprovalDecider, isProjectOverseer, isWeeklyReader } from '@/lib/oversight-shared'
import { NextResponse } from 'next/server'
import { NOTE_RELATIONS, guardProjectAccess, type ProjectGuard } from '@/lib/pic-access'

/**
 * [F2-DIREKTUR] Aturan akses server untuk fitur Direktur/Manajemen: tanggapan
 * laporan mingguan, tinjauan proyek, dan persetujuan materi/anggaran/cuti.
 * Tabel 0023 bisa belum ada; pemanggil memakai `isMissingTable` untuk membaca
 * itu sebagai "kosong" pada bacaan opsional.
 */

/** Galat Prisma tabel/kolom belum ada (migrasi belum diterapkan). */
export function isMissingTable(err: unknown) {
  const code = (err as { code?: unknown } | null)?.code
  return code === 'P2021' || code === 'P2022'
}

/**
 * Minggu laporan yang dibaca pengawas: minggu berjalan bila tenggat serahnya
 * (Kamis 17.00 WIB) sudah lewat, selain itu minggu lalu — Senin pagi direktur
 * membaca laporan M-1. Dipakai /api/ringkasan dan badge nav.
 */
export function reportWeekOf(now: Date = new Date()) {
  const thisWeek = weeklyDeadlines(now)
  const anchor = now >= thisWeek.handoverBy ? now : new Date(isoWeekStart(now).getTime() - 3 * 86400000)
  const dl = weeklyDeadlines(anchor)
  const wk = isoWeekOf(anchor)
  const cur = isoWeekOf(now)
  return { ...wk, anchor, handoverBy: dl.handoverBy, lockAt: dl.lockAt, current: wk.isoWeek === cur.isoWeek && wk.isoYear === cur.isoYear }
}

export const MIGRATION_PENDING_MESSAGE = 'Fitur ini menunggu pembaruan basis data. Hubungi Tim TI.'

export type WeeklyReportRef = { id: string; entityId: string; divisionId: string; statusHeader: string; submittedAt: Date | null; isoYear: number; isoWeek: number }

/**
 * Hubungan akun dengan satu laporan mingguan:
 *  - READER : pengawas dalam cakupan entitas (menulis tanggapan, menandai dibaca)
 *  - HEAD   : kepala divisi pemilik laporan (membaca & membalas tanggapan)
 *  - ADMIN  : Admin PT di PT laporan (membaca saja)
 *  - MASTER : TI (membaca saja; Super Admin sudah READER)
 * null = di luar cakupan (dijawab 404 agar keberadaannya tidak bocor).
 */
export type WeeklyRelation = 'READER' | 'HEAD' | 'ADMIN' | 'MASTER'

export async function weeklyRelation(user: SessionUser, report: WeeklyReportRef): Promise<WeeklyRelation | null> {
  if (isWeeklyReader(user.role)) {
    const scope = await scopeEntityIds(user)
    return scope === null || scope.includes(report.entityId) ? 'READER' : null
  }
  if (user.role === 'KEPALA_DIVISI') {
    const d = await db.division.findUnique({ where: { id: report.divisionId }, select: { headUserId: true } })
    return d?.headUserId === user.id ? 'HEAD' : null
  }
  if (user.role === 'ADMIN_PT') return user.scopeEntityId === report.entityId ? 'ADMIN' : null
  if (isMasterRole(user.role)) return 'MASTER'
  return null
}

export async function loadWeeklyReport(id: unknown): Promise<WeeklyReportRef | null> {
  if (typeof id !== 'string' || !id || id.length > 64) return null
  return db.weeklyDivisionReport.findUnique({
    where: { id },
    select: { id: true, entityId: true, divisionId: true, statusHeader: true, submittedAt: true, isoYear: true, isoWeek: true },
  })
}

/** Laporan sudah diserahkan (bukan draf yang belum pernah dikirim). */
export const weeklySubmitted = (r: { statusHeader: string; submittedAt: Date | null }) => Boolean(r.submittedAt) || r.statusHeader !== 'DRAFT'

/**
 * Boleh memutuskan permintaan persetujuan di `entityId`? Direktur entitas hanya
 * di cakupannya; Manajemen, Direksi holding, Super Admin, dan TI seluruh grup.
 */
export async function canDecideApprovalIn(user: SessionUser, entityId: string, scope?: string[] | null): Promise<boolean> {
  if (!isApprovalDecider(user.role)) return false
  if (user.role !== 'DIREKTUR_ENTITAS') return true
  const ids = scope === undefined ? await scopeEntityIds(user) : scope
  return ids === null || ids.includes(entityId)
}

/** Saringan `where` untuk permintaan yang boleh diputuskan akun ini (tanpa status). */
export async function decidableWhere(user: SessionUser): Promise<Record<string, unknown> | null> {
  if (!isApprovalDecider(user.role)) return null
  const base = { requestedById: { not: user.id } }
  if (user.role !== 'DIREKTUR_ENTITAS') return base
  const ids = await scopeEntityIds(user)
  return ids === null ? base : { ...base, entityId: { in: ids } }
}

/** Nama akun untuk sekumpulan id (tabel 0023 tanpa relasi Prisma). */
export async function namesOf(ids: (string | null | undefined)[]): Promise<Map<string, { name: string; role: string }>> {
  const uniq = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (uniq.length === 0) return new Map()
  const rows = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, role: true } })
  return new Map(rows.map((r) => [r.id, { name: r.name, role: r.role }]))
}

export type ApprovalRow = {
  id: string
  type: string
  title: string
  description: string | null
  amount: bigint | null
  entityId: string
  divisionId: string | null
  projectId: string | null
  requestedById: string
  startDate: Date | null
  endDate: Date | null
  status: string
  decidedById: string | null
  decidedAt: Date | null
  decisionNote: string | null
  fileName: string | null
  fileMime: string | null
  fileSize: number | null
  createdAt: Date
}

export const APPROVAL_SELECT = {
  id: true, type: true, title: true, description: true, amount: true, entityId: true, divisionId: true, projectId: true,
  requestedById: true, startDate: true, endDate: true, status: true, decidedById: true, decidedAt: true, decisionNote: true,
  fileName: true, fileMime: true, fileSize: true, createdAt: true,
} as const

/** Bentuk JSON permintaan persetujuan untuk klien (BigInt → number, nama pihak). */
export async function shapeApprovals(rows: ApprovalRow[]) {
  if (rows.length === 0) return []
  const [names, entities, divisions, projects] = await Promise.all([
    namesOf(rows.flatMap((r) => [r.requestedById, r.decidedById])),
    db.entity.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.entityId))] } }, select: { id: true, name: true, code: true } }),
    db.division.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.divisionId).filter((v): v is string => Boolean(v)))] } },
      select: { id: true, name: true },
    }),
    db.project.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.projectId).filter((v): v is string => Boolean(v)))] } },
      select: { id: true, name: true },
    }),
  ])
  const ent = new Map(entities.map((e) => [e.id, e]))
  const div = new Map(divisions.map((d) => [d.id, d.name]))
  const prj = new Map(projects.map((p) => [p.id, p.name]))
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    amount: r.amount === null ? null : Number(r.amount),
    entityId: r.entityId,
    entityName: ent.get(r.entityId)?.name ?? '',
    entityCode: ent.get(r.entityId)?.code ?? '',
    divisionId: r.divisionId,
    divisionName: r.divisionId ? (div.get(r.divisionId) ?? null) : null,
    projectId: r.projectId,
    projectName: r.projectId ? (prj.get(r.projectId) ?? null) : null,
    requestedById: r.requestedById,
    requester: names.get(r.requestedById)?.name ?? 'Pengaju',
    requesterRole: names.get(r.requestedById)?.role ?? null,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    decidedBy: r.decidedById ? (names.get(r.decidedById)?.name ?? null) : null,
    decidedById: r.decidedById,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
    file: r.fileName ? { name: r.fileName, mime: r.fileMime, size: r.fileSize } : null,
    createdAt: r.createdAt,
  }))
}

export type ApprovalJson = Awaited<ReturnType<typeof shapeApprovals>>[number]

/**
 * Akses percakapan catatan proyek (/api/project-notes): PIC, kepala divisi
 * pelaksana, Admin PT (aturan lama), ditambah pengawas dalam cakupan PT
 * (Manajemen, Direktur entitas, Direksi holding, Super Admin, TI) supaya
 * "Kirim catatan ke PIC" dari detail proyek memakai percakapan yang sama.
 */
export async function guardNoteAccess(user: SessionUser, projectId: unknown): Promise<ProjectGuard> {
  const guard = await guardProjectAccess(user, projectId, [...NOTE_RELATIONS, 'VIEWER', 'MASTER'])
  if (!guard.ok) return guard
  if ((guard.relation === 'VIEWER' || guard.relation === 'MASTER') && !isProjectOverseer(user.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Proyek ini di luar tanggung jawab Anda' }, { status: 403 }) }
  }
  return guard
}
