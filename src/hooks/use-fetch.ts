'use client'

import { useEffect, useState } from 'react'

type FetchState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  url: string | null
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
 */
export function useFetch<T>(url: string | null) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: !!url,
    error: null,
    url: null,
  })

  useEffect(() => {
    if (!url) return
    let cancelled = false

    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = await r.json()
        if (!cancelled) {
          setState({ data: json as T, loading: false, error: null, url })
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: e.message || 'Failed to load', url })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  // Derive loading: if the URL has changed since the last fetch completed,
  // we are effectively loading (waiting for the new fetch to resolve).
  const isLoading = url !== state.url ? !!url : state.loading

  return { data: state.data, loading: isLoading, error: state.error }
}
