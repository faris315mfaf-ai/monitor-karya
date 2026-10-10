import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, refuseUnscoped, isGlobalRole, scopeEntityIds } from '@/lib/auth'
import { can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/** GET /api/admin/report-settings — pengaturan aturan pelaporan. */
export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const entityId = req.nextUrl.searchParams.get('entityId')
  const scopeIds = await scopeEntityIds(user)
  const targetId = (isGlobalRole(user.role) && entityId) ? entityId : user.scopeEntityId ?? entityId
  if (scopeIds && targetId && !scopeIds.includes(targetId)) {
    return NextResponse.json({ error: 'Di luar cakupan Anda.' }, { status: 403 })
  }
  const settings = await db.reportSettings.findUnique({ where: { entityId: targetId ?? '' } })
  return NextResponse.json({ settings })
}

/** PUT /api/admin/report-settings — simpan pengaturan. */
export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:forward') && !can(user.role, 'companies:manage')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengatur aturan pelaporan.' }, { status: 403 })
  }
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }
  const entityId = typeof body.entityId === 'string' ? body.entityId : ''
  if (!entityId) return NextResponse.json({ error: 'entityId wajib.' }, { status: 400 })
  const scopeIds = await scopeEntityIds(user)
  if (scopeIds && !scopeIds.includes(entityId)) {
    return NextResponse.json({ error: 'Di luar cakupan Anda.' }, { status: 403 })
  }
  const dailyCutoffHour = body.dailyCutoffHour === null ? null : typeof body.dailyCutoffHour === 'number' ? Math.max(0, Math.min(23, Math.round(body.dailyCutoffHour))) : undefined
  const weeklyCutoffHour = body.weeklyCutoffHour === null ? null : typeof body.weeklyCutoffHour === 'number' ? Math.max(0, Math.min(23, Math.round(body.weeklyCutoffHour))) : undefined
  const workingDays = Array.isArray(body.workingDays) ? body.workingDays.filter((d: unknown) => typeof d === 'number' && d >= 1 && d <= 7) : undefined
  const dailyOpen = typeof body.dailyOpen === 'boolean' ? body.dailyOpen : undefined
  const weeklyOpen = typeof body.weeklyOpen === 'boolean' ? body.weeklyOpen : undefined

  const data: Record<string, unknown> = {}
  if (dailyCutoffHour !== undefined) data.dailyCutoffHour = dailyCutoffHour
  if (weeklyCutoffHour !== undefined) data.weeklyCutoffHour = weeklyCutoffHour
  if (workingDays !== undefined) data.workingDays = workingDays
  if (dailyOpen !== undefined) data.dailyOpen = dailyOpen
  if (weeklyOpen !== undefined) data.weeklyOpen = weeklyOpen

  const settings = await db.reportSettings.upsert({
    where: { entityId },
    create: { entityId, ...data },
    update: data,
  })
  return NextResponse.json({ settings })
}
