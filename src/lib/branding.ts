import 'server-only'

import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'

/**
 * Identitas visual yang menyertai sebuah sesi (14 Sep 2026): holding sebagai
 * "inisiator" sistem, dan perusahaan tempat akun ditempatkan. Logo berasal
 * dari Entity.logoData yang diunggah Super Admin; tanpa logo, UI memakai
 * monogram dari nama.
 */

export type Brand = { id: string; name: string; code: string; type: string; logoData: string | null }

export type Branding = {
  /** Holding / super-holding — pemrakarsa sistem. */
  holding: Brand | null
  /** Perusahaan tempat akun ditempatkan; null untuk peran tingkat grup. */
  entity: Brand | null
  /** Waktu masuk terakhir — kunci agar splash tampil sekali per masuk. */
  lastLoginAt: string | null
}

const select = { id: true, name: true, code: true, type: true, logoData: true } as const

/** Holding pertama yang aktif — yang dipakai halaman masuk (tanpa sesi). */
export async function loadPublicBranding(): Promise<{ holding: Brand | null }> {
  const holding = await db.entity.findFirst({ where: { type: 'HOLDING', isActive: true }, select, orderBy: { createdAt: 'asc' } })
  return { holding }
}

export async function loadBranding(user: SessionUser): Promise<Branding> {
  const [entity, row] = await Promise.all([
    user.scopeEntityId ? db.entity.findUnique({ where: { id: user.scopeEntityId }, select }) : Promise.resolve(null),
    db.user.findUnique({ where: { id: user.id }, select: { lastLoginAt: true } }),
  ])
  // Akun yang ditempatkan langsung di holding: holding-nya adalah entitasnya sendiri.
  const holding =
    entity?.type === 'HOLDING'
      ? entity
      : await db.entity.findFirst({ where: { type: 'HOLDING', isActive: true }, select, orderBy: { createdAt: 'asc' } })
  return { holding, entity, lastLoginAt: row?.lastLoginAt?.toISOString() ?? null }
}

export const EMPTY_BRANDING: Branding = { holding: null, entity: null, lastLoginAt: null }
