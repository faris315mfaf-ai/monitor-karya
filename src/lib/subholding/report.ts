import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { wibDateKey } from '@/lib/lock'
import { safeEvidenceUrl } from '@/lib/security'
import {
  adminCanEdit,
  adminCanWithdraw,
  reporterTitle,
  SH_EVIDENCE_TARGET,
} from '@/lib/subholding/rules'
import { ownsSubholding } from '@/lib/subholding/scope'

/**
 * Bentuk baca `ShReport` (kontrak 16 Okt 2026) dan pemuatannya secara
 * berkelompok: satu kueri per tabel (entitas, akun, komentar, bukti) untuk
 * seluruh halaman, bukan per laporan.
 */

type Client = Prisma.TransactionClient | typeof db

export type ShEvidence = { id: string; fileName: string; mime: string; size: number; url: string | null }

export type ShComment = {
  id: string
  kind: string
  body: string
  authorName: string
  authorRole: string
  createdAt: string
  /** Waktu suntingan terakhir oleh penulis; null bila belum pernah. */
  editedAt: string | null
  mine: boolean
}

export type ShReport = {
  id: string
  subholdingId: string
  subholdingName: string
  ptId: string
  ptName: string
  reportDate: string
  kegiatan: string
  deskripsi: string
  reporterName: string
  reporterTitleKind: string
  reporterTitleField: string
  reporterTitle: string
  status: string
  submittedAt: string
  decidedAt: string | null
  decidedByName: string | null
  evidenceCount: number
  evidence: ShEvidence[]
  comments: ShComment[]
  canEdit: boolean
  canWithdraw: boolean
  /**
   * Sorotan supervisor untuk manajemen (0035). HANYA dikirim ke akun pemegang
   * `shreport:review` (Supervisor, Super Admin); Admin subholding tidak
   * menerima kolom ini sama sekali.
   */
  highlight?: boolean
  highlightNote?: string | null
  highlightedAt?: string | null
}

/** Kolom yang dibaca dari SubholdingReport untuk membangun ShReport. */
export const SH_REPORT_SELECT = {
  id: true,
  subholdingId: true,
  ptId: true,
  reportDate: true,
  kegiatan: true,
  deskripsi: true,
  reporterName: true,
  reporterTitleKind: true,
  reporterTitleField: true,
  status: true,
  createdById: true,
  submittedAt: true,
  decidedById: true,
  decidedAt: true,
  highlight: true,
  highlightNote: true,
  highlightedAt: true,
} as const

