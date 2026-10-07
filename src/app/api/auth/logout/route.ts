import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearSessionCookie, readSessionToken, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const payload = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  let revoked = true
  if (payload) {
    try {
      await db.authSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    } catch {
      revoked = false
      console.error('[auth] pencabutan sesi gagal')
    }
    if (revoked) await db.auditLog.create({
      data: {
        actorId: payload.sub,
        action: 'LOGOUT',
        targetType: 'USER',
        targetId: payload.sub,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
      },
    }).catch(() => { console.error('[auth] audit keluar gagal') })
  }

  const res = NextResponse.json(revoked ? { ok: true } : {
    error: 'Cookie telah dihapus, tetapi sesi server belum berhasil dicabut. Hubungi admin untuk menyetel ulang kata sandi.',
  }, { status: revoked ? 200 : 503 })
  clearSessionCookie(res)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
