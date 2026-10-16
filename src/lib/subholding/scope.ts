import 'server-only'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { can, type Capability } from '@/lib/rbac'
import type { SessionUser } from '@/lib/auth'

/**
 * Cakupan model laporan subholding (16 Okt 2026).
 *
 * - Admin subholding terpaku pada SATU entitas SUB_HOLDING (`scopeEntityId`).
 *   PT yang boleh dilaporkannya = Entity `PT` aktif yang `path`-nya diawali
 *   path subholding itu (boleh lewat SECTOR/REGION di antaranya).
 * - Supervisor / Super Admin membaca semua subholding; Superuser & Manajemen
 *   hanya laporan DISETUJUI.
 */

type Client = Prisma.TransactionClient | typeof db

export type ShSubholding = { id: string; name: string; path: string }
export type ShPt = { id: string; code: string; name: string }

/** 403 bila peran tidak memegang kapabilitas ini, selain itu null. */
export function refuseWithoutCap(user: SessionUser, cap: Capability): NextResponse | null {
  if (can(user.role, cap)) return null
  return NextResponse.json({ error: 'Anda tidak memiliki akses ke fitur ini' }, { status: 403 })
}

/** 403 bila peran tidak memegang salah satu kapabilitas ini. */
export function refuseWithoutAnyCap(user: SessionUser, caps: Capability[]): NextResponse | null {
  if (caps.some((c) => can(user.role, c))) return null
  return NextResponse.json({ error: 'Anda tidak memiliki akses ke fitur ini' }, { status: 403 })
}

/** Subholding aktif milik akun Admin subholding ini, atau null. */
export async function subholdingOf(user: SessionUser, client: Client = db): Promise<ShSubholding | null> {
  if (user.role !== 'ADMIN_SUBHOLDING' || !user.scopeEntityId) return null
  const e = await client.entity.findUnique({
    where: { id: user.scopeEntityId },
    select: { id: true, name: true, path: true, type: true, isActive: true },
  })
  if (!e || e.type !== 'SUB_HOLDING' || !e.isActive || !e.path) return null
  return { id: e.id, name: e.name, path: e.path }
}

/**
 * Gerbang rute tulis Admin subholding: kapabilitas `shreport:write` + akun
 * tertaut ke subholding aktif. Mengembalikan subholding-nya atau respons 403.
 */
export async function requireShAdmin(user: SessionUser, client: Client = db): Promise<ShSubholding | NextResponse> {
  const refused = refuseWithoutCap(user, 'shreport:write')
  if (refused) return refused
  const sub = await subholdingOf(user, client)
  if (!sub) {
    return NextResponse.json(
      { error: 'Akun Anda belum ditautkan ke subholding aktif. Hubungi Super Admin.' },
      { status: 403 }
    )
  }
  return sub
}

/** PT aktif di bawah subholding (urut nama). */
export async function ptsOfSubholding(sub: Pick<ShSubholding, 'id' | 'path'>, client: Client = db): Promise<ShPt[]> {
  const rows = await client.entity.findMany({
    where: { type: 'PT', isActive: true, path: { startsWith: sub.path }, id: { not: sub.id } },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  })
  return rows
}

/** PT ini aktif dan berada di subholding? Mengembalikan PT-nya atau null. */
export async function ptInSubholding(
  sub: Pick<ShSubholding, 'id' | 'path'>,
  ptId: string,
  client: Client = db
): Promise<ShPt | null> {
  const pt = await client.entity.findUnique({
    where: { id: ptId },
    select: { id: true, code: true, name: true, type: true, path: true, isActive: true },
  })
  if (!pt || pt.type !== 'PT' || !pt.isActive || pt.id === sub.id || !pt.path?.startsWith(sub.path)) return null
  return { id: pt.id, code: pt.code, name: pt.name }
}

/** Semua PT aktif (urut nama) beserta path-nya — dipetakan ke subholding dengan `ptsUnder`. */
export async function activePts(client: Client = db): Promise<(ShPt & { path: string | null })[]> {
  return client.entity.findMany({
    where: { type: 'PT', isActive: true },
    select: { id: true, code: true, name: true, path: true },
    orderBy: { name: 'asc' },
  })
}

/** PT dari `pts` yang berada di bawah path subholding (aturan sama dengan `ptsOfSubholding`). */
export function ptsUnder<T extends { id: string; path: string | null }>(
  sub: Pick<ShSubholding, 'id' | 'path'>,
  pts: T[]
): T[] {
  if (!sub.path) return []
  return pts.filter((p) => p.id !== sub.id && !!p.path && p.path.startsWith(sub.path))
}

/** Semua subholding aktif (urut nama) beserta path-nya. */
export async function activeSubholdings(client: Client = db): Promise<ShSubholding[]> {
  return client.entity.findMany({
    where: { type: 'SUB_HOLDING', isActive: true },
    select: { id: true, name: true, path: true },
    orderBy: { name: 'asc' },
  })
}

/** Subholding pemilik laporan untuk akun ini (Admin subholding) — true bila cocok. */
export function ownsSubholding(user: Pick<SessionUser, 'role' | 'scopeEntityId'>, subholdingId: string): boolean {
  return user.role === 'ADMIN_SUBHOLDING' && !!user.scopeEntityId && user.scopeEntityId === subholdingId
}
