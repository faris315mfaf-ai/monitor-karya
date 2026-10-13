'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Pengambil data kecil untuk kartu Admin PT. Tiap kartu memuat datanya
 * sendiri supaya gagal satu kartu tidak menjatuhkan seluruh layar.
 */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  // Selesai untuk kunci (url + muat ulang) mana; `loading` diturunkan darinya supaya
  // url yang baru terpasang (mis. Sheet dibuka) tidak sempat tampil "kosong" tanpa memuat.
  const [doneKey, setDoneKey] = useState<string | null>(null)
  const key = url ? `${url}#${tick}` : null

  useEffect(() => {
    if (!url || !key) return
    let alive = true
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as T & { error?: string }
        if (!alive) return
        if (!res.ok) {
          setError(json.error || 'Data belum termuat')
          setData(null)
        } else {
          setError(null)
          setData(json)
        }
      })
      .catch(() => alive && setError('Tidak dapat menghubungi server'))
      .finally(() => alive && setDoneKey(key))
    return () => {
      alive = false
    }
  }, [url, key])

  const reload = useCallback(() => {
    setTick((t) => t + 1)
  }, [])
  const loading = key !== null && doneKey !== key
  return { data, setData, error, loading, reload }
}

export async function send(url: string, method: string, body?: unknown, opts?: { keepalive?: boolean }) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      keepalive: opts?.keepalive,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, error: res.ok ? null : ((json.error as string) || 'Gagal'), json }
  } catch {
    return { ok: false, status: 0, error: 'Tidak dapat menghubungi server', json: {} as Record<string, unknown> }
  }
}
