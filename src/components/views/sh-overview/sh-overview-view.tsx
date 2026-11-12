'use client'

/**
 * Dashboard laporan disetujui — Ketua Umum (Superuser), Manajemen, dan
 * Supervisor (KONTRAK-MANAJEMEN-MOBILE.md, 16 Okt 2026). Pengalih: memuat data
 * lalu merender layar ponsel (< 600px) atau layar tablet/desktop. Tanggal:
 * hari ini (bawaan, ikut berganti saat lewat tengah malam WIB) atau tanggal
 * pilihan pengguna. Subholding/PT yang terbuka diingat per perangkat.
 *
 * Status pelaporan (kartu "n dari m PT", PT/subholding belum melapor) hanya
 * untuk peninjau (Supervisor); Ketua Umum & Manajemen hanya melihat laporan
 * yang sudah disetujui supervisor (keputusan pemilik 12 Nov 2026).
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD. Diperbarui sendiri di belakang
 * tiap 30 detik selama tab terlihat dan saat tab kembali terlihat, jadi
 * laporan yang baru disetujui supervisor muncul tanpa memuat ulang (tanpa
 * redup/kerangka; gagal sesaat tetap menampilkan data terakhir).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { ROLE_LABELS } from '@/lib/constants'
import { can } from '@/lib/rbac'
import { wibDateKey } from './logic'
import {
  NO_FILTER, loadDayView, loadFilter, saveDayView, saveFilter, validFilter, type DayView, type Filter, type V2Data,
} from './model'
import type { OverviewScreenProps } from './screen-types'
import { MobileOverview } from './mobile'
import { TabletOverview } from './tablet'

const COMPACT = '(max-width: 599.98px)'
/** Selang penyegaran latar dashboard (laporan baru disetujui supervisor). */
const POLL_MS = 30_000

const noopSubscribe = () => () => {}

function subscribe(cb: () => void) {
  const mq = window.matchMedia(COMPACT)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Lebar layar ponsel; di server dianggap bukan ponsel (layar tablet dirender lalu dikoreksi saat hidrasi). */
function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(COMPACT).matches, () => false)
}

export function ShOverviewView() {
  const { user } = useApp()
  const compact = useCompact()
  const [todayKey, setTodayKey] = useState(() => wibDateKey())
  // null = hari ini (mengikuti jam); selain itu tanggal lampau pilihan pengguna.
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const dateKey = pickedDate && pickedDate < todayKey ? pickedDate : todayKey

  // null = belum memilih di sesi ini → pakai pilihan tersimpan. Pilihan tersimpan
  // hanya dibaca setelah hidrasi (localStorage tidak ada di server).
  const [picked, setPicked] = useState<Filter | null>(null)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const rawFilter = useMemo(() => picked ?? (hydrated ? loadFilter() : NO_FILTER), [picked, hydrated])
  const [pickedView, setPickedView] = useState<DayView | null>(null)
  const dayView: DayView = pickedView ?? (hydrated ? loadDayView() : 'gulir')

  const day = useResource<V2Data>(`/api/sh/overview?date=${dateKey}`, { keepStale: true })
  const filter = useMemo(() => (day.data ? validFilter(day.data, rawFilter) : rawFilter), [day.data, rawFilter])
  // Penyegaran latar tidak meredupkan layar; muat ulang oleh pengguna tetap menampilkan status memuat.
  const [quiet, setQuiet] = useState(false)

  const onFilter = useCallback((f: Filter) => {
    setPicked(f)
    saveFilter(f)
  }, [])
  const onDayView = useCallback((v: DayView) => {
    setPickedView(v)
    saveDayView(v)
  }, [])
  const onDate = useCallback((key: string) => {
    setQuiet(false)
    const today = wibDateKey()
    setTodayKey(today)
    setPickedDate(key < today ? key : null)
  }, [])
  const { reload: reloadDay } = day
  const reload = useCallback(() => {
    setQuiet(false)
    reloadDay()
  }, [reloadDay])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      setQuiet(true)
      setTodayKey(wibDateKey())
      reloadDay()
    }
    const t = window.setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [reloadDay])

  const props: OverviewScreenProps = {
    roleName: ROLE_LABELS[user.role] ?? 'Manajemen',
    dateKey,
    todayKey,
    onDate,
    showStatus: can(user.role, 'shreport:review'),
    data: day.data ?? null,
    loading: !quiet && day.loading,
    error: day.error ?? null,
    reload,
    filter,
    onFilter,
    dayView,
    onDayView,
  }

  return compact ? <MobileOverview {...props} /> : <TabletOverview {...props} />
}
