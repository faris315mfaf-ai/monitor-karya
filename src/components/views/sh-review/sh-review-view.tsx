'use client'

/**
 * Persetujuan Supervisor (papan S-Tablet-* dan S-Ponsel-*, kanvas
 * "Supervisor — tablet & ponsel", 16 Okt 2026). Pengalih: layar ponsel
 * (< 600px) atau split view tablet/desktop. Keduanya memakai status yang
 * sama (use-review.ts) dan bagian keputusan yang sama (decision.tsx).
 *
 * Sorotan: sakelar "Tandai untuk manajemen" + catatan wajib 5–280 →
 * "Setujui & sorot"; laporan disetujui yang disorot memakai lencana bintang.
 *
 * Data: GET /api/sh/review, POST /api/sh/reports/:id/comments,
 * POST /api/sh/reports/:id/decision.
 */

import { useSyncExternalStore } from 'react'
import { ReviewPhone } from './phone'
import { ReviewSplit } from './split'

const COMPACT = '(max-width: 599.98px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(COMPACT)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Lebar ponsel; di server dianggap bukan ponsel (dikoreksi saat hidrasi). */
function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(COMPACT).matches, () => false)
}

export function ShReviewView() {
  return useCompact() ? <ReviewPhone /> : <ReviewSplit />
}
