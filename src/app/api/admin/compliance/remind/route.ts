import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { serverError } from '@/lib/api-error'
import { limitReminders } from '@/lib/security'
import { DAILY_CUTOFF_LABEL, isDailyLocked, startOfWibDay } from '@/lib/lock'
import { DAILY_PIC_TEMPLATE, remindPicsDaily, type RemindActor } from '@/lib/reminders-pic'
import { groupProjectsByDivision, scopeDivisions, scopeProjects } from '@/lib/admin-compliance-server'

/**
 * Pengingat laporan harian per orang / per divisi / semua [F2-ADMIN]
 * (04-admin-pt.md, Sheet divisi: "Ingatkan" per orang dan "Ingatkan semua";
 * hero: "Kirim pengingat ke semua").
 *
 *   POST { userId }       — ingatkan satu orang untuk semua proyeknya yang belum terkirim
 *   POST { divisionId }   — ingatkan semua orang divisi itu yang belum lapor
 *   POST { all: true }    — ingatkan semua PIC di PT Anda yang belum lapor
 *
 * Satu pengingat per proyek per hari, apa pun sumbernya (manual, Meja kerja,
 * atau pengingat otomatis) — aturan & teksnya di src/lib/reminders-pic.ts.
 * Setiap pengingat yang terkirim tercatat sebagai REMIND_PIC di AuditLog.
 * Hanya proyek di PT akun yang menekan (anti-IDOR).
 */

export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'notify:remind') && !can(user.role, 'daily:forward')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengirim pengingat' }, { status: 403 })
  }
  if (!user.scopeEntityId) {
    return NextResponse.json({ error: 'Pengingat dikirim dari akun yang terikat pada satu PT.' }, { status: 403 })
  }
  const limited = limitReminders(user.id, 'admin-compliance')
  if (limited) return limited

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const divisionId = typeof body.divisionId === 'string' ? body.divisionId : ''
  const all = body.all === true
  if ([!!userId, !!divisionId, all].filter(Boolean).length !== 1) {
    return NextResponse.json({ error: 'Pilih satu orang, satu divisi, atau semua.' }, { status: 400 })
  }
  if ((userId && !ID_RE.test(userId)) || (divisionId && !ID_RE.test(divisionId))) {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const now = new Date()
  const today = startOfWibDay(now)
  if (isDailyLocked(today, now)) {
    return NextResponse.json({ error: `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`, locked: true }, { status: 409 })
  }

  try {
    // Pengingat hanya untuk proyek di PT akun ini (sama dengan /api/work-desk).
    const entityIds = [user.scopeEntityId]
    const projects = (await scopeProjects(entityIds)).filter((p) => p.picUser?.isActive)
    let targets: string[]
    if (userId) {
      targets = projects.filter((p) => p.picUserId === userId).map((p) => p.id)
      if (targets.length === 0) return NextResponse.json({ error: 'Orang ini tidak memegang proyek aktif di perusahaan Anda.' }, { status: 404 })
    } else if (divisionId) {
      const divisions = await scopeDivisions(entityIds)
      const div = divisions.find((d) => d.id === divisionId)
      if (!div) return NextResponse.json({ error: 'Divisi tidak ditemukan di perusahaan Anda.' }, { status: 404 })
      const byDiv = groupProjectsByDivision(projects, divisions.map((d) => ({ id: d.id, entityId: d.entityId, headUserId: d.headUserId })))
      const people = new Set<string>()
      for (const pid of byDiv.get(div.id) ?? []) {
        const p = projects.find((x) => x.id === pid)
        if (p?.picUserId) people.add(p.picUserId)
      }
      for (const m of div.members) people.add(m.id)
      targets = projects.filter((p) => p.picUserId && people.has(p.picUserId)).map((p) => p.id)
    } else {
      targets = projects.map((p) => p.id)
    }

    // Orang yang sedang cuti/sakit/izin hari ini tidak diingatkan.
    const picOf = new Map(projects.map((p) => [p.id, p.picUserId!]))
    const away = await db.attendance.findMany({
      where: { userId: { in: Array.from(new Set(targets.map((t) => picOf.get(t)!))) }, date: today, status: { in: ['CUTI', 'SAKIT', 'IZIN'] } },
      select: { userId: true },
    })
    const awaySet = new Set(away.map((a) => a.userId))
    if (userId && awaySet.has(userId)) {
      return NextResponse.json({ error: 'Orang ini tercatat cuti atau izin hari ini.' }, { status: 409 })
    }
    targets = targets.filter((t) => !awaySet.has(picOf.get(t)!))

    const actor: RemindActor = { kind: 'user', id: user.id, name: user.name, role: user.role, scopeEntityId: user.scopeEntityId }
    const meta = {
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    }
    const { sent, skipped } = await remindPicsDaily(actor, targets, today, meta)
    const people = Array.from(new Map(sent.map((s) => [picOf.get(s.projectId)!, { userId: picOf.get(s.projectId)!, name: s.picName, remindedAt: s.remindedAt }])).values())

    if (userId && people.length === 0) {
      // Semua proyeknya sudah terkirim atau sudah diingatkan hari ini.
      const already = await db.notificationLog.findFirst({
        where: { template: DAILY_PIC_TEMPLATE, userId, createdAt: { gte: today } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
      return NextResponse.json(
        { error: already ? 'Orang ini sudah diingatkan hari ini.' : 'Semua laporannya hari ini sudah terkirim.', remindedAt: already?.createdAt ?? null },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true, people, sent: sent.length, skipped })
  } catch (err) {
    return serverError(err, 'Pengingat belum terkirim. Coba lagi.', 'admin/compliance/remind POST')
  }
}
