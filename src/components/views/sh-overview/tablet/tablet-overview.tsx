'use client'

/**
 * Dashboard laporan disetujui — tablet & desktop: tampilan "Semua terbuka"
 * (TabletDayFeed, day-feed.tsx) atau "Ringkas" (TabletDaySplit,
 * day-split.tsx) menurut pilihan pengguna.
 */

import type { OverviewScreenProps } from '../screen-types'
import { TabletDayFeed } from './day-feed'
import { TabletDaySplit } from './day-split'

export function TabletOverview(props: OverviewScreenProps) {
  return props.dayView === 'ringkas' ? <TabletDaySplit {...props} /> : <TabletDayFeed {...props} />
}
