'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type State<T> = {
  data: T | null
  loading: boolean
  error: string | null
  key: string | null
}

/**
 * Like `useFetch`, but for screens that write and then need to re-read — it
 * hands back a `reload()` the mutation handlers can call.
 *
 * Every setState happens inside a promise callback, never synchronously in the
 * effect body, so this satisfies React 19's `set-state-in-effect` rule. A 401
 * means the session is gone, so the browser goes to the sign-in page instead of
 * each view inventing its own "unauthorized" state.
 */
export function useResource<T>(url: string | null) {
  const router = useRouter()
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: !!url,
    error: null,
    key: null,
  })

  // Changing the key is what makes the effect re-run on reload().
  const key = url ? `${url}#${nonce}` : null

  useEffect(() => {
    if (!url || !key) return
    let cancelled = false

    fetch(url)
      .then(async (r) => {
        if (r.status === 401) {
          router.replace('/login')
          router.refresh()
          return
        }
        const json = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(json?.error || `Gagal memuat data (HTTP ${r.status})`)
        }
        if (!cancelled) setState({ data: json as T, loading: false, error: null, key })
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: e.message || 'Gagal memuat data', key })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, key, router])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // Waiting for the current key to resolve counts as loading.
  const loading = key !== state.key ? !!url : state.loading

  return { data: state.data, loading, error: state.error, reload }
}
