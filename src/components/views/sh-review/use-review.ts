'use client'

/**
 * Status layar Persetujuan Supervisor yang dipakai ponsel & tablet: saringan
 * subholding + status, laporan terpilih, dan penghapusan optimistis — laporan
 * yang baru diputuskan langsung keluar dari antrean (hitungan ikut turun)
 * sementara daftar dimuat ulang di belakang. Antrean diperbarui sendiri tiap
 * menit selama tab terlihat.
 *
 * Data: GET /api/sh/review?status=…[&subholdingId=…].
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useResource } from '@/hooks/use-resource'
import { subShorts } from '../sh-overview/mobile/mobile-logic'
import { nextAfterDecision, resolveSelected, type ReviewData, type ShReport, type ShStatus } from './logic'

const POLL_MS = 60_000

/** Kunci laporan yang sudah diputuskan di sesi ini; kiriman ulang (submittedAt baru) tampil lagi. */
const goneKey = (r: Pick<ShReport, 'id' | 'submittedAt'>) => `${r.id}@${r.submittedAt ?? ''}`

export function useReview() {
  const [sub, setSub] = useState<string | null>(null)
  const [tab, setTab] = useState<ShStatus>('MENUNGGU')
  const [selected, setSelected] = useState<string | null>(null)
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())

  const url = `/api/sh/review?status=${tab}${sub ? `&subholdingId=${encodeURIComponent(sub)}` : ''}`
  const { data, loading, error, reload } = useResource<ReviewData>(url)

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [reload])

  // Saat saringan berganti, data lama masih tersimpan sampai respons baru tiba:
  // tampilkan hanya butir yang cocok dengan saringan sekarang (tanpa kedip isi salah).
  const items = useMemo(
    () => (data?.items ?? []).filter((r) => r.status === tab && (!sub || r.subholdingId === sub) && !gone.has(goneKey(r))),
    [data, tab, sub, gone]
  )
  const hidden = useMemo(() => (data?.items ?? []).filter((r) => r.status === tab && gone.has(goneKey(r))), [data, tab, gone])

  const subholdings = useMemo(() => {
    const list = data?.subholdings ?? []
    if (tab !== 'MENUNGGU' || !hidden.length) return list
    return list.map((s) => ({ ...s, waiting: Math.max(0, s.waiting - hidden.filter((r) => r.subholdingId === s.id).length) }))
  }, [data, tab, hidden])

  const counts = useMemo(() => {
    const c = { MENUNGGU: 0, PERLU_PERBAIKAN: 0, DISETUJUI: 0, ...(data?.counts ?? {}) }
    if (hidden.length) c[tab] = Math.max(0, c[tab] - hidden.length)
    return c
  }, [data, tab, hidden])

  const totalWaiting = useMemo(() => {
    if (!data) return 0
    if (!data.subholdings.length) return counts.MENUNGGU
    return subholdings.reduce((n, s) => n + (s.waiting ?? 0), 0)
  }, [data, subholdings, counts])

  // Label pendek yang saling berbeda ("Karya Agro" / "Karya Energi", bukan dua kali "Karya").
  const shortOf = useMemo(() => {
    const list = data?.subholdings ?? []
    const names = subShorts(list.map((x) => x.name))
    const map = new Map(list.map((x, i) => [x.id, names[i]]))
    return (id: string) => map.get(id) ?? ''
  }, [data])

  const currentId = resolveSelected(items, selected)
  const current = items.find((r) => r.id === currentId) ?? null

  const pickSub = useCallback((id: string | null) => {
    setSub(id)
    setSelected(null)
  }, [])
  const pickTab = useCallback((t: ShStatus) => {
    setTab(t)
    setSelected(null)
  }, [])

  /** Setelah setujui/minta perbaikan: buang dari antrean, pilih yang berikutnya, muat ulang. */
  const decided = useCallback(
    (id: string): string | null => {
      const r = items.find((x) => x.id === id)
      const next = nextAfterDecision(items, id)
      if (r) setGone((g) => new Set(g).add(goneKey(r)))
      setSelected(next)
      reload()
      return next
    },
    [items, reload]
  )

  return {
    sub, tab, pickSub, pickTab, selected: currentId, select: setSelected,
    data, loading, error, reload, items, subholdings, counts, totalWaiting, current, decided, shortOf,
    today: data?.today ?? null,
  }
}

export type ReviewState = ReturnType<typeof useReview>
