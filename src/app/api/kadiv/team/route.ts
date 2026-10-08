import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { DAILY_CUTOFF_LABEL, isDailyLocked, startOfWibDay } from '@/lib/lock'
import { buildTeam, markMemberRead, pickLedDivision, remindTeam } from '@/lib/kadiv'
import { auditPic, readJson, str } from '@/lib/pic-access'
import { limitReminders } from '@/lib/security'

/**
 * Tim kepala divisi (03-kepala-divisi.md): laporan harian per anggota,
 * kehadiran, beban kerja, output harian per orang, tren output vs target, dan
 * aktivitas tim. Hanya untuk divisi yang dipimpin akun yang masuk.
 *
 *   GET  ?divisionId=                       — ringkasan tim (KadivTeam)
 *   POST { action: 'remind', userId?, divisionId? }
 *        — ingatkan anggota yang belum mengirim laporan harian (satu orang
 *          atau semua); sekali per proyek per hari, orang cuti dilewati.
 *   POST { action: 'read' | 'unread', userId, divisionId? }   [F2-KADIV]
 *        — tandai laporan harian hari ini milik satu anggota sudah dibaca
 *          (atau batalkan, dipakai toast "Urungkan"). Laporan tetap dikirim
 *          ke Admin PT; tanda ini hanya untuk kepala divisi.
 */

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  try {
    const team = await buildTeam(user, req.nextUrl.searchParams.get('divisionId'))
    if (!team) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    return NextResponse.json(team)
  } catch (err) {
    console.error('[kadiv/team] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Data tim belum termuat' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const action = str(body, 'action', 20)
  if (action === 'read' || action === 'unread') return markRead(req, user, body, action === 'read')
  if (action !== 'remind') return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  const limited = limitReminders(user.id, 'kadiv-team')
  if (limited) return limited

  if (isDailyLocked(startOfWibDay(new Date()))) {
    return NextResponse.json({ error: `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`, locked: true }, { status: 409 })
  }
  try {
    const { current } = await pickLedDivision(user, str(body, 'divisionId', 64) || null)
    if (!current) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const r = await remindTeam(user, current, str(body, 'userId', 64) || null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r)
  } catch (err) {
    console.error('[kadiv/team] POST:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Pengingat belum terkirim' }, { status: 500 })
  }
}

/** [F2-KADIV] Tandai / batalkan tanda baca laporan harian hari ini milik satu anggota. */
async function markRead(req: NextRequest, user: SessionUser, body: Record<string, unknown>, read: boolean) {
  const userId = str(body, 'userId', 64)
  if (!userId) return NextResponse.json({ error: 'Pilih anggota' }, { status: 400 })
  try {
    const { current } = await pickLedDivision(user, str(body, 'divisionId', 64) || null)
    if (!current) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const r = await markMemberRead(user, current, userId, read)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await auditPic(req, user, read ? 'KADIV_READ_DAILY' : 'KADIV_UNREAD_DAILY', 'USER', userId, { reportIds: r.reportIds, divisionId: current.id })
    return NextResponse.json({ ok: true, reportIds: r.reportIds })
  } catch (err) {
    console.error('[kadiv/team] read:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Tanda baca belum tersimpan' }, { status: 500 })
  }
}
