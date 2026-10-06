import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'
import { parseWibDateKey, startOfWibDay, wibDateKey } from '@/lib/lock'
import { auditPic, readJson, str } from '@/lib/pic-access'
import { ATTENDANCE_STATUSES, DAY, canManageDivision, ledDivisions, teamUserIds } from '@/lib/kadiv'
import type { AttendanceStatus } from '@/components/kadiv/types'

/**
 * Kehadiran / cuti (03-kepala-divisi.md: cincin "Fajar cuti"). Hari tanpa baris
 * dianggap HADIR. Orang berstatus CUTI/SAKIT/IZIN tidak dihitung di penyebut
 * laporan harian tim (src/lib/kadiv.ts).
 *
 *   GET    ?divisionId=&from=&to=   — kehadiran tim divisi (kepala divisinya, Admin PT
 *                                     PT-nya, Super Admin/TI); tanpa divisionId = milik sendiri.
 *                                     from/to "YYYY-MM-DD" WIB, paling lebar 62 hari.
 *   POST   { userId, date?, status, note? }
 *                                   — catat/ubah. Mengembalikan `previous` agar toast
 *                                     "Urungkan" bisa mengembalikannya.
 *   DELETE ?userId=&date=           — hapus catatan (kembali dianggap hadir).
 *
 * Yang boleh mencatat: kepala divisi tim orang itu, Admin PT di PT orang itu,
 * Super Admin/TI. Orang tidak mencatat kehadirannya sendiri (cuti mengeluarkannya
 * dari penyebut laporan harian). Rentang tanggal: 31 hari ke belakang
 * sampai 90 hari ke depan (rencana cuti).
 */

const MAX_RANGE_DAYS = 62

function dateOrToday(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return startOfWibDay(new Date())
  return parseWibDateKey(raw)
}

function inWindow(d: Date) {
  const today = startOfWibDay(new Date()).getTime()
  return d.getTime() >= today - 31 * DAY && d.getTime() <= today + 90 * DAY
}

/**
 * Boleh mencatat kehadiran `targetId`? Tidak untuk diri sendiri: status cuti
 * mengeluarkan orang dari penyebut laporan harian, jadi dicatat atasannya.
 */
async function canRecordFor(user: SessionUser, targetId: string): Promise<boolean> {
  if (targetId === user.id) return isMasterRole(user.role)
  if (isMasterRole(user.role)) return true
  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, isActive: true, divisionId: true, scopeEntityId: true } })
  if (!target || !target.isActive) return false
  if (user.role === 'ADMIN_PT' && user.scopeEntityId && target.scopeEntityId === user.scopeEntityId) return true
  if (target.divisionId && (await canManageDivision(user, target.divisionId))) return true
  for (const d of await ledDivisions(user.id)) {
    if ((await teamUserIds(d)).includes(targetId)) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  const from = dateOrToday(sp.get('from'))
  const to = sp.get('to') ? parseWibDateKey(sp.get('to')) : from
  if (!from || !to || to < from || (to.getTime() - from.getTime()) / DAY > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Rentang tanggal tidak valid (paling lebar ${MAX_RANGE_DAYS} hari)` }, { status: 400 })
  }
  try {
    let ids: string[] = [user.id]
    const divisionId = sp.get('divisionId')
    if (divisionId) {
      const div = await canManageDivision(user, divisionId)
      if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
      ids = await teamUserIds(div)
    }
    const rows = await db.attendance.findMany({
      where: { userId: { in: ids }, date: { gte: from, lte: to } },
      select: { userId: true, date: true, status: true, note: true, user: { select: { name: true } } },
      orderBy: [{ date: 'asc' }],
    })
    return NextResponse.json({
      from: wibDateKey(from),
      to: wibDateKey(to),
      rows: rows.map((r) => ({ userId: r.userId, name: r.user.name, date: wibDateKey(r.date), status: r.status, note: r.note })),
    })
  } catch (err) {
    console.error('[attendance] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kehadiran belum termuat' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const targetId = str(body, 'userId', 64) || user.id
  const status = str(body, 'status', 10) as AttendanceStatus
  const note = str(body, 'note', 300) || null
  const date = dateOrToday(body.date)
  if (!ATTENDANCE_STATUSES.includes(status)) return NextResponse.json({ error: 'Status kehadiran tidak dikenal' }, { status: 422 })
  if (!date || !inWindow(date)) return NextResponse.json({ error: 'Tanggal di luar rentang yang boleh dicatat' }, { status: 422 })

  try {
    if (!(await canRecordFor(user, targetId))) {
      const msg = targetId === user.id ? 'Kehadiran Anda dicatat oleh kepala divisi atau Admin PT' : 'Orang ini di luar tim Anda'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const previous = await db.attendance.findUnique({ where: { userId_date: { userId: targetId, date } }, select: { status: true, note: true } })
    const row = await db.attendance.upsert({
      where: { userId_date: { userId: targetId, date } },
      create: { userId: targetId, date, status, note, recordedById: user.id },
      update: { status, note, recordedById: user.id },
      select: { userId: true, date: true, status: true, note: true, user: { select: { name: true } } },
    })
    await auditPic(req, user, 'SET_ATTENDANCE', 'USER', targetId, { name: row.user.name, date: wibDateKey(date), status }, previous ?? undefined)
    return NextResponse.json({
      ok: true,
      row: { userId: row.userId, name: row.user.name, date: wibDateKey(row.date), status: row.status, note: row.note },
      previous,
    })
  } catch (err) {
    console.error('[attendance] POST:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kehadiran belum tersimpan' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  const targetId = sp.get('userId') || user.id
  const date = dateOrToday(sp.get('date'))
  if (!date || !inWindow(date)) return NextResponse.json({ error: 'Tanggal tidak valid' }, { status: 422 })
  try {
    if (!(await canRecordFor(user, targetId))) return NextResponse.json({ error: 'Orang ini di luar tim Anda' }, { status: 403 })
    const res = await db.attendance.deleteMany({ where: { userId: targetId, date } })
    if (res.count) await auditPic(req, user, 'SET_ATTENDANCE', 'USER', targetId, { date: wibDateKey(date), status: 'HADIR', cleared: true })
    return NextResponse.json({ ok: true, removed: res.count })
  } catch (err) {
    console.error('[attendance] DELETE:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kehadiran belum terhapus' }, { status: 500 })
  }
}