export type ShReportRow = {
  id: string
  subholdingId: string
  ptId: string
  reportDate: Date
  kegiatan: string
  deskripsi: string
  reporterName: string
  reporterTitleKind: string
  reporterTitleField: string
  status: string
  createdById: string
  submittedAt: Date
  decidedById: string | null
  decidedAt: Date | null
  highlight?: boolean
  highlightNote?: string | null
  highlightedAt?: Date | null
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : null

/** Hak ubah/tarik laporan untuk akun yang membaca. */
export function editRights(viewer: SessionUser, row: Pick<ShReportRow, 'subholdingId' | 'status'>) {
  if (viewer.role === 'SUPERADMIN') return { canEdit: true, canWithdraw: true }
  if (!ownsSubholding(viewer, row.subholdingId)) return { canEdit: false, canWithdraw: false }
  return { canEdit: adminCanEdit(row.status), canWithdraw: adminCanWithdraw(row.status) }
}

/** Bukti per laporan (urut unggah), dikelompokkan menurut id laporan. */
export async function evidenceByReport(ids: string[], client: Client = db): Promise<Map<string, ShEvidence[]>> {
  const out = new Map<string, ShEvidence[]>()
  if (!ids.length) return out
  const rows = await client.evidence.findMany({
    where: { targetType: SH_EVIDENCE_TARGET, targetId: { in: ids } },
    select: { id: true, targetId: true, fileName: true, mime: true, size: true, url: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const e of rows) {
    const list = out.get(e.targetId) ?? []
    list.push({ id: e.id, fileName: e.fileName, mime: e.mime, size: e.size, url: e.url ? safeEvidenceUrl(e.url) : null })
    out.set(e.targetId, list)
  }
  return out
}

/** Akun ini boleh melihat sorotan + catatannya di bentuk ShReport? */
export function seesHighlight(viewer: Pick<SessionUser, 'role'>): boolean {
  return can(viewer.role, 'shreport:review')
}

/**
 * Membangun ShReport[] (urutan masukan dipertahankan). Kolom sorotan hanya
 * disertakan untuk pemegang `shreport:review` (lihat `seesHighlight`).
 */
export async function hydrateShReports(
  rows: ShReportRow[],
  viewer: SessionUser,
  client: Client = db
): Promise<ShReport[]> {
  if (!rows.length) return []
  const withHighlight = seesHighlight(viewer)
  const ids = rows.map((r) => r.id)
  const entityIds = Array.from(new Set(rows.flatMap((r) => [r.subholdingId, r.ptId])))

  const [entities, comments, evidence] = await Promise.all([
    client.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } }),
    client.subholdingReportComment.findMany({
      where: { reportId: { in: ids } },
      select: { id: true, reportId: true, authorId: true, kind: true, body: true, createdAt: true, editedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    evidenceByReport(ids, client),
  ])

  const userIds = Array.from(
    new Set([
      ...rows.map((r) => r.decidedById).filter((x): x is string => !!x),
      ...comments.map((c) => c.authorId),
    ])
  )
  const users = userIds.length
    ? await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
    : []

  const entityName = new Map(entities.map((e) => [e.id, e.name]))
  const userById = new Map(users.map((u) => [u.id, u]))
  const commentsByReport = new Map<string, ShComment[]>()
  for (const c of comments) {
    const author = userById.get(c.authorId)
    const list = commentsByReport.get(c.reportId) ?? []
    list.push({
      id: c.id,
      kind: c.kind,
      body: c.body,
      authorName: author?.name ?? 'Akun dihapus',
      authorRole: author?.role ?? '',
      createdAt: iso(c.createdAt)!,
      editedAt: iso(c.editedAt),
      mine: c.authorId === viewer.id,
    })
    commentsByReport.set(c.reportId, list)
  }

  return rows.map((r) => {
    const ev = evidence.get(r.id) ?? []
    return {
      id: r.id,
      subholdingId: r.subholdingId,
      subholdingName: entityName.get(r.subholdingId) ?? '',
      ptId: r.ptId,
      ptName: entityName.get(r.ptId) ?? '',
      reportDate: wibDateKey(new Date(r.reportDate)),
      kegiatan: r.kegiatan,
      deskripsi: r.deskripsi,
      reporterName: r.reporterName,
      reporterTitleKind: r.reporterTitleKind,
      reporterTitleField: r.reporterTitleField,
      reporterTitle: reporterTitle(r.reporterTitleKind, r.reporterTitleField),
      status: r.status,
      submittedAt: iso(r.submittedAt)!,
      decidedAt: iso(r.decidedAt),
      decidedByName: r.decidedById ? (userById.get(r.decidedById)?.name ?? null) : null,
      evidenceCount: ev.length,
      evidence: ev,
      comments: commentsByReport.get(r.id) ?? [],
      ...editRights(viewer, r),
      ...(withHighlight
        ? { highlight: !!r.highlight, highlightNote: r.highlightNote ?? null, highlightedAt: iso(r.highlightedAt) }
        : {}),
    }
  })
}

/** Satu laporan sebagai ShReport, atau null bila tidak ada. */
export async function loadShReport(id: string, viewer: SessionUser, client: Client = db): Promise<ShReport | null> {
  const row = await client.subholdingReport.findUnique({ where: { id }, select: SH_REPORT_SELECT })
  if (!row) return null
  const [report] = await hydrateShReports([row], viewer, client)
  return report
}

/** Hitungan per status untuk saringan yang sama (tanpa saringan status). */
export async function statusCounts(
  where: Prisma.SubholdingReportWhereInput,
  client: Client = db
): Promise<{ MENUNGGU: number; PERLU_PERBAIKAN: number; DISETUJUI: number }> {
  const groups = await client.subholdingReport.groupBy({ by: ['status'], where, _count: { _all: true } })
  const counts = { MENUNGGU: 0, PERLU_PERBAIKAN: 0, DISETUJUI: 0 }
  for (const g of groups) {
    if (g.status in counts) counts[g.status as keyof typeof counts] = g._count._all
  }
  return counts
}
