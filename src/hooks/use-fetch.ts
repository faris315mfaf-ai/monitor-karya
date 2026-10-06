'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type FetchState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  url: string | null
}

/** Turns a failed response into a message worth showing a user. */
async function describeFailure(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // Not JSON — fall through to the generic message.
  }
  if (res.status === 403) return 'Anda tidak memiliki akses ke data ini'
  if (res.status === 404) return 'Data tidak ditemukan'
  if (res.status >= 500) return 'Server sedang bermasalah. Coba beberapa saat lagi.'
  return `Gagal memuat data (HTTP ${res.status})`
}

/**
 * Fetch helper that returns data, loading, and error states.
 * Re-fetches when the URL changes.
 *
 * All setState calls happen inside async fetch callbacks (Promise
 * .then/.catch), never synchronously in the effect body, to comply
 * with React 19's react-hooks/set-state-in-effect rule.
 *
 * When the URL changes, we derive `loading=true` for the first render
 * of the new URL by comparing it to the state.url — no setState in
 * the effect body is needed.
 *
 * A 401 means the session is gone, so the browser is sent to the sign-in
 * page rather than each view rendering its own "unauthorized" error.
 */
export function useFetch<T>(url: string | null) {
  const router = useRouter()
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: !!url,
    error: null,
    url: null,
  })
  // Muat ulang diam-diam (tanpa kerangka memuat) setelah sebuah tindakan.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false

    fetch(url)
      .then(async (r) => {
        if (r.status === 401) {
          // Session expired, or signed out in another tab.
          router.replace('/login')
          router.refresh()
          return
        }
        if (!r.ok) throw new Error(await describeFailure(r))
        const json = await r.json()
        if (!cancelled) {
          setState({ data: json as T, loading: false, error: null, url })
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: e.message || 'Gagal memuat data', url })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, router, tick])

  // Derive loading: if the URL has changed since the last fetch completed,
  // we are effectively loading (waiting for the new fetch to resolve).
  const isLoading = url !== state.url ? !!url : state.loading

  return { data: state.data, loading: isLoading, error: state.error, reload: () => setTick((t) => t + 1) }
}
