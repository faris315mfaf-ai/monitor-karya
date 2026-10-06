import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearSessionCookie, getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()

  if (user) {
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGOUT',
        targetType: 'USER',
        targetId: user.id,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: req.headers.get('user-agent') || null,
      },
    })
  }

  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
