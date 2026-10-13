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
  // Setiap data diberi kunci divisi: saat divisi berganti, data divisi lama tidak boleh tampil
  // (atau tetap tampil bila muat divisi baru gagal) di bawah nama divisi yang baru.
  const key = divisionId ?? ''
  const [teamBox, setTeamBox] = useState<{ key: string; value: KadivTeam } | null>(null)
  const [reviewBox, setReviewBox] = useState<{ key: string; value: ReviewQueue } | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const seq = useRef(0)
  // Divisi terkini: muat ulang dari penutup lama (mis. tombol "Urungkan" di toast) tetap memuat divisi yang sedang tampil.
  const current = useRef(divisionId ?? null)
  const team = teamBox?.key === key ? teamBox.value : null
  const review = reviewBox?.key === key ? reviewBox.value : null
  const loading = settledKey !== key

  const load = useCallback(async () => {
    const n = ++seq.current
    const div = current.current
    const loadKey = div ?? ''
    const q = div ? `?divisionId=${encodeURIComponent(div)}` : ''
    const [t, r] = await Promise.allSettled([getJson<KadivTeam>(`/api/kadiv/team${q}`), getJson<ReviewQueue>(`/api/outputs/review${q}`)])
    if (n !== seq.current) return
    if (t.status === 'fulfilled') {
      setTeamBox({ key: loadKey, value: t.value })
      setTeamError(null)
    } else setTeamError(t.reason instanceof Error ? t.reason.message : 'Data tim belum termuat')
    if (r.status === 'fulfilled') {
      setReviewBox({ key: loadKey, value: r.value })
      setReviewError(null)
    } else setReviewError(r.reason instanceof Error ? r.reason.message : 'Antrean review belum termuat')
    setSettledKey(loadKey)
  }, [])

  useEffect(() => {
    // Muat awal & saat divisi berganti; setState terjadi setelah fetch selesai.
    current.current = divisionId ?? null
    void load()
  }, [load, divisionId])

  return { team, review, teamError, reviewError, loading, reload: load }
}

export type KadivDataCtl = ReturnType<typeof useKadivData>
