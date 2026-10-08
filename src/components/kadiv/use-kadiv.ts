'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KadivTeam, ReviewQueue } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof (j as { error?: unknown }).error === 'string' ? (j as { error: string }).error : 'Data belum termuat')
  return j as T
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof (j as { error?: unknown }).error === 'string' ? (j as { error: string }).error : 'Belum berhasil. Coba lagi.')
  return j as T
}

/**
 * Data tim & antrean review kepala divisi. Keduanya dimuat terpisah: bila
 * salah satu gagal (mis. migrasi 0015 belum dijalankan), layar lain tetap
 * tampil dan kartu yang gagal menulis alasannya.
 */
export function useKadivData(divisionId?: string | null) {
  const [team, setTeam] = useState<KadivTeam | null>(null)
  const [review, setReview] = useState<ReviewQueue | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const n = ++seq.current
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : ''
    const [t, r] = await Promise.allSettled([getJson<KadivTeam>(`/api/kadiv/team${q}`), getJson<ReviewQueue>(`/api/outputs/review${q}`)])
    if (n !== seq.current) return
    if (t.status === 'fulfilled') {
      setTeam(t.value)
      setTeamError(null)
    } else setTeamError(t.reason instanceof Error ? t.reason.message : 'Data tim belum termuat')
    if (r.status === 'fulfilled') {
      setReview(r.value)
      setReviewError(null)
    } else setReviewError(r.reason instanceof Error ? r.reason.message : 'Antrean review belum termuat')
    setLoading(false)
  }, [divisionId])

  useEffect(() => {
    // Muat awal & saat divisi berganti; setState terjadi setelah fetch selesai.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { team, review, setReview, teamError, reviewError, loading, reload: load }
}

export type KadivDataCtl = ReturnType<typeof useKadivData>
