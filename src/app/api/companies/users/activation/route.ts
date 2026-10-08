import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { activationAvailability, activationError, activationIssueLimit, issueAccountActivation } from '@/lib/account-activation'
import { clientIp } from '@/lib/security'

export async function GET(req: NextRequest) {
  const actor = await requireApiUser()
  if (actor instanceof NextResponse) return actor
  const userId = req.nextUrl.searchParams.get('id') ?? ''
  if (!userId || userId.length > 64) return NextResponse.json({ error: 'Akun tidak valid.' }, { status: 400 })
  try {
    const result = await activationAvailability(actor, userId)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return activationError(err) }
}

export async function POST(req: NextRequest) {
  const actor = await requireApiUser()
  if (actor instanceof NextResponse) return actor
  const body = await req.json().catch(() => null)
  if (typeof body?.userId !== 'string' || !body.userId || body.userId.length > 64) {
    return NextResponse.json({ error: 'Akun tidak valid.' }, { status: 400 })
  }
  const limited = activationIssueLimit(actor.id, body.userId)
  if (limited) return limited
  try {
    const activation = await db.$transaction((tx) => issueAccountActivation(tx, actor, body.userId, clientIp(req)))
    return NextResponse.json({ ok: true, activation }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return activationError(err) }
}
