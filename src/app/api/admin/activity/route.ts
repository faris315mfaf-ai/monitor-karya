import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { auditScopeWhere } from '@/lib/audit-scope'
import { ACTIVITY_HIDDEN, auditVerb, stripActor, type ActivityEntry } from '@/lib/audit-labels'
import { REMINDER_LABELS, type ReminderKind } from '@/lib/admin-meta'

/**
 * Log aktivitas di Ringkasan Admin PT [F2-ADMIN] (04-admin-pt.md §8): kalimat
 * singkat "<nama> <tindakan> <sasaran>", termasuk konfirmasi sakelar
 * pengingat ("Maya Lestari mematikan ringkasan untuk manajemen"). Tanpa IP,
 * perangkat, atau isi sebelum/sesudah — rincian itu hanya di tab Audit untuk
 * peran `audit:read`.
 *
 *   GET ?limit=1..50 (bawaan 20)
 */

export const dynamic = 'force-dynamic'

/** Pengingat PIC beruntun dari orang yang sama dalam rentang ini digabung jadi satu baris. */
const MERGE_MS = 5 * 60_000

function parse(json: string | null): Record<string, unknown> {
  if (!json) return {}
  try {
    const v = JSON.parse(json) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const scope = await auditScopeWhere(user)
  if (!scope) return NextResponse.json({ error: 'Peran Anda tidak membuka log aktivitas' }, { status: 403 })
  const limit = Math.max(1, Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20))

  try {
    const rows = await db.auditLog.findMany({
      where: { AND: [scope.where, { action: { notIn: Array.from(ACTIVITY_HIDDEN) } }] },
      orderBy: { at: 'desc' },
      take: limit * 4,
      select: { id: true, at: true, action: true, targetType: true, targetId: true, afterData: true, actor: { select: { id: true, name: true } } },
    })

    // Nama sasaran: proyek, akun, laporan harian (nama proyek), mingguan (divisi).
    const ids = (type: string) => Array.from(new Set(rows.filter((r) => r.targetType === type).map((r) => r.targetId))).slice(0, 200)
    const [projects, users, daily, weekly] = await Promise.all([
      ids('PROJECT').length ? db.project.findMany({ where: { id: { in: ids('PROJECT') } }, select: { id: true, name: true } }) : [],
      ids('USER').length ? db.user.findMany({ where: { id: { in: ids('USER') } }, select: { id: true, name: true } }) : [],
      ids('DAILY_REPORT').length
        ? db.dailyProjectReport.findMany({ where: { id: { in: ids('DAILY_REPORT') } }, select: { id: true, project: { select: { name: true } } } })
        : [],
      ids('WEEKLY_REPORT').length
        ? db.weeklyDivisionReport.findMany({ where: { id: { in: ids('WEEKLY_REPORT') } }, select: { id: true, isoWeek: true, division: { select: { name: true } } } })
        : [],
    ])
    const names = new Map<string, string>([
      ...projects.map((p) => [p.id, p.name] as [string, string]),
      ...users.map((u) => [u.id, u.name] as [string, string]),
      ...daily.map((d) => [d.id, d.project.name] as [string, string]),
      ...weekly.map((w) => [w.id, `Divisi ${w.division.name} M${w.isoWeek}`] as [string, string]),
    ])

    const out: ActivityEntry[] = []
    for (const r of rows) {
      const after = parse(r.afterData)
      const actorName = r.actor?.name ?? null
      let text: string
      if (typeof after.message === 'string' && after.message) {
        text = stripActor(after.message, actorName ?? 'Pengingat otomatis')
      } else if (r.action === 'AUTO_REMINDER') {
        const kind = (typeof after.kind === 'string' ? after.kind : '') as ReminderKind
        text = `mengirim ${REMINDER_LABELS[kind] ?? 'pengingat'}`
      } else {
        const target = names.get(r.targetId) ?? (r.action === 'REMIND_PIC' && typeof after.pic === 'string' ? after.pic : null)
        text = `${auditVerb(r.action)}${target ? ` ${target}` : ''}`
      }
      const prev = out[out.length - 1]
      if (
        prev &&
        r.action === 'REMIND_PIC' &&
        prev.action === 'REMIND_PIC' &&
        prev.actor?.id === r.actor?.id &&
        Date.parse(prev.at) - r.at.getTime() <= MERGE_MS * prev.count
      ) {
        prev.count += 1
        prev.text = `mengingatkan ${prev.count} PIC`
        continue
      }
      out.push({ id: r.id, at: r.at.toISOString(), action: r.action, actor: r.actor ? { id: r.actor.id, name: r.actor.name } : null, text, count: 1 })
      if (out.length >= limit) break
    }
    return NextResponse.json({ items: out })
  } catch (err) {
    return serverError(err, 'Log aktivitas belum termuat. Coba lagi.', 'admin/activity GET')
  }
}
