import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'
import { isWorkingDay, parseWibDateKey, startOfWibDay, wibDateKey } from '@/lib/lock'
import { auditPic, notifyInApp, projectDivisionIds, projectScopeWhere, readJson } from '@/lib/pic-access'
import { entityDirectors, ledDivisions } from '@/lib/kadiv'
import { cleanText, hit, tooManyRequests } from '@/lib/security'
import { serverError } from '@/lib/api-error'
import {
  APPROVAL_LIMITS, APPROVAL_TYPES, APPROVAL_TYPE_LABELS, UNDO_WINDOW_MINUTES, formatAmountShort, isApprovalRequester,
  type ApprovalType,
} from '@/lib/oversight-shared'
import {
  APPROVAL_SELECT, MIGRATION_PENDING_MESSAGE, canDecideApprovalIn, decidableWhere, isMissingTable, shapeApprovals,
} from '@/lib/oversight'

/**
 * [F2-DIREKTUR] Persetujuan materi, anggaran, dan cuti (01-manajemen.md
 * "Persetujuan menunggu", 02-direktur.md "Eskalasi dari kepala divisi").
 *
 *   GET   ?mine=1     — permintaan yang saya ajukan (50 terakhir) + pilihan formulir
 *   GET   (bawaan)    — permintaan DIAJUKAN yang boleh saya putuskan
 *   GET   ?decided=1  — keputusan 14 hari terakhir dalam cakupan pemutus
 *   POST              — ajukan { type, title, description?, amount?, divisionId?, projectId?, startDate?, endDate? }
 *   PATCH             — { id, action: approve | reject | withdraw | reopen | undo, note? }
 *
 * Pengaju: kepala divisi (untuk divisinya) dan PIC (untuk proyeknya / dirinya).
 * Pemutus: Direktur entitas di PT dalam cakupannya; Manajemen, Direksi holding,
 * Super Admin, dan TI untuk seluruh grup. Pengaju tidak memutuskan miliknya.
 * Cuti yang disetujui dicatat sebagai Attendance CUTI per hari kerja; "Urungkan"
 * (15 menit, oleh pemutus yang sama) mengembalikan permintaan ke DIAJUKAN dan
 * menghapus catatan cuti yang dibuatnya. Berkas: ./berkas/route.ts.
 */

const DAY = 86400000
const UNDO_MS = UNDO_WINDOW_MINUTES * 60000

async function formOptions(user: SessionUser) {
  const divisions = user.role === 'KEPALA_DIVISI' ? await ledDivisions(user.id) : []
  const projects = await db.project.findMany({
    where: { lifecycle: 'AKTIF', ...(await projectScopeWhere(user)) },
    select: { id: true, name: true, code: true, entityId: true },
    orderBy: { name: 'asc' },
    take: 60,
  })
  return {
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, entityName: d.entityName })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  try {
    if (sp.get('mine') === '1') {
      const canRequest = isApprovalRequester(user.role)
      const rows = canRequest
        ? await db.approvalRequest.findMany({
            where: { requestedById: user.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: APPROVAL_SELECT,
          })
        : []
      return NextResponse.json({
        canRequest,
        undoMinutes: UNDO_WINDOW_MINUTES,
        options: canRequest ? await formOptions(user) : { divisions: [], projects: [] },
        items: await shapeApprovals(rows),
      })
    }

    const where = await decidableWhere(user)
    if (!where) return NextResponse.json({ canDecide: false, items: [] })
    const decided = sp.get('decided') === '1'
    const rows = await db.approvalRequest.findMany({
      where: decided
        ? { ...where, status: { in: ['DISETUJUI', 'DITOLAK'] }, decidedAt: { gte: new Date(Date.now() - 14 * DAY) } }
        : { ...where, status: 'DIAJUKAN' },
      orderBy: decided ? { decidedAt: 'desc' } : { createdAt: 'asc' },
      take: 100,
      select: APPROVAL_SELECT,
    })
    return NextResponse.json({ canDecide: true, undoMinutes: UNDO_WINDOW_MINUTES, items: await shapeApprovals(rows) })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ canDecide: false, canRequest: false, items: [], pendingMigration: true })
    return serverError(err, 'Persetujuan belum termuat. Coba lagi.', 'approval-requests GET')
  }
}

