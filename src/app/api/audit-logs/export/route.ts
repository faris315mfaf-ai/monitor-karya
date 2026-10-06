import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { auditScopeWhere } from '@/lib/audit-scope'
import { AUDIT_TARGET_LABELS, auditLabel } from '@/lib/audit-labels'
import { csvRow } from '@/lib/admin-compliance'
import { ROLE_LABELS } from '@/lib/constants'
import { hit, tooManyRequests } from '@/lib/security'

/**
 * "Unduh log" [F2-ADMIN] (04-admin-pt.md §8): log aktivitas sebagai CSV.
 *
 *   GET ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&action=
 *
 * Cakupan sama dengan log aktivitas (src/lib/audit-scope.ts): Admin PT hanya
 * akun di PT-nya; peran `audit:read` sesuai cakupannya. Kolom IP & perangkat
 * hanya untuk peran `audit:read`. Rentang bawaan 30 hari terakhir, paling
 * panjang 366 hari, paling banyak MAX_ROWS baris (terbaru dulu). Setiap sel
 * aman dari CSV injection (csvCell). Setiap unduhan tercatat EXPORT_AUDIT_LOG.
 */

export const dynamic = 'force-dynamic'

const MAX_ROWS = 5000
const DAY = 86400000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ACTION_RE = /^[A-Z_]{1,64}$/

/** Tanggal WIB "YYYY-MM-DD" → tengah malam WIB (UTC). */
function wibDay(s: string): Date | null {
  if (!DATE_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const wibStamp = (d: Date) => {
  const w = new Date(d.getTime() + 7 * 3600000)
  return `${w.toISOString().slice(0, 10)} ${w.toISOString().slice(11, 19)}`
}

function summary(afterData: string | null): string {
  if (!afterData) return ''
  try {
    const v = JSON.parse(afterData) as Record<string, unknown>
    if (typeof v.message === 'string') return v.message
    if (typeof v.name === 'string') return v.name
    if (typeof v.pic === 'string') return `PIC ${v.pic}`
    return ''
  } catch {
    return ''
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const scope = await auditScopeWhere(user)
  if (!scope) return NextResponse.json({ error: 'Peran Anda tidak mengunduh log aktivitas' }, { status: 403 })
  const rate = hit(`audit-export:${user.id}`, 10, 10 * 60_000)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu sering mengunduh log. Coba lagi sebentar lagi.')

  const sp = req.nextUrl.searchParams
  const now = new Date()
  const fromRaw = sp.get('dateFrom')
  const toRaw = sp.get('dateTo')
  const from = fromRaw ? wibDay(fromRaw) : new Date(now.getTime() - 30 * DAY)
  const toDay = toRaw ? wibDay(toRaw) : null
  if (from === null || (toRaw && toDay === null)) return NextResponse.json({ error: 'Format tanggal tidak valid (YYYY-MM-DD).' }, { status: 400 })
  const to = toDay ? new Date(toDay.getTime() + DAY - 1) : now
  if (to < from) return NextResponse.json({ error: 'Tanggal akhir harus setelah tanggal awal.' }, { status: 422 })
  if (to.getTime() - from.getTime() > 366 * DAY) return NextResponse.json({ error: 'Rentang paling panjang 366 hari.' }, { status: 422 })
  const action = sp.get('action') || ''
  if (action && !ACTION_RE.test(action)) return NextResponse.json({ error: 'Aksi tidak dikenali.' }, { status: 400 })

  try {
    const where = { AND: [scope.where, { at: { gte: from, lte: to } }, action ? { action } : {}] }
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        take: MAX_ROWS,
        select: {
          at: true,
          action: true,
          targetType: true,
          targetId: true,
          afterData: true,
          ip: true,
          userAgent: true,
          actor: { select: { name: true, role: true } },
        },
      }),
      db.auditLog.count({ where }),
    ])

    const head = ['Waktu (WIB)', 'Pelaku', 'Peran pelaku', 'Aksi', 'Kode aksi', 'Jenis sasaran', 'ID sasaran', 'Keterangan']
    if (scope.full) head.push('IP', 'Perangkat')
    const lines = [csvRow(head)]
    for (const r of rows) {
      const cells: unknown[] = [
        wibStamp(r.at),
        r.actor?.name ?? 'Sistem',
        r.actor ? (ROLE_LABELS[r.actor.role] ?? r.actor.role) : '',
        auditLabel(r.action),
        r.action,
        AUDIT_TARGET_LABELS[r.targetType] ?? r.targetType,
        r.targetId,
        summary(r.afterData).slice(0, 500),
      ]
      if (scope.full) cells.push(r.ip ?? '', (r.userAgent ?? '').slice(0, 200))
      lines.push(csvRow(cells))
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'EXPORT_AUDIT_LOG',
        targetType: 'AUDIT_LOG',
        targetId: user.scopeEntityId ?? 'GRUP',
        afterData: JSON.stringify({ from: from.toISOString(), to: to.toISOString(), action: action || null, rows: rows.length, total }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
      },
    })

    const name = `log-aktivitas-${wibStamp(now).slice(0, 10)}.csv`
    // BOM supaya Excel membaca UTF-8 (nama berhuruf non-ASCII tetap utuh).
    return new NextResponse('﻿' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Total-Rows': String(total),
        'X-Exported-Rows': String(rows.length),
      },
    })
  } catch (err) {
    return serverError(err, 'Log belum bisa diunduh. Coba lagi.', 'audit-logs/export GET')
  }
}
