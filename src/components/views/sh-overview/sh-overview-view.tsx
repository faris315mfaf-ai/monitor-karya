'use client'

/**
 * Dashboard Manajemen & Superuser (KONTRAK-MANAJEMEN-MOBILE.md, 16 Okt 2026).
 * Pengalih: memuat data lalu merender layar ponsel (< 600px) atau layar
 * tablet/desktop (split view). Tiga lapis informasi: status melapor →
 * sorotan supervisor → semua laporan; penyaring subholding → PT diingat
 * per perangkat.
 *
 * Data: GET /api/sh/overview?date=YYYY-MM-DD dan, untuk 7 hari,
 * GET /api/sh/overview/week?end=…[&subholdingId=…].
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useResource } from '@/hooks/use-resource'
import { useApp } from '@/components/app-provider'
import { ROLE_LABELS } from '@/lib/constants'
import { wibDateKey } from './logic'
import { NO_FILTER, loadFilter, saveFilter, validFilter, type Filter, type V2Data, type WeekData } from './model'
import type { OverviewRange } from './screen-types'
import { MobileOverview } from './mobile'
import { TabletOverview } from './tablet'

const COMPACT = '(max-width: 599.98px)'

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

  const day = useResource<V2Data>(`/api/sh/overview?date=${dateKey}`)
  const filter = useMemo(() => (day.data ? validFilter(day.data, rawFilter) : rawFilter), [day.data, rawFilter])
  const weekUrl = range === 'week'
    ? `/api/sh/overview/week?end=${dateKey}${filter.sub ? `&subholdingId=${encodeURIComponent(filter.sub)}` : ''}`
    : null
  const week = useResource<WeekData>(weekUrl)

  const onFilter = useCallback((f: Filter) => {
    setPicked(f)
    saveFilter(f)
  }, [])
  const reload = useCallback(() => {
    day.reload()
    if (weekUrl) week.reload()
  }, [day, week, weekUrl])

  const props = {
    roleName: ROLE_LABELS[user.role] ?? 'Manajemen',
    range,
    onRange: setRange,
    dateKey,
    data: day.data ?? null,
    week: range === 'week' ? (week.data ?? null) : null,
    loading: day.loading || (range === 'week' && week.loading),
    error: day.error ?? (range === 'week' ? week.error : null) ?? null,
    reload,
    filter,
    onFilter,
  }

  return compact ? <MobileOverview {...props} /> : <TabletOverview {...props} />
}