/** Jumlah rupiah: bilangan bulat positif; null bila kosong; 'bad' bila tidak sah. */
function readAmount(raw: unknown): number | null | 'bad' {
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/[^\d]/g, '')) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > APPROVAL_LIMITS.amount) return 'bad'
  return n
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!isApprovalRequester(user.role)) {
    return NextResponse.json({ error: 'Permintaan persetujuan diajukan kepala divisi atau PIC proyek' }, { status: 403 })
  }
  const rate = hit(`approval-request:${user.id}`, 20, 10 * 60000)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak permintaan dalam waktu singkat. Coba lagi sebentar lagi.')

  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const bad = (error: string) => NextResponse.json({ error }, { status: 422 })

  const type = cleanText(body.type, 20) as ApprovalType
  if (!(APPROVAL_TYPES as readonly string[]).includes(type)) return bad('Pilih jenis persetujuan: materi, anggaran, atau cuti')
  let title = cleanText(body.title, APPROVAL_LIMITS.title)
  const description = cleanText(body.description, APPROVAL_LIMITS.description) || null
  const amount = readAmount(body.amount)
  if (amount === 'bad') return bad('Nominal harus angka rupiah yang wajar, tanpa desimal')
  if (type === 'ANGGARAN' && amount === null) return bad('Tulis nominal anggaran yang diminta')
  if (type === 'CUTI' && amount !== null) return bad('Permintaan cuti tidak memakai nominal')

  // ---- Tanggal cuti
  let startDate: Date | null = null
  let endDate: Date | null = null
  if (type === 'CUTI') {
    startDate = parseWibDateKey(body.startDate)
    endDate = parseWibDateKey(body.endDate || body.startDate)
    if (!startDate || !endDate) return bad('Pilih tanggal mulai dan selesai cuti')
    if (endDate < startDate) return bad('Tanggal selesai cuti tidak boleh sebelum tanggal mulai')
    const today = startOfWibDay(new Date()).getTime()
    if (startDate.getTime() < today - 7 * DAY || startDate.getTime() > today + 120 * DAY) {
      return bad('Tanggal mulai cuti paling jauh 7 hari ke belakang atau 120 hari ke depan')
    }
    const days = Math.round((endDate.getTime() - startDate.getTime()) / DAY) + 1
    if (days > APPROVAL_LIMITS.leaveDays) return bad(`Satu permintaan cuti paling lama ${APPROVAL_LIMITS.leaveDays} hari`)
    if (!title) title = `Cuti ${days} hari`
  }
  if (title.length < 5) return bad('Judul minimal 5 huruf, mis. "Materi video Kampanye Oktober"')

  try {
    // ---- Proyek (opsional) harus dalam tanggung jawab pengaju
    const projectIdRaw = cleanText(body.projectId, 64)
    const project = projectIdRaw
      ? await db.project.findFirst({
          where: { id: projectIdRaw, ...(await projectScopeWhere(user)) },
          select: { id: true, name: true, entityId: true, picUserId: true, targetEndDate: true, divisionId: true },
        })
      : null
    if (projectIdRaw && !project) return NextResponse.json({ error: 'Proyek ini di luar tanggung jawab Anda' }, { status: 403 })

    // ---- Divisi & PT
    let entityId: string | null = null
    let divisionId: string | null = null
    if (user.role === 'KEPALA_DIVISI') {
      const led = await ledDivisions(user.id)
      const wanted = cleanText(body.divisionId, 64)
      const div = wanted ? led.find((d) => d.id === wanted) : led[0]
      if (!div) return NextResponse.json({ error: wanted ? 'Divisi ini bukan divisi Anda' : 'Anda belum memimpin divisi aktif' }, { status: 403 })
      divisionId = div.id
      entityId = div.entityId
      if (project && project.entityId !== div.entityId) return bad('Proyek ini milik PT lain')
    } else {
      if (project) {
        entityId = project.entityId
        divisionId = (await projectDivisionIds({ ...project, name: project.name }))[0] ?? null
      } else {
        const me = await db.user.findUnique({ where: { id: user.id }, select: { scopeEntityId: true, divisionId: true } })
        entityId = me?.scopeEntityId ?? null
        divisionId = me?.divisionId ?? null
      }
      if (!entityId) return NextResponse.json({ error: 'Akun Anda belum ditautkan ke PT mana pun' }, { status: 403 })
    }

    const open = await db.approvalRequest.count({ where: { requestedById: user.id, status: 'DIAJUKAN' } })
    if (open >= 20) return NextResponse.json({ error: 'Masih ada 20 permintaan yang menunggu. Tunggu sebagian diputuskan dulu.' }, { status: 409 })

    const created = await db.approvalRequest.create({
      data: {
        type, title, description, amount: amount === null ? null : BigInt(amount),
        entityId, divisionId, projectId: project?.id ?? null, requestedById: user.id, startDate, endDate,
      },
      select: APPROVAL_SELECT,
    })
    await auditPic(req, user, 'CREATE_APPROVAL_REQUEST', 'APPROVAL_REQUEST', created.id, {
      type, title, amount, projectId: project?.id ?? null, divisionId, startDate: startDate && wibDateKey(startDate), endDate: endDate && wibDateKey(endDate),
    })

    // Pemutus utama: Direktur entitas PT itu (atau induk terdekat); bila tidak ada, Manajemen.
    let deciders = (await entityDirectors(entityId)).map((d) => ({ id: d.id, email: d.email }))
    if (deciders.length === 0) {
      deciders = await db.user.findMany({ where: { role: 'MANAJEMEN', isActive: true }, select: { id: true, email: true } })
    }
    await notifyInApp(deciders.filter((d) => d.id !== user.id), 'APPROVAL_REQUEST', {
      title: `Persetujuan ${APPROVAL_TYPE_LABELS[type].toLowerCase()} · ${title}`,
      body: `${user.name} meminta persetujuan${amount !== null ? ` ${formatAmountShort(amount)}` : ''}.`,
      tab: 'approvals',
      projectId: project?.id,
      actorName: user.name,
    })

    const [item] = await shapeApprovals([created])
    return NextResponse.json({ ok: true, item }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Permintaan belum terkirim. Coba lagi.', 'approval-requests POST')
  }
}

