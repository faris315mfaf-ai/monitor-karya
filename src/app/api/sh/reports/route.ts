import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { startOfWibDay } from '@/lib/lock'
import { withIdempotency } from '@/lib/idempotency'
import { dateParam, readJsonObject, requireShUser, unprocessable } from '@/lib/subholding/http'
import { hydrateShReports, SH_REPORT_SELECT, statusCounts } from '@/lib/subholding/report'
import { isShStatus, parseShReportInput, SH_LIMITS } from '@/lib/subholding/rules'
import { ptInSubholding, requireShAdmin } from '@/lib/subholding/scope'
import { auditSh, notifyShReviewers } from '@/lib/subholding/notify'

const IDEMPOTENT_ROUTE = 'POST /api/sh/reports'
const DAY_MS = 86_400_000

/**
 * GET /api/sh/reports?from&to&ptId&status&q&page&pageSize (ADMIN_SUBHOLDING)
 * Laporan subholding akun sendiri; bawaan from = to = hari ini (WIB).
 * → { items: ShReport[], total, page, pageSize, counts: { MENUNGGU, PERLU_PERBAIKAN, DISETUJUI } }
 * `counts` memakai saringan yang sama TANPA saringan status.
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const sub = await requireShAdmin(user)
  if (sub instanceof NextResponse) return sub

  const sp = req.nextUrl.searchParams
  const today = startOfWibDay()
  const from = dateParam(sp.get('from'), today)
  const to = dateParam(sp.get('to'), from === 'invalid' ? today : from)
  if (from === 'invalid' || to === 'invalid' || !from || !to) return unprocessable('Tanggal harus berformat YYYY-MM-DD')
  if (to.getTime() < from.getTime()) return unprocessable('Tanggal akhir tidak boleh sebelum tanggal awal')
  if ((to.getTime() - from.getTime()) / DAY_MS > SH_LIMITS.maxRangeDays) {
    return unprocessable(`Rentang tanggal maksimal ${SH_LIMITS.maxRangeDays} hari`)
  }
  const statusRaw = sp.get('status')?.trim() || ''
  if (statusRaw && !isShStatus(statusRaw)) return unprocessable('Status tidak dikenal')
  const ptId = sp.get('ptId')?.trim().slice(0, 64) || ''
  const q = sp.get('q')?.trim().slice(0, 100) || ''
  const page = Math.min(1000, Math.max(1, parseInt(sp.get('page') || '1', 10) || 1))
  const pageSize = Math.min(SH_LIMITS.maxPageSize, Math.max(1, parseInt(sp.get('pageSize') || '', 10) || SH_LIMITS.pageSize))

  const base: Prisma.SubholdingReportWhereInput = {
    subholdingId: sub.id,
    reportDate: { gte: from, lte: to },
    ...(ptId ? { ptId } : {}),
    ...(q
      ? {
          OR: [
            { kegiatan: { contains: q, mode: 'insensitive' } },
            { deskripsi: { contains: q, mode: 'insensitive' } },
            { reporterName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const where: Prisma.SubholdingReportWhereInput = statusRaw ? { AND: [base, { status: statusRaw }] } : base

  try {
    const [rows, total, counts] = await Promise.all([
      db.subholdingReport.findMany({
        where,
        select: SH_REPORT_SELECT,
        orderBy: [{ reportDate: 'desc' }, { submittedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.subholdingReport.count({ where }),
      statusCounts(base),
    ])
    const items = await hydrateShReports(rows, user)
    return NextResponse.json({ items, total, page, pageSize, counts })
  } catch (err) {
    return serverError(err, 'Laporan belum termuat. Coba lagi.', 'sh/reports GET')
  }
}

/**
 * POST /api/sh/reports (ADMIN_SUBHOLDING) — isian 1–5:
 * { kegiatan, deskripsi, ptId, reporterName, reporterTitleKind: 'MANAJER'|'KEPALA', reporterTitleField }
 * → 201 { report: ShReport } (status MENUNGGU, reportDate = hari ini WIB).
 * Header opsional `Idempotency-Key`: ulangan dibalas respons pertama.
 * Bukti diunggah sesudahnya (POST /api/evidence/upload | /api/evidence,
 * targetType 'SUBHOLDING_REPORT', targetId = report.id).
 */
export async function POST(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const sub = await requireShAdmin(user)
  if (sub instanceof NextResponse) return sub

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body
  const parsed = parseShReportInput(body)
  if (!parsed.ok) return unprocessable(parsed.error, parsed.field)
  const input = parsed.data

  let created: { id: string; kegiatan: string; ptName: string } | null = null
  try {
    const res = await withIdempotency(req, user.id, IDEMPOTENT_ROUTE, async (tx) => {
      const pt = await ptInSubholding(sub, input.ptId, tx)
      if (!pt) return unprocessable('PT pelaksana harus PT aktif di subholding Anda', 'ptId')
      const now = new Date()
      const row = await tx.subholdingReport.create({
        data: {
          subholdingId: sub.id,
          ptId: pt.id,
          reportDate: startOfWibDay(now),
          kegiatan: input.kegiatan,
          deskripsi: input.deskripsi,
          reporterName: input.reporterName,
          reporterTitleKind: input.reporterTitleKind,
          reporterTitleField: input.reporterTitleField,
          status: 'MENUNGGU',
          createdById: user.id,
          submittedAt: now,
        },
        select: SH_REPORT_SELECT,
      })
      await auditSh(tx, req, user, 'CREATE_SH_REPORT', row.id, { after: { ...input, subholdingId: sub.id } })
      const [report] = await hydrateShReports([row], user, tx)
      created = { id: row.id, kegiatan: row.kegiatan, ptName: pt.name }
      return NextResponse.json({ report }, { status: 201 })
    })
    const done = created as { id: string; kegiatan: string; ptName: string } | null
    if (done && res.status === 201) {
      await notifyShReviewers('SH_LAPORAN_BARU', {
        title: `Laporan baru dari ${sub.name}`,
        body: `${done.ptName}: ${done.kegiatan}`,
        tab: 'sh-review',
        reportId: done.id,
      })
    }
    return res
  } catch (err) {
    return serverError(err, 'Laporan gagal disimpan. Coba lagi.', 'sh/reports POST')
  }
}
