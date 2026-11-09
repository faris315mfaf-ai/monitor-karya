'use client'

/**
 * Dashboard Manajemen & Superuser (KONTRAK-MANAJEMEN-MOBILE.md, 16 Okt 2026).
 * Pengalih: memuat data lalu merender layar ponsel (< 600px) atau layar
 * tablet/desktop (split view). Tiga lapis informasi: status melapor →
 * sorotan supervisor → semua laporan; penyaring subholding → PT diingat
 * per perangkat.
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD dan, untuk 7 hari,
 * GET /api/sh/overview/week?end=…[&subholdingId=…]. Diperbarui sendiri di
 * belakang tiap 30 detik selama tab terlihat dan saat tab kembali terlihat,
 * jadi laporan yang baru disetujui supervisor muncul tanpa memuat ulang
 * (tanpa redup/kerangka; gagal sesaat tetap menampilkan data terakhir).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { ROLE_LABELS } from '@/lib/constants'
import { wibDateKey } from './logic'
import {
  NO_FILTER, loadDayView, loadFilter, saveDayView, saveFilter, validFilter, type DayView, type Filter, type V2Data, type WeekData,
} from './model'
import type { OverviewRange } from './screen-types'
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
  const [range, setRange] = useState<OverviewRange>('today')
  // Kunci tanggal dihitung sekali per pilihan, supaya tidak bergeser saat render ulang.
  const dateKey = useMemo(() => wibDateKey(new Date(), range === 'yesterday' ? 1 : 0), [range])

  // null = belum memilih di sesi ini → pakai pilihan tersimpan. Pilihan tersimpan
  // hanya dibaca setelah hidrasi (localStorage tidak ada di server).
  const [picked, setPicked] = useState<Filter | null>(null)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const rawFilter = useMemo(() => picked ?? (hydrated ? loadFilter() : NO_FILTER), [picked, hydrated])
  const [pickedView, setPickedView] = useState<DayView | null>(null)
  const dayView: DayView = pickedView ?? (hydrated ? loadDayView() : 'gulir')

  const day = useResource<V2Data>(`/api/sh/overview?date=${dateKey}`, { keepStale: true })
  const filter = useMemo(() => (day.data ? validFilter(day.data, rawFilter) : rawFilter), [day.data, rawFilter])
  const weekUrl = range === 'week'
    ? `/api/sh/overview/week?end=${dateKey}${filter.sub ? `&subholdingId=${encodeURIComponent(filter.sub)}` : ''}`
    : null
  const week = useResource<WeekData>(weekUrl, { keepStale: true })
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
  const pickRange = useCallback((r: OverviewRange) => {
    setQuiet(false)
    setRange(r)
  }, [])
  const { reload: reloadDay } = day
  const { reload: reloadWeek } = week
  const reload = useCallback(() => {
    setQuiet(false)
    reloadDay()
    if (weekUrl) reloadWeek()
  }, [reloadDay, reloadWeek, weekUrl])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      setQuiet(true)
      reloadDay()
      if (weekUrl) reloadWeek()
    }
    const t = window.setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [reloadDay, reloadWeek, weekUrl])

  const props = {
    roleName: ROLE_LABELS[user.role] ?? 'Manajemen',
    range,
    onRange: pickRange,
    dateKey,
    data: day.data ?? null,
    week: range === 'week' ? (week.data ?? null) : null,
    loading: !quiet && (day.loading || (range === 'week' && week.loading)),
    error: day.error ?? (range === 'week' ? week.error : null) ?? null,
    reload,
    filter,
    onFilter,
    dayView,
    onDayView,
  }

  return compact ? <MobileOverview {...props} /> : <TabletOverview {...props} />
}