/** Hari kerja (tengah malam WIB) dari start s.d. end. */
function workingDays(start: Date, end: Date): Date[] {
  const out: Date[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const d = new Date(t)
    if (isWorkingDay(d)) out.push(startOfWibDay(d))
  }
  return out
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const id = cleanText(body.id, 64)
  const action = cleanText(body.action, 20)
  const note = cleanText(body.note, APPROVAL_LIMITS.note) || null

  try {
    const cur = id ? await db.approvalRequest.findUnique({ where: { id }, select: { ...APPROVAL_SELECT, appliedData: true, updatedAt: true } }) : null
    // Di luar cakupan dijawab sama dengan tidak ada.
    const scope = await scopeEntityIds(user)
    const visible =
      cur &&
      (cur.requestedById === user.id || isMasterRole(user.role) || scope === null || scope.includes(cur.entityId))
    if (!cur || !visible) return NextResponse.json({ error: 'Permintaan tidak ditemukan' }, { status: 404 })
    const now = new Date()

    // ---- Pengaju: tarik / buka lagi (Urungkan penarikan)
    if (action === 'withdraw' || action === 'reopen') {
      if (cur.requestedById !== user.id) return NextResponse.json({ error: 'Hanya pengaju yang bisa mengubah permintaan ini' }, { status: 403 })
      if (action === 'reopen' && now.getTime() - cur.updatedAt.getTime() > UNDO_MS) {
        return NextResponse.json({ error: 'Batas waktu urungkan sudah lewat. Ajukan permintaan baru.' }, { status: 409 })
      }
      const res = await db.approvalRequest.updateMany({
        where: { id, status: action === 'withdraw' ? 'DIAJUKAN' : 'DITARIK' },
        data: { status: action === 'withdraw' ? 'DITARIK' : 'DIAJUKAN' },
      })
      if (res.count === 0) return NextResponse.json({ error: 'Status permintaan sudah berubah' }, { status: 409 })
      await auditPic(req, user, action === 'withdraw' ? 'WITHDRAW_APPROVAL_REQUEST' : 'REOPEN_APPROVAL_REQUEST', 'APPROVAL_REQUEST', id, {
        status: action === 'withdraw' ? 'DITARIK' : 'DIAJUKAN',
      }, { status: cur.status })
      return NextResponse.json({ ok: true })
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'undo') {
      return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
    }
    if (cur.requestedById === user.id) {
      return NextResponse.json({ error: 'Permintaan Anda sendiri diputuskan oleh pihak lain' }, { status: 403 })
    }
    if (!(await canDecideApprovalIn(user, cur.entityId, scope))) {
      return NextResponse.json({ error: 'Peran Anda tidak memutuskan permintaan ini' }, { status: 403 })
    }

    // ---- Urungkan keputusan sendiri (15 menit)
    if (action === 'undo') {
      if (cur.decidedById !== user.id || !cur.decidedAt) {
        return NextResponse.json({ error: 'Hanya keputusan Anda sendiri yang bisa diurungkan' }, { status: 403 })
      }
      if (now.getTime() - cur.decidedAt.getTime() > UNDO_MS) {
        return NextResponse.json({ error: `Keputusan hanya bisa diurungkan dalam ${UNDO_WINDOW_MINUTES} menit` }, { status: 409 })
      }
      const applied = cur.appliedData ? (JSON.parse(cur.appliedData) as { attendance?: string[] }) : {}
      const ok = await db.$transaction(async (tx) => {
        const r = await tx.approvalRequest.updateMany({
          where: { id, status: cur.status, decidedById: user.id },
          data: { status: 'DIAJUKAN', decidedById: null, decidedAt: null, decisionNote: null, appliedData: null },
        })
        if (r.count === 0) return false
        const dates = (applied.attendance ?? []).map((k) => parseWibDateKey(k)).filter((d): d is Date => Boolean(d))
        if (dates.length) {
          await tx.attendance.deleteMany({ where: { userId: cur.requestedById, date: { in: dates }, status: 'CUTI', recordedById: user.id } })
        }
        return true
      })
      if (!ok) return NextResponse.json({ error: 'Status permintaan sudah berubah' }, { status: 409 })
      await auditPic(req, user, 'UNDO_APPROVAL_DECISION', 'APPROVAL_REQUEST', id, { status: 'DIAJUKAN' }, { status: cur.status, note: cur.decisionNote })
      return NextResponse.json({ ok: true })
    }

    // ---- Setujui / tolak
    if (cur.status !== 'DIAJUKAN') return NextResponse.json({ error: 'Permintaan ini sudah diputuskan' }, { status: 409 })
    if (action === 'reject' && (!note || note.length < 5)) {
      return NextResponse.json({ error: 'Tulis alasan penolakan untuk pengaju, minimal 5 huruf' }, { status: 422 })
    }
    const status = action === 'approve' ? 'DISETUJUI' : 'DITOLAK'
    const result = await db.$transaction(async (tx) => {
      const r = await tx.approvalRequest.updateMany({
        where: { id, status: 'DIAJUKAN' },
        data: { status, decidedById: user.id, decidedAt: now, decisionNote: note },
      })
      if (r.count === 0) return null
      const created: string[] = []
      if (action === 'approve' && cur.type === 'CUTI' && cur.startDate && cur.endDate) {
        const days = workingDays(cur.startDate, cur.endDate)
        const existing = await tx.attendance.findMany({
          where: { userId: cur.requestedById, date: { in: days } },
          select: { date: true },
        })
        const taken = new Set(existing.map((e) => e.date.getTime()))
        const fresh = days.filter((d) => !taken.has(d.getTime()))
        if (fresh.length) {
          await tx.attendance.createMany({
            data: fresh.map((date) => ({
              userId: cur.requestedById, date, status: 'CUTI', note: cur.title.slice(0, 300), recordedById: user.id,
            })),
            skipDuplicates: true,
          })
          created.push(...fresh.map((d) => wibDateKey(d)))
        }
        await tx.approvalRequest.update({ where: { id }, data: { appliedData: JSON.stringify({ attendance: created }) } })
      }
      return { created }
    })
    if (!result) return NextResponse.json({ error: 'Permintaan ini baru saja diputuskan' }, { status: 409 })

    await auditPic(req, user, action === 'approve' ? 'APPROVE_APPROVAL_REQUEST' : 'REJECT_APPROVAL_REQUEST', 'APPROVAL_REQUEST', id, {
      status, note, type: cur.type, amount: cur.amount === null ? null : Number(cur.amount), attendance: result.created,
    }, { status: 'DIAJUKAN' })

    const requester = await db.user.findUnique({ where: { id: cur.requestedById }, select: { id: true, email: true, isActive: true } })
    if (requester?.isActive) {
      await notifyInApp([requester], 'APPROVAL_DECIDED', {
        title: `${APPROVAL_TYPE_LABELS[cur.type as ApprovalType] ?? 'Permintaan'} ${action === 'approve' ? 'disetujui' : 'ditolak'} · ${cur.title}`,
        body: note ? `${user.name}: ${note}` : `Diputuskan oleh ${user.name}.`,
        tab: 'work-desk',
        projectId: cur.projectId ?? undefined,
        actorName: user.name,
      })
    }
    return NextResponse.json({ ok: true, status, undoMinutes: UNDO_WINDOW_MINUTES })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Keputusan belum tersimpan. Coba lagi.', 'approval-requests PATCH')
  }
}
