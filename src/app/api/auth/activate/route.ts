import { NextRequest, NextResponse } from 'next/server'
import { activationConsumeLimit, activationError, consumeAccountActivation } from '@/lib/account-activation'
import { clientIp } from '@/lib/security'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const limited = activationConsumeLimit(ip)
  if (limited) return limited
  const body = await req.json().catch(() => null)
  if (!body || typeof body.token !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Tautan dan kata sandi wajib diisi.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const tokenLimit = activationConsumeLimit(ip, body.token)
  if (tokenLimit) return tokenLimit
  try {
    const result = await consumeAccountActivation(body.token, body.password, ip)
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return activationError(err)
  }
}
