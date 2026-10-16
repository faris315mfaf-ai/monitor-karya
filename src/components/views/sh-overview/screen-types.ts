import type { Filter, V2Data, WeekData } from './model'

export type OverviewRange = 'today' | 'yesterday' | 'week'

/** Props bersama layar ponsel (MobileOverview) dan tablet/desktop (TabletOverview). */
export type OverviewScreenProps = {
  /** Label peran, mis. "Superuser" atau "Manajemen". */
  roleName: string
  range: OverviewRange
  onRange: (r: OverviewRange) => void
  /** 'YYYY-MM-DD' WIB untuk hari ini/kemarin; saat 7 hari = hari terakhir rentang. */
  dateKey: string
  /** GET /api/sh/overview?date=dateKey (juga dimuat saat 7 hari, untuk hari ini). */
  data: V2Data | null
  /** GET /api/sh/overview/week — hanya saat range === 'week'. */
  week: WeekData | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Sudah divalidasi terhadap data (validFilter). */
  filter: Filter
  /** Integrator menyimpan pilihan per perangkat (saveFilter). */
  onFilter: (f: Filter) => void
}
