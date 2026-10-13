import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, refuseUnscoped, isGlobalRole, scopeEntityIds } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { clientIp } from '@/lib/security'
import { DEFAULT_SETTINGS } from '@/lib/report-settings'

export const dynamic = 'force-dynamic'

/** GET /api/admin/report-settings — pengaturan aturan pelaporan. */
export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  // [T12] Gerbang peran sama dengan PUT. Satu-satunya pemanggil GET adalah kartu aturan
  // di tab Statistik (hanya Admin PT / TI / Super Admin), jadi UI tak terdampak; peran lain
  // (PIC, kepala divisi, dst.) tak lagi bisa membaca kebijakan kunci PT lewat API.
  if (!can(user.role, 'daily:forward') && !can(user.role, 'companies:manage')) {
    return NextResponse.json({ error: 'Peran Anda tidak membuka aturan pelaporan.' }, { status: 403 })
  }
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
  // [T13] Peran global (scopeIds null) tidak dibatasi cakupan: pastikan PT-nya ada
  // (kalau tidak, upsert gagal FK dan 500 setelah transaksi audit berjalan).
  if (!scopeIds) {
    const exists = await db.entity.findUnique({ where: { id: entityId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Perusahaan tidak ditemukan.' }, { status: 404 })
  }
  const dailyCutoffHour = body.dailyCutoffHour === null ? null : typeof body.dailyCutoffHour === 'number' ? Math.max(0, Math.min(23, Math.round(body.dailyCutoffHour))) : undefined
  const weeklyCutoffHour = body.weeklyCutoffHour === null ? null : typeof body.weeklyCutoffHour === 'number' ? Math.max(0, Math.min(23, Math.round(body.weeklyCutoffHour))) : undefined
  // [T13] Hari kerja = nomor hari ISO 1 (Senin)..7 (Minggu): bilangan bulat, unik, maksimum 7
  // elemen. Kosong tetap sah (= setiap hari, keputusan pemilik). Nilai ganjil → 422,
  // bukan disaring diam-diam atau memicu galat Prisma 500.
  let workingDays: number[] | undefined
  if (body.workingDays !== undefined) {
    const raw = body.workingDays
    if (!Array.isArray(raw) || raw.length > 7 || !raw.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7)) {
      return NextResponse.json({ error: 'Hari kerja harus berupa angka 1 (Senin) sampai 7 (Minggu), tanpa duplikat.' }, { status: 422 })
    }
    const unique = Array.from(new Set(raw as number[])).sort((a, b) => a - b)
    if (unique.length !== raw.length) {
      return NextResponse.json({ error: 'Hari kerja harus berupa angka 1 (Senin) sampai 7 (Minggu), tanpa duplikat.' }, { status: 422 })
    }
    workingDays = unique
  }
  const dailyOpen = typeof body.dailyOpen === 'boolean' ? body.dailyOpen : undefined
  const weeklyOpen = typeof body.weeklyOpen === 'boolean' ? body.weeklyOpen : undefined

  const data: Record<string, unknown> = {}
  if (dailyCutoffHour !== undefined) data.dailyCutoffHour = dailyCutoffHour
  if (weeklyCutoffHour !== undefined) data.weeklyCutoffHour = weeklyCutoffHour
  if (workingDays !== undefined) data.workingDays = workingDays
  if (dailyOpen !== undefined) data.dailyOpen = dailyOpen
  if (weeklyOpen !== undefined) data.weeklyOpen = weeklyOpen

  // [T11-DB] Perubahan kebijakan kunci pelaporan dicatat (sebelum/sesudah) dalam
  // transaksi yang sama dengan upsert, seperti aksi administratif lain.
  const pick = (r: { dailyCutoffHour: number | null; weeklyCutoffHour: number | null; workingDays: number[]; dailyOpen: boolean; weeklyOpen: boolean } | null) =>
    r && {
      dailyCutoffHour: r.dailyCutoffHour,
      weeklyCutoffHour: r.weeklyCutoffHour,
      workingDays: r.workingDays,
      dailyOpen: r.dailyOpen,
      weeklyOpen: r.weeklyOpen,
    }
  const settings = await db.$transaction(async (tx) => {
    const before = await tx.reportSettings.findUnique({ where: { entityId } })
    // [N-01] Simpan pertama (belum ada baris): medan yang tidak dikirim harus tetap
    // bernilai aturan EFEKTIF saat ini, yaitu DEFAULT_SETTINGS yang dibaca semua gerbang
    // (17.00, Senin–Jumat, mingguan 17.00) — bukan bawaan kolom schema (workingDays [] =
    // setiap hari, cutoff null = 24/7) yang diam-diam mengubah aturan PT. Bila baris sudah
    // ada, `update` hanya menyentuh medan yang dikirim.
    const saved = await tx.reportSettings.upsert({
      where: { entityId },
      create: { entityId, ...DEFAULT_SETTINGS, workingDays: [...DEFAULT_SETTINGS.workingDays], ...data },
      update: data,
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'UPDATE_REPORT_SETTINGS',
        targetType: 'REPORT_SETTINGS',
        targetId: entityId,
        beforeData: before ? JSON.stringify(pick(before)) : null,
        afterData: JSON.stringify(pick(saved)),
        ip: clientIp(req),
      },
    })
    return saved
  })
  return NextResponse.json({ settings })
}
